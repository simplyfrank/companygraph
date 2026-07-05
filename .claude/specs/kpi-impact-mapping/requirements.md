---
feature: "kpi-impact-mapping"
created: "2026-07-04"
author: "spec-author (blueprint: business-modeling-studio, XD-04)"
status: "approved"
revision: 2
size: "medium"
---

# Requirements: kpi-impact-mapping

## Summary

`kpi-impact-mapping` is **wave-4** feature of the Business Modeling Studio
(blueprint `.claude/specs/blueprint.md`; milestone M3). It is the **measure**
stage of the pipeline (**author → graph → optimize → measure → systematize**):
having ranked and marked a model's key activities (`key-activity-optimizer`) and
made its stories graph citizens (`story-spec-core`), a Business Architect now
makes those activities and stories **measurable** by attaching **quantified,
directional KPI-impact links** — each link carrying an **impact direction**
(`increases` / `decreases`) and a **weight** in `[0,1]`. It computes an
**activity × KPI coverage matrix** with **measurability-gap detection** (which
key activities still lack any KPI link), and rolls each linked KPI's impact up
against its **latest measured value read through `kpi-okr-governance`'s verified
`GET /api/v1/kpi-trends/:kpiId` surface** (`_baseline` FR-07). That surface, as
built, reads the graph-resident `:KPIMeasurement` measurement source, **not** the
Postgres `kpi_measurements` table (a documented as-built split-brain — V-02, see
DEC-02 and OQ-2); this spec's roll-up composes whatever `kpi-trends` returns and
never re-queries a store itself. It ships the **KpiImpactMatrix** view at
`#/model/kpi-impact` (blueprint View Tree, verbatim) with all four view states.

Per XD-04 the impact **rides the existing KPI-alignment link surface extended
with a `direction` field + the existing quantified `weight`** — it does **not**
introduce a new store or a new compile-time edge type. Per XD-02 all link and
matrix data live in **Neo4j** (activity/story→KPI links); the roll-up's KPI
**measurements** are **not** written or owned here — they are read only through
`kpi-okr-governance`'s verified `kpi-trends` route, which sources them from the
graph-resident `:KPIMeasurement` nodes (V-02). No new store; no direct
measurement query in this spec. **(Resolves B-01, N-02.)**

> **XD-04 literal-name discrepancy (resolves in DEC-01, flagged as OQ-1).** The
> blueprint XD-04 sentence names "the existing `DRIVES_KPI` edge +
> `userStoryKPI` link schema". The as-built graph does **not** wire
> activity→KPI or journey→KPI weighting on `DRIVES_KPI` (that edge is
> `KeyResult → KPI`, `shared/src/schema/edges.ts`); the actual as-built,
> weighted, activity/journey→KPI link is the **`ALIGNED_TO`** edge written by
> `POST /api/v1/kpi-alignments` (`api/src/routes/kpi-sla-alignment.ts`, governed
> by `kpi-okr-governance` FR-04), carrying `weight ∈ [0,1]` + `attribution_type`.
> This spec therefore reads XD-04's intent ("quantified activity/story→KPI links
> carrying direction + weight, riding the existing KPI-alignment link surface")
> and **extends the as-built `kpi-alignments`/`ALIGNED_TO` surface with a
> `direction` field** for the activity/journey side, and **implements the
> `userStoryKPI` link** (schema exists in `shared/src/schema/kpi-sla.ts`, no
> as-built route) extended with `direction` + `weight` for the story side. See
> DEC-01 and OQ-1.

It **does not** re-spec KPI/SLA/OKR CRUD or measurements (owned by
`kpi-okr-governance`, adopted from `_baseline`), the KPI/OKR performance
dashboards (`kpi-okr-performance-dashboards` owns `#/exec/performance`),
key-activity scoring/marking (`key-activity-optimizer`), story/AC CRUD
(`story-spec-core`), or capability/system mapping (`ddd-system-modeling`). Those
are explicitly out of scope with named owners below.

## Motivation

1. The blueprint north star is a business model that is not just authored and
   optimized but **measurable**. XD-04 defines "measurable" precisely: not
   qualitative tags (the rejected alternative) but **coverage scoring + roll-ups
   against real measurements**. Today the graph can say "this is a key activity"
   (`key-activity-optimizer`'s `keyActivity` mark) but there is **no** way to say
   *how much* and *in which direction* an activity or story moves a specific KPI,
   and no way to see **which key activities are still unmeasured**.
2. The load-bearing pieces already exist but are **disconnected**: KPIs +
   measurements are governed (`kpi-okr-governance`, `_baseline` FR-07); the
   as-built `kpi-alignments`/`ALIGNED_TO` edge already carries a `weight ∈ [0,1]`
   + `attribution_type`; the `userStoryKPI` link schema is defined in
   `shared/src/schema/kpi-sla.ts` (but has **no** as-built route — verified). What
   is missing is (a) an **impact direction**, (b) **model scoping** of the links,
   (c) a **coverage matrix** that crosses a model's activities with the KPIs they
   impact, (d) **gap detection** keyed off the `keyActivity` mark, and (e) a
   **roll-up** that reads a linked KPI's latest measured value (through
   `kpi-okr-governance`'s `kpi-trends` route — as-built sourced from
   `:KPIMeasurement`, V-02, not the Postgres `kpi_measurements` table; see
   DEC-02/OQ-2) and reports the impact-weighted status. **(Resolves B-01.)**
3. `key-activity-optimizer` is this spec's declared dependency: its `keyActivity`
   attribute (stored in an `Activity`'s open `attributes` map, `key-activity-optimizer`
   FR-07/FR-09) is the priority signal for **measurability-gap detection** — a
   *key* activity with **zero** KPI-impact links is a measurability gap; a non-key
   activity without links is merely uncovered, not flagged as a gap.
4. `kpi-okr-governance` is this spec's declared dependency: it verifies + tests
   the KPI CRUD, `kpi-measurements` (Postgres), `kpi-trends`, and
   `kpi-alignments` (`ALIGNED_TO`) routes and adds `GET /api/v1/kpis`
   (list) + resource-shaped detail routes (`kpi-okr-governance` FR-10/FR-13).
   This spec **reads** that governed surface for the KPI catalog and the roll-up;
   it never re-implements KPI CRUD or measurement ingestion. **Important as-built
   caveat (V-02 split-brain, verified in-repo):** `GET /api/v1/kpi-trends/:kpiId`
   reads Neo4j `:KPIMeasurement` nodes (`api/src/routes/kpi-trends.ts`,
   `MATCH (m:KPIMeasurement …)`), whereas `POST /api/v1/kpi-measurements` writes
   the **disjoint** Postgres `kpi_measurements` table
   (`api/src/routes/kpi-measurements.ts`, migration 003). The two are **not**
   connected — `openapi-kpi-okr.ts` labels `kpi-trends` "SPLIT-BRAIN (V-02):
   reads Neo4j :KPIMeasurement nodes, NOT the Postgres rows POST
   /kpi-measurements writes." Because this spec's roll-up composes `kpi-trends`
   (DEC-02, the governed read this spec is allowed to call), it reflects the
   **`:KPIMeasurement` source `kpi-trends` reads**, not the Postgres table. This
   spec does **not** silently pick which of the two is the store of truth — that
   is flagged to the orchestrator as OQ-2. **(Resolves B-01.)**
