---
feature: "pwa-ux-conformance"
created: "2026-07-04"
author: "frank"
status: "revised"
revision: 2
size: "large"
depends_on: ["process-explorer-ui", "model-workspace-core", "story-spec-core", "business-model-authoring", "key-activity-optimizer", "ddd-system-modeling", "kpi-impact-mapping", "kpi-okr-performance-dashboards", "requirements-export"]
---

# Design: pwa-ux-conformance

> **Revision 2 (2026-07-04)** — resolves review-spec.md B-01, B-02, B-03,
> C-01, C-02, C-03, C-04, and nits N-01..N-03. The load-bearing change is
> the **complete re-run of the UX-02 sweep across every in-scope file**
> (views `.tsx` + their `*.module.css` + shared `components/**` +
> `styles/*`), which raised the true failing set from the 16 view `.tsx`
> catalogued in rev 1 to **56 flagged files (55 to remediate + the
> waived auto-generated `tokens.css`)** (§4, §5, §5b). The view count is
> corrected from 73 to **70** throughout (B-03).

## 1. Approach

The remediation is **token-source first, then shared-primitive, then
per-surface sweep**. Four consistency mechanisms carry the bulk of the
work so that no file is fixed ad hoc:

1. **UX-02 token catalog closure (DD-01, DD-02)** — one edit to the
   token *source* (`.claude/stitch/design-system.yaml`, then regenerate
   `tokens.css`) adds every missing token family: the semantic-ramp
   tokens (`--sev-*`, `--cat-*`), the tint/soft family
   (`--good-soft`, `--warn-soft`, `--danger-soft`, `--muted-soft`,
   `--info`, `--info-soft`, `--accent-bg`), the interaction family
   (`--hover`, `--accent-hover`, `--accent-fg`, `--ent-color`), the
   motion family (`--dur-fast`, `--dur-base`, `--ease-out`,
   `--ease-linear`, `--ease-in-out`), and the pure-rename **aliases**
   (`--success`→`--good`, `--rule`→`--border`, …) via the generator's
   `legacy_aliases` bridge. After regeneration every currently-undeclared
   `var(--…)` reference resolves; every raw hex maps to a named token.
2. **UX-01 state helpers (DD-03)** — reuse `_shared.tsx`'s `Loading` /
   `ErrorState`; add one small `EmptyState` helper so every
   data-fetching view renders the four canonical states the same way.
3. **UX-05 landmark pattern (DD-04)** — one `ViewRegion` landmark
   wrapper added to `_shared.tsx` that every in-scope view root adopts.
4. **UX-03/04/06 verify-and-close** — the behavior largely already
   conforms (it shipped under process-explorer-ui / the baseline); this
   spec confirms it per-view with the **verify-vs-fix matrices in §9
   (gestures) and §10 (routing/deep-link)** — no more asserted "already
   conforms" (C-01). Each row cites a concrete verification.

The design maps every FR to concrete files, pins the fix per failing
file (§5 + §5b), publishes the per-view state matrix (§5c) and the
gesture/routing verify-vs-fix matrices (§9, §10), and carries a
Deviations register.

### Token-source-not-CSS rule (C-02)

`pwa/src/styles/companygraph/tokens.css` is **auto-generated** — its own
header reads *"DO NOT EDIT BY HAND. Edit design-system.yaml and run
`bun run scripts/stitch-tokens-to-css.ts`."* All token additions in this
spec (DD-01 aliases, DD-02 ramps + families) are made to the **source**
`.claude/stitch/design-system.yaml` and the CSS is **regenerated**. A
hand-edit to `tokens.css` would be reverted on the next generate and is
forbidden (T-01 Verification asserts `stitch-tokens-to-css.ts --check`
passes, i.e. the committed CSS matches the source).

## 2. Design Decisions

