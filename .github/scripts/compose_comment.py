#!/usr/bin/env python3
"""Compose the pull-request comment for the unit-test agent workflow.

Usage: compose_comment.py RESULTS_DIR

RESULTS_DIR is the downloaded `agent-results` artifact plus status.env written by
the publish job:
  status.env       KEY=VALUE lines: RESULT, AGENT_OUTCOME, COMMIT, HEAD_SHA, RUN_URL
  agent-report.md  the agent's report (decisions and reasoning)
  verify.json      the workflow's own clean-checkout test run (the only numbers shown)

Prints Markdown. The first line is a hidden marker used to find and update the same
comment on later runs instead of posting new ones.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

MARKER = "<!-- unit-test-agent -->"
MAX_REPORT = 50_000  # GitHub comments are capped at 65,536 characters

OUTCOMES = {
    "no-tests-needed": "ℹ️ **No test changes needed**: the diff contains no testable application code "
    "(only declarative files, design-system primitives, tests, docs or config). The agent was not started.",
    "committed": "✅ **Committed** verified test changes in {commit}.",
    "no-changes": "ℹ️ **No test changes** were needed; the existing tests pass.",
    "unverified": "⚠️ **Not committed**: the independent test run did not pass or produced no results.",
    "discarded": "⛔ **Discarded**: the agent changed files outside the test allowlist. Nothing was committed.",
    "branch-moved": "ℹ️ **Not committed**: the branch received new commits during the run; their run takes over.",
}


def read_status(path: Path) -> dict:
    status = {}
    if path.exists():
        for line in path.read_text().splitlines():
            key, _, value = line.partition("=")
            status[key.strip()] = value.strip()
    return status


def verification_table(verify: dict) -> str:
    icons = {"passed": "✅ passed", "failed": "❌ failed", "flaky": "⚠️ flaky"}
    rows = ["| Area | Status | Tests | Line coverage |", "|---|---|---|---|"]
    for area in ("backend", "frontend"):
        result = verify.get(area)
        if not result:
            continue
        pct = result.get("coverage", {}).get("lines_pct")
        rows.append(
            f"| {area} | {icons.get(result['status'], result['status'])} | {result['tests']} "
            f"| {'—' if pct is None else f'{pct:.1f}%'} |"
        )
        rows += [f"| | ↳ `{test}` | | |" for test in result.get("failed_tests", [])]
    return "\n".join(rows)


def main() -> int:
    results = Path(sys.argv[1])
    status = read_status(results / "status.env")
    report_path, verify_path = results / "agent-report.md", results / "verify.json"
    report = report_path.read_text().strip() if report_path.exists() else ""
    verify = json.loads(verify_path.read_text()) if verify_path.exists() else {}

    result = status.get("RESULT", "unverified")
    outcome = OUTCOMES.get(result, OUTCOMES["unverified"]).format(commit=status.get("COMMIT", ""))
    if result == "committed" and "**Verdict:** ✅" not in report:
        outcome += " The workflow's own run passed, though the agent's verdict below is more cautious."
    agent = status.get("AGENT_OUTCOME", "")
    if agent not in ("", "success", "skipped"):
        outcome += f" The agent run ended with `{agent}`."

    out = [MARKER]
    if not report:
        out += ["## 🧪 Unit test agent", ""]
    out += [outcome, ""]
    if report:
        out += [report[:MAX_REPORT], ""]
    if verify:
        out += ["### Independent verification (clean checkout, run by the workflow)", "", verification_table(verify), ""]

    head = status.get("HEAD_SHA", "")[:7]
    out += [f"<sub>Unit test agent · commit `{head}` · [workflow run]({status.get('RUN_URL', '')})</sub>"]
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
