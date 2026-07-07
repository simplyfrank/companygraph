---
feature: "platform-ops-process-model"
created: "2026-07-06"
author: "spec-author"
status: "draft"
reviewing_requirements_revision: 1
size: "medium"
---

<!-- The File Changes table (§10) is the permission surface for implementation —
     spec-guard blocks Write/Edit on any source file not listed there (or in
     tasks.md) until this document's frontmatter status is "approved". -->

# Design: platform-ops-process-model

## 1. Overview

`platform-ops-process-model` is a **wave-2 content spec** of the SaaS-Operator
fan-out (blueprint `.claude/specs/blueprint-saas-operator.md`), depending on
`saas-operator-foundation` (wave 1a) and `saas-metric-library` (wave 1b). It
authors the **Platform Ops / SRE (Helm control-plane) function** at
full-pipeline depth (XD-10) as **graph content + governed-API data only**. It
ships **no new schema, no new store, no new route, no new view, and no
compile-time or runtime ontology addition** — every construct it writes already
exists in the codebase or in a landed dependency.

The footprint is exactly three kinds of artifact:

1. **One seed fixture** — `shared/seed/saas-operator/platform-ops.json` — a
   `{nodes, edges}` import payload of **non-lifecycle** process content (journeys,
   activities, function roles, function-specific systems, and their `PART_OF` /
   `PRECEDES` / `EXECUTES` / `USES_SYSTEM` / `INTEGRATES_WITH` edges), discovered
   and loaded idempotently by the foundation's directory-iterating loader
   (`bun run seed:saas-operator` → `POST /api/v1/import` → `realImport`,
   `saas-operator-foundation` §4.4).
2. **Governed-API data** — KPIs (`POST /api/v1/kpis`), KPI→metric `MEASURES`
   links (`POST /api/v1/edges`), KPI→process `ALIGNED_TO` links
   (`POST /api/v1/kpi-alignments`), stories + G/W/T ACs (`story-spec-core`
   model-scoped routes), risks (`POST /api/v1/risk-register`), SLA definitions
   (`POST /api/v1/slas`), and DDD capabilities + mappings
   (`ddd-system-modeling` capability routes) — all created by **calling** shipped
   routes, driven by a **feature-owned content-seed script**.
3. **The XD-10 mapping table** (in `requirements.md` §Mapping table) — the
   reviewable first-class artifact proving each business action maps onto a real
   label/edge.

The design follows four rules, mirroring the dependency designs:

- **Rule A — compose, never fork.** Every write rides an as-built sanctioned
  route. The fixture loads through `POST /api/v1/import` (`realImport`); every
  KPI/story/risk/SLA/capability row is a loopback POST to the shipped governed
  route. No new storage primitive, no compile-time `NODE_LABELS`/`EDGE_TYPES`
  entry, no new runtime registry label/edge (NFR-01). No owned-elsewhere file is
  edited (NFR-03).
- **Rule B — the fixture is non-lifecycle-only.** `platform-ops.json` carries
  **only** core process labels (`Domain`/`UserJourney`/`Activity`/`Role`/`System`)
  and core edge types (`PART_OF`/`EXECUTES`/`USES_SYSTEM`/`AT_LOCATION`/`PRECEDES`/
  `INTEGRATES_WITH`) — never a lifecycle row. KPI/story/`MEASURES`/`ALIGNED_TO`/
  risk/SLA/capability content is **not** in the fixture; it uses the non-import
  governed write paths (FR-06..FR-13). This keeps `realImport`'s lifecycle
  pre-scan happy (FR-05, AC-05).
- **Rule C — governed data through governed routes, idempotently.** Every
  governed-API write is preceded by a **lookup-before-create by a stable key**
  (name / seedKey), so a re-run of the content-seed step adds zero net new rows
  (NFR-02, AC-06, requirements Risk 5). Idempotency lives in **this feature's own
  content-seed script**, never in an owned-elsewhere handler (mirrors foundation
  Rule B).
- **Rule D — no PWA, no route, no schema.** This spec touches no file under
  `pwa/`, never edits `route.ts`/`SURFACES`/`views/index.tsx` (sole-owned by
  `saas-operator-foundation`, XD-05), never edits any governed route's code, and
  adds zero entries to `shared/src/schema/{nodes,edges}.ts` (NFR-01/NFR-03/NFR-05).

Rejected at design level (see §12): inventing `metric-error-budget`/
`metric-backup-success` in this slice (violates XD-06 — resolved via OQ-1); using
the generic `POST /api/v1/edges` for `ALIGNED_TO` (the dedicated
`POST /api/v1/kpi-alignments` route is the real, richer write path — OQ-5/C-01);
hard-coding the operator-root or Platform-Ops-domain ids (resolved by lookup, not
constants); creating SLA breach records or KPI measurements (out of scope — this
spec seeds SLA/KPI **definitions** only, OQ-2).

## 2. Requirements review + open questions — resolution in this design

The requirements are **approved** (`review-requirements.md`, verdict `approve`,
0 blockers). The review raised three concerns (C-01..C-03) and the author carried
five open questions (OQ-1..OQ-5) plus Risk 5. This design closes all of them
against the **verified as-built code** (every route/schema below was read from
`api/src/routes/*` + `shared/src/schema/*` at design time).

