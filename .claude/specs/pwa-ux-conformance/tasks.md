---
feature: "pwa-ux-conformance"
created: "2026-07-04"
author: "frank"
status: "revised"
revision: 2
size: "large"
depends_on: ["process-explorer-ui", "model-workspace-core", "story-spec-core", "business-model-authoring", "key-activity-optimizer", "ddd-system-modeling", "kpi-impact-mapping", "kpi-okr-performance-dashboards", "requirements-export"]
---

# Tasks: pwa-ux-conformance

> **Revision 2 (2026-07-04)** — resolves review-spec.md B-01, B-02, B-03.
> The token task (T-01) now edits the **auto-generated CSS's source**
> (`design-system.yaml`) and regenerates (C-02). The two mega-tasks
> (old T-06/T-07, ~73 files each) are **split per surface** into
> `≤3-files`-scale verifiable slices, each with its own Verification and
> a `git diff` behavior-preservation check (B-02). All counts corrected
> to **70** views / **55** files to remediate (56 flagged incl. the
> waived auto-generated `tokens.css`) (B-01/B-03).

Ordered so the cheapest, highest-signal work lands first (the central
token-source closure + the shared primitives), then the per-surface token
sweeps, then the per-surface ARIA/state/responsive sweeps, gesture +
routing verification, and finally the full-PWA green gate. Each task is a
coherent slice; every remediation task carries a `git diff` check.

**Execution is deferred** until the studio build lands (see STATUS +
requirements §Dependencies). These tasks are authored and reviewed now.

| # | Task | Complexity | Files | Traces |
|---|------|-----------|-------|--------|
| T-01 | Token-source catalog closure (yaml + regen) | moderate | 2–3 | FR-02, DD-01, DD-02 |
| T-02 | Shared primitives EmptyState + ViewRegion | simple | 2 | FR-01, FR-05, DD-03, DD-04 |
| T-03 | Token sweep — multi-swatch ramps (4 views) | moderate | ≤4 | FR-02, DD-02 |
| T-04a | Token sweep — admin `.tsx` | simple | 3 | FR-02, DD-01 |
| T-04b | Token sweep — exec `.tsx` | simple | 1 | FR-02, DD-01 |
| T-04c | Token sweep — explorer `.tsx` + CSS | moderate | ≤3 batches | FR-02, DD-01 |
| T-04d | Token sweep — ontology `.tsx` + CSS | moderate | ≤3 batches | FR-02, DD-01 |
| T-04e | Token sweep — sme `.tsx` | simple | 1 | FR-02, DD-01 |
| T-04f | Token sweep — shared `components/**` (chat/canvas) | moderate | ≤3 batches | FR-02, DD-01 |
| T-04g | Token sweep — shared `components/**` (kpi/sla/persona/charts) | moderate | ≤3 batches | FR-02, DD-01 |
| T-05 | CI sweep script | simple | 1 | FR-07, DD-07 |
| T-06a..i | ARIA landmark sweep — one task per surface | simple ea. | ≤3 batches ea. | FR-05, DD-04 |
| T-07a..i | View-state sweep — one task per surface | moderate ea. | ≤3 batches ea. | FR-01, DD-03 |
| T-08 | Responsiveness sweep | moderate | as found | FR-04, DD-08 |
| T-09 | Gesture + keyboard verify-vs-fix | moderate | §9 fix rows | FR-03, DD-09 |
| T-10 | Navigation verify-vs-fix | simple | verify + view fixes | FR-06, DD-05 |
| T-11 | Full-PWA green gate | simple | STATUS only | FR-07, FR-08, DD-06 |

## T-01 — Token-source catalog closure (DD-01 aliases + DD-02 families)

