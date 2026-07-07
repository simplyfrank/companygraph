---
feature: "function-benchmark-scoring"
created: "2026-07-06"
author: "spec-author"
status: "draft"
size: "medium"
traces_design_revision: 2
traces_requirements_revision: 2
total_tasks: 11
---

# Tasks: function-benchmark-scoring

> Traces **design.md rev 2** (approved 2026-07-06, `review-design.md` pass 2
> verdict **approve**) and **requirements.md rev 2** (approved). The design
> mirrors the `key-activity-optimizer` three-module split verbatim: a pure
> Neo4j-free scorer (`api/src/derive/`), a model-scoped read + orchestrator
> (`api/src/storage/`), a route handler dispatched in `api/src/router.ts`, and a
> four-state read-only PWA view. This feature is **read-only** — it adds no
> label/edge/store and writes nothing.
>
> The design review closed with **zero blockers**; three Concerns (C-01, C-02,
> C-03) and two Nits (N-01, N-02) were explicitly deferred to this tasks phase.
> They are **pinned into concrete tasks** below — see the "Deferred design-review
> findings" table. No stable IDs are renumbered.

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocked by` / `Blocks`); no out-of-order execution.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook (`.claude/hooks/spec-completion-check.sh`) blocks STATUS.md
  updates without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h, one judgment
  call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task run `bun run typecheck` (repo
  root; covers both `api/src/server.ts` and `pwa/src/main.tsx`). After tasks
  that ship behaviour, also run the listed test. Tasks touching
  `pwa/src/views/` additionally run
  `bun run scripts/design-conformance.ts --view <file>` for **every** touched
  `.tsx` and `.module.css` (one invocation each).
- Integration tests (`*.integration.test.ts`) need Neo4j (`bun test:integration`
  after `bun run dev`); unit/component tests run under `bun test`.

## Deferred design-review findings — pinned to tasks

The `review-design.md` (pass 2, approve) recorded these for resolution here.
Each is bound to the task that resolves it; none is left implicit.

| Finding | What | Resolved in |
|---------|------|-------------|
| **C-01** | The coverage query as sketched (§4.3 step-4 bullet-4) leaves `k:KPI` unconnected to `(d,a)` in the pattern → an O(activities × KPIs) re-scan. **Pinned resolution: option (a)** — do **not** run a separate cartesian coverage query. Compute `coveredByKpi` in the **pure scorer** from a second projection on the **already-attributed KPI→(activity/journey) reach** returned alongside the grounded-KPI read, so KPIs are scanned once per report. | **T-04** (read shape), **T-03** (scorer computes `coveredByKpi`) |
| **C-02** | Coverage (FR-04) counts **all** attributed KPIs; metricBenchmark (FR-02) only `MEASURES`-grounded ones — assert a discriminating fixture (an `ALIGNED_TO` KPI with **no** `MEASURES` edge reads `coveredByKpi:true` but contributes nothing to `metricBenchmark`) so the two axes cannot silently collapse. | **T-08** (coverage integration test) |
| **C-03** | `rbac-permissions.ts` skips the permission check when `getRoutePermission` returns `null` (SECURITY-CRITICAL) — a dispatch that lands without its `ROUTE_PERMISSIONS` entry is **unauthenticated**. **Pinned resolution:** the `router.ts` dispatch line and the `rbac-permissions.ts` mapping line ship in the **same task** (T-06) so the route can never merge un-permissioned. | **T-06** (route + permission paired) |
| **N-01** | Catalog `EmptyState({what})` (`_shared.tsx:85`) takes only `what`; the seed-prompt copy (`bun run seed:saas-operator`) is the view's own markup around `EmptyState`, not a prop. | **T-09** (view) |
| **N-02** | Keep the per-activity grouping explicit in whichever coverage read C-01 lands. Under the pinned C-01(a) resolution there is **no** separate `count(DISTINCT k) > 0` coverage query — the reach is projected on the grounded/attributed read and binned per activity in TS. | **T-04** (read shape) |

## Pinned OQ dispositions (from design DD-04..DD-13)

Executed as the design's recorded defaults; the orchestrator MUST still surface
OQ-1/OQ-2/OQ-3 to the user at the tasks gate (they are user-confirmable, not
build blockers — one-line/additive changes if the user prefers otherwise).

| OQ | Executed as | If the user prefers otherwise |
|----|-------------|-------------------------------|
| OQ-1 | (b) metricBenchmark = share of metric-grounded KPIs on-target vs the KPI's own target; prose `benchmark` shown as evidence, **not** numerically compared (DD-04) | (c) — a structured numeric benchmark field on `MetricDefinition` — is a `saas-metric-library` change, out of this spec |
| OQ-2 | re-implement the KPI verdict in this spec's own pure module; **never** import/edit `performance.ts` (DD-05) | a shared verdict helper is a bounded follow-up owned by `kpi-okr-performance-dashboards` |
| OQ-3 | `AUGMENTATION_WEIGHT = { functional: 0.34, agentic: 0.67, ai_predictive: 1.0 }`, `ai_predictive ≥ agentic ≥ functional` (DD-06) | any monotone table over the closed enum is a one-constant change |
| OQ-4 | `DEFAULT_WEIGHTS = { metricBenchmark: 1.0, coverage: 1.0, automation: 1.0 }` (DD-07) | tunable weights reuse the `meta.weights` echo — additive follow-up |
| OQ-5 | route `GET /api/v1/analytics/benchmarks/report` (two-segment, sidesteps `router.ts:934`, DD-09) | — resolved |
| OQ-6 | empty-`200` on no operator root, no new `ERROR_CODES` (DD-10) | — resolved |
| OQ-7 | `analytics:read` (DD-11) | — resolved |

---

## Task list

### T-01 — Wire + read-shape zod schemas (shared)

- **Files** (1): `shared/src/schema/function-benchmark.ts` (new)
- **Implements**: design §3.2, §3.3 — supports FR-02, FR-04, FR-05, FR-06,
  FR-07, FR-08; owns the camelCase wire shape and the pure-scorer read-shape
  interfaces
- **Complexity**: moderate
- **Blocked by**: — · **Blocks**: T-02, T-03, T-04, T-05, T-06, T-08, T-10, T-11
- **Steps**: Author the schemas exactly as design §3.2:
  - `kpiVerdictEnum = z.enum(["on_target","warning","breach","no_data"])`.
  - `kpiVerdictRowSchema` (per-KPI evidence: `kpi_id`, `name`, `metricId`,
    `metricName`, `benchmarkProse` — the `MetricDefinition.attributes.benchmark`
    prose, **displayed only, never compared** (DD-04) — `latestValue` nullable,
    `target_value` nullable, `target_direction` nullable, `verdict`).
  - `metricBenchmarkScoreSchema` (`score` nullable — the applicability signal,
    DD-08 — `metricGrounded`, `onTargetCount`, `scoredCount`, `noDataCount`,
    `kpis`).
  - `coverageScoreSchema` (`score`, `unmodeled`, `keyMarked`, `activityCount`,
    `roleRatio`, `systemRatio`, `kpiRatio`, `markedKeyCoveredRatio` nullable).
  - `automationScoreSchema` (`score`, `systemCoverage`, `augmentationTerm`,
    `byKind` and `weights` keyed by `systemKindSchema` from `./system-kind`).
  - `functionScoreSchema` (`seedKey`, `name`, `domainId`, `composite`, the three
    sub-scores).
  - `benchmarkReportMetaSchema` (`functionCount`, `modelId` **nullable** for the
    empty-`200` no-root case, DD-10, `weights`).
  - `benchmarkReportSchema` (`functions` array, `meta`) + `BenchmarkReport` type.
  - Export the §3.3 read-shape **TypeScript interfaces** the pure scorer
    consumes — `FunctionActivity` (with `coveredByKpi: boolean`, C-01/N-02),
    `FunctionKpiGrounded`, `FunctionRead`, `BenchmarkInput` — so the storage read
    and the scorer share one source of truth.
  - **No** `recommendation`/`suggestion` field anywhere (NFR-04, XD-11);
    `zod`-only; en-US identifiers (NFR-06).
- **Verification**: `shared/__tests__/function-benchmark-schema.test.ts` (new) —
  asserts `benchmarkReportSchema.parse` accepts a well-formed report, rejects a
  report carrying an unexpected `recommendation` key (strict-shape guard), and
  that `meta.modelId` accepts `null`; `bun run typecheck`.

### T-02 — KPI-vs-target verdict pure module (self-owned, no `performance.ts` import)

- **Files** (2): `api/src/derive/function-benchmark-score.ts` (new — the
  `computeKpiVerdict` export only in this task; the scorer body lands in T-03),
  `api/__tests__/function-benchmark-verdict.test.ts` (new)
- **Implements**: design §4.1, DD-05 — closes **AC-03**; supports FR-03, NFR-05
- **Complexity**: moderate
- **Blocked by**: T-01 · **Blocks**: T-03
- **Steps**: In `api/src/derive/function-benchmark-score.ts` (the derive-module
  path design pins verbatim — the KAO `api/src/derive/key-activity-score.ts`
  precedent), implement `computeKpiVerdict(kpi, latest): KpiVerdict`
  **re-implementing** the `performance.ts:50–89` `computeKpiStatus` band rule
  byte-for-byte from the four-case switch — **never importing**
  `api/src/routes/performance`. Transcribe the contract exactly per design §4.1:
  - `latest == null` → `no_data`; `target_value == null` → `no_data`.
  - `higher_is_better`: `v >= target` → `on_target`; `critical !== null && v <
    critical` → `breach`; `warning !== null && v < warning` → `warning`; else
    `warning === null ? "warning" : "on_target"`.
  - `lower_is_better`: mirror (`v <= target` → `on_target`; `> critical` →
    `breach`; `> warning` → `warning`; else `warning === null ? "warning" :
    "on_target"`).
  - `target_is_exact`: `v === target` → `on_target`; else `deviation =
    Math.abs(v-target)`; `> critical` → `breach`; `> warning` → `warning`; else
    **`"warning"`** (the no-band default — **never** `on_target`, C-03 of the
    requirements review).
  - `default` (unknown/null direction) → `no_data` (total, never throws).
- **Verification**: `api/__tests__/function-benchmark-verdict.test.ts` (Neo4j-free
  unit) — a fixture table covering higher/lower/exact bands, the null-threshold
  degrade, null-target → `no_data`, and specifically the exact-branch **no-band
  `warning`** case; `bun test`. Plus a boundary-guard assertion: `manual: run
  grep -n "routes/performance" api/src/derive/function-benchmark-score.ts in a
  terminal (input mode: CLI) — expect zero matches` (the ownership tripwire,
  AC-03).

### T-03 — Pure sub-score scorer `scoreFunctions` (Neo4j-free)

- **Files** (2): `api/src/derive/function-benchmark-score.ts` (extend —
  `scoreFunctions` + `AUGMENTATION_WEIGHT`/`DEFAULT_WEIGHTS` constants),
  `api/__tests__/function-benchmark-score.test.ts` (new)
- **Implements**: design §4.2, DD-01, DD-04, DD-06, DD-07, DD-08 — closes the
  unit half of **AC-02/AC-04/AC-05/AC-06**; supports FR-02, FR-04, FR-05, FR-06,
  NFR-04
- **Complexity**: complex
- **Blocked by**: T-02 · **Blocks**: T-05, T-08
- **Steps**: Pure `scoreFunctions(input: BenchmarkInput): { functions, meta }`
  (no `Driver`, no session) over each `FunctionRead`, exactly per design §4.2:
  - **metricBenchmark (DD-04):** `scored = groundedKpis.filter(k =>
    k.latestValue !== null)`; per-KPI `verdict = computeKpiVerdict(k,
    k.latestValue)`; `metricGrounded = groundedKpis.length > 0`; `score =
    metricGrounded && scored.length > 0 ? onTargetCount/scored.length : null`
    (grounded-but-all-`no_data` → `metricGrounded:true`, `score:null`,
    excluded from composite). Emit `onTargetCount`/`scoredCount`/`noDataCount` +
    the per-KPI rows with `benchmarkProse` carried through as evidence.
  - **coverage (DD-08, C-01/C-02):** `n = activities.length`; `n === 0` →
    `{score:0, unmodeled:true, keyMarked:false, …}`. Three core ratios over `n`:
    `roleRatio` (≥1 `roleIds`), `systemRatio` (≥1 `systemKinds`), `kpiRatio`
    (`coveredByKpi` — the field the storage read fills per C-01(a), counting
    **all** attributed KPIs, not only `MEASURES`-grounded ones, C-02). Marked-key
    is an **applicability-flagged bonus**: `markedKey =
    activities.filter(a=>a.keyMarked)`; empty → `keyMarked:false`,
    `markedKeyCoveredRatio:null`, coverage = mean of the **three** core ratios
    (term **dropped**, not scored 0). Else `keyMarked:true`,
    `markedKeyCoveredRatio = share of markedKey with coveredByKpi`, coverage =
    mean of **four** terms.
  - **automation (DD-06, Risk 8):** `systemCoverage = share with
    systemKinds.length > 0`; per-activity contribution = `max(weight[kind] for
    kind in systemKinds)`, `0` when no system; `augmentationTerm = mean of
    contributions`; `score = mean(systemCoverage, augmentationTerm)`. `byKind`
    counts each activity **once** under its **best (highest-weight) kind** (N-03
    of the design review) so `sum(byKind) === (# activities with ≥1 system)`.
    Echo `weights = AUGMENTATION_WEIGHT` as evidence.
  - **composite (DD-07, DD-08):** weighted mean over the **applicable**
    sub-scores only — a `null` `metricBenchmark.score` drops that term from both
    numerator and denominator (coverage + automation are always numeric).
  - **rank + meta:** sort `composite` DESC, ties `seedKey` ASC (deterministic,
    NFR-04); `meta.weights` echoes `compositeWeights`. Define the two constants:
    `AUGMENTATION_WEIGHT = { functional: 0.34, agentic: 0.67, ai_predictive: 1.0 }`
    (DD-06) and `DEFAULT_WEIGHTS = { metricBenchmark: 1.0, coverage: 1.0,
    automation: 1.0 }` (DD-07). No recommendation field emitted (NFR-04).
- **Verification**: `api/__tests__/function-benchmark-score.test.ts` (Neo4j-free
  unit) — sub-score math per axis; applicability/exclusion (`metricGrounded:false`
  and all-`no_data` both yield `score:null` and drop from composite;
  `keyMarked:false` drops the marked-key term rather than scoring 0; `unmodeled`
  coverage 0; no-system augmentation 0; all-`functional` degeneracy surfaces via
  `byKind`); deterministic rank + `seedKey` tiebreak; assert no `recommendation`
  key on any emitted object; `bun test`.

### T-04 — Model-scoped read + orchestrator (`computeBenchmarkReport`)

- **Files** (1): `api/src/storage/function-benchmark.ts` (new)
- **Implements**: design §4.3, DD-02, DD-03, DD-10, DD-13; C-01(a), N-02 — closes
  the read/orchestrate half of **AC-01**; supports FR-01, NFR-01
- **Complexity**: complex
- **Blocked by**: T-01 · **Blocks**: T-05, T-07, T-08
- **Steps**: `computeBenchmarkReport(driver): Promise<BenchmarkReport>`, all
  sessions `defaultAccessMode:"READ"` (NFR-01), no `SET`/`CREATE`/`MERGE`/`DELETE`:
  1. **Resolve the operator root (DD-02):** `MATCH (m:BusinessModel {name:"SaaS
     Operator"}) RETURN m`, filter in TS on `JSON.parse(attributes_json)
     .saasOperatorRoot === true`. **None → return the empty-`200` report**
     `{functions:[], meta:{functionCount:0, modelId:null, weights:DEFAULT_WEIGHTS}}`
     (DD-10), no further reads. Seeded branch: `meta.modelId = root.id`
     (**discovered**, never hard-coded — AC-01, N-02 of the design review).
  2. `scoped = await scopedNodeIds(driver, root.id)` — **consumed, never
     re-implemented** (`model-workspace-core` FR-18, `api/src/storage/model-scope.ts`).
  3. **Enumerate the six function domains:** `MATCH (d:Domain)-[:IN_MODEL]->(m
     {id:$rootId}) RETURN d`, parse `attributes.seedKey`, keep only the six known
     seedKeys.
  4. **Per-report batched reads** (bounded round trips, all READ):
     - **activities + roles + systems** — the design §4.3 grouped query;
       `systemKind` is **not** read in Cypher — collect each used system's raw
       `s.attributes_json`, parse in TS, read `.systemKind`, default to
       `DEFAULT_SYSTEM_KIND ("functional")` on absent/invalid (the
       `deserializeModel`/`key-activity-score.ts` pattern — **no APOC**, C-05 of
       the design review). Derive `keyMarked` by parsing `activityAttrs` and
       validating `attributes.keyActivity` against `keyActivityMarkSchema`
       (read-only; any bad shape → unmarked).
     - **grounded KPIs** — the DD-13 attribution predicate **verbatim from
       `cross-function-exec-rollup` DD-05**: `MATCH (k:KPI) WHERE k.archived_at IS
       NULL MATCH (k)-[:MEASURES]->(md:MetricDefinition) MATCH (d:Domain) WHERE
       d.id IN $domainIds WITH k, md, d WHERE k.domain_id = d.id OR EXISTS {
       MATCH (k)-[:ALIGNED_TO]->(t) WHERE t.id = d.id OR (t)-[:PART_OF*1..2]->
       (:Domain {id: d.id}) } RETURN DISTINCT d.id AS domainId, …, md.attributes_json`.
       Attribution edge-set is **`{domain_id, ALIGNED_TO}` only** — **no**
       `PARAM_BINDS` (B-01, DD-13). Parse `benchmarkProse =
       JSON.parse(metricAttrs).benchmark` in TS (evidence only, DD-04). Bin each
       row by its `domainId` tag.
     - **latest measurement** — the batched `LATEST_MEASUREMENT_CYPHER` shape
       (`performance.ts:170`) over the collected grounded-KPI id set: `MATCH
       (m:KPIMeasurement) WHERE m.kpi_id IN $ids …` (the governed Neo4j
       `:KPIMeasurement` source, **not** Postgres).
     - **activity→KPI coverage reach (C-01(a), N-02):** do **not** run a separate
       cartesian coverage query. On the **same** attribution read, project the
       KPI→(activity | parent-journey) reach so the orchestrator can, in TS, mark
       each activity `coveredByKpi:true` when a KPI **attributed to that
       activity's function** (the `{domain_id, ALIGNED_TO}` set) is `ALIGNED_TO`
       the activity **or** its parent `UserJourney` (`(a)-[:PART_OF]->
       (:UserJourney)`, **1 hop** — pinned, design §4.3). Coverage counts **all**
       attributed KPIs, not only `MEASURES`-grounded ones (C-02) — this is a
       distinct axis from FR-02. Concretely, extend the attribution read to
       return the reached activity/journey ids per KPI (or run **one** additional
       anchored read `MATCH (k:KPI)-[:ALIGNED_TO]->(x) …` that starts from `k`,
       **not** a per-`(d,a)` cartesian) and resolve `coveredByKpi` per activity in
       TS — the C-01(a) resolution. Keep the per-activity binning explicit (N-02).
  5. Assemble `FunctionRead[]`, call `scoreFunctions({functions,
     augmentationWeights: AUGMENTATION_WEIGHT, compositeWeights: DEFAULT_WEIGHTS})`,
     return the report.
- **Verification**: exercised end-to-end by T-07's route through the integration
  tests (T-08); this task's direct proof is `bun run typecheck` (clean read-shape
  wiring against the T-01 interfaces) plus a `manual: grep -n "MERGE\\|CREATE\\|
  \\bSET\\b\\|DELETE" api/src/storage/function-benchmark.ts in a terminal (input
  mode: CLI) — expect zero write clauses` (the READ-only invariant, NFR-01;
  behavioral zero-diff proof is AC-07 in T-08).

