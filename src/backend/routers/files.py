import asyncio
import mimetypes
import re
import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.responses import FileResponse
from loguru import logger
from pydantic import BaseModel

from src.backend.config import ApiConfig
from src.backend.database.db import DataBase
from src.backend.database.models import ResourceMeta, TextUpdate
from src.backend.transcription import extract_audio_sync, run_whisper_sync

file_router = APIRouter(prefix="/files", tags=["files"])


TIMESTAMP_LINE_PATTERN = re.compile(
    r"^\s*\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*?)\s*$"
)


def _parse_clock_to_seconds(clock: str) -> int:
    parts = [int(part) for part in clock.split(":")]
    if len(parts) == 2:
        minutes, seconds = parts
        return minutes * 60 + seconds
    hours, minutes, seconds = parts
    return hours * 3600 + minutes * 60 + seconds


def _parse_timestamped_transcript(text: str, fallback_window_seconds: float) -> list[dict] | None:
    starts_and_texts: list[tuple[float, str]] = []
    for raw_line in text.splitlines():
        match = TIMESTAMP_LINE_PATTERN.match(raw_line)
        if not match:
            continue
        start = float(_parse_clock_to_seconds(match.group(1)))
        value = match.group(2).strip()
        if not value:
            continue
        starts_and_texts.append((start, value))

    if not starts_and_texts:
        return None

    segments: list[dict] = []
    for index, (start, value) in enumerate(starts_and_texts):
        if index + 1 < len(starts_and_texts):
            next_start = starts_and_texts[index + 1][0]
            end = max(start + 0.5, next_start)
        else:
            end = start + max(1.0, float(fallback_window_seconds))
        segments.append({"start": start, "end": end, "text": value})

    return segments


class MoveItemPayload(BaseModel):
    from_path: str
    to_path: str


@file_router.get("/raw/{course_name}/{rel_path:path}")
async def get_raw_file(
    course_name: str, rel_path: str, request: Request, download: bool = False
):
    config: ApiConfig = request.app.state.config
    logger.debug("raw file requested: course={}, rel_path={}", course_name, rel_path)

    file_path = config.save_join_file_path(course_name, rel_path)

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    # Guess the media type (e.g., 'video/mp4' or 'audio/mpeg')
    mime_type, _ = mimetypes.guess_type(file_path)

    disposition = "attachment" if download else "inline"

    return FileResponse(
        path=file_path,
        media_type=mime_type or "application/octet-stream",
        filename=file_path.name,
        headers={"Content-Disposition": f'{disposition}; filename="{file_path.name}"'},
    )


@file_router.get("/meta/{course_name}/{rel_path:path}")
async def get_meta(course_name, rel_path: str, request: Request) -> ResourceMeta:
    """Returns Resource Meta. If not exist -> UUID is None"""
    db: DataBase = request.app.state.db
    config: ApiConfig = request.app.state.config
    logger.debug("metadata requested: course={}, rel_path={}", course_name, rel_path)

    meta = db.query_table(
        ResourceMeta,
        where_clauses=[
            ResourceMeta.course == course_name,
            ResourceMeta.relative_path == rel_path,
        ],
        mode="first",
    ) or ResourceMeta(
        course=course_name,
        relative_path=rel_path,
    )

    item_path = config.save_join_file_path(course_name, rel_path)
    if not item_path.exists() or not item_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    # include metadata
    stat = item_path.stat()
    meta.last_processed = datetime.fromtimestamp(stat.st_mtime)
    meta.size = stat.st_size
    return meta


