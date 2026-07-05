---
feature: "kpi-impact-mapping"
created: "2026-07-04"
author: "spec-author (blueprint: business-modeling-studio, XD-04)"
status: "approved"
revision: 1
reviewing_requirements_revision: "2 (req-review pass 2/2 = approve, 0 blockers; carry-forward C-05/C-06)"
reviewing_design_revision: "1 (design-review pass 1 = approve, 0 blockers, 2 concerns, 3 nits)"
size: "medium"
total_tasks: 15
---

# Tasks: kpi-impact-mapping

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocked by` / `Blocks`); no out-of-order execution.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook (`.claude/hooks/spec-completion-check.sh`) blocks STATUS.md
  completion without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h, one
  judgment call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck`; after
  tasks that ship behaviour, also run the listed test. Tasks touching
  `pwa/src/views/` additionally run
  `bun run scripts/design-conformance.ts --view <file>` for **every file the
  task touches** under `pwa/src/views/` — each `.tsx` and each `.module.css`
  gets its own invocation (AC-12).
- Integration tests (`*.integration.test.ts`) need Neo4j
  (`bun test:integration` after `bun run dev`); unit/component tests run under
  `bun test`. **The roll-up integration test (T-12/AC-06) needs only the Neo4j
  CI service** — it seeds `:KPIMeasurement` nodes (the source `kpi-trends`
  reads, V-02/DD-03) and does **not** require the Postgres CI service.

## Hard build-order precondition (design §1.1)

This spec is **wave 4**: implementation cannot start until all three declared
dependencies merge, plus the transitive foundation `model-workspace-core`.
Several surfaces this spec consumes are **new files owned upstream that may not
exist on disk at authoring time**:

- `story-spec-core` — the `UserStory` runtime label + `UserStory.id` join key +
  the `DESCRIBES_ACTIVITY` edge; the `story_not_found` error code (reused, DD-05).
  **Blocks T-04 (story-link write) and every story-touching test (T-11, T-13).**
- `key-activity-optimizer` — the `attributes.keyActivity` mark (presence ⇔
  marked, DD-10) read for gap detection; the `activity_not_found` error code
  (reused, DD-05). **Blocks T-05 (matrix read) and T-11 (gaps test).**
- `kpi-okr-governance` — `GET /api/v1/kpis`, `GET /api/v1/kpi-trends/:kpiId`
  (`handleKpiTrendsGet(req, kpiId)`), the `ALIGNED_TO`/`kpi-alignments` base
  contract, and the shared `parseWith` ZodError→400 mapper
  (`api/src/routes/_helpers.ts:84`). **Blocks T-03/T-06 (link write, roll-up
  composition) and T-12 (roll-up test).**
- `model-workspace-core` (transitive) — `scopedNodeIds(driver, modelId)`
  (**verified present on disk today**, `api/src/storage/model-scope.ts:22`),
  `scopedWhereFragment`, the `business_architect` role
  (`api/src/scripts/seed-rbac-roles.ts`), `useActiveModel()`
  (`pwa/src/context/ActiveModelContext.tsx`), and the `kpi-impact`
  `ModelTabPlaceholder` slot in `pwa/src/views/index.tsx`. **Blocks T-07 (RBAC
  grant), T-14 (view registration).**

**No task's file writes may start until its upstream dependency has merged.**
Each task binds to the real files once they land; the design cites their
approved signatures (design §3.1). `scopedNodeIds` is the one interface already
on disk.

## Design-review carry-forwards (design-review pass 1 = approve; 0 blockers, 2 concerns, 3 nits)

`review-design.md` closed **approve** with 0 blockers. The prior-phase
carry-forwards (C-05 `latestValue` extraction → DD-04; C-06 no-duplicate
`ERROR_CODES` → DD-05) are resolved in the design. Pass 1's **two concerns and
three nits** are landed here as binding decisions so the execution agent does not
re-derive them. None changes the architecture.

| Finding | Decision (binding for execution) | Locked in task |
|---------|----------------------------------|----------------|
| **C-01** — Roll-up source contradicts the blueprint's literal "vs Postgres measurements" wording; the design (DD-03) rolls up against the Neo4j `:KPIMeasurement` source `kpi-trends` reads (verified `kpi-trends.ts:50`), disjoint from the Postgres `kpi_measurements` table. Escalated as OQ-2, not silently decided; NFR-02 forbids a direct-Postgres read. | **Keep the design as-is.** The roll-up composes only the governed `kpi-trends` route (T-06); it opens **no** direct measurement-store read. The `fetchTrends` seam (T-06) absorbs a future V-02 resolution transparently. **The orchestrator must surface OQ-2 to the user and reconcile the blueprint line-166 wording before execution lands** — but no task changes if the user rules Postgres authoritative (that fix is a `kpi-okr-governance` V-02 change, out of scope). AC-06 (T-12) seeds `:KPIMeasurement`, **not** Postgres, and documents this in the test docstring. | T-06 (`fetchTrends` seam), T-12 (docstring + `:KPIMeasurement` seed) |
| **C-02** — §4.3's `createStoryLink` Cypher returns `s.title AS sourceName`, but `story-spec-core` creates the story on the graph-core node envelope (`name`), with no `title` property. As written `sourceName` would be `null`, and AC-02 asserts a **populated** `sourceName` → the default-path test would fail. | **Decision (binding):** pin the story display name to the graph-core envelope field **`s.name`** in both the `createStoryLink` write RETURN and the `listStoryLinks` read (T-04), **not** `s.title`. If `story-spec-core` diverges at merge time, fall back to `s.persona`/`s.action` (verified against the merged label), but the design default is `s.name`. AC-02 (T-11) asserts a populated `sourceName`. | T-04 (`s.name`), T-11 (assert populated `sourceName`) |
| **N-01** — `readMatrixInputs`'s `model_not_found` pre-check: `scopedNodeIds` returns ∅ for **both** an unknown model and a valid-but-empty model, so a distinct `MATCH (m:BusinessModel {id})` pre-read is the sole `model_not_found` signal; the **same pre-check is needed on the rollup handler**, which §4.5 did not mention. | **Decision:** both `readMatrixInputs` (T-05) **and** `readRollupInputs` (T-06) run the `MATCH (m:BusinessModel {id})` existence pre-check; a miss → `404 model_not_found` (already in `errors.ts:36`); a valid-but-empty model → an empty-but-valid matrix/roll-up (empty state, AC-10). Both handlers (T-08) map the pre-check miss to `model_not_found`. | T-05, T-06, T-08 |
| **N-02** — `ALIGNED_TO` also targets `UserJourney`/`Domain` (base writer, `kpi-sla-alignment.ts:41`); the design's matrix read, link read, and DELETE all constrain `->(a:Activity)`. Correct (a journey/domain-aligned edge's `elementId` to the activity DELETE 404s, and never appears as a matrix cell), but an implicit consequence. | **Decision:** the `->(a:Activity)` endpoint filter is **deliberate** across every activity-side read/write/delete (T-03, T-04, T-05) — journey/domain alignments are out of this feature's activity×KPI surface. A one-line code comment states this so an implementer does not "fix" the filter to widen it. | T-03, T-05 (comment) |
| **N-03** — Handler-count mismatch: §1/§4.1 say "6 model-scoped REST routes / 6 handlers", but §4.7's table and §7 correctly list **8** endpoints (matrix + rollup + 2 link GET-list/POST-create pairs + 2 link deletes). | **Decision:** the surface is **8 handlers** (design §4.7 table is authoritative): `handleActivityLinkCreate`, `handleActivityLinksList`, `handleActivityLinkDelete`, `handleStoryLinkCreate`, `handleStoryLinksList`, `handleStoryLinkDelete`, `handleMatrix`, `handleRollup`. T-08 (routes) and T-09 (RBAC) size to 8. | T-08, T-09 |