Edit the token **source** `.claude/stitch/design-system.yaml` (NOT
`tokens.css` — it is auto-generated). Add: (a) the `legacy_aliases:`
rename bridges (design §5a); (b) under `colors:` the semantic ramps
`--sev-1..--sev-5` + `--cat-1..--cat-6`, the tint/soft family
(`--good-soft`, `--warn-soft`, `--danger-soft`, `--muted-soft`, `--info`,
`--info-soft`, `--accent-bg`), and the interaction family (`--hover`,
`--accent-hover`, `--accent-fg`, `--ent-color`, `--edge-arrow`) — exact
OKLCH values in design §5d; (c) a `motion:` group (`--dur-fast`,
`--dur-base`, `--ease-out`, `--ease-linear`, `--ease-in-out`) — if the
generator has no `motion:` emitter, add a small one mirroring the
`spacing:` loop in `scripts/stitch-tokens-to-css.ts`. Then regenerate:
`bun run scripts/stitch-tokens-to-css.ts`. No view edits here.

- **Files**: `.claude/stitch/design-system.yaml`, `pwa/src/styles/companygraph/tokens.css` (regenerated), `scripts/stitch-tokens-to-css.ts` (only if `motion:` emitter needed)
- **Complexity**: moderate
- **Traces**: FR-02, DD-01, DD-02, DV-02, DV-04, AC-02
- **Verification**: `bun run scripts/stitch-tokens-to-css.ts --check` exits 0 (CSS matches source); grep asserts all new tokens declared (`--sev-1..5`, `--cat-1..6`, the soft/interaction/motion families, and every §5a alias). `manual: keyboard — open design-system.yaml, verify each new value is oklch()/duration/cubic-bezier and en-US named`

## T-02 — Shared primitives: EmptyState + ViewRegion (DD-03, DD-04)

Add `EmptyState({ what })` and `ViewRegion({ label, children })` to
`pwa/src/views/_shared.tsx` (+ `_shared.module.css`), additive only.

- **Files**: `pwa/src/views/_shared.tsx`, `pwa/src/views/_shared.module.css`
- **Complexity**: simple
- **Traces**: FR-01, FR-05, DD-03, DD-04
- **Verification**: `pwa/src/__tests__/ux-conformance/shared-primitives.test.tsx` — assert `EmptyState` renders `[data-testid="empty-state"]` and `ViewRegion` renders `<section role="region" aria-label=…>`. `bun run scripts/design-conformance.ts --view pwa/src/views/_shared.tsx` PASS. `git diff` shows only additive exports (no change to `Loading`/`ErrorState` signatures)

## T-03 — Token sweep: multi-swatch ramp views (DD-02, §5d)

Replace raw hex ramps with the T-01 `--cat-*`/`--sev-*` tokens in the 4
semantic-ramp views, per the per-hex mapping in design §5d.

- **Files**: `exec/RiskDashboard.tsx`, `exec/Risk.tsx`, `ontology/Erd.tsx`, `sme/Review.tsx` (Erd co-located CSS handled in T-04d)
- **Complexity**: moderate
- **Traces**: FR-02, DD-02, DV-02, AC-02
- **Verification**: `design-conformance.ts --view` PASS on each of the 4 `.tsx` (zero `❌`); `git diff` shows only color-string → `var(--cat/sev-*)` swaps (no logic change)

## T-04a — Token sweep: admin `.tsx` (DD-01)

`#c0392b` → `var(--danger)` in the 3 admin views.

- **Files**: `admin/Personas.tsx`, `admin/RbacRoles.tsx`, `admin/UserAssignments.tsx`
- **Complexity**: simple
- **Traces**: FR-02, DD-01, AC-02
- **Verification**: `design-conformance.ts --view` PASS on each; `git diff` shows only the hex→token swap

## T-04b — Token sweep: exec ContextAlignment (DD-01)

`--tone-*` → canonical (`--good/--warn/--danger/--accent/--muted`).

- **Files**: `exec/ContextAlignment.tsx`
- **Complexity**: simple
- **Traces**: FR-02, DD-01, AC-02
- **Verification**: `design-conformance.ts --view` PASS; `git diff` token-swap only

## T-04c — Token sweep: explorer `.tsx` + CSS (DD-01)

