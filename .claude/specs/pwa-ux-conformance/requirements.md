---
feature: "pwa-ux-conformance"
created: "2026-07-04"
author: "frank"
status: "revised"
revision: 2
size: "large"
depends_on:
  - "process-explorer-ui"
  - "model-workspace-core"
  - "story-spec-core"
  - "business-model-authoring"
  - "key-activity-optimizer"
  - "ddd-system-modeling"
  - "kpi-impact-mapping"
  - "kpi-okr-performance-dashboards"
  - "requirements-export"
blueprint_source: ".claude/specs/blueprint.md — UI/UX Allowances table (UX-01..UX-06) + View Tree"
kind: "conformance remediation (NOT a rewrite) — user decision 2026-07-04"
---

# Requirements: pwa-ux-conformance

> **Revision 2 (2026-07-04)** — resolves review-spec.md B-01 (true
> failing set is **56 flagged files (55 to remediate + the waived
> auto-generated `tokens.css`)**, not 16, after a complete sweep across
> every in-scope `.tsx` + `.module.css` + shared `components/**` +
> `styles/*`), B-03 (in-scope view count corrected **73 → 70**), C-01
> (verify-vs-fix split for UX-01/03/04/06), C-02 (token edits target the
> auto-generated CSS's *source*), and closes OQ-1 (named ramps added,
> swatches kept distinct — now DD-02). See design §4/§5/§5b for the full
> per-file failing matrix.

## Summary

`pwa-ux-conformance` brings the **entire existing companygraph PWA** into
full conformance with the blueprint's UI/UX Allowances (**UX-01..UX-06**)
and the frozen **View Tree**. It is a **conformance remediation, not a
from-scratch rewrite** (explicit user decision, 2026-07-04): every view's
working structure, data flow, and behavior is preserved; only what is
needed to satisfy the six allowances is changed.

The blueprint's allowance table (`.claude/specs/blueprint.md` §UI/UX
Allowances) is the authoritative north star. Quoted verbatim:

| ID | Allowance | Requirement |
|----|-----------|-------------|
| UX-01 | View states | Every view specs loading / empty / error / ready states in its ACs |
| UX-02 | Design system | Tokens only; components from the catalog before inventing new ones; `scripts/design-conformance.ts` passes on every touched view |
| UX-03 | Input modes | Platforms & Input Modes + Native Conflicts tables for any canvas/gesture work (ModelCanvas) |
| UX-04 | Responsiveness | Desktop-first, matching the existing PWA; no new breakpoints |
| UX-05 | Accessibility | Keyboard reachability, focus order, ARIA landmarks per view |
| UX-06 | Navigation | Routes from this View Tree verbatim; deep links survive reload; active-model context survives reload |

This spec owns the **pre-studio surfaces** only — the interactive views
under `pwa/src/views/{explorer,chat,ontology,sme,analytics,api,exec,data,admin}/`
plus the shared PWA primitives (`pwa/src/views/_shared.tsx`,
`pwa/src/components/*`, `pwa/src/styles/*`). The new **Model surface**
views and `#/exec/performance` are owned by the studio feature specs and
are explicitly OUT of scope here (see §Scope Boundaries + §Dependencies).

## Motivation

The as-built PWA (`.claude/specs/_baseline/`) grew organically across the
adoption and the four downstream specs. A design-conformance audit on
2026-07-04 shows the surface has drifted from the blueprint allowances:

- **UX-02**: a complete `scripts/design-conformance.ts` sweep across
  **all 198 in-scope files** (the 70 view `.tsx`, their `*.module.css`,
  and the shared `components/**` + `styles/*` primitives) FAILS on
  **55 files** (plus the auto-generated `tokens.css`, which is waived —
  56 flagged in total) — 16 view `.tsx` (hardcoded hex), 10 in-scope view
  `*.module.css` (inline `oklch()`, `rgba()`, undeclared `--dur-fast`/
  `--ease-out`), 28 shared `components/**` (undeclared `--success`,
  `--*-soft`, motion tokens, rgba scrims), and `styles/chat.css`
  (undeclared motion tokens). The undeclared tokens (`--tone-good`,
  `--success`, `--rule`, `--bg-subtle`, `--warn-bg`, `--chip-bg`,
  `--bg-2`, `--dur-fast`, `--ease-out`, `--*-soft`, …) are a genuine
  catalog gap. This is the gate the blueprint names explicitly, and it
  is red across the full surface (design §4/§5/§5b enumerate every file
  and its fix).
