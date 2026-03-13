from pydantic_settings import BaseSettings


class ApiConfig(BaseSettings):

    VAULT_BASE_PATH: str = "/Users/felix/Desktop/study_suite/vault"

    VIDEO_SUFFIXES = [".mp4", ".mkv", ".mov"]
    AUDIO_SUFFIXES = [".mp3", ".wav", ".m4a"]
    IMG_SUFFIXES = [".png"]

    @property
    def DATABASE_URL(self):
        return f"sqlite+aiosqlite:///{self.VAULT_BASE_PATH}db..db"
