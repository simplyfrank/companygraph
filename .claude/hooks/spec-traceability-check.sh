#!/usr/bin/env bash
# spec-traceability-check.sh — PreToolUse hook (Write|Edit) on a spec's
# STATUS.md. Blocks marking a spec design/tasks "approved" or execution
# "complete" unless the requirement breakdown fully flows into design+tasks.
#
# This is the gate that guarantees "the spec process correctly creates all
# requirement breakdown into the design and tasks" — it runs the same
# scripts/spec/spec-traceability.sh used by /spec-adopt and CI.
#
# Same stdin contract as spec-completion-check.sh.

set -euo pipefail

STDIN_JSON=""
[ ! -t 0 ] && STDIN_JSON="$(cat)"
TARGET=""
NEW_CONTENT=""
if [ -n "$STDIN_JSON" ] && command -v jq >/dev/null 2>&1; then
  TARGET="$(echo "$STDIN_JSON" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
  NEW_CONTENT="$(echo "$STDIN_JSON" | jq -r '.tool_input.content // .tool_input.new_string // empty' 2>/dev/null)"
fi
[ -z "$TARGET" ] && TARGET="${1:-}"
[ -z "$TARGET" ] && exit 0

case "$TARGET" in
  *.claude/specs/*/STATUS.md|*/specs/*/STATUS.md) ;;
  *) exit 0 ;;
esac

[ -z "$NEW_CONTENT" ] && [ -f "$TARGET" ] && NEW_CONTENT="$(cat "$TARGET")"
[ -z "$NEW_CONTENT" ] && exit 0

# Only act when this edit advances design/tasks to approved OR execution to complete.
echo "$NEW_CONTENT" | grep -qiE '(approved|complete)' || exit 0

SPEC_DIR="$(dirname "$TARGET")"
FEATURE="$(basename "$SPEC_DIR")"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
TRACE="$REPO_ROOT/scripts/spec/spec-traceability.sh"
[ -x "$TRACE" ] || exit 0   # automation not installed → don't block

# Grandfathering: only enforce on the as-built baseline and on specs created
# on/after .specconfig.traceability_cutoff. Legacy specs that predate the
# contract (or carry no created date) are skipped so existing /spec work is
# not retroactively blocked. Backfill them via /spec-adopt refresh instead.
CFG="$REPO_ROOT/.claude/specs/.specconfig"
if [ -f "$CFG" ] && command -v jq >/dev/null 2>&1; then
  BASELINE="$(jq -r '.baseline_spec // "_baseline"' "$CFG")"
  CUTOFF="$(jq -r '.traceability_cutoff // empty' "$CFG")"
  if [ "$FEATURE" != "$BASELINE" ] && [ -n "$CUTOFF" ]; then
    CREATED="$(grep -E '^created:' "$SPEC_DIR/requirements.md" 2>/dev/null | head -1 \
      | sed -E 's/.*created:[[:space:]]*"?([0-9]{4}-[0-9]{2}-[0-9]{2})"?.*/\1/')"
    # No parseable created date → legacy → grandfathered.
    case "$CREATED" in
      [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
      *) exit 0 ;;
    esac
    # created < cutoff → grandfathered (string compare is valid for ISO dates).
    [ "$CREATED" \< "$CUTOFF" ] && exit 0
  fi
fi

if ! out="$("$TRACE" "$SPEC_DIR" 2>&1)"; then
  cat >&2 <<EOF
BLOCKED by spec-traceability-check: spec '$FEATURE' cannot advance — the
requirement breakdown does not fully flow into design and tasks:

$out

Fix the gaps above (every FR-xx must reach design.md AND a task; every task
must cite an AC-xx; every AC-xx needs a Verification entry), then retry.
EOF
  exit 1
fi
exit 0
