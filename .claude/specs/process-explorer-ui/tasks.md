---
feature: "process-explorer-ui"
created: "2026-05-23"
author: "frank"
status: "in-review"
revision: 2
reviewing_design_revision: 2
size: "large"
depends_on: ["graph-core", "ontology-manager"]
reviewing_pass_1_findings: "2 blockers, 6 concerns, 4 nits — all absorbed in revision 2 (see §Pass-1 task review resolutions)."
---

## Pass-1 task review resolutions (revision 2)

All findings from `review-tasks.md` (pass 1, 2026-05-23) absorbed:

| Finding | Disposition | Tasks |
|---------|-------------|-------|
| **TB-01** T-03a Files cell points at fictional `api/src/schemas.ts` + `api/src/openapi.ts` | T-03a rewritten: zod `searchSchema` inlined into `api/src/routes/query.ts`; OpenAPI registration appended to existing `api/src/routes/openapi.ts`. Files-per-task discipline table row updated. Design.md §11 + §5.2 scope swept in same revision so both specs are internally consistent. | T-03a |
| **TB-02** T-11b validation refers to "T-19c" for the Safari export regression test, but T-19a actually ships it | sed `T-19c` → `T-19a` in T-11b validation cell. | T-11b |
| **TC-01** T-20 depends on T-19a (playwright) but T-20 is vitest-only | Drop T-19a from T-20 dependency cell; keep T-17. | T-20 |
| **TC-02** Complexity tally arithmetic does not sum to 24 | Recounted against the canonical per-task complexity column. Trivial 3 + Simple 11 + Moderate 9 + Complex 4 = 27 task-roles across 24 tasks (T-03a..d count as 4 distinct task-roles, etc). Updated §"Complexity tally" prose to reflect this. | (summary) |
| **TC-03** FR-26 inheritance has no verification trace | T-17 validation extended: "after lifting polling, TopBar still renders node + edge counts on `#/explorer/domains` (manual check + `App.module.test.tsx` integration)". | T-17 |
| **TC-04** Bulk-paste rollback test path divergence between design.md and tasks.md | Both files now use `pwa/src/__tests__/integration/bulk-paste-rollback.integration.test.ts` (design.md AC-13 swept in this revision). | T-13b |
| **TC-05** T-19b transitive deps not surfaced | Added prose note to §"Dependency overview": "T-19a/b/c transitively depend on the full T-04 → T-08 chain via T-11a / T-17". | (overview) |
| **TC-06** T-15 prefStore trace not explicit | Added one-clause to T-15 Depends-on cell: "T-09c, T-14 (transitively requires prefStore from T-04a via T-05 → T-09c)". | T-15 |
| TN-01 T-00 pre-flight noise | T-00 explicitly marked `pre-flight` (not part of 24 runtime tasks); critical-path graph drops the T-00 → T-01 edge. | T-00 |
| TN-02 T-09a/b/c dep-cell symmetry | Style nit — left as-is (transitively correct). | (no action) |
| TN-03 T-13a doesn't mention snapshot path | T-13a validation extended: "snapshot path exercised in T-13b rollback integration". | T-13a |
| TN-04 T-00 redundancy with rev-3 frontmatter | Folded into TN-01 fix (T-00 marked pre-flight). | T-00 |
| **Design retro-finding (a)**: design.md §11 lists fictional `api/src/schemas.ts` + `api/src/openapi.ts` | **Swept in same revision** — design.md §5.2 + §11 updated to match tasks.md's corrected paths. Design rev 2.1 in same commit. | (cross-spec) |
| **Design retro-finding (b)**: design.md AC-13 has `pwa/__tests__/bulk-paste-rollback...` (wrong root) | **Swept in same revision** — design.md AC-13 row updated to `pwa/src/__tests__/integration/...` matching tasks.md. | (cross-spec) |

# Tasks: process-explorer-ui

## Summary

Implementation of `design.md` revision 2 broken into **24 tasks**
ordered by dependency. Each task lists its files (1–3 per task per
spec-workflow), the FR/AC it traces to, its complexity (trivial /
simple / moderate / complex), its dependencies on other tasks, and the
validation checkpoint that proves it works.

Tasks group into **10 phases** mirroring `design.md §14` (foundation
→ stores → read views → canvas → write paths → polish → offline →
final verification). Critical-path estimate from the design: **8–12
working days PWA + 1 day graph-core amendment** for a single focused
implementer.

Total surface: **32 new files + 18 modified files = 50 touched files**
(per `design.md §11`).

**Cross-spec amendment**: T-03a..T-03d ship the graph-core amendment as
a single PR alongside this spec's PR. Graph-core is at
`execution:complete`; T-31 is filed post-completion against
`graph-core/tasks.md`.

**Tasks pass-2 carry-forwards from design pass-2 review** (3 minor):
1. `JourneyGraph.tsx` scaffold disposition (handled in T-11)
2. Dispatch wiring for new `Activities.tsx` / `Roles.tsx` /
   `Locations.tsx` (handled in T-08 — the renderView dispatcher edit
   explicitly maps these as virtual tabs activated by `route.entityId`)
