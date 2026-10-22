#!/usr/bin/env python3
"""Compose the pull-request comment for the unit-test agent workflow.

Usage: compose_comment.py RESULTS_DIR

RESULTS_DIR may contain (all optional, written by the workflow):
  scope.json        test_scope.py output
  agent-report.md   the agent's own report
  verify.json       independent re-run by the workflow (run_tests.py --save-as verify)
  status.env        KEY=VALUE lines: AGENT_OUTCOME, GUARD, COMMIT, HEAD_SHA, RUN_URL

Prints Markdown to stdout. The first line is a hidden marker used to find and
update the same comment on later runs instead of posting new ones.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

MARKER = "<!-- unit-test-agent -->"
MAX_REPORT = 50_000  # GitHub comments are capped at 65,536 characters


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


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
    scope = read_json(results / "scope.json").get("summary", {})
    verify = read_json(results / "verify.json")
    status = read_status(results / "status.env")
    report_path = results / "agent-report.md"
    report = report_path.read_text() if report_path.exists() else ""

    head = status.get("HEAD_SHA", "")[:7]
    run_url = status.get("RUN_URL", "")
    agent = status.get("AGENT_OUTCOME", "skipped")
    guard = status.get("GUARD", "skipped")
    commit = status.get("COMMIT", "")
    verified = bool(verify) and all(v.get("status") == "passed" for v in verify.values())

    out = [MARKER]
    if scope and scope.get("testable", 0) == 0:
        out += [
            "## 🧪 Unit test agent",
            "",
            f"ℹ️ **No test changes needed** for `{head}`: the diff contains no testable "
            "application code (only declarative files, design-system primitives, tests, docs or config). "
            "The agent was not started.",
        ]
    else:
        if guard == "failed":
            outcome = "⛔ **Discarded**: the agent changed files outside the test allowlist. Nothing was committed."
        elif not verified:
            outcome = "⚠️ **Not committed**: the independent test run did not pass (see below)."
        elif commit:
            outcome = f"✅ **Committed** verified test changes in {commit}."
        else:
            outcome = "ℹ️ **No test changes** were needed or produced."
        if agent not in ("success", "skipped"):
            outcome += f" The agent run ended with `{agent}`."
        if report:
            out += [outcome, "", report[:MAX_REPORT].rstrip(), ""]
        else:
            out += ["## 🧪 Unit test agent", "", outcome, "", "_The agent did not produce a report._", ""]
        if verify:
            out += [
                "<details><summary>Independent verification by the workflow (not by the agent)</summary>",
                "",
                verification_table(verify),
                "",
                f"Allowlist check: **{guard}**",
                "</details>",
            ]

    out += ["", f"<sub>Unit test agent · commit `{head}` · [workflow run]({run_url})</sub>"]
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
