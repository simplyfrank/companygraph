---
feature: "platform-ops-process-model"
created: "2026-07-06"
author: "spec-author"
status: "draft"
size: "medium"
---

# Requirements: platform-ops-process-model

## Summary

`platform-ops-process-model` is one of the **six wave-2 content specs** of the
SaaS-Operator business-process model (blueprint
`.claude/specs/blueprint-saas-operator.md`), depending on
`saas-operator-foundation` (wave 1a) and `saas-metric-library` (wave 1b). It
authors the **Platform Ops / SRE domain** — the Helm operator control-plane's
site-reliability function — at **full-pipeline depth** (XD-10) as loadable graph
content under the existing **`Platform Ops` function `Domain`** that
`saas-operator-foundation` already seeded (FR-03 of that spec, `attributes.seedKey
= "platform_ops"`).

The deliverable is a **single seed slice** — `shared/seed/saas-operator/platform-ops.json`
— discovered and loaded idempotently by the foundation's directory-iterating
loader (`seed:saas-operator` → `POST /api/v1/import` → `realImport`), **plus** a
first-class **mapping table** (business action → companygraph label/edge, XD-10)
in this document, **plus** the operator KPIs (grounded in `MetricDefinition`s via
the `MEASURES` edge, XD-06/XD-06-erratum), the stories/ACs, the DDD system
mapping, and the **operational/security risks + SLA definitions created only via
the existing governed `risk-register` / `sla-crud` APIs** (XD-04/XD-08) — never
by editing risk/SLA route code.

It ships **NO new views**, **no new routes**, **no new ontology labels or edges**,
and **no compile-time schema additions**. Everything it authors either lands as
process content through the foundation loader or is created through
already-shipped governed write paths. The Platform Ops content surfaces through
the **existing** Explorer, `#/business/functions` (`FunctionMap`), and (wave 3)
`#/exec/operator` — none of which this spec builds.

## Motivation

1. **XD-10 makes full-pipeline depth mandatory.** Each content spec must cover
   journeys → activities×roles → systems → KPIs (metric-instantiated) → stories/ACs
   → risks → DDD system mapping, and must **prove the mapping onto the companygraph
   representation with an explicit table**. Platform Ops is the operator's
   reliability spine (fleet observability, deploy/release, incident/on-call,
   SLA/status, backups); without it the operator model has no reliability story
   and the wave-3 cockpit has no uptime/MTTR/error-budget health to roll up.
2. **The `Platform Ops` domain root already exists but is empty.**
   `saas-operator-foundation` FR-03 seeded the six function `Domain` roots scoped
   `IN_MODEL` to the SaaS-Operator root, deliberately **without** journeys/activities.
   This spec attaches its journeys under that existing domain (resolved by its
   `attributes.seedKey = "platform_ops"` lookup, never a hard-coded id) rather than
   racing to create the domain.
3. **KPIs must be grounded in the canonical metric library (XD-06).** The operator
   reliability KPIs (uptime, MTTR, deploy frequency, error budget, backup success)
   must `MEASURES` the shared `MetricDefinition`s from `saas-metric-library`
   (`metric-uptime`, `metric-mttr`, `metric-deploy-frequency`, …) rather than
   inventing ad-hoc metric semantics — so the wave-3 benchmark/cockpit specs can
   compare them.
4. **Risk/SLA data must be created without touching owned-elsewhere code (XD-04).**
   Operational and security risks and the platform SLA definitions this domain
   needs are created **only** by POSTing to the governed routes
   (`POST /api/v1/risk-register`, `POST /api/v1/slas`) — the exact seam
   `saas-operator-foundation` FR-06 built for this purpose. This spec never edits
   `risk-register.ts` / `sla-crud.ts` / `compliance-rules.ts` / `change-requests.ts`.
5. **Zero new surface.** Per the blueprint, the six content specs add **no new
   views** and edit **none** of `route.ts` / `SURFACES` / `views/index.tsx`
   (XD-05). This spec's entire footprint is one seed fixture, the KPI/edge/risk/SLA
   data it creates via governed APIs, and its tests.

## Domain scope — Platform Ops / SRE (Helm control-plane)

The function models the SRE team that operates the **Helm** control-plane and the
**MOMS** tenant fleet on **Kubernetes**. Five journeys at full-pipeline depth:

1. **Fleet observability** — metrics/logs/traces collection, dashboards, alerting
   thresholds across the tenant fleet.
2. **Deploy / release** — CI artifact → staging → canary → production rollout,
   rollback.
3. **Incident / on-call** — paging, triage, mitigation, resolution, postmortem.
4. **SLA / status** — SLO/error-budget tracking, public status-page updates,
   customer SLA reporting.
5. **Backups / DR** — scheduled backups, restore verification, disaster-recovery
   drills.

Systems referenced: shared catalog **Helm**, **Kubernetes (K8s)**, **PagerDuty**
(seeded once by `saas-operator-foundation` FR-04, referenced by stable seed id —
never re-created) plus function-specific observability/backup systems added
**within this slice only** (e.g. a metrics/observability stack, a status page, a
backup/restore system).

## Functional Requirements

<!-- Priorities: must = required for the full-pipeline slice + XD-10 mapping;
     should = depth/polish that strengthens the model but does not block M2. -->

