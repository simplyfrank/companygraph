---
feature: "saas-metric-library"
created: "2026-07-06"
author: "spec-author"
status: "draft"
revision: 1
reviewing_requirements_revision: 2
reviewing_design_revision: 1
size: "large"
total_tasks: 14
---

# Tasks: saas-metric-library

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocked by` / `Blocks`); no out-of-order execution.
- **Deferred-green rule**: the registry-ensure, seed, cardinality, and CRUD
  tasks (T-01…T-08) drive the loopback API on `127.0.0.1:8787`, so their
  **integration** tests need a running API + Neo4j. At each such task's
  checkpoint run `bun run typecheck`; the full `*.integration.test.ts` files run
  green under `bun test:integration` once the stack is up (`bun run dev`). The
  PWA slice (T-09…T-12) runs under `bun test` (component/unit); AC-18 is a
  Playwright e2e needing the full stack + a seeded catalog.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook blocks STATUS.md updates without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h, one judgment
  call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck`; after
  tasks that ship behaviour, also run the listed test. Tasks touching
  `pwa/src/views/` run `bun run scripts/design-conformance.ts --view <file>`
  for **every** file the task touches under `pwa/src/views/` — each `.tsx` and
  each `.module.css` gets its own invocation.
- **Ownership guard (XD-02/XD-05/NFR-01/NFR-03/NFR-06)**: the files under
  "Explicitly NOT edited" in design §9 are off-limits —
  `shared/src/schema/{nodes,edges}.ts`, `api/src/storage/model-lifecycle-guard.ts`,
  `api/src/routes/{edges,nodes,import,query}.ts`, `api/src/storage/edges.ts`,
  `api/src/routes/ontology-*.ts`, `api/src/ontology/**`,
  `api/src/auth/rbac-permissions.ts`, `api/src/errors.ts`,
  `pwa/src/route.ts`, `pwa/src/App.tsx`, the `SURFACES` list, and
  `api/scripts/seed-saas-operator.ts`. **No task edits them.**
  `pwa/src/views/index.tsx` is edited **only** for this feature's single
  `metrics:` `VIEWS` line + its `MetricLibrary` import (XD-05 view seam).

## Design-basis pins (design rev 1 approved)

Design rev 1 is `approved` (`review-design.md` pass 1 = **approve**, zero
blockers). The binding decisions the implementer must not re-derive:

