import os
import subprocess
from pathlib import Path

from faster_whisper import WhisperModel
from loguru import logger


def _format_timestamp(seconds: float) -> str:
    total = max(0, int(seconds))
    hours = total // 3600
    minutes = (total % 3600) // 60
    secs = total % 60
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def _merge_segments(
    raw_segments: list[dict], target_seconds: float, max_gap_seconds: float
) -> list[dict]:
    if not raw_segments:
        return []

    merged: list[dict] = []
    current = dict(raw_segments[0])

    for nxt in raw_segments[1:]:
        gap = max(0.0, float(nxt["start"]) - float(current["end"]))
        combined_duration = float(nxt["end"]) - float(current["start"])

        should_merge = (
            gap <= max_gap_seconds
            and (
                (float(current["end"]) - float(current["start"])) < target_seconds
                or combined_duration <= target_seconds
            )
        )

        if should_merge:
            current["end"] = float(nxt["end"])
            current["text"] = f"{current['text']} {nxt['text']}".strip()
            continue

        merged.append(current)
        current = dict(nxt)

    merged.append(current)
    return merged


def extract_audio_sync(video_path: Path, output_path: Path):
    """Blocking function to extract audio via ffmpeg."""
    logger.info("ffmpeg extract start: input={}, output={}", video_path, output_path)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-vn",
            "-acodec",
            "libmp3lame",
            "-q:a",
            "2",
            str(output_path),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    logger.info("ffmpeg extract completed: output={}", output_path)


def run_whisper_sync(
    audio_path: Path,
    job_id: str,
    jobs_dict: dict,
    chunk_target_seconds: float = 15.0,
    chunk_max_gap_seconds: float = 1.0,
):
    """Blocking function that runs Whisper and updates the global dict."""
    logger.info("whisper load model start: job_id={}, audio={}", job_id, audio_path)
    model = WhisperModel(
        "large-v3-turbo",
        device="cpu",
        compute_type="int8",
        cpu_threads=max(1, os.cpu_count() - 1),
    )
    logger.info("whisper model loaded: job_id={}, model=large-v3-turbo", job_id)

    logger.info("whisper transcription start: job_id={}", job_id)
    segments, info = model.transcribe(str(audio_path), beam_size=5)
    logger.debug(
        "whisper stream ready: job_id={}, duration={}s, language={}",
        job_id,
        info.duration,
        getattr(info, "language", None),
    )

    jobs_dict[job_id]["total"] = info.duration
    jobs_dict[job_id]["status"] = "transcribing"

    raw_segments = []

    # Iterate over segments and update the progress dictionary
    for segment in segments:
        cleaned_text = segment.text.strip()
        if cleaned_text:
            raw_segments.append(
                {
                    "start": float(segment.start),
                    "end": float(segment.end),
                    "text": cleaned_text,
                }
            )
        jobs_dict[job_id]["progress"] = segment.end
        logger.debug(
            "whisper progress: job_id={}, segment_end={}s, total={}s",
            job_id,
            segment.end,
            info.duration,
        )
    segments_payload = _merge_segments(
        raw_segments,
        target_seconds=max(1.0, float(chunk_target_seconds)),
        max_gap_seconds=max(0.0, float(chunk_max_gap_seconds)),
    )

    final_text = "\n".join(segment["text"] for segment in segments_payload)
    timestamped_text = "\n".join(
        f"[{_format_timestamp(segment['start'])}] {segment['text']}"
        for segment in segments_payload
    )
    logger.info(
        "whisper transcription completed: job_id={}, chars={}",
        job_id,
        len(timestamped_text),
    )
    return {
        "plain_text": final_text,
        "timestamped_text": timestamped_text,
        "segments": segments_payload,
    }