### Process content — journeys, activities, roles, systems (XD-01, XD-03, XD-10)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **Five Platform-Ops `UserJourney` nodes** are authored in `shared/seed/saas-operator/platform-ops.json` and attached under the existing `Platform Ops` `Domain` via a `PART_OF` edge (`UserJourney → Domain`, per the core `EDGE_ENDPOINTS`): **Fleet observability**, **Deploy / release**, **Incident / on-call**, **SLA / status**, **Backups / DR**. The domain is resolved at author time by its `attributes.seedKey = "platform_ops"` against the SaaS-Operator root (`saas-operator-foundation` FR-03) — the fixture references the domain by its **stable seed id** written into the slice (the seed id is fixed in the fixture, and the fixture's domain-scoping is the domain node the foundation seeded; the design pins the exact resolution mechanism — either the fixture carries the domain node with the well-known `platform_ops` seedKey so MERGE-on-id/seedKey re-attaches idempotently, or a lookup step resolves the id). No new `Domain` is created that duplicates `Platform Ops`. | must | XD-01, XD-03, XD-10 |
| FR-02 | **Activities per journey** — each journey decomposes into ordered `Activity` nodes (target 4–7 per journey) connected `PART_OF` (`Activity → UserJourney`) and sequenced with `PRECEDES` (`Activity → Activity`) to express the ordered process flow (e.g. Deploy/release: `Build artifact` → `Promote to staging` → `Canary rollout` → `Promote to production` → `Verify & monitor`, with a `Rollback` branch). Every activity carries the standard node envelope (`id` UUIDv7, `name`, `description`, open `attributes`). | must | XD-03, XD-10 |
| FR-03 | **Roles × activities** — SRE-function `Role` nodes execute activities via `EXECUTES` (`Role → Activity`). Roles are drawn from the **shared Persona/Role catalog** seeded once by `saas-operator-foundation` FR-05 where one already fits (referenced by `name`/`seedKey`, never re-created); function-specific roles (e.g. **SRE**, **On-call Engineer**, **Release Manager**, **Platform Ops Lead**) that the shared catalog does not provide are added **within this slice** as `Role` nodes with a stable seed id. Every activity has ≥1 executing role. | must | XD-10 |
| FR-04 | **Systems × activities** — activities use systems via `USES_SYSTEM` (`Activity → System`). The shared-catalog systems **Helm**, **Kubernetes (K8s)**, and **PagerDuty** (seeded by `saas-operator-foundation` FR-04) are **referenced by their stable seed id, never re-created**; function-specific systems this domain needs but the shared catalog lacks (e.g. an **Observability stack**, a **Status page**, a **Backup/restore system**) are added **within this slice** as `System` nodes each carrying a valid `systemKind` (per `system-augmentation-model`). Where systems integrate, `INTEGRATES_WITH` (`System → System`) edges are authored (e.g. Helm ↔ K8s, Observability ↔ PagerDuty). | must | XD-07, XD-10, `system-augmentation-model` |
| FR-05 | **All process content is non-lifecycle and loads through `POST /api/v1/import`** (`realImport`, the guarded route — `saas-operator-foundation` FR-07/FR-09). The fixture contains **only** non-lifecycle node labels (`Domain`/`UserJourney`/`Activity`/`Role`/`System`) and core edge types (`PART_OF`/`EXECUTES`/`USES_SYSTEM`/`AT_LOCATION`/`PRECEDES`/`INTEGRATES_WITH`); it contains **no** lifecycle rows (`BusinessModel`/`BusinessModule`/`BusinessModuleVersion`/`ModuleInstance` or the lifecycle edges `IN_MODEL`/`HAS_VERSION`/`INSTANTIATES`/`INSTANCE_IN`/`FORKED_FROM`) — a lifecycle row would be rejected `409 model_lifecycle_route_required` with payload-atomic write-nothing. KPI/story/AC/`MEASURES` content is **not** in the fixture (it uses non-import write paths — FR-06..FR-09). | must | `saas-operator-foundation` FR-07/FR-09, XD-04 |

### KPIs grounded in the metric library (XD-06, XD-06-erratum)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-06 | **Operator KPIs for Platform Ops** — a `KPI` node per reliability metric this domain owns, created through the **existing KPI CRUD** (`POST /api/v1/kpis`, `handleKpiPost`, `kpi-crud.ts`, owned by `kpi-okr-governance` — **called, never edited**). At minimum: **Fleet uptime**, **MTTR**, **Deploy frequency**, **Error budget burn**, **Backup success rate**. This spec **does not** add KPI route code; it only creates KPI rows via the shipped route. | must | XD-06, `kpi-okr-governance` |
| FR-07 | **Each KPI `MEASURES` its canonical `MetricDefinition`** (XD-06; edge name per **XD-06-erratum** — the KPI→MetricDefinition edge is `MEASURES`, a distinct unguarded runtime edge type registered by `saas-metric-library`, **not** the lifecycle-guarded `INSTANTIATES`). The link is created via the **generic `POST /api/v1/edges`** route (`type:"MEASURES"`, `fromId:<KPI id>`, `toId:<MetricDefinition id>`), which `saas-metric-library` proved accepts `MEASURES` writes (201) while still rejecting lifecycle `INSTANTIATES` writes (409). The targeted `MetricDefinition`s are the shared canonical ones by `seedKey`: `metric-uptime` (Fleet uptime), `metric-mttr` (MTTR), `metric-deploy-frequency` (Deploy frequency), `metric-error-budget`/`metric-uptime`-adjacent for Error budget, and a backup-success metric. **Metric-availability check (see OQ-1):** the metric library's frozen roster seeds `uptime`, `mttr`, `deploy-frequency` but **may not** seed an `error budget` or `backup success` metric; if a required `MetricDefinition` is absent from the frozen roster, this spec **must not** invent it in its own slice (that would violate XD-06's "no ad-hoc metric semantics") — it is flagged to `saas-metric-library` as a gap (OQ-1). Each KPI links to **at most one** `MetricDefinition` (the cardinality `saas-metric-library` FR-03/OQ-2 enforces). | must | XD-06, XD-06-erratum, `saas-metric-library` FR-02/FR-03 |
| FR-08 | **KPIs are aligned to the process structure** they measure via the existing `ALIGNED_TO` edge (`KPI → UserJourney`/`Activity`/`Domain`, `kpi-measurement-alignment` FR-04) so a reliability KPI is anchored to the journey/domain it scores (e.g. `Fleet uptime` `ALIGNED_TO` the `Platform Ops` domain; `MTTR` `ALIGNED_TO` the Incident/on-call journey). Written via the existing KPI-alignment write path (`kpi-measurement-alignment`, **called, never edited**); endpoint-label validation is registry-backed (`400 edge_endpoint_label_mismatch` on a wrong pair). This spec adds **no** KPI/alignment route code. | should | XD-10, `kpi-measurement-alignment` FR-04 |