### T-05 — Route handler `handleBenchmarkReport`

- **Files** (1): `api/src/routes/analytics-benchmarks.ts` (new)
- **Implements**: design §4.4 — supports FR-07, FR-08
- **Complexity**: simple
- **Blocked by**: T-03, T-04 · **Blocks**: T-06, T-10
- **Steps**: Export `handleBenchmarkReport(_req: Request): Promise<Response>`
  that calls `computeBenchmarkReport(getDriver())` and returns
  `ok(benchmarkReportSchema.parse(report))` — zod-validated at the boundary
  (`ok`/`parseWith` from `_helpers.ts`). No params (root-fixed, FR-07). No
  per-route auth check — auth stays in the central gate (house rule, FR-09).
  Errors ride the standard `{error:{code,message,details?}}` envelope; no new
  error code (DD-10).
- **Verification**: covered behaviorally by T-08's `function-benchmark-authz`
  integration test (200 with permission); `bun run typecheck`.

### T-06 — Router dispatch + RBAC permission mapping (paired, C-03)

- **Files** (2): `api/src/router.ts` (modify), `api/src/auth/rbac-permissions.ts`
  (modify)
- **Implements**: design §4.4, §4.5, DD-09, DD-11; **C-03** (paired to prevent an
  un-permissioned merge) — closes the authz half of **AC-08**; supports FR-07,
  FR-09