| ID | Decision | Serves | Rationale |
|----|----------|--------|-----------|
| DD-01 | **Pure-rename aliases via `legacy_aliases`.** Add to `design-system.yaml`'s `legacy_aliases:` block (emitted by the generator as `--legacy: var(--canonical)` in a second `:root`) the rename bridges in the §5a table: `--success`→`--good`, `--warning`→`--warn`, `--rule`→`--border`, `--chip-bg`/`--bg-subtle`/`--bg-2`→`--surface-2`, `--text`→`--fg`, `--tone-good/-warn/-danger/-accent/-neutral`→`--good/--warn/--danger/--accent/--muted`, `--warn-bg`/`--warning-bg`/`--warning-bg-hover`→`--warn-soft`, `--warn-fg`/`--warning-fg`→`--warn-text`, `--warning-border`→`--warn`, `--success-subtle`/`--success-soft`→`--good-soft`, `--danger-subtle`→`--danger-soft`, `--border-subtle`→`--border`. `.tsx` inline-style references are additionally rewritten to the canonical token in the same task (1-line swaps); `.module.css` files rely on the alias bridge (no structural rewrite, honoring FR-08). | FR-02 | Every alias has a semantically-correct declared equivalent. The bridge makes undeclared refs resolve without a mass CSS rewrite; canonical rewrites in `.tsx` keep new code clean. |
| DD-02 | **Central catalog extension** in `design-system.yaml` (regenerated to `tokens.css`) for the token families that are genuine gaps, not renames. Four groups, all added **once**: (a) **semantic ramps** — `--sev-1..--sev-5` (ordinal severity) + `--cat-1..--cat-6` (categorical status/node-type); (b) **tint/soft family** — `--good-soft`, `--warn-soft`, `--danger-soft`, `--muted-soft`, `--info`, `--info-soft`, `--accent-bg`; (c) **interaction family** — `--hover`, `--accent-hover`, `--accent-fg`, `--ent-color` (base default, overridden inline); (d) **motion family** — `--dur-fast`, `--dur-base`, `--ease-out`, `--ease-linear`, `--ease-in-out`. Concrete OKLCH/duration values + the per-swatch mapping are pinned in §5d. **Resolves OQ-1: chosen approach is (b) — add named ramps, keep swatches distinct.** | FR-02, FR-07 | Collapsing distinct category swatches onto a single `--danger`/`--warn` would destroy the heatmap/ERD/status category identities the views encode. The motion/tint/interaction tokens are referenced by shipped CSS but were never declared — a real catalog gap, closed centrally. |
| DD-03 | Add `EmptyState({ what })` to `pwa/src/views/_shared.tsx` — mirrors `Loading`/`ErrorState`, renders a `data-testid="empty-state"` panel. Data-fetching views render it on zero results per §5c. | FR-01 | Uniform empty state, one testid, no per-view divergence. Additive to `_shared.tsx`. |
| DD-04 | Add `ViewRegion({ label, children })` to `_shared.tsx` — wraps a view body in `<section role="region" aria-label={label}>`, nested inside the shell's existing `<main>`; never a second `<main>`. Every in-scope view root adopts it. | FR-05 | Single ARIA-landmark pattern; raises coverage to 70/70 without bespoke per-view ARIA. |
| DD-05 | **No route changes.** `route.ts` + `index.tsx` are verified byte-unchanged (AC-08 `git diff`). UX-06 gaps are fixed only inside a view's cold-load render path (reusing `NotFoundPanel`), never in the router. | FR-06 | Routing already conforms to the View Tree verbatim; touching the router would risk the studio specs that co-own registration. |
| DD-06 | **No behavior change is a hard constraint.** The existing `pwa/**/__tests__` suite (§6) is the behavior oracle; it must pass unchanged. Any required existing-test edit is a Deviation (§7). New tests live under `pwa/src/__tests__/ux-conformance/`. Every per-surface remediation task carries a `git diff` behavior-preservation check (B-02). | FR-08 | A green existing suite proves data-flow/behavior preserved; per-surface granularity is where a silent structural rewrite would otherwise hide. |
| DD-07 | **CI sweep script** `scripts/ux-conformance-sweep.sh` enumerates the in-scope set by **recursive `find`** (not a shallow glob — C-03) over `pwa/src/views/{explorer,chat,ontology,sme,analytics,api,exec,data,admin}/**` (`.tsx` + `.module.css`), `pwa/src/components/**` (incl. `charts/`), `pwa/src/styles/*.css`, and `pwa/src/views/_shared.*`; runs `design-conformance.ts --view` on each; exits non-zero on any FAIL. Explicitly excludes `pwa/src/views/model/**`, `exec/Performance*`, and **waives `pwa/src/styles/companygraph/tokens.css`** (its declared `oklch()` values are token *definitions*, not literals — see §4 note). | FR-07 | One command CI can gate; recursion reaches nested `components/charts/`; the exclusion encodes the scope boundary in code. |
| DD-08 | **Responsiveness = existing breakpoints only.** No *new* `@media` widths. `no-new-breakpoints.test.ts` allowlists exactly the width values already present in the tree as of rev 2 — `1100px`/`1080px` (from `--collapse-at`/`--collapse-at-2col`) plus the pre-existing `720px`, `900px`, `920px` (§8a). Any `@media (max-width: …)` at a width **not** on that allowlist fails. Overflow fixes reuse existing widths. | FR-04 | Enforces UX-04 "no new breakpoints" mechanically against the *real* current breakpoint set, not an idealized 2-value set. |

## 3. FR → file-change map

| FR | Allowance | Files touched (representative) | Nature |
|----|-----------|-------------------------------|--------|
| FR-01 | UX-01 view states | `pwa/src/views/_shared.tsx` (+`EmptyState`); each data-fetching view in §5c + its `*.module.css` | Wrap fetch results in Loading/Empty/Error/Ready |
| FR-02 | UX-02 tokens | `.claude/stitch/design-system.yaml` + regenerated `tokens.css` (DD-01/DD-02, once); the **55 files to remediate** in §5 + §5b | Token-source closure + alias rename + central ramp/family |
| FR-03 | UX-03 input | canvas/search files in §9 (+ their CSS) | Confirm/close gesture + key suppression per §9 verify-vs-fix |
| FR-04 | UX-04 responsive | in-scope `*.module.css` with overflow below existing breakpoints | Reflow using existing breakpoint widths (§8a) |
| FR-05 | UX-05 a11y | `_shared.tsx` (+`ViewRegion`); every in-scope view root (70) | Landmark + label wrap |
| FR-06 | UX-06 nav | (verify) `route.ts`, `index.tsx` unchanged; cold-load render paths per §10 | Verify + close blank-panel gaps |
| FR-07 | UX-02 gate | `scripts/ux-conformance-sweep.sh` (new) | CI sweep across the full in-scope set |
| FR-08 | remediation | existing `pwa/**/__tests__` (pass unchanged); new `pwa/src/__tests__/ux-conformance/**` | Behavior oracle + per-surface `git diff` |

## 4. In-scope view inventory (70 view files, re-verified 2026-07-04)

Grouped by surface. Studio-owned `model/**` (3 files present:
`ModelWorkspace`, `StoryCatalog`, `ModelTabPlaceholder`) and any
`exec/Performance*` (not present yet — studio not landed; N-03) are
**excluded** from every count below.

| Surface | Views | Count | UX-02 view-`.tsx` fails today |
|---------|-------|-------|-------------------------------|
| explorer | Activities, DomainComparisonInline, DomainDetail, DomainDetailSlide, Domains, Journey, JourneyComparisonInline, JourneyDetailSlide, JourneyGraph, Locations, Path, ProductDetail, Roles, Systems | 14 | Activities, DomainDetail, Journey, JourneyDetailSlide, Path (5) |
| chat | AgentChat, BookmarkMenu, Citation, LatencyFooter, MessageList, ReasoningDisclosure, RolePicker, SidePanel, SuggestedPrompts, Thread | 10 | none |
| ontology | AddEdgeModal, AddEntityModal, Audit, Catalog, ComplianceManager, Edges, Editor, Erd, ErdErrorBoundary, GlossaryManager, OntologyGenerator, RollbackModal, Versions | 13 | Catalog, Editor, Erd (3) |
| sme | Add, Home, Quarterly, Review | 4 | Quarterly, Review (2) |
| analytics | Ai, Complexity, Consolidation, CriticalPaths, Matrix, Overview, Settings, SingleSystem, Systems | 9 | none |
| api | Endpoints, Errors, Import | 3 | none |
| exec | ContextAlignment, Finance, KpiManagement, OkrManagement, Ops, People, ProgramManagement, Risk, RiskDashboard, RollDown, RollDownAnalytics, Transform | 12 | ContextAlignment, Risk, RiskDashboard (3) |
| data | Export, Map | 2 | none |
| admin | Personas, RbacRoles, UserAssignments | 3 | Personas, RbacRoles, UserAssignments (3) |
| **view `.tsx` total** | | **70** | **16 view `.tsx`** |

