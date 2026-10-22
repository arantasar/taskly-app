---
name: frontend-unit-tests
description: Write or update Vitest + Testing Library unit tests for the React/TypeScript frontend in frontend/src, following this repository's isolation conventions (design-system mocks, mocked hooks and children, TanStack Query). Use when a frontend source file needs new or updated tests.
---

# Frontend unit tests (Vitest + Testing Library)

## Ground rules
- Co-locate: `X.tsx` → `X.test.tsx`, `x.ts` → `x.test.ts` in the same folder.
- Import test APIs explicitly: `import { beforeEach, describe, expect, it, vi } from 'vitest'`. `jsdom` and `@testing-library/jest-dom` matchers are set up in `src/test/setup.ts` (auto-cleanup included).
- Prettier style: no semicolons, single quotes, trailing commas. Run `npx prettier --write <file>` from `frontend/` on files you create.
- Top-level `it('does X when Y', ...)` like the existing tests; `describe` only to group several cases of one function.
- Query by role/label/text (`getByRole('button', { name: ... })`), interact with `userEvent.setup()`, assert visible behaviour and callbacks — not internal state or styled-component classes.
- Never modify non-test source, `package.json`, `vite.config.ts` or `tsconfig.json`. Use only installed packages.
- Tests must type-check: `npm run typecheck` (from `frontend/`) runs over test files too.

## Isolation conventions (follow strictly)
- **Design system** — every component test mocks it with an async factory (paths relative to the test file):
  ```ts
  vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
  ```
  The mocks render plain native elements and strip design props. If the code under test uses a design-system component or prop missing from `src/design-system/mocks.tsx`, add it there (this file is test support, allowed to change) — never import the real styled components into unit tests.
- **Children and hooks** — a component test mocks its child components and the feature hooks it calls, then drives scenarios with `vi.mocked(useX).mockReturnValue({...} as unknown as ReturnType<typeof useX>)` — see `features/todos/TodosPage.test.tsx`.
- **HTTP** — `features/*/api/*.test.ts` mock `lib/http`'s `request`; `lib/http.test.ts` stubs `fetch` with `vi.stubGlobal('fetch', vi.fn())` and restores with `vi.unstubAllGlobals()` in `afterEach`.
- **Fixtures** — reuse `src/test/todoFixture.ts`; spread to vary (`{ ...todoFixture, completed: true }`).
- Reset mocks between tests: `beforeEach(() => vi.clearAllMocks())` whenever module mocks hold state.

## Patterns by kind
- **Query/mutation hooks** (`features/*/hooks/use*Query|Mutation.ts`): mock `../api/todos`; `renderHook` with a wrapper providing a **fresh** `new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })` per test. Await `result.current.mutateAsync(...)` inside `act`, or `waitFor(() => expect(result.current.isSuccess).toBe(true))`. Assert cache effects via `client.getQueryData(todoKeys.list)` after seeding with `client.setQueryData(...)`.
- **Hooks over React Query state** (`useTodosBusy`): drive real state through the client (e.g. a pending mutation with the matching `mutationKey`) rather than mocking `@tanstack/react-query`.
- **Timers** (`useNotice`): `vi.useFakeTimers()` + `act(() => vi.advanceTimersByTime(4000))`; restore with `vi.useRealTimers()` in `afterEach`.
- **Providers** (`app/AppProviders.tsx`): render a child that reads `useQueryClient()` / `useTheme()` and assert the injected client/theme is used.
- **Presentational components**: one test per visible state/branch (e.g. `hasTodos` true/false), plus callback wiring and `disabled` propagation.
- **Pure utils**: table of inputs → outputs; assert inputs are not mutated.

## Done when
`python3 .claude/skills/run-tests/scripts/run_tests.py frontend --repeat 3 <your test files>` → `passed`, `npm run typecheck` and `npx prettier --check <files>` clean, then the full-suite run in `run-tests` stays green.
