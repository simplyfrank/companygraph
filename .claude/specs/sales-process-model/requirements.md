---
feature: "sales-process-model"
created: "2026-07-06"
author: "spec-author"
status: "revised"
size: "medium"
---

# Requirements: sales-process-model

## Summary

`sales-process-model` is a **wave-2 content spec** of the SaaS-Operator
business-process model (blueprint `.claude/specs/blueprint-saas-operator.md`),
depending on `saas-operator-foundation` (wave 1a), `saas-metric-library` and
`funnel-pipeline-modeling` (wave 1b). It authors the **Sales function** of the
docorg SaaS operator at **full-pipeline depth** (XD-10) as **content** under the
existing "SaaS Operator" `BusinessModel` root — it builds **no new machinery**.

It delivers **three owned artifacts** plus the ACs that prove them:

1. A **seed slice** `shared/seed/saas-operator/sales.json` — a `{nodes,edges}`
   process-content fixture discovered and loaded by the foundation's
   directory-iterating loader (`seed:saas-operator` → `POST /api/v1/import`,
   `saas-operator-foundation` FR-07) — containing **only the self-contained
   Sales nodes and intra-slice edges** it can author without a
   server-generated id: the Sales domain's **pipeline-stage user journeys**
   (demo → quote → close → tenant-provision), function-specific **activities**
   (with `PRECEDES` ordering), function-specific **roles**, function-specific
   **systems**, and **`KPI`** nodes. It contains **no** edge that references a
   foundation/library-seeded id (see the resolver, artifact 2) — because the
   foundation loader **throws on any per-row `errors[]`** (verified,
   `seed-saas-operator.ts:67-69`), so a single unresolvable-id edge row would
   abort the whole `seed:saas-operator` run (B-01).
2. A **feature-owned resolver entrypoint** `bun run seed:sales`
   (`api/scripts/seed-sales.ts`, a self-owned register-nothing/resolve-then-write
   sibling of the existing `api/scripts/seed-saas-metric-library.ts`, which this
   spec does **not** edit) — the **required** landing point for every write the
   static fixture cannot express (B-01, C-04). It resolves the
   foundation/library ids by `seedKey`/name lookup at runtime and, through the
   dependencies' **existing governed write paths**, creates: the
   cross-reference graph edges (`PART_OF`→Sales domain, `USES_SYSTEM`→CRM/MOMS,
   `EXECUTES` from shared roles, `NEEDS_CAPABILITY`/`SUPPORTED_BY`), the
   invariant-bearing links (`MEASURES` via `linkKpiToMetric`, `CONVERTS_TO` via
   the funnel-owned transition route, stories/ACs via the story-spec-core
   model-scoped routes, capabilities via the DDD create route), and the **Sales
   risk rows** via `POST /api/v1/risk-register` (using the foundation's
   governed-API seed helper, `saas-operator-foundation` FR-06). It writes the
   sales **Pipeline Funnel** instance (a `Funnel` with ordered `Stage`s and
   range-checked `CONVERTS_TO` conversion edges, `funnel-pipeline-modeling`),
   the **user stories + acceptance criteria** (`story-spec-core`), and the
   **DDD capability mapping** (`ddd-system-modeling`).
3. A **business-action → label/edge mapping table** (XD-10) in this document —
   the first-class, reviewable proof that the Sales function "maps onto the
   companygraph representation."

**Cross-entrypoint ordering (B-01, NFR-06):** the full Sales subgraph is
produced by the **sequence** `seed:saas-metric-library` (registers `MEASURES`,
seeds `MetricDefinition`s) → `seed:saas-operator` (ensures the Sales
domain/CRM/MOMS/shared roles, imports the id-free `sales.json`) → **`seed:sales`**
(resolves ids and writes every cross-reference edge, invariant-bearing link, and
risk row) — never by `seed:saas-operator` alone. NFR-03/AC-12 assert idempotency
**and completeness** across that whole sequence.

**Risks** for the Sales function are created **only via the governed
`risk-register` API** (XD-04) using the foundation's governed-API seed helper
(`saas-operator-foundation` FR-06) — this spec **never** edits
`risk-register.ts` or any risk/SLA/change/compliance code.

It ships **NO new views** (its content surfaces through the existing Explorer,
`#/business/functions` FunctionMap, `#/business/funnels` FunnelBoard, and
`#/exec` cockpit owned by other specs), **NO new PWA routes**, **NO new
compile-time or runtime labels/edges**, and **NO new REST routes** (it
instantiates constructs already registered by wave-1 and writes through their
existing routes), and it touches **no** `route.ts` / `SURFACES` /
`views/index.tsx` (sole-owned by `saas-operator-foundation`, XD-05). Its **only
new files** are the seed slice `shared/seed/saas-operator/sales.json`, the
feature-owned resolver `api/scripts/seed-sales.ts` (B-01/C-04 — required, not
optional, because the fixture cannot express id-referencing edges or governed-API
risks), and this spec's own tests. `seed:sales` calls only pre-existing
dependency write paths — it defines **no** new HTTP route, label, or edge type.

## Motivation

