#!/usr/bin/env bash
# design-to-web — propagate design/ token changes into the pwa/ React app.
#
# Repo-agnostic; run from the repo root (the dir holding design-system.manifest.*).
#
# DIFF SOURCE  : design-system.manifest.lock (same baseline the SessionStart
#                drift hook uses). Enumerates every changed design/ input.
# APPLY SCOPE  : TOKENS ONLY. The token layer (manifest.paths.tokensCss) is
#                copied byte-for-byte into pwa/src/styles/companygraph/.
#                Component / mock / vocabulary / DESIGN.md changes are
#                REPORTED, never auto-applied (that is a human decision or a
#                /wireframe-extract --reconcile for the catalog layer).
#
# HARD BOUNDARIES (never crossed):
#   - design/ is read-only. This script never edits the design source.
#   - Writes ONLY pwa/src/styles/companygraph/tokens.css.
#   - NEVER touches pwa/src/styles/companygraph/index.css (hand-owned import shim).
#   - NEVER rewrites design-system.manifest.lock — that file is owned by
#     /wireframe-extract; rewriting it would blind the drift hook.
#   - NEVER edits pwa/src/components, pwa/src/views, or the manifest.
#
# Usage:
#   sync.sh            apply token drift, print a reconciliation report
#   sync.sh --check    dry run; exit 2 if token drift would be applied (CI gate)
#   sync.sh --report   list all design/ drift, apply nothing (the "identify" half)
set -euo pipefail

MODE="${1:-apply}"
case "$MODE" in
  apply|--apply) MODE=apply ;;
  --check)       MODE=check ;;
  --report)      MODE=report ;;
  *) printf 'unknown arg: %s (use --check | --report)\n' "$MODE" >&2; exit 64 ;;
esac

ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$ROOT"

LOCK="design-system.manifest.lock"
MANIFEST="design-system.manifest.yaml"
WEB_STYLE_DIR="pwa/src/styles/companygraph"

say()  { printf '\033[1m%s\033[0m\n' "$*"; }
err()  { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }
dim()  { printf '\033[2m%s\033[0m\n' "$*"; }

# ---- preflight ------------------------------------------------------------
[ -f "$MANIFEST" ] || { err "no $MANIFEST at repo root — run /wireframe-extract first."; exit 1; }
[ -d "design" ]    || { err "no ./design folder — nothing to reconcile."; exit 1; }
command -v shasum >/dev/null 2>&1 || { err "shasum not on PATH."; exit 1; }

# Resolve the token-layer source path from the manifest (single quoted lines).
manifest_path() {
  sed -n "s/^[[:space:]]*$1:[[:space:]]*\"\(.*\)\".*/\1/p" "$MANIFEST" | head -1
}
TOKENS_SRC="$(manifest_path tokensCss)"
[ -n "$TOKENS_SRC" ] && [ -f "$TOKENS_SRC" ] || { err "manifest.paths.tokensCss unresolved or missing: '$TOKENS_SRC'"; exit 1; }

# ---- 1. diff the design/ folder vs the manifest lock ----------------------
CHANGED=""; ADDED=""; REMOVED=""
if [ -f "$LOCK" ]; then
  tracked=$(sed 's/^[0-9a-fA-F]\{64\}  //' "$LOCK" | sort)
  current=$(find design -type f \( -name '*.html' -o -name '*.css' -o -name '*.yaml' -o -name '*.yml' -o -name '*.md' \) 2>/dev/null | sort)
  CHANGED=$(shasum -a 256 -c "$LOCK" 2>/dev/null | grep -v ': OK$' | sed 's/: FAILED.*//' || true)
  ADDED=$(comm -13 <(printf '%s\n' "$tracked") <(printf '%s\n' "$current") || true)
  REMOVED=$(comm -23 <(printf '%s\n' "$tracked") <(printf '%s\n' "$current") || true)
else
  dim "(no $LOCK — /wireframe-extract has never run here; reporting raw source-vs-snapshot only)"
fi

# Partition the changed set into the token layer (in apply scope) vs the rest.
is_token_file() { [ "$1" = "$TOKENS_SRC" ]; }
component_drift=""
for f in $CHANGED $ADDED $REMOVED; do
  is_token_file "$f" || component_drift="${component_drift}${f}"$'\n'
done
component_drift=$(printf '%s' "$component_drift" | sed '/^$/d' | sort -u || true)

# ---- 2. decide token apply by DIRECT source-vs-snapshot compare -----------
token_pending=""
needs_copy() { ! diff -q "$1" "$2" >/dev/null 2>&1; }
needs_copy "$TOKENS_SRC" "$WEB_STYLE_DIR/tokens.css" && token_pending="tokens.css"

# ---- 3. report ------------------------------------------------------------
say "── design → pwa reconciliation ───────────────────────────────"
printf '  diff source : %s\n' "${LOCK} (manifest-lock drift)"
printf '  apply scope : tokens only → %s/tokens.css\n' "$WEB_STYLE_DIR"
echo

if [ -n "$CHANGED$ADDED$REMOVED" ]; then
  say "  design/ drift vs lock:"
  [ -n "$CHANGED" ] && { echo "    modified:"; printf '%s\n' "$CHANGED" | sed 's/^/      - /'; }
  [ -n "$ADDED"   ] && { echo "    added:";    printf '%s\n' "$ADDED"   | sed 's/^/      - /'; }
  [ -n "$REMOVED" ] && { echo "    removed:";  printf '%s\n' "$REMOVED" | sed 's/^/      - /'; }
else
  dim "  design/ matches the lock (no checksum drift)."
fi
echo

if [ -n "$component_drift" ]; then
  err "  ⚠ component / mock / vocabulary drift — OUT OF SCOPE, not applied:"
  printf '%s\n' "$component_drift" | sed 's/^/      - /' >&2
  dim "      → port by hand into pwa/src, or run /wireframe-extract --reconcile"
  dim "        for the catalog layer. This skill is tokens-only by design."
  echo
fi

# ---- 4. apply (tokens only) ----------------------------------------------
if [ -z "$token_pending" ]; then
  say "  ✓ token snapshot already byte-identical to design/ source — nothing to apply."
  [ -n "$component_drift" ] && exit 3   # in sync on tokens, but component drift outstanding
  exit 0
fi

say "  token drift to apply: $token_pending"
if [ "$MODE" = report ]; then
  dim "  (--report: not applying)"; exit 3
fi
if [ "$MODE" = check ]; then
  err "  --check: token snapshot is STALE. Run /design-to-web to sync."; exit 2
fi

mkdir -p "$WEB_STYLE_DIR"
cp "$TOKENS_SRC" "$WEB_STYLE_DIR/tokens.css"
say "  ✓ copied tokens.css → $WEB_STYLE_DIR/ (index.css untouched)"
echo
dim "  NEXT:"
dim "    bun run typecheck"
dim "    bun run scripts/design-conformance.ts   # surfaces touched in this run"
dim "  Surface any failure — it means an upstream token change broke a"
dim "  surface's token-resolvability or introduced a foreign-DS leak."
exit 0