- **Complexity**: moderate
- **Blocked by**: T-05 · **Blocks**: T-07, T-10
- **Steps**: Ship **both** edits in this one task (C-03: a dispatch that lands
  without its `ROUTE_PERMISSIONS` entry is unauthenticated because the gate skips
  the check when `getRoutePermission` returns `null`):
  - `api/src/router.ts` — add the dispatch line in the analytics block,
    **before** the `analytics/([^/]+)` catch-all at `router.ts:934` (DD-09; a
    two-segment path does not match the catch-all, so ordering is for clarity):
    `if (sub === "analytics/benchmarks/report" && method === "GET") return
    handleBenchmarkReport(req);` (the `key-activity-optimizer` `router.ts:446`
    precedent — editing the **API** router is permitted; XD-05 constrains only the
    PWA `route.ts`).
  - `api/src/auth/rbac-permissions.ts` — add one `P("GET",
    "analytics/benchmarks/report", "analytics:read")` line, joining the existing
    `analytics/*` read family (`rbac-permissions.ts:31–42`). **No** new
    permission string, **no** `query:read` fallback, route **not** `public`
    (DD-11, FR-09).
- **Verification**: `api/__tests__/function-benchmark-authz.integration.test.ts`
  (new; also serves T-08) — a session **without** `analytics:read` → `403`, with
  it → `200`; `getRoutePermission("GET","analytics/benchmarks/report")` is never
  `null`; the route is not in the public set; `bun test:integration`.

