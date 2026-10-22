from unittest.mock import patch

import pytest

from app.core import config
from app.core.config import resolve_database_url

POSTGRES_ENV = {
    "POSTGRES_USER": "taskly",
    "POSTGRES_PASSWORD": "s3cret",
    "POSTGRES_HOST": "db.local",
    "DB_PORT": "6543",
    "POSTGRES_DB": "tasks",
}


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch):
    for name in ["DATABASE_URL", *POSTGRES_ENV]:
        monkeypatch.delenv(name, raising=False)
    with patch.object(config, "load_dotenv") as load_dotenv:
        yield load_dotenv


def test_explicit_argument_wins_over_environment(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://env/db")
    assert resolve_database_url("sqlite://") == "sqlite://"


def test_database_url_from_environment_is_used_when_no_argument(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://env/db")
    assert resolve_database_url() == "postgresql+psycopg://env/db"


def test_url_is_assembled_from_postgres_variables_with_visible_password(monkeypatch):
    for name, value in POSTGRES_ENV.items():
        monkeypatch.setenv(name, value)
    assert resolve_database_url() == "postgresql+psycopg://taskly:s3cret@db.local:6543/tasks"


def test_missing_postgres_variable_raises_key_error(monkeypatch):
    for name, value in POSTGRES_ENV.items():
        if name != "POSTGRES_HOST":
            monkeypatch.setenv(name, value)
    with pytest.raises(KeyError, match="POSTGRES_HOST"):
        resolve_database_url()


def test_root_env_file_is_loaded_without_overriding_existing_variables(isolated_env):
    resolve_database_url("sqlite://")
    path = isolated_env.call_args.args[0]
    assert path.name == ".env"
    assert (path.parent / "backend" / "app" / "core" / "config.py").exists()
    assert isolated_env.call_args.kwargs == {"override": False}
