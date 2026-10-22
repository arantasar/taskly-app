import asyncio
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest

from app.core import lifespan as lifespan_module
from app.core.lifespan import lifespan


def make_app():
    return SimpleNamespace(state=SimpleNamespace(database_url="postgresql+psycopg://db/taskly"))


async def enter_and_exit(app, body=None):
    async with lifespan(app):
        if body is not None:
            body()


def test_lifespan_initializes_schema_stores_session_factory_and_disposes_engine():
    app = make_app()
    engine = Mock()
    session_factory = Mock()
    seen_during_lifespan = []
    with (
        patch.object(lifespan_module, "create_database_engine", return_value=engine) as create_engine,
        patch.object(lifespan_module, "initialize") as initialize,
        patch.object(lifespan_module, "create_session_factory", return_value=session_factory) as create_factory,
    ):
        asyncio.run(enter_and_exit(app, lambda: seen_during_lifespan.append(
            (app.state.session_factory, engine.dispose.called)
        )))
    create_engine.assert_called_once_with("postgresql+psycopg://db/taskly")
    initialize.assert_called_once_with(engine)
    create_factory.assert_called_once_with(engine)
    assert seen_during_lifespan == [(session_factory, False)]
    engine.dispose.assert_called_once_with()


def test_engine_is_disposed_when_initialization_fails():
    app = make_app()
    engine = Mock()
    with (
        patch.object(lifespan_module, "create_database_engine", return_value=engine),
        patch.object(lifespan_module, "initialize", side_effect=RuntimeError("db down")),
        patch.object(lifespan_module, "create_session_factory") as create_factory,
    ):
        with pytest.raises(RuntimeError, match="db down"):
            asyncio.run(enter_and_exit(app))
    create_factory.assert_not_called()
    assert not hasattr(app.state, "session_factory")
    engine.dispose.assert_called_once_with()