### T-07 — OpenAPI registration

- **Files** (2): `api/src/routes/openapi-benchmarks.ts` (new),
  `api/src/routes/openapi.ts` (modify)
- **Implements**: design §4.6, DD-10; N-01 of the design review (call-site
  wiring) — closes the OpenAPI half of **AC-08**; supports FR-08
- **Complexity**: moderate
- **Blocked by**: T-04, T-06 · **Blocks**: —
- **Steps**: New `api/src/routes/openapi-benchmarks.ts` exporting
  `registerBenchmarkPaths(registry)` (mirroring `openapi-performance.ts`) that
  registers the `benchmarkReportSchema` component and the `GET
  /api/v1/analytics/benchmarks/report` path with its `200` response, generated
  from the **same** T-01 zod definitions (no hand-maintained copy, FR-08). Wire it
  into `getOpenApiDoc()` at the **registration call site** alongside the
  `registerPerformancePaths(registry)` **call** at `openapi.ts:1045` (**not** the
  line-108 import — the design-review N-01 correction). **No `ERROR_CODES`
  change** (DD-10).
- **Verification**: `api/__tests__/function-benchmark-openapi.integration.test.ts`
  (new; also serves AC-08) — the two-segment path and its `200` response schema
  appear in `GET /api/v1/openapi.json`; `bun test:integration`.