**Shared primitives (also in scope, gated by FR-07/AC-03):**
`pwa/src/views/_shared.{tsx,module.css}`, `pwa/src/components/**`
(`.tsx` + `.module.css`, incl. `components/charts/`),
`pwa/src/styles/{chat.css, companygraph/index.css}`.

**Totals (B-01 — true failing set from a complete sweep, 2026-07-04):**
Running `design-conformance.ts --view` over all **198 in-scope files**
(70 view `.tsx` + their `.module.css` + shared `components/**` +
`styles/*` + `_shared.*`) yields **56 flagged files**, of which
`tokens.css` is **waived** (see note), leaving **55 files to remediate**:

| Bucket | Flagged files |
|--------|---------------|
| view `.tsx` | 16 |
| in-scope view `*.module.css` | 10 |
| shared `components/**` (`.tsx` + `.module.css` incl. `charts/`) | 28 |
| `pwa/src/styles/chat.css` | 1 |
| **remediation subtotal** | **55** |
| `pwa/src/styles/companygraph/tokens.css` (waived — see note) | 1 |
| **total flagged** | **56** |

> **`tokens.css` note (C-03/DD-07).** The 56th flagged file is
> `pwa/src/styles/companygraph/tokens.css` (24 "inline `oklch()`") — but
> those are the token *definitions*, not literals in consuming code. The
> sweep script **waives** `tokens.css` (it is the source-of-truth CSS,
> auto-generated). It is therefore NOT in the 55-file remediation set.

ARIA coverage today: ~14 of 70 view roots carry any `aria-*`/`role`.

## 5. Per-file UX-02 remediation matrix — view `.tsx` (16)

Derived from re-running `design-conformance.ts --view` on 2026-07-04.
Each row: exact finding → the fix (§5a alias, §5d ramp, or §5d family).

| # | View | Finding (verbatim) | Fix |
|---|------|--------------------|-----|
| 1 | `admin/Personas.tsx` | 1 hex `#c0392b` | `#c0392b` → `var(--danger)` (§5a) |
| 2 | `admin/RbacRoles.tsx` | 1 hex `#c0392b` | → `var(--danger)` (§5a) |
| 3 | `admin/UserAssignments.tsx` | 1 hex `#c0392b` | → `var(--danger)` (§5a) |
| 4 | `exec/ContextAlignment.tsx` | unknown `--tone-good/-warn/-danger/-accent/-neutral` | → `--good/--warn/--danger/--accent/--muted` canonical rewrite (§5a) |
| 5 | `exec/Risk.tsx` | 4 hex `#f59e0b,#3b82f6,#8b5cf6,#22c55e` | status ramp → `--cat-1..--cat-4` (§5d) |
| 6 | `exec/RiskDashboard.tsx` | 8 hex (status + severity swatches) | status → `--cat-1..--cat-4`; severity → `--sev-1..--sev-4` (§5d) |
| 7 | `explorer/Activities.tsx` | unknown `--rule, --chip-bg` | → `--border, --surface-2` (§5a) |
| 8 | `explorer/DomainDetail.tsx` | unknown `--success` | → `--good` (§5a) |
| 9 | `explorer/Journey.tsx` | 3 hex `#fff4d6,#d28a00,#5a3d00` + unknown `--warn-bg,--warn-fg` | warn ribbon → `--warn-soft`/`--warn-text`/`--warn` (§5a + §5d tint) |
| 10 | `explorer/JourneyDetailSlide.tsx` | unknown `--success,--success-subtle,--danger-subtle,--bg-subtle` | → `--good,--good-soft,--danger-soft,--surface-2` (§5a) |
| 11 | `explorer/Path.tsx` | 1 hex `#fafafa` + unknown `--rule,--bg-2` | `#fafafa`→`var(--surface-2)`; `--rule`→`--border`; `--bg-2`→`--surface-2` (§5a) |
| 12 | `ontology/Catalog.tsx` | unknown `--bg-subtle` | → `--surface-2` (§5a) |
| 13 | `ontology/Editor.tsx` | unknown `--bg-subtle,--text` | → `--surface-2,--fg` (§5a) |
| 14 | `ontology/Erd.tsx` | 5 hex (node-type colors) + unknown `--tone-*,--bg-subtle,--good-soft,--warn-soft` | node-type → `--cat-1..--cat-5` (§5d); `--good-soft`/`--warn-soft` now real (§5d tint); `--tone-*`/`--bg-subtle` → §5a |
| 15 | `sme/Quarterly.tsx` | 2 hex `#22c55e,#ef4444` | → `--good,--danger` (§5a) |
| 16 | `sme/Review.tsx` | 6 hex (node-type/status swatches) | node-type → `--cat-1..--cat-6` (§5d) |

## 5b. Per-file UX-02 remediation matrix — CSS modules + shared components (39)

The remaining 39 failing files (10 in-scope view `.module.css`, 28 shared
`components/**`, 1 `styles/chat.css`). Each carries a concrete fix. Where
a fix is "alias bridge (§5a)" the token resolves after T-01 with **no
edit to the file** (the `legacy_aliases` bridge covers it); where a raw
literal is present the file is edited in the surface's token task.

### In-scope view `*.module.css` (10)

