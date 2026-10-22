#!/usr/bin/env python3
"""Classify changed files and map each testable source file to its unit test.

Usage: test_scope.py [BASE_REF] [HEAD_REF]
  BASE_REF defaults to origin/main, HEAD_REF to HEAD. The diff is BASE...HEAD
  (changes introduced on the branch since it forked from BASE).
  With --files a b c, the given paths are classified instead of a git diff.

Prints JSON to stdout. Exit code 0 even when nothing is testable; consumers
read "summary.testable" to decide whether to run the agent at all.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import PurePosixPath

# Mirrors the coverage "omit"/"exclude" lists in backend/pyproject.toml and
# frontend/vite.config.ts: declarative code that unit tests should not target.
BACKEND_DECLARATIVE = {"__init__.py", "main.py", "schemas.py", "models.py", "types.py", "constants.py"}
FRONTEND_DECLARATIVE_NAMES = {"types.ts", "index.ts", "queryKeys.ts", "queryClient.ts", "main.tsx"}
FRONTEND_DECLARATIVE_SUFFIXES = (".types.ts", ".constants.ts", "constants.ts", "constants.tsx", ".d.ts")


def git(*args: str) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def changed_files(base: str, head: str) -> list[dict]:
    out = git("diff", "--name-status", "--find-renames", f"{base}...{head}")
    files = []
    for line in out.splitlines():
        parts = line.split("\t")
        status = parts[0][0]
        path = parts[-1]
        files.append({"path": path, "status": {"A": "added", "M": "modified", "D": "deleted", "R": "renamed"}.get(status, status)})
    return files


def classify(path: str) -> dict:
    p = PurePosixPath(path)
    parts = p.parts

    if parts[:2] == ("backend", "app") and p.suffix == ".py":
        rel = PurePosixPath(*parts[2:])
        test = str(PurePosixPath("backend/tests", rel.parent, f"test_{rel.name}"))
        if p.name in BACKEND_DECLARATIVE:
            return {"area": "backend", "kind": "declarative", "test_file": None}
        return {"area": "backend", "kind": "source", "test_file": test}

    if parts[:2] == ("backend", "tests") and p.suffix == ".py":
        return {"area": "backend", "kind": "test", "test_file": None}

    if parts[:2] == ("frontend", "src") and p.suffix in {".ts", ".tsx"}:
        name = p.name
        if ".test." in name:
            return {"area": "frontend", "kind": "test", "test_file": None}
        if parts[2:3] == ("test",):
            return {"area": "frontend", "kind": "test-support", "test_file": None}
        if ".stories." in name or parts[2:3] == ("design-system",):
            # Design-system primitives are verified through Storybook stories
            # and replaced by design-system/mocks.tsx in unit tests.
            return {"area": "frontend", "kind": "design-system", "test_file": None}
        if name in FRONTEND_DECLARATIVE_NAMES or name.endswith(FRONTEND_DECLARATIVE_SUFFIXES):
            return {"area": "frontend", "kind": "declarative", "test_file": None}
        test = str(p.with_name(f"{p.stem}.test{p.suffix}"))
        return {"area": "frontend", "kind": "source", "test_file": test}

    return {"area": "other", "kind": "other", "test_file": None}


def main(argv: list[str]) -> int:
    os.chdir(git("rev-parse", "--show-toplevel").strip())
    if argv[:1] == ["--files"]:
        files = [{"path": f, "status": "given"} for f in argv[1:]]
        base, head = None, None
    else:
        base = argv[0] if len(argv) > 0 else "origin/main"
        head = argv[1] if len(argv) > 1 else "HEAD"
        files = changed_files(base, head)

    results = []
    for f in files:
        info = {**f, **classify(f["path"])}
        if info["test_file"]:
            info["test_exists"] = os.path.exists(info["test_file"])
        if info["status"] == "deleted" and info["kind"] == "source":
            info["kind"] = "deleted-source"
        results.append(info)

    testable = [r for r in results if r["kind"] == "source"]
    summary = {
        "base": base,
        "head": head,
        "testable": len(testable),
        "backend_testable": sum(r["area"] == "backend" for r in testable),
        "frontend_testable": sum(r["area"] == "frontend" for r in testable),
        "tests_changed_by_author": [r["path"] for r in results if r["kind"] == "test"],
        "deleted_sources": [r["path"] for r in results if r["kind"] == "deleted-source"],
    }
    json.dump({"summary": summary, "files": results}, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
