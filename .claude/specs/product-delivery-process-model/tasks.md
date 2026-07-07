---
feature: "product-delivery-process-model"
created: "2026-07-06"
author: "spec-author"
status: "draft"
reviewing_requirements_revision: 1
reviewing_design_revision: 1
size: "medium"
total_tasks: 13
---

# Tasks: product-delivery-process-model

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocked by` / `Blocks`); no out-of-order execution. The build is a
  server-side content/seed spec — **no `pwa/` file, no new view** (scope).
- **Deferred-green rule**: every write in this spec drives the loopback API on
  `127.0.0.1:8787`, so its **integration** tests need a running API + Neo4j (+
  Postgres for AC-10). At each task's checkpoint run `bun run typecheck`; the
  full `*.integration.test.ts` files run green under `bun test:integration`
  once the stack is up (`bun run dev`) **and** the dependency seeds have run —
  see Preconditions.
- **Preconditions (design §10)**: every integration test requires, in order,
  (1) `bun run seed:saas-operator` (operator root + `product_delivery` domain +
  shared System/Role catalog), (2) `bun run seed:saas-metric-library`
  (`metric-deploy-frequency`), (3) this spec's fixture picked up by the
  foundation loader, (4) `bun run seed:product-delivery`. Tests run these in a
  `beforeAll` or assert-and-fail-clearly if a dependency is unseeded.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook (`.claude/hooks/spec-completion-check.sh`) blocks STATUS.md
  updates without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h, one judgment
  call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task run `bun run typecheck`; after
  tasks that ship behaviour, also run the listed test. **No task touches
  `pwa/src/views/`**, so `scripts/design-conformance.ts` is not exercised.
- **Ownership guard (NFR-01/NFR-04/NFR-05, XD-04/XD-05/XD-08)**: the files under
  design §11 "Explicitly NOT edited" are off-limits and **no task edits them** —
  `shared/src/schema/{nodes,edges}.ts` (no schema-array edit);
  `api/src/routes/{kpi-crud,kpi-sla-alignment,stories,capabilities,ontology-import,edges,import,nodes}.ts`
  + their storage (graph-core / kpi-okr-governance / story-spec-core /
  ddd-system-modeling — reused as-is);
  `api/src/routes/{risk-register,risk-compliance,change-requests,compliance-rules,sla-crud}.ts`
  (risk-compliance-change / kpi-okr-governance, XD-04/XD-08);
  `api/src/storage/model-lifecycle-guard.ts`;
  `api/src/seed/link-kpi-metric.ts`, `api/src/seed/ensure-*.ts`,
  `api/scripts/seed-saas-metric-library.ts` (saas-metric-library — consumed);
  `api/scripts/seed-saas-operator.ts`, `api/src/seed/ensure-catalog.ts`,
  `api/src/seed/governed-seed-helper.ts` (saas-operator-foundation — consumed);
  `pwa/**`, `pwa/src/route.ts`, `SURFACES`, `pwa/src/views/index.tsx`,
  `pwa/src/App.tsx` (XD-05); `api/src/auth/rbac-permissions.ts`,
  `api/src/errors.ts` (no new permission / error code). `package.json` is edited
  **once** (the `seed:product-delivery` script line, T-11).

## Design-basis pins (design rev 1 approved)

Design rev 1 is `approved` (`review-design.md` pass 2/2 = **approve**, zero
blockers). The binding decisions the implementer must not re-derive:

| Design decision (rev 1) | Binding for execution | Locked in task |
|-------------------------|-----------------------|----------------|
| **Content split** (§3): the fixture carries **only** journeys, activities, slice-local roles/systems + their fixture-local edges (`Activity→UserJourney PART_OF`, `PRECEDES`, slice-local `EXECUTES`/`USES_SYSTEM`). Everything else — KPIs, `MEASURES`, `ALIGNED_TO`, stories, ACs, DDD, risks, **and the cross-reference edges** (`UserJourney→Domain PART_OF`, shared-role `EXECUTES`, shared-system `USES_SYSTEM`) — is created by the self-owned seed step through governed routes. | Fixture = process content only; governed routes for the rest. | T-01, T-02, T-04..T-09 |
| **B-01 id scheme** (§3.1.1): every fixture node + the bounded context carries a hand-authored **UUIDv7 `id`** from the `018f0200-*` allocation block **plus** a human-readable `attributes.seedKey`; the seed step and every AC resolve fixture nodes **by `seedKey`** (TS-side `JSON.parse(attributes_json).seedKey`), never by a literal string as an id. | Ids are UUIDv7; lookup contract is `seedKey`. | T-01, T-03..T-09 |
| **B-02 metric resolve** (§5.1 step 4, §5.3): `PRODUCT_KPI_METRIC_MAP` values are metric **seedKeys**; the step resolves each to the metric's real UUIDv7 node id (`JSON.parse(m.attributes_json).seedKey`) before calling `linkKpiToMetric` (whose `toId` must be a real node id). | Map holds seedKeys; resolve to node id before linking. | T-02, T-05 |
| **OQ-1 / OQ-1'** (§2, §2.2, §5.3): author all **four** Product KPIs now (XD-10 depth) but link only **Release Frequency → `metric-deploy-frequency`** (the one canonical metric today); the other three `MEASURES` links are **deferred** behind `PRODUCT_KPI_METRIC_MAP` (commented out). AC-06 asserts exactly the links the map declares (today: one). Adding the three metrics to `saas-metric-library` is a user decision surfaced as OQ-1' — **not** made by this spec (NFR-01). | Four KPIs; one `MEASURES` link today; three deferred by the map. | T-04, T-05 |
| **OQ-2** (§5.4): stories/ACs via the governed **model-scoped** routes (`POST /api/v1/models/:root/stories[/…/acceptance-criteria]`) which set the top-level `persona`/`action`/`benefit`/`narrative` + `given`/`when`/`then`/`ordinal` — the generic import path cannot. Not the fixture. | Governed story routes; model id = operator root. | T-07 |
| **OQ-3** (§5, §9): a feature-owned `bun run seed:product-delivery` CLI, run **after** `seed:saas-operator` + `seed:saas-metric-library`; the fixture rides the foundation loader (zero loader edit); fixed step order resolve→assert-fixture→cross-ref edges→KPIs→MEASURES→ALIGNED_TO→stories→ACs→DDD→risks. | Feature-owned CLI, run after deps; fixed order. | T-10, T-11 |
| **OQ-4** (§5.6): each risk links to the graph entity it concerns — `linked_entity_type="domain"` + resolved `product_delivery` domain id (function-level) or `="activity"` + the specific at-risk activity id (resolved by `seedKey`). | Risks carry `linked_entity_*`. | T-08 |
| **D-1 / D-2 / D-3** (§2.1): stories/ACs/capabilities/bounded-context are governed-route only (not the fixture); KPI alignment is the governed `POST /api/v1/kpi-alignments` (with required `weight`/`attribution_type`), **not** a generic `ALIGNED_TO` edge; `NEEDS_CAPABILITY` direction is `Activity → Capability`. | Corrected write paths are binding. | T-05, T-06, T-07 |

## Open design concerns — pinned decisions (from review-design.md pass 2)

Design review pass 2 (`approve`) left two Concerns and two Nits for the tasks
author to pin. All are landed below; none reopens the architecture.

| Concern | Decision | Rationale | Locked in task |
|---------|----------|-----------|----------------|
| **C-05** — shared System/Role resolve key: the foundation MERGEs shared catalog nodes on a **top-level `operatorSeedKey`** property (`api/src/seed/ensure-catalog.ts:42` systems, `:71` roles) and *also* writes the same value as `seedKey` **inside** `attributes_json`. The design's "by `attributes.seedKey`" wording is functionally correct (a TS-side `JSON.parse(attributes_json).seedKey` filter resolves them) but a naive Cypher `MATCH (s:System {seedKey:…})` would find nothing — the top-level property is `operatorSeedKey`. | **Resolve shared catalog nodes by a TS-side `JSON.parse(s.attributes_json).seedKey === "moms"` filter (the same shape §5.1 uses for the domain/metric resolves), OR by the top-level `operatorSeedKey` marker — never by a non-existent top-level `seedKey` property.** Verified values `moms` / `data_warehouse` real (`api/src/seed/saas-operator-catalog.ts:45,49`). | Prevents a resolve query that targets a field that does not exist. | T-03 |
| **C-06** — the §5.7 / §5.3 edge pre-check must use a **literal** relationship type, not a parameterized one: Neo4j rejects `[r:$type]` in a `MATCH` pattern (no APOC). The as-built helpers hardcode the type (e.g. `link-kpi-metric.ts` writes `[m:MEASURES]`). | **Each edge pre-check is written with the literal edge type — one query per type** (`[:PART_OF]`, `[:EXECUTES]`, `[:USES_SYSTEM]`, `[:MEASURES]`), never a single `[r:$type]` parameterized query. | Parameterized rel type is a Neo4j syntax error. | T-03, T-05, T-06 |
| **N-04** (nit) — §4.3 could resolve the shared `product_lead` role instead of a fresh `Product Manager`. | No action required (FR-05 permits slice-local roles). Awareness only: `Software Engineer` correctly falls back to slice-local (verified no shared `Software Engineer`). | Design's roster is FR-05-conformant. | — |
| **N-05** (nit) — do not reuse the SLA `target_direction` enum (`higher_is_better`/…) for the KPI body; `kpiCreateRequestSchema.target_direction` is lenient (`z.string().min(1)`), so the design's `up`/`down` are correct. | Use `up`/`down` for the KPI `target_direction` (§4.5) — **not** the SLA enum. | KPI create route is intentionally lenient (as-built). | T-04 |

Full rationale: design §2 (OQ resolution + Deviations Register), §3–§5, §8,
§10, §11, and `review-design.md` (C-05/C-06/N-04/N-05).

## Task list

### T-01 — Frozen rosters + seedKey↔UUIDv7 map + internal zod shapes

- **Files** (1): `api/src/seed/product-delivery/rosters.ts` (new)
- **Implements**: design §3.1.1, §4.1–§4.8 — supports FR-03/04/05/06/07/09/12
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-02, T-03, T-04..T-08
- **Steps**: Pure data + shapes — no driver, no fetch.
  1. Export the **`SEED_KEYS` map** — the §3.1.1 `seedKey → UUIDv7` allocation
     block (lanes: journeys `018f0200-0001-*`, activities `018f0200-0002-*`,
     slice-local roles `018f0200-0003-*`, slice-local systems `018f0200-0004-*`,
     bounded context `018f0200-0005-7000-8000-000000000001`). This is the single
     source of the fixture node ids so T-02 (the JSON fixture) stays byte-aligned
     with the seed step's resolve keys.
  2. Export the **frozen rosters** verbatim from design §4: journeys (§4.1),
     activities + `PRECEDES` chain (§4.2), roles + `EXECUTES` targets (§4.3),
     systems + `systemKind` + `USES_SYSTEM` targets (§4.4), KPIs with pinned
     `target_value`/`target_direction`/`category`/`unit`/aligned-to (§4.5),
     stories + persona/action/benefit + `DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE`
     (§4.6), the bounded context + capabilities (§4.7), risks + `risk_type` +
     `linked_entity` (§4.8). Every roster keys activities/systems/roles by their
     `seedKey`.
  3. Export the **internal (non-REST) zod input shapes** for the roster rows
     (permissive seed-input shapes, never a REST boundary — every governed route
     re-parses its own body, §7). `zod` only, en-US identifiers.
- **Verification**: `api/__tests__/product-delivery-journeys.integration.test.ts`
  (jointly with T-02..T-04) imports the rosters and asserts every `seedKey` and
  UUIDv7 id is unique and every UUIDv7 matches the strict `uuidv7` regex; the
  journey/activity/role/system/KPI/story/capability/risk sets equal the design
  §4 rosters exactly. At this checkpoint `bun run typecheck` passes.

### T-02 — Lifecycle-clean `{nodes,edges}` fixture (process content only)

- **Files** (1): `shared/seed/saas-operator/product-delivery.json` (new)
- **Implements**: design §3.1, §3.1.1, §9 — closes AC-02, AC-03 (fixture half),
  AC-12 (fixture-load half); supports FR-03, FR-04, FR-05, FR-06, NFR-03
- **Complexity**: moderate
- **Blocked by**: T-01
- **Blocks**: T-10, T-12
- **Steps**: Author the single `{nodes, edges}` payload the foundation loader
  discovers (`api/scripts/seed-saas-operator.ts:44-62` posts every `*.json` in
  `shared/seed/saas-operator/` to `POST /api/v1/import`). It carries **only**
  import-safe process content (Rule B):
  1. **Nodes** — the 3 `UserJourney` (§4.1), 11 `Activity` (§4.2), the
     **slice-local** `Role` rows (§4.3 — only those NOT in the shared catalog:
     `Product Manager`, `Release Engineer`, `Product Analyst`, and the
     resolve-or-create `Software Engineer`), and the **slice-local** `System`
     rows (§4.4 — Roadmap Tool, Spec/Docs System, CI/CD Pipeline, Product
     Analytics, each with `attributes.systemKind`). Every node carries its
     `018f0200-*` UUIDv7 `id` (from `SEED_KEYS`, T-01) + `attributes.seedKey`.
  2. **Edges** — only fixture-local edges (both endpoints in-fixture):
     `Activity -[:PART_OF]-> UserJourney`, `Activity -[:PRECEDES]-> Activity`
     (the §4.2 chain), slice-local `Role -[:EXECUTES]-> Activity`, slice-local
     `Activity -[:USES_SYSTEM]-> System`. Edges carry **no `id`** (optional) so
     `upsertEdge` MERGE-on-`(type,fromId,toId)` keeps re-import net-zero.
  3. Carry **no** cross-reference edge (`UserJourney→Domain`, shared-role
     `EXECUTES`, shared-system `USES_SYSTEM` — those are T-03), and **no**
     lifecycle row (no `BusinessModel`/`ModuleInstance`/`IN_MODEL`/`INSTANTIATES`
     …) and **no** `KPI`/`UserStory`/`AcceptanceCriterion`/`Capability`/
     `BoundedContext` row (§3.1, §3.2). Keep byte-aligned with T-01's rosters.
- **Verification**:
  `api/__tests__/product-delivery-seed-idempotency.integration.test.ts`
  (AC-12 fixture-load half) — the fixture loads via the foundation loader
  (`POST /api/v1/import` → `realImport`) with **no per-row UUIDv7 parse error**
  and **no** `409 model_lifecycle_route_required`; the 3 journeys / 11
  activities / slice-local roles+systems appear resolved by `seedKey`. Manual:
  `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts` — expect no
  additions. Deferred-green: `bun test:integration`.

### T-03 — `resolveContext` + cross-reference edges (resolve-by-lookup, fail-fast)

- **Files** (2): `api/src/seed/product-delivery/context.ts` (new),
  `api/src/seed/product-delivery/steps.ts` (new — cross-ref edge helper)
- **Implements**: design §5.1, §5.7 + `review-design.md` C-05, C-06 — closes
  AC-01, AC-04 (shared-role edge half), AC-05 (shared-system edge half);
  supports FR-01, FR-05, FR-06, NFR-02
- **Complexity**: complex
- **Blocked by**: T-01
- **Blocks**: T-04, T-05, T-06, T-07, T-08, T-10
- **Steps**:
  - `resolveContext(driver, apiBase)` (§5.1, Rule D):
    1. **Operator root** — `MATCH (m:BusinessModel {name:"SaaS Operator"})`, TS-side
       filter `JSON.parse(m.attributes_json).saasOperatorRoot === true`. Absent →
       throw `operator_root_not_seeded` (fail-fast, FR-01).
    2. **`product_delivery` domain** — `MATCH (d:Domain)-[:IN_MODEL]->(m {id:$rootId})`,
       TS-side filter `JSON.parse(d.attributes_json).seedKey === "product_delivery"`.
       Absent → throw `product_domain_not_seeded` (no silent create, NFR-02).
    3. **Shared catalog (C-05)** — resolve shared systems (`moms`,
       `data_warehouse`) and any shared role by a **TS-side
       `JSON.parse(x.attributes_json).seedKey` filter** (the foundation writes
       that value both as the top-level `operatorSeedKey` marker and inside
       `attributes_json`; there is **no** top-level `seedKey` property). Build a
       `seedKey → id` map.
    4. **Metric node ids (B-02)** — for each **declared** `PRODUCT_KPI_METRIC_MAP`
       value (a metric seedKey), resolve the metric's real UUIDv7 node id via
       `MATCH (m:MetricDefinition)` + TS-side
       `JSON.parse(m.attributes_json).seedKey === $seedKey`. A declared seedKey
       whose metric node is absent → throw `metric_not_seeded`. Build a
       `metricSeedKey → nodeId` map.
    5. **Fixture nodes (B-01)** — resolve journeys/activities/slice-local
       roles/systems **by `attributes.seedKey`** (TS-side filter), building a
       `seedKey → uuid` map. Never resolve by a `pd-*` literal as an id.
    Return `{ rootId, domainId, systemIds, roleIds, metricNodeIds, fixtureNodeIds }`.
    A premature run creates nothing (FR-01/NFR-02).
  - `assertFixtureLoaded(context)` (§5.7 step 2) — assert `pd-journey-roadmap`
    resolves; absent → throw `product_fixture_not_loaded`.
  - `writeCrossRefEdges(context, apiBase)` (§5.7 step 3) — for each
    cross-reference edge, run a **load-bearing pre-check with the literal edge
    type (C-06)** then skip-or-POST:
    - `UserJourney -[:PART_OF]-> Domain` (3 edges; `fromId` = each journey id by
      `seedKey`, `toId = domainId`) — pre-check `MATCH (a {id:$fromId})-[:PART_OF]->(b {id:$toId}) RETURN count(*)`.
    - shared-role `Role -[:EXECUTES]-> Activity` — pre-check `[:EXECUTES]` literal.
    - shared-system `Activity -[:USES_SYSTEM]-> System` — pre-check `[:USES_SYSTEM]` literal.
    Bodies are `{type, fromId, toId}` with **no `id`**; POST `POST /api/v1/edges`
    only when the pre-check returns zero (idempotency is carried by the
    pre-check, not the route — C-01).
- **Verification**:
  - `api/__tests__/product-delivery-scope.integration.test.ts` (AC-01) — the
    domain resolves by `seedKey` and journeys `PART_OF` it after
    `writeCrossRefEdges`; with the `product_delivery` domain absent (foundation
    not seeded) `resolveContext` throws `product_domain_not_seeded` and writes
    nothing.
  - AC-04 (shared-role edge half) + AC-05 (shared-system edge half) exercised
    transitively by `product-delivery-roles`/`-systems` (T-12); the pre-check
    skip is proven net-zero in `product-delivery-seed-idempotency` (T-12).
  Deferred-green: `bun test:integration`.

### T-04 — `PRODUCT_KPI_METRIC_MAP` + KPI create helper

- **Files** (2): `api/src/seed/product-delivery/kpi-metric-map.ts` (new),
  `api/src/seed/product-delivery/steps.ts` (extend from T-03 — KPI create helper)
- **Implements**: design §4.5, §5.2, §5.3 (map) + `review-design.md` N-05 —
  supports FR-07, FR-08, NFR-02
- **Complexity**: moderate
- **Blocked by**: T-01, T-03
- **Blocks**: T-05
- **Steps**:
  1. Author `kpi-metric-map.ts` exporting `PRODUCT_KPI_METRIC_MAP`
     (`Record<string, string>`, KPI name → metric **seedKey**) exactly per §5.3:
     one live entry `"Release Frequency": "metric-deploy-frequency"` and the
     three deferred entries (Cycle Time / Feature Adoption / Spec Throughput)
     **commented out** with the OQ-1' note (uncomment + set the metric-* seedKey
     when the library grows). The map value is a **seedKey, not a node id**
     (B-02).
  2. Add `createKpis(context, apiBase)` to `steps.ts` — for each §4.5 KPI, a
     pre-create lookup `MATCH (k:KPI {name:$name, domain_id:$domainId})` resolves
     an existing KPI (idempotency, NFR-02 — KPIs have no MERGE route), else
     `POST /api/v1/kpis` with `kpiCreateRequestSchema` fields
     (`name`/`category`/`unit`/`target_value`/`target_direction` = the pinned
     §4.5 values, **`up`/`down` not the SLA enum, N-05**/`measurement_frequency`/
     `owner_role`/`domain_id = context.domainId`). Capture each server-generated
     KPI id into a `kpiName → id` map. All four KPIs are created (XD-10 depth).
