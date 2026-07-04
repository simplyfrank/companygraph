# Design Apply

**When to use:** a design artifact (Stitch/Figma/HTML export, wireframe HTML, design-system zip, screenshots) has been dropped in `docs/design/` and must be applied to the PWA — fresh or as a migration — without drifting off the canonical design system.
**Canonical example:** `.claude/skills/design-apply/SKILL.md`
**Tests:** `pwa/__tests__/design-conformance.test.ts` (local) · `scripts/design-conformance.ts` (the gate)
**Related:** [stitch-when-to-use.md](stitch-when-to-use.md), [pwa-component.md](pwa-component.md), [pwa-view.md](pwa-view.md), specs `stitch-integration`, `component-system-redesign`

## Shape

`docs/design/` drop  →  `/design-apply ingest`  →  `manifest.json`
→  `/design-apply plan` (one approval)  →  per surface, in blast-radius order:
`/design-apply apply <surface>`  →  delegate (`/add-pwa-view` | `/component migrate|extract|new` | `/stitch`)
→  **hard** conformance gate (`scripts/design-conformance.ts`)
→  **human** review gate (Storybook + `/review-ui` + design-vs-screenshot)
→  run-log  →  next surface.

The skill is a **conductor**, not a re-implementation: it sequences the
existing design skills under one contract and adds the deterministic gate.

## The contract (locked by the user, do not re-litigate)

1. **companygraph is the only canonical DS, app-wide.** `tokens.css`
   is generated from `.claude/stitch/design-system.yaml`. A drop is
   *input* — you map a foreign palette onto companygraph tokens or propose a
   YAML retune through `/stitch tokens-sync`. Never a parallel `--*`
   namespace, never a parallel class system. The `.m-*` Maison classes /
   `Cormorant` serif (`pwa/styles/maison.css`, `wardrobe-landing.js`) are
   a **non-canonical experiment**; conformance fails on their leakage
   into a touched surface unless explicitly waived in the manifest with a
   user override quoted in the run-log.
2. **One surface per `apply`. Gated.** Conformance green is *necessary
   but not sufficient* — a human still reviews each surface before merge.
   Never batch.
3. **Conformance is a hard gate.** `scripts/design-conformance.ts` must
   exit 0 for the surface before the human review gate is presented.
4. **`tokens.css` / `base.css` are DS sources, never manifest targets.**
   They legitimately *declare* literals; the skill edits
   `design-system.yaml` and regenerates, it never lists them in
   `touched_files`.

## What the gate checks (deterministic)

| Rule | Severity | Catches |
|---|---|---|
| `tokens-only` | FAIL | `#xxxxxx` / `rgba(<digit>` literals in a touched file |
| `no-foreign-ds` | FAIL | `.m-*` Maison classes / `Cormorant` refs (non-canonical DS leakage) |
| `token-resolvable` | FAIL | a `var(--x)` whose name is not declared in `tokens.css`/`base.css` (typo'd/invented token) |
| `catalog-drift` | INFO | component-ish class prefixes worth a CATALOG cross-check (never fails the build — `/component audit` / `/stitch vocab-check` own the hard call) |

Inert by default: with no `manifest.json` and no `--view/--surface`, the
script exits 0. This is deliberate so the buildspec PWA block can call it
unconditionally without affecting any deploy until a drop is in flight.

## Anti-patterns

- **Parallel token namespace / parallel stylesheet** for a drop. Map onto
  companygraph or retune the YAML — never run two systems live.
- **Hand-rolled CATALOG duplicate** because `/component migrate` "is
  slower". The gate + `/component audit` exist precisely to stop this.
- **Ungated batch** ("they're all the same pattern, apply all 9").
- **Self-approved review** — green conformance ≠ user approval.
- **Hand-editing `tokens.css`** — it is generated.
- **Inventing surfaces from an empty/skeleton drop** — stop and report.
