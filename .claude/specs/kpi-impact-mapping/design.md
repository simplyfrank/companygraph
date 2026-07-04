---
feature: "kpi-impact-mapping"
created: "2026-07-04"
author: "spec-author (blueprint: business-modeling-studio, XD-04)"
status: "draft"
revision: 1
reviewing_requirements_revision: "2 (review pass 2/2 — approve, 0 blockers; carry-forward C-05, C-06)"
size: "medium"
---

# Design: kpi-impact-mapping

> Traces the approved `requirements.md` rev 2: FR-01…FR-14, NFR-01…NFR-07,
> AC-01…AC-17. Every §-section names the FR/AC it serves; §7 is the file-change
> table (each row → an FR); §8 is the AC→test map. No requirement is invented
> here. The requirements review (pass 2, **approve**) left two carry-forward,
> design-phase concerns — **C-05** (pin how `latestValue` is extracted from the
> windowed, ASC-ordered `kpi-trends` payload) and **C-06** (assert
> `activity_not_found`/`story_not_found` reuse, no duplicate `ERROR_CODES`
> entry). Both are resolved in §2 and cited where acted on. The user-facing open
> questions the requirements flagged (OQ-1/DEC-01, OQ-2/DEC-02, OQ-3, OQ-4/DEC-03,
> the C-01 second-writer-MERGE flag) carry the **defaults the requirements
> recorded**; §2 restates each as a design decision the orchestrator may still
> surface, but none blocks this design.

## 1. Overview

`kpi-impact-mapping` is the **measure** stage of the Business Modeling Studio
pipeline (blueprint `author → graph → optimize → measure → systematize`,
milestone M3, wave 4). For a single `BusinessModel` it lets a Business Architect
attach **quantified, directional** KPI-impact links to that model's activities
and stories, computes an **activity × KPI coverage matrix** with
**measurability-gap detection**, and **rolls each linked KPI up** against its
latest real measurement read through `kpi-okr-governance`'s governed
`GET /api/v1/kpi-trends/:kpiId`. It ships the **KpiImpactMatrix** view at
`#/model/kpi-impact`.

It adds, in the dependency style established by `story-spec-core` and
`key-activity-optimizer`:

