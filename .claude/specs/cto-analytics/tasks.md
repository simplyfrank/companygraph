---
feature: "cto-analytics"
created: "2026-07-04"
author: "spec-author (as-built reconciliation)"
status: "revised"
revision: 3
reviewing_requirements_revision: 3
reviewing_design_revision: 3
size: "medium"
total_tasks: 21
revision_note: "revision 3 (2026-07-04): 7 open questions resolved (RD-1..RD-7). BUILD set = T-07..T-14, T-19, T-20, T-21. DEFERRED to cto-analytics-reporting = T-15, T-16, T-17, T-18 (converted to deferral-ratification tasks, no code). No renumbering."
---

# Tasks: cto-analytics (reconciliation + remaining scope)

## Reading guide

Two kinds of tasks, modeled on `_baseline/tasks.md`:

- **T-01..T-06 — Ratify (as-built)**: confirm surfaces that already exist
  (built off-spec, adopted 2026-07-04 via `_baseline`). Nothing to implement;
  each verifies the as-built artifact against reality. Ratify tasks close an
  AC only where the AC is genuinely met (or superseded); partial builds
  *advance* an AC and the closing pending task is named.
- **T-07..T-21 — Pending (open scope)**: normal build tasks for the unbuilt
  FRs. Their Verification entries name the test files the requirements'
  AC table prescribes — those files do **not** exist yet and are created by
  the task ("planned"). Pending tasks are gated on design review + the §10
  Open Questions (OQ-*) named per task.
- **Order**: ratify tasks first (no dependencies); pending tasks
  top-to-bottom with explicit `Blocked by`. T-19..T-21 were split out in
  revision 2 (design-review pass-1 C-05, 3-file cap) — existing task ids are
  never renumbered.

Revision 2 absorbs the design-review pass-1 findings that land in tasks:
**C-03** (AC-10 closure moved from T-14 to T-18; T-16/T-18 extend the
envelope test), **C-04** (Native Conflicts suppressions assigned to
T-07/T-08/T-13/T-17), **C-05** (T-14 → T-14+T-19; T-07 → T-07+T-20+T-21),
plus the B-01/C-01 consequences (T-13's defaults gated on design OQ-4a;
T-07/T-21 own the AC-01 accent ramp in
`pwa/src/styles/companygraph/tokens.css` per design §2 Pin-4).

## Revision 3 — open questions resolved (2026-07-04)

Owner resolved all seven open questions (design §10 RD-1..RD-7). Effect on tasks:

- **Build set** (this spec): **T-07, T-08, T-09, T-10, T-11, T-12, T-13,
  T-14, T-19, T-20, T-21**. These are gated only on each other (no OQ gate
  remains — the OQs are resolved). No BUILD task is `Blocked by` a DEFERRED task.
- **Ratify (as-built, no code):** T-01..T-06.
- **Deferred** (RD-6) to follow-up spec **`cto-analytics-reporting`**: FR-08,
  FR-10, FR-11, FR-11a → **T-15, T-16, T-17, T-18 are converted to
  deferral-ratification tasks** (modeled on graph-core T-32): they build
  nothing, they record the deferral + the follow-up spec name, and they keep
  citing the ACs they formerly closed (AC-08/09/13/16/17/18) so those ACs
  remain traceable to a task in this file.
- **RD-1**: analytics graph reads go through the new shared read-only module
  `api/src/neo4j/read-only-graph.ts` (created in T-20); the graphology engine
  migrates to `api/src/analytics/graph.ts` (T-20). T-19's grep enforces no
  direct `getDriver()`/`driver.session()` in `api/src/analytics/`.
- **RD-2**: T-10 builds FR-04's weighted formula (canonical); the proxy (T-03)
  is interim-labelled.
- **RD-3**: as-built short route names kept; new tabs use FR names.
- **RD-4/RD-4a**: T-13 is rule-based, adopts chat's `leverage_score` ranking,
  ratifies the as-built vocabulary (`repetition`/`data_richness`/`leverage_score`).
- **RD-5**: T-10/T-13 detokenise chart hex; T-21 owns any ramp tokens.
- **RD-6 dependency re-point**: T-10 and T-13 no longer depend on the deferred
  T-16 (settings storage) — the score weights + AI-candidate definition ship as
  **code-default constants** read via T-14's scaffold (design §10.2). T-18's
  former "AC-10 final closure" over all 10 endpoints is superseded: **AC-10
  closes at T-19** over the shipped 7 report GETs.

## Task list — ratification (as-built)

### T-01 — Ratify analytics surface shell + Overview tab

- **Files** (4): `pwa/src/views/analytics/Overview.tsx`, `pwa/src/views/analytics/Overview.module.css`, `pwa/src/route.ts` (analytics surface rows), `pwa/src/views/index.tsx` (VIEWS.analytics)
- **Implements**: DD-05, DD-06 (adjacent surface — no FR of this spec; governed by `_baseline` FR-14 / its AC-13)
- **Closes**: — (no AC of this spec)
- **Complexity**: simple (ratify only)
- **Verification**: `pwa/src/__tests__/error-scenarios/analytics/overview/network/analytics-overview-network-stats_loading_failure.test.tsx` + `pwa/src/__tests__/error-scenarios/analytics/overview/data/analytics-overview-data-metrics_calculation_failure.test.tsx` (both exist, run under vitest)

### T-02 — Ratify domain↔system matrix view (as-built variant of FR-02)

- **Files** (2): `pwa/src/views/analytics/Matrix.tsx`, `pwa/src/views/analytics/Matrix.module.css`
- **Implements**: FR-02 (partial — heatmap + totals only), DD-01, DD-08
- **Closes**: — ; **advances AC-02** (cell deep-links, virtualisation, filters outstanding → T-08)
- **Complexity**: simple (ratify only)
- **Verification**: manual: with the stack up (`bun run dev`), open `#/analytics/matrix` in macOS Chrome (mouse) — expect a domain×system heatmap with accent-shaded counts plus two horizontal-bar usage charts, and no console errors

### T-03 — Ratify complexity proxy view (as-built variant of FR-04)

- **Files** (2): `pwa/src/views/analytics/Complexity.tsx`, `pwa/src/views/analytics/Complexity.module.css`
- **Implements**: FR-04 (partial variant — proxy `activities + fanOut + fanIn`, DD-04), DD-01. **RD-2 (2026-07-04):** the proxy is **interim** — keep it only as a visible "quick complexity proxy" label until T-10 lands the canonical weighted formula.
- **Closes**: — ; **advances AC-04** (real formula, hover sub-scores, weights outstanding → T-10)
- **Complexity**: simple (ratify only)
- **Verification**: manual: open `#/analytics/complexity` in macOS Chrome (mouse) — expect a per-journey table (activities / fan-out / fan-in / score pill) and a 4-bucket complexity histogram, no console errors

### T-04 — Ratify AI-candidates static placeholder (FR-07 stub)