| # | File | Finding | Fix |
|---|------|---------|-----|
| 17 | `explorer/Journey.module.css` | unknown `--dur-fast,--ease-out` | motion family (§5d) — resolves via T-01, no file edit |
| 18 | `explorer/JourneyGraph.module.css` | 4 inline `oklch()`; unknown `--danger-soft,--warn-soft` | inline `oklch()`→ mapped tokens (§5e); `--danger-soft`/`--warn-soft` now real (§5d) |
| 19 | `explorer/DomainComparisonInline.module.css` | 1 rgba | rgba → `color-mix(in oklch, var(--border) …)` per §5e |
| 20 | `explorer/DomainDetailSlide.module.css` | 1 rgba | rgba → §5e |
| 21 | `explorer/JourneyComparisonInline.module.css` | 1 rgba | rgba → §5e |
| 22 | `explorer/JourneyDetailSlide.module.css` | 1 rgba | rgba → §5e |
| 23 | `ontology/Erd.module.css` | 3 rgba + 6 inline `oklch()`; unknown `--ent-color,--warn-soft,--warning-bg/-fg/-border/-bg-hover,--accent-fg,--accent-hover` | inline `oklch()`/rgba → §5e; unknown tokens: `--ent-color` base + `--accent-fg/-hover` real (§5d), `--warning-*` alias bridge (§5a) |
| 24 | `ontology/AddEdgeModal.module.css` | 1 rgba | rgba → §5e |
| 25 | `ontology/AddEntityModal.module.css` | 1 rgba | rgba → §5e |
| 26 | `ontology/RollbackModal.module.css` | 1 rgba | rgba → §5e |

### Shared `components/**` (28)

Shared components predate this spec and are consumed across surfaces
(some by the studio-owned `model/**` views — see §11 coordination note).
They are remediated here because they are shared primitives explicitly in
FR-07 scope.

| # | File | Finding | Fix |
|---|------|---------|-----|
| 27 | `components/AskTheGraph.module.css` | 5 inline `oklch()`; unknown `--dur-fast,--ease-out` | inline `oklch()` → §5e; motion → §5d |
| 28 | `components/DomainCard.tsx` | unknown `--success` | → `--good` (§5a) |
| 29 | `components/DomainComparisonModal.module.css` | 2 rgba | § 5e |
| 30 | `components/FloatingChat.module.css` | 5 inline `oklch()`; unknown `--dur-fast,--ease-out` | §5e + §5d |
| 31 | `components/GraphCanvas.module.css` | unknown `--dur-base,--ease-linear,--dur-fast,--ease-out` | motion family (§5d) — resolves via T-01 |
| 32 | `components/HealthDashboard.tsx` | unknown `--success` | → `--good` (§5a) |
| 33 | `components/HealthDistributionChart.tsx` | 1 rgba | §5e |
| 34 | `components/JourneyBoard.module.css` | unknown `--dur-fast,--ease-out` | motion (§5d) |
| 35 | `components/JourneyCanvas.module.css` | unknown `--dur-fast,--ease-out,--dur-base,--ease-linear` | motion (§5d) |
| 36 | `components/JourneyCanvas.tsx` | 1 inline `oklch()` (`fill="oklch(36% 0.12 250)"`) | → a declared arrow token `--edge-arrow` (§5d) or `var(--muted)` per §5e |
| 37 | `components/KpiDashboard.module.css` | 1 rgba | §5e |
| 38 | `components/KpiDashboard.tsx` | unknown `--success,--success-soft,--danger-soft,--muted-soft` | → `--good` + soft family (§5a/§5d) |
| 39 | `components/KpiMeasurements.tsx` | unknown `--success` | → `--good` (§5a) |
| 40 | `components/KpiTrendChart.tsx` | 1 rgba; unknown `--success` | §5e + `--good` (§5a) |
| 41 | `components/Modal.tsx` | 1 rgba (scrim) | scrim → `color-mix(in oklch, var(--fg) 45%, transparent)` (§5e) |
| 42 | `components/PersonaAssignment.module.css` | unknown `--danger-soft,--success-soft,--success` | soft family (§5d) + `--good`/`--good-soft` (§5a) |
| 43 | `components/PersonaCrud.module.css` | unknown `--danger-soft,--hover` | `--danger-soft` + `--hover` real (§5d) |
| 44 | `components/PersonaDetail.module.css` | unknown `--info-soft,--info,--muted-soft,--success-soft,--success,--warning-soft,--warning,--danger-soft` | info + soft families real (§5d); `--success`→`--good`, `--warning`→`--warn`, `--*-soft` bridged (§5a) |
| 45 | `components/QueryBuilder.tsx` | unknown `--bg-subtle,--text,--danger-subtle,--border-subtle` | → `--surface-2,--fg,--danger-soft,--border` (§5a) |
| 46 | `components/SLAchip.module.css` | unknown `--ease-in-out` | motion (§5d) |
| 47 | `components/SearchPalette.tsx` | 2 rgba; unknown `--rule,--accent-bg` | rgba → §5e; `--rule`→`--border`; `--accent-bg` real (§5d). Remove `#eef` fallback in `var(--accent-bg, #eef)` |
| 48 | `components/SidePanel.module.css` | 3 hex `#e0e0e0`; 2 rgba | `#e0e0e0`→`var(--border)`; rgba → §5e |
| 49 | `components/SlaBreachChart.tsx` | 1 rgba; unknown `--success` | §5e + `--good` (§5a) |
| 50 | `components/SlaBreaches.module.css` | unknown `--success` | → `--good` (§5a bridge) |
| 51 | `components/SlaDashboard.module.css` | 1 rgba | §5e |
| 52 | `components/SlaDashboard.tsx` | unknown `--success,--success-soft,--danger-soft` | → `--good` + soft family (§5a/§5d) |
| 53 | `components/Typeahead.tsx` | 1 hex `#1a73e8`; 1 rgba; unknown `--rule,--accent-bg` | `#1a73e8`→`var(--accent)`; rgba → §5e; `--rule`→`--border`; `--accent-bg` real (§5d). Remove `#eef` fallback |
| 54 | `components/charts/KpiCard.module.css` | unknown `--success` | → `--good` (§5a bridge) — **nested `charts/` dir; proves C-03 recursion** |