5. The blueprint View Tree assigns `#/model/kpi-impact` → `KpiImpactMatrix` to
   this spec; `model-workspace-core` already registered that route as a
   placeholder and owns `route.ts`. This spec replaces the placeholder with the
   real coverage matrix, scoped to the active model.

## Functional Requirements

<!-- Priorities: must = M3 deliverable / downstream (requirements-export) dependency;
     should = polish. -->

### A. Quantified, directional KPI-impact links (XD-04)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **Activity→KPI impact link, extended with `direction`.** A model-scoped route `POST /api/v1/models/:modelId/kpi-impact/activity-links` creates a directional, weighted impact link from a model-scoped `Activity` to a `KPI`. The link rides the **as-built `ALIGNED_TO` edge** (`(:KPI)-[:ALIGNED_TO {weight, attribution_type, alignment_notes, created_at}]->(:Activity)`, `api/src/routes/kpi-sla-alignment.ts`, governed by `kpi-okr-governance` FR-04) **extended with a new `direction` property** ∈ `{"increases","decreases"}` (DEC-01, resolves OQ-1 — reuses the as-built weighted link rather than the literal `DRIVES_KPI` edge XD-04 names, which is `KeyResult→KPI`). Body: `{ activityId, kpiId, direction, weight (0..1), attributionType?, notes? }`, zod-validated. `:activityId` **must** be a model-scoped `Activity` of `:modelId` (else `404 activity_not_found`); `kpiId` must be a non-archived `KPI` (else `404 kpi_not_found`). Returns `201` + the created link row (`linkId` = Neo4j `elementId(r)`, mirroring the as-built alignment id convention). Re-linking the same `(activity,kpi)` pair updates the existing link's `direction`/`weight` (idempotent MERGE-on-pair). **MERGE keys the pair on the two node identities only** — `MERGE (k:KPI {id:$kpiId})-[r:ALIGNED_TO]->(a:Activity {id:$activityId})` then `SET r.direction/r.weight/…` — **not** on any edge property, so a re-link binds the one edge for that pair regardless of its `weight`/`attribution_type`/`alignment_notes`. **Interop with the as-built base writer (C-01, Risk 4):** `kpi-okr-governance`'s `POST /api/v1/kpi-alignments` uses `CREATE` (`kpi-sla-alignment.ts`) and can therefore leave **multiple** `ALIGNED_TO` edges on one `(kpi,activity)` pair. When this route MERGEs and >1 pre-existing edge matches, Cypher `MERGE` binds to an arbitrary existing match (non-deterministic among duplicates) and updates that one; it does **not** delete the others and does **not** create a new edge. This spec therefore does **not** de-duplicate base-route CREATE duplicates (out of scope — that is `kpi-okr-governance`'s edge); it only guarantees **this** route never adds a second edge for a pair it has seen. The requirements decision to add a second-writer MERGE on `kpi-okr-governance`'s `ALIGNED_TO` edge is flagged for that spec's owner to confirm (Risk 4). | must | XD-04, DEC-01 |
| FR-02 | **Story→KPI impact link — implement `userStoryKPI` + `direction` + `weight`.** A model-scoped route `POST /api/v1/models/:modelId/kpi-impact/story-links` creates a directional, weighted impact link from a model-scoped `UserStory` (`story-spec-core` FR-01; a story is in the model iff its `DESCRIBES_ACTIVITY` activity ∈ `scopedNodeIds(modelId)`, `story-spec-core` NFR-02) to a `KPI`. The pre-existing `userStoryKPI` link schema (`shared/src/schema/kpi-sla.ts`, `{ user_story_id, kpi_id, impact_description?, created_at }`) has **no as-built route** (verified); this spec **implements** it as a Neo4j edge `(:UserStory)-[:IMPACTS_KPI {direction, weight, notes?, created_at}]->(:KPI)` registered via the **ontology-manager edge-type registry** (`createEdgeType`, per XD-01 — **not** a compile-time `EDGE_ENDPOINTS` addition), extended with `direction` ∈ `{"increases","decreases"}` + `weight ∈ [0,1]`. The `userStoryKPI.user_story_id` **joins on `story-spec-core`'s `UserStory.id`** (the join-key boundary note in `story-spec-core` Scope Boundaries — this spec must **not** invent a parallel story identity). Body `{ storyId, kpiId, direction, weight, notes? }`, zod-validated; `404 story_not_found` / `404 kpi_not_found`; idempotent MERGE-on-pair; `201` + link row. | must | XD-04, story-spec-core join-key note |
| FR-03 | **List + delete impact links.** `GET /api/v1/models/:modelId/kpi-impact/activity-links` and `.../story-links` list the model-scoped links (each row: source id/name, `kpiId`/`kpiName`, `direction`, `weight`, `notes`, `createdAt`), optionally filtered by `?activityId=` / `?storyId=` / `?kpiId=`. `DELETE /api/v1/models/:modelId/kpi-impact/activity-links/:linkId` (resp. `story-links/:linkId`) removes the link → `204`; unknown link → `404 impact_link_not_found`; idempotent (a second delete → `404`, matching the as-built alignment DELETE). The `:linkId` is an opaque Neo4j `elementId` string for activity links (no UUID guard, mirroring `kpi-sla-alignment.ts`) and the `IMPACTS_KPI` edge's `elementId` for story links. | must | XD-04 |
| FR-04 | **Direction + weight validation is the single tightening.** The `direction` enum (`increases`/`decreases`) and `weight ∈ [0,1]` are enforced at the boundary by zod (the only sanctioned tightening beyond the as-built `kpi-alignments` contract, which already bounds `weight ∈ [0,1]` per `kpi-okr-governance` FR-04). `attributionType`, when supplied on activity links, keeps the as-built `{direct,indirect,leading,lagging}` enum. No other field of the as-built `ALIGNED_TO` contract is tightened or renamed (its snake_case `created_at`/`attribution_type` persisted-property names are kept as-built per `kpi-okr-governance` NFR-04). | must | XD-04, kpi-okr-governance NFR-04 |

