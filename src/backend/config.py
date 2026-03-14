from pathlib import Path

from fastapi import HTTPException
from pydantic_settings import BaseSettings


class ApiConfig(BaseSettings):
    VAULT_BASE_PATH: str = "/Users/felix/Desktop/study_suite/vault"
    LOG_LEVEL: str = "DEBUG"
    LOG_FORMAT: str = (
        "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
        "<level>{message}</level>"
    )

    VIDEO_SUFFIXES: list[str] = [".mp4", ".mkv", ".mov"]
    AUDIO_SUFFIXES: list[str] = [".mp3", ".wav", ".m4a"]
    IMG_SUFFIXES: list[str] = [".png"]
    LLM_PROVIDER: str = "gemini"
    LLM_DEFAULT_MODEL: str = "gemini-3-flash-preview"
    GEMINI_ALLOWED_MODELS: list[str] = [
        "gemini-3-flash-preview",
        "gemini-2.5-flash",
        "gemini-2.5-pro",
        "gemini-3.1-flash-lite-preview",
    ]
    TRANSCRIPT_CHUNK_TARGET_SECONDS: float = 15.0
    TRANSCRIPT_CHUNK_MAX_GAP_SECONDS: float = 5.0

    @property
    def DATABASE_URL(self):
        db_path = Path(self.VAULT_BASE_PATH).expanduser() / "db..db"
        return f"sqlite+aiosqlite:///{db_path}"

    def save_join_file_path(self, course_folder: str, relpath: str) -> Path:
        vault_base = Path(self.VAULT_BASE_PATH).expanduser().resolve()
        path = (vault_base / course_folder / relpath).resolve()

        # Check if the target is still inside the vault
        if path != vault_base and vault_base not in path.parents:
            raise HTTPException(status_code=403, detail="Stay in your lane!")

        return path
