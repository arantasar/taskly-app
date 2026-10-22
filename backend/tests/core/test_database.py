from unittest.mock import patch

from sqlalchemy import create_engine

from app.core.database import create_database_engine, create_session_factory, initialize
from app.features.todos.models import Base


def test_engine_uses_the_postgresql_psycopg_driver():
    url = "postgresql+psycopg://taskly:taskly@localhost:5432/taskly"
    engine = create_database_engine(url)
    try:
        assert engine.url.drivername == "postgresql+psycopg"
        assert engine.dialect.name == "postgresql"
        assert engine.dialect.driver == "psycopg"
        assert engine.url.database == "taskly"
    finally:
        engine.dispose()


def test_session_factory_binds_engine_and_keeps_objects_loaded_after_commit():
    engine = create_engine("sqlite://")
    try:
        session = create_session_factory(engine)()
        try:
            assert session.get_bind() is engine
            assert session.expire_on_commit is False
        finally:
            session.close()
    finally:
        engine.dispose()


def test_initialize_creates_all_tables_on_the_engine():
    engine = create_engine("sqlite://")
    try:
        with patch.object(Base.metadata, "create_all") as create_all:
            initialize(engine)
        create_all.assert_called_once_with(engine)
    finally:
        engine.dispose()