### Stories + acceptance criteria (XD-10)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-09 | **User stories with Given/When/Then acceptance criteria** for the key Platform-Ops activities, authored through the **existing `story-spec-core` model-scoped routes** (`POST /api/v1/models/:modelId/stories` with `{persona, action, benefit, activityId, roleId?}`; ACs via the story-spec-core AC path with structured `{given, when, then, ordinal}` — **called, never edited**). `:modelId` is the SaaS-Operator root id (resolved via `saas-operator-foundation`'s `name:"SaaS Operator"` + `saasOperatorRoot:true` key). `activityId` must be one of this slice's activities (which are in the operator model's scope, so the story-spec-core `story_activity_not_in_model` write-side scope check passes). At minimum one story per journey (5), each with ≥2 structured ACs. This spec creates story/AC **data** via the governed routes; it adds **no** story/AC route code. | must | XD-10, `story-spec-core` FR-05 |

### Risks + SLAs via governed APIs only (XD-04, XD-08)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-10 | **Operational + security risks** for the Platform-Ops function are created **only** by POSTing to the governed **`POST /api/v1/risk-register`** route (`handleRiskRegisterCreate`, `risk-register.ts`, owned by `risk-compliance-change` — **called, never edited**), using the `createRiskSchema` shape verbatim: `{name, owner?, domain?, likelihood(1..5), impact(1..5), status: open|mitigating|accepted|resolved, trend: up|flat|down, description?, mitigation_plan?, category?, risk_type?}` with `risk_type` ∈ `operational`/`security`/`technical` for this domain. At minimum: an **operational** risk (e.g. "Cascading fleet outage from a bad rollout"), a **security** risk (e.g. "Compromised control-plane credential"), and a **reliability/technical** risk (e.g. "Backup restore fails silently"). This spec creates risk **rows** via the governed route through the `saas-operator-foundation` FR-06 helper mechanism; it **never** edits `risk-register.ts` / `risk-compliance.ts` / `compliance-rules.ts` / `change-requests.ts`. | must | XD-04, XD-08, `saas-operator-foundation` FR-06 |
| FR-11 | **SLA definitions** for the platform (uptime/availability, incident-response, backup-restore) are created **only** by POSTing to the governed **`POST /api/v1/slas`** route (`handleSlaPost`, `sla-crud.ts`, owned by `kpi-okr-governance` — **called, never edited**), using the `slaCreateRequestSchema` shape verbatim (`{name, service_type?, target_value, target_unit, measurement_window, window_duration, compliance_threshold, …}`). At minimum: a **fleet uptime SLA** (e.g. target 99.9% monthly), an **incident-response SLA** (e.g. SEV1 acknowledge within N minutes), and a **backup/restore SLA**. This spec creates SLA **rows** via the governed route through the FR-06 helper; it **never** edits `sla-crud.ts`. **Note the split-brain constraint (see OQ-2):** the SLA definitions are Neo4j-backed via `/api/v1/slas` (as-built), distinct from the Postgres `sla_breaches` table; this spec creates SLA **definitions**, not breach records. | must | XD-04, XD-08, `kpi-okr-governance` |
| FR-12 | **Governed-data seed path** — the risk (FR-10) and SLA (FR-11) rows are created through the **`saas-operator-foundation` FR-06 governed-API seed helper** (the sanctioned API-driven path that POSTs to `/api/v1/risk-register` and `/api/v1/slas`), run as part of / alongside the slice's seed step. This spec supplies its **own rows** (payloads) to that helper; it does **not** re-implement the helper and does **not** create risk/SLA rows by any path other than the governed routes. If a governed route is missing a field this domain needs, that is a **gap flagged to the owning spec** (OQ-3), not worked around by editing owned-elsewhere code. | must | XD-04, `saas-operator-foundation` FR-06 |

### DDD system mapping (XD-10)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-13 | **DDD system mapping** — the Platform-Ops activities and their systems are mapped onto the DDD layer using the **existing `ddd-system-modeling` capability model** (**called, never edited**): business **`Capability`** nodes for the domain's cohesive abilities (e.g. "Roll out a release safely", "Detect & resolve an incident", "Restore from backup") created via `POST /api/v1/models/:modelId/capabilities`; `NEEDS_CAPABILITY` from the relevant activities/stories; `SUPPORTED_BY` from each capability to the supporting `System` (Helm/K8s/PagerDuty/observability/backup); and `ASSIGNED_TO_CONTEXT` to a `BoundedContext` where an appropriate one exists (contexts are read-only here — `ddd-system-modeling` NFR-04; this spec assigns to an existing context, never creates one). `:modelId` is the SaaS-Operator root. This spec creates capability + mapping **data** via the governed capability routes; it adds **no** DDD route code. | must | XD-10, `ddd-system-modeling` FR-02/FR-04/FR-05 |