### `styles/*` (1)

| # | File | Finding | Fix |
|---|------|---------|-----|
| 55 | `styles/chat.css` | unknown `--dur-base,--ease-out,--dur-fast` | motion family (§5d) — resolves via T-01, no file edit |

> **Not remediated here:** `pwa/src/styles/companygraph/index.css` passes
> today; `pwa/src/styles/companygraph/tokens.css` is waived (see §4 note).

After T-01 (token source) + the per-surface token tasks (T-03..T-04g),
all 55 remediation files pass; the sweep (FR-07/AC-03) confirms the full
198-file in-scope set (tokens.css waived).

## 5a. Alias → canonical map (DD-01)

Added to `legacy_aliases:` in `design-system.yaml`; emitted as
`--legacy: var(--canonical)` in `tokens.css`. Every reference then
resolves; `.tsx` inline styles are additionally rewritten to the
canonical name in the owning surface task.

| Legacy token | Canonical | Legacy token | Canonical |
|--------------|-----------|--------------|-----------|
| `--success` | `--good` | `--warning` | `--warn` |
| `--rule` | `--border` | `--border-subtle` | `--border` |
| `--chip-bg` | `--surface-2` | `--bg-subtle` | `--surface-2` |
| `--bg-2` | `--surface-2` | `--text` | `--fg` |
| `--tone-good` | `--good` | `--tone-warn` | `--warn` |
| `--tone-danger` | `--danger` | `--tone-accent` | `--accent` |
| `--tone-neutral` | `--muted` | `--warn-bg` | `--warn-soft` |
| `--warn-fg` | `--warn-text` | `--warning-bg` | `--warn-soft` |
| `--warning-fg` | `--warn-text` | `--warning-border` | `--warn` |
| `--warning-bg-hover` | `--warn-soft` | `--warning-soft` | `--warn-soft` |
| `--success-subtle` | `--good-soft` | `--success-soft` | `--good-soft` |
| `--danger-subtle` | `--danger-soft` | `--info-soft` | `--info-soft`* |

*`--info`/`--info-soft` are new real tokens (§5d), not aliases.

Raw-hex → canonical (single-swatch, non-ramp): `#c0392b`→`--danger`;
`#fafafa`→`--surface-2`; `#e0e0e0`→`--border`; `#1a73e8`→`--accent`;
`#22c55e`→`--good`; `#ef4444`→`--danger` (where a single semantic red is
meant, e.g. `sme/Quarterly`).

## 5d. New-token declarations (DD-02) — concrete values

Added to `design-system.yaml` `colors:` (and a new `motion:` group +
generator support) and regenerated. **OQ-1 is resolved here: named ramps
added, swatches kept distinct.**

### Semantic ramps

`--cat-*` is a **categorical** ramp (distinguishable, non-ordinal — for
status / node-type). `--sev-*` is an **ordinal severity** ramp
(low→critical). Both keep the 8/5/6/4 raw swatches distinguishable.

| Token | OKLCH | Replaces (per-hex) |
|-------|-------|--------------------|
| `--cat-1` | `oklch(70% 0.16 75)` (amber) | `#f59e0b` (open / Role / warn node) |
| `--cat-2` | `oklch(62% 0.17 255)` (blue) | `#3b82f6` (mitigating / Activity) |
| `--cat-3` | `oklch(58% 0.19 300)` (violet) | `#8b5cf6` (accepted / Domain) |
| `--cat-4` | `oklch(64% 0.16 145)` (green) | `#22c55e` (resolved / UserJourney / good node) |
| `--cat-5` | `oklch(60% 0.02 250)` (slate) | `#64748b` (neutral fallback) |
| `--cat-6` | `oklch(66% 0.16 200)` (sky) | `#0ea5e9` (accent node, Erd) |
| `--sev-1` | `oklch(64% 0.16 145)` (green — low) | `#22c55e` (low) |
| `--sev-2` | `oklch(75% 0.15 95)` (yellow — medium) | `#eab308` (medium) |
| `--sev-3` | `oklch(70% 0.17 55)` (orange — high) | `#f97316` (high) |
| `--sev-4` | `oklch(60% 0.22 25)` (red — critical) | `#ef4444` (critical) |
| `--sev-5` | `oklch(48% 0.20 20)` (deep red — reserved) | (headroom; no current swatch) |

### Per-view swatch → token mapping (the 4 multi-swatch views)

| View | Raw hex → token |
|------|-----------------|
| `exec/RiskDashboard` | status: `#f59e0b`→`--cat-1`, `#3b82f6`→`--cat-2`, `#8b5cf6`→`--cat-3`, `#22c55e`→`--cat-4`; severity: `#ef4444`→`--sev-4`, `#f97316`→`--sev-3`, `#eab308`→`--sev-2`, `#22c55e`(low)→`--sev-1` |
| `exec/Risk` | `#f59e0b`→`--cat-1`, `#3b82f6`→`--cat-2`, `#8b5cf6`→`--cat-3`, `#22c55e`→`--cat-4` |
| `ontology/Erd` | `#0ea5e9`→`--cat-6`, `#22c55e`→`--cat-4`, `#f59e0b`→`--cat-1`, `#ef4444`→`--sev-4`, `#64748b`→`--cat-5` |
| `sme/Review` | `#22c55e`→`--cat-4`, `#3b82f6`→`--cat-2`, `#f59e0b`→`--cat-1`, `#ef4444`→`--sev-4`, `#8b5cf6`→`--cat-3`, `#64748b`→`--cat-5` |

### Tint / soft family (light backgrounds for chips/rows)

