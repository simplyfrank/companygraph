---
feature: "saas-operator-foundation"
created: "2026-07-06"
author: "spec-author"
status: "revised"
revision: 2
size: "large"
---

# Requirements: saas-operator-foundation

## Summary

`saas-operator-foundation` is **foundation wave 1a** of the SaaS-Operator
business-process model (blueprint `.claude/specs/blueprint-saas-operator.md`).
It is the barrier every downstream feature in that fan-out waits on. It delivers
four things: (1) a **"SaaS Operator" `BusinessModel` root** authored onto the
existing `model-workspace-core` machinery, coexisting with retail Business Model
#1 and never polluting the retail/commercial seed (XD-01); (2) a **shared
System/Persona/Role catalog** seeded once so no two downstream specs race to
create the same shared node (XD-07); (3) a **directory-iterating seed loader**
over `shared/seed/saas-operator/` so adding a content slice never edits the
loader (XD-04); and (4) the **new `#/business` PWA surface shell** plus its
`FunctionMap` view at `#/business/functions`. It is the **sole owner** of the
route-registration files (`pwa/src/route.ts`, `SURFACES`, `pwa/src/views/index.tsx`)
for this whole fan-out — it registers **all** new routes additively
(`#/business/{functions,metrics,funnels,benchmarks}` and `#/exec/operator`) so
no sibling feature ever edits those files (XD-05).

It **does not** define the `MetricDefinition`/`Funnel`/`Stage` labels or their
edges (`saas-metric-library`, `funnel-pipeline-modeling`), author any function
content slice (the six wave-2 content specs), or implement the cockpit /
benchmark logic behind `#/exec/operator` / `#/business/benchmarks` (wave-3
specs). It only registers those sibling routes to a placeholder and guarantees
they resolve.

## Motivation

1. Every downstream SaaS-Operator feature (metric library, funnel modeling, six
   content slices, cockpit, benchmark) assumes a **"SaaS Operator" root exists**
   to scope its subgraph and a **`#/business` surface exists** to hang its view
   on. Without this feature landing first, every one of them would independently
   create the root and race to register routes — the top consolidation conflict
   the blueprint calls out (XD-05, Risks row "route.ts single-owner race").
2. The blueprint mandates **route-file single ownership** (XD-05, the proven
   `model-workspace-core` precedent): one feature owns `route.ts` / `SURFACES` /
   `views/index.tsx` and registers **every** new route up front; each other
   feature contributes only its own view component file. That single owner has to
   be this foundation, and it has to register the wave-2/wave-3 routes before
   those features build (dependency waves enforce ordering).
3. Six content specs each reference shared systems (MOMS, Helm, Stripe, CRM,
   data-warehouse, K8s, PagerDuty) and shared personas/roles by **stable seed
   id** (XD-07). If each seeded its own copy there would be seven duplicate
   `System` nodes. The shared catalog must be seeded exactly once, here.
4. The blueprint's content model is a growing set of per-function fixtures under
   `shared/seed/saas-operator/<function>.json` (XD-04). A hand-maintained loader
   that lists each file would force every content spec to edit the loader —
   reintroducing the file-collision the fan-out is designed to avoid. A loader
   that **iterates the directory** means adding `marketing.json` is a pure
   additive act with zero loader edit.
5. The `#/business` surface is the home for the operator-specific views. Its
   shell, route registration, and `FunctionMap` (the per-function landing map of
   the SaaS-Operator root) must be built once, here, and consumed — never
   re-implemented — by the rest of the fan-out.

## Functional Requirements

<!-- Priorities: must = M1 walking skeleton depends on it; should = polish. -->

### SaaS-Operator model root + seed content (XD-01, XD-03)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **"SaaS Operator" `BusinessModel` root** is created via the existing `model-workspace-core` storage/route path (`createModel`, a **non-reference** model → server-assigned `ordinal` = max+1, `status:"active"`, `isReference:false`), **not** by adding a new label or by editing the retail/commercial seed. It coexists with retail Business Model #1 (`isReference:true`, ordinal 1); the retail root, its subgraph, and `shared/seed/{retail-mini,commercial-domain}*.json` are **never modified** (XD-01). Creation is **idempotent** via the OQ-1-locked key: the root carries `attributes.saasOperatorRoot:true` and is found by a **`name:"SaaS Operator"` + `attributes.saasOperatorRoot:true` lookup** before create, so re-running the seed neither creates a second root nor errors. Its server-generated `id` is the operator-root handle discovered at seed/read time (never hard-coded — `createModel` generates the id). (Resolves: C-04 — OQ-1 closed to option (a).) | must | XD-01 |
| FR-02 | **Process-modeling layer only** (XD-03): all seeded content is process structure — `Domain`/`UserJourney`/`Activity`/`Role`/`System` nodes and their core edges, all scoped under the SaaS-Operator root via `IN_MODEL` on the domain roots (per `model-workspace-core` FR-03). **No operational/transactional entities** are created (no `Lead`/`Opportunity`/`Subscription`/`Invoice`/`Tenant` rows and no such labels). This foundation seeds only the shared catalog + the six empty function `Domain` roots scoped to the model; the journeys/activities inside each domain are owned by the wave-2 content specs. | must | XD-03 |
| FR-03 | **Six function `Domain` roots** (`Marketing`, `Sales`, `Finance & Accounting`, `Customer Success`, `Product & Delivery`, `Platform Ops`) are seeded and scoped to the SaaS-Operator root via `IN_MODEL`. Domains are created **without** journeys/activities (those belong to the content specs); this FR guarantees the scoped domain roots exist so a content slice attaches its journeys under an existing domain rather than racing to create it. **Identity + idempotency (Resolves: B-01, C-04/OQ-4).** As-built `attachDomain` (the `POST /api/v1/models/:id/domains` handler, `api/src/storage/models.ts:256-305`) **server-generates** the domain id and does **no** MERGE/existence guard — so a client cannot supply a stable id and a naive re-attach would create duplicate `Marketing` domains. Since `models.ts`/`attachDomain` are owned by `model-workspace-core` and are off-limits here (NFR-04/FR-12), this foundation makes domain seeding idempotent **without editing that path** by a **lookup-before-attach** guard in the seed script: before calling `attachDomain`, the seeder queries the operator root's `IN_MODEL` domains for a domain carrying `attributes.seedKey` = the well-known function key (`marketing`, `sales`, `finance_accounting`, `customer_success`, `product_delivery`, `platform_ops`) written into each domain's `attributes` at first attach; if one exists it is reused, otherwise it is attached once. **The content specs' stable handle to a function domain is its `attributes.seedKey` (resolved by lookup against the operator root), not a fixed id** — the server-generated `id` is discovered at seed time, never hard-coded. A re-seed adds zero domains/edges. (Options considered and rejected: a client-supplied fixed domain id would require extending the `model-workspace-core` attach path — an ownership-boundary change deliberately not taken; the `seedKey` attribute survives the server-generated ordinal/id and needs no cross-spec edit.) | must | XD-04, XD-10 |

