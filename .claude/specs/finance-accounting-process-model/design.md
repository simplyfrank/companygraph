---
feature: "finance-accounting-process-model"
created: "2026-07-06"
author: "spec-author"
status: "draft"
size: "medium"
---

# Design: finance-accounting-process-model

## 1. Overview

This design realizes the **Finance & Accounting function** of the SaaS-Operator
model as **data only** — no new store, label, edge type, route, or view (NFR-01,
NFR-06). Three delivery channels carry the content, all pre-existing and
governed:

1. **Neo4j process structure** (journeys, activities, roles, systems + their
   `PART_OF`/`PRECEDES`/`EXECUTES`/`USES_SYSTEM` edges) lands as a discovered
   fixture `shared/seed/saas-operator/finance-accounting.json`, loaded by the
   foundation's directory-iterating loader (`seed:saas-operator` →
   `POST /api/v1/import` → `realImport`) with **zero loader edit** (FR-01..FR-04,
   NFR-04).
2. **KPIs + stories + KPI→metric links + DDD tags** are created **through the
   governed REST routes** (`POST /api/v1/kpis`, the story routes,
   `linkKpiToMetric`) by a self-owned seed script, because those live in
   Postgres / need a resolved model-scope / need a cardinality-guarded helper —
   they cannot ride the `{nodes,edges}` import (FR-05..FR-08, FR-12).
3. **Financial + compliance risks** are created **only** via the governed
   risk-register / compliance-rules APIs by a second self-owned, idempotent seed
   script that imports the foundation helpers `seedRisk` / `seedComplianceRule`
   (FR-09..FR-11).

Everything scopes under the SaaS-Operator `BusinessModel` **root** (resolved by
lookup via `ensureOperatorRoot`, never hard-coded) and under the pre-seeded
`Finance & Accounting` `Domain` (resolved by `seedKey = finance_accounting`).
The XD-10 mapping table (§4) is the authoritative index the fixtures + scripts
are built against.

**Architecture-touching decision map:**

| Decision | Resolution | Section |
|----------|------------|---------|
| DD-01 | Process structure via `finance-accounting.json` import slice | §5, §6 |
| DD-02 | KPIs + `MEASURES` grounding via a self-owned `seed-finance-graph.ts` script | §7 |
| DD-03 | Stories/ACs via the story routes under the resolved **root** model id | §7.3 |
| DD-04 | Risks + compliance via a self-owned idempotent `seed-finance-risks.ts` script | §8 |
| DD-05 | DDD mapping via the `system.attributes.boundedContext` **tag** (OQ-4 (b)) | §9 |
| DD-06 | OQ resolutions (OQ-1..OQ-4) frozen | §3 |

## 2. Verified interfaces (read from source, not assumed)

Every dependency interface named below was read from the codebase before this
design was frozen:

| Symbol / route | Location | Contract used |
|----------------|----------|---------------|
| `ensureOperatorRoot(driver)` | `api/src/seed/ensure-operator-root.ts:48` | returns `ModelRead` (root id) — matches `name:"SaaS Operator"` + `attributes.saasOperatorRoot:true` |
| `ensureFunctionDomains(driver, rootId)` | `api/src/seed/ensure-function-domains.ts` | returns `Map<seedKey, domainId>`; `finance_accounting` is a member |
| `seedSaasOperator(base?)` | `api/scripts/seed-saas-operator.ts` | ensures scaffold, then imports every `*.json` in `shared/seed/saas-operator/` — zero edit to add a slice |
| `realImport` behind `POST /api/v1/import` | `api/src/routes/import.ts` | `{nodes:[{id,label,name,description,attributes}], edges:[{id,type,fromId,toId,attributes}]}`; lifecycle guard rejects `BusinessModel`/`…Module…`/`ModuleInstance` + `IN_MODEL`/`HAS_VERSION`/`INSTANTIATES`/`INSTANCE_IN`/`FORKED_FROM` with `409 model_lifecycle_route_required` |
| `EDGE_ENDPOINTS` | `shared/src/schema/edges.ts:30-38` | `PART_OF`:[UserJourney→Domain, Activity→UserJourney], `EXECUTES`:[Role→Activity], `USES_SYSTEM`:[Activity→System], `PRECEDES`:[Activity→Activity] |
| shared catalog | `api/src/seed/saas-operator-catalog.ts` | Systems incl. `stripe`, `data_warehouse`; Role `revenue_operations`; Persona `finance_owner` |
| `handleKpiPost` `POST /api/v1/kpis` | `api/src/routes/kpi-crud.ts:27` | `kpiCreateRequestSchema` (`name,category,unit,target_value,target_direction,measurement_frequency`, opt `description,owner_role,domain_id`); returns **`200`** `{ id, ...kpi }` |
| `linkKpiToMetric(baseUrl,kpiId,metricId)` | `api/src/seed/link-kpi-metric.ts` | POSTs `{type:"MEASURES",fromId:kpiId,toId:metricId}`; pre-checks cardinality → `KpiMetricAlreadyLinkedError`/`kpi_metric_already_linked` on a second link |
| metric catalog | `shared/seed/saas-metric-library/metrics.json` | `metric-mrr,-arr,-dso,-gross-margin,-burn,-runway` present; **no** cloud-cost-per-tenant (OQ-1) |
| story routes | `api/src/routes/stories.ts:186`, `shared/src/schema/story-spec.ts` | `POST /api/v1/models/:modelId/stories` (`storyCreateSchema`: `persona,action,benefit,activityId`, opt `roleId`); AC at `POST …/stories/:storyId/acceptance-criteria` (`acCreateSchema`: `given,when,then`, opt `ordinal`); out-of-scope activity → `404 story_activity_not_in_model` |
| `handleRiskRegisterCreate` `POST /api/v1/risk-register` | `api/src/routes/risk-register.ts:7` | `createRiskSchema` (`name,owner,domain,likelihood 1-5,impact 1-5,status,trend`, opt `description,mitigation_plan,category,risk_type,linked_entity_type,linked_entity_id`); `risk_type` enum incl. `financial`,`compliance` |
| `handleRiskRegisterList` `GET /api/v1/risk-register` | `api/src/routes/risk-register.ts:44` | query filters `owner,domain,status,category,risk_type,linked_entity_type,linked_entity_id` — **no `name` filter** (dedup matches `name` in TS) |
| compliance route | `api/src/router.ts:590-591`, `compliance-rules.ts` | `POST /api/v1/compliance/rules` → `handleCreateComplianceRule`; `complianceRuleSchema` (`name,rule_dsl,rule_type,category,severity,enabled,actions`, opt `description,schedule`) |
| `seedRisk` / `seedComplianceRule` | `api/src/seed/governed-seed-helper.ts:95,108` (foundation) | raw POSTs to `/api/v1/risk-register` and `/api/v1/compliance/rules`; **no dedup** — this spec wraps a lookup-before-create layer |
| DDD `setContext` | `api/src/routes/capabilities.ts:147`, `api/src/storage/capabilities.ts:512` | `PUT models/:modelId/capabilities/:capabilityId/context` maps **`Capability`→`BoundedContext`** (`ASSIGNED_TO_CONTEXT`); no `System→BoundedContext` path exists; `BoundedContext` nodes are created only via `POST /api/v1/ontology/import` |

## 3. Open-question resolutions (OQ-1..OQ-4)

The requirements review approved four design-time OQs. This design freezes them:

### 3.1 OQ-1 — Cloud-Cost-per-Tenant metric (cross-spec flag) — DD-06a

**Confirmed:** `shared/seed/saas-metric-library/metrics.json` has 20 metrics and
**no** `metric-cloud-cost-per-tenant`. XD-06 forbids inventing an ad-hoc metric
here.

**Resolution (author recommendation (b), pending user):** flag `saas-metric-library`
to add a canonical `metric-cloud-cost-per-tenant`. Until it lands, the FinOps
`Cloud Cost per Tenant` KPI is created **without** a `MEASURES` grounding, and
its grounding is gated behind **AC-15 (blocked-on-OQ-1)** — the other six finance
KPIs (MRR/ARR/DSO/gross-margin/burn/runway) all have existing metrics and are
grounded now (AC-05). **This spec does not add the metric** (ownership stays with
`saas-metric-library`). See §7.2 for how the FinOps KPI is created ungrounded but
grounding-ready (the `linkKpiToMetric` call is guarded by a metric-exists lookup;
absent metric → skip + warn, present metric → link).

### 3.2 OQ-2 — risk vs. compliance modeling — DD-06b

Finance compliance obligations are modeled as **`risk-register` rows with
`risk_type:"compliance"`** for descriptive obligations (rev-rec/ASC-606 error,
tax mis-filing exposure), and as **`compliance-rules` rows** only where an
**evaluable** rule genuinely fits (a `rule_dsl` + `actions` are meaningful — e.g.
a tax-filing-deadline control). `complianceRuleSchema` **requires** `rule_dsl`
(min 1) and `actions` (a JSON-stringified action array), so a purely descriptive
obligation belongs in the risk register, not the rule table. The frozen roster
(§8.1) assigns each obligation to exactly one path.

### 3.3 OQ-3 — idempotency of the risk/compliance seed script — DD-06c

**Lookup-before-create keyed on `name` (+ `domain`, `risk_type`)** (option (a)).
`POST /api/v1/risk-register` server-generates the id and does no MERGE, so a
naive re-run duplicates. Before each `seedRisk`, the script calls
`GET /api/v1/risk-register?domain=Finance%20%26%20Accounting&risk_type=<t>` and
skips if a row with the same `name` is already present (the list route has no
`name` filter — see §2 — so `name` is matched in TS over the filtered set). For
compliance rows, the script calls `GET /api/v1/compliance/rules`, filters in TS
on `name`, and skips if present. This is entirely client-side; **no**
owned-elsewhere code is edited (§8.2).

### 3.4 OQ-4 — DDD write path — DD-05