## Deviations from requirements/design (orchestrator: land as errata, no ID renumbering)

| Requirement/design text | Executed as | Why | Source |
|-------------------------|-------------|-----|--------|
| AC-12 `manual: run … design-conformance.ts …` and design §8 "CLI" | **CLI** verification (`bun run scripts/design-conformance.ts --view …` — deterministic exit code) | It is a deterministic script with an exit code (verified `--view` flag), not a hand walk | requirements AC-12, design §8 |
| §1/§4.1 prose "6 REST routes" | **8 handlers / 8 endpoints** (§4.7 table + §7 authoritative, N-03) | Matrix + rollup + 2 link GET/POST pairs + 2 deletes = 8 | design §4.7, §7; review N-03 |
| OQ-1/DEC-01 (extend `ALIGNED_TO` + `direction`, not literal `DRIVES_KPI`), OQ-2/DEC-02 (roll-up vs `:KPIMeasurement` via `kpi-trends`, not Postgres), OQ-3 (activity-only gaps), OQ-4/DEC-03 (only a directional link clears a gap), C-01 flag (second-writer MERGE on `kpi-okr-governance`'s `ALIGNED_TO`) | **Executed as the recorded design defaults** (DD-01, DD-03, DD-07, DD-08, DD-09) | Each is a one-line/additive change if the user prefers otherwise. **The orchestrator must still surface OQ-2 (now a real decision per review C-01) and may surface OQ-1/OQ-3/OQ-4 + the C-01 second-writer flag before execution.** | design DD-01/03/07/08/09; requirements OQ-1..4 |

## Task list

### T-01 — KPI-impact zod schemas (shared)

- **Files** (1): `shared/src/schema/kpi-impact.ts` (new)
- **Implements**: design §3.2, §3.3, §3.4 — supports FR-01, FR-02, FR-04,
  FR-05, FR-06, FR-07, FR-08, FR-10; owns the camelCase wire shape
- **Complexity**: moderate
- **Blocked by**: — (hard build-order precondition applies)
- **Blocks**: T-03, T-04, T-05, T-06, T-08, T-10, T-13
- **Steps**: Define the REST-boundary + response zod schemas (**zod only**;
  **en-US identifiers**). Consume — never edit — `shared/src/schema/kpi-sla.ts`
  (`kpiSchema`, `userStoryKPISchema`, `kpiAlignmentSchema`).
  - `impactDirectionSchema` = `z.enum(["increases", "decreases"])`.
  - `activityLinkCreateSchema` (§3.2) = `{ activityId: z.string().min(1),
    kpiId: z.string().min(1), direction: impactDirectionSchema, weight:
    z.number().min(0).max(1), attributionType: z.enum(["direct","indirect",
    "leading","lagging"]).optional(), notes: z.string().max(500).optional() }`.
    The `weight∈[0,1]` bound is the **single sanctioned tightening** beyond the
    as-built `ALIGNED_TO` contract (NFR-03); no as-built field renamed.
  - `storyLinkCreateSchema` (§3.3) = `{ storyId: z.string().min(1), kpiId:
    z.string().min(1), direction: impactDirectionSchema, weight:
    z.number().min(0).max(1), notes: z.string().max(500).optional() }`.
  - `impactLinkRowSchema` (§3.2) = `{ linkId: z.string(), sourceId: z.string(),
    sourceName: z.string().nullable(), kpiId: z.string(), kpiName:
    z.string().nullable(), direction: impactDirectionSchema.nullable(),
    weight: z.number().nullable(), notes: z.string().nullable(), createdAt:
    z.string().nullable() }` — `direction:null` for a pre-existing undirected
    base-route `ALIGNED_TO` (NFR-03).
  - `matrixCellSchema` = `z.object({ direction: impactDirectionSchema.nullable(),
    weight: z.number().nullable() }).nullable()` (null = no `ALIGNED_TO` for the
    pair); `matrixActivityRowSchema`, `matrixKpiColumnSchema`, `gapSchema`
    (`reason: z.literal("key_activity_no_kpi")`), `kpiImpactMatrixSchema`
    (`{ rows, columns, gaps, meta:{activityCount, kpiCount, linkedCellCount,
    keyActivityCount, gapCount} }`) per §3.4.
  - `rollupRowSchema` (`{ kpiId, kpiName, unit, targetValue, targetDirection,
    latestValue: z.number().nullable(), status: z.enum(["on_track","warning",
    "critical","no_data"]), impactLinkCount: z.number().int(),
    aggregateImpactWeight: z.number() }`) + `kpiImpactRollupSchema`
    (`{ rows, meta:{kpiCount, measurementsAvailable: z.boolean()} }`) per §3.4.
  Export the inferred TS types for the api client (T-13) + storage/derive
  modules. The response carries **no** recommendation/suggestion field.
- **Verification**: `shared/src/schema/__tests__/kpi-impact.test.ts` (new) —
  `activityLinkCreateSchema`/`storyLinkCreateSchema` reject `weight > 1`,
  `weight < 0`, and an out-of-enum `direction`, and **accept** a well-formed
  body; `impactLinkRowSchema` accepts `direction:null`; `matrixCellSchema`
  accepts `null`; `rollupRowSchema.status` rejects an out-of-enum string;
  `bun run typecheck`.

### T-02 — Additive error codes (`kpi_not_found`, `impact_link_not_found`)

- **Files** (1): `api/src/errors.ts` (modify)
- **Implements**: design §3.6, DD-05 — closes part of FR-10
- **Complexity**: simple
- **Blocked by**: T-01
- **Blocks**: T-03, T-04, T-08, T-10
- **Steps**: Append **two** additive codes to the closed `ERROR_CODES` array
  (NFR-11 additive; **no existing code removed/reordered**), each **add-iff-absent**
  (DD-05/C-06): `kpi_not_found` (404 — link POSTs when `kpiId` is unknown/archived)
  and `impact_link_not_found` (404 — link DELETEs when `:linkId` matches no edge
  of that type, incl. a mis-routed cross-type id, AC-03).
  - **Do NOT add `activity_not_found` / `story_not_found` / `model_not_found`.**
    Per DD-05: `model_not_found` is **already present** (`errors.ts:36`, verified);
    `activity_not_found` is registered upstream by `key-activity-optimizer` and
    `story_not_found` by `story-spec-core`. Reference the existing enum members;
    **do not re-declare.** The add-iff-absent guard means if a dep left one
    unregistered this spec adds it, but the expectation (all deps merged) is reuse.
  - Both added codes are reachable from ≥1 route (T-08 activity/story POST + link
    DELETE) so `envelope.test.ts`'s reachability + closed-enum exhaustiveness
    assertions both hold.
- **Verification**: `api/__tests__/kpi-impact-openapi.integration.test.ts` (with
  T-10) asserts `kpi_not_found` + `impact_link_not_found` are members of
  `ERROR_CODES` and appear in the OpenAPI `ErrorEnvelope.code` enum; `bun run
  typecheck` passes the exhaustiveness assertion.

### T-03 — Activity-link write + list/delete (`ALIGNED_TO` + `direction`)

- **Files** (1): `api/src/storage/kpi-impact.ts` (new — `createActivityLink`,
  `listActivityLinks`, `deleteActivityLink`)
- **Implements**: design §4.2, §4.3, DD-01, DD-08, DD-11, N-02 — closes AC-01
  (storage half) + AC-03 (activity half); supports FR-01, FR-03, FR-04, NFR-01,
  NFR-02, NFR-03
- **Consumes (upstream, not re-specced)**: `model-workspace-core` FR-18 —
  `scopedNodeIds(driver, modelId)` (`api/src/storage/model-scope.ts`), imported
  for the model-scope + link-target check (NFR-01); never re-implemented here.
- **Complexity**: complex
- **Blocked by**: T-01, T-02 (hard build-order — needs `kpi-okr-governance`'s
  `ALIGNED_TO`/`kpi-alignments` base contract merged)
- **Blocks**: T-05, T-08, T-11
- **Steps**: In `api/src/storage/kpi-impact.ts`:
  - `createActivityLink(driver, modelId, body)` (§4.2, DD-01):
    1. **Model-scope + existence check.** `const scoped = await
       scopedNodeIds(driver, modelId)` — **imported from
       `api/src/storage/model-scope.ts`, never re-implemented** (verified on disk,
       `:22`). `body.activityId ∉ scoped` or not `:Activity` → `404
       activity_not_found` (reused, T-02). Verify `body.kpiId` is a non-archived
       KPI (`MATCH (k:KPI {id}) WHERE k.archived_at IS NULL`, mirrors
       `kpi-sla-alignment.ts:34`) → miss → `404 kpi_not_found`.
    2. **MERGE-on-pair, keyed on node identities only** (DD-08 — never adds a
       second edge for a seen pair; binds one arbitrarily if the base route left
       duplicates): `MATCH (k:KPI {id:$kpiId}), (a:Activity {id:$activityId})
       MERGE (k)-[r:ALIGNED_TO]->(a) ON CREATE SET r.created_at=$now, r.weight=
       $weight, r.attribution_type=$attributionType, r.alignment_notes=$notes,
       r.direction=$direction ON MATCH SET r.weight=$weight, r.direction=
       $direction, r.attribution_type=coalesce($attributionType,
       r.attribution_type), r.alignment_notes=coalesce($notes, r.alignment_notes)
       RETURN elementId(r) AS linkId, …, a.id AS sourceId, a.name AS sourceName,
       k.id AS kpiId, k.name AS kpiName`. `attributionType` defaults to
       `"direct"` on create when omitted. Persisted names stay **snake_case**
       (`created_at`, `attribution_type`, NFR-03). Returns a row per
       `impactLinkRowSchema` (`201` at the route, T-08). **N-02 comment:** the
       `->(a:Activity)` endpoint filter is deliberate (journey/domain alignments
       out of scope).
  - `listActivityLinks(driver, modelId, filters)` (§4.3, FR-03): read the model's
    `ALIGNED_TO` links **bounded to `scopedNodeIds`** (NFR-01), optionally filtered
    by `?activityId=`/`?kpiId=`, → `impactLinkRowSchema[]`.
  - `deleteActivityLink(driver, modelId, linkId)` (§4.3, DD-11): `MATCH
    (k:KPI)-[r:ALIGNED_TO]->(a:Activity) WHERE elementId(r)=$linkId DELETE r
    RETURN count(r) AS deleted`. `deleted===0` → `404 impact_link_not_found`
    (incl. a mis-routed `IMPACTS_KPI` elementId — matches no `ALIGNED_TO`, never a
    cross-type delete, AC-03/N-01). Second delete of the same id → `404`.
  Do **not** touch `NODE_LABELS`/`EDGE_ENDPOINTS` (NFR-02, AC-15). Do **not** edit
  the base `kpi-sla-alignment.ts` writer (this spec adds a second MERGE writer in
  its own module, DD-08). Do **not** edit the generic `createNode`/`createEdge`
  primitives.
- **Verification**: `api/__tests__/kpi-impact-activity-links.integration.test.ts`
  (T-11, AC-01) — exercises `createActivityLink` through the route surface — and
  `api/__tests__/kpi-impact-links-crud.integration.test.ts` (T-11, AC-03);
  `bun run typecheck`.

### T-04 — Story-link write + list/delete (`IMPACTS_KPI`)

- **Files** (1): `api/src/storage/kpi-impact.ts` (extend — `createStoryLink`,
  `listStoryLinks`, `deleteStoryLink`)
- **Implements**: design §4.3, DD-02, DD-11, C-02 — closes AC-02 (storage half) +
  AC-03 (story half); supports FR-02, FR-03, FR-04, NFR-01, NFR-02
- **Complexity**: complex
- **Blocked by**: T-01, T-02, T-03 (hard build-order — needs `story-spec-core`'s
  `UserStory` + `DESCRIBES_ACTIVITY` merged, and the T-09 `IMPACTS_KPI`
  registration must run at boot before writes)
- **Blocks**: T-08, T-11
- **Steps**: In `api/src/storage/kpi-impact.ts`:
  - `createStoryLink(driver, modelId, body)` (§4.3, DD-02):
    1. **Model-scope check through the story's activity** (`story-spec-core`
       NFR-02): the story is in-model iff its `DESCRIBES_ACTIVITY` `Activity` ∈
       `scopedNodeIds` — `MATCH (s:UserStory {id:$storyId})-[:DESCRIBES_ACTIVITY]->
       (a:Activity) WHERE a.id IN $scopedIds`. Miss → `404 story_not_found`
       (reused, T-02). Verify `kpiId` → `404 kpi_not_found`.
    2. **MERGE-on-pair** on the runtime-registry `IMPACTS_KPI` edge: `MATCH
       (s:UserStory {id:$storyId}), (k:KPI {id:$kpiId}) MERGE (s)-[r:IMPACTS_KPI]->
       (k) ON CREATE SET r.created_at=$now, r.weight=$weight, r.direction=
       $direction, r.notes=$notes ON MATCH SET r.weight=$weight, r.direction=
       $direction, r.notes=coalesce($notes, r.notes) RETURN elementId(r) AS linkId,
       …, s.id AS sourceId, s.name AS sourceName, k.id AS kpiId, k.name AS
       kpiName`. **C-02 (binding):** the story display name is the graph-core
       envelope field **`s.name`** — **not** `s.title` (verified `story-spec-core`
       creates `UserStory` on the node envelope carrying `name`). AC-02 asserts a
       populated `sourceName`.
  - `listStoryLinks(driver, modelId, filters)` (§4.3, FR-03): read the model's
    `IMPACTS_KPI` links **bounded to `scopedNodeIds`** through each story's
    activity, optionally filtered by `?storyId=`/`?kpiId=`, returning
    `impactLinkRowSchema[]` with `sourceName = s.name` (C-02).
  - `deleteStoryLink(driver, modelId, linkId)` (§4.3, DD-11): `MATCH
    (s:UserStory)-[r:IMPACTS_KPI]->(k:KPI) WHERE elementId(r)=$linkId DELETE r
    RETURN count(r) AS deleted`. `deleted===0` → `404 impact_link_not_found`
    (an activity link's elementId → matches no `IMPACTS_KPI` → 404, never a
    cross-type delete, AC-03/N-01).
  `EDGE_ENDPOINTS`/`NODE_LABELS` consts unchanged (NFR-02, AC-15).
