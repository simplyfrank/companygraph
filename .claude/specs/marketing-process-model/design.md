---
feature: "marketing-process-model"
created: "2026-07-06"
author: "spec-author"
status: "draft"
reviewing_requirements_revision: 2
size: "medium"
---

# Design: marketing-process-model

<!-- The File Changes table (§9) is the permission surface for implementation —
     spec-guard blocks Write/Edit on any source file not listed there (or in
     tasks.md) until this document's frontmatter status is "approved". -->

## 1. Overview

`marketing-process-model` is a **wave-2 content spec** of the SaaS-Operator
fan-out (blueprint `.claude/specs/blueprint-saas-operator.md`), depending on
`saas-operator-foundation` (wave 1a) and the two wave-1b constructs
`saas-metric-library` + `funnel-pipeline-modeling`. It authors the **Marketing
function** of the docorg SaaS operator at full-pipeline depth (XD-10) and
**builds no new schema, no new store, no new REST route, and no new PWA view.**
It composes existing, as-built and wave-1b-registered surfaces two ways:

1. **A seed fixture `shared/seed/saas-operator/marketing.json`** — the
   **process-content** graph rows (`UserJourney`/`Activity`/`Role`/`System`
   nodes + their `PART_OF`/`EXECUTES`/`USES_SYSTEM`/`PRECEDES`/`INTEGRATES_WITH`/
   `PARTICIPATES_IN`/`PERFORMS_AS`/`HAS_STAGE` edges), loaded idempotently by the
   foundation's directory-iterating loader (`POST /api/v1/import` → `realImport`,
   MERGE-on-id) with **no edit** to `api/scripts/seed-saas-operator.ts`.
2. **A self-owned companion seed script `api/scripts/seed-marketing.ts`**
   (`bun run seed:marketing`) — the **API-driven** data the raw import cannot or
   must-not carry: KPIs, `MEASURES` links, KPI alignments, `CONVERTS_TO`
   transitions, stories/ACs, risks, capabilities. Each rides an existing governed
   route (never editing owned-elsewhere code, XD-04/XD-08), keyed by
   **lookup-by-stable-attribute** (not MERGE-on-id) so a re-run is net-zero.

The design follows five rules:

- **Rule A — compose, never fork.** Every write rides an existing sanctioned path
  (`POST /api/v1/import`, `POST /api/v1/kpis`, `POST /api/v1/edges`, the funnel
  transition route, the model-scoped story/capability routes, the KPI-alignment
  route, `POST /api/v1/risk-register`). No new storage primitive, no new route, no
  compile-time `NODE_LABELS`/`EDGE_TYPES` entry, no new runtime registry
  label/edge, no new RBAC permission string (NFR-01, NFR-05).
- **Rule B — fixture is process-content only; everything guarded/cross-store is
  API-driven.** `marketing.json` carries **no** lifecycle rows (rejected `409
  model_lifecycle_route_required`, foundation FR-09) and **no** rows that need a
  guarded/range-checked/cross-store path (KPIs, `MEASURES`, `CONVERTS_TO`,
  stories/ACs, risks, capabilities). Those are created by the companion script
  through their governed routes, which carry the validation the raw import
  bypasses (§4.6, resolves OQ-1).
- **Rule C — idempotency by lookup, not MERGE.** Fixture rows carry stable seed
  ids → the loader's MERGE-on-id makes them idempotent. Governed routes
  server-generate ids, so the companion script resolves the SaaS-Operator root id
  + Marketing journey/activity ids by lookup (`POST /api/v1/query/cypher`,
  `query:read`) and, for each API-driven row, **checks existence-by-name/attribute
  before POSTing** so a re-run creates nothing (§4.5, resolves OQ-1/OQ-3).
- **Rule D — retail isolation.** No write touches retail Business Model #1's
  subgraph or the retail/commercial seed files; all writes are scoped under the
  SaaS-Operator root or reference shared reference nodes by stable id (NFR-02).
- **Rule E — no view, no route-file edit.** This slice edits no
  `route.ts`/`SURFACES`/`views/index.tsx` (sole-owned by
  `saas-operator-foundation`, XD-05), owns no view component file, and adds no
  route to `api/src/router.ts` or `api/src/auth/rbac-permissions.ts`. Its content
  surfaces through views owned by other specs, unchanged (NFR-03, NFR-05).

Rejected at design level (see §11): landing the API-driven data as fixture import
rows (bypasses KPI/story/risk/capability validation + cross-store — Rule B);
editing the foundation loader for a per-slice API hook (foundation-owned, no seam
— OQ-1); MERGE-on-id idempotency for API-driven rows (routes server-generate ids
— Rule C); inventing a local `MetricDefinition` for CPL/cost-per-MQL (XD-06,
B-01); typing the KPI→metric link `INSTANTIATES` (lifecycle-guarded — XD-06-erratum).

## 2. Requirements open questions + review carries — resolution in this design

The requirements are approved at rev 2 (`review-requirements.md`, verdict
**approve**, 0 blockers). Two items were carried into the design phase and are
closed here; two non-blocking review findings (C-04, N-03) are dispositioned.