Apply §5a fixes to `explorer/{Activities,DomainDetail,Journey,JourneyDetailSlide,Path}.tsx`
and the inline-`oklch`/`rgba` fixes (§5e) to
`explorer/{Journey,JourneyGraph,DomainComparisonInline,DomainDetailSlide,JourneyComparisonInline,JourneyDetailSlide}.module.css`.
Batch in ≤3-file groups; motion-only CSS (`Journey.module.css`) needs no
edit (resolves via T-01).

- **Files**: explorer `.tsx` (5) + `.module.css` (6), in ≤3-file batches
- **Complexity**: moderate
- **Traces**: FR-02, DD-01, AC-02
- **Verification**: `design-conformance.ts --view` PASS on each explorer file in §5/§5b; `git diff` token/`color-mix` swaps only

## T-04d — Token sweep: ontology `.tsx` + CSS (DD-01)

`ontology/{Catalog,Editor}.tsx` §5a aliases; `Erd.module.css` inline
`oklch`/`rgba` → §5e + `--warning-*`/`--ent-color` resolution; the 3
ontology modal CSS files' rgba → §5e.

- **Files**: `ontology/{Catalog,Editor}.tsx`, `ontology/{Erd,AddEdgeModal,AddEntityModal,RollbackModal}.module.css`, in ≤3-file batches
- **Complexity**: moderate
- **Traces**: FR-02, DD-01, AC-02
- **Verification**: `design-conformance.ts --view` PASS on each ontology file in §5/§5b; `git diff` token/`color-mix` swaps only

## T-04e — Token sweep: sme Quarterly (DD-01)

`#22c55e`→`var(--good)`, `#ef4444`→`var(--danger)`.

- **Files**: `sme/Quarterly.tsx`
- **Complexity**: simple
- **Traces**: FR-02, DD-01, AC-02
- **Verification**: `design-conformance.ts --view` PASS; `git diff` hex→token only

## T-04f — Token sweep: shared components — chat/canvas group (DD-01)

`components/{AskTheGraph,FloatingChat,JourneyBoard,GraphCanvas,JourneyCanvas}.module.css`
(inline `oklch`→§5e, motion resolves via T-01),
`components/JourneyCanvas.tsx` (inline `oklch`→`--edge-arrow`),
`components/{SearchPalette,Typeahead}.tsx` (rgba→§5e, `--rule`→`--border`,
`--accent-bg` real, remove `#eef`/`#1a73e8`), `styles/chat.css`
(motion — resolves via T-01, likely no edit), `components/Modal.tsx`
(scrim rgba→`color-mix`), `components/SidePanel.module.css`
(`#e0e0e0`→`--border`, rgba→§5e), `components/SLAchip.module.css`
(motion), `components/DomainComparisonModal.module.css` (rgba).

- **Files**: the above shared components, in ≤3-file batches
- **Complexity**: moderate
- **Traces**: FR-02, DD-01, AC-02
- **Verification**: `design-conformance.ts --view` PASS on each file in this group; `git diff` token/`color-mix` swaps only (no prop/API change — these are shared by studio consumers, design §11)

## T-04g — Token sweep: shared components — kpi/sla/persona/charts group (DD-01)

`components/{DomainCard,HealthDashboard,HealthDistributionChart,KpiDashboard,KpiMeasurements,KpiTrendChart,QueryBuilder,SlaBreachChart,SlaDashboard}.tsx`
(`--success`→`--good`, soft family, rgba→§5e),
`components/{KpiDashboard,PersonaAssignment,PersonaCrud,PersonaDetail,SlaBreaches,SlaDashboard}.module.css`
+ `components/charts/KpiCard.module.css` (soft/interaction families +
`--success`→`--good`; the `charts/` entry proves the sweep recurses).

- **Files**: the above shared components, in ≤3-file batches
- **Complexity**: moderate
- **Traces**: FR-02, DD-01, AC-02
- **Verification**: `design-conformance.ts --view` PASS on each file in this group incl. `components/charts/KpiCard.module.css`; `git diff` token swaps only

## T-05 — CI sweep script (DD-07)