1. **A pure, Neo4j-free matrix/gap/roll-up assembler** —
   `api/src/derive/kpi-impact-matrix.ts` (DD-06, mirroring
   `key-activity-optimizer` DD-01's `derive/` sibling). It takes plain
   read-shapes (scoped activities + their impact links + the KPI catalog + the
   per-KPI latest-value results) and returns the matrix rows/columns/cells, the
   gaps array, and the roll-up rows — so the matrix math, gap predicate, and
   status derivation are unit-testable **with no Neo4j and no HTTP** (FR-05,
   FR-06, FR-07, FR-08).
2. **A model-scoped Neo4j read + link-write + roll-up-composition module** —
   `api/src/storage/kpi-impact.ts` — that (a) reads the model's scoped activities
   + stories consuming `scopedNodeIds(driver, modelId)` (never re-implemented),
   (b) writes/reads/deletes the two impact-link edges (activity side on the
   as-built `ALIGNED_TO`, story side on a new runtime-registry `IMPACTS_KPI`),
   and (c) composes the governed `kpi-trends` read once per linked KPI for the
   roll-up (never querying a measurement store directly, NFR-02).
3. **Six model-scoped REST routes** under `/api/v1/models/:modelId/kpi-impact*`
   following the `model-workspace-core`/`story-spec-core`/`key-activity-optimizer`
   convention (FR-01…FR-08), zod-validated at the boundary, in `openapi.json`
   (FR-10), RBAC-gated by two new permissions granted to `business_architect`
   (FR-11).
4. The **KpiImpactMatrix** view at `#/model/kpi-impact` (route verbatim from the
   blueprint View Tree) that **replaces** the `ModelTabPlaceholder`
   `model-workspace-core` registered for the `kpi-impact` tab, reads the active
   model from the shell-owned `useActiveModel()`, and specs all four view states
   + the coverage grid + a link editor (direction + weight) + a gaps strip + a
   per-KPI roll-up panel (FR-12, FR-13, FR-14).

The design follows the same rules as its dependencies:

- **No compile-time schema edit for the activity side, exactly one
  runtime-registry edge for the story side** — the activity link reuses the
  as-built `ALIGNED_TO` edge with a new `direction` **property** (a property add,
  not a new type); the story link introduces one runtime-registry edge type
  `IMPACTS_KPI` via `createEdgeType` (XD-01); `NODE_LABELS`/`EDGE_ENDPOINTS`
  consts are **not edited** (NFR-02, AC-15).
- **No new store; measurements read only through the governed `kpi-trends`
  route** — no direct query of the Postgres `kpi_measurements` table nor the
  Neo4j `:KPIMeasurement` nodes (NFR-02, DEC-02).
- **Consume `model-workspace-core` (never re-spec)**; **auth via the central gate
  only** (NFR-06).

### 1.1 Hard build-order dependency (requirements Dependencies note)

This spec is **wave 4**: it cannot start implementation until all three declared
dependencies merge — `story-spec-core` (`UserStory` runtime label + `UserStory.id`
join key + `DESCRIBES_ACTIVITY` edge), `key-activity-optimizer`
(`attributes.keyActivity` mark for gap detection), and `kpi-okr-governance`
(`GET /api/v1/kpis`, `GET /api/v1/kpi-trends/:kpiId`, the `ALIGNED_TO`/
`kpi-alignments` base contract, the shared `parseWith` ZodError→400 mapper). The
transitive foundation `model-workspace-core` (`scopedNodeIds`,
`business_architect` role, active-model context, the `kpi-impact`
`ModelTabPlaceholder` slot) must also be present. `scopedNodeIds` is **verified
present on disk today** (`api/src/storage/model-scope.ts:22`); the others are
new files owned upstream that may not exist at authoring time. This design
references its **documented upstream interfaces** by signature (§3.1);
implementation binds to the real files once they land.

## 2. Design decisions & prior-review carry-forwards

The requirements review (pass 2, **approve**, 0 blockers) left two design-phase
concerns (C-05, C-06). This table records their resolution plus the design-level
decisions, and restates the requirements' user-facing OQ/DEC defaults as design
decisions the orchestrator may still surface.

| ID | Decision | Resolves | Where |
|----|----------|----------|-------|
| DD-01 | **Activity link = the as-built `ALIGNED_TO` edge + a new `direction` property (requirements DEC-01/OQ-1).** The activity→KPI impact link reuses `kpi-okr-governance`'s governed weighted `(:KPI)-[:ALIGNED_TO {weight, attribution_type, alignment_notes, created_at}]->(:Activity)` edge (verified `api/src/routes/kpi-sla-alignment.ts:53`), **extended with `direction ∈ {increases,decreases}`** — *not* the literal `DRIVES_KPI` edge XD-04 names (verified `KeyResult→KPI`, `edges.ts`). This honours XD-04's *intent* over its literal edge name. **Orchestrator may still surface OQ-1.** | OQ-1/DEC-01 | §3.2, §4.2 |
| DD-02 | **Story link = a new runtime-registry `IMPACTS_KPI` edge implementing `userStoryKPI` + `direction`/`weight` (requirements DEC-01, XD-01).** `userStoryKPISchema` exists (`kpi-sla.ts:105`) but has **no as-built route** (verified). This spec registers `IMPACTS_KPI` (`UserStory → KPI`) via `createEdgeType` (`api/src/ontology/storage/edge-types.ts:209`) — **not** a compile-time `EDGE_ENDPOINTS` addition — carrying `direction`, `weight`, optional `notes`, `created_at`. The `user_story_id` joins on `story-spec-core`'s `UserStory.id` (the join-key boundary note); no parallel story identity is invented. | XD-01, DEC-01 | §3.3, §4.3, §4.9 |
| DD-03 | **Roll-up reads the governed `kpi-trends` route only; source of truth is `:KPIMeasurement` (requirements DEC-02/OQ-2, V-02).** The roll-up composes `GET /api/v1/kpi-trends/:kpiId` server-side, once per linked KPI, and never queries a measurement store directly (NFR-02). Because `kpi-trends` reads Neo4j `:KPIMeasurement` (verified `kpi-trends.ts:50`, disjoint from the Postgres `kpi_measurements` table `POST /kpi-measurements` writes — the V-02 split-brain), the roll-up reflects `:KPIMeasurement`. **OQ-2 (is `:KPIMeasurement` the intended source of truth, or must the roll-up reflect Postgres?) needs a real user decision — surfaced, not silently defaulted.** If Postgres is authoritative, the fix is a V-02 resolution in `kpi-okr-governance`, out of this spec's scope; this spec opens no direct-Postgres read. | OQ-2/DEC-02 | §3.4, §4.5, §4.6 |
| DD-04 | **`latestValue` = the *last* element of `kpi-trends`'s ASC-ordered, windowed `measurements` array (resolves review C-05).** `kpi-trends` returns `measurements` ordered `measured_at ASC` filtered to a default 30-day window (verified `kpi-trends.ts:53` `ORDER BY m.measured_at ASC`, `:51` `WHERE m.measured_at >= $windowStart`). Therefore "most-recent" is `measurements[measurements.length - 1]`, **not** `measurements[0]` (a naive `[0]` read would take the *oldest*). A KPI whose measurements all predate the window returns an **empty** array → `status:"no_data"`. This spec calls `kpi-trends` with **no window override** (accepts its 30-day default) so "latest" is bounded by that window; the roll-up assembler reads the max-`measured_at` element and treats an empty array as `no_data` (§4.6). AC-06 asserts the correct (last-element) `latestValue`, so a wrong access fails the test. | C-05 | §4.6 |
| DD-05 | **Error-code reuse is explicit — no duplicate `ERROR_CODES` entry (resolves review C-06).** Verified today: **none** of `kpi_not_found`, `impact_link_not_found`, `activity_not_found`, `story_not_found` are in `api/src/errors.ts`. Upstream deps register two of them before this wave-4 spec lands — `key-activity-optimizer` design §3.4 adds `activity_not_found`; `story-spec-core` design adds `story_not_found` (reserved-but-thrown check: `story-spec-core` DD-04 reserves `story_duplicate_for_activity` unthrown, but `story_not_found` **is** thrown from its story routes). This spec therefore adds **only `kpi_not_found` + `impact_link_not_found`** to `ERROR_CODES` and **reuses** `activity_not_found`/`story_not_found` by referencing the existing enum member (no re-declaration). The design-time contract (§3.6): the `errors.ts` edit is guarded to add a code **iff absent**, so if a dep changed and left one unregistered, this spec's tasks add it; but the expectation (all deps merged) is reuse. Every added code is reachable from ≥1 route (§4.4/§4.7) so `envelope.test.ts`'s reachability + closed-enum assertions hold. | C-06 | §3.6, §7 |
| DD-06 | **Module split: pure `derive/` assembler + Neo4j `storage/` module (requirements N-01/Risk 6).** The Neo4j-free matrix/gap/roll-up math lives at `api/src/derive/kpi-impact-matrix.ts` (mirrors `key-activity-optimizer` DD-01). The Neo4j reads + the `direction`-extended `ALIGNED_TO`/`IMPACTS_KPI` writes + the server-side `kpi-trends` composition live at `api/src/storage/kpi-impact.ts`. This keeps the assembler unit-testable against fixtures (AC-04/05/06/16 pure cases) with no Neo4j. | Risk 6 (N-01) | §4.1 |
| DD-07 | **Directional-only gap-clearing (requirements DEC-03/OQ-4).** A measurability gap is cleared **only** by an activity→KPI `ALIGNED_TO` edge with a **non-null `direction`**. A pre-existing base-route (`kpi-alignments`) `ALIGNED_TO` with `direction:null` is surfaced in the matrix as an undirected cell but does **not** clear the gap. This matches XD-04's directional-impact intent. **Orchestrator may still surface OQ-4** (the looser reading — any `ALIGNED_TO` clears the gap — is a one-line predicate change in the assembler, §4.4). | OQ-4/DEC-03 | §4.4 |
| DD-08 | **Second-writer MERGE-on-pair interop with the base `kpi-alignments` CREATE (requirements C-01/Risk 4).** The base `POST /api/v1/kpi-alignments` uses `CREATE` (verified `kpi-sla-alignment.ts:53`) and can leave duplicate `ALIGNED_TO` edges on one `(kpi,activity)` pair. This route MERGEs on the two node identities only — `MERGE (k:KPI {id})-[r:ALIGNED_TO]->(a:Activity {id})` then `SET r.direction/r.weight/…` — so it never adds a second edge for a pair it has seen; when >1 pre-existing edge matches, MERGE binds one arbitrarily and updates it, **not** de-duplicating the others (out of scope — that is `kpi-okr-governance`'s edge). **Flag to the orchestrator:** confirm a second writer with MERGE idempotency on `kpi-okr-governance`'s `ALIGNED_TO` is acceptable to that owner; whether the two POST surfaces converge is deferred (default: stay separate). | C-01/Risk 4 | §4.2 |
| DD-09 | **Activity-only gap detection (requirements DEC/OQ-3).** A key activity is measurable once it carries ≥1 **directional** activity→KPI link (FR-06); story links (FR-07) are a `should` coverage-volume rider and do **not** clear a gap. The "measurable key activity" unit XD-04 names is the activity. **Orchestrator may still surface OQ-3** (story-inclusive gaps are a one-line predicate change). | OQ-3 | §4.4 |
| DD-10 | **Key-activity predicate = *presence* of the `attributes.keyActivity` key, never a `.marked === true` comparison (requirements C-02).** Per `key-activity-optimizer` FR-07/FR-08 the `keyActivity` key exists **iff** the activity is currently marked and is **deleted** on unmark — there is no `marked:false` on disk. The matrix/gap code reads `("keyActivity" in attributes)`, not `attributes.keyActivity?.marked === true`; a design/impl author must **not** add a phantom `marked:false` branch. (A malformed foreign `keyActivity` value is treated as present-and-key for the *mark* boolean — the presence of the key is the sole signal, consistent with `key-activity-optimizer`'s write contract; gap-clearing still requires a directional link, DD-07.) | C-02 | §4.4 |
| DD-11 | **`linkId` = Neo4j `elementId(r)`, opaque string, no UUID guard (mirrors as-built alignment id convention).** Activity-link ids are `elementId` of the `ALIGNED_TO` edge; story-link ids are `elementId` of the `IMPACTS_KPI` edge. DELETE matches **only** its own edge type (activity DELETE matches `ALIGNED_TO`, story DELETE matches `IMPACTS_KPI`), so a mis-routed id → `404 impact_link_not_found`, never a cross-type delete (AC-03/N-01). No `parseId`/UUID guard on the `:linkId` param (the as-built `kpi-sla-alignment.ts` DELETE keeps it an opaque string). | N-01 | §4.3 |
| DD-12 | **PWA calls a new exported `api.kpiImpact.*` block, never the private `json<T>` helper.** `json<T>` at `pwa/src/api.ts:40` is private (verified). KpiImpactMatrix uses a new `api.kpiImpact.{matrix,rollup,listActivityLinks,listStoryLinks,createActivityLink,createStoryLink,deleteActivityLink,deleteStoryLink}` block added to the exported `api` object (§4.11). It reuses `kpi-okr-governance`'s `api.kpi.list()` (`GET /api/v1/kpis`) for the link-editor KPI picker — not re-implemented. | — | §4.11 |
| DD-13 | **No `?model=` query param — model identified by the `:modelId` path segment (consistency with `model-workspace-core` D-1 / `story-spec-core` DD-06 / `key-activity-optimizer` DD-08).** All link writes/reads + matrix + roll-up scope by the `:modelId` path param; isolation is proven by the `scopedNodeIds` join (§4.2) + the two-model integration test (AC-07). | — | §4, §5 |

## 3. Data model

**No new label, no new store, no compile-time edge/label edit** (NFR-02, XD-01,
XD-02). The activity link rides the existing `ALIGNED_TO` edge (a `direction`
**property** add); the story link introduces one **runtime-registry** edge type
`IMPACTS_KPI`. `NODE_LABELS` (`shared/src/schema/nodes.ts`) and the frozen
`EDGE_ENDPOINTS` const (`shared/src/schema/edges.ts`) are **not edited** (AC-15).
REST-boundary + response zod schemas live in a new
`shared/src/schema/kpi-impact.ts` (activity/story link request + link-row +
matrix + roll-up shapes); the existing `kpi-sla.ts` schemas
(`kpiSchema`, `userStoryKPISchema`, `kpiAlignmentSchema`) are **consumed**, not
edited.

### 3.1 Consumed upstream interfaces (cited, not re-specced)

| Interface | Source (approved) | Signature used |
|-----------|-------------------|----------------|
| `scopedNodeIds` | `model-workspace-core` design §4.2 (FR-18); **verified on disk** `api/src/storage/model-scope.ts:22` | `scopedNodeIds(driver: Driver, modelId: string): Promise<Set<string>>` — structural ids only (Domain/journey/activity/instance); excludes shared System/Role/Location/KPI |
| `scopedWhereFragment` | same file `:54` | `(alias, scope) → { fragment, params }` — WHERE-fragment builder used to bound activity/story reads |
| `business_architect` role | `model-workspace-core` FR-11 (`api/src/scripts/seed-rbac-roles.ts`) | idempotent `MERGE (r:RBACRole {name})`; this spec appends `kpi_impact:read`/`kpi_impact:write` to its set |
| `ModelTabPlaceholder` + `kpi-impact` slot | `model-workspace-core` FR-17 (`pwa/src/views/index.tsx` model-surface dispatch) | this spec swaps the `kpi-impact` dispatch target to `KpiImpactMatrix` |
| `useActiveModel()` | `model-workspace-core` FR-15 (`pwa/src/context/ActiveModelContext.tsx`) | `{ activeModel: { id; name } \| null }`; consumed, not re-implemented |
| `createEdgeType` | `api/src/ontology/storage/edge-types.ts:209` | `createEdgeType(driver, {name, description, usage_example, endpoints:[{fromLabel,toLabel}], external_alignment?}, actor)` — registers `IMPACTS_KPI` (§4.9) |
| `UserStory` label + `DESCRIBES_ACTIVITY` edge | `story-spec-core` FR-01/FR-03 | `UserStory.id` (UUIDv7) is the join key; a story is in model A iff its `DESCRIBES_ACTIVITY` `Activity` ∈ `scopedNodeIds` (NFR-02) |
| `attributes.keyActivity` mark | `key-activity-optimizer` FR-07/FR-08 | presence of the key ⇔ marked (DD-10); read from the activity's `attributes_json`, never written here |
| `ALIGNED_TO` base contract | `kpi-okr-governance` FR-04 (`api/src/routes/kpi-sla-alignment.ts`) | `(:KPI)-[:ALIGNED_TO {weight, attribution_type, alignment_notes, created_at}]->(:Activity)`, `elementId(r)` ids, `weight∈[0,1]`; extended with `direction` (DD-01) |
| `GET /api/v1/kpi-trends/:kpiId` | `kpi-okr-governance` FR-03 (`api/src/routes/kpi-trends.ts`) | payload `{kpi_id, window_days, measurements:[{id,measured_at,value}] ASC, trend, moving_average, anomalies}` — roll-up source (DD-03/DD-04) |
| `GET /api/v1/kpis` | `kpi-okr-governance` FR-10a (`api/src/routes/kpi-crud.ts`) | `{rows:[flat KPI props]}` — KPI catalog for the link editor + matrix columns |
| `parseWith` ZodError→400 mapper | `kpi-okr-governance` FR-11b (`api/src/routes/_helpers.ts:84`) | `parseWith(schema, input)` — throws `ValidationError`→400 via shared channel (no per-route 500) |
| generic node primitives | `api/src/storage/nodes.ts` (graph-core) | **not edited**; impact links are bespoke Cypher (§4.2/§4.3) |

### 3.2 Activity-impact link — `ALIGNED_TO` + `direction` (FR-01, FR-04, DD-01)

The as-built edge, **extended** (property add only, NFR-03):

```
(:KPI)-[:ALIGNED_TO {
   weight,            // number [0,1]        — as-built (kept)
   attribution_type,  // "direct"|"indirect"|"leading"|"lagging" — as-built (kept)
   alignment_notes,   // string|null         — as-built (kept, mapped from `notes`)
   created_at,        // ISO 8601 string     — as-built (kept)
   direction          // "increases"|"decreases"  — NEW (this spec)
}]->(:Activity)
```

Edge **direction on the graph is `(:KPI)->(:Activity)`** — identical to the
as-built writer (verified `kpi-sla-alignment.ts:53`). `direction` here is the
**impact-semantics property** (does the activity *increase* or *decrease* the
KPI), not the graph edge orientation. Persisted property names stay snake_case
(`created_at`, `attribution_type`) per NFR-03 / `kpi-okr-governance` NFR-04. An
existing base-route edge with no `direction` property reads back as
`direction:null` (surfaced but does not clear a gap, DD-07).

`zod` (`shared/src/schema/kpi-impact.ts`):

```ts
export const impactDirectionSchema = z.enum(["increases", "decreases"]);

// POST body — activity link (FR-01, FR-04)
export const activityLinkCreateSchema = z.object({
  activityId: z.string().min(1),
  kpiId: z.string().min(1),
  direction: impactDirectionSchema,
  weight: z.number().min(0).max(1),                 // the single sanctioned tightening (NFR-03)
  attributionType: z.enum(["direct", "indirect", "leading", "lagging"]).optional(),
  notes: z.string().max(500).optional(),
});

// Link row (list + create response) — activity + story share this shape modulo source (FR-03)
export const impactLinkRowSchema = z.object({
  linkId: z.string(),                               // elementId(r) (DD-11)
  sourceId: z.string(),                             // activityId or storyId
  sourceName: z.string().nullable(),
  kpiId: z.string(),
  kpiName: z.string().nullable(),
  direction: impactDirectionSchema.nullable(),      // null for a pre-existing undirected base-route ALIGNED_TO (NFR-03)
  weight: z.number().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().nullable(),
});
```

### 3.3 Story-impact link — `IMPACTS_KPI` (FR-02, DD-02) implements `userStoryKPI`

New runtime-registry edge (registered via `createEdgeType`, §4.9):

```
(:UserStory)-[:IMPACTS_KPI {
   direction,   // "increases"|"decreases"
   weight,      // number [0,1]
   notes,       // string|null   (implements userStoryKPI.impact_description)
   created_at   // ISO 8601 string
}]->(:KPI)
```

`user_story_id` **joins on `story-spec-core`'s `UserStory.id`** (DD-02). zod:

```ts
export const storyLinkCreateSchema = z.object({
  storyId: z.string().min(1),
  kpiId: z.string().min(1),
  direction: impactDirectionSchema,
  weight: z.number().min(0).max(1),
  notes: z.string().max(500).optional(),
});
```

### 3.4 Matrix + roll-up response shapes (FR-05, FR-06, FR-07, FR-08)

```ts
// shared/src/schema/kpi-impact.ts
export const matrixCellSchema = z.object({
  direction: impactDirectionSchema.nullable(),      // null = unlinked OR undirected base-route link
  weight: z.number().nullable(),
}).nullable();                                       // null = no ALIGNED_TO edge at all for the pair

export const matrixActivityRowSchema = z.object({
  activityId: z.string(),
  activityName: z.string(),
  journeyName: z.string().nullable(),
  isKeyActivity: z.boolean(),                        // presence of attributes.keyActivity (DD-10)
  storyLinkCount: z.number().int(),                 // distinct (story,kpi) IMPACTS_KPI edges (FR-07, DD-09)
  cells: z.record(z.string(), matrixCellSchema),    // keyed by kpiId
});

export const matrixKpiColumnSchema = z.object({
  kpiId: z.string(),
  kpiName: z.string(),
  unit: z.string().nullable(),
  targetDirection: z.enum(["higher_is_better", "lower_is_better", "target_is_exact"]).nullable(),
});

export const gapSchema = z.object({
  activityId: z.string(),
  activityName: z.string(),
  journeyName: z.string().nullable(),
  reason: z.literal("key_activity_no_kpi"),
});

export const kpiImpactMatrixSchema = z.object({
  rows: z.array(matrixActivityRowSchema),
  columns: z.array(matrixKpiColumnSchema),
  gaps: z.array(gapSchema),
  meta: z.object({
    activityCount: z.number().int(),
    kpiCount: z.number().int(),
    linkedCellCount: z.number().int(),
    keyActivityCount: z.number().int(),
    gapCount: z.number().int(),                     // === gaps.length (FR-06)
  }),
});

// Roll-up (FR-08)
export const rollupRowSchema = z.object({
  kpiId: z.string(),
  kpiName: z.string(),
  unit: z.string().nullable(),
  targetValue: z.number().nullable(),
  targetDirection: z.enum(["higher_is_better", "lower_is_better", "target_is_exact"]).nullable(),
  latestValue: z.number().nullable(),               // max-measured_at element of kpi-trends payload (DD-04)
  status: z.enum(["on_track", "warning", "critical", "no_data"]),
  impactLinkCount: z.number().int(),                // scoped links pointing at this KPI (activity + story)
  aggregateImpactWeight: z.number(),                // Σ weights, capped 1.0 (FR-08)
});

export const kpiImpactRollupSchema = z.object({
  rows: z.array(rollupRowSchema),
  meta: z.object({
    kpiCount: z.number().int(),
    measurementsAvailable: z.boolean(),             // false when kpi-trends unreachable (FR-09)
  }),
});
```

### 3.5 KPI status derivation (FR-08, NFR-04) — pure

Given a KPI's `latestValue` (or `null`), `target_value`, `target_direction`,
`warning_threshold?`, `critical_threshold?` (the `kpiSchema` fields), the
assembler computes `status` deterministically:

- `latestValue === null` → `"no_data"` (never a crash — FR-08/FR-09).
- `higher_is_better`: `latestValue < critical_threshold` → `critical`;
  `< warning_threshold` → `warning`; else `on_track`.
- `lower_is_better`: `latestValue > critical_threshold` → `critical`;
  `> warning_threshold` → `warning`; else `on_track`.
- `target_is_exact`: `|latestValue − target_value|` compared against the
  thresholds interpreted as tolerance bands; outside `critical` band → `critical`,
  outside `warning` band → `warning`, else `on_track`.
- When a threshold is absent (`kpiSchema` marks both optional), that band is
  skipped: with no thresholds a KPI with data is `on_track` (a documented,
  deterministic fallback — NFR-04). Same graph + same `kpi-trends` responses →
  same status (NFR-04).

### 3.6 Error codes (FR-10, DD-05) — additive + reuse

| Code | HTTP | Status vs enum | Thrown from |
|------|------|----------------|-------------|
| `kpi_not_found` | 404 | **new** (add iff absent) | link POSTs when `kpiId` is unknown/archived; roll-up never throws it (degrades) |
| `impact_link_not_found` | 404 | **new** (add iff absent) | link DELETEs when `:linkId` matches no edge of that type (incl. mis-routed cross-type id, AC-03) |
| `activity_not_found` | 404 | **reuse** (`key-activity-optimizer` §3.4) | activity-link POST when `activityId` ∉ scoped Activities |
| `story_not_found` | 404 | **reuse** (`story-spec-core`) | story-link POST when `storyId` ∉ scoped Stories |
| `model_not_found` | 404 | **reuse** (`errors.ts:36`, verified present) | any `/models/:modelId/...` when the model does not exist |

Only **two** codes are added (`kpi_not_found`, `impact_link_not_found`). The edit
to `api/src/errors.ts` adds a code **iff absent** (DD-05/C-06) — the expectation
is that all deps have merged and `activity_not_found`/`story_not_found` are
already present, so this spec re-references them without duplication. Every added
code is reachable from ≥1 route (§4.4/§4.7), so `envelope.test.ts`'s reachability
and closed-enum exhaustiveness assertions both hold.

## 4. Core logic

### 4.1 Module split (DD-06)

| Module | Kind | Responsibility |
|--------|------|----------------|
| `api/src/derive/kpi-impact-matrix.ts` | pure, no Neo4j / no HTTP | `assembleMatrix(input)` (rows/columns/cells/gaps/meta, FR-05/06/07), `assembleRollup(input)` (per-KPI status via §3.5, FR-08). Unit-tested against fixtures (AC-04/05/06/16 pure cases). |
| `api/src/storage/kpi-impact.ts` | Neo4j + governed-route composition | `createActivityLink`/`createStoryLink`/`listActivityLinks`/`listStoryLinks`/`deleteActivityLink`/`deleteStoryLink` (§4.2/§4.3), `readMatrixInputs(driver, modelId)` (§4.4 — consumes `scopedNodeIds`), `readRollupInputs(driver, modelId, fetchTrends)` (§4.5/§4.6 — composes `kpi-trends`). |
| `api/src/routes/kpi-impact.ts` | route | 6 handlers, zod boundary, `{error}` envelope. |

The pure assembler's input shapes (Neo4j-free, HTTP-free):

```ts
// api/src/derive/kpi-impact-matrix.ts
export interface MatrixActivity {
  id: string; name: string; journeyName: string | null;
  isKeyActivity: boolean;              // presence of attributes.keyActivity (DD-10)
  storyLinkCount: number;              // distinct (story,kpi) IMPACTS_KPI edges (FR-07)
}
export interface MatrixLink { activityId: string; kpiId: string; direction: "increases" | "decreases" | null; weight: number | null; }
export interface MatrixKpi { id: string; name: string; unit: string | null; targetDirection: string | null; }
export interface MatrixInput { activities: MatrixActivity[]; links: MatrixLink[]; kpis: MatrixKpi[]; }
export function assembleMatrix(input: MatrixInput): KpiImpactMatrix;

export interface RollupLink { kpiId: string; weight: number | null; }         // activity + story links merged
export interface RollupKpi { id: string; name: string; unit: string | null;
  targetValue: number | null; targetDirection: string | null;
  warningThreshold: number | null; criticalThreshold: number | null;
  latestValue: number | null; }       // resolved from kpi-trends by storage (DD-04); null when no measurements
export interface RollupInput { kpis: RollupKpi[]; links: RollupLink[]; measurementsAvailable: boolean; }
export function assembleRollup(input: RollupInput): KpiImpactRollup;
```

### 4.2 Activity-link write — MERGE-on-pair `ALIGNED_TO` + `direction` (FR-01, FR-04, DD-01, DD-08)

`createActivityLink(driver, modelId, body)` in `api/src/storage/kpi-impact.ts`:

1. **Model-scope + existence checks.** `const scoped = await scopedNodeIds(driver, modelId)`.
   If `body.activityId ∉ scoped` **or** the node is not `:Activity` → `404 activity_not_found`.
   Verify `body.kpiId` is a non-archived `KPI` (`MATCH (k:KPI {id}) WHERE k.archived_at IS NULL`)
   → miss → `404 kpi_not_found` (mirrors the as-built KPI check, `kpi-sla-alignment.ts:34`).
2. **MERGE-on-pair, keyed on node identities only** (DD-08 — never adds a second
   edge for a seen pair; binds one arbitrarily if the base route left duplicates):

```cypher
MATCH (k:KPI {id:$kpiId}), (a:Activity {id:$activityId})
MERGE (k)-[r:ALIGNED_TO]->(a)
ON CREATE SET r.created_at = $now, r.weight = $weight,
              r.attribution_type = $attributionType, r.alignment_notes = $notes,
              r.direction = $direction
ON MATCH  SET r.weight = $weight, r.direction = $direction,
              r.attribution_type = coalesce($attributionType, r.attribution_type),
              r.alignment_notes = coalesce($notes, r.alignment_notes)
RETURN elementId(r) AS linkId, r.weight AS weight, r.direction AS direction,
       r.alignment_notes AS notes, r.created_at AS createdAt,
       a.id AS sourceId, a.name AS sourceName, k.id AS kpiId, k.name AS kpiName
```

   `attributionType` defaults to `"direct"` on create when omitted (as-built
   enum). Re-linking the same `(activity,kpi)` pair updates `direction`/`weight`
   in place (idempotent MERGE-on-pair, AC-01). Returns `201` + an
   `impactLinkRowSchema` row.

> **NFR-03 tightening scope.** The **only** tightening beyond the as-built
> `ALIGNED_TO`/`kpi-alignments` contract is (a) the new `direction` property and
> (b) the `weight∈[0,1]` zod bound (already bounded on `kpi-alignments`). No
> as-built field is renamed; snake_case persisted names are kept (§3.2). The
> second-writer-MERGE interop is DD-08.

### 4.3 Story-link write + list/delete (FR-02, FR-03, DD-02, DD-11)

`createStoryLink(driver, modelId, body)`:

1. **Model-scope check through the story's activity** (`story-spec-core` NFR-02):
   the story is in-model iff its `DESCRIBES_ACTIVITY` `Activity` ∈
   `scopedNodeIds` — one read `MATCH (s:UserStory {id:$storyId})-[:DESCRIBES_ACTIVITY]->(a:Activity) WHERE a.id IN $scopedIds`.
   Miss → `404 story_not_found`. Verify `kpiId` → `404 kpi_not_found`.
2. **MERGE-on-pair** on the runtime-registry `IMPACTS_KPI` edge:

```cypher
MATCH (s:UserStory {id:$storyId}), (k:KPI {id:$kpiId})
MERGE (s)-[r:IMPACTS_KPI]->(k)
ON CREATE SET r.created_at = $now, r.weight = $weight, r.direction = $direction, r.notes = $notes
ON MATCH  SET r.weight = $weight, r.direction = $direction, r.notes = coalesce($notes, r.notes)
RETURN elementId(r) AS linkId, r.weight AS weight, r.direction AS direction,
       r.notes AS notes, r.created_at AS createdAt,
       s.id AS sourceId, s.title AS sourceName, k.id AS kpiId, k.name AS kpiName
```

   `201` + row. (`s.title` is `story-spec-core`'s story name field; if the
   as-built story uses `name`, the impl binds to that verified field at merge
   time — the design pins "the story's display name" and AC-02 asserts a
   populated `sourceName`.)

**List** (FR-03): `listActivityLinks(driver, modelId, filters)` /
`listStoryLinks(...)` read the model's links, optionally filtered by
`?activityId=`/`?storyId=`/`?kpiId=`, returning `impactLinkRowSchema` rows. Both
bound the source node to `scopedNodeIds` (NFR-01).

**Delete** (FR-03, DD-11): each DELETE matches **only its own edge type** —

```cypher
// deleteActivityLink
MATCH (k:KPI)-[r:ALIGNED_TO]->(a:Activity) WHERE elementId(r) = $linkId
DELETE r RETURN count(r) AS deleted
// deleteStoryLink
MATCH (s:UserStory)-[r:IMPACTS_KPI]->(k:KPI) WHERE elementId(r) = $linkId
DELETE r RETURN count(r) AS deleted
```

`deleted === 0` → `404 impact_link_not_found`. A **story** link's `elementId`
passed to the activity DELETE matches no `ALIGNED_TO` → `404` (never a cross-type
delete or silent no-op — AC-03/N-01). Second delete of the same id → `404`
(idempotent-as-404, matching the as-built alignment DELETE).

### 4.4 Matrix + gap assembly (FR-05, FR-06, FR-07, DD-07, DD-09, DD-10)

`readMatrixInputs(driver, modelId)`:

1. `const scoped = await scopedNodeIds(driver, modelId)`. Unknown model →
   `scopedNodeIds` returns ∅; the handler maps ∅ **and** a missing
   `MATCH (m:BusinessModel {id})` to `model_not_found` (a distinct pre-check read,
   so an unknown model is a 404, not an empty matrix). A valid model with 0
   scoped activities returns an empty-but-valid matrix (empty state, AC-10).
2. **Scoped activities + journey + key-activity mark + story-link count**:

```cypher
MATCH (a:Activity) WHERE a.id IN $scopedIds
OPTIONAL MATCH (a)-[:PART_OF]->(j:UserJourney)
OPTIONAL MATCH (s:UserStory)-[:DESCRIBES_ACTIVITY]->(a)
OPTIONAL MATCH (s)-[sk:IMPACTS_KPI]->(:KPI)
RETURN a.id AS id, a.name AS name, a.attributes_json AS attributesJson,
       j.name AS journeyName,
       count(DISTINCT sk) AS storyLinkCount            // distinct (story,kpi) edges (FR-07, DD-09)
```

   `isKeyActivity = ("keyActivity" in JSON.parse(attributesJson ?? "{}"))` — the
   **presence** predicate (DD-10), never a `.marked === true` comparison.
   `storyLinkCount` counts distinct `IMPACTS_KPI` edges reachable from the
   activity's stories (two stories → same KPI counts as 2 — AC-16).
3. **Activity→KPI links** (both directed and undirected base-route edges):

```cypher
MATCH (k:KPI)-[r:ALIGNED_TO]->(a:Activity) WHERE a.id IN $scopedIds
RETURN a.id AS activityId, k.id AS kpiId, k.name AS kpiName, k.unit AS unit,
       k.target_direction AS targetDirection,
       r.direction AS direction, r.weight AS weight
```

   (`r.direction` is `null` for a pre-existing base-route edge — surfaced as an
   undirected cell, DD-07.)

`assembleMatrix(input)` (pure, §4.1):

- **columns** = distinct KPIs any scoped activity links to (FR-05); a KPI
  impacted only by a model-B activity never appears (NFR-01, AC-04).
- **cells** = per `(activity,kpi)`: `{direction, weight}` if an `ALIGNED_TO`
  exists, else `null`.
- **gaps** (FR-06, DD-07/DD-09/DD-10): every activity with `isKeyActivity === true`
  that has **zero activity→KPI links with a non-null `direction`** →
  `{activityId, activityName, journeyName, reason:"key_activity_no_kpi"}`. A key
  activity whose only link is an undirected (`direction:null`) base-route
  `ALIGNED_TO` **stays** a gap (DD-07). A non-key activity with zero links is
  **not** a gap (merely uncovered). `meta.gapCount === gaps.length`.
- **meta**: `{activityCount, kpiCount, linkedCellCount, keyActivityCount, gapCount}`.

### 4.5 Roll-up read + composition (FR-08, FR-09, DD-03)

`readRollupInputs(driver, modelId, fetchTrends)`:

1. Resolve the set of KPIs any scoped activity **or** story impacts (union of
   `ALIGNED_TO` from scoped activities + `IMPACTS_KPI` from scoped stories) and
   their scoped link weights (for `impactLinkCount` + `aggregateImpactWeight`).
2. Read each such KPI's catalog fields (`target_value`, `target_direction`,
   `warning_threshold`, `critical_threshold`, `unit`, `name`) from the `KPI` node.
3. For **each** linked KPI, call `fetchTrends(kpiId)` — a server-side call to
   `GET /api/v1/kpi-trends/:kpiId` (§4.6). Extract `latestValue` per DD-04.
4. If **any** `fetchTrends` call fails (route unreachable / errors), set
   `measurementsAvailable = false` and force every KPI's `latestValue = null`
   (→ all `no_data`) — the endpoint returns `200` with the degraded roll-up,
   **never 500** (FR-09, NFR-04). Otherwise `measurementsAvailable = true`.
5. `assembleRollup(input)` (pure, §3.5) computes per-KPI `status` +
   `aggregateImpactWeight = min(1.0, Σ weights)` + `impactLinkCount`.

The endpoint is **read-only** — no measurement/KPI/SLA writes (FR-09, NFR-02).

### 4.6 Server-side `kpi-trends` composition + `latestValue` extraction (DD-03, DD-04, C-05)

`fetchTrends(kpiId)` is a **server-side, in-process** composition of the governed
route — not a network round-trip and not a direct store query. The storage module
imports the governed handler `handleKpiTrendsGet(req, kpiId)`
(`api/src/routes/kpi-trends.ts`) and invokes it with a synthesized `Request` for
`/api/v1/kpi-trends/:kpiId` (no window override → its 30-day default, DD-04),
parses the JSON body, and reads `payload.measurements`:

- `measurements` is **ASC-ordered by `measured_at`** and **windowed** (verified
  `kpi-trends.ts:51-53`). `latestValue` = `measurements.at(-1)?.value ?? null`
  — the **last** (max-`measured_at`) element, **not** `measurements[0]` (that is
  the *oldest*). This is the C-05 fix pinned.
- Empty `measurements` (KPI has none, or all predate the 30-day window) →
  `latestValue = null` → `status:"no_data"` (never a crash — FR-08).
- A `404`/error from the governed handler for one KPI is treated as that KPI
  having no data (`latestValue = null`); a wholesale failure (e.g. Neo4j
  unreachable, the handler throwing) trips `measurementsAvailable = false` (§4.5
  step 4, FR-09).

> **Coupling note (requirements Risk 5).** The roll-up depends only on
> `kpi-trends`'s documented latest-value contract (`kpi-okr-governance` FR-03).
> The exact fields consumed are pinned here (`payload.measurements[].value` +
> `.measured_at`); AC-06 asserts them against a seeded `:KPIMeasurement` fixture,
> so a governance-side shape change surfaces as a failing integration test, not a
> silent drift.

### 4.7 Route handlers + dispatch (FR-01…FR-08, FR-10)

`api/src/routes/kpi-impact.ts` — handlers returning the
`{error:{code,message,details?}}` envelope via `_helpers.ts`
(`ok`/`noContent`/`error`/`parseWith`/`readJson`, verified exports):

| Handler | Method + route | Returns |
|---------|----------------|---------|
| `handleActivityLinkCreate` | `POST /models/:modelId/kpi-impact/activity-links` | `201 impactLinkRowSchema`; `404 activity_not_found`/`kpi_not_found`; bad direction/weight → `400` |
| `handleStoryLinkCreate` | `POST /models/:modelId/kpi-impact/story-links` | `201 impactLinkRowSchema`; `404 story_not_found`/`kpi_not_found`; `400` |
| `handleActivityLinksList` | `GET /models/:modelId/kpi-impact/activity-links` | `200 {rows}`; `?activityId=`/`?kpiId=` filters |
| `handleStoryLinksList` | `GET /models/:modelId/kpi-impact/story-links` | `200 {rows}`; `?storyId=`/`?kpiId=` filters |
| `handleActivityLinkDelete` | `DELETE /models/:modelId/kpi-impact/activity-links/:linkId` | `204`; `404 impact_link_not_found` (incl. mis-routed story id) |
| `handleStoryLinkDelete` | `DELETE /models/:modelId/kpi-impact/story-links/:linkId` | `204`; `404 impact_link_not_found` |
| `handleMatrix` | `GET /models/:modelId/kpi-impact/matrix` | `200 kpiImpactMatrixSchema`; unknown model → `404 model_not_found` |
| `handleRollup` | `GET /models/:modelId/kpi-impact/rollup` | `200 kpiImpactRollupSchema` (degrades to `no_data`, never 500) |

**Dispatch** (`api/src/router.ts`) — a `models/:modelId/kpi-impact*` block of
`sub.match(/…/)` regexes inserted **after** the `model-workspace-core` `models*`
block and the `story-spec-core`/`key-activity-optimizer` blocks,
specific-before-parameterized:

1. `^models\/([^/]+)\/kpi-impact\/matrix$` (GET)
2. `^models\/([^/]+)\/kpi-impact\/rollup$` (GET)
3. `^models\/([^/]+)\/kpi-impact\/activity-links$` (GET list, POST create)
4. `^models\/([^/]+)\/kpi-impact\/story-links$` (GET list, POST create)
5. `^models\/([^/]+)\/kpi-impact\/activity-links\/([^/]+)$` (DELETE)
6. `^models\/([^/]+)\/kpi-impact\/story-links\/([^/]+)$` (DELETE)

The two `…-links/:linkId` DELETE regexes (segment count 5) never collide with the
bare `…-links` list/create regexes (segment count 4); specific-first ordering is
kept per the house convention.

### 4.8 Route-permission mapping + RBAC (FR-11)

`api/src/auth/rbac-permissions.ts` — new `ROUTE_PERMISSIONS` rows via the
`P(method, path, permission)` helper (verified `rbac-permissions.ts`),
specific-before-parameterized:

```
P("GET",    "models/:modelId/kpi-impact/matrix",                     "kpi_impact:read"),
P("GET",    "models/:modelId/kpi-impact/rollup",                     "kpi_impact:read"),
P("GET",    "models/:modelId/kpi-impact/activity-links",             "kpi_impact:read"),
P("POST",   "models/:modelId/kpi-impact/activity-links",             "kpi_impact:write"),
P("DELETE", "models/:modelId/kpi-impact/activity-links/:linkId",     "kpi_impact:write"),
P("GET",    "models/:modelId/kpi-impact/story-links",                "kpi_impact:read"),
P("POST",   "models/:modelId/kpi-impact/story-links",                "kpi_impact:write"),
P("DELETE", "models/:modelId/kpi-impact/story-links/:linkId",        "kpi_impact:write"),
```

Inserted before `model-workspace-core`'s parameterized `models/:id` rows (the
`matchSegments` matcher requires equal segment count, so these 4-/5-segment rows
never collide with the 3-segment `models/:id` rows — but placement stays
specific-first per the house convention). **No new route is `public`**; auth is
enforced only by the central gate (`router.ts` → `getRoutePermission` → RBAC
check) — no per-route check (NFR-06, FR-11).

`api/src/scripts/seed-rbac-roles.ts` — the `business_architect` role (seeded by
`model-workspace-core` FR-11, extended by `story-spec-core`/
`key-activity-optimizer`) gains `"kpi_impact:read"` + `"kpi_impact:write"` in its
permission array (idempotent `MERGE (r:RBACRole {name})`). This spec **modifies**
that role's permission list; it does **not** create the role.

### 4.9 `IMPACTS_KPI` runtime-registry edge registration (FR-02, NFR-02, XD-01)

`api/src/scripts/register-kpi-impact-edges.ts` (new, mirroring
`story-spec-core`'s `register-story-labels.ts`) calls `createEdgeType(driver, {
name: "IMPACTS_KPI", description, usage_example, endpoints: [{ fromLabel:
"UserStory", toLabel: "KPI" }] }, "system")` idempotently (a re-run that hits the
existing type swallows `name_conflict` — the register script is
run-once-per-boot-safe, matching `story-spec-core`'s pattern). Exposed as a
`bun run register:kpi-impact` script + wired into the same boot registration path
the other runtime labels use. `EDGE_ENDPOINTS`/`NODE_LABELS` consts are **not**
edited (AC-15). Requires `UserStory` (story-spec-core) + `KPI`
(kpi-okr-governance/`_baseline`) labels registered first — the hard build-order
dependency (§1.1).

### 4.10 PWA — KpiImpactMatrix view (FR-12, FR-13, FR-14)

- **`pwa/src/views/index.tsx`** — the `model` surface's `kpi-impact` entry
  (registered as `<ModelTabPlaceholder spec="kpi-impact-mapping"/>` by
  `model-workspace-core`) is **replaced** with `"kpi-impact": (r) =>
  <KpiImpactMatrix route={r} />`. This is the **only** edit to that file
  (`route.ts`/`SURFACES` stay `model-workspace-core`'s — never touched, UX-06).
- **`pwa/src/views/model/KpiImpactMatrix.tsx` + `.module.css`** — reads the active
  `BusinessModel` from `useActiveModel()`
  (`pwa/src/context/ActiveModelContext.tsx`, `model-workspace-core` FR-15); it
  does **not** re-implement model selection. Fetches
  `GET /api/v1/models/:modelId/kpi-impact/matrix` via `api.kpiImpact.matrix`
  (§4.11, DD-12). Renders **all four states**:
  - **loading** (AC-09) — skeleton via `Loading` from `views/_shared.tsx` while
    the matrix fetch is in flight.
  - **empty** (AC-10) — `meta.activityCount === 0` **or** no impact links yet →
    a `Card` with a message pointing to key-activity marking (`#/model/key-activities`)
    + link creation; no grid.
  - **error** (AC-11) — `ErrorState` from `views/_shared.tsx` (message only,
    verified no built-in retry) **plus a sibling catalog `Button`** whose click
    re-invokes `api.kpiImpact.matrix(activeModel.id)` and re-enters loading
    (the retry is a sibling, not part of `ErrorState` — same pattern as
    `key-activity-optimizer` C-02).
  - **ready** (AC-08) — the **activity × KPI grid** (`role="grid"`): rows =
    activities (name + key-activity + gap indicator), columns = KPIs, cells = a
    directional-weight chip (↑ `increases` / ↓ `decreases` + weight) in linked
    cells, empty in unlinked. When `gaps` is non-empty a **gaps strip** renders
    **above** the grid (AC-11, FR-13).