| Item | Requirements text | Resolution in this design | Section |
|------|-------------------|---------------------------|---------|
| **OQ-1 / C-02** (carried) | Fixture-vs-API row split + who runs the companion step; name the script, pin wiring + per-kind idempotency key | **A self-owned `seed:marketing` companion script** `api/scripts/seed-marketing.ts`, wired `bun run seed:marketing`, run **after** `bun run seed:saas-operator`. §4.5 pins the per-kind idempotency key (lookup-by-name/attribute); §4.6 pins which rows are fixture vs. API-driven; §7 pins the wiring. No foundation-loader edit. | §4.5, §4.6, §7 |
| **OQ-3** (carried) | SaaS-Operator root id + Marketing activity id resolution at seed time (ids are server-generated) | The companion script's **step 0 resolver** does one `POST /api/v1/query/cypher` for the operator root id (foundation's `saasOperatorRoot:true` + `name:"SaaS Operator"` marker), then resolves Marketing journey/activity/system ids by their fixture `attributes.seedKey` under that root, into an in-memory id map used by every subsequent model-scoped POST. | §4.4 |
| **C-04** (review concern, non-blocking) | The MQL→SQL KPI grounds in `metric-pipeline-conversion`, whose canonical formula is a sales-win metric | **Option (a) — keep the link, document the proxy.** The MQL→SQL KPI's `description` states it uses `metric-pipeline-conversion` as the **nearest canonical roster proxy** for a qualified-stage conversion, so the benchmark-scoring wave-3 spec reads an explicit note rather than an unlabeled overload. No local metric is invented (XD-06); AC-06 still passes. | §4.2, §3.2 |
| **N-03** (review nit) | "marketing-sourced pipeline" + "lead volume" are also `MEASURES`-less but not named in the backlog note | The design confirms **no** roster metric fits raw lead volume / marketing-sourced pipeline (the frozen 20-row roster, `saas-metric-library/design.md:246–274`, has no lead-count or sourced-pipeline metric), so all four (CPL, cost-per-MQL, pipeline, lead volume) are seeded as valid `MEASURES`-less KPIs; the "never invent a local `MetricDefinition`" invariant (XD-06) holds for every one. | §3.2, §4.2 |

## 2.1 Deviations Register

Two requirements citations name a governed-route path that differs from the
as-built router. This design cannot edit `requirements.md`; each divergence is
recorded here for the orchestrator to land as a requirements-errata note. Neither
changes an FR's intent — only the concrete endpoint string the companion script
targets.

| # | Requirements text | As-built route (verified) | This design |
|---|-------------------|---------------------------|-------------|
| D-1 | FR-07/AC-07 imply KPI→structure alignment is created "via the existing generic edge / KPI-alignment routes" and cites `ALIGNED_TO`/`PARAM_BINDS` | The KPI-alignment write path is **`POST /api/v1/kpi-alignments`** (`handleKpiAlignmentPost`, `api/src/routes/kpi-sla-alignment.ts:22`; body `kpiAlignmentCreateRequestSchema` = `{kpi_id, target_type: "journey"\|"activity"\|"domain", target_id, weight, attribution_type, alignment_notes?}`) — **not** the generic `POST /api/v1/edges`. `PARAM_BINDS` is created via `POST /api/v1/kpis/:id/param-bindings` (`handleParamBindingPost`, `router.ts:872`). The `ALIGNED_TO` edge is written by the alignment route's internal `CREATE`, not by a client `POST /api/v1/edges` | Companion script POSTs `/api/v1/kpi-alignments` for `ALIGNED_TO`; `PARAM_BINDS` (optional) via `/api/v1/kpis/:id/param-bindings`. FR-07's "no new edge type / no route edit" holds verbatim — both routes pre-exist (§4.2, §5) |
| D-2 | FR-14 says the fixture carries `CONVERTS_TO`-"where-guard-permits" edges | `CONVERTS_TO` is **range-validated** and created **only** through the funnel-owned transition route `POST /api/v1/funnels/transitions` (`funnel-pipeline-modeling` §4.4); an import fixture `CONVERTS_TO` row would bypass the range check | `CONVERTS_TO` transitions are **never** fixture rows — they are created by the companion script via `POST /api/v1/funnels/transitions` (§4.3). The fixture carries `HAS_STAGE` (no range attrs) but **not** `CONVERTS_TO`. FR-08's `Funnel`/`Stage` nodes are also API-created by the companion script (they need the wave-1b registry labels ensured first — Rule B), not fixture rows (§4.3) |

## 3. Data model

This spec adds **no** compile-time or runtime schema. Every node/edge/row it
writes uses an existing label/edge/table. The only new zod is the companion
script's small internal fixture-shape guards (§3.4), never a REST boundary.

### 3.1 Fixture process-content (FR-01–FR-04, FR-14) — `marketing.json`

A graph-core `{nodes, edges}` import payload (`importPayloadSchema`,
`import.ts:17`). Every node row carries `label` + the standard envelope
(`id` = a stable seed id, `name`, `description`, `attributes`); every edge row
carries `type`/`fromId`/`toId` (+ optional `id`, `attributes`).

**Node rows (all with a stable seed id + `attributes.seedKey`):**

| Label | Rows | Key attributes |
|-------|------|----------------|
| `UserJourney` | 5 (FR-01) | `seedKey ∈ {content-ops, campaign-lead, mql-scoring, webinars-events, abm}` |
| `Activity` | ~22 (FR-02) | `seedKey` per activity (e.g. `draft-content`, `capture-lead`, `qualify-mql`) |
| `Role` | function-specific roles not in the shared catalog (FR-03) | `seedKey` (e.g. `content-marketer`, `demand-gen-manager`, `abm-strategist`) |
| `System` | Marketing-specific systems (FR-04) | `seedKey` + **`systemKind`** (required) |

**System `systemKind` (required attribute, resolves C-01).** `systemKind` is a
**required** attribute on the `System` registry label (`shared/src/schema/system-kind.ts:30`,
`required:["systemKind"]`; enum `SYSTEM_KINDS = functional|agentic|ai_predictive`,
`system-kind.ts:9`), enforced by the attribute-zod cache on `POST /api/v1/import`.
A `System` row omitting a valid `systemKind` is rejected `400 attribute_violation`
and aborts the payload-atomic import. The pinned per-system `systemKind`:

| System (`name`) | `seedKey` | `systemKind` |
|-----------------|-----------|--------------|
| Marketing Automation Platform (MAP) | `map` | `functional` |
| CMS | `cms` | `functional` |
| Webinar/Events Platform | `webinar-platform` | `functional` |
| Ad Platform | `ad-platform` | `functional` |
| Analytics / Attribution | `analytics-attribution` | `functional` |
| Lead-Scoring Engine (AI) | `lead-scoring-ai` | `ai_predictive` |

Shared systems (`CRM`, `Data Warehouse`) are **referenced** by the foundation's
stable seed ids (foundation §3.3 catalog) via `USES_SYSTEM`/`INTEGRATES_WITH`
edges — **not** re-authored (they already carry `systemKind`).

**Edge rows** (all non-lifecycle, all in an existing endpoint whitelist):

| `type` | From→To | FR | Notes |
|--------|---------|----|----|
| `PART_OF` | UserJourney→Domain | FR-01 | journey attached under the existing `Marketing` domain (resolved by `seedKey="marketing"`, §4.4) |
| `PART_OF` | Activity→UserJourney | FR-02 | |
| `PRECEDES` | Activity→Activity | FR-02 | intra-journey ordering where a real sequence exists |
| `EXECUTES` | Role→Activity | FR-03 | every activity ≥1 executing role |
| `USES_SYSTEM` | Activity→System | FR-04 | |
| `INTEGRATES_WITH` | System→System | FR-04 | e.g. MAP↔CRM |
| `PERFORMS_AS` | Persona→Role | FR-03 | optional, function-owner persona |
| `PARTICIPATES_IN` | Persona→UserJourney | FR-03 | optional |

`Funnel`/`Stage` nodes, `HAS_STAGE`, and `CONVERTS_TO` are **not** fixture rows
(they need the wave-1b registry labels ensured first — Rule B, D-2); they are
API-created by the companion script (§4.3).

**Idempotency (NFR-02, AC-15).** Every fixture row's stable seed id makes the
loader's `upsertNode`/`upsertEdge` MERGE-on-id net-zero on a re-run.

### 3.2 API-driven data (FR-05–FR-13) — created by the companion script

None of these are fixture rows (Rule B). Each rides its governed route:

**KPIs (FR-05) — `POST /api/v1/kpis`, `kpiCreateRequestSchema`.** Body fields
(verified `kpi-crud.ts:31`, `shared/src/schema/kpi-sla.ts:9`): `name`,
`category`, `unit`, `target_value`, `target_direction`, `measurement_frequency`
(+ optional `description`, `warning_threshold`, `critical_threshold`,
`owner_role`). **`category` is a closed enum** — `efficiency | quality |
customer_satisfaction | cost | time | compliance | other` (`kpi-sla.ts:11`); a
Marketing category outside it is rejected. `target_direction ∈
{higher_is_better, lower_is_better, target_is_exact}`; `measurement_frequency ∈
{realtime, hourly, daily, weekly, monthly, quarterly}`. Pinned Marketing KPIs:

| KPI `name` | `category` | `unit` | `target_direction` | `MEASURES` metric | Notes |
|-----------|-----------|--------|--------------------|-------------------|-------|
| CAC (marketing-attributed) | `cost` | `USD` | `lower_is_better` | **`metric-cac`** | metric-grounded (FR-06) |
| MQL→SQL Conversion Rate | `efficiency` | `%` | `higher_is_better` | **`metric-pipeline-conversion`** | metric-grounded; `description` documents the pipeline-conversion **proxy** (C-04) |
| CPL (cost per lead) | `cost` | `USD` | `lower_is_better` | — (`MEASURES`-less) | no roster metric (B-01) |
| Cost per MQL | `cost` | `USD` | `lower_is_better` | — (`MEASURES`-less) | no roster metric (B-01) |
| Marketing-Sourced Pipeline | `other` | `USD` | `higher_is_better` | — (`MEASURES`-less) | no roster metric (N-03) |
| Lead Volume | `other` | `count` | `higher_is_better` | — (`MEASURES`-less) | no roster metric (N-03) |

**`MEASURES` edges (FR-06) — `POST /api/v1/edges` `{type:"MEASURES",fromId,toId}`.**
Only the two metric-grounded KPIs get a `MEASURES` edge (KPI→MetricDefinition).
`MEASURES` is registered by `saas-metric-library` and is **not** in
`LIFECYCLE_EDGES` (verified `model-lifecycle-guard.ts:25–31`), so the generic
edge route accepts it (this is `saas-metric-library` FR-03's write path under its
OQ-1 (a)). The `metric-cac` / `metric-pipeline-conversion` ids are resolved by a
`MetricDefinition {id:$seedId}` lookup before the POST (both provably in the
frozen roster). The four `MEASURES`-less KPIs get **zero** `MEASURES` edges and
reference **no** locally-invented `MetricDefinition` (XD-06).

**KPI alignment (FR-07) — `POST /api/v1/kpi-alignments`, `kpiAlignmentCreateRequestSchema`.**
Body `{kpi_id, target_type: "journey"|"activity"|"domain", target_id, weight,
attribution_type, alignment_notes?}` (D-1). E.g. CPL → `target_type:"journey"`,
`target_id` = the Campaign→Lead journey id; MQL→SQL → the MQL Scoring journey.
The route's internal `CREATE (k)-[:ALIGNED_TO]->(t)` writes the edge; the route
404s if the KPI or target is missing (`kpi-sla-alignment.ts:35,48`). Optional
`PARAM_BINDS` via `POST /api/v1/kpis/:id/param-bindings` where a KPI is
parameterized by a specific step (D-1).

