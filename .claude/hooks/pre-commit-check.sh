#!/bin/bash
# Pre-commit transpile validation for companygraph
# Runs the workspace typecheck (bun build --no-bundle on both entry points)
# when TypeScript sources are staged. Invoked by the PreToolUse Bash hook
# on git-commit-shaped commands.

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -z "$REPO_ROOT" ] && exit 0
cd "$REPO_ROOT" || exit 0

BUN="${BUN_BIN:-$HOME/.bun/bin/bun}"
command -v "$BUN" >/dev/null 2>&1 || BUN=bun

# Only run when TS/TSX in a workspace is staged
TS_STAGED=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '^(api|pwa|shared)/.*\.(ts|tsx)$' | head -1)
[ -z "$TS_STAGED" ] && exit 0

echo "Staged TypeScript detected — running bun run typecheck..."
if ! "$BUN" run typecheck; then
  echo "FAIL: typecheck failed (bun build --no-bundle). Fix errors before committing."
  exit 1
fi

echo "Pre-commit checks passed."
