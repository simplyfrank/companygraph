---
feature: "saas-metric-library"
created: "2026-07-06"
author: "spec-author"
status: "revised"
revision: 2
size: "large"
---

<!-- Revision 2 (status: revised) — addresses review-requirements.md rev-1:
     B-01 (OQ-1 user decision + XD-06 erratum framing), C-01 (OQ-4 false
     "ensure-hook seam" premise corrected), C-02 (FR-04/AC-06 exact-catalog
     freeze at design time), C-03 (`_shared` import-path precision). N-01/N-02
     folded in. No stable IDs renumbered. -->

<!-- REVIEW STATUS: One BLOCKER remains OPEN for the user — B-01 / OQ-1
     (INSTANTIATES edge-name collision). Per the reviewer, the design phase
     MUST NOT start until the user picks OQ-1 (a)/(b)/(c) AND records the
     XD-06 erratum if option (a) is chosen. This is surfaced to the
     orchestrator as the sole blocking Open Question. -->


# Requirements: saas-metric-library

## Summary

`saas-metric-library` is **foundation wave 1b** of the SaaS-Operator
business-process model (blueprint `.claude/specs/blueprint-saas-operator.md`),
depending on `saas-operator-foundation` (wave 1a). It delivers the **canonical
SaaS/finance metric catalog** that every operator KPI is grounded in (blueprint
XD-06): a new **`MetricDefinition` runtime ontology-registry node label** and an
**`INSTANTIATES` edge (KPI→MetricDefinition)** — both created through the
`ontology-manager` registry (`createNodeLabel` / `createEdgeType`), **not** by
editing the compile-time `NODE_LABELS`/`EDGE_TYPES` arrays (XD-02). It ships a
**seed catalog of canonical metric definitions** (CAC, LTV, MRR, ARR, NRR, GRR,
logo/revenue churn, CAC-payback, DSO, gross margin, burn, runway, pipeline
conversion, win rate, MTTR, uptime, …), each carrying a `formula`, `unit`,
`category`, and `benchmark`. It exposes **REST CRUD** for metric definitions and
KPI→MetricDefinition instantiation under `/api/v1/`, and the **`MetricLibrary`
view at `#/business/metrics`** (route pre-registered by `saas-operator-foundation`
per XD-05 — this feature owns **only** the view component file that replaces the
placeholder).

It **does not** define KPI CRUD (that ships in the as-built KPI subsystem —
`kpi-okr-governance` / `kpi-measurement-alignment`), author any per-function KPIs
(the six wave-2 content specs own those and INSTANTIATE these definitions), or
edit the route-registration files `route.ts` / `SURFACES` / `views/index.tsx`
(sole-owned by `saas-operator-foundation`, XD-05 — this feature edits only its
one-line `VIEWS` entry and its own view file).

## Motivation

1. The blueprint makes **XD-06 law**: every operator KPI `INSTANTIATES` a
   `MetricDefinition`; content specs must not invent ad-hoc metric semantics. The
   six wave-2 content specs (marketing, sales, finance, customer-success,
   product, platform-ops) all `depends-on saas-metric-library` (Feature
   Inventory) — they are **blocked** until this canonical catalog and the
   `INSTANTIATES` edge exist. This is a foundation-wave barrier.
2. Without a shared metric library, the same metric (e.g. "gross margin", "CAC")
   would be redefined divergently by each function, defeating
   `cross-function-exec-rollup` (which aggregates comparable KPI health across
   functions) and `function-benchmark-scoring` (which compares a function's KPIs
   to their metric benchmarks). A **single canonical definition per metric**,
   carrying formula/unit/category/benchmark, is the precondition for both wave-3
   analytics specs.
3. The `overlap with commercial-domain metrics` risk (blueprint Risks) is
   resolved by making the library the **single definition**: if a metric already
   exists conceptually in the retail/commercial seed, the library holds the one
   canonical `MetricDefinition` and KPIs `INSTANTIATES` it rather than
   duplicating semantics.
4. `MetricLibrary` (`#/business/metrics`) is the operator-facing browse/CRUD
   surface for the catalog. Its route is already registered by
   `saas-operator-foundation` (rendering `BusinessTabPlaceholder` today, at the
   `metrics:` key in `views/index.tsx` — line 205 as of writing, but the design
   references the key not the line, N-01); this feature makes it live.

## Functional Requirements

<!-- Priorities: must = M1 walking skeleton / wave-2 unblocking depends on it;
     should = polish. -->