| # | Requirements concern / OQ | Resolution in this design | Section |
|---|---------------------------|---------------------------|---------|
| **C-01 / OQ-5** | FR-08's KPI-alignment write path was cited as "the `kpi-measurement-alignment` write path"; the review believed **no** `ALIGNED_TO`-create route exists and recommended the generic `POST /api/v1/edges`. | **The review is partially wrong: a dedicated route DOES exist.** `POST /api/v1/kpi-alignments` (`handleKpiAlignmentPost`, `api/src/routes/kpi-sla-alignment.ts:21`; `router.ts:796`) accepts `kpiAlignmentCreateRequestSchema` = `{kpi_id, target_type: journey\|activity\|domain, target_id, weight(0..1), attribution_type: direct\|indirect\|leading\|lagging, alignment_notes?}` and **CREATEs the `KPI→ALIGNED_TO→{UserJourney\|Activity\|Domain}` edge**. This design uses that **dedicated route** as the primary path (richer: carries `weight`/`attribution_type`). **AC-09 error semantics corrected:** the dedicated route validates the target with `404 not_found` (a missing/wrong-label target id), **not** `400 edge_endpoint_label_mismatch`. The generic `POST /api/v1/edges` (`type:"ALIGNED_TO"`) remains a valid fallback that *does* yield `400 edge_endpoint_label_mismatch` on a wrong pair; §4.4 pins the primary route and both error contracts, and AC-09 is re-scoped accordingly (§5.1). | §4.4, §5.1 |
| **C-02 / OQ-1** (metric roster gap) | `saas-metric-library`'s frozen 20-metric roster seeds `metric-uptime`, `metric-mttr`, `metric-deploy-frequency` but **no** `metric-error-budget` and **no** backup-success metric (verified: `shared/seed/saas-metric-library/metrics.json` — the 20 rows are CAC…Deploy Frequency; no error-budget/backup-success). FR-07 needs each KPI to `MEASURES` a canonical metric; XD-06 forbids inventing metric semantics in a content slice. | **Resolved concretely, self-contained, no unfrozen-roster dependency (the review's explicit ask).** Adopt **option (b)/(c) hybrid**: (1) Bind **Error budget burn → `metric-uptime`** (error budget = 1 − uptime against the SLO; the canonical measure *is* uptime). (2) **Backup success rate** has no near-canonical metric, so its KPI is **demoted to `should`** and, until `saas-metric-library` adds `metric-backup-success`, ships **without** a `MEASURES` edge (a KPI is valid unlinked; §4.3). (3) A **roster gap** (`metric-error-budget`, `metric-backup-success`) is recorded as an **outbound request to the `saas-metric-library` owner** (§11 Gap Register), **not** acted on here. The four *must*-tier KPIs that DO have a canonical metric (uptime, MTTR, deploy frequency, error-budget→uptime) all `MEASURES` a resolvable metric; AC-08's "every targeted `MetricDefinition` resolves in the seeded roster" holds because every KPI that carries a `MEASURES` edge points at a metric present in the frozen roster. This spec **never** seeds a `MetricDefinition` (NFR-01). | §4.3, §11 |
| **C-03** (SLA route path) | FR-11/mapping use `POST /api/v1/slas` (correct). Foundation FR-06/AC-19's helper was documented against `/api/v1/sla-crud` (a file name, not a route) — foundation §2.1 D-1 already corrected its helper to POST `/api/v1/slas`. Also `POST /api/v1/slas` returns **200, not 201**. | Pin **`POST /api/v1/slas`** (`handleSlaPost`, `sla-crud.ts:25`, verified; returns **200**) as the SLA write path. This spec's own content-seed helper (§4.6) POSTs `/api/v1/slas` directly (it does not depend on the foundation helper's internal path label — see §4.6 note). AC-12 asserts a **persisted id** and MUST NOT assert 201 (the design's test asserts 200 + id). | §4.6, §5.1 |
| **OQ-2** (SLA vs KPI-measurement split-brain) | Confirm `/api/v1/slas` is the right governed source. | **Confirmed at design time.** This spec creates SLA **definitions** via `POST /api/v1/slas` (Neo4j `:SLA` nodes, `sla-crud.ts:47`) and **no** breach/measurement records (no Postgres `sla_breaches`, no `:KPIMeasurement`). Which source the wave-3 cockpit reads is `cross-function-exec-rollup`'s concern (blueprint Risks: cockpit reads the governed source). Low blast radius — definitions only. | §4.6 |
| **OQ-3** (governed-route field gaps) | Confirm the shipped risk/SLA routes accept every field the domain needs. | **Confirmed at design time — no gap.** `createRiskSchema` (`risk-register.ts:6`) accepts `{name, owner, domain, likelihood, impact, status, trend, description?, mitigation_plan?, category?, risk_type?, linked_entity_type?, linked_entity_id?, risk_owner_id?, escalation_level?}` — richer than FR-10 requires, incl. `linked_entity_type`/`linked_entity_id` for an optional risk↔entity link. `slaCreateRequestSchema` (`kpi-sla.ts:172`) accepts `{name, service_type, target_value, target_unit, measurement_window, window_duration, compliance_threshold, description?, penalty_type?, penalty_amount?, domain_id?, product_type?}` — covers uptime/response/backup SLAs. No field this domain needs is missing; **no gap is flagged** for risk/SLA. (The only outbound gap is the metric roster, OQ-1/§11.) | §4.5, §4.6 |
| **OQ-4** (DDD bounded-context availability) | `ASSIGNED_TO_CONTEXT` needs an existing `BoundedContext`; if none fits, capabilities are left unassigned. | **Best-effort, non-blocking.** The content-seed reads existing contexts (`GET /api/v1/models/:modelId/capabilities/context-map` or a `query/cypher` for `:BoundedContext` in the operator model) and, where a Platform-Ops-appropriate context exists, PUTs `ASSIGNED_TO_CONTEXT` (`.../context`). Where none fits, the capability is left in the DDD `unassigned` bucket (a valid state, `ddd-system-modeling` FR-09). The mandatory DDD depth (`Capability` + `SUPPORTED_BY` + `NEEDS_CAPABILITY`) stands regardless (AC-13). No `BoundedContext` is ever created (read-only, NFR-04). | §4.7 |
| **Risk 5** (governed-write re-run safety) | KPI/story/risk/SLA/capability POST routes are **not** all MERGE-on-id, so a naive re-run duplicates rows. | **Resolved by Rule C.** The feature-owned content-seed script wraps every governed write with a **lookup-before-create by a stable key** (KPI by `name`+`domain_id`; risk by `name`; SLA by `name`; story by `persona`+`action`+`activityId`; capability by `name` within the model). A second run finds each row and skips its POST → zero net new (AC-06). The fixture itself is MERGE-on-id via `realImport` (inherently idempotent). §4.8 specifies the guard per write. | §4.8 |

### 2.1 Deviations Register (requirements-errata for the orchestrator)

Two requirements citations name a write path this design refines against the
as-built router. Neither changes an FR's intent — only the concrete route and its
error contract. Recorded here for the orchestrator to land as a requirements-errata
note (the design cannot edit `requirements.md`).

| # | Requirements text | As-built (verified) | This design |
|---|-------------------|---------------------|-------------|
| D-1 | FR-08/AC-09 write `ALIGNED_TO` "via the existing KPI-alignment write path" and assert `400 edge_endpoint_label_mismatch` on a wrong pair | The dedicated route is **`POST /api/v1/kpi-alignments`** (`kpiAlignmentCreateRequestSchema`, CREATEs `ALIGNED_TO`); it returns **`404 not_found`** on a missing/wrong-label target, not `400 edge_endpoint_label_mismatch`. The generic `POST /api/v1/edges` (`type:"ALIGNED_TO"`) *does* return `400 edge_endpoint_label_mismatch` on a wrong pair. | Primary path = `POST /api/v1/kpi-alignments`; AC-09 asserts the dedicated route's real contract (**404 on a wrong target**) and, as a supplementary negative, that a generic-`/edges` `ALIGNED_TO` write with a wrong pair yields `400 edge_endpoint_label_mismatch` (§4.4, §5.1). |
| D-2 | FR-11/AC-12 imply an SLA-create success alongside 201-style creates | `POST /api/v1/slas` returns **200** (`sla-crud.ts:24` comment "returns 200, not 201 — pinned as-built") | AC-12 asserts a **persisted id** on a **200** response; the test never asserts 201 for SLA create (§4.6, §5.1). |

## 3. Data model

This spec adds **no** compile-time or runtime schema. Every node/edge it writes
uses an existing label/edge. The only zod it authors is the small **internal
input shape** for its content-seed rows (§3.5) — permissive, internal to the seed
harness, never a REST boundary. All REST writes validate against the **shipped**
boundary schema of each reused route.

### 3.1 Fixture process content (FR-01..FR-05) — `{nodes, edges}` for `realImport`

The fixture shape is the as-built import payload (`importPayloadSchema`,
`import.ts:17`): `{ "nodes": [ {label,id,name,description,attributes?} … ],
"edges": [ {type,fromId,toId,id?} … ] }` — the exact shape of
`shared/seed/retail-mini.json`. All node ids are **stable, author-fixed UUIDv7**
so `realImport`'s `upsertNode`/`upsertEdge` MERGE-on-id makes a re-run net-zero
(NFR-02). A dedicated id block is reserved for this slice to avoid collision with
the retail seed (`018f0000-…`) and metric seed (`018f0100-…`):

**Stable id prefix for this slice: `018f0200-…`** (operator Platform-Ops).