- **UX-05**: only **~14 of 70 views** carry any `aria-*`/`role`
  attribute. Landmark, focus-order, and ARIA coverage is thin PWA-wide.
  (The app shell `App.tsx` and `Modal.tsx` already carry `<main>` /
  `role="dialog"` + focus-trap — the gap is at the per-view level.)
- **UX-01 / UX-03 / UX-04 / UX-06** have never been assessed per view.

Because spec governance is `enforced` (`.claude/CLAUDE.md`), the
`pwa/src/**` edits this remediation performs need a governing approved
spec. This is that spec. It closes the allowance debt exactly on the
surface it owns, without re-owning the studio views (whose own ACs
already mandate UX-01..06).

## Functional Requirements

One FR per allowance, plus the gate FR (FR-07) and the
remediation-not-rewrite constraint FR (FR-08).

### View states (UX-01)

| ID | Requirement | Priority | Allowance |
|----|-------------|----------|-----------|
| FR-01 | **View states** — every in-scope view that fetches data renders all four canonical states: **loading** (via the shared `Loading` helper from `pwa/src/views/_shared.tsx`), **empty** (a distinct zero-result state, not a blank panel), **error** (via the shared `ErrorState` helper; a failed fetch never renders a blank or crashed panel), and **ready**. Views that fetch nothing (static content, e.g. `api/Endpoints`) declare loading/empty/error as **n/a with rationale** in the design's per-view matrix rather than growing dead states. Existing data-flow and fetch logic is preserved; states are added around it, not rewritten. | must | UX-01 |

### Design system (UX-02)

| ID | Requirement | Priority | Allowance |
|----|-------------|----------|-----------|
| FR-02 | **Tokens only** — every in-scope file (view `.tsx`, its `*.module.css`, and shared `components/**` + `styles/*` primitives) uses only OKLCH custom-property tokens declared in `pwa/src/styles/companygraph/tokens.css`. Zero hardcoded `#xxxxxx` / `rgba(<digit>` / inline `oklch(<digit>` literals; zero `var(--name)` references to undeclared tokens; zero foreign design-system refs (`.m-*`, `Cormorant`). Where a file references a status/semantic color, it maps to the declared catalog token (`--good`, `--warn`, `--danger`, `--accent`, `--muted`, `--surface`, `--surface-2`, etc.); pure-rename aliases (`--tone-good`, `--success`, `--rule`, `--bg-subtle`, `--warn-bg`, `--chip-bg`, `--bg-2`) map to their declared equivalent. Genuine catalog gaps (the semantic ramps, the tint/soft family, the interaction family, and the motion family `--dur-*`/`--ease-*`) are added **once, centrally, to the token *source*** — `.claude/stitch/design-system.yaml`, then regenerated to `tokens.css` via `bun run scripts/stitch-tokens-to-css.ts` (the CSS is auto-generated / "DO NOT EDIT BY HAND"; a hand-edit would be reverted). Components come from `pwa/src/components/*` before inventing new ones. | must | UX-02 |

### Input modes (UX-03)

| ID | Requirement | Priority | Allowance |
|----|-------------|----------|-----------|
| FR-03 | **Input modes + Native Conflicts** — for every in-scope view that binds gestures, pointer, scroll, or keyboard handlers (the canvas/graph views `explorer/JourneyGraph`, `components/JourneyCanvas`, `components/GraphCanvas`, `ontology/Erd`, `data/Map`, the search palette `components/SearchPalette`, and any drag/checkbox/paste view), the interaction survives on the platforms in the §Platforms & Input Modes table, and every native-behavior conflict is suppressed per the §Native Conflicts table. Non-interactive views (pure list/detail/form with default browser behavior) are marked `n/a` in the platform matrix with rationale. **This FR is verify-first**: the design's §9 verify-vs-fix matrix marks each interactive surface `already-suppressed` (verify-only, sourced from a live handler grep) or `fix-if-absent`; no gesture semantics change, and suppression is added only to the `fix-if-absent` rows that actually lack it. | must | UX-03 |