- **Verification**: `api/__tests__/kpi-impact-story-links.integration.test.ts`
  (T-11, AC-02) — exercises `createStoryLink` through the route surface — and
  `api/__tests__/kpi-impact-links-crud.integration.test.ts` (T-11, AC-03 — story
  delete + mis-routed id); `bun run typecheck`.

### T-05 — Matrix read + pure matrix/gap assembler

- **Files** (3): `api/src/storage/kpi-impact.ts` (extend — `readMatrixInputs`),
  `api/src/derive/kpi-impact-matrix.ts` (new — `assembleMatrix`),
  `api/__tests__/kpi-impact-matrix.test.ts` (new — pure unit)
- **Implements**: design §4.1, §4.4, DD-06, DD-07, DD-09, DD-10, N-01, N-02 —
  closes AC-04 + AC-05 (unit half) + AC-16 (unit half); supports FR-05, FR-06,
  FR-07, NFR-01, NFR-04
- **Complexity**: complex
- **Blocked by**: T-01, T-03 (hard build-order — needs `key-activity-optimizer`'s
  `attributes.keyActivity` mark on disk for gap detection)
- **Blocks**: T-08, T-11
- **Steps**:
  - `assembleMatrix(input: MatrixInput): KpiImpactMatrix` in
    `api/src/derive/kpi-impact-matrix.ts` — **pure, opens no Neo4j session, makes
    no HTTP call** (DD-06, so AC-04/05/16 math is Neo4j-free unit-testable). Input
    shapes per §4.1 (`MatrixActivity{ id, name, journeyName, isKeyActivity,
    storyLinkCount }`, `MatrixLink{ activityId, kpiId, direction, weight }`,
    `MatrixKpi{ id, name, unit, targetDirection }`).
    - **columns** = distinct KPIs any scoped activity links to (FR-05); a KPI
      impacted only by a model-B activity never appears (NFR-01).
    - **cells** = per `(activity,kpi)`: `{direction, weight}` if an `ALIGNED_TO`
      exists, else `null`.
    - **gaps** (FR-06, DD-07/DD-09/DD-10): every activity with `isKeyActivity ===
      true` that has **zero activity→KPI links with a non-null `direction`** →
      `{activityId, activityName, journeyName, reason:"key_activity_no_kpi"}`. A
      key activity whose only link is an undirected (`direction:null`) base-route
      `ALIGNED_TO` **stays** a gap (DD-07). A non-key activity with zero links is
      **not** a gap (merely uncovered). `storyLinkCount` does **not** alter gaps
      (DD-09). `meta.gapCount === gaps.length`.
    - **meta** = `{activityCount, kpiCount, linkedCellCount, keyActivityCount,
      gapCount}`; deterministic column/row ordering (NFR-04).
  - `readMatrixInputs(driver, modelId)` in `api/src/storage/kpi-impact.ts` (§4.4):
    1. **`model_not_found` pre-check (N-01):** a distinct `MATCH (m:BusinessModel
       {id})` read — a miss → the handler (T-08) maps to `404 model_not_found`
       (`errors.ts:36`), so an unknown model is a 404, **not** an empty matrix. A
       valid model with 0 scoped activities → an empty-but-valid matrix (AC-10).
    2. `const scoped = await scopedNodeIds(driver, modelId)`. Scoped activities +
       journey + key-activity mark + story-link count: `MATCH (a:Activity) WHERE
       a.id IN $scopedIds OPTIONAL MATCH (a)-[:PART_OF]->(j:UserJourney) OPTIONAL
       MATCH (s:UserStory)-[:DESCRIBES_ACTIVITY]->(a) OPTIONAL MATCH
       (s)-[sk:IMPACTS_KPI]->(:KPI) RETURN a.id, a.name, a.attributes_json,
       j.name AS journeyName, count(DISTINCT sk) AS storyLinkCount`.
       `isKeyActivity = ("keyActivity" in JSON.parse(attributesJson ?? "{}"))` —
       the **presence** predicate (DD-10), **never** a `.marked === true`
       comparison (do not add a phantom `marked:false` branch). `storyLinkCount`
       counts distinct `(story,kpi)` `IMPACTS_KPI` edges (two stories → same KPI
       counts as 2, AC-16).
    3. Activity→KPI links (directed + undirected base-route): `MATCH
       (k:KPI)-[r:ALIGNED_TO]->(a:Activity) WHERE a.id IN $scopedIds RETURN
       a.id AS activityId, k.id AS kpiId, k.name, k.unit, k.target_direction,
       r.direction, r.weight`. `r.direction` is `null` for a pre-existing
       base-route edge (surfaced as an undirected cell, DD-07). **N-02 comment:**
       the `->(a:Activity)` filter is deliberate.