- **Verification**: `api/__tests__/product-delivery-kpis.integration.test.ts`
  (AC-06, KPI-create half) — the four KPIs exist as `:KPI` nodes with
  server-generated ids and the pinned `target_value`/`target_direction`; a
  re-run resolves the existing KPIs and creates no duplicate. Deferred-green:
  `bun test:integration`.

### T-05 — `MEASURES` links + `ALIGNED_TO` alignments

- **Files** (1): `api/src/seed/product-delivery/steps.ts` (extend from T-04)
- **Implements**: design §5.3 + `review-design.md` C-06 — closes AC-06 (link
  half), AC-07; supports FR-07, FR-08, NFR-02, NFR-04
- **Complexity**: moderate
- **Blocked by**: T-04
- **Blocks**: T-06
- **Steps**:
  - `linkKpiMetrics(context, apiBase)` (§5.3, MEASURES): for each declared
    `PRODUCT_KPI_METRIC_MAP` entry, resolve the metric seedKey → real node id via
    `context.metricNodeIds` (B-02), then **pre-check the MEASURES edge with the
    literal type (C-06)** —
    `MATCH (k:KPI {id:$kpiId})-[:MEASURES]->(m:MetricDefinition {id:$metricNodeId}) RETURN count(*)`
    — and **skip** when present (C-02 idempotency), else call the **imported**
    metric-library helper `linkKpiToMetric(apiBase, kpiId, resolvedMetricNodeId)`
    (`api/src/seed/link-kpi-metric.ts` — consumed, never edited, NFR-04). Today
    exactly one link (Release Frequency → the `metric-deploy-frequency` node
    `018f0100-…-020`).
  - `alignKpis(context, apiBase)` (§5.3, ALIGNED_TO, D-2/C-03): for each KPI's
    §4.5 "Aligned to" target(s), a pre-create
    `GET /api/v1/kpi-alignments?kpi_id=…` lookup skips an existing alignment,
    else `POST /api/v1/kpi-alignments` with `kpiAlignmentCreateRequestSchema`
    (`kpi_id`, `target_type ∈ {journey,activity,domain}`, `target_id` resolved
    by `seedKey` from `context.fixtureNodeIds`, `weight = 1`,
    `attribution_type = "direct"`). A KPI aligned to both its journey and an
    activity is two POSTs (C-03). `domain_id` on the KPI node (T-04) is a
    **separate** concern from the alignment edge (C-03) — both are set.
