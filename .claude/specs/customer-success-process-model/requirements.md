---
feature: "customer-success-process-model"
created: "2026-07-06"
author: "spec-author"
status: "revised"
revision: 2
size: "medium"
---

<!-- Revision 2 (2026-07-06) resolves review-requirements.md rev 1:
     B-01 → FR-15 (seed-preamble: resolves the operator-root modelId) + FR-08/FR-12 thread it; AC-08/AC-11.
     B-02 → FR-15 (verified: scopedNodeIds includes transitive PART_OF descendants) + AC-08/AC-11.
     B-03 → FR-05/FR-09/FR-11/NFR-02 corrected: idempotency guards are THIS spec's own seed-step code
            (governed-seed-helper is POST-only, no seedKpi); OQ-3 extended to SLA/risk/story.
     C-01 → FR-05 cross-references FR-07/OQ-1 gate.
     C-02 → AC-06 asserts the MEASURES edge-type registration precondition.
     C-03 → FR-11/OQ-2 record the canonical domain-key convention for the wave-3 cockpit.
     C-04 → FR-13/AC-14 require each mapping row to name label/edge + route/API + error code.
     N-01 → AC-09 split; FR-10 alignment gets its own AC-16.
     N-02 → FR-09 confirmed on route /api/v1/slas (file is sla-crud.ts); flagged for design.
     N-03 → Summary wave-3 surfacing marked context-only, no AC depends on it. -->


# Requirements: customer-success-process-model

## Summary

`customer-success-process-model` is a **wave-2 content spec** of the SaaS-Operator
business-process model (blueprint `.claude/specs/blueprint-saas-operator.md`),
depending on `saas-operator-foundation` (wave 1a) and `saas-metric-library`
(wave 1b). It authors the **full-pipeline Customer Success (CS) function** onto
the graph under the pre-existing **"SaaS Operator" `BusinessModel` root**, inside
the pre-existing **`Customer Success` function `Domain`** (seedKey
`customer_success`, created by the foundation, FR-03). It models five CS
journeys — **onboarding, health scoring, renewals, churn-save, support
ticketing** — as `UserJourney`/`Activity` structure with `Role` assignments
(`EXECUTES`), shared `System` usage (`USES_SYSTEM`), operator **KPIs** that
`MEASURES` canonical `MetricDefinition`s (XD-06/XD-06-erratum), **user
stories + acceptance criteria** (via `story-spec-core`), **SLA definitions**
(via the existing `sla-crud` API), **risks** (via the existing `risk-register`
API), and a **DDD system mapping** (via `ddd-system-modeling` capabilities).
Everything ships as a loadable **seed slice**
`shared/seed/saas-operator/customer-success.json` (process content) plus an
**API-driven seed step** for the Postgres-backed SLA/risk rows, and an explicit
**mapping table** (business action → label/edge) proving the function maps onto
the companygraph representation (XD-10).

It **adds no new views** (it surfaces through the existing Explorer,
`#/business/functions` FunctionMap, and — in wave 3 — the OperatorCockpit /
BenchmarkReport; those wave-3 surfaces are **forward-looking context only** —
out of scope here, and **no AC in this spec depends on them**, N-03). It
**edits no route-registration files** (`route.ts` /
`SURFACES` / `views/index.tsx`, sole-owned by `saas-operator-foundation`, XD-05),
**no** metric-library / funnel / SLA / risk / KPI / story / DDD **route code**
(owned by their respective specs — this spec creates that data **only** via the
governed APIs, XD-04/XD-08), and **no** compile-time schema arrays.

## Motivation

1. The blueprint mandates (XD-10) **full-pipeline depth** for each function:
   journeys, activities×roles, systems, KPIs (metric-instantiated), stories/ACs
   (Given/When/Then), risks, and DDD system mapping — with a first-class
   **mapping table** proving the function maps onto the companygraph
   representation. Customer Success is one of the six functions the SaaS operator
   must author; without this slice the operator model is incomplete and the
   wave-3 cockpit / benchmark specs have no CS content to aggregate.
2. Customer Success owns the **retention** side of the SaaS operator's revenue
   (NRR, GRR, logo/revenue churn) plus **service quality** (health score, CSAT,
   ticket SLA). These are the metrics the operator cockpit surfaces and the
   benchmark report scores; grounding CS KPIs in the canonical metric library
   (XD-06) is what makes them comparable across functions.
3. The MOMS product (medical-office SaaS) is a **customer-facing** product: CS is
   the function that keeps tenants live, healthy, and renewing. Modeling its
   onboarding → health → renewal → churn-save → support pipeline makes the
   operator's post-sale motion explicit in the graph, alongside the Sales
   pre-sale pipeline and the Finance billing pipeline.
4. CS is the canonical home of **SLA definitions** (support-ticket response /
   resolution SLAs) — this spec exercises the XD-04 governed-API path for SLAs
   (`sla-crud`) as data, proving the foundation's FR-06 governed-API seed helper
   works for a real content slice, without touching `sla-crud.ts`.

## Functional Requirements

<!-- Priorities: must = full-pipeline-depth (XD-10) obligation / wave-3
     unblocking; should = enrichment. Every FR is content authored via a
     governed path — this spec writes NO new route/handler code. -->

