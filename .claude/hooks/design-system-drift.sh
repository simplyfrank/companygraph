#!/bin/bash
# Design-system drift detector for companygraph.
#
# Compares the ./design source-of-truth (HTML mocks + DESIGN.md) against
# the baseline recorded by the /wireframe-extract skill in
# design-system.manifest.lock. If the mocks moved since the last
# extraction, the extracted components/views are stale.
#
# Contract: SessionStart hook. SILENT no-op in any project that has never
# run the skill (no .lock file) so it is safe to leave wired globally.
# Output goes to stdout, which the harness adds to session context.
#
# Usage: design-system-drift.sh   (no args; run from repo root by the harness)

set -u

ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
LOCK="$ROOT/design-system.manifest.lock"
DESIGN_DIR="$ROOT/design"

# No baseline -> skill has never been run here. Stay silent.
[ -f "$LOCK" ] || exit 0
# Manifest exists but the design folder was removed -> worth flagging.
if [ ! -d "$DESIGN_DIR" ]; then
    echo "⚠️  design-system: design-system.manifest.lock exists but ./design is missing. Run /wireframe-extract to reconcile or remove the manifest."
    exit 0
fi

command -v shasum >/dev/null 2>&1 || exit 0

# Files tracked in the lock. shasum -a 256 format is
# "<64 hex><space><space><path>"; strip the digest + 2 spaces.
tracked=$(sed 's/^[0-9a-fA-F]\{64\}  //' "$LOCK" | sort)

# Current set of design inputs the skill cares about.
current=$(cd "$ROOT" && find design -type f \( -name '*.html' -o -name '*.css' -o -name '*.yaml' -o -name '*.yml' -o -name '*.md' \) 2>/dev/null | sort)

changed=$(cd "$ROOT" && shasum -a 256 -c "$LOCK" 2>/dev/null | grep -v ': OK$' | sed 's/: FAILED.*//')
added=$(comm -13 <(echo "$tracked") <(echo "$current"))
removed=$(comm -23 <(echo "$tracked") <(echo "$current"))

if [ -z "$changed" ] && [ -z "$added" ] && [ -z "$removed" ]; then
    exit 0
fi

echo "⚠️  design-system drift detected — ./design no longer matches the last extraction."
[ -n "$changed" ] && { echo "  Modified:"; echo "$changed" | sed 's/^/    - /'; }
[ -n "$added"   ] && { echo "  Added (no component/view yet):"; echo "$added" | sed 's/^/    - /'; }
[ -n "$removed" ] && { echo "  Removed (orphaned component/view may remain):"; echo "$removed" | sed 's/^/    - /'; }
echo "  → Run /wireframe-extract --reconcile to update the manifest and regenerate affected views."
exit 0