**Confirmed mismatch (requirements C-01):** the DDD surface maps
**`Capability`→`BoundedContext`** (`setContext`), not `System→BoundedContext`,
and `BoundedContext` nodes are created only via `POST /api/v1/ontology/import`
(`ontology-import.ts:135`, `MERGE (bc:BoundedContext {id})`).

**Resolution: option (b) — the lighter `system.attributes.boundedContext` tag.**
Each slice-added finance `System` (and, for shared systems, a per-slice
annotation) is tagged with a `boundedContext` attribute value naming its context
(`Billing & Payments`, `General Ledger / RevRec`, `Tax`, `FinOps / Cost`). This
is a plain node attribute already carried through the import — **no** DDD route,
no `ontology/import` of `BoundedContext` nodes, no `Capability` authoring, no
owned-elsewhere edit. Rationale: FR-12 is `should`; option (a) would require this
content spec to (i) create `BoundedContext` nodes via `ontology/import` (an
ontology-registry write outside a content-slice's remit) and (ii) author finance
`Capability`s + `setContext` calls — materially more scope than a `should`
mapping warrants. The mapping table (§4) records the tag path. If the user
prefers full DDD, option (a) is documented in §12 as the rejected-for-now
alternative and can be promoted without touching this design's other sections.

## 4. Mapping Table — FROZEN (XD-10 core deliverable; FR-13, AC-14)

One row per finance business action → companygraph representation. This is the
authoritative index; the fixture (§6) and scripts (§7, §8) create exactly these
elements, and AC-14 asserts 1:1 element↔row coverage.

### 4.1 Journeys (`UserJourney`, `PART_OF`→ `finance_accounting` Domain)

| Business action | seedKey | Route |
|-----------------|---------|-------|
| Subscription Billing journey | `fin-jrny-subscription-billing` | import |
| Invoice Run journey | `fin-jrny-invoice-run` | import |
| Dunning journey | `fin-jrny-dunning` | import |
| Revenue Recognition journey | `fin-jrny-rev-rec` | import |
| Tax journey | `fin-jrny-tax` | import |
| FinOps / Cloud-Cost-per-Tenant journey | `fin-jrny-finops` | import |

### 4.2 Activities (`Activity`, `PART_OF`→journey, `PRECEDES`→next) — FROZEN roster (FR-02, AC-02)

Each row is an ordered chain; `PRECEDES` links consecutive activities (acyclic,
single linear chain per journey).

| Journey | Ordered activities (seedKey) |
|---------|------------------------------|
| Subscription Billing | `fin-act-plan-selected` → `fin-act-subscription-provisioned` → `fin-act-usage-metered` → `fin-act-charge-computed` |
| Invoice Run | `fin-act-billing-period-closed` → `fin-act-line-items-aggregated` → `fin-act-invoice-generated` → `fin-act-invoice-issued` |
| Dunning | `fin-act-payment-failed` → `fin-act-retry-scheduled` → `fin-act-reminder-sent` → `fin-act-escalated-suspended` |
| Revenue Recognition | `fin-act-contract-booked` → `fin-act-perf-obligations-identified` → `fin-act-revenue-scheduled` → `fin-act-revenue-recognized` |
| Tax | `fin-act-tax-jurisdiction-resolved` → `fin-act-tax-computed` → `fin-act-tax-collected` → `fin-act-tax-remitted-filed` |
| FinOps | `fin-act-cloud-spend-ingested` → `fin-act-cost-allocated-per-tenant` → `fin-act-margin-computed` → `fin-act-cost-anomaly-flagged` |

(24 activities, 6 `PART_OF`-to-domain + 24 `PART_OF`-to-journey + 18 `PRECEDES`.)

### 4.3 Roles (`EXECUTES`→ Activity) (FR-03, AC-03)

| Role | seedKey | Source | Executes (activity seedKeys) |
|------|---------|--------|------------------------------|
| Revenue Operations | `revenue_operations` | **shared** (catalog, referenced) | (function-owner; executes ≥1 activity per journey it owns) |
| Billing Operations | `fin-role-billing-ops` | slice-added | subscription-billing + invoice-run chains |
| Accounts Receivable / Collections | `fin-role-ar-collections` | slice-added | dunning chain |
| Revenue Accountant / Controller | `fin-role-revenue-accountant` | slice-added | rev-rec chain |
| Tax Analyst | `fin-role-tax-analyst` | slice-added | tax chain |
| FinOps Engineer | `fin-role-finops-engineer` | slice-added | finops chain |

Shared role `revenue_operations` is **referenced by its `seedKey`** (resolved to
its id at seed time), never re-created (AC-03). Slice-added roles carry stable
seed ids. The exact activity each role `EXECUTES` is frozen in the fixture (§6.3).

### 4.4 Systems (`USES_SYSTEM`← Activity) (FR-04, AC-04)

| System | seedKey | Source | boundedContext tag (DD-05) |
|--------|---------|--------|-----------------------------|
| Stripe | `stripe` | **shared** (foundation FR-04, referenced) | `Billing & Payments` |
| Data Warehouse | `data_warehouse` | **shared** (referenced) | `FinOps / Cost` |
| General Ledger / Accounting | `fin-sys-ledger` | slice-added (`systemKind:"functional"`) | `General Ledger / RevRec` |
| Tax Engine | `fin-sys-tax-engine` | slice-added (`systemKind:"functional"`) | `Tax` |
| FinOps / Cloud-Cost platform | `fin-sys-finops` | slice-added (`systemKind:"functional"`) | `FinOps / Cost` |

Shared `stripe` / `data_warehouse` are referenced by `seedKey` (no duplicate
`System` node). The `boundedContext` tag is set on the slice-added systems'
`attributes` (DD-05); shared systems are not mutated by this slice (their DDD
context, if needed, is a foundation/DDD concern).

### 4.5 KPIs (`MEASURES`→ MetricDefinition) (FR-05, FR-06, AC-05)

| KPI name | `domain_id` | Metric seedKey | Grounded now? |
|----------|-------------|----------------|---------------|
| MRR | finance | `metric-mrr` | yes (AC-05) |
| ARR | finance | `metric-arr` | yes (AC-05) |
| DSO | finance | `metric-dso` | yes (AC-05) + opt `ALIGNED_TO` Dunning (FR-07) |
| Gross Margin | finance | `metric-gross-margin` | yes (AC-05) |
| Burn | finance | `metric-burn` | yes (AC-05) |
| Runway | finance | `metric-runway` | yes (AC-05) |
| Cloud Cost per Tenant | finance | `metric-cloud-cost-per-tenant` | **blocked-on-OQ-1** (AC-15); created ungrounded until the metric lands |

`domain_id` = the resolved `Finance & Accounting` domain id (from
`ensureFunctionDomains`). Each grounded KPI has **exactly one** `MEASURES` edge
(cardinality enforced by `linkKpiToMetric`).

### 4.6 Stories + ACs (FR-08, AC-07)

One `UserStory` per journey (6 total), each attached to a journey activity
(`activityId`) + finance persona/role, each with ≥1 Given/When/Then
`AcceptanceCriterion`. Frozen roster in §7.3. Route:
`POST /api/v1/models/<root>/stories` (+ `…/acceptance-criteria`), `<root>` =
resolved operator root id.

### 4.7 Risks + compliance (FR-09, FR-10, AC-08)

| Row | Path | `risk_type` / rule | Marker `name` |
|-----|------|--------------------|---------------|
| Revenue leakage / billing error | `risk-register` | `financial` | "Finance: Revenue leakage / billing error" |
| Dunning failure / bad debt | `risk-register` | `financial` | "Finance: Dunning failure / bad debt" |
| Revenue-recognition (ASC-606) error | `risk-register` | `compliance` | "Finance: Revenue-recognition (ASC-606) error" |
| Tax mis-filing exposure | `risk-register` | `compliance` | "Finance: Tax mis-filing exposure" |
| Cloud-cost / margin overrun | `risk-register` | `financial` | "Finance: Cloud-cost / margin overrun" |
| Tax-filing deadline control | `compliance/rules` | evaluable rule | "Finance: Tax-filing deadline control" |

All rows set `domain:"Finance & Accounting"` (risk) or the finance `category`
(compliance). The `name` marker is the dedup key (§3.3).

### 4.8 DDD contexts (DD-05, FR-12, AC-10)

`Billing & Payments`, `General Ledger / RevRec`, `Tax`, `FinOps / Cost` —
carried as `system.attributes.boundedContext` tags (§4.4), created **inside the
import slice** (no DDD route, no `ontology/import`).

## 5. Delivery-channel decision (why three channels, not one)

| Content | Channel | Why not the import slice |
|---------|---------|--------------------------|
| journeys/activities/roles/systems + their edges + DDD tags | `finance-accounting.json` via `POST /api/v1/import` | — (this is the import slice) |
| KPIs + `MEASURES` + optional alignment | `seed-finance-graph.ts` (governed REST) | `KPI` create needs `POST /api/v1/kpis` (kpi-okr-governance owns `:KPI` writes); the edge needs the cardinality-guarded `linkKpiToMetric`; the metric-exists lookup (OQ-1) is runtime |
| stories + ACs | `seed-finance-graph.ts` (governed REST) | story create needs model-scope resolution (root id) + the two-step create-then-AC path |
| risks + compliance | `seed-finance-risks.ts` (governed REST) | rows live in **Postgres** — no `{nodes,edges}` import path; need governed helpers + client-side dedup |

Two self-owned scripts (a graph script and a risk script) keep the concerns
separable and each independently testable. Both import foundation helpers; both
resolve ids by lookup; neither edits owned-elsewhere code.

## 6. The import slice — `shared/seed/saas-operator/finance-accounting.json`

### 6.1 Envelope + discovery (FR-01, NFR-04, AC-01, AC-12)

The file is a `{nodes:[…], edges:[…]}` document matching `importPayloadSchema`.
Each node row: `{id, label, name, description, attributes:{seedKey, …}}`. Each
edge row: `{id, type, fromId, toId, attributes:{}}`. It is dropped into
`shared/seed/saas-operator/` and discovered by `seedSaasOperator` with **zero
loader edit** (the loader `readdirSync`s the directory — §2). Ids are stable
UUIDv7 literals so re-import MERGEs (upsert) idempotently (NFR-02, AC-11).

**Lifecycle-guard compatibility (NFR-04, AC-12):** the file contains **only**
non-lifecycle labels (`UserJourney`, `Activity`, `Role`, `System`) and edges
(`PART_OF`, `PRECEDES`, `EXECUTES`, `USES_SYSTEM`). It contains **no**
`BusinessModel`/`…Module…`/`ModuleInstance` row and **no**
`IN_MODEL`/`HAS_VERSION`/`INSTANTIATES`/`INSTANCE_IN`/`FORKED_FROM` edge. Domain
scoping (`IN_MODEL`) is **not** an import row — the `Finance & Accounting` domain
is pre-scoped by foundation; journeys attach under it via `PART_OF`
(UserJourney→Domain), which is non-lifecycle.

### 6.2 Domain reference (FR-01)

The journeys' `PART_OF` edge `toId` must be the `Finance & Accounting` **domain
id**, which is server-generated by the foundation and **not** knowable at
fixture-authoring time. **Resolution:** the import slice cannot hard-code the
domain id, so the journey→domain `PART_OF` edges are **not** in the JSON fixture;
instead `seed-finance-graph.ts` (§7) resolves the domain id via
`ensureFunctionDomains` and creates the six journey→domain `PART_OF` edges via
`POST /api/v1/edges` after the slice loads. The fixture itself carries the six
journeys, all activities, roles, systems, and the **intra-slice** edges
(`Activity PART_OF UserJourney`, `PRECEDES`, `EXECUTES`, `USES_SYSTEM`) whose
both endpoints are slice-local and therefore have known stable ids.

> This is the one structural refinement over the requirements skeleton: the
> journey→domain `PART_OF` edge moves from "in the JSON" to "created by the graph
> script by resolved id", because the domain id is server-generated. Shared
> systems (`stripe`, `data_warehouse`) have the same problem — their ids are
> server-generated by the foundation catalog — so `USES_SYSTEM` edges **to shared
> systems** are likewise created by the graph script (resolved via
> `ensureSystems`), while `USES_SYSTEM` edges to **slice-added** systems (known
> ids) stay in the fixture. Slice-added roles/systems and all-slice-local edges
> stay in the JSON.

### 6.3 Slice contents (frozen)

- **6 `UserJourney` nodes** (§4.1).
- **24 `Activity` nodes** (§4.2) + **24 `Activity PART_OF UserJourney`** edges +
  **18 `PRECEDES`** edges (all slice-local).
- **5 slice-added `Role` nodes** (§4.3) + their `EXECUTES` edges to slice
  activities (slice-local). (`revenue_operations` is shared — its `EXECUTES`
  edges are created by the graph script by resolved id.)
- **3 slice-added `System` nodes** (`fin-sys-ledger`, `fin-sys-tax-engine`,
  `fin-sys-finops`, each with `attributes.systemKind:"functional"` +
  `attributes.boundedContext`) + their `USES_SYSTEM` edges from slice activities
  (slice-local).

## 7. `seed-finance-graph.ts` — governed graph script (FR-01 domain-edges, FR-05..FR-08, FR-12)

New file `api/scripts/seed-finance-graph.ts`, wired as package script
`seed:finance-graph`. It runs **after** `seed:saas-operator` (the slice must be
loaded first). All writes are governed REST POSTs over the loopback API; it edits
no owned-elsewhere code (NFR-03, AC-13).

### 7.1 Resolution + journey/shared-system edges

1. `const root = await ensureOperatorRoot(driver)` → root id.
2. `const domains = await ensureFunctionDomains(driver, root.id)` →
   `financeDomainId = domains.get("finance_accounting")`.
3. `const systems = await ensureSystems(driver)` → shared system ids
   (`stripe`, `data_warehouse`).
4. `const roles = await ensureRoles(driver)` → `revenue_operations` id.
5. Resolve slice node ids (journeys/activities/systems/roles) by `seedKey` via
   `POST /api/v1/query/cypher` (`MATCH (n {…}) WHERE n.attributes_json CONTAINS
   seedKey` → or an attribute match) — reused read path, no new route.
6. Create the **six journey `PART_OF` Domain** edges and the shared-system
   `USES_SYSTEM` / shared-role `EXECUTES` edges via `POST /api/v1/edges`
   (idempotent: pre-check existence by endpoint pair, skip if present).

### 7.2 KPIs + `MEASURES` grounding (FR-05, FR-06, AC-05, AC-06, AC-15)

For each of the seven KPIs (§4.5):

1. `POST /api/v1/kpis` with `kpiCreateRequestSchema` fields — `name`,
   `category:"finance"`, `unit` (per metric), `target_value`,
   `target_direction`, `measurement_frequency`, `domain_id: financeDomainId`,
   `owner_role:"Revenue Operations"`. Response is `200 { id, ...kpi }` → capture
   `kpiId`. **Idempotency:** pre-list `GET /api/v1/kpis`, skip create if a
   finance KPI with the same `name` + `domain_id` exists.
2. Resolve the metric id by `seedKey` (`GET`/cypher over `:MetricDefinition`).
   - **If the metric exists** → `await linkKpiToMetric(base, kpiId, metricId)`
     (creates the single `MEASURES` edge; a re-run finds the existing edge and
     the pre-check throws `kpi_metric_already_linked`, which the script treats as
     "already grounded" and swallows for idempotency).
   - **If the metric is absent** (the `metric-cloud-cost-per-tenant` OQ-1 case)
     → **skip the link, log a warning** naming the missing metric seedKey. The
     KPI is created ungrounded; grounding lands once OQ-1's metric exists
     (AC-15).
3. **Optional alignment (FR-07, `should`):** for DSO, additionally
   `POST /api/v1/kpis/alignments` (or the as-built alignment route) with
   `target_type:"journey"`, `target_id:<Dunning journey id>` — enrichment only,
   not gated by an AC.

### 7.3 Stories + ACs (FR-08, AC-07) — FROZEN roster

For each journey, one story via `POST /api/v1/models/<root.id>/stories`
(`storyCreateSchema`), then ≥1 AC via
`POST /api/v1/models/<root.id>/stories/<storyId>/acceptance-criteria`
(`acCreateSchema`). `<root.id>` is the resolved operator root — **never
hard-coded** (B-02). The story `activityId` is a journey activity id; because
that activity is `PART_OF`→journey→`PART_OF`→(pre-scoped) domain, it is in
`scopedNodeIds(driver, root.id)` and the create returns `201`.

| Journey | Story (persona / action / benefit) | activityId | AC (given/when/then) |
|---------|-------------------------------------|------------|----------------------|
| Subscription Billing | Billing Ops / compute the correct charge for a metered subscription / no revenue is leaked | `fin-act-charge-computed` | given a provisioned subscription with metered usage / when the charge is computed / then the charge equals rated usage × plan price |
| Invoice Run | Billing Ops / issue an accurate invoice at period close / customers are billed on time | `fin-act-invoice-issued` | given a closed billing period / when the invoice run completes / then every active subscription has exactly one issued invoice |
| Dunning | AR / Collections / recover a failed payment through staged retries | `fin-act-reminder-sent` | given a failed payment / when the dunning schedule runs / then a reminder is sent before escalation |
| Revenue Recognition | Revenue Accountant / recognize revenue against performance obligations | `fin-act-revenue-recognized` | given a booked contract with identified obligations / when the period closes / then revenue is recognized per the schedule |
| Tax | Tax Analyst / remit tax to the correct jurisdiction | `fin-act-tax-remitted-filed` | given collected tax for a period / when the filing deadline arrives / then tax is remitted and filed on time |
| FinOps | FinOps Engineer / allocate cloud cost per tenant and flag anomalies | `fin-act-cost-anomaly-flagged` | given ingested cloud spend / when cost is allocated per tenant / then a cost anomaly above threshold is flagged |

**Idempotency:** pre-list `GET /api/v1/models/<root.id>/stories`; skip create if
a story with the same `persona`+`action` on the same `activityId` exists.

### 7.4 DDD tags (DD-05, FR-12, AC-10)

The `system.attributes.boundedContext` tags are set **in the import fixture**
(§4.4, §6.3) for slice-added systems — no work in this script. AC-10 asserts the
tags are present on the finance systems and that **no** DDD route/schema file
changed. (If OQ-4 (a) is later chosen, this script gains the `BoundedContext`
ontology-import + `Capability`/`setContext` calls; not in this design.)

## 8. `seed-finance-risks.ts` — governed risk/compliance script (FR-09..FR-11, AC-08, AC-09)

New file `api/scripts/seed-finance-risks.ts`, wired as package script
`seed:finance-risks`. It imports `seedRisk` / `seedComplianceRule` from
`api/src/seed/governed-seed-helper.ts` (foundation, exported — importing edits
nothing) and wraps a **lookup-before-create** dedup (DD-06c). Edits no
owned-elsewhere code (NFR-03, AC-08, AC-13).

### 8.1 Frozen risk/compliance roster (§4.7)

Five `risk-register` rows (three `financial`, two `compliance`) + one
`compliance/rules` row. Each risk sets
`owner:"Revenue Operations"`, `domain:"Finance & Accounting"`,
`likelihood`/`impact` in 1–5, `status:"open"`, `trend:"flat"`, and the `name`
marker from §4.7. The compliance rule sets `rule_type`/`category`/`severity` +
a minimal `rule_dsl` (a deadline check) + a JSON-stringified `actions` array.

### 8.2 Dedup (DD-06c, AC-09)

Before each create:

- **Risk:** `GET /api/v1/risk-register?domain=Finance%20%26%20Accounting&risk_type=<t>`,
  parse the list, and skip `seedRisk(row)` if any returned row's `name` equals the
  marker (the list route has no `name` filter — matched in TS).
- **Compliance:** `GET /api/v1/compliance/rules`, filter in TS on `name`, skip
  `seedComplianceRule(row)` if present.

A second `bun run seed:finance-risks` therefore adds **zero** rows (AC-09).

### 8.3 Ownership boundary (AC-08, AC-13)

The script only **POSTs/GETs** the governed routes and **imports** the exported
helpers. `git diff --stat` after this spec confines edits to: the fixture, the
two scripts, their `package.json` lines, and the `api/__tests__/finance-*.test.ts`
files — **no** change under `risk-register.ts`/`risk-compliance.ts`/
`compliance-rules.ts`/`change-requests.ts`/`sla-crud.ts`/`kpi-*.ts`/`stories.ts`/
`ddd-system.ts`/`capabilities.ts`/`model-lifecycle-guard.ts`, and **no** schema
array, route file, or view file.

## 9. Test strategy

Five integration tests (Neo4j + Postgres), each `*.integration.test.ts` in
`api/__tests__/`. Each test seeds a clean operator scaffold + the finance slice
via the real loaders, then asserts against the graph / Postgres.

| Test file | Covers | ACs |
|-----------|--------|-----|
| `finance-process-slice.integration.test.ts` | slice load; journeys `PART_OF` domain; exact activity roster + `PRECEDES` chains; roles `EXECUTES` (shared referenced, not duplicated); systems `USES_SYSTEM` (Stripe referenced, slice systems valid `systemKind`); loader idempotency + retail isolation; lifecycle-guard reject | AC-01, AC-02, AC-03, AC-04, AC-11, AC-12 |
| `finance-kpis.integration.test.ts` | six KPIs via `POST /api/v1/kpis` (`domain_id`=finance); each `MEASURES` exactly one metric; second `MEASURES` → `kpi_metric_already_linked`; module-pin `INSTANTIATES` guard unaffected; FinOps KPI grounding **AC-15 blocked-on-OQ-1** | AC-05, AC-06, AC-15 |
| `finance-stories.integration.test.ts` | ≥1 story per journey under the resolved root id → `201`; control story under a **second** `BusinessModel` id (N-02: the retail Model #1 or a purpose-created control model, asserted to exist) → `404 story_activity_not_in_model`; ≥1 structured Given/When/Then AC; partial AC → clause-required rejection | AC-07 |
| `finance-risks.integration.test.ts` | risks via `POST /api/v1/risk-register` (`risk_type` ∈ {financial,compliance}) → persisted id; compliance row via `POST /api/v1/compliance/rules`; script idempotency (2nd run = 0 new); `git diff --stat` boundary clean | AC-08, AC-09 |
| `finance-ddd.integration.test.ts` | finance systems carry the `boundedContext` tag per §4.4; **no** edit to `ddd-system.ts`/`capabilities.ts` (git diff) | AC-10 |

`AC-13` (transpile + boundary) and `AC-14` (mapping-table coverage) are validated
at the CLI/doc level: `bun run typecheck` exit 0; `git diff --stat` scoped; a
reviewer confirms every seeded element appears as exactly one §4 mapping row.

**N-02 handling (control model for AC-07):** the story-scope control assertion
requires a **second** `BusinessModel` to exist so the `404` proves scope-mismatch
(not `model_not_found`). The test explicitly ensures a second model (the retail
Model #1 from `bun run seed`, or a throwaway control model created via
`createModel` in setup) and posts the control story under **its** id.

## 10. File Changes

| Path | Action | FR / AC |
|------|--------|---------|
| `shared/seed/saas-operator/finance-accounting.json` | **new** — the process slice (journeys/activities/roles/slice-systems + slice-local edges + DDD tags) | FR-01..FR-04, FR-12, NFR-04; AC-01..AC-04, AC-10, AC-12 |
| `api/scripts/seed-finance-graph.ts` | **new** — resolves ids; creates journey→domain + shared-system/role edges; KPIs + `MEASURES`; stories + ACs | FR-01 (domain edges), FR-05..FR-08; AC-05..AC-07, AC-15 |
| `api/scripts/seed-finance-risks.ts` | **new** — idempotent governed risk/compliance seed (imports foundation helpers) | FR-09..FR-11; AC-08, AC-09 |
| `package.json` | **modify** — add `seed:finance-graph` + `seed:finance-risks` script lines (additive; owned by this spec) | FR-11 wiring |
| `api/__tests__/finance-process-slice.integration.test.ts` | **new** | AC-01..AC-04, AC-11, AC-12 |
| `api/__tests__/finance-kpis.integration.test.ts` | **new** | AC-05, AC-06, AC-15 |
| `api/__tests__/finance-stories.integration.test.ts` | **new** | AC-07 |
| `api/__tests__/finance-risks.integration.test.ts` | **new** | AC-08, AC-09 |
| `api/__tests__/finance-ddd.integration.test.ts` | **new** | AC-10 |

**Zero** edits to: `shared/src/schema/{nodes,edges}.ts` (no new label/edge),
`pwa/**` (no view), `api/src/router.ts` / `route.ts` / `SURFACES` /
`views/index.tsx` (no route), or any owned-elsewhere storage/route file (NFR-01,
NFR-03, NFR-06, AC-13).

## 11. Traceability

| FR | Design | AC |
|----|--------|-----|
| FR-01 journeys `PART_OF` domain | §6, §7.1 (domain edges by resolved id) | AC-01, AC-11, AC-12 |
| FR-02 activities in `PRECEDES` | §4.2, §6.3 | AC-02 |
| FR-03 roles `EXECUTES` | §4.3, §6.3, §7.1 (shared role edges) | AC-03 |
| FR-04 systems `USES_SYSTEM` | §4.4, §6.3, §7.1 (shared system edges) | AC-04 |
| FR-05 KPIs via `POST /api/v1/kpis` | §7.2 | AC-05 |
| FR-06 `MEASURES` grounding | §7.2, §3.1 (OQ-1) | AC-05, AC-06, AC-15 |
| FR-07 optional alignment | §7.2 step 3 (`should`) | — (enrichment) |
| FR-08 stories/ACs (root modelId) | §7.3 | AC-07 |
| FR-09 risks via risk-register | §8.1 | AC-08 |
| FR-10 compliance rows | §8.1, §3.2 (OQ-2) | AC-08 |
| FR-11 idempotent seed script | §8.2, §3.3 (OQ-3) | AC-08, AC-09 |
| FR-12 DDD mapping | §4.4, §4.8, §3.4 (OQ-4→tag) | AC-10 |
| FR-13 mapping table | §4 (frozen) | AC-14 |
| NFR-01 no new store/label/route/view | §10 (zero edits) | AC-01, AC-13 |
| NFR-02 idempotency/isolation | §6.1, §7.2/§7.3 (dedup), §8.2 | AC-09, AC-11 |
| NFR-03 governed-API-only | §7, §8.3 | AC-08, AC-10, AC-13 |
| NFR-04 lifecycle-guard compat | §6.1 | AC-12 |
| NFR-05 house rules | §7, §8 (zod-only via governed schemas; loopback; central-gate auth; `bun run typecheck`) | AC-13 |
| NFR-06 no view/route edit | §10 | AC-13 |

Every AC (AC-01..AC-15) maps back to ≥1 FR via the requirements table; every
design element above serves a listed FR; every file in §10 traces to ≥1 AC.

## 12. Rejected alternatives

- **Put journey→domain + shared-system `USES_SYSTEM` edges in the JSON fixture.**
  Rejected: those endpoints' ids are server-generated by the foundation and
  unknowable at fixture-authoring time; hard-coding is forbidden (NFR-05).
  Resolved by creating them in `seed-finance-graph.ts` by resolved id (§6.2).
- **OQ-4 (a): full DDD via `Capability` + `setContext`.** Rejected for now:
  requires this content spec to create `BoundedContext` nodes via
  `ontology/import` and author finance `Capability`s — materially more scope than
  a `should` mapping warrants. The `boundedContext` attribute tag (DD-05) proves
  the mapping with zero DDD-route dependency. Promotable later without disturbing
  §§4–10 (adds calls only to §7.4).
- **One combined seed script.** Rejected: the graph script (Neo4j, needs
  scope/cardinality) and the risk script (Postgres, needs dedup) have distinct
  failure modes and distinct governed routes; two scripts are independently
  testable (§9) and keep AC boundaries clean.
- **Add `metric-cloud-cost-per-tenant` here to unblock the FinOps KPI.**
  Rejected: violates XD-06 metric-library ownership. Flagged to
  `saas-metric-library` (OQ-1); FinOps grounding gated behind AC-15.
- **A new `/api/v1/finance/*` route or a `Finance` view.** Rejected: NFR-01 /
  NFR-06 / XD-05 — this is a data-only content spec; the data surfaces through
  Explorer and views owned by other specs.

## Open Questions carried to the user / orchestrator

- **OQ-1 (cross-spec flag; author recommendation (b)):** `metric-cloud-cost-per-tenant`
  is absent from the `saas-metric-library` catalog. Recommend flagging that spec
  to add it; the FinOps KPI is created ungrounded now and grounded via AC-15 once
  the metric lands. The other six finance KPIs are grounded today (AC-05).
- **OQ-2 (resolved in design, confirm):** compliance obligations modeled as
  `risk-register` rows with `risk_type:"compliance"` (descriptive) + one
  `compliance/rules` row (the evaluable tax-deadline control). Confirm the split.
- **OQ-4 (resolved in design as (b), confirm):** DDD mapping via the
  `system.attributes.boundedContext` tag rather than full `Capability`/`setContext`
  authoring (FR-12 is `should`). Confirm the lighter path is acceptable, or
  request option (a).
