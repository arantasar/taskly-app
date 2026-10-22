#!/usr/bin/env python3
"""Print a Markdown table comparing .test-results/baseline.json and final.json.

Both files are written by run-tests' `run_tests.py all --coverage --save-as <name>`.
Exit code 1 when final.json is missing or any area did not pass.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], check=True, capture_output=True, text=True).stdout.strip())
RESULTS = ROOT / ".test-results"


def load(name: str) -> dict:
    path = RESULTS / f"{name}.json"
    return json.loads(path.read_text()) if path.exists() else {}


def pct(area: dict | None) -> float | None:
    return (area or {}).get("coverage", {}).get("lines_pct")


def fmt(value: float | None) -> str:
    return "—" if value is None else f"{value:.1f}%"


def main() -> int:
    baseline, final = load("baseline"), load("final")
    if not final:
        print("⚠️ No final verification run found (.test-results/final.json).")
        return 1

    icons = {"passed": "✅ passed", "failed": "❌ failed", "flaky": "⚠️ flaky"}
    rows = ["| Area | Status | Tests (before → after) | Line coverage (before → after) |", "|---|---|---|---|"]
    ok = True
    for area in ("backend", "frontend"):
        after = final.get(area)
        if after is None:
            continue
        before = baseline.get(area, {})
        ok &= after["status"] == "passed"
        b, a = pct(before), pct(after)
        delta = f" ({a - b:+.1f} pp)" if a is not None and b is not None else ""
        rows.append(
            f"| {area} | {icons.get(after['status'], after['status'])} "
            f"| {before.get('tests', '—')} → {after['tests']} | {fmt(b)} → {fmt(a)}{delta} |"
        )
        for test in after.get("failed_tests", []):
            rows.append(f"| | ↳ `{test}` | | |")
    print("\n".join(rows))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