| Design decision (rev 1) | Binding for execution | Locked in task |
|-------------------------|-----------------------|----------------|
| **OQ-1 (a) — edge name `MEASURES`** (§3.2): the KPI→MetricDefinition edge is a **distinct, unguarded** runtime edge type named `MEASURES` (SCREAMING_SNAKE), registered via `createEdgeType` with the `KPI→MetricDefinition` endpoint pair. `MEASURES ∉ LIFECYCLE_EDGES`, so the generic `POST /api/v1/edges` accepts it — **zero** `EDGE_TYPES`/`EDGE_ENDPOINTS` edit, **zero** guard edit. The **XD-06-erratum** is recorded in the blueprint. | Edge name is `MEASURES`, never `INSTANTIATES`. | T-02 |
| **OQ-2 (a) — reject the second link** (§5.3): a KPI links to **at most one** `MetricDefinition`; a second `MEASURES` write from the same KPI is rejected `409 kpi_metric_already_linked` by a feature-owned write helper. Enforcement is **write-path-scoped** (advisory — no native graph cardinality constraint). | Cardinality guard in the helper; AC-05 scoped to the write path. | T-03 |
| **OQ-3 — closed six-value `category` enum** (§3.1): `acquisition · revenue · retention · efficiency · financial · reliability`, expressed as a JSON-Schema `enum` inside `json_schema_doc`. `unit` is a second closed enum: `currency · ratio · percent · days · months · count`. | Both enums live in the registered `json_schema_doc`. | T-01, T-04 |
| **OQ-4 (ii) — self-owned seed step** (§5.4): a feature-owned `seed:saas-metric-library` step ensures the registry (label + edge) **then** imports the metric fixture. The fixture lives at the **feature-owned** path `shared/seed/saas-metric-library/metrics.json`, **not** in `shared/seed/saas-operator/` (register-before-import ordering hazard N-02'). | Feature owns the seed CLI + fixture path; foundation loader untouched. | T-05, T-06 |
| **OQ-5 — reuse `query/cypher`** (§5.5): the catalog list read is `POST /api/v1/query/cypher` (`query:read`); **no** `GET /api/v1/metric-definitions` route is added. | Catalog list via `query/cypher`. | T-04, T-09 |
| **OQ-6 — read-only v1 view** (§6): `MetricLibrary` browses the seeded catalog; **no** in-view editor. CRUD proven at the REST layer (AC-10). | View is read-only; no editor AC. | T-09 |
| **Frozen 20-metric roster** (§4): the catalog is exactly the 20 rows in design §4 (17 blueprint-named + LTV:CAC Ratio, Rule of 40, Deploy Frequency), each with a stable seed id + the four enforced attributes. AC-06 asserts set-**equality**. | Roster is closed; edit §4 + AC-06 together if it ever changes. | T-05, T-06 |
| **No new wire error code** (§5.6): `kpi_metric_already_linked` is a **helper-local** 409 message, NOT an `ERROR_CODES` member. `api/src/errors.ts` is untouched. | Helper-local 409; no `ERROR_CODES` edit. | T-03 |

Full rationale: design §2 (OQ resolution table), §3.1–§3.4, §4, §5.1–§5.6,
§6.1–§6.7, and `review-design.md` (C-01/C-02/C-03).

## Open design concerns — pinned decisions (from review-design.md)

Design review pass 1 (`approve`) left three Concerns and two Nits for the tasks
author to pin. All are landed below; none reopens the architecture.

| Concern | Decision | Rationale | Locked in task |
|---------|----------|-----------|----------------|
| **C-01** — AC-17's "linked KPI activates on Enter" is untestable in read-only v1 (the seed carries **no** `MEASURES` edges, so a freshly-seeded catalog has zero KPIs to list) | **The per-metric KPI list does NOT ship in v1.** AC-17 is scoped to: focus lands on the `ViewRegion` landmark, then the category filter, then each metric row in DOM order. The **KPI-Enter clause is dropped** from v1; `MetricLibrary` fetches only the metric list (§6.4), so no second `MATCH (k:KPI)-[:MEASURES]->(m)` read is authored. A KPI-per-metric list is a follow-up-spec concern. | No `MEASURES` data exists at seed time (Rule D); avoids an AC with no DOM target. | T-09, T-12 |
| **C-02** — the §5.3 cardinality guard is advisory-only; AC-05 must not over-claim a graph-level guarantee | **`linkKpiToMetric` is the SINGLE sanctioned write path.** The "or replicate the two-step check" escape hatch is **dropped** — content specs **import the exported helper**, they do not hand-roll the read-before-write. AC-05 asserts the helper rejects the second link AND documents that enforcement is **write-path-scoped** (a raw `POST /api/v1/edges` could still create a second `MEASURES` edge; a hard Neo4j constraint is out of ownership, design §12). | One enforcement path; no per-author TOCTOU reproduction; honest AC scope. | T-03 |
| **C-03** — the empty-state seed command must be `seed:saas-metric-library` (design §6.4), not the requirements' stale `seed:saas-operator` | **Empty-state copy prompts `bun run seed:saas-metric-library`** and AC-14's test **asserts that exact string** so the copy and the script name (T-06) cannot drift. Requirements FR-11's `seed:saas-operator` wording is **superseded**. | The seed is feature-owned (OQ-4 ii); pin the string to prevent drift. | T-06, T-11 |
| **N-02** (nit) — confirm `additionalProperties:true` does not read as "enforcement off" | AC-09's test asserts BOTH that an out-of-enum `unit`/`category` (or missing required attr) is **rejected** AND that an unrelated extra key is **accepted** (so a reader can't mistake the open extras for disabled enforcement). | Makes the four-attribute enforcement + open extras both observable. | T-08 |
| **N-01/N-03** (nits) — stale "defined at" line citations; roster count 20 vs "17 + …" | No action beyond awareness: the cited symbols are call-sites, and the 20-row roster is the deliberate freeze (design §4, review N-03). | Harmless drift; roster edit rule already stated. | — |

## Task list

### T-01 — Metric catalog data + internal zod shape + `json_schema_doc`

- **Files** (1): `api/src/seed/metric-catalog.ts` (new)
- **Implements**: design §3.1, §3.4, §4 — supports FR-04, FR-08
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-02, T-05, T-06
- **Steps**: This file is pure data + shapes — no driver, no fetch.
  1. Export the **internal (non-REST) zod input shape** `metricRowSchema`
     (§3.4): `id` (min 1), `name` (min 1), `description` (default `""`),
     `formula` (min 1), `unit` (`z.enum(["currency","ratio","percent","days",
     "months","count"])`), `category` (`z.enum(["acquisition","revenue",
     "retention","efficiency","financial","reliability"])`), `benchmark`
     (min 1). This is internal to the seed harness — **never** a REST boundary
     shape (registration + metric writes reuse the as-built
     `nodeLabelCreateSchema`/`nodeCreateSchema`, §3.4). `zod` only, en-US
     identifiers.
  2. Export the **frozen 20-metric roster** `METRIC_CATALOG` — the exact §4
     table, one object per row carrying `id` = the stable seed id
     (`metric-cac`, `metric-ltv`, `metric-ltv-cac-ratio`, `metric-mrr`,
     `metric-arr`, `metric-nrr`, `metric-grr`, `metric-logo-churn`,
     `metric-revenue-churn`, `metric-cac-payback`, `metric-dso`,
     `metric-gross-margin`, `metric-burn`, `metric-runway`, `metric-rule-of-40`,
     `metric-pipeline-conversion`, `metric-win-rate`, `metric-mttr`,
     `metric-uptime`, `metric-deploy-frequency`), `name`, `description`,
     `formula`, `unit`, `category`, `benchmark` — copied **verbatim** from
     design §4 (no paraphrase of the enforced attributes).
  3. Export the **`METRIC_DEFINITION_LABEL` registration payload** — the §3.1
     `nodeLabelCreateSchema` object (`name:"MetricDefinition"`, `description`,
     `usage_example`, and the `json_schema_doc` with the two `enum`s,
     `required:["formula","unit","category","benchmark"]`,
     `additionalProperties:true`). This is the single source of the
     `json_schema_doc` (consumed by T-05's ensure-label step and the T-08
     enforcement test).
