#!/usr/bin/env bash
# spec-traceability.sh — mechanical check that a spec's requirement breakdown
# fully flows into design and tasks. Called by the spec-traceability-check.sh
# hook, /spec-adopt, and CI.
#
# Usage:
#   spec-traceability.sh <spec_dir>     check one spec (exit 1 + gap report on failure)
#   spec-traceability.sh --all          sweep every spec under specs_root
#
# Contract enforced (see .claude/specs/workflow.md):
#   - every FR-xx in requirements.md appears in design.md (when design exists)
#   - every FR-xx in requirements.md appears in tasks.md
#   - every AC-xx in requirements.md is cited by tasks.md
#   - every task heading (### T-xx) has a Verification entry
#     (a *.test.* / *.spec.* path or "manual: <repro>")

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SPECS_ROOT=".claude/specs"
CFG="$REPO_ROOT/.claude/specs/.specconfig"
if [ -f "$CFG" ] && command -v jq >/dev/null 2>&1; then
  SPECS_ROOT="$(jq -r '.specs_root // ".claude/specs"' "$CFG")"
fi

check_spec() {
  local dir="$1"
  local name; name="$(basename "$dir")"
  local req="$dir/requirements.md" des="$dir/design.md" tsk="$dir/tasks.md"
  local fails=0

  if [ ! -f "$req" ]; then
    echo "[$name] MISSING requirements.md"
    return 1
  fi
  if [ ! -f "$tsk" ]; then
    echo "[$name] MISSING tasks.md"
    return 1
  fi

  # Extract only DEFINED requirements — an FR-/AC- that is the first token of
  # a definition line (a `| FR-01 |` table row, a `### FR-01` heading, or a
  # `- **FR-01**` list item). This deliberately excludes (a) `NFR-11`, whose
  # `FR-11` substring a bare `FR-[0-9]+` match would wrongly capture, and
  # (b) mid-line CROSS-REFERENCES to other specs' requirements (e.g.
  # "(graph-core FR-16)") which are not this spec's own requirements. Both
  # produced spurious "never reaches tasks" gaps on complete specs.
  local frs acs
  frs="$(grep -oE '^[|#*[:space:]-]*FR-[0-9]+' "$req" | grep -oE 'FR-[0-9]+' | sort -u)"
  acs="$(grep -oE '^[|#*[:space:]-]*AC-[0-9]+' "$req" | grep -oE 'AC-[0-9]+' | sort -u)"

  # FR flow: requirements -> design (if present) -> tasks
  local fr
  for fr in $frs; do
    if [ -f "$des" ] && ! grep -q "$fr\b" "$des" 2>/dev/null && ! grep -q "$fr" "$des"; then
      echo "[$name] GAP: $fr in requirements.md never reaches design.md"
      fails=$((fails + 1))
    fi
    if ! grep -q "$fr" "$tsk"; then
      echo "[$name] GAP: $fr in requirements.md never reaches tasks.md"
      fails=$((fails + 1))
    fi
  done

  # AC closure: every AC cited by at least one task
  local ac
  for ac in $acs; do
    if ! grep -q "$ac" "$tsk"; then
      echo "[$name] GAP: $ac has no task closing it in tasks.md"
      fails=$((fails + 1))
    fi
  done

  # Verification: every task heading carries a Verification entry.
  # Count task headings vs Verification lines; then verify each task block
  # individually so a doubled entry can't mask a missing one.
  local tasks_total
  tasks_total="$(grep -cE '^#{2,4} +T-[0-9]+' "$tsk")"
  if [ "$tasks_total" -gt 0 ]; then
    # Split tasks.md into blocks per task heading and require a Verification
    # line (test path or manual:) inside each block.
    local missing
    # A task passes when its block carries BOTH a Verification label and a
    # concrete proof token somewhere in the block. Scanning block-wide (not
    # just the Verification line) tolerates multi-line verification prose that
    # cites the test path on a following line. The token set covers the house
    # verification styles: a *.test./*.spec. path, an inline test(, a
    # __tests__ dir, `bun test`/`bun run test`, playwright/vitest, a curl
    # repro, or an explicit "manual:" procedure.
    missing="$(awk '
      function proof() { return (hasV && hasTok) }
      /^#{2,4} +T-[0-9]+/ {
        if (intask && !proof()) print id
        intask = 1; hasV = 0; hasTok = 0; id = $0
        sub(/^#+ +/, "", id); sub(/ .*$/, "", id)
        next
      }
      intask && /[Vv]erification/ { hasV = 1 }
      intask && (/manual:/ || /\.test\./ || /\.spec\./ || /test\(/ || /__tests__/ || /bun (run )?test/ || /playwright/ || /vitest/ || /curl / || /typecheck/ || /bun build/ || /design-conformance/) { hasTok = 1 }
      END { if (intask && !proof()) print id }
    ' "$tsk")"
    if [ -n "$missing" ]; then
      local t
      for t in $missing; do
        echo "[$name] GAP: task $t has no Verification entry (test path or manual: <repro>)"
        fails=$((fails + 1))
      done
    fi
  fi

  if [ "$fails" -gt 0 ]; then
    echo "[$name] FAIL — $fails traceability gap(s)"
    return 1
  fi
  echo "[$name] OK — $(echo "$frs" | grep -c . ) FRs, $(echo "$acs" | grep -c .) ACs, $tasks_total tasks all traced"
  return 0
}

if [ "${1:-}" = "--all" ]; then
  rc=0
  for d in "$REPO_ROOT/$SPECS_ROOT"/*/; do
    [ -d "$d" ] || continue
    case "$(basename "$d")" in templates) continue ;; esac
    [ -f "$d/requirements.md" ] || continue
    check_spec "${d%/}" || rc=1
  done
  exit $rc
fi

[ -n "${1:-}" ] || { echo "usage: $0 <spec_dir> | --all" >&2; exit 2; }
check_spec "${1%/}"