### Mapping table — business action → representation (XD-10, mandatory artifact)

FR-14 (below) is the XD-10 first-class mapping artifact. It is a document
requirement, not a code requirement.

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-14 | **Explicit mapping table** (§ "Mapping table" below) proves every Platform-Ops business action maps onto a companygraph label/edge — journeys→`UserJourney`+`PART_OF`, steps→`Activity`+`PRECEDES`, ownership→`Role`+`EXECUTES`, tooling→`System`+`USES_SYSTEM`/`INTEGRATES_WITH`, measures→`KPI`+`MEASURES`(→`MetricDefinition`)+`ALIGNED_TO`, requirements→`UserStory`+`AcceptanceCriterion`, risks→governed `risk-register` rows, SLAs→governed `/slas` rows, capabilities→`Capability`+`NEEDS_CAPABILITY`/`SUPPORTED_BY`/`ASSIGNED_TO_CONTEXT`. This is a reviewable, first-class artifact per XD-10 — the core of the user ask. | must | XD-10 |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | **No new store, no new labels/edges, no compile-time schema edits.** This spec adds **zero** entries to `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS` in `shared/src/schema/{nodes,edges}.ts` and **zero** new runtime ontology labels/edges. All content reuses core process labels, the KPI/story/capability labels shipped by their owning specs, and the `MetricDefinition`/`MEASURES` constructs shipped by `saas-metric-library`. | XD-02, `saas-operator-foundation` NFR-01 |
| NFR-02 | **Idempotency + retail isolation.** The fixture uses stable seed ids so re-running `seed:saas-operator` adds zero net new nodes/edges (MERGE-on-id via `realImport`). The seed slice + all governed-API writes touch **only** the SaaS-Operator root's subgraph + the governed Postgres/Neo4j rows this spec creates; **nothing** mutates retail Business Model #1's subgraph or the retail/commercial seed files (XD-01). Risk/SLA/story/KPI/capability creation is designed to be re-run-safe (create-if-absent by a stable key, per the design). | XD-01 |
| NFR-03 | **Ownership boundaries (XD-04/XD-05/XD-08).** This spec edits **only** its own seed fixture (`shared/seed/saas-operator/platform-ops.json`), its own tests, and this spec's docs. It **never** edits `route.ts`/`SURFACES`/`views/index.tsx` (sole-owned by `saas-operator-foundation`), the seed loader `seed-saas-operator.ts` (foundation-owned), risk/SLA/compliance/change route code (`risk-register.ts`/`sla-crud.ts`/`compliance-rules.ts`/`change-requests.ts`/`risk-compliance.ts`), KPI/OKR route code (`kpi-*`), story/AC route code (`story-spec-core`), DDD route code (`ddd-system-modeling`), or the ontology registry (`saas-metric-library`/`ontology-manager`). It only **calls** those shipped routes. | XD-04, XD-05, XD-08 |
| NFR-04 | **House rules.** `zod` is the only validation library (all payloads validate against the **shipped** boundary schemas — this spec adds none of its own); no `tsc` (transpile via `bun run typecheck`); en-US identifiers in all node/edge names and seed keys (`neighbors`/`color`/`behavior` style — e.g. `metric-error-budget`, not `metric-error-budget-uk`); server binds loopback `127.0.0.1:8787`; auth via the central router gate + `api/src/auth/` only (this spec adds **no** routes and **no** new RBAC permission strings — every governed route it calls is already permission-mapped); all REST under `/api/v1/`. | CLAUDE.md |
| NFR-05 | **No new views / no PWA edits.** Per the blueprint (six content specs add no new views, XD-05/XD-11), this spec touches **no** file under `pwa/`. Its content surfaces through the existing Explorer, `FunctionMap` (`#/business/functions`, owned by `saas-operator-foundation`), and the wave-3 `#/exec/operator` cockpit — none built here. Because it does not touch `pwa/`, gestures, keyboard, or input handlers, the Platforms & Input Modes and Native Conflicts tables are **not applicable** (recorded explicitly below). | Blueprint XD-05/XD-11 |

## Mapping table (XD-10 — business action → companygraph representation)

This is the first-class mapping artifact XD-10 mandates. Each row is a
Platform-Ops business concept and the exact companygraph label/edge (and owning
spec) that represents it. No row invents a construct — every target already
exists in the codebase or in a landed dependency.