- **Verification**: `api/__tests__/kpi-impact-matrix.test.ts` (Neo4j-free unit,
  DD-06): columns = distinct impacted KPIs, cells `{direction,weight}`|null, meta
  counts (AC-04); a key activity with no directional link → a gap entry, a
  directional link drops it out, an undirected-only link **stays** a gap, a
  non-key activity is not a gap, `meta.gapCount===gaps.length` (AC-05); an
  activity with two distinct `(story,kpi)` edges → `storyLinkCount===2` (distinct
  edges, not distinct KPIs), no story links → 0, `storyLinkCount` does not alter
  gaps (AC-16); `bun run typecheck`.

### T-06 — Roll-up read + composition + pure roll-up/status assembler

- **Files** (2): `api/src/storage/kpi-impact.ts` (extend — `readRollupInputs`,
  `fetchTrends`), `api/src/derive/kpi-impact-matrix.ts` (extend — `assembleRollup`
  + status derivation)
- **Implements**: design §3.5, §4.1, §4.5, §4.6, DD-03, DD-04, N-01, C-01 —
  closes AC-06 (unit half); supports FR-08, FR-09, NFR-02, NFR-04
- **Complexity**: complex
- **Blocked by**: T-01, T-05 (hard build-order — needs `kpi-okr-governance`'s
  `GET /api/v1/kpi-trends/:kpiId` / `handleKpiTrendsGet(req, kpiId)` merged)
- **Blocks**: T-08, T-12
- **Steps**:
  - `assembleRollup(input: RollupInput): KpiImpactRollup` in
    `api/src/derive/kpi-impact-matrix.ts` — **pure** (DD-06). Input `RollupKpi{ id,
    name, unit, targetValue, targetDirection, warningThreshold, criticalThreshold,
    latestValue }` + `RollupLink{ kpiId, weight }` + `measurementsAvailable`.
    Per-KPI `status` derivation (§3.5, **deterministic**, NFR-04):
    `latestValue===null → "no_data"`; `higher_is_better`: `< critical` →
    `critical`, `< warning` → `warning`, else `on_track`; `lower_is_better`: `>
    critical` → `critical`, `> warning` → `warning`, else `on_track`;
    `target_is_exact`: `|latestValue − targetValue|` against the thresholds as
    tolerance bands; an **absent** threshold skips that band (a KPI with data +
    no thresholds → `on_track`, documented fallback). `impactLinkCount` =
    scoped links pointing at the KPI (activity + story); `aggregateImpactWeight =
    min(1.0, Σ weights)` (FR-08). Same graph + same trends → same status (NFR-04).
    Never a crash on `null` (FR-08/FR-09).
  - `readRollupInputs(driver, modelId, fetchTrends)` in `storage/kpi-impact.ts`
    (§4.5): **`model_not_found` pre-check (N-01)** as in T-05; then resolve the
    set of KPIs any scoped activity **or** story impacts (union of `ALIGNED_TO`
    from scoped activities + `IMPACTS_KPI` from scoped stories) + their scoped
    link weights; read each such KPI's catalog fields (`target_value`,
    `target_direction`, `warning_threshold`, `critical_threshold`, `unit`,
    `name`) from the `KPI` node; call `fetchTrends(kpiId)` **once per linked KPI**.
  - `fetchTrends(kpiId)` (§4.6, DD-03/DD-04, **C-01 seam**): a **server-side,
    in-process** composition of the governed route — **not** a network round-trip,
    **not** a direct store query (NFR-02). Import the governed handler
    `handleKpiTrendsGet(req, kpiId)` (`api/src/routes/kpi-trends.ts`), invoke it
    with a synthesized `Request` for `/api/v1/kpi-trends/:kpiId` (**no window
    override → its 30-day default**, DD-04), parse the JSON body, read
    `payload.measurements`. **`latestValue = measurements.at(-1)?.value ?? null`**
    — the **last** (max-`measured_at`) element of the ASC-ordered windowed array
    (**C-05 fix**, DD-04), **never** `measurements[0]` (that is the *oldest*). An
    empty array (KPI has none, or all predate the window) → `latestValue = null`
    → `no_data`. A per-KPI `404`/error → that KPI has no data (`null`). A
    **wholesale** failure (Neo4j unreachable / the handler throws) → set
    `measurementsAvailable = false`, force every `latestValue = null` (all
    `no_data`), and the endpoint returns `200` with the degraded roll-up,
    **never 500** (FR-09). **C-01:** this seam is the only measurement read;
    a future V-02 Postgres resolution swaps `fetchTrends` transparently. The
    endpoint is **read-only** — no measurement/KPI/SLA writes (FR-09, NFR-02).