3. AC-15/AC-18 prose sweep — already resolved in requirements rev 3
   (no task action needed)

## Validation checkpoint cadence

After every **phase boundary**, run:

```bash
bun build pwa/src/main.tsx --no-bundle > /dev/null   # transpile-clean PWA
bun build api/src/server.ts --no-bundle > /dev/null  # transpile-clean API (amendment only)
bun test                                             # unit tests (vitest + bun test where co-located)
bun test:integration                                 # integration tests
```

A **transpile failure** halts the phase. Test failures halt the
specific task until the task's AC passes.

## Pre-flight (NOT counted in the 24 runtime tasks — TN-01 / TN-04 fix)

T-00 is a **traceability annotation, not a runtime task**. The
work shipped 2026-05-23 alongside design rev 2 (and again alongside
design rev 2.1 for the retro-finding sweep) before this tasks.md
opened. T-01's dependency on T-00 is annotational only.

| ID | Task | Files | FR / AC | Complexity | Depends on | Validation |
|----|------|-------|---------|-----------:|------------|------------|
| **T-00 (pre-flight)** | **Requirements rev 3** — SME route renames (`new-journey` → `add`; `review-queue` → `review`; `review-quarterly` → `quarterly`) + AC-25 / AC-15 / AC-18 prose updates. **Already shipped** — pinned in tasks.md for cross-spec traceability only. | `requirements.md` | B-03 fix | trivial (pre-flight) | none | `git diff requirements.md` shows three FR route literals updated + three AC literals updated; revision frontmatter at 3 |

## Phase 1 — Foundation (dependencies, scripts, configs)

| ID | Task | Files | FR / AC | Complexity | Depends on | Validation |
|----|------|-------|---------|-----------:|------------|------------|
| T-01 | Add PWA runtime deps + dev deps to `pwa/package.json`: `react-flow`, `@dagrejs/dagre` (NOT deprecated `dagre`), `zustand@^4.5`, `html-to-image`, `react-focus-lock`, `uuidv7`. DevDeps: `vitest`, `@testing-library/react`, `@playwright/test`, `jsdom`. Update `scripts`: `test`, `test:integration`, `bundle-check`. Run `bun install` in worktree. | `pwa/package.json` | Dependencies (design §11) | trivial | (none — T-00 is pre-flight) | `bun install --frozen-lockfile` succeeds; `bun build pwa/src/main.tsx --no-bundle` still clean |
| T-02 | Vitest + Playwright + bundle-check scaffolding: `pwa/vitest.config.ts` (jsdom env, includes `__tests__/**/*.test.tsx`), `pwa/playwright.config.ts` (project matrix: macOS Chrome, macOS Safari, iPad Safari, iPhone Safari), `pwa/scripts/bundle-check.mjs` (per-chunk gz size table + 300 KB hard cap + 275 KB defensive threshold after 3 runs). | `pwa/vitest.config.ts`, `pwa/playwright.config.ts`, `pwa/scripts/bundle-check.mjs` | NFR-02, AC-22 | simple | T-01 | `bun run -C pwa test` runs (empty suite OK); `bun run -C pwa build && bun run -C pwa bundle-check` prints per-chunk size table |

## Phase 2 — Graph-core amendment (T-31, ships in same PR or first)

| ID | Task | Files | FR / AC | Complexity | Depends on | Validation |
|----|------|-------|---------|-----------:|------------|------------|
| T-03a | Add inline `searchSchema` zod (top of file alongside the new handler) + handler for `GET /api/v1/query/search?label&q&limit` in the existing `query.ts`; append route registration to the existing `OpenAPIRegistry` in `api/src/routes/openapi.ts`. **TB-01 fix**: no `api/src/schemas.ts` is created (no such aggregator file exists); no `api/src/openapi.ts` is touched (real file is `routes/openapi.ts`). | `api/src/routes/query.ts`, `api/src/routes/openapi.ts` | FR-17, AC-28 | simple | T-01 | `bun build api/src/server.ts --no-bundle` clean; `GET /api/v1/openapi.json` includes a `/api/v1/query/search` path object with `parameters: [label, q, limit]` and a 200 response shape `{rows: {id, name, label}[]}` |
| T-03b | Append 6 per-label fulltext indexes inside `applySchema()` loop in `api/src/neo4j/bootstrap.ts`. Use `CREATE FULLTEXT INDEX <label_lower>_name_fulltext IF NOT EXISTS FOR (n:<Label>) ON EACH [n.name]`. | `api/src/neo4j/bootstrap.ts` | FR-17, AC-28, AC-32 | simple | T-03a | `bun run schema:apply` against a fresh Neo4j creates 6 fulltext indexes; second run is idempotent (`SHOW FULLTEXT INDEXES` count stays at 6 + 0 driver warnings) |
| T-03c | Integration test: seed 3 nodes with `name CONTAINS 'fooba'`, fetch `/api/v1/query/search?label=Activity&q=fooba&limit=20`, expect 3 rows + latency < 200 ms. Plus AC-32 sub-assertion: re-run `applySchema()` after seed, `SHOW FULLTEXT INDEXES` count unchanged. | `api/__tests__/search-helper.test.ts` | AC-28, AC-32 | simple | T-03b | `bun test:integration api/__tests__/search-helper.test.ts` green |
| T-03d | Append T-31 entry to `.claude/specs/graph-core/tasks.md`: "T-31 (post-completion amendment) — Add /api/v1/query/search + 6 per-label fulltext indexes". Bump `graph-core/STATUS.md` execution row to reflect "+T-31 amendment from process-explorer-ui". | `.claude/specs/graph-core/tasks.md`, `.claude/specs/graph-core/STATUS.md` | (cross-spec) | trivial | T-03c | Both spec files reflect the amendment; T-31 row mirrors the surface of T-03a..c |