- **Verification**:
  - `api/__tests__/product-delivery-kpis.integration.test.ts` (AC-06 link half)
    — the `MEASURES` link set equals what `PRODUCT_KPI_METRIC_MAP` declares
    (today: exactly one, KPI `Release Frequency` → the `metric-deploy-frequency`
    node); a re-run skips the present link and does not throw. A **dedicated
    negative** case (C-02, split from AC-12) calls `linkKpiToMetric` a second
    time directly on a linked KPI (bypassing the skip guard) and asserts it
    throws `KpiMetricAlreadyLinkedError`. Manual:
    `git diff --stat api/src/routes/kpi-crud.ts api/src/seed/link-kpi-metric.ts`
    — expect no change.
  - `api/__tests__/product-delivery-kpis.integration.test.ts` (AC-07) — each KPI
    carries its declared `ALIGNED_TO` alignment row(s) (via
    `POST /api/v1/kpi-alignments`, `target_id` by `seedKey`) **and** `domain_id`
    = `context.domainId` (distinct from the alignment, C-03).
  Deferred-green: `bun test:integration`.

### T-06 — DDD mapping (bounded context + capabilities + mapping arms)

- **Files** (1): `api/src/seed/product-delivery/steps.ts` (extend from T-05)
- **Implements**: design §4.7, §5.5 + `review-design.md` C-06 (mapping-edge
  idempotency reads) — closes AC-11; supports FR-12, NFR-02, NFR-04
