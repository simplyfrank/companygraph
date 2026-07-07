---
feature: "finance-accounting-process-model"
created: "2026-07-06"
author: "spec-author"
status: "revised"
revision: 1
size: "medium"
---

<!-- Revision 1 (2026-07-06): addresses review-requirements.md rev-0 findings
     B-01, B-02, C-01, C-02, C-03, C-04 (nits N-01/N-02 noted). Each change is
     tagged inline with the finding it resolves. No stable IDs renumbered. -->


# Requirements: finance-accounting-process-model

## Summary

`finance-accounting-process-model` is one of the **six wave-2 content specs** of
the SaaS-Operator business-process model (blueprint
`.claude/specs/blueprint-saas-operator.md`). It authors the **Finance &
Accounting function** of the docorg SaaS operator at **full-pipeline depth**
(XD-10) onto the companygraph process graph, scoped under the **"SaaS Operator"
`BusinessModel` root** created by `saas-operator-foundation` (wave 1a), under the
pre-seeded `Finance & Accounting` `Domain` root (foundation FR-03, `seedKey =
finance_accounting`).

It delivers, all as **data** through existing governed paths — it introduces
**no new node label, no new edge type, no new route, and no new view**:

1. A **loadable seed slice** `shared/seed/saas-operator/finance-accounting.json`
   (`{nodes, edges}` process content) that the foundation's directory-iterating
   loader (foundation FR-07, `POST /api/v1/import` → `realImport`) discovers with
   **zero loader edit**: six finance `UserJourney`s (subscription billing,
   invoice run, dunning, revenue recognition, tax, FinOps/cloud-cost-per-tenant),
   their `Activity`s in ordered `PRECEDES` flow, `Role`s wired to activities via
   `EXECUTES`, and `USES_SYSTEM` links to shared systems (Stripe, ledger, …).
2. **Operator KPIs** for the finance function created via the governed KPI CRUD
   route (`POST /api/v1/kpis`, `kpi-crud.ts`) and each linked to its canonical
   `MetricDefinition` via the **`MEASURES`** edge (XD-06 / **XD-06-erratum** —
   the KPI→MetricDefinition edge is `MEASURES`, not `INSTANTIATES`), using the
   `saas-metric-library` helper `linkKpiToMetric` (`api/src/seed/link-kpi-metric.ts`).
   Metrics: **MRR, ARR, DSO, Gross Margin, Burn, Runway, Cloud Cost per Tenant**.
3. **User stories + Given/When/Then acceptance criteria** for the function's key
   activities, created via the governed story surface (`POST
   /api/v1/models/:modelId/stories` + acceptance-criteria, `story-spec-core`),
   where `:modelId` is the **SaaS-Operator `BusinessModel` root id** resolved by
   lookup (`ensureOperatorRoot`, never hard-coded) so the finance activities are
   in the model scope the story route enforces (B-02).
4. **Financial + compliance risks** created **only** through the governed
   **risk-register API** (`POST /api/v1/risk-register`, `risk-compliance-change`)
   and compliance rows through `POST /api/v1/compliance/rules` (B-01) — this spec
   **never** edits `risk-register.ts` / `risk-compliance.ts` / `compliance-rules.ts`
   / `change-requests.ts` / `sla-crud.ts` (XD-04).
5. A **DDD system mapping** (bounded contexts for the finance systems) and a
   first-class **mapping table** (business action → companygraph label/edge)
   proving the function maps onto the representation (XD-10).

It **does not** create the SaaS-Operator root, the six domain roots, the shared
System/Persona/Role catalog, the metric library, or any funnel — those are wave-1
foundations it **consumes**. It authors **no** marketing/sales funnel (finance
does not `depends-on funnel-pipeline-modeling`), no sales pipeline, and touches
**no** route-registration file (`route.ts` / `SURFACES` / `views/index.tsx`, sole-
owned by `saas-operator-foundation`, XD-05) and **no** view component.

## Motivation

1. XD-10 makes **full-pipeline depth mandatory**: each content spec must cover
   journeys, activities×roles, systems, metric-instantiated KPIs, stories/ACs,
   risks, and DDD mapping, and must **prove** the function maps onto the
   companygraph representation with an explicit mapping table. Finance is one of
   the six functions the operator model must cover; without it the operator model
   is incomplete and the wave-3 `cross-function-exec-rollup` /
   `function-benchmark-scoring` have no finance data to aggregate.
2. Finance/Accounting is the function that grounds the operator's headline
   revenue metrics (MRR/ARR/DSO/gross margin/burn/runway) and the FinOps
   cloud-cost-per-tenant metric — the KPIs `cross-function-exec-rollup` most
   depends on. XD-06 requires every one of these KPIs to be grounded in a
   canonical `MetricDefinition` via `MEASURES`, so this spec is the concrete
   consumer that proves the metric-library grounding end-to-end for finance.
3. Finance carries the operator's real **financial and compliance risk** (revenue
   leakage, dunning failure, revenue-recognition/ASC-606 error, tax exposure,
   cloud-cost overrun) and compliance obligations (revenue recognition, tax
   filing, SOC2/financial controls). The blueprint flags (Risks) that the
   Postgres risk/SLA seed path "may not exist" — this spec is one of the three
   named consumers (finance, customer-success, platform-ops) that must create
   risk/compliance rows **only via the governed API** (XD-04). It resolves the
   seed-path question by using the foundation's **API-driven seed helper**
   (foundation FR-06) rather than any storage-code edit.
4. The slice must land as a **discovered fixture** — dropping
   `finance-accounting.json` into `shared/seed/saas-operator/` and running the
   foundation loader must load it with no loader edit (foundation FR-07/FR-08),
   proving the fan-out's zero-collision design.

## Functional Requirements

<!-- Priorities: must = full-pipeline-depth (XD-10) mandatory element;
     should = enrichment/polish. -->