### Responsiveness (UX-04)

| ID | Requirement | Priority | Allowance |
|----|-------------|----------|-----------|
| FR-04 | **Responsiveness** — every in-scope view is desktop-first, matching the existing PWA breakpoints declared in `pwa/src/styles/companygraph/tokens.css` (`--collapse-at`, `--collapse-at-2col`). **No new breakpoints** are introduced. Views that currently overflow, clip, or break layout below the existing collapse breakpoints are fixed to reflow (stack / collapse / drawer) using the existing breakpoint variables. Existing responsive behavior that already works is preserved untouched. | must | UX-04 |

### Accessibility (UX-05)

| ID | Requirement | Priority | Allowance |
|----|-------------|----------|-----------|
| FR-05 | **Accessibility** — every in-scope view is keyboard-reachable with a meaningful focus order and carries the correct ARIA landmark for its role. Each view's top-level content region is a landmark (the shared `ViewHeader` remains a `<header>`; the view body is wrapped so it participates in the shell's `<main>`; lists that are navigational carry `role`/`aria-label` where a screen reader would otherwise announce an unlabeled group). Interactive controls are reachable in DOM order, `Escape` closes any view-local popover/expander, and there is no keyboard trap outside the already-trapped `Modal`. The remediation reuses the app shell's existing `<main>` landmark and `Modal`'s existing focus-trap — it does **not** add a second `<main>` or a competing focus-trap. Coverage target: **all 70** in-scope views carry at least the landmark + label pattern defined in the design's ARIA-landmark strategy (up from ~14/70 today; the 70-view denominator is enumerated in design §4). | must | UX-05 |

### Navigation (UX-06)

| ID | Requirement | Priority | Allowance |
|----|-------------|----------|-----------|
| FR-06 | **Navigation** — every in-scope route in `pwa/src/route.ts` matches the blueprint View Tree and the process-explorer-ui / baseline route shape **verbatim** (no route is invented or renamed by this spec). Deep links survive reload: cold-loading any in-scope entity-detail or tabbed route hydrates the correct view (routing already exists via `parseHash`; this FR verifies + closes any gap). Back-navigation preserves scroll position where the baseline already promised it (process-explorer-ui FR-04 / AC-03). This spec makes **no route changes** — it verifies conformance and fixes only a view whose deep-link cold-load currently renders blank instead of its ready/empty/error state. | must | UX-06 |

### Conformance gate + remediation constraint

| ID | Requirement | Priority | Allowance |
|----|-------------|----------|-----------|
| FR-07 | **Zero UX-02 failures across the full in-scope file set** — after remediation, `bun run scripts/design-conformance.ts --view <file>` returns PASS (zero `❌ FAIL` findings) for **every** in-scope file: all view `.tsx` **and their `*.module.css`** under `pwa/src/views/{explorer,chat,ontology,sme,analytics,api,exec,data,admin}/`, **and** the shared primitives `pwa/src/views/_shared.*`, `pwa/src/components/**` (`.tsx` + `.module.css`, **including the nested `components/charts/`**), and `pwa/src/styles/{chat.css, companygraph/index.css}`. The complete baseline is **55 files to remediate** (plus the waived auto-generated `tokens.css`; 56 flagged in total — design §4/§5/§5b), each with a concrete fix. A repo-level sweep script (`scripts/ux-conformance-sweep.sh`, added by this spec) enumerates the in-scope set by **recursive `find`** (so nested dirs like `components/charts/` are reached) and exits non-zero on any FAIL, so CI can gate it. The sweep **waives** the auto-generated `pwa/src/styles/companygraph/tokens.css` (its declared `oklch()` are token definitions, not literals) and **excludes** the studio-owned `pwa/src/views/model/**` + `exec/Performance*` files (read-only confirmed separately, per §Dependencies). | must | UX-02 (gate) |
| FR-08 | **Remediation, not rewrite** — no in-scope view's data flow, fetch calls, route registration, or user-visible behavior is changed except as required by FR-01..FR-06. This is verified by the **existing view/component test suite still passing** unchanged (the `pwa/**/__tests__/*.test.tsx` set enumerated in the design) after remediation. Any test that must change is a **red flag** requiring an explicit deviation entry in the design with rationale — a changed behavior test is not silently accepted. New tests may be added (for the newly-specced states/landmarks); existing tests may not be weakened. | must | (constraint) |

