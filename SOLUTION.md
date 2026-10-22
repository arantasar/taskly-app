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
| `.claude/skills/test-report/` | Report template and `coverage_delta.py` (before/after table from recorded results) |
| `.claude/hooks/test_paths_guard.py` | One allowlist of what the agent may change: `hook` mode blocks tool calls; `check` mode verifies a working tree |
| `.github/workflows/unit-test-agent.yml` | The PR workflow |
| `.github/scripts/compose_comment.py` | Builds the single PR comment |

## How it runs

```
pull_request (same repo, not draft, backend/** or frontend/src/** changed)
│
├─ scope      read-only, no secrets
│    test_scope.py BASE...HEAD → testable == 0 ? skip the agent
│
├─ generate   contents: read + CLAUDE_CODE_OAUTH_TOKEN (agent step only)
│    install locked deps (npm ci --ignore-scripts)
│    claude --agent unit-test-engineer   (claude-code-base-action, allowlisted tools, max turns)
│       baseline → scope & decide → write/update tests → verify (--repeat 3, typecheck, prettier,
│       full suite + coverage) → report
│    guard check (only test files changed?)
│    independent full test run by the workflow, not the agent
│    export agent.patch + report + results as an artifact
│
└─ publish    contents: write, pull-requests: write, no model, no PR code executed
     guard from the BASE branch re-checks the patch
     commit only if verification passed and the branch has not moved
     upsert one PR comment (report + independent results + run link)
```

The agent is also usable locally:

```sh
claude -p --agent unit-test-engineer "Coverage mode: raise unit-test coverage for the whole repository."
claude -p --agent unit-test-engineer "Change mode: create or update unit tests for the changes between main and HEAD."
```

### Prerequisites
1. **Actions enabled** in the repository. Forks have them disabled by default: Actions tab → enable.
2. Repository secret **`CLAUDE_CODE_OAUTH_TOKEN`** (generate with `claude setup-token`, Claude subscription). To use API billing instead, switch the input to `anthropic_api_key`.
3. Optional repository variable `TEST_AGENT_MODEL` (default `claude-opus-5-5`).
4. Pull requests must target this repository's `main`. For a fork, GitHub proposes the upstream repository as the base by default.

## Main decisions

- **Claude Code subagent + skills as plain files.** They are versioned, reviewed with the code and run identically locally and in CI (`--agent`). Skills are preloaded through the agent's `skills:` field, so the agent does not have to discover them.
- **Scripts for facts, the model for judgement.** File classification, test execution, coverage gaps and the before/after table are deterministic scripts. The model decides *whether* and *what* to test and writes the tests. Numbers in the report come from result files, not from the model's memory.
- **Least privilege by job separation.** The job with the model credential cannot push. The job that can push never runs the model or code from the PR, and uses guard and comment scripts from the base branch. A prompt-injected agent can at worst produce a patch, and that patch is rejected unless it contains only test files and passes tests.
- **Defence in depth for "tests only":** tool-level hook (blocks writes and risky Bash during the run), `--allowedTools` allowlist, post-run `check`, then a re-check in `publish` with the trusted guard.
- **No untrusted text in the prompt.** The PR title, body and comments are not passed to the agent. Code and diffs are treated as data ("Untrusted input" rule).
- **Reliability.** Every new test must pass 3 runs in a row (flakiness), plus typecheck and formatting. The workflow re-runs the full suites itself and commits nothing that is red. A per-PR concurrency group cancels stale runs. A push happens only if the branch head is still the analysed commit. Commits made with `GITHUB_TOKEN` do not retrigger workflows, so the bot cannot loop.
- **"No tests needed" is a valid result.** Declarative files (schemas, models, types, query keys), design-system primitives (covered by Storybook) and refactors keep existing tests. The `scope` job skips the agent entirely when nothing is testable, which costs no tokens.
- **Supply chain.** Third-party actions are pinned to commit SHAs. Dependencies are installed from lockfiles without install scripts.

## Example run

_To be completed after the demo pull request runs on GitHub._

A local dry run on the same change (overdue counter, `main...feature/overdue-counter`):
- The agent classified 13 changed files. It tested new code (stats endpoint, repository query, API client, hook, header badge, `localIsoDate`) and skipped declarative files.
- It **updated** 14 existing tests broken by intended behaviour changes (factory route list, `TodosPage` with a new hook) without loosening assertions.
- Result: backend 56 → 62 tests, frontend 113 → 129 tests, changed files at 100% line coverage, all verified. About 3 minutes.

## Assumptions
- Pull requests come from collaborators with write access. Fork PRs are skipped, because they cannot safely receive secrets.
- "Unit test" means no database or network: the backend uses a mocked repository/session, the frontend uses mocked hooks and HTTP.
- 100% line coverage is a side effect, not a goal. The agent is told to stop at observable behaviour (one unreachable guard stays uncovered, and the agent says why).

## Limitations
- The quality of the tests depends on the model. Tests are verified to run and pass, not proven meaningful. Human review of the bot commit is still expected.
- No mutation testing. A test that executes code without asserting enough would not be caught automatically.
- Fork PRs get no tests. Very large diffs may hit the turn limit; the comment then reports a partial or unverified run.
- The Bash allowlist and the hook are pattern-based. They reduce risk but are not a sandbox; the hard boundary is the job separation.
- With a subscription token, runs consume the plan's usage limits, and `--max-budget-usd` is not a real cost cap. The turn limit and job timeout are the cost guards.

## For production
- Run the agent job in a network-restricted sandbox (egress only to the model API), on ephemeral runners.
- Use a GitHub App identity with signed commits instead of `github-actions[bot]`, and require human approval before the bot commit merges.
- Add mutation testing (mutmut / Stryker) on changed files to measure test strength, and feed surviving mutants back to the agent.
- Run a cheaper model for scoping and small diffs, and the strongest model only for large changes. Track cost, duration and outcome per run.
- Support fork PRs with a `workflow_run`-based two-stage design (unprivileged generate, privileged publish).
- Add an eval suite of seeded PRs (new feature, refactor, intentional behaviour change, injected instructions, bug in source) to regression-test agent and skill changes.
