#!/usr/bin/env python3
"""Single source of truth for what the unit-test agent may change.

Modes:
  test_paths_guard.py hook      PreToolUse hook for file tools: reads the tool call JSON
                                on stdin, exits 2 (blocking) for writes outside the
                                allowlist. Which Bash commands may run is decided by
                                the allowedTools list the agent is started with.
  test_paths_guard.py check     Post-run check: fails (exit 1) if the working tree of
                                the repository containing the current directory has
                                changes outside the allowlist. Used by CI before
                                anything is committed, independent of the agent.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from fnmatch import fnmatch
from pathlib import Path

ALLOWED = [
    "backend/tests/*.py",
    "backend/tests/**/*.py",
    "frontend/src/**/*.test.ts",
    "frontend/src/**/*.test.tsx",
    "frontend/src/*.test.ts",
    "frontend/src/*.test.tsx",
    "frontend/src/test/*",
    "frontend/src/design-system/mocks.tsx",
    ".test-results/*",
    ".test-results/**",
]


def root(prefer_env: bool = True) -> Path:
    project = os.environ.get("CLAUDE_PROJECT_DIR")
    if prefer_env and project:
        return Path(project).resolve()
    out = subprocess.run(["git", "rev-parse", "--show-toplevel"], check=True, capture_output=True, text=True)
    return Path(out.stdout.strip()).resolve()


def is_allowed(path: str, base: Path) -> bool:
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = base / candidate
    try:
        rel = candidate.resolve().relative_to(base).as_posix()
    except ValueError:
        return False  # outside the repository
    return any(fnmatch(rel, pattern) for pattern in ALLOWED)


def hook() -> int:
    call = json.load(sys.stdin)
    tool = call.get("tool_name", "")
    params = call.get("tool_input", {}) or {}
    base = root()

    if tool in {"Write", "Edit", "MultiEdit", "NotebookEdit"}:
        path = params.get("file_path") or params.get("notebook_path") or ""
        if not is_allowed(path, base):
            print(
                f"Blocked: the unit-test agent may only change test files "
                f"(backend/tests/**, frontend/src/**/*.test.ts(x), frontend/src/test/**, "
                f"frontend/src/design-system/mocks.tsx). Refused: {path}. "
                f"If application code looks wrong, report it as a suspected bug instead.",
                file=sys.stderr,
            )
            return 2
    return 0


def check() -> int:
    # Always the repository of the working directory: CI runs a trusted copy of
    # this script against a separate checkout of the pull request.
    base = root(prefer_env=False)
    out = subprocess.run(
        ["git", "status", "--porcelain", "--untracked-files=all"],
        cwd=base, check=True, capture_output=True, text=True,
    ).stdout
    violations = []
    for line in out.splitlines():
        path = line[3:].split(" -> ")[-1].strip('"')
        if not is_allowed(path, base):
            violations.append(f"{line[:2].strip()} {path}")
    if violations:
        print("Changes outside the test allowlist:\n  " + "\n  ".join(violations), file=sys.stderr)
        return 1
    print("OK: only test files changed.")
    return 0


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "hook":
        sys.exit(hook())
    if mode == "check":
        sys.exit(check())
    print(__doc__, file=sys.stderr)
    sys.exit(64)