## Non-Functional Requirements

| ID | Requirement | Category |
|----|-------------|----------|
| NFR-01 | TypeScript transpiles cleanly with `bun run typecheck` (`bun build --no-bundle`); no `tsc` step. | reliability |
| NFR-02 | `zod` remains the only validation library; this spec touches no validation but must not introduce another. | consistency |
| NFR-03 | No auth code paths are added or removed by this spec (auth stays in the central router gate + `api/src/auth/`); this is a pwa-only, presentation-layer remediation. | scope |
| NFR-04 | No `api/`, `shared/`, or non-pwa *runtime* source is edited. The only non-`pwa/` edits allowed are: the token source `.claude/stitch/design-system.yaml` (+ small `motion:` support in `scripts/stitch-tokens-to-css.ts` if the emitter needs it), the CI sweep script (`scripts/ux-conformance-sweep.sh`), and this spec's artifacts. `pwa/src/styles/companygraph/tokens.css` is regenerated (not hand-edited) from the yaml. | scope |
| NFR-05 | Bundle size does not regress — the remediation is CSS-token + ARIA-attribute level and must not grow the gzipped main chunk beyond the process-explorer-ui NFR-02 budget (≤ 300 KB gzipped). | performance |
| NFR-06 | en-US spelling in all new/edited identifiers and token names (`color`, `behavior`, `neighbors`). | consistency |

## Scope Boundaries

**In scope** — remediate to UX-01..06:
- The existing pre-studio views under
  `pwa/src/views/{explorer,chat,ontology,sme,analytics,api,exec,data,admin}/`
  (**70 view `.tsx` files** as of 2026-07-04, enumerated in design §4)
  **and their co-located `*.module.css`**.
- Shared PWA primitives: `pwa/src/views/_shared.{tsx,module.css}`,
  `pwa/src/components/**` (`.tsx` + `.module.css`, including the nested
  `components/charts/`), `pwa/src/styles/{chat.css, companygraph/index.css}`.
- The token *source* `.claude/stitch/design-system.yaml` (+ its
  regenerated `pwa/src/styles/companygraph/tokens.css`) — one central
  edit adds the missing token families (FR-02/DD-02).
- One added CI sweep script `scripts/ux-conformance-sweep.sh` (FR-07).

**Out of scope — do NOT edit or re-own** (owned by the studio feature
specs, whose ACs already mandate UX-01..06):
- The **Model surface** views: `pwa/src/views/model/*`. **Present today
  (2026-07-04):** only `ModelWorkspace`, `StoryCatalog`,
  `ModelTabPlaceholder` (3 files — verified live; N-03). The remaining
  studio views this list forward-excludes — `ModelCanvas`,
  `KeyActivityBoard`, `KpiImpactMatrix`, `SystemModeler`, `SpecExport` —
  **do not exist yet** (studio not landed); the exclusion is
  forward-looking and the sweep exclusion glob `model/**` covers them
  when they arrive. Owners: `model-workspace-core`,
  `story-spec-core`, `business-model-authoring`,
  `key-activity-optimizer`, `kpi-impact-mapping`, `ddd-system-modeling`,
  `requirements-export`.
- The `#/exec/performance` **PerformanceDashboard** (owner:
  `kpi-okr-performance-dashboards`).
- `pwa/src/route.ts` / `pwa/src/views/index.tsx` route/registration
  changes — this spec makes NO route changes (FR-06 is verification-only
  for routing).
- Any `api/`, `shared/`, or non-pwa source (NFR-04).

This spec must NOT duplicate the studio specs' UX ACs. A final
conformance sweep (FR-07) confirms the Model views too, but **read-only**
via `design-conformance.ts` — it never edits them.

