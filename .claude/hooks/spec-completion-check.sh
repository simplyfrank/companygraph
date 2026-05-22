#!/bin/bash
# Spec completion gate (PreToolUse hook on Write|Edit).
#
# Blocks marking a spec STATUS.md "complete" without a verification_artifact
# field. Verification artifact must be one of:
#   - a path to a test file that exercises the new code (preferred)
#   - "manual: <one-line procedure>" describing how to verify in a browser/UI
#
# Why this exists: prior specs were self-marked complete with validation =
# "visual check" / "manual test", and no test or written procedure was ever
# captured. Months later the feature is broken in production and nobody can
# tell whether it ever worked or regressed silently.
#
# Hook input contract: Claude Code pipes a JSON envelope to stdin with shape
#   {tool_name, tool_input: {file_path, content?, new_string?}}
# We also accept the legacy `$1 = file_path` invocation + `TOOL_INPUT` env var
# so the hook works in older harness versions and in manual smoke tests.

# 1. Resolve target file path: prefer stdin JSON, fall back to $1.
STDIN_JSON=""
if [ ! -t 0 ]; then
  STDIN_JSON="$(cat)"
fi

TARGET_FILE=""
NEW_CONTENT=""
if [ -n "$STDIN_JSON" ] && command -v jq >/dev/null 2>&1; then
  TARGET_FILE="$(echo "$STDIN_JSON" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
  # Write tool puts full body in .content; Edit tool puts the post-change body in .new_string
  NEW_CONTENT="$(echo "$STDIN_JSON" | jq -r '.tool_input.content // .tool_input.new_string // empty' 2>/dev/null)"
fi
[ -z "$TARGET_FILE" ] && TARGET_FILE="$1"
[ -z "$TARGET_FILE" ] && exit 0

# 2. Only fire on STATUS.md files inside .claude/specs/
case "$TARGET_FILE" in
  *.claude/specs/*/STATUS.md) ;;
  *) exit 0 ;;
esac

# 3. Source new content from stdin (preferred) or TOOL_INPUT env (legacy).
[ -z "$NEW_CONTENT" ] && NEW_CONTENT="${TOOL_INPUT:-}"

# Edit-tool case: the JSON only carries the diff slice, not the full file.
# Merge it with the on-disk file so completion-state checks see the full
# post-edit content. (Without this we'd only see whatever lines the diff
# happened to touch, and miss completion markers elsewhere in the file.)
if [ -n "$NEW_CONTENT" ] && [ -f "$TARGET_FILE" ]; then
  ON_DISK="$(cat "$TARGET_FILE")"
  NEW_CONTENT="$ON_DISK"$'\n'"$NEW_CONTENT"
elif [ -z "$NEW_CONTENT" ] && [ -f "$TARGET_FILE" ]; then
  # No tool input visible (older harness) — fall back to reading the file
  # post-write. This makes the check best-effort but still catches the
  # common case where /spec marks STATUS complete via a sequence of edits.
  NEW_CONTENT="$(cat "$TARGET_FILE")"
fi
[ -z "$NEW_CONTENT" ] && exit 0

# 4. Heuristic: are we transitioning a phase to "complete" with this edit?
#    Matches STATUS.md formats produced by the spec-workflow skill:
#      - "Current Phase: complete"   - "| Execution | complete |"
#      - "phase: complete"           - "**Phase**: complete"
echo "$NEW_CONTENT" | grep -qiE '(execution|current[[:space:]]*phase|\*\*phase\*\*|phase:)[^A-Za-z]*complete' || exit 0

SPEC_DIR=$(dirname "$TARGET_FILE")
FEATURE=$(basename "$SPEC_DIR")

# 5. Grandfathered specs (retrofitted Completion Gate sections) get a pass —
#    they explicitly opt out of the artifact requirement until backfilled.
if echo "$NEW_CONTENT" | grep -qE 'Completion Gate \(retrofitted\)|treat as \*\*grandfathered\*\*'; then
  exit 0
fi

# 6. verification_artifact must be present AND non-empty AND not a placeholder.
#    Placeholders (`<...>`) come from the Completion Gate documentation block
#    that we instruct authors to leave in the file as a reminder; they don't
#    count as real artifacts. We pick the first line whose value does NOT
#    start with `<`.
ARTIFACT_LINE=$(echo "$NEW_CONTENT" | grep -E '^[[:space:]]*verification_artifact:[[:space:]]*[^<[:space:]]' | head -1)
ARTIFACT_VALUE=$(echo "$ARTIFACT_LINE" | sed -E 's/.*verification_artifact:[[:space:]]*//')

if [ -z "$ARTIFACT_LINE" ] || [ -z "$ARTIFACT_VALUE" ]; then
  cat <<EOF >&2
BLOCKED: Spec '$FEATURE' STATUS being marked complete without a verification_artifact.

Add to STATUS.md:
  verified_at: $(date +%Y-%m-%d)
  verification_artifact: <test path OR 'manual: <one-line procedure>'>

Examples:
  verification_artifact: pwa/__tests__/swipe-actions.test.ts
  verification_artifact: manual: Safari macOS, two-finger swipe-left on assistant bubble, expect Retry toast and resent message

Run '/spec audit $FEATURE' to see which files still need test coverage.
EOF
  exit 1
fi

# 7. verified_at must also be set so we can detect drift later.
if ! echo "$NEW_CONTENT" | grep -qE 'verified_at:[[:space:]]*[0-9]{4}-[0-9]{2}-[0-9]{2}'; then
  cat <<EOF >&2
BLOCKED: Spec '$FEATURE' has verification_artifact but no verified_at date.

Add to STATUS.md:
  verified_at: $(date +%Y-%m-%d)

The date anchors the verification — if files in the spec change after this
date, '/spec audit' will flag the spec as drifted and needing re-verification.
EOF
  exit 1
fi

exit 0
