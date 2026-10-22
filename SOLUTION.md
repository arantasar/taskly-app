# Solution: unit-test agent and PR workflow

A Claude Code agent (`unit-test-engineer`) with five reusable skills writes and updates unit tests for the FastAPI backend and React frontend. It was used once locally to raise coverage and runs automatically on every pull request through a GitHub Actions workflow.

| | Tests | Line coverage |
|---|---|---|
| Backend, before → after | 21 → 56 | 42% → 100% |
| Frontend, before → after | 18 → 113 | 48% → 100% (branches 44% → 99%) |

## Where things are

| Path | What it is |
|---|---|
| `.claude/agents/unit-test-engineer.md` | The custom agent: role, five-step workflow, hard rules, preloaded skills, scoped `PreToolUse` hook |
| `.claude/skills/test-scope/` | Maps a diff to testable files and expected test files (`test_scope.py`); decision rules for "test / update / skip" |
| `.claude/skills/backend-unit-tests/` | pytest conventions of this repo: fixtures, mocked repository, per-layer patterns |
| `.claude/skills/frontend-unit-tests/` | Vitest + Testing Library conventions: design-system mocks, hook/child mocking, React Query patterns |
| `.claude/skills/run-tests/` | `run_tests.py` (both stacks, coverage, `--repeat` flakiness check, JSON results) and `coverage_gaps.py` (uncovered lines/branches) |
| `.claude/skills/test-report/` | Report template: verdict, per-file decisions, how the tests were verified, suspected bugs |
| `.claude/hooks/test_paths_guard.py` | One allowlist of what the agent may change: `hook` mode blocks file writes outside it during the run; `check` mode verifies a working tree |
| `.github/workflows/unit-test-agent.yml` | The PR workflow |
| `.github/scripts/compose_comment.py` | Builds the single PR comment |

## How it runs

```
pull_request (same repo, not draft, backend/** or frontend/src/** changed)
│
├─ generate   contents: read + CLAUDE_CODE_OAUTH_TOKEN (agent step only)
│    test_scope.py BASE...HEAD → testable == 0 ? skip every following step
│    install locked deps (npm ci --ignore-scripts), bubblewrap for the sandbox
│    claude --agent unit-test-engineer   (claude-code-action/base-action, Sonnet, allowlisted
│       tools, max turns; agent subprocesses sandboxed with credentials scrubbed)
│       baseline → scope & decide → write/update tests → verify (--repeat 3, typecheck, prettier,
│       full suite) → report of decisions
│    independent full test run with coverage in a clean worktree (PR head + agent's patch)
│    export agent.patch + report + results as an artifact
│
└─ publish    contents: write, pull-requests: write, no model, no PR code executed
     guard from the BASE branch checks the patch (only test files?)
     commit only if verification passed and the branch has not moved
     upsert one PR comment (outcome + agent's decisions + independent results)
```

The agent is also usable locally:

```sh
claude -p --agent unit-test-engineer "Coverage mode: raise unit-test coverage for the whole repository."
claude -p --agent unit-test-engineer "Change mode: create or update unit tests for the changes between main and HEAD."
```

### Prerequisites
1. **Actions enabled** in the repository. Forks have them disabled by default: Actions tab → enable.
2. Repository secret **`CLAUDE_CODE_OAUTH_TOKEN`** (generate with `claude setup-token`, Claude subscription). To use API billing instead, switch the input to `anthropic_api_key`.
3. Optional repository variable `TEST_AGENT_MODEL` (default `claude-sonnet-5-5`).
4. Pull requests must target this repository's `main`. For a fork, GitHub proposes the upstream repository as the base by default.

## Main decisions