- **Link editing + gaps + roll-up panel (FR-13, AC-11/AC-13)** —
  (a) a **gaps strip** lists the measurability gaps, each with a "link a KPI"
  affordance;
  (b) clicking an **empty cell** (or an activity row's "link" action) opens a
  **link editor** (catalog `SidePanel`/`Modal`) to pick a KPI (from
  `api.kpi.list()` → `GET /api/v1/kpis`, `kpi-okr-governance` FR-10a), a
  **direction** (increases/decreases toggle), and a **weight** slider
  (`input[type=range]`, `[0,1]`), then `POST …/activity-links`
  (**optimistic, rollback on error**); an existing cell's chip opens the same
  editor pre-filled, supporting edit (re-POST idempotent) + delete
  (`DELETE …/activity-links/:linkId`);
  (c) selecting a **KPI column header** opens a **roll-up panel** showing that
  KPI's measured status from `GET …/rollup` (latest value, status, aggregate
  impact weight). All controls keyboard-reachable (UX-05, AC-13).
- **Model-scope + reload survival (FR-14, AC-14)** — the view keys its fetch on
  `activeModel.id`; switching the active model (shell context) refetches;
  deep-linking `#/model/kpi-impact` + reload re-renders for the persisted active
  model (persistence is `model-workspace-core` FR-15; this view consumes it via
  `useActiveModel()` and refetches on `activeModel.id` change). No cross-model
  leakage (server-enforced, §4.2/§4.4).
