---
name: test-report
description: Write the final unit-test agent report (decisions, tests added/updated, verified results, coverage delta, suspected bugs) to .test-results/agent-report.md, in a format suitable for a pull-request comment. Use as the last step of every test-generation run, including runs that decide no tests are needed.
allowed-tools: Read, Write, Bash(python3 .claude/skills/test-report/scripts/coverage_delta.py:*), Bash(git status:*), Bash(git diff:*)
---

# Test report

The report is the agent's only output that humans read — it must be **truthful and checkable**. Every number comes from files the scripts wrote, never from memory.

## Steps
1. Get the verified numbers:
   ```sh
   python3 .claude/skills/test-report/scripts/coverage_delta.py
   ```
   It reads `.test-results/baseline.json` and `.test-results/final.json` and prints a Markdown results table. If `final.json` is missing or any area is not `passed`, the run is **not verified** — say so in the verdict.
2. List the test files you changed: `git status --porcelain -- backend/tests frontend/src`.
3. Fill `template.md` (same folder) and write it to `.test-results/agent-report.md`. Keep it under ~60 lines; link files with repo-relative paths.

## Rules
- Verdict line, exactly one of:
  - `✅ Tests added/updated and verified`
  - `ℹ️ No test changes needed` (with the reason)
  - `⚠️ Tests could not be fully verified` (with what failed)
- One row per analysed source file in *Decisions*, including skipped ones with the reason (declarative, refactor-only, design-system…).
- *Suspected bugs*: only behaviour you could demonstrate with a failing assertion; quote it. Omit the section if empty.
- Do not paste whole test files or logs; the diff/commit carries the code.
- Never include secrets, environment variables or absolute machine paths.