- **Complexity**: complex
- **Blocked by**: T-05
- **Blocks**: T-07
- **Steps**: `writeDddMapping(context, apiBase)` (§5.5, D-1/D-3):
  1. **Bounded context** — `POST /api/v1/ontology/import` with a
     `{boundedContexts:[{id:"018f0200-0005-7000-8000-000000000001", name:"Product
     Delivery Context", description, domain:"Product & Delivery",
     subdomain:"delivery", …}]}` payload (Pass 3 MERGE-on-id, idempotent,
     `ontology-import.ts:120-160`). The id is the §3.1.1 lane-5 **UUIDv7**
     (`boundedContextCreateSchema.id` is `z.string().uuid()`, rejects the
     `pd-bc-*` literal); `pd-bc-product-delivery` is the seedKey handle only.
  2. **Capabilities** — for each §4.7 capability, a pre-create
     `GET /api/v1/models/{rootId}/capabilities` lookup by `name` skips an
     existing one, else `POST /api/v1/models/{rootId}/capabilities` with
     `capabilityCreateSchema` (which writes `CAPABILITY_IN_MODEL → operator root`
     atomically, `createCapability` `capabilities.ts:281`/`:310` — consumed,
     NFR-04). Capture the id.
  3. **Mapping arms** (PUT, `capabilities.ts:50-55` dispatch): `PUT
     …/capabilities/{capId}/needed-by {activityId}` (activityId by `seedKey`) →
     `Activity -[:NEEDS_CAPABILITY]-> Capability` (direction per D-3); `PUT
     …/supported-by {systemId}` (by `seedKey`) → `Capability -[:SUPPORTED_BY]->
     System`; `PUT …/context {boundedContextId:"018f0200-…-001"}` →
     `Capability -[:ASSIGNED_TO_CONTEXT]-> BoundedContext` (at-most-one,
     replaces). The PUT arms are MERGE/replace, so re-apply is net-zero.