- **Tokens + a11y (NFR-07, UX-02/05; AC-12/AC-13)** —
  `KpiImpactMatrix.module.css` uses only `var(--…)` from
  `pwa/src/styles/companygraph/tokens.css`; catalog components (`DataTable`/grid,
  `Card`, `Button`, `Modal`/`SidePanel`, `Loading`/`ErrorState`) before inventing
  new ones. The view exposes an ARIA landmark; the matrix uses `role="grid"` +
  header semantics; Tab reaches the gaps-strip actions → each cell/link action →
  the link-editor controls in DOM order; the link editor's KPI `select`,
  direction toggle, and weight `input[type=range]` (exposing `aria-valuenow`) are
  keyboard-operable; opening the link editor or roll-up panel moves focus into it
  and Escape/close returns focus to the originating cell/header (reusing the
  catalog `SidePanel`/`Modal` focus-trap — not re-implemented, per the Native
  Conflicts table). `bun run scripts/design-conformance.ts --view
  pwa/src/views/model/KpiImpactMatrix.tsx` exits 0 (AC-12).

### 4.11 PWA api client (FR-12, FR-13, DD-12)

`pwa/src/api.ts` — add a `kpiImpact` block to the exported `api` object (reusing
the private `json<T>()` wrapper internally — the *block* is exported, `json` is
not, DD-12):