| Token | OKLCH |
|-------|-------|
| `--good-soft` | `oklch(95% 0.03 145)` |
| `--warn-soft` | `oklch(95% 0.04 80)` |
| `--danger-soft` | `oklch(95% 0.03 25)` |
| `--muted-soft` | `oklch(96% 0.004 250)` |
| `--info` | `oklch(60% 0.14 235)` |
| `--info-soft` | `oklch(95% 0.03 235)` |
| `--accent-bg` | `oklch(96% 0.03 255)` (light accent row highlight; supersedes the `#eef` inline fallback) |

### Interaction family

| Token | OKLCH |
|-------|-------|
| `--hover` | `oklch(97% 0.004 250)` (surface hover) |
| `--accent-hover` | `oklch(52% 0.18 255)` |
| `--accent-fg` | `oklch(100% 0 0)` (text on accent fill) |
| `--ent-color` | `var(--accent)` (base default; ERD overrides inline via `style`) |
| `--edge-arrow` | `oklch(36% 0.12 250)` (canvas edge arrowhead; replaces the `JourneyCanvas.tsx` inline `oklch`) |

### Motion family (new `motion:` group in yaml)

The generator gains a small `motion:` emitter (mirrors `spacing:`),
emitting `--<name>: <value>;`. Values chosen to match the existing
transition feel (quiet, ≤200 ms):

| Token | Value |
|-------|-------|
| `--dur-fast` | `120ms` |
| `--dur-base` | `200ms` |
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--ease-linear` | `linear` |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` |

## 5e. Inline `oklch()` / `rgba()` literal → token map

The checker fails any inline `oklch(<digit>` / `rgba(<digit>` outside
`tokens.css`. Fixes (all resolve to declared tokens, often via
`color-mix` to preserve the tint the literal encoded):

| Literal pattern (observed) | Meaning | Replacement |
|----------------------------|---------|-------------|
| `oklch(18% 0.012 250)` | `--fg` | `var(--fg)` |
| `oklch(98% 0.004 250)` | `--surface-2`-ish light | `var(--surface-2)` |
| `oklch(58% 0.22 25)` / `oklch(60% 0.22 25)` | danger fill | `var(--danger)` |
| `oklch(60% 0.22 25 / 0.08–0.2)` | danger tint | `color-mix(in oklch, var(--danger) 12%, transparent)` (match % to the alpha) |
| `oklch(42% 0.1 250)` / `oklch(36% 0.12 250)` | deep line/arrow | `var(--edge-arrow)` (§5d) |
| `oklch(20% 0.02 250 / 0.2)` | drop shadow | `color-mix(in oklch, var(--fg) 20%, transparent)` |
| `rgba(0,0,0,α)` scrim/shadow | dark scrim | `color-mix(in oklch, var(--fg) <α·100>%, transparent)` |
| `rgba(<accent>,α)` | accent tint | `color-mix(in oklch, var(--accent) <α·100>%, transparent)` |

`color-mix(in oklch, …)` contains no `oklch(<digit>` token and no
`rgba(` — it passes all three checks. Exact per-line alpha values are
read from each file during its surface task and recorded in the task's
completion note.

## 5c. Per-view state matrix (DD-03) — resolves C-04

The enumerated list `view-states.test.tsx` (AC-01) and T-07* iterate.
"fetches?" = does the view issue a data fetch on mount. `n/a` states
carry a rationale (DV-01). "ready" is always present.

| View | fetches? | loading | empty | error | Fix (UX-01) |
|------|----------|---------|-------|-------|-------------|
| explorer/Domains | yes | Loading | EmptyState "no domains" | ErrorState | wrap fetch |
| explorer/DomainDetail | yes | Loading | EmptyState | ErrorState / NotFoundPanel | wrap; 404→NotFoundPanel |
| explorer/Activities | yes | Loading | EmptyState "no activities" | ErrorState | wrap |
| explorer/Journey | yes | Loading | EmptyState | ErrorState | wrap |
| explorer/JourneyDetailSlide | yes | Loading | EmptyState | ErrorState / NotFoundPanel | wrap; 404 path |
| explorer/JourneyGraph | yes | Loading (canvas skeleton) | EmptyState "no graph" | ErrorState | wrap; canvas keeps existing render |
| explorer/Path | yes | Loading | EmptyState "no path" | ErrorState | wrap |
| explorer/Locations | yes | Loading | EmptyState | ErrorState | wrap |
| explorer/Roles | yes | Loading | EmptyState | ErrorState | wrap |
| explorer/Systems | yes | Loading | EmptyState | ErrorState | wrap |
| explorer/ProductDetail | yes | Loading | EmptyState | ErrorState / NotFoundPanel | wrap |
| explorer/{Domain,Journey}ComparisonInline | yes | Loading | EmptyState | ErrorState | wrap |
| explorer/{Domain,Journey}DetailSlide | yes | Loading | EmptyState | ErrorState | wrap |
| chat/AgentChat, MessageList, Thread | yes (SSE/history) | Loading | EmptyState "no messages" | ErrorState | wrap history fetch; SSE errors → ErrorState |
| chat/SidePanel, SuggestedPrompts, RolePicker, BookmarkMenu, Citation, LatencyFooter, ReasoningDisclosure | no | n/a | n/a | n/a | static/derived — DV-01 |
| ontology/Catalog, Edges, Versions, Audit, GlossaryManager, ComplianceManager | yes | Loading | EmptyState | ErrorState | wrap |
| ontology/Editor | yes | Loading | EmptyState | ErrorState | wrap |
| ontology/Erd | yes | Loading | EmptyState "no schema" | ErrorState (+ existing ErdErrorBoundary) | wrap; boundary stays |
| ontology/OntologyGenerator | yes (on submit) | Loading | n/a | ErrorState | wrap generate result |
| ontology/{AddEdge,AddEntity,Rollback}Modal, ErdErrorBoundary | no | n/a | n/a | n/a | modal/boundary — DV-01 |
| sme/Home, Quarterly, Review | yes | Loading | EmptyState | ErrorState | wrap |
| sme/Add | no (form) | n/a | n/a | ErrorState (on submit) | wrap submit |
| analytics/Overview, Complexity, Matrix, Systems, SingleSystem, CriticalPaths, Consolidation, Ai | yes | Loading | EmptyState (Ai already has one — see `analytics-ai-empty-state` test) | ErrorState | wrap; reuse existing empties where present |
| analytics/Settings | no | n/a | n/a | n/a | local prefs — DV-01 |
| api/Endpoints, Errors | yes (OpenAPI) | Loading | n/a (static contract) | ErrorState | DV-01 for empty; error on fetch fail |
| api/Import | no (form) | n/a | n/a | ErrorState (on import) | wrap import result |
| exec/{ContextAlignment,Finance,Ops,People,Transform,ProgramManagement,RollDown,RollDownAnalytics} | yes | Loading | EmptyState | ErrorState | wrap |
| exec/{KpiManagement,OkrManagement} | yes | Loading | EmptyState | ErrorState | wrap (reuse KpiCrud/OkrCrud state) |
| exec/Risk, RiskDashboard | yes | Loading | EmptyState "no risks" | ErrorState | wrap |
| data/Export | no (action) | n/a | n/a | ErrorState (on export) | wrap |
| data/Map | yes | Loading | EmptyState | ErrorState | wrap |
| admin/Personas, RbacRoles, UserAssignments | yes | Loading | EmptyState | ErrorState | wrap |

