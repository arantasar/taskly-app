from contextlib import asynccontextmanager
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import factory
from app.factory import create_app


def test_create_app_registers_health_and_todo_routes():
    app = create_app("sqlite://")
    paths = app.openapi()["paths"]
    assert {path: set(methods) for path, methods in paths.items()} == {
        "/api/health": {"get"},
        "/api/todos": {"get", "post"},
        "/api/todos/stats": {"get"},
        "/api/todos/{todo_id}": {"get", "patch", "delete"},
    }
    assert app.title == "Taskly API"


def test_create_app_stores_resolved_database_url():
    with patch.object(factory, "resolve_database_url", return_value="postgresql+psycopg://x/y") as resolve:
        app = create_app("sqlite://")
    resolve.assert_called_once_with("sqlite://")
    assert app.state.database_url == "postgresql+psycopg://x/y"


def test_create_app_runs_the_lifespan_on_startup_and_shutdown():
    events = []

    @asynccontextmanager
    async def recording_lifespan(app):
        events.append(("start", app.state.database_url))
        yield
        events.append(("stop", app.state.database_url))

    with patch.object(factory, "lifespan", recording_lifespan):
        app = create_app("sqlite://")
    with TestClient(app):
        assert events == [("start", "sqlite://")]
    assert events == [("start", "sqlite://"), ("stop", "sqlite://")]
