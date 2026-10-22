---
name: test-report
description: Write the final unit-test agent report (decisions per file, tests added/updated, how they were verified, suspected bugs) to .test-results/agent-report.md, in a format suitable for a pull-request comment. Use as the last step of every test-generation run, including runs that decide no tests are needed.
allowed-tools: Read, Write, Bash(git status:*), Bash(git diff:*)
---

# Test report

The report explains **what you decided and why**. It is the agent's only output that humans read, so it must be truthful and checkable. In CI the workflow re-runs every suite itself and publishes those numbers next to this report, so do not build a results table.

## Steps
1. List the test files you changed: `git status --porcelain -- backend/tests frontend/src`.
2. Fill `template.md` (same folder) and write it to `.test-results/agent-report.md`. Keep it under ~50 lines and link files with repo-relative paths.

## Rules
- Verdict line, exactly one of:
  - `✅ Tests added/updated and verified`: only if your final full-suite run (`run_tests.py all`) passed in every area;
  - `ℹ️ No test changes needed` (with the reason);
  - `⚠️ Tests could not be fully verified` (with what failed or could not run).
- One row per analysed source file in *Decisions*, including skipped ones with the reason (declarative, refactor-only, design-system…).
- *Verification*: one line stating what you ran and its status, e.g. "new/changed tests passed 3×; full suite passed (backend 60, frontend 127); typecheck and prettier clean". Copy counts from the script output, never from memory.
- *Suspected bugs*: only behaviour you could demonstrate with a failing assertion; quote it. Omit the section if empty.
- Do not paste whole test files or logs; the diff carries the code.
- Never include secrets, environment variables or absolute machine paths.