## Acceptance Criteria

Every AC carries Platforms + Verification. UX-02 ACs verify via
`bun run scripts/design-conformance.ts --view <file>`. Non-token ACs use a
test path or `manual: <input mode + observable outcome>`.

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | Every in-scope data-fetching view renders loading / empty / error / ready; a forced fetch failure renders the shared `ErrorState` (not blank/crashed), and a zero-result fetch renders a distinct empty state (FR-01) | macOS Safari (trackpad+kb), macOS Chrome (mouse+kb) | `pwa/src/__tests__/ux-conformance/view-states.test.tsx` — for each fetching view in the **design §5c per-view state matrix** (the `n/a` set from §5c/DV-01 is skipped with its rationale), mock its fetch to (a) pending → assert `Loading` present, (b) reject → assert `[data-testid="error-state"]` present, (c) resolve `[]` → assert empty-state marker present, (d) resolve data → assert ready content. Existing per-view error-scenario tests under `pwa/src/__tests__/error-scenarios/**` are reused where present |
| AC-02 | Each of the **55 currently-failing files to remediate** (design §5 the 16 view `.tsx`; §5b the 10 in-scope view `*.module.css`, 28 shared `components/**`, 1 `styles/chat.css`) passes `design-conformance.ts` after remediation (FR-02) | n/a (static analysis) | `bun run scripts/design-conformance.ts --view <path>` for each of the 55 files enumerated in design §5 + §5b — expect `PASS` / `✅ clean`, zero `❌` lines; `bun run scripts/stitch-tokens-to-css.ts --check` exits 0 (regenerated CSS matches the yaml source — no hand-edit) |
| AC-03 | The full in-scope file set passes the sweep with zero UX-02 failures (FR-07) | n/a (CI) | `bun run scripts/ux-conformance-sweep.sh` — enumerates every in-scope view `.tsx` **+ its `.module.css` + shared `components/**` (incl. `charts/`) + `styles/*`** by recursive `find`, runs `design-conformance.ts --view` on each, exits 0 only if all PASS; asserts a known nested failing fixture (e.g. `components/charts/KpiCard.module.css`) is reached (C-03); asserts `tokens.css` is waived and the studio-owned `model/**` + `exec/Performance*` set is excluded |
| AC-04 | Canvas/gesture views suppress every native conflict in the §Native Conflicts table; pinch-zoom is captured by the canvas (not the page) and two-finger pan does not scroll the page (FR-03) | iPad Safari (touch), macOS Safari (trackpad), macOS Chrome (mouse+kb) | reuse `pwa/playwright/canvas-gestures.ipad.spec.ts`; plus `manual:` on iPad Safari — pinch on `#/explorer/journey-graph/<seed-id>` canvas, expect canvas zooms and the page does NOT zoom; two-finger drag, expect canvas pans and the page does NOT scroll |
| AC-05 | Keyboard: from each in-scope view, Tab cycles interactive controls in DOM order with no trap outside `Modal`; `/` focuses the search palette; `Escape` closes any view-local popover (FR-03, FR-05) | macOS Safari (trackpad+kb), macOS Chrome (mouse+kb) | reuse `pwa/playwright/keyboard-nav.spec.ts` extended to sample one view per surface; plus `manual:` on macOS Chrome (keyboard only) — Tab through `#/exec/risk` until focus leaves the view, expect every control visited in visible order, no trap |
| AC-06 | No in-scope view introduces a new breakpoint; views that clipped below `--collapse-at` now reflow (FR-04) | iPhone Safari (touch), iPad Safari (touch), macOS Safari (trackpad+kb) | `pwa/src/__tests__/ux-conformance/no-new-breakpoints.test.ts` — grep in-scope `*.module.css` for `@media` widths, assert every width matches a value derived from `--collapse-at` / `--collapse-at-2col` (allowlist); plus `manual:` on iPhone Safari — load `#/exec/risk`, expect no horizontal scroll and content stacks |
| AC-07 | Every in-scope view carries an ARIA landmark + label per the design's landmark strategy; coverage rises from ~14/70 to **70/70** (FR-05) | macOS Safari (trackpad+kb), macOS Chrome (mouse+kb) | `pwa/src/__tests__/ux-conformance/aria-landmarks.test.tsx` — iterate the **70-view enumeration from design §4** (test imports the list; count asserted == 70), render each, assert its root region carries the specced `role`/`aria-label` (or is wrapped by `ViewRegion`); assert exactly one `<main>` in the mounted shell |
| AC-08 | Every in-scope route matches the View Tree / baseline shape verbatim; no route added or renamed by this spec (FR-06) | n/a (static) | `pwa/src/__tests__/ux-conformance/route-verbatim.test.ts` — assert `git diff --stat HEAD -- pwa/src/route.ts pwa/src/views/index.tsx` is empty across this spec's execution (route files unchanged); assert every `SURFACES` tab id equals its blueprint/baseline value |
| AC-09 | Deep-link cold-load renders the correct in-scope view's ready/empty/error state (never a blank panel) after reload (FR-06) | iPad Safari (touch), macOS Chrome (mouse+kb) | reuse `pwa/src/__tests__/deep-link.test.tsx`; plus `manual:` on macOS Chrome — paste `#/explorer/journey-detail/<seed-id>` into a fresh tab, expect the journey detail hydrates; paste a valid-shaped non-existent id, expect the 404 `NotFoundPanel` (not blank) |
| AC-10 | Remediation preserves behavior: the existing view/component test suite passes unchanged (FR-08) | n/a (CI) | `bun test pwa/` (unit) + `bun test:integration` for the enumerated existing suites — expect zero pre-existing tests fail; any required change to an existing behavior test is recorded as a design deviation |
| AC-11 | TypeScript transpiles cleanly; bundle does not regress past 300 KB gzipped (NFR-01, NFR-05) | n/a (build) | `bun run typecheck` exits 0; `bun run bundle-check` (the 300 KB gzipped budget gate inherited from process-explorer-ui's bundle-size criterion) asserts main chunk ≤ 300 KB gzipped |
| AC-12 | No auth code path added/removed; no `api/`/`shared/` runtime edits (NFR-03, NFR-04) | n/a (codebase) | `pwa/src/__tests__/no-auth-grep.test.ts` still passes (pwa presentation-layer invariant — see design §8b: this is a secondary guard; the `git diff` scope check is primary); `git diff --name-only HEAD` shows edits only under `pwa/`, `.claude/stitch/design-system.yaml`, `scripts/{stitch-tokens-to-css.ts,ux-conformance-sweep.sh}`, `pwa/src/styles/companygraph/tokens.css` (regenerated), and `.claude/specs/pwa-ux-conformance/**` |

## Platforms & Input Modes

"yes" = must work on that surface; "degrade" = works with reduced
fidelity; "n/a" = not applicable on that surface (with justification).
Most in-scope views are non-interactive list/detail/form panels whose
input handling is the browser default; the gesture/keyboard rows below
are the ones this spec actively verifies + suppresses conflicts for.

| Surface / interaction | iPhone Safari (touch) | iPad Safari (touch) | macOS Safari (trackpad+kb) | macOS Chrome (mouse+kb) |
|-----------------------|-----------------------|---------------------|-----------------------------|-------------------------|
| List/detail/form views (explorer lists, exec, admin, api, sme, data, ontology tables) — default browser input | yes | yes | yes | yes |
| Canvas / graph pan-zoom-select (`explorer/JourneyGraph`, `components/JourneyCanvas`, `components/GraphCanvas`, `ontology/Erd`, `data/Map`) | degrade (usable, small) | yes | yes | yes |
| Pinch-zoom on canvas | yes | yes | yes (trackpad) | n/a (scroll-wheel zoom instead) |
| Two-finger pan on canvas | yes | yes | yes (trackpad) | n/a (click+drag empty space) |
| Browser back-gesture passes through at canvas edge | yes | yes | n/a (no swipe-back on macOS) | n/a |
| Slash-key search focus (`/`) via `components/SearchPalette` | n/a (no kb; hide hint) | yes (external kb) | yes | yes |
| Arrow nav in search results | n/a | yes (external kb) | yes | yes |
| Bulk-paste / checkbox / drag write controls (sme/Quarterly, sme/Add, exec CRUD) | degrade (paste poor on phone) | degrade | yes | yes |
| Keyboard reachability + focus order (all in-scope views, FR-05) | n/a (external kb only) | yes (external kb) | yes | yes |
| Deep-link cold-load (all in-scope routes, FR-06) | yes | yes | yes | yes |

## Native Conflicts

This spec verifies the existing gesture/keyboard suppression and closes
any unhandled conflict on the in-scope canvas/search views. The canvas
conflicts mirror process-explorer-ui's already-shipped suppression (this
spec confirms they hold across the in-scope canvas set); the explicit
`(none)` row records that non-canvas list/detail views bind no gestures.