```ts
kpiImpact: {
  matrix: (modelId, signal?) =>
    json<KpiImpactMatrix>(`/api/v1/models/${encodeURIComponent(modelId)}/kpi-impact/matrix`, withSignal(signal)),
  rollup: (modelId, signal?) =>
    json<KpiImpactRollup>(`/api/v1/models/${encodeURIComponent(modelId)}/kpi-impact/rollup`, withSignal(signal)),
  createActivityLink: (modelId, body) =>
    json<ImpactLinkRow>(`/api/v1/models/${encodeURIComponent(modelId)}/kpi-impact/activity-links`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  deleteActivityLink: (modelId, linkId) =>
    json<void>(`/api/v1/models/${encodeURIComponent(modelId)}/kpi-impact/activity-links/${encodeURIComponent(linkId)}`, { method: "DELETE" }),
  // createStoryLink / deleteStoryLink / listActivityLinks / listStoryLinks — same shape
},
```

Types (`KpiImpactMatrix`, `KpiImpactRollup`, `ImpactLinkRow`) are inferred from
the shared zod schemas (§3.2–§3.4). The link-editor KPI picker reuses
`kpi-okr-governance`'s `api.kpi.list()` — not re-implemented (DD-12).

## 5. HTTP API surface

All under `/api/v1/`, zod-validated, `{error:{code,message,details?}}` envelope,
registered in `openapi.json` (FR-10). Permission column = `ROUTE_PERMISSIONS`
(FR-11). No `?model=` query param (DD-13). Read-only endpoints never write
(FR-09).