- **Verification**: `api/__tests__/product-delivery-ddd.integration.test.ts`
  (AC-11) — each capability `NEEDS_CAPABILITY`←Activity, `SUPPORTED_BY`→System
  (both resolved by `seedKey`), `CAPABILITY_IN_MODEL`→operator root,
  `ASSIGNED_TO_CONTEXT`→the Product context (UUIDv7 `018f0200-…-001`); the
  bounded-contexts read (`GET /api/v1/ontology/bounded-contexts` or the model
  DDD read) returns the Product context with its assigned capabilities; a re-run
  is net-zero. Manual:
  `git diff --stat api/src/routes/capabilities.ts api/src/routes/ontology-import.ts`
  — expect no change. Deferred-green: `bun test:integration`.

### T-07 — Stories + acceptance criteria (governed model-scoped routes)

- **Files** (1): `api/src/seed/product-delivery/steps.ts` (extend from T-06)
- **Implements**: design §4.6, §5.4 (OQ-2, D-1) — closes AC-08, AC-09; supports
  FR-09, FR-10, NFR-02, NFR-04
- **Complexity**: moderate
- **Blocked by**: T-06
- **Blocks**: T-08
- **Steps**: `writeStories(context, apiBase)` (§5.4). The model id in every URL
  is the **operator root** (`context.rootId`); the Product activities are
  `PART_OF` the `product_delivery` domain which is `IN_MODEL` the root, so
  `assertActivityInScope` (`stories.ts:307-314`) passes.
  1. For each §4.6 story, a pre-create `GET /api/v1/models/{rootId}/stories`
     lookup by `sourceActivityId`/`persona` skips an already-seeded story
     (NFR-02), else `POST /api/v1/models/{rootId}/stories` with
     `storyCreateSchema` (`persona`/`action`/`benefit`/`activityId` resolved by
     `seedKey`/`roleId` resolved by role name). The server assembles `narrative`
     and wires `DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE`. Capture the story id.
  2. For each story, `POST /api/v1/models/{rootId}/stories/{storyId}/acceptance-criteria`
     with `acCreateSchema` (`given`/`when`/`then`/`ordinal`) for ≥1 AC (§4.6).
  Stories/ACs are governed-route only (never the fixture, D-1) — the import path
  cannot set their top-level domain fields.
