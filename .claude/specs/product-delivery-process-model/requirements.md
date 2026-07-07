---
feature: "product-delivery-process-model"
created: "2026-07-06"
author: "spec-author"
status: "draft"
size: "medium"
---

# Requirements: product-delivery-process-model

## Summary

`product-delivery-process-model` is a **wave-2 content spec** of the
SaaS-Operator business-process model (blueprint
`.claude/specs/blueprint-saas-operator.md`), depending on
`saas-operator-foundation` (wave 1a) and `saas-metric-library` (wave 1b). It
authors the **full-pipeline Product function** of the docorg SaaS operator onto
the companygraph process graph, scoped under the pre-seeded **`Product &
Delivery` function `Domain`** (foundation FR-03, `attributes.seedKey =
"product_delivery"`) of the **"SaaS Operator" `BusinessModel` root** (foundation
FR-01). It covers, at the **mandatory full-pipeline depth** (XD-10): three
**journeys** (roadmap/discovery, spec-driven delivery, product analytics),
their **activities × roles**, the **systems** each activity uses, **KPIs** that
`MEASURES` canonical metric definitions from `saas-metric-library` (XD-06),
**stories + Given/When/Then acceptance criteria**, **risks** created via the
governed `risk-register` API (XD-04), and a **DDD system mapping**
(capabilities → systems → bounded contexts). It proves the function **maps onto
the companygraph representation** with an explicit **mapping table** (business
action → label/edge), which XD-10 makes a first-class, reviewable artifact.

The **sole content deliverable** is the seed slice
`shared/seed/saas-operator/product-delivery.json` (the non-KPI/non-risk graph
content the foundation's directory-iterating loader discovers, FR-07/FR-08 of
foundation) **plus** a thin self-owned seed step that creates the parts the
`{nodes,edges}` import path **cannot** carry — KPIs (via `POST /api/v1/kpis`),
`MEASURES` KPI→metric links (via the `saas-metric-library` cardinality-guarded
helper), and risks (via `POST /api/v1/risk-register`) — because those three
constructs are owned by dedicated routes/stores, not the graph import payload.

It ships **NO new views** (scope). The Product function surfaces through the
**existing** Explorer, `#/business/functions` (FunctionMap, foundation), and
`#/exec` surfaces — it adds **zero** `pwa/` files, **zero** routes, and edits
**neither** `route.ts` / `SURFACES` / `views/index.tsx` (sole-owned by
`saas-operator-foundation`, XD-05) **nor** the view components of any sibling
spec.

## Motivation

1. **The blueprint's core ask is the mapping (XD-10).** The whole SaaS-Operator
   subsystem exists to prove the docorg operator's six functions map onto
   companygraph's representation. The Product function is one of the six; without
   this spec the operator model is missing its product-delivery pipeline, and the
   wave-3 `cross-function-exec-rollup` (which aggregates per-function KPI health)
   and `function-benchmark-scoring` (which scores each function's maturity) have
   no Product data to roll up or score.
2. **Full-pipeline depth is mandatory (XD-10).** A content spec must cover
   journeys, activities × roles, systems, KPIs (metric-instantiated), stories +
   ACs, risks, and DDD mapping — a shallow "just the journeys" slice is
   non-conformant. This spec enumerates all seven layers for the Product
   function.
3. **KPIs must be grounded in the metric library (XD-06 / XD-06-erratum).** The
   Product function's KPIs (cycle time, release frequency, feature adoption, spec
   throughput) must `MEASURES` a canonical `MetricDefinition` rather than invent
   ad-hoc semantics — enabling comparable KPI health across functions. The
   `saas-metric-library` frozen roster (design §4) supplies `Deploy Frequency`
   (`metric-deploy-frequency`) but **does not** contain cycle time, feature
   adoption, or spec throughput — a real gap surfaced as **OQ-1** (add them to
   the library via the governed registry/seed, or map the operator KPIs onto the
   nearest existing metrics). This is a decision the user/`saas-metric-library`
   owner must make; this spec must not silently invent a divergent metric.
4. **The seed slice is the loadable proof (XD-04).** The content lands as
   `shared/seed/saas-operator/product-delivery.json`, discovered by the
   foundation's directory-iterating loader with **no loader edit**, plus the
   governed-API steps for KPIs/links/risks the import path cannot carry. Adding
   the Product slice is a purely additive act.

## Functional Requirements

<!-- Priorities: must = full-pipeline depth (XD-10) or a blocking dependency;
     should = enrichment. -->

