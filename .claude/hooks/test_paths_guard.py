#!/usr/bin/env python3
"""Single source of truth for what the unit-test agent may change.

Modes:
  test_paths_guard.py hook      PreToolUse hook: reads the tool call JSON on stdin,
                                exits 2 (blocking) for writes outside the allowlist
                                and for forbidden Bash commands.
  test_paths_guard.py check     Post-run check: fails (exit 1) if the working tree
                                has changes outside the allowlist. Used by CI before
                                anything is committed, independent of the agent.
"""

from __future__ import annotations

import json
import os
import re
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

# Side effects the agent must never perform itself: publishing, rewriting
# history, network access and dependency changes. Committing is done by CI.
FORBIDDEN_BASH = [
    r"\bgit\s+(push|commit|reset|checkout|stash|rebase|merge|clean|restore|switch|tag|remote|config)\b",
    r"\bgh\s",
    r"\b(curl|wget|nc|ssh|scp)\b",
    r"\b(npm|pnpm|yarn)\s+(install|i|add|ci|update|remove|uninstall|publish)\b",
    r"\b(pip|pip3|uv)\s+(install|uninstall)\b",
    r"\buv\s+add\b",
    r"\brm\s+-[a-zA-Z]*r",
    r"\bsudo\b",
    r"(^|[^\w.])\.env\b",
    r"\benv\b\s*($|\|)|\bprintenv\b",
]


def root() -> Path:
    project = os.environ.get("CLAUDE_PROJECT_DIR")
    if project:
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

    if tool == "Bash":
        command = params.get("command", "")
        for pattern in FORBIDDEN_BASH:
            if re.search(pattern, command):
                print(f"Blocked: command not allowed for the unit-test agent ({pattern}).", file=sys.stderr)
                return 2
    return 0


def check() -> int:
    base = root()
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
