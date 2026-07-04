---
feature: "navigation-ia"
reviewing: "requirements"
reviewing_revision: 2
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 2
reviewed_at: "2026-07-04"
---

# Review: navigation-ia / requirements (pass 2/2 — FINAL)

## Verdict

**approve** — all four pass-1 blockers are genuinely resolved and verified
against the current codebase; all seven concerns and all five nits were
addressed; the revision introduces no new blocker. Two new concerns are
recorded for the design phase (surface-level bare-hash aliasing; a wording
tension inside the FR-04†/FR-12 conditional) — neither invalidates any FR
or AC.

## Pass-1 finding resolution

### Blockers

- ~~B-01~~ → **resolved.** FR-01 now specifies exactly eight surfaces
  *including* `model` at an explicit position (2), preserves all `#/model/*`
  routes VERBATIM, and confines this spec's touch to TopBar position +
  derived shortcut. Verified: `pwa/src/route.ts:107-118` registers `model`
  with the seven blueprint tabs; `model-workspace-core` STATUS is
  execution:complete; the Summary, Motivation §4, Out-of-scope, and
  Dependencies sections all now argue from the ten-surface post-blueprint
  reality (route.ts today: explorer, chat, ontology, sme, analytics, api,
  exec, data, admin, model — matches the document's "current ten").
- ~~B-02~~ → **resolved.** FR-04's insights list now carries all eight
  current analytics tabs (verified against `route.ts:51-65`: `overview,
  systems, matrix, consolidation, complexity, single-system, critical-paths,
  ai`) grouped analysis/reports/business, and the FR-11 row
  `analytics/{…8…} → insights/{same}` enumerates them explicitly. AC-08
  names the four relocated report tabs and updates
  `analytics-system-map.test.tsx` to canonical routes (NFR-02/risk 6 cover
  the cto-analytics test churn). No orphaned analytics view remains
  possible under FR-21/FR-22.
- ~~B-03~~ → **resolved.** Three mechanisms replace the silently-broken
  `exec/performance` alias: (a) FR-04† makes the `performance` disposition
  an explicit post-blueprint-inventory conditional with both branches
  specified; (b) FR-12 promotes the blueprint round-5 amendment to a
  design-gate **precondition** that records the retarget of
  `kpi-okr-performance-dashboards`' registration (verified: that spec is
  tasks:draft / execution not started, so `#/exec/performance` has NOT
  landed — the conditional is live and correctly two-branched, blueprint
  line 122 freezes it as a NEW exec tab); (c) FR-14/AC-17/AC-18 add a
  dangling-target guard test asserting no alias row can ever hit
  parseHash's first-tab fallback (`route.ts:171-172`), which structurally
  prevents the pass-1 failure mode instead of merely fixing the one row.
  AC-18 is testable in either branch. See new C-02 for a residual wording
  tension — non-blocking.
- ~~B-04~~ → **resolved.** FR-09 now specifies true resume (param read +
  history hydration in `AgentChat`), FR-10 adds the missing
  `GET /api/v1/chat/conversations/:id/messages` route, NFR-04 exception (c)
  permits the interior change, AC-07 asserts prior messages render before
  input is accepted plus the bad-id path, and AC-20 covers the API side
  (401/200/404 + OpenAPI presence). Verified additive: `api/src/router.ts`
  has no existing `chat/conversations` GET (only `chat/messages` POST at
  line 447); `api/src/chat/persistence.ts` exists as claimed. The
  requirements/API/scope triangle is now mutually consistent.

### Concerns

- ~~C-01~~ → resolved. FR-11 translates legacy `?journey=<id>` to the
  `/:id/graph` entityId+mode form and maps the no-param form to
  `journeys?view=graph`; AC-03 asserts the resulting canonical hashes.
- ~~C-02~~ → resolved. FR-03 names the dispatch adapter (`entityId` →
  `params.journey`/`params.id`), defines the no-id multi-journey board as
  `#/explorer/journeys?view=graph` (avoiding the `toHash` mode-without-id
  gap), and NFR-04(b) permits the ≤5-line param reads.
- ~~C-03~~ → resolved. FR-17 explicitly supersedes Alt+0 (Model → Alt+2,
  App.tsx "0" special case removed, test expectations updated); FR-12(b)
  records the exec/analytics relocations in the amendment; Dependencies
  names the blueprint single-shot as a hard blocking upstream with a
  design-time route-table re-inventory (kpi-okr-governance
  execution:complete confirmed).
- ~~C-04~~ → resolved. FR-10 ownership note: exactly two read-only routes
  here; delete/rename/bookmarks stay with chat-interface backfill (also in
  Scope Boundaries).
- ~~C-05~~ → resolved. FR-16 leaves the name-resolution mechanism (context
  bus / title store / shell fetch) to design; id shown until resolved.
- ~~C-06~~ → resolved. FR-18 adopts blind restore; AC-19 tests the stale-id
  path via the view's own not-found state.
- ~~C-07~~ → resolved. AC-22 exists and runs `scripts/design-conformance.ts`
  on every touched view; the UX-02 row now cites it correctly.

### Nits

- ~~N-01~~ → resolved (FR-21 enumerates the ten files, closed-form).
- ~~N-02~~ → resolved (AC-06 requires an injectable clock).
- ~~N-03~~ → resolved (NFR-05 marked measured-not-gated).
- ~~N-04~~ → resolved (identity-mapped surfaces listed once in FR-11; no
  no-op rows).
- ~~N-05~~ → resolved (FR-05/FR-21/risk 5 record the `RollDownTab`
  de-duplication as a design decision).

## New findings (introduced by or surviving revision 2)