- **Claude Code subagent + skills as plain files.** They are versioned, reviewed with the code and run identically locally and in CI (`--agent`). Skills are preloaded through the agent's `skills:` field, so the agent does not have to discover them.
- **Scripts for facts, the model for judgement.** File classification, test execution and coverage gaps are deterministic scripts. The model decides *whether* and *what* to test, writes the tests and explains its decisions. The numbers in the PR come only from the workflow's own test run, never from the model.
- **Least privilege by job separation.** The job with the model credential cannot push. The job that can push never runs the model or code from the PR, and uses guard and comment scripts from the base branch. A prompt-injected agent can at worst produce a patch, and that patch is rejected unless it contains only test files and passes tests.
- **"Tests only", enforced twice:** during the run, the hook refuses file writes outside test paths and `--allowedTools` limits Bash to test, diff and format commands. After the run, `publish` applies the patch and checks it with the guard from the base branch. That check is the binding one, because the PR cannot change it.
- **No untrusted text in the prompt.** The PR title, body and comments are not passed to the agent. Code and diffs are treated as data ("Untrusted input" rule).
- **Credentials kept away from agent-run tools.** `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` strips the OAuth token from every command the agent runs and executes them in a bubblewrap sandbox. That sandbox masks missing package-manager files with an empty placeholder, and an empty root `package.json` breaks Vite's config loading. So the workflow creates a git-excluded `{ "private": true }` root manifest before the agent starts, and the sandbox mounts it read-only. This was reproduced and validated locally with `@anthropic-ai/sandbox-runtime` before changing CI.
- **Reliability.** Every new test must pass 3 runs in a row (flakiness), plus typecheck and formatting. The workflow re-runs the full suites itself in a fresh worktree (PR head plus the agent's patch), so nothing left in the agent's workspace can affect the verdict, and it commits nothing that is red. A per-PR concurrency group cancels stale runs. A push happens only if the branch head is still the analysed commit. The bot's commit carries `[skip ci]`, so GitHub creates no run for it. As a second layer, the workflow skips any run whose actor is `github-actions[bot]`, even if someone approves or re-runs it. So the bot can neither loop nor overwrite its report.
- **One report, one place.** The PR comment is the result: the outcome, the agent's decisions and one table of independently measured numbers. The `publish` job's summary is the same Markdown, and the artifact holds the raw logs for debugging.
- **"No tests needed" is a valid result.** Declarative files (schemas, models, types, query keys), design-system primitives (covered by Storybook) and refactors keep existing tests. When nothing is testable, the first step of `generate` skips the rest of the job, so no dependencies are installed and no tokens are spent.
- **Kept simple on purpose.** Two jobs, because the credential/write split is the security boundary; anything more was folded in. The agent does not measure coverage before and after for the report, because the workflow measures it anyway.
- **Supply chain.** Third-party actions are pinned to commit SHAs. Dependencies are installed from lockfiles without install scripts.
- **Model.** Sonnet by default. The skills and scripts carry most of the repository knowledge, so a cheaper model produces the same decisions as Opus did in the local dry run. Opus can be selected per repository through `TEST_AGENT_MODEL`.

## Example run

**Pull request [#2 "Add overdue task counter"](https://github.com/arantasar/taskly-app/pull/2)** adds a feature across both stacks and deliberately ships no tests: a `GET /api/todos/stats` endpoint with an aggregate query, and an overdue badge in the header fed by a new query hook, with mutations invalidating it. The change also breaks 14 existing tests on purpose (the factory's route list, and `TodosPage` rendering a new hook).

| Job | Time | What happened |
|---|---|---|
| `generate` | 3 min 30 s | Scope: 13 changed files → 10 testable sources (backend 2, frontend 8), 3 declarative → agent (Sonnet) runs; clean-worktree verification passed |
| `publish` | 10 s | Base-branch guard passed (only test files); bot commit `test: add/update unit tests for d76c368 [skip ci]`; PR comment posted. No run was created for the bot's commit |

**Agent decisions** (from its report in the PR comment):
- **Added tests**:
  - backend: repository `stats()` (counts, SQL with the overdue date bound); the `/stats` route (client date, today by default, 422 for an invalid date, not captured by `/{todo_id}`);
  - frontend: `todosApi.stats` (URL and abort signal), `useTodoStatsQuery` (local date, cache, error), stats invalidation in the three mutation hooks (only on success), the header badge (hidden at 0, singular, plural), `TodosPage` forwarding `overdue`, `localIsoDate`.
- **Updated tests** broken by the intended change: the factory's expected route list, and `TodosPage` (mocked the new hook, which fixed 13 failures). No assertions were loosened.
- **Skipped**: `schemas.py`, `types.ts`, `queryKeys.ts` (declarative), and the `isOverdue` refactor (already covered).
- **Its verification**: changed tests passed 3×; full suite passed (backend 60, frontend 127); typecheck and prettier clean.

**Skills used:**
- `run-tests` for the baseline, the 3× repeat and the final full suite;
- `test-scope` for the file map;
- `backend-unit-tests` and `frontend-unit-tests` for the conventions;
- `test-report` for the report.

**Results** (the table in the PR comment, measured by the workflow in a clean checkout):

| Area | Tests on the PR before the agent | After | Line coverage after |
|---|---|---|---|
| Backend | 56 (1 failing) | ✅ 60 passed | 100% |
| Frontend | 113 (13 failing) | ✅ 127 passed | 100% |

Getting here took several earlier runs, and each problem was caught by the safeguards:
1. A wrong action version made the agent fail to start. Nothing was committed.
2. A missing bubblewrap install stopped the agent before it ran. Nothing was committed.
3. The sandbox placeholder `package.json` stopped the frontend tests from running. The agent reported "could not be fully verified" instead of claiming success.
4. An approved re-run on the bot's own commit overwrote the report.

These led to the clean-worktree verification, the sandbox fix, and the `[skip ci]` plus actor guard described above.

## Assumptions
- Pull requests come from collaborators with write access. Fork PRs are skipped, because they cannot safely receive secrets.
- "Unit test" means no database or network: the backend uses a mocked repository/session, the frontend uses mocked hooks and HTTP.
- 100% line coverage is a side effect, not a goal. The agent is told to stop at observable behaviour (one unreachable guard stays uncovered, and the agent says why).

## Limitations
- The quality of the tests depends on the model. Tests are verified to run and pass, not proven meaningful. Human review of the bot commit is still expected.
- No mutation testing. A test that executes code without asserting enough would not be caught automatically.
- Fork PRs get no tests. Very large diffs may hit the turn limit; the comment then reports a partial or unverified run.
- The Bash allowlist and the hook are pattern-based. Agent subprocesses run in the Claude Code sandbox with credentials scrubbed, but the hard boundary is still the job separation.
- Date-dependent tests depend on the model following the skill. In earlier runs one router test compared against a single `date.today()` read, which could fail at midnight. In the final run the agent bracketed the call between two reads, as the backend skill suggests. Only a lint rule would guarantee it.
- With a subscription token, runs consume the plan's usage limits, and `--max-budget-usd` is not a real cost cap. The turn limit and job timeout are the cost guards.

## For production
- Run the agent job in a network-restricted sandbox (egress only to the model API), on ephemeral runners.
- Use a GitHub App identity with signed commits instead of `github-actions[bot]`, and require human approval before the bot commit merges.
- Add mutation testing (mutmut / Stryker) on changed files to measure test strength, and feed surviving mutants back to the agent.
- Pick the model by diff size and risk (for example Haiku for trivial diffs, Opus for large or cross-cutting ones). Track cost, duration and outcome per run.
- Support fork PRs with a `workflow_run`-based two-stage design (unprivileged generate, privileged publish).
- Add an eval suite of seeded PRs (new feature, refactor, intentional behaviour change, injected instructions, bug in source) to regression-test agent and skill changes.