### Shared System / Persona / Role catalog (XD-07)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-04 | **Shared `System` catalog** seeded once, each with a **stable seed id** the content specs reference (never re-create): at minimum **MOMS** (the medical-office SaaS product), **Helm** (operator control-plane), **Stripe** (billing), **CRM**, **data-warehouse**, **Kubernetes (K8s)**, **PagerDuty**. Each carries the standard node envelope + `systemKind` (per `system-augmentation-model`). Systems are model-independent per `model-workspace-core` DEC-01 (reference nodes are shared) — they are **not** duplicated per function; a content spec adds only its own function-specific systems within its own slice. Idempotent (MERGE-on-seed-id: re-seed adds zero systems). | must | XD-07, `model-workspace-core` DEC-01 |
| FR-05 | **Shared `Persona` + `Role` catalog** for the operator (the function-owner personas/roles the content specs assign to activities via `EXECUTES`). **Graph shape + seed key (Resolves: C-02).** Two node kinds are seeded: (i) graph **`Role`** nodes (`Role` is a core process label) — the roles content-spec activities point at via `EXECUTES` — and (ii) graph **`Persona`** nodes (the `Persona` label, `shared/src/schema/nodes.ts:10`), the function-owner personas. Both are model-independent reference nodes (like `System`, `model-workspace-core` DEC-01) — seeded once, shared, not duplicated per function. **The stable seed key is the node `name`** (e.g. Role `"Revenue Operations"`, Persona `"Finance Function Owner"`) plus a `attributes.seedKey` slug written on each; the seeder is idempotent by **MERGE-on-`name`** (mirrors FR-04's MERGE-on-seed-id and `model-workspace-core` FR-11's "MERGE by role/persona name"). Personas/roles are seeded through the **existing persona/RBAC subsystem entry point** (`api/scripts/seed-rbac-roles.ts` pattern, extended additively for the operator catalog; `api/src/routes/persona.ts` for any Persona-node write), reusing the same idempotent MERGE-by-name the baseline seed uses. This foundation does **not** invent new RBAC *permissions* or edit `api/src/auth/rbac-permissions.ts` beyond the route-permission mappings this spec's own routes need (FR-12); it seeds the shared *catalog* the content specs reference by `name`/`seedKey`. Idempotent (re-seed adds zero personas/roles). | must | XD-07 |
| FR-06 | **Governed-API seed helper for Postgres-backed data** (blueprint Risks "Postgres risk/SLA seed path may not exist"): the seed harness exposes a sanctioned, **API-driven** path for content specs to create risk/SLA/compliance rows — i.e. it POSTs to the existing governed routes (`/api/v1/risk-register`, `/api/v1/sla-crud`, `/api/v1/compliance-rules`), **never** editing `risk-register.ts` / `change-requests.ts` / `risk-compliance.ts` / `compliance-rules.ts` / `sla-crud.ts` (owned by `risk-compliance-change` + `kpi-okr-governance`, XD-04). This foundation ships the helper mechanism; content specs supply their own rows. This foundation itself creates **no** risk/SLA rows. **Priority raised `should`→`must` (Resolves: C-03):** three wave-2 content specs (finance-accounting, customer-success, platform-ops) have **no** XD-04-compliant way to create risk/SLA/compliance rows without this helper — if it slips they are blocked or tempted to edit owned-elsewhere code, the exact failure XD-04 exists to prevent. It is a barrier every one of those waits on, matching this feature's framing. The helper's round-trip against each named governed route is proven by AC-19; if a governed route is missing a field a content spec needs, that is a gap flagged to the owning spec (OQ-3), not fixed here. | must | XD-04, blueprint Risks |