### Blockers

None.

### Concerns

- **C-01 (new) — Bare legacy surface hashes fall to `#/explorer/domains`,
  not their new home.** The FR-11 alias table is tab-level. A legacy bare
  hash like `#/analytics`, `#/exec`, `#/sme`, or `#/api` (no tab segment)
  misses every row; after the surface ids are deleted from `SURFACES`,
  `parseHash` returns `DEFAULT_ROUTE` (`route.ts:160-161`) — i.e. Explorer/
  Domains — rather than insights/govern/data. Low likelihood (`toHash`
  always emits a tab, so app-generated links are unaffected; only
  hand-typed or truncated bookmarks hit this), which is why it is not a
  blocker. Recommendation: design adds four surface-default alias rows
  (`analytics → insights/overview`, `exec → insights/overview` or
  `govern/kpi-management`, `sme → explorer/review`, `api → data/import`)
  and includes them in the AC-17 iteration — a four-row addition, no FR
  change needed.
- **C-02 (new) — FR-12's "resolves forever" claim conflicts with FR-04†'s
  omitted-row branch.** FR-12 states "The frozen `#/exec/performance` route
  keeps resolving forever via the alias table," but in the FR-04†
  not-landed branch (which is the live branch — the spec is tasks:draft)
  "the tab and its alias row are omitted." In that branch nothing resolves
  `#/exec/performance` until `kpi-okr-performance-dashboards` lands, and no
  text assigns that spec the duty of adding the alias row when it registers
  at `#/insights/performance`. Harmless in practice (the route never
  shipped, so no real links exist), but the amendment should close the
  loop. Recommendation: FR-12(c) additionally records that in the
  not-landed branch the alias row `exec/performance → insights/performance`
  is owned and added by `kpi-okr-performance-dashboards` at its
  registration time. One-sentence amendment-content fix; does not affect
  any AC (AC-18's guard passes in both branches as written).

### Nits

- **N-01 (new)** — Risk 2's escape hatch ("demoting report tabs to
  virtual") and FR-14's "registered tab or virtual tab" presuppose a
  virtual-tab mechanism on non-explorer surfaces; today
  `EXPLORER_VIRTUAL_TABS` is explorer-gated (`route.ts:169`). Fine as a
  design freedom — just don't assume it exists for free.
- **N-02 (new)** — UX-05 promises the breadcrumb `nav` landmark and palette
  focus trap, but AC-15 asserts only crumb text/links and AC-13 only
  Escape/focus-return. Design's test plan should pick up the landmark and
  trap assertions explicitly.

## Completeness / Traceability

| Check | Result |
|-------|--------|
| Every FR has ≥1 AC | pass — FR-01→AC-01; FR-02→AC-02/04/14; FR-03→AC-03; FR-04→AC-08/18; FR-05→AC-09; FR-06→AC-10; FR-07→AC-11; FR-08→AC-12; FR-09→AC-06/07; FR-10→AC-07/20; FR-11→AC-17 (+03/04/08/11/12); FR-12→AC-18 + design-gate precondition; FR-13→AC-17; FR-14→AC-17/18; FR-15→AC-13/14; FR-16→AC-15; FR-17→AC-16; FR-18→AC-19; FR-19→AC-05; FR-20→AC-21; FR-21→AC-22; FR-22→AC-22 |
| Every AC traces to an FR and is testable | pass — AC-01..22 all cite FRs; every AC names a test file or a manual repro with input mode; AC-18's conditional is resolvable at design time by the sequencing precondition |
| Alias table covers all current routes | pass — all 10 current surfaces accounted for: sme (4 tabs), analytics (8), api (3), exec (7 + conditional performance), explorer journey-detail/journey-graph incl. `?journey=` translation; chat/data/admin/ontology/model identity-mapped. Residual gap is bare-surface hashes only (new C-01) |
| Routes/views match the blueprint View Tree | pass with recorded amendment — `#/model/*` verbatim; all relocations + the `#/exec/performance` retarget flow through the FR-12 round-5 amendment, which is a design-gate precondition |
| UX-* allowances covered in ACs | pass — UX-01→AC-06/NFR-04; UX-02→AC-22; UX-04→AC-14; UX-05→AC-13/15 (landmark assertion left to design, new N-02); UX-06→AC-17/18 |
| Platforms & Input Modes + Native Conflicts tables | pass — unchanged from rev 1's thorough tables; history-replace row added for FR-13 |
| No file ownership conflict with another spec | pass — model surface untouched (position/shortcut explicitly not frozen by model-workspace-core); FR-10 ownership note settles `chat.ts`; FR-12 precondition settles the performance registration site |
| Codebase claims verified this pass | pass — 10 surfaces incl. model (`route.ts:12-119`); analytics 8 tabs (`route.ts:51-65`); model-workspace-core + kpi-okr-governance execution:complete; kpi-okr-performance-dashboards tasks:draft (FR-04† conditional correctly live); no existing GET `chat/conversations` in `router.ts`; `api/src/chat/persistence.ts` exists; `bun run typecheck` script exists (NFR-02) |

## Summary

Revision 2 fixed the staleness that sank pass 1 at its root rather than
patching symptoms: the document now argues from the verified post-blueprint
route table, adds a hard sequencing precondition plus design-time
re-inventory for anything still in flight, encodes the one known
conditional (performance) in both FR and AC, and adds a structural guard
(FR-14) that makes the entire class of dangling-alias bugs untestable-to-
ship. Resume is now honestly specced end to end (route → API → hydration →
AC). The two new concerns are design-phase work items, not requirement
defects. Approved with concerns C-01/C-02 (new) handed to design.