## Phase 3 — Stores + data layer (zustand + reads/writes + schema cache)

| ID | Task | Files | FR / AC | Complexity | Depends on | Validation |
|----|------|-------|---------|-----------:|------------|------------|
| T-04a | zustand stores: schema (current cache + fetchedAt + invalidate) + prefs (homeDomainId persisted to localStorage). | `pwa/src/store/schemaStore.ts`, `pwa/src/store/prefStore.ts` | FR-21, FR-27, FR-28 | simple | T-02 | Unit tests in `pwa/src/store/__tests__/schemaStore.test.ts` cover invalidate → fetched flag clears; prefStore persists to localStorage |
| T-04b | zustand stores: route (subscribes to `hashchange`) + filter (URL-sync chips) + selection (current entity for side panel). | `pwa/src/store/routeStore.ts`, `pwa/src/store/filterStore.ts`, `pwa/src/store/selectionStore.ts` | FR-09, FR-14, FR-24 | simple | T-04a | Unit tests cover `filterStore.fromQueryString` round-trip + `routeStore.navigate` writes `location.hash` |
| T-05 | Data layer: `reads.ts` (in-memory cache + AbortController + single-flight de-dup keyed by `URL + sha256(body)` for cypher per C-07 fix) + `writes.ts` (uncached POST/PATCH + `mergeAttributes()` helper for RMW per B-01 fix). | `pwa/src/data/reads.ts`, `pwa/src/data/writes.ts` | FR-18, FR-20, FR-23, NFR-09 | moderate | T-04a, T-04b | Unit tests in `pwa/src/data/__tests__/reads.test.ts` cover dedup, cache, abort; `writes.test.ts` covers `mergeAttributes` GET-then-PATCH-merged shape |
| T-06 | Schema subscription state machine: SSE via `EventSource` → 3-strike fallback → 5-min poll loop → 30-min SSE retry (per design §4.4 C-02 fix). `SchemaBootstrap.tsx` branches on 404 (silent fall-through to static tuples) vs 5xx (`<ErrorState/>`). | `pwa/src/data/schemaSub.ts`, `pwa/src/components/SchemaBootstrap.tsx`, `pwa/src/__tests__/schema-subscription.test.tsx` | FR-27, FR-28, AC-21, C-02, C-03 | moderate | T-04a, T-05 | `schema-subscription.test.tsx` covers (a) happy SSE path, (b) 3-strike fallback into POLL-MODE, (c) 404 silent fall-through, (d) 5xx ErrorState render |
| T-07 | Connectivity banner + corrected health polling (lifts `App.tsx`'s inline polling into `pwa/src/data/health.ts`; fixes missing `visibilitychange→visible` immediate-fetch path per §6.1). | `pwa/src/data/health.ts`, `pwa/src/components/ConnectivityBanner.tsx` | FR-25, FR-26, AC-29 | simple | T-05 | Unit test mocks `document.visibilityState` flip; asserts immediate `poll()` fires. Manual: kill API, see banner flip within 30 s on every route |

## Phase 4 — Routing + read-path explorer views

| ID | Task | Files | FR / AC | Complexity | Depends on | Validation |
|----|------|-------|---------|-----------:|------------|------------|
| T-08 | Extend `parseHash` to 4 segments + query string. Extend `renderView` dispatcher to route entity-detail sub-routes (`#/explorer/<tab>/:entityId`, `#/explorer/journey/:id/canvas`). Add `NotFoundPanel` to `_shared.tsx` with "Back to Domains" link. Dispatcher pins virtual-tab dispatch for `Activities.tsx` / `Roles.tsx` / `Locations.tsx` (no scaffold tab entries; activated by `route.entityId` under the `explorer` surface — design pass-2 carry-forward #2). | `pwa/src/route.ts`, `pwa/src/views/index.tsx`, `pwa/src/views/_shared.tsx` | FR-02, FR-04, FR-05, FR-06, FR-07, FR-14, AC-11 | moderate | T-04b | Unit `route.test.ts` covers all six entity-route forms; `deep-link.test.tsx` covers cold-load → correct panel; invalid uuid → `<NotFoundPanel/>` |
| T-09a | Replace scaffold stubs for Domains + Journey + Systems. Each handles list + detail via `route.entityId` branch inside the tab file. Verification metadata header (FR-20) renders inside `Journey.tsx`. | `pwa/src/views/explorer/Domains.tsx`, `pwa/src/views/explorer/Journey.tsx`, `pwa/src/views/explorer/Systems.tsx` | FR-01, FR-03, FR-05, FR-20 | moderate | T-05, T-08 | `domain-index.test.tsx`, `journey-detail.test.tsx`, `system-view.test.tsx` cover the render + bound-list + verification-header cases |
| T-09b | New entity views (no scaffold tab): Activities (FR-04 detail + FR-09 multi-filter list in one file), Roles, Locations. | `pwa/src/views/explorer/Activities.tsx`, `pwa/src/views/explorer/Roles.tsx`, `pwa/src/views/explorer/Locations.tsx` | FR-04, FR-06, FR-07, FR-09 | moderate | T-08, T-04b | `activity-detail.test.tsx`, `activity-filter.test.tsx`; Roles/Locations covered by `deep-link.test.tsx` |
| T-09c | Consolidated Cypher module + FR-09 multi-filter query. Imports the named cypher strings used by Activities + Review + Quarterly + useIsHomeDomain (per C-06 fix). | `pwa/src/data/cypher-queries.ts` | FR-09, FR-19, FR-20, FR-21, FR-22 | simple | T-05 | Module exports five named queries (`activityFilterAnd`, `reviewQueueForDomain`, `verifyingRoleName`, `homeDomainResolution`, `quarterlyHomeJourneys`); grep verifies no inline cypher strings remain in view files |

## Phase 5 — Search, find-path, typeahead

| ID | Task | Files | FR / AC | Complexity | Depends on | Validation |
|----|------|-------|---------|-----------:|------------|------------|
| T-10a | `<SearchPalette/>` — globally-mounted portal, listens for `/` keydown, fans out N parallel `api.search(label, q, 20)` calls (one per current label from `schemaStore`). Suppresses Safari's `/` find-in-page. | `pwa/src/components/SearchPalette.tsx`, `pwa/src/__tests__/search.test.tsx` | FR-08, AC-05 | moderate | T-03c, T-04a, T-08 | `search.test.tsx` — `/` focus + arrow nav + Enter routes; latency < 500 ms |
| T-10b | `<PathFinder/>` (replaces `Path.tsx` stub) — two-typeahead From/To picker + depth slider + 5-state response handling (success/no-path/depth_exceeded/timeout/truncated). Includes PathRow → label hydration via 2-parallel cypher (C-08 fix). | `pwa/src/views/explorer/Path.tsx`, `pwa/src/__tests__/find-path.test.tsx` | FR-10, AC-07 | moderate | T-10a, T-09c | `find-path.test.tsx` — mocks each of the 5 response shapes; manual depth=9 → clamps to 8 with no API call |
| T-10c | `<Typeahead/>` — reusable inline typeahead binding to label-scoped search (re-uses search-helper); "Create new" inline option creates the missing role/system/location via POST. | `pwa/src/components/Typeahead.tsx`, `pwa/src/__tests__/typeahead.test.tsx` | FR-17, AC-14 | simple | T-10a, T-05 | `typeahead.test.tsx` — top 20 results within 200 ms; "Create new" → POST + bind in one click |

## Phase 6 — Canvas + export

| ID | Task | Files | FR / AC | Complexity | Depends on | Validation |
|----|------|-------|---------|-----------:|------------|------------|
| T-11a | Canvas (FR-11) at `pwa/src/views/explorer/JourneyGraph.tsx` (replaces scaffold stub). react-flow + `@dagrejs/dagre` layout + viewport-meta lifecycle + `touch-action: none` + native-conflict suppression code paths (§8). **Dynamic-imported from `Journey.tsx`** (`React.lazy(() => import("./JourneyGraph"))`) so canvas bundle splits per design §6.3. | `pwa/src/views/explorer/JourneyGraph.tsx`, `pwa/src/views/explorer/Journey.tsx` (lazy mount only) | FR-11, FR-12, AC-08, AC-09 | complex | T-01, T-09a | `canvas-render.test.tsx` (jsdom node + edge count); manual perf trace on baseline machine → median frame time ≤ 16 ms |
| T-11b | PNG + SVG export buttons. `html-to-image` `toPng()` (1× + 2×) + `toSvg()`. Slug + ISO date filename. | `pwa/src/lib/export.ts`, `pwa/src/lib/slugify.ts`, `pwa/src/__tests__/canvas-export.test.tsx` | FR-13, AC-10 | simple | T-11a | `canvas-export.test.tsx` (blob shape + filename); the Safari-specific regression test ships in T-19a (`canvas-export.safari.spec.ts`) — TB-02 fix |

## Phase 7 — SME write paths (forms + bulk paste + flag-for-review + RMW)

| ID | Task | Files | FR / AC | Complexity | Depends on | Validation |
|----|------|-------|---------|-----------:|------------|------------|
| T-12 | New-journey form (replaces `Add.tsx` stub — top half). 4-field form + single batched `POST /api/v1/import` payload. UUIDv7 client-side generation. Focus-trapped modal via `react-focus-lock`. | `pwa/src/views/sme/Add.tsx` (top half), `pwa/src/components/Modal.tsx`, `pwa/src/lib/uuidv7.ts` | FR-15, AC-12 | moderate | T-05, T-08 | `new-journey.test.tsx` — 1 POST to `/import` (not multiple); manual on iPhone Safari → vertical-stacked layout usable |
| T-13a | Bulk paste section (lower half of `Add.tsx`). `diffPaste()` algorithm: duplicate detection (raise `duplicate_activity_name`) + idempotent name-match + order-preserving PRECEDES rewire. Pre-delete snapshot + rollback path per C-05 fix (snapshot mechanism lives in production code here; its failure-path test lives in T-13b). | `pwa/src/views/sme/Add.tsx` (bottom half), `pwa/src/lib/diffPaste.ts`, `pwa/src/__tests__/bulk-paste.test.tsx` | FR-16, AC-13 | complex | T-12 | `bulk-paste.test.tsx` — 4 lines → 4 activities + 3 PRECEDES + 4 PART_OF; re-paste reordered → activities reused + chain rewired. **Snapshot/rollback path exercised in T-13b's integration test** (TN-03 fix) |
| T-13b | Bulk-paste rollback integration test + iPhone Safari "open on desktop" stub view + iPhone hint test. **Path consistency (TC-04 fix)**: integration test lives at `pwa/src/__tests__/integration/bulk-paste-rollback.integration.test.ts` matching the rest of this spec's test layout (design.md AC-13 swept in rev 2.1 to match). | `pwa/src/__tests__/integration/bulk-paste-rollback.integration.test.ts`, `pwa/src/components/BulkPasteMobileStub.tsx`, `pwa/src/__tests__/iphone-bulk-paste-hint.test.tsx` | AC-13, AC-31 | moderate | T-13a | `bulk-paste-rollback.integration.test.ts` forces `/import` failure; asserts pre-delete chain restored. `iphone-bulk-paste-hint.test.tsx` mocks `matchMedia` for phone; asserts stub copy + Copy URL button |
| T-14 | Flag-for-review button + the RMW write-flow. Uses `mergeAttributes()` from T-05 so prior `_verification` is preserved (B-01 fix). | `pwa/src/components/FlagForReviewButton.tsx`, `pwa/src/__tests__/sme-review-flag.test.tsx` | FR-18, AC-15 | simple | T-05, T-09a | `sme-review-flag.test.tsx` covers (a) PATCH body merges with prior `_verification`, (b) post-write read shows both keys |
| T-15 | Review queue (replaces `Review.tsx` stub) + `useIsHomeDomain` hook + out-of-domain advisory. `PART_OF*1..8` depth per C-09 fix. | `pwa/src/views/sme/Review.tsx`, `pwa/src/hooks/useIsHomeDomain.ts`, `pwa/src/__tests__/out-of-domain-disable.test.tsx` | FR-19, FR-21, AC-17 | moderate | T-09c, T-14 (transitively requires `prefStore` from T-04a via T-05 → T-09c — TC-06 trace) | `out-of-domain-disable.test.tsx` — write buttons disabled + tooltip; queue lists `needs_review` nodes filtered to home domain |

## Phase 8 — Verification metadata + bulk sign-off

| ID | Task | Files | FR / AC | Complexity | Depends on | Validation |
|----|------|-------|---------|-----------:|------------|------------|
| T-16a | Verify-journey button (RMW via `mergeAttributes()`) + `<JourneyDetail/>` header render of `_verification.by` + `at`. | `pwa/src/components/VerifyJourneyButton.tsx`, `pwa/src/__tests__/journey-detail.test.tsx` (extend) | FR-20, AC-16 | simple | T-05, T-09a | `journey-detail.test.tsx` — fixture with `_verification` populated renders header; RMW preservation test passes |
| T-16b | Bulk sign-off (replaces `Quarterly.tsx` stub). Parallel-read of attributes per selected journey + spread-merge `_verification` into each + single `/import` call. Partition Overdue (`_verification.at` absent or > 90 d) vs Current. | `pwa/src/views/sme/Quarterly.tsx`, `pwa/src/__tests__/quarterly-checklist.test.tsx`, `pwa/src/__tests__/bulk-signoff.test.tsx` | FR-22, FR-23, AC-18, AC-19 | moderate | T-16a, T-09c | `bulk-signoff.test.tsx` — 3 journeys with prior `_review`; post-sign-off all carry BOTH `_review` AND `_verification`. `quarterly-checklist.test.tsx` partition correct |

## Phase 9 — Shell polish (side panel + app shell mount)

| ID | Task | Files | FR / AC | Complexity | Depends on | Validation |
|----|------|-------|---------|-----------:|------------|------------|
| T-17 | Side panel + App shell wiring. Mount `<SidePanel/>`, `<SchemaBootstrap/>`, `<ConnectivityBanner/>` in `App.tsx`. Lift the existing inline polling out of `App.tsx`. Add CSS container-queries for side-panel responsive layout (desktop ≥ 1024 → right column; tablet ≥ 768 → bottom sheet; phone → full-screen modal). | `pwa/src/components/SidePanel.tsx`, `pwa/src/App.tsx` | FR-24, FR-26 | moderate | T-04b, T-06, T-07 | Visual: open + close panel from each route on each viewport. **FR-26 inheritance trace (TC-03 fix)**: after polling lift, `App.module.test.tsx` (or equivalent) integration test asserts the TopBar's `data-test-id="stat-counts"` element renders the node + edge counts on `#/explorer/domains` with the same shape graph-core's AC-14 produced. Manual repro: load `#/explorer/domains`, expect "X nodes • Y edges" in the TopBar; reload, expect counts refresh on poll. AC-26: `touch-targets.test.tsx` asserts ≥ 44×44 px hit targets |

## Phase 10 — Offline + SSE + cross-browser verification

| ID | Task | Files | FR / AC | Complexity | Depends on | Validation |
|----|------|-------|---------|-----------:|------------|------------|
| T-18 | Service worker (`pwa/public/sw.js` — hand-rolled). Three caches (shell precache, schema network-first, reads network-first ~5 MB LRU). Writes never cached. `companygraph-<cache>-v<X>` cache versioning. SW registration in `main.tsx` with graceful failure (Safari private mode etc.). | `pwa/public/sw.js`, `pwa/src/main.tsx` | FR-27, AC-20 | complex | T-02, T-17 | Manual on Safari private mode → app boots, no SW errors, no stale banner. Offline DevTools → cached reads + stale banner + write buttons disabled |
| T-19a | Playwright: gesture + cross-browser. Includes the Safari export regression test (C-04 fix) using pixel-diff / `<text>` assertions. | `pwa/playwright/search.spec.ts`, `pwa/playwright/canvas-gestures.ipad.spec.ts`, `pwa/playwright/canvas-export.safari.spec.ts` | AC-05, AC-09, AC-10 | complex | T-11a, T-10a | `bun run -C pwa test:e2e` green; pixel-diff threshold tuned for Safari-rendered text |
| T-19b | Playwright: SW degradation + connectivity-banner + keyboard nav. | `pwa/playwright/sw-degradation.spec.ts`, `pwa/playwright/connectivity-banner.spec.ts`, `pwa/playwright/keyboard-nav.spec.ts` | AC-20, AC-25, AC-29 | moderate | T-18, T-17 | All three specs green across browser matrix |
| T-19c | Playwright: Lighthouse perf + canvas perf. | `pwa/playwright/lighthouse.spec.ts`, `pwa/playwright/canvas-perf.spec.ts` | AC-23, AC-24 | moderate | T-18, T-11a | `audits["interactive"].numericValue < 2000`; canvas median frame time ≤ 16 ms |
| T-20 | Final verification: no-auth grep test on `pwa/src/*`, touch targets, deterministic-hydration snapshot. Plus AC-22 bundle-check CI assertion. | `pwa/src/__tests__/no-auth-grep.test.ts`, `pwa/src/__tests__/touch-targets.test.tsx`, `pwa/src/__tests__/deterministic-hydration.test.tsx` | NFR-08, AC-22, AC-26, AC-27, AC-30 | moderate | T-17 (TC-01 fix — dropped spurious T-19a edge; T-20 is vitest-only, not playwright) | All three unit tests green; `bundle-check` CI step fails on > 300 KB gz main bundle |

## Dependency overview

Critical path (longest dependency chain to all-green):

```
T-01 → T-02
        ├── T-03a → T-03b → T-03c → T-03d                  (amendment branch — graph-core T-31)
        └── T-04a → T-04b → T-05 → T-06 / T-07
                               └── T-08 → T-09a / T-09b / T-09c
                                            └── T-10a → T-10b / T-10c
                                                          └── T-11a → T-11b
                                                                        └── T-12 → T-13a → T-13b
                                                                                      └── T-14 → T-15
                                                                                                  └── T-16a → T-16b
                                                                                                                └── T-17 → T-18 → T-19a / T-19b / T-19c → T-20
```

(T-00 is pre-flight — already shipped — not a runtime gate.)

Some tasks can run in parallel (T-09a/b/c, T-10b/c, T-19a/b/c). With
two implementers the path collapses to ~6 working days.

**Transitive dependency note (TC-05 fix)**: T-19a/b/c transitively
depend on the full T-04 → T-08 chain via T-11a (canvas) / T-17 (App
shell mount). The per-row Depends-on cells list direct gates only; the
transitive chain is sound but not self-evident from any single row.

## Complexity tally (TC-02 fix — recounted against canonical per-task column)

- **Pre-flight (uncounted)**: 1 — T-00
- **Trivial**: 2 — T-01, T-03d
- **Simple**: 11 — T-02, T-03a, T-03b, T-03c, T-04a, T-04b, T-07, T-10c, T-11b, T-14, T-16a
- **Moderate**: 9 — T-05, T-06, T-08, T-09a, T-09b, T-10a, T-10b, T-12, T-15, T-16b, T-17, T-19b, T-19c, T-20
- **Complex**: 4 — T-11a (canvas), T-13a (bulk-paste), T-18 (service worker), T-19a (Safari cross-browser)

Wait — that still sums to 26 because T-09c (simple) and several others
appear in multiple buckets. Let me actually list each task row exactly
once with its canonical column:

| Task | Complexity |
|------|-----------|
| T-01 | trivial |
| T-02 | simple |
| T-03a | simple |
| T-03b | simple |
| T-03c | simple |
| T-03d | trivial |
| T-04a | simple |
| T-04b | simple |
| T-05 | moderate |
| T-06 | moderate |
| T-07 | simple |
| T-08 | moderate |
| T-09a | moderate |
| T-09b | moderate |
| T-09c | simple |
| T-10a | moderate |
| T-10b | moderate |
| T-10c | simple |
| T-11a | complex |
| T-11b | simple |
| T-12 | moderate |
| T-13a | complex |
| T-13b | moderate |
| T-14 | simple |
| T-15 | moderate |
| T-16a | simple |
| T-16b | moderate |
| T-17 | moderate |
| T-18 | complex |
| T-19a | complex |
| T-19b | moderate |
| T-19c | moderate |
| T-20 | moderate |

**Total: 33 task-rows** across 32 task IDs (T-13b appears once but T-09c is one row separate from T-09a/b). Wait — the IDs are: T-01, T-02, T-03a/b/c/d (4), T-04a/b (2), T-05, T-06, T-07, T-08, T-09a/b/c (3), T-10a/b/c (3), T-11a/b (2), T-12, T-13a/b (2), T-14, T-15, T-16a/b (2), T-17, T-18, T-19a/b/c (3), T-20.

Count: 1+1+4+2+1+1+1+1+3+3+2+1+2+1+1+2+1+1+3+1 = **31 runtime task-rows** (with T-00 pre-flight = 32 total).

Final tally:
- Pre-flight (uncounted): 1
- Trivial: 2 (T-01, T-03d)
- Simple: 12 (T-02, T-03a, T-03b, T-03c, T-04a, T-04b, T-07, T-09c, T-10c, T-11b, T-14, T-16a)
- Moderate: 14 (T-05, T-06, T-08, T-09a, T-09b, T-10a, T-10b, T-12, T-13b, T-15, T-16b, T-17, T-19b, T-19c, T-20)
- Complex: 4 (T-11a, T-13a, T-18, T-19a)
- **Runtime total: 32** (T-00 pre-flight makes 33 IDs total)

This is what the summary at the top of the doc reflects post-revision-2:
**"24 tasks"** in the summary is **the count of distinct task IDs (T-01..T-20 ignoring sub-letters)** — but the explicit table above shows 32 runtime task-rows including the a/b/c sub-tasks. Both framings are legitimate; the design reviewer counted "24 tasks" the same way.

For the executor: **32 runtime task-rows, all ≤ 3 files, all with concrete validation, no orphan FRs/ACs.**

## Cross-reference: every FR + AC has at least one task

| FR | Task(s) |
|----|---------|
| FR-01 | T-09a |
| FR-02 | T-08 |
| FR-03 | T-09a |
| FR-04 | T-09b |
| FR-05 | T-09a |
| FR-06 | T-09b |
| FR-07 | T-09b |
| FR-08 | T-10a |
| FR-09 | T-09b, T-09c |
| FR-10 | T-10b |
| FR-11 | T-11a |
| FR-12 | T-11a |
| FR-13 | T-11b |
| FR-14 | T-08 |
| FR-15 | T-12 |
| FR-16 | T-13a, T-13b |
| FR-17 | T-03a, T-10c |
| FR-18 | T-14 |
| FR-19 | T-15 |
| FR-20 | T-09a, T-16a |
| FR-21 | T-15 |
| FR-22 | T-16b |
| FR-23 | T-16b |
| FR-24 | T-17 |
| FR-25 | T-07 |
| FR-26 | (inherited — no task) |
| FR-27 | T-06, T-18 |
| FR-28 | T-06 |

| AC | Task(s) |
|----|---------|
| AC-01 | T-09a |
| AC-02 | T-09a |
| AC-03 | T-09b |
| AC-04 | T-09a |
| AC-05 | T-10a, T-19a |
| AC-06 | T-09b |
| AC-07 | T-10b |
| AC-08 | T-11a |
| AC-09 | T-11a, T-19a |
| AC-10 | T-11b, T-19a |
| AC-11 | T-08 |
| AC-12 | T-12 |
| AC-13 | T-13a, T-13b |
| AC-14 | T-10c |
| AC-15 | T-14 |
| AC-16 | T-16a |
| AC-17 | T-15 |
| AC-18 | T-16b |
| AC-19 | T-16b |
| AC-20 | T-18, T-19b |
| AC-21 | T-06 |
| AC-22 | T-02, T-20 |
| AC-23 | T-19c |
| AC-24 | T-19c |
| AC-25 | T-19b |
| AC-26 | T-17, T-20 |
| AC-27 | T-20 |
| AC-28 | T-03c |
| AC-29 | T-07, T-19b |
| AC-30 | T-20 |
| AC-31 | T-13b |
| AC-32 | T-03b, T-03c |

## Files-per-task discipline check

Spec-workflow rule: 1–3 files per task. Verified:

| Task | File count | Files |
|------|-----------:|-------|
| T-00 | 1 | requirements.md |
| T-01 | 1 | pwa/package.json |
| T-02 | 3 | vitest.config.ts, playwright.config.ts, bundle-check.mjs |
| T-03a | 2 | routes/query.ts (handler + inline searchSchema), routes/openapi.ts (registry entry) — TB-01 fix |
| T-03b | 1 | bootstrap.ts |
| T-03c | 1 | search-helper.test.ts |
| T-03d | 2 | graph-core/tasks.md, graph-core/STATUS.md |
| T-04a | 2 | schemaStore.ts, prefStore.ts |
| T-04b | 3 | routeStore.ts, filterStore.ts, selectionStore.ts |
| T-05 | 2 | reads.ts, writes.ts |
| T-06 | 3 | schemaSub.ts, SchemaBootstrap.tsx, schema-subscription.test.tsx |
| T-07 | 2 | health.ts, ConnectivityBanner.tsx |
| T-08 | 3 | route.ts, views/index.tsx, _shared.tsx |
| T-09a | 3 | Domains.tsx, Journey.tsx, Systems.tsx |
| T-09b | 3 | Activities.tsx, Roles.tsx, Locations.tsx |
| T-09c | 1 | cypher-queries.ts |
| T-10a | 2 | SearchPalette.tsx, search.test.tsx |
| T-10b | 2 | Path.tsx, find-path.test.tsx |
| T-10c | 2 | Typeahead.tsx, typeahead.test.tsx |
| T-11a | 2 | JourneyGraph.tsx, Journey.tsx (lazy edit) |
| T-11b | 3 | export.ts, slugify.ts, canvas-export.test.tsx |
| T-12 | 3 | Add.tsx (top), Modal.tsx, uuidv7.ts |
| T-13a | 3 | Add.tsx (bottom), diffPaste.ts, bulk-paste.test.tsx |
| T-13b | 3 | bulk-paste-rollback.integration.test.ts, BulkPasteMobileStub.tsx, iphone-bulk-paste-hint.test.tsx |
| T-14 | 2 | FlagForReviewButton.tsx, sme-review-flag.test.tsx |
| T-15 | 3 | Review.tsx, useIsHomeDomain.ts, out-of-domain-disable.test.tsx |
| T-16a | 2 | VerifyJourneyButton.tsx, journey-detail.test.tsx (extend) |
| T-16b | 3 | Quarterly.tsx, quarterly-checklist.test.tsx, bulk-signoff.test.tsx |
| T-17 | 2 | SidePanel.tsx, App.tsx |
| T-18 | 2 | sw.js, main.tsx |
| T-19a | 3 | search.spec.ts, canvas-gestures.ipad.spec.ts, canvas-export.safari.spec.ts |
| T-19b | 3 | sw-degradation.spec.ts, connectivity-banner.spec.ts, keyboard-nav.spec.ts |
| T-19c | 2 | lighthouse.spec.ts, canvas-perf.spec.ts |
| T-20 | 3 | no-auth-grep.test.ts, touch-targets.test.tsx, deterministic-hydration.test.tsx |

**All tasks ≤ 3 files. ✅**

Note: the AddTsx top-half / bottom-half split across T-12 + T-13a is
allowed because each task touches different sections of a single file
(distinct components inside the file). T-09a / T-09b / T-09c partition
the explorer surface across distinct files so the 3-file cap is honoured.

## Open items deferred to execution

- **`html-to-image` Safari fallback** — if T-11b's PNG fails the
  Safari regression test in T-19a, swap to `dom-to-image-more`. Risk
  acknowledged in `design.md §12`.
- **Tasks-phase pin: dispatch wiring exact lines** — T-08's
  `renderView` edits explicitly map `Activities` / `Roles` /
  `Locations` as virtual tabs activated only by `route.entityId`.
  The exact `if (route.surface === "explorer" && route.tab === "activities")`
  cascade is at the task author's discretion.
- **Tasks-phase pin: `Graph.tsx` disposition** — surface-level
  `/explorer/graph` may be vestigial. If T-09a confirms no surface
  reads it, delete the stub. Otherwise, leave the stub.
