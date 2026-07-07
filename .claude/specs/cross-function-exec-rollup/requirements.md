---
feature: "cross-function-exec-rollup"
created: "2026-07-06"
author: "spec-author"
status: "revised"
revision: 2
size: "large"
---

<!-- House format. This is wave-3 of blueprint-saas-operator.md, depending on
     all six wave-2 content specs + saas-metric-library + funnel-pipeline-modeling.
     It touches pwa/ (the OperatorCockpit view + its one views/index.tsx line) AND
     ships new read-only GET /api/v1/analytics/operator* routes, so the Platforms
     & Input Modes + Native Conflicts tables are included, and every AC carries
     Platforms + Verification columns. Per XD-09 single-shot, all open questions
     are CLOSED in-artifact to their recommended defaults.
     Revision 2 (2026-07-06): addresses review-requirements.md pass 1 — B-01
     (FR-08 + NFR-05 + AC-09/AC-09a: named the security-critical rbac-permissions
     route entry + router dispatch as allowed additive edits), B-02 (FR-09 +
     NFR-05 + AC-10/AC-11: named the openapi-operator.ts module + two-line hook),
     C-01 (FR-05 risk aggregation reuse boundary), C-02 (FR-07 domain_id primary
     SLA attribution + AC-08), C-03 (NFR-03 count-invariant normative + AC-04a),
     C-04 (FR-02 best-effort overview compose + OQ-3/OQ-4 pinned), C-05 (FR-06
     server-side funnel scope), N-01/N-02/N-03. No stable IDs renumbered; added
     AC-04a, AC-09a. -->

# Requirements: cross-function-exec-rollup

## Summary

`cross-function-exec-rollup` is **wave 3** of the SaaS-Operator business-process
model (blueprint `.claude/specs/blueprint-saas-operator.md`), depending on all
six wave-2 content specs (`marketing-`, `sales-`, `finance-accounting-`,
`customer-success-`, `product-delivery-`, `platform-ops-process-model`) plus the
wave-1b constructs (`saas-metric-library`, `funnel-pipeline-modeling`). It
delivers the **operator cockpit**: the `OperatorCockpit` PWA view at
`#/insights/operator` (route pre-registered by `saas-operator-foundation` FR-11, XD-05)
that presents, for the SaaS-Operator root, a **cross-function read-only rollup** —
per-function **KPI health**, a **risk heatmap**, **funnel status**, and an **SLA
rollup** — **sliceable by function/domain**. All aggregation is served by **new
read-only `GET /api/v1/analytics/operator*` routes** over the SaaS-Operator root
(XD-08): the cockpit **never writes**, adds **no** CRUD, and **never edits**
`performance.ts` / `PerformanceDashboard` (owned by `kpi-okr-performance-dashboards`,
complete) or any KPI/OKR/risk/SLA/change/funnel/metric route code. KPI-measurement
status is derived from the **governed Neo4j `:KPIMeasurement`** source the studio
chose (via the `kpi-trends` read path, studio XD-02 as amended) — never from the
Postgres `kpi_measurements` split-brain.

It **does not** author any KPIs/risks/SLAs/funnels (the wave-2 content specs own
that data — this feature only aggregates it), define KPI/OKR CRUD (exists —
`kpi-okr-governance`), duplicate the `#/exec/performance` dashboard (owned by
`kpi-okr-performance-dashboards`), edit `route.ts`/`SURFACES`/`views/index.tsx`
route **registration** (sole-owned by `saas-operator-foundation`, XD-05 — this
feature replaces only its own one-line `VIEWS` entry), or add any compile-time
`NODE_LABELS`/`EDGE_TYPES` (XD-02 — this feature adds none: it only reads).

## Motivation

1. The blueprint's whole point (Summary, Build Order M3) is that once the six
   functions are authored, the operator can **see cross-function health in one
   place**. Today each function's KPI health, risks, funnels, and SLAs are
   scattered across per-resource routes (`/api/v1/kpis`, `/api/v1/risk-register`,
   `/api/v1/slas`, funnel Cypher reads) with **no single cross-function rollup** —
   an operator has no "how is every function doing" surface.
2. `kpi-okr-performance-dashboards` built `#/exec/performance` — a KPI/OKR
   *portfolio* dashboard sliceable by **domain / journey / systemKind**. The
   cockpit is a **different, complementary** surface: it rolls up **by SaaS
   function** (the six operator `Domain` roots) and spans **four signal types at
   once** (KPI health, risk, funnel, SLA), whereas the performance dashboard is
   KPI/OKR-only and process-graph-generic. XD-08 makes them coexist additively:
   the cockpit adds new `analytics/operator*` routes and never touches
   `performance.ts` / `PerformanceDashboard`.
3. The blueprint View Tree pre-registers `#/insights/operator` → `OperatorCockpit`
   (owner `cross-function-exec-rollup`); `saas-operator-foundation` FR-11 already
   registered the `operator` tab on the existing `exec` surface and wired a
   `BusinessTabPlaceholder` at the `operator` key. This feature replaces that
   placeholder with the live cockpit on its one `views/index.tsx` line.
4. The wave-2 content specs deliberately adopted a **canonical cross-function
   grouping key** so this rollup is stable (the `domain = function-name`
   convention, defined once and normatively in FR-01 — not restated here to avoid
   drift, Resolves: N-01). The cockpit is the consumer that convention exists for;
   it must group by that key exactly, not re-invent one.

## Functional Requirements

<!-- Priorities: must = M3 cockpit-completion / blueprint scope; should = polish.
     Grouped by capability. Every read is a GET under /api/v1/analytics/operator*,
     all read-only (XD-08), all mapped to analytics:read. -->

### A. Function-scope resolution (the cross-function join key)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **Function-scope resolution over the SaaS-Operator root.** Every `analytics/operator*` aggregate is scoped to the SaaS-Operator `BusinessModel` root and grouped by its **six function `Domain` roots**. The root is resolved by lookup (`name:"SaaS Operator"` + `attributes.saasOperatorRoot:true`, `saas-operator-foundation` FR-01 — **never** a hard-coded id); the six functions are its `IN_MODEL` `Domain` nodes, each carrying `attributes.seedKey ∈ {marketing, sales, finance_accounting, customer_success, product_delivery, platform_ops}` and a `name` (`saas-operator-foundation` FR-03). **The canonical cross-function grouping key is the function `Domain` node `name` verbatim** (e.g. `"Customer Success"`, `"Finance & Accounting"`) — the de-facto key the content specs already tag risk rows with (`customer-success-process-model` FR-11/OQ-2, C-03) and the `seedKey` slug is its stable machine handle. A `?function=<seedKey>` slice param filters every aggregate to one function; absent/unknown → all six. A function domain that exists but has no authored content yet contributes an **empty** function row (zero KPIs/risks/funnels/SLAs), never an error or a crash. | must | XD-08, `saas-operator-foundation` FR-01/FR-03, `customer-success-process-model` FR-11/OQ-2 |
| FR-02 | **Overview rollup endpoint.** `GET /api/v1/analytics/operator/overview` returns the cockpit's top-level cross-function summary: for each of the six functions `{ function: <seedKey>, name, kpiHealth:{on_target,warning,breach,no_data counts}, riskHeatmap:{ counts by severity band }, funnelCount, slaHealth:{ within_target, at_risk, breached counts } }`, plus a graph-wide `saasOperatorRoot` handle in the payload envelope. Optional `?function=<seedKey>` narrows to one function's row (FR-01). It composes read-only from the FR-03..FR-07 per-signal reads (no new store, no write). This is the single endpoint the cockpit's default landing fetch calls. **Best-effort per signal (Resolves: C-04):** the overview compose is **per-signal fault-isolating** — if one of the four signal reads (KPI / risk / funnel / SLA) fails, the overview still returns `200` with the other three signals populated and the failed signal marked as errored/absent in that function's row (e.g. `kpiHealth: { error: true }`), rather than failing the whole overview with a `500`. This is what makes FR-12/OQ-3's per-panel degradation achievable from the **single** landing `overview` call (not requiring four separate up-front reads); it is the server-side contract the OQ-3 client behaviour depends on. | must | XD-08, blueprint (operator cockpit scope) |

