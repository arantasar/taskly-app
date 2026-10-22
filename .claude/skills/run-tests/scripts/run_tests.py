#!/usr/bin/env python3
"""Run backend (pytest) and/or frontend (vitest) unit tests and summarise them.

Usage:
  run_tests.py {backend|frontend|all} [--coverage] [--repeat N] [TEST_PATH ...]

  TEST_PATH   repo-relative test files to run (e.g. backend/tests/test_factory.py,
              frontend/src/lib/http.test.ts); omit to run the whole suite.
  --coverage  collect coverage (only meaningful for a whole-suite run).
  --repeat N  run the selection N times; any failure marks it flaky/failed.
  --save-as NAME  also store the printed summary as .test-results/NAME.json.

Writes .test-results/<area>.json (+ raw logs) under the repo root and prints a
compact JSON summary. Exit code is non-zero if any selected run failed.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], check=True, capture_output=True, text=True).stdout.strip())
OUT = ROOT / ".test-results"
LOG_TAIL = 80


def python_bin() -> str:
    venv = ROOT / "backend/.venv/bin/python"
    return str(venv) if venv.exists() else (shutil.which("python3") or "python")


def junit_counts(path: Path) -> dict:
    if not path.exists():
        return {"tests": 0, "failures": 0, "errors": 0, "skipped": 0, "failed_tests": []}
    root = ET.parse(path).getroot()
    suites = [root] if root.tag == "testsuite" else list(root.iter("testsuite"))
    counts = {k: sum(int(s.get(k, 0)) for s in suites) for k in ("tests", "failures", "errors", "skipped")}
    failed = []
    for case in root.iter("testcase"):
        if case.find("failure") is not None or case.find("error") is not None:
            failed.append(f"{case.get('classname', '')}::{case.get('name', '')}".strip(":"))
    counts["failed_tests"] = failed
    return counts


def to_area_paths(area: str, paths: list[str]) -> list[str]:
    prefix = f"{area}/"
    selected = [p for p in paths if p.startswith(prefix)]
    return [p[len(prefix):] for p in selected]


def run_backend(paths: list[str], coverage: bool, run_dir: Path) -> tuple[int, dict]:
    junit = run_dir / "backend-junit.xml"
    cmd = [python_bin(), "-m", "pytest", "-q", "-p", "no:cacheprovider", f"--junitxml={junit}"]
    cov_json = run_dir / "backend-coverage.json"
    if coverage:
        cmd += ["--cov=app", "--cov-branch", f"--cov-report=json:{cov_json}", "--cov-report=term"]
    cmd += paths
    proc = subprocess.run(cmd, cwd=ROOT / "backend", capture_output=True, text=True)
    info = {"command": " ".join(cmd[1:]), **junit_counts(junit)}
    if coverage and cov_json.exists():
        totals = json.loads(cov_json.read_text())["totals"]
        info["coverage"] = {"lines_pct": round(totals["percent_covered"], 2), "report": str(cov_json.relative_to(ROOT))}
    return proc.returncode, info | {"log": proc.stdout + proc.stderr}


def run_frontend(paths: list[str], coverage: bool, run_dir: Path) -> tuple[int, dict]:
    junit = run_dir / "frontend-junit.xml"
    cmd = ["npx", "vitest", "run", "--reporter=default", "--reporter=junit", f"--outputFile.junit={junit}"]
    cov_dir = run_dir / "frontend-coverage"
    if coverage:
        cmd += ["--coverage", f"--coverage.reportsDirectory={cov_dir}",
                "--coverage.reporter=json", "--coverage.reporter=json-summary", "--coverage.reporter=text-summary"]
    cmd += paths
    env = {**os.environ, "CI": "1", "FORCE_COLOR": "0"}
    proc = subprocess.run(cmd, cwd=ROOT / "frontend", capture_output=True, text=True, env=env)
    info = {"command": " ".join(cmd), **junit_counts(junit)}
    summary = cov_dir / "coverage-summary.json"
    if coverage and summary.exists():
        total = json.loads(summary.read_text())["total"]
        info["coverage"] = {
            "lines_pct": total["lines"]["pct"],
            "branches_pct": total["branches"]["pct"],
            "report": str((cov_dir / "coverage-final.json").relative_to(ROOT)),
        }
    return proc.returncode, info | {"log": proc.stdout + proc.stderr}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("area", choices=["backend", "frontend", "all"])
    parser.add_argument("paths", nargs="*")
    parser.add_argument("--coverage", action="store_true")
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--save-as", help="also write the summary to .test-results/<NAME>.json (e.g. baseline, final)")
    args = parser.parse_args()

    OUT.mkdir(exist_ok=True)
    areas = ["backend", "frontend"] if args.area == "all" else [args.area]
    runners = {"backend": run_backend, "frontend": run_frontend}
    overall = 0
    summary = {}

    for area in areas:
        paths = to_area_paths(area, args.paths)
        if args.paths and not paths:
            continue  # explicit selection contains nothing for this area
        runs = []
        for i in range(args.repeat):
            run_dir = OUT / area / f"run{i + 1}"
            shutil.rmtree(run_dir, ignore_errors=True)
            run_dir.mkdir(parents=True)
            code, info = runners[area](paths, args.coverage and i == 0, run_dir)
            log = info.pop("log")
            (run_dir / "output.log").write_text(log)
            info["exit_code"] = code
            if code != 0:
                info["log_tail"] = "\n".join(log.splitlines()[-LOG_TAIL:])
            runs.append(info)
        failed_runs = sum(r["exit_code"] != 0 for r in runs)
        status = "passed" if failed_runs == 0 else ("flaky" if failed_runs < len(runs) else "failed")
        result = {"status": status, "selection": paths or "full suite", "repeat": args.repeat, "runs": runs}
        (OUT / f"{area}.json").write_text(json.dumps(result, indent=2))
        summary[area] = {
            "status": status,
            "tests": runs[0]["tests"],
            "failed_tests": sorted({t for r in runs for t in r["failed_tests"]}),
            **({"coverage": runs[0]["coverage"]} if "coverage" in runs[0] else {}),
            **({"log_tail": next(r["log_tail"] for r in runs if "log_tail" in r)} if failed_runs else {}),
        }
        overall |= failed_runs != 0

    print(json.dumps(summary, indent=2))
    if args.save_as:
        (OUT / f"{args.save_as}.json").write_text(json.dumps(summary, indent=2))
    return int(overall)


if __name__ == "__main__":
    sys.exit(main())
