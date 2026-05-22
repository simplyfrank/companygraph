# /scaffold-react — One-command React app bootstrapper

Stand up a **Vite + React + TypeScript** application in any repo with a
single command. If the repo ships a companygraph-style design system
(`design/<name>/DESIGN.md` + `.claude/stitch/design-system.yaml`), its
tokens are wired in automatically; otherwise a clean generic React
scaffold is produced. Nothing is overwritten — the command aborts if
the target directory already exists and is non-empty.

For companygraph itself, the `pwa/` workspace is already scaffolded by
the foundation (graph-core). This skill is useful for **second projects
in this design-system family** that want to inherit the same tokens, or
for sibling/auxiliary frontends (admin tools, marketing site, etc.).

## Usage

```
/scaffold-react              # creates ./web
/scaffold-react <dir>        # creates ./<dir>
```

## What it does

1. Preflight: verifies `node`, `npm`, and `bun` are on PATH; refuses if the target dir exists and is non-empty (no destructive action).
2. `npm create vite@latest <dir> -- --template react-ts`, then `npm install`.
3. **Design-system detection** (repo-agnostic):
   - First looks for `.claude/stitch/design-system.yaml` (canonical companygraph token source). If found, runs `bun run scripts/stitch-tokens-to-css.ts` and copies the emitted `pwa/src/styles/tokens.css` (or the script's target path) into `<dir>/src/styles/companygraph/`.
   - Falls back to a literal `*Design System*/tokens.css` search if no Stitch YAML is present.
   - Generates `index.css` that imports tokens, and repoints `src/main.tsx` at it.
4. Prints the `cd <dir> && npm run dev` next step.

## How to run it (instructions for Claude)

Run the helper script from the **current repo root** so it stays
repo-agnostic, passing through any target-dir argument the user gave:

```bash
bash "$CLAUDE_PROJECT_DIR/.claude/skills/scaffold-react/scaffold.sh" [target-dir]
```

Then report to the user: the path created, whether companygraph tokens
were wired in (and from which source file), and the `npm run dev`
command. If the script aborted because the target exists, relay that
and suggest a different dir — do not delete or overwrite anything.

## Notes

- The copied tokens are a **snapshot**. The design system remains the source of truth; re-run `/scaffold-react` into a fresh dir, or recopy the file by hand, to pick up token changes.
- Honours the companygraph baseline: OKLCH custom properties, three font faces (display/body/mono), tabular-nums globally, no shadows on default surfaces. Anything else is opinion and may be deviated from in the new app's design.