### B. Per-function KPI health rollup

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-03 | **Per-function KPI health.** `GET /api/v1/analytics/operator/kpis?function=<seedKey>` (function optional; all six when absent) returns, per function, each function-scoped KPI as `{ kpi_id, name, unit, target_value, target_direction, latest_value, latest_measured_at, status }` with `status ∈ {on_target, warning, breach, no_data}` plus a per-function status **tally**. **Status is computed server-side** from the KPI's `target_direction`/`warning_threshold`/`critical_threshold` and the **latest `:KPIMeasurement`** — reusing the **exact status semantics already implemented** by `kpi-okr-performance-dashboards` (`computeKpiStatus`, `api/src/routes/performance.ts`) and reading the **same governed Neo4j `:KPIMeasurement` source** the `kpi-trends` route reads (studio XD-02 as amended; Postgres `kpi_measurements` is **not** read). A KPI is scoped to a function when it is scoped to that function's `Domain` (its `domain_id` resolves to the function-domain id, and/or an `ALIGNED_TO` edge reaches an entity `PART_OF` that domain — the same domain-slice traversal `performance.ts` uses, reused not re-invented). **Reuse-first (Resolves: OQ-1):** if the shared status logic can be imported without editing `performance.ts`, it is imported; if it is not exported, this feature **copies the status-band contract into its own module and pins parity to `performance.ts` with a shared-fixture test** (AC-05) — it **never edits** `performance.ts` (XD-08). | must | XD-08, `kpi-okr-performance-dashboards` FR-02/FR-05, studio XD-02 |
| FR-04 | **Governed KPI-measurement source only.** The latest-measurement lookup for FR-03 reads Neo4j `:KPIMeasurement` nodes (`{kpi_id, id, measured_at, value}`) — the canonical source arbitrated by the studio (`kpi-okr-performance-dashboards` FR-05/DEC-03, blueprint Risk "KPI-measurement split-brain") — via a **batched** query keyed by the sliced KPI-id set (at most a constant number of Neo4j round trips, never N per-KPI calls, NFR-03). This module **never imports the Postgres client** (mirrors the `performance.ts` single-store contract) and reads **zero** Postgres rows. | must | studio XD-02 (amended), `kpi-okr-performance-dashboards` FR-05/NFR-03 |

### C. Risk heatmap rollup

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-05 | **Risk heatmap.** `GET /api/v1/analytics/operator/risks?function=<seedKey>` returns, per function, the function's risk rows aggregated into a **heatmap**: a count per `(likelihood, impact)` cell (both 1–5, the as-built `createRiskSchema` scale, `risk-register.ts`) and per severity band (derived as `likelihood × impact`, the same ordering `risk-register.ts` sorts by), plus the individual rows `{ id, name, likelihood, impact, status, trend, risk_type }` for drill-in. **Risk rows are read via the governed risk-register read path** (`GET /api/v1/risk-register?domain=<functionName>`, the real filter at `risk-register.ts:47,65-67` returning `{ data: [...] }` / the underlying `risk_register` Postgres read owned by `risk-compliance-change`) — **grouped by the canonical `domain` key = the function `Domain` node `name` verbatim** (FR-01; `risk_register.domain` is the free-text field content specs tag with the function name, `customer-success-process-model` FR-11/OQ-2). This feature **reads** risks; it **never** edits `risk-register.ts`/`risk-compliance.ts`/`compliance-rules.ts` (XD-04/XD-08). **Reuse boundary (Resolves: C-01):** `risk-register.ts:291-366` already exposes `GET /api/v1/risk-register/aggregation/{domain,summary}` handlers that roll up counts by domain and severity bucket. The cockpit's heatmap needs the **per-cell `(likelihood×impact)` grid + the individual drill-in rows**, which those pre-rolled aggregates do **not** return, so the primary read is the **raw `?domain=<functionName>` row list** (from which the cockpit derives its own per-cell heatmap). The design's reuse check must explicitly compare the raw `?domain=` read against `aggregation/domain`/`aggregation/summary` and state, per rollup field, which it uses — so the cockpit neither re-derives an aggregate the governed surface already offers nor double-counts by mixing the two. Only `status` ∈ `{open, mitigating, accepted, resolved}` rows in the operator functions are counted; a function with zero risks yields an all-zero heatmap, not an error. | must | XD-08, `risk-compliance-change` (`risk-register`), `customer-success-process-model` FR-11/OQ-2 |

### D. Funnel status rollup

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-06 | **Funnel status.** `GET /api/v1/analytics/operator/funnels?function=<seedKey>` returns, per function, its `Funnel` nodes with a status summary each: `{ funnel_id, name, stageCount, overallConversion }` where `overallConversion` is the **product of the per-transition `conversionRate`s** along the ordered `Stage` chain (`funnel-pipeline-modeling` FR-11 — the same linear-chain derivation), rendered as the literal `"n/a"` for a zero/one-stage funnel or a branch (FR-11 edge-case contract, reused not re-derived divergently). Funnels are read via the **existing read-only `POST /api/v1/query/cypher` passthrough** (`query:read`) or the funnel-composition read `funnel-pipeline-modeling` FR-08 already exposes — **scoped to the SaaS-Operator root** so retail Model #1 funnels are never included. **Server-side scope resolution (Resolves: C-05):** the operator root is resolved **server-side** by the FR-01 lookup (`name:"SaaS Operator"` + `attributes.saasOperatorRoot:true`) and traversed to the function's `Funnel` nodes in one bounded Cypher — this handler runs in the API, so it does **not** and **cannot** reuse `funnel-pipeline-modeling` FR-09's `useActiveModel()` scoping, which is a **client-only** (`FunnelBoard`) pattern. The result is the same active-model scoping goal (only operator-root funnels), achieved server-side from the FR-01 root, not mirrored from client context. This feature reads funnels; it **never** edits any `funnel-pipeline-modeling` file. A function with no funnels yields an empty funnel list, not an error. | must | XD-08, `funnel-pipeline-modeling` FR-08/FR-11 (conversion derivation) + FR-01 root (server-side scope, not FR-09's client `useActiveModel`) |