| Method | Route | FR | Perm | Notes |
|--------|-------|----|------|-------|
| POST | `/api/v1/models/:modelId/kpi-impact/activity-links` | FR-01 | `kpi_impact:write` | MERGE-on-pair `ALIGNED_TO`+`direction`; 201 row; 404 `activity_not_found`/`kpi_not_found`; 400 bad direction/weight |
| GET | `/api/v1/models/:modelId/kpi-impact/activity-links` | FR-03 | `kpi_impact:read` | list; `?activityId=`/`?kpiId=` |
| DELETE | `/api/v1/models/:modelId/kpi-impact/activity-links/:linkId` | FR-03 | `kpi_impact:write` | 204; 404 `impact_link_not_found` (incl. mis-routed story id, AC-03) |
| POST | `/api/v1/models/:modelId/kpi-impact/story-links` | FR-02 | `kpi_impact:write` | MERGE-on-pair `IMPACTS_KPI`; 201 row; 404 `story_not_found`/`kpi_not_found`; 400 |
| GET | `/api/v1/models/:modelId/kpi-impact/story-links` | FR-03 | `kpi_impact:read` | list; `?storyId=`/`?kpiId=` |
| DELETE | `/api/v1/models/:modelId/kpi-impact/story-links/:linkId` | FR-03 | `kpi_impact:write` | 204; 404 `impact_link_not_found` |
| GET | `/api/v1/models/:modelId/kpi-impact/matrix` | FR-05, FR-06, FR-07 | `kpi_impact:read` | rows/columns/cells/gaps/meta; unknown model → 404 `model_not_found` |
| GET | `/api/v1/models/:modelId/kpi-impact/rollup` | FR-08, FR-09 | `kpi_impact:read` | per-KPI status via `kpi-trends`; degrades to `no_data`+`measurementsAvailable:false`, never 500 |

