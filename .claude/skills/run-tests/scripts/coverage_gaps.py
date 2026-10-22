#!/usr/bin/env python3
"""List files below a coverage threshold with their uncovered lines.

Usage: coverage_gaps.py [--threshold PCT] [--only PATH ...]

Reads the reports written by `run_tests.py ... --coverage`:
  .test-results/backend/run1/backend-coverage.json        (coverage.py JSON)
  .test-results/frontend/run1/frontend-coverage/coverage-final.json  (istanbul)
Prints JSON: one entry per file, worst coverage first. --only restricts the
output to the given repo-relative source paths (e.g. files changed in a PR).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], check=True, capture_output=True, text=True).stdout.strip())
BACKEND = ROOT / ".test-results/backend/run1/backend-coverage.json"
FRONTEND = ROOT / ".test-results/frontend/run1/frontend-coverage/coverage-final.json"


def ranges(lines: list[int]) -> str:
    out, start, prev = [], None, None
    for n in sorted(set(lines)):
        if start is None:
            start = prev = n
        elif n == prev + 1:
            prev = n
        else:
            out.append(f"{start}-{prev}" if start != prev else str(start))
            start = prev = n
    if start is not None:
        out.append(f"{start}-{prev}" if start != prev else str(start))
    return ",".join(out)


def backend_files() -> list[dict]:
    if not BACKEND.exists():
        return []
    data = json.loads(BACKEND.read_text())
    files = []
    for name, f in data["files"].items():
        s = f["summary"]
        partial = [f"{a}->{b}" for a, b in f.get("missing_branches", [])]
        files.append({
            "path": f"backend/{name}",
            "lines_pct": round(s["percent_covered"], 1),
            "uncovered_lines": ranges(f["missing_lines"]),
            "missing_branches": partial,
        })
    return files


def frontend_files() -> list[dict]:
    if not FRONTEND.exists():
        return []
    data = json.loads(FRONTEND.read_text())
    files = []
    for abs_path, f in data.items():
        stmts = f["statementMap"]
        total = len(f["s"]) or 1
        uncovered = [stmts[k]["start"]["line"] for k, hits in f["s"].items() if hits == 0]
        missing_branches = []
        for k, hits in f["b"].items():
            if 0 in hits:
                line = f["branchMap"][k]["loc"]["start"]["line"]
                missing_branches.append(f"line {line} ({hits.count(0)}/{len(hits)} paths untaken)")
        uncovered_fns = [f["fnMap"][k]["name"] for k, hits in f["f"].items() if hits == 0]
        files.append({
            "path": str(Path(abs_path).resolve().relative_to(ROOT)),
            "lines_pct": round(100 * (total - len(uncovered)) / total, 1),
            "uncovered_lines": ranges(uncovered),
            "missing_branches": missing_branches,
            "uncovered_functions": uncovered_fns,
        })
    return files


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--threshold", type=float, default=100.0)
    parser.add_argument("--only", nargs="*")
    args = parser.parse_args()

    files = backend_files() + frontend_files()
    if not files:
        print("No coverage reports found. Run run_tests.py <area> --coverage first.", file=sys.stderr)
        return 1
    if args.only:
        wanted = set(args.only)
        files = [f for f in files if f["path"] in wanted]
    gaps = [f for f in files if f["lines_pct"] < args.threshold or f["missing_branches"]]
    gaps.sort(key=lambda f: f["lines_pct"])
    print(json.dumps(gaps, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
