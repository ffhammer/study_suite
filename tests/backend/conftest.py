from pathlib import Path
from types import SimpleNamespace

import pytest
import pytest_asyncio

from src.backend.config import ApiConfig
from src.backend.database.db import DataBase
from src.backend.database.models import CourseConfig


@pytest.fixture
def vault_dir(tmp_path: Path) -> Path:
    vault = tmp_path / "vault"
    vault.mkdir(parents=True, exist_ok=True)
    return vault


@pytest.fixture
def api_config(vault_dir: Path) -> ApiConfig:
    # Keep a trailing slash to avoid malformed DB URL concatenation.
    return ApiConfig(VAULT_BASE_PATH=f"{vault_dir}/")


@pytest_asyncio.fixture
async def db(api_config: ApiConfig) -> DataBase:
    database = DataBase(config=api_config)
    await database.initialize_db()
    return database


@pytest.fixture
def request_with_state(api_config: ApiConfig, db: DataBase):
    state = SimpleNamespace(config=api_config, db=db, transcription_jobs={})
    app = SimpleNamespace(state=state)
    return SimpleNamespace(app=app)


@pytest_asyncio.fixture
async def seeded_course(db: DataBase, vault_dir: Path) -> CourseConfig:
    course = CourseConfig(folder_name="CourseA", is_active=True)
    await db.save(course)
    (vault_dir / "CourseA").mkdir(parents=True, exist_ok=True)
    return course