| Fixture content | Label / edge | Count | Notes |
|-----------------|--------------|-------|-------|
| The `Platform Ops` domain node (re-declared to re-attach idempotently) | `Domain` | 1 | carries `attributes.seedKey = "platform_ops"`; **id resolved at author time** (§4.1), not invented — see FR-01 resolution below |
| Journeys | `UserJourney` | 5 | Fleet observability · Deploy/release · Incident/on-call · SLA/status · Backups/DR |
| Journey→Domain | `PART_OF` (`UserJourney→Domain`) | 5 | each journey `PART_OF` the domain |
| Activities | `Activity` | ~25 (4–7/journey) | ordered steps per journey |
| Activity→Journey | `PART_OF` (`Activity→UserJourney`) | ~25 | each activity `PART_OF` its journey |
| Ordered flow | `PRECEDES` (`Activity→Activity`) | ~22 | a chain per journey (+ a `Rollback` branch on Deploy/release) |
| Function roles | `Role` | 4 | SRE · On-call Engineer · Release Manager · Platform Ops Lead (added in-slice; shared-catalog roles referenced by seed id where one fits) |
| Role→Activity | `EXECUTES` (`Role→Activity`) | ≥25 | every activity has ≥1 executing role |
| Function-specific systems | `System` | 3 | Observability stack · Status page · Backup/restore system — each carries `attributes.systemKind` |
| Activity→System | `USES_SYSTEM` (`Activity→System`) | ≥8 | activities point at shared (Helm/K8s/PagerDuty) + function systems |
| System→System | `INTEGRATES_WITH` (`System→System`) | ≥2 | e.g. Helm↔K8s, Observability↔PagerDuty |

**FR-01 domain-resolution mechanism (resolves N-01).** The fixture **carries the
`Platform Ops` `Domain` node** with `attributes.seedKey = "platform_ops"` and a
**fixed slice id** (`018f0200-0000-…-platform-ops`). But the domain is created by
the **foundation** via `attachDomain` (server-generated id) — so the fixture's
fixed id would create a *second* `Platform Ops` domain unless reconciled. The
reconciliation is a **build-time author step**, not a runtime lookup in the
fixture: the content-seed script (§4.1), before loading the fixture, resolves the
foundation-seeded domain by `seedKey` and **rewrites the fixture-in-memory** so
every `PART_OF (UserJourney→Domain)` edge's `toId` is the resolved domain id, and
**drops** the fixture's own `Domain` node row (the domain already exists). This
means the fixture is authored referencing a placeholder domain id, and the seed
script binds it to the real one — **no duplicate `Platform Ops` domain is ever
created** (AC-01), and no hard-coded id survives. (Alternative considered and
rejected in §12: carry the `Domain` row with the real `platform_ops` seedKey and
let MERGE-on-id de-dupe — rejected because `attachDomain` server-generates the id,
so the fixture cannot know it; the in-memory rebind is the clean path.)

The shared-catalog systems **Helm / Kubernetes / PagerDuty** (foundation FR-04,
seeded with `attributes.seedKey` = `helm`/`kubernetes`/`pagerduty` and a
top-level `operatorSeedKey`) are referenced by their **resolved node id** the
same way: the content-seed script resolves each by `seedKey`/`operatorSeedKey`
and rebinds the fixture's `USES_SYSTEM`/`INTEGRATES_WITH` edges to the real ids;
the fixture never re-declares a Helm/K8s/PagerDuty `System` node (AC-04). Shared
**roles** the catalog already provides (e.g. a `Site Reliability Engineer` if
foundation seeded one) are referenced the same way; only the roles the catalog
lacks are new node rows in this slice.

### 3.2 Function-specific systems — `systemKind` (FR-04)

Each of the three in-slice systems carries `attributes.systemKind ∈ {functional,
agentic, ai_predictive}` (`system-kind.ts:9`), set explicitly in the fixture so
the import path does not need to inject the default (`import.ts:104` injects
`functional` when absent, but we set it explicitly for clarity):

| System | `attributes.systemKind` | Rationale |
|--------|-------------------------|-----------|
| Observability stack (metrics/logs/traces + alerting) | `ai_predictive` | anomaly detection / alerting is predictive |
| Status page | `functional` | static publish surface |
| Backup / restore system | `functional` | scheduled backup + restore verification |

### 3.3 KPIs, `MEASURES`, `ALIGNED_TO` (FR-06, FR-07, FR-08) — governed data

Five KPIs, each a `KPI` node created via `POST /api/v1/kpis`
(`kpiCreateRequestSchema` = `{name, category, unit, target_value,
target_direction, measurement_frequency, description?, warning_threshold?,
critical_threshold?, owner_role?, domain_id?}`, verified `kpi-sla.ts:155`). Each
`MEASURES` its canonical `MetricDefinition` (§4.3) via `POST /api/v1/edges`
(`type:"MEASURES"`) and is `ALIGNED_TO` its process structure via
`POST /api/v1/kpi-alignments` (§4.4).

| KPI `name` | `category` | `unit` | `target_direction` | `MEASURES` metric (seedKey) | `ALIGNED_TO` target |
|------------|-----------|--------|--------------------|-----------------------------|---------------------|
| Fleet uptime | reliability | percent | up | `metric-uptime` | `Platform Ops` domain |
| MTTR | reliability | days | down | `metric-mttr` | Incident/on-call journey |
| Deploy frequency | efficiency | count | up | `metric-deploy-frequency` | Deploy/release journey |
| Error budget burn | reliability | percent | down | `metric-uptime` (error budget = 1 − uptime, OQ-1/§4.3) | SLA/status journey |
| Backup success rate | reliability | percent | up | *(none — `should`; awaits `metric-backup-success`, OQ-1)* | Backups/DR journey |

`domain_id` on each KPI = the resolved `Platform Ops` domain id (so the
`kpi-alignments` `target_type:"domain"` path and any domain rollup resolve).

### 3.4 Stories + ACs, risks, SLAs, capabilities (FR-09..FR-13) — governed data

- **Stories** — ≥1 `UserStory` per journey (5), via
  `POST /api/v1/models/:modelId/stories` with `storyCreateSchema` = `{persona,
  action, benefit, activityId, roleId?, description?, attributes?}` (verified
  `story-spec.ts:22`, `.strict()`). `:modelId` = the SaaS-Operator root id
  (resolved §4.1). `activityId` = one of this slice's activities (in the operator
  model scope, so the `story_activity_not_in_model` check at
  `stories.ts:157`/`storage/stories.ts:161` passes — it matches an `:Activity`
  whose id is in the model's scoped set). Each story gets ≥2 `AcceptanceCriterion`
  via `POST /api/v1/models/:modelId/stories/:storyId/acceptance-criteria` with
  `acCreateSchema` = `{given, when, then, ordinal?}` (verified `story-spec.ts:57`,
  each clause `.min(1)`).
- **Risks** — ≥3 via `POST /api/v1/risk-register` (`createRiskSchema`,
  `risk-register.ts:6`): ≥1 `operational`, ≥1 `security`, ≥1 `technical`
  (`risk_type` enum incl. all three, verified). Fields: `{name, owner, domain,
  likelihood(1..5), impact(1..5), status, trend, description?, mitigation_plan?,
  category?, risk_type}`. (`owner`/`domain` are **required** by the shipped schema
  — `.min(1)` — so the content-seed supplies them, e.g. `owner:"Platform Ops
  Lead"`, `domain:"Platform Ops"`.)
- **SLAs** — ≥3 via `POST /api/v1/slas` (`slaCreateRequestSchema`,
  `kpi-sla.ts:172`, returns **200**): fleet-uptime, incident-response,
  backup/restore. Fields: `{name, service_type, target_value, target_unit,
  measurement_window, window_duration, compliance_threshold, description?, …}`.
