from unittest.mock import Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api import health
from app.api.dependencies import get_repository
from app.features.todos.models import TodoRecord


@pytest.fixture
def health_client(repository_mock):
    repository_mock.session = Mock()
    app = FastAPI()
    app.include_router(health.router)
    app.dependency_overrides[get_repository] = lambda: repository_mock
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


def test_health_probes_database_and_reports_ok(health_client, repository_mock):
    response = health_client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    statement = repository_mock.session.execute.call_args.args[0]
    assert statement.compare(select(TodoRecord.id).limit(1))


def test_health_fails_when_database_probe_fails(health_client, repository_mock):
    repository_mock.session.execute.side_effect = RuntimeError("db down")
    assert health_client.get("/api/health").status_code == 500