### B. Coverage matrix + measurability-gap detection

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-05 | **Activity × KPI coverage matrix.** `GET /api/v1/models/:modelId/kpi-impact/matrix` returns the model's coverage matrix: **rows** = the model's scoped `Activity` nodes (id, name, parent journey name, and a boolean `isKeyActivity` derived from the **presence** of the `attributes.keyActivity` key — per `key-activity-optimizer` FR-07/FR-08 that key exists **iff** the activity is currently marked and is **deleted** on unmark, so there is no `marked:false` state on disk; the matrix reads presence, not a tri-state); **columns** = the distinct set of KPIs any of those activities impact (id, name, unit, `target_direction`); **cells** = for each `(activity, kpi)` pair, the impact link if present (`direction`, `weight`) or `null` if unlinked. The response carries a `meta` block `{ activityCount, kpiCount, linkedCellCount, keyActivityCount, gapCount }`. The matrix is **model-isolated** (NFR-01): only scoped activities appear; a KPI column appears only if ≥1 scoped activity links to it. zod-validated response shape. | must | XD-04, key-activity-optimizer FR-07 |
| FR-06 | **Measurability-gap detection.** The matrix response includes a `gaps` array: every **key** activity — an activity for which the `attributes.keyActivity` key is **present** (per `key-activity-optimizer` FR-07/FR-08 the key exists **iff** marked and is deleted on unmark; the predicate is **presence of the `attributes.keyActivity` key**, not a `.marked === true` comparison, so a design author must not add a phantom `marked:false` branch) — that has **zero** qualifying activity→KPI impact links is a **measurability gap**, reported as `{ activityId, activityName, journeyName, reason: "key_activity_no_kpi" }`. A non-key activity with zero links is **not** a gap (it is merely uncovered — surfaced in the matrix, not flagged). `meta.gapCount` = `gaps.length`. **What counts as a qualifying link that clears a gap (DEC-03, resolves C-04, OQ-4):** a gap is cleared **only** by an activity→KPI `ALIGNED_TO` edge that carries a non-null `direction` (`increases`/`decreases`). A pre-existing base-route (`kpi-alignments`) `ALIGNED_TO` edge with `direction:null` (an undirected alignment) does **not** clear a gap — it appears in the matrix as an undirected cell but the key activity stays flagged until a directional impact link exists. This matches XD-04's intent (the feature exists to add the **quantified, directional** impact a bare alignment lacks); the looser reading (any `ALIGNED_TO` clears the gap) is the OQ-4 alternative flagged to the orchestrator. This is the concrete "make key activities measurable" check XD-04 asks for: a key activity is *measurable* once it carries ≥1 **directional** KPI-impact link. | must | XD-04, key-activity-optimizer FR-07/FR-08 |
| FR-07 | **Story coverage rider (should).** The matrix response optionally includes, per activity row, `storyLinkCount`. **Cardinality is explicit (resolves C-03):** because `story-spec-core` FR-03 makes `DESCRIBES_ACTIVITY` `1..*` on the activity side (many stories may back one activity) and sets no per-story cap on `IMPACTS_KPI` edges (FR-02), the raw join (stories of the activity) × (their KPI links) is many-to-many. `storyLinkCount` is defined as **the count of distinct `IMPACTS_KPI` edges** whose source story `DESCRIBES_ACTIVITY` that activity — i.e. distinct `(story, kpi)` impact links, **not** distinct KPIs (two different stories linking the same KPI count as two). This is a coverage-volume signal for the view; it does not change gap detection (FR-06 keys off activity→KPI links only, since the "measurable key activity" unit XD-04 names is the activity). | should | XD-04, story-spec-core FR-03 |