| Platform-Ops business concept | companygraph representation | Write path (called, not edited) | Owner spec |
|-------------------------------|-----------------------------|---------------------------------|------------|
| The Platform Ops function | existing `Platform Ops` `Domain` (seedKey `platform_ops`), scoped `IN_MODEL` to SaaS-Operator root | already seeded (foundation FR-03) | `saas-operator-foundation` |
| A workflow (e.g. Deploy/release, Incident/on-call) | `UserJourney` node + `PART_OF` (`UserJourney → Domain`) | `POST /api/v1/import` (fixture) | graph-core |
| A step in a workflow | `Activity` node + `PART_OF` (`Activity → UserJourney`) | `POST /api/v1/import` (fixture) | graph-core |
| Step ordering / process flow | `PRECEDES` (`Activity → Activity`) | `POST /api/v1/import` (fixture) | graph-core |
| Who performs a step | `Role` node + `EXECUTES` (`Role → Activity`) | `POST /api/v1/import` (fixture) / shared catalog by name | graph-core / foundation FR-05 |
| Tooling used by a step | `System` node + `USES_SYSTEM` (`Activity → System`); shared Helm/K8s/PagerDuty by seed id | `POST /api/v1/import` (fixture) / shared catalog | graph-core / foundation FR-04 |
| Systems that talk to each other | `INTEGRATES_WITH` (`System → System`) | `POST /api/v1/import` (fixture) | graph-core |
| A reliability measure (uptime, MTTR, …) | `KPI` node | `POST /api/v1/kpis` | `kpi-okr-governance` |
| The canonical definition of a measure | `KPI` `MEASURES` `MetricDefinition` (`metric-uptime`, `metric-mttr`, `metric-deploy-frequency`, …) | `POST /api/v1/edges` (`type:"MEASURES"`) | `saas-metric-library` (edge), `saas-operator-foundation`-loaded metric seed |
| What a KPI scores in the process | `ALIGNED_TO` (`KPI → UserJourney`/`Activity`/`Domain`) | KPI-alignment write path | `kpi-measurement-alignment` |
| A requirement / expected behavior | `UserStory` + `AcceptanceCriterion` (Given/When/Then) + `DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE`/`ACCEPTANCE_OF` | `POST /api/v1/models/:modelId/stories` (+ AC path) | `story-spec-core` |
| An operational/security risk | `risk_register` row (Postgres) | `POST /api/v1/risk-register` | `risk-compliance-change` |
| A platform SLA (uptime/response/backup) | SLA definition (`/slas`, Neo4j) | `POST /api/v1/slas` | `kpi-okr-governance` |
| A business capability (DDD) | `Capability` + `NEEDS_CAPABILITY`/`SUPPORTED_BY`/`ASSIGNED_TO_CONTEXT`/`CAPABILITY_IN_MODEL` | `POST /api/v1/models/:modelId/capabilities` (+ mapping routes) | `ddd-system-modeling` |
| A bounded context | existing `BoundedContext` (read-only; assigned, never created) | `PUT .../context` | `ddd-system-modeling` (read of contexts) |

## Scope Boundaries

**In scope:**
- The `shared/seed/saas-operator/platform-ops.json` fixture: five journeys, their
  ordered activities, function roles, function-specific systems + their edges,
  all non-lifecycle process content under the existing `Platform Ops` domain.
- The Platform-Ops **KPI rows** (uptime, MTTR, deploy frequency, error budget,
  backup success) created via `POST /api/v1/kpis`, each `MEASURES` its canonical
  `MetricDefinition` (via `POST /api/v1/edges`), each `ALIGNED_TO` its process
  structure.
- The Platform-Ops **stories + Given/When/Then ACs** created via the
  `story-spec-core` model-scoped routes.
- The Platform-Ops **operational/security risks** created via `POST /api/v1/risk-register`
  and **SLA definitions** created via `POST /api/v1/slas`, both through the
  foundation FR-06 governed-API helper.
- The Platform-Ops **DDD capability mapping** via `ddd-system-modeling` routes.
- The **mapping table** (XD-10 artifact, above).

**Out of scope (owner named):**
- Any new view, route, ontology label/edge, or compile-time schema change → none;
  this spec authors content/data only (NFR-01/NFR-05).
- The `Platform Ops` `Domain` root, the SaaS-Operator root, the shared
  System/Persona/Role catalog, the seed loader, the FR-06 governed-API helper
  mechanism → `saas-operator-foundation` (consumed, never re-implemented).
- `MetricDefinition` label + `MEASURES` edge + the canonical metric roster →
  `saas-metric-library` (consumed; if a needed metric is missing, flagged, not
  invented — OQ-1).
- KPI/OKR node CRUD + route code → `kpi-okr-governance` / `kpi-measurement-alignment`.
- Story/AC route code → `story-spec-core`. DDD capability route code →
  `ddd-system-modeling`.
- Risk/SLA/compliance/change **route code** → `risk-compliance-change` /
  `kpi-okr-governance` (this spec only POSTs rows).
- The `#/exec/operator` cockpit + benchmark scoring that aggregate this content →
  `cross-function-exec-rollup` / `function-benchmark-scoring` (wave 3).
- The other five function slices (marketing, sales, finance, customer-success,
  product) → their own wave-2 content specs.

## Acceptance Criteria