`empty: n/a` set (DV-01): chat derived/static panels, ontology
modals/boundary, `analytics/Settings`, `api/{Endpoints,Errors}`,
`sme/Add`, `data/Export`, `api/Import`, `ontology/OntologyGenerator`.

## 6. Existing test suite (behavior oracle for FR-08)

The following existing suites MUST pass unchanged after remediation
(AC-10). Any required edit is a §7 Deviation. Representative enumeration
(full run is `bun test pwa/`):

- Explorer: `activity-detail`, `activity-filter`, `deep-link`,
  `domain-index`, `journey-detail`, `system-view`, `find-path`,
  `deterministic-hydration`, `error-scenarios/explorer/**`.
- SME: `bulk-paste`, `bulk-signoff`, `new-journey`,
  `quarterly-checklist`, `sme-review-flag`, `out-of-domain-disable`,
  `error-scenarios/sme/**`.
- Ontology: `ontology/hierarchical-layout`, `layout-performance`,
  `layout-quality`, `error-scenarios/ontology/**`.
- Analytics: `analytics-accent-ramp`, `analytics-ai-empty-state`,
  `analytics-complexity`, `analytics-matrix`, `analytics-system-map`.
- Exec: `exec-kpi-management`, `exec-okr-management`,
  `error-scenarios/exec/**`.
- Chat: `chat/citation-click`, `highlight-canvas`, `latency-footer`,
  `progress-surface`, `sanitise-5-vectors`, `show-reasoning`,
  `side-panel`.
- Shared/routing: `route-parse`, `touch-targets`, `no-auth-grep`,
  store tests, data tests.
- Playwright (reused, extended not replaced): `keyboard-nav`,
  `canvas-gestures.ipad`, `canvas-export.safari`, `canvas-perf`,
  `search`, `lighthouse`, `sw-degradation`.

New tests added by this spec (all under `pwa/src/__tests__/ux-conformance/`):
`view-states.test.tsx` (AC-01), `aria-landmarks.test.tsx` (AC-07),
`no-new-breakpoints.test.ts` (AC-06), `route-verbatim.test.ts` (AC-08),
`shared-primitives.test.tsx` (T-02).

## 7. Deviations register

| ID | View | Allowance | Deviation | Rationale |
|----|------|-----------|-----------|-----------|
| DV-01 | chat derived/static panels, ontology modals + `ErdErrorBoundary`, `analytics/Settings`, `api/{Endpoints,Errors,Import}`, `sme/Add`, `data/Export`, `ontology/OntologyGenerator` | UX-01 (empty/loading) | `empty: n/a` (and `loading: n/a` for pure static) — no fetch or no zero-result case | Growing a dead unreachable state is worse than omitting it (OQ-2). Error still applies where a submit/fetch can fail. Enumerated per view in §5c. |
| DV-02 | `exec/RiskDashboard`, `ontology/Erd`, `sme/Review`, `exec/Risk` | UX-02 (tokens) | Central `--cat-*`/`--sev-*` ramps (DD-02/§5d) rather than per-view mapping to a single token | Distinct category swatches must stay distinguishable; a single `--danger` would collapse them. Still fully tokenized → passes the gate. |
| DV-03 | canvas views on iPhone Safari | UX-03/UX-04 | `degrade` (usable but small) | Matches process-explorer-ui's shipped stance; not a regression. |
| DV-04 | in-scope `*.module.css` referencing motion tokens (`--dur-*`,`--ease-*`) | UX-02 (tokens) | Resolved by adding the token family centrally (§5d), not by editing each CSS file | The files reference a legitimate motion vocabulary that was simply never declared; declaring it once is the minimal, no-behavior-change fix (FR-08). |

Any deviation added during execution appends a row and is called out in
the owning task's completion note.

## 8. Verification strategy

- **UX-02 (FR-02/FR-07)**: deterministic — `design-conformance.ts --view`
  per file (AC-02) across all 55 remediated + `ux-conformance-sweep.sh` across the
  198-file set (AC-03); `stitch-tokens-to-css.ts --check` proves the
  token source matches the regenerated CSS (C-02).
- **UX-01 (FR-01)**: `view-states.test.tsx` drives each §5c fetching view
  to pending/reject/empty/data (AC-01).
- **UX-05 (FR-05)**: `aria-landmarks.test.tsx` asserts each of the 70
  view roots' `role`/`aria-label` + single-`<main>` invariant (AC-07).
- **UX-03 (FR-03)**: §9 verify-vs-fix matrix — reuse
  `canvas-gestures.ipad` + `keyboard-nav`; manual iPad pinch/pan
  (AC-04, AC-05).
- **UX-04 (FR-04)**: `no-new-breakpoints.test.ts` against the §8a
  allowlist (AC-06).