- **Verification**: `api/__tests__/kpi-impact-matrix.test.ts` (extend, T-05's
  file) — status-derivation + `latestValue`-extraction unit cases: each
  `target_direction` band → correct `status`; a `null` `latestValue` → `no_data`,
  no crash; `aggregateImpactWeight` capped at 1.0; a windowed ASC array →
  `latestValue = last element` (DD-04). Integration in T-12; `bun run typecheck`.

### T-07 — Route-permission mapping + RBAC role grant

- **Files** (2): `api/src/auth/rbac-permissions.ts` (modify),
  `api/src/scripts/seed-rbac-roles.ts` (modify)
- **Implements**: design §4.8 — closes AC-07 (authz half); supports FR-11, NFR-06
- **Complexity**: moderate
- **Blocked by**: T-01 (hard build-order — `seed-rbac-roles.ts` +
  `business_architect` role land with `model-workspace-core`)
- **Blocks**: T-08, T-12
- **Steps**: In `api/src/auth/rbac-permissions.ts` add **eight**
  `ROUTE_PERMISSIONS` rows via the `P(method, path, permission)` helper (verified),
  **specific-before-parameterized**, inserted **before** `model-workspace-core`'s
  parameterized `models/:id` rows:
  ```
  P("GET",    "models/:modelId/kpi-impact/matrix",                 "kpi_impact:read"),
  P("GET",    "models/:modelId/kpi-impact/rollup",                 "kpi_impact:read"),
  P("GET",    "models/:modelId/kpi-impact/activity-links",         "kpi_impact:read"),
  P("POST",   "models/:modelId/kpi-impact/activity-links",         "kpi_impact:write"),
  P("DELETE", "models/:modelId/kpi-impact/activity-links/:linkId",  "kpi_impact:write"),
  P("GET",    "models/:modelId/kpi-impact/story-links",            "kpi_impact:read"),
  P("POST",   "models/:modelId/kpi-impact/story-links",            "kpi_impact:write"),
  P("DELETE", "models/:modelId/kpi-impact/story-links/:linkId",     "kpi_impact:write"),
  ```
  `matchSegments` rejects on segment-count first (4-/5-segment rows never collide
  with the 3-segment `models/:id` rows), but the security-critical property is
  that **every** new route has a row (an unmapped route → `getRoutePermission`
  returns `null` → router skips the RBAC check → silent open write). **No new
  route is `public`**; auth stays in the central gate (`router.ts` →
  `getRoutePermission` → RBAC check) — **no per-route check** (NFR-06, FR-11).
  In `seed-rbac-roles.ts` **add** `"kpi_impact:read"` + `"kpi_impact:write"` to
  the existing `business_architect` role's permission array (idempotent `MERGE
  (r:RBACRole {name})` — this spec **modifies** the role `model-workspace-core`
  FR-11 created; it does **not** create it).
- **Verification**: `api/__tests__/kpi-impact-authz.integration.test.ts` (T-12 —
  a session without `kpi_impact:write` → `403` on link POST/DELETE, with it →
  `201`/`204`; a `kpi_impact:read` session → `200` on matrix/rollup/list GETs;
  `getRoutePermission` resolves each new route, never `null`; `business_architect`
  resolves both permissions; no new route `isPublicRoute`); `bun run typecheck`.

### T-08 — Route handlers + router dispatch

- **Files** (2): `api/src/routes/kpi-impact.ts` (new),
  `api/src/router.ts` (modify)
- **Implements**: design §4.7, §4.1, N-01, N-03 — supports FR-01..FR-08, FR-09,
  FR-10
- **Complexity**: complex
- **Blocked by**: T-02, T-03, T-04, T-05, T-06, T-07
- **Blocks**: T-10, T-11, T-12
- **Steps**: **Eight** handlers (N-03) in `api/src/routes/kpi-impact.ts` returning
  the `{error:{code,message,details?}}` envelope via `_helpers.ts`
  (`ok`/`noContent`/`error`/`parseWith`/`readJson`, verified exports; `parseWith`
  is the shared ZodError→400 mapper, no per-route 500):
  - `handleActivityLinkCreate` — `POST /models/:modelId/kpi-impact/activity-links`
    → `201 impactLinkRowSchema`; `404 activity_not_found`/`kpi_not_found`; bad
    direction/weight → `400`.
  - `handleActivityLinksList` — `GET …/activity-links` → `200 {rows}`;
    `?activityId=`/`?kpiId=` filters.
  - `handleActivityLinkDelete` — `DELETE …/activity-links/:linkId` → `204`;
    `404 impact_link_not_found` (incl. mis-routed story id).
  - `handleStoryLinkCreate` — `POST …/story-links` → `201 impactLinkRowSchema`;
    `404 story_not_found`/`kpi_not_found`; `400`.
  - `handleStoryLinksList` — `GET …/story-links` → `200 {rows}`;
    `?storyId=`/`?kpiId=` filters.
  - `handleStoryLinkDelete` — `DELETE …/story-links/:linkId` → `204`;
    `404 impact_link_not_found`.
  - `handleMatrix` — `GET …/matrix` → `200 kpiImpactMatrixSchema`; unknown model
    → `404 model_not_found` (N-01 pre-check via T-05).
  - `handleRollup` — `GET …/rollup` → `200 kpiImpactRollupSchema`; unknown model
    → `404 model_not_found` (N-01 pre-check via T-06); **degrades to `no_data` +
    `measurementsAvailable:false`, never 500** (FR-09).
  Read-only handlers (`handleMatrix`/`handleRollup`/lists) never write (FR-09).
  In `api/src/router.ts` add a `models/:modelId/kpi-impact*` block of
  `sub.match(/…/)` regexes **after** the `model-workspace-core` `models*` block
  and the `story-spec-core`/`key-activity-optimizer` blocks,
  **specific-before-parameterized**: (1) `^models\/([^/]+)\/kpi-impact\/matrix$`
  (GET); (2) `^…\/rollup$` (GET); (3) `^…\/activity-links$` (GET list, POST
  create); (4) `^…\/story-links$` (GET list, POST create); (5)
  `^…\/activity-links\/([^/]+)$` (DELETE); (6) `^…\/story-links\/([^/]+)$`
  (DELETE). The 5-segment `…-links/:linkId` DELETE regexes never collide with the
  4-segment bare `…-links` list/create regexes; specific-first kept per house
  convention.
- **Verification**: `api/__tests__/kpi-impact-matrix.integration.test.ts` (plus
  every other T-11/T-12 `kpi-impact-*.integration.test.ts` file) exercises the 8
  handlers + router dispatch through the route surface; `bun run typecheck`.

### T-09 — `IMPACTS_KPI` runtime-registry edge registration

- **Files** (2): `api/src/scripts/register-kpi-impact-edges.ts` (new),
  `package.json` (root, modify — `register:kpi-impact` script)
- **Implements**: design §4.9, DD-02, XD-01 — supports FR-02, NFR-02
- **Complexity**: moderate
- **Blocked by**: T-01 (hard build-order — requires `UserStory` (story-spec-core)
  + `KPI` (`_baseline`/kpi-okr-governance) labels registered first)
- **Blocks**: T-04, T-11
- **Steps**: `api/src/scripts/register-kpi-impact-edges.ts` (mirroring
  `story-spec-core`'s `register-story-labels.ts`) calls `createEdgeType(driver,
  { name: "IMPACTS_KPI", description, usage_example, endpoints: [{ fromLabel:
  "UserStory", toLabel: "KPI" }] }, "system")` **idempotently** — a re-run that
  hits the existing type swallows `name_conflict` (run-once-per-boot-safe,
  matching `story-spec-core`'s pattern). `createEdgeType` is **reused** from
  `api/src/ontology/storage/edge-types.ts:209` — **not** re-implemented. Add a
  `register:kpi-impact` script entry to the root `package.json` (mirrors
  `register:story`) and wire it into the same boot registration path the other
  runtime labels use. **`EDGE_ENDPOINTS`/`NODE_LABELS` consts are NOT edited**
  (AC-15).
- **Verification**: `api/__tests__/kpi-impact-story-links.integration.test.ts`
  (T-11) asserts `IMPACTS_KPI` is registered via the runtime registry with the
  `EDGE_ENDPOINTS` const unchanged and a `(:UserStory)-[:IMPACTS_KPI]->(:KPI)`
  edge is writable; `bun run typecheck`.

### T-10 — OpenAPI registration

- **Files** (1): `api/src/routes/openapi.ts` (modify)
- **Implements**: design §7, §5 — closes AC-17 (openapi half); supports FR-10
- **Complexity**: moderate
- **Blocked by**: T-01, T-02, T-08
- **Steps**: Register the kpi-impact request + response schemas
  (`activityLinkCreateSchema`, `storyLinkCreateSchema`, `impactLinkRowSchema`,
  `kpiImpactMatrixSchema`, `kpiImpactRollupSchema`) and `registerPath` each of the
  **8** routes (§4.7), generated from the **same T-01 zod definitions** (no
  hand-maintained copy, FR-10). The new `kpi_not_found` + `impact_link_not_found`
  codes (and the reused `activity_not_found`/`story_not_found`) surface in the
  shared `errorEnvelopeSchema` responses.
- **Verification**: `api/__tests__/kpi-impact-openapi.integration.test.ts` (with
  T-02) — the 8 route paths and the added error codes appear in `GET
  /api/v1/openapi.json` (AC-17); `bun test:integration`.

### T-11 — Link + matrix + gaps integration tests

- **Files** (5): `api/__tests__/kpi-impact-activity-links.integration.test.ts`
  (new), `kpi-impact-story-links.integration.test.ts` (new),
  `kpi-impact-links-crud.integration.test.ts` (new),
  `kpi-impact-matrix.integration.test.ts` (new),
  `kpi-impact-gaps.integration.test.ts` (new)
- **Implements**: design §8, §4.2–§4.4 — closes AC-01, AC-02, AC-03, AC-04,
  AC-05, AC-16 (integration half); supports FR-01..FR-07
- **Complexity**: complex
- **Blocked by**: T-08, T-09
- **Blocks**: —
- **Steps**: Seed fixtures **API-only** (design §8 — no direct-driver seeding
  except the `:KPIMeasurement` fixture in T-12): `POST /api/v1/models` +
  `model-workspace-core`'s domain/journey routes + core `POST /api/v1/nodes`
  (activities) + `POST /api/v1/edges` (`PART_OF`, `DESCRIBES_ACTIVITY`) +
  `story-spec-core`'s story routes (`UserStory`) + `kpi-okr-governance`'s KPI
  routes. Then:
  - `kpi-impact-activity-links.integration.test.ts` (**AC-01**): `POST
    …/activity-links` creates `ALIGNED_TO` with `direction`+`weight∈[0,1]` from a
    scoped Activity to a non-archived KPI; `201` + `linkId` (elementId); re-link
    the same pair updates direction/weight **without a second edge**
    (MERGE-on-pair); non-scoped `:activityId` → `404 activity_not_found`;
    unknown/archived kpi → `404 kpi_not_found`; bad weight/direction → `400`.
  - `kpi-impact-story-links.integration.test.ts` (**AC-02**): `IMPACTS_KPI`
    registered via the runtime registry (`EDGE_ENDPOINTS` const unchanged);
    `(:UserStory)-[:IMPACTS_KPI {direction,weight}]->(:KPI)` from a model-scoped
    story (joined on `UserStory.id`); `201` + **populated `sourceName`** (`s.name`,
    C-02); MERGE-on-pair; non-scoped story → `404 story_not_found`; `404
    kpi_not_found`; bad direction/weight → `400`.
  - `kpi-impact-links-crud.integration.test.ts` (**AC-03**): `GET …/activity-links`
    + `.../story-links` return rows w/ direction/weight/names, filterable by
    `?activityId=`/`?storyId=`/`?kpiId=`; `DELETE …/activity-links/:linkId` →
    `204`, 2nd delete → `404`; same for story links; **mis-routed id (N-01):** a
    story link's elementId to the activity DELETE (and vice-versa) → `404
    impact_link_not_found`, never a cross-type delete.
  - `kpi-impact-matrix.integration.test.ts` (**AC-04 + AC-16**): `GET …/matrix`:
    rows = scoped activities (id/name/journey/`isKeyActivity` from
    `attributes.keyActivity` **presence**, DD-10); columns = distinct impacted
    KPIs; cells `{direction,weight}`|null; meta counts; a KPI impacted only by a
    model-B activity absent from model A's columns (NFR-01). **AC-16:** an activity
    backed by two distinct stories each carrying one `IMPACTS_KPI` link (one pair
    reusing the same KPI) → `storyLinkCount === 2`; no story links → 0;
    `storyLinkCount` does not alter `gaps`/`gapCount`.
  - `kpi-impact-gaps.integration.test.ts` (**AC-05**): a key activity
    (`attributes.keyActivity` **present**, not `.marked===true`, DD-10) with **no
    directional** link → a `gaps` entry `{activityId, reason:"key_activity_no_kpi"}`;
    after a directional `POST …/activity-links` it **drops out**; a key activity
    whose only link is a base-route `ALIGNED_TO` with `direction:null` **stays** in
    gaps (DD-07/C-04); a non-key activity with no links **not** in gaps;
    `meta.gapCount === gaps.length`.
- **Verification**: `api/__tests__/kpi-impact-activity-links.integration.test.ts`
  + `kpi-impact-story-links.integration.test.ts`
  + `kpi-impact-links-crud.integration.test.ts`
  + `kpi-impact-matrix.integration.test.ts`
  + `kpi-impact-gaps.integration.test.ts`; run via `bun test:integration`.

### T-12 — Roll-up + authz integration tests

- **Files** (2): `api/__tests__/kpi-impact-rollup.integration.test.ts` (new),
  `kpi-impact-authz.integration.test.ts` (new)
- **Implements**: design §8, §4.5, §4.6, §4.8, C-01, N-01 — closes AC-06, AC-07
  (integration half); supports FR-08, FR-09, FR-11, NFR-01, NFR-04
- **Complexity**: complex
- **Blocked by**: T-07, T-08
- **Blocks**: —
- **Steps**:
  - `kpi-impact-rollup.integration.test.ts` (**AC-06**): seed **Neo4j
    `:KPIMeasurement` nodes** (`(:KPIMeasurement {kpi_id, measured_at, value})` —
    the source `kpi-trends` actually reads, V-02/DD-03; **not** Postgres
    `kpi_measurements` rows). **Docstring (C-01):** state that the roll-up reflects
    `:KPIMeasurement` (what `kpi-trends` reads), which is disjoint from Postgres —
    OQ-2 is escalated to the user; this test does not read Postgres. Assert:
    roll-up `latestValue` = the **last** (max-`measured_at`) measurement in the
    30-day window (DD-04/C-05, **not** the oldest); `status` derived vs
    `target_value`/thresholds/`target_direction` (§3.5); `impactLinkCount` +
    capped `aggregateImpactWeight`; a KPI with no `:KPIMeasurement` → `no_data`;
    with the measurement source made unavailable (`kpi-trends` errors) →
    `meta.measurementsAvailable:false` + all `no_data`, **not** 500 (FR-08, FR-09,
    NFR-04). **Needs only the Neo4j CI service** (no Postgres).
  - `kpi-impact-authz.integration.test.ts` (**AC-07**): seed **two** models; `GET
    …/matrix` for model A excludes model-B-only activities/links; a session without
    `kpi_impact:write` → `403` on link POST/DELETE; a `kpi_impact:read` session →
    `200` on matrix/rollup/list GETs; the `business_architect` role resolves both
    permissions; `getRoutePermission` resolves each new route (never `null`); no
    new route `isPublicRoute`.
- **Verification**: `api/__tests__/kpi-impact-rollup.integration.test.ts`
  + `api/__tests__/kpi-impact-authz.integration.test.ts` (the two files above);
  run via `bun test:integration` (Neo4j only).

### T-13 — PWA api client (`kpiImpact` block)

- **Files** (1): `pwa/src/api.ts` (modify)
- **Implements**: design §4.11, DD-12 — supports FR-12, FR-13
- **Complexity**: simple
- **Blocked by**: T-01
- **Blocks**: T-14
- **Steps**: Add a `kpiImpact` block to the exported `api` object (design §4.11),
  reusing the **private** `json<T>()` fetch wrapper internally (the *block* is
  exported, `json` is not — DD-12; do **not** export or call `json<T>` from the
  view): `matrix(modelId, signal?)` (GET `…/matrix`), `rollup(modelId, signal?)`
  (GET `…/rollup`), `listActivityLinks`/`listStoryLinks(modelId, filters?)`,
  `createActivityLink`/`createStoryLink(modelId, body)` (POST),
  `deleteActivityLink`/`deleteStoryLink(modelId, linkId)` (DELETE). All paths use
  `encodeURIComponent`. Types (`KpiImpactMatrix`, `KpiImpactRollup`,
  `ImpactLinkRow`) inferred from the shared T-01 zod schemas. The link-editor KPI
  picker **reuses** `kpi-okr-governance`'s `api.kpi.list()` (`GET /api/v1/kpis`) —
  **not** re-implemented (DD-12).
- **Verification**: `pwa/src/__tests__/kpi-impact-matrix.test.tsx` (T-14) consumes
  + asserts the `kpiImpact` api block transitively (the view fetches through it);
  `bun run typecheck`.

### T-14 — KpiImpactMatrix view + grid + link editor + gaps strip + roll-up panel + 4 states + registration

- **Files** (3): `pwa/src/views/model/KpiImpactMatrix.tsx` (new),
  `pwa/src/views/model/KpiImpactMatrix.module.css` (new),
  `pwa/src/views/index.tsx` (modify)
- **Implements**: design §4.10, §6, DD-12 — closes AC-08, AC-11 (ready+error+gaps
  strip), AC-12, AC-13; supports FR-12, FR-13, FR-14, UX-01/02/05/06
- **Complexity**: complex
- **Blocked by**: T-13 (hard build-order — `useActiveModel()` + the `kpi-impact`
  `ModelTabPlaceholder` slot land with `model-workspace-core`)
- **Blocks**: T-15, T-16
- **Steps**: In `pwa/src/views/index.tsx`, **replace** the `kpi-impact` tab's
  `<ModelTabPlaceholder spec="kpi-impact-mapping"/>` dispatch with
  `"kpi-impact": (r) => <KpiImpactMatrix route={r} />` (the **only** edit to that
  file — `route.ts`/`SURFACES` stay `model-workspace-core`'s, UX-06).
  `KpiImpactMatrix` reads the active `BusinessModel` from `useActiveModel()`
  (`pwa/src/context/ActiveModelContext.tsx` — **does not re-implement model
  selection**), keys its fetch on `activeModel.id`, and fetches `GET
  …/kpi-impact/matrix` via `api.kpiImpact.matrix` (T-13). Render **all four
  states**:
  - **loading** (AC-09) — skeleton via `Loading` from `views/_shared.tsx`.
  - **empty** (AC-10) — `meta.activityCount === 0` **or** no impact links → a
    `Card` message pointing to key-activity marking (`#/model/key-activities`) +
    link creation; no grid.
  - **error** (AC-11) — `ErrorState` from `views/_shared.tsx` (message only, no
    built-in retry) **plus a sibling catalog `Button`** whose click re-invokes
    `api.kpiImpact.matrix(activeModel.id)` and re-enters loading (retry is a
    sibling, not part of `ErrorState`).
  - **ready** (AC-08) — the **activity × KPI grid** (`role="grid"`): rows =
    activities (name + key-activity + gap indicator), columns = KPIs, cells = a
    directional-weight chip (↑ `increases` / ↓ `decreases` + weight) in linked
    cells, empty in unlinked. When `gaps` is non-empty a **gaps strip** renders
    **above** the grid (AC-11, FR-13).
  **Link editing + gaps + roll-up panel (FR-13, AC-11/AC-13):** (a) a **gaps
  strip** listing measurability gaps, each with a "link a KPI" affordance; (b)
  clicking an **empty cell** (or a gap's "link" action) opens a **link editor**
  (catalog `SidePanel`/`Modal`) to pick a KPI (from `api.kpi.list()`), a
  **direction** (increases/decreases toggle), and a **weight** slider
  (`input[type=range]`, `[0,1]`), then `POST …/activity-links`
  (**optimistic, rollback on error**); an existing cell's chip opens the same
  editor pre-filled for edit (re-POST idempotent) + delete (`DELETE
  …/activity-links/:linkId`); (c) selecting a **KPI column header** opens a
  **roll-up panel** showing that KPI's measured status from `GET …/rollup` (latest
  value, status, aggregate impact weight). **Tokens + a11y (NFR-07, UX-02/05):**
  `KpiImpactMatrix.module.css` uses only `var(--…)` from
  `pwa/src/styles/companygraph/tokens.css`; catalog components (`DataTable`/grid,
  `Card`, `Button`, `Modal`/`SidePanel`, `Loading`/`ErrorState`) **before**
  inventing new ones — **no new catalog component, no catalog component edited**
  (so `pwa/src/components/*` are not touched). ARIA landmark on the view;
  `role="grid"` + header semantics; Tab reaches the gaps-strip actions → each
  cell/link action → the link-editor controls in DOM order; the KPI `select`,
  direction toggle, and weight `input[type=range]` (exposing `aria-valuenow`) are
  keyboard-operable; opening the link editor or roll-up panel moves focus into it
  and Escape/close returns focus to the originating cell/header (reusing the
  catalog `SidePanel`/`Modal` focus-trap — **not** re-implemented). No
  canvas/gesture/scroll-hijack/global-keyboard handler introduced; the weight
  slider's arrow-key change is the intended native behaviour (not suppressed).
  **Model-scope + reload (FR-14, AC-14):** switching the active model refetches;
  deep-link `#/model/kpi-impact` + reload re-renders for the persisted model
  (persistence is `model-workspace-core` FR-15, consumed via `useActiveModel()`).
