# Blueprint: SaaS-Operator Business-Process Model (docorg operator)

## Status: BUILD COMPLETE (Phase C, 2026-07-07) — all 11 features execution:complete; nav reconciled under #/insights
## Author: spec-app (decompose pass)
## Created: 2026-07-06

> This blueprint decomposes a **new subsystem**: a complete business-process
> model of the company that runs the **docorg** project — a lean **vertical-SaaS
> operator** (the **MOMS** medical-office SaaS product + the **Helm** operator
> control-plane) — authored onto the companygraph process graph, PLUS the small
> set of net-new platform capabilities that a SaaS operator's marketing /
> sales / finance / customer-success / product / platform-ops journeys expose.
>
> It **coexists** with `.claude/specs/blueprint.md` (the completed *Business
> Modeling Studio*, which built the authoring *machinery*). This blueprint is
> not a re-spec of that machinery — it is the **content model + the gap
> features** built on top of it. It also coexists with
> `.claude/specs/PROJECT-ROLLUP.md`.

---

## Summary

companygraph's business-modeling **machinery is already `execution:complete`**
(model workspace, authoring wizard, stories/ACs, KPI/OKR/SLA, risk/compliance/
change, DDD system modeling, personas/RBAC). What it lacks is a **domain model
for an online/digital business**: today the graph holds only a retail /
commercial reference. This subsystem fills that gap two ways at once (user
decision: *both content + features*):

1. **Content** — author the docorg SaaS operator as a new `BusinessModel` root
   ("SaaS Operator"), coexisting with retail Model #1, covering six function
   domains at **full-pipeline depth**: journeys → activities×roles → systems →
   KPIs/OKRs → stories/ACs → risks → DDD system mapping. Each function proves
   it **maps onto the companygraph representation** with an explicit mapping
   table, and lands as a loadable seed fixture.

