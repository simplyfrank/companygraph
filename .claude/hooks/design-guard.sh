#!/usr/bin/env bash
# design-guard.sh — PreToolUse hook (Write|Edit). Fast edit-time enforcement
# of companygraph's design-token discipline on pwa/src application code.
#
# The DURABLE, manifest-driven gate is scripts/design-conformance.ts
# (runs in CI + via /design-apply, fail-closed, supports waivers). This hook
# is the fast feedback loop: it scans the content being written for clear
# single-line violations and blocks the edit before the bad code lands.
# Conservative by design (skips comment-ish lines) so it never false-blocks;
# the conformance script is authoritative.
#
# Stdin contract: JSON {tool_input:{file_path, content|new_string}}; legacy
# $1 also honoured for back-compat.

set -euo pipefail

STDIN_JSON=""
[ ! -t 0 ] && STDIN_JSON="$(cat)"
TARGET=""
CONTENT=""
if [ -n "$STDIN_JSON" ] && command -v jq >/dev/null 2>&1; then
  TARGET="$(echo "$STDIN_JSON" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
  CONTENT="$(echo "$STDIN_JSON" | jq -r '.tool_input.content // .tool_input.new_string // empty' 2>/dev/null)"
fi
[ -z "$TARGET" ] && TARGET="${1:-}"
[ -z "$TARGET" ] && exit 0

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
REL="${TARGET#"$REPO_ROOT"/}"

# Scope: only pwa/src application source. Token files + tests + types excluded.
case "$REL" in
  pwa/src/*) ;;
  *) exit 0 ;;
esac
case "$REL" in
  pwa/src/styles/*|*.test.*|*.spec.*|*/__tests__/*|\
  pwa/src/test/*|*/e2e/*|*.d.ts|pwa/src/assets/*|*.json|*.md) exit 0 ;;
esac
case "$REL" in
  *.ts|*.tsx|*.css|*.module.css) ;;
  *) exit 0 ;;
esac

# Nothing to scan (older harness with no tool input) → defer to the
# conformance script rather than guessing.
[ -z "$CONTENT" ] && exit 0

violations=""
add() { violations="${violations}  - ${1}"$'\n'; }

lineno=0
while IFS= read -r line || [ -n "$line" ]; do
  lineno=$((lineno + 1))
  trimmed="$(printf '%s' "$line" | sed 's/^[[:space:]]*//')"
  case "$trimmed" in
    '/*'*|'*'*|'//'*|'<!--'*|'') continue ;;
  esac

  # Hard rule: no raw colour literals — must use tokens.
  echo "$line" | grep -qoE '#[0-9a-fA-F]{3,8}([^0-9a-fA-F]|$)' &&
    add "L${lineno}: raw hex colour — use a companygraph token (var(--…)) declared in pwa/src/styles/companygraph/tokens.css"
  echo "$line" | grep -qiE 'rgba?\([[:space:]]*[0-9]' &&
    add "L${lineno}: rgb()/rgba() literal — use a token (var(--…)) or color-mix() against a token"

  # Soft rule: no inline oklch() literals either (the design system is the OKLCH source).
  echo "$line" | grep -qiE 'oklch\([[:space:]]*[0-9]' &&
    add "L${lineno}: inline oklch() literal — declare it in tokens.css and reference via var(--…)"

  # Hard rule: no foreign design-system fragments. companygraph uses OKLCH
  # tokens with --bg/--surface/--fg conventions; legacy m-* classes from
  # the inherited PA stack don't belong here.
  echo "$line" | grep -qoE '\bm-[a-z][a-z0-9-]*' &&
    add "L${lineno}: legacy .m-* class (Maison) — companygraph is a clean OKLCH design system; remove or refactor"
  echo "$line" | grep -qoE '\bCormorant' &&
    add "L${lineno}: Cormorant font (legacy serif) — companygraph uses SF Pro Display / SF Pro Text / SF Mono stacks via var(--font-*)"

done <<EOF
$CONTENT
EOF

[ -z "$violations" ] && exit 0

cat >&2 <<EOF
BLOCKED by design-guard: $REL violates companygraph design-token discipline.

$violations
Fix the markup/styles to use the design tokens declared in
pwa/src/styles/companygraph/tokens.css. The full conformance gate is
scripts/design-conformance.ts (runs in CI). If this is a genuine
intentional exception, add an entry under \`waivers\` in
.claude/design-apply/manifest.json (same convention as PA), never
silence at this layer.
EOF
exit 1