- **Verification**: `pwa/src/__tests__/kpi-impact-matrix.test.tsx` (T-14's own
  file: `#/model/kpi-impact` → `KpiImpactMatrix` not `ModelTabPlaceholder`; reads
  `useActiveModel()`; ready grid w/ rows + KPI columns + directional-weight chip
  ↑/↓ + weight in linked cells, empty in unlinked — AC-08) + **CLI** (AC-12,
  design §8, deterministic exit code): `bun run scripts/design-conformance.ts
  --view pwa/src/views/model/KpiImpactMatrix.tsx` **and** `bun run
  scripts/design-conformance.ts --view
  pwa/src/views/model/KpiImpactMatrix.module.css` — both exit 0, zero
  token/component violations + **manual** (AC-13, keyboard): with the stack up,
  load `#/model/kpi-impact` keyboard-only — Tab to a gap's "link a KPI" action and
  press Enter (expect the link editor opens and focus enters it), Tab through KPI
  select → direction toggle → weight slider (expect arrow keys change
  `aria-valuenow`), submit and press Escape (expect focus returns to the
  originating cell and the new chip renders).

### T-15 — KpiImpactMatrix view-state tests (loading / empty / error+retry / gaps strip)

- **Files** (1): `pwa/src/__tests__/kpi-impact-matrix-states.test.tsx` (new)
- **Implements**: design §4.10, §6 — closes AC-09, AC-10, AC-11
- **Complexity**: moderate
- **Blocked by**: T-14
- **Blocks**: —
- **Steps**: jsdom component test of the non-ready states: **loading** skeleton
  while `GET …/matrix` is pending (AC-09); **empty** state (no scoped activities
  **or** no links) showing the message pointing to key-activity marking + link
  creation and **no** grid (AC-10); **error** state renders `ErrorState` **plus
  the sibling retry `Button`** whose click re-invokes
  `api.kpiImpact.matrix(activeModel.id)` and re-enters loading; the **gaps strip**
  renders **above** the grid when `gaps` is non-empty (AC-11, FR-13, UX-01).