- **Verification**:
  - `api/__tests__/product-delivery-stories.integration.test.ts` (AC-08) — the
    three §4.6 stories exist, each `DESCRIBES_ACTIVITY` a Product `Activity` and
    (where a role exists) `STORY_FOR_ROLE` a `Role`, with populated top-level
    `persona`/`action`/`benefit`/`narrative`; no new story label registered.
  - `api/__tests__/product-delivery-stories.integration.test.ts` (AC-09) — each
    story has ≥1 `AcceptanceCriterion` with **non-empty** `given`/`when`/`then`
    linked via `ACCEPTANCE_OF`.
  Manual: `git diff --stat api/src/routes/stories.ts api/src/storage/stories.ts`
  — expect no change. Deferred-green: `bun test:integration`.

### T-08 — Product/delivery risks via `POST /api/v1/risk-register`

- **Files** (1): `api/src/seed/product-delivery/steps.ts` (extend from T-07)
- **Implements**: design §4.8, §5.6 (OQ-4) — closes AC-10; supports FR-11,
  NFR-02, NFR-04
- **Complexity**: moderate
- **Blocked by**: T-07
- **Blocks**: T-10
- **Steps**: `writeRisks(context, apiBase)` (§5.6). `createRiskSchema` is
  **module-private** (`risk-register.ts:7`, not exported) — importing it would
  edit that owned file (NFR-04), so the risk body is a **hand-constructed object
  literal** matching the route shape; the route re-parses (the foundation
  `seedRisk` precedent).
  1. For each §4.8 risk, a pre-create `GET /api/v1/risk-register` lookup by
     `name` + `domain` skips an existing row (NFR-02), else
     `POST /api/v1/risk-register` with `name`/`owner`/`domain="Product &
     Delivery"`/`likelihood`/`impact`/`status`/`trend`/`risk_type`/
     `linked_entity_type`/`linked_entity_id` (OQ-4: `domain` + resolved
     `product_delivery` domain id, or `activity` + the at-risk activity id
     resolved by `seedKey`).
  2. If the foundation ships `seedRisk`
     (`api/src/seed/governed-seed-helper.ts`), import and reuse it; otherwise
     inline the same loopback POST — either way **no** risk route code is
     touched.
- **Verification**: `api/__tests__/product-delivery-risks.integration.test.ts`
  (AC-10) — ≥2 risks POST to `/api/v1/risk-register` with `domain="Product &
  Delivery"`, valid `likelihood`/`impact`/`status`/`trend`, and each returns a
  success envelope with a persisted id; each carries its OQ-4 linked entity; a
  re-run adds no duplicate. Manual:
  `git diff --stat api/src/routes/risk-register.ts` — expect no change.
  Deferred-green: `bun test:integration` (needs Postgres).

### T-09 — No-schema-additions guard test (labels/edges all pre-exist)

- **Files** (1): `api/__tests__/product-delivery-no-schema-additions.integration.test.ts` (new)
- **Implements**: design §7, §8, §11 — closes AC-13; supports FR-02, NFR-01
- **Complexity**: simple
- **Blocked by**: T-01
- **Blocks**: —
- **Steps**: Prove every label/edge the slice writes **already exists** and this
  spec registers **none**:
  1. Assert each label the slice uses (`Domain`/`UserJourney`/`Activity`/`Role`/
     `System`/`KPI`/`UserStory`/`AcceptanceCriterion`/`Capability`/
     `BoundedContext`/`MetricDefinition`) is present via the ontology
     registry read (`GET /api/v1/ontology/node-labels`) — compile-time core or
     registered at boot / by `saas-metric-library`.
  2. Assert each edge type (`PART_OF`/`EXECUTES`/`USES_SYSTEM`/`PRECEDES`/
     `ALIGNED_TO`/`MEASURES`/`DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE`/
     `ACCEPTANCE_OF`/`NEEDS_CAPABILITY`/`SUPPORTED_BY`/`ASSIGNED_TO_CONTEXT`/
     `CAPABILITY_IN_MODEL`) is present via `GET /api/v1/ontology/edge-types`.
  3. Confirm the representation mapping table (design §8) covers every label/edge
     the slice writes and names none that is absent.
