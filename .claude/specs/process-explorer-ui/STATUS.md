# Spec: process-explorer-ui
**Size**: large | **Created**: 2026-05-22 | **Current Phase**: tasks:approved — ready for execution

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (revision 3 — B-03 fix: SME route names synced with scaffold; AC-25 + AC-15 + AC-18 prose all updated) | frank | 2026-05-23 |
| Req Review | pass-1 revise (5 blockers, 7 concerns, 4 nits) → pass-2 approve (24/24 cleanly absorbed, 0 partial, 0 regressed; 5 open-accepted for design) | spec-review-agent | 2026-05-22 |
| Design | approved (revision 2, 2026-05-23 — all pass-1 findings absorbed; revision 2.1 swept retro-findings) | frank | 2026-05-23 |
| Design Review | pass-1 revise (4B, 9C, 5N) → pass-2 approve (13/14 cleanly absorbed, 1 partial → tasks-phase carry-forward, 0 regressed; 3 minor carry-forwards) | spec-review-agent | 2026-05-23 |
| Tasks | approved (revision 2, 2026-05-23 — both blockers + retro-findings cleanly absorbed) | frank | 2026-05-23 |
| Task Review | pass-1 revise (2B, 6C, 4N, 2 retro-findings) → pass-2 approve (both blockers + retros absorbed; 7 cosmetic carry-forwards to execution — none data-corruption or contract-break) | spec-review-agent | 2026-05-23 |
| Execution | **complete — all 24 tasks (T-01..T-20) shipped; 171 pwa unit tests pass** | frank | 2026-05-23 |

**Review passes**: requirements=2 (cap reached), design=2 (cap reached — approved 2026-05-23), tasks=2 (cap reached — approved 2026-05-23)

**Execution progress (2026-05-23):**
- **All phases complete** (T-01..T-03d graph-core amendment + T-04a..T-20 full PWA)
- **Test suite**: `bun run test` (pwa vitest) → **31 files / 171 tests / 0 fail**
- **Build**: `vite build` → **clean, 393 KB JS / 118 KB gzip** (within 300 KB NFR-02 budget on gzip basis)
- **Verified live** (graph-core amendment): `bun test api/__tests__/search-helper.test.ts` → 6 pass / 0 fail
- 2 incidental build fixes applied 2026-05-23: (a) Add.tsx unterminated template literal; (b) Review.tsx imported nonexistent `reads` namespace → fixed to `{ cypherDedup }`
- FocusTrap jsdom fix: `vi.mock("focus-trap-react")` added to `src/__tests__/setup.ts` to allow Modal tests in headless environment

**Files shipped (all tasks complete):**
- **Phase 3** (stores + data): `store/{schemaStore,prefStore,routeStore,filterStore,selectionStore}.ts` + `data/{reads,writes,schemaSub,health,cypher-queries}.ts`
- **Phase 4** (routing + views): `route.ts` (4-segment), `views/index.tsx`, `views/_shared.tsx`, `views/explorer/{Domains,Journey,Systems,Activities,Roles,Locations}.tsx`
- **Phase 5** (search/path): `components/{SearchPalette,Typeahead}.tsx`, `views/explorer/Path.tsx`
- **Phase 6** (canvas + export): `views/explorer/JourneyGraph.tsx` (react-flow), `lib/{export,slugify}.ts`
- **Phase 7** (SME write paths): `views/sme/{Add,Review,Quarterly}.tsx`, `components/{Modal,FlagForReviewButton,VerifyJourneyButton,BulkPasteMobileStub}.tsx`, `lib/diffPaste.ts`, `lib/uuidv7.ts`, `hooks/useIsHomeDomain.ts`
- **Phase 8** (side panel + App): `components/SidePanel.tsx`, `App.tsx` (updated)
- **Phase 9** (offline/SW): `public/sw.js`, `public/manifest.webmanifest`, `main.tsx` (SW registration)
- **Phase 10** (playwright + T-20): `playwright/*.spec.ts` (9 specs), `src/__tests__/{no-auth-grep,touch-targets,deterministic-hydration}.test.{ts,tsx}`

**Files touched this session (graph-core amendment + PWA scaffolding):**
- `api/src/routes/query.ts` (handleSearch + searchQuery zod)
- `api/src/router.ts` (route registration)
- `api/src/neo4j/bootstrap.ts` (6 fulltext indexes inside applySchema loop)
- `api/src/routes/openapi.ts` (search endpoint registered)
- `api/__tests__/search-helper.test.ts` (6 integration tests — AC-28 + AC-32)
- `pwa/package.json` (deps + scripts)
- `pwa/vitest.config.ts`, `pwa/vitest.integration.config.ts`, `pwa/playwright.config.ts`
- `pwa/scripts/bundle-check.mjs`
- `pwa/src/__tests__/setup.ts`
- `.claude/specs/graph-core/tasks.md` (T-31 row appended)
- `.claude/specs/graph-core/STATUS.md` (post-completion amendment row)

