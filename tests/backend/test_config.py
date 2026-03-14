from pathlib import Path

import pytest
from fastapi import HTTPException

from src.backend.config import ApiConfig


def test_database_url_uses_vault_path(vault_dir: Path):
    cfg_with_slash = ApiConfig(VAULT_BASE_PATH=f"{vault_dir}/")
    cfg_without_slash = ApiConfig(VAULT_BASE_PATH=str(vault_dir))

    expected = f"sqlite+aiosqlite:///{vault_dir / 'db..db'}"
    assert cfg_with_slash.DATABASE_URL == expected
    assert cfg_without_slash.DATABASE_URL == expected


def test_save_join_file_path_returns_joined_path(vault_dir: Path):
    cfg = ApiConfig(VAULT_BASE_PATH=str(vault_dir))
    resolved = cfg.save_join_file_path("course", "folder/file.md")
    assert resolved == vault_dir / "course" / "folder" / "file.md"


def test_save_join_file_path_rejects_absolute_path(vault_dir: Path):
    cfg = ApiConfig(VAULT_BASE_PATH=str(vault_dir))
    with pytest.raises(HTTPException) as err:
        cfg.save_join_file_path("/etc", "passwd")
    assert err.value.status_code == 403