### E. SLA rollup

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-07 | **SLA rollup.** `GET /api/v1/analytics/operator/slas?function=<seedKey>` returns, per function, its `SLA` definitions with a compliance/breach summary each: `{ sla_id, name, compliance_threshold, target_value, target_unit, breachCount, latestBreachAt, health }` where `health ∈ {within_target, at_risk, breached}` is derived read-only from the governed SLA-compliance read (`sla-compliance` — `GET /api/v1/sla-compliance/:sla_id`, and the domain rollup `GET /api/v1/sla-compliance/domain/:domain_id` at `sla-compliance.ts:232`, over `sla-breaches`/`SLABreach` nodes, owned by `kpi-okr-governance`). **SLA→function attribution (two-tier, Resolves: C-02):** the **primary** attribution path is the SLA's own **`domain_id`** field — `SLA` nodes carry `domain_id` directly (confirmed `sla-compliance.ts:248,336`, and CS FR-09's SLA rows set `domain_id` = the CS domain id), and `sla-compliance/domain/:domain_id` already rolls up every SLA for a domain. A CS SLA correctly seeded with `domain_id` = the Customer Success function-domain id is therefore attributed to Customer Success **directly**, with no traversal. The **secondary** path — the `kpi-sla-alignment` `ALIGNED_TO` link (`customer-success-process-model` FR-10, SLA→`UserJourney`/`Activity` within the function domain, traversed to the owning function domain) — is a **fallback** used only when an SLA has no resolvable `domain_id`; because CS FR-10 is priority `should`, that alignment edge may be absent at execution, so it must not be the primary path (an SLA with a valid `domain_id` must never land in `unattributed` merely because a `should` edge was skipped). This feature **reads** SLA/breach data; it **never** edits `sla-crud.ts`/`sla-breaches.ts`/`sla-compliance.ts`/`kpi-sla-alignment.ts` (XD-04/XD-08). **Attribution fallback (Resolves: OQ-2):** an SLA that resolves to a function via **neither** `domain_id` **nor** an alignment edge is grouped under an **`unattributed`** bucket in the rollup (surfaced but not blamed on a function) rather than dropped or crashed — the design freezes whether `unattributed` renders as a distinct cockpit row or a summary count (a design-scoped rendering detail, Resolves: N-02). Customer Success is the canonical SLA home (`customer-success-process-model` FR-10); a function with no SLAs yields an empty SLA list. | must | XD-08, `kpi-okr-governance` (`sla-*`), `customer-success-process-model` FR-10 |

### F. Contract + auth hygiene

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-08 | **Auth via the central gate + `analytics:read` only, with a same-task route-permission entry per route (Resolves: B-01).** Every `analytics/operator*` route is a `GET` gated by the central router (`api/src/router.ts`) + `api/src/auth/` and mapped to the existing **`analytics:read`** permission (the same permission `analytics/graph` and `analytics/performance/*` already use, `api/src/auth/rbac-permissions.ts`) — **no per-route auth check**, **no new RBAC permission *string***, no route is `public` (house rule). All routes mounted under `/api/v1/`. Delivering this requires two **additive** edits to existing (non-new) server files, both mandatory and both in the same task as the route (the "same-task pairing" the perf-dashboard entries at `rbac-permissions.ts:40-42` document): (a) a **dispatch line per route** in `api/src/router.ts` (mirroring `router.ts:915-917` for `analytics/performance/*`); (b) a **route-permission entry per route** — `P("GET", "analytics/operator/<overview\|kpis\|risks\|funnels\|slas>", "analytics:read")` — in the `ROUTE_PERMISSIONS` list of `api/src/auth/rbac-permissions.ts`. **This entry is security-critical, not bookkeeping:** the router gate SKIPS the RBAC check entirely when `getRoutePermission(method, path)` returns `null` (`router.ts:386-395`), so a route dispatched but **not** listed in `ROUTE_PERMISSIONS` is reachable by any authenticated session with **no `analytics:read` check** — a P0 exposure. FR-08's "gated / 403 on missing permission" contract therefore *cannot hold* without entry (b). No `performance.ts` / KPI / risk / SLA / funnel / metric route or storage file is touched by either edit. | must | House rule, `kpi-okr-performance-dashboards` NFR-01, `router.ts:386-395` |
| FR-09 | **OpenAPI registration via a new module + a two-line hook (Resolves: B-02).** Every new `analytics/operator*` endpoint is registered in `GET /api/v1/openapi.json`, generated from the same `zod` schemas used at runtime (no hand-maintained copy, FR-16 policy). Registration follows the as-built perf-dashboard pattern (`api/src/routes/openapi-performance.ts` + `openapi.ts:108,1045`): a **new** module `api/src/routes/openapi-operator.ts` declares the operator paths from the runtime zod schemas, and a **two-line additive hook** (an `import { registerOperatorPaths } from "./openapi-operator"` at the top of `api/src/routes/openapi.ts` plus a `registerOperatorPaths(registry)` call inside `getOpenApiDoc()`) wires it in. That two-line hook is an **allowed additive edit** to an existing (non-new) file — it is enumerated in NFR-05 and AC-11 so the `git diff` gate does not flag it as a violation. The `?function=<seedKey>` query param is `zod`-validated (a closed enum of the six seedKeys); a malformed param returns the standard `400 {error:{code,message,details}}` envelope. All changes are additive under `/api/v1/` — no `/api/v2/` bump, no `ERROR_CODES` addition. | must | CLAUDE.md versioning / NFR-11, `openapi-performance.ts` pattern |

