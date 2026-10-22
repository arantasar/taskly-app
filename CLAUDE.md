# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Taskly is a todo app: a FastAPI + SQLAlchemy + PostgreSQL backend (`backend/`) and a React 19 + Vite + TanStack Query + styled-components frontend (`frontend/`). The repo root holds `compose.yaml`, `.env.example` and a `pytest.ini` that lets pytest run from the root too.

## Commands

Setup: `cp .env.example .env` (compose refuses to start without it).

Full stack (app on :8080, API docs on :8000/docs): `docker compose up --build -d --wait`; stop with `docker compose down`.

Backend (venv at `backend/.venv`, created from the repo root):
```sh
python3 -m venv backend/.venv && source backend/.venv/bin/activate
python -m pip install -r backend/requirements.txt
docker compose up -d --wait postgres          # DB for local dev
cd backend && python -m uvicorn app.main:app --reload
python -m pytest                               # in backend/
python -m pytest tests/features/todos/test_router.py::test_name   # single test
python -m pytest --cov=app --cov-report=term-missing --cov-report=html  # → backend/coverage/html
```
Dependencies: edit `backend/requirements.in`, then regenerate the pinned lockfile with
`uv pip compile backend/requirements.in -o backend/requirements.txt --universal` (from the repo root).

Frontend (in `frontend/`, Node >= 22.12):
```sh
npm ci
npm run dev            # :5173, proxies /api → 127.0.0.1:8000
npm test               # vitest run
npx vitest run src/features/todos/components/TodoItem.test.tsx   # single file (-t "name" for one test)
npm run test:coverage  # → frontend/coverage/index.html
npm run typecheck      # tsc --noEmit (also part of npm run build)
npm run format:check   # prettier; npm run format to fix
npm run storybook      # :6006
```
There is no ESLint and no Python linter configured. `.npmrc` sets `save-exact=true` — dependencies are pinned to exact versions.

## Architecture

### Backend (`backend/app`)
- `factory.create_app(database_url=None)` builds the app; `main.py` just calls it. The DB URL comes from the argument, then `DATABASE_URL`, then is assembled from `POSTGRES_*`/`DB_PORT` (`core/config.py` loads the root `.env`).
- `core/lifespan.py` creates the engine, runs `Base.metadata.create_all` (there are **no migrations** — schema changes to existing tables need manual handling), and stores a `session_factory` on `app.state`.
- `api/dependencies.get_repository` opens a session per request and yields a `TodoRepository`; routes depend on it via the `Repository` annotated alias.
- Feature-sliced: `features/todos/` holds `router` (HTTP + 404s) → `repository` (all SQLAlchemy access, commits, timestamps) → `mappers.from_model` (ORM `TodoRecord` → Pydantic `Todo`). `schemas.py` defines `TodoCreate`/`TodoUpdate` with `extra="forbid"`, whitespace stripping and strict booleans; `validators.validate_patch_fields` enforces non-empty PATCH bodies and allows explicit `null` only for `due_date`. Field limits (title 120, description 2000) are duplicated in the DB model and in the frontend's 422 message in `lib/http.ts` — keep them in sync.
- API: `/api/health`, `/api/todos` (GET list newest-first, POST), `/api/todos/{id}` (GET, PATCH, DELETE).

### Backend tests (`backend/tests`, mirrors `app/`)
Tests never touch a real database. The `client` fixture in `conftest.py` mounts **only the todos router** on a bare `FastAPI()` and overrides `get_repository` with `create_autospec(TodoRepository)` from `tests/mocks.py`. Repository tests use `Mock(spec=Session)` and compare compiled SQL statements. Shared data comes from the `todo_values` / `todo` / `model_factory` fixtures.

### Frontend (`frontend/src`)
- `main.tsx` → `App` wrapped in `app/AppProviders` (QueryClient + styled-components `ThemeProvider` + `GlobalStyles`).
- `lib/http.request` is the single fetch wrapper: prefixes `/api`, maps network/422/`detail` errors to user-facing messages, returns `undefined` for 204. In dev Vite proxies `/api`; in Docker nginx (`frontend/nginx.conf`) proxies to `backend:8000`.
- `features/todos/`: `api/todos.ts` (`todosApi`, which whitelists writable fields so read-only `Todo` fields are never sent), `api/queryKeys.ts` (`todoKeys`), one hook per query/mutation in `hooks/` (mutations update the `todoKeys.list` cache via `setQueryData` instead of refetching), presentational components in `components/`, pure helpers in `utils/`. `TodosPage` composes them; `index.ts` exports only `TodosPage`.
- `design-system/`: themed UI primitives, all exported from the `design-system/index.ts` barrel. Each component folder follows `X.tsx` / `X.types.ts` / `X.styles.ts` / optional `X.variants.ts` (variant→`css` maps) / `X.stories.tsx` / `index.ts`. Styled props use the `$` transient prefix; values come from `theme/theme.ts` (typed via `theme/styled.d.ts`). Design-system code is excluded from coverage and covered by Storybook stories instead.

### Frontend tests
Vitest + jsdom + Testing Library, co-located as `*.test.ts(x)`. Tests are strongly isolated: components mock the design system with `vi.mock('<path>/design-system', () => import('<path>/design-system/mocks'))` (the mocks render plain native elements and strip design props — add new components/props there when extending the design system) and mock child components and hooks, then drive behavior through `vi.mocked(hook).mockReturnValue(...)`. Shared fixture: `src/test/todoFixture.ts`.

### Unit-test agent (`.claude/`)
`agents/unit-test-engineer.md` writes/updates tests and preloads five skills: `test-scope` (diff → which files need tests), `backend-unit-tests` / `frontend-unit-tests` (repo conventions), `run-tests` (`run_tests.py`, `coverage_gaps.py`; results in gitignored `.test-results/`), `test-report` (`.test-results/agent-report.md`). `hooks/test_paths_guard.py` is the single allowlist of what the agent may change: `hook` mode blocks file writes outside test files (Bash is limited by `--allowedTools`); `check` mode verifies a working tree. Run headless: `claude -p --agent unit-test-engineer "Coverage mode: ..."` (or "Change mode: tests for changes between <BASE> and HEAD"). When changing test conventions, update the matching skill. `.github/workflows/unit-test-agent.yml` runs the agent on PRs (`generate` with the model token and read-only access, `publish` with write access and no model; see `SOLUTION.md`).

### Style
Prettier: no semicolons, single quotes, trailing commas. Backend code uses relative imports within `app` and absolute `app.…` imports in tests.