### Directory-iterating seed loader (XD-04)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-07 | **Directory-iterating seed loader** — a script `api/scripts/seed-saas-operator.ts` (wired as `bun run seed:saas-operator`, matching the existing `api/scripts/seed.ts` entrypoint dir and its `bun --cwd api scripts/…` invocation pattern — Resolves: N-01/N-02) that: (a) ensures the SaaS-Operator root (FR-01) + the six function domains (FR-03) + the shared catalog (FR-04/FR-05) exist; then (b) **reads every `*.json` file in `shared/seed/saas-operator/`** (glob/`readdir`, sorted deterministically by filename) and loads each through the proven **process-content** graph write path — **`POST /api/v1/import`** (`handleImport` → `realImport`, `api/src/routes/import.ts:67,163`; `router.ts:410`), which consumes the `{nodes, edges}` payload (`importPayloadSchema`) the fixtures use and carries the FR-09 lifecycle guard. **This is a different handler from `POST /api/v1/ontology/import`** (`handleOntologyImport`, `router.ts:545`), which validates the ontology-registry payload `{nodeLabels, edgeTypes, …}` — **not** `{nodes, edges}` — and lacks the lifecycle guard (Resolves: B-02). NOTE: the existing `bun run seed` (`api/scripts/seed.ts:14`) posts to `/api/v1/ontology/import`, so this loader deliberately does **not** reuse that route; the shared writer is `realImport` behind `POST /api/v1/import`, the same path `model-workspace-core` documents as "`POST /api/v1/import` joins the FR-08 lifecycle guard set." **Adding a new slice file (`marketing.json`) requires no edit to the loader** — the loader discovers it. The directory may be **empty** at this foundation's completion (content specs add the files later); an empty directory is a clean no-op, not an error. | must | XD-04 |
| FR-08 | **Loader idempotency + scoping**: each slice is loaded via the MERGE-on-id upsert path (`realImport`), so re-running `seed:saas-operator` on an already-seeded graph adds zero nodes/edges (relies on stable seed ids across the fixtures). The loader **only** touches the SaaS-Operator root's subgraph + the shared catalog; it **never** deletes, and it **never** touches retail Business Model #1's subgraph or the retail/commercial seed files (XD-01). Load order is deterministic (filename-sorted) so a slice that references a shared catalog id always runs after the catalog is ensured (step (a) precedes step (b)). | must | XD-01, XD-04 |
| FR-09 | **Lifecycle-guard compatibility**: because the loader writes through `realImport` behind **`POST /api/v1/import`** (FR-07 — the process-content route that carries the guard, not `POST /api/v1/ontology/import`), and `realImport` pre-scans every node + edge row and rejects any lifecycle-labeled row (`BusinessModel`/`BusinessModule`/`BusinessModuleVersion`/`ModuleInstance` + the lifecycle edges `IN_MODEL`/`HAS_VERSION`/`INSTANTIATES`/`INSTANCE_IN`/`FORKED_FROM`) with `409 model_lifecycle_route_required` and **payload-atomic write-nothing** semantics (`api/src/routes/import.ts:167-185`; `model-workspace-core` FR-08/AC-22), the fixtures under `shared/seed/saas-operator/` **must not** contain lifecycle rows. The SaaS-Operator root itself is created via the dedicated `createModel` path (FR-01), not via import; `IN_MODEL` domain-scoping edges (FR-03) are created via the dedicated model-scoped path (`POST /api/v1/models/:id/domains` / `attachDomain`), not via an import row. The loader reserves `POST /api/v1/import` purely for **non-lifecycle** process content. (Resolves: B-02 — the guard citation is now pinned to the route that actually contains it.) | must | `model-workspace-core` FR-08/AC-22, XD-04 |

### `#/business` surface shell + route registration (XD-05, View Tree)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-10 | **`#/business` surface registered in `SURFACES`** (`pwa/src/route.ts`) with `id:"business"`, `label:"Business"`, and its tabs from the blueprint View Tree **verbatim**: `functions` (FunctionMap), `metrics` (MetricLibrary), `funnels` (FunnelBoard), `benchmarks` (BenchmarkReport). Routes follow the existing `#/<surface>/<tab>` hash convention; `parseHash`/`toHash` handle them with no special-casing. **`saas-operator-foundation` is the sole editor of `route.ts` / `SURFACES` in this fan-out (XD-05)** — the four `#/business` tabs are all registered here, additively, before any sibling view feature builds. | must | Blueprint View Tree, XD-05, UX-06 |
| FR-11 | **`#/exec/operator` tab registered on the existing `exec` surface** (`SURFACES`, `pwa/src/route.ts`): add an `{ id:"operator", label:"Operator" }` tab to the existing `exec` surface's tab list, verbatim from the View Tree. `#/exec/operator` resolves through the existing `exec` surf-nav (kbd `7`) — **no new surface accelerator is needed** for it because it reuses the `exec` surface. This foundation registers the tab route; the `OperatorCockpit` view is owned by `cross-function-exec-rollup`. | must | Blueprint View Tree, XD-05, XD-08 |
| FR-12 | **Route-permission mapping + auth** for any new REST route this foundation adds (the FR-07 seed harness runs as a CLI/script, not a public route; if a seed-trigger route is exposed it maps to an existing write permission). No new route is `public`; auth is enforced **only** by the central router gate (`api/src/router.ts`) + `api/src/auth/` — no per-route auth check (house rule). This foundation reuses `model:write` for the model-root/domain creation (already mapped by `model-workspace-core` FR-12); it adds **no** new RBAC permission strings. | must | House rule, `model-workspace-core` FR-12 |

