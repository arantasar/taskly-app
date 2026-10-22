from datetime import date, datetime, timezone
from unittest.mock import Mock

from sqlalchemy import select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from app.features.todos.models import TodoRecord
from app.features.todos.repository import TodoRepository
from app.features.todos.schemas import Priority, Todo, TodoCreate, TodoStats, TodoUpdate


def test_list_maps_models_and_orders_tasks_newest_first(model_factory, todo_values, todo):
    session = Mock(spec=Session)
    session.scalars.return_value = [model_factory(todo_values)]
    assert TodoRepository(session).list() == [todo]
    statement = session.scalars.call_args.args[0]
    expected = select(TodoRecord).order_by(TodoRecord.created_at.desc(), TodoRecord.id.desc())
    assert statement.compare(expected)
    compiled = str(statement.compile(dialect=postgresql.dialect()))
    assert "ORDER BY todos.created_at DESC, todos.id DESC" in compiled


def test_get_returns_none_for_missing_task():
    session = Mock(spec=Session)
    session.get.return_value = None
    assert TodoRepository(session).get(404) is None
    session.get.assert_called_once_with(TodoRecord, 404)


def test_get_maps_existing_task(model_factory, todo_values, todo):
    session = Mock(spec=Session)
    session.get.return_value = model_factory(todo_values)
    assert TodoRepository(session).get(7) == todo
    session.get.assert_called_once_with(TodoRecord, 7)


def test_stats_derives_active_count_and_queries_overdue_against_given_date():
    session = Mock(spec=Session)
    session.execute.return_value.one.return_value = (5, 2, 1)
    today = date(2026, 10, 15)
    assert TodoRepository(session).stats(today) == TodoStats(total=5, active=3, completed=2, overdue=1)
    statement = session.execute.call_args.args[0]
    compiled = statement.compile(dialect=postgresql.dialect())
    assert today in compiled.params.values()
    sql = str(compiled)
    assert "todos.due_date <" in sql
    assert "FILTER (WHERE todos.completed IS true)" in sql


def test_create_persists_payload_with_utc_timestamps_and_returns_refreshed_task():
    session = Mock(spec=Session)
    session.refresh.side_effect = lambda record: setattr(record, "id", 11)
    payload = TodoCreate(title="Write tests", priority="low", due_date=date(2026, 11, 1))
    before = datetime.now(timezone.utc)
    created = TodoRepository(session).create(payload)
    after = datetime.now(timezone.utc)

    record = session.add.call_args.args[0]
    assert isinstance(record, TodoRecord)
    session.commit.assert_called_once_with()
    session.refresh.assert_called_once_with(record)
    assert before <= record.created_at <= after
    assert record.updated_at == record.created_at
    assert created == Todo(
        id=11,
        title="Write tests",
        description="",
        priority=Priority.low,
        due_date=date(2026, 11, 1),
        completed=False,
        created_at=record.created_at,
        updated_at=record.created_at,
    )


def test_update_changes_only_sent_fields_and_bumps_updated_at(model_factory, todo_values):
    session = Mock(spec=Session)
    record = model_factory({**todo_values, "due_date": date(2026, 10, 5)})
    session.get.return_value = record
    before = datetime.now(timezone.utc)
    updated = TodoRepository(session).update(7, TodoUpdate(completed=True, due_date=None))
    after = datetime.now(timezone.utc)

    session.get.assert_called_once_with(TodoRecord, 7)
    session.commit.assert_called_once_with()
    session.refresh.assert_called_once_with(record)
    assert before <= record.updated_at <= after
    assert updated == Todo.model_validate(
        {**todo_values, "completed": True, "due_date": None, "updated_at": record.updated_at}
    )


def test_update_returns_none_without_committing_for_missing_task():
    session = Mock(spec=Session)
    session.get.return_value = None
    assert TodoRepository(session).update(404, TodoUpdate(title="New")) is None
    session.commit.assert_not_called()


def test_delete_removes_existing_task_and_commits(model_factory, todo_values):
    session = Mock(spec=Session)
    record = model_factory(todo_values)
    session.get.return_value = record
    assert TodoRepository(session).delete(7) is True
    session.get.assert_called_once_with(TodoRecord, 7)
    session.delete.assert_called_once_with(record)
    session.commit.assert_called_once_with()


def test_delete_returns_false_without_committing_for_missing_task():
    session = Mock(spec=Session)
    session.get.return_value = None
    assert TodoRepository(session).delete(404) is False
    session.delete.assert_not_called()
    session.commit.assert_not_called()