| Conflicting native behavior | Affected in-scope surface | Suppression mechanism |
|------------------------------|---------------------------|------------------------|
| Pinch-zoom zooms the page (iOS Safari) | `explorer/JourneyGraph`, `components/JourneyCanvas`/`GraphCanvas`, `ontology/Erd`, `data/Map` | `touch-action: none` on the canvas element; canvas-route viewport `maximum-scale=1, user-scalable=no`; gesture handler `preventDefault` — reused verbatim from process-explorer-ui |
| Two-finger pan scrolls the page | same canvas surfaces | `touch-action: none` + `e.preventDefault()` in the pan handler |
| Browser back-gesture (edge swipe, iOS Safari) consumed by canvas pan | canvas surfaces | pan handler ignores touches within 20 px of the viewport left edge — Safari back-gesture fires instead |
| Browser `/` opens Safari quick-find | `components/SearchPalette` | `keydown` on `document.body` `preventDefault`s `/` when focus is not in an `<input>`/`<textarea>`, routes focus into the search field |
| Browser arrow keys scroll the page | `components/SearchPalette` results popover | popover captures arrow keys with `preventDefault` while focus is inside it; outside, arrows scroll normally |
| Browser Tab navigates browser chrome mid-modal | `components/Modal` (used by ontology add/edit, exec CRUD) | existing `focus-trap-react` in `Modal.tsx` — `Tab` cycles focusables in the modal, `Escape` releases + closes. This spec does NOT add a second trap |
| Pull-to-refresh reloads mid-canvas-drag | canvas surfaces | `overscroll-behavior-y: contain` on the canvas-route body |
| Long-press fires iOS text-selection menu on a canvas node | canvas surfaces | `user-select: none` + `-webkit-touch-callout: none` on the canvas container |
| iOS rubber-band scroll lifts the sticky shell header | app shell (`App.tsx` main region) | `overscroll-behavior-y: contain` on `body` for sticky-header routes (already in shell CSS; verified, not re-added) |
| `Cmd+F` browser find-in-page | `components/SearchPalette` | **Intentionally NOT intercepted** — find-in-page against page text is a desktop expectation; `/` is the in-app search key. Complementary, not conflicting |
| (none) — non-canvas list/detail/form views bind no gestures/scroll/keyboard handlers beyond browser defaults | explorer lists, exec, admin, api, sme forms, data/Export, ontology tables | n/a — default browser scroll/tab behavior is correct; nothing to suppress |