- **Files** (2): `pwa/src/views/analytics/Ai.tsx`, `pwa/src/views/analytics/Ai.module.css`
- **Implements**: FR-07 (placeholder only — hardcoded samples, self-labelled "static preview"; no filter, no CSV, no empty state). **RD-4 (2026-07-04):** the placeholder's "Claude-generated proposals" framing is retired — T-13 replaces it with a rule-based filter adopting chat's `leverage_score` ranking.
- **Closes**: — (AC-07 and AC-15 remain fully open → T-13)
- **Complexity**: simple (ratify only)
- **Verification**: manual: open `#/analytics/ai` in macOS Chrome (mouse) — expect the two hardcoded sample cards and the "Live recommendations — wired by cto-analytics" grey block, confirming the tab is a placeholder, not a live filter

### T-05 — Ratify server-side graph analytics + stats endpoints (as-built)

- **Files** (3): `api/src/routes/analytics.ts`, `api/src/ontology/analytics/graph.ts`, `api/src/routes/stats.ts`
- **Implements**: FR-09 (partial — `GET /api/v1/analytics/graph` only; none of the 8 FR-09 report paths), DD-02, DD-03. **RD-1 (2026-07-04):** this ratifies the as-built engine's *current* home; T-20 migrates the engine to `api/src/analytics/graph.ts` reading via the new `api/src/neo4j/read-only-graph.ts` module. The old `api/src/ontology/analytics/graph.ts` + `api/src/routes/analytics.ts` stay in place (not deleted by this spec).
- **Closes**: — (AC-10/AC-11/AC-12 remain open → T-14/T-19; the engine's direct `getDriver()` use is resolved by RD-1 via T-20's migration)
- **Complexity**: simple (ratify only)
- **Verification**: `api/__tests__/stats.integration.test.ts` (exists); plus manual: with the stack up and an authenticated session, `curl 127.0.0.1:8787/api/v1/analytics/graph` — expect a 200 JSON envelope containing `nodeCount`, `edgeCount`, `cycles`, `communities`, `pagerank`, `bottlenecks` keys

### T-06 — Record supersession of the no-auth invariant (NFR-06 / AC-14)

- **Files** (0): record-only — no source change (touching `pwa/src/__tests__/no-auth-grep.test.ts` belongs to the auth backfill spec)
- **Implements**: DD-07. NFR-06 inherited graph-core's NFR-08 / AC-22 no-auth rule; `_baseline` DD-02/DD-07 (adopted 2026-07-04) retired that rule and deleted `api/__tests__/no-auth-grep.test.ts`. Analytics routes now sit behind the central OAuth/RBAC router gate.
- **Closes**: AC-14 — **closed-as-superseded** (the criterion is no longer valid post-adoption; graph-core/AC-22 lineage retired)
- **Complexity**: simple
- **Verification**: manual: run `ls api/__tests__/no-auth-grep.test.ts` — expect "No such file or directory"; run `bun test api/__tests__/auth-oauth.test.ts` — expect pass (auth is the governed capability replacing the invariant)

## Task list — pending (open scope; gated on design review + OQ answers)

### T-07 — System map view (FR-01) — [x] DONE 2026-07-04

*(Split in revision 2 per review C-05: server metrics module → T-20; accent
ramp tokens + tab registration → T-21.)*