<!-- Every AC traces to ≥1 FR. Platforms + Verification columns mandatory.
     Verification is a test path or manual: <input mode + observable outcome>.
     This spec touches no pwa/ — Platforms are "server (bun test + Neo4j/Postgres)"
     or "CLI". -->

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | After `seed:saas-operator`, the `Platform Ops` domain (seedKey `platform_ops`, `IN_MODEL` the SaaS-Operator root) has the five journeys (Fleet observability, Deploy/release, Incident/on-call, SLA/status, Backups/DR), each `PART_OF` the domain; no duplicate `Platform Ops` domain is created (FR-01) | server (bun test + Neo4j) | `api/__tests__/platform-ops-journeys.integration.test.ts` |
| AC-02 | Each journey has 4–7 `Activity` nodes `PART_OF` it and an ordered `PRECEDES` chain over them (a path exists from the first to the last activity of each journey; the Deploy/release journey includes a `Rollback` branch) (FR-02) | server (bun test + Neo4j) | `api/__tests__/platform-ops-activities.integration.test.ts` |
| AC-03 | Every Platform-Ops activity has ≥1 `Role` `EXECUTES` it; the function roles (SRE, On-call Engineer, Release Manager, Platform Ops Lead) exist; roles that duplicate the shared catalog by name are **not** re-created (referenced) (FR-03) | server (bun test + Neo4j) | `api/__tests__/platform-ops-roles.integration.test.ts` |
| AC-04 | Shared-catalog systems Helm, K8s, PagerDuty are **referenced by their stable seed id** (no duplicate System node is created for them); function-specific systems (observability stack, status page, backup/restore) exist each with a valid `systemKind`; `USES_SYSTEM` edges connect activities to systems and ≥1 `INTEGRATES_WITH` edge exists between systems (FR-04) | server (bun test + Neo4j) | `api/__tests__/platform-ops-systems.integration.test.ts` |
| AC-05 | The `platform-ops.json` fixture contains **only** non-lifecycle node labels + core edge types and **no** lifecycle rows; loading it via `POST /api/v1/import` (`realImport`) succeeds and writes the content; a hand-constructed variant with a lifecycle row (e.g. an `IN_MODEL` edge) is rejected `409 model_lifecycle_route_required` with nothing written (FR-05) | server (bun test + Neo4j) | `api/__tests__/platform-ops-lifecycle-guard.integration.test.ts` |
| AC-06 | Seed idempotency + retail isolation: running the platform-ops seed twice yields zero net new nodes/edges (stable seed ids MERGE); a pre/post `/api/v1/stats` diff attributable to a re-run is zero and the retail Business Model #1 subgraph is unchanged; the fixture never edits `route.ts`/`SURFACES`/`views/index.tsx`/`seed-saas-operator.ts`/schema arrays (FR-01, NFR-02, NFR-03) | server (bun test + Neo4j) + CLI | `api/__tests__/platform-ops-seed-idempotency.integration.test.ts`; manual: `git diff --stat` after seeding — expect changes confined to `shared/seed/saas-operator/platform-ops.json` + this spec's tests, no schema/route/loader edits |
| AC-07 | The Platform-Ops KPIs (Fleet uptime, MTTR, Deploy frequency, Error budget burn, Backup success rate) are created via `POST /api/v1/kpis` and exist as `KPI` nodes; no `kpi-crud.ts`/`kpi-*` route code is edited (FR-06, NFR-03) | server (bun test + Neo4j) + CLI | `api/__tests__/platform-ops-kpis.integration.test.ts`; manual: `git diff --stat api/src/routes/kpi-crud.ts` — expect no change |
| AC-08 | Each Platform-Ops KPI is linked to exactly one canonical `MetricDefinition` via a `MEASURES` edge created through `POST /api/v1/edges` (`type:"MEASURES"`); the write returns 201 (not `409 model_lifecycle_route_required`); the module-pin `INSTANTIATES` lifecycle edge remains unaffected; every targeted `MetricDefinition` resolves in the seeded metric roster (or the gap is recorded per OQ-1) (FR-07) | server (bun test + Neo4j) | `api/__tests__/platform-ops-kpi-measures.integration.test.ts` |
| AC-09 | Each Platform-Ops KPI is `ALIGNED_TO` a `UserJourney`/`Activity`/`Domain` it scores (e.g. Fleet uptime → Platform Ops domain, MTTR → Incident/on-call journey); a wrong endpoint pair is rejected `400 edge_endpoint_label_mismatch`; no `kpi-measurement-alignment` route code is edited (FR-08, NFR-03) | server (bun test + Neo4j) | `api/__tests__/platform-ops-kpi-alignment.integration.test.ts` |
| AC-10 | At least one `UserStory` per journey (5) exists, created via `POST /api/v1/models/:modelId/stories` against the SaaS-Operator root, each `DESCRIBES_ACTIVITY` one of this slice's activities (passing the `story_activity_not_in_model` scope check) and each carrying ≥2 `AcceptanceCriterion` nodes with non-empty structured `given`/`when`/`then`; no `story-spec-core` route code is edited (FR-09, NFR-03) | server (bun test + Neo4j) | `api/__tests__/platform-ops-stories.integration.test.ts` |
| AC-11 | The Platform-Ops risks (≥1 operational, ≥1 security, ≥1 reliability/technical) are created via `POST /api/v1/risk-register` conforming to `createRiskSchema` (valid `likelihood`/`impact` 1–5, `status`, `trend`, `risk_type` ∈ operational/security/technical), each returning a persisted id; no `risk-register.ts`/`risk-compliance.ts`/`compliance-rules.ts`/`change-requests.ts` code is edited (FR-10, FR-12, NFR-03) | server (bun test + Postgres) + CLI | `api/__tests__/platform-ops-risks.integration.test.ts`; manual: `git diff --stat api/src/routes/{risk-register,risk-compliance,compliance-rules,change-requests}.ts` — expect no change |
| AC-12 | The Platform-Ops SLA definitions (≥1 uptime/availability, ≥1 incident-response, ≥1 backup/restore) are created via `POST /api/v1/slas` conforming to `slaCreateRequestSchema`, each returning a persisted id; no `sla-crud.ts` code is edited (FR-11, FR-12, NFR-03) | server (bun test + Neo4j) + CLI | `api/__tests__/platform-ops-slas.integration.test.ts`; manual: `git diff --stat api/src/routes/sla-crud.ts` — expect no change |
| AC-13 | The DDD capability mapping exists: ≥3 `Capability` nodes for the domain created via `POST /api/v1/models/:modelId/capabilities` (each with a `CAPABILITY_IN_MODEL` edge to the SaaS-Operator root), each `SUPPORTED_BY` ≥1 seeded `System`, each with ≥1 `NEEDS_CAPABILITY` source among this slice's activities/stories, and where an existing `BoundedContext` fits, an `ASSIGNED_TO_CONTEXT` edge (no bounded context is created); no `ddd-system-modeling` route code is edited (FR-13, NFR-03) | server (bun test + Neo4j) + CLI | `api/__tests__/platform-ops-capabilities.integration.test.ts`; manual: `git diff --stat api/src/routes/ontology-bounded-contexts.ts` — expect no change |
| AC-14 | The mapping table in `requirements.md` (§ Mapping table) covers every business concept in the domain scope with a concrete label/edge + owning spec, and every representation named is one that exists in the codebase or a landed dependency (no invented construct) (FR-14) | CLI (doc review) | manual: read `.claude/specs/platform-ops-process-model/requirements.md` § Mapping table — verify each row's representation resolves to a real label/edge/route (`grep` the named label/edge in `shared/src/schema` or the owning spec's `requirements.md`) and no row introduces a new construct |
| AC-15 | Transpile is clean and the ownership boundary holds: `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS` are unchanged, no new RBAC permission string is added, and no `pwa/` file, route file, loader, or owned-elsewhere route code is touched (NFR-01, NFR-03, NFR-04, NFR-05) | CLI | `bun run typecheck` exit 0; manual: `git diff --stat` — expect changes confined to `shared/seed/saas-operator/platform-ops.json`, `api/__tests__/platform-ops-*.integration.test.ts`, and `.claude/specs/platform-ops-process-model/*`; no edits to `shared/src/schema/*`, `pwa/*`, `api/src/router.ts`, `api/src/routes/*`, `api/src/auth/rbac-permissions.ts`, or `api/scripts/seed-saas-operator.ts` |