Add `scripts/ux-conformance-sweep.sh`: enumerate the in-scope set by
**recursive `find`** (views `.tsx`+`.module.css`, `components/**` incl.
`charts/`, `styles/*`, `_shared.*`), run `design-conformance.ts --view`
on each, exit non-zero on any FAIL. Waive `tokens.css`; exclude
`model/**` + `exec/Performance*`.

- **Files**: `scripts/ux-conformance-sweep.sh`
- **Complexity**: simple
- **Traces**: FR-07, DD-07, AC-03
- **Verification**: `bun run scripts/ux-conformance-sweep.sh` exits 0 after T-03/T-04*; a temporary injected hex in `components/charts/KpiCard.module.css` (nested) makes it exit non-zero (revert after) — proves recursion (C-03). `manual: shell — confirm model/** paths and tokens.css are not in the failing set`

## T-06a..T-06i — ARIA landmark sweep, one task per surface (DD-04, B-02)

Wrap each in-scope view root in `ViewRegion` (or confirm an equivalent
landmark) with a meaningful `aria-label`. **One task per surface**, each
a coherent verifiable slice batched in ≤3-file groups, each with a
`git diff` check that only a wrapping element + `aria-label` was added
(no data-flow/structure change — B-02/FR-08):

- **T-06a explorer** (14 roots) · **T-06b chat** (10) · **T-06c ontology** (13) · **T-06d sme** (4) · **T-06e analytics** (9) · **T-06f api** (3) · **T-06g exec** (12) · **T-06h data** (2) · **T-06i admin** (3) — total **70**.
- **Complexity**: simple each (mechanical)
- **Traces**: FR-05, DD-04, AC-07
- **Verification (each)**: `pwa/src/__tests__/ux-conformance/aria-landmarks.test.tsx` filtered to the surface — assert each root carries specced `role`/`aria-label`; `git diff` shows only the `ViewRegion` wrap. Full-suite run asserts 70/70 and exactly one `<main>`.

## T-07a..T-07i — View-state sweep, one task per surface (DD-03, B-02)

Wrap each **data-fetching** in-scope view (per the §5c matrix) in
Loading / EmptyState / ErrorState / ready; static/`n/a` views skipped per
DV-01. **One task per surface**, ≤3-file batches, each with a `git diff`
check confirming only state-wrapping was added around the existing fetch
(fetch calls unchanged — B-02/FR-08):

- **T-07a explorer** · **T-07b chat** (AgentChat/MessageList/Thread only) · **T-07c ontology** · **T-07d sme** · **T-07e analytics** · **T-07f api** (Import/Endpoints/Errors error-only) · **T-07g exec** · **T-07h data** (Map) · **T-07i admin**. The `empty: n/a` set (§5c/DV-01) is skipped with rationale.
- **Complexity**: moderate each
- **Traces**: FR-01, DD-03, DV-01, AC-01
- **Verification (each)**: `pwa/src/__tests__/ux-conformance/view-states.test.tsx` filtered to the surface — per fetching view mock fetch pending/reject/`[]`/data, assert the four state markers; reuse the surface's `error-scenarios/**` as the error oracle; `git diff` shows only state-wrap (fetch logic byte-unchanged inside)

## T-08 — Responsiveness sweep (DD-08)

Fix in-scope views that clip/overflow below the existing breakpoints to
reflow using the **existing** breakpoint widths (§8a allowlist:
1100/1080/920/900/720px). Introduce no new breakpoint.

- **Files**: in-scope `*.module.css` with overflow issues (identified during sweep)
- **Complexity**: moderate
- **Traces**: FR-04, DD-08, AC-06
- **Verification**: `pwa/src/__tests__/ux-conformance/no-new-breakpoints.test.ts` — assert every `@media` width in in-scope CSS is on the §8a allowlist; `manual: iPhone Safari (touch) — load #/exec/risk, expect no horizontal scroll, content stacks`

## T-09 — Gesture + keyboard verify-vs-fix (DD-09, FR-03) — resolves N-02