- **Capabilities** — ≥3 via `POST /api/v1/models/:modelId/capabilities`
  (`capabilityCreateSchema` = `{name, description?, attributes?}`, returns **201**,
  verified `capabilities.ts:69`; storage creates `CAPABILITY_IN_MODEL` at create).
  Each `SUPPORTED_BY` ≥1 system via `PUT
  .../capabilities/:capId/supported-by` (`supportedBySchema` = `{systemId}`); each
  `NEEDS_CAPABILITY` ≥1 activity/story via `PUT .../capabilities/:capId/needed-by`
  (`neededBySchema` = exactly one of `{activityId}` | `{storyId}`, verified
  `ddd-system.ts:100`); where a context fits, `ASSIGNED_TO_CONTEXT` via `PUT
  .../capabilities/:capId/context` (`contextAssignSchema` = `{boundedContextId}`).

### 3.5 Content-seed internal input shape (zod)

The only new zod, in the feature-owned content-seed module
(`api/src/seed/platform-ops-content.ts`) — permissive, internal, never a REST
boundary. It shapes the in-memory row lists the seed step iterates:

```ts
// api/src/seed/platform-ops-content.ts (internal only)
const kpiRow = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  unit: z.string().min(1),
  target_value: z.number(),
  target_direction: z.string().min(1),
  measurement_frequency: z.string().min(1),
  metricSeedKey: z.string().optional(),   // resolved → MEASURES; omitted = no link (OQ-1)
  alignTarget: z.object({ type: z.enum(["journey","activity","domain"]), key: z.string() }),
});
const riskRow  = z.object({ name: z.string().min(1), owner: z.string().min(1),
  domain: z.string().min(1), likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  status: z.enum(["open","mitigating","accepted","resolved"]),
  trend: z.enum(["up","flat","down"]),
  risk_type: z.enum(["operational","security","technical"]),
  description: z.string().optional(), mitigation_plan: z.string().optional() });
const slaRow   = z.object({ name: z.string().min(1), service_type: z.string().min(1),
  target_value: z.number(), target_unit: z.string().min(1),
  measurement_window: z.string().min(1), window_duration: z.string().min(1),
  compliance_threshold: z.number(), description: z.string().optional() });
```

Story/AC and capability rows are shaped the same permissive way. The
authoritative validation is always the **route's own re-parse** at the REST
boundary; these internal shapes only guard the seed script's own inputs.

## 4. Server-side logic (the feature-owned content-seed step)

This feature adds **no new REST route.** All writes ride existing routes (§5.1
table), driven by one feature-owned CLI content-seed script.

### 4.0 Entry point + ordering

`api/scripts/seed-platform-ops-content.ts` — the CLI entrypoint, wired
`bun run seed:platform-ops` (§7). It runs **after** the fixture is loaded (so
its activities/journeys exist as `ALIGNED_TO`/`NEEDS_CAPABILITY` targets and
story `activityId`s). Sequence:

1. Resolve handles (§4.1): SaaS-Operator root id; `Platform Ops` domain id; the
   five journey ids + the activity ids (by `seedKey`/`name`); shared-catalog
   system ids (Helm/K8s/PagerDuty); target `MetricDefinition` ids by `seedKey`.
2. Load the fixture (§4.2) — **or** rely on `seed:saas-operator` having run it;
   the script is idempotent either way (Rule C). (The design ships the content
   step as its own `bun run seed:platform-ops`; the fixture is loaded by the
   foundation loader `seed:saas-operator` which discovers `platform-ops.json`.
   `seed:platform-ops` calls the fixture-rebind+load helper first for a
   self-contained run, then does the governed writes — see §4.2.)
3. Governed writes in dependency order (§4.3–§4.7): KPIs → `MEASURES` → `ALIGNED_TO`
   → stories → ACs → risks → SLAs → capabilities → capability mappings.

Every step is lookup-before-create (§4.8), so the whole script is a net-zero
no-op on a second run (AC-06).

### 4.1 Handle resolution (FR-01, all governed writes)

`resolveHandles(baseUrl): Promise<Handles>` — read-only lookups via
`POST /api/v1/query/cypher` (`query:read`, the proven foundation/metric-library
pattern):

- **Operator root** — `MATCH (m:BusinessModel {name:"SaaS Operator"}) RETURN m`,
  filter in TS on `JSON.parse(m.attributes_json).saasOperatorRoot === true`
  (foundation §4.1 contract). Yields `modelId`.
- **Platform Ops domain** — `MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel
  {id:$modelId}) RETURN d`, filter on `seedKey === "platform_ops"` (foundation
  §4.2 contract). Yields `domainId`.
- **Shared systems** — `MATCH (s:System) WHERE s.operatorSeedKey IN
  ['helm','kubernetes','pagerduty'] RETURN s.operatorSeedKey, s.id` (foundation
  §4.3 top-level marker). Yields the three system ids.
- **Metrics** — `MATCH (m:MetricDefinition) RETURN m.id, m.attributes_json`,
  filter on `seedKey ∈ {metric-uptime, metric-mttr, metric-deploy-frequency}`
  (metric-library §4). Yields metric ids.
- **Journeys / activities** — resolved after the fixture load (§4.2) by their
  fixture `id`s (author-fixed under the `018f0200-…` prefix), so no lookup is
  needed for them (they are known constants). The domain/system/metric handles
  above are the only ones the seed script must discover, because those nodes are
  created by other specs with server-generated ids.

If any required handle is absent (e.g. `seed:saas-operator` or
`seed:saas-metric-library` has not run), the script **fails loudly** with a
message naming the missing precondition — it never silently skips (mirrors the
foundation loader's surface-and-fail).

### 4.2 Fixture load + rebind (FR-01, FR-04, FR-05)

`loadPlatformOpsFixture(baseUrl, handles)`:

1. Read `shared/seed/saas-operator/platform-ops.json`.
2. **Rebind** in memory (the §3.1 mechanism): drop the fixture's placeholder
   `Platform Ops` `Domain` node row; set every `PART_OF (UserJourney→Domain)`
   edge `toId = handles.domainId`; set every `USES_SYSTEM`/`INTEGRATES_WITH` edge
   referencing a shared system placeholder id to the resolved
   Helm/K8s/PagerDuty id.
3. POST the rebound `{nodes, edges}` to `POST /api/v1/import` (`realImport`).
   `realImport` MERGE-on-id upserts, so a re-run is net-zero (NFR-02). A `409
   model_lifecycle_route_required` means a malformed fixture (a lifecycle row) —
   surface + fail (AC-05).

**Guard (FR-05, AC-05).** The fixture MUST contain only non-lifecycle labels +
core edges. `realImport`'s pre-scan (`import.ts:167-185`,
`assertNotLifecycleLabel`/`assertNotLifecycleEdge`) rejects any lifecycle row
`409 model_lifecycle_route_required` writing nothing — AC-05's negative case
feeds a hand-built variant with an `IN_MODEL` edge to prove this.

> Note: when the foundation loader `seed:saas-operator` discovers
> `platform-ops.json`, it loads it **as-is** (no rebind) — which would create the
> placeholder domain. To avoid that, the fixture-as-shipped **omits the `Domain`
> node row entirely** and its `PART_OF (UserJourney→Domain)` edges carry the
> **resolved-at-author-time** convention: they are authored with `toId` = a
> **sentinel that the content-seed rebinds**, and the foundation loader is not the
> path that finalizes the domain link. **Decision (resolves the two-loader
> hazard):** the journey→domain `PART_OF` edges are **not** in the fixture at all;
> they are created by the content-seed step (§4.2a) after resolving `domainId`.
> The fixture carries journeys, activities, roles, function systems, and all
> edges whose endpoints are **all in-slice** (`Activity→UserJourney` PART_OF,
> `PRECEDES`, `EXECUTES`, in-slice `USES_SYSTEM`, in-slice `INTEGRATES_WITH`). The
> **cross-boundary** edges (journey→domain PART_OF; activity→shared-system
> USES_SYSTEM; function-system↔shared-system INTEGRATES_WITH) are created by the
> content-seed via `POST /api/v1/edges` after handle resolution. This keeps the
> fixture loadable by the foundation loader with **zero** dangling references and
> **zero** duplicate domain.

