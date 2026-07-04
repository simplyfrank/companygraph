#!/usr/bin/env bash
# spec-coverage.sh — CI governance gate: every source file changed relative to
# --base <ref> must be referenced by an approved spec's design.md/tasks.md or
# covered by the as-built baseline spec's path prefixes.
#
# Usage: spec-coverage.sh --base origin/main
# Exit 1 with the list of ungoverned changed files.

set -euo pipefail

BASE="HEAD"
[ "${1:-}" = "--base" ] && BASE="${2:?--base needs a ref}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
SPECS_ROOT=".claude/specs"
CFG="$REPO_ROOT/$SPECS_ROOT/.specconfig"
BASELINE="_baseline"
if [ -f "$CFG" ] && command -v jq >/dev/null 2>&1; then
  SPECS_ROOT="$(jq -r '.specs_root // ".claude/specs"' "$CFG")"
  BASELINE="$(jq -r '.baseline_spec // "_baseline"' "$CFG")"
fi

baseline_prefixes() {
  grep -rhoE '`[A-Za-z0-9_./-]+/?`' \
    "$REPO_ROOT/$SPECS_ROOT/$BASELINE/design.md" \
    "$REPO_ROOT/$SPECS_ROOT/$BASELINE/tasks.md" 2>/dev/null \
    | tr -d '\`' | sort -u
}

approved_spec_covers() {
  local rel="$1" d st
  for d in "$REPO_ROOT/$SPECS_ROOT"/*/; do
    [ -d "$d" ] || continue
    case "$(basename "$d")" in templates|"$BASELINE") continue ;; esac
    { [ -f "$d/design.md" ] && grep -qF "$rel" "$d/design.md"; } || \
    { [ -f "$d/tasks.md" ] && grep -qF "$rel" "$d/tasks.md"; } || continue
    st="$(grep -E '^status:' "$d/design.md" 2>/dev/null | head -1 | sed -E 's/.*status:[[:space:]]*"?([a-z-]+)"?.*/\1/' || true)"
    [ "$st" = "approved" ] && return 0
  done
  return 1
}

PREFIXES="$(baseline_prefixes || true)"
baseline_covers() {
  local rel="$1" tok
  while IFS= read -r tok; do
    [ -z "$tok" ] && continue
    case "$rel" in "$tok"|"$tok"*) return 0 ;; esac
  done <<< "$PREFIXES"
  return 1
}

rc=0
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  # Only gate real source files; specs/docs/tests/config are always allowed.
  case "$rel" in
    .claude/*|*.md|*.json|docs/*|*/__tests__/*|*.test.*|*.spec.*|.github/*|scripts/spec/*) continue ;;
  esac
  case "$rel" in
    *.ts|*.tsx|*.js|*.jsx|*.sh|*.sql) ;;
    *) continue ;;
  esac
  if approved_spec_covers "$rel" || baseline_covers "$rel"; then
    continue
  fi
  echo "UNGOVERNED: $rel"
  rc=1
done < <(git -C "$REPO_ROOT" diff --name-only --diff-filter=ACMR "$BASE"...HEAD 2>/dev/null || git -C "$REPO_ROOT" diff --name-only --diff-filter=ACMR "$BASE")

if [ $rc -ne 0 ]; then
  echo
  echo "Changed source files above have no governing approved spec and are not"
  echo "covered by the baseline ($SPECS_ROOT/$BASELINE). Start with /spec new."
fi
exit $rc