Walk the design §9 verify-vs-fix matrix: for each `verify-only` surface
confirm suppression is present (grep + playwright); for each
`fix-if-absent` surface add the missing `touch-action`/`overscroll-behavior`/
edge-guard **only if the grep shows it absent**. No gesture semantics
change. Append a DV row for any fix that fires.

- **Files**: only the §9 `fix-if-absent` rows that actually lack suppression (candidates: `ontology/Erd.module.css`, `data/Map` CSS, canvas-route body CSS)
- **Complexity**: moderate
- **Traces**: FR-03, DD-09, AC-04, AC-05
- **Verification**: reuse `pwa/playwright/canvas-gestures.ipad.spec.ts` + `keyboard-nav.spec.ts` (green); `manual: iPad Safari (touch) — pinch on #/explorer/journey-graph/<seed-id>, expect canvas zooms and page does NOT zoom; two-finger drag, expect canvas pans, page does NOT scroll`

## T-10 — Navigation verify-vs-fix (DD-05, FR-06)

Verify `route.ts` + `index.tsx` byte-unchanged; walk the §10 route-family
matrix confirming each in-scope deep-link cold-load renders
ready/empty/error (never blank); fix any blank-panel cold-load inside the
view (reuse `NotFoundPanel`), not the router.

- **Files**: (verify) `pwa/src/route.ts`, `pwa/src/views/index.tsx`; view cold-load paths if a gap is found
- **Complexity**: simple
- **Traces**: FR-06, DD-05, AC-08, AC-09
- **Verification**: `pwa/src/__tests__/ux-conformance/route-verbatim.test.ts` — assert `git diff` on route files empty + tab ids match blueprint/baseline; reuse `pwa/src/__tests__/deep-link.test.tsx`

## T-11 — Full-PWA green gate + behavior-preservation proof (DD-06)

Final sweep: `ux-conformance-sweep.sh` green across ALL in-scope files
INCLUDING a read-only confirmation pass over the now-landed studio
`model/**` views; the entire existing `bun test pwa/` suite passes
unchanged; typecheck + bundle-check + no-auth-grep + scope-diff clean.

- **Files**: none (gate only); STATUS.md update
- **Complexity**: simple (aggregation)
- **Traces**: FR-07, FR-08, DD-06, AC-03, AC-10, AC-11, AC-12
- **Verification**: `bun run scripts/ux-conformance-sweep.sh` exits 0; `bun run scripts/stitch-tokens-to-css.ts --check` exits 0; `bun run scripts/design-conformance.ts --view pwa/src/views/model/*.tsx` PASS (read-only, no edits); `bun test pwa/` all pass; `bun run typecheck` exits 0; `bun run bundle-check` ≤ 300 KB; `pwa/src/__tests__/no-auth-grep.test.ts` passes; `git diff --name-only HEAD` shows only `pwa/**`, `.claude/stitch/design-system.yaml`, `scripts/{stitch-tokens-to-css.ts,ux-conformance-sweep.sh}`, `pwa/src/styles/companygraph/tokens.css`, and spec artifacts

## Dependency order

```
T-01 (token source ─ yaml + regen) ─┐
                                     ├─> T-03 (multi-swatch ramps) ─┐
T-02 (shared prims) ─────────────────┤                             │
                                     ├─> T-04a..g (per-surface ─────┤
                                     │            token sweeps)     │
                                     │                              ├─> T-05 (sweep script)
                                     │                              │        │
                                     └─> T-06a..i (ARIA, per surf) ─┤        ├─> T-08 (responsive)
                                         T-07a..i (states, per surf)┘        ├─> T-09 (gestures)
                                          (use T-02 prims)                   ├─> T-10 (nav)
                                                                             └─> T-11 (full gate)
```

T-01 + T-02 are independent and land first. T-03/T-04* depend on T-01's
tokens. T-05 depends on the token tasks. T-06*/T-07* depend on T-02's
shared primitives; they run per surface (≤3-file batches) so each is a
reviewable slice. T-11 depends on everything and on the studio build
having landed.