## Platforms & Input Modes

**Not applicable.** This spec touches **no** file under `pwa/`, introduces **no**
view, gesture, keyboard handler, or input surface (NFR-05, blueprint XD-05/XD-11 —
the six content specs add no new views). Its entire footprint is a seed fixture,
governed-API data writes, and server-side integration tests. Per the
spec-workflow size/promotion rule, the Platforms & Input Modes and Native
Conflicts tables are required only when a spec touches `pwa/`, gestures, keyboard,
or input handlers; this spec does none of those. Every Acceptance Criterion above
still carries explicit **Platforms** (server / CLI) and **Verification** columns.

## Native Conflicts

**Not applicable** — no gesture, scroll-container, focus-trap, or keyboard-handler
work is introduced (this spec has no PWA surface). Recorded explicitly rather than
left blank:

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| (none) | n/a | n/a |

## Dependencies

- **saas-operator-foundation** (wave 1a — the barrier): the SaaS-Operator
  `BusinessModel` root (resolved by `name:"SaaS Operator"` + `saasOperatorRoot:true`);
  the existing `Platform Ops` `Domain` (seedKey `platform_ops`, `IN_MODEL`-scoped —
  FR-03) this slice attaches journeys under; the shared System/Persona/Role catalog
  (Helm/K8s/PagerDuty + shared roles, referenced by seed id/name — FR-04/FR-05);
  the **directory-iterating seed loader** (`seed:saas-operator` → `realImport`
  behind `POST /api/v1/import`) that discovers `platform-ops.json`; the **FR-06
  governed-API seed helper** (POSTs risk/SLA rows to the governed routes) this spec
  supplies rows to.
- **saas-metric-library** (wave 1b): the canonical `MetricDefinition` roster
  (`metric-uptime`, `metric-mttr`, `metric-deploy-frequency`, … referenced by
  `seedKey`) and the **`MEASURES`** KPI→MetricDefinition edge (a distinct unguarded
  runtime edge type; XD-06-erratum) written via generic `POST /api/v1/edges`; the
  at-most-one-metric-per-KPI cardinality. Consumed, never edited.
- **graph-core** (`api/src/routes/import.ts` `realImport` behind `POST /api/v1/import`
  with the lifecycle guard; `api/src/routes/edges.ts` `handleEdgePost` under
  `POST /api/v1/edges`; the core `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS` and the
  MERGE-on-id upsert path): the fixture load path + the `MEASURES`/`ALIGNED_TO`
  edge writes.
- **kpi-okr-governance** (`api/src/routes/kpi-crud.ts` `handleKpiPost` under
  `POST /api/v1/kpis`; `api/src/routes/sla-crud.ts` `handleSlaPost` under
  `POST /api/v1/slas` with `slaCreateRequestSchema`): KPI + SLA row creation.
  Called, never edited.
- **kpi-measurement-alignment** (the `ALIGNED_TO` edge `KPI → UserJourney`/`Activity`/`Domain`
  + its write path): KPI-to-process alignment (FR-08). Called, never edited.
- **story-spec-core** (`POST /api/v1/models/:modelId/stories` + the AC path;
  `UserStory`/`AcceptanceCriterion` labels; `DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE`/`ACCEPTANCE_OF`
  edges; the `story_activity_not_in_model` write-side scope check): stories + ACs
  (FR-09). Called, never edited.
- **risk-compliance-change** (`api/src/routes/risk-register.ts` `handleRiskRegisterCreate`
  under `POST /api/v1/risk-register` with `createRiskSchema`): operational/security
  risk rows (FR-10). Called, never edited.