### G. PWA — `OperatorCockpit` view (`#/insights/operator`, XD-05, XD-08, UX-01)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-10 | **`OperatorCockpit` view** (`pwa/src/views/exec/OperatorCockpit.tsx`, route `#/insights/operator` — **verbatim** from the blueprint View Tree). It **consumes** the shell-level active-model context (`useActiveModel()`, owned by `model-workspace-core` — never re-implemented) for header context and defaults to the SaaS-Operator root (same pattern as `FunctionMap.tsx`/`PerformanceDashboard`). It fetches the FR-02 overview (and the FR-03..FR-07 per-signal reads on drill-in) via the existing typed API client (`pwa/src/api.ts`, the same `json(...)`/`api.cypher(...)` seam `PerformanceDashboard` uses) and renders four cross-function panels: **per-function KPI health**, a **risk heatmap**, **funnel status**, and an **SLA rollup**. Tokens-only styling via `var(--…)` from `tokens.css`; catalog components (`ViewRegion`/`ViewHeader`/`Loading`/`EmptyState`/`ErrorState` from `pwa/src/views/_shared.tsx`, imported `from "../_shared"`) before inventing new ones; `scripts/design-conformance.ts` passes on `OperatorCockpit.tsx` + its CSS module. **Read-only surface:** the cockpit renders aggregates and deep-links; it has **no** create/edit/write control (XD-08). | must | Blueprint View Tree, UX-01, UX-02, XD-05, XD-08 |
| FR-11 | **Function/domain slicer (URL-first).** A single slice control lets the operator filter the whole cockpit by **function** (the six SaaS functions, from the FR-02 overview). Slice state is **URL-first** on the route query string — `#/insights/operator?function=<seedKey>` — mirroring the `#/exec/performance?domain=…` and `#/explorer/systems?kind=…` `route.params` pattern, so a sliced view is shareable and **survives reload** (UX-06). An unknown/absent `function` param falls back to **all six functions** (no crash). Selecting a function refetches the sliced aggregates (or filters the already-fetched overview — resolved at design). | must | blueprint (sliceable by function/domain), UX-06 |
| FR-12 | **All four view states specced** (UX-01): **loading** (skeleton while the overview fetch is in flight — `Loading`), **empty** (the SaaS-Operator root resolves but has no authored function content yet — `EmptyState` prompting `bun run seed:saas-operator` + the content seeds), **error** (an aggregate fetch failed — `ErrorState` with a retry affordance that refetches), **ready** (the four rollup panels rendered). A **partial-failure** policy (one signal endpoint fails while others succeed) is frozen at design: the default is a **per-panel error state** so a single failing signal degrades that panel, not the whole cockpit (Resolves: OQ-3). | must | UX-01 |
| FR-13 | **View registration is the nav orchestrator's one-line `views/index.tsx` edit — DEFERRED, tracked** (nav-IA restructure 2026-07-07). The canonical route is **`#/insights/operator`** (the former `#/exec/operator` is now a redirect alias, `route.ts:204`). The one `VIEWS` entry (its import line + the `operator` map line under the **`insights`** surface) — `operator: (r) => <OperatorCockpit route={r} />` — is added by the **nav orchestrator**, not this spec. This spec edits **neither** `pwa/src/route.ts` **nor** `SURFACES` **nor** `views/index.tsx` (all sole-owned by the concurrent nav session, XD-05) — it contributes only the live `OperatorCockpit` view component (whose slicer emits the canonical `#/insights/operator?function=…` hash). | must | XD-05, UX-06 |
| FR-14 | **Keyboard-reachable + deep-linkable drill-ins.** Every panel is keyboard-reachable (Tab in DOM order) with an ARIA landmark (`ViewRegion`/`<section aria-label>`), and each rollup row deep-links into the relevant existing surface for drill-in: a KPI row deep-links to the Explorer / `#/exec/performance` for that KPI, a funnel row to `#/insights/funnels`, a function row to `#/insights/functions` / the Explorer for that domain (routes taken verbatim from the app's registered routes — this feature invents no route). The `#/insights/operator` deep link (with its `?function=` slice) survives reload (shell context + hash router, UX-06). | should | UX-05, UX-06 |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | **Read-only contract (XD-08).** This feature adds **no** write path, no CRUD, no mutation of any KPI/OKR/risk/SLA/change/funnel/metric state. Every new endpoint is a `GET` under `/api/v1/analytics/operator*`. It **never** edits `performance.ts`/`PerformanceDashboard` or any KPI/risk/SLA/funnel/metric route/storage file. All changes are additive under `/api/v1/` — no `/api/v2/` bump, no `ERROR_CODES` addition. | XD-08, CLAUDE.md versioning |
| NFR-02 | **No new store, no compile-time labels/edges.** This feature adds **zero** entries to `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS` in `shared/src/schema/{nodes,edges}.ts` and creates no new datastore — it only reads existing Neo4j (`KPI`/`KPIMeasurement`/`SLA`/`SLABreach`/`Funnel`/`Stage`/`Domain`) and Postgres (`risk_register` via the governed read) data through governed reads. | XD-02, XD-08 |
| NFR-03 | **Bounded query cost (normative: the query-count invariant) (Resolves: C-03).** The FR-02 overview and **each** per-signal aggregate (KPI, risk, funnel, SLA) issue a **constant** number of round trips per store regardless of function/KPI/risk/funnel/SLA count — the KPI-measurement lookup is **batched** (≤ 2 Neo4j round trips keyed by the sliced KPI-id set, never N per-KPI calls, mirroring `performance.ts` NFR-03), and the risk/SLA/funnel reads are scoped single (or constant-bounded) traversals, never N-per-entity. **Zero Postgres round trips for KPI measurement** (Neo4j `:KPIMeasurement` only). This **count invariant is the normative, CI-testable requirement** and is asserted for every per-signal aggregate, not only KPI measurement (AC-04 for KPIs, AC-04a for risk/funnel/SLA + the overview compose). *Informative note (not a tested gate):* the six-function overview is expected to return well under ~800 ms p95 on a warm graph, but wall-clock latency is not asserted in CI — the round-trip count is the enforced proxy. | perf hygiene, `kpi-okr-performance-dashboards` NFR-03 |
| NFR-04 | **Governed source fidelity.** KPI status uses the **same** `:KPIMeasurement` source and the **same** status-band semantics as `kpi-okr-performance-dashboards` (`computeKpiStatus`) — parity is pinned by a shared-fixture test (AC-05), so the cockpit and the performance dashboard never disagree on a KPI's status. Risk grouping uses the canonical `domain = function name` key the content specs adopted (FR-01). snake_case field names from the governed surfaces (`target_value`, `target_direction`, `compliance_threshold`, …) are kept as-built in the aggregate responses (consistent with `kpi-okr-performance-dashboards` NFR-04). | `kpi-okr-performance-dashboards` FR-05/NFR-04, `customer-success-process-model` FR-11/OQ-2 |
| NFR-05 | **Enumerated change set — single-ownership + named additive edits (Resolves: B-01, B-02) (XD-05/XD-08).** On the PWA side this feature edits **only** `pwa/src/views/exec/OperatorCockpit.tsx` (+ its `.module.css`) and **one** `VIEWS` entry (its import + `operator` map line) in `pwa/src/views/index.tsx`; it never edits `route.ts`/`SURFACES`. On the server side it adds its own **new files** — the `analytics/operator*` route handler(s) (e.g. `api/src/routes/analytics-operator.ts`), the new OpenAPI module `api/src/routes/openapi-operator.ts`, and their tests — **and makes exactly these four named additive edits to existing (non-new) files**, all following the perf-dashboard shared-append precedent: (1) `api/src/router.ts` — one dispatch line per operator route (like `router.ts:915-917`); (2) `api/src/auth/rbac-permissions.ts` — one `P("GET", "analytics/operator/…", "analytics:read")` **entry** per route, mapping to the **existing** `analytics:read` permission (no new permission string) — the security-critical same-task pairing FR-08 requires; (3) `api/src/routes/openapi.ts` — the two-line `registerOperatorPaths` import + call hook (FR-09); (4) `pwa/src/api.ts` — the client seam (a typed wrapper for the new reads, the same `json(...)` seam `PerformanceDashboard` uses). The true guarantees are preserved and testable: **no new permission *string***, **no `ERROR_CODES` addition**, and `performance.ts` / `PerformanceDashboard` / any KPI / risk / SLA / funnel / metric route or storage file **untouched**. A `git diff --stat` confines changes to the new files above plus exactly these four enumerated edits (AC-11). | XD-05, XD-08, `kpi-okr-performance-dashboards` design §4.7 |
| NFR-06 | **House rules.** `zod` is the only validation library; no `tsc` (transpile via `bun run typecheck`); en-US identifiers (`color`, `behavior`, `analytics`); server binds loopback `127.0.0.1:8787`; auth via the central router gate + `api/src/auth/` only; all REST under `/api/v1/`. | CLAUDE.md |
| NFR-07 | **PWA design conformance.** `OperatorCockpit` styling is tokens-only (`var(--…)` from `tokens.css`); components come from the existing CSS-Module catalog (`pwa/src/views/_shared.tsx`) before new ones; `scripts/design-conformance.ts` passes on `OperatorCockpit.tsx` + its CSS module (UX-02). Desktop-first, no new breakpoints (UX-04). | UX-02, UX-04 |

## UI/UX Requirements

**Views owned by this spec** (from the blueprint View Tree, verbatim):

| Route | View component | Nav surface | States specced (loading·empty·error·ready) |
|-------|----------------|-------------|---------------------------------------------|
| `#/insights/operator` | `OperatorCockpit` | Exec tab (`operator` subnav, registered by `saas-operator-foundation` FR-11) | all four — AC-13 (loading), AC-14 (empty), AC-15 (error), AC-12 (ready) |

**Routes NOT owned here** (registered by `saas-operator-foundation`, this spec only replaces its one `VIEWS` line): `#/exec/performance` (owned by `kpi-okr-performance-dashboards` — never touched), `#/insights/{functions,metrics,funnels,benchmarks}` — other specs' views under the shared Insights surface, untouched.

**UX allowance conformance** (reference blueprint UX-*; do not re-decide):

| Allowance | How this spec satisfies it |
|-----------|---------------------------|
| UX-01 view states | FR-12; AC-12..AC-15 cover OperatorCockpit loading/empty/error/ready (+ per-panel partial-failure) |
| UX-02 design system (tokens-only, catalog components, design-conformance passes) | FR-10, NFR-07; AC-16 runs `scripts/design-conformance.ts` |
| UX-03 input modes | `OperatorCockpit` ships **no** canvas/gesture/drag surface (the interactive `FunnelBoard` is owned by `funnel-pipeline-modeling`, per UX-03). Only standard link/list/filter/keyboard interaction — the Platforms & Input Modes and Native Conflicts tables below reflect that. |
| UX-04 responsiveness | NFR-07 — desktop-first, no new breakpoints |
| UX-05 accessibility | AC-17 — keyboard reachability of the slicer + each rollup panel/row, focus order, ARIA landmark (`ViewRegion`) |
| UX-06 navigation (routes verbatim, deep links survive reload) | FR-11 (URL-first slice), FR-13 (verbatim route, no route.ts edit), FR-14 (deep links survive reload); AC-18 |

## Scope Boundaries

**In scope:**
- The read-only cross-function aggregate endpoints `GET /api/v1/analytics/operator/{overview,kpis,risks,funnels,slas}` (FR-02..FR-07), all `analytics:read`, all `?function=<seedKey>`-sliceable, over the SaaS-Operator root.
- Server-side per-function KPI status derived from the governed Neo4j `:KPIMeasurement` source with `performance.ts`-parity band semantics (FR-03/FR-04, NFR-04).
- Risk-heatmap aggregation via the governed risk-register read grouped by the canonical `domain = function name` key (FR-05).
- Funnel-status and SLA rollups via the governed funnel Cypher read and SLA-compliance read, function-scoped (FR-06/FR-07).
- The `OperatorCockpit` view at `#/insights/operator` (four panels, URL-first function slicer, four view states, keyboard-reachable deep-ins) — the only PWA files touched are `OperatorCockpit.tsx`, its CSS module, and the single `views/index.tsx` line.
- OpenAPI registration + `zod` query validation for the new routes (FR-09).

**Out of scope (owner named):**
- **Authoring** any KPIs/risks/SLAs/funnels/OKRs/stories/DDD content → the six wave-2 content specs (this feature only aggregates their data).
- KPI/OKR/SLA **CRUD** and the `kpi-*`/`okr-*`/`sla-*` route code → `kpi-okr-governance` / `kpi-measurement-alignment`.
- The `#/exec/performance` `PerformanceDashboard` + `analytics/performance/*` routes + `performance.ts` → `kpi-okr-performance-dashboards` (**never** edited; this cockpit is the coexisting operator surface, XD-08).
- `risk-register.ts`/`risk-compliance.ts`/`compliance-rules.ts`/`change-requests.ts` → `risk-compliance-change` (read via routes only).
- `sla-crud.ts`/`sla-breaches.ts`/`sla-compliance.ts`/`kpi-sla-alignment.ts` → `kpi-okr-governance` (read via routes only).
- `Funnel`/`Stage`/`CONVERTS_TO` + `FunnelBoard` → `funnel-pipeline-modeling`; `MetricDefinition`/`MEASURES` + `MetricLibrary` → `saas-metric-library` (read only).
- `route.ts`/`SURFACES`/`views/index.tsx` route **registration** (the `#/insights/operator` tab + all `#/business` tabs) → `saas-operator-foundation` (XD-05); this feature replaces only its own one-line `VIEWS` entry.
- Prescriptive maturity/benchmark scoring → `function-benchmark-scoring` (the sibling wave-3 spec).
- Any operational/transactional entity (`Lead`/`Invoice`/`Subscription`/…) → **never created/read** (XD-03).

## Acceptance Criteria

<!-- Every AC traces to ≥1 FR. Platforms + Verification are mandatory.
     Verification is a test path or manual:<repro with input mode + observable
     outcome>. Server ACs run against Neo4j (+ Postgres via the governed risk
     read); PWA ACs name the browser + input mode. -->

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | `GET /api/v1/analytics/operator/overview` (no slice) returns a row per resolved SaaS-Operator function (six functions when all content is seeded), each with `kpiHealth`/`riskHeatmap`/`funnelCount`/`slaHealth` summaries; the SaaS-Operator root is resolved by the `name:"SaaS Operator"` + `saasOperatorRoot:true` lookup (no hard-coded id); a function with no authored content yields an all-zero row, not an error (FR-01, FR-02) | server (bun test + Neo4j + Postgres) | `api/__tests__/operator-overview.integration.test.ts` |
| AC-02 | `?function=<seedKey>` slices every aggregate to exactly that function; a malformed/unknown `function` value returns the standard `400 {error:{code,message,details}}` envelope (via the zod seedKey enum), and an absent param returns all six functions (FR-01, FR-09) | server (bun test + Neo4j) + CLI | `api/__tests__/operator-slice.integration.test.ts`; manual: `curl -s '.../api/v1/analytics/operator/overview?function=bogus'` — expect HTTP 400 with `error.code` set |
| AC-03 | `GET /api/v1/analytics/operator/kpis?function=finance_accounting` returns each finance KPI with `status ∈ {on_target,warning,breach,no_data}` computed server-side from `target_direction`/thresholds + the latest measurement, plus a per-function status tally; a KPI with no measurement reports `no_data` (FR-03) | server (bun test + Neo4j) | `api/__tests__/operator-kpis.integration.test.ts` |
| AC-04 | The KPI-health read sources measurements from Neo4j `:KPIMeasurement` **only** — the handler module does not import the Postgres client and issues zero Postgres round trips for measurements; the measurement lookup is batched (≤ 2 Neo4j round trips regardless of KPI count) (FR-04, NFR-03) | server (bun test) | `api/__tests__/operator-no-postgres-measurement.test.ts` (asserts no Postgres import + counted Neo4j round trips) |
| AC-04a | **Query-count invariant holds for every per-signal aggregate and the overview compose (Resolves: C-03).** With a fixture that scales the function's risk / funnel / SLA counts up (e.g. 1 vs 20 rows), the risk (`/risks`), funnel (`/funnels`), SLA (`/slas`), and `/overview` handlers each issue the **same** (constant, bounded) number of store round trips — never N-per-entity — proving the reads are scoped single/batched traversals (FR-05, FR-06, FR-07, FR-02, NFR-03) | server (bun test + Neo4j + Postgres) | `api/__tests__/operator-query-count.integration.test.ts` (round-trip count is independent of entity count for each aggregate) |
| AC-05 | **Status parity with `performance.ts`**: for a shared fixture of KPI `(target_value, target_direction, warning_threshold, critical_threshold, latest)` tuples spanning every band, the cockpit's per-KPI `status` equals `computeKpiStatus(...)` from `api/src/routes/performance.ts` exactly; `git diff --stat api/src/routes/performance.ts` shows **no change** (FR-03, NFR-04, NFR-01) | server (bun test) + CLI | `api/__tests__/operator-status-parity.test.ts`; manual: `git diff --stat api/src/routes/performance.ts` — expect no change |
| AC-06 | `GET /api/v1/analytics/operator/risks?function=customer_success` returns the CS risk rows grouped by the canonical `domain = "Customer Success"` key, aggregated into a `(likelihood,impact)` heatmap (both 1–5) + per-severity-band counts + the drill-in rows; risks are read via the governed risk-register read and **no** `risk-*` file is edited; a function with zero risks yields an all-zero heatmap (FR-05, NFR-01) | server (bun test + Neo4j + Postgres) + CLI | `api/__tests__/operator-risks.integration.test.ts`; manual: `git diff --stat api/src/routes/risk-register.ts api/src/routes/risk-compliance.ts` — expect no change |
| AC-07 | `GET /api/v1/analytics/operator/funnels?function=marketing` returns the marketing funnels with `stageCount` + `overallConversion` = product of per-transition `conversionRate`s along the ordered chain, rendered `"n/a"` for a zero/one-stage funnel or a branch (matching `funnel-pipeline-modeling` FR-11); the read is scoped to the SaaS-Operator root so a retail Model #1 funnel is never returned (FR-06) | server (bun test + Neo4j) | `api/__tests__/operator-funnels.integration.test.ts` |
| AC-08 | `GET /api/v1/analytics/operator/slas?function=customer_success` returns the CS SLA definitions with `breachCount`/`latestBreachAt`/`health ∈ {within_target,at_risk,breached}` derived from the governed SLA-compliance read; an SLA carrying `domain_id` = the Customer Success function-domain id is attributed to Customer Success via that **primary `domain_id`** path (not requiring an `ALIGNED_TO` edge, C-02); only an SLA resolvable by **neither** `domain_id` **nor** an alignment edge appears under the `unattributed` bucket (not dropped, not crashed); **no** `sla-*`/`kpi-sla-alignment` file is edited (FR-07, NFR-01) | server (bun test + Neo4j) + CLI | `api/__tests__/operator-slas.integration.test.ts` (includes a case: SLA with valid `domain_id` but no alignment edge → attributed to its function, NOT `unattributed`); manual: `git diff --stat api/src/routes/sla-crud.ts api/src/routes/sla-compliance.ts api/src/routes/kpi-sla-alignment.ts` — expect no change |
| AC-09 | Every `analytics/operator*` route is a `GET` mapped to `analytics:read` and gated by the central router (401 no session, 403 missing permission); the mapping is achieved by a `P("GET", "analytics/operator/…", "analytics:read")` **entry** per route added to `ROUTE_PERMISSIONS`, and **no new RBAC permission *string*** was introduced (`analytics:read` is reused) (FR-08) | server (bun test + Neo4j) + CLI | `api/__tests__/operator-auth.integration.test.ts`; manual: `git diff api/src/auth/rbac-permissions.ts` — expect only new `analytics:read` route entries, no new permission string |
| AC-09a | **Security: no operator route is reachable without `analytics:read` (Resolves: B-01).** For **every** dispatched `analytics/operator*` route, `getRoutePermission("GET", path)` returns `"analytics:read"` (not `null`) — proving each route has its `ROUTE_PERMISSIONS` entry, so the router gate cannot silently skip the RBAC check (`router.ts:386-395`); a session lacking `analytics:read` receives `403` on every operator route (FR-08) | server (bun test) + CLI | `api/__tests__/operator-route-permission.test.ts` (asserts `getRoutePermission` non-null + `403` without `analytics:read` for each route); this is the P0-exposure guard |
| AC-10 | Every new `analytics/operator*` endpoint appears in `GET /api/v1/openapi.json` (generated from the runtime zod schemas via the new `openapi-operator.ts` module + the two-line `openapi.ts` hook, FR-09), and no `ERROR_CODES` member was added; all routes remain under `/api/v1/` (no `/api/v2/`) (FR-09, NFR-01) | server (bun test) + CLI | `api/__tests__/operator-openapi.integration.test.ts`; manual: `git diff api/src/errors.ts` — expect no `ERROR_CODES` additions |
| AC-11 | **Change set confined to the enumerated paths (Resolves: B-01, B-02).** Transpile is clean; no compile-time schema arrays edited; `performance.ts`/`PerformanceDashboard`/`route.ts`/`SURFACES` untouched; the only `views/index.tsx` change is the one `operator` entry. `git diff --stat` shows changes confined to: the new server files (the `analytics/operator*` handler(s), `openapi-operator.ts`, tests), the new PWA files (`OperatorCockpit.tsx` + `.module.css`), and **exactly** the four enumerated additive edits — `api/src/router.ts` (dispatch lines), `api/src/auth/rbac-permissions.ts` (new `analytics:read` route entries only), `api/src/routes/openapi.ts` (two-line hook), `pwa/src/api.ts` (client seam) — plus the one `views/index.tsx` `operator` entry. No KPI/risk/SLA/funnel/metric route or storage file, and no `performance.ts`, appears in the diff (NFR-01, NFR-02, NFR-05, NFR-06) | CLI | `bun run typecheck` exit 0; manual: `git diff --stat` — expect the change set to match the enumerated allow-list above and nothing else (no `performance.ts`, no `route.ts`/`SURFACES`, no schema-array additions) |
| AC-12 | `#/insights/operator` resolves to `OperatorCockpit` (not `BusinessTabPlaceholder`), which consumes `useActiveModel()`, defaults to the SaaS-Operator root, and renders the four cross-function panels (KPI health, risk heatmap, funnel status, SLA rollup) from the FR-02 overview (FR-10, FR-12 ready state, FR-13) | macOS Chrome (mouse+kb), macOS Safari (trackpad+kb) | `pwa/src/__tests__/operator-cockpit.test.tsx` |
| AC-13 | `OperatorCockpit` renders a loading skeleton while its overview fetch is pending (FR-12, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/operator-cockpit-states.test.tsx` |
| AC-14 | With the SaaS-Operator root resolved but no authored function content, `OperatorCockpit` shows the empty state prompting `bun run seed:saas-operator` + the content seeds (FR-12, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/operator-cockpit-states.test.tsx` |
| AC-15 | When an aggregate fetch fails, `OperatorCockpit` shows the error state with a retry affordance that refetches; a single-signal failure degrades **only** that panel (per-panel error state), not the whole cockpit (FR-12, OQ-3, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/operator-cockpit-states.test.tsx` |
| AC-16 | `scripts/design-conformance.ts` passes on `OperatorCockpit.tsx` + its CSS module (tokens-only, catalog components) (NFR-07, UX-02) | CLI | CI-asserted (Resolves: N-03): `bun scripts/design-conformance.ts --view pwa/src/views/exec/OperatorCockpit.tsx` (and the `.module.css`) **exits non-zero on any token/component violation** — this is a gating CLI step run in the same conformance sweep as the other views (`.github/workflows/ci.yml` design-conformance job), not a manual repro |
| AC-17 | `OperatorCockpit` is keyboard-reachable: Tab reaches the function slicer then each rollup panel/row in DOM order, the view has an ARIA landmark (`ViewRegion`/`<section aria-label>`), and each rollup row activates its deep-link on Enter (FR-14, UX-05) | macOS Chrome (keyboard), macOS Safari (keyboard) | manual: with the stack up + operator content seeded, load `#/insights/operator`, Tab through the view — expect focus lands on the section landmark, then the function slicer, then each panel's rows in order, and a KPI/funnel/function row deep-links on Enter |
| AC-18 | URL-first slice survives reload: navigate to `#/insights/operator?function=sales`, reload — expect the same route renders `OperatorCockpit` sliced to Sales (from the persisted hash + shell context); clearing the slice returns to all six functions (FR-11, FR-13, FR-14, UX-06) | macOS Chrome (mouse+kb) | `pwa/playwright/exec-operator-reload.spec.ts` |

## Platforms & Input Modes

This spec touches `pwa/` (the `OperatorCockpit` view + its one `views/index.tsx`
line). It ships **no** canvas/gesture/drag surface (the interactive `FunnelBoard`
is owned by `funnel-pipeline-modeling`, per UX-03), and adds **no** new keyboard
accelerator (`#/insights/operator` is reached through the existing `exec` surf-nav
(kbd `7`) + the `operator` subnav that `saas-operator-foundation` FR-11 already
registered — untouched here). Only standard link/list/filter/keyboard interaction.

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| Function slicer (select/segmented control) | yes | yes | yes | yes | standard control; URL-first; no drag |
| KPI health panel — rows + status badges | yes | yes | yes | yes | standard list; rows deep-link; no drag |
| Risk heatmap grid (likelihood × impact) | yes | yes | yes | yes | static grid of counts; cells may deep-link; no custom pointer handling |
| Funnel status panel — rows | yes | yes | yes | yes | standard list; rows deep-link to `#/insights/funnels`; no drag |
| SLA rollup panel — rows | yes | yes | yes | yes | standard list; rows deep-link; no drag |
| Loading / empty / error states (incl. per-panel error) | yes | yes | yes | yes | static content, no input handling |
| Canvas / drag / pinch-zoom gestures | no | no | no | no | out of scope — the interactive stage board is owned by `funnel-pipeline-modeling` (`FunnelBoard`) |

## Native Conflicts

This feature introduces **no** new gesture, scroll-container, focus-trap, or
keyboard-accelerator handling. `OperatorCockpit` uses native anchors and standard
form controls (a function slicer) plus the shared catalog view-state components;
all interaction is via the browser's default focus/click/keyboard behavior. The
risk heatmap is a static grid (no drag/paint). The `exec` surface's `Alt+7`
surf-jump accelerator is owned by the shell (`saas-operator-foundation` reuses the
existing `exec` surface for the `operator` tab, adding no new accelerator); this
feature adds nothing to that handler.

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| (none) | n/a | n/a |

## Dependencies

- **saas-operator-foundation** (`.claude/specs/saas-operator-foundation/`): the SaaS-Operator `BusinessModel` root (resolved by `name:"SaaS Operator"` + `attributes.saasOperatorRoot:true`, FR-01) and its six `IN_MODEL` function `Domain` roots carrying `attributes.seedKey` (FR-03) — the scope + grouping key for every aggregate; the `#/insights/operator` route + the `operator` tab registration in `SURFACES` (FR-11, consumed never edited); the `views/index.tsx` `BusinessTabPlaceholder` at the `operator` key this feature replaces on its one line (FR-13); `useActiveModel()` shell context. `FunctionMap.tsx` / `PerformanceDashboard` are the view precedents for `OperatorCockpit.tsx`.
- **kpi-okr-performance-dashboards** (`api/src/routes/performance.ts` `computeKpiStatus` + the `:KPIMeasurement` domain-slice traversal; `api/src/routes/analytics.ts` + `analytics/performance/*` route pattern): the **status-band semantics + governed measurement source** the cockpit reuses (FR-03/FR-04, NFR-04). **This file is off-limits (XD-08)** — reused by import if exported, else parity-pinned by AC-05, never edited.
- **kpi-okr-governance / kpi-measurement-alignment** (`KPI` node label + `kpiSchema`; `:KPIMeasurement` nodes read by `kpi-trends`, `api/src/routes/kpi-trends.ts`; `ALIGNED_TO` KPI→domain/journey/activity edges; `sla-crud.ts`/`sla-breaches.ts`/`sla-compliance.ts` SLA/`SLABreach` reads; `kpi-sla-alignment.ts` SLA alignment): the KPI/SLA data the cockpit rolls up — read via routes only, never edited (XD-08).
- **risk-compliance-change** (`api/src/routes/risk-register.ts` `GET /api/v1/risk-register?domain=…` + `createRiskSchema` fields `likelihood`/`impact`/`status`/`trend`/`domain`/`risk_type`; Postgres `risk_register` table): the risk rows the heatmap aggregates, grouped by the canonical `domain = function name` key — read via route only, never edited (XD-04/XD-08).
- **funnel-pipeline-modeling** (`Funnel`/`Stage` labels + `HAS_STAGE`/`CONVERTS_TO` edges + `conversionRate`/`dropOffRate`; the funnel-composition read FR-08 + the linear-chain overall-conversion derivation FR-11): the funnels the cockpit summarizes — read via `POST /api/v1/query/cypher` scoped to the operator root, never edited.
- **saas-metric-library** (`MetricDefinition` + the `MEASURES` KPI→metric edge, XD-06-erratum): context for KPI grounding; the cockpit may surface a KPI's metric name but does not depend on the metric library for status — read only.
- **graph-core** (`POST /api/v1/query/cypher` → `handleCypher`/`runPassthrough`, read-only, `query:read`; `pwa/src/api.ts` `api.cypher`/`json`): the read path for funnel/SLA/domain traversals + the PWA data client.
- **content specs** (`marketing-`, `sales-`, `finance-accounting-`, `customer-success-`, `product-delivery-`, `platform-ops-process-model`): the authored KPIs/risks/funnels/SLAs/journeys the cockpit aggregates. The canonical `domain = function-name` grouping convention (`customer-success-process-model` FR-11/OQ-2) is the join key this feature consumes; the cockpit has nothing to show until at least one content slice is seeded.
- **PWA shell** (`pwa/src/route.ts` `route.params`/`entityId` for the URL-first slicer, **consumed not edited** — XD-05; `pwa/src/context/ActiveModelContext.tsx` `useActiveModel()`; `pwa/src/views/_shared.tsx` `ViewRegion`/`ViewHeader`/`Loading`/`EmptyState`/`ErrorState`; `tokens.css`; `scripts/design-conformance.ts`; the `views/index.tsx` `VIEWS` seam; the `pwa/src/api.ts` `json(...)`/`api.cypher(...)` client seam — an **additive** typed wrapper for the new operator reads, per NFR-05 edit (4)): the `OperatorCockpit` view + its states + its one-line registration replacement + its typed client calls.
- **Server route surface (enumerated additive edits, NFR-05)** (`api/src/router.ts` dispatch lines; `api/src/auth/rbac-permissions.ts` `analytics:read` route entries; `api/src/routes/openapi.ts` two-line `registerOperatorPaths` hook): the shared-append seams — established by `kpi-okr-performance-dashboards` (design §4.7) — that mount, gate, and document the new `analytics/operator*` routes. These are **not** PWA-route files (XD-05 is PWA-only) and **not** `performance.ts`/KPI/risk/SLA/funnel/metric files; they are the minimum edits the router gate + OpenAPI generator require, named here and in NFR-05/AC-11 (B-01/B-02).

## Risks & Open Questions

<!-- Per XD-09 single-shot, all OQs are CLOSED in-artifact to their recommended
     defaults; the design implements the closed defaults. Recorded here for
     traceability, not as blocking gates. -->

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | **OQ-1 (CLOSED — reuse-first, parity-pinned): where does KPI status logic live?** `computeKpiStatus` in `performance.ts` (owned by `kpi-okr-performance-dashboards`) is the canonical band logic, but XD-08 forbids editing that file. **Decision:** import it if it is exported; if not exported, copy the band contract into this feature's own module and **pin parity with a shared-fixture test** (AC-05) — never edit `performance.ts`. (Rejected: adding an export to `performance.ts` — an owned-elsewhere edit; re-deriving divergent bands — would break NFR-04 parity.) FR-03/AC-05 pinned. | Determines whether the status module is an import or a parity-pinned copy — no owned-elsewhere edit either way. | **Closed.** Design checks the export; falls back to the parity-pinned copy. |
| 2 | **OQ-2 (CLOSED — `unattributed` bucket): SLAs with no function alignment.** An `SLA` node may lack an alignment edge into any function domain (Customer Success is the canonical SLA home, but other functions may add SLAs later, or an SLA may be seeded before its alignment). **Decision:** such SLAs are grouped under an explicit **`unattributed`** bucket in the FR-07 rollup — surfaced, not dropped, not blamed on a function; the design freezes whether it renders as a distinct cockpit row or a summary count. (Rejected: dropping unattributed SLAs — hides governed data; crashing — violates the empty/edge-case contract.) FR-07/AC-08 pinned. | Determines FR-07's grouping + AC-08. | **Closed in FR-07.** |
| 3 | **OQ-3 (CLOSED — per-panel error): partial-failure policy.** The cockpit fans out to four signal reads (KPI/risk/funnel/SLA). If one endpoint fails, does the whole cockpit error? **Decision:** **per-panel error state** — a failing signal degrades only its panel; the others render. This is enabled by the FR-02 overview compose being **best-effort per signal** (Resolves: C-04) so a missing signal is a zeroed/errored panel in the single landing response, not a `500` for the whole overview. (Rejected: whole-cockpit error on any one failure — a single flaky read hides three healthy panels.) FR-02/FR-12/AC-15 pinned. | Determines FR-12 error handling + AC-15. | **Closed in FR-02 (server) + FR-12 (client).** |
| 4 | **OQ-4 (CLOSED — overview-first, best-effort compose, per-signal on drill-in) (Resolves: C-04): fetch granularity.** Does the cockpit fetch one combined overview or four separate reads up front? **Decision (pinned, no residual fork):** the landing render calls the **single** FR-02 `overview` endpoint; the per-signal FR-03..FR-07 reads are fetched **only** on drill-in / slice change (for detail rows the overview summary omits). The overview compose is **best-effort per signal** (FR-02): a failing signal yields an errored/absent field in that function's row, not a `500` — so the four landing panels can each degrade independently (OQ-3) from that one call, and OQ-4 and OQ-3 no longer conflict. This is the **fixed** default — the design does **not** get to reopen it by folding the four into the overview differently; the overview is authoritative for the landing summary and per-signal reads exist for drill-in only. | Determines the client fetch shape + how many endpoints the landing render hits. | **Closed, pinned:** overview-first single landing call, best-effort per-signal compose, per-signal reads on drill-in only. No design-time reopen. |
| 5 | **KPI-measurement split-brain** (blueprint Risk): Neo4j `:KPIMeasurement` vs Postgres `kpi_measurements`. | Reading the wrong source would disagree with the performance dashboard + studio arbitration. | The cockpit reads the **same governed Neo4j `:KPIMeasurement`** source the studio arbitrated (FR-04, NFR-04); AC-04 asserts zero Postgres round trips for measurements; AC-05 pins status parity with `performance.ts`. Documented, not re-litigated. |
| 6 | **Cross-function key drift**: a content slice tags a risk `domain` with something other than the function `Domain` node `name` verbatim, so the heatmap misses it. | Under-counted risks for that function. | FR-01/NFR-04 pin the canonical `domain = function-name` convention the content specs adopted (`customer-success-process-model` FR-11/OQ-2); AC-06 asserts grouping against the verbatim `name`. If a content slice diverges, that is the content slice's defect, not the cockpit's — the cockpit surfaces the convention as the contract. |
| 7 | **Empty-graph / wave-ordering**: the cockpit is wave 3; if run before content seeds, functions have no KPIs/risks/funnels/SLAs. | Cockpit shows empty panels. | FR-01/FR-12 make an unseeded function an all-zero row + the view an empty state (AC-01/AC-14), never an error. Dependency waves (all six content specs precede this) ensure real content exists at execution. |