### CS journeys + activities×roles + systems (XD-10 process layer)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **Five CS `UserJourney`s** are authored under the `Customer Success` function `Domain` (resolved by lookup on the operator root's `IN_MODEL` domain carrying `attributes.seedKey:"customer_success"`, per `saas-operator-foundation` FR-03 — the domain's server-generated id is **discovered at seed time, never hard-coded**): **Onboarding**, **Health Scoring**, **Renewals**, **Churn-Save**, **Support Ticketing**. Each journey is a `UserJourney` node with `name`/`description`, linked to the CS domain via `PART_OF` (UserJourney→Domain). All are seeded as `{nodes, edges}` rows in `shared/seed/saas-operator/customer-success.json`, loaded through the foundation's directory-iterating loader (`POST /api/v1/import` → `realImport`, MERGE-on-id). Stable seed ids are used so a re-seed adds zero nodes (idempotent). | must | XD-10, `saas-operator-foundation` FR-03/FR-07 |
| FR-02 | **Activities per journey**, each an `Activity` node linked to its journey via `PART_OF` (Activity→UserJourney), covering the CS pipeline at process depth (illustrative, frozen exactly at design time — this list is the mandatory minimum, not a ceiling): Onboarding — *kickoff call, environment provisioning verification, data migration validation, admin training, go-live sign-off*; Health Scoring — *ingest usage/adoption signals, compute health score, flag at-risk accounts, trigger playbook*; Renewals — *renewal forecast, renewal outreach, contract negotiation, renewal close/expansion*; Churn-Save — *churn-risk detection, save-play execution, executive escalation, win-back offer*; Support Ticketing — *ticket intake/triage, first-response, resolution, escalation to engineering, CSAT survey*. Ordered process flow **within** a journey is expressed with `PRECEDES` (Activity→Activity) where a natural order exists. All rows live in the same seed slice. | must | XD-10 |
| FR-03 | **Role assignments (`EXECUTES`)** — each activity is executed by at least one `Role`, linking `Role → Activity` via `EXECUTES`. CS roles reference the **shared Role catalog** seeded by the foundation (XD-07, `saas-operator-foundation` FR-05) by **name/`seedKey`** where one already exists (e.g. a CS-function-owner role); any **CS-specific** role not in the shared catalog (e.g. *Onboarding Specialist*, *Customer Success Manager*, *Support Agent*, *Renewals Manager*) is created **within this slice** as a `Role` node (reference node, MERGE-on-seed-id, model-independent per `model-workspace-core` DEC-01) — this spec never duplicates a shared-catalog role. | must | XD-10, XD-07 |
| FR-04 | **System usage (`USES_SYSTEM`)** — activities that touch a system link `Activity → System` via `USES_SYSTEM`, referencing **shared System catalog** nodes by stable seed id where they exist (MOMS, Helm, CRM, data-warehouse, PagerDuty per `saas-operator-foundation` FR-04) and adding only **CS-specific systems** within this slice (e.g. a *Customer Success platform* / *health-scoring engine*, a *support/ticketing system* if not already in the shared catalog). CS-specific systems carry a valid `systemKind` (`system-augmentation-model`). This spec **never** re-creates a shared-catalog System — it references it by id. | must | XD-10, XD-07 |

