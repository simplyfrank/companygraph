#!/usr/bin/env bash
# spec-guard.sh — HARD BLOCK: deny code edits with no governing approved spec.
#
# PreToolUse hook on Write|Edit|NotebookEdit. Enforces "all development only
# actions against specs": a source-code file may only be edited when an
# approved spec under the canonical specs root references its path — or when
# the single as-built baseline spec covers pre-existing code.
#
# Refreshes ALL config from <specs_root>/.specconfig so it is project-agnostic.
#
# Decision order (first match wins):
#   ALLOW  if .specconfig missing OR "enforced" != true   (governance not yet on)
#   ALLOW  if path matches an allow_glob                   (specs/docs/tests/config)
#   ALLOW  if override token present (env SPEC_ADOPT_OVERRIDE=1
#                                     or <specs_root>/.override exists)
#   ALLOW  if path referenced by an approved spec's design.md/tasks.md
#   ALLOW  if path referenced by the baseline spec (pre-existing code)
#   DENY   otherwise (exit 1 with an actionable message)
#
# Hook input contract matches spec-completion-check.sh: JSON on stdin with
# {tool_name, tool_input:{file_path,...}}; legacy $1 / TOOL_INPUT honoured.

set -euo pipefail

# 1. Resolve target file
STDIN_JSON=""
[ ! -t 0 ] && STDIN_JSON="$(cat)"
TARGET=""
if [ -n "$STDIN_JSON" ] && command -v jq >/dev/null 2>&1; then
  TARGET="$(echo "$STDIN_JSON" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
fi
[ -z "$TARGET" ] && TARGET="${1:-}"
[ -z "$TARGET" ] && exit 0

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
# Normalise to a repo-relative path for matching
REL="${TARGET#"$REPO_ROOT"/}"

# 2. Locate config
SPECS_ROOT=".claude/specs"
if [ -f "$REPO_ROOT/.claude/specs/.specconfig" ] && command -v jq >/dev/null 2>&1; then
  SPECS_ROOT="$(jq -r '.specs_root // ".claude/specs"' "$REPO_ROOT/.claude/specs/.specconfig")"
fi
CONFIG="$REPO_ROOT/$SPECS_ROOT/.specconfig"

# Governance not bootstrapped or not yet activated → allow (don't lock out setup)
[ -f "$CONFIG" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0
ENFORCED="$(jq -r '.enforced // false' "$CONFIG")"
[ "$ENFORCED" = "true" ] || exit 0

# 3. Allow-list globs (specs, docs, tests, config — must stay editable)
while IFS= read -r g; do
  [ -z "$g" ] && continue
  # shellcheck disable=SC2254
  case "$REL" in $g) exit 0 ;; esac
done < <(jq -r '.allow_globs[]?' "$CONFIG")
# Hard safety net regardless of config
case "$REL" in
  .claude/*|*.md|*.json|docs/*|*/__tests__/*|*.test.*|*.spec.*|.github/*|scripts/spec/*) exit 0 ;;
esac
# Only gate real source files
case "$REL" in
  *.ts|*.tsx|*.js|*.jsx|*.py|*.go|*.rs|*.sh|*.sql|*.java|*.rb|*.c|*.cpp|*.h) ;;
  *) exit 0 ;;
esac

# 4. Explicit override
if [ "${SPEC_ADOPT_OVERRIDE:-}" = "1" ] || [ -f "$REPO_ROOT/$SPECS_ROOT/.override" ]; then
  exit 0
fi

BASELINE="$(jq -r '.baseline_spec // "_baseline"' "$CONFIG")"

# Baseline-coverage test: the single as-built baseline can't enumerate every
# file, so it lists DIRECTORY prefixes in its design.md File Changes table
# (e.g. `telegram/src/cloud/`). REL is baseline-governed if any such path
# token is a prefix of REL (or matches it exactly).
baseline_covers() {
  local bdes="$REPO_ROOT/$SPECS_ROOT/$BASELINE/design.md"
  local btsk="$REPO_ROOT/$SPECS_ROOT/$BASELINE/tasks.md"
  [ -f "$bdes" ] || return 1
  local tok
  while IFS= read -r tok; do
    [ -z "$tok" ] && continue
    case "$REL" in
      "$tok"|"$tok"*) return 0 ;;
    esac
  done < <(grep -rhoE '`[A-Za-z0-9_./-]+/?`' "$bdes" "$btsk" 2>/dev/null \
             | tr -d '`' | sort -u)
  return 1
}

# 5. Is REL referenced by an approved spec or the baseline?
governed_by=""
if [ -d "$REPO_ROOT/$SPECS_ROOT/$BASELINE" ] && baseline_covers; then
  governed_by="$BASELINE (as-built baseline)"
fi
[ -n "$governed_by" ] && exit 0

for d in "$REPO_ROOT/$SPECS_ROOT"/*/; do
  [ -d "$d" ] || continue
  name="$(basename "$d")"
  [ "$name" = "$BASELINE" ] && continue
  des="$d/design.md"; tsk="$d/tasks.md"
  { [ -f "$des" ] && grep -qF "$REL" "$des"; } || \
  { [ -f "$tsk" ] && grep -qF "$REL" "$tsk"; } || continue

  st="$(grep -E '^status:' "$des" 2>/dev/null | head -1 | sed -E 's/.*status:[[:space:]]*"?([a-z-]+)"?.*/\1/' || true)"
  if [ "$st" = "approved" ]; then
    governed_by="$name (approved)"; break
  else
    # File is in a spec but it isn't approved yet → block with that hint
    cat >&2 <<EOF
BLOCKED by spec-guard: $REL is claimed by spec '$name' but its design is not
approved (status: ${st:-draft}). Finish the gate before editing this file:

  /spec continue $name
EOF
    exit 1
  fi
done

if [ -n "$governed_by" ]; then
  exit 0
fi

# 6. No governing spec → deny
cat >&2 <<EOF
BLOCKED by spec-guard: $REL has no governing approved spec.

"All development only actions against specs" is enforced. To proceed:

  1. /spec new <feature>     — write requirements → design → tasks
  2. Get the design.md approved (status: approved) and list $REL in its
     File Changes table or a task's Files.
  3. Re-run the edit.

Pre-existing untouched code is covered by the as-built baseline
($SPECS_ROOT/$BASELINE). If this file genuinely belongs there, add it to
that spec's design.md File Changes table.

Emergency override (discouraged): touch $SPECS_ROOT/.override
or run with SPEC_ADOPT_OVERRIDE=1.
EOF
exit 1
