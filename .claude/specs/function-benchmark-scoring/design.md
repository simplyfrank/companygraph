---
feature: "function-benchmark-scoring"
created: "2026-07-06"
author: "spec-author"
status: "revised"
size: "medium"
revised: "2026-07-06"
revision_note: "rev 2 — addresses review-design.md pass 1 (B-01, B-02, C-01..C-05, N-01..N-03). Attribution rule reconciled to the cross-function-exec-rollup DD-05 predicate ({domain_id, ALIGNED_TO}); PARAM_BINDS dropped; per-domain-tagged Cypher pinned; verdict band contract transcribed verbatim; APOC removed. No stable IDs renumbered."
---

# Design: function-benchmark-scoring

## 1. Overview

`function-benchmark-scoring` computes a **per-function descriptive maturity
score** for the six function `Domain` roots of the SaaS-Operator `BusinessModel`
root and surfaces it in a read-only `BenchmarkReport` view at
`#/insights/benchmarks`. It is a **wave-3** consumer built entirely on landed
surfaces — it adds one read-only analytics route, one pure scoring module, one
model-scoped read, and one PWA view. It writes nothing, adds no label/edge/store,
and carries no prescriptive output (XD-11).

The design **mirrors the `key-activity-optimizer` module split** verbatim — a
pure, Neo4j-free scorer (`api/src/derive/`) fed by a model-scoped Neo4j read
(`api/src/storage/`), producing a deterministic, `meta`-carrying response served
by a route registered in `api/src/router.ts`, and rendered by a four-state PWA
view — but the unit of scoring is the **function domain** (six rows), not the
activity.

### 1.1 Consumed surfaces — landed and cited (not re-specced)

| Surface | Interface consumed | File |
|---------|--------------------|------|
| `saas-operator-foundation` FR-01 | operator root resolved by `name:"SaaS Operator"` + `attributes.saasOperatorRoot:true` (never a hard-coded id) | `api/src/seed/ensure-operator-root.ts`; PWA marker mirrored in `FunctionMap.tsx` |
| `saas-operator-foundation` FR-03 | six `IN_MODEL` function `Domain` nodes, each carrying `attributes.seedKey ∈ {marketing, sales, finance_accounting, customer_success, product_delivery, platform_ops}` | seeded via `ensureFunctionDomains` |
| `model-workspace-core` FR-18 | `scopedNodeIds(driver, modelId): Promise<Set<string>>` — model-scope resolution (Domains `IN_MODEL` + `PART_OF*` descendants) — **consumed, never re-implemented** | `api/src/storage/model-scope.ts:22` |
| `model-workspace-core` | `getModel(driver, modelId)` existence gate; `useActiveModel()` shell context | `api/src/storage/models.ts`; `pwa/src/context/ActiveModelContext.tsx` |
| `saas-metric-library` | `MEASURES` edge (KPI→MetricDefinition, XD-06-erratum); `MetricDefinition.attributes.benchmark` free-text prose | registry-registered; roster `saas-metric-library/design.md:246–268` |
| `kpi-okr-performance-dashboards` | the `on_target/warning/breach/no_data` band rule (`computeKpiStatus`, `api/src/routes/performance.ts:50`) — **re-implemented, never imported/edited** (XD-08) | `api/src/routes/performance.ts` |
| `kpi-measurement-alignment` / `performance.ts` | the `ALIGNED_TO`-only KPI→domain-slice traversal (`DOMAIN_FILTER`, `performance.ts:131–136` — `PART_OF*1..2` to `(:Domain {id})`; the flat `k.domain_id` is NOT read by `performance.ts`, FR-06 there); the batched latest-`:KPIMeasurement` read (`LATEST_MEASUREMENT_CYPHER`, `performance.ts:170`) | `api/src/routes/performance.ts` |
| `cross-function-exec-rollup` FR-03 / DD-05 | the **exact** KPI→function attribution predicate (shared read semantics, not shared code): `k.domain_id = d.id` **OR** `ALIGNED_TO`-to-`d`-or-`PART_OF*1..2`-descendant, `RETURN DISTINCT`, per-domain-tagged by carrying `d.id` through the `WITH` (`cross-function-exec-rollup/design.md:288–309`) | `cross-function-exec-rollup/design.md` §4.2 |
| `system-augmentation-model` | closed `SYSTEM_KINDS = {functional, agentic, ai_predictive}`, `DEFAULT_SYSTEM_KIND = "functional"` | `shared/src/schema/system-kind.ts:9` |
| `key-activity-optimizer` | the `keyActivity` attribute mark (read-only), the `GET …/key-activities` scores endpoint (optional context), and the **module-split pattern** | `api/src/storage/key-activities.ts`, `api/src/derive/key-activity-score.ts` |
| central router + RBAC | `api/src/router.ts` dispatch (the `key-activity-optimizer` `router.ts:446` precedent); `ROUTE_PERMISSIONS` `analytics:read` family (`rbac-permissions.ts:31–42`) | `api/src/router.ts`, `api/src/auth/rbac-permissions.ts` |
| route/OpenAPI helpers | `ok`/`parseWith` (`_helpers.ts:18/84`); `getOpenApiDoc()` + `registerPerformancePaths` composition precedent (`openapi.ts:108`) | `api/src/routes/_helpers.ts`, `api/src/routes/openapi.ts` |
| PWA catalog | `ViewRegion`/`ViewHeader`/`Loading`/`EmptyState`/`ErrorState` (`_shared.tsx`, imported `from "../_shared"`); `api.*` client (`pwa/src/api.ts:130`); tokens (`pwa/src/styles/companygraph/tokens.css`); `scripts/design-conformance.ts` | `pwa/src/views/_shared.tsx`, `pwa/src/api.ts` |

### 1.2 Scope boundary (what this design does NOT touch)

