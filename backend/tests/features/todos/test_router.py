from datetime import date

import pytest

from app.features.todos.schemas import TodoCreate, TodoStats, TodoUpdate


def test_list_returns_tasks_from_repository(client, repository_mock, todo):
    repository_mock.list.return_value = [todo]
    response = client.get("/api/todos")
    assert response.status_code == 200
    assert response.json() == [todo.model_dump(mode="json")]
    repository_mock.list.assert_called_once_with()


def test_create_trims_input_and_returns_created_task(client, repository_mock, todo):
    repository_mock.create.return_value = todo
    response = client.post("/api/todos", json={"title": "  Plan the sprint  ", "priority": "high"})
    assert response.status_code == 201
    assert response.json() == todo.model_dump(mode="json")
    repository_mock.create.assert_called_once_with(
        TodoCreate(title="Plan the sprint", priority="high")
    )


@pytest.mark.parametrize("payload", [
    {"title": "   "},
    {"title": "x" * 121},
    {"title": "Task", "priority": "urgent"},
    {"title": "Task", "due_date": "2026-02-30"},
])
def test_invalid_create_never_calls_repository(client, repository_mock, payload):
    assert client.post("/api/todos", json=payload).status_code == 422
    repository_mock.create.assert_not_called()


def test_stats_passes_client_date_and_is_not_treated_as_task_id(client, repository_mock):
    stats = TodoStats(total=3, active=2, completed=1, overdue=1)
    repository_mock.stats.return_value = stats
    response = client.get("/api/todos/stats", params={"today": "2026-10-15"})
    assert response.status_code == 200
    assert response.json() == stats.model_dump()
    repository_mock.stats.assert_called_once_with(date(2026, 10, 15))
    repository_mock.get.assert_not_called()


def test_stats_defaults_to_server_date_when_none_given(client, repository_mock):
    repository_mock.stats.return_value = TodoStats(total=0, active=0, completed=0, overdue=0)
    before = date.today()
    assert client.get("/api/todos/stats").status_code == 200
    after = date.today()
    (called_with,) = repository_mock.stats.call_args.args
    assert before <= called_with <= after


def test_stats_rejects_invalid_date(client, repository_mock):
    assert client.get("/api/todos/stats", params={"today": "2026-02-30"}).status_code == 422
    repository_mock.stats.assert_not_called()


def test_get_returns_task_from_repository(client, repository_mock, todo):
    repository_mock.get.return_value = todo
    response = client.get("/api/todos/7")
    assert response.status_code == 200
    assert response.json() == todo.model_dump(mode="json")
    repository_mock.get.assert_called_once_with(7)


def test_get_returns_404_for_missing_task(client, repository_mock):
    repository_mock.get.return_value = None
    response = client.get("/api/todos/404")
    assert response.status_code == 404
    assert response.json() == {"detail": "Task not found."}


def test_update_passes_partial_payload_and_returns_updated_task(client, repository_mock, todo):
    repository_mock.update.return_value = todo
    response = client.patch("/api/todos/7", json={"completed": True})
    assert response.status_code == 200
    assert response.json() == todo.model_dump(mode="json")
    repository_mock.update.assert_called_once_with(7, TodoUpdate(completed=True))


def test_update_returns_404_for_missing_task(client, repository_mock):
    repository_mock.update.return_value = None
    response = client.patch("/api/todos/404", json={"title": "New"})
    assert response.status_code == 404
    assert response.json() == {"detail": "Task not found."}


@pytest.mark.parametrize("payload", [
    {},
    {"title": None},
    {"completed": "true"},
    {"unknown": 1},
])
def test_invalid_update_never_calls_repository(client, repository_mock, payload):
    assert client.patch("/api/todos/7", json=payload).status_code == 422
    repository_mock.update.assert_not_called()


def test_delete_returns_empty_204_for_existing_task(client, repository_mock):
    repository_mock.delete.return_value = True
    response = client.delete("/api/todos/7")
    assert response.status_code == 204
    assert response.content == b""
    repository_mock.delete.assert_called_once_with(7)


def test_delete_returns_404_for_missing_task(client, repository_mock):
    repository_mock.delete.return_value = False
    response = client.delete("/api/todos/404")
    assert response.status_code == 404
    assert response.json() == {"detail": "Task not found."}


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
def test_non_positive_id_is_rejected_before_repository(client, repository_mock, method):
    kwargs = {"json": {"title": "New"}} if method == "patch" else {}
    assert client.request(method, "/api/todos/0", **kwargs).status_code == 422
    repository_mock.get.assert_not_called()
    repository_mock.update.assert_not_called()
    repository_mock.delete.assert_not_called()