- **Verification**:
  `api/__tests__/product-delivery-no-schema-additions.integration.test.ts`
  (AC-13) — all labels/edges resolve from the registry; manual:
  `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts` — expect **no
  additions**, and no runtime label/edge is registered by this spec.
  Deferred-green: `bun test:integration`.

### T-10 — Seed step orchestrator (`api/scripts/seed-product-delivery.ts`)

- **Files** (1): `api/scripts/seed-product-delivery.ts` (new)
- **Implements**: design §5, §5.7, §9 (OQ-3) — closes AC-01 (fail-fast wiring),
  AC-12 (idempotency orchestration); supports FR-01, FR-07..FR-12, NFR-02
- **Complexity**: moderate
- **Blocked by**: T-03, T-05, T-06, T-07, T-08
- **Blocks**: T-11, T-12
- **Steps**: The `bun run seed:product-delivery` CLI entrypoint, sibling to
  `seed-saas-operator.ts` / `seed-saas-metric-library.ts`: `loadEnv()` →
  `apiBase = http://${env.host}:${env.apiPort}` → loopback `fetch` (no auth
  header — trusted operator tooling, the dev-mode fallback, same pattern as
  `seed-saas-operator.ts:32-33`). Run the §5.7 **fixed order**, each step
  fail-fast:
  1. `resolveContext` (§5.1, T-03) — fail-fast if a dependency is unseeded.
  2. `assertFixtureLoaded` (§5.7 step 2, T-03) — throw
     `product_fixture_not_loaded` if the foundation loader has not imported the
     fixture (run `seed:saas-operator` first).
  3. `writeCrossRefEdges` (T-03).
  4. `createKpis` (T-04) → `linkKpiMetrics` → `alignKpis` (T-05).
  5. `writeStories` (T-07) → its ACs.
  6. `writeDddMapping` (T-06).
  7. `writeRisks` (T-08).
  Do **not** edit `seed-saas-operator.ts` (the fixture rides the loader, XD-05).
- **Verification**:
  `api/__tests__/product-delivery-seed-idempotency.integration.test.ts`
  (AC-12 orchestration half) — a full `seed:product-delivery` run after the
  foundation loader is net-zero on re-run (cross-ref edges skipped by the §5.7
  pre-check, `MEASURES` skipped by the §5.3 pre-check, KPIs/stories/capabilities/
  risks skipped by their pre-create lookups); a pre/post `/api/v1/stats` diff for
  the **retail** Model #1 root is zero (retail isolation, NFR-02). Deferred-green:
  `bun test:integration`.

### T-11 — Wire `seed:product-delivery` package script (sole package.json edit)

- **Files** (1): `package.json` (modify)
- **Implements**: design §9 (OQ-3) — supports FR-01, NFR-04
- **Complexity**: simple
- **Blocked by**: T-10
- **Blocks**: T-12, T-13
- **Steps**: Add exactly one line to the root `package.json` `scripts`:
  `"seed:product-delivery": "bun --cwd api scripts/seed-product-delivery.ts"`
  (matching the `"seed:saas-operator"` / `"seed:saas-metric-library"` form).
  This is the **sole** `package.json` edit and the only `modify` in the whole
  spec.
- **Verification**: manual: `cat package.json | grep seed:product-delivery`
  shows the entry; `bun run typecheck` exit 0. `git diff --stat package.json` —
  expect exactly the one added script line.

### T-12 — Content integration tests (journeys / activities / roles / systems)

- **Files** (4): `api/__tests__/product-delivery-journeys.integration.test.ts`
  (new), `api/__tests__/product-delivery-activities.integration.test.ts` (new),
  `api/__tests__/product-delivery-roles.integration.test.ts` (new),
  `api/__tests__/product-delivery-systems.integration.test.ts` (new)
- **Implements**: design §4.1–§4.4, §10 — closes AC-02, AC-03, AC-04, AC-05;
  supports FR-03, FR-04, FR-05, FR-06, NFR-02
- **Complexity**: moderate
- **Blocked by**: T-02, T-11
- **Blocks**: T-13
- **Steps**: With the full stack up + all four dependency seeds run
  (Preconditions), assert the seeded graph matches the frozen §4 rosters
  (resolving every node **by `attributes.seedKey`**):
  - **AC-02** (journeys) — exactly the three §4.1 `UserJourney` nodes exist under
    the `Product & Delivery` domain, each with a UUIDv7 id + `PART_OF` the
    domain; the seeded journey-name set equals the roster exactly.
  - **AC-03** (activities) — each journey's §4.2 `Activity` set exists `PART_OF`
    it, ordered by the §4.2 `PRECEDES` chain; the per-journey activity set + the
    chain equal the roster exactly.
  - **AC-04** (roles) — every activity has ≥1 `EXECUTES` from a `Role`;
    slice-local roles are created within the slice, shared roles resolve by
    `seedKey`/`name` (no duplicate); a re-run adds no duplicate role (NFR-02).
  - **AC-05** (systems) — every system-using activity has a `USES_SYSTEM` edge;
    shared systems (`moms`/`data_warehouse`) resolve to the foundation catalog
    (no duplicate `System`), slice-local systems carry a valid `systemKind` +
    resolve by `seedKey`; a re-run adds no duplicate system.
- **Verification**: the four named
  `api/__tests__/product-delivery-{journeys,activities,roles,systems}.integration.test.ts`
  (AC-02/AC-03/AC-04/AC-05). Deferred-green: `bun test:integration`.

### T-13 — Final validation + ownership-boundary sweep