### C. Roll-up against real measurements via the governed `kpi-trends` read (_baseline FR-07; source is `:KPIMeasurement`, V-02/DEC-02 — not Postgres, see OQ-2)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-08 | **Impact roll-up reads real measurements via the governed `kpi-trends` route (DEC-02, resolves B-01).** `GET /api/v1/models/:modelId/kpi-impact/rollup` returns, per KPI that any scoped activity/story impacts, the KPI's **current measured status** computed from the latest measurement returned by `kpi-okr-governance`'s verified read surface `GET /api/v1/kpi-trends/:kpiId` (`kpi-okr-governance` FR-03) — **not** re-querying any store directly. **As-built source of truth (V-02 split-brain, verified):** `kpi-trends` reads the graph-resident `:KPIMeasurement` measurement source (`api/src/routes/kpi-trends.ts`, `MATCH (m:KPIMeasurement {kpi_id:$id})`), which is **disjoint** from the Postgres `kpi_measurements` table that `POST /api/v1/kpi-measurements` writes. This spec's roll-up therefore reflects the **`:KPIMeasurement` source `kpi-trends` reads**; it makes no claim about the Postgres table and does not read it. Which store should be the measurement source of truth is **not** decided here (OQ-2, flagged to the orchestrator). Per KPI it reports `{ kpiId, kpiName, unit, targetValue, targetDirection, latestValue, status ("on_track"|"warning"|"critical"|"no_data"), impactLinkCount, aggregateImpactWeight }` where `latestValue` is taken from the most-recent measurement in the `kpi-trends` payload, `aggregateImpactWeight` = the sum (capped at 1.0) of the `weight`s of the scoped impact links pointing at that KPI, and `status` derives from `latestValue` vs the KPI's `target_value`/`warning_threshold`/`critical_threshold`/`target_direction` (the `kpiSchema` fields, `shared/src/schema/kpi-sla.ts`). A KPI whose `kpi-trends` payload has **no** measurements yields `status:"no_data"` (never a crash). | must | XD-04, _baseline FR-07, kpi-okr-governance FR-03 |
| FR-09 | **Roll-up is a read-only composition, no measurement writes.** The roll-up (FR-08) and matrix (FR-05) endpoints are **read-only** — they never write measurements, KPIs, or SLA data (all owned by `kpi-okr-governance`). If the governed `kpi-trends` route is unavailable or errors (e.g. the measurement source — as-built Neo4j `:KPIMeasurement`, V-02 — is unreachable), the roll-up degrades to `status:"no_data"` per KPI with a `meta.measurementsAvailable:false` flag rather than 500-ing the whole matrix view. The measurement read is performed server-side (the PWA calls only this spec's `.../rollup` route, not `kpi-trends` directly, keeping the roll-up composition in one place). | must | XD-02, _baseline FR-07 |

### D. API contract

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-10 | Every route in FR-01…FR-08 is mounted under `/api/v1/`, zod-validated at the boundary, returns the `{error:{code,message,details?}}` envelope, and appears in `GET /api/v1/openapi.json` (generated from the same zod definitions — no hand-maintained copy). New error codes are added to the closed `ERROR_CODES` enum (`api/src/errors.ts`) as **additive** (non-breaking) changes: at minimum `kpi_not_found`, `impact_link_not_found`, and (reusing where already present) `activity_not_found` / `story_not_found` (if `key-activity-optimizer` / `story-spec-core` already registered these, reuse the existing code — do not add a duplicate). Every added code is reachable from ≥1 route (so `envelope.test.ts`'s reachability assertion holds); no unreachable "reserved" code. ZodError → 400 mapping uses the shared mechanism `kpi-okr-governance` FR-11b establishes (no per-route 500-on-malformed-body regression). | must | NFR-11, house rule, kpi-okr-governance FR-11b |
| FR-11 | **Route-permission mapping.** Every new `/api/v1/models/:modelId/kpi-impact*` route is registered in `api/src/auth/rbac-permissions.ts` (`ROUTE_PERMISSIONS`) with a new `kpi_impact:read` (the matrix/rollup/list GETs) / `kpi_impact:write` (the link POSTs, DELETEs) permission and correct specific-before-parameterized ordering (the `.../activity-links/:linkId` rows follow the house convention). The `business_architect` RBAC role (seeded by `model-workspace-core` FR-11, extended by `story-spec-core`/`key-activity-optimizer`) gains `kpi_impact:read` + `kpi_impact:write` in `api/src/scripts/seed-rbac-roles.ts` (idempotent MERGE by role name). Auth is enforced **only** by the central router gate (`api/src/router.ts`) + `api/src/auth/` — no per-route auth check (house rule). No new route is `public`. | must | house rule, XD-08 |

### E. PWA — KpiImpactMatrix view (blueprint View Tree, UX-*)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-12 | **KpiImpactMatrix view** (`pwa/src/views/model/KpiImpactMatrix.tsx`, route `#/model/kpi-impact` — taken **verbatim** from the blueprint View Tree) **replaces** the `ModelTabPlaceholder` that `model-workspace-core` registered for the `kpi-impact` tab in `pwa/src/views/index.tsx`'s `model` surface dispatch. It reads the active `BusinessModel` from the shell-owned context (`useActiveModel()`; it does **not** re-implement model selection) and renders that model's coverage matrix from `GET /api/v1/models/:modelId/kpi-impact/matrix`. The ready state is the **activity × KPI grid** (rows = activities with key-activity + gap indicators, columns = KPIs, cells = a directional-weight chip — up/`increases` or down/`decreases` + weight, or empty for unlinked). It specs **all four view states**: **loading** (skeleton while the fetch is in flight), **empty** (no scoped activities OR no impact links yet — a message pointing to key-activity marking + link creation), **error** (fetch failed — retry affordance), **ready** (matrix). Tokens-only styling via `var(--…)` from `pwa/src/styles/companygraph/tokens.css`; catalog components (`DataTable`, `Card`, `Button`, `SidePanel`/`Modal`, `Loading`/`ErrorState` from `views/_shared.tsx`) before inventing new ones; `scripts/design-conformance.ts` passes on the view + its CSS module. | must | Blueprint View Tree, UX-01, UX-02, UX-06 |
| FR-13 | **Link editing + gap surfacing + roll-up panel.** In KpiImpactMatrix: (a) a **gaps strip** lists the measurability gaps (FR-06) — each a key activity with no KPI link — with a "link a KPI" affordance; (b) clicking an empty cell (or a "link" action on an activity row) opens a **link editor** (catalog `SidePanel`/`Modal`) to pick a KPI (from `GET /api/v1/kpis`, `kpi-okr-governance` FR-10a), a **direction** (increases/decreases), and a **weight** slider `[0,1]`, then `POST …/activity-links` (optimistic, rollback on error); an existing cell's chip opens the same editor pre-filled and supports edit (re-POST idempotent) + delete (`DELETE …/activity-links/:linkId`); (c) selecting a KPI column header opens a **roll-up panel** showing that KPI's measured status from `GET …/rollup` (latest value, status, aggregate impact weight). All controls are keyboard-reachable (UX-05). | must | XD-04, FR-06, FR-08, UX-01, UX-05 |
| FR-14 | **Model-scoped matrix + reload survival.** KpiImpactMatrix only ever shows the active model's activities/KPIs/links; switching the active model (via the shell context) refetches for the new model; deep-linking `#/model/kpi-impact` and reloading re-renders the matrix for the persisted active model (persistence + reconciliation is `model-workspace-core`'s FR-15; this view consumes it and refetches on `activeModel.id` change). No cross-model leakage (server-enforced by FR-01/FR-02/FR-05 model-scoping — matrix rows/links are computed only over `scopedNodeIds(driver, :modelId)`). | must | UX-06, model-workspace-core FR-15 |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | **Model isolation.** All link writes (FR-01, FR-02), reads (FR-03), the matrix (FR-05), gaps (FR-06), and roll-up (FR-08) are scoped by `model-workspace-core`'s `scopedNodeIds(driver, :modelId)` helper (`api/src/storage/model-scope.ts`, consumed, never re-implemented). Matrix rows are only scoped activities; a story link is in-model iff its story's `DESCRIBES_ACTIVITY` activity is scoped (`story-spec-core` NFR-02); a request for model A never returns or writes a link touching a model-B-only activity/story. | XD-06, model-workspace-core FR-18, story-spec-core NFR-02 |
| NFR-02 | **No new store; no compile-time schema edit for the activity side.** Impact links + matrix data live in **Neo4j** (XD-02). KPI **measurements** are **not** owned, written, or directly queried here (in **any** store — neither the Postgres `kpi_measurements` table nor the Neo4j `:KPIMeasurement` nodes); the roll-up reads them **only** through `kpi-okr-governance`'s governed `GET /api/v1/kpi-trends/:kpiId` route (which, per V-02/DEC-02, itself reads `:KPIMeasurement`). No direct store query for measurements in this spec. The activity→KPI link reuses the as-built `ALIGNED_TO` edge (already in use, extended with a `direction` property — a property add, not a new edge type). The story→KPI link introduces one **runtime-registry** edge type `IMPACTS_KPI` via `createEdgeType` (XD-01) — **not** a compile-time `EDGE_ENDPOINTS`/`NODE_LABELS` edit. `shared/src/schema/edges.ts`/`nodes.ts` consts are **not** edited. **(Resolves B-01.)** | XD-02, XD-01 |
| NFR-03 | **Direction + weight are the only contract tightening (resolves the as-built-compat risk).** Beyond adding `direction` (new property) and validating `weight ∈ [0,1]` (already bounded on `kpi-alignments`), no field of the as-built `ALIGNED_TO`/`userStoryKPI` contract is renamed or tightened; snake_case persisted property names (`created_at`, `attribution_type`) are kept as-built (`kpi-okr-governance` NFR-04). Existing base-route `ALIGNED_TO` edges without a `direction` property read back as `direction:null` in this spec's list/matrix. Per DEC-03 (FR-06) such an undirected link is surfaced in the matrix but does **not** clear a measurability gap — only a `direction`-bearing link does. **(Resolves C-04.)** | kpi-okr-governance NFR-04, as-built |
| NFR-04 | **Roll-up correctness + resilience.** The roll-up (FR-08) reflects the **real** latest measurement for each KPI as returned by the governed `kpi-trends` route (as-built sourced from `:KPIMeasurement`, V-02/DEC-02 — not a placeholder, not the Postgres `kpi_measurements` table); `status` derivation matches the KPI's `target_direction` semantics (`higher_is_better`/`lower_is_better`/`target_is_exact`, `kpiSchema`). A KPI with no measurements in the `kpi-trends` payload → `no_data`; measurement source unavailable → `meta.measurementsAvailable:false` + all `no_data`, never a 500 (FR-09). Deterministic: same graph + same `kpi-trends` responses → same roll-up. **(Resolves B-01.)** | XD-04, _baseline FR-07 |
| NFR-05 | **Bounded computation.** The matrix + roll-up respond in < 2 s at `retail-mini`/single-model scale on the dev box (no cache subsystem — served live, matching `key-activity-optimizer` NFR-05 / cto-analytics DD-03). Matrix is O(scoped-activities × linked-KPIs); roll-up issues one measurement read per linked KPI (bounded by the model's linked-KPI count). No precompute/scheduler subsystem. | XD-04, key-activity-optimizer NFR-05 |
| NFR-06 | House rules: `zod` is the only validation library; no `tsc` (transpile via `bun run typecheck`); en-US identifiers (`color`, `neighbors`, `behavior`); server binds loopback `127.0.0.1:8787`; auth via the central router gate + `api/src/auth/` only; all routes under `/api/v1/`. | CLAUDE.md |
| NFR-07 | PWA styling is tokens-only (`var(--…)` from `tokens.css`); components come from the existing CSS-Module catalog before new ones; `scripts/design-conformance.ts` passes on every touched view (UX-02). Desktop-first, no new breakpoints (UX-04). | UX-02, UX-04 |

## UI/UX Requirements

**Views owned by this spec** (from the blueprint View Tree, verbatim):

| Route | View component | Nav surface | States specced (loading·empty·error·ready) |
|-------|----------------|-------------|---------------------------------------------|
| `#/model/kpi-impact` | `KpiImpactMatrix` | Model tab (topbar surf-nav + subnav — registered by `model-workspace-core`) | all four — AC-09 (loading), AC-10 (empty), AC-11 (error), AC-08 (ready) |

This spec **replaces** the `ModelTabPlaceholder` `model-workspace-core` registered
for the `kpi-impact` tab; it does **not** touch `route.ts` (`model-workspace-core`
owns it) beyond the `renderView`/`VIEWS` dispatch of the `kpi-impact` tab to
`KpiImpactMatrix`.

**UX allowance conformance** (reference blueprint UX-*; do not re-decide):

| Allowance | How this spec satisfies it |
|-----------|---------------------------|
| UX-01 view states | AC-08..AC-11 cover KpiImpactMatrix ready/loading/empty/error |
| UX-02 design system (tokens-only, catalog components, design-conformance passes) | FR-12, NFR-07; AC-12 runs `scripts/design-conformance.ts` |
| UX-03 input modes (canvas/gesture tables) | n/a — KpiImpactMatrix is a grid/detail/form surface (no canvas, no custom gestures). The Platforms & Input Modes + Native Conflicts tables below are populated to record this explicitly (the view still has keyboard/mouse/trackpad interactions: cell selection, a link editor with a weight slider + direction toggle, a roll-up panel). |
| UX-04 responsiveness | NFR-07 — desktop-first, no new breakpoints |
| UX-05 accessibility | AC-13 — keyboard reachability of the matrix cells, the link editor (KPI select, direction toggle, weight slider), the gaps strip, and the roll-up panel; focus order; ARIA landmark on the view; the matrix grid exposes appropriate `role="grid"`/header semantics; the weight slider is an accessible `input[type=range]` with `aria-valuenow` |
| UX-06 navigation (routes verbatim, deep links + active-model survive reload) | FR-12 (verbatim route), FR-14 (refetch on model change + reload survival); AC-14 (deep link + active model → correct matrix after reload) |

## Scope Boundaries

**In scope:**
- Quantified, **directional** activity→KPI impact links (`ALIGNED_TO` extended with `direction`) and story→KPI impact links (`IMPACTS_KPI` runtime-registry edge implementing `userStoryKPI` + `direction`/`weight`), model-scoped CRUD.
- Direction (`increases`/`decreases`) + `weight ∈ [0,1]` validation.
- Activity × KPI **coverage matrix** + **measurability-gap detection** keyed off the `keyActivity` mark.
- **Roll-up** of impact against real KPI measurements, read **only** via `kpi-okr-governance`'s governed `GET /api/v1/kpi-trends/:kpiId` (as-built sourced from Neo4j `:KPIMeasurement`, V-02/DEC-02 — this spec makes no direct-store measurement query and does not decide the store-of-truth; see OQ-2).
- `kpi_impact:read`/`kpi_impact:write` permissions + route mappings; grant to `business_architect`.
- `KpiImpactMatrix` view at `#/model/kpi-impact` with all four states, matrix grid, link editor (direction + weight), gaps strip, and roll-up panel.

**Out of scope (owner named):**
- **KPI / SLA / OKR CRUD, measurements ingestion, trends, `kpi-alignments` base contract** → `kpi-okr-governance` (adopted from `_baseline` FR-07/FR-08). This spec reads that governed surface and adds a `direction` property; it never re-specs KPI CRUD or measurement writes.
- **KPI/OKR performance dashboards** (`#/exec/performance`, trends + breach status + OKR roll-down, slice by systemKind) → `kpi-okr-performance-dashboards`. This spec's roll-up is per-model measurability, not the exec performance control.
- **Key-activity scoring / marking** (`keyActivity` attribute + score evidence) → `key-activity-optimizer`. This spec **reads** the mark for gap detection; it never computes or writes it.
- **Story / AC CRUD + bootstrap** → `story-spec-core`. This spec links stories to KPIs; it never creates/edits stories.
- **Capability / story→capability→system mapping** → `ddd-system-modeling`.
- **Export document assembly** (impact matrix into the per-model spec doc) → `requirements-export`. This spec provides the matrix/roll-up surface that feature reads.
- **`route.ts` / `SURFACES` edits, active-model context, model CRUD, `scopedNodeIds` helper** → `model-workspace-core`; consumed here.
- **A precompute/cache/scheduler subsystem** — matrix + roll-up serve live (FR-05/FR-08, NFR-05).

## Acceptance Criteria

<!-- Every AC traces to ≥1 FR. Platforms + Verification columns mandatory. -->

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | **Activity→KPI directional link** (`POST …/activity-links`) creates an `ALIGNED_TO` edge carrying `direction ∈ {increases,decreases}` + `weight ∈ [0,1]` from a scoped `Activity` to a non-archived `KPI`; returns `201` + a row with `linkId` (Neo4j `elementId`); re-linking the same `(activity,kpi)` pair updates direction/weight without creating a second edge (idempotent MERGE-on-pair); a non-scoped `:activityId` → `404 activity_not_found`; an unknown/archived `kpiId` → `404 kpi_not_found`; `weight` outside `[0,1]` or a bad `direction` → `400` zod envelope (FR-01, FR-04, FR-10) | server (bun test + Neo4j) | `api/__tests__/kpi-impact-activity-links.integration.test.ts` |
| AC-02 | **Story→KPI directional link** (`POST …/story-links`) registers the `IMPACTS_KPI` edge type via the ontology-manager registry (frozen `EDGE_ENDPOINTS` const unchanged) and creates a `(:UserStory)-[:IMPACTS_KPI {direction,weight}]->(:KPI)` edge from a model-scoped `UserStory` (joined on `story-spec-core`'s `UserStory.id`) to a `KPI`; `201` + row; idempotent MERGE-on-pair; `404 story_not_found` for a non-scoped story; `404 kpi_not_found`; bad direction/weight → `400` (FR-02, FR-04, NFR-02) | server (bun test + Neo4j) | `api/__tests__/kpi-impact-story-links.integration.test.ts` |
| AC-03 | **List + delete** links: `GET …/activity-links` and `.../story-links` return the model's links with `direction`/`weight`/source+kpi names, filterable by `?activityId=`/`?storyId=`/`?kpiId=`; `DELETE …/activity-links/:linkId` → `204`, a second delete → `404 impact_link_not_found`; the same for story links; **mis-routed id (N-01):** passing a **story link's** `elementId` to `DELETE …/activity-links/:linkId` (or vice-versa) → `404 impact_link_not_found`, **not** a silent no-op or a cross-type delete (the activity DELETE only matches `ALIGNED_TO`, the story DELETE only matches `IMPACTS_KPI`) (FR-03) | server (bun test + Neo4j) | `api/__tests__/kpi-impact-links-crud.integration.test.ts` |
| AC-04 | **Coverage matrix** (`GET …/matrix`): rows are the model's scoped activities (id, name, journey, `keyActivity` mark state read from `attributes.keyActivity`), columns are the distinct impacted KPIs, cells carry `{direction, weight}` or `null`; `meta` reports `{activityCount, kpiCount, linkedCellCount, keyActivityCount, gapCount}`; a KPI impacted only by a model-B activity is absent from model A's columns (FR-05, NFR-01) | server (bun test + Neo4j) | `api/__tests__/kpi-impact-matrix.integration.test.ts` |
| AC-05 | **Measurability gaps** (FR-06, DEC-03): a fixture with a **key** activity (the `attributes.keyActivity` key **present**, per key-activity-optimizer FR-08 — the test asserts on presence, not a `marked:false` branch) and **no** directional activity→KPI link yields a `gaps` entry `{activityId, reason:"key_activity_no_kpi"}`; the same key activity after a **directional** `POST …/activity-links` **drops out** of `gaps`; a key activity whose only link is a pre-existing base-route `ALIGNED_TO` with `direction:null` **stays** in `gaps` (undirected links do not clear a gap, DEC-03/C-04); a **non-key** activity with no links is **not** in `gaps`; `meta.gapCount === gaps.length` (FR-06, key-activity-optimizer FR-07/FR-08) | server (bun test + Neo4j) | `api/__tests__/kpi-impact-gaps.integration.test.ts` |
| AC-06 | **Roll-up vs the governed `kpi-trends` measurement source** (`GET …/rollup`, DEC-02, resolves B-01): seed the source `kpi-trends` actually reads — **Neo4j `:KPIMeasurement` nodes** for a KPI (the as-built V-02 source; the test seeds `(:KPIMeasurement {kpi_id, measured_at, value})` nodes, **not** Postgres `kpi_measurements` rows, because `kpi-trends` reads `:KPIMeasurement` — verified in `api/src/routes/kpi-trends.ts`) — then assert the roll-up reports `latestValue` + `status` derived from the latest `:KPIMeasurement` vs the KPI `target_value`/thresholds/`target_direction`, plus `impactLinkCount` + capped `aggregateImpactWeight`; a KPI with no `:KPIMeasurement` nodes → `status:"no_data"`; with the measurement source made unavailable (e.g. the `kpi-trends` read errors), the endpoint returns `meta.measurementsAvailable:false` + all `no_data` and **not** a 500 (FR-08, FR-09, NFR-04) | server (bun test + Neo4j) | `api/__tests__/kpi-impact-rollup.integration.test.ts` |
| AC-07 | **Authz + model isolation** (split from openapi per N-03): seed two models; `GET …/matrix` for model A excludes model-B-only activities/links; a session without `kpi_impact:write` gets `403` on the link POST/DELETE, `kpi_impact:read` gets `200` on matrix/rollup/list GETs; the `business_architect` role resolves both permissions; no new route is `public` (FR-01, FR-11, NFR-01) | server (bun test + Neo4j) | `api/__tests__/kpi-impact-authz.integration.test.ts` |
| AC-08 | `#/model/kpi-impact` resolves to `KpiImpactMatrix` (not `ModelTabPlaceholder`); it reads the active model from `useActiveModel()` and renders the ready-state activity × KPI grid — rows with activity name + key-activity/gap indicator, KPI columns, and a directional-weight chip (↑ increases / ↓ decreases + weight) in linked cells, empty in unlinked (FR-12 ready, FR-14) | macOS Chrome (mouse+kb), macOS Safari (trackpad+kb) | `pwa/src/__tests__/kpi-impact-matrix.test.tsx` |
| AC-09 | KpiImpactMatrix renders a loading skeleton while `GET …/matrix` is pending (FR-12, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/kpi-impact-matrix-states.test.tsx` |
| AC-10 | With no scoped activities OR no impact links in the active model, KpiImpactMatrix shows the empty state (a message pointing to key-activity marking + link creation) and no grid (FR-12 empty) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/kpi-impact-matrix-states.test.tsx` |
| AC-11 | When `GET …/matrix` fails, KpiImpactMatrix shows the error state with a retry affordance that refetches; the gaps strip renders above the grid when `gaps` is non-empty (FR-12, FR-13, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/kpi-impact-matrix-states.test.tsx` |
| AC-12 | `scripts/design-conformance.ts` passes on `KpiImpactMatrix.tsx` + its CSS module (tokens-only, catalog components) (NFR-07, UX-02) | CLI | `bun run scripts/design-conformance.ts --view pwa/src/views/model/KpiImpactMatrix.tsx` — expect exit 0, zero token/component violations reported |
| AC-13 | KpiImpactMatrix is keyboard-reachable: Tab reaches the gaps-strip actions, each matrix cell/link action, and the link editor controls in DOM order; the link editor's KPI select, direction toggle, and weight slider (`input[type=range]`, exposing `aria-valuenow`) are keyboard-operable; opening the link editor or roll-up panel moves focus into it and Escape/close returns focus to the originating cell/header; the view exposes an ARIA landmark and the matrix uses `role="grid"` semantics (FR-12, FR-13, UX-05) | macOS Chrome (keyboard), macOS Safari (keyboard) | manual: with the stack up, load `#/model/kpi-impact` keyboard-only — Tab to a gap's "link a KPI" action and press Enter (expect the link editor opens and focus enters it), Tab through KPI select → direction toggle → weight slider (expect arrow keys change `aria-valuenow`), submit and press Escape (expect focus returns to the originating cell and the new chip renders) |
| AC-14 | Deep link + active model survive reload: with model B active, navigate to `#/model/kpi-impact`, reload — expect the same route renders `KpiImpactMatrix` showing **model B's** matrix (active-model persistence is `model-workspace-core`'s FR-15; this view refetches for the persisted model) (FR-14, UX-06) | macOS Chrome (mouse+kb) | `pwa/playwright/kpi-impact-matrix-context.spec.ts` |
| AC-15 | Transpile is clean and no compile-time schema arrays were edited (`IMPACTS_KPI` is a runtime-registry edge type; the activity link reuses the existing `ALIGNED_TO` edge with an added `direction` property; no `NODE_LABELS`/`EDGE_ENDPOINTS` change) (NFR-02, NFR-06) | CLI | `bun run typecheck` exit 0; manual: `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts` shows no additions to `NODE_LABELS` or `EDGE_ENDPOINTS` |
| AC-16 | **Story coverage rider** (FR-07, closes the FR-07↔AC gap the review flagged): a fixture with an activity backed by two distinct stories, each carrying one `IMPACTS_KPI` link (one pair reusing the same KPI), yields `storyLinkCount === 2` on that activity's matrix row (distinct `(story,kpi)` edges, **not** distinct KPIs); an activity with no story links → `storyLinkCount === 0`; `storyLinkCount` does not alter `gaps`/`gapCount` (FR-07, FR-06) | server (bun test + Neo4j) | `api/__tests__/kpi-impact-matrix.integration.test.ts` |
| AC-17 | **OpenAPI contract** (split from AC-07 per N-03): the new `/api/v1/models/:modelId/kpi-impact*` routes and every added error code (`kpi_not_found`, `impact_link_not_found`, and any reused `activity_not_found`/`story_not_found`) appear in `GET /api/v1/openapi.json` (generated from the same zod schemas — no hand-maintained copy); every added `ERROR_CODES` entry is reachable from ≥1 route so `envelope.test.ts`'s reachability assertion holds (FR-10) | server (bun test) | `api/__tests__/kpi-impact-openapi.integration.test.ts` |

## Platforms & Input Modes

This spec touches `pwa/` (the `KpiImpactMatrix` view + its dispatch in
`renderView`). It ships **no** canvas, custom gesture, scroll-container, or global
keyboard handler — KpiImpactMatrix is a **grid + link-editor + roll-up-panel**
surface reusing catalog components (`DataTable`, `Card`, `Button`,
`SidePanel`/`Modal`) and native controls (a `select`, a direction toggle, an
`input[type=range]` weight slider). The tables are populated to record this
explicitly (it still has keyboard/mouse/trackpad interaction: cell selection, the
link editor, the roll-up panel).

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| Coverage matrix grid + cell selection | yes | yes | yes | yes | catalog `DataTable`/grid; empty cell → link editor; column header → roll-up panel |
| Gaps strip (key activity, no KPI) | yes | yes | yes | yes | list of gaps; "link a KPI" action per gap |
| Link editor (KPI select, direction toggle, weight slider) | yes | yes | yes | yes | catalog `SidePanel`/`Modal`; native `select`, toggle button, `input[type=range]`; POST/DELETE `…/activity-links`; optimistic w/ rollback |
| Roll-up panel (per-KPI measured status) | yes | yes | yes | yes | catalog `SidePanel`/`Modal`; read-only; Escape closes |
| Canvas / drag / pinch-zoom gestures | no | no | no | no | none introduced — no canvas surface in this spec |

## Native Conflicts

KpiImpactMatrix introduces **no new gesture, scroll-hijack, drag, or global
keyboard handler**. It uses native buttons, a native `select`, a native
`input[type=range]` slider, a grid/table, and catalog `Modal`/`SidePanel`
components (whose focus-trap + Escape behavior already exist in the catalog and
are reused, not re-implemented). There is therefore no native behavior to
suppress beyond what the reused catalog components already handle.

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| Modal/SidePanel focus trap + Escape-to-close | (reused catalog behavior) | n/a — provided by the existing catalog `Modal`/`SidePanel`; this spec reuses, does not re-implement or override |
| `input[type=range]` arrow-key value change | (native, desired for the weight slider) | n/a — native behavior is the intended interaction; not suppressed |
| (no new gesture / scroll / drag / global-keyboard handling introduced) | n/a | n/a |

## Dependencies

> **Hard build-order dependency.** This spec is **wave 4** (blueprint dependency
> graph): it cannot start implementation until all three of its dependencies
> land. The surfaces below are **new files** owned upstream that may not exist on
> disk at this spec's authoring time; this spec **consumes** them and never
> re-specs them.

- **`model-workspace-core`** (foundation wave 1 — transitive dependency): consumed, never re-specced.
  - `scopedNodeIds(driver, modelId)` (`api/src/storage/model-scope.ts`, FR-18) — model-scoped activity/story reads + link-target checks (FR-01, FR-02, FR-05, NFR-01). **Verified present on disk** at authoring time.
  - `IN_MODEL` scoping regime + `BusinessModel` root (model-scoped `/api/v1/models/:modelId/...` routes).
  - `business_architect` RBAC role (`api/src/scripts/seed-rbac-roles.ts`, FR-11) — this spec adds `kpi_impact:*` to it (FR-11).
  - Model surface shell + `route.ts`/`SURFACES` registration + `ModelTabPlaceholder` for the `kpi-impact` tab — replaced by `KpiImpactMatrix` (FR-12).
  - Shell-owned active-model context + `useActiveModel()` (`pwa/src/context/ActiveModelContext.tsx`, FR-15) — consumed by KpiImpactMatrix (FR-12, FR-14).
- **`key-activity-optimizer`** (wave 3 — declared dependency): the `keyActivity` attribute on `Activity` (`attributes.keyActivity`, FR-07/FR-09) is the priority signal for gap detection (FR-06). This spec **reads** the mark from the activity's `attributes` map; it never computes or writes it. No route of that spec is called; the mark is read directly from the graph (or via graph-core node reads).
- **`story-spec-core`** (wave 2 — declared dependency): the `UserStory` runtime label + `UserStory.id` identity (FR-01) is the join key for story→KPI links (FR-02); the model-scoping-through-activity mechanism (story-spec-core NFR-02) is the isolation rule for story links. This spec **must not** invent a parallel story identity (story-spec-core Scope Boundaries join-key note).
- **`kpi-okr-governance`** (foundation wave 1 — declared dependency): the governed KPI surface this spec reads.
  - `GET /api/v1/kpis` (list, FR-10a) + `GET /api/v1/kpis/:id` (detail, FR-13) — the KPI catalog for the link editor + column definitions.
  - `GET /api/v1/kpi-trends/:kpiId` (FR-03) — the roll-up's real-measurement source (FR-08). **As-built (V-02, verified):** this route reads Neo4j `:KPIMeasurement` nodes, **not** the Postgres `kpi_measurements` table (see OQ-2/DEC-02). The roll-up composes this route's payload; it never queries a store directly.
  - The `kpi-alignments`/`ALIGNED_TO` base contract (FR-04) this spec's activity link extends with `direction`.
  - The shared ZodError→400 mapping mechanism (FR-11b) this spec reuses (no per-route malformed-body 500).
  - The Neo4j CI service — this spec's roll-up integration test (AC-06) seeds `:KPIMeasurement` nodes (the source `kpi-trends` reads, V-02/DEC-02); it does **not** require the Postgres CI service, since the roll-up never reads the Postgres `kpi_measurements` table.
- **Shared schema** (`shared/src/schema/kpi-sla.ts`): `kpiSchema` (target/thresholds/direction for roll-up status derivation), `userStoryKPISchema` (the story-link shape this spec implements + extends), `kpiAlignmentSchema` (the `weight ∈ [0,1]` bound this spec's activity link keeps). This spec may add `direction`-carrying request/response zod schemas here or in a new `shared/src/schema/kpi-impact.ts` (design decides).
- **Central router gate** (`api/src/router.ts`) + `ROUTE_PERMISSIONS` (`api/src/auth/rbac-permissions.ts`): all new routes dispatched + auth-gated here; no per-route auth.
- **OpenAPI generation** (`api/src/routes/openapi.ts` / `openapi-kpi-okr.ts`) + `ERROR_CODES` (`api/src/errors.ts`) + `envelope`/route helpers (`api/src/routes/_helpers.ts`).
- **ontology-manager runtime registry** (`api/src/ontology/storage/edge-types.ts` — `createEdgeType`): the sanctioned path for the `IMPACTS_KPI` edge type (XD-01, NFR-02).
- **PWA shell + catalog** (`pwa/src/views/index.tsx` `model`-surface dispatch, `pwa/src/components/{DataTable,Card,Button,Modal,SidePanel}.tsx`, `pwa/src/views/_shared.tsx` `Loading`/`ErrorState`, `pwa/src/styles/companygraph/tokens.css`, `scripts/design-conformance.ts`, `pwa/src/api.ts` `json<T>()` wrapper).

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | **OQ-1 — XD-04 names `DRIVES_KPI`, but the as-built weighted activity→KPI link is `ALIGNED_TO` (and `DRIVES_KPI` is `KeyResult→KPI`). DECIDED (DEC-01 default recorded in FR-01/FR-02).** The blueprint sentence's literal edge names do not match the as-built graph. | Choosing the wrong edge would either duplicate the alignment surface or mis-wire impact onto the OKR key-result edge. | **Decided default (DEC-01):** activity impact **extends the as-built `ALIGNED_TO`/`kpi-alignments` link** with a `direction` property (reuses `kpi-okr-governance`'s governed weighted link); story impact **implements the `userStoryKPI` schema** as a runtime-registry `IMPACTS_KPI` edge with `direction`+`weight`. This honours XD-04's *intent* ("quantified activity/story→KPI links carrying direction + weight, riding the existing KPI-alignment link surface") over its literal edge name. **Flag for the consolidated report / orchestrator:** confirm this reading of XD-04, or (alternative) wire a fresh `DRIVES_KPI`-style edge — not recommended, it would fork the alignment surface `kpi-okr-governance` just verified. Not a design blocker under the recorded default. |
| 2 | **OQ-2 — which measurement *store* is the roll-up's source of truth? RE-STATED per B-01/N-02 to name the V-02 split-brain; NEEDS A USER DECISION.** Verified in-repo: `GET /api/v1/kpi-trends/:kpiId` reads **Neo4j `:KPIMeasurement` nodes** (`api/src/routes/kpi-trends.ts`), while `POST /api/v1/kpi-measurements` writes the **disjoint Postgres `kpi_measurements` table** (`api/src/routes/kpi-measurements.ts`, migration 003). These are two different, unconnected datasets — `openapi-kpi-okr.ts` explicitly labels `kpi-trends` "SPLIT-BRAIN (V-02): reads Neo4j :KPIMeasurement nodes, NOT the Postgres rows POST /kpi-measurements writes." The earlier framing of OQ-2 ("trends vs measurements-list") missed that the two read **different stores**. | The choice determines **which measurements the roll-up reflects** — the two stores can hold entirely different values. It is a real product/architecture decision, not a cosmetic default. | **This spec's read is decided (DEC-02): compose `GET /api/v1/kpi-trends/:kpiId`**, because that is the governed read route `kpi-okr-governance` FR-03 sanctions and this spec must not query a store directly (NFR-02). That fixes the roll-up to the **`:KPIMeasurement`** source `kpi-trends` reads. **Open for the user (not silently decided here):** is `:KPIMeasurement` actually the intended source of truth, or should measurements come from the Postgres `kpi_measurements` table? If Postgres is authoritative, the fix is not in this spec — the V-02 split-brain must be resolved in `kpi-okr-governance` (either point `kpi-trends` at Postgres, or add a governed Postgres-backed latest-value read this spec can compose). This spec does **not** open a second, direct-Postgres read path (that would violate NFR-02 and fork the governed surface). **Flag to the orchestrator: confirm `:KPIMeasurement`-via-`kpi-trends` is acceptable, or escalate the V-02 resolution to `kpi-okr-governance`.** **(Resolves B-01, N-02.)** |
| 3 | **OQ-3 — is gap detection activity-only, or should a key activity be "measurable" only once its *stories* also carry KPI links?** FR-06 keys gaps off **activity→KPI** links (the "measurable key activity" unit XD-04 names); story links are a `should` rider (FR-07). | Changes which activities are flagged as gaps. | **Decided default: activity-only gaps (FR-06).** A key activity is measurable once it carries ≥1 activity→KPI link; story links enrich coverage (FR-07) but do not clear a gap. Alternative (story-inclusive gaps) is a one-line change to the gap predicate. Recommend confirming with the user. Not a blocker. |
| 4 | **Pre-existing `ALIGNED_TO` edges have no `direction`, and the base writer uses CREATE (second-writer MERGE interop). DECIDED for gap-clearing (DEC-03, resolves C-04); interop pinned in FR-01 (C-01).** `kpi-okr-governance`'s `kpi-alignments` creates `ALIGNED_TO` with `CREATE` and no `direction`; this spec MERGEs and adds `direction`. | (a) An undirected base-route link reads back as `direction:null`. (b) Two writers with divergent idempotency (CREATE vs MERGE) on one edge type. | **Gap-clearing decided (DEC-03, FR-06/NFR-03/AC-05, resolves C-04):** an undirected (`direction:null`) `ALIGNED_TO` edge is surfaced in the matrix but does **NOT** clear a measurability gap — only a `direction`-bearing link does, matching XD-04's directional-impact intent. The looser reading (any `ALIGNED_TO` clears the gap) is **OQ-4** below. **Interop pinned (C-01, FR-01):** this route's MERGE keys on `(kpi,activity)` identities only; if the base route left duplicates, MERGE binds one arbitrarily and never adds a new edge; this spec does not de-dupe the base route's edges. **Flag to the orchestrator:** confirm adding a second-writer MERGE on `kpi-okr-governance`'s `ALIGNED_TO` edge is acceptable to that spec's owner, and whether the two POST surfaces should ultimately converge (default: stay separate). |
| 4a | **OQ-4 — does an *undirected* pre-existing `ALIGNED_TO` clear a measurability gap? DECIDED (DEC-03: no).** Split out from Risk 4 per C-04 so the open axis is explicit. | Determines whether a key activity with only an undirected base-route alignment counts as "measurable." | **Decided default (DEC-03): NO** — an undirected link does not clear a gap; the feature exists to add the directional impact a bare alignment lacks (XD-04). **Alternative (looser):** count any `ALIGNED_TO` as coverage (a key activity is "measurable" with zero directional impact) — a one-line predicate change, but it undercuts the feature's purpose. Recommend confirming the stricter default with the user; flagged, not silently defaulted to the looser reading. |
| 5 | **Roll-up measurement-source coupling.** FR-08 reads `kpi-trends` server-side; if that route's payload shape changes (it is `kpi-okr-governance`-owned), this spec's roll-up breaks. Note the source is `:KPIMeasurement` (V-02/DEC-02), not Postgres — see OQ-2. | Cross-spec coupling on an internal read shape. | Roll-up depends only on `kpi-trends`'s **documented** latest-value contract (`kpi-okr-governance` FR-03); design pins the exact fields consumed and AC-06 asserts them against a seeded `:KPIMeasurement` fixture, so a governance-side shape change surfaces as a failing integration test, not a silent drift. Resilience (FR-09) degrades to `no_data` rather than 500. |
| 6 | **N-01 (design item) — link-storage + matrix-compute module home.** The link writes/reads + matrix/gap/roll-up composition need a home. Whether the pure matrix/gap math lives in a `derive/`-style sibling (like `api/src/derive/key-activity-score.ts`) or inline in a `storage/` module. | Cosmetic placement + testability. | Design confirms placement (recommend a pure `api/src/derive/kpi-impact-matrix.ts` for the Neo4j-free matrix/gap assembly so it is unit-testable against a fixture, mirroring `key-activity-optimizer` DD-01, and `api/src/storage/kpi-impact.ts` for the Neo4j reads + the `direction`-extended `ALIGNED_TO` writes + the server-side `kpi-trends` composition for the roll-up — note the roll-up reads measurements only via `kpi-trends`, not a direct store query, NFR-02). Not a requirements blocker. |

## Orchestrator decisions — confirmed by user 2026-07-04 (Phase C gate)

The two escalations flagged to the orchestrator are now **decided by the user**;
the spec's recorded defaults stand, no rework required:

- **OQ-1 → RESOLVED (confirm DEC-01).** The activity/story→KPI impact edge
  **extends the as-built `ALIGNED_TO` link** with `direction` (activity side) and
  adds the runtime-registry `IMPACTS_KPI` edge (story side). The literal
  `DRIVES_KPI` in the blueprint XD-04 sentence is **not** used (it is
  `KeyResult→KPI`). Blueprint XD-04 wording reconciled to match.
- **OQ-2 → RESOLVED (confirm DEC-02).** The roll-up's measurement source of truth
  is **Neo4j `:KPIMeasurement`** (what the governed `kpi-trends` route reads). The
  Postgres `kpi_measurements` split-brain (V-02) is **left as-is** — it is not
  this app's to fix, and no direct-Postgres read path is opened here. Blueprint
  feature-inventory + XD-04 wording reconciled to `:KPIMeasurement`.
- **OQ-3 / OQ-4** stay at their recorded stricter defaults (activity-only gaps;
  an undirected `ALIGNED_TO` does **not** clear a gap) — not re-opened at the gate.

The blocker that remains is a **build-time coordination item, not a spec change**:
the second-writer MERGE interop with `kpi-okr-governance`'s base `ALIGNED_TO`
writer (Risk 4 / C-01) must be confirmed with that spec's owner **when
`kpi-impact-mapping` is implemented** (implementation is deferred — plan halted at
the Phase C gate, user decision 2026-07-04).
