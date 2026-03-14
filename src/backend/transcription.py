import os
import subprocess
from pathlib import Path

from faster_whisper import WhisperModel
from loguru import logger


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


def run_whisper_sync(audio_path: Path, job_id: str, jobs_dict: dict):
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

    full_text = []

    # Iterate over segments and update the progress dictionary
    for segment in segments:
        full_text.append(segment.text)
        jobs_dict[job_id]["progress"] = segment.end
        logger.debug(
            "whisper progress: job_id={}, segment_end={}s, total={}s",
            job_id,
            segment.end,
            info.duration,
        )
    final_text = "".join(full_text)
    logger.info(
        "whisper transcription completed: job_id={}, chars={}",
        job_id,
        len(final_text),
    )
    return final_text