- **Files** (0): no source files — validation only
- **Implements**: design §10, §11 — closes AC-14, and the AC-01…AC-13 sweep;
  supports all FR/NFR
- **Complexity**: simple
- **Blocked by**: T-01…T-12
- **Blocks**: —
- **Steps**: With the full stack up (`bun run dev`) and, in order,
  `bun run seed:saas-operator` → `bun run seed:saas-metric-library` → the
  foundation loader having imported `product-delivery.json` → `bun run
  seed:product-delivery`:
  1. `bun run typecheck` exits 0.
  2. `bun test:integration` (all `api/__tests__/product-delivery-*.integration.test.ts`)
     green.
  3. **AC-14 boundary sweep** (CLI, no source edit): `git diff --stat` +
     `git diff` confirm the change surface is confined to
     `shared/seed/saas-operator/product-delivery.json`,
     `api/scripts/seed-product-delivery.ts`, `api/src/seed/product-delivery/**`,
     `package.json` (one line), and `api/__tests__/product-delivery-*`; and shows
     **no** change to `pwa/**`, `pwa/src/route.ts`/`SURFACES`/`views/index.tsx`,
     `api/src/routes/{kpi-crud,kpi-sla-alignment,stories,capabilities,ontology-import,edges,import,nodes}.ts`,
     `api/src/routes/{risk-register,risk-compliance,change-requests,compliance-rules,sla-crud}.ts`,
     `api/src/storage/model-lifecycle-guard.ts`, the compile-time schema arrays
     (`shared/src/schema/{nodes,edges}.ts`), `api/src/auth/rbac-permissions.ts`,
     `api/src/errors.ts`, or any `saas-metric-library`/`saas-operator-foundation`
     -owned source.
- **Verification**: manual: with the seeded stack up run steps 1–3 — expect
  `bun run typecheck` exit 0, all `product-delivery-*.integration.test.ts` green,
  and every `git diff --stat`/`git diff` boundary check clean (change surface
  confined exactly as above; no owned-elsewhere / schema / RBAC / error-code /
  route.ts edit) (AC-14, full AC-01…AC-13 sweep).

## Traceability

| Task | Implements (design §) | Closes AC | Serves FR/NFR |
|------|-----------------------|-----------|---------------|
| T-01 | §3.1.1, §4.1–§4.8 | (supports AC-02..AC-11) | FR-03/04/05/06/07/09/12 |
| T-02 | §3.1, §3.1.1, §9 | AC-02/AC-03 (fixture), AC-12 (load) | FR-03, FR-04, FR-05, FR-06, NFR-03 |
| T-03 | §5.1, §5.7, C-05, C-06 | AC-01, AC-04/AC-05 (shared-edge half) | FR-01, FR-05, FR-06, NFR-02 |
| T-04 | §4.5, §5.2, §5.3, N-05 | AC-06 (KPI create) | FR-07, FR-08, NFR-02 |
| T-05 | §5.3, C-02, C-06 | AC-06 (link), AC-07 | FR-07, FR-08, NFR-02, NFR-04 |
| T-06 | §4.7, §5.5, C-06 | AC-11 | FR-12, NFR-02, NFR-04 |
| T-07 | §4.6, §5.4 | AC-08, AC-09 | FR-09, FR-10, NFR-02, NFR-04 |
| T-08 | §4.8, §5.6 | AC-10 | FR-11, NFR-02, NFR-04 |
| T-09 | §7, §8, §11 | AC-13 | FR-02, NFR-01 |
| T-10 | §5, §5.7, §9 | AC-01 (wiring), AC-12 (orchestration) | FR-01, FR-07..FR-12, NFR-02 |
| T-11 | §9 | (supports AC-14) | FR-01, NFR-04 |
| T-12 | §4.1–§4.4, §10 | AC-02, AC-03, AC-04, AC-05 | FR-03, FR-04, FR-05, FR-06, NFR-02 |
| T-13 | §10, §11 | AC-14, AC-01…AC-13 sweep | all FR/NFR |

Every FR/NFR from the design is covered: FR-01→T-03/T-10, FR-02→T-09,
FR-03→T-02/T-12, FR-04→T-02/T-12, FR-05→T-02/T-03/T-12, FR-06→T-02/T-03/T-12,
FR-07→T-04/T-05, FR-08→T-04/T-05, FR-09→T-07, FR-10→T-07, FR-11→T-08,
FR-12→T-06; NFR-01→T-09, NFR-02→T-03/T-05/T-06/T-07/T-08/T-10/T-12,
NFR-03→T-02, NFR-04→T-05/T-06/T-07/T-08/T-11/T-13, NFR-05→T-13 (typecheck),
NFR-06 (owned KPI/risk/story/DDD route code untouched)→T-05/T-06/T-07/T-08/T-13.
Every AC (AC-01…AC-14) has a closing task.

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with server behaviour (T-02, T-03, T-05, T-06, T-07, T-08, T-09, T-10, T-12) | the task's listed `*.integration.test.ts` under `bun test:integration` (needs `bun run dev` — Neo4j, + Postgres for T-08 — and the dependency seeds run in order per Preconditions) |
| T-04 (data/helper) | `bun run typecheck`; the KPI-create half is exercised by T-05's `product-delivery-kpis` test |
| T-11 (package script) | `bun run typecheck`; `git diff --stat package.json` shows exactly one added line |
| final task (T-13) | `bun run typecheck` + `bun test:integration` (Neo4j + Postgres) + the AC-14 `git diff` boundary sweep (no owned-elsewhere / schema / RBAC / error-code / route.ts edit) |