`kpi_not_found` + `impact_link_not_found` added to `ERROR_CODES` (add-iff-absent,
DD-05); `activity_not_found`/`story_not_found`/`model_not_found` reused.

## 6. UI design

- **View-tree placement (FR-12, UX-06).** `#/model/kpi-impact` → `KpiImpactMatrix`
  (route verbatim from the blueprint View Tree). No `route.ts`/`SURFACES` edit —
  the tab is already registered by `model-workspace-core`; this spec only swaps
  the `renderView`/`VIEWS` dispatch target (§4.10).
- **Component plan (UX-02).** `KpiImpactMatrix` reuses catalog components first:
  `Card` (empty state), `Button` (link/edit/delete actions, direction toggle, and
  the **retry** sibling next to `ErrorState`), `SidePanel`/`Modal` (link editor +
  roll-up panel), `Loading`/`ErrorState` from `views/_shared.tsx`,
  `DataTable`/grid for the matrix body. The directional-weight chip, key-activity
  + gap indicators, and the weight slider (native `input[type=range]`) are
  token-styled inline elements. **No new catalog component** is added and **no
  catalog component is edited** — so `pwa/src/components/*` do **not** appear in
  §7's File Changes. (Unlike `key-activity-optimizer`'s ranking table, the matrix
  needs no client-side column sort — it is a fixed activity×KPI grid — so no
  in-view sort layer is required.)
- **States (UX-01):** loading / empty / error / ready per §4.10
  (AC-08/09/10/11).
- **Tokens (UX-02, NFR-07):** `KpiImpactMatrix.module.css` uses only `var(--…)`
  from `pwa/src/styles/companygraph/tokens.css`; `bun run
  scripts/design-conformance.ts --view pwa/src/views/model/KpiImpactMatrix.tsx`
  exits 0 (AC-12).
- **Input modes / Native Conflicts (UX-03/05):** no canvas/gesture/scroll-hijack/
  global-keyboard handler introduced — a grid + link-editor + roll-up-panel
  surface reusing catalog components + native controls (`select`, direction
  toggle `Button`, `input[type=range]` slider). ARIA landmark on the view; Tab
  order gaps-strip → cell/link actions → link-editor controls;
  `SidePanel`/`Modal` focus-trap + Escape reused from the catalog (not
  re-implemented — Native Conflicts table); the weight slider's arrow-key value
  change is the intended native behaviour (not suppressed).

## 7. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `shared/src/schema/kpi-impact.ts` | new | FR-01–08, FR-10 | zod: `impactDirectionSchema`, `activityLinkCreateSchema`, `storyLinkCreateSchema`, `impactLinkRowSchema`, `kpiImpactMatrixSchema`, `kpiImpactRollupSchema` |
| `api/src/derive/kpi-impact-matrix.ts` | new | FR-05,06,07,08, NFR-04 | pure `assembleMatrix`/`assembleRollup` + status derivation (§3.5); no Neo4j/HTTP (DD-06) |
| `api/src/storage/kpi-impact.ts` | new | FR-01,02,03,05,06,08,09, NFR-01,02 | link create/list/delete, matrix reads, roll-up composition; consumes `scopedNodeIds`; MERGE-on-pair `ALIGNED_TO`/`IMPACTS_KPI` (§4.2/§4.3); server-side `kpi-trends` composition (§4.6) |
| `api/src/routes/kpi-impact.ts` | new | FR-01–08, FR-10 | 8 handlers; zod boundary (`parseWith`); `{error}` envelope |
| `api/src/scripts/register-kpi-impact-edges.ts` | new | FR-02, NFR-02 | idempotent `createEdgeType("IMPACTS_KPI", UserStory→KPI)`; `register:kpi-impact` (§4.9) |
| `api/src/errors.ts` | modify | FR-10 | +`kpi_not_found`, +`impact_link_not_found` (additive, add-iff-absent; reuse `activity_not_found`/`story_not_found`/`model_not_found`, DD-05) |
| `api/src/router.ts` | modify | FR-01–08 | `models/:modelId/kpi-impact*` dispatch block (§4.7) |
| `api/src/auth/rbac-permissions.ts` | modify | FR-11 | 8 `ROUTE_PERMISSIONS` rows; `kpi_impact:read`/`kpi_impact:write` |
| `api/src/scripts/seed-rbac-roles.ts` | modify | FR-11 | add `kpi_impact:*` to `business_architect` permission set |
| `api/src/routes/openapi.ts` | modify | FR-10 | register kpi-impact paths + schemas (from the zod defs) |
| `pwa/src/views/index.tsx` | modify | FR-12 | swap `kpi-impact` tab dispatch → `<KpiImpactMatrix>` |
| `pwa/src/views/model/KpiImpactMatrix.tsx` | new | FR-12,13,14, UX-01/02/05 | activity×KPI grid + 4 states (error = `ErrorState` + sibling retry `Button`) + gaps strip + link editor (direction + weight slider) + roll-up panel |
| `pwa/src/views/model/KpiImpactMatrix.module.css` | new | FR-12, NFR-07 | tokens-only |
| `pwa/src/api.ts` | modify | FR-12,13 | `kpiImpact` client block (§4.11, DD-12) |
| `package.json` (root) | modify | FR-02 | `register:kpi-impact` script entry (mirrors `register:story`) |

**Not edited (consumed):** `shared/src/schema/{nodes,edges}.ts` (NFR-02/AC-15),
`shared/src/schema/kpi-sla.ts` (`kpiSchema`/`userStoryKPISchema`/
`kpiAlignmentSchema` consumed, not edited), `api/src/storage/{nodes,edges}.ts`
(generic primitives untouched), `api/src/storage/model-scope.ts` /
`pwa/src/context/ActiveModelContext.tsx` / `pwa/src/route.ts` (all
`model-workspace-core`'s), `api/src/routes/kpi-sla-alignment.ts` (base
`kpi-alignments` writer untouched — this spec adds a second MERGE writer in its
own module, DD-08), `api/src/routes/kpi-trends.ts` / `kpi-crud.ts` (governed
reads composed/called, not edited), `api/src/ontology/storage/edge-types.ts`
(`createEdgeType` reused), `pwa/src/components/*` (catalog reused, not extended).

## 8. Test strategy