- **Verification**: `pwa/src/__tests__/kpi-impact-matrix-states.test.tsx` (AC-09,
  AC-10, AC-11).

### T-16 — KpiImpactMatrix model-context reload e2e

- **Files** (1): `pwa/playwright/kpi-impact-matrix-context.spec.ts` (new)
- **Implements**: design §4.10 — closes AC-14; supports FR-14, UX-06
- **Complexity**: moderate
- **Blocked by**: T-14
- **Blocks**: —
- **Steps**: Playwright spec: with a non-reference model (model B) active,
  navigate to `#/model/kpi-impact`, reload → the same route renders
  `KpiImpactMatrix` showing **model B's** matrix (active-model persistence is
  `model-workspace-core` FR-15; this view refetches for the persisted model).
  Assert no cross-model leakage in the grid (server-enforced, §4.2/§4.4). Seed via
  the API (models + domains + activities + KPI + link routes).
- **Verification**: `pwa/playwright/kpi-impact-matrix-context.spec.ts` (AC-14).

## Cross-cutting verification (whole-spec)

- **AC-15** (transpile clean + no compile-time schema-array edit): `bun run
  typecheck` exit 0; `manual: git diff shared/src/schema/nodes.ts
  shared/src/schema/edges.ts` shows **no** additions to `NODE_LABELS` or
  `EDGE_ENDPOINTS` (`IMPACTS_KPI` is a runtime-registry edge, T-09; the activity
  link reuses the existing `ALIGNED_TO` with an added `direction` property; no new
  label/edge — NFR-02, NFR-06). Not a standalone task — checked at the final
  validation sweep (after T-03/T-04/T-09).

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with behaviour | the task's listed test (`bun test <path>` / `bun test:integration`) |
| tasks touching pwa views (T-14) | `bun run scripts/design-conformance.ts --view <file>` for **every file the task touches** under `pwa/src/views/` — `.tsx` and `.module.css` each get their own invocation (AC-12) |
| final task | `bun test` + `bun test:integration` (needs the **Neo4j** CI service only; **no Postgres** for AC-06) + full AC-01..AC-17 sweep + AC-15 (`git diff` NODE_LABELS/EDGE_ENDPOINTS) |