### Scope anchor + representation mapping (XD-01, XD-10)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **All Product content is scoped under the pre-seeded `Product & Delivery` function `Domain`** of the SaaS-Operator root (foundation FR-03), resolved at seed time by **lookup on `attributes.seedKey = "product_delivery"`** against the operator root's `IN_MODEL` domains — **never** by a hard-coded domain id (the domain id is server-generated by `attachDomain`, foundation FR-03). This spec **does not** create the domain, the operator root, or the `IN_MODEL` scoping edge (foundation owns those); it **attaches** its journeys under the existing domain via `PART_OF` (`UserJourney → Domain`). If the `product_delivery` domain is absent at seed time (foundation not run), the seed step fails fast with a clear error, not a silent create. | must | XD-01, foundation FR-03 |
| FR-02 | **Explicit representation mapping table** (XD-10) — the `requirements.md` (this file, §"Representation Mapping") and the design carry a table mapping every Product **business action / artifact** to its companygraph **label + edge** (e.g. "a delivery step" → `Activity` + `PART_OF`→`UserJourney`; "who runs it" → `Role` + `EXECUTES`; "a KPI grounded in a metric" → `KPI` + `MEASURES`→`MetricDefinition`; "a capability need" → `Capability` + `NEEDS_CAPABILITY`). Every label/edge used by the seed slice appears in the table; the table uses **only** existing compile-time or already-registered runtime labels/edges (no new label/edge is invented — NFR-01). | must | XD-10 |

### Journeys, activities, roles, systems (XD-10)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-03 | **Three Product `UserJourney` nodes** attached to the `Product & Delivery` domain via `PART_OF` (`UserJourney → Domain`): (1) **Roadmap & Discovery** (opportunity intake → prioritization → roadmap commit), (2) **Spec-Driven Delivery** (spec authoring → design/tasks → build → release), (3) **Product Analytics** (instrumentation → adoption measurement → insight → feedback loop). Each journey carries a name, description, and stable seed id. Journey names/count and the roadmap→delivery→analytics shape are the design-frozen roster (mirrors `saas-metric-library`'s frozen-roster discipline). | must | XD-10, blueprint Feature Inventory |
| FR-04 | **Activities per journey, ordered** — each journey decomposes into `Activity` nodes attached via `PART_OF` (`Activity → UserJourney`) and ordered within the journey via `PRECEDES` (`Activity → Activity`) where a real process order exists. The activity roster (the concrete steps of each of the three journeys — e.g. "Author feature spec", "Design review", "Cut release") is frozen in the design as an enumerated table so the seed asserts an exact set. | must | XD-10 |
| FR-05 | **Roles execute activities** — each activity is executed by at least one `Role` via `EXECUTES` (`Role → Activity`). Roles are resolved from the **shared operator Role catalog seeded by foundation** (FR-05 of foundation) by `name`/`attributes.seedKey` where a shared role fits (e.g. an existing operator role); **product-specific roles** (e.g. `Product Manager`, `Release Engineer`, `Product Analyst`) that are not in the shared catalog are added **within this slice** as `Role` nodes with stable seed ids (foundation FR-04/FR-05: content specs "add only function-specific systems/roles within their own slice"). No role is duplicated if it already exists in the shared catalog — the seed resolves-or-creates by name. | must | XD-10, foundation FR-05 |
| FR-06 | **Systems used by activities** — activities reference `System` nodes via `USES_SYSTEM` (`Activity → System`). Shared systems (e.g. the docorg product **MOMS**, the **Helm** control-plane, the **data-warehouse** for analytics) are resolved from the **shared System catalog seeded by foundation** (FR-04 of foundation) by `attributes.seedKey`/`name` — **never** re-created. **Product-specific systems** not in the shared catalog (e.g. an issue tracker / roadmap tool, a spec/docs system, a CI/CD deploy system, a product-analytics system) are added **within this slice** as `System` nodes with a valid `systemKind` (per `system-augmentation-model`) and stable seed ids. The design freezes the exact system roster + which are shared-vs-slice-local. | must | XD-10, foundation FR-04 |

### KPIs grounded in the metric library (XD-06, XD-06-erratum)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-07 | **Product KPIs, each `MEASURES` a canonical `MetricDefinition`** — at minimum the four blueprint-named Product metrics: **cycle time**, **release frequency**, **feature adoption**, **spec throughput** (blueprint Feature Inventory). Each is a `KPI` node created via the dedicated **`POST /api/v1/kpis`** route (`kpi-crud`, `KPI` is a Neo4j node with a server-generated UUIDv7 id, `name`/`category`/`unit`/`target_value`/`target_direction`/`measurement_frequency`/`owner_role`/`domain_id`), **not** a `{nodes,edges}` import row (KPIs are owned by the KPI subsystem, not the graph import path). Each KPI is then linked to its canonical metric by a **`MEASURES` edge** (`KPI → MetricDefinition`, `saas-metric-library` design §3.2) through that library's **cardinality-guarded `linkKpiToMetric` helper** (design §5.3) — a KPI links to **at most one** metric. **Metric availability is OQ-1**: only `release frequency` maps cleanly to the frozen library metric `Deploy Frequency` (`metric-deploy-frequency`); `cycle time`, `feature adoption`, and `spec throughput` are **not** in the frozen roster — OQ-1 decides whether they are added to the library (via `saas-metric-library`'s governed registry/seed) or the operator KPIs map onto nearest existing metrics. This spec must not add a `MetricDefinition` itself (owned by `saas-metric-library`, NFR-06). | must | XD-06, XD-06-erratum, blueprint Feature Inventory |
| FR-08 | **KPIs are aligned to the Product process** — each Product KPI is aligned to the journey/activity/domain it measures via `ALIGNED_TO` (`KPI → UserJourney` / `KPI → Activity` / `KPI → Domain`, `kpi-measurement-alignment` FR-04) so the cockpit/benchmark specs can attribute KPI health to the Product function. `domain_id` on the KPI node is set to the resolved `product_delivery` domain id (FR-01). No KPI/OKR **route code** is edited (owned by `kpi-okr-governance` / `kpi-measurement-alignment`, NFR-06) — this spec only *calls* the KPI create + alignment write paths. | must | XD-06, XD-10 |

