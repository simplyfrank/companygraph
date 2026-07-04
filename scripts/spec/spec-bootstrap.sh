#!/usr/bin/env bash
# spec-bootstrap.sh — idempotent bootstrap of the spec-governance pipeline.
# Writes <specs_root>/.specconfig, ensures workflow.md + templates/ exist,
# and verifies the enforcement hooks are registered. NEVER clobbers existing
# files — only fills what's missing.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SPECS_ROOT=".claude/specs"
CFG="$REPO_ROOT/$SPECS_ROOT/.specconfig"

mkdir -p "$REPO_ROOT/$SPECS_ROOT/templates"

# 1. .specconfig — write only if absent. enforced starts FALSE; flipping it on
#    is /spec-adopt Phase 3 and requires explicit user confirmation.
if [ -f "$CFG" ]; then
  echo "specconfig: exists — kept ($CFG)"
else
  # Detect build/test commands from the root package.json.
  BUILD_CMD="bun run typecheck"
  TEST_CMD="bun test"
  if [ -f "$REPO_ROOT/package.json" ] && command -v jq >/dev/null 2>&1; then
    jq -e '.scripts.typecheck' "$REPO_ROOT/package.json" >/dev/null 2>&1 || BUILD_CMD=""
    jq -e '.scripts.test' "$REPO_ROOT/package.json" >/dev/null 2>&1 || TEST_CMD=""
  fi
  cat > "$CFG" <<EOF
{
  "specs_root": "$SPECS_ROOT",
  "baseline_spec": "_baseline",
  "enforced": false,
  "build_cmd": "${BUILD_CMD:-bun run typecheck}",
  "test_cmd": "${TEST_CMD:-bun test}",
  "code_globs": ["api/src/*", "pwa/src/*", "shared/src/*", "api/scripts/*", "scripts/*"],
  "allow_globs": [".claude/*", "*.md", "*.json", "docs/*", "*/__tests__/*", "*.test.*", "*.spec.*", ".github/*", "scripts/spec/*", "pwa/playwright/*"],
  "traceability_cutoff": "$(date +%Y-%m-%d)"
}
EOF
  echo "specconfig: written ($CFG)"
fi

# 2. workflow.md + templates — report presence; never overwrite.
for f in workflow.md templates/requirements.md templates/design.md templates/tasks.md templates/review.md templates/STATUS.md; do
  if [ -f "$REPO_ROOT/$SPECS_ROOT/$f" ]; then
    echo "present: $SPECS_ROOT/$f"
  else
    echo "MISSING: $SPECS_ROOT/$f  (author it from .claude/skills/spec-workflow conventions)"
  fi
done

# 3. Hooks — must exist and be registered in .claude/settings.json.
for h in spec-guard.sh spec-traceability-check.sh spec-gate-check.sh spec-completion-check.sh; do
  if [ ! -f "$REPO_ROOT/.claude/hooks/$h" ]; then
    echo "MISSING HOOK: .claude/hooks/$h"
  elif grep -q "$h" "$REPO_ROOT/.claude/settings.json" 2>/dev/null; then
    echo "hook registered: $h"
  else
    echo "HOOK NOT REGISTERED: add .claude/hooks/$h to PreToolUse Write|Edit in .claude/settings.json"
  fi
done

# 4. Companion scripts.
for s in spec-traceability.sh spec-inventory.sh spec-coverage.sh; do
  [ -f "$REPO_ROOT/scripts/spec/$s" ] && echo "script: scripts/spec/$s" || echo "MISSING SCRIPT: scripts/spec/$s"
done

echo
echo "Config:"
command -v jq >/dev/null 2>&1 && jq . "$CFG" || cat "$CFG"