| AC | Kind | File |
|----|------|------|
| AC-01 | integration | `api/__tests__/kpi-impact-activity-links.integration.test.ts` — `POST …/activity-links` creates `ALIGNED_TO` w/ `direction`+`weight∈[0,1]` from scoped Activity to non-archived KPI; 201 + `linkId` (elementId); re-link same pair updates without a 2nd edge (MERGE-on-pair); non-scoped `:activityId` → 404 `activity_not_found`; unknown/archived kpi → 404 `kpi_not_found`; bad weight/direction → 400 (FR-01, FR-04, FR-10) |
| AC-02 | integration | `api/__tests__/kpi-impact-story-links.integration.test.ts` — `IMPACTS_KPI` registered via runtime registry (`EDGE_ENDPOINTS` const unchanged); `(:UserStory)-[:IMPACTS_KPI {direction,weight}]->(:KPI)` from a model-scoped story (joined on `UserStory.id`); 201 + populated `sourceName`; MERGE-on-pair; non-scoped story → 404 `story_not_found`; 404 `kpi_not_found`; bad direction/weight → 400 (FR-02, FR-04, NFR-02) |
| AC-03 | integration | `api/__tests__/kpi-impact-links-crud.integration.test.ts` — `GET …/activity-links`+`.../story-links` return rows w/ direction/weight/names, filterable by `?activityId=`/`?storyId=`/`?kpiId=`; `DELETE …/activity-links/:linkId` → 204, 2nd delete → 404; same for story links; **mis-routed id (N-01):** a story link's elementId to the activity DELETE (and vice-versa) → 404 `impact_link_not_found`, never a cross-type delete (FR-03) |
| AC-04 | integration | `api/__tests__/kpi-impact-matrix.integration.test.ts` — `GET …/matrix`: rows = scoped activities (id/name/journey/`isKeyActivity` from `attributes.keyActivity` presence); columns = distinct impacted KPIs; cells `{direction,weight}`\|null; meta counts; a KPI impacted only by a model-B activity absent from model A columns (FR-05, NFR-01). Pure-assembler cases in `api/__tests__/kpi-impact-matrix.test.ts` (Neo4j-free, DD-06). |
| AC-05 | integration | `api/__tests__/kpi-impact-gaps.integration.test.ts` — a key activity (`attributes.keyActivity` **present**, presence not `.marked===true` — DD-10) with **no directional** link → `gaps` entry `{activityId, reason:"key_activity_no_kpi"}`; after a directional `POST …/activity-links` it **drops out**; a key activity whose only link is a base-route `ALIGNED_TO` with `direction:null` **stays** in gaps (DD-07/C-04); a non-key activity with no links **not** in gaps; `meta.gapCount === gaps.length` (FR-06). Pure gap-predicate cases in `kpi-impact-matrix.test.ts`. |
| AC-06 | integration | `api/__tests__/kpi-impact-rollup.integration.test.ts` — seed **Neo4j `:KPIMeasurement` nodes** (the source `kpi-trends` reads, V-02/DD-03 — not Postgres); assert roll-up `latestValue` = the **last** (max-`measured_at`) measurement (DD-04/C-05), `status` derived vs `target_value`/thresholds/`target_direction` (§3.5), `impactLinkCount` + capped `aggregateImpactWeight`; KPI with no `:KPIMeasurement` → `no_data`; measurement source made unavailable (`kpi-trends` errors) → `meta.measurementsAvailable:false` + all `no_data`, **not** 500 (FR-08, FR-09, NFR-04). Status-derivation unit cases in `kpi-impact-matrix.test.ts`. |
| AC-07 | integration | `api/__tests__/kpi-impact-authz.integration.test.ts` — two models: `GET …/matrix` for A excludes B-only activities/links; a session without `kpi_impact:write` → 403 on link POST/DELETE; `kpi_impact:read` → 200 on matrix/rollup/list GETs; `business_architect` resolves both; no new route `public` (FR-01, FR-11, NFR-01) |
| AC-16 | integration | `api/__tests__/kpi-impact-matrix.integration.test.ts` — an activity backed by two distinct stories each carrying one `IMPACTS_KPI` link (one pair reusing the same KPI) → `storyLinkCount === 2` (distinct `(story,kpi)` edges, not distinct KPIs); no story links → 0; `storyLinkCount` does not alter `gaps`/`gapCount` (FR-07, FR-06) |
| AC-17 | integration | `api/__tests__/kpi-impact-openapi.integration.test.ts` — the new `…/kpi-impact*` routes + every added error code (`kpi_not_found`, `impact_link_not_found`, and reused `activity_not_found`/`story_not_found`) appear in `GET /api/v1/openapi.json` (from the zod schemas, no hand copy); every added `ERROR_CODES` entry reachable from ≥1 route so `envelope.test.ts` holds (FR-10) |
| AC-08 | component (jsdom) | `pwa/src/__tests__/kpi-impact-matrix.test.tsx` — `#/model/kpi-impact` → `KpiImpactMatrix` (not placeholder); reads `useActiveModel()`; ready grid: rows w/ activity name + key-activity/gap indicator, KPI columns, directional-weight chip (↑/↓ + weight) in linked cells, empty in unlinked (FR-12 ready, FR-14) |
| AC-09,10,11 | component | `pwa/src/__tests__/kpi-impact-matrix-states.test.tsx` — loading skeleton while matrix pending; empty (no scoped activities OR no links → message + no grid); error (`ErrorState` + **sibling retry `Button`** whose click refetches) + gaps strip renders above the grid when `gaps` non-empty (FR-12, FR-13, UX-01) |
| AC-12 | CLI | `bun run scripts/design-conformance.ts --view pwa/src/views/model/KpiImpactMatrix.tsx` — expect exit 0, zero token/component violations (view + co-located `.module.css`) |
| AC-13 | manual | keyboard walk of `#/model/kpi-impact` (input mode: keyboard): Tab to a gap's "link a KPI" action + Enter (expect link editor opens + focus enters it), Tab through KPI select → direction toggle → weight slider (expect arrow keys change `aria-valuenow`), submit + Escape (expect focus returns to the originating cell + the new chip renders) |
| AC-14 | e2e | `pwa/playwright/kpi-impact-matrix-context.spec.ts` — model B active, nav `#/model/kpi-impact`, reload → same route renders `KpiImpactMatrix` w/ **model B's** matrix (FR-14, UX-06) |
| AC-15 | CLI | `bun run typecheck` exit 0; `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts` shows no `NODE_LABELS`/`EDGE_ENDPOINTS` additions (NFR-02, NFR-06) |

Integration tests need Neo4j (`bun test:integration`); unit/component run under
`bun test`. The roll-up integration test (AC-06) needs **only** the Neo4j CI
service — it seeds `:KPIMeasurement` nodes (the source `kpi-trends` reads,
V-02/DD-03) and does **not** require the Postgres CI service (this spec never
reads the Postgres `kpi_measurements` table). Two-model + activity/story fixtures
seed via `model-workspace-core`'s model/domain routes + core
`POST /api/v1/nodes`/`edges` for activities and `DESCRIBES_ACTIVITY`, and via
`story-spec-core`'s story routes for `UserStory` nodes — no direct-driver seeding
except the `:KPIMeasurement` fixture the governed `kpi-trends` read requires.

## 9. Rejected alternatives

- **A fresh `DRIVES_KPI`-style activity→KPI edge (XD-04's literal name)** —
  `DRIVES_KPI` is `KeyResult→KPI` (verified), and forking a new weighted
  activity→KPI edge would duplicate the `ALIGNED_TO` alignment surface
  `kpi-okr-governance` just verified. Rejected → extend the as-built `ALIGNED_TO`
  with a `direction` property (DD-01, OQ-1).
- **Adding `IMPACTS_KPI` to the compile-time `EDGE_ENDPOINTS` const** — violates
  XD-01 (the runtime registry is the sanctioned extension path) and would edit
  the frozen const (AC-15). Rejected → `createEdgeType` at boot (DD-02, §4.9).
- **Querying the Postgres `kpi_measurements` table directly for the roll-up** —
  violates NFR-02 (no direct measurement-store query) and forks the governed read
  surface; it would also **contradict** what `kpi-trends` shows (the V-02
  split-brain). Rejected → compose the governed `kpi-trends` route only (DD-03);
  the store-of-truth question is escalated as OQ-2, not silently resolved.
- **Reading `latestValue` as `measurements[0]`** — `kpi-trends` returns ASC-ordered
  measurements, so `[0]` is the **oldest**. Rejected → `measurements.at(-1)`
  (DD-04, C-05).
- **Any `ALIGNED_TO` (directed or not) clears a measurability gap** — undercuts
  the feature's purpose (XD-04 exists to add the *directional* impact a bare
  alignment lacks). Rejected → only a `direction`-bearing link clears a gap
  (DD-07, OQ-4); the looser reading is a one-line change flagged to the user.
- **Story-inclusive gap detection** — the "measurable key activity" unit XD-04
  names is the activity; story links are a coverage-volume rider (FR-07).
  Rejected → activity-only gaps (DD-09, OQ-3); flagged.
- **A precompute/cache/scheduler subsystem for the matrix/roll-up** — both serve
  live at `retail-mini`/single-model scale (NFR-05). Rejected → live compute on
  request (§4.4/§4.5).
- **Extending the catalog `DataTable` / adding an in-view sort layer** — the
  matrix is a fixed activity×KPI grid with no column-sort requirement (unlike
  `key-activity-optimizer`'s ranking). Rejected → reuse the static
  `DataTable`/grid unmodified (§6).
- **De-duplicating base-route `ALIGNED_TO` CREATE duplicates** — that edge is
  `kpi-okr-governance`'s; this spec only guarantees its own MERGE never adds a
  second edge for a seen pair. Rejected → out of scope (DD-08, C-01).
- **Calling the private `json<T>` helper / re-implementing model selection in the
  view** — not exported / re-specs `model-workspace-core`. Rejected → new exported
  `api.kpiImpact.*` block + consume `useActiveModel()` (DD-12, §4.10/§4.11).