### PWA — FunctionMap view + view-registration (XD-05, UX-01)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-13 | **View registration in `views/index.tsx`** (`pwa/src/views/index.tsx`): `saas-operator-foundation` is the sole editor of this file in the fan-out (XD-05). It adds a `business` surface entry to the `VIEWS` map wiring `functions` → the live `FunctionMap`, and `metrics`/`funnels`/`benchmarks` + the `exec` `operator` tab → a shared **`BusinessTabPlaceholder`** that names the owning downstream spec and does not error, until each owning spec replaces its own line (the proven `ModelTabPlaceholder` pattern — each sibling spec edits **only** its own one-line entry here, never `route.ts`/`SURFACES`). This foundation neither implements nor blocks those sibling views; it only guarantees the routes resolve. | must | Blueprint View Tree, XD-05 |
| FR-14 | **`FunctionMap` view** (`pwa/src/views/business/FunctionMap.tsx`, route `#/business/functions`): the per-function landing map for the active SaaS-Operator model. It **consumes** the shell-level active-model context (`useActiveModel()`, owned by `model-workspace-core` — **never** re-implemented) and defaults to the SaaS-Operator root; it lists the six function domains (FR-03) with their name/description and a count of journeys/activities beneath each. **Read source (Resolves: C-01).** `api/src/routes/models.ts` exposes no route that returns a model's `IN_MODEL` domains with descendant counts; this foundation therefore **does not add a new `models.ts` route** (that file is owned by `model-workspace-core`). Instead `FunctionMap` reads via the **existing graph query route** (`POST /api/v1/query` / the read route that runs a scoped Cypher/traversal — the same generic read Explorer uses), fetching the operator root's `IN_MODEL` domains and, per domain, a `PART_OF`-descendant journey/activity count. This read is mapped to the existing `query:read` permission (already granted; no new RBAC string — FR-12). If the design finds the generic query route cannot express the per-domain count in one call, the fallback is a new **read-only** route owned by this foundation (not `models.ts`) with a `query:read` mapping, flagged as a design-scoped element with its permission named — it is **not** left to be discovered at build time. Specs all four view states — **loading** (skeleton while the fetch is in flight), **empty** (SaaS-Operator model exists but has no function domains yet), **error** (fetch failed — retry affordance), **ready** (function grid rendered). Each function is a keyboard-reachable link that deep-links into the existing Explorer for that domain. Tokens-only styling via `var(--…)`; catalog components before new ones; `scripts/design-conformance.ts` passes. | must | Blueprint View Tree, UX-01, UX-02, UX-05 |
| FR-15 | **Default-to-SaaS-Operator context behavior**: when the `#/business` surface is entered and the active-model context resolves, `FunctionMap` reads the SaaS-Operator root as its subject. It does **not** own or re-implement active-model selection (that is `model-workspace-core`'s shell concern); it consumes `useActiveModel()` and, if the active model is not the SaaS-Operator root, it presents the operator root's functions (defaulting to it by resolving the OQ-1 `name:"SaaS Operator"` + `saasOperatorRoot:true` key to the root's id) rather than an unrelated model's structure. Deep links to `#/business/functions` survive reload (the shell context + hash router already guarantee this — UX-06). | should | Blueprint (active-model shell concern), UX-06 |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | **No new store, no new compile-time labels/edges.** This foundation adds **zero** entries to `NODE_LABELS`/`EDGE_TYPES` in `shared/src/schema/{nodes,edges}.ts` and **zero** new runtime registry labels/edges — it reuses `model-workspace-core`'s `BusinessModel`/`IN_MODEL` and the core process labels. All content lives in Neo4j under the SaaS-Operator root; the shared catalog + fixtures are Neo4j nodes/edges (XD-02/XD-04). | XD-02, XD-04, NFR-01 (`model-workspace-core`) |
| NFR-02 | **Idempotency + retail isolation.** Running `seed:saas-operator` twice yields zero net new nodes/edges (FR-01/FR-03/FR-04/FR-05/FR-08). No run mutates retail Business Model #1's subgraph or the retail/commercial seed files; a post-seed `/api/v1/stats` diff attributable to a **re-run** is zero (XD-01). | XD-01, house data-integrity |
| NFR-03 | **Route-file single ownership (XD-05).** After this foundation lands, `route.ts` / `SURFACES` / `views/index.tsx` carry **all** fan-out routes; no sibling feature edits `route.ts`/`SURFACES`, and each sibling edits **only its own one-line entry** in the `views/index.tsx` `VIEWS` map (the `ModelTabPlaceholder` precedent). This spec's design/tasks make the placeholder seam explicit so a sibling replacing its line is a minimal, collision-free diff. | XD-05 |
| NFR-04 | **Governed-API-only for owned-elsewhere data (XD-04).** This foundation and its seed harness create risk/SLA/compliance data **only** by POSTing to the governed routes (FR-06); no code under `risk-register.ts` / `change-requests.ts` / `risk-compliance.ts` / `compliance-rules.ts` / `sla-crud.ts` / `performance.ts` is edited. Content specs inherit this constraint via the FR-06 helper. | XD-04, XD-08 |
| NFR-05 | House rules: `zod` is the only validation library; no `tsc` (transpile via `bun run typecheck`); en-US identifiers; server binds loopback `127.0.0.1:8787`; auth via the central router gate + `api/src/auth/` only; all REST under `/api/v1/`. | CLAUDE.md |
| NFR-06 | PWA styling is tokens-only (`var(--…)` from `tokens.css`); components come from the existing CSS-Module catalog before new ones; `scripts/design-conformance.ts` passes on `FunctionMap.tsx` + its CSS module (UX-02). Desktop-first, no new breakpoints (UX-04). | UX-02, UX-04 |

## UI/UX Requirements

**Views owned by this spec** (from the blueprint View Tree, verbatim):

| Route | View component | Nav surface | States specced (loading·empty·error·ready) |
|-------|----------------|-------------|---------------------------------------------|
| `#/business/functions` | `FunctionMap` | Business tab (topbar surf-nav + subnav) | all four — AC-11 (loading), AC-12 (empty), AC-13 (error), AC-10 (ready) |

**Routes registered but owned by downstream specs** (FR-10/FR-11/FR-13 — placeholder only here): `#/business/metrics` (`saas-metric-library`), `#/business/funnels` (`funnel-pipeline-modeling`), `#/business/benchmarks` (`function-benchmark-scoring`), `#/exec/operator` (`cross-function-exec-rollup`).

**UX allowance conformance** (reference blueprint UX-*; do not re-decide):

| Allowance | How this spec satisfies it |
|-----------|---------------------------|
| UX-01 view states | FR-14; AC-10..AC-13 cover FunctionMap loading/empty/error/ready |
| UX-02 design system (tokens-only, catalog components, design-conformance passes) | FR-14, NFR-06; AC-14 runs `scripts/design-conformance.ts` |
| UX-03 input modes | FunctionMap ships **no** canvas/gesture/drag surface (that is `FunnelBoard`, owned by `funnel-pipeline-modeling`). Only standard link/list/keyboard interaction — tables below reflect that. |
| UX-04 responsiveness | NFR-06 — desktop-first, no new breakpoints |
| UX-05 accessibility | AC-15 — keyboard reachability of the Business surf-nav/subnav + FunctionMap function links, focus order, ARIA landmark (`ViewRegion`/`<section aria-label>`) |
| UX-06 navigation (routes verbatim, deep links survive reload) | FR-10/FR-11 (verbatim routes), FR-15 (context survives reload); AC-16 (deep link to `#/business/functions` survives reload) |

## Scope Boundaries

**In scope:**
- The "SaaS Operator" `BusinessModel` root (via `model-workspace-core`'s `createModel`), coexisting with retail Model #1.
- Six function `Domain` roots scoped `IN_MODEL` to the operator root (empty of journeys — content is wave 2).
- The shared System/Persona/Role catalog (MOMS, Helm, Stripe, CRM, data-warehouse, K8s, PagerDuty, + shared personas/roles), seeded once with stable ids.
- The directory-iterating seed loader (`seed:saas-operator`) over `shared/seed/saas-operator/`, idempotent, retail-isolated.
- The governed-API seed helper mechanism for risk/SLA/compliance rows (POST-only; content specs supply rows).
- The `#/business` surface shell + `route.ts`/`SURFACES` registration for all four `#/business` tabs **and** the `#/exec/operator` tab; the `views/index.tsx` `VIEWS` wiring with a shared `BusinessTabPlaceholder` for sibling tabs; the live `FunctionMap` view.

**Out of scope (owner named):**
- `MetricDefinition` label + `INSTANTIATES` edge + `MetricLibrary` view → `saas-metric-library`.
- `Funnel`/`Stage` labels + `HAS_STAGE`/`CONVERTS_TO` edges + `FunnelBoard` view → `funnel-pipeline-modeling`.
- The journeys/activities/roles/KPIs/stories/risks/DDD content **inside** each of the six function domains → the six wave-2 content specs (`marketing-process-model`, `sales-process-model`, `finance-accounting-process-model`, `customer-success-process-model`, `product-delivery-process-model`, `platform-ops-process-model`). Each supplies its own `<function>.json` fixture (discovered by this loader) + mapping table.
- `OperatorCockpit` view + `GET /api/v1/analytics/operator*` aggregates → `cross-function-exec-rollup`.
- `BenchmarkReport` view + benchmark scoring → `function-benchmark-scoring`.
- All risk/SLA/compliance/change/KPI **route code** (`risk-register.ts`, `sla-crud.ts`, `compliance-rules.ts`, `change-requests.ts`, `risk-compliance.ts`, `kpi-*`, `performance.ts`) → `risk-compliance-change` / `kpi-okr-governance` / `kpi-okr-performance-dashboards`. This foundation only *calls* those routes (FR-06).
- Active-model selection UI + shell context → `model-workspace-core` (consumed, never re-implemented).

## Acceptance Criteria

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | `seed:saas-operator` creates exactly one "SaaS Operator" `BusinessModel` root (non-reference, `isReference:false`, `ordinal` = max+1, distinct from retail Model #1); a second run creates **no** second root and does not error; retail Business Model #1 (`isReference:true`, ordinal 1) and its `IN_MODEL` domain count are unchanged (FR-01, NFR-02) | server (bun test + Neo4j) | `api/__tests__/saas-operator-root.integration.test.ts` |
| AC-02 | The seed creates **no** operational/transactional labels or nodes (`Lead`/`Opportunity`/`Subscription`/`Invoice`/`Tenant`); `NODE_LABELS`/`EDGE_TYPES` in `shared/src/schema/{nodes,edges}.ts` are unchanged and **no** new runtime registry label/edge is created (FR-02, NFR-01) | server (bun test + Neo4j) + CLI | `api/__tests__/saas-operator-no-txn-entities.integration.test.ts`; manual: `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts` — expect no additions |
| AC-03 | The six function `Domain` roots (`Marketing`, `Sales`, `Finance & Accounting`, `Customer Success`, `Product & Delivery`, `Platform Ops`) exist, each scoped `IN_MODEL` to the SaaS-Operator root and each carrying its well-known `attributes.seedKey` slug (`marketing`/`sales`/`finance_accounting`/`customer_success`/`product_delivery`/`platform_ops`) resolvable by lookup against the operator root; each has zero journeys initially; a re-run (lookup-before-attach on `seedKey`) adds zero domains/edges — no duplicate `Marketing` domain (FR-03, NFR-02) | server (bun test + Neo4j) | `api/__tests__/saas-operator-domains.integration.test.ts` |
| AC-04 | The shared `System` catalog (MOMS, Helm, Stripe, CRM, data-warehouse, K8s, PagerDuty) is seeded once, each with a stable seed id and a valid `systemKind`; a re-run yields **no** duplicate System (MERGE-on-id); these Systems are shared (model-independent), not duplicated per domain (FR-04, `model-workspace-core` DEC-01) | server (bun test + Neo4j) | `api/__tests__/saas-operator-catalog.integration.test.ts` |
| AC-05 | The shared `Persona`/`Role` catalog is seeded once through the existing persona/RBAC subsystem/graph `Role` nodes with stable ids; a re-run adds no duplicate persona/role; **no** new RBAC permission string is added to `api/src/auth/rbac-permissions.ts` (FR-05, FR-12) | server (bun test + Neo4j) | `api/__tests__/saas-operator-catalog.integration.test.ts` |
| AC-06 | The directory-iterating loader loads **every** `*.json` in `shared/seed/saas-operator/` in deterministic filename order via `realImport`; dropping a **new** fixture file into that directory causes it to load on the next run **with no edit to `api/scripts/seed-saas-operator.ts`**; an **empty** directory is a clean no-op (exit 0, zero content rows loaded) (FR-07, FR-08) | server (bun test + Neo4j) | `api/__tests__/saas-operator-seed-loader.integration.test.ts` |
| AC-07 | Loader idempotency + isolation: seeding twice yields zero net new nodes/edges (stable ids MERGE); the loader never deletes and never mutates retail Model #1's subgraph — a pre/post `/api/v1/stats` diff for the retail root is zero across a full `seed:saas-operator` run (FR-08, NFR-02) | server (bun test + Neo4j) | `api/__tests__/saas-operator-seed-loader.integration.test.ts` |
| AC-08 | Lifecycle-guard compatibility: a fixture containing a lifecycle-labeled row (`BusinessModel`/`ModuleInstance`/…) or lifecycle edge, loaded via **`POST /api/v1/import`** (`realImport`), is rejected `409 model_lifecycle_route_required` with **nothing** written from that fixture (payload-atomic pre-scan, `import.ts:167-185`); the SaaS-Operator root and its `IN_MODEL` domain edges are created via the dedicated `createModel`/`attachDomain` path, not via import; the loader posts process content to `POST /api/v1/import` (the guarded route), **not** `POST /api/v1/ontology/import` (FR-09; Resolves: B-02) | server (bun test + Neo4j) | `api/__tests__/saas-operator-seed-lifecycle-guard.integration.test.ts` |
| AC-09 | The `#/business` surface appears in the topbar surf-nav with tabs `functions`/`metrics`/`funnels`/`benchmarks` in View-Tree order, and the existing `exec` surface now shows an `operator` tab; `parseHash("#/business/functions")` and `parseHash("#/exec/operator")` resolve to those tabs with no special-casing; `SURFACES`/`route.ts` is the sole file changed for route registration (FR-10, FR-11, NFR-03) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/business-routes.test.ts` |
| AC-10 | `#/business/functions` resolves to `FunctionMap`, which consumes `useActiveModel()`, defaults to the SaaS-Operator root, and renders the six function domains (name + journey/activity count) in a keyboard-reachable grid; each function deep-links to the Explorer for that domain (FR-14 ready-state, FR-15) | macOS Chrome (mouse+kb), macOS Safari (trackpad+kb) | `pwa/src/__tests__/function-map.test.tsx` |
| AC-11 | `FunctionMap` renders a loading skeleton while its fetch is pending (FR-14, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/function-map-states.test.tsx` |
| AC-12 | With the SaaS-Operator model present but no function domains, `FunctionMap` shows the empty state prompting the seed (FR-14, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/function-map-states.test.tsx` |
| AC-13 | When `FunctionMap`'s fetch fails, it shows the error state with a retry affordance that refetches (FR-14, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/function-map-states.test.tsx` |
| AC-14 | `scripts/design-conformance.ts` passes on `FunctionMap.tsx` + its CSS module (tokens-only, catalog components) (NFR-06, UX-02) | CLI | manual: `bun scripts/design-conformance.ts --view pwa/src/views/business/FunctionMap.tsx` and `bun scripts/design-conformance.ts --view pwa/src/views/business/FunctionMap.module.css` — expect both exit 0 with zero token/component violations |
| AC-15 | `FunctionMap` is keyboard-reachable: Tab reaches the function links in DOM order, the surface has an ARIA landmark, and the Business surf-nav is reachable by keyboard (FR-14, UX-05) | macOS Chrome (keyboard), macOS Safari (keyboard) | manual: with the stack up, load `#/business/functions`, Tab through the view — expect focus lands on the section landmark then moves through the six function links in order, and each activates on Enter |
| AC-16 | Deep link survives reload: navigate to `#/business/functions`, reload — expect the same route renders and the active model (SaaS-Operator root) is still the subject (from the persisted shell context) (FR-15, UX-06) | macOS Chrome (mouse+kb) | `pwa/playwright/business-functions-reload.spec.ts` |
| AC-17 | Sibling routes resolve without error: navigating to each of `#/business/{metrics,funnels,benchmarks}` and `#/exec/operator` renders `BusinessTabPlaceholder` naming the owning spec, and the active-model context is available there (FR-13) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/business-placeholder.test.tsx` |
| AC-18 | Transpile is clean; no compile-time schema arrays were edited and no new RBAC permission string was added; `route.ts`/`SURFACES`/`views/index.tsx` are the sole route-registration files changed (NFR-01, NFR-03, NFR-05) | CLI | `bun run typecheck` exit 0; manual: `git diff --stat` — expect route registration confined to `pwa/src/route.ts` + `pwa/src/views/index.tsx`, no schema-array or `rbac-permissions.ts` permission additions |
| AC-19 | The FR-06 governed-API seed helper successfully round-trips against **each** named governed route: it POSTs one sample risk row to `/api/v1/risk-register`, one SLA row to `/api/v1/sla-crud`, and one compliance row to `/api/v1/compliance-rules`, each returning a success envelope with a persisted id, and edits **none** of the routes' storage code (FR-06, NFR-04) | server (bun test + Postgres) | `api/__tests__/saas-operator-seed-helper.integration.test.ts`; manual: `git diff --stat` — expect no change under `api/src/routes/{risk-register,sla-crud,compliance-rules,change-requests,risk-compliance}.ts` |

## Platforms & Input Modes

This spec touches `pwa/` (the `#/business` surface shell, `route.ts`/`SURFACES`/`views/index.tsx` registration, and the `FunctionMap` view). It ships **no** canvas/gesture/drag surface (the interactive `FunnelBoard` is owned by `funnel-pipeline-modeling`, per UX-03). It adds **no** new keyboard accelerator (`#/exec/operator` reuses the existing `exec` surface; the `#/business` surface's accelerator is a design decision — see Native Conflicts + Risk 4).

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| Business surf-nav + subnav | yes | yes | yes | yes | reuses existing TopBar/SubNav; surf-jump accelerator is a design decision (Risk 4) |
| FunctionMap function grid + links | yes | yes | yes | yes | desktop-first; standard link/list interaction only, no drag |
| Sibling-tab placeholder | yes | yes | yes | yes | static content, no input handling |
| Canvas / drag / pinch-zoom gestures | no | no | no | no | out of scope — owned by `funnel-pipeline-modeling` (`FunnelBoard`) |

## Native Conflicts

The only potential new input handling is a surface-level surf-jump accelerator for the new `#/business` surface. **As-built fact (verified):** `pwa/src/App.tsx` matches `Alt+[0-9]` and maps the digit **positionally** into `SURFACES` (`e.key === "0" ? 9 : Number(e.key) - 1`), calling `e.preventDefault()`. All ten single-digit slots (`1`–`9` + `0`) are already occupied by the ten existing surfaces (explorer, chat, ontology, sme, analytics, api, exec, data, admin, model). Adding an eleventh surface (`business`) therefore has **no free single-digit accelerator** — assigning one requires extending the handler (Risk 4, a design decision). `#/exec/operator` introduces **no** accelerator (it is a tab on the existing `exec` surface). No new gesture, scroll-container, or focus-trap behavior is introduced by this spec.

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| Browser/OS `Alt+<digit>` accelerators | An `Alt`-based surf-jump key for the new `business` surface (if design assigns one) | `e.preventDefault()` inside the extended `App.tsx` keydown branch — same mechanism the existing `Alt+[0-9]` branch already uses (design must first free a key — Risk 4) |
| (no gesture/scroll/canvas handling introduced) | n/a | n/a |

## Dependencies

- **model-workspace-core** (`api/src/storage/models.ts` `createModel`/`attachDomain`, `api/src/routes/models.ts` `/api/v1/models*` incl. `POST /api/v1/models/:id/domains`, `BusinessModel` label + `IN_MODEL` edge, the `business_model_ordinal_unique` constraint, `model:read`/`model:write` permissions, `pwa/src/context/ActiveModelContext.tsx` `useActiveModel()`): the sole sanctioned path for the SaaS-Operator root, the `IN_MODEL` domain scoping, and the consumed active-model shell context. DEC-01 (reference nodes shared) governs the shared System/Role catalog.
- **graph-core import + two-phase writer** (`api/src/routes/import.ts` `handleImport`/`realImport` behind **`POST /api/v1/import`** — `router.ts:410`, the `{nodes,edges}` process-content route that carries the lifecycle guard `import.ts:167-185`; the MERGE-on-id upsert path). **Not** `POST /api/v1/ontology/import` (`handleOntologyImport`, `router.ts:545`), which takes the ontology-registry payload and lacks the guard. This is the loader's write path (FR-07/FR-08/FR-09) — corrected per B-02.
- **graph query read route** (the generic scoped read Explorer uses, mapped to `query:read`): the FR-14 `FunctionMap` per-domain journey/activity count read (C-01); no new `models.ts` route is added.
- **system-augmentation-model** (`systemKind` on `System` nodes): the shared System catalog carries a valid `systemKind` (FR-04).
- **persona/RBAC subsystem** (`api/src/routes/persona.ts`, `api/src/scripts/seed-rbac-roles.ts`, `api/src/auth/rbac-permissions.ts`): the shared persona/role catalog path (FR-05); no new permission added (FR-12).
- **Governed data routes** (`/api/v1/risk-register`, `/api/v1/sla-crud`, `/api/v1/compliance-rules` — owned by `risk-compliance-change` + `kpi-okr-governance`): the FR-06 seed helper POSTs to these; never edits their code.
- **PWA shell** (`pwa/src/route.ts` `SURFACES`/`parseHash`/`toHash`, `pwa/src/App.tsx` keydown handler + surf-nav, `pwa/src/views/index.tsx` `renderView`/`VIEWS`, TopBar/SubNav catalog, `_shared` Loading/ErrorState/ViewHeader, `tokens.css`, `scripts/design-conformance.ts`): the surface shell + FunctionMap.
- **Seed infrastructure** (`api/scripts/seed.ts` pattern, `shared/seed/`, `package.json` scripts): the `seed:saas-operator` wiring.

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | **OQ-1 (CLOSED — locked to option (a) per XD-09 single-shot, Resolves: C-04): SaaS-Operator root identity mechanism.** How is the operator root found idempotently? `createModel` server-assigns `ordinal` (max+1) and generates the `id`, so neither is fixed at author time; a name/attribute lookup is the only mechanism that survives an existing graph. **Decision: option (a)** — the operator root is created with `attributes.saasOperatorRoot:true` and found idempotently by a **`name:"SaaS Operator"` + `attributes.saasOperatorRoot:true` lookup**. Its server-generated `id` is discovered at seed/read time and used as the operator-root handle by content specs + `FunctionMap` (FR-15) — never a hard-coded id. (Rejected: option (b) fixed constant UUIDv7 — would need a lifecycle-guard-exempt create path conflicting with `createModel`'s server-generated id.) FR-01/FR-15/AC-01/AC-16 are pinned to this key; no open question remains for the single-shot gate. | Determines the FR-01 idempotency lookup and the handle every content spec + `FunctionMap` (FR-15) uses to default to the operator root. | **Closed to (a).** Design implements the `saasOperatorRoot:true` + name lookup; if the user later prefers (b), it is a bounded FR-01 change, not a design blocker. |
| 2 | **OQ-2 (CLOSED — locked to option (a) per XD-09 single-shot, Resolves: C-04): `#/business` surf-jump accelerator.** All ten `Alt+[0-9]` slots are taken (Native Conflicts). **Decision: option (a)** — the `business` surface ships with **no** `Alt`-digit surf-jump accelerator; it is keyboard-*reachable* by Tab/focus and mouse click, which is all AC-15 requires. `App.tsx`'s positional `Alt+[0-9]` handler is **not** edited (it is outside the XD-05 route-file set and out of this spec's ownership). (Rejected: option (b) migrate `App.tsx` to a `kbd`-field lookup + assign a chord — a larger `App.tsx` change with no AC requiring it.) No open question remains for the single-shot gate. | AC-15 requires the surface be keyboard-*reachable* (via Tab/focus), not surf-jumpable. | **Closed to (a).** No accelerator; AC-15 satisfied by focus order. Native Conflicts row stays as the record of *why* no accelerator was assigned. |
| 6 | **OQ-4 (CLOSED — folded into FR-03, Resolves: B-01/C-04): function-`Domain` identity + idempotency.** `attachDomain` server-generates the domain id and does no MERGE. **Decision:** idempotency by **lookup-before-attach on `attributes.seedKey`** against the operator root's `IN_MODEL` domains; content specs resolve a function domain by its `seedKey` slug, not a fixed id (FR-03). `model-workspace-core`'s `attachDomain`/`models.ts` are **not** edited. | Determines the FR-03 idempotency lookup + the handle content specs use to attach journeys under a function domain. | **Closed in FR-03.** No open question remains for the single-shot gate. |
| 3 | **Postgres risk/SLA seed path may not exist** (blueprint Risks). Content specs (finance, customer-success, platform-ops) need risk/SLA rows but the tables have no seed loader and this foundation must not edit their storage code. | Content specs could be blocked or tempted to edit owned-elsewhere code — the exact failure XD-04 prevents. | FR-06 (now **`must`** — C-03) makes the seed harness an **API-driven** helper (POST to governed routes); AC-19 proves it round-trips against each named route; design specifies the exact endpoints + payload shape. **OQ-3:** if a governed route is missing a field a content spec needs, that is a gap flagged to the owning spec — not fixed here. |
| 4 | **`route.ts`/`views/index.tsx` single-owner discipline must hold across the fan-out** (XD-05). If a sibling spec edits `route.ts`/`SURFACES`, the whole no-conflict guarantee breaks. | Consolidation conflict — the top fan-out risk. | This foundation registers **every** route additively up front (FR-10/FR-11/FR-13) before any sibling builds; siblings edit only their own one-line `VIEWS` entry. NFR-03 + AC-18 assert the boundary. Dependency waves enforce ordering. |
| 5 | **Empty seed directory at foundation completion.** The six `<function>.json` fixtures land in wave 2, so `shared/seed/saas-operator/` is empty when this foundation completes. | A loader that errors on an empty dir would fail CI. | FR-07/AC-06 make an empty directory a clean no-op; the loader still ensures the root + domains + catalog (steps (a)) regardless of directory contents. |