## Traceability summary

| FR | Tasks | AC |
|----|-------|-----|
| FR-01 activity link + direction | T-01, T-03, T-08, T-11 | AC-01, AC-07 |
| FR-02 story link `IMPACTS_KPI` | T-01, T-04, T-08, T-09, T-11 | AC-02 |
| FR-03 list + delete | T-03, T-04, T-08, T-11 | AC-03 |
| FR-04 direction/weight validation | T-01, T-03, T-04 | AC-01, AC-02 |
| FR-05 coverage matrix | T-01, T-05, T-08, T-11 | AC-04 |
| FR-06 gap detection (directional-only) | T-05, T-08, T-11 | AC-05 |
| FR-07 story coverage rider | T-01, T-05, T-11 | AC-16 |
| FR-08 roll-up | T-01, T-06, T-08, T-12 | AC-06 |
| FR-09 read-only + degrade, never 500 | T-06, T-08, T-12 | AC-06 |
| FR-10 openapi + error codes | T-01, T-02, T-08, T-10 | AC-17 |
| FR-11 RBAC route perms | T-07, T-12 | AC-07 |
| FR-12 KpiImpactMatrix view + 4 states | T-13, T-14, T-15 | AC-08, AC-09, AC-10, AC-11 |
| FR-13 link editor + gaps + rollup panel | T-14 | AC-11, AC-13 |
| FR-14 model-scope + reload survival | T-14, T-16 | AC-14 |
| NFR-01 model isolation | T-03, T-04, T-05, T-12 | AC-04, AC-07 |
| NFR-02 no new label / no compile-time schema edit | T-03, T-04, T-06, T-09 | AC-02, AC-06, AC-15 |
| NFR-03 as-built field preservation | T-01, T-03 | AC-01 |
| NFR-04 deterministic + degrade | T-05, T-06, T-12 | AC-06 |
| NFR-05 live compute (no cache/scheduler) | T-05, T-06 | AC-04, AC-06 |
| NFR-06 house rules (central-gate auth, no per-route) | T-07, T-08, all | AC-07, AC-15 |
| NFR-07 tokens-only + conformance | T-14 | AC-12, AC-13 |