- **UX-06 (FR-06)**: §10 verify-vs-fix — `route-verbatim.test.ts` +
  reused `deep-link` (AC-08, AC-09).
- **FR-08**: full existing `bun test pwa/` green + per-surface `git diff`
  (AC-10).
- **NFRs**: `typecheck` + `bundle-check` + `no-auth-grep` (see §8b) +
  `git diff --name-only` scope check (AC-11, AC-12).

### 8a. Breakpoint allowlist (DD-08 / AC-06)

The `no-new-breakpoints.test.ts` allowlist is the **current** in-scope
`@media (max-width)` set (grepped 2026-07-04): `1100px`, `1080px`
(`--collapse-at`/`--collapse-at-2col`), `920px`, `900px`, `720px`
(pre-existing, verified present before this spec). Any `@media` width
outside this set fails. This spec introduces none.

### 8b. `no-auth-grep` guard status (C-05)

The API-side "no auth code paths" rule (former NFR-08/AC-22) was retired
in the 2026-07-04 adoption and its API guard deleted. The **pwa-side**
`pwa/src/__tests__/no-auth-grep.test.ts` still exists and asserts the
*presentation layer* touches no auth (a live invariant — the PWA renders
against the API, it does not verify tokens). NFR-03/AC-12 therefore lean
on it **plus** the plain `git diff --name-only` scope check (which is the
primary guard). If the pwa `no-auth-grep` test is itself later retired,
AC-12's `git diff` scope check alone still satisfies NFR-03.

## 9. UX-03 gesture / keyboard — verify-vs-fix matrix (C-01, resolves N-02)

Each in-scope interactive surface, its current suppression state
(grepped from the live handlers on 2026-07-04), and whether T-09 must
add anything. `already-suppressed` = verify-only; `needs-fix` = a
concrete edit.

| Surface | Conflict | Current state (grep) | T-09 action |
|---------|----------|----------------------|-------------|
| `explorer/JourneyGraph` | pinch/pan → page zoom/scroll | `touch-action:none` present in `JourneyGraph.module.css`; pan handler `preventDefault` present | verify-only |
| `components/JourneyCanvas` | pinch/pan | `touch-action:none` present in `JourneyCanvas.module.css` | verify-only |
| `components/GraphCanvas` | pinch/pan | `touch-action:none` present in `GraphCanvas.module.css` | verify-only |
| `ontology/Erd` | pinch/pan | `touch-action` in `Erd.module.css` — **verify** it is `none` on the canvas layer; add if absent | verify; fix if absent |
| `data/Map` | pinch/pan | canvas surface — **verify** `touch-action:none`; add if absent | verify; fix if absent |
| canvas surfaces | pull-to-refresh mid-drag | **verify** `overscroll-behavior-y:contain` on canvas-route body; add if absent | verify; fix if absent |
| canvas surfaces | iOS long-press text-selection | **verify** `user-select:none`+`-webkit-touch-callout:none`; add if absent | verify; fix if absent |
| canvas surfaces | back-gesture consumed at left edge | pan handler edge-guard — **verify** present | verify-only |
| `components/SearchPalette` | `/` → Safari quick-find | `keydown` on body `preventDefault`s `/` — present (see `keyboard-nav.spec.ts` line 30) | verify-only |
| `components/SearchPalette` | arrow keys scroll page | popover captures arrows — present | verify-only |
| `components/Modal` | Tab escapes modal | `focus-trap-react` present; this spec adds NO second trap | verify-only |

Any `fix if absent` that fires appends a DV row + is noted in T-09's
completion note. **N-02 fix:** T-09 now traces **FR-03** (gestures), and
a new **DD-09** governs it (below); T-10 alone traces DD-05 (routing).

| ID | Decision | Serves |
|----|----------|--------|
| DD-09 | Gesture/keyboard suppression is **verify-first**: the §9 matrix marks each surface `verify-only` or `fix-if-absent`; T-09 edits only the `fix-if-absent` rows that actually lack suppression, reusing process-explorer-ui's mechanisms verbatim. No gesture semantics change. | FR-03 |

## 10. UX-06 routing / deep-link — verify-vs-fix matrix (C-01)

`route.ts` + `index.tsx` are byte-unchanged (DD-05; AC-08 `git diff`).
Deep-link cold-load is verified per in-scope entity/tabbed route.

| Route family | Verify | Fix scope |
|--------------|--------|-----------|
| `#/explorer/domain-detail/<id>`, `journey-detail/<id>`, `product-detail/<id>` | cold-load hydrates ready/empty/error, never blank | if blank on missing id → render `NotFoundPanel` in the **view** (not router) |
| `#/explorer/journey-graph/<id>` (canvas) | cold-load renders canvas or EmptyState | view-local fix only |
| `#/ontology/*`, `#/exec/*`, `#/sme/*`, `#/admin/*` tabbed routes | tab id resolves from hash on reload | verify-only (tab ids asserted == blueprint/baseline in `route-verbatim.test.ts`) |
| all in-scope routes | `git diff route.ts index.tsx` empty | verify-only (AC-08) |

Verification: `route-verbatim.test.ts` (byte-diff + tab-id assertions) +
reused `deep-link.test.tsx` (AC-09).

## 11. Shared-component coordination note (B-01)

Several §5b shared `components/**` (e.g. `KpiDashboard`, `SlaDashboard`,
`GraphCanvas`, `AskTheGraph`, `charts/KpiCard`) are consumed by the
studio-owned `model/**` views as well as in-scope surfaces. They
**predate** the studio specs and are shared primitives, so FR-07 scope
correctly includes them and this spec remediates them. Because the
remediation is token-only (no API/prop/behavior change — FR-08), it
cannot break a studio consumer: a `var(--success)`→`var(--good)` alias or
a `#hex`→`var(--token)` swap is visually identical and structurally
inert. **Coordination:** this spec's execution is sequenced AFTER the
studio build lands (§Dependencies), so the studio consumers exist and
`bun test pwa/` exercises them against the remediated primitives in T-11.
No studio-owned `model/**` file is edited.