@file_router.put("/meta/edit-transcriped-text/{course_name}/{rel_path:path}")
async def edit_transcribed_text_put(
    course_name: str, rel_path: str, data: TextUpdate, request: Request
) -> ResourceMeta:
    """Updates transcribed text via JSON body (preferred over query-string GET)."""
    db: DataBase = request.app.state.db
    config: ApiConfig = request.app.state.config
    logger.info(
        "manual transcript edit (PUT): course={}, rel_path={}", course_name, rel_path
    )

    meta: ResourceMeta = await db.query_table(
        ResourceMeta,
        where_clauses=[
            ResourceMeta.course == course_name,
            ResourceMeta.relative_path == rel_path,
        ],
        mode="first",
    )

    if meta is None:
        raise HTTPException(status_code=404, detail="File not found")

    meta.transcript_text = data.content
    parsed_segments = _parse_timestamped_transcript(
        data.content,
        fallback_window_seconds=config.TRANSCRIPT_CHUNK_TARGET_SECONDS,
    )
    meta.transcript_segments = parsed_segments
    await db.save(meta)
    return meta


@file_router.delete("/del/{course_name}/{rel_path:path}")
async def delete_file_or_folder(course_name: str, rel_path: str, request: Request):
    db: DataBase = request.app.state.db
    config: ApiConfig = request.app.state.config
    logger.info("delete requested: course={}, rel_path={}", course_name, rel_path)

    item_path = config.save_join_file_path(course_name, rel_path)
    if not item_path.exists():
        raise HTTPException(status_code=404, detail="Item not found")

    normalized = rel_path.strip("/")

    # 1. Identify Database Records to delete
    # For folders, delete descendants; for files, delete exact match only.
    if item_path.is_dir():
        all_meta = await db.query_table(
            ResourceMeta,
            where_clauses=[
                ResourceMeta.course == course_name,
                ResourceMeta.relative_path.like(f"{normalized}/%"),
            ],
            mode="all",
        )
    else:
        all_meta = await db.query_table(
            ResourceMeta,
            where_clauses=[
                ResourceMeta.course == course_name,
                ResourceMeta.relative_path == normalized,
            ],
            mode="all",
        )

    # 2. Setup a temporary "Backup" location
    # We move it here so we can restore it if the DB fails
    temp_dir = Path(tempfile.gettempdir()) / "vault_trash"
    temp_dir.mkdir(exist_ok=True)
    backup_path = temp_dir / f"{course_name}_{Path(rel_path).name}"

    try:
        # 3. Physical Move (Reversible)
        shutil.move(str(item_path), str(backup_path))

        try:
            # 4. Database Delete
            if all_meta:
                await db.delete_all(all_meta)

            # If we got here, everything worked.
            # We can now permanently delete the backup or let the OS clean temp.
            if backup_path.is_dir():
                shutil.rmtree(backup_path)
            else:
                backup_path.unlink()

        except Exception as db_error:
            # ROLLBACK: Move the file back where it was!
            shutil.move(str(backup_path), str(item_path))
            logger.error(f"DB error, restored file: {db_error}")
            raise HTTPException(
                status_code=500, detail="Database error. File restored."
            )

    except Exception as fs_error:
        logger.error(f"Filesystem error: {fs_error}")
        raise HTTPException(status_code=500, detail="Could not move file to trash.")

    return {"detail": "Deleted successfully"}


@file_router.put("/folder-create/{course_name}/{rel_path:path}")
async def create_folder(course_name: str, rel_path: str, request: Request):
    config: ApiConfig = request.app.state.config
    normalized = rel_path.strip("/")
    logger.info(
        "folder create requested: course={}, rel_path={}", course_name, normalized
    )

    if not normalized:
        raise HTTPException(status_code=400, detail="Folder path cannot be empty")

    folder_path = config.save_join_file_path(course_name, normalized)
    if folder_path.exists():
        raise HTTPException(status_code=409, detail="Folder already exists")

    try:
        folder_path.mkdir(parents=True, exist_ok=False)
        return {"status": "created", "path": normalized}
    except Exception as e:
        logger.error(f"Failed to create folder: {e}")
        raise HTTPException(status_code=500, detail="Failed to create folder")


