---
name: backend-unit-tests
description: Write or update pytest unit tests for the FastAPI/SQLAlchemy backend in backend/app, following this repository's conventions (mocked repository, no real database, shared fixtures). Use when a backend source file needs new or updated tests.
---

# Backend unit tests (pytest)

## Ground rules
- Tests live in `backend/tests/`, mirroring `backend/app/`: `app/core/config.py` → `tests/core/test_config.py`. Every test directory has an empty `__init__.py`; create it when adding a directory.
- **Unit tests never touch a real database or network.** Postgres is not available when tests run.
- Import the code under test with absolute `app.…` imports; shared helpers with `tests.…`.
- Style: plain `def test_<behaviour_in_words>()` functions (no classes), `pytest.mark.parametrize` for input tables, `pytest.raises(..., match=...)`, one behaviour per test, compact assertions on full values (`response.json() == todo.model_dump(mode="json")`). Match the density of `tests/features/todos/test_router.py`.
- Never modify anything under `backend/app/`, `pyproject.toml` or requirements. Only add packages that are already installed (`pytest`, `pytest-cov`, `httpx`, stdlib `unittest.mock`).

## Fixtures already available (`tests/conftest.py`, `tests/mocks.py`)
| fixture | gives you |
|---|---|
| `repository_mock` | `create_autospec(TodoRepository, instance=True)` — calls are interface-checked; `list` returns `[]` by default |
| `client` | `TestClient` over a bare `FastAPI()` with **only the todos router** and `get_repository` overridden by `repository_mock` |
| `todo_values` / `todo` | a canonical task as a dict / as `schemas.Todo` |
| `model_factory` | `lambda values: TodoRecord(**values)` |

Reuse them. Add a new fixture to `conftest.py` only when ≥2 test modules need it; otherwise keep it local to the module.

## Patterns by layer
- **Router** (`features/*/router.py`): use `client` + `repository_mock`. Assert status code, JSON body and the exact repository call (`assert_called_once_with(...)`, `assert_not_called()` for rejected input). Cover 404 paths (`return_value = None` / `False`) and 422 validation via `parametrize`.
- **Repository**: `session = Mock(spec=Session)`; set `session.get.return_value` / `session.scalars.return_value`; assert `commit`/`refresh`/`delete`/`add` calls and returned mapped objects. Compare SQL with `statement.compare(expected)` like `test_repository.py`. Freeze or bound timestamps (`datetime.now(timezone.utc)`) by asserting `before <= value <= after` rather than patching `datetime`.
- **Schemas / validators**: construct models directly; assert `ValidationError` messages and `model_dump(exclude_unset=True)`.
- **Dependencies** (`api/dependencies.py`): build a `starlette.requests.Request({"type": "http", "app": app})` with `app = SimpleNamespace(state=SimpleNamespace(session_factory=Mock(...)))`, drive the generator with `next()` / `.throw()` / `.close()`, and assert `rollback`/`close`.
- **App wiring** (`factory.py`, `core/lifespan.py`, `api/health.py`, `core/config.py`):
  - `config.resolve_database_url`: use `monkeypatch.setenv/delenv` and patch `app.core.config.load_dotenv` so the developer's real `.env` cannot leak into the test.
  - `lifespan`: patch `create_database_engine`, `initialize`, `create_session_factory` **in `app.core.lifespan`** (where they are looked up), run `async with lifespan(app):` via `asyncio.run(...)` or a `TestClient` context, assert the session factory is stored and `engine.dispose()` runs even when `initialize` raises.
  - `factory.create_app`: pass an explicit `database_url`, assert the public API via `app.openapi()["paths"]` (the installed FastAPI wraps included routers, so `app.routes` and lifespan identity are not reliable) and `app.state.database_url`. To check lifespan wiring, patch `app.factory.lifespan` with a recording `@asynccontextmanager` before `create_app` and enter `TestClient(app)`.
  - `health`: mount `health.router` on a bare `FastAPI()` with `dependency_overrides[get_repository]` returning a mock exposing `.session.execute` (the autospec mock lacks instance attributes, so set `repository_mock.session = Mock()`).
  - `database.py`: `create_engine` does not connect; `sqlite://` URLs are fine for checking `create_session_factory` options (`expire_on_commit`), but do not call `initialize` against Postgres.

## Done when
`python3 .claude/skills/run-tests/scripts/run_tests.py backend --repeat 3 <your test files>` → `passed`, then the full-suite run in `run-tests` stays green.
