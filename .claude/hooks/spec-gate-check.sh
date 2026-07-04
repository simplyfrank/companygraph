#!/bin/bash
# Pre-implementation gate check: blocks Write/Edit on files covered by unapproved specs
# Invoked as PreToolUse hook — receives file path as $1

TARGET_FILE="$1"
[ -z "$TARGET_FILE" ] && exit 0

# Only check workspace source files — api/, pwa/, shared/ (not specs themselves, not config)
case "$TARGET_FILE" in
  */specs/*|*/.claude/*|*.md|*.json) exit 0 ;;
esac

for spec_dir in .claude/specs/*/; do
  [ -d "$spec_dir" ] || continue
  design="$spec_dir/design.md"
  [ -f "$design" ] || continue

  # Check if this file is mentioned in the design doc
  if grep -q "$TARGET_FILE" "$design" 2>/dev/null; then
    status=$(head -20 "$design" | grep "^status:" | sed 's/status: *"\{0,1\}\([^"]*\)"\{0,1\}/\1/')
    if [ "$status" != "approved" ]; then
      feature=$(basename "$spec_dir")
      echo "BLOCKED: $TARGET_FILE is covered by spec '$feature' but design is not approved (status: $status)"
      echo "Run: /spec continue $feature"
      exit 1
    fi
  fi
done
exit 0