### CS KPIs grounded in the metric library (XD-06 / XD-06-erratum)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-05 | **CS KPIs authored via the governed KPI route** — each CS KPI is created through `POST /api/v1/kpis` (`kpi-crud`, `handleKpiPost` → `:KPI` node, `domain_id` = the CS domain id resolved at seed time, per FR-15), **never** by editing `kpi-crud.ts` or adding a KPI label (KPI is an existing compile-time label). KPIs cover the CS metric surface: **NRR**, **GRR**, **logo churn**, **revenue churn**, **health score**, **CSAT**, **ticket SLA compliance** (blueprint Feature Inventory). **`must` set gated by OQ-1 (Resolves: C-01):** only the **four retention KPIs** (NRR/GRR/logo churn/revenue churn) are unconditionally `must` — the **health-score / CSAT / ticket-SLA-compliance** KPIs **cannot be authored compliantly today** because their `MetricDefinition`s do not exist in the metric library and XD-06 forbids inventing metric semantics here; those three are **conditional on OQ-1 — see FR-07**. **KPI idempotency is this spec's own seed-step code (Resolves: B-03).** `handleKpiPost` server-generates the id and does a plain `CREATE (k:KPI …)` with **no** MERGE (verified `kpi-crud.ts:43,51`), and the foundation's governed-seed helper exposes **no `seedKpi`** — so the lookup-before-create guard (a query on existing CS KPIs by `name` + `domain_id`, skip-if-present) is implemented **inside this spec's own `seed:customer-success` step**, not inherited from the foundation's FR-06 helper. A re-seed creates no duplicate KPI. | must | XD-10, XD-06, blueprint Feature Inventory, OQ-1, OQ-3 |
| FR-06 | **Every CS KPI `MEASURES` a canonical `MetricDefinition`** (XD-06 / XD-06-erratum) — a `MEASURES` edge (`KPI → MetricDefinition`, registered by `saas-metric-library`) is created via the generic `POST /api/v1/edges` route (`MEASURES ∉ LIFECYCLE_EDGES`, so it is accepted; `saas-metric-library` design §3.2), linking each CS KPI to its catalog metric by the metric's **stable seed id**. The CS KPIs whose metric **already exists** in the frozen 20-metric roster link directly: **NRR → `metric-nrr`**, **GRR → `metric-grr`**, **logo churn → `metric-logo-churn`**, **revenue churn → `metric-revenue-churn`**. A KPI links to **at most one** `MetricDefinition` (`saas-metric-library` OQ-2 option (a): a second `MEASURES` from the same KPI is rejected `409 kpi_metric_already_linked`); this spec authors **exactly one** `MEASURES` per KPI. This spec **must not invent ad-hoc metric semantics** (XD-06) — it references library definitions, never redefines them. | must | XD-06, XD-06-erratum, `saas-metric-library` FR-02/FR-04/OQ-2 |
| FR-07 | **Metric-library gap for CS-specific metrics (OQ-1 — BLOCKING).** Three blueprint-named CS KPIs — **health score**, **CSAT**, **ticket SLA compliance** — have **no** corresponding `MetricDefinition` in `saas-metric-library`'s frozen 20-metric roster (verified: the roster is CAC, LTV, LTV:CAC, MRR, ARR, NRR, GRR, logo churn, revenue churn, CAC-payback, DSO, gross margin, burn, runway, rule-of-40, pipeline conversion, win rate, MTTR, uptime, deploy-frequency; `saas-metric-library` design §4). XD-06 forbids inventing ad-hoc metric semantics and requires **every** operator KPI to `MEASURES` a `MetricDefinition`. Therefore those three CS KPIs **cannot** be authored compliantly until the metric library gains `MetricDefinition`s for them. **This is a cross-spec dependency gap the user must resolve (OQ-1)** — options: (a) add the three metrics (`metric-health-score`, `metric-csat`, `metric-ticket-sla-compliance`) to `saas-metric-library`'s roster (an amendment to that spec's frozen catalog + its AC-06 expected set — owned by `saas-metric-library`, not creatable here); (b) narrow CS's must-have KPI set to the four retention metrics that exist (NRR/GRR/logo/revenue churn) and defer health/CSAT/ticket-SLA KPIs; (c) allow CS to register those three as `MetricDefinition`s **within this slice** via the ontology registry (contradicts XD-06's "content specs must not invent metric semantics" + `saas-metric-library`'s single-catalog ownership). **Author recommendation: option (a)** — the three are legitimate canonical retention/service metrics that belong in the shared library, and `function-benchmark-scoring` will want their benchmarks. Until OQ-1 closes, FR-05/FR-06 are pinned to the **four existing** metrics; the health/CSAT/ticket-SLA KPIs are **conditional** on OQ-1. | must | XD-06, blueprint Feature Inventory, OQ-1 |

### CS stories + acceptance criteria (XD-10, via story-spec-core)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-08 | **User stories + acceptance criteria** for the CS function are authored through the `story-spec-core` route family (`POST /api/v1/models/:modelId/stories`), **never** by editing `story-spec-core` route/storage code and **never** by writing `UserStory`/`AcceptanceCriterion` rows into the import fixture (those are runtime-registered labels created via the dedicated story route, and story/AC domain fields are top-level Neo4j properties written by `api/src/storage/stories.ts`, `story-spec-core` DD-03). **`:modelId` resolution (Resolves: B-01):** the story route's `:modelId` is the **SaaS-Operator `BusinessModel` root id resolved at seed time** by FR-15 (the `name:"SaaS Operator"` + `attributes.saasOperatorRoot:true` lookup) — this spec **never hard-codes a model id**. **Scoped-activity precondition (Resolves: B-02):** `story-spec-core` scopes each write **through the story's `DESCRIBES_ACTIVITY` activity's membership in `scopedNodeIds(driver, :operatorRoot)`** and rejects any non-member with `404 story_activity_not_in_model` (`api/src/storage/stories.ts:161`). This precondition **holds by construction**: `scopedNodeIds` is `(d:Domain)-[:IN_MODEL]->(m)` **plus its transitive `PART_OF*0..` descendants** (verified `api/src/storage/model-scope.ts:30-33`), and the CS activities loaded by FR-01/FR-02 are `Activity -PART_OF-> UserJourney -PART_OF-> Domain(CS)` where the CS domain is `IN_MODEL` the operator root (foundation FR-03) — so every CS activity is a member of the operator root's scoped set. (The CS activities are authored as **live** nodes under the domain, not inside a pinned `ModuleInstance` snapshot — `story-spec-core` DD-09's fork caveat does not apply.) Each story targets a CS `Activity` (from FR-02) via `DESCRIBES_ACTIVITY`, optionally a `Role` via `STORY_FOR_ROLE`, and carries at least one **Given/When/Then** `AcceptanceCriterion` via `ACCEPTANCE_OF`. Stories cover the primary CS pipeline actions (e.g. "As a CSM, I can see an account's health score so I can trigger a save-play before renewal"). Story idempotency is this spec's own seed-step concern (lookup-by-title-per-activity before create — OQ-3/OQ-5); the story route server-generates ids and does no natural-key MERGE. | must | XD-10, `story-spec-core`, OQ-3 |

### CS SLA definitions (XD-04 governed API, via sla-crud)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-09 | **Support-ticket SLA definitions** are created via the existing **`sla-crud` API** (route **`POST /api/v1/slas`** — the route string, though the file is `sla-crud.ts`; N-02: use `/api/v1/slas`, never the `/api/v1/sla-crud` label — `handleSlaPost`, per `slaCreateRequestSchema` from `@companygraph/shared/schema/kpi-sla`), **never** by editing `sla-crud.ts` (owned by `kpi-okr-governance`, XD-04/XD-08). At minimum a **first-response SLA** and a **resolution SLA** for the Support Ticketing journey, each with `name`, `service_type`, `target_value`, `target_unit`, `measurement_window`, `window_duration`, `compliance_threshold`, and `domain_id` = the CS domain id (resolved at seed time, per FR-15). The POST bodies ride the foundation's **`seedSla` helper** (`saas-operator-foundation` FR-06 — it validates each row against the exported `slaCreateRequestSchema` and POSTs to `/api/v1/slas`), not the `{nodes,edges}` import fixture (SLAs are `:SLA` Neo4j nodes written by the dedicated route). **Idempotency is this spec's own seed-step code (Resolves: B-03):** the `seedSla` helper is a **plain POST** with **no** lookup/dedup step (verified: `api/src/seed/governed-seed-helper.ts` has no lookup/GET/MERGE), so the **lookup-by-`name` before create** guard (skip-if-present against `GET /api/v1/slas`) lives in **this spec's own `seed:customer-success` step**, wrapping the helper — it is **not** inherited from FR-06. A re-run creates no duplicate SLA. | must | XD-04, XD-08, `sla-crud` (`kpi-okr-governance`), OQ-3 |
| FR-10 | **SLA alignment to the Support Ticketing journey/activities** — each SLA definition is aligned to its CS `UserJourney`/`Activity` via the existing **`POST /api/v1/sla-alignments`** route (`kpi-sla-alignment`, `handleSlaAlignmentPost`, target_type `journey`/`activity`), **never** by editing `kpi-sla-alignment.ts`. This links the SLA definitions into the CS process structure so the cockpit's SLA rollup (wave 3) can attribute them to the CS function. | should | XD-04, `kpi-sla-alignment` |

### CS risks (XD-04 governed API, via risk-register)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-11 | **CS risks** are created via the existing **`risk-register` API** (`POST /api/v1/risk-register`, `handleRiskRegisterCreate`, per that route's `createRiskSchema`), **never** by editing `risk-register.ts` (owned by `risk-compliance-change`, XD-04/XD-08). At minimum: a **churn/retention risk** (`risk_type:"strategic"` or `"operational"`), a **support-SLA-breach risk** (`risk_type:"operational"`), and an **onboarding-failure risk**. Each row carries the route's required fields — `name`, `owner`, `domain`, `likelihood` (1–5), `impact` (1–5), `status`, `trend` — and, where a graph entity is the subject, the optional `linked_entity_type`/`linked_entity_id` pointing at the relevant CS `UserJourney`/`Activity` id (resolved at seed time, per FR-15). **Canonical `domain` key (Resolves: C-03 / OQ-2):** `createRiskSchema.domain` is free-text `z.string().min(1)` (`risk-register.ts:10`), not a graph id — every CS risk carries **`domain:"Customer Success"`, the CS `Domain` node's `name` verbatim**. This is the **de-facto shared key the wave-3 `cross-function-exec-rollup` cockpit groups risk rows by**; the design records "`domain` = the function `Domain` node `name` verbatim" as the canonical convention **all six content slices adopt** so the cockpit's `GROUP BY domain` is stable across functions (confirm with `cross-function-exec-rollup` if a stricter shared key emerges). Rows ride the foundation's **`seedRisk` helper** (FR-06). **Idempotency is this spec's own seed-step code (Resolves: B-03):** `seedRisk` is a plain POST with no dedup, and `handleRiskRegisterCreate` server-generates the id with no natural-key MERGE — so the **lookup on `name`+`domain` before insert** (skip-if-present against `GET /api/v1/risk-register?domain=…`) lives in **this spec's own `seed:customer-success` step**, wrapping the helper. A re-run creates no duplicate risk. | must | XD-04, XD-08, `risk-register` (`risk-compliance-change`), OQ-2, OQ-3 |

### CS DDD system mapping (XD-10, via ddd-system-modeling)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-12 | **DDD system mapping** for the CS function is authored through the `ddd-system-modeling` capability route family (`/api/v1/models/:modelId/capabilities*`), **never** by editing its route/storage code. **`:modelId` resolution (Resolves: B-01):** the `:modelId` is the **SaaS-Operator root id resolved at seed time** by FR-15 (never hard-coded). **Scoped-activity precondition (Resolves: B-02):** the capability route resolves an activity's model membership through `scopedNodeIds(driver, :operatorRoot)` — an orphan/out-of-scope activity is `404 not_found` (`api/src/storage/capabilities.ts:397-402`); as with FR-08 this **holds by construction** because CS activities are transitive `PART_OF` descendants of the CS domain that is `IN_MODEL` the operator root (verified `model-scope.ts:30-33`). CS `Activity`s (and, where apt, `UserStory`s) declare the `Capability`s they need via `NEEDS_CAPABILITY` (Activity/UserStory→Capability); each `Capability` is supported by a `System` via `SUPPORTED_BY` (Capability→System, referencing the FR-04 systems) and assigned to a `BoundedContext` via `ASSIGNED_TO_CONTEXT` (at most one per capability). Capabilities model the CS support/health/renewal surface (e.g. *health-signal ingestion*, *health-score computation*, *ticket routing*, *renewal forecasting*). This proves the CS activities map onto the DDD representation. | should | XD-10, `ddd-system-modeling`, OQ-6 |

### Mapping table + seed slice deliverables (XD-04, XD-10)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-13 | **Explicit mapping table** (XD-10) — this spec's design carries a first-class, reviewable table mapping every CS **business action → companygraph label/edge** (e.g. "an onboarding step → `Activity` `PART_OF` the Onboarding `UserJourney`"; "a CSM owns a step → `Role` `EXECUTES` `Activity`"; "an NRR target → `KPI` `MEASURES` `MetricDefinition metric-nrr`"; "a first-response SLA → `:SLA` via `sla-crud` aligned via `sla-alignments`"; "a churn risk → `risk_register` row via `risk-register` API"; "a health-scoring capability → `Capability` `SUPPORTED_BY` `System`"). This table is the primary artifact proving "maps onto the companygraph representation" (the core user ask). | must | XD-10 |
| FR-14 | **Seed slice deliverable** — `shared/seed/saas-operator/customer-success.json` holds **only** the process-graph content (`UserJourney`/`Activity`/CS-specific `Role`/CS-specific `System` node rows + `PART_OF`/`EXECUTES`/`USES_SYSTEM`/`PRECEDES` edge rows), loadable by the foundation's directory-iterating loader via `POST /api/v1/import` with **no** loader edit (the loader discovers the file). It contains **no** lifecycle rows (`BusinessModel`/`ModuleInstance`/`IN_MODEL`/… — rejected `409 model_lifecycle_route_required`, `saas-operator-foundation` FR-09), **no** `MEASURES`/`KPI`/`SLA`/`UserStory`/`AcceptanceCriterion`/`Capability` rows (those are authored via their dedicated governed routes/APIs, not the import fixture). The KPI-linking, SLA, risk, story, and DDD writes ride a **feature-owned seed step** (`seed:customer-success`, an API-driven script) that runs after the import + after the foundation/metric-library/story/DDD registrations exist. | must | XD-04, XD-10, `saas-operator-foundation` FR-07/FR-09 |
| FR-15 | **Seed-preamble id resolution (Resolves: B-01, B-02).** Before any KPI/SLA/risk/story/DDD write, this spec's `seed:customer-success` step resolves two handles **at seed time, never hard-coded**: (i) the **SaaS-Operator `BusinessModel` root id** (`:operatorRoot` / `:modelId`) by the foundation's canonical lookup — `name:"SaaS Operator"` + `attributes.saasOperatorRoot:true` (`OPERATOR_ROOT_NAME`/`OPERATOR_ROOT_MARKER`, `api/src/seed/ensure-operator-root.ts:18-19`; the same handle `seed-saas-operator.ts` computes as `operatorRootId`); and (ii) the **CS `Domain` id** by looking up the operator root's `IN_MODEL` domain carrying `attributes.seedKey:"customer_success"` (foundation FR-03). **The story route (FR-08) and the DDD capability route (FR-12) both take the resolved `:operatorRoot` as their `:modelId`** — this FR is the single place that resolution is threaded; FR-08/FR-12 consume it, they do not re-derive or hard-code it. **Scoped-set guarantee:** because CS `Activity`s are `PART_OF*`-descendants of the CS domain and the CS domain is `IN_MODEL` the operator root, every CS activity is a member of `scopedNodeIds(driver, :operatorRoot)` (verified `api/src/storage/model-scope.ts:22-47`) — so the story-route (`404 story_activity_not_in_model`) and capability-route (`404 not_found`) scope guards accept all CS activities. If a future foundation change made `PART_OF`-descendant activities fall outside `scopedNodeIds`, that would be a cross-spec break surfaced here — but the as-built query includes them, so no OQ is opened. | must | `saas-operator-foundation` FR-01/FR-03, `model-workspace-core` FR-18 |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | **No new store, no new compile-time labels/edges, no new runtime registry label/edge.** This spec adds **zero** entries to `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS` in `shared/src/schema/{nodes,edges}.ts` and registers **zero** new ontology labels/edges — it reuses the core process labels (`UserJourney`/`Activity`/`Role`/`System`), the existing `KPI`/`SLA` machinery, and the `MEASURES`/story/capability edges **already registered** by upstream specs. All CS content lands in Neo4j (under the SaaS-Operator root) + Postgres (risk rows via `risk-register`). | XD-02, XD-04, NFR-01 (`saas-operator-foundation`) |
| NFR-02 | **Idempotency + retail isolation.** Running `seed:customer-success` (import + API-driven step) twice yields zero net new nodes/edges/rows: the import path MERGEs on stable seed ids; the KPI/SLA/risk/story steps each look up by natural key (`name`+`domain_id` for KPIs, `name` for SLAs, `name`+`domain` for risks, title-per-activity for stories) before create. **The idempotency machinery is this spec's own seed-step code, not inherited (Resolves: B-03):** the foundation's FR-06 governed-seed helper (`seedRisk`/`seedSla`/`seedComplianceRule`) is **POST-only with no lookup/dedup**, and there is **no `seedKpi` helper at all** — so every lookup-before-create guard above is authored **inside this spec's `seed:customer-success` step** (wrapping the helper's plain POSTs / calling `POST /api/v1/kpis` directly). No run mutates retail Business Model #1's subgraph, the retail/commercial seed files, or any **other** function's slice. All CS journeys/activities are scoped under the CS domain (which is `IN_MODEL` the SaaS-Operator root via the foundation, FR-03). | XD-01, XD-04 |
| NFR-03 | **Ownership boundaries (XD-04/XD-05/XD-08).** This spec **creates data via governed routes/APIs only** and edits **no** owned-elsewhere file: not `sla-crud.ts`/`kpi-sla-alignment.ts` (`kpi-okr-governance`), not `risk-register.ts`/`change-requests.ts`/`risk-compliance.ts`/`compliance-rules.ts` (`risk-compliance-change`), not `kpi-crud.ts`/`kpi-*` (`kpi-okr-governance`/`kpi-measurement-alignment`), not `story-spec-core`/`ddd-system-modeling` route/storage code, not the metric-library label/edge/view, not `route.ts`/`SURFACES`/`views/index.tsx` (`saas-operator-foundation`), and not the foundation's seed loader (`seed-saas-operator.ts`). A `git diff --stat` after this spec confines source changes to `shared/seed/saas-operator/customer-success.json`, this spec's own seed step script, and this spec's own tests. | XD-04, XD-05, XD-08 |
| NFR-04 | **House rules.** `zod` is the only validation library (all payloads validated by the governed routes' existing zod schemas — this spec adds none); no `tsc` (transpile via `bun run typecheck`); en-US identifiers throughout (seed ids/keys/attribute names); server binds loopback `127.0.0.1:8787`; auth via the central router gate + `api/src/auth/` only (this spec adds **zero** new RBAC permission strings — all writes ride existing `node:write`/`kpi:write`/`sla:write`/`risk:write`/`query:read`/`model:write` mappings); all REST under `/api/v1/`. | CLAUDE.md |
| NFR-05 | **No PWA surface.** This spec adds **no** new view and touches **no** `pwa/` file (blueprint: content specs surface through existing Explorer / `#/business/functions` / `#/exec`). The Platforms & Input Modes and Native Conflicts tables below are therefore the explicit none-rows: no gesture/keyboard/pointer handling is introduced. | Blueprint (content specs add no new views), XD-11 |

## UI/UX Requirements

**No views owned by this spec.** Per the blueprint, the six wave-2 content specs
**add no new views**; CS content is surfaced by existing consumers — the Explorer
(graph drill-down), `saas-operator-foundation`'s `FunctionMap`
(`#/business/functions`, which lists the six function domains with descendant
counts — CS's journeys/activities appear there once seeded), and the wave-3
`OperatorCockpit` (`#/exec/operator`) / `BenchmarkReport` (`#/business/benchmarks`).
This spec touches **no** `pwa/` file and registers **no** route (routes are
sole-owned by `saas-operator-foundation`, XD-05). The blueprint UX-* allowances
(view states, tokens-only styling, a11y, input modes, navigation) apply to the
**view-owning** specs; this spec has no view to which they attach and therefore
records no UX-* conformance rows (n/a — no view surface).

## Scope Boundaries

**In scope:**
- Five CS `UserJourney`s (onboarding, health scoring, renewals, churn-save,
  support ticketing) + their `Activity`s, `PART_OF`/`PRECEDES` structure, under
  the pre-existing `Customer Success` domain (seedKey `customer_success`).
- `Role` assignments (`EXECUTES`) — referencing shared-catalog roles by name and
  adding CS-specific roles within this slice.
- `System` usage (`USES_SYSTEM`) — referencing shared-catalog systems by id and
  adding CS-specific systems within this slice.
- CS KPIs via `POST /api/v1/kpis`, each `MEASURES` a canonical `MetricDefinition`
  (pinned to the four existing retention metrics until OQ-1 closes on
  health/CSAT/ticket-SLA).
- CS user stories + Given/When/Then ACs via the `story-spec-core` route family.
- Support-ticket SLA definitions via the `sla-crud` API + SLA alignments via the
  `sla-alignments` route.
- CS risks via the `risk-register` API.
- DDD system mapping via the `ddd-system-modeling` capability route family.
- The `customer-success.json` seed slice + a feature-owned API-driven seed step +
  the explicit mapping table (in design).

**Out of scope (owner named):**
- Any new **view** / route registration / `pwa/` file → `saas-operator-foundation`
  (XD-05) owns route files; wave-3 specs own the cockpit/benchmark views.
- The `MetricDefinition` catalog + `MEASURES` edge **definition** → `saas-metric-library`
  (this spec only *links* CS KPIs to existing definitions; **adding** health/CSAT/
  ticket-SLA definitions is OQ-1, owned there).
- KPI CRUD route code, KPI measurement/alignment code → `kpi-okr-governance` /
  `kpi-measurement-alignment` (this spec only *calls* `POST /api/v1/kpis` +
  `sla-alignments`).
- `sla-crud.ts` / SLA route code → `kpi-okr-governance` (this spec only *calls*
  `POST /api/v1/slas`).
- `risk-register.ts` / risk route + Postgres schema → `risk-compliance-change`
  (this spec only *calls* `POST /api/v1/risk-register`).
- `story-spec-core` / `ddd-system-modeling` route + storage code → those specs
  (this spec only *calls* their routes).
- The SaaS-Operator root, the six function `Domain` roots, the shared
  System/Persona/Role catalog, the directory-iterating loader, and the
  governed-API seed helper mechanism → `saas-operator-foundation` (consumed,
  never re-implemented or edited).
- The **other five** function slices (marketing, sales, finance-accounting,
  product-delivery, platform-ops) → their own wave-2 content specs.
- Cross-function aggregation / benchmark scoring over CS content → wave-3
  `cross-function-exec-rollup` / `function-benchmark-scoring`.

## Acceptance Criteria

<!-- Every AC traces to at least one FR. This is a server/data content spec:
     all ACs are server (bun test + Neo4j/Postgres) or CLI. No pwa/ ACs
     (NFR-05 — no view). Verification is a test path or a curl/CLI repro with
     an observable outcome. -->

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | After `seed:customer-success`, the CS `Domain` (seedKey `customer_success`, `IN_MODEL` the SaaS-Operator root) contains exactly the five CS `UserJourney`s (onboarding, health scoring, renewals, churn-save, support ticketing), each `PART_OF` the CS domain; a re-run adds zero journeys (MERGE-on-id) (FR-01, NFR-02) | server (bun test + Neo4j) | `api/__tests__/customer-success-journeys.integration.test.ts` |
| AC-02 | Each CS journey has its FR-02 activities (`Activity` `PART_OF` `UserJourney`), with `PRECEDES` ordering present where specified; the exact activity set matches the design-frozen roster (no missing/extra) (FR-02) | server (bun test + Neo4j) | `api/__tests__/customer-success-activities.integration.test.ts` |
| AC-03 | Every CS activity has at least one `Role` `EXECUTES` it; CS-specific roles are created as reference `Role` nodes (MERGE-on-seed-id, no duplicate on re-run) and shared-catalog roles are referenced by name/seedKey, not duplicated (FR-03, NFR-02) | server (bun test + Neo4j) | `api/__tests__/customer-success-roles.integration.test.ts` |
| AC-04 | CS activities that use a system link `Activity` `USES_SYSTEM` `System`; shared-catalog systems (MOMS/Helm/CRM/…) are referenced by their stable seed id (not re-created), and any CS-specific system carries a valid `systemKind`; a re-run adds no duplicate system (FR-04, NFR-02) | server (bun test + Neo4j) | `api/__tests__/customer-success-systems.integration.test.ts` |
| AC-05 | CS KPIs are created via `POST /api/v1/kpis` with `domain_id` = the CS domain id; each of the **existing-metric** KPIs (NRR, GRR, logo churn, revenue churn) exists exactly once (lookup-before-create — a re-run creates no duplicate KPI) (FR-05, NFR-02) | server (bun test + Neo4j) | `api/__tests__/customer-success-kpis.integration.test.ts` |
| AC-06 | **Registration precondition (Resolves: C-02):** the `seed:customer-success` step attempts the `MEASURES` writes only after the `MEASURES` edge type + `KPI→MetricDefinition` endpoint pair are **registered** (by `saas-metric-library`'s `ensureMeasuresEdgeType`, run in its own `seed:saas-metric-library` step); a run **before** that registration **fails loudly** (the `POST /api/v1/edges` write returns an unknown-type / `edge_endpoint_label_mismatch` error the step surfaces as a hard failure), never silently skipping. Given the registration exists, each CS KPI `MEASURES` exactly one `MetricDefinition` by stable seed id (NRR→`metric-nrr`, GRR→`metric-grr`, logo churn→`metric-logo-churn`, revenue churn→`metric-revenue-churn`) via `POST /api/v1/edges`; the write is accepted (not `409 model_lifecycle_route_required`); a second `MEASURES` from the same KPI is rejected `409 kpi_metric_already_linked` (FR-06) | server (bun test + Neo4j) | `api/__tests__/customer-success-kpi-measures.integration.test.ts` |
| AC-07 | **OQ-1 gate**: the health-score / CSAT / ticket-SLA-compliance KPIs are authored **iff** OQ-1 resolves to option (a) and `saas-metric-library` has published `metric-health-score`/`metric-csat`/`metric-ticket-sla-compliance`; the test asserts either (a-resolved) those three KPIs each `MEASURES` their new metric, or (deferred) they are absent and no ad-hoc `MetricDefinition` was registered by this spec (`GET /api/v1/ontology/node-labels` unchanged by this spec) (FR-07) | server (bun test + Neo4j) + CLI | `api/__tests__/customer-success-kpi-gap.integration.test.ts`; manual: `git diff shared/src/schema` — expect no additions, and this spec registers no new ontology label |
| AC-08 | CS user stories are created via `POST /api/v1/models/:modelId/stories` where `:modelId` is the **resolved SaaS-Operator root id** (FR-15 lookup — the test asserts the resolved-modelId path, **not** a hard-coded id) (Resolves: B-01), targeting CS activities (`DESCRIBES_ACTIVITY`); the write is **accepted** (not `404 story_activity_not_in_model`), proving each CS activity is a member of `scopedNodeIds(operatorRoot)` (Resolves: B-02); each story carries ≥1 Given/When/Then `AcceptanceCriterion` (`ACCEPTANCE_OF`); the seed slice fixture contains **no** `UserStory`/`AcceptanceCriterion` rows (they ride the story route, not import) (FR-08, FR-14, FR-15) | server (bun test + Neo4j) | `api/__tests__/customer-success-stories.integration.test.ts` |
| AC-09 | **(FR-09 `must` — split from alignment per N-01):** Support-ticket SLA definitions (first-response + resolution) are created via `POST /api/v1/slas` with `domain_id` = the CS domain id and appear in `GET /api/v1/slas`; `sla-crud.ts` is unedited; a re-run creates no duplicate SLA (this spec's own lookup-by-`name` guard wrapping `seedSla` — B-03) (FR-09, NFR-02, NFR-03) | server (bun test + Neo4j) + CLI | `api/__tests__/customer-success-sla.integration.test.ts`; manual: `git diff --stat api/src/routes/sla-crud.ts` — expect no changes |
| AC-10 | CS risks (churn/retention, support-SLA-breach, onboarding-failure) are created via `POST /api/v1/risk-register` with `domain:"Customer Success"` and appear in `GET /api/v1/risk-register?domain=Customer%20Success`; where a graph entity is the subject, `linked_entity_id` points at a real CS journey/activity id; `risk-register.ts` is unedited; a re-run creates no duplicate risk (lookup-by-name+domain) (FR-11, NFR-02, NFR-03) | server (bun test + Postgres) + CLI | `api/__tests__/customer-success-risks.integration.test.ts`; manual: `git diff --stat api/src/routes/risk-register.ts` — expect no change |
| AC-11 | CS DDD mapping: CS activities/stories declare `NEEDS_CAPABILITY` capabilities via the `ddd-system-modeling` capability route at `/api/v1/models/:modelId/capabilities*` where `:modelId` is the **resolved SaaS-Operator root id** (FR-15 — asserted resolved, not hard-coded) (Resolves: B-01); the capability write **accepts** the CS activity (not `404 not_found` for out-of-scope), proving CS activities are in `scopedNodeIds(operatorRoot)` (Resolves: B-02); each capability is `SUPPORTED_BY` a CS/shared system and (where set) `ASSIGNED_TO_CONTEXT` a bounded context; the DDD route/storage code is unedited (FR-12, FR-15, NFR-03) | server (bun test + Neo4j) + CLI | `api/__tests__/customer-success-ddd.integration.test.ts`; manual: `git diff --stat` — expect no change under `api/src/routes` for DDD/story/kpi/sla/risk route files |
| AC-12 | The `customer-success.json` seed slice loads via the foundation's directory-iterating loader (`POST /api/v1/import` → `realImport`) with **no** loader edit; it contains **only** non-lifecycle process rows (no `MEASURES`/`KPI`/`SLA`/`UserStory`/`AcceptanceCriterion`/`Capability`/lifecycle rows) — a hand-constructed fixture with a lifecycle row is rejected `409 model_lifecycle_route_required` with nothing written (FR-14, `saas-operator-foundation` FR-09) | server (bun test + Neo4j) | `api/__tests__/customer-success-seed-load.integration.test.ts` |
| AC-13 | The full `seed:customer-success` run (import + API-driven step) is idempotent and retail-isolated: running twice yields zero net new nodes/edges/rows; a pre/post `/api/v1/stats` diff for the retail root is zero across the run; no other function slice is mutated (FR-14, NFR-02) | server (bun test + Neo4j + Postgres) | `api/__tests__/customer-success-seed-idempotency.integration.test.ts` |
| AC-14 | **(Resolves: C-04 — strengthened gate.)** The design's **mapping table** (FR-13) is present and complete: for every CS business-action category (journey, activity, role, system, KPI↦metric, story/AC, SLA, risk, DDD capability) each row names **(a)** the exact companygraph **label/edge**, **(b)** the governed **route/API** used, **and (c)** the expected **error code** on the failure/idempotency path (e.g. `409 kpi_metric_already_linked`, `409 model_lifecycle_route_required`, `404 story_activity_not_in_model`) — so a reviewer **and the traceability script** can mechanically trace each seed/API artifact back to a row (FR-13, XD-10) | doc review | manual: open `.claude/specs/customer-success-process-model/design.md` — expect a mapping-table row per FR-01..FR-12 artifact class, each naming label/edge + route/API + error code |
| AC-15 | Transpile is clean and ownership is respected: `bun run typecheck` exit 0; no compile-time schema arrays edited; no new RBAC permission string; no owned-elsewhere route/loader/view file changed (NFR-01, NFR-03, NFR-04) | CLI | `bun run typecheck` exit 0; manual: `git diff --stat` — expect changes confined to `shared/seed/saas-operator/customer-success.json`, this spec's seed-step script, and this spec's tests; no change under `shared/src/schema`, `api/src/routes/{sla-crud,kpi-sla-alignment,risk-register,kpi-crud}.ts`, `api/scripts/seed-saas-operator.ts`, `pwa/src/{route.ts,views/index.tsx}` |
| AC-16 | **(FR-10 `should` — split from AC-09 per N-01 so a deferred `should` cannot drag the FR-09 `must` AC red.)** Each SLA definition is aligned to its CS journey/activity via `POST /api/v1/sla-alignments` (target_type `journey`/`activity`); `kpi-sla-alignment.ts` is unedited. If FR-10 is deferred, this AC alone is deferred — AC-09 stays green independently (FR-10, NFR-03) | server (bun test + Neo4j) + CLI | `api/__tests__/customer-success-sla-alignment.integration.test.ts`; manual: `git diff --stat api/src/routes/kpi-sla-alignment.ts` — expect no changes |

## Platforms & Input Modes

This spec is a **server/data content slice** — it touches **no** `pwa/` file,
introduces **no** view, gesture, keyboard handler, or pointer interaction
(NFR-05). All work is authored via governed REST APIs + a seed fixture and is
exercised at the server layer (bun test + Neo4j/Postgres) and CLI. The table is
the explicit none-surface record.

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| (no PWA surface — server/data content only) | no | no | no | no | authored via governed REST APIs + seed fixture; verified via bun test + curl |

## Native Conflicts

This spec introduces **no** gesture, scroll-container, focus-trap, or
keyboard-accelerator handling — it ships no `pwa/` code. Explicit none-row:

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| (none) | n/a | n/a |

## Dependencies

- **saas-operator-foundation** (wave 1a — the barrier): the "SaaS Operator"
  `BusinessModel` root (found by `name:"SaaS Operator"` + `attributes.saasOperatorRoot:true`,
  its id discovered at seed time — FR-01/FR-15); the **`Customer Success` function
  `Domain`** (seedKey `customer_success`, resolved by lookup — FR-03) this slice
  attaches journeys under; the shared **System/Role catalog** (MOMS, Helm, CRM,
  data-warehouse, PagerDuty, shared roles — FR-04/FR-05) referenced by id/name;
  the **directory-iterating seed loader** (`seed-saas-operator.ts` → `POST /api/v1/import`
  → `realImport`, FR-07) that discovers `customer-success.json` with no loader
  edit; the **governed-API seed helper** (FR-06 — `seedRisk`/`seedSla`, a
  **POST-only** round-trip with **no** lookup/dedup and **no `seedKpi`**; this
  spec wraps it with its own lookup-before-create guards, B-03) this spec's
  SLA/risk rows ride.
- **saas-metric-library** (wave 1b): the canonical `MetricDefinition` catalog
  (stable seed ids `metric-nrr`/`metric-grr`/`metric-logo-churn`/`metric-revenue-churn`
  used by FR-06; the health/CSAT/ticket-SLA gap is OQ-1) and the **`MEASURES`**
  edge type (KPI→MetricDefinition, `∉ LIFECYCLE_EDGES`, accepted by `POST /api/v1/edges`).
- **graph-core** (`POST /api/v1/import` → `realImport` with the lifecycle guard;
  `POST /api/v1/edges` `handleEdgePost`; `POST /api/v1/nodes/:label`; `POST /api/v1/query/cypher`
  `query:read`): the seed-slice load path, the `MEASURES`/`USES_SYSTEM`/`EXECUTES`/`PART_OF`
  edge writes, and the seed-time id-resolution reads.
- **kpi-okr-governance** (`POST /api/v1/kpis` `handleKpiPost` → `:KPI` node with
  `domain_id`; `POST /api/v1/slas` `handleSlaPost` → `:SLA`; `POST /api/v1/sla-alignments`
  `handleSlaAlignmentPost`; `slaCreateRequestSchema` from `@companygraph/shared/schema/kpi-sla`):
  the governed KPI + SLA authoring paths (called, never edited — FR-05/FR-09/FR-10).
- **risk-compliance-change** (`POST /api/v1/risk-register` `handleRiskRegisterCreate`,
  `createRiskSchema` — Postgres `risk_register` table with `domain`, `likelihood`,
  `impact`, `status`, `trend`, `linked_entity_type`/`linked_entity_id`): the
  governed risk authoring path (called, never edited — FR-11).
- **story-spec-core** (`POST /api/v1/models/:modelId/stories*` route family;
  `UserStory`/`AcceptanceCriterion` runtime labels + `DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE`/`ACCEPTANCE_OF`
  edges; story/AC top-level Neo4j properties written by `api/src/storage/stories.ts`):
  CS stories/ACs authored via its route (never via the import fixture, never edited — FR-08).
- **ddd-system-modeling** (`/api/v1/models/:modelId/capabilities*`; `Capability`
  label + `NEEDS_CAPABILITY`/`SUPPORTED_BY`/`ASSIGNED_TO_CONTEXT` edges; `BoundedContext`):
  CS DDD mapping authored via its capability route (called, never edited — FR-12).
- **system-augmentation-model** (`systemKind` on `System` nodes): any CS-specific
  System carries a valid `systemKind` (FR-04).
- **model-workspace-core** (DEC-01 reference-node sharing; `IN_MODEL` model
  scoping): CS-specific `Role`/`System` are model-independent reference nodes;
  the CS domain is `IN_MODEL`-scoped by the foundation.

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | **OQ-1 (BLOCKING — needs the user): three CS metrics are missing from the metric library.** The blueprint's CS KPI list names **health score, CSAT, ticket SLA compliance**, but `saas-metric-library`'s **frozen 20-metric roster has none of them** (verified against its design §4). XD-06 forbids inventing ad-hoc metric semantics and requires every operator KPI to `MEASURES` a `MetricDefinition`, so those three CS KPIs **cannot** be authored compliantly today. **Options:** (a) **`saas-metric-library` adds `metric-health-score`/`metric-csat`/`metric-ticket-sla-compliance`** to its roster (amends its frozen catalog + AC-06 set — an edit **owned by that spec**, not creatable here); (b) **narrow CS's must-have KPIs to the four existing retention metrics** (NRR/GRR/logo/revenue churn) and defer health/CSAT/ticket-SLA; (c) **CS registers the three `MetricDefinition`s within this slice** (contradicts XD-06 + the metric library's single-catalog ownership — rejected). **Author recommendation: (a)** — they are legitimate canonical retention/service metrics that belong in the shared library and `function-benchmark-scoring` will want their benchmarks. | Determines whether FR-05/FR-06 author 4 KPIs or 7, whether AC-07 is "authored" or "deferred", and whether a cross-spec edit to `saas-metric-library` is scheduled. FR-05/FR-06 are **pinned to the four existing metrics** until OQ-1 closes. | **User decision required.** Recommend (a) + schedule the three-metric addition in `saas-metric-library` (or a follow-up). If deferred (b), AC-07 asserts absence + no ad-hoc registration. |
| 2 | **OQ-2 (C-03): risk-register `domain` is a free-text string, not the CS domain graph id — and it is a de-facto cross-spec shared key.** `risk-register`'s `createRiskSchema.domain` is `z.string().min(1)` (`risk-register.ts:10` — the label the Postgres `risk_register.domain` column stores + the risk aggregations group by), **not** a graph `Domain` id. FR-11 uses `domain:"Customer Success"` (the CS `Domain` node `name` verbatim) and puts the graph journey/activity id in the optional `linked_entity_id`. **The risk here is cross-spec convention (C-03):** this string is the key the wave-3 `cross-function-exec-rollup` cockpit will `GROUP BY domain` on, and nothing structurally forces the other five function slices to adopt the same "<function `Domain` node `name`> verbatim" rule. | Determines the exact `domain` string every CS risk row carries + whether the cockpit's `GROUP BY domain` is stable across all six functions. Low blast radius per-slice, but a convention drift across slices breaks the rollup. | Design-time; **author decision: `domain` = the function `Domain` node `name` verbatim** (`"Customer Success"` here), **recorded in the design as the canonical convention all six content slices must adopt**. Confirm with `cross-function-exec-rollup` if it needs a stricter shared key (e.g. `seedKey` slug) instead of the display name. |
| 3 | **OQ-3 (B-03): all four idempotency guards (KPI, SLA, risk, story) are THIS spec's own seed-step code — not inherited from the foundation.** Verified: the foundation's governed-seed helper (`api/src/seed/governed-seed-helper.ts`) exposes `seedRisk`/`seedSla`/`seedComplianceRule` as **plain POSTs with no lookup/dedup**, and there is **no `seedKpi` helper at all**; `handleKpiPost`, `handleSlaPost`, and `handleRiskRegisterCreate` all server-generate ids and do a plain `CREATE`/INSERT with no natural-key MERGE. So the re-run "creates no duplicate" behavior in FR-05/FR-08/FR-09/FR-11/NFR-02 is **machinery this spec builds inside `seed:customer-success`**, wrapping the helper's POSTs (or calling `POST /api/v1/kpis` directly). Open design questions: (a) is `(name, domain_id)` an acceptable natural key for KPIs (a CS "NRR" KPI vs a same-named KPI in another function's domain — disambiguated because `domain_id` differs)? (b) SLA lookup by `name` alone vs `name`+`domain_id`? (c) risk lookup by `name`+`domain`? (d) story lookup by title-per-activity? Editing any of `kpi-crud.ts`/`sla-crud.ts`/`risk-register.ts`/story storage to MERGE is owned elsewhere (XD-04) and is **not** taken. | Determines the four idempotency guards (FR-05/09/11 + FR-08 story) + AC-05/09/10/08/13 re-run assertions. Bounded — all four guards live in this spec's own seed script; no owned-elsewhere edit. | Design-time; **author leans:** KPI `(name, domain_id)`; SLA `name` (SLA `name`s are globally unique per the support-ticket naming); risk `name`+`domain`; story title-per-`DESCRIBES_ACTIVITY`-activity. The design **owns and names all four guards** (they are NOT inherited from FR-06). |
| 4 | **OQ-4: seed-step ownership + ordering.** The `{nodes,edges}` import fixture must load **before** the API-driven step (KPIs need the CS domain + activities to exist; `MEASURES` needs the metric library seeded; stories need activities; SLA/risk need the domain). FR-14 proposes a **feature-owned** `seed:customer-success` script that runs import then the API step, matching `saas-metric-library`'s self-owned `seed:*` precedent (its OQ-4 option (ii)). Confirm this feature owns its own seed step (vs. relying on the foundation loader alone, which only does the `{nodes,edges}` import and cannot make the KPI/SLA/risk/story/DDD API calls). | Determines whether this spec ships its own `api/scripts/seed-customer-success.ts` + a `package.json` script, and the run-order contract. | Design-time; **author leans a feature-owned `seed:customer-success` step** (import via the foundation loader's route + an API-driven step for KPI/SLA/risk/story/DDD), inside this spec's ownership (NFR-03). |
| 5 | **OQ-5: story authoring — hand-authored vs. bootstrap-derived.** `story-spec-core` offers both a manual `POST /stories` path and a `bootstrap` that derives one story + starter AC per activity. Should CS stories be **hand-authored** (curated, domain-meaningful Given/When/Then) or **bootstrap-derived** then edited? | Determines the FR-08 authoring mechanism + the story roster's richness. | Design-time; **author leans hand-authored** for the primary CS pipeline stories (curated, reviewable), optionally seeding starter ACs via bootstrap for coverage. Bounded. |
| 6 | **OQ-6: DDD depth (`should`).** FR-12 marks the DDD capability mapping `should`. How many capabilities/bounded-contexts does CS need to satisfy XD-10's "DDD system mapping" — a representative subset (health ingestion, ticket routing, renewal forecasting) or exhaustive per-activity coverage? | Determines the FR-12 capability roster size + AC-11's expected set. | Design-time; **author leans a representative subset** covering the distinctive CS capabilities, not exhaustive per-activity. XD-10 requires the mapping be *proven*, not complete. |