**Tasks pass-2 outcome (2026-05-23):** Verdict `approve`. Both pass-1 blockers (TB-01 fictional file paths in T-03a; TB-02 T-11b → T-19c mispointer) cleanly absorbed in tasks.md revision 2. Both design retro-findings swept in same commit (design.md §5.2/§11 now cite real `api/src/routes/query.ts` and `api/src/routes/openapi.ts`; design.md AC-13 matches tasks.md's `pwa/src/__tests__/integration/` path).

**Carry-forwards to execution phase (7 cosmetic — none data-corruption or contract-break):**
1. Complexity-tally prose in tasks.md §"Complexity tally" reads stream-of-consciousness (the recount lands correctly; just the prose is verbose). Cosmetic; executor may sed to clean up.
2. Diagram caption "Critical path" preserved across rev 2 — same observable graph.
3. TN-01..TN-04 nits left as partial/cosmetic (T-09a/b/c dep-cell asymmetry is style; T-00 pre-flight noise resolved but related TN entries left as breadcrumbs).
4. tasks.md §0 absorption table mislabels finding IDs (TC-01 in the rev-2 table = TC-03 of pass-1, etc.) — substance lands correctly; only the cross-reference labels drift. Cosmetic.
5. T-19c remains moderate complexity per canonical column; one reviewer wanted complex for lighthouse perf — left as moderate per the canonical column.
6. Cross-spec amendment scope verification table not re-replicated in tasks.md rev 2 (it's still in the original review-tasks.md and is informational only).
7. Three concrete file-paths corrected in design.md (`api/src/schemas.ts` → drop; `api/src/openapi.ts` → `api/src/routes/openapi.ts`; bulk-paste integration path align) but the design pass-2 STATUS.md remains stamped "approved" — the corrections are typo-class, not re-architecture.

**Tasks revision-1 highlights**:
- **24 tasks** (T-00 traceability + T-01..T-20), grouped into 10 phases mirroring `design.md §14`.
- All 3 design-pass-2 carry-forwards folded into tasks: T-08 (Activities/Roles/Locations dispatch), T-11a (JourneyGraph.tsx scaffold disposition), T-00 (requirements rev-3 traceability — already shipped).
- Complexity tally: 3 trivial + 8 simple + 11 moderate + 4 complex.
- Critical-path estimate: **8–12 working days** PWA + 1 day graph-core amendment (T-03a..T-03d) for single implementer; **~6 days** with two implementers running parallel branches.
- Every FR (28) + every AC (32) has at least one task; verified via cross-reference table at end of tasks.md.
- Every task is ≤ 3 files (spec-workflow rule); verified via files-per-task discipline table at end of tasks.md.
- Validation checkpoint after every phase boundary: `bun build --no-bundle` + `bun test` + `bun test:integration` + (for the amendment) graph-core test suite regression.

**Cross-spec amendment (T-03a..T-03d)**: ships the new T-31 against `graph-core/tasks.md` (graph-core is `execution:complete`) — one new route handler + 6 fulltext indexes in `applySchema()` + zod schema + OpenAPI registration + integration test. PR for this spec includes the amendment in the same commit OR blocks on graph-core merging T-31 first.

**Design pass-2 outcome (2026-05-23):** Verdict `approve`. The 4 pass-1 blockers (B-01 attributes_json RMW, B-02 graph-core T-31 amendment mechanism, B-03 SME route divergence, B-04 bootstrap.ts file path) + 9 concerns + 5 nits all verified absorbed against design.md revision 2. Three minor carry-forwards for the tasks phase:

1. **Tasks-phase carry: `JourneyGraph.tsx` scaffold disposition** — file list updated to place FR-11 canvas mode in `JourneyGraph.tsx` (existing stub) rather than `Journey.tsx`; tasks-phase confirms whether `Graph.tsx` (surface-level) is kept or removed.
2. **Tasks-phase carry: dispatch wiring for `Activities.tsx` / `Roles.tsx` / `Locations.tsx`** — these are new files for routes outside the scaffold's pre-wired tab list; tasks-phase pins the exact `renderView` dispatch lines (likely under the `explorer` surface as virtual tabs activated only via `route.entityId`).
3. **Pinned in design rev 2 already**: AC-15 + AC-18 + AC-25 prose now all use the new `#/sme/{add,review,quarterly}` route names (B-03 prose-bleed resolved during pass-2 sweep).

**Design revision-1 highlights** (resolves all 10 open design questions from requirements §Risks + 5 open-accepted carry-forwards):
- **Canvas library: react-flow 11.x** locked (resolves Q1 + graph-core/Risks #1). Bundle budget verified at ~202 KB gz against 300 KB NFR-02 cap. Dynamic-import fallback documented.
- **Graph-core amendment**: one new endpoint `GET /api/v1/query/search?label&q&limit` + 6 per-label full-text indexes on `name`. Must ship in same PR as PWA changes OR block on graph-core merging it first. Filed as one row in `graph-core/tasks.md` deferred backlog.
- **Service worker**: hand-rolled at `pwa/public/sw.js`. Three caches (shell precache, schema network-first single-entry, reads network-first ~5 MB LRU). Writes never cached. Degradation contract pinned for AC-20 (Safari private mode, quota exhausted, user denied — app boots normally without offline).
- **State**: zustand 4.5+ with 5 single-concern stores (schema, route, filter, selection, prefs). Schema cache hydrates from `/api/v1/schema` with `If-None-Match`/ETag; SSE subscription via browser `EventSource` (auto Last-Event-ID); 5-min ETag-poll fallback when SSE unconnected. Static `NODE_LABELS` const tuple is the boot-time fallback until ontology-manager ships.
- **Routing extension**: `parseHash` extended to 4 segments + query string. Backward-compatible with existing 2-segment surfaces; deep-link `#/explorer/journeys/:id/canvas` style routes added. No react-router (saves ~12 KB gz).
- **Connectivity banner correction**: existing App.tsx polls every 30 s but misses the on-mount-on-visibility-change-to-visible immediate-fetch path. Design lifts polling into `pwa/src/data/health.ts` and corrects AC-29 inheritance from graph-core/AC-14 on every route.
- **iPhone bulk-paste stub view (OC-04 resolved)**: new AC-31 covers a "desktop-only" stub at `#/sme/add` on phone-class viewports with Copy URL button.
- **AC coverage**: all 30 ACs from requirements + 1 new (AC-31) mapped to specific test paths (`pwa/src/__tests__/*.test.tsx` for vitest/jsdom; `pwa/playwright/*.spec.ts` for cross-browser gesture/SW). Test framework + CI scripts pinned (vitest + @playwright/test).
- **File count**: 49 new files in pwa + 4 graph-core amendments + 4 test files + scripts = **53 new, 15 modified, 68 total touched files**. Matches `large` sizing.
- **Critical-path estimate**: 8–12 working days PWA + 1 day graph-core amendment for a single focused implementer.

**Cross-spec amendments required** (filed by this spec):
- **`graph-core/tasks.md`** — append one row in the deferred backlog: "Add `GET /api/v1/query/search?label&q&limit` + 6 per-label full-text indexes on `name`. AC: `api/__tests__/search-helper.test.ts` (also AC-28 of process-explorer-ui)."

**Open-accepted carried for tasks phase** (non-blocking; tasks pin):
1. `uuidv7` package vs hand-rolled — ~1 KB gz delta
2. `react-focus-lock` vs hand-rolled focus trap — ~3 KB gz delta
3. `dagre` layout options (nodesep, ranksep) tuned against 200-node fixture
4. `html-to-image` vs `dom-to-image-more` fallback — Safari `<foreignObject>` quirks
5. Bundle-check threshold tightening — from 300 KB cap to ~275 KB if build runs under 250 KB
6. Schema-fallback console warning exact copy

**Open-accepted for design phase** (carried from pass-2 review):
1. NC-01: `/api/v1/schema` ETag advisory wording — non-blocking.
2. OC-01: Risks #3 historical residue — review prose.
3. OC-02: Risks #8 staleness — `createdAt` tiebreaker is now in FR-03, can be retired from Risks #8.
4. OC-03: Platforms & Input Modes table edge cases (Pencil pointer fidelity, macOS Safari horizontal-swipe back).
5. OC-04: Missing AC for iPhone bulk-paste "open on desktop" hint.
6. OC-05: Multi-tab divergence acknowledged in Scope; no AC, no test.

**User stories owned** (18 — largest downstream spec):
- **PE-1.1..PE-1.4 (Browse & navigate)** — domain index, drill-down, activity detail, system-centric view (persona P2 Ravi).
- **PE-2.1..PE-2.3 (Search & filter)** — full-text search, multi-filter, shortest-path trace (P2 Ravi).
- **PE-3.1..PE-3.3 (Visualise & export)** — interactive canvas, PNG/SVG export, deep-link URLs (P2 Ravi).
- **SME-1.1..SME-1.3 (Bootstrap a domain catalog)** — new-journey form, bulk paste, typeahead binding (persona P5 Priya).
- **SME-2.1..SME-2.3 (Correct & validate)** — needs-review flag, verification metadata, out-of-domain guard (P5 Priya).
- **SME-3.1..SME-3.2 (Quarterly sign-off)** — quarterly checklist, bulk sign-off (P5 Priya).

**Personas**: P2 (Ravi, Process Explorer — read paths, daily cadence) + P5 (Priya, Domain SME — write paths, weekly cadence).

**Depends on**:
- `graph-core` — for read API (already complete-with-revisions) + ONE new search helper endpoint (FR-17 → AC-28).
- `ontology-manager` — soft dependency for the schema-change subscription (FR-28). Spec works without it (falls back to polling `/api/v1/schema`).

**Sizing rationale**: **Largest** downstream spec by every metric — 28 FRs, 28 ACs, full PWA gesture/keyboard/touch surface (12 Native Conflicts rows), two personas, both read and write paths, interactive canvas-renderer decision, service-worker rollout. > 30 new files expected. Classified **large** by all gates.

**Verification:**
- `verified_at`: pending
- `verification_artifact`: pending

**Artifacts:**
- 📄 Requirements: `.claude/specs/process-explorer-ui/requirements.md`
- 📄 Design: `.claude/specs/process-explorer-ui/design.md` (pending)
- 📄 Tasks: `.claude/specs/process-explorer-ui/tasks.md` (pending)
- 📝 Reviews: `.claude/specs/process-explorer-ui/review-*.md` (pending)
- 🗂️ User stories: `companygraph-user-stories.html` (v0.1, 2026-05-22 — PE-1..PE-3, SME-1..SME-3)

**Cross-spec touch points** (call out for design phase + cross-spec reviewers):
- One backend extension required of `graph-core`: `GET /api/v1/query/search?label=:L&q=:fragment&limit=:n` for typeahead. AC-28 verifies.
- Subscribes to `ontology-manager`'s `ontology.changed` event (or polls `/api/v1/schema` if SSE not delivered).
- Reads from the **runtime** ontology registry, never imports `graph-core`'s compile-time `NODE_LABELS` / `EDGE_TYPES` const (enforced by `ontology-manager/NFR-02` + `ontology-manager/AC-15`).

**Open design questions** (carried from requirements §Risks for the design phase to resolve):

1. Canvas-library choice (resolves `graph-core/Risks #1`) — recommend `react-flow`.
2. Scope of the new `/api/v1/query/search` endpoint added to `graph-core` (must coordinate via a `graph-core` amendment).
3. Out-of-domain guard semantics — advisory-only vs server-side 403 (FR-21 + Risks #3).
4. Service-worker cache budget on Safari (Risks #4).
5. `graph-core` payload-size limit interaction with bulk paste (Risks #5).
6. Per-route data cache strategy for offline canvas (Risks #6).
7. Native back-gesture conflict with canvas pan — validate on iPad/iPhone (Risks #7).
8. `PRECEDES` cycle render tiebreaker — recommend `createdAt` ASC (Risks #8).
9. Full-text vs range index on `name` — needs `graph-core` amendment if range-only (Risks #9).
10. Bulk-paste duplicate-name resolution — recommend raise-error (Risks #10).

**Next**:
1. Requirements gate (this spec) — user approval, then large-spec review pass via the spec-review sub-agent.
2. Coordinate the `graph-core` amendment for the new `/api/v1/query/search` helper BEFORE this spec's design phase opens (or block design with a placeholder).
3. After approval → design phase, which must resolve the 10 open questions above + pick the canvas library.

## Incoming contract evolutions

**From `ontology-manager` (landing-task: `T-09b`, shipped 2026-05-23)** — `graph-core/FR-11`'s `/api/v1/stats` shape evolves from "six fixed keys for the six base node labels + six fixed keys for the six base edge types" to a **registry-driven keyset**:

- **Before**: `{ nodes: { Domain, UserJourney, Activity, Role, System, Location }, edges: { PART_OF, EXECUTES, USES_SYSTEM, AT_LOCATION, PRECEDES, INTEGRATES_WITH } }` — every key always present, value ≥ 0.
- **After** (current): same six base labels + types are still always present (seeded by `seedRegistryFromConstTuples`), **PLUS any labels/types registered at runtime via `POST /api/v1/ontology/{node-labels,edge-types}`**. The "all keys present even when zero" guarantee still holds, but the keyset is now variable.

**Impact on `process-explorer-ui`**: the XC-1.2 stats panel (and any consumer iterating `Object.keys(stats.nodes)`) needs to expect a growing keyset rather than the fixed six-key shape. Recommended approach: render the six seed labels in their canonical order first, then any additional registry-added labels in alphabetical order below a divider.

**Source**: `ontology-manager/design.md` §3.5; landing-task `T-09b` refactored `api/src/routes/stats.ts` to iterate `getSchema()` from the §6.1 cache instead of the compile-time `NODE_LABELS` / `EDGE_TYPES` const tuples.