### `MetricDefinition` runtime label + `INSTANTIATES` edge (XD-02, XD-06)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **`MetricDefinition` node label registered via the runtime ontology registry** — created through `createNodeLabel` (`POST /api/v1/ontology/node-labels`, `api/src/routes/ontology-node-labels.ts`), **not** by adding an entry to `NODE_LABELS` in `shared/src/schema/nodes.ts` (XD-02). The registration payload conforms to `nodeLabelCreateSchema` (`shared/src/schema/ontology.ts:178`): `name:"MetricDefinition"`, a `description`, a `usage_example`, and a `json_schema_doc` (the supported JSON-Schema subset) declaring the metric's attribute shape — `formula` (string), `unit` (string), `category` (enum: see FR-04), `benchmark` (string/number range descriptor), and free supplementary keys. Registration is **idempotent**: a re-run that finds `MetricDefinition` already registered is a no-op (the registry's create is guarded — a second create returns the existing row or a `409`-style conflict the seeder treats as "already present", not a hard failure). Once registered, `parseRegistryLabel("MetricDefinition")` resolves, so `POST /api/v1/nodes/MetricDefinition` (`handleNodePost`) accepts metric-instance writes. | must | XD-02, XD-06 |
| FR-02 | **`INSTANTIATES` edge type carries a `KPI → MetricDefinition` endpoint pair** in the runtime edge registry so a KPI node can be linked to its canonical metric definition. **NAMING COLLISION — see OQ-1 (BLOCKING open question).** The edge-type name `INSTANTIATES` **already exists**: it is registered by `model-workspace-core` as `ModuleInstance → BusinessModuleVersion` (the module-pin) **and** is a member of the `LIFECYCLE_EDGES` guard set (`api/src/storage/model-lifecycle-guard.ts:28`), which makes `POST /api/v1/edges` reject **any** `INSTANTIATES` write with `409 model_lifecycle_route_required` (`assertNotLifecycleEdge`, `api/src/routes/edges.ts`). Therefore the KPI→MetricDefinition link **cannot** be created through the generic `POST /api/v1/edges` route as long as it is typed `INSTANTIATES`. OQ-1 lists the resolution options (rename the KPI→metric edge, exempt the KPI→MetricDefinition endpoint pair from the guard via a dedicated route, or extend the guard's semantics); **the design MUST NOT proceed until OQ-1 is decided by the user.** Whichever option is chosen, the endpoint pair `(INSTANTIATES-or-renamed, KPI, MetricDefinition)` is registered via `createEdgeType`/`patchEdgeType` (append endpoint to the existing registry row) — **never** by editing `EDGE_TYPES`/`EDGE_ENDPOINTS` in `shared/src/schema/edges.ts` (XD-02). **XD-06 erratum (blocker B-01):** XD-06 and the blueprint Feature Inventory name this edge `INSTANTIATES` **verbatim**; because that literal label collides with the lifecycle-guarded module-pin edge (a fact discovered *after* blueprint approval), choosing OQ-1 option (a) — a distinct name — is an **amendment to app-level law** and must be recorded as a one-line XD-06 erratum in the blueprint, not merely as an OQ resolution. Absent that erratum, a later design/tasks reviewer would (correctly) flag the renamed edge as a View-Tree/XD-06 violation. Options (b)/(c) keep the literal `INSTANTIATES` label and need no erratum. This choice is the user's (see OQ-1). | must | XD-02, XD-06, OQ-1 |
| FR-03 | **KPI → MetricDefinition instantiation link (CRUD)** — a KPI is linked to exactly one canonical `MetricDefinition` via the FR-02 edge. The write path depends on OQ-1's resolution (generic `POST /api/v1/edges` if the edge is renamed out of the guard set, or a dedicated route if it stays `INSTANTIATES` — named at design time once OQ-1 closes). Reading a KPI's metric (and the inverse — which KPIs instantiate a given metric) is a scoped read via the existing `POST /api/v1/query/cypher` (`query:read`). A KPI links to **at most one** `MetricDefinition`; attempting a second link on the same KPI is rejected or replaces the prior (OQ-2 — cardinality-enforcement mechanism). Endpoint-label validation is registry-backed (`400 edge_endpoint_label_mismatch` for a wrong pair), inherited from the graph-core edge validator — no new validation code. | must | XD-06 |

### Canonical metric seed catalog (XD-06, blueprint Feature Inventory)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-04 | **Canonical metric seed catalog** — a set of `MetricDefinition` nodes seeded once with **stable seed ids** the content specs reference (never re-create), each carrying the standard node envelope (`id`, `name`, `description`, `attributes`) plus the metric attributes: **`formula`** (human-readable calc, e.g. `"(New MRR + Expansion MRR − Churned MRR) / Starting MRR"`), **`unit`** (e.g. `"currency"`, `"ratio"`, `"percent"`, `"days"`, `"months"`, `"count"`), **`category`** (a closed enum — proposed: `acquisition`, `revenue`, `retention`, `efficiency`, `financial`, `reliability` — final list is OQ-3), and **`benchmark`** (a descriptor of a good/typical value or range, e.g. `"NRR > 100% healthy; > 120% best-in-class"`). The catalog covers **at minimum** the blueprint-named metrics: **CAC, LTV, MRR, ARR, NRR, GRR, logo churn, revenue churn, CAC-payback, DSO, gross margin, burn, runway, pipeline conversion, win rate, MTTR, uptime** (17). **Exact-set freeze (review C-02):** the "…" (additional canonical metrics — candidates: LTV:CAC ratio, ARPA, magic number, rule-of-40, deploy frequency, error budget) is **not** left open. **At design time the exact catalog list MUST be frozen as an enumerated table** — one row per metric with `(name, stable seed id, formula, unit, category, benchmark)` — so AC-06 asserts an **exact** set (this precise roster, no more/no less), not a ≥ 17 floor that a bare 17 satisfies. The 17 blueprint-named metrics are the mandatory minimum; the frozen design table is the authoritative complete roster. | must | XD-06, blueprint Feature Inventory |
| FR-05 | **Seed idempotency + retail isolation** — the metric catalog is seeded through `realImport` behind `POST /api/v1/import` (graph-core), preceded by an ensure-step that registers the `MetricDefinition` label + FR-02 endpoint pair (registration is **not** an import row, so it must run first). Whether that ensure-then-import runs as a **feature-owned** `seed:saas-metric-library` step (author lean) or via a foundation-owned edit to `seed-saas-operator.ts` is **OQ-4** — the foundation loader has **no** ensure-hook seam (review C-01), so this is an ownership decision, not a drop-in. Each metric carries a stable seed id so MERGE-on-id makes a re-seed add zero nodes. The catalog seeds **only** `MetricDefinition` nodes (reference/canonical, model-independent like `System` per `model-workspace-core` DEC-01); it **never** mutates retail Business Model #1's subgraph or the retail/commercial seed files (XD-01). Metric definitions are **not** scoped `IN_MODEL` — they are a shared canonical catalog available to any model's KPIs. | must | XD-01, XD-04 |
| FR-06 | **Lifecycle-guard compatibility of the seed fixture** — because the catalog loads through `POST /api/v1/import` (`realImport`, which pre-scans and rejects lifecycle rows `409 model_lifecycle_route_required` with payload-atomic write-nothing, `api/src/routes/import.ts`), the `MetricDefinition` fixture rows are **non-lifecycle** node rows (`MetricDefinition` is not in `LIFECYCLE_LABELS`) and the fixture contains **no** `INSTANTIATES` edge rows (INSTANTIATES **is** in `LIFECYCLE_EDGES` — a fixture edge row of that type would be rejected). KPI→MetricDefinition links are therefore created **not** via the seed fixture but via the FR-03 write path (content specs create them when they author their KPIs). The metric-definition seed carries `MetricDefinition` node rows **only**. | must | `model-workspace-core` FR-08/AC-22, XD-04 |

### REST CRUD for metric definitions (`/api/v1/`)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-07 | **Metric-definition CRUD reuses the generic graph-core node routes** — no new bespoke route family is invented for basic CRUD. Create: `POST /api/v1/nodes/MetricDefinition` (`handleNodePost`, `node:write`, validates against the registered `json_schema_doc` via the ontology attribute-zod path). Read one: `GET /api/v1/nodes/MetricDefinition/:id` (`node:read`). Update: `PATCH /api/v1/nodes/MetricDefinition/:id` (`node:write`). Delete: `DELETE /api/v1/nodes/MetricDefinition/:id` (`node:write`). **List** (all metric definitions, for the catalog browse + the content-spec lookup) is a scoped read via `POST /api/v1/query/cypher` (`MATCH (m:MetricDefinition) RETURN … ORDER BY m.name`, `query:read`) **unless** the design finds a list route is warranted — if so it is a **read-only** route owned by this feature with a `node:read`/`query:read` mapping, named at design time, not discovered at build (OQ-5). **No new RBAC permission string** is added — all four verbs map to existing `node:*`/`query:read` permissions already present in `api/src/auth/rbac-permissions.ts`. | must | House rule, graph-core CRUD |
| FR-08 | **Attribute validation from the registered schema** — because `MetricDefinition` is registered with a `json_schema_doc` (FR-01), the as-built ontology attribute enforcement path validates a metric-instance write's `attributes` against that schema at the REST boundary (the same enforcement proven by `api/__tests__/ontology-attribute-enforcement.integration.test.ts`). A metric write missing a required attribute (e.g. no `unit`) or with a wrong-typed `category` is rejected with the standard `invalid_payload`/attribute-enforcement error — **no new validation library**, `zod`-only, reusing the registry's attribute-zod codegen. | must | House rule (zod-only), ontology-manager attribute enforcement |
| FR-09 | **Route auth via the central gate only** — every metric route is gated by the central router (`api/src/router.ts`) + `api/src/auth/` RBAC mapping; **no per-route auth check** (house rule). No route is `public`. This feature adds **zero** new RBAC permission strings and **zero** new route-permission mappings beyond confirming the existing `node:*`/`query:read`/`ontology:*` mappings cover its surface. | must | House rule |

### PWA — `MetricLibrary` view (`#/business/metrics`, XD-05, UX-01)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-10 | **`MetricLibrary` view** (`pwa/src/views/business/MetricLibrary.tsx`, route `#/business/metrics` — **verbatim** from the blueprint View Tree). It consumes the shell-level active-model context (`useActiveModel()`, owned by `model-workspace-core` — **never** re-implemented) for header context only; the metric catalog itself is model-independent (FR-05), so the view lists **all** `MetricDefinition` nodes regardless of active model. It reads the catalog via `POST /api/v1/query/cypher` (the same `api.cypher(...)` client `FunctionMap` uses, `pwa/src/api.ts:157`). It renders each metric with its `name`, `category`, `unit`, `formula`, and `benchmark`, grouped or filterable by `category`. Tokens-only styling via `var(--…)` from `tokens.css`; catalog components (`ViewRegion`, `ViewHeader`, `Loading`, `EmptyState`, `ErrorState` — exported from the single file `pwa/src/views/_shared.tsx`, imported as `from "../_shared"` from a `business/` view exactly as `FunctionMap.tsx:23` does, review C-03) before inventing new ones; `scripts/design-conformance.ts` passes on `MetricLibrary.tsx` + its CSS module. | must | Blueprint View Tree, UX-01, UX-02, XD-05 |
| FR-11 | **All four view states specced** (UX-01): **loading** (skeleton while the catalog fetch is in flight — `Loading`), **empty** (registry has `MetricDefinition` registered but zero metric nodes seeded yet — `EmptyState` prompting `bun run seed:saas-operator`), **error** (fetch failed — `ErrorState` with a retry affordance that refetches), **ready** (the metric catalog rendered as a keyboard-reachable, category-grouped list/grid). | must | UX-01 |
| FR-12 | **View registration is the sole `views/index.tsx` edit** (XD-05) — this feature replaces its **one line** in the `business` surface `VIEWS` map — the `metrics:` key (currently `metrics: () => <BusinessTabPlaceholder tab="Metrics" spec="saas-metric-library" />`, at `pwa/src/views/index.tsx:205` today, though the design should reference the `metrics:` **key** rather than the line number since foundation owns and may re-touch the file before this lands — review N-01) — with `metrics: () => <MetricLibrary />` (the proven `model-workspace-core` seam). It edits **neither** `pwa/src/route.ts` **nor** `SURFACES` (sole-owned by `saas-operator-foundation`, XD-05) — the `#/business/metrics` route already exists and resolves; this feature only makes it render the live view. | must | XD-05, UX-06 |
| FR-13 | **Metric detail is keyboard-reachable and deep-linkable** — each metric in the catalog is reachable by keyboard (Tab in DOM order) and, where a KPI list-per-metric is shown, each linked KPI deep-links into the existing Explorer for that KPI. The `#/business/metrics` deep link survives reload (shell context + hash router guarantee this, UX-06). Metric-definition **create/edit UI** in the PWA is OQ-6 (author lean: **read-only v1** — catalog seed-authored, CRUD exercised via REST/curl and proven at the REST layer by AC-10; an in-view editor is a scope decision). **N-02:** because both this FR and OQ-6 lean read-only, **AC-12..AC-18 deliberately cover only the read/browse surface** (no create/edit AC); if the user elects an in-view editor at design time, a new editor AC is added then — the current ACs do not silently assume an editor that may not ship. | should | UX-05, UX-06 |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | **No new compile-time labels/edges, no new store.** This feature adds **zero** entries to `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS` in `shared/src/schema/{nodes,edges}.ts`. `MetricDefinition` and the KPI→MetricDefinition endpoint pair live **only** in the runtime ontology registry (`createNodeLabel`/`createEdgeType`/`patchEdgeType`), XD-02. All metric content lives in Neo4j as `MetricDefinition` nodes + FR-02 edges; no new datastore. | XD-02, `saas-operator-foundation` NFR-01 |
| NFR-02 | **Idempotency + retail isolation.** Re-running the metric seed yields zero net new nodes/edges (stable seed ids MERGE); no run mutates retail Business Model #1's subgraph or the retail/commercial seed files. Registering `MetricDefinition`/`INSTANTIATES-endpoint` twice is a no-op (registry create/patch idempotency). | XD-01 |
| NFR-03 | **Route-file single ownership (XD-05).** This feature edits **only** its own view file (`MetricLibrary.tsx` + its CSS module) and **its single one-line** `VIEWS` entry in `views/index.tsx`; it never edits `route.ts`/`SURFACES`. A `git diff --stat` confines PWA route-registration changes to that one `views/index.tsx` line. | XD-05 |
| NFR-04 | **House rules.** `zod` is the only validation library (FR-08 reuses the registry's attribute-zod); no `tsc` (transpile via `bun run typecheck`); en-US identifiers; server binds loopback `127.0.0.1:8787`; auth via the central router gate + `api/src/auth/` only; all REST under `/api/v1/`. | CLAUDE.md |
| NFR-05 | **PWA design conformance.** `MetricLibrary` styling is tokens-only (`var(--…)` from `tokens.css`); components come from the existing CSS-Module catalog (`pwa/src/views/_shared.tsx`, imported `from "../_shared"` per the `FunctionMap` precedent, C-03) before new ones; `scripts/design-conformance.ts` passes on `MetricLibrary.tsx` + its CSS module (UX-02). Desktop-first, no new breakpoints (UX-04). | UX-02, UX-04 |
| NFR-06 | **Ownership boundaries.** This feature creates KPI→MetricDefinition data via the governed write path (FR-03) but **never** edits KPI/OKR route code (`kpi-*`, owned by `kpi-okr-governance` / `kpi-measurement-alignment`), risk/SLA/compliance code, or the `route.ts`/`SURFACES`/`views/index.tsx` route-registration owned by `saas-operator-foundation` (beyond its one `VIEWS` line). It does not edit `model-lifecycle-guard.ts` unless OQ-1 is resolved to an option that requires it — and only then within its own ownership if the user assigns it. | XD-04, XD-05, XD-08 |

## UI/UX Requirements

**Views owned by this spec** (from the blueprint View Tree, verbatim):

| Route | View component | Nav surface | States specced (loading·empty·error·ready) |
|-------|----------------|-------------|---------------------------------------------|
| `#/business/metrics` | `MetricLibrary` | Business tab (topbar surf-nav + subnav) | all four — AC-13 (loading), AC-14 (empty), AC-15 (error), AC-12 (ready) |

**UX allowance conformance** (reference blueprint UX-*; do not re-decide):

| Allowance | How this spec satisfies it |
|-----------|---------------------------|
| UX-01 view states | FR-11; AC-12..AC-15 cover MetricLibrary loading/empty/error/ready |
| UX-02 design system (tokens-only, catalog components, design-conformance passes) | FR-10, NFR-05; AC-16 runs `scripts/design-conformance.ts` |
| UX-03 input modes | MetricLibrary ships **no** canvas/gesture/drag surface (the interactive `FunnelBoard` is owned by `funnel-pipeline-modeling`, per UX-03). Only standard link/list/keyboard/filter interaction — the Platforms & Input Modes and Native Conflicts tables below reflect that. |
| UX-04 responsiveness | NFR-05 — desktop-first, no new breakpoints |
| UX-05 accessibility | AC-17 — keyboard reachability of the metric list + category filter, focus order, ARIA landmark (`ViewRegion`) |
| UX-06 navigation (routes verbatim, deep links survive reload) | FR-12 (verbatim route, no route.ts edit), FR-13 (deep link survives reload); AC-18 |

## Scope Boundaries

**In scope:**
- Registering `MetricDefinition` as a runtime ontology-registry node label (`createNodeLabel`) with a `json_schema_doc` covering formula/unit/category/benchmark.
- Registering the KPI→MetricDefinition endpoint pair on the FR-02 edge type via the registry (pending OQ-1's name/route decision).
- The KPI→MetricDefinition instantiation write/read path (FR-03).
- The canonical metric seed catalog (`MetricDefinition` nodes, stable seed ids, formula/unit/category/benchmark), idempotent and retail-isolated, loaded through the foundation's directory-iterating loader.
- Metric-definition REST CRUD via the generic graph-core node routes + a catalog list read.
- The `MetricLibrary` view (`#/business/metrics`), replacing the placeholder — the only PWA files touched are `MetricLibrary.tsx`, its CSS module, and the single `views/index.tsx` line.

**Out of scope (owner named):**
- KPI/OKR node CRUD, KPI measurement/alignment, and KPI route code → `kpi-okr-governance` / `kpi-measurement-alignment` (this feature only *links* KPIs to metrics, and content specs author the KPIs).
- The **per-function KPIs** that INSTANTIATE these metrics → the six wave-2 content specs (`marketing-process-model`, `sales-process-model`, `finance-accounting-process-model`, `customer-success-process-model`, `product-delivery-process-model`, `platform-ops-process-model`).
- `Funnel`/`Stage` labels + `HAS_STAGE`/`CONVERTS_TO` edges + `FunnelBoard` → `funnel-pipeline-modeling`.
- `route.ts`/`SURFACES`/`views/index.tsx` route **registration** (all four `#/business` tabs + `#/exec/operator`) → `saas-operator-foundation` (XD-05); this feature only replaces its own one-line `VIEWS` entry.
- The directory-iterating seed loader mechanism + the SaaS-Operator root/domains/shared-catalog → `saas-operator-foundation` (consumed, never re-implemented).
- `INSTANTIATES` as the module-pin lifecycle edge + `LIFECYCLE_EDGES` guard → `model-workspace-core` (this feature must not break it — the tension is OQ-1).
- Cross-function aggregation over metrics/KPIs → `cross-function-exec-rollup`; benchmark-vs-actual scoring → `function-benchmark-scoring` (both consume this catalog, wave 3).

## Acceptance Criteria

<!-- Every AC traces to at least one FR. Platforms + Verification columns
     mandatory. Verification is a test path or
     `manual: <repro with input mode + observable outcome>`. -->

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | Seeding registers `MetricDefinition` in the runtime node-label registry (`GET /api/v1/ontology/node-labels` includes it with its `json_schema_doc`); `NODE_LABELS` in `shared/src/schema/nodes.ts` is **unchanged** (no compile-time entry added); a re-run of registration is a no-op, not a hard failure (FR-01, NFR-01) | server (bun test + Neo4j) + CLI | `api/__tests__/metric-library-label.integration.test.ts`; manual: `git diff shared/src/schema/nodes.ts` — expect no additions |
| AC-02 | After registration, `POST /api/v1/nodes/MetricDefinition` with a valid metric payload creates a `MetricDefinition` node (`parseRegistryLabel` resolves it); `GET /api/v1/nodes/MetricDefinition/:id` returns it with its `formula`/`unit`/`category`/`benchmark` attributes (FR-01, FR-07) | server (bun test + Neo4j) | `api/__tests__/metric-library-crud.integration.test.ts` |
| AC-03 | **OQ-1 resolution proven**: the KPI→MetricDefinition endpoint pair is registered on the FR-02 edge type via the registry (`GET /api/v1/ontology/edge-types/<name>` shows the `KPI→MetricDefinition` pair); `EDGE_TYPES`/`EDGE_ENDPOINTS` in `shared/src/schema/edges.ts` are **unchanged** (FR-02, NFR-01) | server (bun test + Neo4j) + CLI | `api/__tests__/metric-library-edge.integration.test.ts`; manual: `git diff shared/src/schema/edges.ts` — expect no additions |
| AC-04 | **OQ-1 resolution proven (write path)**: a KPI node can be linked to a `MetricDefinition` through the FR-03 write path (the route named once OQ-1 closes), and the link is **not** rejected `409 model_lifecycle_route_required`; the module-pin `INSTANTIATES` lifecycle edge (`ModuleInstance→BusinessModuleVersion`) and its guard are **unaffected** — a generic `POST /api/v1/edges` with a lifecycle `INSTANTIATES`/`IN_MODEL` row is still rejected `409` (FR-02, FR-03, NFR-06) | server (bun test + Neo4j) | `api/__tests__/metric-library-edge.integration.test.ts` |
| AC-05 | A KPI links to **at most one** `MetricDefinition` (OQ-2 cardinality): a second instantiation link on the same KPI is either rejected or replaces the first per the OQ-2 decision, and a read returns exactly one metric per KPI (FR-03) | server (bun test + Neo4j) | `api/__tests__/metric-library-cardinality.integration.test.ts` |
| AC-06 | The canonical metric seed catalog matches the **exact frozen design-table roster** (review C-02): the test asserts the set of seeded `MetricDefinition` names equals the design table **exactly** (no missing, no extra), which necessarily includes all 17 blueprint-named metrics (CAC, LTV, MRR, ARR, NRR, GRR, logo churn, revenue churn, CAC-payback, DSO, gross margin, burn, runway, pipeline conversion, win rate, MTTR, uptime) plus every design-enumerated addition; each node has a non-empty `formula`, a valid `unit`, a `category` from the closed enum, and a non-empty `benchmark`. The count equals the frozen roster size (≥ 17), asserted as an exact equality against the design table, not merely a ≥ 17 floor (FR-04) | server (bun test + Neo4j) | `api/__tests__/metric-library-seed.integration.test.ts` |
| AC-07 | Seed idempotency + isolation: seeding the metric catalog twice yields zero net new `MetricDefinition` nodes (stable seed ids MERGE); no run mutates retail Business Model #1's subgraph — a pre/post `/api/v1/stats` diff for the retail root is zero; metric definitions are **not** `IN_MODEL`-scoped (FR-05, NFR-02) | server (bun test + Neo4j) | `api/__tests__/metric-library-seed.integration.test.ts` |
| AC-08 | Lifecycle-guard compatibility: the metric fixture contains **only** `MetricDefinition` node rows and **no** `INSTANTIATES` (or other lifecycle) edge rows; loading it via `POST /api/v1/import` (`realImport`) succeeds and writes the metric nodes; a hand-constructed fixture with an `INSTANTIATES` edge row is rejected `409 model_lifecycle_route_required` with nothing written (FR-06) | server (bun test + Neo4j) | `api/__tests__/metric-library-seed-lifecycle-guard.integration.test.ts` |
| AC-09 | Attribute enforcement: a `POST /api/v1/nodes/MetricDefinition` write missing a required attribute (e.g. no `unit`) or with a `category` not in the enum is rejected with the standard attribute-enforcement/`invalid_payload` error; a valid write succeeds (FR-08) | server (bun test + Neo4j) | `api/__tests__/metric-library-attribute-enforcement.integration.test.ts` |
| AC-10 | Metric CRUD full cycle over the generic node routes: create → read → `PATCH` (update `benchmark`) → `DELETE`, each mapping to the existing `node:write`/`node:read` permission with **no** new RBAC string added to `api/src/auth/rbac-permissions.ts` (FR-07, FR-09) | server (bun test + Neo4j) + CLI | `api/__tests__/metric-library-crud.integration.test.ts`; manual: `git diff api/src/auth/rbac-permissions.ts` — expect no permission additions |
| AC-11 | Transpile is clean; no compile-time schema arrays were edited; `route.ts`/`SURFACES` are untouched and the only `views/index.tsx` change is the one `metrics:` line (NFR-01, NFR-03, NFR-04) | CLI | `bun run typecheck` exit 0; manual: `git diff --stat` — expect no change to `pwa/src/route.ts`, no schema-array additions, and `views/index.tsx` limited to the `metrics:` line |
| AC-12 | `#/business/metrics` resolves to `MetricLibrary` (not `BusinessTabPlaceholder`), which renders the seeded metrics with name/category/unit/formula/benchmark in a keyboard-reachable, category-grouped list (FR-10, FR-11 ready-state, FR-12) | macOS Chrome (mouse+kb), macOS Safari (trackpad+kb) | `pwa/src/__tests__/metric-library.test.tsx` |
| AC-13 | `MetricLibrary` renders a loading skeleton while its catalog fetch is pending (FR-11, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/metric-library-states.test.tsx` |
| AC-14 | With `MetricDefinition` registered but zero metric nodes seeded, `MetricLibrary` shows the empty state prompting the seed (FR-11, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/metric-library-states.test.tsx` |
| AC-15 | When `MetricLibrary`'s catalog fetch fails, it shows the error state with a retry affordance that refetches (FR-11, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/metric-library-states.test.tsx` |
| AC-16 | `scripts/design-conformance.ts` passes on `MetricLibrary.tsx` + its CSS module (tokens-only, catalog components) (NFR-05, UX-02) | CLI | manual: `bun scripts/design-conformance.ts --view pwa/src/views/business/MetricLibrary.tsx` and the `.module.css` — expect both exit 0 with zero token/component violations |
| AC-17 | `MetricLibrary` is keyboard-reachable: Tab reaches the category filter and each metric row in DOM order, and the view has an ARIA landmark (`ViewRegion`/`<section aria-label>`) (FR-10, FR-13, UX-05) | macOS Chrome (keyboard), macOS Safari (keyboard) | manual: with the stack up, load `#/business/metrics`, Tab through the view — expect focus lands on the section landmark then moves through the filter and metric rows in order, and any linked KPI activates on Enter |
| AC-18 | Deep link survives reload: navigate to `#/business/metrics`, reload — expect the same route renders the live `MetricLibrary` (from the persisted shell context + hash router) (FR-12, FR-13, UX-06) | macOS Chrome (mouse+kb) | `pwa/playwright/business-metrics-reload.spec.ts` |

## Platforms & Input Modes

This spec touches `pwa/` (the `MetricLibrary` view + its one `views/index.tsx`
line). It ships **no** canvas/gesture/drag surface (the interactive `FunnelBoard`
is owned by `funnel-pipeline-modeling`, per UX-03), and adds **no** new keyboard
accelerator (the `#/business` surface's accelerator situation is owned/decided by
`saas-operator-foundation` — this feature reuses the surface as registered). Only
standard link/list/filter/keyboard interaction.

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| MetricLibrary category filter | yes | yes | yes | yes | standard control (select/segmented); no drag |
| MetricLibrary metric list/grid + rows | yes | yes | yes | yes | desktop-first; standard link/list interaction only, no drag |
| Metric-per-KPI deep links | yes | yes | yes | yes | native anchors into Explorer; no custom pointer handling |
| Loading / empty / error states | yes | yes | yes | yes | static content, no input handling |
| Canvas / drag / pinch-zoom gestures | no | no | no | no | out of scope — owned by `funnel-pipeline-modeling` (`FunnelBoard`) |

## Native Conflicts

This feature introduces **no** new gesture, scroll-container, focus-trap, or
keyboard-accelerator handling. `MetricLibrary` uses native anchors and standard
form controls (a category filter) plus the shared catalog view-state components;
all interaction is via the browser's default focus/click/keyboard behavior. The
`#/business` surface's `Alt+<digit>` surf-jump situation is owned by
`saas-operator-foundation` (its Native Conflicts / OQ-2 already recorded that no
`Alt`-digit accelerator is assigned to the `business` surface); this feature adds
nothing to that handler.

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| (none) | n/a | n/a |

## Dependencies

- **saas-operator-foundation** (wave 1a — the barrier): the `#/business` surface shell + `route.ts`/`SURFACES` registration of the `#/business/metrics` route (consumed, never edited — FR-12); the `views/index.tsx` `VIEWS` seam with the `BusinessTabPlaceholder` this feature replaces on its one line (the `metrics:` key — line 205 as of writing, referenced by key not line per N-01); the directory-iterating seed loader (`seed-saas-operator.ts` → `realImport` behind `POST /api/v1/import`) the metric fixture is discovered by (FR-05); the SaaS-Operator root / shared-catalog machinery; `useActiveModel()` for header context.
- **ontology-manager** (`api/src/routes/ontology-node-labels.ts` `createNodeLabel` via `POST /api/v1/ontology/node-labels`; `api/src/routes/ontology-edge-types.ts` `createEdgeType`/`patchEdgeType` via `POST/PATCH /api/v1/ontology/edge-types`; `nodeLabelCreateSchema`/`edgeTypeCreateSchema` in `shared/src/schema/ontology.ts`; `parseRegistryLabel`; the ontology attribute-enforcement path): the sole sanctioned way to register `MetricDefinition` + the `INSTANTIATES`/renamed endpoint pair at runtime (XD-02) and to validate metric attributes (FR-08).
- **graph-core** (`api/src/routes/nodes.ts` `handleNodePost`/`handleNodeGet`/`handleNodePatch`/`handleNodeDelete` under `/api/v1/nodes/:label`; `api/src/routes/edges.ts` `handleEdgePost`; `api/src/routes/query.ts` `handleCypher` via `POST /api/v1/query/cypher` — `query:read`; `api/src/routes/import.ts` `realImport` behind `POST /api/v1/import` with the lifecycle guard `import.ts` pre-scan): metric-definition CRUD, the catalog read, and the seed load path.
- **model-workspace-core** (`api/src/storage/model-lifecycle-guard.ts` `LIFECYCLE_EDGES` incl. `INSTANTIATES`, `assertNotLifecycleEdge`; `BusinessModuleVersion` module-pin semantics; DEC-01 reference-node sharing): the **collision source** for `INSTANTIATES` (OQ-1) and the guarantee that metric definitions are shared/model-independent like `System`. This feature must not break the module-pin edge or its guard.
- **kpi-okr-governance / kpi-measurement-alignment** (`KPI` node label, KPI CRUD, `ALIGNED_TO`/`PARAM_BINDS` KPI edges): the `KPI` label the FR-02 edge points from; this feature links KPIs to metrics but never edits KPI route code (NFR-06).
- **PWA shell** (`pwa/src/api.ts` `api.cypher`; `pwa/src/context/ActiveModelContext.tsx` `useActiveModel()`; `pwa/src/views/_shared.tsx` — a single file, not a directory — exporting `ViewRegion`/`ViewHeader`/`Loading`/`EmptyState`/`ErrorState`, imported `from "../_shared"` from a `business/` view per `FunctionMap.tsx:23` (C-03); `tokens.css`; `scripts/design-conformance.ts`; the `views/index.tsx` `VIEWS` seam): the `MetricLibrary` view + its states.
- **Seed infrastructure** (`shared/seed/saas-operator/`, the foundation's `seed:saas-operator` wiring): where the metric fixture lands (FR-05, OQ-4).

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | **OQ-1 (BLOCKING — needs the user): the `INSTANTIATES` edge-type name collides with an existing lifecycle edge.** XD-02 names the KPI→MetricDefinition edge **`INSTANTIATES`**, but `INSTANTIATES` is **already** registered by `model-workspace-core` as `ModuleInstance→BusinessModuleVersion` **and** is in the `LIFECYCLE_EDGES` guard set (`model-lifecycle-guard.ts:28`), so `POST /api/v1/edges` rejects **any** `INSTANTIATES` write `409 model_lifecycle_route_required`. The KPI→metric link cannot be created via the generic edge route under that name. **Options:** (a) **register the KPI→metric edge under a distinct name** (e.g. `MEASURES` or `INSTANTIATES_METRIC` — divergs from the blueprint's literal `INSTANTIATES` but is a clean one-line registry change, unblocks `POST /api/v1/edges`, zero guard edits, zero risk to the module-pin); (b) **keep the name `INSTANTIATES`, append the `KPI→MetricDefinition` endpoint pair to the existing registry row, and add a dedicated model-scoped-style write route** for KPI→metric links that bypasses the generic-route guard (larger; risks conflating two very different edges under one type; touches the guard's assumptions); (c) **narrow the guard** so `INSTANTIATES` is guarded only for the `ModuleInstance→BusinessModuleVersion` pair, allowing `KPI→MetricDefinition` through the generic route (edits `model-lifecycle-guard.ts` — owned by `model-workspace-core`, an ownership-boundary change). **Author recommendation: option (a)** — cleanest, no owned-elsewhere edit, no guard risk; the blueprint's `INSTANTIATES` label was chosen before the collision was known. **The design cannot start until the user picks.** **XD-06-erratum caveat (B-01):** option (a) diverges from XD-06's literal `INSTANTIATES` label, so it is a blueprint amendment — if (a) is chosen, the resolution MUST also record a one-line XD-06 erratum in `blueprint-saas-operator.md` (renaming the KPI→MetricDefinition edge to the chosen name, e.g. `MEASURES`), so a later reviewer does not flag the design's edge name as an XD violation. Options (b)/(c) preserve the literal label and need no erratum but cost an owned-elsewhere edit (b: a dedicated route + guard-assumption changes; c: editing `model-lifecycle-guard.ts`, owned by `model-workspace-core`). | Determines FR-02/FR-03's edge name + write route, AC-03/AC-04, whether any owned-elsewhere file is touched, **and whether an XD-06 blueprint erratum is required (option (a) only)**. | **User decision required.** Recommend (a) **plus** an XD-06 erratum. Record the chosen name; FR-02/FR-03/AC-03/AC-04 are pinned to it. |
| 2 | **OQ-2: KPI→MetricDefinition cardinality-enforcement mechanism.** FR-03 says a KPI links to at most one metric. The graph does not enforce edge cardinality natively. **Options:** (a) enforce in the write path (reject a second link `409`/`400 kpi_metric_already_linked`); (b) upsert/replace (a second link removes the first); (c) leave it descriptive (document one-metric convention, don't enforce). | Determines AC-05's behavior and whether a small write-path guard is needed. | Design-time decision; **author leans (a)** for canonical integrity, but flag to user. Low blast radius. |
| 3 | **OQ-3: the `category` closed enum.** FR-04 proposes `acquisition`/`revenue`/`retention`/`efficiency`/`financial`/`reliability`. The final enum (and whether it is a closed `z.enum` in the `json_schema_doc` or free-text) shapes `MetricLibrary`'s grouping and `function-benchmark-scoring`'s later aggregation. | Determines FR-04/FR-08's `category` validation + the view grouping. | Design-time; propose the six above as the closed enum unless the user prefers a different taxonomy. Bounded. |
| 4 | **OQ-4: metric-seed placement + ownership (premise corrected, C-01).** The registry registration (FR-01/FR-02) is **not** a `{nodes,edges}` import row, so the `MetricDefinition` label + KPI→metric endpoint pair MUST be ensured **before** the metric-node fixture is imported (the nodes need the label registered first). **Correction (review C-01):** the foundation loader does **not** expose a pluggable ensure-hook seam. Verified against `api/scripts/seed-saas-operator.ts`: step (a) is a **hardcoded** ensure-sequence (`ensureOperatorRoot` → `ensureFunctionDomains` → `ensureSystems` → `ensureRoles` → `ensurePersonas`, lines 37–41), followed by a fixed directory scan of `shared/seed/saas-operator/*.json` (lines 45–71). Nothing in that loader will run this feature's registration. So the real choice is narrower and heavier than "drop a fixture in": **(i)** `saas-operator-foundation` edits `seed-saas-operator.ts` to add a metric ensure-call — a **foundation-owned** edit this feature cannot make (XD-05/NFR-06) and one that couples the two specs; **or (ii)** this feature ships its **own** registration+seed step (`seed:saas-metric-library`) that (1) ensures the `MetricDefinition` label + FR-02 endpoint pair via the ontology registry, then (2) imports the metric-node fixture via `POST /api/v1/import`, run as a distinct package script (which may itself land the fixture file in `shared/seed/saas-operator/` for the foundation loader to *also* pick up idempotently, or in a feature-owned fixture path). | Determines the register-then-import ordering **and** which spec owns the seed step — an ownership decision, not just placement. | Design-time. **Author leans (ii)** — a self-owned `seed:saas-metric-library` script keeps the feature inside its ownership boundary (NFR-06), avoids coupling to a foundation edit it cannot make, and runs the ensure-before-import ordering explicitly. Confirm with user; (i) is only viable if the foundation spec agrees to add the ensure-call. |
| 5 | **OQ-5: catalog list route.** FR-07 lists metrics via `POST /api/v1/query/cypher`. Is that acceptable, or is a dedicated read-only `GET /api/v1/metric-definitions` (or `GET /api/v1/nodes/MetricDefinition`) warranted for cleaner client typing? | Determines whether a small read route is added (owned here, `node:read`/`query:read`, no new permission). | Design-time; **author leans reuse `query/cypher`** (matches `FunctionMap`'s proven pattern, zero new route). Bounded. |
| 6 | **OQ-6: PWA metric create/edit UI scope.** Is `MetricLibrary` read-only in v1 (catalog seed-authored; CRUD via REST/curl) or does it include an in-view create/edit editor? FR-13 marks the editor `should`. **N-02:** this should be **pinned at design time** so AC-12..AC-18 (which currently cover only the read/browse surface) don't have to cover a create/edit surface that may not ship. | Determines the size of the view + whether input-mode surface grows (an editor form is still standard controls — no gesture work) + whether an editor AC is added. | Scope decision; **author leans read-only v1** (the metrics are a curated canonical catalog, not user-authored churn) — CRUD proven at the REST layer (AC-10). Confirm with user; if an editor is elected, add its AC at design time. |
| 7 | **Overlap with `commercial-domain` metrics** (blueprint Risks). A metric may already exist conceptually in the retail/commercial seed. | Divergent duplicate definitions would defeat XD-06's comparability. | The library is the **single** canonical definition; KPIs (retail or operator) INSTANTIATE it. This feature does not migrate the commercial seed's existing KPIs — that is a content concern; it only guarantees one canonical `MetricDefinition` per metric. |