2. **Features** — build the four net-new platform capabilities the operator
   business needs and the current engine lacks: a **SaaS metric library**
   (canonical metric definitions KPIs instantiate), **funnel/pipeline
   modeling** (multi-stage conversion the `PRECEDES` edge can't express), a
   **cross-function executive rollup** (operator cockpit), and **function
   benchmark scoring** (descriptive maturity report).

Approach: everything stays at companygraph's **process-modeling layer** — we
model funnels, metric definitions, and process, **not** operational records
(no Lead/Invoice/Subscription rows; user decision). New constructs are
**runtime ontology-registry labels/edges**, consistent with the studio's
XD-01. Mode: **single-shot** — blueprint approval authorizes spec + build
end-to-end.

---

## App-Level Architecture

```
 saas-operator-foundation  (foundation wave 1a)
   "SaaS Operator" BusinessModel root · shared System/Persona/Role catalog
   (MOMS, Helm, Stripe, CRM, K8s, …) · directory-iterating seed loader
   NEW #/business surface shell + FunctionMap · SOLE owner of route.ts /
   SURFACES / views/index.tsx edits (registers every new route)
        │
   ┌────┴─────────────────────────┐
   ▼                              ▼
 saas-metric-library         funnel-pipeline-modeling      (foundation wave 1b)
   MetricDefinition label       Funnel + Stage labels
   + INSTANTIATES edge          + HAS_STAGE / CONVERTS_TO edges
   canonical metric seed        conversion/drop-off attrs
   MetricLibrary view           FunnelBoard view
        │                              │
        └──────────────┬───────────────┘
                       ▼
   6 content specs (wave 2 — parallel; each owns one seed slice, no new views):
     marketing · sales · finance-accounting · customer-success ·
     product-delivery · platform-ops
        │  (journeys/activities/roles/systems/KPIs↦metrics/funnels/
        │   stories/ACs/risks/DDD, all under the SaaS-Operator root)
        ▼
   cross-function-exec-rollup      function-benchmark-scoring   (wave 3)
     OperatorCockpit (#/exec/operator)   BenchmarkReport (#/business/benchmarks)
     read-only aggregates                 descriptive maturity scores
```

Reuses as-built surfaces (never re-specs them): graph-core CRUD + import,
ontology-manager runtime registry, model-workspace-core BusinessModel roots +
module machinery, business-model-authoring wizard, story-spec-core stories/ACs,
kpi-okr-governance KPI/OKR/SLA routes, ddd-system-modeling SystemModeler +
bounded contexts, risk/compliance/change routes (governed by the in-flight
`risk-compliance-change` backfill), persona/RBAC subsystem, Explorer views.

---

## View Tree (RECONCILED at Phase C — see note)

> **Phase C reconciliation (2026-07-07):** the blueprint originally froze a NEW
> top-level `#/business` surface. During the single-shot build a concurrent
> `navigation-ia` restructure (commit `fb43471`) landed a **7-surface IA**
> (explorer, model, insights, govern, ontology, data, admin — chat became a
> floating widget) and added guard tests forbidding a `#/business`/`#/exec`
> surface. Per the user's Phase C decision, the operator views were reconciled
> **under the existing `insights` surface** (their tabs live in the insights
> `business` group). `saas-operator-foundation` no longer owns a new surface;
> route registration is a set of **additive tabs on `insights` + one VIEWS-map
> line per feature**. All nav guard tests pass. The routes below are the
> as-built truth; the old `#/business/*` paths are unregistered (no alias, per
> the nav-ia guards), and `#/exec/operator` is aliased to `#/insights/operator`.

```
#/insights                    → Insights surface          [nav-ia owned]
├── #/insights/functions      → FunctionMap               [owner: saas-operator-foundation]
├── #/insights/metrics        → MetricLibrary             [owner: saas-metric-library]
├── #/insights/funnels        → FunnelBoard               [owner: funnel-pipeline-modeling]
├── #/insights/benchmarks     → BenchmarkReport           [owner: function-benchmark-scoring]
└── #/insights/operator       → OperatorCockpit           [owner: cross-function-exec-rollup]
                                 (legacy alias: #/exec/operator → #/insights/operator)
```

| Route | View component | Owner (slug) | Nav surface | States specced |
|-------|----------------|--------------|-------------|----------------|
| `#/insights/functions` | `FunctionMap` | `saas-operator-foundation` | Insights tab (business group) | loading·empty·error·ready |
| `#/insights/metrics` | `MetricLibrary` | `saas-metric-library` | Insights tab (business group) | loading·empty·error·ready |
| `#/insights/funnels` | `FunnelBoard` | `funnel-pipeline-modeling` | Insights tab (business group) | loading·empty·error·ready |
| `#/insights/benchmarks` | `BenchmarkReport` | `function-benchmark-scoring` | Insights tab (business group) | loading·empty·error·ready |
| `#/insights/operator` | `OperatorCockpit` | `cross-function-exec-rollup` | Insights tab (business group) | loading·empty·error·ready |

Route registration (`route.ts` tabs + `views/index.tsx` VIEWS lines) was done
by the orchestrator at Phase C to avoid racing the concurrent nav-ia session;
each feature owns its view component file. The six content specs add **no new
views**; they surface through Explorer / `#/insights/functions` / `#/insights/operator`.

Active-model context (which `BusinessModel` the user is in) is the shell-level
concern already owned by `model-workspace-core`; every operator view
**consumes** it and defaults to the SaaS-Operator root — it is never
reimplemented here.

---

## UI/UX Allowances

| ID | Allowance | Requirement |
|----|-----------|-------------|
| UX-01 | View states | Every view specs loading / empty / error / ready states in its ACs |
| UX-02 | Design system | Tokens only (`var(--…)`); catalog components before inventing new ones; `scripts/design-conformance.ts` passes on every touched view |
| UX-03 | Input modes | Platforms & Input Modes + Native Conflicts tables required for the **FunnelBoard** (interactive stage board / drag) and any pointer/keyboard work |
| UX-04 | Responsiveness | Desktop-first, matching the existing PWA; no new breakpoints |
| UX-05 | Accessibility | Keyboard reachability, focus order, ARIA landmarks (`ViewRegion`) per view |
| UX-06 | Navigation | Routes from this View Tree verbatim; deep links survive reload; active-model context survives reload |

---

## Cross-Cutting Decisions

companygraph house rules are already law (en-US identifiers, zod-only, no tsc,
127.0.0.1 loopback, auth via the central router gate + `api/src/auth/`, all
REST under `/api/v1/`). App-specific decisions:

| ID | Decision | Rationale |
|----|----------|-----------|
| XD-01 | **Target = the docorg SaaS operator** (MOMS product + Helm control-plane), modeled as a **new `BusinessModel` root "SaaS Operator"** coexisting with retail Model #1 — never polluting the existing `commercial-domain` / retail seed (Round 2) | Concrete, grounded in the real repo; keeps regimes isolated per the studio's XD-06 |
| XD-02 | New constructs — **`MetricDefinition`, `Funnel`, `Stage`** — are **runtime ontology-registry labels**; new edges **`INSTANTIATES`** (KPI→MetricDefinition), **`HAS_STAGE`** (Funnel→Stage), **`CONVERTS_TO`** (Stage→Stage) via the registry, not compile-time `NODE_LABELS`/`EDGE_TYPES` (rejected: core-schema additions) | Registry is the sanctioned extension path; core stays stable (mirrors studio XD-01/XD-15) |
| XD-03 | **Process-modeling layer only** — model funnels, metric definitions, journeys, and process; **no operational/transactional entities** (no Lead/Opportunity/Subscription/Invoice/Tenant records) (Round 2; rejected: add operational entities) | Stays true to companygraph's "graph of process, not data"; bounds scope |
| XD-04 | Content lands in **Neo4j under the SaaS-Operator root** as loadable fixtures `shared/seed/saas-operator/<function>.json`; a **directory-iterating loader** (owned by foundation) means adding a slice never edits the loader. Risk/compliance/SLA data is created **only via the existing governed APIs** (`risk-register`, `sla-crud`, `compliance-rules`) as DATA — content specs **never edit** `risk-register.ts` / `change-requests.ts` / `risk-compliance.ts` / `compliance-rules.ts` / `sla-crud.ts` (owned by the in-flight `risk-compliance-change` + `kpi-okr-governance` specs) | Zero new store; collision-free slices; respects in-flight ownership |
| XD-05 | **`saas-operator-foundation` is the SOLE owner of `route.ts` / `SURFACES` / `views/index.tsx`** in this fan-out; it registers every new route (all `#/business` tabs + `#/exec/operator`) **additively**; each other feature owns only its view component file (`model-workspace-core` precedent) | Route drift between parallel specs is the top consolidation conflict; single-owner + additive appender eliminates it |
| XD-06 | **KPIs are grounded in the metric library** — every operator KPI links to a `MetricDefinition`; content specs must not invent ad-hoc metric semantics (depends-on `saas-metric-library`) | Canonical, comparable metrics across functions; enables benchmark scoring |
| XD-06-erratum (2026-07-06) | **The KPI→MetricDefinition edge is named `MEASURES`, not `INSTANTIATES`.** XD-06/XD-02 and the Feature Inventory originally named it `INSTANTIATES` verbatim; that literal label was discovered — *after* blueprint approval — to collide with the existing lifecycle-guarded module-pin edge `INSTANTIATES` (`ModuleInstance→BusinessModuleVersion`, a member of `LIFECYCLE_EDGES` in `api/src/storage/model-lifecycle-guard.ts:28`), which makes the generic `POST /api/v1/edges` route reject **any** `INSTANTIATES` write with `409 model_lifecycle_route_required`. Per `saas-metric-library` OQ-1 option (a), the KPI→MetricDefinition edge is registered under the distinct SCREAMING_SNAKE name **`MEASURES`** via the runtime edge registry (`createEdgeType`, endpoint pair `KPI→MetricDefinition`). This is a one-line registry change, needs zero owned-elsewhere edits, and leaves the module-pin `INSTANTIATES` edge + its guard untouched. All downstream references to "the `INSTANTIATES` (KPI→MetricDefinition) edge" mean `MEASURES`. | Resolves the lifecycle-guard collision cleanly; keeps `model-workspace-core`'s module-pin edge + guard untouched |
| XD-07 | **Shared System/Persona/Role catalog seeded once by foundation** (MOMS, Helm, Stripe, CRM, data-warehouse, K8s, PagerDuty, etc.); content specs reference by **stable seed id** and add only function-specific systems within their own slice | Avoids two specs racing to seed the same shared node |
| XD-08 | The **cross-function cockpit is read-only aggregation** — new `GET /api/v1/analytics/operator*` read routes; it never writes and never edits `performance.ts` / `PerformanceDashboard` (owned by `kpi-okr-performance-dashboards`, complete). New `#/exec/operator` tab, route registered by foundation | Read-only rollup is additive; no conflict with the shipped performance surface |
| XD-09 | **Single-shot mode** — blueprint approval authorizes spec + implementation end-to-end; deterministic gates (spec hooks, `bun run typecheck`, `bun test`, `scripts/design-conformance.ts`) replace interactive gates until the Phase C consolidated report (Round 1) | User decision; Phase A gate carries full weight → zero open questions required |
| XD-10 | **Full-pipeline depth is mandatory** — each content spec's ACs cover journeys, activities×roles, systems, KPIs (metric-instantiated), stories/ACs (Given/When/Then), risks, and DDD system mapping; **"maps onto the companygraph representation" is proven by an explicit mapping table** (business action → label/edge) in each `requirements.md` (Round 1) | The core user ask is the mapping; make it a first-class, reviewable artifact |
| XD-11 | New surface `#/business` coexists with existing surfaces and **does not modify the generic `#/model` studio tabs** (owned by `model-workspace-core`, complete) | Operator-specific views stay out of the reusable studio |

---

## Feature Inventory

| Slug | Feature | Tier | Priority | Size | Depends on | Scope |
|------|---------|------|----------|------|-----------|-------|
| `saas-operator-foundation` | Operator model root + #/business shell + seed harness | foundation | must | large | — | "SaaS Operator" `BusinessModel` root; shared System/Persona/Role catalog seed; directory-iterating seed loader; `#/business` surface shell + `FunctionMap` view; **sole owner** of `route.ts`/`SURFACES`/`views/index.tsx` — registers all new routes incl. `#/exec/operator`. Out: metric/funnel labels, content slices, cockpit/benchmark logic |
| `saas-metric-library` | Canonical SaaS/finance metric catalog | foundation | must | large | `saas-operator-foundation` | `MetricDefinition` runtime label + `INSTANTIATES` edge; seed catalog (CAC, LTV, MRR, ARR, NRR, GRR, logo/rev churn, CAC-payback, DSO, gross margin, burn, runway, pipeline conversion, win rate, MTTR, uptime, …) with formula/unit/category/benchmark; REST CRUD; `MetricLibrary` view (`#/business/metrics`). Out: KPI CRUD (exists), per-function KPIs (content specs) |
| `funnel-pipeline-modeling` | Multi-stage funnel/pipeline construct | foundation | must | large | `saas-operator-foundation` | `Funnel` + `Stage` runtime labels; `HAS_STAGE` + `CONVERTS_TO` (conversion-rate/drop-off attrs) edges; REST CRUD; `FunnelBoard` view (`#/business/funnels`) with drop-off analytics. Out: the marketing/sales funnels themselves (content specs instantiate) |
| `marketing-process-model` | Marketing function model | feature | must | medium | `saas-operator-foundation`, `saas-metric-library`, `funnel-pipeline-modeling` | Full-pipeline Marketing domain: journeys (content ops, campaign→lead, MQL scoring, webinars/events, ABM), activities×roles, systems, KPIs↦metrics (CAC, CPL, MQL→SQL), the marketing **funnel** instance, stories/ACs, risks, DDD mapping; seed `marketing.json` + mapping table. Out: sales pipeline |
| `sales-process-model` | Sales function model | feature | must | medium | `saas-operator-foundation`, `saas-metric-library`, `funnel-pipeline-modeling` | Full-pipeline Sales domain: pipeline stages, demo→quote→close→tenant-provision, activities×roles, CRM system, KPIs↦metrics (win rate, sales cycle, ACV, quota attainment), the sales **pipeline** funnel, stories/ACs, risks, DDD; seed `sales.json` + mapping table. Out: marketing funnel, billing |
| `finance-accounting-process-model` | Finance/Accounting function model | feature | must | medium | `saas-operator-foundation`, `saas-metric-library` | Full-pipeline Finance domain: subscription billing, invoice run, dunning, revenue recognition, tax, FinOps/cloud-cost-per-tenant; activities×roles, systems (Stripe, ledger), KPIs↦metrics (MRR/ARR, DSO, gross margin, burn, runway, cloud cost/tenant), stories/ACs, **financial/compliance risks via risk-register API**, DDD; seed `finance-accounting.json` + mapping table. Out: risk-register code (owned elsewhere) |
| `customer-success-process-model` | Customer Success function model | feature | must | medium | `saas-operator-foundation`, `saas-metric-library` | Full-pipeline CS domain: onboarding, health scoring, renewals, churn-save, support ticketing; activities×roles, systems, KPIs↦metrics (NRR, GRR, churn, health score, CSAT, ticket SLA), stories/ACs, **SLA definitions via sla-crud API**, risks, DDD; seed `customer-success.json` + mapping table |
| `product-delivery-process-model` | Product function model | feature | should | medium | `saas-operator-foundation`, `saas-metric-library` | Full-pipeline Product domain: roadmap, spec-driven delivery, product analytics; activities×roles, systems, KPIs↦metrics (cycle time, release freq, feature adoption, spec throughput), stories/ACs, risks, DDD; seed `product-delivery.json` + mapping table |
| `platform-ops-process-model` | Platform Ops / SRE (Helm) function model | feature | must | medium | `saas-operator-foundation`, `saas-metric-library` | Full-pipeline Platform-Ops domain: fleet observability, deploy/release, incident/on-call, SLA/status, backups; activities×roles, systems (K8s, Helm, PagerDuty), KPIs↦metrics (uptime, MTTR, deploy freq, error budget, backup success), stories/ACs, **operational/security risks + SLAs via existing APIs**, DDD; seed `platform-ops.json` + mapping table |
| `cross-function-exec-rollup` | Operator cockpit | feature | must | large | all 6 content specs, `saas-metric-library`, `funnel-pipeline-modeling` | `OperatorCockpit` (`#/exec/operator`): per-function KPI health, risk heatmap, funnel status, SLA rollup, sliceable by function/domain; **read-only** `GET /api/v1/analytics/operator*` aggregates over the SaaS-Operator root. Out: KPI/OKR CRUD (exists), writes |
| `function-benchmark-scoring` | Function maturity/benchmark scoring | feature | should | medium | all 6 content specs, `saas-metric-library` | Per-function descriptive maturity score (metric-vs-benchmark, key-activity coverage, system-automation level), `BenchmarkReport` view (`#/business/benchmarks`); reuses `key-activity-optimizer` scoring patterns; read-only. Out: prescriptive recommendations |

---

## Dependency Graph

```
saas-operator-foundation ─┬─> saas-metric-library ──────┐
                          └─> funnel-pipeline-modeling ──┤
                                                         ▼
        ┌───────────────────────────────────────────────┴──────────────┐
        ▼            ▼            ▼            ▼            ▼             ▼
   marketing     sales     finance-acct   customer-succ  product-del  platform-ops
        └────────────┴────────────┴────────────┴────────────┴──────────┘
                                   │
                    ┌──────────────┴───────────────┐
                    ▼                               ▼
          cross-function-exec-rollup      function-benchmark-scoring
```

- **Foundation wave 1a (barrier):** `saas-operator-foundation` (owns surface + root + seed loader — must land first)
- **Foundation wave 1b (parallel):** `saas-metric-library`, `funnel-pipeline-modeling`
- **Content wave 2 (parallel ×6):** `marketing-process-model`, `sales-process-model`, `finance-accounting-process-model`, `customer-success-process-model`, `product-delivery-process-model`, `platform-ops-process-model`
- **Cross-cutting wave 3 (parallel ×2):** `cross-function-exec-rollup`, `function-benchmark-scoring`

Marketing + Sales depend on `funnel-pipeline-modeling`; the other four content
specs depend only on foundation + metric-library (they instantiate metrics, not
funnels).

---

## Build Order / Milestones

| Milestone | Features | Goal |
|-----------|----------|------|
| M1 | `saas-operator-foundation`, `saas-metric-library`, `funnel-pipeline-modeling` | Operator root + #/business surface + metric/funnel constructs live (walking skeleton) |
| M2 | 6 content specs | The whole SaaS operator authored end-to-end across six functions; each maps onto the representation + seeds cleanly |
| M3 | `cross-function-exec-rollup`, `function-benchmark-scoring` | Operator can see cross-function health + function maturity |

---

## Risks

| Risk | Mitigation |
|------|------------|
| **Single-shot scale**: 11 pipelines ≈ 70–100 agents incl. builds; deterministic gates are the only in-run control | Foundation waves serialize the riskiest specs; hooks + typecheck + `bun test` + design-conformance gate every artifact; Phase C is the human checkpoint |
| **Content specs need risk/SLA data but must not edit risk/SLA code** (owned by in-flight `risk-compliance-change` / `kpi-okr-governance`) | XD-04: create risk/SLA/compliance rows via the governed APIs only; designs cite the endpoint, not the file; Phase C diffs touched files against ownership |
| **Postgres risk/SLA seed path may not exist** (tables are empty, no seed loader) | Flagged as a design question for finance / customer-success / platform-ops specs; likely an API-driven seed script owned by foundation's seed harness (not a storage-code edit) |
| **route.ts single-owner race**: view features register routes | XD-05: only `saas-operator-foundation` edits `route.ts`; it registers ALL routes in wave 1a before any view feature builds; dependency waves enforce ordering |
| **New label registration timing**: content seeds reference `MetricDefinition`/`Funnel` before they exist | Dependency ordering — metric-library + funnel land in wave 1b before content wave 2 |
| **Polluting the retail/commercial seed** | XD-01: SaaS-Operator is a separate `BusinessModel` root; migration/seed is idempotent and scoped to the new root |
| **KPI-measurement split-brain** (Neo4j `:KPIMeasurement` vs Postgres `kpi_measurements`, per studio XD-02) | Cockpit reads the same governed source the studio chose (Neo4j `:KPIMeasurement` via `kpi-trends`); documented, not re-litigated |
| **Overlap with `commercial-domain` metrics** | Metric library is a canonical shared catalog; if a metric already exists conceptually in the commercial seed, the library is the single definition and KPIs INSTANTIATE it |

---

## Open Questions

None — all settled in discussion Rounds 1–3 (recorded as XD-01…XD-11).
Required precondition for the single-shot fan-out.

**Post-approval erratum (2026-07-06):** the `saas-metric-library` design surfaced
a naming collision on the KPI→MetricDefinition edge (`INSTANTIATES` is already a
lifecycle-guarded edge). Resolved by renaming that edge to `MEASURES` — recorded
above as **XD-06-erratum**. No other decision reopened.