### 4.2a Cross-boundary edges (FR-01, FR-04)

After the fixture load and handle resolution, the content-seed creates the
cross-boundary core edges via `POST /api/v1/edges` (`handleEdgePost`,
`edges.ts:8`, returns **201**), each lookup-before-create (§4.8):

- `PART_OF` (`UserJourney→Domain`) ×5 — each journey `toId = domainId`.
- `USES_SYSTEM` (`Activity→System`) — activities → resolved Helm/K8s/PagerDuty ids.
- `INTEGRATES_WITH` (`System→System`) — function-system → resolved shared-system ids.

These are **core, non-lifecycle** edge types, so `assertNotLifecycleEdge`
(`edges.ts:12`) passes; the registry-backed endpoint-pair validator accepts the
valid pairs and would return `400 edge_endpoint_label_mismatch` on a wrong pair
(AC-04 asserts a valid write succeeds).

### 4.3 KPIs + `MEASURES` (FR-06, FR-07) — OQ-1 resolution

For each of the five KPI rows (§3.3):

1. **Lookup-before-create** (§4.8): `MATCH (k:KPI {name:$name}) WHERE
   k.domain_id = $domainId RETURN k` — if present, reuse; else POST
   `kpiCreateRequestSchema` to `POST /api/v1/kpis` (`handleKpiPost`, returns 200
   with `{id,...}`), with `domain_id = domainId`.
2. **`MEASURES`** — if the row carries `metricSeedKey`, look up the metric id
   (§4.1) and, lookup-before-create, POST `{type:"MEASURES", fromId:kpiId,
   toId:metricId}` to `POST /api/v1/edges`. `MEASURES ∉ LIFECYCLE_EDGES`
   (metric-library §2.1) so the write returns **201**, not `409` (AC-08). Uptime,
   MTTR, deploy-frequency, and **error-budget (→ `metric-uptime`, OQ-1)** all
   carry a `metricSeedKey`; **Backup success rate carries none** (OQ-1: no
   canonical metric yet → `should`-tier, unlinked KPI). Every `MEASURES` edge this
   step writes therefore targets a metric present in the frozen roster (AC-08).
3. **Cardinality** — each KPI links to at most one metric (the metric-library
   OQ-2 invariant); the seed writes exactly one `MEASURES` per linked KPI, so the
   invariant holds by construction. (The metric-library `linkKpiToMetric` helper
   with its pre-check may be reused if importable; otherwise the seed's own
   one-write-per-KPI construction suffices.)

### 4.4 `ALIGNED_TO` (FR-08) — dedicated route (C-01/OQ-5)

For each KPI, create its `ALIGNED_TO` link via **`POST /api/v1/kpi-alignments`**
(`handleKpiAlignmentPost`, verified), lookup-before-create (a `GET
/api/v1/kpi-alignments?target_type=&target_id=` filter or a `MATCH
(k:KPI)-[:ALIGNED_TO]->(t) ` cypher pre-check):

```
POST /api/v1/kpi-alignments
{ "kpi_id": <kpiId>, "target_type": "domain"|"journey"|"activity",
  "target_id": <resolved id>, "weight": 1, "attribution_type": "direct" }
```

The route CREATEs `(:KPI)-[:ALIGNED_TO {weight,attribution_type,…}]->(:target)`
after verifying the KPI exists (`404 not_found` else) and the target exists at the
label implied by `target_type` (`404 not_found` else). Targets per §3.3 (Fleet
uptime→domain, MTTR→Incident journey, Deploy freq→Deploy journey, Error
budget→SLA/status journey, Backup→Backups/DR journey).

**AC-09 error contract (D-1).** The dedicated route returns **`404 not_found`**
for a wrong/missing target id (not `400 edge_endpoint_label_mismatch`). AC-09's
primary assertion is therefore: a valid alignment succeeds and reads back; a
wrong target id yields `404 not_found`. The supplementary assertion (that a
generic `POST /api/v1/edges` `ALIGNED_TO` write with a **wrong endpoint pair**,
e.g. `KPI→System`, yields `400 edge_endpoint_label_mismatch`) documents the
generic path's contract for completeness. Both are real, verified behaviors.

### 4.5 Risks (FR-10) — `POST /api/v1/risk-register` (OQ-3 confirmed)

For each of ≥3 risk rows (§3.4), lookup-before-create by `name` (`GET
/api/v1/risk-register?…` list filter, or a direct `SELECT … WHERE name=` is not
available to the caller — use the list route + name filter), then POST
`createRiskSchema` to `POST /api/v1/risk-register` (`handleRiskRegisterCreate`).
`owner` and `domain` are required (`.min(1)`), supplied as `"Platform Ops Lead"`
/ `"Platform Ops"`. `risk_type ∈ {operational, security, technical}`. Each
returns a persisted id (Postgres `risk_register` row). No `risk-register.ts` edit
(AC-11).

Concrete rows: (op) "Cascading fleet outage from a bad rollout"; (sec)
"Compromised control-plane credential"; (tech) "Backup restore fails silently".

### 4.6 SLAs (FR-11) — `POST /api/v1/slas` (C-03/D-2, OQ-2/OQ-3 confirmed)

For each of ≥3 SLA rows (§3.4), lookup-before-create by `name` (`GET
/api/v1/slas` list + name filter), then POST `slaCreateRequestSchema` to
**`POST /api/v1/slas`** (`handleSlaPost`, **returns 200**). Each returns a
persisted id (Neo4j `:SLA` node). No `sla-crud.ts` edit (AC-12).

Concrete rows: fleet-uptime SLA (`target_value:99.9, target_unit:"percent",
measurement_window:"monthly", window_duration:"30d", compliance_threshold:99.9`);
incident-response SLA (SEV1 acknowledge within N minutes); backup/restore SLA.

> **Note on the foundation helper (C-03).** FR-12 routes governed rows "through
> the foundation FR-06 helper". That helper is convenient but its internal path
> label was documented against `/sla-crud` in foundation requirements (corrected
> to `/api/v1/slas` in foundation design §2.1 D-1). To be **robust to that
> dependency's state**, this spec's content-seed POSTs the governed routes
> **directly** with the verified as-built paths (`/api/v1/risk-register`,
> `/api/v1/slas`) — it MAY import and reuse the foundation `seedRisk`/`seedSla`
> helpers **if** they target those paths, but does not depend on their internal
> label. Either way it only **calls** the governed routes; it never edits them
> (XD-04, NFR-03).

### 4.7 DDD capabilities (FR-13) — `ddd-system-modeling` routes (OQ-4)