**Stories (FR-10) — `POST /api/v1/models/:modelId/stories`, `storyCreateSchema`.**
Body `{persona, action, benefit, activityId, roleId?}` (verified
`story-spec.ts:22`). `:modelId` = the resolved SaaS-Operator root id. `activityId`
must be a scoped Marketing activity of the model, else `404
story_activity_not_in_model` (`errors.ts:55`). The route emits
`DESCRIBES_ACTIVITY` (and `STORY_FOR_ROLE` when `roleId` set). ≥1 story per
journey (five).

**Acceptance criteria (FR-11) — `POST .../stories/:storyId/acceptance-criteria`,
`acCreateSchema`.** Body `{given, when, then}` — all three required, else `400
acceptance_criterion_clause_required` (`errors.ts:56`, `stories.ts:65`). The
route emits `ACCEPTANCE_OF` (route-created, not authored by this slice — N-02).
≥1 AC per story.

**Risks (FR-12) — `POST /api/v1/risk-register`, `createRiskSchema`.** Body
(verified `risk-register.ts:7`): `{name, owner, domain:"Marketing", likelihood
(1–5), impact (1–5), status ∈ {open,mitigating,accepted,resolved}, trend ∈
{up,flat,down}, risk_type?, linked_entity_type?, linked_entity_id?, …}`. Three
Marketing risks: content/brand-compliance (`risk_type:"compliance"`),
attribution/lead-data-quality (`risk_type:"operational"`),
email-deliverability/channel-dependency (`risk_type:"operational"`); each sets
`linked_entity_id` to a Marketing journey/activity id where it references one.
This is a **Postgres** row (`risk_register` table), not a graph node (M-16).

**Capabilities (FR-13) — `POST /api/v1/models/:modelId/capabilities`,
`capabilityCreateSchema`.** Body `{name, description?}` (verified
`ddd-system.ts:18`). E.g. "Capture and qualify a lead", "Run a multi-channel
campaign", "Score lead intent". Then wired:
- `PUT .../capabilities/:capabilityId/needed-by`, `neededBySchema`
  `{activityId}` **XOR** `{storyId}` (`ddd-system.ts:100`) → `NEEDS_CAPABILITY`.
- `PUT .../capabilities/:capabilityId/supported-by`, `supportedBySchema`
  `{systemId}` (`ddd-system.ts:112`) → `SUPPORTED_BY` (e.g. lead-capture
  capability supported by MAP + CRM).
- `PUT .../capabilities/:capabilityId/context`, `contextAssignSchema`
  `{boundedContextId}` (`ddd-system.ts:117`) → `ASSIGNED_TO_CONTEXT`, only where
  a bounded context applies (optional, `should`).

The route emits `CAPABILITY_IN_MODEL` (capability→BusinessModel) on create.

### 3.3 Funnel instance (FR-08, FR-09) — API-driven

The Marketing Demand Funnel is created by the companion script on the wave-1b
`Funnel`/`Stage` construct (never re-defined here):

- One `Funnel` node via `POST /api/v1/nodes/Funnel` (attributes: `name:"Marketing
  Demand Funnel"`, `modelId` = the operator root id, per `funnel-pipeline-modeling`
  §3.1's `modelId` marker so `FunnelBoard`'s listing scopes it to the operator
  root).