### Stories + acceptance criteria (XD-10)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-09 | **User stories for key Product activities** — at least one `UserStory` node per journey (persona-narrative form "As a &lt;persona&gt;, I want to &lt;action&gt;, so that &lt;benefit&gt;"), linked to the `Activity` it describes via `DESCRIBES_ACTIVITY` (`UserStory → Activity`, `story-spec-core`) and, where an executing role exists, to that `Role` via `STORY_FOR_ROLE` (`UserStory → Role`). `UserStory`/`AcceptanceCriterion` are **already-registered runtime labels** (`register-story-labels.ts`) — this spec creates **instances**, never a new label. Story domain fields (persona/action/benefit/narrative) are top-level Neo4j properties owned by `api/src/storage/stories.ts`; **how a story instance is written (via the story storage/route vs. a plain import node row) is OQ-2** (the story shape is owned by `stories.ts`, so a raw import row may not populate its top-level fields correctly). | must | XD-10, story-spec-core |
| FR-10 | **Given/When/Then acceptance criteria** — each Product `UserStory` carries at least one `AcceptanceCriterion` (structured `given`/`when`/`then`/`ordinal` clause fields) linked via `ACCEPTANCE_OF` (`AcceptanceCriterion → UserStory`). ACs are Given/When/Then per XD-10, matching the `story-spec-core` shape. Written through the same path OQ-2 resolves for stories. | must | XD-10, story-spec-core |

### Risks via the governed API (XD-04, XD-08)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-11 | **Product/delivery risks created via the governed `risk-register` API** — at least two Product-function risks (e.g. "roadmap thrash / shifting priorities", "release regression escaping to production", "spec-throughput bottleneck starving delivery") created by **POSTing to `POST /api/v1/risk-register`** (Postgres-backed, owned by `risk-compliance-change`). Each row conforms to the route's `createRiskSchema`: `name`, `owner`, `domain` (`"Product & Delivery"`), `likelihood` (1–5), `impact` (1–5), `status` (`open`/`mitigating`/`accepted`/`resolved`), `trend` (`up`/`flat`/`down`), optional `description`/`mitigation_plan`/`category`/`risk_type` (`strategic`/`operational`/`technical`/…)/`linked_entity_type`/`linked_entity_id`. This spec **never edits** `risk-register.ts` / `risk-compliance.ts` / `change-requests.ts` / `compliance-rules.ts` / `sla-crud.ts` (owned elsewhere, XD-04/XD-08) — it creates **data** via the governed route, reusing the foundation's governed-API seed helper (foundation FR-06) where applicable. Risks are **not** graph `{nodes,edges}` import rows. | must | XD-04, XD-08 |