## Dependencies

| Module | How it's affected / relied on |
|--------|-------------------------------|
| `scripts/design-conformance.ts` | The authoritative UX-02 gate. Consumed read-only via `--view` per AC-02/AC-03. Not modified. |
| `.claude/stitch/design-system.yaml` → `pwa/src/styles/companygraph/tokens.css` | The token **source** and its auto-generated CSS. FR-02 adds the missing token families (aliases via `legacy_aliases`; ramps/tint/motion via `colors:`/new `motion:`) to the **yaml source once**, then regenerates the CSS with `bun run scripts/stitch-tokens-to-css.ts`. The CSS is never hand-edited (its header says so); `stitch-tokens-to-css.ts --check` gates that the two stay in sync (AC-02). |
| `scripts/stitch-tokens-to-css.ts` | The token generator. May gain a small `motion:` emitter (mirrors the `spacing:` loop) if the motion tokens need a dedicated group; otherwise motion tokens ride under `colors:`. |
| `pwa/src/views/_shared.tsx` | Provides `Loading`, `ErrorState`, `NotFoundPanel`, `ViewHeader`. Reused for FR-01 states + FR-05 landmark helper; extended (additively) if an empty-state or landmark-wrapper helper is needed. |
| `pwa/src/route.ts` + `pwa/src/views/index.tsx` | Routing/registration for UX-06. **Verified, not modified** (AC-08 asserts unchanged). |
| `pwa/src/components/Modal.tsx` | Already carries `role="dialog"` + `focus-trap-react`. Reused for FR-05; not duplicated. |
| **Studio feature specs** (`model-workspace-core`, `story-spec-core`, `business-model-authoring`, `key-activity-optimizer`, `kpi-impact-mapping`, `ddd-system-modeling`, `requirements-export`, `kpi-okr-performance-dashboards`) | **Sequencing dependency.** Those specs own the Model surface + `#/exec/performance` and their ACs already mandate UX-01..06. This spec's **execution is sequenced to run AFTER the studio build lands**, so the final FR-07 sweep can confirm the Model views too — **read-only** via `design-conformance.ts`, without editing them. Authoring (requirements/design/tasks) can complete now; execution is deferred. **N-01 note:** the blueprint slug set also includes `system-augmentation-model` (owner of `#/explorer/systems` badges) and `kpi-okr-governance` (owner of `kpi/okr-management` view edits) — both touch in-scope surfaces. If either is still editing in-scope files when this spec executes, its landing is an additional upstream sequencing gate (same rationale: run this remediation after those views stop moving). Several shared `components/**` this spec remediates (`KpiDashboard`, `SlaDashboard`, `GraphCanvas`, `charts/*`) are consumed by studio `model/**` views too; the fix is token-only so it cannot break a consumer (design §11 coordination note). |

