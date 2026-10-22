---
name: run-tests
description: Run backend (pytest) and frontend (vitest) unit tests, measure coverage, list uncovered lines, and detect flaky tests. Use whenever tests must be executed or verified, or to find what code lacks coverage.
allowed-tools: Bash(python3 .claude/skills/run-tests/scripts/run_tests.py:*), Bash(python3 .claude/skills/run-tests/scripts/coverage_gaps.py:*), Read
---

# Run tests

Always run tests through these scripts (not raw `pytest`/`vitest`): they work the same locally and in CI, write machine-readable results to `.test-results/`, and those results are what `test-report` reads.

## Commands (from the repo root)

```sh
S=.claude/skills/run-tests/scripts

# Fast loop on the files you just wrote (paths are repo-relative, any mix of areas):
python3 $S/run_tests.py all backend/tests/test_factory.py frontend/src/lib/http.test.ts

# Flakiness check of new/changed tests — must be "passed", never "flaky":
python3 $S/run_tests.py all --repeat 3 <test files>

# Full suite + coverage: once before writing anything, once as final verification:
python3 $S/run_tests.py all --coverage --save-as baseline
python3 $S/run_tests.py all --coverage --save-as final

# What is still uncovered (after a --coverage run). --only narrows to given sources:
python3 $S/coverage_gaps.py --threshold 100 --only backend/app/factory.py frontend/src/lib/http.ts
```

`run_tests.py` prints per-area JSON: `status` (`passed` | `failed` | `flaky`), `tests`, `failed_tests`, `coverage.lines_pct`, and `log_tail` on failure. Full logs: `.test-results/<area>/run<N>/output.log`. Exit code ≠ 0 means something failed.

`coverage_gaps.py` lists files worst-first with `uncovered_lines`, `missing_branches` and (frontend) `uncovered_functions`. Read those exact lines in the source before writing tests for them.

## Interpreting failures

1. **Your new test fails** → read `log_tail`, fix the test. Typical causes: wrong mock path in `vi.mock`, missing `await`, fixture misuse, asserting implementation details.
2. **A pre-existing test fails** → find the source change that explains it (`git diff BASE...HEAD -- <source>`). If the PR changed that behaviour on purpose, update the assertion to the new behaviour; if the failure is unrelated to the diff or the intent is unclear, leave the test untouched and report it.
3. **The app code looks wrong** (a test written from the documented/obvious intent fails) → do not edit app code and do not bend the test to the bug. Remove that test case, and record it under *Suspected bugs* in the report with the failing assertion.
4. **`flaky`** → the test depends on time, ordering or shared state. Fix with fake timers, `beforeEach(() => vi.clearAllMocks())`, fresh `QueryClient` per test, or isolated fixtures. Never "fix" with retries.

A run counts as verified only when the final `run_tests.py all --coverage --save-as final` reports `passed` for every area. Note that `coverage_gaps.py` reads the most recent `--coverage` run.