1. The blueprint's Feature Inventory row `sales-process-model` and **XD-10**
   ("full-pipeline depth is mandatory; the mapping is proven by an explicit
   mapping table") make this spec's core deliverable the demonstration that a
   real SaaS-operator Sales function — the demo→quote→close→tenant-provision
   pipeline — is fully expressible in companygraph's process representation
   (journeys, activities×roles, systems, KPIs↦metrics, funnels, stories/ACs,
   risks, DDD), with no gaps.
2. `cross-function-exec-rollup` (wave 3) rolls up per-function KPI health, funnel
   status, and a risk heatmap over the SaaS-Operator root; `function-benchmark-scoring`
   (wave 3) scores each function's metric-vs-benchmark coverage and
   system-automation level. Both are **empty for Sales** until this spec seeds
   the Sales domain's journeys/activities/KPIs/funnel/risks. This content is the
   precondition for the operator cockpit and benchmark report to show anything
   for Sales.
3. `funnel-pipeline-modeling` built the funnel **construct** but authored **no**
   funnel instance — the blueprint explicitly puts "the sales **pipeline** funnel"
   in this spec's scope. The `FunnelBoard` view (`#/business/funnels`) renders an
   empty state until a `Funnel` node exists in the SaaS-Operator model; this spec
   seeds the sales Pipeline Funnel so the board has content.
4. `saas-metric-library` built the canonical metric catalog (20 definitions);
   XD-06 makes it **law** that every operator KPI `MEASURES` a `MetricDefinition`
   rather than inventing ad-hoc metric semantics. This spec's Sales KPIs are the
   first real consumers of the win-rate and pipeline-conversion definitions
   (and surface the gap that sales-cycle / ACV / quota-attainment definitions do
   not yet exist — OQ-2).

## Functional Requirements

<!-- Priorities: must = full-pipeline mapping proof / wave-3 unblock depends on
     it; should = depth/polish. This is a CONTENT spec — every FR is satisfied by
     (a) self-contained node rows + intra-slice edges in
     shared/seed/saas-operator/sales.json, plus (b) cross-reference edges,
     invariant-bearing links, and governed-API risks created by the feature-owned
     seed:sales resolver through existing (owned-elsewhere) write paths (B-01). No
     new code machinery, no new route/label/edge type. -->
<!-- N-01: this spec uses MEASURES (never "INSTANTIATE") for KPI→MetricDefinition,
     per XD-06-erratum, throughout requirements + mapping table. -->

### Sales domain journeys, activities, roles (XD-10, process core)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **Sales pipeline-stage user journeys** are authored as `UserJourney` **node rows in `sales.json`** (self-contained, stable UUIDv7 ids), each linked `PART_OF` the **Sales** function `Domain` (the foundation-seeded domain carrying `attributes.seedKey = "sales"`, `saas-operator-foundation` FR-03) **by the `seed:sales` resolver** (the `PART_OF`→domain edge references the server-generated domain id, so it is created by the resolver at runtime, **not** as a fixture edge row — OQ-1(b)/B-01). The journeys cover the full pipeline as pipeline-stage journeys: at minimum **Prospect & Qualify**, **Demo**, **Quote & Propose**, **Negotiate & Close**, and **Tenant Provisioning / Handoff** (the demo→quote→close→tenant-provision pipeline the blueprint names). Each journey carries the standard node envelope (`id`, `name`, `description`, `attributes`). The Sales domain root itself is **not** re-created here (it is foundation-owned); the resolver only attaches journeys `PART_OF` it after resolving the domain id by `seedKey`. | must | XD-10, blueprint Feature Inventory |
| FR-02 | **Activities** are authored as `Activity` nodes, each `PART_OF` its parent `UserJourney`, and ordered within a journey via `PRECEDES` (`Activity`→`Activity`) where the pipeline has a defined step sequence (e.g. within Negotiate & Close: *Prepare contract → Send for signature → Countersign → Book the deal*). Activities are the concrete process steps of the sales pipeline (e.g. *Qualify lead (BANT)*, *Run product demo*, *Build quote*, *Present proposal*, *Handle objections*, *Close-won*, *Provision tenant on MOMS*). Each carries the standard envelope. `PRECEDES` expresses **sequence only**; stage-to-stage **conversion** is expressed on the funnel via `CONVERTS_TO` (FR-08), never conflated with `PRECEDES` (`funnel-pipeline-modeling` motivation 1). | must | XD-10, process core |
| FR-03 | **Roles × activities** — every activity is executed by at least one `Role` via an `EXECUTES` (`Role`→`Activity`) edge. Roles reuse the **foundation-shared** operator `Role` catalog by reference where one fits (the `sales_lead` "Sales Lead" role, `saas-operator-foundation` FR-05 / `saas-operator-catalog.ts`); function-specific Sales roles (e.g. **Account Executive**, **Sales Development Rep**, **Sales Engineer**, **Deal Desk**) are new `Role` **node rows in `sales.json`** with stable ids. **`EXECUTES` from a foundation-shared role** references that role's server-generated id, so it is created by the **`seed:sales` resolver** (after resolving by `seedKey`), **not** a fixture edge (B-01); `EXECUTES` from a function-specific slice role may be authored as a fixture edge (both endpoints are stable-id fixture nodes). The activities×roles coverage is the `EXECUTES` matrix XD-10 requires. | must | XD-10, `saas-operator-foundation` FR-05 |
| FR-04 | **CRM system usage** — activities that operate on the CRM are linked to the foundation-shared **CRM** `System` (`saas-operator-catalog.ts`, `seedKey = "crm"`) via `USES_SYSTEM` (`Activity`→`System`); the tenant-provisioning activity is linked to **MOMS** (`seedKey = "moms"`) likewise. The CRM/MOMS systems are **not** re-created here (foundation-shared, model-independent per `model-workspace-core` DEC-01); the `USES_SYSTEM`→CRM/MOMS edges reference their server-generated ids and are therefore created by the **`seed:sales` resolver** (after `seedKey` resolution), **not** fixture edges (B-01). The slice adds function-specific systems as new `System` nodes, each with a valid `systemKind` (`system-augmentation-model`): a **CPQ / quoting tool** is **non-optional** (FR-11's *Price and quote a deal* capability is `SUPPORTED_BY` it — Resolves: N-02), and an **e-signature service** is added if a real sales activity (contract signature) uses one. | must | XD-10, `saas-operator-foundation` FR-04 |

### Sales KPIs instantiating canonical metrics (XD-06)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-05 | **Every Sales `KPI` is grounded in a canonical `MetricDefinition` via `MEASURES`, created through the sole sanctioned path.** The Sales function's KPIs are authored as `KPI` nodes (the existing `KPI` label, `shared/src/schema/nodes.ts`) — carried as fixture rows in `sales.json` — bearing the KPI attribute envelope the as-built KPI subsystem uses (`category`, `unit`, `target_value`, `target_direction`, `measurement_frequency` — matching `commercial-domain.json`'s KPI shape; verified in review). Each KPI is linked to **exactly one** canonical `MetricDefinition` via the **`MEASURES`** edge (`KPI`→`MetricDefinition`, registered at runtime by `saas-metric-library` per **XD-06-erratum**). **Decision (Resolves: B-02, closes the OQ-4 branch for `MEASURES`): the `MEASURES` edge is created **only** via `saas-metric-library`'s `linkKpiToMetric(baseUrl, kpiId, metricId)` helper** (`api/src/seed/link-kpi-metric.ts`) from the `seed:sales` resolver — **never** as a raw `sales.json` edge row. That helper's header states it is the sole path ("content specs IMPORT this helper — there is no replicate-the-two-step alternative") and it runs the at-most-one cardinality pre-check; a raw import edge row would bypass that guard, so the fixture-row option is foreclosed, not open. No Sales KPI ships without a `MEASURES` edge (XD-06 — enforced by AC-05a: a KPI lacking a metric link fails the seed loudly). The specific KPI→metric bindings are split into FR-05a (buildable now) and FR-05b (metric-library-conditional). | must | XD-06, XD-06-erratum, blueprint Feature Inventory |
| FR-05a | **Unconditionally buildable Sales KPIs** — the KPIs whose canonical `MetricDefinition` already exists in the wave-1 library (verified present: `metric-win-rate`, `metric-pipeline-conversion`) are authored and `MEASURES`-linked now: a **win rate** KPI `MEASURES` `metric-win-rate`, and a **pipeline conversion** KPI `MEASURES` `metric-pipeline-conversion`. These ship regardless of OQ-2's resolution. | must | XD-06, `saas-metric-library` |
| FR-05b | **Metric-library-conditional Sales KPIs** — the three blueprint-named KPIs whose canonical `MetricDefinition` does **not** exist in the wave-1 library (verified absent: sales-cycle, ACV/average-contract-value, quota-attainment). **Upstream precondition (OQ-2):** these are `must` **conditional on** `saas-metric-library` adding the three definitions (`metric-sales-cycle`, `metric-acv`, `metric-quota-attainment`) to its canonical catalog — a bounded catalog addition owned by that spec (not authored here — XD-06 forbids inventing ad-hoc metric semantics outside the library). If that addition lands, each KPI `MEASURES` its new definition and FR-05b is `must`; if the user defers it, FR-05b degrades to **deferred** and this spec ships only the FR-05a KPIs, with the three named as an explicit follow-up — **no ungrounded KPI is ever authored** (AC-05a). This is a new upstream cross-spec dependency edge (not shown in the blueprint dependency graph) recorded in Dependencies + OQ-2. | must (conditional) | XD-06, `saas-metric-library` catalog addition (OQ-2) |
| FR-06 | **KPI→structure alignment** — each Sales KPI is bound to the process structure it measures via the existing KPI alignment edges: `ALIGNED_TO` (`KPI`→`UserJourney`/`Activity`/`Domain`) and/or `PARAM_BINDS` (`KPI`→`Activity`/`UserJourney`/`System`/`Domain`) per `kpi-measurement-alignment` (both are existing non-lifecycle edge types in `EDGE_ENDPOINTS`). E.g. **win rate** `ALIGNED_TO` the **Negotiate & Close** journey; **sales cycle** (if FR-05b lands) `ALIGNED_TO` the Sales domain; **ACV** `PARAM_BINDS` the *Build quote* activity. Alignment edges whose target is a fixture node (KPI→journey/activity, both in `sales.json`) may be fixture edge rows; an edge targeting the foundation-seeded Sales `Domain` (KPI→Domain) references the resolved domain id and is created by the `seed:sales` resolver (B-01). This makes each KPI's measurement subject explicit on the graph so the cockpit rollup can attribute KPI health to the Sales function. | should | XD-10, `kpi-measurement-alignment` FR-04/FR-08 |

### Sales Pipeline Funnel instance (funnel-pipeline-modeling)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-07 | **The sales Pipeline Funnel instance** is authored as a `Funnel` node named "Sales Pipeline" with its ordered `Stage` nodes (each `HAS_STAGE` from the funnel, `Funnel`→`Stage`) covering the pipeline stages **Lead → Qualified → Demo → Proposal → Negotiation → Closed-Won** (a strict **linear chain**, matching `funnel-pipeline-modeling`'s `must`-scope OQ-2 decision). Each `Stage` carries the integer `stageOrder` attribute its label's `json_schema_doc` requires (`funnel-pipeline-modeling` FR-02). The `Funnel`/`Stage` labels and `HAS_STAGE` edge are **already registered** by `funnel-pipeline-modeling` (this spec instantiates them from the `seed:sales` resolver, never registers them, XD-02). **Funnel scoping (Resolves: C-02 — OQ-3 pinned):** `funnel-pipeline-modeling` FR-09 (verified) scopes its funnel listing by **Cypher traversal from the active SaaS-Operator root** the shell provides (`attributes.saasOperatorRoot:true`, `saas-operator-foundation` OQ-1) — there is **no** `IN_MODEL`/scoping edge; a `Funnel` with no traversable path to the operator root would **never** appear in `FunnelBoard`. The `seed:sales` resolver therefore anchors the funnel so FR-09's traversal reaches it, using the concrete mechanism FR-09's listing query follows — **either** a `Funnel` attribute keyed to the operator model (`attributes.modelId` / `operatorSeedKey`, resolved at seed time) **or** an authored reachability edge that FR-09's traversal walks (e.g. anchoring the funnel to the Sales `Domain`/journey). The exact anchor is pinned at design against FR-09's shipped listing Cypher, but it is **not** open-ended: it must be whatever that query traverses. AC-07 asserts the funnel is returned by FR-09's **actual** listing query for the operator root and **not** for retail Model #1 — not merely that the `Funnel` node exists. | must | blueprint Feature Inventory, `funnel-pipeline-modeling` FR-01/FR-02/FR-03/FR-09 |
| FR-08 | **Stage-to-stage conversion edges** — consecutive stages are linked by `CONVERTS_TO` (`Stage`→`Stage`) edges carrying `conversionRate` and `dropOffRate` attributes, each a number in `[0,1]` (`funnel-pipeline-modeling` FR-05). **Write-path decision (Resolves: B-02 — closes the OQ-4 branch for `CONVERTS_TO`): the `CONVERTS_TO` edges are created **only** via the funnel-owned transition route** (`POST /api/v1/funnels/transitions`, `funnel-pipeline-modeling` FR-07) from the `seed:sales` resolver — **never** as raw `sales.json` edge rows. That route is the **sole** place the `[0,1]` range check lives (it returns `400 attribute_violation` on an out-of-range value); the foundation loader's `POST /api/v1/import` bypasses that validation, so a raw import edge row would store un-range-checked conversion data the cockpit rollup then trusts (`funnel-pipeline-modeling` motivation 4). Routing every `CONVERTS_TO` write through the funnel-owned route keeps the range guard authoritative. All seeded values are in `[0,1]` (AC-08), and AC-08 also asserts the guard actually fires on an out-of-range value. Conversion values are **descriptive** modeling data (illustrative pipeline conversion), consistent with XD-03's "process modeling, not operational records." | must | `funnel-pipeline-modeling` FR-05/FR-07/FR-08 |

### Stories + acceptance criteria (story-spec-core)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-09 | **User stories** for the Sales pipeline are authored as `UserStory` nodes (the runtime label registered by `story-spec-core` FR-01). **Write-path decision (Resolves: B-02 — closes the OQ-4 branch for stories): stories are created **only** via `story-spec-core`'s model-scoped route `POST /api/v1/models/:modelId/stories`** (FR-05) from the `seed:sales` resolver (`:modelId` = the SaaS-Operator root) — **never** as raw `sales.json` node rows. That route assembles `narrative` server-side from `{ persona, action, benefit }`, creates the `DESCRIBES_ACTIVITY` (+ optional `STORY_FOR_ROLE`) edges, and enforces the **write-side scope check** (`activityId ∈ scopedNodeIds(modelId)`, else `404 story_activity_not_in_model`, verified). Authoring stories as import rows would skip narrative assembly and the scope check. Each story links to the `Activity` it describes via `DESCRIBES_ACTIVITY` (`UserStory`→`Activity`) and to its executing `Role` via `STORY_FOR_ROLE` (`UserStory`→`Role`). **Cardinality (from `story-spec-core` FR-03, verified):** each story has **exactly one** `DESCRIBES_ACTIVITY` and **at most one** `STORY_FOR_ROLE`; an `Activity` may be the target of `1..*` stories. Each Sales pipeline activity of note gets at least one story (e.g. *"As an Account Executive, I want to build a quote from the qualified opportunity, so that I can present pricing without leaving the CRM."*). The route creates stories with `derived:false` (hand-authored content, not bootstrap-derived). | must | XD-10, `story-spec-core` FR-01/FR-03/FR-05 |
| FR-10 | **Acceptance criteria** are authored as `AcceptanceCriterion` nodes (`story-spec-core` FR-02) carrying **structured Given/When/Then** attributes `{ given, when, then, ordinal, derived }` (free-text ACs are rejected by the label schema), each linked to its parent story via `ACCEPTANCE_OF` (`AcceptanceCriterion`→`UserStory`, `story-spec-core` FR-04). **Write path (Resolves: B-02): ACs are created **only** via `story-spec-core`'s AC route (FR-06) under the parent story** from the `seed:sales` resolver — never as raw import rows — so the `given`/`when`/`then` non-empty enforcement (`acceptance_criterion_clause_required`) and the `ACCEPTANCE_OF` wiring are applied server-side. Every Sales story carries at least one AC with all three clauses non-empty (e.g. *Given a qualified opportunity, When the AE builds a quote, Then a draft quote line-item set is attached to the CRM record*). | must | XD-10, `story-spec-core` FR-02/FR-04/FR-06 |

### DDD capability mapping (ddd-system-modeling)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-11 | **DDD capability mapping** — the Sales function's business capabilities are authored as `Capability` nodes (the runtime label registered by `ddd-system-modeling` FR-01), e.g. **Qualify a lead**, **Price and quote a deal**, **Close a contract**, **Provision a tenant**. **Write-path decision (Resolves: B-02 — closes the OQ-4 branch for capabilities): capabilities are created **only** via `ddd-system-modeling`'s capability-create route** from the `seed:sales` resolver — **never** as raw `sales.json` node rows — because that route writes `CAPABILITY_IN_MODEL` **authoritatively in the create transaction** (`ddd-system-modeling` FR-04), guaranteeing every capability is scoped-from-birth to the operator root; a raw import `CAPABILITY_IN_MODEL` row would sidestep that guarantee. Each capability is wired to the process it enables via `NEEDS_CAPABILITY` (`Activity`→`Capability` and/or `UserStory`→`Capability`, `ddd-system-modeling` FR-02) and to the system that realizes it via `SUPPORTED_BY` (`Capability`→`System`, e.g. *Price and quote a deal* `SUPPORTED_BY` the **CPQ** system — which FR-04 therefore authors as a non-optional function-specific system (Resolves: N-02); *Provision a tenant* `SUPPORTED_BY` MOMS). Each capability is `CAPABILITY_IN_MODEL`-scoped to the SaaS-Operator root (`Capability`→`BusinessModel`) — the dedicated scoping edge that avoids the `IN_MODEL` lifecycle-guard collision. | must | XD-10, `ddd-system-modeling` FR-01/FR-02/FR-04 |

### Risks via governed API (XD-04)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-12 | **Sales risks via the governed `risk-register` API only** (XD-04). The Sales function's risks — e.g. **pipeline-coverage shortfall** (`operational`), **discount/margin leakage in Deal Desk** (`financial`), **CRM data-quality / forecast-accuracy** (`operational`), **key-person dependency on a top AE** (`strategic`) — are created as rows in the Postgres `risk_register` table **exclusively** by POSTing to `POST /api/v1/risk-register` (`handleRiskRegisterCreate`, `createRiskSchema`: `{ name, owner, domain, likelihood 1-5, impact 1-5, status, trend, risk_type, ... }`), via the foundation's governed-API seed helper (`saas-operator-foundation` FR-06). Each risk sets `domain:"Sales"` and an appropriate `risk_type`; where a risk links to a graph entity, `linked_entity_type`/`linked_entity_id` reference the Sales domain or a journey. This spec **never** edits `risk-register.ts` / `risk-compliance.ts` / `compliance-rules.ts` / `change-requests.ts` / `sla-crud.ts` (owned by `risk-compliance-change` / `kpi-okr-governance`). Because these are Postgres rows (not graph fixture rows), they are **not** part of `sales.json` — they are supplied through the helper from the **`seed:sales` resolver** (B-01), **deduped idempotently by a check-before-POST on `name` within `domain:"Sales"`** (`GET /api/v1/risk-register?domain=Sales`, then POST only absent names — OQ-5 resolved, NFR-03). Where a risk links to a graph entity, `linked_entity_type`/`linked_entity_id` reference the resolver-resolved Sales domain or a journey id. | must | XD-04, `saas-operator-foundation` FR-06, blueprint Feature Inventory |

### The mapping table (XD-10)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-13 | **Business-action → label/edge mapping table** (XD-10) is delivered as a first-class, reviewable artifact **in this requirements document** (the "Sales Function → Representation Mapping" section below) and kept in sync with `sales.json`. Every business action in the Sales pipeline maps to a concrete `(node label, edge type, endpoint)` in the companygraph representation, proving the function "maps onto the representation" with **no gap** — this is the core deliverable XD-10 makes first-class. | must | XD-10 |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | **No new machinery — content only.** This spec adds **zero** entries to `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS` in `shared/src/schema/{nodes,edges}.ts`, registers **zero** new runtime ontology labels/edge types, adds **zero** REST routes, and ships **zero** new PWA views/routes. It only **instantiates** constructs already registered by wave-1 specs and writes **content** (nodes/edges/Postgres risk rows) through their existing write paths. | XD-02, XD-10, blueprint Feature Inventory |
| NFR-02 | **Owned-elsewhere code is never edited.** This spec does **not** edit `route.ts` / `SURFACES` / `views/index.tsx` (`saas-operator-foundation`, XD-05), `api/scripts/seed-saas-operator.ts` / `api/scripts/seed-saas-metric-library.ts` or the foundation `ensure-*` modules (`saas-operator-foundation`), any funnel/metric/story/DDD **route or storage** code (`linkKpiToMetric`, the funnel transition route, the story-spec-core routes, the DDD create route are **called, never modified**), or any risk/SLA/change/compliance code (`risk-compliance-change` / `kpi-okr-governance`, XD-04). Its **definite** new files (Resolves: C-04) are the seed slice `shared/seed/saas-operator/sales.json`, the feature-owned resolver `api/scripts/seed-sales.ts` (**required** — B-01 — the sole landing point for id-referencing edges, invariant-bearing links, and governed-API risks; a self-owned sibling of `seed-saas-metric-library.ts`, wired as the `seed:sales` package script), and this spec's own tests. `seed-sales.ts` calls only pre-existing dependency write paths and defines no new route/label/edge type. | XD-04, XD-05, XD-08 |
| NFR-03 | **Idempotency + completeness + retail isolation, across the full seed sequence (Resolves: B-01, C-05).** The Sales subgraph is produced by the sequence `seed:saas-metric-library` → `seed:saas-operator` → `seed:sales` (NFR-06), **not** by `seed:saas-operator` alone. Re-running the **whole sequence** yields **zero** net new nodes/edges: the `sales.json` fixture rows carry stable ids → MERGE-on-id via `realImport`; the `seed:sales` resolver's route-created content is idempotent by construction — `MEASURES` via `linkKpiToMetric`'s built-in at-most-one guard; graph edges (`PART_OF`/`USES_SYSTEM`/`EXECUTES`/`CONVERTS_TO`/`HAS_STAGE`/capability edges) created with stable ids or guarded by an existence check; stories/ACs/capabilities skipped-if-present by a natural key; and **Postgres risk rows** (not MERGE-on-id) deduped by a **check-before-POST on `name` within `domain:"Sales"`** — the resolver first `GET /api/v1/risk-register?domain=Sales` (which returns all Sales rows, no name filter exists — verified), then POSTs only names not already present. No run mutates retail Business Model #1's subgraph or the retail/commercial seed files (XD-01). AC-12 runs the full sequence twice and asserts zero net new nodes/edges **and** zero duplicate risk rows. | XD-01, `saas-operator-foundation` NFR-02 |
| NFR-04 | **Lifecycle-guard compatibility.** `sales.json` loads through `POST /api/v1/import` (`realImport`), which rejects any lifecycle label (`BusinessModel`/`BusinessModule`/`BusinessModuleVersion`/`ModuleInstance`) or lifecycle edge (`IN_MODEL`/`HAS_VERSION`/`INSTANTIATES`/`INSTANCE_IN`/`FORKED_FROM`) with `409 model_lifecycle_route_required` and payload-atomic write-nothing (`saas-operator-foundation` FR-09). The fixture therefore contains **no** lifecycle rows: it never re-creates the `BusinessModel` root, never authors `IN_MODEL` scoping edges (domain scoping is foundation-owned; capability scoping uses the non-lifecycle `CAPABILITY_IN_MODEL`), and never authors an `INSTANTIATES` edge (KPI→metric uses `MEASURES`, not `INSTANTIATES` — XD-06-erratum). | XD-04, `saas-operator-foundation` FR-09 |
| NFR-05 | **House rules.** `zod` is the only validation library (the `seed:sales` resolver reuses existing boundary schemas via the dependencies' routes); no `tsc` (transpile via `bun run typecheck`); en-US identifiers throughout the fixture keys and any code; server binds loopback `127.0.0.1:8787`; auth via the central router gate + `api/src/auth/` only; all REST under `/api/v1/`. | CLAUDE.md |
| NFR-06 | **Cross-entrypoint ordering is required and stated (Resolves: B-01).** The full Sales subgraph requires **three** entrypoints to run in order: (1) `seed:saas-metric-library` (registers the `MEASURES` edge type + seeds `MetricDefinition`s, incl. the OQ-2 additions if landed) and (2) `seed:saas-operator` (ensures the Sales domain/CRM/MOMS/shared roles + imports the id-free `sales.json`) — both **before** (3) `seed:sales` (resolves foundation/library ids by `seedKey`/name and writes every `MEASURES`/`EXECUTES`/`USES_SYSTEM`/`PART_OF`/funnel/story/capability/risk that references a resolved id). `seed:sales` fails loudly (non-zero exit) if a required foundation/library id cannot be resolved (a signal the earlier steps did not run). This ordering is a design + package-script contract; AC-12/AC-16 exercise the full sequence. | B-01, `saas-metric-library` seed pattern |

## Sales Function → Representation Mapping (XD-10, delivers FR-13)

The explicit business-action → label/edge mapping proving the Sales function maps
onto the companygraph representation with no gap. `→` denotes an edge; the
endpoint pair is `(fromLabel → toLabel)`.

**Authoring split (B-01):** self-contained nodes (`UserJourney`/`Activity`/
function-specific `Role`/`System`/`KPI`) and their intra-slice edges are
**`sales.json` fixture rows**; every id-referencing cross-reference edge
(`PART_OF`→domain, `USES_SYSTEM`→CRM/MOMS, `EXECUTES` from shared roles,
KPI→Domain alignment) and every invariant-bearing construct (`MEASURES`,
`Funnel`/`Stage`/`CONVERTS_TO`, `UserStory`/`AcceptanceCriterion`, `Capability` +
its edges, risk rows) is created by the **`seed:sales` resolver** through the
owning spec's governed route. AC-14 audits coverage over the **whole seeded
subgraph** (fixture + resolver + risks), not `sales.json` alone (C-03).

| Business concept / action | Node label | Edge(s) to graph structure | Endpoint pair | Owning wave-1 spec |
|---------------------------|-----------|----------------------------|---------------|--------------------|
| Sales function (container) | `Domain` (foundation-seeded `seedKey:"sales"`) | scoped under operator root | `Domain → BusinessModel` via `IN_MODEL` (foundation-owned; **not** authored here) | `saas-operator-foundation` |
| Pipeline-stage journey (Prospect & Qualify, Demo, Quote & Propose, Negotiate & Close, Tenant Provisioning) | `UserJourney` | journey belongs to the Sales domain | `UserJourney → Domain` via `PART_OF` | graph-core |
| Pipeline step (Qualify lead, Run demo, Build quote, Present proposal, Close-won, Provision tenant) | `Activity` | step belongs to its journey; steps ordered | `Activity → UserJourney` via `PART_OF`; `Activity → Activity` via `PRECEDES` | graph-core |
| Who does the step (Account Executive, SDR, Sales Engineer, Deal Desk, shared Sales Lead) | `Role` | role executes the step | `Role → Activity` via `EXECUTES` | graph-core / `saas-operator-foundation` (shared `sales_lead`) |
| System the step uses (CRM, CPQ, e-signature; MOMS for provisioning) | `System` (CRM/MOMS foundation-shared; CPQ/e-sign function-specific) | step uses the system | `Activity → System` via `USES_SYSTEM` | graph-core / `saas-operator-foundation` |
| Sales KPI (win rate, sales cycle, ACV, quota attainment) | `KPI` | KPI measures a canonical metric; KPI aligned to the structure it measures | `KPI → MetricDefinition` via `MEASURES`; `KPI → UserJourney/Activity/Domain` via `ALIGNED_TO` / `PARAM_BINDS` | `saas-metric-library` (`MEASURES`, XD-06-erratum), `kpi-measurement-alignment` |
| Canonical metric definition (win rate, pipeline conversion) | `MetricDefinition` (foundation/library-seeded; **referenced**, not created here) | — | — | `saas-metric-library` |
| Sales Pipeline funnel (Lead→Qualified→Demo→Proposal→Negotiation→Closed-Won) | `Funnel` + `Stage` | funnel has ordered stages; stage converts to next stage with conversion/drop-off | `Funnel → Stage` via `HAS_STAGE`; `Stage → Stage` via `CONVERTS_TO` (`conversionRate`,`dropOffRate` ∈ `[0,1]`) | `funnel-pipeline-modeling` |
| User story (per pipeline activity) | `UserStory` | story describes an activity; story for a role | `UserStory → Activity` via `DESCRIBES_ACTIVITY`; `UserStory → Role` via `STORY_FOR_ROLE` | `story-spec-core` |
| Acceptance criterion (Given/When/Then) | `AcceptanceCriterion` | AC belongs to its story | `AcceptanceCriterion → UserStory` via `ACCEPTANCE_OF` | `story-spec-core` |
| Business capability (Qualify a lead, Price and quote, Close a contract, Provision a tenant) | `Capability` | activity/story needs it; system realizes it; capability scoped to model | `Activity/UserStory → Capability` via `NEEDS_CAPABILITY`; `Capability → System` via `SUPPORTED_BY`; `Capability → BusinessModel` via `CAPABILITY_IN_MODEL` | `ddd-system-modeling` |
| Sales risk (pipeline-coverage, discount leakage, CRM data-quality, key-person) | Postgres `risk_register` row (**not** a graph node) | created via governed API; may link to a graph entity | `POST /api/v1/risk-register` (`domain:"Sales"`, `linked_entity_*`) | `risk-register` (via `saas-operator-foundation` FR-06 helper) |

**No-gap assertion:** every row above resolves to a concrete construct that
exists in the wave-1 representation. **Authoring split (B-01, B-02):** rows whose
edge references a server-generated id (`PART_OF`→domain, `USES_SYSTEM`,
`EXECUTES` from shared roles) or whose write carries a governed invariant
(`MEASURES`, `CONVERTS_TO`, stories/ACs, capabilities, risks) are created by the
`seed:sales` resolver through the dependencies' governed routes — **not** as
`sales.json` rows; only the self-contained Sales nodes + intra-slice edges live
in the fixture. The one remaining **user decision** is where three named KPIs'
metric definitions come from (OQ-2 — a bounded `saas-metric-library` catalog
addition); FR-05a ships regardless, FR-05b is conditional on it. No business
concept in the Sales pipeline is left un-representable.

## Scope Boundaries

**In scope:**
- `shared/seed/saas-operator/sales.json` — the **self-contained** Sales fixture
  (no id-referencing edge, B-01): pipeline-stage `UserJourney`s, `Activity`s
  (with intra-slice `PRECEDES` ordering), function-specific `Role`s,
  function-specific `System`s (incl. non-optional CPQ), `KPI`s, and their
  intra-slice edges (both endpoints stable-id fixture nodes).
- `api/scripts/seed-sales.ts` — the **feature-owned `seed:sales` resolver**
  (B-01/C-04) that resolves foundation/library ids by `seedKey`/name and, through
  the dependencies' existing governed write paths, creates: the cross-reference
  edges (`PART_OF`→Sales domain, `USES_SYSTEM`→CRM/MOMS, `EXECUTES` from shared
  roles, KPI→Domain alignment); the **KPI→`MetricDefinition` `MEASURES`** links
  (via `linkKpiToMetric`); the sales `Funnel` + `Stage`s + range-checked
  `CONVERTS_TO` (via the funnel-owned transition route); the `UserStory`s +
  `AcceptanceCriterion`s (via the story-spec-core model-scoped routes); the
  `Capability`s + `NEEDS_CAPABILITY`/`SUPPORTED_BY`/`CAPABILITY_IN_MODEL` (via the
  DDD create route); and the **Sales risks** via `POST /api/v1/risk-register` (the
  foundation governed-API helper), deduped by `name` within `domain:"Sales"`.
- The **business-action → label/edge mapping table** (this document, FR-13).
- Integration tests that assert the seeded Sales subgraph, KPI↦metric links,
  funnel/conversion, stories/ACs, capabilities, governed-API risk rows, seed
  idempotency+completeness across the full sequence, and cross-entrypoint
  ordering.

**Out of scope (owner named):**
- The **Marketing** funnel + marketing journeys/KPIs → `marketing-process-model`.
- **Billing / subscription / invoice** process → `finance-accounting-process-model`.
- The `Funnel`/`Stage`/`HAS_STAGE`/`CONVERTS_TO` **construct code** + `FunnelBoard`
  **view** → `funnel-pipeline-modeling` (this spec only instantiates one funnel).
- The `MetricDefinition` label + `MEASURES` edge + the canonical metric **catalog**
  + `MetricLibrary` view → `saas-metric-library` (referenced, never created).
- The `UserStory`/`AcceptanceCriterion` labels + story routes + `StoryCatalog`
  view → `story-spec-core`; the `Capability` label + DDD routes + `SystemModeler`
  → `ddd-system-modeling` (instantiated, never re-specced).
- The `KPI` label + KPI CRUD + `ALIGNED_TO`/`PARAM_BINDS` edge code →
  `kpi-okr-governance` / `kpi-measurement-alignment` (referenced).
- **All** risk/SLA/compliance/change **route + storage code** → `risk-compliance-change`
  / `kpi-okr-governance` (this spec only *calls* `POST /api/v1/risk-register`).
- The SaaS-Operator root, the six function `Domain` roots, the shared
  System/Persona/Role catalog, and the directory-iterating loader →
  `saas-operator-foundation` (consumed, never re-implemented or edited).
- `OperatorCockpit` rollup (`#/exec/operator`) + `BenchmarkReport` → wave-3
  specs (they read this content; this spec builds no view).
- `route.ts` / `SURFACES` / `views/index.tsx` → `saas-operator-foundation` (XD-05).

## Acceptance Criteria

<!-- Every AC traces to ≥1 FR. This spec touches NO pwa/, NO gestures/keyboard/
     input handlers — it is server-side seed content — so a Platforms & Input
     Modes table and a Native Conflicts table are NOT required (see the note
     under Platforms & Input Modes). Platforms + Verification columns are still
     provided for every AC. -->

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | After the full seed sequence (`seed:saas-metric-library` → `seed:saas-operator` → `seed:sales`), the Sales function `Domain` (`seedKey:"sales"`) has the full-pipeline `UserJourney`s (Prospect & Qualify, Demo, Quote & Propose, Negotiate & Close, Tenant Provisioning), each `PART_OF` the Sales domain (the `PART_OF`→domain edge created by the `seed:sales` resolver, B-01); the Sales domain itself is not duplicated (exactly one `Domain{seedKey:"sales"}`) (FR-01, NFR-03) | server (bun test + Neo4j) | `api/__tests__/sales-journeys.integration.test.ts` |
| AC-02 | Every Sales `Activity` is `PART_OF` a Sales `UserJourney`, and journeys with a defined step order have `PRECEDES` chains between consecutive activities (e.g. the Negotiate & Close step sequence); no `Activity` is orphaned (FR-02) | server (bun test + Neo4j) | `api/__tests__/sales-activities.integration.test.ts` |
| AC-03 | Every Sales `Activity` has ≥1 `EXECUTES` edge from a `Role`; the shared `sales_lead` role is referenced (not duplicated) and function-specific roles (AE/SDR/SE/Deal Desk) exist; each activity's role coverage is non-empty (FR-03) | server (bun test + Neo4j) | `api/__tests__/sales-roles.integration.test.ts` |
| AC-04 | CRM-operating activities are `USES_SYSTEM`-linked to the foundation-shared **CRM** system (referenced by resolved id, not duplicated), and the tenant-provisioning activity is `USES_SYSTEM`-linked to **MOMS**; any function-specific system carries a valid `systemKind` (FR-04) | server (bun test + Neo4j) | `api/__tests__/sales-systems.integration.test.ts` |
| AC-05 | Each Sales `KPI` `MEASURES` edge is created **via `linkKpiToMetric`** (the sole sanctioned path, B-02), not via a raw import edge row: **win rate** measures `metric-win-rate` and **pipeline conversion** measures `metric-pipeline-conversion` (FR-05a); a second `MEASURES` on the same KPI is rejected by the helper's at-most-one guard; and `grep '"MEASURES"' shared/seed/saas-operator/sales.json` returns no matches (the fixture never authors a `MEASURES` row) (FR-05, FR-05a, XD-06) | server (bun test + Neo4j) + CLI | `api/__tests__/sales-kpi-metric.integration.test.ts`; manual: `grep '"MEASURES"' shared/seed/saas-operator/sales.json` — expect no matches |
| AC-05a | **No ungrounded KPI (C-01):** after the full seed sequence, **every** Sales `KPI` node has ≥1 `MEASURES` edge to a `MetricDefinition` — a test enumerates all Sales-domain KPIs and fails if any lacks a metric link; the FR-05b KPIs (sales-cycle/ACV/quota-attainment) appear **only** if their `metric-*` definitions exist in the library (OQ-2 landed), and are absent (not ungrounded) if deferred (FR-05, FR-05a, FR-05b) | server (bun test + Neo4j) | `api/__tests__/sales-kpi-metric.integration.test.ts` |
| AC-06 | Each Sales `KPI` is bound to the process structure it measures via ≥1 `ALIGNED_TO` or `PARAM_BINDS` edge to a Sales `UserJourney`/`Activity`/`Domain` (FR-06) | server (bun test + Neo4j) | `api/__tests__/sales-kpi-metric.integration.test.ts` |
| AC-07 | The "Sales Pipeline" `Funnel` exists with ordered `Stage`s (Lead→Qualified→Demo→Proposal→Negotiation→Closed-Won) each carrying an integer `stageOrder`, all linked `HAS_STAGE` from the funnel; the funnel is **returned by `funnel-pipeline-modeling` FR-09's actual active-model-scoped listing query** (traversed from the SaaS-Operator root, not a bare `MATCH (:Funnel)`) and is **excluded** when that same listing is scoped to retail Model #1 — proving the C-02 anchor makes it reachable from the operator root only (FR-07, NFR-03) | server (bun test + Neo4j) | `api/__tests__/sales-funnel.integration.test.ts` |
| AC-08 | Consecutive stages are `CONVERTS_TO`-linked (created via the funnel-owned transition route, B-02) with `conversionRate` and `dropOffRate` both in `[0,1]`; a read of each transition returns them intact; the overall funnel conversion (product of per-transition `conversionRate`) is computable per `funnel-pipeline-modeling` FR-11; and the range guard is real — POSTing a `CONVERTS_TO` transition with an out-of-range value (e.g. `conversionRate:1.5`) to the funnel-owned route is rejected `400 attribute_violation`, and `grep '"CONVERTS_TO"' shared/seed/saas-operator/sales.json` returns no matches (no raw fixture row bypasses the guard) (FR-08) | server (bun test + Neo4j) + CLI | `api/__tests__/sales-funnel.integration.test.ts`; manual: `grep '"CONVERTS_TO"' shared/seed/saas-operator/sales.json` — expect no matches |
| AC-09 | Each notable Sales activity has ≥1 `UserStory` (`derived:false`, created via `POST /api/v1/models/:modelId/stories` — B-02) with a server-assembled `narrative`, linked `DESCRIBES_ACTIVITY` to that activity and `STORY_FOR_ROLE` to its executing role; **each story has exactly one `DESCRIBES_ACTIVITY` and at most one `STORY_FOR_ROLE`** (story-spec-core FR-03 cardinality) and its `activityId` is a member of `scopedNodeIds(operatorRoot)` (a story create with an out-of-scope activity is rejected `404 story_activity_not_in_model`); each story has ≥1 `AcceptanceCriterion` with non-empty `given`/`when`/`then` linked `ACCEPTANCE_OF`; and `grep -E '"UserStory"\|"AcceptanceCriterion"' shared/seed/saas-operator/sales.json` returns no matches (FR-09, FR-10) | server (bun test + Neo4j) + CLI | `api/__tests__/sales-stories.integration.test.ts`; manual: `grep -E '"UserStory"\|"AcceptanceCriterion"' shared/seed/saas-operator/sales.json` — expect no matches |
| AC-10 | The Sales `Capability`s (Qualify a lead, Price and quote, Close a contract, Provision a tenant) exist (created via the DDD capability-create route — B-02), each `NEEDS_CAPABILITY`-linked from ≥1 Sales `Activity`/`UserStory`, `SUPPORTED_BY`-linked to a `System` where applicable (*Price and quote* → CPQ, *Provision a tenant* → MOMS), and each has **exactly one `CAPABILITY_IN_MODEL` edge, targeting the SaaS-Operator root and no other `BusinessModel`** (authoritative scoping, verified against retail Model #1 absence); `grep '"Capability"' shared/seed/saas-operator/sales.json` returns no matches (FR-11) | server (bun test + Neo4j) + CLI | `api/__tests__/sales-capabilities.integration.test.ts`; manual: `grep '"Capability"' shared/seed/saas-operator/sales.json` — expect no matches |
| AC-11 | Sales risks are created **only** via `POST /api/v1/risk-register`: after the seed step, `GET /api/v1/risk-register?domain=Sales` returns the Sales risk rows (pipeline-coverage, discount leakage, CRM data-quality, key-person) each with valid `likelihood`/`impact`/`status`/`risk_type`; **no** risk/SLA/compliance route or storage file was edited (FR-12, NFR-02) | server (bun test + Postgres) + CLI | `api/__tests__/sales-risks.integration.test.ts`; manual: `git diff --stat api/src/routes/{risk-register,risk-compliance,compliance-rules,change-requests,sla-crud}.ts api/src/storage/postgres/*` — expect no change |
| AC-12 | Seed idempotency + completeness + isolation (B-01, C-05): running the **full sequence** `seed:saas-metric-library` → `seed:saas-operator` → `seed:sales` **twice** yields zero net new nodes/edges for the Sales subgraph (fixture stable ids MERGE; resolver route-writes are existence/natural-key guarded) **and** zero duplicate Sales risk rows (`GET /api/v1/risk-register?domain=Sales` returns the same count after the second run — dedupe by `name` within `domain:"Sales"`); the test also asserts the subgraph is **complete** after the sequence (cross-reference edges `PART_OF`/`USES_SYSTEM`/`EXECUTES`/`MEASURES` are present — they are produced by `seed:sales`, not `seed:saas-operator` alone); a pre/post `/api/v1/stats` diff attributable to a re-run is zero for the retail root (FR-01..FR-11, NFR-03, NFR-06) | server (bun test + Neo4j + Postgres) | `api/__tests__/sales-seed-idempotency.integration.test.ts` |
| AC-13 | Lifecycle-guard compatibility: `sales.json` contains **no** lifecycle label/edge row (no `BusinessModel`/`ModuleInstance`/…, no `IN_MODEL`/`INSTANTIATES`/… edge); loading it via `POST /api/v1/import` succeeds and writes the Sales content; a hand-mutated fixture with a lifecycle row is rejected `409 model_lifecycle_route_required` with nothing written (NFR-04) | server (bun test + Neo4j) + CLI | `api/__tests__/sales-seed-lifecycle-guard.integration.test.ts`; manual: `grep -E '"IN_MODEL"|"INSTANTIATES"|"BusinessModel"|"ModuleInstance"' shared/seed/saas-operator/sales.json` — expect no matches |
| AC-14 | The mapping table (this document, FR-13) covers every business concept in the **whole seeded Sales subgraph** (post-`seed:sales`: fixture rows + resolver-created edges + governed-API risk rows — **not** `sales.json` alone, Resolves: C-03): the audit confirms **every authored construct** (each distinct node label + edge type across the fixture and the resolver's writes, plus the Postgres risk rows) appears in a mapping-table row, and every mapping-table row is instantiated **except** the rows explicitly marked "referenced, not authored here" (`Domain`, `MetricDefinition` — foundation/library-seeded). It does **not** require a bijection over `sales.json`'s distinct-type set (the id-referencing edge types deliberately do not appear in the fixture) (FR-13) | server (bun test + Neo4j + Postgres) | `api/__tests__/sales-mapping-coverage.integration.test.ts` — cross-checks the distinct label/type set of the seeded Sales subgraph against the mapping-table rows, allowing the two reference-only rows |
| AC-15 | No new machinery: `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS` in `shared/src/schema/{nodes,edges}.ts` are unchanged; **no** new runtime ontology label/edge type is registered by this spec; **no** new REST route, PWA view, or PWA route is added; `route.ts`/`SURFACES`/`views/index.tsx`, the foundation loader (`seed-saas-operator.ts`), `seed-saas-metric-library.ts`, and the `ensure-*` modules are untouched; `bun run typecheck` is clean (NFR-01, NFR-02, NFR-05) | CLI | `bun run typecheck` exit 0; manual: `git diff --stat` — expect changes confined to `shared/seed/saas-operator/sales.json`, the feature-owned resolver `api/scripts/seed-sales.ts` (its definite owned file, C-04), the `seed:sales` package-script line, and this spec's own tests; no schema-array, `route.ts`, `SURFACES`, `views/index.tsx`, foundation-loader, `seed-saas-metric-library.ts`, or risk/funnel/metric/story/DDD route/storage edits |
| AC-16 | Cross-entrypoint ordering (NFR-06, B-01): running `seed:sales` **before** `seed:saas-operator` (so the Sales domain / shared roles / CRM are not yet ensured, or `seed:saas-metric-library` has not registered `MEASURES`) fails loudly with a non-zero exit and a clear "unresolved foundation/library id" error — it never writes a partial subgraph; running the full sequence in order succeeds (FR-05, FR-09, NFR-06) | server (bun test) + CLI | `api/__tests__/sales-seed-ordering.integration.test.ts` |

## Platforms & Input Modes

**Not applicable — this spec touches no `pwa/`, no gestures, no keyboard/input
handlers.** `sales-process-model` is a **server-side content spec**: its
deliverables are a seed-slice JSON fixture, governed-API risk rows, and a mapping
table. It ships **no** view, **no** route, and **no** interactive surface; its
content is *rendered* by views owned by other specs (Explorer, `FunctionMap`,
`FunnelBoard`, `OperatorCockpit`), which carry their own Platforms & Input Modes
and Native Conflicts tables. Per the spec-workflow size/promotion rule, the
Platforms & Input Modes and Native Conflicts tables are required only when a spec
touches `pwa/` or input handling — this one does neither, so they are recorded as
**n/a** rather than fabricated. (If OQ-6 elected an in-view sales authoring
surface it would flip this — but that is explicitly out of scope.)

## Native Conflicts

Not applicable — no gesture, scroll, keyboard, or focus handling is introduced
(this spec ships no interactive surface).

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| (none) | n/a | n/a |

## Dependencies

- **saas-operator-foundation** (`.claude/specs/saas-operator-foundation/`): the
  SaaS-Operator `BusinessModel` root (found by `name:"SaaS Operator"` +
  `attributes.saasOperatorRoot:true`, that spec's OQ-1); the **Sales** function
  `Domain` (`attributes.seedKey:"sales"`, FR-03) this slice attaches journeys
  under; the shared **CRM**/**MOMS** `System`s and `sales_lead` `Role` +
  `sales_owner` `Persona` (`saas-operator-catalog.ts`) referenced by resolved id;
  the **directory-iterating loader** (`api/scripts/seed-saas-operator.ts` →
  `POST /api/v1/import`) that discovers and loads `sales.json` (FR-01, verified:
  the loader posts each fixture's raw body with **no id-substitution** — the
  crux of OQ-1); and the **governed-API seed helper** (FR-06) this spec uses to
  create risk rows (FR-12).
- **saas-metric-library** (`.claude/specs/saas-metric-library/`): the canonical
  `MetricDefinition` catalog (`metric-win-rate`, `metric-pipeline-conversion`
  seeded — FR-05a; sales-cycle/ACV/quota **absent** — OQ-2); the **`MEASURES`**
  edge type (`KPI`→`MetricDefinition`, XD-06-erratum) and the `linkKpiToMetric`
  write path (`api/src/seed/link-kpi-metric.ts`, cardinality-guarded) which is the
  **sole** `MEASURES` path (FR-05, B-02); and the `seed:saas-metric-library`
  register-then-import entrypoint whose fixture pattern this spec's `seed:sales`
  resolver mirrors. **Upstream precondition (C-01, conditional):** if OQ-2 is
  resolved as "add three definitions," `saas-metric-library` must land
  `metric-sales-cycle` / `metric-acv` / `metric-quota-attainment` before FR-05b's
  KPIs can ship — a **new cross-spec dependency edge** not shown in the blueprint
  dependency graph, and `saas-metric-library` is already `revised` (a catalog
  addition would reopen it). FR-05a is unblocked regardless.
- **funnel-pipeline-modeling** (`.claude/specs/funnel-pipeline-modeling/`): the
  `Funnel`/`Stage` labels, `HAS_STAGE`/`CONVERTS_TO` edge types, the
  `[0,1]`-range `conversionRate`/`dropOffRate` contract, the funnel-owned
  transition route `POST /api/v1/funnels/transitions` (FR-07 — the sole
  range-checked `CONVERTS_TO` write path, which the resolver uses, B-02), and the
  **active-model-scoped funnel listing** (FR-09, verified: scoped by Cypher
  traversal from the operator root, no scoping edge — the C-02 anchor mechanism).
  This spec instantiates the **sales Pipeline Funnel** via the resolver; it
  registers nothing.
- **story-spec-core** (`.claude/specs/story-spec-core/`): the `UserStory`/
  `AcceptanceCriterion` labels, the `DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE`/
  `ACCEPTANCE_OF` edges, the model-scoped story routes
  (`POST /api/v1/models/:modelId/stories` — which assembles `narrative`
  server-side, wires the edges, and enforces `activityId ∈ scopedNodeIds(modelId)`
  → `404 story_activity_not_in_model`; the AC route enforcing non-empty
  Given/When/Then), and the **verified cardinality** (FR-03: each story exactly-one
  `DESCRIBES_ACTIVITY`, at-most-one `STORY_FOR_ROLE`; an `Activity` `1..*` stories).
  The `seed:sales` resolver creates all Sales stories/ACs through these routes
  (FR-09/FR-10, B-02) — never as import rows.
- **ddd-system-modeling** (`.claude/specs/ddd-system-modeling/`): the `Capability`
  label, `NEEDS_CAPABILITY`/`SUPPORTED_BY`/`CAPABILITY_IN_MODEL` edges, and the
  capability-create route that writes `CAPABILITY_IN_MODEL` **authoritatively in
  the create transaction** (`ddd-system-modeling` FR-04) — the reason the
  `seed:sales` resolver creates every Sales `Capability` through that route, never
  as an import row (FR-11, B-02).
- **kpi-measurement-alignment** (`ALIGNED_TO`/`PARAM_BINDS` edge endpoints,
  `EDGE_ENDPOINTS`) + **kpi-okr-governance** (`KPI` label + KPI CRUD): the KPI
  node and its alignment edges (FR-05/FR-06). Referenced, never edited.
- **risk-register API** (`api/src/routes/risk-register.ts`
  `handleRiskRegisterCreate` behind `POST /api/v1/risk-register`,
  `createRiskSchema`; Postgres `risk_register` table): the sole path for Sales
  risks (FR-12). Called, never edited (owned by `risk-compliance-change`).
- **graph-core** (`api/src/routes/import.ts` `realImport` behind
  `POST /api/v1/import` with the lifecycle-guard pre-scan; `/api/v1/nodes/:label`,
  `/api/v1/edges`, `/api/v1/query/cypher`; MERGE-on-id upsert): the fixture load
  path + any post-import content writes.

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | **OQ-1 — DECIDED (option b), Resolves: B-01.** The static `sales.json` fixture cannot reference the server-generated ids of foundation/library-seeded nodes, and the fixture's placement in `shared/seed/saas-operator/` means the foundation loader imports it and **throws on any per-row `errors[]`** (verified, `seed-saas-operator.ts:67-69`) — so the id-referencing edges must be **completely absent** from `sales.json`, not merely templated. Options (a) stand-in duplicate nodes and (c) foundation loader templating are **rejected** (a duplicates the shared catalog / fails AC-03/AC-04; c is a foundation edit this spec cannot make, XD-05/NFR-02). **Decision: option (b)** — this spec ships the **feature-owned `seed:sales` resolver** (`api/scripts/seed-sales.ts`, sibling of `seed-saas-metric-library.ts`) that resolves foundation/library ids by `seedKey`/name at runtime and creates every cross-reference edge + invariant-bearing link + risk row through the dependencies' existing governed write paths, leaving `sales.json` to hold only self-contained Sales nodes + intra-slice edges. This is now pinned in the Summary, FR-01/FR-03/FR-04/FR-05/FR-08/FR-09/FR-10/FR-11/FR-12, NFR-02, NFR-03, NFR-06, and AC-12/AC-16. **No open question remains** — the loader's throw-on-error behavior makes (b) the only workable option. | Was: entire `sales.json` structure + whether a feature-owned seed step ships. | **Closed in FR-01/…/FR-12, NFR-02/03/06, AC-12/16.** `seed:sales` is a definite owned file. |
| 2 | **OQ-2 (BLOCKING — the sole remaining user decision): three of the four named Sales KPIs have no canonical `MetricDefinition`.** Verified: the wave-1 metric library seeds 20 metrics including `metric-win-rate` and `metric-pipeline-conversion`, but **not** sales-cycle, ACV (average contract value), or quota attainment — yet XD-06 makes it **law** that every operator KPI `MEASURES` a `MetricDefinition`. **Options:** **(a)** flag a gap to `saas-metric-library` to **add** three definitions (Sales Cycle, ACV, Quota Attainment) to its canonical catalog — the clean XD-06-compliant path, but it is an edit to a spec this one does not own (mirrors `saas-operator-foundation` OQ-3: "a governed dependency missing a field is a gap flagged to the owning spec, not fixed here") and `saas-metric-library` is already `revised` (a catalog addition reopens it); **(b)** define the three as **new `MetricDefinition` nodes authored in this slice** — rejected, would put function-specific metric semantics outside the canonical library, violating XD-06's "content specs must not invent ad-hoc metric semantics"; **(c)** drop the three KPIs, seed only win-rate + pipeline-conversion — rejected, the blueprint names all four. **Author recommendation: (a)** — surface the three missing metrics to `saas-metric-library` as a bounded catalog addition (formula/unit/category/benchmark), then this spec's FR-05b KPIs `MEASURES` them by `seedKey`. **Scope is now split so this OQ does not block the whole spec (C-01):** FR-05a (win-rate + pipeline-conversion) is unconditional; FR-05b (the three) is `must` **conditional on** the catalog addition and degrades to deferred otherwise. AC-05a guarantees **no ungrounded KPI ever ships** regardless of which way OQ-2 lands. | Determines FR-05b scope: whether three more Sales KPIs ship, and whether a metric-library catalog addition is an upstream precondition. | **User decision required (recorded as a new upstream dependency edge, C-01).** Recommend (a). If deferred, FR-05a still ships. |
| 3 | **OQ-3 — PINNED, Resolves: C-02.** `funnel-pipeline-modeling` FR-09 (verified) scopes its funnel listing by **Cypher traversal from the active SaaS-Operator root** — there is **no** scoping edge. A seeded `Funnel` with no path to the operator root would never appear in `FunnelBoard`. **Decision:** the `seed:sales` resolver anchors the funnel using whatever FR-09's shipped listing query traverses (a `Funnel` attribute keyed to the operator model, e.g. `attributes.modelId`/`operatorSeedKey`, or an authored reachability edge FR-09 walks). The exact anchor is finalized at design **against FR-09's shipped Cypher** — not open-ended; AC-07 asserts the funnel is returned by FR-09's actual query for the operator root and excluded for retail Model #1. | Determines the funnel's anchor in the resolver (FR-07) and whether AC-07 holds. | **Pinned in FR-07/AC-07.** Design confirms the exact attribute/edge against FR-09's listing query. |
| 4 | **OQ-4 — RESOLVED per construct, Resolves: B-02.** Each invariant-bearing construct is created through its **governed route** from the `seed:sales` resolver, never as a raw import row, so no invariant is bypassed: `MEASURES` via `linkKpiToMetric` (at-most-one guard, FR-05); `CONVERTS_TO` via the funnel-owned transition route (`[0,1]` range guard, FR-08); stories/ACs via the story-spec-core model-scoped routes (narrative assembly + Given/When/Then + `activityId` scope check, FR-09/FR-10); capabilities via the DDD create route (`CAPABILITY_IN_MODEL` authoritative, FR-11). Only self-contained process nodes (journeys/activities/roles/systems/KPIs) are fixture rows. Each affected AC now asserts the invariant (AC-05/AC-08/AC-09/AC-10). **No open question remains.** | Was: fixture-row vs. governed-route per construct. | **Closed in FR-05/08/09/10/11 + AC-05/08/09/10.** |
| 5 | **OQ-5 — RESOLVED, Resolves: C-05.** Governed-API-created data is deduped idempotently: **risks** by a **check-before-POST on `name` within `domain:"Sales"`** (`GET /api/v1/risk-register?domain=Sales` — which returns all Sales rows, no `name` filter exists, verified — then POST only absent names); `MEASURES` by `linkKpiToMetric`'s built-in at-most-one guard; other route-created edges by stable ids or existence checks; stories/ACs/capabilities skipped-if-present by natural key. AC-12 runs the full sequence twice and asserts zero duplicate rows. | Determines the check-before-create keys for FR-12 risks + route-created content (NFR-03). | **Closed in NFR-03 + AC-12.** Exact query params confirmed at design. |
| 6 | **OQ-6: does the sales pipeline conversion data imply operational records?** XD-03 forbids operational/transactional entities (no `Lead`/`Opportunity`/`Subscription`/`Tenant` rows). The funnel `conversionRate`/`dropOffRate` and any KPI `target_value` are **descriptive modeling attributes**, not operational measurements. | Guards against scope creep into operational data. | **Decided (XD-03):** all seeded conversion/target values are illustrative descriptive attributes on process/funnel constructs; **no** operational entity is created. No open question — recorded to make the boundary explicit for review. |