### Finance process structure — journeys, activities, roles, systems (XD-10, XD-03)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **Six finance `UserJourney`s** are authored under the `Finance & Accounting` `Domain` root (foundation `seedKey = finance_accounting`), each attached via a `PART_OF` (UserJourney→Domain) edge: **Subscription Billing**, **Invoice Run**, **Dunning**, **Revenue Recognition**, **Tax**, **FinOps / Cloud-Cost-per-Tenant**. Each carries the standard node envelope (`name`, `description`, `attributes`) and a stable seed `id` + `attributes.seedKey`. The domain root itself is **not** created here (foundation FR-03 pre-seeds it); this spec resolves it by its `seedKey` and attaches journeys under it. **Process-modeling layer only (XD-03): no operational/transactional entities** (`Invoice`/`Subscription`/`Payment`/`Tenant` rows or labels) are created — only process structure. | must | XD-10, XD-03 |
| FR-02 | **Activities per journey in an ordered `PRECEDES` flow.** Each of the six journeys contains its constituent `Activity` nodes wired into the journey via `PART_OF` (Activity→UserJourney) and ordered by `PRECEDES` (Activity→Activity). At design time the exact activity roster per journey is **frozen as an enumerated table** (e.g. Subscription Billing: *plan selected → subscription provisioned → usage metered → charge computed*; Invoice Run: *billing period closed → line items aggregated → invoice generated → invoice issued*; Dunning: *payment failed → retry scheduled → reminder sent → escalated/suspended*; Revenue Recognition: *contract booked → performance obligations identified → revenue scheduled → revenue recognized*; Tax: *tax jurisdiction resolved → tax computed → tax collected → tax remitted/filed*; FinOps: *cloud spend ingested → cost allocated per tenant → margin computed → cost anomaly flagged*). Each activity carries a stable seed `id` + `attributes.seedKey`. The design table is the authoritative roster; AC-02 asserts it exactly. | must | XD-10, XD-03 |
| FR-03 | **Roles wired to activities via `EXECUTES`.** Finance-function `Role` nodes (e.g. **Billing Operations**, **Accounts Receivable / Collections**, **Revenue Accountant / Controller**, **Tax Analyst**, **FinOps Engineer**) are linked to the activities they perform via `EXECUTES` (Role→Activity). Roles that already exist in the **shared Persona/Role catalog** (foundation FR-05, resolved by `name`/`seedKey`) are **referenced, not re-created**; only finance-specific roles absent from the shared catalog are added within this slice (with stable seed ids). The mapping table (FR-09) records which role executes which activity. | must | XD-10, XD-07 |
| FR-04 | **Systems linked via `USES_SYSTEM`.** Finance activities are linked to the systems that support them via `USES_SYSTEM` (Activity→System). **Stripe** (billing) and a **ledger / general-ledger** system are the core finance systems; where already present in the shared System catalog (foundation FR-04 — Stripe, data-warehouse, …) they are **referenced by stable seed id, not duplicated** (foundation FR-04 / `model-workspace-core` DEC-01: Systems are model-independent shared reference nodes). Only finance-specific systems absent from the shared catalog (e.g. a **general ledger / accounting system**, a **tax engine**, a **cloud-cost / FinOps platform**) are added within this slice with stable seed ids and a valid `systemKind` (`system-augmentation-model`). The design table freezes the exact finance-system roster and which are shared-referenced vs. slice-added. | must | XD-10, XD-07 |

### Metric-instantiated KPIs (XD-06 / XD-06-erratum)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-05 | **Finance operator KPIs created via the governed KPI CRUD route.** The finance KPIs are created via `POST /api/v1/kpis` (`handleKpiPost`, `kpi-crud.ts`, `kpi:write`/as-mapped) with the as-built `kpiCreateRequestSchema` fields (`name`, `category`, `unit`, `target_value`, `target_direction`, `measurement_frequency`, optional `description`/`owner_role`/`domain_id`) — **not** by a bespoke node write or a new route. Each KPI sets `domain_id` to the resolved `Finance & Accounting` domain id so it scopes to this function. The KPI roster covers the seven blueprint-named finance metrics (FR-06). This spec creates KPIs as **data**; it **never** edits `kpi-crud.ts` or any `kpi-*` route code (owned by `kpi-okr-governance` / `kpi-measurement-alignment`, XD-08). | must | XD-06, XD-10 |
| FR-06 | **Each finance KPI is grounded in a canonical `MetricDefinition` via `MEASURES`** (XD-06 / **XD-06-erratum**: the KPI→MetricDefinition edge is **`MEASURES`**, a distinct unguarded runtime edge — **not** `INSTANTIATES`, which is a lifecycle-guarded module-pin edge). The link is created with the `saas-metric-library` helper `linkKpiToMetric(baseUrl, kpiId, metricId)` (`api/src/seed/link-kpi-metric.ts`) which posts `{type:"MEASURES", fromId:kpiId, toId:metricId}` to the generic `POST /api/v1/edges` and enforces **one metric per KPI** (a second link throws `KpiMetricAlreadyLinkedError` → `kpi_metric_already_linked`). Finance KPIs link to these canonical metrics **by their `attributes.seedKey`** (resolved by lookup, never a hard-coded metric id): **MRR** (`metric-mrr`), **ARR** (`metric-arr`), **DSO** (`metric-dso`), **Gross Margin** (`metric-gross-margin`), **Burn** (`metric-burn`), **Runway** (`metric-runway`), and **Cloud Cost per Tenant**. This spec invents **no** ad-hoc metric semantics (XD-06). **Cloud-Cost-per-Tenant metric availability is OQ-1** — see Risks & Open Questions. | must | XD-06 |
| FR-07 | **KPIs alignment to the finance graph structure (optional enrichment).** Where useful, a finance KPI is aligned to the graph structure it measures via the existing `ALIGNED_TO` (KPI→UserJourney/Activity/Domain) or `PARAM_BINDS` (KPI→Activity/UserJourney/System/Domain) edges (both as-built, `kpi-measurement-alignment`) — e.g. DSO `ALIGNED_TO` the Dunning journey, Cloud-Cost-per-Tenant `PARAM_BINDS` the FinOps cost-allocation activity — created via the existing governed edge/alignment paths, never new edge types. This is enrichment: the mandatory link is the `MEASURES` grounding (FR-06). | should | XD-10, kpi-measurement-alignment |

### Stories + acceptance criteria (XD-10, story-spec-core)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-08 | **User stories with structured Given/When/Then acceptance criteria** for the finance function's key activities, created via the governed story surface (`POST /api/v1/models/:modelId/stories` with `storyCreateSchema` — `persona`, `action`, `benefit`, `activityId`, optional `roleId`; then acceptance criteria with the structured `given`/`when`/`then` clauses per `acCreateSchema`, `story-spec-core`). **The `:modelId` in the story path MUST be the SaaS-Operator `BusinessModel` **root** model id, resolved by lookup (foundation `ensureOperatorRoot` / `getModel` — never hard-coded)** (B-02): the story route rejects a story whose `activityId` is not in `scopedNodeIds(driver, modelId)` with `404 story_activity_not_in_model` (`stories.ts` `assertActivityInScope`, `model-scope.ts` `scopedNodeIds`), and `scopedNodeIds` resolves the operator root's `Domain -[:IN_MODEL]-> model` plus transitive `PART_OF` descendants — so the finance activities are in scope **only under that root model id**. Posting under any other model id yields a systematic `404`. Stories attach to finance `Activity`s (the `activityId` resolved to a slice activity's id, which is in the root model scope via its `PART_OF` chain up to the pre-scoped finance domain) and to the finance persona/role; at least one story per finance journey, each with ≥ 1 Given/When/Then acceptance criterion. The design freezes the exact story roster. This spec creates stories/ACs as **data**; it **never** edits `stories.ts` / `story-spec` route code (owned by `story-spec-core`). | must | XD-10, story-spec-core |