@file_router.put("/move/{course_name}")
async def move_item(course_name: str, payload: MoveItemPayload, request: Request):
    db: DataBase = request.app.state.db
    config: ApiConfig = request.app.state.config

    from_rel = payload.from_path.strip("/")
    to_rel = payload.to_path.strip("/")
    logger.info(
        "move requested: course={}, from={}, to={}", course_name, from_rel, to_rel
    )

    if not from_rel or not to_rel:
        raise HTTPException(
            status_code=400, detail="from_path and to_path are required"
        )
    if from_rel == to_rel:
        return {"status": "unchanged", "from": from_rel, "to": to_rel}

    src_path = config.save_join_file_path(course_name, from_rel)
    dst_path = config.save_join_file_path(course_name, to_rel)

    if not src_path.exists():
        raise HTTPException(status_code=404, detail="Source item not found")
    if dst_path.exists():
        raise HTTPException(status_code=409, detail="Target already exists")

    if src_path.is_dir() and (dst_path == src_path or src_path in dst_path.parents):
        raise HTTPException(status_code=400, detail="Cannot move folder into itself")

    if src_path.is_dir():
        metas = await db.query_table(
            ResourceMeta,
            where_clauses=[
                ResourceMeta.course == course_name,
                ResourceMeta.relative_path.like(f"{from_rel}/%"),
            ],
            mode="all",
        )
    else:
        metas = await db.query_table(
            ResourceMeta,
            where_clauses=[
                ResourceMeta.course == course_name,
                ResourceMeta.relative_path == from_rel,
            ],
            mode="all",
        )

    previous_paths = {
        meta.id: meta.relative_path for meta in metas if meta.id is not None
    }
    dst_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        shutil.move(str(src_path), str(dst_path))

        for meta in metas:
            rel = meta.relative_path
            if rel == from_rel:
                meta.relative_path = to_rel
            elif rel.startswith(f"{from_rel}/"):
                suffix = rel[len(from_rel) :]
                meta.relative_path = f"{to_rel}{suffix}"
            await db.save(meta)

        return {"status": "moved", "from": from_rel, "to": to_rel}

    except Exception as e:
        logger.error(f"Move failed: {e}")

        if dst_path.exists() and not src_path.exists():
            try:
                shutil.move(str(dst_path), str(src_path))
            except Exception as rollback_error:
                logger.error(f"Filesystem rollback failed: {rollback_error}")

        for meta in metas:
            if meta.id in previous_paths:
                meta.relative_path = previous_paths[meta.id]
                try:
                    await db.save(meta)
                except Exception as rollback_db_error:
                    logger.error(f"Metadata rollback failed: {rollback_db_error}")

        raise HTTPException(status_code=500, detail="Move failed")


@file_router.get("/text-content/{course_name}/{rel_path:path}")
async def get_text_content(course_name: str, rel_path: str, request: Request):
    """Reads a file from disk and returns it as a string for the editor."""
    config: ApiConfig = request.app.state.config
    logger.debug("text read requested: course={}, rel_path={}", course_name, rel_path)
    file_path = config.save_join_file_path(course_name, rel_path)

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    # Sanity check: Don't try to read a 1GB video file as text
    if file_path.stat().st_size > 5 * 1024 * 1024:  # 5MB limit
        raise HTTPException(status_code=400, detail="File too large for text editor")

    try:
        content = file_path.read_text(encoding="utf-8")
        return {"content": content}
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File is not a valid text file")


@file_router.put("/text-update/{course_name}/{rel_path:path}")
async def update_text_file(
    course_name: str, rel_path: str, data: TextUpdate, request: Request
):
    """Overwrites a text file on disk with new content."""
    db: DataBase = request.app.state.db
    config: ApiConfig = request.app.state.config
    logger.info("text update requested: course={}, rel_path={}", course_name, rel_path)
    file_path = config.save_join_file_path(course_name, rel_path)

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    try:
        # 1. Write to disk
        file_path.write_text(data.content, encoding="utf-8")

        # 2. Update Metadata in DB so the UI stays in sync
        meta = await db.query_table(
            ResourceMeta,
            where_clauses=[
                ResourceMeta.course == course_name,
                ResourceMeta.relative_path == rel_path,
            ],
            mode="first",
        )

        if meta:
            stat = file_path.stat()
            meta.size = stat.st_size
            # This marks when the file itself was last touched
            meta.last_modified_disk = datetime.fromtimestamp(stat.st_mtime)
            await db.save(meta)

        return {"status": "success", "last_modified": datetime.now()}

    except Exception as e:
        logger.error(f"Failed to save text file: {e}")
        raise HTTPException(status_code=500, detail="Failed to write file to disk")