- Four `Stage` nodes via `POST /api/v1/nodes/Stage`, each with a required integer
  `stageOrder` (a non-integer `stageOrder` → `400 attribute_violation`,
  `funnel-pipeline-modeling` §3.2): **Visitor (0) → Lead (1) → MQL (2) → SQL (3)**
  — a strict **linear chain** (matches `funnel-pipeline-modeling` FR-11's `must`).
- `HAS_STAGE` edges (Funnel→Stage) via `POST /api/v1/edges` (no range attrs, so
  the generic route suffices — the `Funnel→Stage` whitelist is registry-enforced).
- Three `CONVERTS_TO` transitions via `POST /api/v1/funnels/transitions`
  (`funnelTransitionSchema` `{fromId, toId, conversionRate, dropOffRate,
  attributes?}`, rates in `[0,1]`, `funnel-pipeline-modeling` §3.4): Visitor→Lead,
  Lead→MQL, MQL→SQL, each with illustrative `conversionRate`/`dropOffRate`
  (`conversionRate + dropOffRate ≈ 1`, OQ-4). An out-of-range value → `400
  attribute_violation` from that route.

### 3.4 Companion-script internal zod (the only new zod, no REST boundary)

`api/scripts/seed-marketing.ts` carries a small permissive input guard for its
in-memory Marketing content tables (KPI rows, funnel spec, story/AC/risk/capability
rows) — internal to the seed harness, never a REST boundary. It **reuses** the
shared route schemas at the boundary (the routes re-parse every POST), so this
guard only sanity-checks the script's own literal data before POSTing. No
re-declaration of `kpiCreateRequestSchema`/`storyCreateSchema`/`createRiskSchema`
etc. — those validate downstream at the route.

## 4. Core logic

### 4.1 Fixture load (FR-01–FR-04, FR-14, AC-01–AC-04, AC-14)

`marketing.json` lands in `shared/seed/saas-operator/` and is discovered by the
foundation loader's directory scan (foundation §4.4 step (b)) on the next
`bun run seed:saas-operator` — **no edit** to `seed-saas-operator.ts`. The loader
POSTs it to `POST /api/v1/import` (`realImport`), which:
- MERGE-upserts each node/edge by id (idempotent, AC-15);
- runs the per-row registry attribute check → a `System` row without a valid
  `systemKind` fails `400 attribute_violation`, payload-atomic (AC-04);
- pre-scans for lifecycle rows → the fixture carries none, so no `409` (AC-14,
  NFR-04).

The `PART_OF` (UserJourney→Domain) edges reference the **existing** `Marketing`
domain id. Because the fixture is authored before the domain id is known
(server-generated by the foundation), the `PART_OF` domain-endpoint is resolved
**at companion-script time**, not in the static fixture: the fixture's
UserJourney→Domain `PART_OF` rows use the domain's stable handle. **Design
decision:** the five UserJourney→Domain `PART_OF` edges are created by the
**companion script** (which has the resolved domain id, §4.4), not the static
fixture, since the domain id is server-generated and not knowable at fixture
author time. All other process edges (Activity→UserJourney, Activity→Activity,
Role→Activity, Activity→System, System→System) reference only **fixture-local
stable ids** and stay in the fixture. (This keeps every fixture edge endpoint
resolvable from stable seed ids alone — no server-generated id in the static
fixture.)

### 4.2 KPIs + `MEASURES` + alignment (FR-05, FR-06, FR-07, AC-05–AC-07)

The companion script, for each of the six KPI rows (§3.2):
1. **Existence check** — `POST /api/v1/query/cypher` `MATCH (k:KPI {name:$name})
   RETURN k` (scoped by name; KPI names are unique per this slice's roster). If
   found → skip (idempotent, Rule C).
2. **Create** — `POST /api/v1/kpis` with the pinned body.
3. **`MEASURES`** (metric-grounded KPIs only) — resolve `MetricDefinition
   {id:$metricSeedId}`, then `POST /api/v1/edges {type:"MEASURES", fromId:kpiId,
   toId:metricId}` if not already linked (a `MATCH (k)-[:MEASURES]->(m)` check).
4. **Alignment** — `POST /api/v1/kpi-alignments {kpi_id, target_type, target_id,
   weight, attribution_type}` to the Marketing journey/activity/domain the KPI
   reports on (D-1), if not already aligned.

`kpi-crud.ts`, `kpi-sla-alignment.ts`, and the metric route code are **never
edited** — the script only calls them (NFR-03, AC-05).

### 4.3 Funnel build (FR-08, FR-09, AC-08, AC-09)

The companion script (after the wave-1b `Funnel`/`Stage` labels are ensured — a
precondition met by `funnel-pipeline-modeling`'s own `seed:funnel-pipeline`
having run, dependency ordering):
1. Resolve-or-create the `Funnel` (`POST /api/v1/query/cypher` lookup on
   `name:"Marketing Demand Funnel"` + `modelId`, else `POST /api/v1/nodes/Funnel`).
2. Resolve-or-create the four `Stage` nodes (lookup on `name` + funnel linkage,
   else `POST /api/v1/nodes/Stage` with `stageOrder`).
3. `HAS_STAGE` edges (Funnel→Stage) via `POST /api/v1/edges` if absent.
4. Three `CONVERTS_TO` transitions via `POST /api/v1/funnels/transitions` if
   absent (checked by a `MATCH (a)-[:CONVERTS_TO]->(b)` read). The funnel-composition
   read (`funnel-pipeline-modeling` FR-08, via `POST /api/v1/query/cypher`) then
   returns the stages in `stageOrder` (AC-08) and the per-transition rates round-trip
   intact (AC-09).

### 4.4 Step-0 id resolver (OQ-3, AC-01–AC-13 precondition)

Before any model-scoped or edge POST, the companion script builds an in-memory id
map with **one read pass** (`POST /api/v1/query/cypher`, `query:read`):

```cypher
// operator root
MATCH (m:BusinessModel {name:"SaaS Operator"}) RETURN m
// (filter in TS on JSON.parse(m.attributes_json).saasOperatorRoot === true)

// Marketing domain + its journeys/activities/systems by seedKey
MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel {id:$rootId})
WHERE d.attributes_json CONTAINS '"seedKey":"marketing"'
OPTIONAL MATCH (d)<-[:PART_OF]-(j:UserJourney)
OPTIONAL MATCH (j)<-[:PART_OF]-(a:Activity)
RETURN d, collect(DISTINCT j) AS journeys, collect(DISTINCT a) AS activities
```

The script parses each node's `attributes_json.seedKey` to key the map
(`{seedKey → id}`) for journeys, activities, systems, and the domain, plus the
root id. Every subsequent POST resolves its target ids from this map. If the root
or Marketing domain is absent (foundation seed not run) the script exits with a
clear "run `seed:saas-operator` first" error (never a silent partial write).

### 4.5 Idempotency key per data kind (OQ-1, AC-15)

Governed routes server-generate ids, so idempotency is **check-before-POST**
keyed on a stable natural attribute per kind:

| Data kind | Route | Idempotency key (lookup before POST) |
|-----------|-------|--------------------------------------|
| KPI | `POST /api/v1/kpis` | `KPI.name` (unique per roster) |
| `MEASURES` edge | `POST /api/v1/edges` | existing `(:KPI {name})-[:MEASURES]->(:MetricDefinition {id})` |
| KPI alignment | `POST /api/v1/kpi-alignments` | existing `(:KPI {name})-[:ALIGNED_TO]->(:… {id})` |
| Funnel / Stage | `POST /api/v1/nodes/*` | `Funnel.name`+`modelId` / `Stage.name`+funnel linkage |
| `HAS_STAGE` / `CONVERTS_TO` | edges / funnel transition route | existing edge between the resolved endpoints |
| Story | `POST /api/v1/models/:modelId/stories` | `(:UserStory {action})` describing the target activity |
| Acceptance criterion | `.../acceptance-criteria` | existing AC on the story |
| Risk | `POST /api/v1/risk-register` | `risk_register.name` + `domain:"Marketing"` (Postgres `SELECT` before insert) |
| Capability | `POST /api/v1/models/:modelId/capabilities` | `(:Capability {name})` in the model |

A second `bun run seed:marketing` run therefore creates **zero** net new
KPIs/edges/stories/ACs/risks/capabilities (AC-15). The retail-Model-#1 subgraph
is never queried or written (Rule D, NFR-02).

### 4.6 Fixture vs. API-driven — the pinned split (OQ-1, FR-14)

| Content | Path | Why |
|---------|------|-----|
| `UserJourney`/`Activity`/`Role`/`System` nodes; Activity→UserJourney, Activity→Activity (`PRECEDES`), Role→Activity (`EXECUTES`), Activity→System (`USES_SYSTEM`), System→System (`INTEGRATES_WITH`), Persona→Role/UserJourney edges | **fixture** (`marketing.json`, loaded by foundation loader) | process content, all endpoints resolvable from fixture-local stable ids; MERGE-on-id idempotent |
| UserJourney→Domain `PART_OF` | **companion script** | domain id is server-generated (foundation) — not knowable at fixture author time (§4.1) |
| KPIs, `MEASURES`, KPI alignments | **companion script** | KPI CRUD is a governed route with a Postgres/Neo4j store + closed enums; `MEASURES`/alignment need resolved server ids |
| Funnel/Stage nodes, `HAS_STAGE`, `CONVERTS_TO` | **companion script** | wave-1b labels must be ensured first (Rule B); `CONVERTS_TO` is range-checked via the funnel route only (D-2) |
| Stories, ACs | **companion script** | model-scoped routes with `story_activity_not_in_model` / clause-required guards |
| Risks | **companion script** | Postgres `risk_register` — not a graph store |
| Capabilities + `NEEDS_CAPABILITY`/`SUPPORTED_BY`/`ASSIGNED_TO_CONTEXT` | **companion script** | model-scoped ddd routes with their own validation |

## 5. HTTP API surface

This spec adds **no new REST route** and **no new RBAC permission string.** All
writes/reads ride existing routes:

| Method | Route | FR | Role in this spec | Permission (existing) |
|--------|-------|----|-------------------|-----------------------|
| POST | `/api/v1/import` (`realImport`) | FR-14 | fixture load (foundation loader) | `data:write` |
| POST | `/api/v1/query/cypher` (`runPassthrough`, read-only) | FR-05–13 | step-0 id resolver + all existence checks | `query:read` |
| POST | `/api/v1/kpis` | FR-05 | KPI create | `kpi:write` |
| POST | `/api/v1/edges` | FR-06, FR-08 | `MEASURES` + `HAS_STAGE` links | `edge:write` |
| POST | `/api/v1/kpi-alignments` | FR-07 | `ALIGNED_TO` (D-1) | `kpi:write` |
| POST | `/api/v1/kpis/:id/param-bindings` | FR-07 | `PARAM_BINDS` (optional, D-1) | `kpi:write` |
| POST | `/api/v1/nodes/{Funnel,Stage}` | FR-08 | funnel + stage node create | `node:write` |
| POST | `/api/v1/funnels/transitions` | FR-09 | `CONVERTS_TO` (range-checked) | `edge:write` |
| POST | `/api/v1/models/:modelId/stories` | FR-10 | story create | `model:write` |
| POST | `/api/v1/models/:modelId/stories/:storyId/acceptance-criteria` | FR-11 | AC create | `model:write` |
| POST | `/api/v1/risk-register` | FR-12 | risk row create | `risk:write` |
| POST | `/api/v1/models/:modelId/capabilities` | FR-13 | capability create | `capability:write` |
| PUT | `/api/v1/models/:modelId/capabilities/:id/{needed-by,supported-by,context}` | FR-13 | capability wiring | `capability:write` |

No new entry is added to `ERROR_CODES` and no new `getRoutePermission` mapping is
needed — every route above is already mapped (verified in
`rbac-permissions.ts`). No edit to `api/src/router.ts` or
`api/src/auth/rbac-permissions.ts` (NFR-05, AC-16).

## 6. UI design

**This spec ships no PWA view** (blueprint: content specs add no new views). It
owns no view component file, edits no `route.ts`/`SURFACES`/`views/index.tsx`
(sole-owned by `saas-operator-foundation`, XD-05), and introduces no route from
the View Tree. The Marketing content it seeds surfaces, **unchanged**, through
views owned by other specs: the foundation's `FunctionMap` (journey/activity
count), the Explorer drill-down for the `Marketing` domain, the wave-1b
`FunnelBoard` (the Marketing Demand Funnel), and the wave-3 `OperatorCockpit`
rollup. UX-01…UX-06 are satisfied by those owning view specs, not re-decided here;
there are no view-state, tokens, a11y, or input-mode ACs for this slice
(requirements Platforms & Input Modes / Native Conflicts are the explicit
no-interactive-surface rows). No `design-conformance.ts` invocation applies (no
touched view).

## 7. Wiring

- **`package.json`** — add `"seed:marketing": "bun --cwd api scripts/seed-marketing.ts"`
  (matches the existing `seed`/`seed:saas-operator` `bun --cwd api scripts/…`
  form). Run **after** `bun run seed:saas-operator` (which ensures the operator
  root + Marketing domain + shared catalog + loads `marketing.json`) and after
  `bun run seed:saas-metric-library` + `bun run seed:funnel-pipeline` (which
  ensure the `MetricDefinition`/`Funnel`/`Stage` labels + `MEASURES`/`HAS_STAGE`/
  `CONVERTS_TO` edge types this slice instantiates). This ordering is documented
  in the script header and the spec; the script's step-0 resolver (§4.4) fails
  loud if a precondition is missing.
- **`shared/seed/saas-operator/marketing.json`** — the fixture (process content),
  discovered by the foundation loader's `.json` scan with no loader edit.

## 8. Test strategy

All ACs are server/CLI-verified against the seeded graph + governed APIs (no PWA
handler). Integration tests need Neo4j (+ Postgres for risks) running; each test
runs `seed:saas-operator` (scaffold + fixture) then `seed:marketing` (companion)
as its fixture precondition.

| AC | Kind | Test file |
|----|------|-----------|
| AC-01 | integration (Neo4j) | `api/__tests__/marketing-journeys.integration.test.ts` — five journeys `PART_OF` the `seedKey="marketing"` domain |
| AC-02 | integration (Neo4j) | `api/__tests__/marketing-activities.integration.test.ts` — activities `PART_OF` journeys; `PRECEDES` chains resolve, no dangle; envelope present |
| AC-03 | integration (Neo4j) | `api/__tests__/marketing-roles.integration.test.ts` — every activity ≥1 `EXECUTES`; shared roles resolve to one node; persona edges resolve where present |
| AC-04 | integration (Neo4j) | `api/__tests__/marketing-systems.integration.test.ts` — `USES_SYSTEM` resolves; shared CRM/DW single node; every Marketing system has a valid `systemKind`; a `systemKind`-less fixture row → `400 attribute_violation`, nothing written; `INTEGRATES_WITH` pairs resolve |
| AC-05 | integration + CLI | `api/__tests__/marketing-kpis.integration.test.ts`; manual: `git diff --stat api/src/routes/kpi-crud.ts` → no change |
| AC-06 | integration (Neo4j) | `api/__tests__/marketing-kpi-measures.integration.test.ts` — CAC→`metric-cac`, MQL→SQL→`metric-pipeline-conversion` each exactly one `MEASURES`; no link typed `INSTANTIATES`; the four `MEASURES`-less KPIs have zero `MEASURES` + no local `MetricDefinition` |
| AC-07 | integration (Neo4j) | `api/__tests__/marketing-kpi-alignment.integration.test.ts` — each KPI `ALIGNED_TO`/`PARAM_BINDS` real Marketing structure via `POST /api/v1/kpi-alignments` (D-1); no new edge type |
| AC-08 | integration (Neo4j) | `api/__tests__/marketing-funnel.integration.test.ts` — one `Funnel`, ordered Visitor→Lead→MQL→SQL `Stage` chain via `HAS_STAGE`; composition read returns stages in order |
| AC-09 | integration (Neo4j) | `api/__tests__/marketing-funnel.integration.test.ts` — each `CONVERTS_TO` has `conversionRate`/`dropOffRate` in `[0,1]` via the funnel transition route; overall conversion computes |
| AC-10 | integration + CLI | `api/__tests__/marketing-stories.integration.test.ts` — ≥1 story/journey `DESCRIBES_ACTIVITY` a scoped activity; out-of-scope activity → `404 story_activity_not_in_model`; manual: `git diff --stat api/src/routes/stories.ts` → no change |
| AC-11 | integration (Neo4j) | `api/__tests__/marketing-stories.integration.test.ts` — every story ≥1 AC with non-empty given/when/then; missing clause → `400 acceptance_criterion_clause_required` |
| AC-12 | integration + CLI | `api/__tests__/marketing-risks.integration.test.ts` — three risks in `risk_register` (`domain:"Marketing"`, likelihood/impact 1–5) with `linked_entity_id`; manual: `git diff --stat api/src/routes/{risk-register,risk-compliance,change-requests,compliance-rules,sla-crud}.ts` → no change |
| AC-13 | integration + CLI | `api/__tests__/marketing-capabilities.integration.test.ts` — capabilities `CAPABILITY_IN_MODEL`-scoped, `NEEDS_CAPABILITY` from activity/story, `SUPPORTED_BY` a system; manual: `git diff --stat api/src/routes/capabilities.ts` → no change |
| AC-14 | integration + CLI | `api/__tests__/marketing-seed.integration.test.ts` — `marketing.json` is a valid `{nodes,edges}` payload with only non-lifecycle process rows; loads via the foundation loader; manual: `git diff --stat api/scripts/seed-saas-operator.ts` → no change |
| AC-15 | integration (Neo4j + Postgres) | `api/__tests__/marketing-seed.integration.test.ts` — running the full seed (fixture + companion) twice yields zero net new nodes/edges/risk rows; retail Model #1 `/api/v1/stats` diff zero |
| AC-16 | CLI | `bun run typecheck` exit 0; manual: `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts api/src/auth/rbac-permissions.ts api/src/router.ts` → no additions |
| AC-17 | integration (Neo4j) | `api/__tests__/marketing-mapping-coverage.integration.test.ts` — every Mapping-Table (FR-15) label/edge is instantiated by ≥1 seeded node/edge/row |

## 9. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `shared/seed/saas-operator/marketing.json` | new | FR-01, FR-02, FR-03, FR-04, FR-14 | process-content fixture (journeys/activities/roles/systems + non-domain edges); discovered by the foundation loader, no loader edit |
| `api/scripts/seed-marketing.ts` | new | FR-05–FR-13, FR-14 | companion seed script: step-0 id resolver + API-driven KPIs/`MEASURES`/alignment/funnel/`CONVERTS_TO`/stories/ACs/risks/capabilities + UserJourney→Domain `PART_OF`; idempotent by lookup (§4.5) |
| `package.json` | modify | FR-14 | add `seed:marketing` script (§7) |
| `api/__tests__/marketing-journeys.integration.test.ts` | new | AC-01 | |
| `api/__tests__/marketing-activities.integration.test.ts` | new | AC-02 | |
| `api/__tests__/marketing-roles.integration.test.ts` | new | AC-03 | |
| `api/__tests__/marketing-systems.integration.test.ts` | new | AC-04 | |
| `api/__tests__/marketing-kpis.integration.test.ts` | new | AC-05 | |
| `api/__tests__/marketing-kpi-measures.integration.test.ts` | new | AC-06 | |
| `api/__tests__/marketing-kpi-alignment.integration.test.ts` | new | AC-07 | |
| `api/__tests__/marketing-funnel.integration.test.ts` | new | AC-08, AC-09 | |
| `api/__tests__/marketing-stories.integration.test.ts` | new | AC-10, AC-11 | |
| `api/__tests__/marketing-risks.integration.test.ts` | new | AC-12 | |
| `api/__tests__/marketing-capabilities.integration.test.ts` | new | AC-13 | |
| `api/__tests__/marketing-seed.integration.test.ts` | new | AC-14, AC-15 | |
| `api/__tests__/marketing-mapping-coverage.integration.test.ts` | new | AC-17 | |

**Explicitly NOT edited** (ownership boundaries — spec-guard must not allow):
`api/scripts/seed-saas-operator.ts` (foundation loader — the fixture is
discovered, not registered); `api/src/routes/kpi-crud.ts`,
`api/src/routes/kpi-sla-alignment.ts`, `api/src/routes/stories.ts`,
`api/src/routes/capabilities.ts`, `api/src/routes/funnels.ts`,
`api/src/routes/edges.ts`, `api/src/routes/import.ts`,
`api/src/routes/risk-register.ts`, `api/src/routes/{risk-compliance,change-requests,compliance-rules,sla-crud}.ts`
(all called, never edited — XD-04/XD-08); `shared/src/schema/{nodes,edges}.ts`
(no schema-array edit, NFR-01); `api/src/auth/rbac-permissions.ts` (no new
permission, NFR-05); `api/src/router.ts` (no new route dispatch, NFR-05);
`pwa/src/route.ts` / `pwa/src/views/index.tsx` (sole-owned by foundation, XD-05);
any `saas-metric-library` / `funnel-pipeline-modeling` file (their labels/edges
are instantiated, never registered/edited).

## 10. Traceability

| FR | Design | ACs |
|----|--------|-----|
| FR-01 | §3.1, §4.1, §4.4 | AC-01 |
| FR-02 | §3.1, §4.1 | AC-02 |
| FR-03 | §3.1, §4.1 | AC-03 |
| FR-04 | §3.1, §4.1 | AC-04 |
| FR-05 | §3.2, §4.2 | AC-05 |
| FR-06 | §3.2, §4.2 | AC-06 |
| FR-07 | §3.2, §4.2 (D-1) | AC-07 |
| FR-08 | §3.3, §4.3 (D-2) | AC-08 |
| FR-09 | §3.3, §4.3 | AC-09 |
| FR-10 | §3.2, §4.4 | AC-10 |
| FR-11 | §3.2 | AC-11 |
| FR-12 | §3.2 | AC-12 |
| FR-13 | §3.2 | AC-13 |
| FR-14 | §3.1, §4.1, §4.5, §4.6, §7 | AC-14, AC-15 |
| FR-15 | requirements Mapping Table; §3.1–§3.3 | AC-17 |
| NFR-01 | §3, §5, §9 | AC-16 |
| NFR-02 | §3.1, §4.4, §4.5 (Rule D) | AC-15 |
| NFR-03 | §4.2, §5, §9 | AC-05, AC-10, AC-12, AC-13, AC-16 |
| NFR-04 | §3.1, §4.1 | AC-14 |
| NFR-05 | Rule A/E, §5, §9 | AC-16 |

## 11. Rejected alternatives

- **Landing the API-driven data (KPIs, `MEASURES`, stories, risks, capabilities,
  `CONVERTS_TO`) as fixture import rows.** The raw import bypasses each governed
  route's validation, closed enums, cross-store (Postgres risk), lifecycle guard,
  and range checks. Rejected → API-driven companion script (Rule B, §4.6).
- **Editing the foundation loader (`seed-saas-operator.ts`) for a per-slice
  API-driven hook.** The loader is foundation-owned with a fixed scan + no
  ensure-hook seam (foundation §4.4). Rejected → self-owned `seed:marketing`
  companion script (OQ-1, §4.5).
- **MERGE-on-id idempotency for API-driven rows.** The governed routes
  server-generate ids, so MERGE-on-id is unavailable. Rejected →
  check-before-POST keyed on a stable natural attribute per kind (Rule C, §4.5).
- **Inventing a local `MetricDefinition` for CPL / cost-per-MQL / lead volume /
  marketing-sourced pipeline.** The frozen roster has no such metric; inventing
  one violates XD-06 ("never invent ad-hoc metric semantics"). Rejected → seed
  them as valid `MEASURES`-less KPIs (B-01, N-03, §3.2).
- **Typing the KPI→metric link `INSTANTIATES`.** `INSTANTIATES` is
  lifecycle-guarded (`model-lifecycle-guard.ts:28`) → `409
  model_lifecycle_route_required`. Rejected → `MEASURES` (XD-06-erratum, §3.2).
- **Static-fixture UserJourney→Domain `PART_OF` + `CONVERTS_TO` rows.** The
  domain id is server-generated (not knowable at fixture author time) and
  `CONVERTS_TO` is range-checked only via the funnel route. Rejected → both
  created by the companion script (§4.1, D-2).
- **A new KPI-alignment via generic `POST /api/v1/edges`.** The alignment write
  path is the dedicated `POST /api/v1/kpi-alignments` route, which validates the
  target and writes `ALIGNED_TO` internally. Rejected → the alignment route (D-1).
