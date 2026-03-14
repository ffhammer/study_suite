from tempfile import SpooledTemporaryFile

import pytest
from fastapi import HTTPException, UploadFile
from fastapi.responses import FileResponse

from src.backend.database.models import ResourceMeta, TextUpdate
from src.backend.routers.files import (
    create_text_file,
    delete_file_or_folder,
    get_raw_file,
    get_text_content,
    update_text_file,
    upload_file,
)


@pytest.mark.asyncio
async def test_get_raw_file_returns_fileresponse(
    seeded_course, request_with_state, vault_dir
):
    f = vault_dir / "CourseA" / "clip.mp3"
    f.write_bytes(b"abc")

    response = await get_raw_file("CourseA", "clip.mp3", request_with_state)
    assert isinstance(response, FileResponse)
    assert response.filename == "clip.mp3"


@pytest.mark.asyncio
async def test_get_raw_file_missing_raises(request_with_state):
    with pytest.raises(HTTPException) as err:
        await get_raw_file("CourseA", "missing.mp3", request_with_state)
    assert err.value.status_code == 404


@pytest.mark.asyncio
async def test_get_text_content_reads_file(
    seeded_course, request_with_state, vault_dir
):
    p = vault_dir / "CourseA" / "doc.md"
    p.write_text("hello world", encoding="utf-8")

    result = await get_text_content("CourseA", "doc.md", request_with_state)
    assert result["content"] == "hello world"


@pytest.mark.asyncio
async def test_get_text_content_rejects_large_file(
    seeded_course, request_with_state, vault_dir
):
    p = vault_dir / "CourseA" / "large.txt"
    p.write_bytes(b"x" * (5 * 1024 * 1024 + 1))

    with pytest.raises(HTTPException) as err:
        await get_text_content("CourseA", "large.txt", request_with_state)
    assert err.value.status_code == 400


@pytest.mark.asyncio
async def test_update_text_file_updates_disk_and_metadata(
    db, seeded_course, request_with_state, vault_dir
):
    p = vault_dir / "CourseA" / "notes.txt"
    p.write_text("old", encoding="utf-8")
    await db.save(ResourceMeta(course="CourseA", relative_path="notes.txt"))

    result = await update_text_file(
        "CourseA",
        "notes.txt",
        TextUpdate(content="new text"),
        request_with_state,
    )

    assert result["status"] == "success"
    assert p.read_text(encoding="utf-8") == "new text"

    meta = await db.query_table(
        ResourceMeta,
        where_clauses=[
            ResourceMeta.course == "CourseA",
            ResourceMeta.relative_path == "notes.txt",
        ],
        mode="first",
    )
    assert meta is not None
    assert meta.size == len("new text")


@pytest.mark.asyncio
async def test_create_text_file_creates_file_and_metadata(
    db, seeded_course, request_with_state, vault_dir
):
    result = await create_text_file(
        "CourseA",
        "folder/new_file.md",
        TextUpdate(content="# heading"),
        request_with_state,
    )

    assert result["status"] == "created"
    created = vault_dir / "CourseA" / "folder" / "new_file.md"
    assert created.exists()

    meta = await db.query_table(
        ResourceMeta,
        where_clauses=[
            ResourceMeta.course == "CourseA",
            ResourceMeta.relative_path == "folder/new_file.md",
        ],
        mode="first",
    )
    assert meta is not None


@pytest.mark.asyncio
async def test_create_text_file_conflict_raises(
    seeded_course, request_with_state, vault_dir
):
    p = vault_dir / "CourseA" / "existing.md"
    p.write_text("x", encoding="utf-8")

    with pytest.raises(HTTPException) as err:
        await create_text_file(
            "CourseA", "existing.md", TextUpdate(content="new"), request_with_state
        )
    assert err.value.status_code == 409


@pytest.mark.asyncio
async def test_upload_file_saves_content_and_metadata(
    db, seeded_course, request_with_state, vault_dir
):
    spooled = SpooledTemporaryFile()
    spooled.write(b"upload-bytes")
    spooled.seek(0)
    upload = UploadFile(filename="upload.txt", file=spooled)

    result = await upload_file(
        "CourseA", request_with_state, upload, "nested/upload.txt"
    )

    saved_path = vault_dir / "CourseA" / "nested" / "upload.txt"
    assert result["status"] == "uploaded"
    assert saved_path.read_bytes() == b"upload-bytes"

    meta = await db.query_table(
        ResourceMeta,
        where_clauses=[
            ResourceMeta.course == "CourseA",
            ResourceMeta.relative_path == "nested/upload.txt",
        ],
        mode="first",
    )
    assert meta is not None


@pytest.mark.asyncio
async def test_delete_file_or_folder_deletes_disk_and_db(
    db, seeded_course, request_with_state, vault_dir
):
    course = vault_dir / "CourseA"
    target = course / "to-delete.txt"
    target.write_text("bye", encoding="utf-8")
    await db.save(ResourceMeta(course="CourseA", relative_path="to-delete.txt"))

    result = await delete_file_or_folder("CourseA", "to-delete.txt", request_with_state)

    assert result["detail"] == "Deleted successfully"
    assert not target.exists()
    meta = await db.query_table(
        ResourceMeta,
        where_clauses=[
            ResourceMeta.course == "CourseA",
            ResourceMeta.relative_path == "to-delete.txt",
        ],
        mode="first",
    )
    assert meta is None