@file_router.put("/text-create/{course_name}/{rel_path:path}")
async def create_text_file(
    course_name: str, rel_path: str, data: TextUpdate, request: Request
):
    """Creates a new text file on disk and stores initial metadata."""
    db: DataBase = request.app.state.db
    config: ApiConfig = request.app.state.config
    logger.info("text create requested: course={}, rel_path={}", course_name, rel_path)
    file_path = config.save_join_file_path(course_name, rel_path)

    if file_path.exists():
        raise HTTPException(status_code=409, detail="File already exists")

    try:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(data.content, encoding="utf-8")

        stat = file_path.stat()
        meta = ResourceMeta(course=course_name, relative_path=rel_path)
        meta.size = stat.st_size
        meta.last_modified_disk = datetime.fromtimestamp(stat.st_mtime)
        await db.save(meta)

        return {"status": "created", "last_modified": datetime.now()}

    except Exception as e:
        logger.error(f"Failed to create text file: {e}")
        raise HTTPException(status_code=500, detail="Failed to create file on disk")


@file_router.post("/upload/{course_name}")
async def upload_file(
    course_name: str,
    request: Request,
    file: UploadFile = File(...),
    target_rel_path: str = Form(None),  # Optional: "folder/new_name.mp4"
):
    db: DataBase = request.app.state.db
    config: ApiConfig = request.app.state.config
    logger.info(
        "upload requested: course={}, filename={}, target_rel_path={}",
        course_name,
        file.filename,
        target_rel_path,
    )

    # 1. Determine the final path
    # If no target_rel_path is sent, use the original filename
    final_rel_path = target_rel_path or file.filename

    # Use your safety helper
    file_path = config.save_join_file_path(course_name, final_rel_path)

    # 2. Ensure parent directories exist (e.g., if target is "Lectures/New/vid.mp4")
    file_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        # 3. Stream the file to disk
        # We use a buffer to handle large files without eating RAM
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 4. Create/Update Metadata
        stat = file_path.stat()
        meta = await db.query_table(
            ResourceMeta,
            where_clauses=[
                ResourceMeta.course == course_name,
                ResourceMeta.relative_path == final_rel_path,
            ],
            mode="first",
        ) or ResourceMeta(course=course_name, relative_path=final_rel_path)

        meta.size = stat.st_size
        meta.last_modified_disk = datetime.fromtimestamp(stat.st_mtime)

        await db.save(meta)

        logger.info(
            "upload completed: course={}, final_rel_path={}, size={}B",
            course_name,
            final_rel_path,
            meta.size,
        )

        return {"filename": final_rel_path, "size": meta.size, "status": "uploaded"}

    except Exception as e:
        logger.error(f"Upload failed: {e}")
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(status_code=500, detail="Write failed")
    finally:
        await file.close()