- **Verification**: `api/__tests__/metric-library-seed.integration.test.ts`
  (jointly with T-05/T-06) imports `METRIC_CATALOG`, asserts all 20 rows parse
  `metricRowSchema`, every `id` and `name` is unique, and the name set equals
  the §4 roster exactly (count = 20). At this task's checkpoint `bun run
  typecheck` passes.

### T-02 — `MetricDefinition` label ensure (idempotent `createNodeLabel`)

- **Files** (1): `api/src/seed/ensure-metric-label.ts` (new)
- **Implements**: design §3.1, §5.1 — closes AC-01 (registration half); supports FR-01, NFR-01
- **Complexity**: simple
- **Blocked by**: T-01
- **Blocks**: T-03, T-05
- **Steps**: `ensureMetricDefinitionLabel(baseUrl): Promise<void>` (§5.1):
  1. POST `METRIC_DEFINITION_LABEL` (T-01) to
     `POST /api/v1/ontology/node-labels` (`ontology:write`) over the loopback
     API (trusted operator tooling, same pattern as the foundation loader's
     import POST).
  2. On `201` → registered. On `409 name_conflict` → already registered, treat
     as success (idempotent, AC-01). On any other non-2xx → throw (surface the
     failure). Edit **no** `NODE_LABELS` entry in `shared/src/schema/nodes.ts`
     (NFR-01).
- **Verification**: `api/__tests__/metric-library-label.integration.test.ts` —
  after `ensureMetricDefinitionLabel`, `GET /api/v1/ontology/node-labels`
  includes `MetricDefinition` with its `json_schema_doc`; a second call is a
  no-op (409-as-idempotent, not a hard failure); manual:
  `git diff shared/src/schema/nodes.ts` shows no additions (AC-01, NFR-01).
  Deferred-green: `bun test:integration`.

### T-03 — `MEASURES` edge ensure + cardinality-guarded link helper (OQ-1 a, OQ-2 a)

- **Files** (2): `api/src/seed/ensure-measures-edge.ts` (new),
  `api/src/seed/link-kpi-metric.ts` (new)
- **Implements**: design §3.2, §3.3, §5.2, §5.3 + `review-design.md` C-02 —
  closes AC-03 (edge-registration half), AC-05; supports FR-02, FR-03, NFR-01, NFR-06
- **Complexity**: moderate
- **Blocked by**: T-02
- **Blocks**: T-05, T-07
- **Steps**:
  - `ensureMeasuresEdgeType(baseUrl): Promise<void>` (§5.2, OQ-1 a): POST the
    §3.2 `edgeTypeCreateSchema` payload (`name:"MEASURES"`, `description`,
    `usage_example`, `endpoints:[{fromLabel:"KPI", toLabel:"MetricDefinition"}]`)
    to `POST /api/v1/ontology/edge-types` (`ontology:write`). `201` → registered;
    `409 name_conflict` → already registered → success (idempotent, AC-03);
    other non-2xx → throw. Must run **after** the label is ensured (the endpoint
    pair references `MetricDefinition`, `assertEndpointLabelsExist`). Edit **no**
    `EDGE_TYPES`/`EDGE_ENDPOINTS` in `shared/src/schema/edges.ts` and **no**
    `model-lifecycle-guard.ts` (NFR-01, NFR-06).
  - `linkKpiToMetric(baseUrl, kpiId, metricId): Promise<string>` (§5.3, OQ-2 a,
    C-02) — the **single sanctioned** KPI→metric write path:
    1. Pre-check via `POST /api/v1/query/cypher`
       (`MATCH (k:KPI {id:$kpiId})-[m:MEASURES]->() RETURN count(m) AS n`).
    2. If `n > 0` → throw a **helper-local** `kpi_metric_already_linked` error
       (the caller maps it to a `409`; it is **not** an `ERROR_CODES` member —
       `api/src/errors.ts` untouched, §5.6). Else POST
       `{type:"MEASURES", fromId:kpiId, toId:metricId}` to `POST /api/v1/edges`
       (`edge:write`) and return the created edge id.
    **C-02 pin**: this exported helper is the **only** sanctioned link path;
    content specs **import it** — there is no "replicate the two-step check"
    alternative. Enforcement is **write-path-scoped** (advisory), documented in
    the helper doc-comment.
- **Verification**:
  - `api/__tests__/metric-library-edge.integration.test.ts` (AC-03 registration
    half) — after `ensureMeasuresEdgeType`,
    `GET /api/v1/ontology/edge-types/MEASURES` shows the `KPI→MetricDefinition`
    endpoint pair; manual: `git diff shared/src/schema/edges.ts` shows no
    additions.
  - `api/__tests__/metric-library-cardinality.integration.test.ts` (AC-05) —
    `linkKpiToMetric` links a KPI→metric once (returns an edge id); a second
    call on the same KPI throws `kpi_metric_already_linked` (mapped 409); a
    read returns exactly one metric per KPI; the test comment states enforcement
    is write-path-scoped (C-02). Requires a `KPI` node fixture + a seeded metric.
  Deferred-green: `bun test:integration`.

### T-04 — Catalog list read query constant

- **Files** (1): `api/src/seed/metric-catalog.ts` (extend from T-01)
- **Implements**: design §5.5 — supports FR-07, FR-03 (inverse read)
- **Complexity**: simple
- **Blocked by**: T-01
- **Blocks**: T-09
- **Steps**: Add and export the **catalog list cypher constant**
  `METRIC_CATALOG_LIST_QUERY` (§5.5) so the seed/test layer and the PWA view use
  the same statement string (single source, OQ-5):
  ```cypher
  MATCH (m:MetricDefinition)
  RETURN m.id AS id, m.name AS name, m.description AS description,
         m.attributes_json AS attributes_json
  ORDER BY m.name
  ```
  No new REST route is added (OQ-5 — reuse `POST /api/v1/query/cypher`). The PWA
  view (T-09) inlines the equivalent string via `api.cypher(...)`; this constant
  is the server-side/test reference so both stay aligned.
- **Verification**: exercised transitively by
  `api/__tests__/metric-library-seed.integration.test.ts` (AC-06 uses this query
  to list the seeded catalog); `bun run typecheck` passes at checkpoint.

### T-05 — Register-then-seed CLI entrypoint (ensure registry → import fixture)

- **Files** (1): `api/scripts/seed-saas-metric-library.ts` (new)
- **Implements**: design §5.4, §7 — closes AC-06, AC-07, AC-08 (real-fixture
  half); supports FR-05, FR-06, NFR-02
- **Complexity**: complex
- **Blocked by**: T-02, T-03, T-06
- **Blocks**: —
- **Steps**: The `bun run seed:saas-metric-library` CLI entrypoint (§5.4),
  sibling to `api/scripts/seed-saas-operator.ts`:
  1. **Step (a) — ensure registry** (always): `ensureMetricDefinitionLabel`
     (T-02) → `ensureMeasuresEdgeType` (T-03). Both are idempotent, so a
     re-run is a clean no-op. This ordering is why an already-seeded run
     converges (AC-07).
  2. **Step (b) — import the metric fixture** (register-before-import, Rule B):
     ```ts
     const fixture = readFileSync(
       resolve(import.meta.dir, "../../shared/seed/saas-metric-library/metrics.json"),
       "utf8",
     );
     const res = await fetch(`${base}/api/v1/import`, {   // POST /api/v1/import (realImport)
       method: "POST",
       headers: { "content-type": "application/json" },
       body: fixture,
     });
     // non-2xx → surface + fail; a 409 model_lifecycle_route_required means a
     // malformed fixture carrying a lifecycle row (AC-08)
     ```
     Step (a) MUST precede step (b): `realImport` runs a per-row registry
     attribute check, so the `MetricDefinition` label must be registered before
     its node rows are imported (§5.4, N-02'). The fixture is read from the
     **feature-owned** path `shared/seed/saas-metric-library/metrics.json`
     (T-06), never from `shared/seed/saas-operator/` — the foundation loader
     must not pick it up before this step's registration runs. Surface a non-2xx
     import as a script failure. **`api/scripts/seed-saas-operator.ts` is not
     edited** (OQ-4 ii, NFR-06).
- **Verification**:
  - `api/__tests__/metric-library-seed.integration.test.ts` (AC-06, AC-07) —
    after `seed:saas-metric-library`, the seeded `MetricDefinition` name set
    **equals** the §4 roster exactly (count = 20, no missing/no extra), each
    node carrying a non-empty `formula`, an enum `unit`, an enum `category`, a
    non-empty `benchmark`; a re-seed yields zero net new nodes (MERGE-on-id via
    `realImport`); a pre/post `/api/v1/stats` diff for the retail root is zero;
    metrics are not `IN_MODEL`-scoped (AC-06, AC-07, NFR-02).
  - `api/__tests__/metric-library-seed-lifecycle-guard.integration.test.ts`
    (AC-08 real-fixture half) — the real nodes-only fixture imports and writes
    all 20 metric nodes.
  Deferred-green: `bun test:integration` (needs the stack up).

### T-06 — Frozen metric fixture + `seed:saas-metric-library` package script

- **Files** (2): `shared/seed/saas-metric-library/metrics.json` (new),
  `package.json` (modify)
- **Implements**: design §4, §5.4, §7 — closes AC-06 (fixture source), AC-08
  (fixture shape); supports FR-05, FR-06
- **Complexity**: simple
- **Blocked by**: T-01
- **Blocks**: T-05
- **Steps**:
  1. Author `shared/seed/saas-metric-library/metrics.json` as a
     `{nodes, edges}` import payload carrying **only** the 20 `MetricDefinition`
     node rows (the §4 / T-01 `METRIC_CATALOG` roster, each with its stable seed
     `id`, `name`, `description`, and `attributes:{formula, unit, category,
     benchmark}`) and an **empty `edges` array** (Rule D — no `MEASURES`/
     lifecycle edge rows; KPI→metric links are created via T-03, not the
     fixture). Keep this file byte-aligned with `METRIC_CATALOG` (T-01) — if the
     roster changes, both change together (§4 note).
  2. Add `"seed:saas-metric-library": "bun --cwd api scripts/seed-saas-metric-library.ts"`
     to the root `package.json` `scripts` (§7 form, matching the existing
     `"seed:saas-operator": "bun --cwd api scripts/seed-saas-operator.ts"`).
     This is the sole `package.json` edit.
- **Verification**: manual: `cat package.json | grep seed:saas-metric-library`
  shows the entry and `ls shared/seed/saas-metric-library/metrics.json` exists;
  the fixture's node-name set equals the §4 roster (asserted by
  `api/__tests__/metric-library-seed.integration.test.ts`, AC-06). The
  nodes-only / no-lifecycle-edge shape is proven by
  `api/__tests__/metric-library-seed-lifecycle-guard.integration.test.ts`
  (AC-08). `bun run typecheck` passes.

### T-07 — Lifecycle-guard-clean fixture negative test (AC-08 negative half)

- **Files** (1): `api/__tests__/metric-library-seed-lifecycle-guard.integration.test.ts` (extend)
- **Implements**: design §5.4 — closes AC-08 (negative half); supports FR-06
- **Complexity**: simple
- **Blocked by**: T-05, T-06
- **Blocks**: —
- **Steps**: Extend the AC-08 test with the **negative** case: feed a
  hand-constructed `{nodes, edges}` fixture carrying a lifecycle edge row (a
  `MEASURES` row would import fine — it is not lifecycle; use an `INSTANTIATES`
  or `IN_MODEL` edge row, both members of `LIFECYCLE_EDGES`) to
  `POST /api/v1/import` and assert it is rejected `409
  model_lifecycle_route_required` with **nothing written** (payload-atomic
  pre-scan, `import.ts:167-185`). This proves the real fixture (T-06) is clean
  *because* the guard would reject a dirty one — the module-pin edge + guard are
  unaffected by this feature.
- **Verification**:
  `api/__tests__/metric-library-seed-lifecycle-guard.integration.test.ts`
  (AC-08 negative half) — the lifecycle-row fixture → `409
  model_lifecycle_route_required`, zero rows written. Deferred-green:
  `bun test:integration`.

### T-08 — Metric CRUD + attribute-enforcement integration tests

- **Files** (2): `api/__tests__/metric-library-crud.integration.test.ts` (new),
  `api/__tests__/metric-library-attribute-enforcement.integration.test.ts` (new)
- **Implements**: design §3.1, §5.6 + `review-design.md` N-02 — closes AC-02,
  AC-09, AC-10; supports FR-07, FR-08, FR-09
- **Complexity**: moderate
- **Blocked by**: T-02
- **Blocks**: —
- **Steps**: Prove metric-definition CRUD rides the **generic graph-core node
  routes** with **no** new route family and **no** new RBAC string (§5.6):
  - **CRUD cycle** (AC-02, AC-10) — after `ensureMetricDefinitionLabel` (T-02),
    `POST /api/v1/nodes/MetricDefinition` (`node:write`) creates a node
    (`parseRegistryLabel` resolves the label); `GET …/:id` (`node:read`)
    returns it with `formula`/`unit`/`category`/`benchmark`; `PATCH …/:id`
    (`node:write`) updates `benchmark`; `DELETE …/:id` (`node:write`) removes
    it. Manual: `git diff api/src/auth/rbac-permissions.ts` shows no permission
    additions (AC-10, FR-09).
  - **Attribute enforcement** (AC-09, N-02) — a `POST
    /api/v1/nodes/MetricDefinition` **missing** `unit` (required) is rejected
    (`attribute_violation`); one with an **out-of-enum** `category` (e.g.
    `"vanity"`) is rejected; a **valid** write **with an unrelated extra key**
    (proving `additionalProperties:true` keeps extras open, N-02) **succeeds**.
    This makes both the four-attribute enforcement and the open extras
    observable so a reader can't mistake the open extras for disabled
    enforcement.
- **Verification**: `api/__tests__/metric-library-crud.integration.test.ts`
  (AC-02, AC-10) + `api/__tests__/metric-library-attribute-enforcement.integration.test.ts`
  (AC-09, N-02); manual: `git diff api/src/auth/rbac-permissions.ts` — expect no
  additions. Deferred-green: `bun test:integration`.

### T-09 — `MetricLibrary` view (four states, category filter, read-only v1)

- **Files** (1): `pwa/src/views/business/MetricLibrary.tsx` (new)
- **Implements**: design §6.3, §6.4, §6.5 + `review-design.md` C-01 — closes
  AC-12, AC-13, AC-14, AC-15, AC-17 (tsx half); supports FR-10, FR-11, FR-13
- **Complexity**: complex
- **Blocked by**: T-10
- **Blocks**: T-11, T-12
- **Steps**: The live catalog view at `#/business/metrics` (route already
  registered by foundation, XD-05 — this file is only wired in T-11):
  - **Imports** follow the `FunctionMap.tsx` precedent verbatim:
    `import { api } from "../../api"`,
    `import { useActiveModel } from "../../context/ActiveModelContext"`,
    `import { ViewRegion, ViewHeader, Loading, EmptyState, ErrorState } from "../_shared"`,
    `import styles from "./MetricLibrary.module.css"`.
  - **Subject** — consume `useActiveModel()` for **header context only**
    (never re-implemented); the catalog is model-independent (§4/FR-05), so the
    view lists **all** `MetricDefinition` nodes regardless of active model.
  - **Read** — **one** `api.cypher(...)` call (the §5.5 statement, mirroring
    `FunctionMap`'s single-read pattern); parse each row's `attributes_json` to
    surface `formula`/`unit`/`category`/`benchmark`. **C-01 pin**: the view
    fetches **only** the metric list — **no** second `MATCH
    (k:KPI)-[:MEASURES]->(m)` read, and **no** per-metric KPI list ships in v1
    (the seed carries zero `MEASURES` edges).
  - **States (UX-01, catalog-first)** using the exported `_shared` primitives:
    - **loading** (AC-13) → `<Loading what="metrics" />` while the fetch is in
      flight.
    - **empty** (AC-14) → `<EmptyState what="metric definitions" />` prompting
      **`bun run seed:saas-metric-library`** (C-03 — pin this exact string).
    - **error** (AC-15) → `<ErrorState message={…} onRetry={refetch} />` with a
      retry affordance that refetches.
    - **ready** (AC-12) → each metric rendered with `name`, `category`, `unit`,
      `formula`, `benchmark`, **grouped/filterable by `category`** via a
      standard `<select>`/segmented control (no drag), as a keyboard-reachable
      list/grid.
  - **Accessibility (AC-17, UX-05)** — the view root is the catalog
    **`ViewRegion`** landmark (`<section role="region" aria-label="Metric
    library">`); the category filter and each metric row are keyboard-reachable
    in DOM order (native controls/anchors, no focus trap, no gesture handler).
    **C-01 pin**: v1 has no per-metric KPI list, so there is no "KPI activates on
    Enter" affordance — AC-17 is scoped to landmark → filter → metric rows.
  - Styling via `MetricLibrary.module.css` (T-10), tokens-only.
- **Verification**:
  - `pwa/src/__tests__/metric-library.test.tsx` (AC-12) — ready state renders
    the seeded metrics (mocked `api.cypher` response) with
    name/category/unit/formula/benchmark, category-grouped, keyboard-reachable;
    view root is a `ViewRegion` landmark.
  - `pwa/src/__tests__/metric-library-states.test.tsx` (AC-13, AC-14, AC-15) —
    loading (`Loading`), empty (`EmptyState`, registered-but-zero-nodes, copy
    contains `seed:saas-metric-library`, C-03), error (`ErrorState` + retry that
    refetches).
  - AC-17 (tsx half) is proven by the DOM-order/landmark assertions in
    `metric-library.test.tsx`; the live-stack keyboard sweep is T-12.
  Run component tests under `bun test`.

### T-10 — `MetricLibrary` CSS module (tokens-only)

- **Files** (1): `pwa/src/views/business/MetricLibrary.module.css` (new)
- **Implements**: design §6.6 — closes AC-16 (css half); supports FR-10, NFR-05
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-09
- **Steps**: Author the catalog grid/card + category-filter styles using
  **only** `var(--…)` tokens from `pwa/src/styles/companygraph/tokens.css` — no
  raw colors, spacing, or fonts (the `FunctionMap.module.css` precedent).
  Desktop-first, no new breakpoints (UX-04). A metric grid of cards
  (name + category + unit + formula + benchmark) with focus-visible affordances
  for keyboard reachability.
- **Verification**: manual:
  `bun run scripts/design-conformance.ts --view pwa/src/views/business/MetricLibrary.module.css`
  — expect exit 0 with zero token/component violations (AC-16, css half; the
  `.tsx` half runs at T-11). `bun run typecheck` passes.

### T-11 — Wire `MetricLibrary` into the `metrics:` VIEWS line (sole views/index.tsx edit)

- **Files** (1): `pwa/src/views/index.tsx` (modify)
- **Implements**: design §6.2 — closes AC-11, AC-16 (tsx half); supports FR-12, NFR-03
- **Complexity**: simple
- **Blocked by**: T-09, T-10
- **Blocks**: T-12
- **Steps**: Make **exactly two** changes to `pwa/src/views/index.tsx` (the
  proven `model-workspace-core`/foundation view seam — this is the whole PWA
  route-registration diff for this feature, XD-05/NFR-03):
  1. Add `import { MetricLibrary } from "./business/MetricLibrary";` to the
     import block.
  2. Replace the **`metrics:` key** in the `business` surface `VIEWS` map
     (referenced by **key, not line number**, since foundation owns and may
     re-touch the file — N-01'):
     ```tsx
     // before (foundation placeholder):
     metrics: () => <BusinessTabPlaceholder tab="Metrics" spec="saas-metric-library" />,
     // after (this feature):
     metrics: () => <MetricLibrary />,
     ```
  Edit **no other** `VIEWS` entry, and **neither** `pwa/src/route.ts` **nor**
  the `SURFACES` list (sole-owned by `saas-operator-foundation`, XD-05).
- **Verification**:
  - AC-16 (tsx half): manual:
    `bun run scripts/design-conformance.ts --view pwa/src/views/business/MetricLibrary.tsx`
    — expect exit 0.
  - AC-11: `bun run typecheck` exit 0; manual: `git diff --stat` — expect **no**
    change to `pwa/src/route.ts`, **no** array additions to
    `shared/src/schema/{nodes,edges}.ts`, and `pwa/src/views/index.tsx` limited
    to the `metrics:` line + the `MetricLibrary` import (NFR-01, NFR-03, NFR-04).

### T-12 — Deep-link reload e2e + keyboard sweep + boundary check

- **Files** (1): `pwa/playwright/business-metrics-reload.spec.ts` (new)
- **Implements**: design §6.5, §9 — closes AC-18, AC-17 (live half), AC-11
  (boundary half); supports FR-12, FR-13, NFR-01, NFR-03, NFR-06
- **Complexity**: moderate
- **Blocked by**: T-05, T-11
- **Blocks**: —
- **Steps**:
  - **AC-18 e2e** — Playwright spec: with the full stack up and
    `bun run seed:saas-metric-library` run (the 20 seeded metrics are what the
    view renders), navigate to `#/business/metrics`, reload; assert the same
    route re-renders the live `MetricLibrary` (from the persisted shell context
    + hash router).
  - **AC-17 live keyboard sweep** (manual) — with the seeded stack up, load
    `#/business/metrics` and Tab through the view: expect focus lands on the
    `ViewRegion` section landmark, then the category filter, then each metric
    row in DOM order (C-01 — no KPI-Enter clause in v1).
  - **AC-11 boundary sweep** (CLI, no source edit): `git diff --stat` +
    `git diff` confirm the boundary is confined — `pwa/src/route.ts` untouched,
    `SURFACES`/`App.tsx` untouched, `shared/src/schema/{nodes,edges}.ts` with
    no array additions, `api/src/auth/rbac-permissions.ts` with no permission
    additions, `api/src/errors.ts` unchanged,
    `api/src/storage/model-lifecycle-guard.ts` unchanged,
    `api/scripts/seed-saas-operator.ts` unchanged (NFR-01/NFR-03/NFR-06).
- **Verification**: `pwa/playwright/business-metrics-reload.spec.ts` (AC-18);
  manual: with the seeded stack up, load `#/business/metrics`, Tab through the
  view — expect focus lands on the `ViewRegion` landmark then the filter then
  each metric row in DOM order (AC-17); manual: `git diff --stat` + `git diff`
  of the named files — expect the boundary confined exactly as above (AC-11).

### T-13 — Edge write-path integration test (MEASURES accepted, module-pin unaffected)

- **Files** (1): `api/__tests__/metric-library-edge.integration.test.ts` (extend from T-03)
- **Implements**: design §3.2, §3.3 — closes AC-04; supports FR-02, FR-03, NFR-06
- **Complexity**: moderate
- **Blocked by**: T-03
- **Blocks**: —
- **Steps**: Extend the edge test with the **write-path** proof (OQ-1 a):
  - A `KPI → MetricDefinition` `MEASURES` write via `POST /api/v1/edges`
    (`{type:"MEASURES", fromId:<kpiId>, toId:<metricId>}`) **succeeds** — it is
    **not** rejected `409 model_lifecycle_route_required` (because `MEASURES ∉
    LIFECYCLE_EDGES`); the endpoint pair resolves from the registry
    (`getEdgeEndpoints`), and a wrong pair (e.g. `Domain→MetricDefinition`)
    returns `400 edge_endpoint_label_mismatch` (inherited from graph-core).
  - The **module-pin `INSTANTIATES` edge + its guard are unaffected**: a generic
    `POST /api/v1/edges` with a lifecycle `INSTANTIATES` (or `IN_MODEL`) row is
    still rejected `409 model_lifecycle_route_required`.
  Requires a `KPI` node fixture (the `KPI` label already exists) + a seeded
  `MetricDefinition` as the edge endpoints.
- **Verification**: `api/__tests__/metric-library-edge.integration.test.ts`
  (AC-04) — the `MEASURES` write succeeds (not 409); a lifecycle-edge write is
  still rejected 409; a wrong endpoint pair is 400. Deferred-green:
  `bun test:integration`.

### T-14 — Final validation sweep

- **Files** (0): no source files — validation only
- **Implements**: design §8, §10, §11 — closes the AC-01…AC-18 sweep; supports
  all FR/NFR
- **Complexity**: simple
- **Blocked by**: T-01…T-13
- **Blocks**: —
- **Steps**: With the full stack up (`bun run dev`) and
  `bun run seed:saas-metric-library` run:
  1. `bun run typecheck` exits 0.
  2. `bun test` (PWA unit/component: `metric-library*.test.tsx`) green.
  3. `bun test:integration` (all `api/__tests__/metric-library-*.integration.test.ts`)
     green.
  4. `bun run scripts/design-conformance.ts --view pwa/src/views/business/MetricLibrary.tsx`
     and `--view pwa/src/views/business/MetricLibrary.module.css` both exit 0
     (AC-16).
  5. `pwa/playwright/business-metrics-reload.spec.ts` passes (AC-18).
  6. The AC-01/AC-03/AC-10/AC-11 `git diff` boundary checks all show clean (no
     compile-time schema, RBAC, error-code, route.ts, or owned-elsewhere edits).
- **Verification**: manual: run steps 1–6 with the seeded stack up — expect
  `typecheck` exit 0, both test suites green, both design-conformance invocations
  exit 0, the Playwright reload spec passes, and every `git diff` boundary check
  clean (full AC-01…AC-18 sweep).

## Traceability

| Task | Implements (design §) | Closes AC | Serves FR/NFR |
|------|-----------------------|-----------|---------------|
| T-01 | §3.1, §3.4, §4 | (supports AC-06, AC-09) | FR-04, FR-08 |
| T-02 | §3.1, §5.1 | AC-01 (registration) | FR-01, NFR-01 |
| T-03 | §3.2, §3.3, §5.2, §5.3, C-02 | AC-03 (registration), AC-05 | FR-02, FR-03, NFR-01, NFR-06 |
| T-04 | §5.5 | (supports AC-06) | FR-07, FR-03 |
| T-05 | §5.4, §7 | AC-06, AC-07, AC-08 (real fixture) | FR-05, FR-06, NFR-02 |
| T-06 | §4, §5.4, §7 | AC-06 (fixture), AC-08 (shape) | FR-05, FR-06 |
| T-07 | §5.4 | AC-08 (negative) | FR-06 |
| T-08 | §3.1, §5.6, N-02 | AC-02, AC-09, AC-10 | FR-07, FR-08, FR-09 |
| T-09 | §6.3, §6.4, §6.5, C-01 | AC-12, AC-13, AC-14, AC-15, AC-17 (tsx) | FR-10, FR-11, FR-13 |
| T-10 | §6.6 | AC-16 (css) | FR-10, NFR-05 |
| T-11 | §6.2 | AC-11, AC-16 (tsx) | FR-12, NFR-03 |
| T-12 | §6.5, §9 | AC-18, AC-17 (live), AC-11 (boundary) | FR-12, FR-13, NFR-01, NFR-03, NFR-06 |
| T-13 | §3.2, §3.3 | AC-04 | FR-02, FR-03, NFR-06 |
| T-14 | §8, §10, §11 | AC-01…AC-18 sweep | all FR/NFR |

Every FR/NFR from the design is covered: FR-01→T-02, FR-02→T-03/T-13,
FR-03→T-03/T-13, FR-04→T-01, FR-05→T-05/T-06, FR-06→T-05/T-06/T-07,
FR-07→T-04/T-08, FR-08→T-01/T-08, FR-09→T-08, FR-10→T-09/T-10, FR-11→T-09,
FR-12→T-11/T-12, FR-13→T-09/T-12; NFR-01→T-02/T-03/T-11/T-12, NFR-02→T-05,
NFR-03→T-11/T-12, NFR-04→T-11 (typecheck/boundary), NFR-05→T-10,
NFR-06→T-03/T-12/T-13. Every AC (AC-01…AC-18) has a closing task.

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with server behaviour (T-02, T-03, T-05, T-07, T-08, T-13) | the task's listed `*.integration.test.ts` under `bun test:integration` (needs `bun run dev` — Neo4j) |
| tasks with PWA behaviour (T-09, T-11) | the task's listed test under `bun test` |
| tasks touching `pwa/src/views/` (T-09, T-10) | `bun run scripts/design-conformance.ts --view <file>` for **every** touched `.tsx` and `.module.css` |
| T-12 e2e | `pwa/playwright/business-metrics-reload.spec.ts` (full stack up + seeded catalog) |
| final task (T-14) | `bun test` + `bun test:integration` (Neo4j) + full AC-01…AC-18 sweep + the AC-01/AC-03/AC-10/AC-11 `git diff` boundary checks |
