from pydantic_settings import BaseSettings


class ApiConfig(BaseSettings):

    VAULT_BASE_PATH: str = "/Users/felix/Desktop/study_suite/vault"

    @property
    def DATABASE_URL(self):
        return f"sqlite+aiosqlite:///{self.VAULT_BASE_PATH}.db"