- **ddd-system-modeling** (`POST /api/v1/models/:modelId/capabilities` +
  `PUT .../supported-by` / `.../needed-by` / `.../context`; `Capability` label +
  `NEEDS_CAPABILITY`/`SUPPORTED_BY`/`ASSIGNED_TO_CONTEXT`/`CAPABILITY_IN_MODEL`
  edges; read-only `BoundedContext`): the DDD mapping (FR-13). Called, never edited.
- **system-augmentation-model** (`systemKind` on `System` nodes): function-specific
  systems carry a valid `systemKind` (FR-04).
- **Seed infrastructure** (`shared/seed/saas-operator/`, the foundation's
  `seed:saas-operator` wiring): where `platform-ops.json` lands and is discovered.

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | **OQ-1: metric-roster coverage for Error budget + Backup success.** FR-07 needs each KPI to `MEASURES` a canonical `MetricDefinition`. The `saas-metric-library` frozen roster seeds `metric-uptime`, `metric-mttr`, `metric-deploy-frequency` (confirmed in `shared/seed/saas-metric-library/metrics.json`) but **does not** clearly seed an **error-budget** or **backup-success** metric. XD-06 forbids inventing ad-hoc metric semantics in a content slice. **Options:** (a) flag the two missing metrics to `saas-metric-library` as a roster gap to add (`metric-error-budget`, `metric-backup-success`) — keeps XD-06 intact but couples to that spec landing an addition; (b) express Error budget / Backup success KPIs against the **nearest existing** canonical metric (`metric-uptime` for error budget, since error budget is `1 − uptime` against the SLO) and defer a distinct metric to wave 3; (c) drop those two KPIs from the mandatory set to the `should` tier until the metrics exist. **Author recommendation: (a) + (b) hybrid** — flag the gap (a) AND, until it lands, bind Error budget to `metric-uptime` (b) so the slice is not blocked. **Needs a user decision** (or the `saas-metric-library` owner's) because it may add rows to another spec's frozen roster. | Determines FR-07/AC-08's exact `MetricDefinition` targets and whether a cross-spec roster edit is requested. | **User / `saas-metric-library`-owner decision.** Recommend (a)+(b). Whichever is chosen, this spec never seeds a new `MetricDefinition` itself (NFR-01). |
| 2 | **OQ-2: SLA definition vs. KPI-measurement split-brain.** The blueprint Risks note a `:KPIMeasurement` (Neo4j) vs `kpi_measurements` (Postgres) split and an SLA `/slas` (Neo4j) vs `sla_breaches` (Postgres) split. This spec creates SLA **definitions** via `POST /api/v1/slas` (Neo4j, as-built) and creates **no** measurement/breach records. **Question:** is that the correct governed source for the cockpit's later SLA rollup, or does the cockpit read a different SLA source? | Determines whether the SLA definitions this spec seeds are the ones the wave-3 cockpit reads. | **Design-time confirmation.** Author leans: create SLA **definitions** only via `/slas` (the sanctioned CRUD); the cockpit's read source is `cross-function-exec-rollup`'s concern, not this spec's. Low blast radius — this spec creates definitions, not breach data. |
| 3 | **OQ-3: governed-route field gaps.** FR-10/FR-11 assert the domain's risk/SLA rows fit `createRiskSchema`/`slaCreateRequestSchema` verbatim. If a field this domain wants (e.g. a risk↔activity link, or an SLA↔KPI link) is not accepted by the shipped route, XD-04 forbids editing the route here. | A needed link/field could be unrepresentable via the governed API. | **Design-time.** Any missing field is **flagged to the owning spec** (`risk-compliance-change` / `kpi-okr-governance`) as a gap, per `saas-operator-foundation` OQ-3 — not worked around. The design confirms the exact fields the domain needs are all present before build. |
| 4 | **OQ-4: DDD bounded-context availability.** FR-13 assigns capabilities to an **existing** `BoundedContext` (never creates one — `ddd-system-modeling` NFR-04). If no Platform-Ops-appropriate context exists in the graph, the `ASSIGNED_TO_CONTEXT` assignments cannot be made. | Some capabilities may be left context-unassigned (the DDD `unassigned` bucket). | **Design-time.** `ASSIGNED_TO_CONTEXT` is `should`/best-effort where a context fits; capabilities with no fitting context are simply left unassigned (a valid DDD state, `ddd-system-modeling` FR-09 `unassigned` bucket). Not a blocker — capability + `SUPPORTED_BY` + `NEEDS_CAPABILITY` mapping (the mandatory DDD depth) stands regardless. |
| 5 | **Governed-API seed re-run safety.** Risk/SLA/KPI/story/capability rows are created via POST routes that (unlike `realImport`) may **not** all be MERGE-on-stable-id — a naive re-run could duplicate them. | A second `seed:saas-operator` run could create duplicate KPIs/risks/SLAs (NFR-02 idempotency at risk). | **Design-time.** The design specifies a **create-if-absent-by-stable-key** guard for each governed write (lookup by name/key before POST), mirroring the foundation's lookup-before-attach pattern; AC-06 asserts zero net new on re-run. If a governed route cannot be safely made idempotent from the caller side, that is folded into OQ-3. |
| 6 | **Content-slice review depth.** XD-10 makes the mapping table a first-class reviewable artifact; a thin slice (too few activities/roles/stories) would fail the "full-pipeline depth" bar. | An under-built slice fails XD-10. | The FR minimums (5 journeys, 4–7 activities each, ≥1 role/activity, ≥5 stories with ≥2 ACs, ≥5 KPIs, ≥3 risks, ≥3 SLAs, ≥3 capabilities) are the depth floor; AC-01..AC-14 assert them. |