### Financial / compliance risks + compliance rows — governed API only (XD-04)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-09 | **Financial + compliance risks created only via the governed risk-register API.** The finance function's risks are created by POSTing to `POST /api/v1/risk-register` (`handleRiskRegisterCreate`, `risk-register.ts`, owned by `risk-compliance-change`) with the as-built `createRiskSchema` (`name`, `owner`, `domain`, `likelihood` 1–5, `impact` 1–5, `status`, `trend`, optional `description`/`mitigation_plan`/`category`/`risk_type`/`linked_entity_type`/`linked_entity_id`). Finance risks set `domain:"Finance & Accounting"` and `risk_type:"financial"` or `"compliance"` as appropriate (both are in the as-built `risk_type` enum). At minimum the risks cover: **revenue leakage / billing error**, **dunning failure / bad debt**, **revenue-recognition (ASC-606) error**, **tax mis-filing exposure**, **cloud-cost / margin overrun**. This spec **never** edits `risk-register.ts` / `risk-compliance.ts` / `compliance-rules.ts` / `change-requests.ts` / `sla-crud.ts` (XD-04) — it only calls their routes. | must | XD-04, XD-10 |
| FR-10 | **Compliance rules created only via the governed compliance-rules API** (where the function has ongoing compliance obligations distinct from a point-in-time risk). Compliance rows are created by POSTing to `POST /api/v1/compliance/rules` (**slash, not hyphen**; POST handler `handleCreateComplianceRule` — `handleComplianceRules` is the **GET-list** handler; router mount `router.ts:590-591`, `compliance-rules.ts`, owned by `risk-compliance-change`) with the as-built `complianceRuleSchema` (B-01 — the storage *file* is still `compliance-rules.ts`; only the route *path* is `compliance/rules` and the POST *handler* is `handleCreateComplianceRule`) (`name`, `rule_dsl`, `rule_type`, `category`, `severity`, `enabled`, `actions`, optional `description`/`schedule`). Finance compliance rows cover e.g. **revenue-recognition control**, **tax-filing deadline control**, **SOX/financial-controls check**. **Whether compliance obligations are modeled as `risk-register` rows (with `risk_type:"compliance"`), as `compliance-rules` rows, or both is OQ-2** — see Risks & Open Questions. This spec **never** edits the compliance-rules storage code (XD-04). | should | XD-04, XD-10 |
| FR-11 | **API-driven risk/compliance seed script owned by this spec.** Because the Postgres risk/compliance tables have **no `{nodes,edges}` import path** (they are Postgres, not Neo4j — the `POST /api/v1/import` loader cannot create them), and the blueprint flags the Postgres seed path "may not exist", this spec ships its **own** API-driven seed step (a script under `api/scripts/`, e.g. `seed-finance-risks.ts`, wired as a package script such as `seed:finance-risks`, following the foundation FR-06 governed-API helper pattern) that POSTs the FR-09/FR-10 rows to the governed routes. This is an **API-driven seed script, not a storage-code edit** (blueprint Risks resolution; XD-04). It **imports the reusable foundation helpers `seedRisk` / `seedComplianceRule` from `api/src/seed/governed-seed-helper.ts`** (both are exported and post to the governed routes — `seedRisk`→`/api/v1/risk-register`, `seedComplianceRule`→`/api/v1/compliance/rules` — so importing them edits nothing owned-elsewhere) (C-02). Because those helpers are **raw POSTs with no dedup**, the script **wraps them in a lookup-before-create dedup** (OQ-3 option (a): query the governed list/filter for a stable `name`(+`domain`) marker and call the helper only if absent) so a re-run does not duplicate rows (`risk-register`'s create server-generates the id and does no MERGE). This is an **API-driven seed script, not a storage-code edit**. | must | XD-04, blueprint Risks, foundation FR-06 |

### DDD system mapping (XD-10)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-12 | **DDD bounded-context mapping for the finance function.** The finance function is mapped to **bounded contexts** via the existing DDD system-modeling surface (`ddd-system-modeling` — the `BoundedContext` label + its edges), e.g. `Billing & Payments`, `General Ledger / RevRec`, `Tax`, `FinOps / Cost`. **The as-built DDD surface maps `Capability`s into bounded contexts, not `System`s** (`setContext(driver, modelId, capabilityId, boundedContextId)`; `GET models/:modelId/system-model/{gaps,context-map}`; `capabilities.ts`) (C-01) — so this requirement does **not** assume a `System→BoundedContext` write path exists. The design takes **exactly one** of the OQ-4 paths: **(a)** author finance `Capability`s and map those into the finance bounded contexts via the real `setContext` route (full DDD mapping); or **(b)** the documented degrade — tag the finance systems with a `system.attributes.boundedContext` value (lighter mapping, no DDD-route dependency). Either way this spec creates DDD data **only** through the existing `ddd-system-modeling` routes/labels (or a plain system-attribute tag); it **never** edits `ddd-system.ts`/`system-model.ts` schema or DDD route code. The chosen path + the exact bounded-context roster is frozen in the mapping table (FR-13). This FR is `should`, so it may degrade to (b) without blocking the mandatory pipeline (OQ-4). | should | XD-10, ddd-system-modeling |

### Mapping table — proof the function maps onto the representation (XD-10)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-13 | **First-class mapping table (XD-10 core deliverable).** `requirements.md` (and carried into `design.md`) contains an explicit, reviewable **mapping table** with one row per finance business action mapping it to its companygraph representation: `(business action / concept → node label + stable seedKey → edge type + endpoints → governed route used → grounding metric seedKey where a KPI)`. It covers every journey, activity, role, system, KPI↦metric grounding, story, risk, and DDD context. This table is the XD-10 "proves it maps onto the companygraph representation" artifact and is the authoritative index the seed slice + seed scripts are built against. A skeleton is in **§ Mapping Table** below; the design freezes the complete table. | must | XD-10 |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | **No new store, no new compile-time or runtime labels/edges, no new route, no new view.** This spec adds **zero** entries to `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS` in `shared/src/schema/{nodes,edges}.ts`, registers **zero** new runtime ontology labels/edges, mounts **zero** new REST routes, and creates **zero** new PWA view files. All content is **data**: Neo4j process nodes/edges under the SaaS-Operator root (via `POST /api/v1/import` + governed KPI/story/edge routes) and Postgres risk/compliance rows (via the governed risk/compliance routes). It reuses only pre-existing labels/edges/routes from wave-1 foundations + the as-built platform. | XD-02, XD-03, NFR-01 (foundation), house rules |
| NFR-02 | **Idempotency + retail/operator isolation.** Re-running the finance seed (the `POST /api/v1/import` slice load + the API-driven risk/compliance script) yields **zero** net new nodes/edges/rows (stable seed ids MERGE for graph content; the risk/compliance script is idempotent per FR-11/OQ-3). No run mutates retail Business Model #1's subgraph, the retail/commercial seed files, or **any other function's** slice. All finance graph content is scoped under the SaaS-Operator root's `Finance & Accounting` domain; a re-run `/api/v1/stats` diff attributable to a re-run is zero. | XD-01, XD-04, house data-integrity |
| NFR-03 | **Governed-API-only for owned-elsewhere data (XD-04/XD-08).** Risk/compliance rows are created **only** by POSTing to `/api/v1/risk-register` and `/api/v1/compliance/rules` (B-01); KPIs **only** via `/api/v1/kpis`; the KPI→metric edge **only** via the `linkKpiToMetric` helper / `POST /api/v1/edges`; stories/ACs **only** via the story routes; DDD contexts **only** via `ddd-system-modeling` routes. **No code is edited** under `risk-register.ts` / `risk-compliance.ts` / `compliance-rules.ts` / `change-requests.ts` / `sla-crud.ts` / `kpi-*.ts` / `stories.ts` / `ddd-system.ts` / `model-lifecycle-guard.ts`. A `git diff --stat` confines this spec's edits to `shared/seed/saas-operator/finance-accounting.json`, the self-owned seed script(s) under `api/scripts/`, its package-script wiring, and its own test files. | XD-04, XD-08 |
| NFR-04 | **Lifecycle-guard compatibility of the seed slice.** Because the slice loads through `POST /api/v1/import` (`realImport`, which pre-scans and rejects lifecycle-labeled rows `BusinessModel`/`BusinessModule`/`BusinessModuleVersion`/`ModuleInstance` and lifecycle edges `IN_MODEL`/`HAS_VERSION`/`INSTANTIATES`/`INSTANCE_IN`/`FORKED_FROM` with `409 model_lifecycle_route_required`, payload-atomic write-nothing), `finance-accounting.json` contains **only** non-lifecycle process rows (`UserJourney`/`Activity`/`Role`/`System` nodes and `PART_OF`/`PRECEDES`/`EXECUTES`/`USES_SYSTEM` edges). Domain-scoping (`IN_MODEL`) is **not** an import row — the `Finance & Accounting` domain is pre-scoped by foundation FR-03; journeys attach under it via `PART_OF` (Journey→Domain), a non-lifecycle edge. KPIs, stories, DDD contexts, and risk/compliance rows are created via their dedicated governed routes, **not** via the import slice. | foundation FR-09, `model-workspace-core` FR-08/AC-22, XD-04 |
| NFR-05 | **House rules.** `zod` is the only validation library (the seed script parses/relies on the governed routes' existing zod schemas; no new validation library); no `tsc` (transpile via `bun run typecheck`); en-US identifiers (`revenue`, `dunning`, `analyzer` where applicable); server binds loopback `127.0.0.1:8787`; auth via the central router gate + `api/src/auth/` only — the seed script authenticates like any client (no per-route auth check); all REST under `/api/v1/`. | CLAUDE.md |
| NFR-06 | **No route-registration or view edits (XD-05).** This spec is a **no-new-views** content spec (blueprint Feature Inventory). It edits **neither** `pwa/src/route.ts` / `SURFACES` **nor** `pwa/src/views/index.tsx` (sole-owned by `saas-operator-foundation`) and creates **no** view component file. This spec names **no** specific render destination as its deliverable; the deliverable is the **data** (C-04), surfaced by **whichever view a downstream spec owns (Explorer at minimum)** — no PWA source change is required or permitted here. (Note: `navigation-ia` removed the `#/business` surface after foundation landed, so no `#/business/functions` render is assumed here — see OQ-6; whichever view another spec owns renders the finance data.) | XD-05, blueprint Feature Inventory |

## UI/UX Requirements

**This spec ships no new view and no PWA source change (NFR-06).** It is a
content/data spec: journeys/activities/roles/systems/KPIs/stories/risks/DDD as
data under the SaaS-Operator root. Its content is surfaced by **existing** views
owned by other specs (Explorer, `FunctionMap` at `#/business/functions`, the
wave-3 `OperatorCockpit`), which are consumed, never edited or re-specced here.

- **Views owned by this spec:** none.
- **Views this content appears in (owned elsewhere, consumed):** Explorer (drill
  into the `Finance & Accounting` domain and its journeys/activities), `FunctionMap`
  (`#/business/functions`, journey/activity counts per domain), `OperatorCockpit`
  (`#/exec/operator`, finance KPI health / risk rollup — wave 3).
- **UX allowances (UX-01..UX-06):** **not applicable to this spec** — it introduces
  no view, no route, no gesture/pointer/keyboard handler, and no styling. The
  `Platforms & Input Modes` and `Native Conflicts` tables below are the explicit
  `(none)` rows required by the workflow, reflecting zero `pwa/` input handling.

## Scope Boundaries

**In scope:**
- The `shared/seed/saas-operator/finance-accounting.json` slice: six finance
  `UserJourney`s, their `Activity`s in `PRECEDES` order, `Role`s via `EXECUTES`,
  `System` links via `USES_SYSTEM`, `PART_OF` scoping under the pre-seeded
  `Finance & Accounting` domain — all with stable seed ids/seedKeys, idempotent,
  discovered by the foundation loader with zero loader edit.
- Finance operator KPIs created via `POST /api/v1/kpis`, each grounded in its
  canonical `MetricDefinition` via `MEASURES` (`linkKpiToMetric`): MRR, ARR, DSO,
  gross margin, burn, runway, cloud cost per tenant.
- Optional KPI↦graph alignment via existing `ALIGNED_TO`/`PARAM_BINDS`.
- User stories + Given/When/Then acceptance criteria via the story surface.
- Financial/compliance risks via `POST /api/v1/risk-register` and compliance rows
  via `POST /api/v1/compliance/rules` (B-01), created by a **self-owned, idempotent,
  API-driven seed script** (`api/scripts/seed-finance-risks.ts` + package script).
- DDD bounded-context mapping for the finance systems via the existing
  `ddd-system-modeling` routes/labels.
- The XD-10 mapping table (business action → label/edge → route → metric).

**Out of scope (owner named):**
- The SaaS-Operator root, the six domain roots, the shared System/Persona/Role
  catalog, the directory-iterating loader, the FR-06 governed-API seed helper
  mechanism → `saas-operator-foundation` (consumed, never re-created).
- The `MetricDefinition` label, the `MEASURES` edge type + its registration, the
  canonical metric seed catalog, and the `linkKpiToMetric` helper → `saas-metric-library`
  (consumed, never re-defined; the finance KPIs link to existing metrics).
- KPI/OKR node CRUD + all `kpi-*` route/storage code → `kpi-okr-governance` /
  `kpi-measurement-alignment` (this spec only *calls* `POST /api/v1/kpis` + the
  alignment edges as data).
- Story/AC label + route/storage code (`stories.ts`, `story-spec`) →
  `story-spec-core` (this spec only *calls* the story routes as data).
- Risk/compliance/change/SLA route + storage code (`risk-register.ts`,
  `risk-compliance.ts`, `compliance-rules.ts`, `change-requests.ts`, `sla-crud.ts`)
  → `risk-compliance-change` / `kpi-okr-governance` (this spec only *POSTs* to
  their routes as data — XD-04).
- DDD label + route/storage code (`ddd-system.ts`) → `ddd-system-modeling`
  (this spec only *calls* the DDD routes as data).
- `route.ts` / `SURFACES` / `views/index.tsx` + all views → `saas-operator-foundation`
  (XD-05); this spec ships no view.
- The **Cloud-Cost-per-Tenant `MetricDefinition`** if it is not already in the
  `saas-metric-library` frozen catalog → flagged to `saas-metric-library` (OQ-1),
  not added here.
- Sales pipeline / marketing funnel, and any `Funnel`/`Stage` construct →
  `sales-process-model` / `marketing-process-model` / `funnel-pipeline-modeling`.
- Cross-function aggregation + benchmark scoring over finance KPIs/risks →
  `cross-function-exec-rollup` / `function-benchmark-scoring` (wave 3).

## Mapping Table (XD-10 — skeleton; frozen complete in design)

One row per finance business action → companygraph representation. This skeleton
enumerates the shape and the mandatory coverage; the design freezes the complete
roster (exact ids/seedKeys, full activity/role/story/risk lists).

| Business action / concept | Node label (seedKey) | Edge (endpoints) | Governed route | Grounding metric (seedKey) |
|---------------------------|----------------------|------------------|----------------|----------------------------|
| Finance & Accounting function | `Domain` (`finance_accounting`, **pre-seeded by foundation FR-03**) | scoped `IN_MODEL`→SaaS-Operator root (foundation) | (resolved by lookup; not created here) | — |
| "Subscription Billing" journey | `UserJourney` (`fin-jrny-subscription-billing`) | `PART_OF` (UserJourney→Domain) | `POST /api/v1/import` (slice) | — |
| "Invoice Run" journey | `UserJourney` (`fin-jrny-invoice-run`) | `PART_OF` (UserJourney→Domain) | `POST /api/v1/import` | — |
| "Dunning" journey | `UserJourney` (`fin-jrny-dunning`) | `PART_OF` (UserJourney→Domain) | `POST /api/v1/import` | — |
| "Revenue Recognition" journey | `UserJourney` (`fin-jrny-rev-rec`) | `PART_OF` (UserJourney→Domain) | `POST /api/v1/import` | — |
| "Tax" journey | `UserJourney` (`fin-jrny-tax`) | `PART_OF` (UserJourney→Domain) | `POST /api/v1/import` | — |
| "FinOps / Cloud-Cost-per-Tenant" journey | `UserJourney` (`fin-jrny-finops`) | `PART_OF` (UserJourney→Domain) | `POST /api/v1/import` | — |
| e.g. "Charge computed" activity | `Activity` (`fin-act-charge-computed`) | `PART_OF` (→journey), `PRECEDES` (→next) | `POST /api/v1/import` | — |
| e.g. "Billing Operations" role executes billing activities | `Role` (`fin-role-billing-ops`) | `EXECUTES` (Role→Activity) | `POST /api/v1/import` | — |
| Stripe supports billing activities | `System` (shared `stripe`, **foundation FR-04**) | `USES_SYSTEM` (Activity→System) | `POST /api/v1/import` (edge only; node shared) | — |
| Ledger / GL supports rev-rec | `System` (`fin-sys-ledger`, slice-added) | `USES_SYSTEM` (Activity→System) | `POST /api/v1/import` | — |
| KPI "MRR" | `KPI` (via `POST /api/v1/kpis`, `domain_id`=finance) | `MEASURES` (KPI→MetricDefinition) | `POST /api/v1/kpis` + `linkKpiToMetric` | `metric-mrr` |
| KPI "ARR" | `KPI` | `MEASURES` | `POST /api/v1/kpis` + `linkKpiToMetric` | `metric-arr` |
| KPI "DSO" | `KPI` | `MEASURES` (+ optional `ALIGNED_TO` Dunning) | `POST /api/v1/kpis` + `linkKpiToMetric` | `metric-dso` |
| KPI "Gross Margin" | `KPI` | `MEASURES` | `POST /api/v1/kpis` + `linkKpiToMetric` | `metric-gross-margin` |
| KPI "Burn" | `KPI` | `MEASURES` | `POST /api/v1/kpis` + `linkKpiToMetric` | `metric-burn` |
| KPI "Runway" | `KPI` | `MEASURES` | `POST /api/v1/kpis` + `linkKpiToMetric` | `metric-runway` |
| KPI "Cloud Cost per Tenant" | `KPI` | `MEASURES` | `POST /api/v1/kpis` + `linkKpiToMetric` | **OQ-1** (cloud-cost-per-tenant metric) |
| Story "As Billing Ops, I …" | `UserStory` + `AcceptanceCriterion` (Given/When/Then) | story edges (`story-spec-core`) | `POST /api/v1/models/:modelId/stories` (+ AC) | — |
| Risk "Revenue leakage / billing error" | (Postgres `risk_register` row, `risk_type:financial`) | n/a (Postgres) | `POST /api/v1/risk-register` (self-owned script) | — |
| Risk "Rev-rec (ASC-606) error" | (Postgres `risk_register` row, `risk_type:compliance`) | n/a | `POST /api/v1/risk-register` | — |
| Compliance "Tax-filing deadline control" | (Postgres `compliance_rules` row) | n/a | `POST /api/v1/compliance/rules` (`handleCreateComplianceRule`; B-01) (OQ-2) | — |
| DDD "Billing & Payments" context | `BoundedContext` (`ddd-system-modeling`) — mapped from a `Capability`, not a `System` (C-01) | `setContext` (Capability→BoundedContext) **or** `system.attributes.boundedContext` tag (OQ-4) | `ddd-system-modeling` route (OQ-4) | — |

## Acceptance Criteria

<!-- Every AC traces to ≥1 FR. Platforms + Verification columns mandatory.
     Verification is a test path or manual:<input mode + observable outcome>.
     This spec has no pwa/ surface, so every Platform is server/CLI. -->

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | Loading `finance-accounting.json` via the foundation loader (`seed:saas-operator` → `POST /api/v1/import`) creates the six finance `UserJourney`s (`Subscription Billing`, `Invoice Run`, `Dunning`, `Revenue Recognition`, `Tax`, `FinOps / Cloud-Cost-per-Tenant`), each `PART_OF` the `Finance & Accounting` domain (resolved by `seedKey = finance_accounting`) scoped `IN_MODEL` to the SaaS-Operator root; **no** operational/transactional label or node is created (`Invoice`/`Subscription`/`Payment`/`Tenant`); `NODE_LABELS`/`EDGE_TYPES` unchanged (FR-01, NFR-01, NFR-04) | server (bun test + Neo4j) + CLI | `api/__tests__/finance-process-slice.integration.test.ts`; manual: `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts` — expect no additions |
| AC-02 | Each finance journey contains its **exact** design-frozen `Activity` roster, each `PART_OF` its journey and wired into an ordered `PRECEDES` chain (the chain is acyclic and matches the design table); the test asserts the activity set per journey **exactly** (no missing, no extra) (FR-02) | server (bun test + Neo4j) | `api/__tests__/finance-process-slice.integration.test.ts` |
| AC-03 | Finance `Role`s are linked to their activities via `EXECUTES` (Role→Activity) per the design table; roles present in the shared catalog are **referenced not duplicated** (no second `Role` node with the same shared `seedKey`); finance-specific roles added by the slice carry stable seed ids (FR-03) | server (bun test + Neo4j) | `api/__tests__/finance-process-slice.integration.test.ts` |
| AC-04 | Finance activities are linked to systems via `USES_SYSTEM` (Activity→System); **Stripe** is referenced by its shared foundation `seedKey` (no duplicate Stripe `System`), and slice-added finance systems (ledger/GL, tax engine, FinOps platform) carry stable seed ids and a valid `systemKind`; `USES_SYSTEM` endpoint validation passes (no `edge_endpoint_label_mismatch`) (FR-04) | server (bun test + Neo4j) | `api/__tests__/finance-process-slice.integration.test.ts` |
| AC-05 | The **six metric-grounded** finance KPIs are created via `POST /api/v1/kpis` with `domain_id` = the resolved `Finance & Accounting` domain id, and **each** is grounded in its canonical `MetricDefinition` via exactly one `MEASURES` edge (`linkKpiToMetric`): MRR→`metric-mrr`, ARR→`metric-arr`, DSO→`metric-dso`, Gross Margin→`metric-gross-margin`, Burn→`metric-burn`, Runway→`metric-runway`; a `MATCH (k:KPI)-[:MEASURES]->(m:MetricDefinition)` returns **exactly one** metric per these six finance KPIs. (The FinOps Cloud-Cost-per-Tenant KPI's grounding is gated on OQ-1 and asserted separately in **AC-15** — its metric is not yet in the `saas-metric-library` catalog, so it is excluded from this AC to keep AC-05 testable now.) (FR-05, FR-06; C-03) | server (bun test + Neo4j) | `api/__tests__/finance-kpis.integration.test.ts` |
| AC-06 | The KPI→metric link is created **only** via `MEASURES` (never `INSTANTIATES`); a second `MEASURES` link on the same finance KPI is rejected `kpi_metric_already_linked` (cardinality, via `linkKpiToMetric`); the module-pin `INSTANTIATES` lifecycle edge + its guard are **unaffected** (FR-06, NFR-03) | server (bun test + Neo4j) | `api/__tests__/finance-kpis.integration.test.ts` |
| AC-07 | At least one `UserStory` per finance journey is created via `POST /api/v1/models/:modelId/stories` **where `:modelId` is the resolved SaaS-Operator root model id** (`ensureOperatorRoot`, not hard-coded): a story on a finance activity **succeeds with `201`**, proving the finance activity is in the root model's scoped set (a control story posted under a non-root/other model id is rejected `404 story_activity_not_in_model`, proving the correct root id is required); each story is attached to a finance `Activity` and carries ≥ 1 `AcceptanceCriterion` with non-empty structured Given/When/Then clauses (a free-text/partial AC is rejected `acceptance_criterion_clause_required`, proving the structured path is used) (FR-08, B-02) | server (bun test + Neo4j) | `api/__tests__/finance-stories.integration.test.ts` |
| AC-08 | The self-owned API-driven risk/compliance seed script (`seed:finance-risks`) creates the finance risks via `POST /api/v1/risk-register` (each with `domain:"Finance & Accounting"` and `risk_type` in `{financial, compliance}`), each returning a `201` with a persisted id; the compliance rows (if modeled per OQ-2) are created via `POST /api/v1/compliance/rules` (`handleCreateComplianceRule`; B-01); **no** storage code under `risk-register.ts`/`risk-compliance.ts`/`compliance-rules.ts`/`change-requests.ts`/`sla-crud.ts` is edited (FR-09, FR-10, FR-11, NFR-03) | server (bun test + Postgres) + CLI | `api/__tests__/finance-risks.integration.test.ts`; manual: `git diff --stat` — expect no change under `api/src/routes/{risk-register,risk-compliance,compliance-rules,change-requests,sla-crud}.ts` |
| AC-09 | The risk/compliance seed script is **idempotent**: running `seed:finance-risks` twice creates the finance risk/compliance rows **once** (the second run adds zero rows, via the design-frozen lookup-before-create keyed on stable `name`/marker — OQ-3) (FR-11, NFR-02) | server (bun test + Postgres) | `api/__tests__/finance-risks.integration.test.ts` |
| AC-10 | The finance systems are mapped to DDD bounded contexts via the existing `ddd-system-modeling` routes/labels per the design table (e.g. Stripe/ledger→`Billing & Payments`/`General Ledger`), created with **no** edit to `ddd-system.ts` or DDD route code (FR-12, NFR-03) | server (bun test + Neo4j) + CLI | `api/__tests__/finance-ddd.integration.test.ts`; manual: `git diff --stat` — expect no change under DDD route/schema files |
| AC-11 | Loader idempotency + isolation: loading the finance slice twice yields **zero** net new nodes/edges (stable seed ids MERGE); the load never mutates retail Model #1's subgraph or any other function's slice — a pre/post `/api/v1/stats` diff for the retail root is zero across a full re-seed (FR-01, NFR-02) | server (bun test + Neo4j) | `api/__tests__/finance-process-slice.integration.test.ts` |
| AC-12 | Lifecycle-guard compatibility: `finance-accounting.json` contains **only** non-lifecycle rows (`UserJourney`/`Activity`/`Role`/`System` nodes; `PART_OF`/`PRECEDES`/`EXECUTES`/`USES_SYSTEM` edges) and loads via `POST /api/v1/import` without a `409 model_lifecycle_route_required`; a hand-constructed fixture with a lifecycle row/edge is rejected `409` with nothing written (FR-01, NFR-04) | server (bun test + Neo4j) | `api/__tests__/finance-process-slice.integration.test.ts` |
| AC-13 | Ownership boundary + transpile: `bun run typecheck` exits 0; `git diff --stat` confines this spec's edits to `shared/seed/saas-operator/finance-accounting.json`, the self-owned `api/scripts/seed-finance-risks.ts` (+ any thin helper it owns), its `package.json` script line, and its own `api/__tests__/finance-*.test.ts` files — **no** change to any schema array, route file, view file, `route.ts`/`SURFACES`/`views/index.tsx`, or owned-elsewhere storage code (NFR-01, NFR-03, NFR-06) | CLI | `bun run typecheck` exit 0; manual: `git diff --stat` — expect edits confined to the files listed |
| AC-15 | **FinOps Cloud-Cost-per-Tenant KPI grounding (gated on OQ-1).** Once OQ-1 is decided (recommended: `saas-metric-library` adds a canonical `metric-cloud-cost-per-tenant`), the FinOps `Cloud Cost per Tenant` KPI is created via `POST /api/v1/kpis` (`domain_id` = finance) and grounded via exactly one `MEASURES` edge to that metric (resolved by `seedKey`, `linkKpiToMetric`); `MATCH (k:KPI {…finops})-[:MEASURES]->(m:MetricDefinition {…})` returns exactly one row. This AC becomes testable only after OQ-1's metric lands — until then it is explicitly **blocked-on-OQ-1** and the FinOps KPI is not asserted grounded (C-03) (FR-06) | server (bun test + Neo4j) | `api/__tests__/finance-kpis.integration.test.ts` (added once OQ-1 metric exists; **blocked-on-OQ-1** until then) |
| AC-14 | The XD-10 **mapping table** in `requirements.md` (frozen complete in `design.md`) covers **every** authored element — each journey, activity, role, system, KPI↦metric grounding, story, risk, and DDD context — as a `(business action → label/seedKey → edge → route → metric)` row; a reviewer can trace each seeded element to exactly one mapping row (FR-13, XD-10) | CLI (doc review) | manual: open `.claude/specs/finance-accounting-process-model/design.md` § Mapping Table and confirm every node/edge in `finance-accounting.json` + every KPI/story/risk/DDD context created by the scripts appears as exactly one row (observable: 1:1 element↔row coverage, no orphan element) |

## Platforms & Input Modes

This spec touches **no** `pwa/` code and introduces **no** gesture, pointer,
scroll, focus, or keyboard handler. It is a server/data + seed-script spec. Its
content is surfaced by existing views owned by other specs (Explorer,
`FunctionMap`, `OperatorCockpit`), which this spec does not modify. The table
below is therefore the explicit all-`no` PWA row required by the workflow.

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| Seed slice load / seed scripts (CLI) | no | no | no | no | invoked via `bun run seed:*`; no PWA surface |
| Any PWA view / canvas / drag / keyboard | no | no | no | no | this spec ships no view and edits no `pwa/` file (NFR-06) |

## Native Conflicts

This spec introduces **no** gesture, scroll-container, focus-trap, or
keyboard-accelerator handling — it has no `pwa/` surface at all. The required
explicit `(none)` row:

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| (none) | n/a | n/a |

## Dependencies

- **saas-operator-foundation** (wave 1a — barrier): the SaaS-Operator
  `BusinessModel` **root model id** — a **consumed handle** resolved by lookup via
  `ensureOperatorRoot(driver)` (`api/src/seed/ensure-operator-root.ts`; matches
  `name:"SaaS Operator"` + `attributes.saasOperatorRoot === true`, never
  hard-coded) — **required as the `:modelId` for the story route** so finance
  activities are in `scopedNodeIds` (B-02); the pre-seeded `Finance & Accounting`
  `Domain` root (resolved by `seedKey = finance_accounting`, attached `IN_MODEL`
  to the operator root by `ensureFunctionDomains`); the shared System/Persona/Role
  catalog (Stripe, personas/roles referenced by `seedKey`/`name`); the
  directory-iterating loader (`seed-saas-operator.ts` → `POST /api/v1/import` →
  `realImport`) that discovers `finance-accounting.json` with zero loader edit;
  the **reusable governed-API seed helpers `seedRisk` / `seedComplianceRule`**
  exported from `api/src/seed/governed-seed-helper.ts` (raw POSTs, no dedup — this
  spec **imports** them and wraps a lookup-before-create dedup on top; C-02). All
  consumed, never edited.
- **saas-metric-library** (wave 1b): the canonical `MetricDefinition` catalog
  (`metric-mrr`/`metric-arr`/`metric-dso`/`metric-gross-margin`/`metric-burn`/
  `metric-runway`, seeded in `shared/seed/saas-metric-library/metrics.json`); the
  **`MEASURES`** runtime edge + its ensure (`api/src/seed/ensure-measures-edge.ts`);
  the `linkKpiToMetric` helper (`api/src/seed/link-kpi-metric.ts`) that enforces
  one-metric-per-KPI. Consumed; the finance KPIs link to existing metrics by
  `seedKey`. **Cloud-cost-per-tenant metric is OQ-1** (may not yet be in the
  frozen catalog — flag to `saas-metric-library`, do not add here).
- **kpi-okr-governance / kpi-measurement-alignment** (`api/src/routes/kpi-crud.ts`
  `handleKpiPost` via `POST /api/v1/kpis`, `kpiCreateRequestSchema`
  `shared/src/schema/kpi-sla.ts:155`; the `ALIGNED_TO`/`PARAM_BINDS` alignment
  edges): the KPI create + optional alignment paths (FR-05/FR-07). Called as data;
  never edited.
- **story-spec-core** (`api/src/routes/stories.ts`, `POST /api/v1/models/:modelId/stories`,
  `storyCreateSchema`/`acCreateSchema` `shared/src/schema/story-spec.ts`; the
  structured Given/When/Then AC path): the story/AC creation path (FR-08). Called
  as data; never edited.
- **risk-compliance-change** (`api/src/routes/risk-register.ts`
  `handleRiskRegisterCreate` via `POST /api/v1/risk-register`, `createRiskSchema`;
  `api/src/routes/compliance-rules.ts` **`handleCreateComplianceRule`** via
  **`POST /api/v1/compliance/rules`** (slash, not hyphen — the POST handler is
  `handleCreateComplianceRule`; `handleComplianceRules` is the GET-list handler;
  router `router.ts:590-591`), `complianceRuleSchema`) (B-01): the risk/compliance
  create paths (FR-09/FR-10). **POSTed to only** — never edited (XD-04).
- **ddd-system-modeling** (`BoundedContext` label + routes, `shared/src/schema/ddd-system.ts`):
  the DDD system-mapping path (FR-12). Called as data; never edited. **Exact write
  path confirmed at design time (OQ-4).**
- **graph-core** (`api/src/routes/import.ts` `realImport` behind `POST /api/v1/import`
  — the `{nodes,edges}` process-content route carrying the lifecycle guard
  `import.ts:167-185`; `api/src/routes/edges.ts` `handleEdgePost` for `MEASURES`
  via `linkKpiToMetric`; `POST /api/v1/query/cypher` `query:read` for lookups):
  the slice load path + the KPI→metric edge write + seedKey lookups.
- **Seed infrastructure** (`shared/seed/saas-operator/` directory, the foundation
  `seed:saas-operator` wiring, `api/scripts/` seed-script pattern, `package.json`
  scripts): where `finance-accounting.json` lands and where `seed-finance-risks.ts`
  is wired.

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | **OQ-1 (needs a check / possible cross-spec flag): the Cloud-Cost-per-Tenant `MetricDefinition` may not be in the frozen `saas-metric-library` catalog.** The blueprint names "cloud cost/tenant" as a finance KPI metric, but the as-built metric catalog (`shared/seed/saas-metric-library/metrics.json`) has 20 metrics (CAC, LTV, LTV:CAC, MRR, ARR, NRR, GRR, logo/revenue churn, CAC-payback, DSO, gross margin, burn, runway, rule-of-40, pipeline conversion, win rate, MTTR, uptime, deploy frequency) — **there is no explicit "cloud cost per tenant" row**. Per XD-06 this spec must **not** invent an ad-hoc metric. **Options:** (a) map the FinOps KPI to an existing metric (e.g. gross margin / a cost-efficiency metric) and drop the literal "cloud cost per tenant" metric; (b) **flag `saas-metric-library` to add a canonical `metric-cloud-cost-per-tenant`** (the correct XD-06 path — the metric is canonical/shared, owned there, not here); (c) create the KPI without a `MEASURES` grounding (violates XD-06 — rejected). **Author recommendation: (b)** — flag the missing canonical metric to `saas-metric-library`; the six other finance KPIs (MRR/ARR/DSO/gross-margin/burn/runway) all have existing metrics and are unblocked. | Determines whether the FinOps KPI can satisfy the FR-06 `MEASURES` grounding, and whether a cross-spec flag to `saas-metric-library` is needed. | **User decision.** Recommend (b): flag `saas-metric-library` to add `metric-cloud-cost-per-tenant`; this spec does not add the metric (XD-06 ownership). Pinned in FR-06/AC-05 once decided. |
| 2 | **OQ-2: model finance compliance obligations as `risk-register` rows, `compliance-rules` rows, or both?** FR-09 creates risks (with `risk_type:"compliance"` available in the as-built enum); FR-10 offers `compliance-rules` rows. Rev-rec/tax/SOX obligations could be either. `compliance-rules` requires a `rule_dsl` + `actions` (an evaluable rule), which may be heavier than a descriptive compliance risk. | Determines whether FR-10 is exercised and which routes AC-08 covers. | Design-time. **Author leans risk-register rows with `risk_type:"compliance"` for descriptive obligations**, reserving `compliance-rules` only where an evaluable rule (`rule_dsl`) genuinely fits; confirm with user. Low blast radius (both are governed-API-only). |
| 3 | **OQ-3: idempotency mechanism for the API-driven risk/compliance seed script.** `POST /api/v1/risk-register` server-generates the id (`uuidv4`) and does **no** MERGE/existence guard, so a naive re-run duplicates rows. The script must dedupe itself. **Options:** (a) lookup-before-create — `GET /api/v1/risk-register?...` (or a filtered list) matching on a stable `name` (+ `domain`) marker, create only if absent; (b) tag each seeded row with a stable marker in a filterable field and skip if present; (c) a delete-then-recreate pass. | Determines the FR-11/AC-09 idempotency implementation without editing owned-elsewhere code. | Design-time. **Author leans (a)** — lookup-before-create on `name`+`domain` via the existing `GET /api/v1/risk-register` filters (the route already supports `owner`/`domain`/`status`/`category` filters); no owned-elsewhere edit. Confirm the `compliance-rules` route exposes an equivalent list/filter for its idempotency, else fall back to (a) on its list. |
| 4 | **OQ-4: exact `ddd-system-modeling` write path for bounded contexts — the surface maps Capabilities, not Systems (C-01).** **Discovered mismatch:** the as-built DDD surface does **not** provide a `System→BoundedContext` write path. It maps **`Capability`s** into bounded contexts: `setContext(driver, modelId, capabilityId, boundedContextId)` with reads `GET models/:modelId/system-model/{gaps,context-map}` (`api/src/routes/capabilities.ts:46-148`, `api/src/storage/system-model.ts`). So FR-12 must **not** carry a "map a System into a context" premise. **Options:** (a) author finance `Capability`s and map those into the finance bounded contexts via the real `setContext` route (full DDD mapping, but adds Capability authoring to this content spec's scope); (b) the documented degrade — tag each finance `System` with a `system.attributes.boundedContext` value (lighter, no DDD-route dependency, no Capability authoring). | Determines FR-12/AC-10's write path; the old "map a System into a context" assumption would have touched a path that does not exist. | Design-time. Confirm `setContext`/`capabilities.ts` + `system-model.ts` and pick (a) or (b). **DDD mapping is `should`, not `must`**, so degrading to (b) does not block the mandatory pipeline; record the chosen path in the mapping table. Author leans (b) unless the design finds authoring finance Capabilities is cheap enough to prefer (a). |
| 5 | **Postgres risk/SLA seed path** (blueprint Risks). The finance risks land in Postgres, which has no `{nodes,edges}` import path; the tables may be empty with no loader. | Without a sanctioned path the spec is blocked or tempted to edit owned-elsewhere storage. | **Resolved by FR-11** — a self-owned, idempotent, **API-driven** seed script (`seed:finance-risks`) POSTing to the governed routes (foundation FR-06 pattern), **not** a storage-code edit. AC-08 proves the round-trip + boundary-clean `git diff`. |
| 6 | **`#/business` surface removed by `navigation-ia`.** After foundation landed, `navigation-ia` removed the `#/business` surface + the `FunctionMap` route seam (see `saas-metric-library` STATUS blocker). | This spec ships **no view**, so it is **not** directly blocked — the finance data is produced regardless and is reachable via Explorer / any restored `#/business/functions`. | No action needed here (NFR-06 already forbids any view/route edit). Noted so a reviewer does not expect a `#/business/functions` render as this spec's deliverable — the deliverable is the **data**, surfaced by whichever view another spec owns. App-level route restoration is a Phase C consolidation concern owned by foundation/`navigation-ia`. |