### DDD system mapping (XD-10)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-12 | **DDD capability mapping for the Product function** — the Product activities' underlying **business capabilities** are modeled as `Capability` nodes (already-registered runtime label, `register-capability-labels.ts`), linked: `Activity -[:NEEDS_CAPABILITY]-> Capability`, `Capability -[:SUPPORTED_BY]-> System`, `Capability -[:ASSIGNED_TO_CONTEXT]-> BoundedContext`, and `Capability -[:CAPABILITY_IN_MODEL]-> BusinessModel` (the SaaS-Operator root). At least one **`BoundedContext`** for the Product function (e.g. "Product Delivery Context") is created and capabilities assigned to it, so the as-built `ddd-system-modeling` / bounded-contexts surface renders the Product function's DDD view. All labels/edges here are already-registered runtime constructs — no new label/edge (NFR-01). `CAPABILITY_IN_MODEL` is **not** a lifecycle edge, so it is importable; the design confirms which DDD rows are import-safe vs. must run via a governed path. | must | XD-10, ddd-system-modeling |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | **No new store, no new compile-time OR runtime labels/edges.** This spec adds **zero** entries to `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS` in `shared/src/schema/{nodes,edges}.ts` and registers **zero** new runtime ontology labels/edges. It uses **only** existing labels (`Domain`/`UserJourney`/`Activity`/`Role`/`System`/`KPI`/`UserStory`/`AcceptanceCriterion`/`Capability`/`BoundedContext`/`MetricDefinition`) and edges (`PART_OF`/`EXECUTES`/`USES_SYSTEM`/`PRECEDES`/`ALIGNED_TO`/`MEASURES`/`DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE`/`ACCEPTANCE_OF`/`NEEDS_CAPABILITY`/`SUPPORTED_BY`/`ASSIGNED_TO_CONTEXT`/`CAPABILITY_IN_MODEL`). `MetricDefinition`/`MEASURES` are registered by `saas-metric-library`; DDD/story labels are registered at boot — this spec consumes all of them. | XD-02, XD-04, foundation NFR-01 |
| NFR-02 | **Idempotency + retail isolation.** Re-running the Product seed yields zero net new nodes/edges/KPIs/risks (graph rows MERGE on stable seed id via `realImport`; KPIs/risks are guarded by a resolve-before-create lookup so a re-run does not duplicate). No run mutates retail Business Model #1's subgraph or the retail/commercial seed files (XD-01); all content is scoped under the SaaS-Operator root's `Product & Delivery` domain. | XD-01, XD-04 |
| NFR-03 | **Loader compatibility (foundation FR-07/FR-09).** The graph portion of the slice is a **lifecycle-guard-clean** `{nodes,edges}` fixture (`shared/seed/saas-operator/product-delivery.json`) carrying **no** lifecycle rows (no `BusinessModel`/`ModuleInstance`/… nodes, no `IN_MODEL`/`INSTANTIATES`/… edges) so it loads through the foundation's directory-iterating loader (`POST /api/v1/import` → `realImport`) with no loader edit and no `409 model_lifecycle_route_required`. KPIs, `MEASURES` links, and risks are created via their dedicated routes (FR-07/FR-08/FR-11), **not** the fixture. | foundation FR-07/FR-08/FR-09, XD-04 |
| NFR-04 | **Route-file + owned-file single ownership (XD-05, XD-04, XD-08).** This spec ships **NO** `pwa/` files and edits **neither** `route.ts`/`SURFACES`/`views/index.tsx` nor any sibling view component (XD-05); it edits **no** KPI/OKR route code, risk/SLA/compliance/change route code (XD-04/XD-08), `model-lifecycle-guard.ts`, or the compile-time schema arrays. It creates KPI/link/risk **data** only through the governed write paths. It edits **no** `saas-metric-library`- or `saas-operator-foundation`-owned source (it consumes their helpers/loader/catalog). | XD-04, XD-05, XD-08 |
| NFR-05 | **House rules.** `zod` is the only validation library (reuse the routes' existing schemas — `createRiskSchema`, `kpiCreateRequestSchema`, `importPayloadSchema`); no `tsc` (transpile via `bun run typecheck`); en-US identifiers; server binds loopback `127.0.0.1:8787`; auth via the central router gate + `api/src/auth/` only (no per-route auth); all REST under `/api/v1/`. | CLAUDE.md |

## Representation Mapping (XD-10)

Every Product business action / artifact → its companygraph label + edge. Every
label/edge below already exists (compile-time core or already-registered
runtime); none is invented (NFR-01). This table is the reviewable proof required
by XD-10 (the design carries the fully enumerated per-instance version).

| # | Product business action / artifact | companygraph label | companygraph edge(s) | Write path |
|---|------------------------------------|--------------------|----------------------|------------|
| M-01 | The Product function itself | `Domain` (`Product & Delivery`, pre-seeded) | `Domain -[:IN_MODEL]-> BusinessModel` (foundation) | resolved by `seedKey` lookup (FR-01) — not created here |
| M-02 | A product journey (roadmap / delivery / analytics) | `UserJourney` | `UserJourney -[:PART_OF]-> Domain` | import fixture (FR-03) |
| M-03 | A step within a journey | `Activity` | `Activity -[:PART_OF]-> UserJourney`; `Activity -[:PRECEDES]-> Activity` (order) | import fixture (FR-04) |
| M-04 | Who performs a step | `Role` | `Role -[:EXECUTES]-> Activity` | import fixture (FR-05) |
| M-05 | A system a step uses | `System` (shared or slice-local) | `Activity -[:USES_SYSTEM]-> System` | import fixture (FR-06) |
| M-06 | A KPI grounded in a canonical metric | `KPI` | `KPI -[:MEASURES]-> MetricDefinition`; `KPI -[:ALIGNED_TO]-> UserJourney/Activity/Domain` | `POST /api/v1/kpis` + `linkKpiToMetric` + alignment write (FR-07/FR-08) |
| M-07 | A user story for an activity | `UserStory` | `UserStory -[:DESCRIBES_ACTIVITY]-> Activity`; `UserStory -[:STORY_FOR_ROLE]-> Role` | story write path (FR-09, OQ-2) |
| M-08 | A Given/When/Then acceptance criterion | `AcceptanceCriterion` | `AcceptanceCriterion -[:ACCEPTANCE_OF]-> UserStory` | story write path (FR-10, OQ-2) |
| M-09 | A product/delivery risk | (Postgres `risk_register` row — not a graph node) | `linked_entity_type`/`linked_entity_id` reference into the graph | `POST /api/v1/risk-register` (FR-11) |
| M-10 | A business capability behind a step | `Capability` | `Activity -[:NEEDS_CAPABILITY]-> Capability`; `Capability -[:SUPPORTED_BY]-> System`; `Capability -[:CAPABILITY_IN_MODEL]-> BusinessModel` | import fixture (FR-12) |
| M-11 | A DDD bounded context for the function | `BoundedContext` | `Capability -[:ASSIGNED_TO_CONTEXT]-> BoundedContext` | import fixture (FR-12) |

## Scope Boundaries

**In scope:**
- The Product function content scoped under the pre-seeded `Product & Delivery`
  domain: three journeys, their ordered activities, executing roles, used
  systems, product KPIs (`MEASURES` canonical metrics), user stories + Given/
  When/Then ACs, product/delivery risks, and the DDD capability→system→context
  mapping.
- The seed slice `shared/seed/saas-operator/product-delivery.json` (the
  lifecycle-clean `{nodes,edges}` graph content the foundation loader discovers).
- A thin **self-owned** seed step for the parts the import path cannot carry:
  KPIs (`POST /api/v1/kpis`), `MEASURES` links (`saas-metric-library`'s
  `linkKpiToMetric` helper), `ALIGNED_TO` alignment, and risks
  (`POST /api/v1/risk-register`).
- The explicit representation mapping table (XD-10).

**Out of scope (owner named):**
- The `Product & Delivery` `Domain`, the SaaS-Operator root, the `IN_MODEL`
  scoping, the shared System/Persona/Role catalog, and the directory-iterating
  loader → `saas-operator-foundation` (consumed, never re-created).
- `MetricDefinition` labels, the `MEASURES` edge type, the canonical metric
  catalog, and `linkKpiToMetric` → `saas-metric-library` (consumed; if a new
  metric is needed it is added *there*, OQ-1 — not here).
- KPI/OKR **route code** (`kpi-crud.ts`, `kpi-measurement-alignment`, `kpi-*`) →
  `kpi-okr-governance` / `kpi-measurement-alignment` (this spec only *calls* the
  KPI create + alignment routes).
- Risk/SLA/compliance/change **route code** (`risk-register.ts`,
  `risk-compliance.ts`, `sla-crud.ts`, `compliance-rules.ts`,
  `change-requests.ts`) → `risk-compliance-change` / `kpi-okr-governance` (this
  spec only *POSTs data* to the risk-register route).
- Story/AC **storage/route code** (`api/src/storage/stories.ts`, story routes) →
  `story-spec-core` (this spec creates story/AC *instances* via the sanctioned
  write path, OQ-2).
- DDD/capability/bounded-context **route/storage code** (`system-model.ts`,
  `capabilities.ts`, `ontology-bounded-contexts.ts`) → `ddd-system-modeling`
  (this spec creates capability/context *instances*).
- The `Funnel`/`Stage` construct — Product does not model a funnel (only
  Marketing/Sales do, blueprint Dependency Graph); no `funnel-pipeline-modeling`
  dependency.
- **Any `pwa/` view** — this spec ships **NO** new views (scope); the Product
  function surfaces through existing Explorer / `#/business/functions` / `#/exec`.
- Cross-function aggregation (`cross-function-exec-rollup`) and benchmark scoring
  (`function-benchmark-scoring`) → wave-3 specs (they *consume* this content).

## Acceptance Criteria

<!-- Every AC traces to at least one FR. Platforms + Verification columns
     mandatory. Verification is a test path or
     `manual: <repro with input mode + observable outcome>`.
     This spec touches NO pwa/ — all platforms are server (bun test + Neo4j /
     Postgres) or CLI. -->

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | The seed resolves the `Product & Delivery` domain by `attributes.seedKey = "product_delivery"` against the SaaS-Operator root's `IN_MODEL` domains and attaches all Product journeys under it via `PART_OF`; with the foundation **not** seeded (no such domain) the seed step fails fast with a clear error and creates nothing (FR-01, NFR-02) | server (bun test + Neo4j) | `api/__tests__/product-delivery-scope.integration.test.ts` |
| AC-02 | Exactly the three frozen `UserJourney` nodes (Roadmap & Discovery, Spec-Driven Delivery, Product Analytics) exist under the `Product & Delivery` domain, each `PART_OF` the domain, each with a stable seed id; the seeded journey-name set equals the design roster exactly (FR-03) | server (bun test + Neo4j) | `api/__tests__/product-delivery-journeys.integration.test.ts` |
| AC-03 | Each journey has its frozen set of `Activity` nodes `PART_OF` it, ordered by `PRECEDES` where a process order is defined; the seeded activity set per journey equals the design roster exactly (FR-04) | server (bun test + Neo4j) | `api/__tests__/product-delivery-activities.integration.test.ts` |
| AC-04 | Every Product `Activity` is executed by at least one `Role` via `EXECUTES`; product-specific roles are created within the slice while shared operator roles are resolved (not duplicated) by name/`seedKey`; a re-run adds no duplicate role (FR-05, NFR-02) | server (bun test + Neo4j) | `api/__tests__/product-delivery-roles.integration.test.ts` |
| AC-05 | Every Product `Activity` that uses a system has a `USES_SYSTEM` edge to a `System`; shared systems (MOMS/Helm/data-warehouse) resolve to the foundation catalog (no duplicate `System` created), while slice-local systems carry a valid `systemKind` and stable seed id (FR-06, NFR-02) | server (bun test + Neo4j) | `api/__tests__/product-delivery-systems.integration.test.ts` |
| AC-06 | The four Product KPIs (cycle time, release frequency, feature adoption, spec throughput) are created via `POST /api/v1/kpis` (each a `:KPI` node with a server-generated id), and each is linked to a canonical `MetricDefinition` by exactly one `MEASURES` edge via `linkKpiToMetric` (per the OQ-1 metric mapping); a second `MEASURES` link on the same KPI is rejected (cardinality guard); no KPI route code is edited (FR-07, NFR-06) | server (bun test + Neo4j) | `api/__tests__/product-delivery-kpis.integration.test.ts`; manual: `git diff --stat api/src/routes/kpi-crud.ts` — expect no change |
| AC-07 | Each Product KPI is aligned to its journey/activity/domain via `ALIGNED_TO` and carries `domain_id` = the resolved `product_delivery` domain id, so the cockpit/benchmark specs can attribute KPI health to the Product function (FR-08) | server (bun test + Neo4j) | `api/__tests__/product-delivery-kpis.integration.test.ts` |
| AC-08 | At least one `UserStory` per journey exists, each `DESCRIBES_ACTIVITY` a Product `Activity` and (where a role exists) `STORY_FOR_ROLE` a `Role`; the story's persona/action/benefit fields are populated as the story storage owns them; no new story label is registered (FR-09, OQ-2, NFR-01) | server (bun test + Neo4j) | `api/__tests__/product-delivery-stories.integration.test.ts` |
| AC-09 | Each Product `UserStory` has at least one `AcceptanceCriterion` with populated Given/When/Then (`given`/`when`/`then`/`ordinal`) linked via `ACCEPTANCE_OF`; the AC clause fields are non-empty (FR-10) | server (bun test + Neo4j) | `api/__tests__/product-delivery-stories.integration.test.ts` |
| AC-10 | At least two Product/delivery risks are created via `POST /api/v1/risk-register` with `domain = "Product & Delivery"`, valid `likelihood`/`impact`/`status`/`trend`, and each returns a success envelope with a persisted id; `git diff` shows **no** change under `api/src/routes/{risk-register,risk-compliance,change-requests,compliance-rules,sla-crud}.ts` (FR-11, NFR-04) | server (bun test + Postgres) + CLI | `api/__tests__/product-delivery-risks.integration.test.ts`; manual: `git diff --stat api/src/routes/risk-register.ts` — expect no change |
| AC-11 | The DDD mapping exists: Product `Activity` nodes `NEEDS_CAPABILITY` `Capability` nodes, each `SUPPORTED_BY` a `System`, `CAPABILITY_IN_MODEL` the SaaS-Operator root, and `ASSIGNED_TO_CONTEXT` at least one Product `BoundedContext`; the as-built bounded-contexts read (`GET /api/v1/ontology/bounded-contexts` or the model DDD read) returns the Product context with its assigned capabilities (FR-12) | server (bun test + Neo4j) | `api/__tests__/product-delivery-ddd.integration.test.ts` |
| AC-12 | The graph fixture `shared/seed/saas-operator/product-delivery.json` is lifecycle-clean and loads via the foundation loader (`POST /api/v1/import` → `realImport`) with no loader edit and no `409 model_lifecycle_route_required`; a re-run of the full Product seed (fixture + KPIs + links + risks) yields zero net new nodes/edges/KPIs/risks and does not mutate retail Model #1's subgraph (a pre/post `/api/v1/stats` diff for the retail root is zero) (NFR-02, NFR-03) | server (bun test + Neo4j) | `api/__tests__/product-delivery-seed-idempotency.integration.test.ts` |
| AC-13 | The representation mapping table (§"Representation Mapping") covers every label/edge the slice writes, and every label/edge it names already exists — no entry is added to `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS` and no runtime label/edge is registered by this spec (FR-02, NFR-01) | server (bun test + Neo4j) + CLI | `api/__tests__/product-delivery-no-schema-additions.integration.test.ts`; manual: `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts` — expect no additions |
| AC-14 | Transpile is clean and no owned-elsewhere file is edited: `bun run typecheck` exit 0; `git diff --stat` shows **no** change to `pwa/**`, `route.ts`/`SURFACES`/`views/index.tsx`, `kpi-*`/risk/SLA/compliance/change route code, `model-lifecycle-guard.ts`, the compile-time schema arrays, or `saas-metric-library`/`saas-operator-foundation`-owned source (NFR-01, NFR-04, NFR-05) | CLI | `bun run typecheck` exit 0; manual: `git diff --stat` — expect changes confined to `shared/seed/saas-operator/product-delivery.json`, this spec's own `api/scripts`/`api/src/seed` step, and `api/__tests__/product-delivery-*.integration.test.ts` |

## Platforms & Input Modes

This spec touches **no** `pwa/` files, no gestures, no keyboard handlers, and no
input handlers of any kind. It is a **server-side content/seed spec**: its
deliverables are a JSON seed fixture, a CLI seed step, and integration tests. It
ships **no** interactive surface — the Product function is browsed through the
**existing** Explorer / `#/business/functions` / `#/exec` views owned by other
specs, which this spec does not modify. The table below records the "no
interactive surface" case explicitly (no row implicitly assumed).

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| Seed CLI (`bun run seed:product-delivery` / the foundation loader) | no | no | no | no | operator-run script; no interactive UI |
| Product content in existing Explorer / FunctionMap / exec views | yes | yes | yes | yes | rendered by **other specs'** views (not touched here); this spec only supplies the underlying graph/KPI/risk data |
| New PWA surface / canvas / drag / gesture | no | no | no | no | out of scope — this spec ships **no** `pwa/` files |

## Native Conflicts

This spec introduces **no** gesture, scroll-container, focus-trap, or
keyboard-accelerator handling — it ships no `pwa/` code at all. There is nothing
to suppress.

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| (none) | n/a | n/a |

## Dependencies

- **saas-operator-foundation** (wave 1a — the barrier): the SaaS-Operator
  `BusinessModel` root (FR-01) resolved by `name:"SaaS Operator"` +
  `attributes.saasOperatorRoot:true`; the `Product & Delivery` function `Domain`
  (FR-03) resolved by `attributes.seedKey = "product_delivery"`; the shared
  System catalog (MOMS/Helm/data-warehouse, FR-04) + shared Role catalog (FR-05)
  resolved by `seedKey`/`name`; the directory-iterating seed loader
  (`api/scripts/seed-saas-operator.ts` → `POST /api/v1/import` / `realImport`,
  FR-07) that discovers `shared/seed/saas-operator/product-delivery.json`; the
  governed-API seed helper for risk rows (FR-06).
- **saas-metric-library** (wave 1b): the canonical `MetricDefinition` catalog
  (design §4, e.g. `metric-deploy-frequency`); the `MEASURES` edge type
  (`KPI → MetricDefinition`, design §3.2); the cardinality-guarded
  `linkKpiToMetric` helper (`api/src/seed/link-kpi-metric.ts`, design §5.3). If a
  Product metric is missing from the frozen roster, it is added *there* (OQ-1).
- **graph-core** (`api/src/routes/import.ts` `realImport` behind
  `POST /api/v1/import` — the `{nodes,edges}` process-content route with the
  lifecycle guard; `api/src/routes/edges.ts` `handleEdgePost` for `PART_OF`/
  `EXECUTES`/`USES_SYSTEM`/`PRECEDES`/`NEEDS_CAPABILITY`/`SUPPORTED_BY`/…;
  `importPayloadSchema`): the graph-content write path.
- **kpi-okr-governance / kpi-measurement-alignment** (`api/src/routes/kpi-crud.ts`
  `handleKpiPost` via `POST /api/v1/kpis` with `kpiCreateRequestSchema`; the
  `ALIGNED_TO` alignment write path): KPI creation + alignment. Never edited
  (NFR-06).
- **story-spec-core** (`UserStory`/`AcceptanceCriterion` runtime labels +
  `DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE`/`ACCEPTANCE_OF` edges from
  `register-story-labels.ts`; `api/src/storage/stories.ts` story shape): story +
  AC instances (OQ-2 for the exact write path).
- **ddd-system-modeling** (`Capability`/`BoundedContext`/`Entity` runtime labels
  + `NEEDS_CAPABILITY`/`SUPPORTED_BY`/`ASSIGNED_TO_CONTEXT`/`CAPABILITY_IN_MODEL`
  edges from `register-capability-labels.ts`; `api/src/storage/system-model.ts`;
  `api/src/routes/ontology-bounded-contexts.ts` read): the DDD mapping instances.
- **risk-compliance-change** (`api/src/routes/risk-register.ts`
  `handleRiskRegisterCreate` via `POST /api/v1/risk-register` with
  `createRiskSchema`, Postgres-backed): the Product risk rows. Never edited
  (NFR-04).
- **system-augmentation-model** (`systemKind` on `System` nodes): slice-local
  systems carry a valid `systemKind` (FR-06).

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | **OQ-1 (needs the user / `saas-metric-library` owner): three of the four Product metrics are absent from the frozen metric-library roster.** The blueprint names Product KPIs for **cycle time**, **release frequency**, **feature adoption**, **spec throughput** (XD-06 requires each to `MEASURES` a `MetricDefinition`). The frozen `saas-metric-library` roster (design §4, 20 metrics) contains **`Deploy Frequency`** (`metric-deploy-frequency`, ≈ release frequency) but **not** cycle time, feature adoption, or spec throughput. XD-06 forbids inventing ad-hoc metric semantics, and `MetricDefinition` is owned by `saas-metric-library` (NFR-06) — so this spec **cannot** add them itself. **Options:** (a) **add the three missing metrics to `saas-metric-library`** (via its governed registry + `metrics.json` seed, and update its frozen roster + AC-06 exact-set assertion) — the clean, XD-06-faithful path, but it edits a dependency's owned artifact (requires that spec's owner/an amendment); (b) **map the three operator KPIs onto the nearest existing library metrics** (e.g. cycle time → CAC Payback-style "days" metric? — poor fit; feature adoption → a retention metric? — poor fit; spec throughput → Deploy Frequency? — conflates) — keeps this spec self-contained but weakens comparability, the exact failure XD-06 guards against; (c) **defer the three KPIs** to a follow-up once the library grows, shipping only the `release frequency → Deploy Frequency` KPI now (under-delivers on XD-10 full-pipeline depth). **Author recommendation: option (a)** — add `Cycle Time`, `Feature Adoption`, `Spec Throughput` to the metric library (each with formula/unit/category/benchmark) as a coordinated dependency amendment, so all four Product KPIs `MEASURES` a canonical metric. **The design cannot finalize FR-07's metric mapping until OQ-1 is decided.** | Determines FR-07's KPI→metric mapping, AC-06's expected `MEASURES` targets, and whether a coordinated `saas-metric-library` roster amendment is needed. | **User decision required.** Recommend (a). If (a), coordinate the three new metric definitions + seed ids with the `saas-metric-library` owner; pin FR-07/AC-06 to the resulting seed ids. |
| 2 | **OQ-2 (design-time): the sanctioned write path for `UserStory`/`AcceptanceCriterion` instances.** Story/AC domain fields (persona/action/benefit/narrative; given/when/then/ordinal) are **top-level Neo4j properties owned by `api/src/storage/stories.ts`** (per `register-story-labels.ts`), not the generic `attributes` map. A plain `{nodes,edges}` import row for a `UserStory` may **not** populate those top-level fields correctly (the import path writes the standard node envelope + `attributes_json`, not story-specific top-level props). **Options:** (a) create stories/ACs via the **story-spec-core write route/storage entry point** (a governed path that sets the top-level fields) from this spec's self-owned seed step — faithful to the owned shape, but depends on that route existing + being callable from a seed script; (b) author the story/AC rows in the import fixture with the domain fields as top-level node properties **iff** `realImport` preserves arbitrary top-level props (needs verification against `import.ts`); (c) put the story fields in `attributes` and accept they won't surface in the story-owned queries (weakest — breaks the story surface). **Author leans (a)** (governed, matches the owned shape). Verify at design time which story write path is callable from a seed step. | Determines FR-09/FR-10's write path, AC-08/AC-09's assertions, and whether the story rows live in the fixture or the self-owned seed step. | Design-time; verify the `story-spec-core` write path against `api/src/storage/stories.ts` + its route. Author leans (a). |
| 3 | **OQ-3 (design-time): self-owned seed-step placement + wiring.** The graph fixture rides the **foundation loader** (drop `product-delivery.json` in `shared/seed/saas-operator/`, zero loader edit). But KPIs (`POST /api/v1/kpis`), `MEASURES` links (`linkKpiToMetric`), `ALIGNED_TO`, risks (`POST /api/v1/risk-register`), and possibly stories (OQ-2) are **not** import rows and need a **self-owned seed step** (mirroring `saas-metric-library`'s `seed:saas-metric-library`). **Question:** is that step a feature-owned CLI (`bun run seed:product-delivery`, run after the foundation loader) — the author-lean, ownership-clean choice — or folded into the foundation loader (a foundation edit this spec cannot make, XD-05)? And must the fixture load **before** the KPI/link/risk step (activities must exist before `ALIGNED_TO`/`NEEDS_CAPABILITY` reference them)? **Author leans a self-owned `seed:product-delivery` step** that (1) relies on the foundation loader having imported the fixture, then (2) creates KPIs → links → alignment → risks in order. | Determines the seed wiring, the `package.json` script (a feature-owned addition), and the ordering guarantee (fixture before governed-API step). | Design-time; author leans a self-owned `seed:product-delivery` CLI, run after `seed:saas-operator`. Confirm ordering. |
| 4 | **OQ-4 (design-time): risk `linked_entity` targeting.** `createRiskSchema` accepts optional `linked_entity_type`/`linked_entity_id`. Should Product risks link to the Product `Domain`/journey/activity id (so the cockpit can attribute risk to the function) or stay unlinked (simpler)? | Determines whether AC-10 asserts a linked entity and how the cockpit attributes Product risk. | Design-time; author leans linking each risk to the `product_delivery` domain id (or the specific at-risk activity) for cockpit attribution. Bounded. |
| 5 | **Foundation `#/business` surface was removed by a `navigation-ia` restructure** (`saas-metric-library` STATUS.md — commit `fb43471` removed the `#/business` surface from `route.ts`/`SURFACES`). | Because this spec ships **NO** views and surfaces through existing Explorer/exec, it is **unaffected** by that PWA blocker — it has no route seam to depend on. | No action for this spec; noted so a reviewer does not expect a `#/business` view here. The FunctionMap/`#/business` resolution is a foundation/Phase-C concern, not this content spec's. |
| 6 | **Dependency-ordering barrier.** This spec's seed references the operator root, the `product_delivery` domain, the shared catalog (foundation), and the `MetricDefinition` catalog + `MEASURES` edge (`saas-metric-library`). If either dependency has not seeded, the Product seed fails. | A premature run creates nothing (FR-01 fail-fast) rather than partial/duplicate data. | Dependency waves enforce ordering (foundation + metric-library land before wave-2 content). FR-01/NFR-02 make a premature or repeat run safe (fail-fast / net-zero). |
