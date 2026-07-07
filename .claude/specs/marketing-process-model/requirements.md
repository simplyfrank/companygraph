---
feature: "marketing-process-model"
created: "2026-07-06"
author: "spec-author"
status: "revised"
revision: 2
size: "medium"
---

# Requirements: marketing-process-model

## Summary

`marketing-process-model` is a **wave-2 content spec** of the SaaS-Operator
business-process model (blueprint `.claude/specs/blueprint-saas-operator.md`),
depending on `saas-operator-foundation` (wave 1a) and the two wave-1b constructs
`saas-metric-library` and `funnel-pipeline-modeling`. It authors the **Marketing
function** of the docorg SaaS operator at **full-pipeline depth** (XD-10): the
`Marketing` `Domain` (already scoped `IN_MODEL` to the SaaS-Operator root by the
foundation) is populated with its **user journeys** (content ops, campaign→lead,
MQL scoring, webinars/events, ABM), the **activities × roles** inside each
journey, the **systems** those activities use, the **KPIs** — those that ground in a canonical
metric-library definition link to it via the `MEASURES` edge (XD-06 /
XD-06-erratum: **CAC → `metric-cac`, MQL→SQL conversion → `metric-pipeline-conversion`**;
CPL / cost-per-lead / cost-per-MQL are seeded as **supporting KPIs that carry no
`MEASURES` edge** because no such canonical metric exists in the frozen
`saas-metric-library` roster — resolves B-01), the **marketing funnel
instance** built on the `funnel-pipeline-modeling` construct, the **stories +
Given/When/Then acceptance criteria** (via `story-spec-core` routes), the
**marketing risks** (created via the existing `risk-register` API — XD-04, never
editing risk code), and the **DDD system mapping** (capabilities → systems via
the existing `ddd-system-modeling` routes). Its two concrete deliverables are a
loadable **seed slice** `shared/seed/saas-operator/marketing.json` (discovered by
the foundation's directory-iterating loader — no loader edit) and, in this
`requirements.md`, an explicit **business-action → companygraph label/edge
mapping table** (XD-10) proving the Marketing function maps onto the graph
representation.

It **adds no new PWA view** (blueprint: content specs surface through the
existing Explorer / `#/insights/functions` / `#/exec`), **registers no new label
or edge type** (it instantiates the labels/edges the foundation + wave-1b specs
registered), **edits no route-registration file** (`route.ts` / `SURFACES` /
`views/index.tsx` — sole-owned by `saas-operator-foundation`, XD-05), and
**never edits any risk / SLA / compliance / change / KPI / funnel / metric route
code** (XD-04/XD-08 — it creates that data only through the governed APIs). It
does **not** author the Sales pipeline (owned by `sales-process-model`) or the
`Funnel`/`Stage` construct code (owned by `funnel-pipeline-modeling`).

### Revision 2 — review resolutions (2026-07-06)

This revision addresses every finding in `review-requirements.md` (rev 1). No
stable ID is renumbered.

- **B-01 (Blocker) — KPIs re-mapped to metrics that provably exist in the frozen
  roster.** I verified the delivered `saas-metric-library` roster
  (`saas-metric-library/design.md:246–274`, an **exact-set-equality** frozen list
  of 20 `MetricDefinition` rows, asserted by that spec's AC-06). It contains
  **CAC** (`metric-cac`) and **Pipeline Conversion** (`metric-pipeline-conversion`)
  but **no** CPL/cost-per-lead, cost-per-MQL, or a dedicated "MQL→SQL conversion"
  metric. The review is correct that OQ-2's "flag it to the upstream to add
  metrics" posture is **not viable** against an already-frozen, exact-equality
  upstream at this spec's approval time. Resolution (review option (b)): FR-05/FR-06
  and AC-05/AC-06 now **name only metrics that exist in the delivered roster** —
  **CAC → `metric-cac`** and **MQL→SQL conversion rate → `metric-pipeline-conversion`**
  (the roster's per-qualified-stage conversion metric — semantically honest for a
  stage-to-stage qualified-conversion KPI). CPL, cost-per-lead, and cost-per-MQL
  are **still seeded as supporting Marketing KPIs**, but they carry **no `MEASURES`
  edge** (FR-06's "exactly one `MEASURES`" now applies **only** to a KPI that
  grounds in a roster metric — a KPI with no canonical metric is a valid,
  `MEASURES`-less KPI, not a violation). OQ-2 is recomposed from a deferred hope
  into a **closed decision**: this slice does **not** depend on any upstream roster
  amendment; the CPL-metric gap is recorded as an **optional, non-blocking**
  backlog item for `saas-metric-library` (§Risks OQ-2), and if that spec ever adds
  a CPL metric, the CPL KPI can be `MEASURES`-linked additively without touching
  this contract.
- **C-01 (Concern) — `systemKind` requiredness + failure mode** now stated in FR-04
  and AC-04.
- **C-02 (Concern) — companion `seed:marketing` script** is explicitly **carried
  into design** as the design-phase item to close (OQ-1); flagged to the
  orchestrator below.
- **C-03 (Concern) — `MEASURES` write path pinned** to the concrete
  `POST /api/v1/edges` call in FR-06.
- **N-01 (Nit) — `system-augmentation-model`** reclassified in Dependencies as a
  **consumed as-built constraint** (the source of the required `systemKind`), not
  a wave-1b construct peer.
- **N-02 (Nit) — `ACCEPTANCE_OF`** noted as **route-created** (the AC write path
  emits it); this slice does not author an `ACCEPTANCE_OF` edge itself (FR-11,
  M-15).

## Motivation

1. The blueprint's core user ask is that each SaaS-operator function **maps onto
   the companygraph representation**, proven by an explicit mapping table (XD-10).
   Marketing is the canonical top-of-funnel function — content, campaigns, lead
   capture, MQL scoring, events, ABM — and is the wave-2 exemplar that the mapping
   pattern (business action → label/edge) is reviewable and reproducible for the
   other five content functions.
2. Without a Marketing content slice, the SaaS-Operator root the foundation
   created has an **empty `Marketing` domain** (foundation FR-03 seeds the domain
   root without journeys/activities). The `FunctionMap` view (foundation FR-14)
   would show Marketing with a zero journey/activity count, and the operator
   cockpit (`cross-function-exec-rollup`, wave 3) would have no Marketing KPIs,
   funnel, or risks to roll up.
3. The metric library (`saas-metric-library`) and funnel construct
   (`funnel-pipeline-modeling`) exist precisely so functions instantiate them
   rather than inventing ad-hoc semantics (XD-06). Marketing is one of the two
   funnel-instantiating functions (blueprint Dependency Graph): its
   visitor→lead→MQL→SQL funnel is the first real proof that the wave-1b funnel
   construct carries a genuine multi-stage conversion pipeline, and its CAC and
   MQL→SQL-conversion KPIs are the first proof that operator KPIs ground in the
   canonical metric library via `MEASURES` (CPL / cost-per-MQL are seeded as valid
   `MEASURES`-less KPIs where the frozen roster has no canonical metric — B-01).
4. Marketing carries real governance surface — brand/compliance risk on content,
   attribution-data risk, deliverability risk — that must be recorded as **risk
   rows created through the governed `risk-register` API** (XD-04), demonstrating
   that a content spec can attach governance data without ever touching the
   in-flight risk/compliance code the `risk-compliance-change` spec owns.

## Functional Requirements

<!-- Priorities: must = the full-pipeline depth XD-10 mandates for M2; should =
     depth beyond the mandatory floor. Grouped by pipeline layer. -->

### Marketing journeys + activities × roles (XD-10 process layer)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **Five Marketing `UserJourney` nodes** are seeded under the `Marketing` `Domain`, each linked to the domain via a `PART_OF` edge (`UserJourney → Domain`): **Content Operations**, **Campaign → Lead Capture**, **MQL Scoring & Handoff**, **Webinars & Events**, **Account-Based Marketing (ABM)**. The `Marketing` domain is **not** created here — it is resolved by its `attributes.seedKey = "marketing"` against the SaaS-Operator root (foundation FR-03); this slice attaches journeys under the existing domain, never re-creating it. Each journey carries the standard node envelope (`id`, `name`, `description`, `attributes`). | must | XD-10, blueprint Feature Inventory |
| FR-02 | **Activities per journey**, each linked to its journey via `PART_OF` (`Activity → UserJourney`), covering the real work of each journey — at minimum: Content Ops (Plan Editorial Calendar, Draft Content, Review & Approve Content, Publish Content, Repurpose & Distribute); Campaign→Lead (Define Campaign Brief, Build Landing Page & Form, Launch Paid/Organic Campaign, Capture Lead, Enrich Lead Record); MQL Scoring (Define Scoring Model, Score Inbound Leads, Qualify to MQL, Hand Off to SDR/Sales); Webinars & Events (Plan Event, Promote Event, Run Event, Follow Up with Attendees); ABM (Select Target Accounts, Orchestrate Account Plays, Measure Account Engagement). Intra-journey ordering is expressed with `PRECEDES` (`Activity → Activity`) where a real sequence exists. Every activity carries the standard node envelope. | must | XD-10 |
| FR-03 | **Roles × activities** — the Marketing roles that execute each activity are linked via `EXECUTES` (`Role → Activity`). Roles reference the **shared Role catalog** the foundation seeded (foundation FR-05) by their well-known `name`/`seedKey` (e.g. Content Marketer, Demand-Gen Manager, Marketing Ops, Field/Events Marketer, ABM Strategist, Marketing Analyst); a role not already in the shared catalog is added **within this slice** as a function-specific `Role` node (foundation FR-05 permits function-specific additions). Every activity has **at least one** executing role. Optionally, the function-owner `Persona` (e.g. "Marketing Function Owner") links to a role via `PERFORMS_AS` (`Persona → Role`) and to a journey via `PARTICIPATES_IN` (`Persona → UserJourney`) where meaningful. | must | XD-10 |
| FR-04 | **Systems × activities** — the systems Marketing activities use are linked via `USES_SYSTEM` (`Activity → System`). Shared systems (CRM, data-warehouse — foundation FR-04) are referenced by their shared stable seed id (the foundation's rows already carry `systemKind`, so this slice references, not re-authors, them). **Every `System` node this slice authors MUST carry a valid `systemKind`** from the closed `SYSTEM_KINDS` enum (`shared/src/schema/system-kind.ts:9` — `functional`, `agentic`, `ai_predictive`); `systemKind` is a **required** attribute on the `System` registry label (`system-kind.ts:30`, `required:["systemKind"]`) enforced by the attribute-zod cache on `POST /api/v1/import`, so a Marketing `System` fixture row **without** a valid `systemKind` is rejected `400 attribute_violation` and aborts the (payload-atomic) import — hence every Marketing-specific system (e.g. MAP → `functional`, CMS → `functional`, Webinar Platform → `functional`, Ad Platform → `functional`, Analytics/Attribution → `functional`, an AI lead-scoring system → `ai_predictive`) carries its `systemKind` in the fixture; the design pins the exact `systemKind` per system. System→system integrations relevant to Marketing (e.g. MAP `INTEGRATES_WITH` CRM) are expressed via `INTEGRATES_WITH` (`System → System`). (Resolves: C-01.) | must | XD-10, foundation FR-04, `system-augmentation-model` (`systemKind` requiredness) |

### KPIs grounded in the metric library (XD-06, MEASURES)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-05 | **Marketing KPIs** are created via the **existing KPI CRUD route** `POST /api/v1/kpis` (`handleKpiPost`, `api/src/routes/kpi-crud.ts`; body per `kpiCreateRequestSchema` — `name`, `category`, `unit`, `target_value`, `target_direction`, `measurement_frequency`, …). This slice authors at minimum two **metric-grounded** KPIs — **CAC** (customer acquisition cost, marketing-attributed portion; grounds in roster `metric-cac`) and **MQL→SQL conversion rate** (grounds in roster `metric-pipeline-conversion`, the per-qualified-stage conversion metric) — plus supporting **`MEASURES`-less** KPIs for which the frozen roster has **no** canonical metric: **CPL** (cost per lead), **cost per MQL**, marketing-sourced pipeline, lead volume. A KPI without a roster metric is a valid KPI that simply carries **no `MEASURES` edge** (see FR-06); it is **not** a violation and this slice **never** invents a local `MetricDefinition` for it (XD-06). KPI route code (`kpi-crud.ts`) is **never edited** — this slice only calls it (XD-08). (Resolves: B-01.) | must | XD-06, XD-10, `saas-metric-library` design roster |
| FR-06 | **Every *metric-grounded* Marketing KPI links to exactly one canonical `MetricDefinition`** via the **`MEASURES` edge (KPI → MetricDefinition)** — the edge registered by `saas-metric-library` under the SCREAMING_SNAKE name `MEASURES` (blueprint **XD-06-erratum**; renamed from the literal `INSTANTIATES` because that label collides with the lifecycle-guarded module-pin edge, `model-lifecycle-guard.ts:28`, and `MEASURES` is **not** in `LIFECYCLE_EDGES`). **Write path (pinned, resolves C-03):** the link is created through the concrete generic edge route `POST /api/v1/edges` with body `{ type:"MEASURES", fromId:<kpiId>, toId:<metricId> }` (`MEASURES` is out of the lifecycle-guard set, so the generic route accepts it — this is `saas-metric-library` FR-03's write path under its closed OQ-1 option (a)); it is **not** a seed-fixture edge row and is **never** typed `INSTANTIATES`. The one-metric-per-KPI cardinality is a behavior this slice **consumes** from `saas-metric-library` (its AC-05 / OQ-2), not one it enforces. **Metric targets (pinned, resolves B-01):** **CAC → `metric-cac`**, **MQL→SQL conversion rate → `metric-pipeline-conversion`** — each referenced by its **stable seed id** from the frozen `saas-metric-library` roster (that spec's design table, `design.md:246–274`); both provably exist in the delivered, exact-set-frozen roster. **KPIs with no roster metric** (CPL, cost-per-MQL, marketing-sourced pipeline, lead volume — FR-05) carry **no `MEASURES` edge at all**; "exactly one `MEASURES`" is scoped to the metric-grounded KPIs only. This slice does **not** invent metric semantics or a local `MetricDefinition` for the un-grounded KPIs (XD-06). The absence of a CPL/cost-per-MQL canonical metric is recorded as an **optional, non-blocking** backlog item for `saas-metric-library` (§Risks OQ-2) — this spec does **not** depend on that amendment landing. | must | XD-06, XD-06-erratum, `saas-metric-library` FR-02/FR-03 + design roster |
| FR-07 | **KPI → structure alignment** — each Marketing KPI is aligned to the graph structure it measures via the existing `kpi-measurement-alignment` edges: `ALIGNED_TO` (`KPI → UserJourney`/`Activity`/`Domain`) for the entity a KPI reports on, and/or `PARAM_BINDS` (`KPI → Activity`/`UserJourney`/`System`/`Domain`) where a KPI is parameterized by a specific step. These edges are created via the existing generic edge / KPI-alignment routes (no new edge type, no route edit). E.g. CPL `ALIGNED_TO` the Campaign→Lead journey; MQL→SQL `ALIGNED_TO` the MQL Scoring journey. | must | XD-10, `kpi-measurement-alignment` FR-04/FR-08 |

### Marketing funnel instance (funnel-pipeline-modeling)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-08 | **One marketing `Funnel` instance** ("Marketing Demand Funnel") is created via the `funnel-pipeline-modeling` construct: a `Funnel` node (`POST /api/v1/nodes/Funnel`) with an ordered chain of `Stage` nodes (`POST /api/v1/nodes/Stage`, each carrying an integer `stageOrder`) representing the top-of-funnel pipeline — at minimum **Visitor → Lead → MQL → SQL** (a strict **linear chain**, matching `funnel-pipeline-modeling` FR-11's `must` scope). The funnel is linked to its stages via `HAS_STAGE` (`Funnel → Stage`, `POST /api/v1/edges`). This slice does **not** define the `Funnel`/`Stage` labels or edge types (owned by `funnel-pipeline-modeling`) — it instantiates them. | must | XD-10, `funnel-pipeline-modeling` FR-01/FR-02/FR-06 |
| FR-09 | **Stage-to-stage conversion** is expressed with `CONVERTS_TO` (`Stage → Stage`) edges carrying `conversionRate` and `dropOffRate` (both in `[0,1]`, `conversionRate + dropOffRate` semantics per `funnel-pipeline-modeling` FR-05). Each `CONVERTS_TO` edge is created through the **funnel-owned transition route** (`funnel-pipeline-modeling` FR-07, e.g. `POST /api/v1/funnels/transitions`) which range-validates the attributes and returns `400 attribute_violation` on an out-of-range value — this slice **never** edits that route, only calls it. The marketing funnel carries realistic descriptive conversion values (illustrative, not operational records — XD-03). | must | XD-10, `funnel-pipeline-modeling` FR-05/FR-07 |

### Stories + acceptance criteria (story-spec-core, Given/When/Then)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-10 | **Marketing user stories** are created via the existing **model-scoped story route** `POST /api/v1/models/:modelId/stories` (`story-spec-core` FR-05; `:modelId` = the SaaS-Operator root id, resolved by the `saasOperatorRoot:true` marker), each carrying `{ persona, action, benefit, activityId, roleId? }` and pointing at a Marketing `Activity` via `DESCRIBES_ACTIVITY` (and optionally a `Role` via `STORY_FOR_ROLE`). The supplied `activityId` must be a scoped Marketing activity of the SaaS-Operator model (else `404 story_activity_not_in_model`, per `story-spec-core` FR-05). At minimum one story per Marketing journey (five). Story route code is **never edited** — this slice only calls it. | must | XD-10, `story-spec-core` FR-05 |
| FR-11 | **Acceptance criteria** with structured **Given/When/Then** are created for each story via `POST /api/v1/models/:modelId/stories/:storyId/acceptance-criteria` (`story-spec-core` FR-06; all three clauses required — free-text ACs rejected `400 acceptance_criterion_clause_required`). Each Marketing story has **at least one** AC. Example (Campaign→Lead capture): *Given* a published landing page with a working form, *When* a visitor submits the form, *Then* a lead record is created in the CRM and enters the demand funnel at the Lead stage. | must | XD-10, `story-spec-core` FR-06 |

### Marketing risks via the governed risk-register API (XD-04)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-12 | **Marketing risk rows** are created via the existing governed route `POST /api/v1/risk-register` (`handleRiskRegisterCreate`, `api/src/routes/risk-register.ts`; body per `createRiskSchema` — `name`, `owner`, `domain`, `likelihood` (1–5), `impact` (1–5), `status`, `trend`, optional `category`, `risk_type`, `linked_entity_type`, `linked_entity_id`, …). At minimum three Marketing risks: **content/brand-compliance risk** (`risk_type:"compliance"`), **attribution/lead-data-quality risk** (`risk_type:"operational"`), **email-deliverability / channel-dependency risk** (`risk_type:"operational"`). Each uses `domain:"Marketing"` and, where it references a graph entity, sets `linked_entity_type`/`linked_entity_id` to the relevant Marketing journey/activity id. This slice **never** edits `risk-register.ts`, `risk-compliance.ts`, `change-requests.ts`, `sla-crud.ts`, or `compliance-rules.ts` (XD-04/XD-08) — it POSTs rows through the governed helper the foundation ships (foundation FR-06). | must | XD-04, XD-10 |

### DDD system mapping via ddd-system-modeling routes (XD-10)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-13 | **Marketing capabilities → systems** are mapped via the existing `ddd-system-modeling` model-scoped routes: capabilities are created via `POST /api/v1/models/:modelId/capabilities` (`ddd-system-modeling` FR-04; `:modelId` = SaaS-Operator root id) — e.g. "Capture and qualify a lead", "Run a multi-channel campaign", "Score lead intent". Each capability is wired to the activity/story that needs it via `PUT .../capabilities/:capabilityId/needed-by` (`NEEDS_CAPABILITY`), to its supporting system via `PUT .../supported-by` (`SUPPORTED_BY`, e.g. the lead-capture capability supported by MAP + CRM), and — where a bounded context applies — assigned via `PUT .../context` (`ASSIGNED_TO_CONTEXT`). Capability/system-mapping route code is **never edited** — this slice only calls it. | must | XD-10, `ddd-system-modeling` FR-04/FR-05 |

### Seed slice + mapping-table deliverables (XD-04, XD-10)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-14 | **Seed slice `shared/seed/saas-operator/marketing.json`** carries the **process-content** rows this function contributes as a graph-core `{nodes, edges}` import payload (per `importPayloadSchema`): the `UserJourney`/`Activity`/`Role`/`System` nodes (FR-01–FR-04) and their `PART_OF`/`EXECUTES`/`USES_SYSTEM`/`PRECEDES`/`INTEGRATES_WITH`/`PARTICIPATES_IN`/`PERFORMS_AS`/`HAS_STAGE`/`CONVERTS_TO`-where-guard-permits edges, all with **stable seed ids** so the foundation loader's MERGE-on-id path (foundation FR-08) is idempotent. It is **discovered automatically** by the foundation's directory-iterating loader (foundation FR-07) with **no edit** to `api/scripts/seed-saas-operator.ts`. The fixture contains **no lifecycle rows** (`BusinessModel`/`BusinessModule`/`BusinessModuleVersion`/`ModuleInstance` + the lifecycle edges `IN_MODEL`/`HAS_VERSION`/`INSTANTIATES`/`INSTANCE_IN`/`FORKED_FROM`) — those would be rejected `409 model_lifecycle_route_required` by the `POST /api/v1/import` guard (foundation FR-09). **Non-fixture data** — KPIs (FR-05), `MEASURES` edges (FR-06), stories/ACs (FR-10/FR-11), risks (FR-12), capabilities (FR-13), `CONVERTS_TO` transitions (FR-09) — is created through the governed API routes (a companion seed step / script this slice owns), **not** as import rows, because those paths carry validation/guards the raw import bypasses. The design pins which rows are fixture vs. API-driven. | must | XD-04, XD-10 |
| FR-15 | **Business-action → companygraph label/edge mapping table** (XD-10) — this `requirements.md` carries an explicit, reviewable table mapping each Marketing business action to the companygraph node label(s) and edge type(s) that represent it (see **Mapping Table** below). This is a first-class deliverable of the spec, not an appendix: it is the proof that the Marketing function maps onto the representation, and the design/tasks trace their fixture + API calls back to its rows. | must | XD-10 |

## Mapping Table (business action → companygraph label/edge)

<!-- XD-10 mandate: the explicit proof that the Marketing function maps onto the
     companygraph representation. Every row names the concrete label(s)/edge(s)
     and the write path (seed fixture vs. governed API). Labels/edges are all
     pre-existing or wave-1b-registered — this slice registers none. -->

| # | Marketing business action / concept | companygraph label(s) | companygraph edge(s) | Write path |
|---|-------------------------------------|-----------------------|----------------------|------------|
| M-01 | A marketing area of responsibility (the function itself) | `Domain` ("Marketing", `seedKey:"marketing"`) | scoped `IN_MODEL` → SaaS-Operator root (by foundation) | foundation FR-03 (not this slice) |
| M-02 | An end-to-end marketing process (content ops, campaign→lead, MQL scoring, events, ABM) | `UserJourney` | `PART_OF` (UserJourney→Domain) | seed fixture (FR-01) |
| M-03 | A discrete marketing step of work (draft content, capture lead, score lead, …) | `Activity` | `PART_OF` (Activity→UserJourney) | seed fixture (FR-02) |
| M-04 | Ordered flow between marketing steps | `Activity` | `PRECEDES` (Activity→Activity) | seed fixture (FR-02) |
| M-05 | Who does the step (Content Marketer, Demand-Gen Manager, Marketing Ops, …) | `Role` | `EXECUTES` (Role→Activity) | seed fixture (FR-03) |
| M-06 | The marketing function owner (a persona) | `Persona` | `PERFORMS_AS` (Persona→Role), `PARTICIPATES_IN` (Persona→UserJourney) | seed fixture (FR-03) |
| M-07 | A tool a step uses (MAP, CMS, CRM, Ad Platform, Analytics/Attribution) | `System` (with `systemKind`) | `USES_SYSTEM` (Activity→System) | seed fixture (FR-04) |
| M-08 | Tool-to-tool integration (MAP ↔ CRM) | `System` | `INTEGRATES_WITH` (System→System) | seed fixture (FR-04) |
| M-09 | A marketing performance measure (CAC, MQL→SQL conversion, CPL, cost-per-MQL, lead volume, …) | `KPI` | — | governed API `POST /api/v1/kpis` (FR-05) |
| M-10 | Grounding a KPI in a canonical metric definition (only where a roster metric exists: CAC → `metric-cac`, MQL→SQL → `metric-pipeline-conversion`; CPL/cost-per-MQL have **no** roster metric → **no** `MEASURES` edge) | `KPI` → `MetricDefinition` | **`MEASURES`** (KPI→MetricDefinition) | governed API `POST /api/v1/edges {type:"MEASURES",fromId,toId}` (FR-06) — never `INSTANTIATES` |
| M-11 | What a KPI reports on / is parameterized by | `KPI` | `ALIGNED_TO` / `PARAM_BINDS` (KPI→Journey/Activity/Domain/System) | governed edge / KPI-alignment routes (FR-07) |
| M-12 | The demand funnel (Visitor→Lead→MQL→SQL) | `Funnel`, `Stage` | `HAS_STAGE` (Funnel→Stage) | wave-1b construct: node CRUD + `POST /api/v1/edges` (FR-08) |
| M-13 | Stage-to-stage conversion / drop-off | `Stage` → `Stage` | `CONVERTS_TO` (with `conversionRate`/`dropOffRate`) | funnel-owned transition route (FR-09) |
| M-14 | A marketing user story | `UserStory` | `DESCRIBES_ACTIVITY` (UserStory→Activity), `STORY_FOR_ROLE` (UserStory→Role) | governed API `POST /api/v1/models/:modelId/stories` (FR-10) |
| M-15 | A story's Given/When/Then acceptance criterion | `AcceptanceCriterion` | `ACCEPTANCE_OF` (AcceptanceCriterion→UserStory) — **route-created** by the AC write path, not authored by this slice (N-02) | governed API `.../acceptance-criteria` (FR-11) |
| M-16 | A marketing risk (brand/compliance, attribution, deliverability) | (Postgres `risk_register` row — not a graph node) | `linked_entity_id` → Marketing journey/activity id (soft ref) | governed API `POST /api/v1/risk-register` (FR-12) |
| M-17 | A marketing business capability (capture a lead, run a campaign, score intent) | `Capability` | `CAPABILITY_IN_MODEL` (Capability→BusinessModel), `NEEDS_CAPABILITY` (Activity/UserStory→Capability), `SUPPORTED_BY` (Capability→System), `ASSIGNED_TO_CONTEXT` (Capability→BoundedContext) | governed API `POST/PUT /api/v1/models/:modelId/capabilities*` (FR-13) |

Every label and edge type in this table is **pre-existing** (core process
labels/edges, `KPI`, `UserStory`/`AcceptanceCriterion`, `Capability`) or
**registered by a wave-1b dependency** (`MetricDefinition`, `Funnel`/`Stage`,
`MEASURES`, `HAS_STAGE`/`CONVERTS_TO`). This slice **registers none** — it only
instantiates them (NFR-01).

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | **No new labels/edges, no new store.** This slice adds **zero** entries to `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS` in `shared/src/schema/{nodes,edges}.ts` and registers **zero** new runtime ontology labels/edge types — it instantiates the labels/edges the foundation + wave-1b specs registered. All content lives in Neo4j under the SaaS-Operator root (process nodes/edges, KPIs, stories, capabilities, funnel) or in the existing Postgres `risk_register` table (risks) — no new datastore. | XD-02, XD-04, foundation NFR-01 |
| NFR-02 | **Idempotency + retail isolation.** Re-running the Marketing seed (fixture MERGE-on-id via the foundation loader + idempotent API-driven companion step) yields **zero** net new nodes/edges/rows. No run mutates retail Business Model #1's subgraph or the retail/commercial seed files (XD-01); all writes are scoped under the SaaS-Operator root or reference shared reference nodes by stable id. A pre/post `/api/v1/stats` diff attributable to a re-run is zero. | XD-01, house data-integrity |
| NFR-03 | **Governed-API-only for owned-elsewhere surfaces (XD-04/XD-08).** KPIs, `MEASURES` links, stories/ACs, risks, capabilities, and funnel transitions are created **only** by calling the governed routes (FR-05–FR-13). This slice **edits no file** owned by another spec: not `kpi-crud.ts`/`kpi-*`, not `risk-register.ts`/`risk-compliance.ts`/`change-requests.ts`/`compliance-rules.ts`/`sla-crud.ts`, not `stories.ts`/`capabilities.ts`, not the funnel/metric route code, not `route.ts`/`SURFACES`/`views/index.tsx`, and not `api/scripts/seed-saas-operator.ts` (the loader discovers the fixture). | XD-04, XD-05, XD-08 |
| NFR-04 | **Lifecycle-guard compatibility.** The `marketing.json` fixture is loaded via `POST /api/v1/import` (`realImport`, foundation FR-07/FR-09), so it contains **no** lifecycle-labeled rows or lifecycle edges — a lifecycle row would be rejected `409 model_lifecycle_route_required` with payload-atomic write-nothing. `IN_MODEL` domain scoping is the foundation's concern; this slice never emits an `IN_MODEL` (or any lifecycle) edge row. `MEASURES` is **not** `INSTANTIATES` and is safe, but is still created via the API path (FR-06), not a fixture edge row. | foundation FR-09, `model-workspace-core` FR-08 |
| NFR-05 | **House rules.** `zod` is the only validation library (all boundary validation reuses the existing route schemas); no `tsc` (transpile via `bun run typecheck`); en-US identifiers in any code/script this slice adds; server binds loopback `127.0.0.1:8787`; auth via the central router gate + `api/src/auth/` only (this slice adds **no** new route and **no** new RBAC permission string — it reuses existing `model:write`/`node:write`/`kpi:*`/`capability:*`/`query:read`/risk-register permissions); all REST it calls is under `/api/v1/`. | CLAUDE.md |

## UI/UX Requirements

**This spec adds no PWA view** (blueprint: the six content specs add **no new
views**; Marketing surfaces through the existing Explorer, the foundation's
`#/insights/functions` `FunctionMap`, and the wave-3 `#/exec/operator`
cockpit). It **owns no view component file**, edits **no** `route.ts` /
`SURFACES` / `views/index.tsx` (sole-owned by `saas-operator-foundation`,
XD-05), and introduces **no** route from the blueprint View Tree. The Marketing
content it seeds becomes visible in views owned by other specs (the
`FunctionMap` journey/activity count, the Explorer drill-down for the Marketing
domain, the `FunnelBoard` marketing funnel, the operator cockpit rollup) with no
change to those views. UX-01…UX-06 are therefore satisfied by the owning view
specs, not re-decided here; there are no view-state, tokens, or a11y ACs to
author for this slice.

## Scope Boundaries

**In scope:**
- The Marketing `UserJourney`/`Activity`/`Role`/`System` process content under the SaaS-Operator root (journeys, activities×roles, systems, integrations).
- Marketing KPIs created via `POST /api/v1/kpis`: the metric-grounded ones (CAC → `metric-cac`, MQL→SQL conversion → `metric-pipeline-conversion`) `MEASURES`-linked to their canonical metric-library definition, and the `MEASURES`-less supporting ones (CPL, cost-per-MQL, pipeline, lead volume) with no roster metric; all `ALIGNED_TO`/`PARAM_BINDS`-aligned to the structure they measure.
- The Marketing Demand Funnel instance (Visitor→Lead→MQL→SQL) built on the wave-1b `Funnel`/`Stage` construct, with `CONVERTS_TO` conversion/drop-off values via the funnel-owned transition route.
- Marketing stories + Given/When/Then acceptance criteria via the `story-spec-core` model-scoped routes.
- Marketing risks via the governed `risk-register` API.
- Marketing DDD capability→system mapping via the `ddd-system-modeling` model-scoped routes.
- The `shared/seed/saas-operator/marketing.json` fixture (process content) + the API-driven companion seed step for the non-fixture data + the mapping table (FR-15).

**Out of scope (owner named):**
- The `Marketing` `Domain` root + `IN_MODEL` scoping + shared System/Persona/Role catalog + the seed loader → `saas-operator-foundation` (consumed, never re-created/edited).
- The `MetricDefinition` label, the `MEASURES` edge type registration, and the canonical metric roster → `saas-metric-library` (this slice references metrics by seed id, links via the metric-library write path, and never registers/edits them).
- The `Funnel`/`Stage` labels, `HAS_STAGE`/`CONVERTS_TO` edge types, the funnel-owned transition route, and `FunnelBoard` → `funnel-pipeline-modeling` (this slice instantiates a funnel, never builds the construct).
- KPI/OKR/SLA route code, story route code, capability route code, risk/compliance/change route code → `kpi-okr-governance` / `kpi-measurement-alignment` / `story-spec-core` / `ddd-system-modeling` / `risk-compliance-change` (called, never edited).
- The **Sales** pipeline + sales funnel → `sales-process-model`.
- Any operational/transactional entity (`Lead`/`Opportunity`/`Subscription`/…) → **never created** (XD-03 — the funnel + KPIs model process/measure, not records).
- The `OperatorCockpit` Marketing rollup + benchmark scoring → `cross-function-exec-rollup` / `function-benchmark-scoring` (wave 3, read this slice's content).

## Acceptance Criteria

<!-- Every AC traces to ≥1 FR. Platforms + Verification are mandatory.
     This is a data/content spec with no owned pwa handler, so all ACs are
     server/CLI-verified against the seeded graph + governed APIs. -->

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | After `seed:saas-operator`, the `Marketing` domain (resolved by `attributes.seedKey="marketing"` under the SaaS-Operator root) has the five journeys (Content Operations, Campaign→Lead Capture, MQL Scoring & Handoff, Webinars & Events, ABM), each linked to the domain by `PART_OF` (FR-01) | server (bun test + Neo4j) | `api/__tests__/marketing-journeys.integration.test.ts` |
| AC-02 | Every seeded Marketing `Activity` is linked to its journey by `PART_OF`, and the intra-journey `PRECEDES` chains resolve (no dangling `PRECEDES`); each activity carries the standard node envelope (FR-02) | server (bun test + Neo4j) | `api/__tests__/marketing-activities.integration.test.ts` |
| AC-03 | Every Marketing `Activity` has ≥1 `EXECUTES` role; roles referencing the shared catalog resolve to a single shared `Role` (not a duplicate), and function-specific roles are present as `Role` nodes; where present, `PERFORMS_AS`/`PARTICIPATES_IN` from the Marketing function-owner persona resolve (FR-03) | server (bun test + Neo4j) | `api/__tests__/marketing-roles.integration.test.ts` |
| AC-04 | Marketing activities' `USES_SYSTEM` edges resolve to systems; shared systems (CRM, data-warehouse) resolve to the single foundation-seeded `System` (no duplicate); every Marketing-specific system carries a valid `systemKind` from `SYSTEM_KINDS` (`functional`/`agentic`/`ai_predictive`), and a hand-constructed fixture `System` row **omitting** `systemKind` is rejected `400 attribute_violation` on import (payload-atomic, nothing written); any `INTEGRATES_WITH` pair resolves (FR-04) | server (bun test + Neo4j) | `api/__tests__/marketing-systems.integration.test.ts` |
| AC-05 | The Marketing KPIs exist via `POST /api/v1/kpis` with valid `kpiCreateRequestSchema` fields: the two **metric-grounded** KPIs (CAC, MQL→SQL conversion rate) and the **`MEASURES`-less** supporting KPIs (CPL, cost-per-MQL, marketing-sourced pipeline, lead volume); `kpi-crud.ts` is unedited (FR-05, NFR-03) | server (bun test + Postgres/Neo4j per KPI store) + CLI | `api/__tests__/marketing-kpis.integration.test.ts`; manual: `git diff --stat api/src/routes/kpi-crud.ts` — expect no change |
| AC-06 | The two metric-grounded Marketing KPIs each have **exactly one** `MEASURES` edge to the canonical `MetricDefinition` named by its stable seed id — **CAC → `metric-cac`**, **MQL→SQL conversion → `metric-pipeline-conversion`** (both provably present in the frozen `saas-metric-library` roster); the edge is created via `POST /api/v1/edges {type:"MEASURES",…}`; **no** Marketing KPI→metric link is typed `INSTANTIATES` (which would be rejected `409 model_lifecycle_route_required`); a read returns one metric per grounded KPI. The `MEASURES`-less supporting KPIs (CPL, cost-per-MQL, …) have **zero** `MEASURES` edges and reference **no** locally-invented `MetricDefinition` (FR-05, FR-06) | server (bun test + Neo4j) | `api/__tests__/marketing-kpi-measures.integration.test.ts` |
| AC-07 | Each Marketing KPI is `ALIGNED_TO` (and/or `PARAM_BINDS`) the Marketing journey/activity/domain it measures; the alignment edges resolve to real Marketing structure and reuse existing edge types (no new edge type) (FR-07) | server (bun test + Neo4j) | `api/__tests__/marketing-kpi-alignment.integration.test.ts` |
| AC-08 | The Marketing Demand Funnel exists: one `Funnel` node with an ordered `Stage` chain (Visitor→Lead→MQL→SQL by `stageOrder`) linked via `HAS_STAGE`; the funnel-composition read (funnel-pipeline-modeling FR-08) returns the stages in order (FR-08) | server (bun test + Neo4j) | `api/__tests__/marketing-funnel.integration.test.ts` |
| AC-09 | Each `CONVERTS_TO` transition in the marketing funnel carries `conversionRate` and `dropOffRate` in `[0,1]`, created via the funnel-owned transition route (an out-of-range value would be rejected `400 attribute_violation`); the funnel's overall conversion (product of per-transition rates) computes without error (FR-09) | server (bun test + Neo4j) | `api/__tests__/marketing-funnel.integration.test.ts` |
| AC-10 | At least one Marketing `UserStory` per journey exists via `POST /api/v1/models/:modelId/stories`, each `DESCRIBES_ACTIVITY` a scoped Marketing activity; a story created against a non-Marketing/out-of-scope activity id is rejected `404 story_activity_not_in_model`; `stories.ts` is unedited (FR-10, NFR-03) | server (bun test + Neo4j) + CLI | `api/__tests__/marketing-stories.integration.test.ts`; manual: `git diff --stat api/src/routes/stories.ts` — expect no change |
| AC-11 | Every Marketing story has ≥1 `AcceptanceCriterion` with non-empty `given`/`when`/`then`; a free-text AC (missing a clause) is rejected `400 acceptance_criterion_clause_required` (FR-11) | server (bun test + Neo4j) | `api/__tests__/marketing-stories.integration.test.ts` |
| AC-12 | The three Marketing risks (compliance, attribution-operational, deliverability-operational) exist in `risk_register` via `POST /api/v1/risk-register` with valid `createRiskSchema` fields (`domain:"Marketing"`, `likelihood`/`impact` 1–5), each linked to a Marketing entity via `linked_entity_id` where applicable; `risk-register.ts` and the other governed risk/SLA/compliance files are unedited (FR-12, NFR-03) | server (bun test + Postgres) + CLI | `api/__tests__/marketing-risks.integration.test.ts`; manual: `git diff --stat api/src/routes/{risk-register,risk-compliance,change-requests,compliance-rules,sla-crud}.ts` — expect no change |
| AC-13 | Marketing capabilities exist via `POST /api/v1/models/:modelId/capabilities`, each `CAPABILITY_IN_MODEL`-scoped to the SaaS-Operator root, `NEEDS_CAPABILITY`-linked from a Marketing activity/story, and `SUPPORTED_BY`-linked to a system; `capabilities.ts` is unedited (FR-13, NFR-03) | server (bun test + Neo4j) + CLI | `api/__tests__/marketing-capabilities.integration.test.ts`; manual: `git diff --stat api/src/routes/capabilities.ts` — expect no change |
| AC-14 | `shared/seed/saas-operator/marketing.json` is a valid `{nodes,edges}` import payload containing **only** non-lifecycle process rows (no `BusinessModel`/`ModuleInstance`/… node rows, no `IN_MODEL`/`INSTANTIATES`/other lifecycle edge rows); loading it via the foundation loader (`POST /api/v1/import`) succeeds and writes the Marketing process content; the loader picks it up with **no edit** to `api/scripts/seed-saas-operator.ts` (FR-14, NFR-04) | server (bun test + Neo4j) + CLI | `api/__tests__/marketing-seed.integration.test.ts`; manual: `git diff --stat api/scripts/seed-saas-operator.ts` — expect no change |
| AC-15 | Idempotency + isolation: running the full Marketing seed (fixture load + API-driven companion step) twice yields zero net new nodes/edges/risk rows; a pre/post `/api/v1/stats` diff for retail Model #1 across the run is zero (FR-14, NFR-02) | server (bun test + Neo4j + Postgres) | `api/__tests__/marketing-seed.integration.test.ts` |
| AC-16 | No new compile-time labels/edges and no new runtime label/edge type were registered by this slice, and no new RBAC permission string was added; transpile is clean (NFR-01, NFR-05) | CLI | `bun run typecheck` exit 0; manual: `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts api/src/auth/rbac-permissions.ts` — expect no additions |
| AC-17 | The Mapping Table (FR-15) is present in `requirements.md` and every row's named label(s)/edge(s) exists in the graph after seeding (each mapped construct is instantiated by ≥1 seeded node/edge/row) — the table is a faithful, exercised map, not aspirational (FR-15) | server (bun test + Neo4j) | `api/__tests__/marketing-mapping-coverage.integration.test.ts` |

## Platforms & Input Modes

This spec touches **no** `pwa/` code, ships **no** view, and adds **no** gesture,
keyboard, scroll, or input handler (blueprint: content specs add no new views).
All work is server-side seed content + governed-API data creation, verified via
`bun test` + `curl`/REST. The Marketing content it seeds is rendered by views
owned by other specs, unchanged. The table is therefore the explicit no-input-
surface row.

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| (this spec ships no interactive surface) | no | no | no | no | content/data only; seeded content surfaces through other specs' views (Explorer, FunctionMap, FunnelBoard, cockpit) unchanged |

## Native Conflicts

This spec introduces **no** gesture, scroll-container, focus-trap, or
keyboard-accelerator handling — it ships no PWA code. There is nothing to
suppress.

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| (none) | n/a | n/a |

## Dependencies

- **saas-operator-foundation** (wave 1a): the SaaS-Operator `BusinessModel` root (found via `name:"SaaS Operator"` + `attributes.saasOperatorRoot:true`, that spec's OQ-1), the `Marketing` `Domain` scoped `IN_MODEL` and resolved by `attributes.seedKey="marketing"` (FR-03), the shared System/Persona/Role catalog referenced by stable id/name (FR-04/FR-05), the directory-iterating seed loader over `shared/seed/saas-operator/` behind `POST /api/v1/import` with the lifecycle guard (FR-07/FR-08/FR-09), and the **governed-API seed helper** for risk rows (FR-06). Consumed, never edited.
- **saas-metric-library** (wave 1b): the canonical `MetricDefinition` roster (referenced by stable seed id — this slice links only to **`metric-cac`** and **`metric-pipeline-conversion`**, both present in that spec's frozen design roster `design.md:246–274`), the **`MEASURES`** edge (KPI→MetricDefinition, XD-06-erratum, out of `LIFECYCLE_EDGES`), and its FR-03 write path resolved to the generic **`POST /api/v1/edges {type:"MEASURES",fromId,toId}`** (its OQ-1 option (a)). This slice links KPIs to metrics; it never registers or edits the label/edge/roster, and never depends on the roster being amended.
- **funnel-pipeline-modeling** (wave 1b): the `Funnel`/`Stage` runtime labels, the `HAS_STAGE`/`CONVERTS_TO` edge types, the funnel-owned transition route (`POST /api/v1/funnels/transitions`, range-validating `conversionRate`/`dropOffRate` → `400 attribute_violation`, FR-07 of that spec), and the funnel-composition read (FR-08). This slice instantiates one funnel.
- **story-spec-core** (`api/src/routes/stories.ts`, `/api/v1/models/:modelId/stories*` + `.../acceptance-criteria`; `UserStory`/`AcceptanceCriterion` labels; `DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE`/`ACCEPTANCE_OF` edges; `404 story_activity_not_in_model` / `400 acceptance_criterion_clause_required`): the story/AC write path (FR-10/FR-11).
- **ddd-system-modeling** (`api/src/routes/capabilities.ts`, `/api/v1/models/:modelId/capabilities*`; `Capability` label; `CAPABILITY_IN_MODEL`/`NEEDS_CAPABILITY`/`SUPPORTED_BY`/`ASSIGNED_TO_CONTEXT` edges): the capability→system mapping path (FR-13).
- **kpi-okr-governance / kpi-measurement-alignment** (`api/src/routes/kpi-crud.ts` `POST /api/v1/kpis`, `kpiCreateRequestSchema`; the `ALIGNED_TO`/`PARAM_BINDS` KPI-alignment edges): the KPI create + alignment path (FR-05/FR-07).
- **risk-compliance-change** (`api/src/routes/risk-register.ts` `POST /api/v1/risk-register`, `createRiskSchema` — `name`/`owner`/`domain`/`likelihood`/`impact`/`status`/`trend`/`risk_type`/`linked_entity_*`): the risk-row write path (FR-12). Called only; never edited (XD-04).
- **graph-core** (`api/src/routes/import.ts` `realImport` behind `POST /api/v1/import` with the lifecycle guard; `api/src/routes/nodes.ts` node CRUD; `api/src/routes/edges.ts` `POST /api/v1/edges`; `POST /api/v1/query/cypher` `query:read`): the fixture load + Funnel/Stage node + `HAS_STAGE` edge writes + reads.
- **system-augmentation-model** — *consumed as-built constraint, not a wave-1b construct peer* (N-01): the source of the **required** `systemKind` attribute on the `System` registry label (`shared/src/schema/system-kind.ts`, `SYSTEM_KINDS = functional|agentic|ai_predictive`, `required:["systemKind"]`). It is a pre-existing surface outside this blueprint's declared dependency set; it is cited only because it is why every Marketing-specific `System` fixture row must carry a valid `systemKind` or be rejected `400 attribute_violation` (FR-04, AC-04).
- **Seed infrastructure** (`shared/seed/saas-operator/` — the foundation loader's scan dir; `package.json` seed scripts): where `marketing.json` lands and the companion API-driven seed step is wired.

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | **OQ-1 (CARRIED INTO DESIGN — resolves C-02): fixture rows vs. API-driven rows split + who runs the companion step.** FR-14 splits Marketing content into (a) process rows in `marketing.json` loaded by the foundation loader and (b) API-driven data (KPIs, `MEASURES`, stories/ACs, risks, capabilities, `CONVERTS_TO`) that the raw import cannot/should-not carry (validation, guards, cross-store). The foundation loader (`seed-saas-operator.ts`) has a **hardcoded** ensure-sequence + fixed directory scan and **no** per-slice API-driven hook (confirmed by the review against the loader, and for the sibling metric-library, its OQ-4). So this slice must ship its **own** companion seed step, a feature-owned script (NFR-03). **Author leans (recommended): a self-owned `seed:marketing` companion script** wired to run after `seed:saas-operator` (i.e. `bun run seed:marketing` after the foundation seed) that (1) resolves the SaaS-Operator root id + Marketing activity/journey ids by lookup (`POST /api/v1/query/cypher`, since these routes server-generate ids), then (2) POSTs KPIs / `MEASURES` / stories / ACs / risks / capabilities / `CONVERTS_TO` idempotently, keyed by **lookup-by-name/attribute** (not MERGE-on-id). **This is explicitly carried into the design phase**, which MUST close it: name the script, pin its wiring, and pin the idempotency key **per data kind**. Bounded — no owned-elsewhere edit either way. | Determines the FR-14 seed mechanism, AC-14/AC-15 shape, and whether the fixture or the script owns each row. | **Design-phase item (flag to orchestrator).** Confirm the self-owned `seed:marketing` companion-script approach (recommended) and pin the per-kind idempotency key. |
| 2 | **OQ-2 (CLOSED — resolves B-01): metric coverage gap is handled by NOT linking un-grounded KPIs.** FR-06 originally required *every* Marketing KPI to `MEASURES` a roster metric. The **frozen, exact-set** `saas-metric-library` roster (`design.md:246–274`, asserted by that spec's AC-06) contains **`metric-cac`** and **`metric-pipeline-conversion`** but **no** CPL/cost-per-lead or cost-per-MQL metric — and that upstream spec is already design-frozen, so amending its roster **cannot be assumed** at this spec's approval time. **Decision (closed):** only the two KPIs with an honest roster metric carry a `MEASURES` edge (CAC → `metric-cac`, MQL→SQL → `metric-pipeline-conversion`); CPL / cost-per-MQL are seeded as **valid `MEASURES`-less KPIs** and this slice **never** invents a local `MetricDefinition` for them (XD-06). This spec therefore **does not depend** on any upstream roster change. The absence of a CPL/cost-per-MQL canonical metric is recorded as an **optional, non-blocking backlog item** for `saas-metric-library` — if it ever adds one, the CPL KPI can be `MEASURES`-linked additively, no change to this contract. | Was: a Marketing KPI could have no metric to link, breaking "exactly one `MEASURES`". Now: no breakage — un-grounded KPIs are valid and `MEASURES`-less. | **Closed at requirements time.** No dependency-ordering item; no upstream amendment required to build this slice. |
| 3 | **OQ-3: SaaS-Operator model id resolution at seed time.** Stories, capabilities, and KPI-alignment are model-scoped (`:modelId`). The SaaS-Operator root id is server-generated (foundation OQ-1) and discovered by the `saasOperatorRoot:true` + `name:"SaaS Operator"` lookup, not hard-coded. | The companion seed step must resolve the root id (and Marketing activity ids) dynamically or it targets the wrong/no model. | Design: the companion script resolves the root id via the foundation's documented marker lookup, then resolves Marketing journey/activity ids by name/seed-id within that model before any model-scoped POST. Pinned at design; no new API needed (reuses `POST /api/v1/query/cypher`). |
| 4 | **OQ-4: realistic-but-illustrative funnel/KPI/risk values.** The funnel conversion rates, KPI targets, and risk likelihood/impact are descriptive process-model values, not operational records (XD-03). | Reviewers may expect "correct" numbers; there is no source of truth for a fictional operator. | Values are **illustrative and internally consistent** (e.g. funnel `conversionRate`s in `[0,1]`, `conversionRate + dropOffRate ≈ 1` per transition). Design fixes the exact roster of values; they are asserted for **shape/validity** (ranges, cardinality), not specific magnitudes (AC-09). |
