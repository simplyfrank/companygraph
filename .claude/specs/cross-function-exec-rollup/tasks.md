---
feature: "cross-function-exec-rollup"
created: "2026-07-06"
author: "spec-author"
status: "draft"
revision: 1
reviewing_requirements_revision: 2
reviewing_design_revision: 1
size: "large"
total_tasks: 16
---

<!-- House format (mirrors kpi-okr-performance-dashboards/tasks.md — the direct
     precedent, same problem class: read-only GET /api/v1/analytics/* aggregates,
     analytics:read RBAC same-task pairing, OpenAPI-from-shared-zod, an exec view
     wired through views/index.tsx, KPI status from the governed :KPIMeasurement).
     Every task carries a Verification (test path or manual:<repro with input mode
     + observable outcome>) so the spec-completion hook accepts STATUS.md. Every AC
     from requirements.md rev 2 (AC-01..AC-18) is closed by ≥1 task; every task
     implements a design.md rev 1 element (DD-01..DD-15 / §4.1..§7.5). No stable ID
     is renumbered. Design review pass 2 (verdict approve) left three carry-forward
     concerns — C-05 (SLA window vs all-time), C-06 (foundation-owned surface-map
     key), C-07 (openapi.ts call-site line) — pinned below and locked into tasks. -->

# Tasks: cross-function-exec-rollup

## Reading guide

- **Execution preconditions** (recorded in STATUS.md before T-01 begins):
  1. `design.md` is at `status: revised` under the pass-2 **approve** verdict
     (`review-design.md`); the orchestrator re-stamps it to `approved` and records
     the stamp in STATUS.md. It is a stamp gap, not a content gap — no re-review.
  2. The **execution baseline commit** is recorded (`execution_baseline: <sha>` in
     STATUS.md's verification notes). T-16's `git diff` ownership check evaluates
     **this spec's commits only** against that baseline — a bare working-tree diff
     is dominated by unrelated in-flight churn (the repo has many `M` files today).
  3. **Wave-3 dependency reality:** this feature is wave 3. `saas-operator-foundation`
     (the SaaS-Operator root, its six `IN_MODEL` `Domain`s with top-level
     `saasOperatorRoot`/`seedKey`, the `#/insights/operator` route + `operator` tab in
     `SURFACES`, and the `BusinessTabPlaceholder` at the `operator` key) and the six
     content specs + `saas-metric-library` + `funnel-pipeline-modeling` **must be
     landed and seeded** before the integration tests (T-05..T-08, T-14) and the
     view-registration task (T-11) can pass. The affected task DoDs assert against
     the **as-built** foundation, not the design's assumptions (C-06, N-03).
- **Order**: tasks execute top-to-bottom. Dependencies are explicit (`Blocks` /
  `Blocked by`); no out-of-order execution.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The completion
  hook blocks STATUS.md updates without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h, one judgment
  call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck` from the
  repo root (transpile via `bun build … --no-bundle`; **not** a behavior check —
  the opaque Cypher in T-03..T-06 is only proven by the paired integration test).
  After behaviour tasks also run the listed test. Tasks touching `pwa/src/views/`
  additionally run `bun run scripts/design-conformance.ts --view <file>` (AC-16).
- **PWA tests are vitest, never root `bun test`** (same constraint as the
  perf-dashboard tasks): root `bun test` runs `scripts/test-unit.sh`, which cds
  into `api/` + `shared/` only and never discovers a `pwa/` file, and Bun's runner
  ignores `pwa/vitest.config.ts` (no jsdom, no aliases, no setupFiles). Any test
  under `pwa/src/__tests__/` runs as `cd pwa && bunx vitest run <path relative to pwa/>`.
- **Integration-test naming**: `scripts/test-integration.sh` selects by test-name
  pattern `^integration:` — every `describe` in a new `*.integration.test.ts` file
  MUST be prefixed `integration: ` or the suite silently skips it.
- **Scoped integration runs**: `scripts/test-integration.sh` takes **no file
  argument** (it is a fixed `exec bun test --test-name-pattern '^integration:' …
  __tests__ src`). A scoped local run is `cd api && bun test __tests__/<file>` with
  Neo4j + Postgres + the API up via `bun run dev`. **Env caveat:** the scoped run
  loads env from `api/` (needs `api/.env` or exported `NEO4J_*`); the full script
  sources the root `.env`. The merge gate is always the full `bun test:integration`.
- **Query-count legs run in-process**: behavior assertions go over HTTP against
  `127.0.0.1:8787` (house pattern), but round-trip-count assertions **cannot** — the
  server is a separate process (CI's "Boot API server" step / local `bun run dev`),
  so a spy on the test process's `getDriver()` singleton observes none of its
  sessions and would pass vacuously (0 ≤ N). T-08's count legs therefore `import`
  the handler and invoke it **in the test process**, where the module-singleton
  `getDriver()` is shared; wrap the singleton driver's `session` factory and sum the
  returned sessions' `run` counts (never a naked per-session spy). The
  zero-Postgres-for-measurement contract is a **static import assertion** (T-07),
  not a `pg` spy (Bun ESM namespace exports are read-only bindings — a `spyOn` is
  brittle).
- **Same-task pairing (binding, DD-15/design §5):** every new
  `analytics/operator*` router dispatch lands in the **same task** as its
  `ROUTE_PERMISSIONS` entry. The router gate **skips** the RBAC check when
  `getRoutePermission(method, path)` returns `null` (`router.ts:386-395`), so a
  dispatched-but-unlisted route is reachable with **no `analytics:read` check** — a
  P0 exposure. T-04 therefore carries the five dispatch lines and the five RBAC
  entries together; T-09 is the RBAC null-hole unit guard.
- **Read-only contract (NFR-01):** no task adds a write path, a CRUD route, an
  `ERROR_CODES` member, or a `/api/v2/` bump. No task edits `performance.ts`,
  `PerformanceDashboard`, `route.ts`, `SURFACES`, `shared/src/schema/{nodes,edges}.ts`,
  or any `kpi-*`/`sla-*`/`risk-*`/`funnel-*`/`metric-*` route or storage file — the
  cockpit reads those surfaces through governed routes/imports only. AC-11 asserts
  this by `git diff`.

## Open design concerns — pinned decisions

Design review pass 2 (verdict **approve**, `review-design.md`) left three concerns
(C-05, C-06, C-07) for the tasks author to pin. All are execution-time. The
decisions below are **binding** for execution and are locked into the named task's
Definition-of-Done.

| Concern | Decision | Rationale | Locked in task |
|---------|----------|-----------|----------------|
| **C-05** — `breachCount`/`health` are **window-scoped** (from `handleSlaComplianceAllGet`, which filters breaches by `window_days`, `sla-compliance.ts:385`) but the design's Read-2 batched `max(b.breach_at)` (§4.5) is **all-time** (no window), so a `/slas` row can show a non-null `latestBreachAt` beside `breachCount: 0`/`health: within_target`. | **Option (b): `latestBreachAt` is deliberately all-time ("most recent breach ever"); `breachCount`/`health` are window-scoped.** Document this contract in the `analytics-operator.ts` §4.5 SLA-handler code comment and in `shared/src/schema/operator.ts` on `operatorSlaRowSchema.latestBreachAt`. Do **not** window the Read-2 query — an all-time "last breach" timestamp is the more useful drill-in field, and windowing it to match `breachCount` would hide the genuinely-most-recent breach. | The three fields are individually correct; only their juxtaposition is ambiguous, so a documented, tested contract (not a code change to reconcile them) is the minimal fix. | T-06 (handler comment + schema JSDoc), pinned by an assertion in T-08's `/slas` count/semantics leg (a row with an old-but-out-of-window breach shows non-null `latestBreachAt` + `breachCount: 0`). |
| **C-06** — the design (DD-14/§7.5) assumes an `exec` surface-map key with a foundation-supplied `BusinessTabPlaceholder` at the `operator` key in `pwa/src/views/index.tsx`; today `views/index.tsx` has **no** `exec` key and **no** `operator` key/placeholder (the closest analogue, `PerformanceDashboard`, is under `insights`). This is forward-carried risk: `saas-operator-foundation` (a not-yet-landed dependency, XD-05) registers the tab + placeholder first. | **T-11's DoD asserts against the ACTUAL landed foundation, not the assumed `exec`/`BusinessTabPlaceholder`.** Before editing, T-11 greps `views/index.tsx` for the surface key the landed foundation used for `operator` and the actual placeholder factory name, rewires **that** entry to `(r) => <OperatorCockpit route={r} />`, and is **not done** until an integration/render test resolves `#/insights/operator` → `OperatorCockpit` (AC-12). If the foundation is not yet landed at execution, T-11 is **blocked** on it (recorded, not worked around). | The design cannot be verified at authoring time against an unlanded dependency; the gate carries the risk to execution and pins it to the real key rather than the assumed one — mirrors the N-03 resolver-property gate. | T-11 (grep-then-rewire + AC-12 render test as DoD). |
| **C-07** — DD-15/§6 cite `openapi.ts:108,141` for the two-line hook; the `import` is at `:108` (correct) but the `registerPerformancePaths(registry)` **call** is at `openapi.ts:1045`, not `:141`. | **Place the `registerOperatorPaths(registry)` call adjacent to `registerPerformancePaths(registry)` (`openapi.ts:1045`), not at `:141`.** Locate the call site by the stable anchor (the existing `registerPerformancePaths(registry)` line inside `getOpenApiDoc()`), not the line number. | The pattern/edit are substantively correct; only the design's line-number cite for the call site is wrong — an anchor, not a number, is the durable reference. | T-10 (OpenAPI hook, anchored placement). |
| **N-03 / OQ-D1 resolver + funnel marker** (carried from design §4.1 / DD-09) | The `resolveOperatorFunctions` resolver MATCHes `saasOperatorRoot`/`seedKey` as **top-level node props** (foundation §3.1/§3.2), not inside `attributes_json`; a wrong property name silently returns an empty root → the whole cockpit renders empty, indistinguishable from "unseeded". And no funnel stamps `attributes.functionSeedKey` today, so the funnel slice **degrades to the operator-root `modelId` scope** when zero markers exist (DD-09). | Confirm the exact property names against the as-built foundation seed as a T-02 **Definition-of-Done** item (an integration test seeding the foundation root asserts `resolveOperatorFunctions` returns a non-null `rootId` + six rows). The funnel slice-fallback is pinned by an AC-07 sub-case in T-14. | Silent-empty is the worst failure mode; make the property-name check a hard DoD gate, not a checkpoint. | T-02 (resolver DoD gate), T-14 (funnel slice-fallback sub-case). |

## Task list

### T-01 — Shared zod contracts for the operator aggregates

- **Files** (2): `shared/src/schema/operator.ts` (new),
  `shared/package.json` (modify — narrow: one `exports` row) *(+ `shared/src/index.ts`
  re-export only if the workspace re-exports schemas centrally; mirror the existing
  `./schema/performance` wiring)*
- **Implements**: design §3 (§3.1..§3.3, DD-01, DD-03) — the request/response
  contract for FR-02..FR-09
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-03, T-04, T-06, T-10, T-13
- **Steps**:
  - Create `shared/src/schema/operator.ts` exactly per design §3:
    `operatorFunctionEnum` (the six seedKeys `marketing|sales|finance_accounting|
    customer_success|product_delivery|platform_ops`, DD-03 — the foundation's
    `seedKey`s, never re-invented), `operatorSliceQuerySchema` (`function` optional,
    absent → all six); per-signal rows/tallies (`operatorKpiStatusEnum`,
    `operatorKpiRowSchema`, `operatorKpiTallySchema`, `operatorRiskCellSchema`,
    `operatorRiskRowSchema`, `operatorRiskHeatmapSchema`, `operatorFunnelRowSchema`
    with `overallConversion: z.union([z.number(), z.literal("n/a")])`,
    `operatorSlaHealthEnum`, `operatorSlaRowSchema`); the per-signal responses
    (`operatorKpisResponseSchema`, `operatorRisksResponseSchema`,
    `operatorFunnelsResponseSchema` + `unattributed`, `operatorSlasResponseSchema` +
    `unattributed`); and the overview envelope (`signalErr` = `z.object({error:
    z.literal(true)})`, `operatorOverviewRowSchema`, `operatorOverviewResponseSchema`)
    plus the inferred types (`OperatorFunction`, `OperatorOverviewResponse`, …).
  - Keep governed snake_case field names as-built (`target_value`,
    `compliance_threshold`, `latest_measured_at`, …); new composite fields the
    cockpit computes are camelCase (`overallConversion`, `stageCount`,
    `breachCount`, `latestBreachAt`) — NFR-04, matching `funnel-pipeline-modeling`.
  - **C-05 pin (Resolves: C-05):** add a JSDoc note on
    `operatorSlaRowSchema.latestBreachAt` — "**all-time** most-recent breach;
    `breachCount`/`health` are window-scoped (`sla-compliance` `window_days`) so a
    non-null `latestBreachAt` may sit beside `breachCount: 0`."
  - Add the `"./schema/operator": "./src/schema/operator.ts"` row to
    `shared/package.json` `exports` (mirror the `./schema/performance` row).
- **Verification**: `bun run typecheck` (schema compiles + the export resolves);
  the schemas are exercised end-to-end by the integration tests in T-05..T-08.

### T-02 — Function-scope resolver + resolver DoD gate

- **Files** (1): `api/src/routes/analytics-operator.ts` (new — this task creates
  the file and adds only `resolveOperatorFunctions`; the five handlers land in
  T-03/T-04)
- **Implements**: design §4.1 (DD-02) — FR-01
- **Complexity**: moderate
- **Blocked by**: T-01
- **Blocks**: T-03, T-04, T-05
- **Steps**:
  - Implement `resolveOperatorFunctions(session, seedKey?)` per §4.1: one Cypher
    resolves the SaaS-Operator root by the foundation marker
    (`MATCH (m:BusinessModel {name:"SaaS Operator"}) WHERE m.saasOperatorRoot = true`
    — **never** a hard-coded id) and its `IN_MODEL` `Domain` nodes filtered by
    `d.seedKey IN $seedKeys` (`[seedKey]` when sliced, else all six); returns
    `{ rootId, functions: [{ seedKey, name, domainId }] }`. A function domain with
    no content still returns a row (empty downstream, never an error). Root not
    found → `rootId: null`, `functions: []` (drives the view empty state, AC-14).
    One round trip, shared by all five handlers.
  - **N-03 property-name note (Resolves: N-03/design §4.1):** MATCH
    `saasOperatorRoot`/`seedKey` as **top-level node props** (foundation §3.1/§3.2),
    **not** via `apoc.convert.fromJsonMap(attributes_json)`. A wrong property name
    silently returns an empty root — indistinguishable from "unseeded".
  - **Definition-of-Done hard gate (Resolves: N-03):** this task is **not done**
    until the resolver DoD leg in T-05's integration file
    (`operator-overview.integration.test.ts`) seeds the foundation root and asserts
    `resolveOperatorFunctions` returns a **non-null `rootId`** and the **six** function
    rows against the **as-built** foundation seed. If the property names in the
    landed foundation differ from the design's assumption, fix the resolver here to
    match the seed (the seed is truth), not vice-versa.
- **Verification**: `bun run typecheck`; the resolver DoD gate is the resolver leg
  of `api/__tests__/operator-overview.integration.test.ts` (authored in T-05) —
  non-null `rootId` + six rows against the seeded foundation root.

### T-03 — KPI-health handler (`handleOperatorKpis`)

- **Files** (1): `api/src/routes/analytics-operator.ts` (modify — adds
  `handleOperatorKpis` + the batched two-read `:KPIMeasurement` path)
- **Implements**: design §4.2 (DD-04, DD-05) — FR-03, FR-04
- **Complexity**: complex
- **Blocked by**: T-01, T-02
- **Blocks**: T-04, T-07, T-08
- **Steps**:
  - `import { computeKpiStatus } from "./performance"` (DD-04 — the export exists at
    `performance.ts:50`; an **import is not a write**, so `performance.ts` is
    read-only-imported, never edited — AC-05/AC-11). Do **not** copy the bands.
  - **Read 1 (one Neo4j round trip, batched across all sliced function domains):**
    the §4.2 Cypher — `MATCH (k:KPI) WHERE k.archived_at IS NULL`,
    `MATCH (d:Domain) WHERE d.id IN $domainIds`, then the scope predicate
    `k.domain_id = d.id OR EXISTS { MATCH (k)-[:ALIGNED_TO]->(t) WHERE t.id = d.id
    OR (t)-[:PART_OF*1..2]->(:Domain {id: d.id}) }` with **`RETURN DISTINCT`**
    (C-04 — collapses a KPI matched by both the flat `domain_id` disjunct and the
    `ALIGNED_TO` disjunct, or aligned to two entities under one domain). The
    `PART_OF*1..2 ->(:Domain {id: d.id})` bound and target mirror
    `performance.ts:131-135` verbatim; the flat `k.domain_id = d.id` disjunct is the
    **deliberate** CS-KPI superset the perf `DOMAIN_FILTER` drops (DD-05) — a
    band-neutral **scope** widening (NFR-04/AC-05 pin parity on bands only).
  - **Read 2 (one Neo4j round trip):** the batched latest-per-kpi `:KPIMeasurement`
    read replayed from `performance.ts:170` (`LATEST_MEASUREMENT_CYPHER`) verbatim,
    keyed by Read 1's kpi-id union. Empty id set short-circuits (no Read 2). **This
    module never imports the Postgres client** (DD-05, mirrors the `performance.ts`
    single-store contract) — zero Postgres round trips for measurements.
  - In-memory join + `status = computeKpiStatus(kpi, latest)`; per-function `tally`
    counts the four statuses; a KPI with no `:KPIMeasurement` → `no_data`. Respond
    `operatorKpisResponseSchema` (`saasOperatorRoot` + `functions[]`).
  - **Budget: ≤ 2 Neo4j round trips regardless of KPI/function count** (NFR-03/AC-04),
    proven by T-08's in-process count leg — a green typecheck does **not** prove the
    Cypher (opaque `EXISTS`/`PART_OF*1..2` string).
- **Verification**: scoped local run `cd api && bun test
  __tests__/operator-kpis.integration.test.ts` (authored in T-05; stack up via
  `bun run dev`); merge gate: full `bun test:integration`. Status + tally + `no_data`
  = AC-03; batched ≤2-RT + no-Postgres = AC-04 (T-07/T-08).

### T-04 — Risk / funnel / SLA handlers + overview compose + router dispatch + RBAC entries

- **Files** (3): `api/src/routes/analytics-operator.ts` (modify — adds
  `handleOperatorRisks`, `handleOperatorFunnels`, `handleOperatorSlas`,
  `handleOperatorOverview`), `api/src/router.ts` (modify — narrow: 5 dispatch lines),
  `api/src/auth/rbac-permissions.ts` (modify — narrow: 5 `analytics:read` entries)
- **Implements**: design §4.3, §4.4, §4.5, §4.6, §5 (DD-06..DD-12, DD-15/1-2) —
  FR-02, FR-05, FR-06, FR-07, FR-08
- **Complexity**: complex
- **Blocked by**: T-02, T-03
- **Blocks**: T-05, T-06, T-09, T-10, T-13
- **Steps**:
  - **Risk (`handleOperatorRisks`, §4.3/DD-06/DD-07):** per function, invoke the
    governed `handleRiskRegisterList` via the **`Response`/`.json()`/`.data`
    invocation contract** — `new Request("http://internal/api/v1/risk-register?domain="
    + encodeURIComponent(fn.name))`, `await` the handler, `await res.json()`, read
    `.data` (the handler returns `ok({ data: risks })`, `risk-register.ts:110` — **not**
    a bare array). Group by the verbatim function `Domain` `name` (DD-07). Derive the
    sparse `(likelihood,impact)` cell grid, per-severity-band counts
    (`likelihood×impact`: 1–4 low · 5–9 med · 10–14 high · 15–25 critical, §3.3), and
    the drill-in rows **in-memory**. Do **not** import the pg client nor an un-exported
    helper; do **not** use `aggregation/domain`/`aggregation/summary` (they omit the
    per-cell grid + rows, §4.3 table). ≤ 6 `Response` round-trips (one per function,
    bounded by the fixed function count — **not** N-per-risk). Zero-risk function →
    all-zero heatmap, never an error. Non-200 → per-signal failure feeding DD-12.
  - **Funnel (`handleOperatorFunnels`, §4.4/DD-08/DD-09):** one bounded Cypher over
    the operator root (`MATCH (f:Funnel) WHERE f.attributes_json CONTAINS $rootIdNeedle`
    prefilter + `OPTIONAL MATCH` stages/`CONVERTS_TO`), then parse each row's
    `funnelAttrs` and authoritatively filter `modelId === rootId` (the coarse
    `CONTAINS` is a prefilter only, §4.4). `overallConversion` = product of parsed
    per-transition `conversionRate`s (`funnel-pipeline-modeling` FR-11 rule),
    `"n/a"` for a zero/one-stage funnel or a branch (>1 outgoing `CONVERTS_TO`);
    `stageCount` = distinct stage count. **Attribution (DD-09):** optional parsed
    `attributes.functionSeedKey` maps a funnel to a function; unmarked → `unattributed`
    in the all-functions view. **Slice fallback (Resolves: C-02):** when **zero**
    funnels carry `functionSeedKey` for the root, a `?function=` slice **degrades to
    the operator-root `modelId` scope** — return **all** operator funnels under the
    sliced function, `unattributed: []`; once ≥1 marker exists it tightens to marked
    funnels. Constant in funnel count (one Cypher, AC-04a).
  - **SLA (`handleOperatorSlas`, §4.5/DD-10/DD-11):** **Read 1** invokes the governed
    **`handleSlaComplianceAllGet`** (`sla-compliance.ts:351`) — the **only** governed
    read returning every non-archived SLA **with** its `domain_id`, **including
    null-`domain_id` SLAs** (B-01). Attribute in-memory: **tier 1** `domain_id` ∈ a
    function domain id → that function (an SLA with a valid `domain_id` **never** falls
    to `unattributed` even without an alignment edge — AC-08); **tier 2** null/absent
    `domain_id` → **one batched** `ALIGNED_TO`+`PART_OF*0..2` Cypher over the leftover
    id set; **tier 3** neither → `unattributed` (OQ-2), never dropped. **Read 2
    (`/slas` only, never the overview):** one batched
    `MATCH (b:SLABreach) WHERE b.sla_id IN $slaIds RETURN b.sla_id, max(b.breach_at)`
    for `latestBreachAt` — constant in SLA count (B-02). `health`: `breached` when
    `breaches.open ≥ 1`; else `at_risk` when `compliance_rate < compliance_threshold`;
    else `within_target`. `breachCount = breaches.total`. **C-05 (Resolves: C-05):**
    add the code comment — `latestBreachAt` is **all-time** (Read 2 has no window),
    `breachCount`/`health` are window-scoped (`handleSlaComplianceAllGet` filters by
    `window_days`, `sla-compliance.ts:385`); this juxtaposition is intentional and
    documented, not reconciled.
  - **Overview (`handleOperatorOverview`, §4.6/DD-12):** call the four per-function
    derivations, **each in its own try/catch**; a throw sets that function row's
    `kpiHealth`/`riskHeatmap`/`funnelCount`/`slaHealth` field to `{ error: true }`;
    still return `200` (best-effort per signal — OQ-3/OQ-4). The overview uses the
    **summary** projections only — it **omits** the SLA Read 2 `latestBreachAt` (a
    drill-in field). Read-count invariant: bounded by the fixed function count (KPI
    ≤2 + funnel 1 + SLA 1 `all` + ≤1 fallback + risk ≤6), independent of per-**entity**
    count (C-03/AC-04a).
  - **Router dispatch (DD-15/1, §5):** add the five `if (sub === "analytics/operator/…"
    && method === "GET") return handleOperator…(req)` lines in the analytics block,
    **after** the `analytics/graph` match (`router.ts:910`) so the string matches never
    shadow it; import the five handlers. Touch nothing else in the router.
  - **RBAC entries (DD-15/2, §5) — SAME TASK (security-critical):** add the five
    `P("GET", "analytics/operator/<overview|kpis|risks|funnels|slas>", "analytics:read")`
    entries to `ROUTE_PERMISSIONS` (mirror `rbac-permissions.ts:40-42`). **No new
    permission string** (`analytics:read` reused). A dispatched-but-unlisted route is
    reachable with no RBAC check (`router.ts:386-395`) — the entry is not bookkeeping.
- **Verification**: scoped local runs `cd api && bun test __tests__/operator-risks.integration.test.ts`,
  `… operator-funnels.integration.test.ts`, `… operator-slas.integration.test.ts`,
  `… operator-overview.integration.test.ts` (authored in T-05; stack up via
  `bun run dev`); merge gate: full `bun test:integration`. RBAC mapping pinned by
  T-09. Closes the handler legs of AC-01, AC-02, AC-06, AC-07, AC-08, AC-09.

### T-05 — Server integration tests: overview, slice, kpis, risks, funnels, slas

- **Files** (5): `api/__tests__/operator-overview.integration.test.ts` (new),
  `api/__tests__/operator-slice.integration.test.ts` (new),
  `api/__tests__/operator-kpis.integration.test.ts` (new),
  `api/__tests__/operator-risks.integration.test.ts` (new),
  `api/__tests__/operator-funnels.integration.test.ts` (new) *(SLA file is T-14 —
  split for the C-05 window semantics; see below)*
- **Implements**: design §4.1..§4.6, §8 — closes AC-01, AC-02, AC-03, AC-06, AC-07
- **Complexity**: complex
- **Blocked by**: T-03, T-04
- **Blocks**: T-15
- **Steps**:
  - Every `describe` is prefixed `integration: ` (or `test-integration.sh` skips it).
    Seed against the **as-built** foundation + content seeds (`bun run seed:saas-operator`
    / the directory-iterating loader) or via the direct Neo4j driver for fixtures the
    REST surface cannot write. Precondition: the foundation + at least the exercised
    content slices are landed + seeded (wave-3 reality, reading guide).
  - **`operator-overview.integration.test.ts`** — **resolver DoD leg (Resolves: N-03,
    T-02 gate):** seed the foundation root, assert `resolveOperatorFunctions` returns
    non-null `rootId` + six function rows against the real seed property names. **AC-01:**
    `GET /api/v1/analytics/operator/overview` (no slice) returns a row per resolved
    function, each with `kpiHealth`/`riskHeatmap`/`funnelCount`/`slaHealth`; a function
    with no authored content yields an **all-zero** row, not an error; the root is
    resolved by the `name`+`saasOperatorRoot` lookup (no hard-coded id).
  - **`operator-slice.integration.test.ts`** — **AC-02:** `?function=<seedKey>` slices
    every aggregate to exactly that function; **absent** → all six; a malformed/unknown
    `function` returns the standard `400 {error:{code,message,details}}` envelope (the
    zod seedKey enum via `parseWith`).
  - **`operator-kpis.integration.test.ts`** — **AC-03:** `?function=finance_accounting`
    returns each finance KPI with `status ∈ {on_target,warning,breach,no_data}` computed
    from thresholds + latest `:KPIMeasurement`, plus the per-function tally; a KPI with
    no measurement → `no_data`. Seed `:KPIMeasurement` nodes via the direct driver
    (no Postgres measurement fixtures — that store is not read).
  - **`operator-risks.integration.test.ts`** — **AC-06:** `?function=customer_success`
    returns CS risk rows grouped by the canonical `domain = "Customer Success"` key,
    aggregated into a `(likelihood,impact)` heatmap + per-band counts + drill-in rows;
    a zero-risk function → all-zero heatmap.
  - **`operator-funnels.integration.test.ts`** — **AC-07 (base):** `?function=marketing`
    returns marketing funnels with `stageCount` + `overallConversion` = product of
    per-transition `conversionRate`s, `"n/a"` for a zero/one-stage funnel or a branch;
    a retail Model #1 funnel is **never** returned (operator-root scope). *(The AC-07
    slice-fallback sub-case is in T-14 alongside SLA + query-count, to keep this file's
    scope tight; cross-referenced there.)*
- **Verification**: scoped local runs `cd api && bun test __tests__/operator-<name>.integration.test.ts`
  for each of the five files (stack up via `bun run dev`); merge gate: full
  `bun test:integration`. Closes AC-01, AC-02, AC-03, AC-06, AC-07 (base) + the T-02
  resolver DoD gate.

### T-06 — SLA rollup handler behavior + C-05 window-semantics integration test

- **Files** (1): `api/__tests__/operator-slas.integration.test.ts` (new)
- **Implements**: design §4.5 (DD-10, DD-11), pins C-05 — closes AC-08 (behavior +
  attribution + window semantics)
- **Complexity**: complex
- **Blocked by**: T-04
- **Blocks**: T-15
- **Steps**:
  - `describe("integration: operator slas", …)`. Seed CS SLAs with `domain_id` = the
    Customer Success function-domain id, `:SLABreach` nodes (some open, some closed,
    some with a `breach_at` **before** the compliance `window_days` window), and at
    least one SLA with **no** `domain_id` (for tier-3 `unattributed`).
  - **AC-08 primary path:** an SLA with a valid `domain_id` but **no** `ALIGNED_TO`
    edge is attributed to its function (tier 1), **not** `unattributed` — assert this
    explicit case. An SLA resolvable by **neither** `domain_id` **nor** alignment
    appears under `unattributed` (surfaced, not dropped/crashed).
  - `health ∈ {within_target,at_risk,breached}` and `breachCount` derived per DD-11
    from the governed `sla-compliance/all` read; `latestBreachAt` from the batched
    Read-2 `max(breach_at)`.
  - **C-05 pin (Resolves: C-05):** assert the intentional window/all-time split — a
    row whose only breach is **outside** the compliance window shows `breachCount: 0`
    + `health: within_target` (window-scoped) **and** a **non-null** `latestBreachAt`
    (all-time). This pins option (b): `latestBreachAt` is deliberately all-time.
  - **Ownership:** assert (or accompany with the T-16 `git diff` leg) that no
    `sla-*`/`kpi-sla-alignment` file changed.
- **Verification**: scoped local run `cd api && bun test
  __tests__/operator-slas.integration.test.ts` (stack up via `bun run dev`); merge
  gate: full `bun test:integration`. Closes AC-08; manual ownership leg:
  `git diff --stat api/src/routes/sla-crud.ts api/src/routes/sla-compliance.ts
  api/src/routes/kpi-sla-alignment.ts` — expect no change.

### T-07 — Static no-Postgres-import guard (KPI measurement)

- **Files** (1): `api/__tests__/operator-no-postgres-measurement.test.ts` (new)
- **Implements**: design §4.2/DD-05 single-store contract — closes AC-04 (no-Postgres leg)
- **Complexity**: simple
- **Blocked by**: T-03
- **Blocks**: T-15
- **Steps**:
  - A plain unit test (auto-discovered by `scripts/test-unit.sh`'s `api/` run — the
    `unit` CI job gates it, no `ci.yml` change) modeled on the as-built
    `api/__tests__/analytics-no-write-imports.test.ts` pattern: read
    `api/src/routes/analytics-operator.ts` and assert it contains **no import from
    `storage/postgres`** (match import statements, not bare text, so a prose mention
    in a comment never trips it). This pins DD-05's "never imports the Postgres client"
    contract permanently. Do **not** rely on a `pg` `query` spy (Bun ESM namespace
    binding — brittle).
- **Verification**: `bun test api/__tests__/operator-no-postgres-measurement.test.ts`
  — the static no-Postgres leg of AC-04.

### T-08 — Query-count invariant integration test (in-process count legs)

- **Files** (1): `api/__tests__/operator-query-count.integration.test.ts` (new)
- **Implements**: design §4.2..§4.6, DD-12 count invariant (C-03) — closes AC-04
  (batched ≤2-RT leg), AC-04a
- **Complexity**: complex
- **Blocked by**: T-03, T-04
- **Blocks**: T-15
- **Steps**:
  - `describe("integration: operator query count", …)`. **In-process** count legs
    (Resolves: the cross-process-vacuity trap): `import { handleOperatorKpis,
    handleOperatorRisks, handleOperatorFunnels, handleOperatorSlas,
    handleOperatorOverview } from "../src/routes/analytics-operator"`, build a
    `new Request("http://127.0.0.1:8787/api/v1/analytics/operator/<name>?…")`, and
    invoke each handler **in the test process** (the module-singleton `getDriver()`,
    `api/src/neo4j/driver.ts`, is genuinely shared). Wrap the singleton driver's
    `session` factory (sum the returned sessions' `run` counts — never a naked
    per-session spy); install the wrap **after** fixture seeding (or assert on the
    pre/post delta); restore in `afterEach` (`_resetDriver()` available). The
    in-process call bypasses the router auth gate — acceptable: this leg asserts
    query shape, not authz (T-09 pins RBAC).
  - **AC-04 (KPI batched):** a 1-KPI fixture and a 20-KPI fixture yield the **same**
    (≤ 2) Neo4j round-trip count for `/kpis` (no per-KPI growth).
  - **AC-04a (per-entity invariant, Resolves: C-03):** with fixtures scaling risk /
    funnel / SLA counts (1 vs 20 rows per function), `/risks`, `/funnels`, `/slas`,
    and `/overview` each issue the **same** store round-trip count as at 1 row —
    invariant against **entity** count (**not** against function count: the risk
    signal is honestly ≤6 `Response` round-trips, one per function). Assert against
    entity count, not function count.
  - The risk `Response` round-trips are counted at the `handleRiskRegisterList`
    invocation boundary (≤6, one per function), not by driver sessions (they cross
    into the governed handler's own session).
- **Verification**: scoped local run `cd api && bun test
  __tests__/operator-query-count.integration.test.ts` (stack up via `bun run dev`);
  merge gate: full `bun test:integration`. Closes AC-04 (batched leg) + AC-04a.

### T-09 — RBAC route-permission unit guard

- **Files** (1): `api/__tests__/operator-route-permission.test.ts` (new)
- **Implements**: design §5, DD-15/2 (the P0 null-skip guard) — closes AC-09a; RBAC
  companion of AC-09
- **Complexity**: simple
- **Blocked by**: T-04
- **Blocks**: T-15
- **Steps**:
  - For **each** of the five routes assert `getRoutePermission("GET", [...path])`
    returns `"analytics:read"` (never `null`) — proving each dispatched route has its
    `ROUTE_PERMISSIONS` entry, so the router gate cannot silently skip the RBAC check
    (`router.ts:386-395`). Mirror the as-built RBAC route-permission unit test
    pattern. (Integration runs use the dev-fallback session with `ONELOGIN_ISSUER`
    unset and cannot observe a missing mapping, so this unit test is the guard.)
  - This is the **P0-exposure guard** — a dispatched-but-unlisted operator route
    would be reachable with no `analytics:read` check.
- **Verification**: `bun test api/__tests__/operator-route-permission.test.ts` —
  `getRoutePermission` non-null for all five routes; closes AC-09a.

### T-10 — OpenAPI registration for the operator paths

- **Files** (2): `api/src/routes/openapi-operator.ts` (new),
  `api/src/routes/openapi.ts` (modify — narrow: two lines)
- **Implements**: design §6 (DD-01, DD-15/3), pins C-07 — FR-09
- **Complexity**: moderate
- **Blocked by**: T-01, T-04
- **Blocks**: T-13
- **Steps**:
  - `openapi-operator.ts` exporting `registerOperatorPaths(registry: OpenAPIRegistry):
    void`, mirroring `openapi-performance.ts`. Register the §3 request/response schemas
    and a `registerPath` entry for each of the five routes
    (`/analytics/operator/{overview,kpis,risks,funnels,slas}`), each declaring the
    `function` query param from `operatorSliceQuerySchema` and the `200` response from
    the matching §3.3 schema. 400 references the existing `errorEnvelopeSchema`. No
    `ERROR_CODES` addition; all under `/api/v1/`.
  - **C-07 (Resolves: C-07):** `openapi.ts` — add exactly two lines: the
    `import { registerOperatorPaths } from "./openapi-operator"` (near the existing
    `openapi-performance` import, `openapi.ts:108`) and one `registerOperatorPaths(registry)`
    call placed **adjacent to the existing `registerPerformancePaths(registry)` line
    (`openapi.ts:1045`)** — locate by that anchor, **not** the design's stale `:141`
    cite. Touch nothing else.
- **Verification**: covered by `api/__tests__/operator-openapi.integration.test.ts`
  in T-13 (AC-10); interim check is `bun run typecheck`.

### T-11 — View registration (DEFERRED to the nav orchestrator; one-line VIEWS wiring)

- **Files** (0 for this spec): the one `views/index.tsx` change is owned by the **nav
  orchestrator**, not this spec (nav-IA restructure 2026-07-07). This spec does **NOT**
  edit `pwa/src/route.ts`, `pwa/src/views/index.tsx`, or the nav guard tests
  (`business-routes.test.ts` / `route-parse.test.ts` / `business-placeholder.test.tsx`)
  — all sole-owned by the concurrent nav session.
- **Implements**: design §7.5 (DD-14), pins C-06 — FR-13, XD-05
- **Complexity**: moderate (one line, but cross-owner)
- **Blocked by**: T-12 (the view component must exist first — done)
- **Blocks**: T-14, T-15 (playwright/route-resolution legs)
- **Steps (for the nav orchestrator, tracked here):**
  - Canonical route is **`#/insights/operator`** (the former `#/exec/operator` is a
    redirect alias, `route.ts:204`). Add, **under the `insights` surface** in
    `pwa/src/views/index.tsx`, the import `import { OperatorCockpit } from "./exec/OperatorCockpit";`
    and the `VIEWS` entry `operator: (r) => <OperatorCockpit route={r} />` (the `route`
    prop carries `route.params.function` for the URL-first slice, DD-13).
  - **Definition-of-Done:** the wiring is done when `#/insights/operator` resolves to
    `OperatorCockpit` and a render/route test asserts it (AC-12 route-resolution leg).
- **Verification**: `bun run typecheck`; the render + slice tests
  (`pwa/src/__tests__/operator-cockpit.test.tsx`, T-13) already assert the slicer emits
  the canonical `#/insights/operator?function=…` hash; the route-resolution leg follows
  the orchestrator's one-line wiring.

### T-12 — `OperatorCockpit` view + CSS module + `api.operator` client seam

- **Files** (3): `pwa/src/views/exec/OperatorCockpit.tsx` (new),
  `pwa/src/views/exec/OperatorCockpit.module.css` (new),
  `pwa/src/api.ts` (modify — narrow: the `operator` client block, DD-15/4)
  *(3-file view-wiring task; the view, its styles, and the typed client seam are
  inseparable for a functioning view — documented waiver, mirroring the perf-dashboard
  precedent)*
- **Implements**: design §7.1, §7.2, §7.3, §7.4 (DD-13, DD-14) — FR-10, FR-11, FR-12,
  FR-14
- **Complexity**: complex
- **Blocked by**: T-01
- **Blocks**: T-11, T-13, T-14
- **Steps**:
  - **`api.ts` `operator` block (DD-15/4, §7.4):** add a typed `operator` client
    (`overview`/`kpis`/`risks`/`funnels`/`slas`, each `(fn?: OperatorFunction, signal?:
    AbortSignal)` serializing `?function=`), mirroring the `performance` block
    (`api.ts:297`), typed from the `@companygraph/shared/schema/operator` types. New
    object only; do not touch the `performance` block.
  - **`OperatorCockpit.tsx` (§7.1):** `export function OperatorCockpit({ route }: {
    route: Route })`, mirroring `PerformanceDashboard`'s shape. Consume
    `useActiveModel()` for header context (default SaaS-Operator root; never
    re-implement the context — owned by `model-workspace-core`). Derive the slice from
    `route.params.function` via a `functionFromRoute(route)` helper (validated against
    the six seedKeys, unknown → all six — DD-13). Fetch `api.operator.overview(fn?)` on
    mount + slice change (single landing call, DD-12/OQ-4); fetch
    `api.operator.{kpis,risks,funnels,slas}(fn?)` **only** on panel drill-in.
  - **Four panels in a `ViewRegion` (§7.1, AC-17):** KPI health (per-function status
    tally + drill-in rows), risk heatmap (5×5 grid + bands + drill-in rows), funnel
    status (rows with `overallConversion`), SLA rollup (rows with `health`/`breachCount`).
    **`unattributed` (N-02, §7.3):** in the all-functions view render the funnel and SLA
    `unattributed` arrays as a **trailing labelled group** ("Unattributed"), not a hidden
    count nor merged into a function; under a `?function=` slice `unattributed` is `[]`
    so the group is omitted.
  - **View states (§7.2, UX-01):** `loading` (`<Loading>` skeleton, AC-13); `empty`
    (root resolves, all functions empty → `<EmptyState>` prompting `bun run
    seed:saas-operator` + the content seeds, AC-14); `error` (overview fetch fails →
    `<ErrorState onRetry={refetch}/>`, AC-15); `ready` (four panels, AC-12);
    **per-panel error** (one signal field is `{error:true}` → that **panel** shows an
    inline `ErrorState` with retry that refetches that signal's `/…` endpoint; the other
    three render normally — DD-12/OQ-3, AC-15).
  - **Slicer + deep links (§7.3, FR-11/FR-14):** a single function slicer (catalog
    segmented-control/select) whose selection rewrites `#/insights/operator?function=<seedKey>`
    (hash change, no full nav; clearing → all six, refetch overview — DD-13). Rows
    deep-link into **existing registered** routes only (invent none): KPI row →
    `#/exec/performance` or the Explorer; funnel row → `#/insights/funnels`; function row
    → `#/insights/functions` / the Explorer for that domain. Rows activate on Enter
    (keyboard-reachable, AC-17). The `?function=` deep link survives reload (UX-06/AC-18).
  - **Catalog + tokens (NFR-07/AC-16):** components from `../_shared`
    (`ViewRegion`/`ViewHeader`/`Loading`/`EmptyState`/`ErrorState`/`SecLabel`) before
    inventing any; `OperatorCockpit.module.css` uses `var(--…)` tokens only — no
    hex/rgba/oklch literals. **Read-only** — no create/edit/write control (XD-08).
- **Verification**: `bun run scripts/design-conformance.ts --view
  pwa/src/views/exec/OperatorCockpit.tsx` exits 0 (and the `.module.css`) — AC-16;
  behaviour verified by T-13.

### T-13 — Cockpit behaviour + states tests (render, slice, view states, per-panel error)

- **Files** (3): `pwa/src/__tests__/operator-cockpit.test.tsx` (new),
  `pwa/src/__tests__/operator-cockpit-states.test.tsx` (new),
  `api/__tests__/operator-openapi.integration.test.ts` (new)
- **Implements**: design §7.1, §7.2, §7.5, §6 — closes AC-10, AC-12, AC-13, AC-14, AC-15
- **Complexity**: complex
- **Blocked by**: T-10, T-11, T-12
- **Blocks**: T-15
- **Steps**:
  - **`operator-cockpit.test.tsx` (AC-12):** vitest/jsdom (`cd pwa && bunx vitest run
    src/__tests__/operator-cockpit.test.tsx`). Assert `#/insights/operator` resolves to
    `OperatorCockpit` (**not** the foundation placeholder — the C-06 gate for T-11),
    that it consumes `useActiveModel()` + defaults to the SaaS-Operator root, and that
    it renders the four panels from a mocked `api.operator.overview` response.
  - **`operator-cockpit-states.test.tsx` (AC-13/14/15):** mocked fetches drive
    `loading` (overview pending → skeleton), `empty` (root resolves, all functions empty
    → seed-prompt empty state), `error` (overview fetch fails → error state + working
    retry), and **per-panel error** (one signal field `{error:true}` → only that panel
    shows an inline error while the other three render — OQ-3).
  - **`operator-openapi.integration.test.ts` (AC-10):** assert the five
    `/api/v1/analytics/operator/*` paths appear in `GET /api/v1/openapi.json` (generated
    from the runtime zod via `openapi-operator.ts` + the two-line hook); assert a
    malformed `?function=bogus` on an operator path returns the standard
    `400 {error:{code,message,details}}` envelope; keep the existing openapi assertions
    green (additive). `describe("integration: operator openapi", …)`.
- **Verification**: `cd pwa && bunx vitest run src/__tests__/operator-cockpit.test.tsx
  src/__tests__/operator-cockpit-states.test.tsx` green locally (wired into CI by T-15);
  scoped `cd api && bun test __tests__/operator-openapi.integration.test.ts` + merge gate
  full `bun test:integration`. Closes AC-10, AC-12, AC-13, AC-14, AC-15.

### T-14 — Funnel slice-fallback sub-case + deep-link/reload playwright + a11y

- **Files** (2): `pwa/playwright/exec-operator-reload.spec.ts` (new),
  `api/__tests__/operator-funnels.integration.test.ts` (modify — add the AC-07
  slice-fallback sub-case authored as a `test(` in the T-05 file)
- **Implements**: design §4.4/DD-09 (funnel slice-fallback), §7.3 (deep links) —
  closes AC-18; AC-07 (slice-fallback sub-case); AC-17 (deep-link-on-reload leg)
- **Complexity**: moderate
- **Blocked by**: T-05, T-11, T-12
- **Blocks**: T-15
- **Steps**:
  - **AC-07 slice-fallback sub-case (Resolves: C-02, DD-09):** extend
    `operator-funnels.integration.test.ts` — with **zero** funnels carrying
    `attributes.functionSeedKey`, a `?function=marketing` slice returns **all**
    operator-root funnels under `marketing` with `unattributed: []` (degrade-to-`modelId`);
    with ≥1 marked funnel, the slice tightens to marked funnels and unmarked funnels are
    suppressed under the slice (still surfaced under `unattributed` in the all-functions
    view).
  - **AC-18 reload (playwright):** `exec-operator-reload.spec.ts` (mirroring the
    as-built `business-functions-reload.spec.ts` / `business-metrics-reload.spec.ts`
    pattern): navigate to `#/insights/operator?function=sales`, reload — expect the same
    route renders `OperatorCockpit` sliced to Sales (from the persisted hash + shell
    context); clearing the slice returns to all six functions.
- **Verification**: `cd api && bun test __tests__/operator-funnels.integration.test.ts`
  (slice-fallback sub-case, stack up via `bun run dev`; merge gate full
  `bun test:integration`); `cd pwa && bunx playwright test playwright/exec-operator-reload.spec.ts`
  green (AC-18, needs the stack up + operator content seeded).

### T-15 — CI: gate the owned PWA vitest files in the `unit` job

- **Files** (1): `.github/workflows/ci.yml` (modify — narrow: append the two owned
  PWA vitest files to the `unit` job's existing PWA `vitest run` step)
- **Implements**: the CI merge-gate for AC-12, AC-13, AC-14, AC-15 (auto legs)
- **Complexity**: simple
- **Blocked by**: T-13, T-14
- **Blocks**: T-16
- **Steps**:
  - The `unit` job runs PWA vitest via **explicit file enumeration** — the stable
    anchor is the `bunx vitest run …` step with `working-directory: pwa` in the `unit`
    job (locate by that anchor, **not** a line number — the line moves as other specs
    append). New PWA test files are **not** discovered unless added to that enumeration
    (root `bun test`/`scripts/test-unit.sh` never cds into `pwa/`).
  - **Append-only edit:** append the two owned files —
    `src/__tests__/operator-cockpit.test.tsx` and
    `src/__tests__/operator-cockpit-states.test.tsx` — to the **end** of the
    enumeration, **whatever files that line carries at execution time**. **Never remove,
    replace, or reorder an existing entry** — the enumeration is co-owned (it already
    carries the perf-dashboard, kpi-okr-governance, story-spec-core entries); deleting
    one silently un-gates another spec's ACs (FILE-OWNERSHIP). Do not paste a full-line
    literal from this document (it goes stale the moment another spec appends). Extend
    the adjacent scoping comment with a line naming this spec's two files.
  - Touch nothing else in `ci.yml` (the `integration` job's Neo4j + Postgres services,
    migrations, and API-boot step already exist — this spec's integration tests ride
    them; the playwright reload spec is a manual/e2e leg, not wired here).
- **Verification**: manual: open the PR's `unit` job run in GitHub Actions (browser) —
  verify the `vitest run` step lists and passes `operator-cockpit.test.tsx` and
  `operator-cockpit-states.test.tsx` **in addition to every pre-existing entry** (none
  removed), so AC-12/13/14/15 auto legs gate merge; also `cd pwa && bunx vitest run
  src/__tests__/operator-cockpit.test.tsx src/__tests__/operator-cockpit-states.test.tsx`
  green locally.

### T-16 — Full validation + ownership diff + manual a11y sweep + completion gate

- **Files** (0): validation + STATUS.md update only; no source edits
- **Implements**: design §8 regression/gate — closes AC-05, AC-09, AC-11, AC-16,
  AC-17; final AC sweep
- **Complexity**: moderate
- **Blocked by**: T-15
- **Blocks**: —
- **Steps**:
  - `bun run typecheck` exits 0 (AC-11 transpile leg).
  - `bun run scripts/design-conformance.ts --view pwa/src/views/exec/OperatorCockpit.tsx`
    (+ the `.module.css`) exits 0 (AC-16 — this is the gating CLI step run in the CI
    design-conformance job, not a manual repro).
  - `bun test` (unit) + `bun test:integration` (Neo4j + Postgres) all green; the unit
    run auto-discovers `operator-no-postgres-measurement.test.ts` (AC-04 no-Postgres
    guard) and `operator-route-permission.test.ts` (AC-09a P0 guard). The pre-existing
    `openapi.integration.test.ts` stays green (aggregates additive, AC-10).
  - `cd pwa && bunx vitest run src/__tests__/operator-cockpit.test.tsx
    src/__tests__/operator-cockpit-states.test.tsx` green (the two owned view tests;
    vitest entry point, never root `bun test`).
  - **AC-05 status-parity leg:** `api/__tests__/operator-status-parity.test.ts`
    asserts the cockpit's per-KPI `status` equals `computeKpiStatus(...)` imported from
    `api/src/routes/performance.ts` for a shared fixture spanning every band (belt-and-
    braces on the DD-04 import); and `git diff --stat api/src/routes/performance.ts`
    shows **no change**. *(This unit test file is authored here as part of the gate; it
    is small and depends only on the T-03 import + the `performance.ts` export.)*
  - **AC-09 (RBAC) manual leg:** `git diff api/src/auth/rbac-permissions.ts` — expect
    only the five new `analytics:read` route entries, **no** new permission string.
  - **AC-11 change-set confinement (ownership diff, baseline-pinned):** using the
    `execution_baseline` commit recorded in STATUS.md before T-01, run
    `git diff --stat <baseline>..HEAD` (this spec's commits only) and assert the change
    set matches the enumerated allow-list and **nothing else**: the new server files
    (`analytics-operator.ts`, `openapi-operator.ts`, tests), the new PWA files
    (`OperatorCockpit.tsx` + `.module.css`, tests, playwright spec), the new shared file
    (`operator.ts`), and **exactly** the enumerated additive edits — `router.ts` (5
    dispatch lines), `rbac-permissions.ts` (5 entries), `openapi.ts` (2-line hook),
    `pwa/src/api.ts` (`operator` block), `shared/package.json` (exports row),
    `pwa/src/views/index.tsx` (one `operator` entry), `.github/workflows/ci.yml` (T-15
    append). **No** `performance.ts`, `PerformanceDashboard`, `route.ts`, `SURFACES`,
    `shared/src/schema/{nodes,edges}.ts`, `api/src/errors.ts`, or any
    `kpi-*`/`sla-*`/`risk-*`/`funnel-*`/`metric-*` route/storage file appears (NFR-01,
    NFR-02, NFR-05, NFR-06).
  - **AC-17 manual a11y sweep:** the manual keyboard-reachability leg (see Verification).
  - Populate STATUS.md `verified_at` + `verification_artifact` and mark Execution
    complete (the completion hook blocks otherwise).
- **Verification**: `bun run typecheck` + `bun test` + `bun test:integration` +
  design-conformance exit 0 + baseline-scoped ownership diff (`git diff --stat
  <execution_baseline>..HEAD` — expect only the enumerated allow-list); **manual (AC-17):**
  with the stack up (`bun run dev`) + operator content seeded, load `#/insights/operator`
  in macOS Chrome (keyboard) and Tab through — expect focus lands on the `ViewRegion`
  section landmark, then the function slicer, then each panel's rows in DOM order, and a
  KPI/funnel/function row deep-links on Enter (also verify in macOS Safari keyboard).

## Traceability — AC → task

| AC | Closed by | Kind | CI-gated |
|----|-----------|------|----------|
| AC-01 (overview per-function rows, no-hardcoded-id, all-zero empty row) | T-02 (resolver), T-04 (overview), T-05 | integration | yes (`integration`) |
| AC-02 (slice narrows; unknown → 400; absent → all six) | T-04, T-05 | integration | yes |
| AC-03 (per-function KPI status + tally + `no_data`) | T-03, T-05 | integration | yes |
| AC-04 (Neo4j `:KPIMeasurement` only; batched ≤2 RT; no Postgres) | T-03, T-07 (static no-import), T-08 (in-process count) | integration + unit | yes (`integration` + `unit`) |
| AC-04a (per-entity query-count invariant, all aggregates + overview) | T-08 (in-process count legs) | integration | yes |
| AC-05 (status parity with `performance.ts`; no `performance.ts` diff) | T-03 (import), T-16 (`operator-status-parity.test.ts` + `git diff --stat`) | unit + CLI | yes (`unit`) |
| AC-06 (risk heatmap grouped by verbatim function name; no `risk-*` diff) | T-04, T-05, T-16 (diff) | integration + CLI | yes |
| AC-07 (funnel `overallConversion`/`n/a`; operator-root scope; slice-fallback) | T-04, T-05 (base), T-14 (slice-fallback sub-case) | integration | yes |
| AC-08 (SLA `health`/`breachCount`/`latestBreachAt`; `domain_id` primary; `unattributed`; no `sla-*` diff; C-05 window semantics) | T-04, T-06 | integration + CLI | yes |
| AC-09 (every route GET → `analytics:read`; no new permission string) | T-04 (entries), T-16 (`git diff`) | integration + CLI | yes |
| AC-09a (P0: `getRoutePermission` non-null per route; 403 without `analytics:read`) | T-09 | unit | yes (`unit`) |
| AC-10 (openapi paths from zod; no `ERROR_CODES` add; `/api/v1/` only) | T-10, T-13 (`operator-openapi.integration.test.ts`), T-16 (`git diff errors.ts`) | integration + CLI | yes |
| AC-11 (change set confined; transpile clean; untouched files) | T-16 (typecheck + baseline `git diff --stat`) | CLI | yes |
| AC-12 (`#/insights/operator` → `OperatorCockpit`, four panels, ready) | T-11 (registration), T-12 (view), T-13 (render test) | jsdom | yes (`unit` via T-15) |
| AC-13 (loading state) | T-12, T-13 (`operator-cockpit-states.test.tsx`) | jsdom | yes (T-15) |
| AC-14 (empty state) | T-12, T-13 | jsdom | yes (T-15) |
| AC-15 (error + per-panel error) | T-12, T-13 | jsdom | yes (T-15) |
| AC-16 (design-conformance passes on the view + CSS) | T-12, T-16 | CLI | yes (design-conformance job) |
| AC-17 (keyboard-reachable slicer + rows, `ViewRegion` landmark, Enter deep-link) | T-12 (impl), T-16 (manual sweep) | manual | no (manual) |
| AC-18 (URL-first slice survives reload) | T-11, T-12, T-14 (`exec-operator-reload.spec.ts`) | playwright | e2e (manual/e2e leg) |

### Traceability — NFR → task

| NFR | Guaranteed by |
|-----|---------------|
| NFR-01 (read-only: no write path, no `ERROR_CODES` add, no `/api/v2/`, `performance.ts` untouched) | reading-guide read-only contract; T-07 static no-Postgres-import; T-16 baseline ownership diff (no `performance.ts`/KPI/risk/SLA/funnel/metric route/storage file, no `errors.ts` add) |
| NFR-02 (no compile-time labels/edges, no new store) | T-16 ownership diff asserts no `shared/src/schema/{nodes,edges}.ts` change; handlers read existing Neo4j/Postgres only |
| NFR-03 (bounded query cost, batched, zero Postgres for measurement) | T-03 batched two-read `:KPIMeasurement`; T-08 in-process per-entity count invariant (AC-04/AC-04a) |
| NFR-04 (governed source fidelity: `computeKpiStatus` parity, canonical `domain=name` key, snake_case) | T-03 imported `computeKpiStatus` + T-16 parity test; T-04/T-05 risk grouping by verbatim name; T-01 snake_case schemas |
| NFR-05 (enumerated four additive edits + single view line) | T-04 (router + RBAC), T-10 (openapi hook), T-12 (`api.ts` block), T-11 (one `views/index.tsx` entry); T-16 baseline diff confines |
| NFR-06 (house rules: zod-only, en-US, loopback, auth via central gate) | T-01 zod contracts; T-04 same-task RBAC via `rbac-permissions.ts` (never per-route); T-09 RBAC null-hole unit test |
| NFR-07 (design conformance: tokens-only, catalog components) | T-12 catalog-first + tokens-only CSS; T-16 `design-conformance.ts --view` exit 0 (AC-16) |

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` (repo root) — transpile only, **not** behavior (T-03..T-06 opaque Cypher is proven only by the paired integration test) |
| tasks with API behaviour (T-03..T-10) | the task's listed test — unit: `bun test <path>`; integration scoped local run: `cd api && bun test __tests__/<file>` with the stack up via `bun run dev` (`test-integration.sh` takes no file argument); merge gate: full `bun test:integration` |
| tasks touching pwa views (T-11, T-12) | `bun run scripts/design-conformance.ts --view pwa/src/views/exec/OperatorCockpit.tsx` |
| pwa view/state tests (T-13, T-14) | `cd pwa && bunx vitest run <path relative to pwa/>` locally; **gated in CI by T-15**; the reload spec is `cd pwa && bunx playwright test playwright/exec-operator-reload.spec.ts` (stack up + seeded) |
| CI wiring (T-15) | GitHub Actions `unit` job's PWA `vitest run` step lists + passes the two owned files **in addition to every pre-existing entry — none removed** — AC-12/13/14/15 auto legs gate merge |
| final task (T-16) | `bun test` + `bun test:integration` (needs Neo4j + Postgres) + design-conformance exit 0 + the two owned pwa vitest files + full AC sweep + baseline-scoped ownership diff (`git diff --stat <execution_baseline>..HEAD` — expect only the enumerated allow-list, no `performance.ts`/`route.ts`/`SURFACES`/schema-array/governed-route change) + the AC-17 manual keyboard sweep |