async def background_transcription_worker(
    course_name: str, rel_path: str, config: ApiConfig, db: DataBase, jobs_dict: dict
):
    job_id = f"{course_name}/{rel_path}"
    file_path = config.save_join_file_path(course_name, rel_path)
    audio_path = file_path
    temp_audio_path: Path | None = None
    logger.info("transcription worker started: job_id={}", job_id)

    try:
        # Step 1: Handle Video -> Audio Extraction
        if file_path.suffix in config.VIDEO_SUFFIXES:
            jobs_dict[job_id]["status"] = "extracting_audio"
            temp_dir = Path(tempfile.gettempdir()) / "study_suite_transcription"
            temp_dir.mkdir(parents=True, exist_ok=True)
            temp_audio_path = temp_dir / f"{uuid4().hex}.mp3"
            audio_path = temp_audio_path
            logger.debug(
                "transcription extracting audio: job_id={}, source={}, temp_audio={}",
                job_id,
                file_path,
                audio_path,
            )
            await asyncio.to_thread(extract_audio_sync, file_path, audio_path)

        # Step 2: Run Transcription
        jobs_dict[job_id]["status"] = "starting_whisper"
        logger.debug(
            "transcription whisper start: job_id={}, audio_path={}", job_id, audio_path
        )
        transcription_result = await asyncio.to_thread(
            run_whisper_sync,
            audio_path,
            job_id,
            jobs_dict,
            config.TRANSCRIPT_CHUNK_TARGET_SECONDS,
            config.TRANSCRIPT_CHUNK_MAX_GAP_SECONDS,
        )

        # Step 3: Save to Database
        jobs_dict[job_id]["status"] = "saving"

        meta = await db.query_table(
            ResourceMeta,
            where_clauses=[
                ResourceMeta.course == course_name,
                ResourceMeta.relative_path == rel_path,
            ],
            mode="first",
        )
        if meta:
            meta.transcript_text = transcription_result["timestamped_text"]
            meta.transcript_segments = transcription_result["segments"]
            meta.is_transcribed = True
            await db.save(meta)
            logger.debug(
                "transcription text persisted: job_id={}, chars={}, segments={}",
                job_id,
                len(transcription_result["timestamped_text"]),
                len(transcription_result["segments"]),
            )

        # Step 4: Cleanup
        jobs_dict[job_id]["status"] = "completed"
        jobs_dict[job_id]["progress"] = jobs_dict[job_id]["total"]

        logger.info("transcription completed: job_id={}", job_id)

    except Exception as e:
        logger.error(f"Transcription failed for {job_id}: {e}")
        jobs_dict[job_id]["status"] = "failed"
        jobs_dict[job_id]["error"] = str(e)
    finally:
        if temp_audio_path and temp_audio_path.exists():
            try:
                temp_audio_path.unlink()
            except Exception as cleanup_error:
                logger.warning(
                    "transcription temp cleanup failed: path={}, error={}",
                    temp_audio_path,
                    cleanup_error,
                )


@file_router.post("/transcribe/{course_name}/{rel_path:path}")
async def start_transcription(
    course_name: str, rel_path: str, request: Request, background_tasks: BackgroundTasks
):
    """Triggers the transcription process in the background."""
    config: ApiConfig = request.app.state.config
    db: DataBase = request.app.state.db
    jobs_dict: dict = request.app.state.transcription_jobs
    job_id = f"{course_name}/{rel_path}"
    logger.info("transcription requested: job_id={}", job_id)

    file_path = config.save_join_file_path(course_name, rel_path)

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    # Guardrail: Check if it's a valid media file
    valid_suffixes = config.AUDIO_SUFFIXES + config.VIDEO_SUFFIXES
    if file_path.suffix not in valid_suffixes:
        raise HTTPException(status_code=400, detail="Not a valid audio/video file")

    # If already running, don't start it again
    if job_id in jobs_dict and jobs_dict[job_id]["status"] not in [
        "failed",
        "completed",
    ]:
        logger.debug(
            "transcription already in progress: job_id={}, status={}",
            job_id,
            jobs_dict[job_id]["status"],
        )
        return {"message": "Transcription already in progress", "job_id": job_id}

    # Initialize progress state
    jobs_dict[job_id] = {
        "status": "queued",
        "progress": 0,
        "total": 1,  # Prevent division by zero in UI before duration is loaded
        "error": None,
    }

    # Hand off to the background task (Client can now disconnect)
    background_tasks.add_task(
        background_transcription_worker, course_name, rel_path, config, db, jobs_dict
    )

    return {"message": "Transcription started", "job_id": job_id}


@file_router.get("/transcribe/status/{course_name}/{rel_path:path}")
async def get_transcription_status(course_name: str, rel_path: str, request: Request):
    """Frontend polls this to update the progress bar."""
    job_id = f"{course_name}/{rel_path}"
    jobs_dict: dict = request.app.state.transcription_jobs
    logger.debug("transcription status requested: job_id={}", job_id)

    if job_id not in jobs_dict:
        return {"status": "not_started"}

    return jobs_dict[job_id]