## Risks & Open Questions

1. **Token-alias replacement vs. catalog gap (FR-02) — RESOLVED
   (was OQ-1).** Decision: **hybrid, per design DD-01/DD-02.**
   Pure-rename aliases map to their declared canonical token
   (`--tone-good`→`--good`, `--rule`→`--border`,
   `--bg-subtle`/`--bg-2`→`--surface-2`, `--success`→`--good`, …) via
   the generator's `legacy_aliases` bridge (design §5a). Multi-swatch
   *semantic ramps* that would lose category identity if collapsed
   (`exec/RiskDashboard` 8 hex, `ontology/Erd` 5, `sme/Review` 6,
   `exec/Risk` 4) get **named ramps added once, keeping swatches
   distinct** — option (b): `--cat-1..--cat-6` (categorical) +
   `--sev-1..--sev-5` (ordinal severity), with concrete OKLCH values and
   a per-hex→per-token mapping pinned in design §5d. All additions go to
   the token *source* (`design-system.yaml`), regenerated to `tokens.css`
   (never hand-edited). No residual open question.

2. **"Empty" state for views that never return empty (FR-01/UX-01).**
   Some views (static API docs, always-seeded singletons) have no real
   empty case. Blueprint UX-01 says "specs loading/empty/error/ready" —
   design marks these `empty: n/a (rationale)` rather than growing a
   dead unreachable state. Confirm this reading is acceptable (it
   matches how the studio specs' state matrices handle static tabs).

3. **Execution sequencing (Dependencies).** Because the studio specs are
   mid-build and own `model/**`, running this spec's execution now risks
   a file-ownership clash and a moving conformance target. Deferring
   execution until the studio build lands is the safe order; the STATUS
   phase table records Execution as `not started — deferred`. Confirm
   the user wants authoring-now / execution-deferred (the brief states
   this explicitly).

4. **Existing test churn (FR-08/AC-10).** Some existing view tests may
   assert on the exact class/attribute strings this remediation changes
   (e.g. a test that reads a hardcoded color). If so, the test —
   not the behavior — needs a surgical update, which FR-08 flags as a
   deviation requiring an explicit design entry. The design enumerates
   the existing suite so this is caught, not discovered mid-execution.
