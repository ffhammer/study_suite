from pathlib import Path

from fastapi import HTTPException
from pydantic_settings import BaseSettings


class ApiConfig(BaseSettings):
    VAULT_BASE_PATH: str = "/Users/felix/Desktop/study_suite/vault"

    VIDEO_SUFFIXES = [".mp4", ".mkv", ".mov"]
    AUDIO_SUFFIXES = [".mp3", ".wav", ".m4a"]
    IMG_SUFFIXES = [".png"]

    @property
    def DATABASE_URL(self):
        return f"sqlite+aiosqlite:///{self.VAULT_BASE_PATH}db..db"

    def save_join_file_path(self, course_folder: str, relpath: str) -> Path:
        path = Path(self.VAULT_BASE_PATH) / course_folder / relpath

        # Check if the target is still inside the vault
        if not str(path).startswith(str(self.VAULT_BASE_PATH)):
            raise HTTPException(status_code=403, detail="Stay in your lane!")

        return path