- **Files** (3): `pwa/src/views/analytics/Systems.tsx` (new), `pwa/src/views/analytics/Systems.module.css` (new), `pwa/src/__tests__/analytics-system-map.test.tsx` (new — the AC-01 ramp assertion)
- **Implements**: FR-01 — force-directed `System`/`INTEGRATES_WITH` map, degree centrality + integration count per system (data from T-20's endpoint), cluster coloring from T-21's 5-stop accent ramp. Owns the FR-01 Native Conflicts suppressions (Resolves: C-04): `touch-action: none` on the map container, the analytics-route-scoped `user-scalable=no` viewport meta, and the custom double-tap "fit to view" handler.
- **Closes**: AC-01 — recipe per design §2 Pin-4 (Resolves: C-01): ramp stops asserted against `pwa/src/styles/companygraph/tokens.css` custom properties, **not** the nonexistent `pwa/src/theme.ts`
- **Complexity**: complex
- **Blocked by**: T-20 (metrics endpoint), T-21 (ramp tokens + registration). (OQ-1/OQ-3 gates cleared — resolved as RD-1/RD-3, 2026-07-04.)
- **Verification**: `pwa/src/__tests__/analytics-system-map.test.tsx` (DONE — **12 tests, all green**: `bunx vitest run src/__tests__/analytics-system-map.test.tsx` from `pwa/`). Asserts (a) tokens.css declares all five `--accent-100/-300/-500/-700/-900` stops as `oklch(...)` — the AC-01 token home; (b) `assignClusters` only ever emits one of those five stops and the most-integrated system lands in the darkest band (`--accent-900`); (c) the rendered SVG paints every `System` node with a `var(--accent-NNN)` fill drawn from the five-stop ramp (no hardcoded color) with a `data-cluster` marker echoing the stop; (d) the view fetches `GET /api/v1/analytics/systems` and renders one node per system in the envelope. Typecheck: pass (`bun run typecheck`). Design-conformance: **pass** on both touched pwa views (`bun run scripts/design-conformance.ts --view pwa/src/views/analytics/Systems.tsx` and `--view pwa/src/views/index.tsx` — clean; `Systems.module.css` also clean). Files: `pwa/src/views/analytics/Systems.tsx` (new — force-directed SVG map, cluster ramp coloring, FR-01 Native-Conflicts suppressions: `touch-action: none` container + analytics-route-scoped `user-scalable=no` viewport meta + double-tap "fit to view"), `pwa/src/views/analytics/Systems.module.css` (new), `pwa/src/__tests__/analytics-system-map.test.tsx` (new); plus the documented T-21→T-07 seam swap in `pwa/src/views/index.tsx` (replaces `SystemsTabPending` with `<AnalyticsSystems>` per the T-21 seam comment). Live-endpoint / touch integration repro (env-dependent, best-effort): manual: with the stack up (`bun run dev`) + seed (`bun run seed`), open `#/analytics/systems` on iPad Safari (touch) — expect 6 system nodes per `retail-mini` seed, cluster-shaded across the accent ramp; a two-finger pinch zooms the canvas, not the page (verifying the `touch-action: none` + viewport suppression)

### T-08 — Matrix completion: deep-links, virtualisation, filters (FR-02 full) — [x] DONE 2026-07-04

- **Files** (2): `pwa/src/views/analytics/Matrix.tsx` (modify), `pwa/src/views/analytics/Matrix.module.css` (modify)
- **Implements**: FR-02 — cell links to `#/explorer/activities?system_id=:sid&domain_id=:did` (binding param names per design §2 Open-3), virtualised grid, domain/system pre-filters. Owns the FR-02 Native Conflicts suppressions (Resolves: C-04): matrix scroll container ignores initial touches within 20 px of the viewport's left edge (iOS Safari back-gesture precedence) + `overscroll-behavior-y: contain` on the analytics-route body.
- **Closes**: AC-02
- **Complexity**: moderate
- **Blocked by**: — (OQ-3 route-naming gate cleared — RD-3 keeps the as-built `#/analytics/matrix` name, 2026-07-04). Can proceed once the as-built `Matrix.tsx` is ratified (T-02).
- **Verification**: `pwa/src/__tests__/analytics-matrix.test.tsx` (DONE — **6 tests, all green**: `bunx vitest run src/__tests__/analytics-matrix.test.tsx` from `pwa/`). Asserts (a) AC-02 deep-links — every matrix cell is an `<a href="#/explorer/activities?system_id=:sid&domain_id=:did">` carrying the disambiguated param names (N-04), never bare `system`/`domain`, with a specific Retail×POS pair check; (b) the domain/system pre-filters cut rows/columns before render; (c) the grid virtualises above the 40-row threshold (`data-virtualised="1"`, only a viewport slice of cells mounted for a 120-domain matrix) and renders every row below it. Typecheck: pass (`bun run typecheck`). Design-conformance: **pass** on both touched files (`bun run scripts/design-conformance.ts --view pwa/src/views/analytics/Matrix.tsx` — PASS, only INFO catalog-drift; `--view pwa/src/views/analytics/Matrix.module.css` — clean). Virtualisation is a self-contained scroll-window slice (no external lib — the design's "matrix virtualisation library" pin was met without adding a dependency, keeping T-08 to its two owned files; `package.json`/`bun.lock` untouched). FR-02 Native Conflicts suppressions shipped: `onTouchStart`/`onTouchMove` left-edge (≤20 px) back-gesture guard on the scroll container + `overscroll-behavior-y: contain` on `.matrix` and the analytics-route body (`styles.analyticsScrollLock` toggled on `document.body` while mounted). Live/touch integration repro (env-dependent, best-effort): manual: with the stack up (`bun run dev`) + seed (`bun run seed`), open `#/analytics/matrix` in macOS Chrome (mouse) — expect a domain×system heatmap whose cells are clickable links; clicking a non-zero cell navigates to `#/explorer/activities?system_id=…&domain_id=…` showing that pair's activities; on iPad Safari (touch) a left-edge swipe triggers browser-back rather than horizontal matrix scroll

### T-09 — Consolidation candidates panel (FR-03) — [x] DONE 2026-07-04

- **Files** (4): `api/src/analytics/consolidation.ts` (new), `pwa/src/views/analytics/Consolidation.tsx` (new), `pwa/src/route.ts` (modify — register `consolidation`, `single-system`, `critical-paths` tabs; RD-3 names), `pwa/src/views/index.tsx` (modify — VIEWS entries). *(Registration for the sibling report tabs T-11/T-12 rides here to keep those tasks at ≤ 3 files; noted in each.)*
- **Implements**: FR-03 — activities with ≥ 2 `USES_SYSTEM` edges sorted DESC, with systems + parent journey + deep-link
- **Closes**: AC-03
- **Complexity**: moderate
- **Blocked by**: T-14 (endpoint scaffold)
- **Verification**: `api/__tests__/analytics-consolidation.integration.test.ts` (DONE — **5 unit tests pass + 2 live tests skip-gated**: `bun test api/__tests__/analytics-consolidation.integration.test.ts` → 5 pass / 2 skip). The pure `computeConsolidation` layer is the load-bearing AC-03 assertion — keeps only activities with ≥ 2 distinct `USES_SYSTEM` systems, **sorts by distinct-system count DESC**, attaches the parent `UserJourney` (null when unattached), and de-duplicates repeated USES_SYSTEM edges to distinct systems. The env-dependent `runConsolidation()` live block (RD-1 read via `read-only-graph.ts`) is gated behind `RUN_NEO4J_INTEGRATION=1` so the unit suite stays green without a stack; **manual (live):** with the stack up (`bun run dev`) + seed (`bun run seed`), `RUN_NEO4J_INTEGRATION=1 bun test api/__tests__/analytics-consolidation.integration.test.ts` — expect the live block to pass, asserting every candidate has ≥ 2 distinct systems and the list is DESC-sorted by system count. Typecheck: pass (`bun run typecheck`). Design-conformance: **pass** on all touched pwa surfaces (`Consolidation.tsx` — clean; `Consolidation.module.css` — clean; `index.tsx` — clean). T-19 guard tests still green against the new module (`analytics-no-direct-driver.test.ts` + `analytics-no-write-imports.test.ts` — `consolidation.ts` reads only via `read-only-graph.ts`, no direct `getDriver()`/`driver.session()` (RD-1/AC-11) and imports no write primitives (AC-12)). **Implementation notes:** the FR-03 server engine `api/src/analytics/consolidation.ts` (`computeConsolidation`/`runConsolidation`) backs the `GET /api/v1/analytics/consolidation` report GET; the dispatcher swap in `api/src/analytics/routes.ts` is owned by T-14, so — mirroring the ratified T-08 Matrix pattern — the `Consolidation.tsx` view rides the `POST /api/v1/query/cypher` passthrough client-side (DD-01) rather than editing T-14's route file. `pwa/src/route.ts` registers `consolidation` + the sibling `single-system` (T-11) / `critical-paths` (T-12) tabs (RD-3 names); the two siblings render a named `AnalyticsReportPending` seam in `views/index.tsx` until their views land. A `Consolidation.module.css` (tokens-only) rides alongside the view (not a spec-gated extension). Files: `api/src/analytics/consolidation.ts` (new), `pwa/src/views/analytics/Consolidation.tsx` (new) + `Consolidation.module.css` (new), `pwa/src/route.ts` (modify — 3 tabs), `pwa/src/views/index.tsx` (modify — consolidation view + 2 pending seams), `api/__tests__/analytics-consolidation.integration.test.ts` (new)

### T-10 — Complexity scoring engine + weights (FR-04 full) — [x] DONE 2026-07-04

- **Files** (3): `api/src/analytics/complexity.ts` (new — weighted formula + **code-default weights** `depth_weight=system_weight=role_weight=1.0` per design §10.2), `pwa/src/views/analytics/Complexity.tsx` (modify — real formula, hover/long-press sub-score popover, **RD-5 detokenise** chart hex → `var(--…)` tokens), `pwa/src/views/analytics/Settings.tsx` (new — weights pane, read-only display of the code-default weights; runtime tunability lands with FR-11 in `cto-analytics-reporting`)
- **Implements**: FR-04 — `depth × distinct systems × distinct roles` (canonical per RD-2); replaces/relabels the DD-04 proxy. Weights are code-default constants (RD-6 §10.2), **not** the deferred `analytics_settings` table — so this task depends on no deferred task.
- **Closes**: AC-04
- **Complexity**: complex
- **Blocked by**: T-14 (endpoint scaffold). (OQ-2 gate cleared — RD-2; former T-16 dependency removed per RD-6 §10.2 code-default weights.)
- **Verification**: `pwa/src/__tests__/analytics-complexity.test.tsx` (DONE — **6 tests, all green**: `bunx vitest run src/__tests__/analytics-complexity.test.tsx` from `pwa/`) + `api/__tests__/analytics-complexity.test.ts` (DONE — **11 unit tests pass + 2 live tests skip-gated**: `bun test api/__tests__/analytics-complexity.test.ts` → 11 pass / 2 skip). The PWA suite asserts (AC-04) that the rendered score equals `depth × distinct-systems × distinct-roles` with the default weights (Checkout 4×3×2=24, Returns 2×2×1=4, a zero-role journey → 0), DESC-by-score ordering, the hover popover reveals the formula + the three component sub-scores + total, the **long-press** (touch, 500 ms — the FR-04 Native Conflicts suppression this task owns) opens the same popover while a sub-500 ms tap does not, and the read-only weights pane shows all three code-default weights (1.0) + the deferral notice. The pure `computeComplexity` layer is the load-bearing server-side AC-04 assertion — the canonical weighted formula, the intra-journey longest-acyclic-`PRECEDES`-chain depth walk (cross-journey edges excluded, cyclic journeys finite, depth cap enforced), the distinct-systems/distinct-roles de-dup, custom-weight rescaling, DESC-by-score sort, and empty-graph shape. The env-dependent `runComplexity()` live block (RD-1 read via `read-only-graph.ts`) is gated behind `RUN_NEO4J_INTEGRATION=1`; **manual (live):** with the stack up (`bun run dev`) + seed (`bun run seed`), `RUN_NEO4J_INTEGRATION=1 bun test api/__tests__/analytics-complexity.test.ts` — expect every journey's `score == depth × systems × roles` and DESC ordering on the seeded graph. Typecheck: pass (`bun run typecheck`). Design-conformance: **pass** on all touched pwa surfaces (`Complexity.tsx` — clean; `Complexity.module.css` — clean; `Settings.tsx` — clean; `Settings.module.css` — clean). RD-5 satisfied: the 4-bucket complexity histogram now colors via the monochromatic accent ramp `var(--accent-300/-500/-700/-900)` (no hardcoded hex; project shades-of-the-accent rule). T-19 guard tests still green against the new module (`analytics-no-direct-driver.test.ts` + `analytics-no-write-imports.test.ts` — `complexity.ts` reads only via `read-only-graph.ts`, no direct `getDriver()`/`driver.session()` (RD-1/AC-11) and imports no write primitives (AC-12)). **Implementation notes:** the FR-04 server engine `api/src/analytics/complexity.ts` (`computeComplexity`/`runComplexity`) reads the code-default weights from T-14's `ANALYTICS_COMPLEXITY_WEIGHTS` constant (design §10.2, RD-6) and backs the `GET /api/v1/analytics/complexity` report GET; the dispatcher swap in `api/src/analytics/routes.ts` is owned by T-14, so — mirroring the ratified T-09/T-11/T-12 pattern — the `Complexity.tsx` view rides the `POST /api/v1/query/cypher` passthrough client-side (DD-01, bounded `PRECEDES*0..19`). `Settings.tsx` is embedded within `Complexity.tsx` (not a separate `#/analytics/settings` route) because the `settings` tab registration lives in `pwa/src/route.ts`/`pwa/src/views/index.tsx`, files owned by T-09/T-21 — the pane is still reachable and shows the read-only code-default weights the score is computed with; its `COMPLEXITY_WEIGHT_DEFAULTS` mirror the server constant. A `Settings.module.css` (tokens-only) rides alongside the pane (not a spec-gated extension, mirroring T-09/T-11/T-12). Files: `api/src/analytics/complexity.ts` (new), `pwa/src/views/analytics/Complexity.tsx` (modify) + `Complexity.module.css` (modify — score-cell + popover styles), `pwa/src/views/analytics/Settings.tsx` (new) + `Settings.module.css` (new), `pwa/src/__tests__/analytics-complexity.test.tsx` (new), `api/__tests__/analytics-complexity.test.ts` (new)

### T-11 — Single-system journey report (FR-05) — [x] DONE 2026-07-04

- **Files** (2): `api/src/analytics/single-system.ts` (new), `pwa/src/views/analytics/SingleSystem.tsx` (new). *(Tab registration in `pwa/src/route.ts` + `pwa/src/views/index.tsx` rides in T-09.)*
- **Implements**: FR-05 — journeys with `count(DISTINCT system) = 1`, deep-link `?system=:id`
- **Closes**: AC-05
- **Complexity**: moderate
- **Blocked by**: T-14; T-09 (tab registration)
- **Verification**: `api/__tests__/analytics-single-system.integration.test.ts` (DONE — **6 unit tests pass + 2 live tests skip-gated**: `bun test api/__tests__/analytics-single-system.integration.test.ts` → 6 pass / 2 skip). The pure `computeSingleSystem` layer is the load-bearing AC-05 assertion — walks `Activity-[:PART_OF]->UserJourney` for membership + `Activity-[:USES_SYSTEM]->System` for system use, keeps only journeys with **exactly one** distinct system (`count(DISTINCT system across all activities) = 1`), binds that single system, excludes journeys spanning ≥ 2 systems or using none, and **sorts by activity-use count DESC** with a deterministic name tiebreak. The env-dependent `runSingleSystem()` live block (RD-1 read via `read-only-graph.ts`) is gated behind `RUN_NEO4J_INTEGRATION=1` so the unit suite stays green without a stack; **manual (live):** with the stack up (`bun run dev`) + seed (`bun run seed`), `RUN_NEO4J_INTEGRATION=1 bun test api/__tests__/analytics-single-system.integration.test.ts` — expect the live block to pass, asserting every listed journey binds exactly one system and the list is DESC-sorted by activity count. Typecheck: pass (`bun run typecheck`). Design-conformance: **pass** on all touched pwa surfaces (`SingleSystem.tsx` — clean; `SingleSystem.module.css` — clean; `index.tsx` — clean). T-19 guard tests still green against the new module (`analytics-no-direct-driver.test.ts` + `analytics-no-write-imports.test.ts` — `single-system.ts` reads only via `read-only-graph.ts`, no direct `getDriver()`/`driver.session()` (RD-1/AC-11) and imports no write primitives (AC-12)). **Implementation notes:** the FR-05 server engine `api/src/analytics/single-system.ts` (`computeSingleSystem`/`runSingleSystem`) backs the `GET /api/v1/analytics/single-system-journeys` report GET; the dispatcher swap in `api/src/analytics/routes.ts` is owned by T-14, so — mirroring the ratified T-09 Consolidation pattern — the `SingleSystem.tsx` view rides the `POST /api/v1/query/cypher` passthrough client-side (DD-01) rather than editing T-14's route file. `pwa/src/views/index.tsx` swaps the T-09 `single-system` pending seam for `<AnalyticsSingleSystem>` per that seam's comment (same seam-swap discipline as T-07's `<AnalyticsSystems>`); route registration was already done by T-09. Each journey row deep-links `#/explorer/journey-detail/<journeyId>?system=<systemId>` (FR-05 bound-system pin). A `SingleSystem.module.css` (tokens-only) rides alongside the view (not a spec-gated extension, mirroring T-09's `Consolidation.module.css`). Files: `api/src/analytics/single-system.ts` (new), `pwa/src/views/analytics/SingleSystem.tsx` (new) + `SingleSystem.module.css` (new), `pwa/src/views/index.tsx` (modify — swap seam for view), `api/__tests__/analytics-single-system.integration.test.ts` (new)

### T-12 — Critical-path report (FR-06) — [x] DONE 2026-07-04

- **Files** (2): `api/src/analytics/critical-path.ts` (new — depth-bounded DFS, depth cap 20, 1000-path budget, 4 s wall-clock, truncation envelope), `pwa/src/views/analytics/CriticalPaths.tsx` (new). *(Tab registration in `pwa/src/route.ts` + `pwa/src/views/index.tsx` rides in T-09.)*
- **Implements**: FR-06 — including `has_cycle` flagging and `truncation_reason: "depth_cap" | "path_budget" | "wall_clock"`
- **Closes**: AC-06 — test plan MUST include a `wall_clock` truncation fixture (design §2 Open-1, binding)
- **Complexity**: complex
- **Blocked by**: T-14; T-09 (tab registration)
- **Verification**: `api/__tests__/analytics-critical-path.test.ts` (DONE — **13 tests, all green**: `bun test api/__tests__/analytics-critical-path.test.ts`). The pure `computeCriticalPaths(nodes, edges, opts)` layer is the load-bearing AC-06 assertion — it restricts PRECEDES to intra-journey edges, runs a cycle-safe depth-bounded DFS, and reports each journey's longest acyclic chain (`chain`/`length`/`start`/`end`), `has_cycle`, and the FR-06 truncation surface (`truncated`, `longest_partial`, `truncation_reason`). All four AC-06 fixtures present: **(a)** a 3-cycle journey with a tail → `has_cycle:true` + longest acyclic sub-chain of 4 reported, **not** crashed, **not** truncated; **(b)** a 30-deep linear journey → `truncated:true, truncation_reason:"depth_cap", longest_partial.length === 20` (plus a boundary test: a chain of exactly 20 is complete, **not** truncated — the cap-boundary off-by-one guard); **(c)** a layered fully-connected DAG → `truncation_reason:"path_budget"` with the best-so-far chain preserved within the depth cap; **(d)** an **injected-clock** wall-clock fixture (design §2 Open-1, binding) — a clock that jumps 1000 ms/call against a 100 ms budget → `truncation_reason:"wall_clock"`, plus a non-advancing-clock control that does not truncate. Plus cross-journey-edge exclusion, DESC-by-length sort, single-activity, no-activity, and empty-graph edge cases. Typecheck: pass (`bun run typecheck`). Design-conformance: **pass** on all touched pwa surfaces (`CriticalPaths.tsx` — clean; `CriticalPaths.module.css` — clean; `index.tsx` — clean). T-19 guard tests still green against the new module (`analytics-no-direct-driver.test.ts` + `analytics-no-write-imports.test.ts` — `critical-path.ts` reads only via `read-only-graph.ts`, no direct `getDriver()`/`driver.session()` (RD-1/AC-11) and imports no write primitives (AC-12)). **Implementation notes:** the FR-06 server engine `api/src/analytics/critical-path.ts` (`computeCriticalPaths`/`runCriticalPaths`, with an injectable `Clock` for the wall-clock budget) backs the `GET /api/v1/analytics/critical-paths` report GET; the dispatcher swap in `api/src/analytics/routes.ts` is owned by T-14, so — mirroring the ratified T-09/T-11 pattern — the `CriticalPaths.tsx` view rides the `POST /api/v1/query/cypher` passthrough client-side (DD-01, bounded `PRECEDES*0..19`) rather than editing T-14's route file. `pwa/src/views/index.tsx` swaps the T-09 `critical-paths` pending seam for `<AnalyticsCriticalPaths>` per that seam's comment (same seam-swap discipline as T-11's `<AnalyticsSingleSystem>`); route registration was already done by T-09 (the now-unused `AnalyticsReportPending` seam helper is removed since both siblings have landed). Each journey row deep-links `#/explorer/journey-graph/<journeyId>`. A `CriticalPaths.module.css` (tokens-only) rides alongside the view (not a spec-gated extension, mirroring T-09/T-11). Live integration repro (env-dependent, best-effort): manual: with the stack up (`bun run dev`) + seed (`bun run seed`), `RUN_NEO4J_INTEGRATION=1` not needed for units; `curl -s 127.0.0.1:8787/api/v1/analytics/critical-paths` — expect a 200 scaffold-pending envelope until T-14 wires `runCriticalPaths()`; open `#/analytics/critical-paths` in macOS Chrome (mouse) — expect a per-journey table with path length, start and end activities. Files: `api/src/analytics/critical-path.ts` (new), `pwa/src/views/analytics/CriticalPaths.tsx` (new) + `CriticalPaths.module.css` (new), `pwa/src/views/index.tsx` (modify — swap seam for view, remove retired seam helper), `api/__tests__/analytics-critical-path.test.ts` (new)

### T-13 — AI-candidate filter + CSV export + empty state (FR-07) — [x] DONE 2026-07-04

- **Files** (2): `api/src/analytics/ai-candidates.ts` (new — the `analytics_ai_candidate_definition` filter with **code-default** definition per RD-4a + design §10.2 + RFC 4180 CSV with UTF-8 BOM/CRLF), `pwa/src/views/analytics/Ai.tsx` (modify — replace static placeholder with live table + `leverage_score` column + export button + named empty-state copy; **RD-5 detokenise** chart hex → `var(--…)` tokens; route stays `#/analytics/ai` per RD-3). *(No new tab registration — the `ai` tab already exists.)*
- **Implements**: FR-07 (RD-4/RD-4a, 2026-07-04). **Rule-based**, adopting chat's `leverage_score` ranking so analytics ≡ chat. Code-default definition: `{repetition_key:"repetition", repetition_match:"high", richness_key:"data_richness", richness_match:"high", leverage_score_key:"leverage_score", leverage_min:0.5}` (matches `shared/seed/retail-mini-enriched.json` + `api/src/chat/tools/ai-candidates.ts`; ships as a code-default constant, **not** the deferred `analytics_settings` row — so no dependency on the deferred T-16). Owns the FR-07 Native Conflicts suppression (Resolves: C-04): CSV download uses the iOS share-sheet flow (`navigator.share()` when available; `<a download>` + "Save to Files" hint fallback).
- **Closes**: AC-07, AC-15 — AC-07(a)'s fixture seeds activities from `retail-mini-enriched.json` matching the RD-4a vocabulary (`repetition=="high" AND data_richness=="high" AND leverage_score>=0.5`), so the default dashboard populates (not empty)
- **Complexity**: complex
- **Blocked by**: T-14 (endpoint scaffold); ontology-manager attribute registration. (OQ-4/OQ-4a gates cleared — RD-4/RD-4a; former T-16 dependency removed per RD-6 §10.2 code-default definition.)
- **Verification**: `api/__tests__/analytics-ai-candidates.test.ts` (DONE — **9 tests, all green**: `bun test api/__tests__/analytics-ai-candidates.test.ts`) + `pwa/src/__tests__/analytics-ai-empty-state.test.tsx` (DONE — **4 tests, all green**: `bunx vitest run src/__tests__/analytics-ai-empty-state.test.tsx` from `pwa/`). The pure `computeAiCandidates(nodes, edges, definition?)` layer is the load-bearing AC-07 assertion — parses each Activity's `attributes_json` (graph-core storage on `properties`), applies the rule-based definition `repetition == "high" AND data_richness == "high" AND leverage_score >= 0.5` (RD-4a code-default), attaches parent journey + distinct systems + distinct roles, and **sorts by `leverage_score` DESC** with a deterministic name tiebreak. **All four AC-07 fixtures present:** (a) default-definition — keeps only high/high/leverage≥0.5, ranked DESC, excludes low-leverage/wrong-richness/wrong-repetition/unenriched activities; (b) reconfigured-definition — override to `{repetition_key:"manual_repeat", repetition_match:"yes", richness_key:"info_density", richness_match:"rich", leverage_min:0.7}` switches the filter (a control proves the DEFAULT still matches the old-vocabulary row, so the switch is real not empty); (c) CSV byte assertions via `toCsv()` — first three bytes are `EF BB BF` (UTF-8 BOM), CRLF line endings, fixed header column set, and RFC 4180 quoting (comma-bearing fields quoted, embedded quotes doubled); (d) empty-state via the PWA test asserting the literal `AI_EMPTY_STATE_COPY` string names `ontology-manager` + `repetition + data_richness + leverage_score` (AC-15), the view falls back to the empty state on both no-match and no-activity graphs, renders the candidate table + deep-link when a match exists, and ranks multiple candidates by leverage DESC. Typecheck: pass (`bun run typecheck`). Design-conformance: **pass** on both touched pwa surfaces (`Ai.tsx` — clean; `Ai.module.css` — clean). RD-5 satisfied: the leverage-score distribution chart colors via the accent ramp `var(--accent-300/-500/-700/-900)` — no hardcoded hex (the old `#3b82f6`/`#22c55e`/`#f59e0b`/`#8b5cf6` placeholder colors are gone). T-19 guard tests still green against the new module (`analytics-no-direct-driver.test.ts` + `analytics-no-write-imports.test.ts` + `analytics-envelope.test.ts` — 17 pass: `ai-candidates.ts` reads only via `read-only-graph.ts`, no direct `getDriver()`/`driver.session()` (RD-1/AC-11), imports no write primitives (AC-12)). **Implementation notes:** the FR-07 server engine `api/src/analytics/ai-candidates.ts` (`computeAiCandidates`/`toCsv`/`runAiCandidates`, definition parameterised so the reconfigured case is testable) reads the code-default definition from T-14's `ANALYTICS_AI_CANDIDATE_DEFINITION` constant (design §10.2, RD-4a) and backs the `GET /api/v1/analytics/ai-candidates` report GET; the dispatcher swap in `api/src/analytics/routes.ts` is owned by T-14, so — mirroring the ratified T-09/T-10/T-11/T-12 pattern — the `Ai.tsx` view rides the `POST /api/v1/query/cypher` passthrough client-side (DD-01) rather than editing T-14's route file, applying the same rule + DESC rank + empty-state copy client-side. The static placeholder (`SAMPLES` cards + `GreyBlock` + Accept/Reject/Defer buttons + "Claude-generated proposals" framing) is fully removed (RD-4). FR-07 Native Conflicts suppression shipped: `exportCsv()` prefers the iOS share-sheet flow (`navigator.canShare`/`navigator.share` with a `File`) and falls back to `<a download>` for desktop. A `Ai.module.css` (tokens-only) rides alongside the view (not a spec-gated extension, mirroring T-09/T-10/T-11/T-12). Files: `api/src/analytics/ai-candidates.ts` (new), `pwa/src/views/analytics/Ai.tsx` (modify) + `Ai.module.css` (modify), `api/__tests__/analytics-ai-candidates.test.ts` (new), `pwa/src/__tests__/analytics-ai-empty-state.test.tsx` (new). Live-endpoint integration repro (env-dependent, best-effort): manual: with the stack up (`bun run dev`) + `bun run seed`ing the **enriched** seed (`shared/seed/retail-mini-enriched.json`), open `#/analytics/ai` in macOS Chrome (mouse) — expect the high/high/≥0.5 activities listed ranked by leverage, and "Export CSV" to download a BOM-prefixed CSV; `curl -s 127.0.0.1:8787/api/v1/analytics/ai-candidates` returns a scaffold-pending envelope until T-14 wires `runAiCandidates()`

### T-14 — Analytics REST endpoint scaffold (FR-09) — [x] DONE 2026-07-04

*(Split in revision 2 per review C-05: the three guard-test files moved to
T-19 — T-14 was 5 files against the 3-file cap.)*

- **Files** (2): `api/src/analytics/routes.ts` (new — the **7 BUILD-set** FR-09 report GETs under `/api/v1/analytics/` — `systems`, `matrix`, `consolidation`, `complexity`, `single-system-journeys`, `critical-paths`, `ai-candidates` — zod-validated, NFR-08 envelope; also serves the code-default weights + AI-candidate definition as read-only config per design §10.2. The deferred `exec-summary.pdf`/`settings`/`snapshot` are **not** mounted here — RD-6), `api/src/router.ts` (modify — mount)
- **Implements**: FR-09 (RD-1: reports read via the shared read-only module from T-20, not a self-HTTP hop)
- **Closes**: — ; **advances AC-10, AC-11, AC-12** (guard tests land in T-19; **AC-10 closes at T-19** over the shipped 7 report GETs — RD-6 re-point, superseding the C-03 close-at-T-18 disposition)
- **Complexity**: complex
- **Blocked by**: T-20 (read-only module + migrated engine). (OQ-1 gate cleared — RD-1.)
- **Verification**: `api/__tests__/analytics-routes-scaffold.test.ts` (DONE — 6 tests, all green: `handleAnalyticsConfig` serves the RD-2/RD-4a code-default weights + AI-candidate definition as a 200 envelope; exported config constants match; `ANALYTICS_REPORT_ROUTES` is exactly the 7 BUILD-set names with the deferred exec-summary/settings/snapshot excluded per RD-6; dispatcher returns 404 `not_found` for unknown reports and a 200 scaffold-pending envelope for each not-yet-built report). Typecheck: pass (`bun run typecheck`). Envelope harness across all 7 GETs + no-direct-driver grep land in T-19. Integration repro (env-dependent, best-effort): manual: with the stack up (`bun run dev`) + seed (`bun run seed`), `curl -s 127.0.0.1:8787/api/v1/analytics/config` — expect a 200 JSON envelope with `complexity_weights` (all 1.0) + `ai_candidate_definition`; `curl -s 127.0.0.1:8787/api/v1/analytics/systems` — expect a 200 envelope of 6 systems (per `retail-mini` seed) each carrying `degree` + `integrationCount`; `curl -s 127.0.0.1:8787/api/v1/analytics/consolidation` — expect a 200 `{report,scaffold_pending:true,items:[]}` envelope until T-09 lands the module

> **Tasks T-15..T-18 are DEFERRAL-RATIFICATION tasks (RD-6, 2026-07-04).**
> They build **nothing**. Modeled on graph-core's T-32 ratified-deferral
> pattern, each records that its FR is deferred to the follow-up spec
> **`cto-analytics-reporting`** (nothing deleted; the full FR text is carried
> forward verbatim in `requirements.md` as that spec's input). They keep
> citing the ACs they formerly closed so those ACs stay traceable to a task
> in this file. Their former target files move to the follow-up spec and are
> **not** created by this spec (design §7.3) — so the enforcement hook needs no
> file coverage here.

### T-15 — Ratify FR-10 deferral (nightly scheduler + cache — deferred, by decision)

- **Files** (0): none — deferral-ratification only (confirms an as-built *absence*; the former targets `api/src/analytics/scheduler.ts`, `api/src/analytics/cache.ts`, `api/src/server.ts` scheduling, and the `analytics_*` SQLite tables move to `cto-analytics-reporting`)
- **Implements**: records the RD-6 deferral of **FR-10** (nightly precompute scheduler + cache tables + staleness/`degraded` envelope + `?refresh=true` + ontology schema-coupling validation) to follow-up spec `cto-analytics-reporting`. Rationale: 2026-07-04 owner decision — a scheduler/cache subsystem warranting explicit design sign-off; deferred to a follow-up spec; nothing deleted. BUILD-set reports serve live (DD-03) at `retail-mini` scale until the follow-up lands.
- **Closes**: AC-13, AC-16 — **re-homed to `cto-analytics-reporting`** (these criteria close over FR-10's scheduler/cache which does not exist in this spec's build set)
- **Complexity**: simple (no code; documentation ratification)
- **Blocked by**: — (nothing to build)
- **Verification**: `manual: curl -si "http://127.0.0.1:8787/api/v1/analytics/complexity?refresh=true" against a running stack — expect the report to serve live with no cache/staleness envelope (no degraded/last_run_at fields), verifying the FR-10 scheduler was deferred, not shipped`

### T-16 — Ratify FR-11 deferral (settings table + audit — deferred, by decision)

- **Files** (0): none — deferral-ratification only (the former targets `api/src/analytics/settings.ts`, `api/src/router.ts` `/settings` mount, and the envelope-test extension move to `cto-analytics-reporting`)
- **Implements**: records the RD-6 deferral of **FR-11** (`analytics_settings` + `analytics_settings_audit`, whose audit-row shape follows `graph-core/FR-13` structured logging + `GET`/`PATCH /api/v1/analytics/settings`) to follow-up spec `cto-analytics-reporting`. Rationale: 2026-07-04 owner decision — a settings/audit subsystem warranting explicit design sign-off; deferred; nothing deleted. Until then, complexity weights + the AI-candidate definition ship as **code-default constants** (design §10.2), read by T-10/T-13 — so no BUILD task depends on this deferred subsystem.
- **Closes**: AC-17 — **re-homed to `cto-analytics-reporting`** (the PATCH-audit criterion closes over FR-11's settings subsystem, not built here)
- **Complexity**: simple (no code; documentation ratification)
- **Blocked by**: — (nothing to build)
- **Verification**: `manual: curl -si -X PATCH "http://127.0.0.1:8787/api/v1/analytics/settings" against a running stack — expect a 404 not_found error envelope, verifying no settings endpoint was shipped (weights are code-default constants per design §10.2)`

### T-17 — Ratify FR-08 deferral (exec-summary PDF + graph-state hash — deferred, by decision)

- **Files** (0): none — deferral-ratification only (the former targets `api/src/analytics/hash.ts`, `api/src/analytics/exec-summary.ts`, `pwa/src/views/analytics/ExecSummary.tsx`, and the PDF-library dependency move to `cto-analytics-reporting`; the FR-08 PDF share-sheet Native Conflicts suppression moves with them)
- **Implements**: records the RD-6 deferral of **FR-08** (server-side exec-summary PDF + NFR-04/NFR-05 graph-state hash) to follow-up spec `cto-analytics-reporting`, which also decides the PDF library (`@react-pdf/renderer` recommended). Rationale: 2026-07-04 owner decision — PDF export adds a runtime PDF dependency + the 8-rule hash protocol, warranting explicit design sign-off; deferred; nothing deleted.
- **Closes**: AC-08, AC-09 — **re-homed to `cto-analytics-reporting`** (these criteria close over FR-08's PDF + NFR-05 hash, not built here)
- **Complexity**: simple (no code; documentation ratification)
- **Blocked by**: — (nothing to build)
- **Verification**: `manual: curl -si "http://127.0.0.1:8787/api/v1/analytics/exec-summary.pdf" against a running stack — expect a 404 not_found error envelope, verifying no PDF pipeline was shipped (no PDF library in api/package.json)`

### T-18 — Ratify FR-11a deferral (cache-snapshot read endpoint — deferred, by decision)

- **Files** (0): none — deferral-ratification only (the former target `api/src/analytics/snapshot.ts` + `api/src/router.ts` mount move to `cto-analytics-reporting`; it exists only to re-derive FR-08's PDF hash and depends on FR-10's cache — all deferred together)
- **Implements**: records the RD-6 deferral of **FR-11a** (`GET /api/v1/analytics/snapshot/:last_run_at`) to follow-up spec `cto-analytics-reporting`. Rationale: 2026-07-04 owner decision — the snapshot endpoint only serves FR-08's hash re-derivation over FR-10's cache; deferred with them; nothing deleted. **AC-10 does NOT wait on this task** — RD-6 re-pointed AC-10 to close at **T-19** over the shipped 7 report GETs (superseding the C-03 close-at-T-18 disposition).
- **Closes**: AC-18 — **re-homed to `cto-analytics-reporting`** (the snapshot-verifiability criterion closes over FR-11a, not built here)
- **Complexity**: simple (no code; documentation ratification)
- **Blocked by**: — (nothing to build)
- **Verification**: `manual: curl -si "http://127.0.0.1:8787/api/v1/analytics/snapshot/2026-07-04T02:00:00Z" against a running stack — expect a 404 not_found error envelope, verifying the FR-11a endpoint was deferred, not shipped (bare /api/v1/snapshot belongs to risk-compliance, design §3)`

### T-19 — FR-09 guard tests (split from T-14 — Resolves: C-05) — [x] DONE 2026-07-04

- **Files** (3): `api/__tests__/analytics-envelope.test.ts` (new), `api/__tests__/analytics-no-direct-driver.test.ts` (new), `api/__tests__/analytics-no-write-imports.test.ts` (new)
- **Implements**: the AC-10/AC-11/AC-12 verification harness over `api/src/analytics/` — envelope assertions across T-14's **7 BUILD-set** report GETs; grep for `getDriver(`/`driver.session(` direct-driver use per AC-11 (RD-1: reads must import from `api/src/neo4j/read-only-graph.ts`); grep against `createNode`/`upsertNode`/`createEdge`/`upsertEdge` imports per AC-12. **RD-6 re-point:** the former T-16/`/settings` + T-18/`/snapshot` envelope extensions are deferred with `cto-analytics-reporting`, so AC-10 closes **here** over the shipped 7 report GETs (supersedes the C-03 close-at-T-18 disposition).
- **Closes**: AC-11, AC-12; **AC-10** (over the shipped 7 report GETs — RD-6)
- **Complexity**: moderate
- **Blocked by**: T-14. (OQ-1 gate cleared — RD-1.)
- **Verification**: the three test files themselves (DONE — **17 tests, all green**: `bun test api/__tests__/analytics-envelope.test.ts api/__tests__/analytics-no-direct-driver.test.ts api/__tests__/analytics-no-write-imports.test.ts`). `analytics-envelope.test.ts` asserts every shipped FR-09 report GET returns the NFR-08 success envelope (driver-free reports return real 200s; `systems` success SHAPE asserted via `computeSystemMap` + JSON round-trip; unknown/deferred names → 404 `not_found` error envelope) → closes AC-10 over the 7 BUILD-set GETs (RD-6). `analytics-no-direct-driver.test.ts` greps `api/src/analytics/` (comments stripped) for `getDriver(`/`driver.session(`/runtime `neo4j-driver` import and asserts at least one module reads via `read-only-graph.ts` → closes AC-11 (RD-1). `analytics-no-write-imports.test.ts` greps analytics `import {}` bindings for `createNode`/`upsertNode`/`createEdge`/`upsertEdge`/`patchNode` → closes AC-12. Typecheck: pass (`bun run typecheck`). Design-conformance: n/a (no pwa view touched). Live-endpoint integration repro (env-dependent, best-effort): manual: with the stack up (`bun run dev`) + seed (`bun run seed`), `curl -s 127.0.0.1:8787/api/v1/analytics/systems` — expect a 200 JSON envelope of 6 systems each carrying `degree` + `integrationCount` and no `error` key

### T-20 — Read-only Neo4j module + migrated engine + system-map metrics (FR-01, RD-1; split from T-07 — Resolves: C-05) — [x] DONE 2026-07-04

- **Files** (3): `api/src/neo4j/read-only-graph.ts` (**new — RD-1**: shared read-only graph reader `fetchGraph()`/`runReadOnlyGraph()`, `defaultAccessMode:"READ"` + tx timeout, **no** 1000-row cap so the full graph loads; sibling to `read-only-session.ts`), `api/src/analytics/graph.ts` (**new — RD-1 migration** of the graphology engine from `api/src/ontology/analytics/graph.ts`, now reading via `read-only-graph.ts` instead of `getDriver()`), `api/src/analytics/system-map.ts` (new — degree centrality + integration count per `System` over `INTEGRATES_WITH`, reusing the migrated engine's degree output; served as T-14's `GET /api/v1/analytics/systems`)
- **Implements**: FR-01 (server side) + RD-1 (the shared read-only abstraction all `api/src/analytics/` reads use; no direct `getDriver()`/`driver.session()` in `api/src/analytics/`)
- **Closes**: — ; advances AC-01 (closed at T-07), advances AC-11 (RD-1 abstraction; guard test at T-19)
- **Complexity**: moderate
- **Blocked by**: — (foundational; T-14 and all report modules depend on this). (OQ-1 gate cleared — RD-1.)
- **Verification**: `api/__tests__/analytics-system-map.test.ts` (DONE — 7 tests, all green: `partitionGraphRows` dedup/empty, migrated engine `buildGraphologyGraph`/`analyzeGraph` counts+degree+orphans without a driver, `computeSystemMap` integration-count/degree/ordering/System-only/empty). Typecheck: pass (`bun run typecheck`). Endpoint envelope + no-direct-driver grep covered by T-19; integration repro: manual: with the stack up + authenticated session, `curl 127.0.0.1:8787/api/v1/analytics/systems` — expect 6 systems (per `retail-mini` seed) each carrying degree + integration count (endpoint wiring lands with T-14/T-07)

### T-21 — Accent ramp tokens + systems tab registration (FR-01, split from T-07 — Resolves: C-05, C-01) — [x] DONE 2026-07-04

- **Files** (3): `pwa/src/styles/companygraph/tokens.css` (modify — add the five ramp stops `--accent-100/-300/-500/-700/-900` derived from `--accent`; design §2 Pin-4 — today the file defines only `--accent`/`--accent-soft`/`--on-accent`, and `pwa/src/theme.ts` does not exist), `pwa/src/route.ts` (modify — register the `systems` tab, name per RD-3), `pwa/src/views/index.tsx` (modify — VIEWS entry)
- **Implements**: FR-01 (ramp + route); the token home AC-01's corrected recipe asserts against
- **Closes**: — ; advances AC-01 (closed at T-07)
- **Complexity**: simple
- **Blocked by**: — (OQ-3 route-naming gate cleared — RD-3; the new tab uses the FR name `systems`).
- **Verification**: `pwa/src/__tests__/analytics-accent-ramp.test.tsx` (DONE — **11 tests, all green**: `bunx vitest run src/__tests__/analytics-accent-ramp.test.tsx` from `pwa/`). Asserts tokens.css defines all five `--accent-100/-300/-500/-700/-900` stops as `oklch(...)` custom properties, that `--accent-500` equals the base `--accent`, and each appears exactly once; asserts `route.ts` registers the `systems` analytics tab (RD-3 name) ahead of `matrix`, `parseHash("#/analytics/systems")` resolves to `{surface:"analytics",tab:"systems"}`, and `renderView` returns the T-21 pending seam (ViewHeader "System map") rather than NotFoundPanel. Typecheck: pass (`bun run typecheck`). Design-conformance: pass (`bun run scripts/design-conformance.ts --view pwa/src/views/index.tsx` — clean; T-21 touches the dispatcher + tokens + route, no analytics view surface — the full `Systems.tsx` conformance sweep lands at T-07). Token source-of-truth: the five stops were added to `.claude/stitch/design-system.yaml` and `tokens.css` regenerated via `bun run scripts/stitch-tokens-to-css.ts` (file is `DO NOT EDIT BY HAND`); `bun run scripts/stitch-tokens-to-css.ts --check` reports "up to date". Manual repro (best-effort): in devtools on `#/analytics/systems`, `getComputedStyle(document.documentElement).getPropertyValue("--accent-500")` returns `oklch(58% 0.18 255)` and all five stops resolve

## Build set vs deferred (execution scope, RD-6)

- **BUILD (this spec):** T-07, T-08, T-09, T-10, T-11, T-12, T-13, T-14, T-19, T-20, T-21.
- **RATIFY (as-built, no code):** T-01, T-02, T-03, T-04, T-05, T-06.
- **DEFERRED to `cto-analytics-reporting` (ratification-only, no code):** T-15, T-16, T-17, T-18.

**Dependency spine (BUILD):** T-20 (read-only module + migrated engine +
system-map, foundational) → T-14 (route scaffold) → T-09/T-11/T-12/T-13/T-19
report modules + guard tests; T-10 (weighted complexity) also on T-14; T-07
(system-map view) on T-20 + T-21; T-08 (matrix completion) on T-02; T-21
(ramp tokens + `systems` tab) foundational-UI; tab registrations for the new
report tabs ride in T-09. **No BUILD task is `Blocked by` a DEFERRED task
(T-15..T-18).**

## Validation checkpoints

| After | Run |
|-------|-----|
| T-01..T-06 (ratify) + T-15..T-18 (deferral ratify) | `scripts/spec/spec-traceability.sh .claude/specs/cto-analytics` — expect exit 0 |
| every BUILD task | `bun run typecheck` |
| BUILD tasks touching `pwa/src/views/` | `bun run scripts/design-conformance.ts --view <file>` |
| final BUILD task | `bun test` + `bun test:integration` (needs Neo4j) + full AC sweep over the shipped scope |