### T-08 — API integration tests (report/metric/coverage/automation/read-only/authz)

- **Files** (6): `api/__tests__/function-benchmark-report.integration.test.ts`,
  `api/__tests__/function-benchmark-metric.integration.test.ts`,
  `api/__tests__/function-benchmark-coverage.integration.test.ts`,
  `api/__tests__/function-benchmark-automation.integration.test.ts`,
  `api/__tests__/function-benchmark-readonly.integration.test.ts`,
  `api/__tests__/function-benchmark-authz.integration.test.ts` (all new; the
  authz + openapi files are the ones T-06/T-07 reference — created here if not
  already present, extended if so)
- **Implements**: design §8; **C-02** (discriminating coverage fixture) — closes
  **AC-01, AC-02, AC-04, AC-05, AC-06, AC-07, AC-08**; supports FR-01..FR-07,
  NFR-01, NFR-04
- **Complexity**: complex
- **Blocked by**: T-03, T-04, T-06 · **Blocks**: —
- **Steps**: Seed a SaaS-Operator root + six function domains + activities/roles/
  systems/KPIs/`MEASURES` edges/measurements **via the governed routes/import**
  (no direct-driver writes), then assert:
  - **report (AC-01, AC-06):** the ranked list of **six** functions, each with
    `seedKey`/`name`/`composite`/three sub-scores + evidence, and `meta
    {functionCount, modelId, weights}`; `meta.modelId` is the **discovered** root
    id (not hard-coded); rank is `composite` DESC, ties `seedKey` ASC; **no**
    `recommendation` key anywhere.
  - **metric (AC-02):** a function whose grounded KPI is `on_target` vs the KPI's
    own target scores higher on `metricBenchmark` than one that misses; the prose
    `benchmark` appears as evidence but is **not** numerically compared; a
    `MEASURES`-linked KPI with **no** value is `no_data` (excluded from the
    denominator); a function with **zero** grounded KPIs is `metricGrounded:false`
    and excluded from the composite.
  - **coverage (AC-04, C-02):** high-coverage vs low-coverage functions; the
    **discriminating fixture** — an activity with an `ALIGNED_TO` KPI that has
    **no** `MEASURES` edge reads `coveredByKpi:true` (coverage) yet contributes
    **nothing** to `metricBenchmark` — so the two axes cannot silently collapse;
    `keyMarked:false` drops the marked-key term (not scored 0); `unmodeled:true`
    coverage 0; the `keyActivity` mark is read **read-only** (no write).
  - **automation (AC-05):** `ai_predictive`/`agentic` systems score higher than
    `functional`-only or no-`USES_SYSTEM`; no-system activity → 0 augmentation;
    per-`systemKind` counts + weights in evidence; an all-`functional` fixture
    degenerates to the coverage term (Risk 8), verified via `byKind`.
  - **read-only (AC-07):** a pre/post `/api/v1/stats` diff over a full report run
    is **zero**; no `keyActivity` mark is written.
  - **authz + determinism + isolation + empty-200 (AC-08):** 403 without / 200
    with `analytics:read`; byte-identical repeat calls; only SaaS-Operator
    functions scored (no other model's subgraph read); a graph with **no**
    operator root returns `200 {functionCount:0}` (not 404), **no** new
    `ERROR_CODES` entry.
- **Verification**: the six files above via `bun test:integration` (Neo4j up);
  `bun run typecheck`.

### T-09 — `BenchmarkReport` view + four states (VIEWS wiring deferred to nav orchestrator)

- **Files** (2): `pwa/src/views/business/BenchmarkReport.tsx` (new),
  `pwa/src/views/business/BenchmarkReport.module.css` (new).
  NOTE: the `views/index.tsx` `benchmarks:` VIEWS line is **NOT** owned by this
  spec — the nav orchestrator wires it under the `insights` surface at canonical
  `#/insights/benchmarks` (nav-IA restructure 2026-07-07; see the Steps note).
- **Implements**: design §4.7, DD-10; N-01 (EmptyState copy is view markup) —
  closes **AC-10, AC-11, AC-12, AC-13, AC-14**; supports FR-10, FR-11, FR-12,
  NFR-07, UX-01/02/05/06
- **Complexity**: complex
- **Blocked by**: T-10 · **Blocks**: T-11
- **Steps**: `BenchmarkReport.tsx` on the `FunctionMap.tsx` precedent:
  - Consume `useActiveModel()` for header context; default to the SaaS-Operator
    root (the report is root-fixed server-side, FR-07). Fetch via the T-10
    `api.benchmarkReport(...)` method — **never** the private `json<T>`.
  - **Four states from `_shared`** (imported `from "../_shared"`): **loading**
    `<Loading what="benchmark report" />` (AC-11); **empty** — `functionCount:0`
    (root-present-unseeded **or** the no-root empty-`200`, DD-10 — one state
    covers both) → `<EmptyState what=… />` with the seed-prompt copy (`bun run
    seed:saas-operator`) rendered as the view's **own markup** around
    `EmptyState`, since the catalog `EmptyState({what})` takes only `what` (N-01);
    no truncation banner (N-03); **error** `<ErrorState message onRetry={refetch}/>`
    (AC-13); **ready** — six function cards, each with `composite`, the three
    sub-scores + applicability flags, and a keyboard-activatable drill-down
    (`<button aria-expanded>`) revealing evidence (per-KPI verdict rows with
    `benchmarkProse` as context, coverage ratios + flags, per-`systemKind`
    augmentation counts). KPI/activity rows deep-link into Explorer via native
    anchors (`toHash({surface:"explorer", …})`, FR-12).
  - **Descriptive-only (XD-11):** scores + evidence, **no** recommendation UI.
  - **Tokens-only + catalog-first (UX-02, NFR-07):** `ViewRegion`/`ViewHeader` +
    `Card`/`DataTable`; all colors/spacing via `var(--…)` from `tokens.css`.
  - **The single `views/index.tsx` VIEWS wiring (DEFERRED — nav-orchestrator-owned, nav-IA restructure 2026-07-07):** the canonical route is `#/insights/benchmarks` (the former `#/business/benchmarks` surface no longer exists). This spec does **NOT** edit `route.ts` / `views/index.tsx` / the nav guard tests (owned by the concurrent nav session). The orchestrator adds, under the `insights` surface: `import { BenchmarkReport } from "./business/BenchmarkReport";` plus the VIEWS entry `benchmarks: (r) => <BenchmarkReport route={r} />`.
- **Verification**: `pwa/src/__tests__/benchmark-report.test.tsx` (new, AC-10 —
  ready state renders six functions + evidence, no recommendation UI) and
  `pwa/src/__tests__/benchmark-report-states.test.tsx` (new, AC-11/12/13 —
  loading/empty/error+retry); `bun test`. **CLI (AC-14):** `bun run
  scripts/design-conformance.ts --view pwa/src/views/business/BenchmarkReport.tsx`
  and `… --view pwa/src/views/business/BenchmarkReport.module.css` — both exit 0
  with zero token/component violations.

### T-10 — PWA api client `benchmarkReport` method

- **Files** (1): `pwa/src/api.ts` (modify)
- **Implements**: design §4.8 — supports FR-10
- **Complexity**: simple
- **Blocked by**: T-01 · **Blocks**: T-09
- **Steps**: Add one exported method (grouping consistent with the file, e.g.
  alongside `performance`): `benchmarkReport: (signal?: AbortSignal) =>
  json<BenchmarkReport>("/api/v1/analytics/benchmarks/report",
  withSignal(signal))`. Import `BenchmarkReport` from
  `@companygraph/shared/schema/function-benchmark` (T-01). Do **not** modify the
  private `json<T>` helper (`key-activity-optimizer` N-05 — it is not a consumable
  interface, but the method wraps it as the exported surface).
- **Verification**: exercised by the T-09 component tests (which mock the fetch
  the method issues); `bun run typecheck`.

### T-11 — a11y + deep-link-reload verification (AC-15, AC-16)

- **Files** (1): `pwa/playwright/business-benchmarks-reload.spec.ts` (new)
- **Implements**: design §4.7 — closes **AC-16**; provides the AC-15 manual repro;
  supports FR-12, UX-05, UX-06
- **Complexity**: moderate
- **Blocked by**: T-09 · **Blocks**: —
- **Steps**: Playwright spec: with the SaaS-Operator context active, navigate to
  `#/insights/benchmarks`, reload — assert the same route re-renders the live
  `BenchmarkReport` for the persisted context (persistence is
  `model-workspace-core` FR-15; no cross-model leakage), API-seeded (AC-16). The
  a11y walk (AC-15) ships as the manual repro below.
- **Verification**: `pwa/playwright/business-benchmarks-reload.spec.ts` (AC-16).
  **AC-15** `manual: with the stack up (bun run dev) and the SaaS-Operator model
  seeded, load #/insights/benchmarks keyboard-only (input mode: keyboard) — Tab to
  a function card's drill-down expander and press Enter (expect aria-expanded
  flips and the KPI-verdict/coverage evidence expands), Tab to a deep link and
  press Enter (expect navigation to the Explorer for that entity); focus lands on
  the section landmark (ViewRegion) first`.

---

## Cross-cutting verification (whole-spec)

- **AC-09** (transpile clean + no compile-time schema/route-file edit): `bun run
  typecheck` exit 0; `manual: run git diff --stat in a terminal (input mode: CLI)
  and verify no additions to NODE_LABELS/EDGE_TYPES/EDGE_ENDPOINTS in
  shared/src/schema/{nodes,edges}.ts, no change to pwa/src/route.ts or SURFACES,
  and views/index.tsx limited to the single benchmarks: line` (NFR-02, NFR-03,
  NFR-06). Not a standalone task — checked at the final validation sweep.
- **Final sweep** (before Execution=complete in STATUS.md): re-run `bun test` +
  `bun test:integration` (Neo4j up), the AC-14 conformance CLIs (both view files),
  the AC-15 keyboard walk, the AC-16 Playwright spec, and AC-09 above. Every
  AC-01..AC-16 must map to a passing test path or a written `manual:` repro before
  STATUS.md gains `verification_artifact`/`verified_at` (completion hook enforces).

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with behaviour | the task's listed test (`bun test <path>` / `bun test:integration`) |
| tasks touching pwa views (T-09) | `bun run scripts/design-conformance.ts --view <file>` for **every** touched `.tsx` and `.module.css` — one invocation each |
| final task | `bun test` + `bun test:integration` (needs Neo4j) + full AC-01..AC-16 sweep + AC-09 `git diff` check |

## Traceability summary

| FR | Tasks | AC |
|----|-------|-----|
| FR-01 model-scoped read + attribution | T-01, T-04, T-08 | AC-01, AC-07, AC-08 |
| FR-02 metricBenchmark sub-score | T-01, T-03, T-04, T-08 | AC-02 |
| FR-03 self-owned KPI verdict module | T-02, T-03 | AC-03 |
| FR-04 coverage sub-score (3-ratio + optional marked-key) | T-01, T-03, T-04, T-08 | AC-04 |
| FR-05 automation sub-score + augmentation weights | T-01, T-03, T-08 | AC-05 |
| FR-06 composite over applicable sub-scores + rank | T-01, T-03, T-08 | AC-01, AC-06 |
| FR-07 benchmark-report route (two-segment) + empty-200 | T-04, T-05, T-06 | AC-01, AC-08 |
| FR-08 OpenAPI, no ERROR_CODES change | T-07 | AC-08 |
| FR-09 `analytics:read` mapping (paired w/ dispatch, C-03) | T-06 | AC-08 |
| FR-10 BenchmarkReport view + one views/index.tsx line + api method | T-09, T-10 | AC-10, AC-14 |
| FR-11 four view states | T-09 | AC-11, AC-12, AC-13 |
| FR-12 keyboard-reachable + deep links | T-09, T-11 | AC-15, AC-16 |
| NFR-01 model isolation + read-only | T-04, T-08 | AC-07, AC-08 |
| NFR-02 no new label/edge/store/persist | T-01, T-04 | AC-09 |
| NFR-03 route-file single-owner (PWA) | T-09 | AC-09 |
| NFR-04 deterministic + explainable + no recommendation | T-01, T-03, T-08 | AC-06, AC-08 |
| NFR-05 ownership boundaries (no owned-elsewhere edit) | T-02, T-04, T-06 | AC-03, AC-09 |
| NFR-06 house rules (zod, no tsc, en-US, central-gate auth) | T-01, T-05, T-06, all | AC-08, AC-09 |
| NFR-07 tokens-only + design-conformance | T-09 | AC-14 |
</content>
</invoke>
