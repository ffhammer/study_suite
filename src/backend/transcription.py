import os
import subprocess
from pathlib import Path

from faster_whisper import WhisperModel


def extract_audio_sync(video_path: Path, output_path: Path):
    """Blocking function to extract audio via ffmpeg."""
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


def run_whisper_sync(audio_path: Path, job_id: str, jobs_dict: dict):
    """Blocking function that runs Whisper and updates the global dict."""
    model = WhisperModel(
        "large-v3-turbo",
        device="cpu",
        compute_type="int8",
        cpu_threads=max(1, os.cpu_count() - 1),
    )

    segments, info = model.transcribe(str(audio_path), beam_size=5)

    jobs_dict[job_id]["total"] = info.duration
    jobs_dict[job_id]["status"] = "transcribing"

    full_text = []

    # Iterate over segments and update the progress dictionary
    for segment in segments:
        full_text.append(segment.text)
        jobs_dict[job_id]["progress"] = segment.end

    return "".join(full_text)
