#!/usr/bin/env bash
# spec-inventory.sh — coverage map: which code areas are governed by a spec
# (referenced in some spec's design.md/tasks.md) and which are ungoverned.
# Writes <specs_root>/_inventory.md and prints a summary.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SPECS_ROOT=".claude/specs"
CFG="$REPO_ROOT/$SPECS_ROOT/.specconfig"
if [ -f "$CFG" ] && command -v jq >/dev/null 2>&1; then
  SPECS_ROOT="$(jq -r '.specs_root // ".claude/specs"' "$CFG")"
fi
OUT="$REPO_ROOT/$SPECS_ROOT/_inventory.md"

# Code areas = second-level directories under the code roots (api/src/routes,
# pwa/src/views, …) plus the roots' loose files as one area each.
areas() {
  local root
  for root in api/src pwa/src shared/src api/scripts scripts; do
    [ -d "$REPO_ROOT/$root" ] || continue
    find "$REPO_ROOT/$root" -mindepth 1 -maxdepth 1 -type d \
        ! -name node_modules ! -name '__tests__' ! -name dist \
      | sed "s|$REPO_ROOT/||" | sort
    # loose source files directly in the root count as "<root> (top-level)"
    if find "$REPO_ROOT/$root" -maxdepth 1 -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.sh' \) | grep -q .; then
      echo "$root"
    fi
  done
}

governing_spec() {
  # First spec whose design.md or tasks.md mentions this path prefix.
  local area="$1" d name
  for d in "$REPO_ROOT/$SPECS_ROOT"/*/; do
    [ -d "$d" ] || continue
    name="$(basename "$d")"
    case "$name" in templates) continue ;; esac
    if grep -qF "$area" "$d/design.md" "$d/tasks.md" 2>/dev/null; then
      echo "$name"
      return 0
    fi
  done
  return 1
}

total=0; governed=0
rows=""
ungoverned_list=""
while IFS= read -r area; do
  [ -n "$area" ] || continue
  total=$((total + 1))
  files=$(find "$REPO_ROOT/$area" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.sql' -o -name '*.sh' \) 2>/dev/null | wc -l | tr -d ' ')
  if spec="$(governing_spec "$area")"; then
    governed=$((governed + 1))
    rows="$rows| \`$area/\` | $files | ✅ \`$spec\` |
"
  else
    rows="$rows| \`$area/\` | $files | ❌ **ungoverned** |
"
    ungoverned_list="$ungoverned_list- \`$area/\` ($files files)
"
  fi
done < <(areas | sort -u)

cat > "$OUT" <<EOF
# Spec coverage inventory

Generated: $(date +%Y-%m-%d) by scripts/spec/spec-inventory.sh

**Areas:** $total total · $governed governed · $((total - governed)) ungoverned

| Code area | Source files | Governing spec |
|-----------|-------------:|----------------|
$rows
## Ungoverned areas (baseline must cover these)

${ungoverned_list:-- (none)}
EOF

echo "wrote $OUT"
echo "areas: $total total, $governed governed, $((total - governed)) ungoverned"
[ -n "$ungoverned_list" ] && { echo "ungoverned:"; printf '%s' "$ungoverned_list"; }
exit 0
