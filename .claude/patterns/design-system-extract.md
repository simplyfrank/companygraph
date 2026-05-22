# Design-system extraction — companygraph

**When to use:** The project has a `./design/companygraph/` folder of
static HTML mocks + a distilled `DESIGN.md`, and you need a managed
component catalog that stays honest to it. The automation is the
`/wireframe-extract` skill; this doc is the contract it (and any
reviewer) holds to.

**Canonical pieces:**
- `.claude/skills/wireframe-extract/SKILL.md` — the orchestrator (phases, manifest schema).
- `.claude/hooks/design-system-drift.sh` — SessionStart drift detector. Silent no-op unless `design-system.manifest.lock` exists.
- `.claude/hooks/design-guard.sh` — PreToolUse(Write|Edit) gate that blocks hex/rgba/oklch literals in `pwa/src/**`.
- `design-system.manifest.yaml` / `design-system.manifest.lock` — repo-root, skill-owned, committed.
- `scripts/design-conformance.ts` — deterministic conformance gate, manifest-driven.
- `scripts/stitch-tokens-to-css.ts` — emits `pwa/src/styles/companygraph/tokens.css` from `.claude/stitch/design-system.yaml`.

## The two-file manifest is the registry

This is the [[registry]] pattern applied to design components: one
declared place listing every component (unique `name`, `sources`,
`variants`, `props`, `status`), plus a coverage check that scans the
real source-of-truth (`./design/companygraph`) and asserts nothing
drifted. The drift hook *is* the coverage test, run at SessionStart
instead of in CI.

- `design-system.manifest.yaml` — readable catalog + config. **Reconciled, never clobbered.**
- `design-system.manifest.lock` — `shasum -a 256 -c`-format baseline of every tracked design input, relative paths from repo root. **Rewritten wholesale every run.** The hook parses exactly this format; keep them in lockstep.

## Source-of-truth precedence

When the same component appears in multiple places, trust in this order:

1. `DESIGN.md` §5 (Component vocabulary) + §6 (Screen catalogue) — **names and variant vocabulary come from here, full stop.** Unnameable structure → reported candidate, never auto-named.
2. `design/companygraph/companygraph-views.html` — full views surface, with the inline `<style>` block as the canonical token declaration site. Use to discover props and confirm a structure is reused (dedupe signal).
3. `design/companygraph/companygraph-journeys.html` — secondary mock, sometimes shows journey-specific variants.
4. `.claude/stitch/design-system.yaml` — the canonical token registry (generated from the HTML `<style>` on first run, then hand-tunable). `scripts/stitch-tokens-to-css.ts` is the **only** way to write `tokens.css`.

## Idempotency contract (why re-running is safe)

| Field | On re-run |
|---|---|
| `notes`, `overrides` | Preserved verbatim. Human-owned. `overrides` keys win over auto-derived fields. |
| `status: reviewed` | Never downgraded. If sources changed, regenerate the file, keep `reviewed`, surface via `coverage.pending`. |
| `sources/region/variants/props` | Refreshed from discovery unless shadowed by `overrides`. |
| Component dropped from mocks | `status: orphaned`, files kept, reported. Deletion is a human call. |
| `.lock` | Regenerated every run so the next drift baseline is accurate. |

## Anti-patterns

- Hardcoding a hex/oklch value lifted from a mock instead of a `var(--…)` reference → the whole point of the token layer is that the design system is the single source; this silently forks it. `design-guard.sh` blocks at edit time; `scripts/design-conformance.ts` blocks at CI time.
- Inventing a component name because the structure looked reusable → names trace to `DESIGN.md` §5 or it's a *candidate*, not a component.
- Deleting orphaned components, `notes`, or `reviewed` status to make the run "clean" → destroys human judgement; mark and report instead.
- Editing `design/companygraph/**` from the skill → the mocks are read-only input; output lives in `pwa/src/{views,components}/`, `.claude/stitch/design-system.yaml`, and the manifests only.
- Hand-editing `design-system.manifest.lock` → it's machine state; edit the mock or the `.yaml`, then `--reconcile`.
- Wiring the drift hook to PostToolUse → it's a SessionStart no-op-when-absent by design; per-edit runs add noise for zero signal (mocks rarely change mid-session).
- Editing `pwa/src/styles/companygraph/tokens.css` by hand → it's machine state, generated from `.claude/stitch/design-system.yaml` by `scripts/stitch-tokens-to-css.ts`. Edit the YAML and re-generate.

## Wiring

- `.claude/settings.json` → `SessionStart` runs `.claude/hooks/design-system-drift.sh` after the session log. No-op in any project/session without a `.lock`, so it is safe left global.
- `.claude/settings.json` → `PreToolUse(Write|Edit)` runs `.claude/hooks/design-guard.sh` after the existing spec-* gates. Conservative regex; defers to `scripts/design-conformance.ts` for the authoritative manifest-driven check.
- Related: [[registry]] (the shape), [[spec-workflow]] (how /wireframe-extract output flows into specs).