For each of ≥3 capabilities (e.g. "Roll out a release safely", "Detect & resolve
an incident", "Restore from backup"):

1. **Create** — lookup-before-create by `name` (`GET
   /api/v1/models/:modelId/capabilities` list filter), then POST
   `capabilityCreateSchema` = `{name, description?}` to `POST
   /api/v1/models/:modelId/capabilities` (returns 201; storage creates
   `CAPABILITY_IN_MODEL` to the operator root at create — AC-13).
2. **`SUPPORTED_BY`** — for each supporting system, `PUT
   /api/v1/models/:modelId/capabilities/:capId/supported-by` `{systemId:<resolved
   Helm/K8s/PagerDuty/observability/backup id>}` (≥1 per capability).
3. **`NEEDS_CAPABILITY`** — for each source, `PUT
   /api/v1/models/:modelId/capabilities/:capId/needed-by` with **exactly one** of
   `{activityId}` | `{storyId}` (the `.refine`, `ddd-system.ts:107`); ≥1 per
   capability from this slice's activities/stories.
4. **`ASSIGNED_TO_CONTEXT`** (best-effort, OQ-4) — resolve existing
   `:BoundedContext` nodes in the operator model (`GET
   /api/v1/models/:modelId/capabilities/context-map`, or a `query/cypher`); where
   a Platform-Ops-appropriate context exists, `PUT
   /api/v1/models/:modelId/capabilities/:capId/context` `{boundedContextId}`.
   Where none fits, leave the capability unassigned (valid; `ddd-system-modeling`
   FR-09 `unassigned` bucket). **No `BoundedContext` is created** (read-only,
   NFR-04, AC-13).

No `ddd-system-modeling` route code is edited (AC-13, NFR-03).

### 4.8 Idempotency guard (Rule C, NFR-02, Risk 5, AC-06)

Every governed write is a **lookup-before-create by a stable key**:

| Write | Stable key | Lookup |
|-------|-----------|--------|
| KPI | `name` + `domain_id` | `MATCH (k:KPI {name}) WHERE k.domain_id=$domainId` via `query/cypher` |
| `MEASURES` | (kpiId, metricId) | `MATCH (:KPI {id})-[:MEASURES]->(:MetricDefinition {id})` |
| `ALIGNED_TO` | (kpiId, targetId) | `GET /api/v1/kpi-alignments?target_type=&target_id=` filtered by `kpi_id` |
| Story | `persona`+`action`+`activityId` | `GET /api/v1/models/:modelId/stories` list filter |
| AC | (storyId, `given`+`when`+`then`) | `GET .../acceptance-criteria` list filter |
| Risk | `name` | `GET /api/v1/risk-register?…` list + name filter |
| SLA | `name` | `GET /api/v1/slas` list + name filter |
| Capability | `name` within model | `GET /api/v1/models/:modelId/capabilities` list filter |
| `SUPPORTED_BY`/`NEEDS_CAPABILITY`/context | (capId, targetId) | `GET .../capabilities/:capId` read |

A second `bun run seed:platform-ops` finds every row and skips its POST → zero
net new (AC-06). The fixture (`realImport`) is inherently MERGE-on-id idempotent.

## 5. HTTP API surface + verification

### 5.1 No new route — every write rides an existing route

| Method | Route | Permission (existing) | FR | Role in this spec |
|--------|-------|-----------------------|----|-------------------|
| POST | `/api/v1/import` (`realImport`) | `data:write` | FR-01,04,05 | slice-fixture process-content load (§4.2) |
| POST | `/api/v1/edges` (`handleEdgePost`, 201) | `edge:write` | FR-01,04,07 | cross-boundary core edges (§4.2a) + `MEASURES` (§4.3) |
| POST | `/api/v1/kpis` (`handleKpiPost`, 200) | `kpi:write` | FR-06 | KPI rows (§4.3) |
| POST | `/api/v1/kpi-alignments` (`handleKpiAlignmentPost`) | `kpi:write` | FR-08 | `ALIGNED_TO` (§4.4) |
| POST | `/api/v1/models/:id/stories` + `.../acceptance-criteria` | `story:write` | FR-09 | stories + ACs (§3.4) |
| POST | `/api/v1/risk-register` | `risk:write` | FR-10 | risk rows (§4.5) |
| POST | `/api/v1/slas` (`handleSlaPost`, **200**) | `sla:write` | FR-11 | SLA definitions (§4.6) |
| POST/PUT | `/api/v1/models/:id/capabilities[/…]` | (capability perm) | FR-13 | capabilities + mappings (§4.7) |
| POST | `/api/v1/query/cypher` (`runPassthrough`, read-only) | `query:read` | FR-01 + all | handle resolution + idempotency lookups (§4.1, §4.8) |

Every permission above is already mapped in `api/src/auth/rbac-permissions.ts`
(the dependency designs verified each). **Zero** new permission string, **zero**
new `getRoutePermission` mapping, **zero** new `ERROR_CODES` entry (NFR-04).

### 5.2 UI

**None.** This spec ships no PWA file (NFR-05). Its content surfaces through the
existing Explorer, `FunctionMap` (`#/business/functions`, owned by
`saas-operator-foundation`), and the wave-3 `#/exec/operator` cockpit — none built
here. The blueprint UX-* allowances apply only to `pwa/` work; this spec has none,
so UX-01..UX-06 are satisfied vacuously (no view to state, style, or make
keyboard-reachable). Platforms & Input Modes / Native Conflicts are correctly N/A
(requirements §Platforms & Input Modes).

## 6. Wiring

- **`package.json`** — add `"seed:platform-ops": "bun --cwd api
  scripts/seed-platform-ops-content.ts"` (matches the existing
  `seed:saas-operator` / `seed:saas-metric-library` `bun --cwd api scripts/…`
  form). This is the sole `package.json` edit.
- **`shared/seed/saas-operator/platform-ops.json`** — the non-lifecycle fixture
  (§3.1), discovered by the foundation loader's directory scan **and** loaded by
  this spec's own `seed:platform-ops` step (both idempotent). Adding the file
  requires **no** edit to the foundation loader (`seed-saas-operator.ts`) — the
  directory-iterating loader discovers it (foundation §4.4, the whole point of the
  fan-out).

## 7. Test strategy

All tests are server-side integration (Neo4j / Postgres) + CLI checks; there is
no PWA surface. Each test seeds its preconditions (`seed:saas-operator` for the
scaffold + fixture; `seed:saas-metric-library` for the metric roster;
`seed:platform-ops` for the governed content) against the live loopback stack.

| AC | Kind | Test file |
|----|------|-----------|
| AC-01 | integration (Neo4j) | `api/__tests__/platform-ops-journeys.integration.test.ts` — after seed, the `platform_ops` domain (`IN_MODEL` operator root) has the five named journeys each `PART_OF` it; exactly one `Platform Ops` domain exists (no duplicate) |
| AC-02 | integration (Neo4j) | `api/__tests__/platform-ops-activities.integration.test.ts` — each journey has 4–7 `Activity` `PART_OF` it; a `PRECEDES` path exists first→last per journey; Deploy/release has a `Rollback` branch |
| AC-03 | integration (Neo4j) | `api/__tests__/platform-ops-roles.integration.test.ts` — every activity has ≥1 `Role` `EXECUTES` it; the four function roles exist; a role duplicating the shared catalog by name is referenced, not re-created (count of that name = 1) |
| AC-04 | integration (Neo4j) | `api/__tests__/platform-ops-systems.integration.test.ts` — Helm/K8s/PagerDuty referenced by resolved id (no duplicate System per shared name); the three function systems exist each with a valid `systemKind`; `USES_SYSTEM` edges connect activities→systems; ≥1 `INTEGRATES_WITH` edge exists |
| AC-05 | integration (Neo4j) | `api/__tests__/platform-ops-lifecycle-guard.integration.test.ts` — the real fixture (non-lifecycle) imports and writes; a hand-built variant with an `IN_MODEL` edge → `409 model_lifecycle_route_required`, nothing written |
| AC-06 | integration (Neo4j) + CLI | `api/__tests__/platform-ops-seed-idempotency.integration.test.ts` — running `seed:platform-ops` twice yields zero net new nodes/edges/rows (pre/post `/api/v1/stats` + governed-row counts); retail Model #1 subgraph unchanged; **manual**: `git diff --stat` — changes confined to `shared/seed/saas-operator/platform-ops.json`, `api/scripts/seed-platform-ops-content.ts`, `api/src/seed/platform-ops-content.ts`, this spec's tests, `package.json` (one line); no schema/route/loader edits |
| AC-07 | integration (Neo4j) + CLI | `api/__tests__/platform-ops-kpis.integration.test.ts` — the five KPIs exist as `KPI` nodes via `POST /api/v1/kpis`; **manual**: `git diff --stat api/src/routes/kpi-crud.ts` — no change |
| AC-08 | integration (Neo4j) | `api/__tests__/platform-ops-kpi-measures.integration.test.ts` — each **linked** KPI has exactly one `MEASURES` edge to a `MetricDefinition` resolvable in the frozen roster (uptime/mttr/deploy-frequency/error-budget→uptime); the `POST /api/v1/edges` `MEASURES` write returns **201** (not 409); the module-pin `INSTANTIATES` lifecycle edge remains unaffected (a lifecycle `INSTANTIATES` write via `/edges` still 409); the Backup-success KPI is present and has **no** `MEASURES` edge (OQ-1 documented) |
| AC-09 | integration (Neo4j) | `api/__tests__/platform-ops-kpi-alignment.integration.test.ts` — each KPI is `ALIGNED_TO` its process target via `POST /api/v1/kpi-alignments` (Fleet uptime→domain, MTTR→Incident journey, …), read back; a `POST /api/v1/kpi-alignments` with a wrong/missing target id → **`404 not_found`** (D-1); supplementary: a generic `POST /api/v1/edges` `ALIGNED_TO` write with a wrong pair (e.g. `KPI→System`) → `400 edge_endpoint_label_mismatch`; **manual**: `git diff --stat api/src/routes/kpi-sla-alignment.ts` — no change |
| AC-10 | integration (Neo4j) | `api/__tests__/platform-ops-stories.integration.test.ts` — ≥1 `UserStory` per journey (5) via `POST /api/v1/models/:modelId/stories`, each `DESCRIBES_ACTIVITY` one of this slice's activities (passing the `story_activity_not_in_model` scope check), each with ≥2 `AcceptanceCriterion` carrying non-empty `given`/`when`/`then`; **manual**: `git diff --stat api/src/routes/stories.ts` — no change |
| AC-11 | integration (Postgres) + CLI | `api/__tests__/platform-ops-risks.integration.test.ts` — ≥1 operational, ≥1 security, ≥1 technical risk via `POST /api/v1/risk-register` conforming to `createRiskSchema`, each with a persisted id; **manual**: `git diff --stat api/src/routes/{risk-register,risk-compliance,compliance-rules,change-requests}.ts` — no change |
| AC-12 | integration (Neo4j) + CLI | `api/__tests__/platform-ops-slas.integration.test.ts` — ≥1 uptime, ≥1 incident-response, ≥1 backup/restore SLA via `POST /api/v1/slas` conforming to `slaCreateRequestSchema`, each returning a persisted id on a **200** (D-2 — the test asserts 200, not 201); **manual**: `git diff --stat api/src/routes/sla-crud.ts` — no change |
| AC-13 | integration (Neo4j) + CLI | `api/__tests__/platform-ops-capabilities.integration.test.ts` — ≥3 `Capability` via `POST /api/v1/models/:modelId/capabilities` (each `CAPABILITY_IN_MODEL` the operator root), each `SUPPORTED_BY` ≥1 seeded System, each with ≥1 `NEEDS_CAPABILITY` source; where a `BoundedContext` fits, an `ASSIGNED_TO_CONTEXT` edge (no context created); **manual**: `git diff --stat api/src/routes/{capabilities,ontology-bounded-contexts}.ts` — no change |
| AC-14 | CLI (doc review) | manual: read `requirements.md` §Mapping table — every row's representation resolves to a real label/edge/route (`grep` the named construct in `shared/src/schema/*` or the owning spec); no row introduces a new construct |
| AC-15 | CLI | `bun run typecheck` exit 0; manual: `git diff --stat` — changes confined to this spec's fixture, seed scripts, tests, docs, and the one `package.json` line; **no** edits to `shared/src/schema/*`, `pwa/*`, `api/src/router.ts`, `api/src/routes/*`, `api/src/auth/rbac-permissions.ts`, or `api/scripts/seed-saas-operator.ts` |

**Preconditions.** Every integration test requires `seed:saas-operator` (scaffold
+ fixture) and `seed:saas-metric-library` (roster) to have run, then
`seed:platform-ops` (governed content). AC-08/AC-09 require the KPI + metric +
journey/domain nodes as edge endpoints; AC-10 requires the operator-root model +
in-slice activities; AC-13 requires the capabilities' system/activity endpoints.

## 8. Ownership boundaries — explicitly NOT edited

Spec-guard must block Write/Edit on these (owned elsewhere):

- `shared/src/schema/nodes.ts`, `shared/src/schema/edges.ts` — no compile-time
  label/edge/endpoint array edit (NFR-01).
- `api/src/router.ts`, `pwa/src/route.ts`, `pwa/src/views/index.tsx`,
  `pwa/src/App.tsx`, `SURFACES` — route/view registration sole-owned by
  `saas-operator-foundation` (XD-05, NFR-03); this spec adds no route/view.
- `api/scripts/seed-saas-operator.ts` — the foundation loader (it discovers
  `platform-ops.json`; not edited, XD-04).
- `api/src/routes/import.ts`, `api/src/routes/edges.ts`, `api/src/routes/nodes.ts`,
  `api/src/routes/query.ts`, `api/src/storage/edges.ts` — graph-core, reused as-is.
- `api/src/routes/kpi-crud.ts`, `api/src/routes/kpi-sla-alignment.ts`,
  `api/src/routes/sla-crud.ts` — kpi-okr-governance / kpi-measurement-alignment
  (called, never edited).
- `api/src/routes/risk-register.ts`, `risk-compliance.ts`, `compliance-rules.ts`,
  `change-requests.ts` — risk-compliance-change (called, never edited).
- `api/src/routes/stories.ts`, `api/src/storage/stories.ts` — story-spec-core.
- `api/src/routes/capabilities.ts`, `api/src/storage/capabilities.ts`,
  `api/src/routes/ontology-bounded-contexts.ts` — ddd-system-modeling.
- `api/src/auth/rbac-permissions.ts` — no new permission string (NFR-04).
- `api/src/errors.ts` (`ERROR_CODES`) — no new wire error code (§5.1).
- `shared/src/schema/kpi-sla.ts`, `shared/src/schema/ddd-system.ts`,
  `shared/src/schema/story-spec.ts`, `shared/seed/saas-metric-library/metrics.json`
  — dependency-owned; consumed, never edited (NFR-01, OQ-1 keeps the roster
  untouched).

## 9. Traceability

| FR | Design | ACs |
|----|--------|-----|
| FR-01 (5 journeys `PART_OF` existing domain, no dup) | §3.1, §4.1, §4.2, §4.2a | AC-01 |
| FR-02 (ordered activities + `PRECEDES`) | §3.1, §4.2 | AC-02 |
| FR-03 (roles `EXECUTES` activities) | §3.1, §4.2 | AC-03 |
| FR-04 (systems `USES_SYSTEM`/`INTEGRATES_WITH`, `systemKind`) | §3.1, §3.2, §4.2, §4.2a | AC-04 |
| FR-05 (non-lifecycle fixture via `POST /api/v1/import`) | §3.1, §4.2 | AC-05 |
| FR-06 (KPI rows via `POST /api/v1/kpis`) | §3.3, §4.3 | AC-07 |
| FR-07 (KPI `MEASURES` metric via `POST /api/v1/edges`) | §3.3, §4.3, §11 (OQ-1) | AC-08 |
| FR-08 (KPI `ALIGNED_TO` process) | §3.3, §4.4 (dedicated route, D-1) | AC-09 |
| FR-09 (stories + G/W/T ACs via story-spec-core) | §3.4, §4.0 | AC-10 |
| FR-10 (risks via `POST /api/v1/risk-register`) | §3.4, §4.5 | AC-11 |
| FR-11 (SLAs via `POST /api/v1/slas`) | §3.4, §4.6 (D-2) | AC-12 |
| FR-12 (governed data via governed routes only) | §4.5, §4.6, §4.8 | AC-11, AC-12 |
| FR-13 (DDD capabilities + mappings) | §3.4, §4.7 | AC-13 |
| FR-14 (XD-10 mapping table — doc artifact) | requirements §Mapping table | AC-14 |
| NFR-01 (no new labels/edges/schema/store) | §3, §8, §10 | AC-15 |
| NFR-02 (idempotency + retail isolation) | §3.1, §4.8 | AC-06 |
| NFR-03 (ownership boundaries) | §8, §10 | AC-06, AC-07, AC-09, AC-11, AC-12, AC-13, AC-15 |
| NFR-04 (house rules: zod-only, no tsc, en-US, loopback, auth via gate, `/api/v1/`) | §3.5, §5.1, §8 | AC-15 |
| NFR-05 (no pwa/, P&IM/Native-Conflicts N/A) | §5.2 | AC-15 |

## 10. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `shared/seed/saas-operator/platform-ops.json` | new | FR-01, FR-02, FR-03, FR-04, FR-05 | non-lifecycle fixture: 5 journeys, ~25 activities, 4 roles, 3 function systems, all in-slice edges (§3.1); NO domain node row, NO cross-boundary edges (created by §4.2a); ids under `018f0200-…` |
| `api/scripts/seed-platform-ops-content.ts` | new | FR-01, FR-06..FR-13 | CLI content-seed entrypoint (`seed:platform-ops`): handle resolution → fixture load+rebind → governed writes, all lookup-before-create (§4) |
| `api/src/seed/platform-ops-content.ts` | new | FR-06..FR-13 | the KPI/risk/SLA/story/capability row data + internal zod input shapes (§3.3, §3.4, §3.5) + the per-write helpers |
| `package.json` | modify | FR-01 | add `seed:platform-ops` script (§6) — one line |
| `api/__tests__/platform-ops-journeys.integration.test.ts` | new | AC-01 | |
| `api/__tests__/platform-ops-activities.integration.test.ts` | new | AC-02 | |
| `api/__tests__/platform-ops-roles.integration.test.ts` | new | AC-03 | |
| `api/__tests__/platform-ops-systems.integration.test.ts` | new | AC-04 | |
| `api/__tests__/platform-ops-lifecycle-guard.integration.test.ts` | new | AC-05 | |
| `api/__tests__/platform-ops-seed-idempotency.integration.test.ts` | new | AC-06 | |
| `api/__tests__/platform-ops-kpis.integration.test.ts` | new | AC-07 | |
| `api/__tests__/platform-ops-kpi-measures.integration.test.ts` | new | AC-08 | |
| `api/__tests__/platform-ops-kpi-alignment.integration.test.ts` | new | AC-09 | |
| `api/__tests__/platform-ops-stories.integration.test.ts` | new | AC-10 | |
| `api/__tests__/platform-ops-risks.integration.test.ts` | new | AC-11 | |
| `api/__tests__/platform-ops-slas.integration.test.ts` | new | AC-12 | |
| `api/__tests__/platform-ops-capabilities.integration.test.ts` | new | AC-13 | |

**Explicitly NOT edited** — see §8 (ownership boundaries). No `pwa/` file, no
route file, no schema array, no owned-elsewhere storage/route code, no
foundation loader, no metric roster.

## 11. Gap Register (outbound — OQ-1)

One outbound gap is recorded for the orchestrator to route to the owning spec.
This spec does **not** act on it (NFR-01: it never seeds a `MetricDefinition`).

| Gap | Owning spec | Request | This spec's interim behavior |
|-----|-------------|---------|------------------------------|
| The frozen metric roster has no `metric-error-budget` and no `metric-backup-success` (verified: `shared/seed/saas-metric-library/metrics.json` is CAC…Deploy Frequency, 20 rows). | `saas-metric-library` | Add `metric-error-budget` (unit `percent`, category `reliability`) and `metric-backup-success` (unit `percent`, category `reliability`) to the frozen roster + AC-06 expected set. | **Error budget burn** `MEASURES` `metric-uptime` today (error budget = 1 − uptime; §4.3), re-pointable to `metric-error-budget` when it lands. **Backup success rate** is `should`-tier and ships **unlinked** until `metric-backup-success` lands, then gains a `MEASURES` edge. No slice-local `MetricDefinition` is ever created. |

## 12. Rejected alternatives

- **Invent `metric-error-budget`/`metric-backup-success` in this slice.**
  Violates XD-06 ("no ad-hoc metric semantics in a content slice") and NFR-01
  (no `MetricDefinition` seeding here). Rejected → OQ-1 (b)/(c) hybrid: bind error
  budget to `metric-uptime`, ship backup-success unlinked+`should`, flag the gap
  outbound (§11).
- **Write `ALIGNED_TO` via the generic `POST /api/v1/edges` (review C-01
  recommendation).** A dedicated, richer route exists —
  `POST /api/v1/kpi-alignments` (`weight`/`attribution_type`, and it verifies
  KPI+target existence). Rejected the generic path as *primary* → use the
  dedicated route (§4.4); keep the generic path only as AC-09's supplementary
  `400 edge_endpoint_label_mismatch` negative case (its real, distinct contract).
- **Carry the `Platform Ops` `Domain` node in the fixture with the real
  `platform_ops` seedKey and MERGE-de-dupe.** `attachDomain` server-generates the
  domain id, so the fixture cannot know it; a fixture domain row with a different
  id creates a duplicate. Rejected → the fixture omits the domain row; the
  content-seed creates journey→domain `PART_OF` after resolving `domainId` (§4.2).
- **Create the journey→domain / activity→shared-system edges inside the fixture.**
  The foundation loader would load them before handle resolution, dangling the
  cross-boundary `toId`s. Rejected → cross-boundary edges via `POST /api/v1/edges`
  in the content-seed after resolution (§4.2a).
- **Depend on the foundation FR-06 helper's internal SLA path.** That helper's
  path label was `/sla-crud` in foundation requirements (a file, not a route),
  corrected to `/api/v1/slas` in foundation design. Rejected the dependency on its
  internal label → this spec POSTs the verified as-built routes directly (§4.6),
  reusing the foundation helpers only if they target the right paths.
- **Seed SLA breach records / KPI measurements.** Out of scope (OQ-2) — this spec
  seeds SLA/KPI **definitions** only. Rejected → definitions via `/api/v1/slas` +
  `/api/v1/kpis`; breach/measurement data is the cockpit's / other specs' concern.
- **Create a `BoundedContext` when none fits (OQ-4).** `ddd-system-modeling`
  NFR-04 makes contexts read-only here. Rejected → best-effort
  `ASSIGNED_TO_CONTEXT`; unassigned capabilities are a valid DDD state.
- **A new content-seed permission / RBAC string.** Every governed route is
  already permission-mapped. Rejected → reuse existing mappings (§5.1, NFR-04).
