#!/usr/bin/env bash
# scaffold-react — one-command Vite + React + TypeScript bootstrapper.
#
# Repo-agnostic: operates on the current working directory (whatever repo
# Claude is invoked in). Detects a companygraph-style design system
# (.claude/stitch/design-system.yaml or design/<name>/DESIGN.md) and
# wires its tokens into the new app automatically; otherwise produces a
# plain React scaffold.
#
# Usage:  scaffold.sh [target-dir]   target-dir defaults to "web"
set -euo pipefail

TARGET="${1:-web}"
ROOT="$(pwd)"
APP_DIR="$ROOT/$TARGET"

say() { printf '\033[1m%s\033[0m\n' "$*"; }
err() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

# ---- preflight ------------------------------------------------------------
command -v node >/dev/null 2>&1 || { err "node not found on PATH"; exit 1; }
command -v npm  >/dev/null 2>&1 || { err "npm not found on PATH"; exit 1; }

if [ -e "$APP_DIR" ] && [ -n "$(ls -A "$APP_DIR" 2>/dev/null || true)" ]; then
  err "Target '$TARGET/' already exists and is not empty. Aborting (nothing changed)."
  err "Pass a different target dir:  scaffold.sh <dir>"
  exit 1
fi

say "→ Scaffolding Vite + React + TypeScript into ./$TARGET ..."
npm create vite@latest "$TARGET" -- --template react-ts >/dev/null

cd "$APP_DIR"
say "→ Installing dependencies ..."
npm install >/dev/null 2>&1

# ---- design-system token detection ---------------------------------------
TOKENS_CSS=""
TOKENS_YAML="$ROOT/.claude/stitch/design-system.yaml"
if [ -f "$TOKENS_YAML" ]; then
  # Canonical companygraph path — generate tokens.css from the YAML.
  if command -v bun >/dev/null 2>&1 && [ -f "$ROOT/scripts/stitch-tokens-to-css.ts" ]; then
    say "→ Generating tokens.css from .claude/stitch/design-system.yaml ..."
    ( cd "$ROOT" && bun run scripts/stitch-tokens-to-css.ts >/dev/null 2>&1 ) || true
    # Look for the emitted file in conventional locations.
    for candidate in "$ROOT/pwa/src/styles/tokens.css" "$ROOT/pwa/styles/tokens.css" "$ROOT/src/styles/tokens.css"; do
      [ -f "$candidate" ] && TOKENS_CSS="$candidate" && break
    done
  fi
fi

# Fallback: search the repo for a *Design System*/tokens.css file.
if [ -z "${TOKENS_CSS:-}" ]; then
  TOKENS_CSS="$(find "$ROOT" \
    -path "$APP_DIR" -prune -o \
    -name node_modules -prune -o \
    -name .git -prune -o \
    -ipath '*design system*/tokens.css' -print 2>/dev/null | head -n1 || true)"
fi

if [ -n "${TOKENS_CSS:-}" ]; then
  say "→ Design system detected — wiring tokens from:"
  say "  ${TOKENS_CSS#$ROOT/}"

  mkdir -p src/styles/companygraph
  cp "$TOKENS_CSS" src/styles/companygraph/tokens.css

  {
    echo "/* companygraph design tokens — copied by scaffold-react. */"
    echo "/* Source of truth: ${TOKENS_CSS#$ROOT/} — re-run /scaffold-react or re-copy to refresh. */"
    echo "@import './tokens.css';"
  } > src/styles/companygraph/index.css

  if [ -f src/main.tsx ]; then
    perl -0pi -e "s{import '\\./index\\.css'}{import './styles/companygraph/index.css'}" src/main.tsx
  fi
  rm -f src/index.css src/App.css

  cat > src/App.tsx <<'TSX'
export default function App() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '64px',
        background: 'var(--bg, oklch(99% 0.002 240))',
        color: 'var(--fg, oklch(18% 0.012 250))',
        fontFamily: 'var(--font-body, -apple-system, system-ui, sans-serif)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <section style={{ maxWidth: 560 }}>
        <h1 style={{
          fontFamily: 'var(--font-display, -apple-system, system-ui, sans-serif)',
          fontWeight: 600,
          fontSize: 32,
          letterSpacing: '-0.022em',
          margin: 0
        }}>
          companygraph
        </h1>
        <p style={{ marginTop: 16, color: 'var(--muted, oklch(54% 0.012 250))' }}>
          React scaffold wired to companygraph design tokens. Edit{' '}
          <code style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>
            src/App.tsx
          </code>{' '}
          to begin.
        </p>
      </section>
    </main>
  );
}
TSX

  TOKENS_WIRED=1
else
  say "→ No design-system tokens found — generic React scaffold kept as-is."
  TOKENS_WIRED=0
fi

# ---- done -----------------------------------------------------------------
say ""
say "✓ React app scaffolded at ./$TARGET"
if [ "$TOKENS_WIRED" = 1 ]; then
  say "  Tokens: $TARGET/src/styles/companygraph/  (tokens.css + index.css)"
fi
say ""
say "Next:"
say "  cd $TARGET && npm run dev"