Read-only. No edits to any KPI/metric/risk/SLA/`performance.ts`/`key-activities`
write path (NFR-05), no compile-time schema arrays, no `pwa/src/route.ts` /
`SURFACES` (XD-05 governs the PWA route registry — this feature edits **only**
its own view file, its CSS module, and the single `benchmarks:` line in
`views/index.tsx`, NFR-03). Editing the **API** router (`api/src/router.ts`) to
register the read route is permitted and matches the `key-activity-optimizer`
precedent — XD-05 constrains the PWA registry, not the API router (B-02).

---

## 2. Design decisions

| ID | Decision | Rationale / resolves |
|----|----------|----------------------|
| DD-01 | **Three-module split, mirroring `key-activity-optimizer`.** (a) `api/src/derive/function-benchmark-score.ts` — a **pure, Neo4j-free** scorer `scoreFunctions(input): { functions, meta }` taking a plain read-shape (no `Driver`, no session); (b) `api/src/storage/function-benchmark.ts` — the model-scoped Neo4j read + orchestrator `computeBenchmarkReport(driver)`; (c) `api/src/routes/analytics-benchmarks.ts` — the route handler. The pure scorer is unit-testable against fixtures with zero Neo4j (AC-02..AC-06). | `key-activity-optimizer` DD-01, testability |
| DD-02 | **Operator root resolved at read time by the foundation marker**, never a path param and never hard-coded: a `MATCH (m:BusinessModel {name:"SaaS Operator"}) RETURN m` filtered in TS on `JSON.parse(attributes_json).saasOperatorRoot === true` (mirrors `ensure-operator-root.ts` §4.1 and `deserializeModel`). No `:modelId` in the route (FR-07). | FR-01, FR-07, `saas-operator-foundation` FR-01 |
| DD-03 | **Model isolation via `scopedNodeIds`.** All per-function reads intersect the operator root's `scopedNodeIds` set; no other model's subgraph is read (NFR-01). The six function domains are the root's `IN_MODEL` `Domain` nodes carrying `attributes.seedKey`. | NFR-01, `model-workspace-core` FR-18 |
| DD-04 | **OQ-1 → option (b): KPI-vs-target, prose benchmark as evidence.** The `MetricDefinition.benchmark` field is **free-text prose** (confirmed: `"NRR > 100% healthy; > 120% best-in-class"`, roster `saas-metric-library/design.md:253`), **not** machine-comparable. The `metricBenchmark` sub-score is the share of a function's **metric-grounded** KPIs (those with a `MEASURES` edge) whose latest value is `on_target` **against the KPI's own `target_value`/`target_direction`/thresholds**; the prose `benchmark` rides along as displayed evidence, never numerically compared. `MEASURES` gates *which* KPIs count, not the comparison. | FR-02, OQ-1(b), Risk 1 |
| DD-05 | **OQ-2 → re-implement the verdict (no shared helper).** The `on_target/warning/breach/no_data` band rule is re-implemented in this spec's own pure module `computeKpiVerdict(...)`, byte-mirroring the `performance.ts:50` `computeKpiStatus` contract; this module **never imports `routes/performance`** (guarded, AC-03). Rationale: staying inside the ownership boundary (XD-08) — the same "reuse-the-contract-not-the-code" call `cross-function-exec-rollup` OQ-1 makes. A shared-helper extraction would edit `performance.ts` (owned elsewhere) and is a bounded follow-up if the user wants DRY. | FR-03, OQ-2, XD-08 |
| DD-06 | **OQ-3 → `systemKind` augmentation-weight table (code-default constants).** `AUGMENTATION_WEIGHT: Record<SystemKind, number> = { functional: 0.34, agentic: 0.67, ai_predictive: 1.0 }` — a code constant over exactly the closed 3-value enum, ordered `ai_predictive ≥ agentic ≥ functional`; an activity with **no** `USES_SYSTEM` edge scores `0` on the augmentation term. No tuning subsystem (`key-activity-optimizer` DD-09 precedent). | FR-05, OQ-3, Risk 8 |
| DD-07 | **OQ-4 → composite weights are code-default constants** `DEFAULT_WEIGHTS = { metricBenchmark: 1.0, coverage: 1.0, automation: 1.0 }`, echoed in `meta.weights`. No settings table, no `GET/PATCH …/settings`. | FR-06, OQ-4 |
| DD-08 | **Applicability, not zero-fill.** A `null`/not-applicable sub-score (`metricGrounded:false`, `unmodeled:true`, or `keyMarked:false`-dropped component) is **excluded** from its denominator — the composite is the weighted mean over the *applicable* sub-scores, never a spurious zero. Every score carries component evidence + applicability flags (XD-11 explainability). | FR-02, FR-04, FR-06, NFR-04, B-03 |
| DD-09 | **OQ-5 → two-segment route `GET /api/v1/analytics/benchmarks/report`.** The flat `analytics/benchmarks` is shadowed by the catch-all `sub.match(/^analytics\/([^/]+)$/)` at `router.ts:934` (→ `handleAnalyticsReport`). A **two-segment** path does not match `analytics/([^/]+)`, so it needs no dispatch-ordering dependency — registered before line 934 anyway for clarity. | FR-07, B-02, `router.ts:934` |
| DD-10 | **OQ-6 → empty-`200`, no new error code.** No operator root → `200` `{functions:[], meta:{functionCount:0, modelId:null, weights}}`. `ERROR_CODES` is untouched (FR-08). The view renders its single empty state. | FR-07, FR-08, OQ-6, C-04 |
| DD-11 | **OQ-7 → `analytics:read`.** The route joins the existing `analytics/*` read family in `ROUTE_PERMISSIONS` (`rbac-permissions.ts:31–42`); no new RBAC string. | FR-09, OQ-7, C-05 |
| DD-12 | **Live compute, no cache.** The report computes on request at single-model scale (six functions) — the `key-activity-optimizer` FR-06 / cto-analytics DD-03 precedent. No `benchmark_*` table, no score node/attribute. | FR-07, NFR-02 |
| DD-13 | **KPI→function attribution is the `cross-function-exec-rollup` DD-05 predicate, verbatim** (Resolves: B-01, B-02). A KPI is scoped to a function-`Domain` `d` when **`k.domain_id = d.id` OR** it is **`ALIGNED_TO`** `d` **or** an entity `PART_OF*1..2` `d` — the two-tier rule requirements FR-01 states and the sibling `cross-function-exec-rollup` DD-05 §4.2 (`design.md:288–309`) pins. Two corrections from the draft: **(1, B-01)** `PARAM_BINDS` is **removed** from the attribution traversal — neither `performance.ts` `DOMAIN_FILTER` (`ALIGNED_TO`-only, its comment `performance.ts:126–130`) nor the sibling DD-05 uses it; `PARAM_BINDS` is a KPI-parameter→attribute-source binding (`kpi-param-bindings.ts`), **not** a domain-ownership edge, and including it would scope KPIs to functions the cockpit would not, breaking the Risk-9 "attribute identically" invariant. The single attribution edge is **`ALIGNED_TO`**. **(2, B-02)** the flat **`k.domain_id = d.id`** disjunct is the **primary** path (FR-01 lists it first; the sibling DD-05 adds it deliberately as the CS-KPI superset over the `ALIGNED_TO`-only `performance.ts` slice — CS FR-05 sets the flat `k.domain_id`). This spec matches the sibling exactly so the two wave-3 surfaces never disagree on which KPIs belong to which function (Risk 9). `RETURN DISTINCT` collapses the duplicate rows a KPI produces when matched by both disjuncts. This is where the two wave-3 specs agree **with** `performance.ts` on the alignment traversal and deliberately **diverge from** it on the flat `domain_id` disjunct — a documented, band-neutral scope superset (the sibling's rationale, DD-05). Note: FR-01's requirements wording still reads `ALIGNED_TO`/`PARAM_BINDS`; per B-01 this design drops `PARAM_BINDS` and forward-flags FR-01/AC-01 to strike it — the *design* attribution set is `{domain_id, ALIGNED_TO}` only. | FR-01, FR-02, FR-04 |

---

## 3. Data model

### 3.1 No schema change (NFR-02)

Zero additions to `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS`, zero runtime
registry labels/edges, no store, no persisted score. This feature **reads** the
existing graph (`Domain`, `UserJourney`, `Activity`, `Role`, `System`, `KPI`,
`MetricDefinition`, `:KPIMeasurement`) and computes live.

### 3.2 Wire shape (`shared/src/schema/function-benchmark.ts`)

All response types are declared once as `zod` schemas in `shared/`, imported by
both the route (validation + OpenAPI) and the PWA client (typing). Descriptive
only — **no** `recommendation`/`suggestion` field anywhere (NFR-04).

```ts
// shared/src/schema/function-benchmark.ts (new)
import { z } from "zod";
import { systemKindSchema } from "./system-kind";

export const kpiVerdictEnum = z.enum(["on_target", "warning", "breach", "no_data"]);
export type KpiVerdict = z.infer<typeof kpiVerdictEnum>;

// Per-KPI evidence row behind the metricBenchmark sub-score (DD-04).
export const kpiVerdictRowSchema = z.object({
  kpi_id: z.string(),
  name: z.string(),
  metricId: z.string(),           // the MEASURES-linked MetricDefinition id
  metricName: z.string(),
  benchmarkProse: z.string(),     // MetricDefinition.attributes.benchmark — DISPLAYED, not compared
  latestValue: z.number().nullable(),
  target_value: z.number().nullable(),
  target_direction: z.string().nullable(),
  verdict: kpiVerdictEnum,        // on_target | warning | breach | no_data
});

// metricBenchmark sub-score (FR-02) — null when metricGrounded:false.
export const metricBenchmarkScoreSchema = z.object({
  score: z.number().nullable(),           // share of metric-grounded KPIs on_target ∈ [0,1] | null
  metricGrounded: z.boolean(),            // false ⇒ zero MEASURES-linked KPIs ⇒ excluded from composite
  onTargetCount: z.number().int(),
  scoredCount: z.number().int(),          // denominator: MEASURES-linked KPIs WITH a measured value
  noDataCount: z.number().int(),          // MEASURES-linked KPIs with no measurement (excluded)
  kpis: z.array(kpiVerdictRowSchema),
});

// coverage sub-score (FR-04) — three core ratios + optional marked-key bonus.
export const coverageScoreSchema = z.object({
  score: z.number(),                      // ∈ [0,1]
  unmodeled: z.boolean(),                 // true ⇒ zero activities ⇒ score 0
  keyMarked: z.boolean(),                 // true ⇒ ≥1 marked-key activity ⇒ bonus term contributes
  activityCount: z.number().int(),
  roleRatio: z.number(),                  // share with ≥1 EXECUTES Role
  systemRatio: z.number(),                // share with ≥1 USES_SYSTEM
  kpiRatio: z.number(),                   // share covered by ≥1 function KPI (attribution edge-set, DD-13)
  markedKeyCoveredRatio: z.number().nullable(), // share of marked-key activities with a KPI (null when keyMarked:false)
});

// automation (system-augmentation) sub-score (FR-05).
export const automationScoreSchema = z.object({
  score: z.number(),                      // ∈ [0,1]
  systemCoverage: z.number(),             // share of activities with ≥1 USES_SYSTEM
  augmentationTerm: z.number(),           // weighted-by-systemKind term ∈ [0,1]
  byKind: z.record(systemKindSchema, z.number().int()), // per-kind activity counts (evidence)
  weights: z.record(systemKindSchema, z.number()),      // DD-06 augmentation weights (echoed)
});

export const functionScoreSchema = z.object({
  seedKey: z.string(),
  name: z.string(),                       // function Domain name
  domainId: z.string(),
  composite: z.number(),                  // weighted mean over APPLICABLE sub-scores (DD-08)
  metricBenchmark: metricBenchmarkScoreSchema,
  coverage: coverageScoreSchema,
  automation: automationScoreSchema,
});

export const benchmarkReportMetaSchema = z.object({
  functionCount: z.number().int(),
  modelId: z.string().nullable(),         // null on the empty-200 no-root case (DD-10)
  weights: z.object({
    metricBenchmark: z.number(),
    coverage: z.number(),
    automation: z.number(),
  }),
});

export const benchmarkReportSchema = z.object({
  functions: z.array(functionScoreSchema), // ranked composite DESC, ties by seedKey ASC
  meta: benchmarkReportMetaSchema,
});
export type BenchmarkReport = z.infer<typeof benchmarkReportSchema>;
```

### 3.3 Read-shape (pure-scorer input, `api/src/derive/function-benchmark-score.ts`)

The storage read produces this plain shape; the pure scorer consumes only it
(no `Driver`), mirroring `ScoreSubgraph` in `key-activity-score.ts`.

```ts
export interface FunctionActivity {
  id: string;
  roleIds: string[];                 // EXECUTES (Role→Activity)
  systemKinds: SystemKind[];         // one per USES_SYSTEM System (default functional)
  keyMarked: boolean;                // attributes.keyActivity present + valid
  coveredByKpi: boolean;             // ≥1 function KPI attributed to this function is ALIGNED_TO this activity (or its parent journey), DD-13/§4.3
}
export interface FunctionKpiGrounded {
  kpi_id: string; name: string;
  metricId: string; metricName: string; benchmarkProse: string;
  latestValue: number | null;
  target_value: number | null; target_direction: string | null;
  warning_threshold: number | null; critical_threshold: number | null;
}
export interface FunctionRead {
  seedKey: string; name: string; domainId: string;
  activities: FunctionActivity[];
  groundedKpis: FunctionKpiGrounded[]; // ONLY KPIs carrying a MEASURES edge
}
export interface BenchmarkInput {
  functions: FunctionRead[];
  augmentationWeights: Record<SystemKind, number>; // DD-06
  compositeWeights: { metricBenchmark: number; coverage: number; automation: number }; // DD-07
}
```

---

## 4. Core logic

### 4.1 KPI-vs-target verdict — self-owned pure module (FR-03, DD-05)

`computeKpiVerdict(kpi, latest): KpiVerdict` lives in
`api/src/derive/function-benchmark-score.ts` (co-located with the scorer). It
**re-implements** the `computeKpiStatus` band rule at `performance.ts:50–89`
**exactly** — copied byte-for-byte from the four-case switch, not imported
(Resolves: C-03). The re-implementation target is the concrete contract below,
transcribed from `performance.ts:50–89` (the earlier "else deviation-band grade"
gloss is retired — the no-band default is `warning`, never `on_target`):

- `latest == null || latest === undefined` → `no_data`.
- `target_value == null || undefined` → `no_data` (the N-07 defensive guard;
  a nullable declared type must not coerce through `v >= null`).
- `let warning = warning_threshold ?? null; let critical = critical_threshold ?? null`.
- `higher_is_better`:
  - `v >= target` → `on_target`;
  - `critical !== null && v < critical` → `breach`;
  - `warning !== null && v < warning` → `warning`;
  - else `return warning === null ? "warning" : "on_target"` (missed target but
    inside the warning band → `on_target`; **no** warning band at all degrades to
    the coarser `warning`).
- `lower_is_better` (mirror):
  - `v <= target` → `on_target`;
  - `critical !== null && v > critical` → `breach`;
  - `warning !== null && v > warning` → `warning`;
  - else `return warning === null ? "warning" : "on_target"`.
- `target_is_exact` (exact equality + absolute-deviation bands):
  - `v === target` → `on_target`;
  - `const deviation = Math.abs(v - target)`;
  - `critical !== null && deviation > critical` → `breach`;
  - `warning !== null && deviation > warning` → `warning`;
  - else `return "warning"` (nonzero deviation inside the bands **or with no
    bands** is `warning`, **never** `on_target` — this is the no-band default the
    draft glossed, C-03).
- `default` (unknown/null `target_direction`) → `no_data` (never throws — total
  over the declared domain, `performance.ts:84–87`).

AC-03 pins parity against a shared fixture table (including the exact-branch
no-band `warning` case) and asserts (`grep`) that the module does not import
`routes/performance`.

### 4.2 Sub-score math — pure `scoreFunctions` (FR-02, FR-04, FR-05, FR-06)

`scoreFunctions(input: BenchmarkInput): { functions: FunctionScore[]; meta }`.
For each `FunctionRead`:

**metricBenchmark (FR-02, DD-04):**
- `scored = groundedKpis.filter(k => k.latestValue !== null)` (a `MEASURES`-linked
  KPI with no value → `no_data`, excluded from the denominator).
- per KPI `verdict = computeKpiVerdict(k, k.latestValue)`.
- `metricGrounded = groundedKpis.length > 0`.
- `score = metricGrounded && scored.length > 0 ? onTargetCount/scored.length : null`
  (a function with grounded-but-all-`no_data` KPIs → `metricGrounded:true`,
  `score:null` too — nothing to compare; excluded from composite, DD-08).

**coverage (FR-04, DD-08, B-03):**
- `n = activities.length`; `n === 0` → `{score:0, unmodeled:true, keyMarked:false,…}`.
- three core ratios over the `n` activities: `roleRatio` (≥1 `roleIds`),
  `systemRatio` (≥1 `systemKinds`), `kpiRatio` (`coveredByKpi`).
- `markedKey = activities.filter(a => a.keyMarked)`. If `markedKey.length === 0`
  → `keyMarked:false`, `markedKeyCoveredRatio:null`, and the coverage score is
  the **mean of the three core ratios** (the marked-key term is DROPPED, not
  scored 0 — B-03). Else `keyMarked:true`, `markedKeyCoveredRatio = share of
  markedKey with coveredByKpi`, and coverage is the mean of **four** terms.

**automation (FR-05, DD-06, Risk 8):**
- `systemCoverage = share of activities with systemKinds.length > 0`.
- per activity augmentation contribution = `max(weight[kind] for kind in
  a.systemKinds)` (best system on the activity), `0` when no system.
  `augmentationTerm = mean of per-activity contributions` (∈[0,1]).
- `score = mean(systemCoverage, augmentationTerm)` (both terms in [0,1]).
- `byKind` counts each activity **once**, under its **best (highest-weight)
  `systemKind`** — the same `max(weight[kind])` kind that drives its augmentation
  contribution (Resolves: N-03). An activity with systems of two kinds counts in
  exactly one bucket (its best), so `sum(byKind values) === (# activities with
  ≥1 system)` and the evidence is deterministic (AC-05). Activities with no
  system are not counted in any bucket. If every activity's best kind is
  `functional`, `augmentationTerm` collapses toward the coverage-scaled 0.34 band
  — truthful degeneracy surfaced in evidence, not a bug (Risk 8).

**composite (FR-06, DD-08):** the weighted mean over the **applicable**
sub-scores only — `metricBenchmark.score === null` (or an all-`no_data`
function) drops that term from both numerator and denominator, so an
unmeasured-but-well-modeled function is not penalized. `coverage` and
`automation` are always applicable (always numeric).

**rank + meta:** functions sorted `composite` DESC, ties `seedKey` ASC
(deterministic, NFR-04). `meta.weights` echoes `compositeWeights`. All math is
pure and deterministic — byte-identical across calls (NFR-04, AC-08).

### 4.3 Model-scoped read + orchestrator (`api/src/storage/function-benchmark.ts`, FR-01)

`computeBenchmarkReport(driver): Promise<BenchmarkReport>`:

1. **Resolve the operator root** (DD-02): `MATCH (m:BusinessModel
   {name:"SaaS Operator"}) RETURN m`, filter in TS on
   `saasOperatorRoot===true`. **None → return the empty-`200` report**
   `{functions:[], meta:{functionCount:0, modelId:null, weights:DEFAULT_WEIGHTS}}`
   (DD-10) — no further reads. On the **non-empty** (seeded) branch,
   `meta.modelId` is populated with the **discovered** root id (`root.id`,
   non-null) — the schema allows null only for the empty-`200` case; AC-01
   asserts the seeded path returns the discovered id, never a hard-coded one
   (Resolves: N-02).
2. `scoped = await scopedNodeIds(driver, root.id)` (consumed, DD-03).
3. **Enumerate the six function domains**: `MATCH (d:Domain)-[:IN_MODEL]->(m
   {id:$rootId}) RETURN d`, parse `attributes.seedKey`; keep only the six known
   seedKeys (ignore any stray domain).
4. **Per-function reads** (all `defaultAccessMode:"READ"`, bounded round trips):
   - **activities + roles + systems** — one query per report (grouped by domain):
     ```cypher
     MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {id:$rootId})
     WHERE d.id IN $domainIds
     OPTIONAL MATCH (d)<-[:PART_OF*1..]-(a:Activity) WHERE a.id IN $scopedIds
     OPTIONAL MATCH (r:Role)-[:EXECUTES]->(a)
     OPTIONAL MATCH (a)-[:USES_SYSTEM]->(s:System)
     RETURN d.id AS domainId, a.id AS activityId,
            a.attributes_json AS activityAttrs,
            collect(DISTINCT r.id) AS roleIds,
            collect(DISTINCT s.attributes_json) AS systemAttrs
     ```
     **No APOC (Resolves: C-05).** `systemKind` is **not** read in Cypher; the
     query collects each used system's raw `s.attributes_json` string, and the
     TS orchestrator parses each with `JSON.parse` and reads `.systemKind`,
     defaulting to `DEFAULT_SYSTEM_KIND` (`"functional"`) on absent/invalid —
     the exact `deserializeModel` / `key-activity-score.ts` pattern (no runtime
     APOC dependency, which is not guaranteed present in the hot read path). The
     draft's `apoc.convert.fromJsonMap` variant is dropped. `keyMarked` is
     derived by parsing `activityAttrs` and validating `attributes.keyActivity`
     against `keyActivityMarkSchema` (read-only; the same tolerance as
     `key-activities.ts:158` — any bad shape → unmarked).
   - **grounded KPIs** — the KPIs attributed to each function domain (DD-13, the
     shared `cross-function-exec-rollup` DD-05 predicate) that ALSO carry a
     `MEASURES` edge. Because the report scores all six domains, this is **one
     batched, per-domain-tagged query** — the sibling's §4.2 form (`RETURN
     DISTINCT` + carrying `d.id` through the `WITH`) so each KPI row is tagged
     with the owning `domainId` (Resolves: C-01, C-02 — the invalid `WHERE-in`
     sketch is replaced with valid, per-domain-tagged Cypher):
     ```cypher
     MATCH (k:KPI) WHERE k.archived_at IS NULL
     MATCH (k)-[:MEASURES]->(md:MetricDefinition)
     MATCH (d:Domain) WHERE d.id IN $domainIds
     WITH k, md, d
     WHERE k.domain_id = d.id
        OR EXISTS { MATCH (k)-[:ALIGNED_TO]->(t)
                    WHERE t.id = d.id OR (t)-[:PART_OF*1..2]->(:Domain {id: d.id}) }
     RETURN DISTINCT d.id AS domainId, k.id AS kpi_id, k.name AS name,
            k.target_value AS target_value, k.target_direction AS target_direction,
            k.warning_threshold AS warning_threshold, k.critical_threshold AS critical_threshold,
            md.id AS metricId, md.name AS metricName,
            md.attributes_json AS metricAttrs   /* benchmark prose parsed in TS */
     ```
     `RETURN DISTINCT` collapses the duplicate a KPI produces when matched by
     **both** the flat `k.domain_id` disjunct and the `ALIGNED_TO` disjunct (or
     `ALIGNED_TO` two entities under the same `d`). `d.id AS domainId` is the
     per-domain tag the scorer needs to bin each grounded KPI into exactly one of
     the six functions (a KPI attributable to two function domains — rare, only
     if cross-aligned — is scored into each it attributes to; the tag is per
     `(k,d)` row). The `benchmarkProse` is `JSON.parse(metricAttrs).benchmark`
     in TS (displayed evidence only, DD-04). This read is bounded — **one** round
     trip regardless of KPI count.
   - **latest measurement** — the batched `LATEST_MEASUREMENT_CYPHER`
     (`performance.ts:170`) over the collected grounded-KPI id set:
     `MATCH (m:KPIMeasurement) WHERE m.kpi_id IN $ids …` (one round trip; the
     governed Neo4j `:KPIMeasurement` source, **not** Postgres).
   - **activity→KPI coverage** (`coveredByKpi`, FR-04): an activity is covered
     when a KPI **attributed to that activity's function** (DD-13) is `ALIGNED_TO`
     the activity **or** its parent `UserJourney` (`(a)-[:PART_OF]->(:UserJourney)`,
     **1 hop** — an `Activity` is `PART_OF` a `UserJourney`, so the activity→journey
     hop is depth 1; pinned, Resolves: C-04). The coverage axis uses the **same
     single attribution edge-set as FR-02** — `{domain_id, ALIGNED_TO}`, DD-13 —
     but counts **all** attributed KPIs, not only metric-grounded ones: coverage
     (FR-04) measures modeling completeness, a distinct axis from metric grounding
     (FR-02). Concretely, one batched read per report:
     ```cypher
     MATCH (d:Domain) WHERE d.id IN $domainIds
     OPTIONAL MATCH (d)<-[:PART_OF*1..]-(a:Activity) WHERE a.id IN $scopedIds
     OPTIONAL MATCH (k:KPI) WHERE k.archived_at IS NULL AND (
       k.domain_id = d.id
       OR EXISTS { MATCH (k)-[:ALIGNED_TO]->(t)
                   WHERE t.id = d.id OR (t)-[:PART_OF*1..2]->(:Domain {id: d.id}) }
     ) AND EXISTS {
       MATCH (k)-[:ALIGNED_TO]->(x)
       WHERE x.id = a.id OR (a)-[:PART_OF]->(x:UserJourney)
     }
     RETURN d.id AS domainId, a.id AS activityId, count(DISTINCT k) > 0 AS coveredByKpi
     ```
     (`coveredByKpi` per activity; the outer disjunct is the DD-13 function
     attribution, the inner `EXISTS` is the activity/journey reach — one round
     trip, per-domain-tagged like the grounded-KPI read.)
5. Assemble `FunctionRead[]`, call `scoreFunctions({functions, augmentationWeights:
   AUGMENTATION_WEIGHT, compositeWeights: DEFAULT_WEIGHTS})`, return the report.

**Read-only invariant (NFR-01, NFR-02):** every session is `READ` mode; no `SET`,
`CREATE`, `MERGE`, `DELETE`. AC-07 asserts a zero `/api/v1/stats` diff pre/post.

### 4.4 Route handler + dispatch (`api/src/routes/analytics-benchmarks.ts`, FR-07)

```ts
export async function handleBenchmarkReport(_req: Request): Promise<Response> {
  const report = await computeBenchmarkReport(getDriver());
  return ok(benchmarkReportSchema.parse(report)); // zod-validated at the boundary
}
```

Dispatch is registered in `api/src/router.ts` in the analytics block, **before**
the `analytics/([^/]+)` catch-all at line 934 (DD-09):

```ts
if (sub === "analytics/benchmarks/report" && method === "GET")
  return handleBenchmarkReport(req);
```

Auth stays in the central gate — no per-route check (house rule, FR-09).

### 4.5 Route-permission mapping (FR-09, DD-11)

Add one line to `ROUTE_PERMISSIONS` in `api/src/auth/rbac-permissions.ts`,
joining the `analytics:read` family:

```ts
P("GET", "analytics/benchmarks/report", "analytics:read"),
```

No new permission string; the route is not `public`. A session without
`analytics:read` → `403`, with it → `200` (AC-08).

### 4.6 OpenAPI (FR-08)

A new `api/src/routes/openapi-benchmarks.ts` exporting
`registerBenchmarkPaths(registry)` (mirroring `openapi-performance.ts`), wired
into `getOpenApiDoc()` in `openapi.ts` at the **registration call site**
alongside the `registerPerformancePaths(registry)` **call** at `openapi.ts:1045`
(**not** the line-108 `import` — Resolves: N-01). It registers the `benchmarkReportSchema`
component and the
`GET /api/v1/analytics/benchmarks/report` path with its `200` response. **No
`ERROR_CODES` change** (DD-10). AC-08's OpenAPI test asserts the path + response
schema are present.

### 4.7 PWA — `BenchmarkReport` view (FR-10, FR-11, FR-12)

`pwa/src/views/business/BenchmarkReport.tsx` (+ `BenchmarkReport.module.css`),
built on the `FunctionMap.tsx` precedent:

- Consumes `useActiveModel()` for header context; defaults to the SaaS-Operator
  root (the report itself is root-fixed server-side, FR-07).
- Fetches via a **new `api.*` method** (§4.8) — never the private `json<T>`.
- **States (UX-01, all from `_shared`):**
  - **loading** — `<Loading what="benchmark report" />` while the fetch is in
    flight (AC-11).
  - **empty** — `functionCount:0` (root present but unseeded **or** the no-root
    empty-`200`, DD-10 — one state covers both): `<EmptyState>` + a prompt to run
    `bun run seed:saas-operator` (AC-12). No truncation banner (N-03).
  - **error** — `<ErrorState message onRetry={refetch} />` (AC-13).
  - **ready** — six function cards, each showing `composite`, the three
    sub-scores (`metricBenchmark`/`coverage`/`automation`) with applicability
    flags, and a keyboard-activatable drill-down (`<button aria-expanded>`)
    revealing evidence: per-KPI verdict rows (with `benchmarkProse` shown as
    context), coverage ratios + flags, per-`systemKind` augmentation counts
    (AC-10, AC-15). KPI/activity rows deep-link into Explorer via native anchors
    (`toHash({surface:"explorer", …})`, FR-12).
- **Descriptive-only (XD-11):** scores + evidence, **no** recommendation UI.
- **Tokens-only + catalog-first (UX-02, NFR-07):** `ViewRegion`/`ViewHeader` +
  `Card`/`DataTable` from the catalog; all colors/spacing via `var(--…)`;
  `scripts/design-conformance.ts` passes on the view + CSS module (AC-14).
- **The single `views/index.tsx` edit (XD-05/NFR-03):** replace the
  `BusinessTabPlaceholder` on the `benchmarks:` key in the `business` `VIEWS`
  map with `(r) => <BenchmarkReport route={r} />`. No `route.ts`/`SURFACES` edit.

### 4.8 PWA api client (FR-10)

Add one method to `pwa/src/api.ts` (`analytics`/`business` grouping — design
picks a group consistent with the file, e.g. alongside `performance`):

```ts
benchmarkReport: (signal?: AbortSignal) =>
  json<BenchmarkReport>("/api/v1/analytics/benchmarks/report", withSignal(signal)),
```

`BenchmarkReport` type is imported from `@companygraph/shared/schema/function-benchmark`.

---

## 5. HTTP API surface

| Method | Path | Auth | Request | Response | Notes |
|--------|------|------|---------|----------|-------|
| GET | `/api/v1/analytics/benchmarks/report` | `analytics:read` | none (no params, root-fixed) | `200 benchmarkReportSchema` | two-segment (DD-09); empty-`200` when no root (DD-10); read-only; in `openapi.json` |

Errors ride the standard `{error:{code,message,details?}}` envelope (existing
`400`/`401`/`403` only — no new code, FR-08).

---

## 6. Traceability

### 6.1 FR → design element

| FR | Design element |
|----|----------------|
| FR-01 | §4.3 model-scoped read + operator-root resolve + `scopedNodeIds`; attribution = `{domain_id, ALIGNED_TO}`, verbatim from `cross-function-exec-rollup` DD-05 (DD-02, DD-03, DD-13; B-01/B-02 resolved) |
| FR-02 | §4.2 metricBenchmark math (DD-04); §3.2 `metricBenchmarkScoreSchema` |
| FR-03 | §4.1 `computeKpiVerdict` self-owned module (DD-05) |
| FR-04 | §4.2 coverage math three-ratio + optional marked-key (DD-08, B-03); §3.2 `coverageScoreSchema` |
| FR-05 | §4.2 automation math + `AUGMENTATION_WEIGHT` (DD-06, Risk 8); §3.2 `automationScoreSchema` |
| FR-06 | §4.2 composite weighted mean over applicable sub-scores (DD-07, DD-08) |
| FR-07 | §4.4 route + dispatch (DD-09); §4.3 empty-`200` (DD-10) |
| FR-08 | §4.6 OpenAPI, no `ERROR_CODES` change |
| FR-09 | §4.5 `ROUTE_PERMISSIONS` `analytics:read` (DD-11) |
| FR-10 | §4.7 `BenchmarkReport` view + the one `views/index.tsx` line |
| FR-11 | §4.7 four states |
| FR-12 | §4.7 keyboard-reachable drill-down + Explorer deep links |
| NFR-01 | §4.3 READ-mode sessions, `scopedNodeIds` isolation |
| NFR-02 | §3.1 no schema/store/persisted score |
| NFR-03 | §1.2 + §4.7 PWA single-owner; API router edit permitted |
| NFR-04 | §4.2 deterministic + applicability + no recommendation field |
| NFR-05 | §1.2 ownership boundary (no owned-elsewhere edit) |
| NFR-06/07 | §3.2 zod-only, en-US; §4.7 tokens-only + design-conformance |

### 6.2 AC → task (forward reference to tasks.md)

| AC | Closed by |
|----|-----------|
| AC-01, AC-06 | T-05 (report shape + rank), T-06 (route) |
| AC-02 | T-03 (metricBenchmark) |
| AC-03 | T-02 (verdict module) |
| AC-04 | T-03 (coverage) |
| AC-05 | T-03 (automation) |
| AC-07 | T-04/T-06 (read-only invariant) |
| AC-08 | T-06 (route), T-07 (RBAC), T-08 (OpenAPI) |
| AC-09 | all (transpile + git-diff guard) |
| AC-10..AC-13 | T-09 (view), T-10 (states) |
| AC-14 | T-09 (design-conformance) |
| AC-15, AC-16 | T-09/T-11 (a11y + reload) |

---

## 7. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `shared/src/schema/function-benchmark.ts` | new | FR-02,04,05,06,07,08 | wire + read-shape schemas (§3.2, §3.3) |
| `api/src/derive/function-benchmark-score.ts` | new | FR-02,03,04,05,06 | pure scorer + `computeKpiVerdict` (§4.1, §4.2, DD-01) |
| `api/src/storage/function-benchmark.ts` | new | FR-01, NFR-01 | model-scoped read + orchestrator (§4.3) |
| `api/src/routes/analytics-benchmarks.ts` | new | FR-07, FR-08 | route handler (§4.4) |
| `api/src/router.ts` | modify | FR-07 | one dispatch line before `router.ts:934` (§4.4, XD-05 permits API router) |
| `api/src/auth/rbac-permissions.ts` | modify | FR-09 | one `analytics:read` mapping line (§4.5) |
| `api/src/routes/openapi-benchmarks.ts` | new | FR-08 | `registerBenchmarkPaths` (§4.6) |
| `api/src/routes/openapi.ts` | modify | FR-08 | wire `registerBenchmarkPaths` (like `registerPerformancePaths`) |
| `pwa/src/views/business/BenchmarkReport.tsx` | new | FR-10,11,12 | the view (§4.7) |
| `pwa/src/views/business/BenchmarkReport.module.css` | new | FR-10, NFR-07 | tokens-only CSS module |
| `pwa/src/views/index.tsx` | modify | FR-10 | ONLY the `benchmarks:` line (XD-05/NFR-03) |
| `pwa/src/api.ts` | modify | FR-10 | one `benchmarkReport` method (§4.8) |

**New: 7 · Modify: 5.** No compile-time schema arrays; no `pwa/src/route.ts` /
`SURFACES`; no KPI/metric/risk/SLA/`performance.ts`/`key-activities` write-path
edit (NFR-05).

---

## 8. Test strategy

| Test | Kind | Covers |
|------|------|--------|
| `api/__tests__/function-benchmark-verdict.test.ts` | unit (Neo4j-free) | AC-03 — `computeKpiVerdict` band parity + no `performance` import |
| `api/__tests__/function-benchmark-score.test.ts` | unit (Neo4j-free) | pure `scoreFunctions` — sub-score math, applicability/exclusion, rank, no recommendation field |
| `api/__tests__/function-benchmark-report.integration.test.ts` | integration | AC-01, AC-06 — six-function report, meta, rank, discovered modelId |
| `api/__tests__/function-benchmark-metric.integration.test.ts` | integration | AC-02 — metricBenchmark, prose-as-evidence, no_data exclusion, metricGrounded:false |
| `api/__tests__/function-benchmark-coverage.integration.test.ts` | integration | AC-04 — three ratios, keyMarked applicability, unmodeled, read-only mark |
| `api/__tests__/function-benchmark-automation.integration.test.ts` | integration | AC-05 — augmentation weights, no-system=0, all-functional degeneracy |
| `api/__tests__/function-benchmark-readonly.integration.test.ts` | integration | AC-07 — zero `/stats` diff, no keyActivity write |
| `api/__tests__/function-benchmark-authz.integration.test.ts` | integration | AC-08 — 403/200, determinism, isolation, empty-200 no-root |
| `api/__tests__/function-benchmark-openapi.integration.test.ts` | integration | AC-08 — path + response schema in `openapi.json` |
| `pwa/src/__tests__/benchmark-report.test.tsx` | component | AC-10 — ready state, no recommendation UI |
| `pwa/src/__tests__/benchmark-report-states.test.tsx` | component | AC-11/12/13 — loading/empty/error |
| `pwa/playwright/business-benchmarks-reload.spec.ts` | e2e | AC-16 — deep-link survives reload |
| `bun run typecheck` + `git diff --stat` | CLI | AC-09 — transpile + schema/route-file guard |
| `scripts/design-conformance.ts` | CLI | AC-14 — tokens/catalog conformance |
| manual (AC-15) | keyboard | drill-down `aria-expanded` + deep-link nav |

---

## 9. Rejected alternatives

- **Numeric metric-vs-benchmark comparison (OQ-1 (c))** — needs a structured
  `benchmark` field on `MetricDefinition`, owned by `saas-metric-library`. Out of
  this spec's ownership; the non-default long-term move (Risk 1). Rejected for v1.
- **Shared verdict helper (OQ-2 alt)** — DRY but edits `performance.ts` (owned
  elsewhere, XD-08). Rejected; re-implement in-boundary (DD-05).
- **Flat route `analytics/benchmarks`** — shadowed by the `analytics/([^/]+)`
  catch-all (`router.ts:934`). Rejected for the two-segment path (DD-09).
- **`404` on no root** — rejected for empty-`200` (DD-10); avoids an
  `ERROR_CODES` addition and matches the foundation-is-a-hard-dependency model.
- **Precompute/cache + tunable weights** — rejected; live compute at six-function
  scale, code-default constants (DD-07, DD-12; `key-activity-optimizer` precedent).
- **Marked-key as a mandatory fourth ratio** — rejected; the operator seed marks
  nothing, so it is an applicability-flagged bonus, not a scored miss (DD-08, B-03).
- **`PARAM_BINDS` in the attribution traversal** (draft) — rejected (B-01): neither
  `performance.ts` `DOMAIN_FILTER` nor the sibling `cross-function-exec-rollup`
  DD-05 uses it; it is a KPI-parameter→attribute-source binding
  (`kpi-param-bindings.ts`), not a domain-ownership edge, and would scope KPIs to
  functions the cockpit would not — breaking the Risk-9 identical-attribution
  invariant. Attribution is `{domain_id, ALIGNED_TO}` only (DD-13).
- **APOC `apoc.convert.fromJsonMap` for `systemKind`** (draft variant) — rejected
  (C-05); collect raw `s.attributes_json` and parse in TS, matching
  `deserializeModel`/`key-activity-score.ts` and avoiding a hot-path APOC
  dependency (§4.3).

---

## Open Questions (for the orchestrator to surface)

1. **OQ-1 (b) vs (c)** — the design adopts **(b)**: metricBenchmark = share of
   metric-grounded KPIs on-target vs the KPI's own target, with the prose
   `benchmark` shown as evidence (self-contained, no owned-elsewhere edit).
   **(c)** — a true numeric metric-vs-benchmark comparison — needs a structured
   benchmark field on `MetricDefinition` (a `saas-metric-library` change). Confirm
   (b) for v1, or commit to (c) as a follow-up.
2. **OQ-2 re-implement vs shared helper** — the design **re-implements** the KPI
   verdict in its own module (DD-05, no `performance.ts` edit). If the user wants
   DRY, extracting a shared verdict helper is a bounded follow-up **owned by the
   KPI dashboard spec** (it edits `performance.ts`). Confirm re-implement.
3. **OQ-3 augmentation weights** — proposed table `{ functional: 0.34, agentic:
   0.67, ai_predictive: 1.0 }` (DD-06). Confirm the exact values (ordering is
   fixed: `ai_predictive ≥ agentic ≥ functional`).
