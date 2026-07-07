---
feature: "cross-function-exec-rollup"
created: "2026-07-06"
author: "spec-author"
status: "revised"
size: "large"
---

<!-- Revision 1 (2026-07-06): addresses every finding in review-design.md
     (design review pass 1 of at most 2). Blockers B-01 (unattributed SLA read
     path) and B-02 (latestBreachAt source vs AC-04a round-trip invariant) are
     resolved in DD-10/DD-11/§4.5 by switching the SLA primary read from the
     per-function `handleSlaComplianceByDomainGet` to the single operator-root
     `handleSlaComplianceAllGet` enumeration + one batched `max(breach_at)`
     read. Concerns C-01..C-04 and nits N-01..N-03 are resolved inline; each
     change cites the finding it closes ("Resolves: B-01" etc.). No stable ID
     is renumbered. -->


<!-- House format (mirrors kpi-okr-performance-dashboards/design.md and
     funnel-pipeline-modeling/design.md). Design phase of the wave-3 operator
     cockpit. Every DD-* traces the FRs it serves; every file change serves an
     FR; §8 traces each AC to the design element + the task that closes it.
     Per XD-09 single-shot, the requirements' OQ-1..OQ-4 are already CLOSED;
     this design implements the closed defaults and adds no new open questions
     except the one genuine graph gap surfaced by research (OQ-D1, funnel→
     function attribution) which is resolved in-artifact with a recommended
     default, not deferred. -->

# Design: cross-function-exec-rollup

## 1. Overview

`cross-function-exec-rollup` adds a **read-only cross-function aggregation
surface** over the SaaS-Operator `BusinessModel` root: five new `GET
/api/v1/analytics/operator/*` endpoints and one PWA view (`OperatorCockpit` at
`#/insights/operator`). It is the wave-3 consumer of the six wave-2 content slices
plus the wave-1b constructs (`saas-metric-library`, `funnel-pipeline-modeling`)
— it **authors nothing** and **writes nothing** (XD-08, NFR-01).

The design deliberately **mirrors the as-built `kpi-okr-performance-dashboards`
pattern** end-to-end, because that spec already solved the identical problem
class (read-only `GET /api/v1/analytics/*` aggregates, gated by `analytics:read`,
generated into OpenAPI from shared zod, KPI status from the governed
`:KPIMeasurement` source): a route-handler module, a shared zod contract module,
a same-task RBAC entry + router dispatch, and a `registerXPaths` OpenAPI hook.
The four **enumerated additive edits** to owned-elsewhere-adjacent files
(`router.ts`, `rbac-permissions.ts`, `openapi.ts`, `pwa/src/api.ts`) each replay
that spec's precedent verbatim (NFR-05).

**Architecture at a glance:**

```
 PWA  OperatorCockpit.tsx (#/insights/operator)
   │  useActiveModel() → SaaS-Operator root (default) · URL-first ?function= slice
   │  api.operator.overview() ── single landing call (best-effort per signal)
   │  api.operator.{kpis,risks,funnels,slas}() ── on drill-in / slice only
   ▼
 API  GET /api/v1/analytics/operator/overview   → handleOperatorOverview
      GET /api/v1/analytics/operator/kpis        → handleOperatorKpis
      GET /api/v1/analytics/operator/risks       → handleOperatorRisks
      GET /api/v1/analytics/operator/funnels     → handleOperatorFunnels
      GET /api/v1/analytics/operator/slas        → handleOperatorSlas
   │      (all analytics:read, all GET, all under /api/v1/, all read-only)
   ▼
 SOURCES (governed reads only — never edited):
   Neo4j  :BusinessModel(SaaS Operator root) → IN_MODEL :Domain(6 functions)
          :KPI + :KPIMeasurement (studio-arbitrated source, via kpi-trends)
          :SLA + :SLABreach · :Funnel + :Stage(+CONVERTS_TO attrs)
   Postgres  risk_register  (read ONLY via GET /api/v1/risk-register?domain=…)
```

## 2. Design decisions

| ID | Decision | Serves | Rationale / rejected alternatives |
|----|----------|--------|-----------------------------------|
| DD-01 | **Two new source files + one shared contract file.** All handlers live in **`api/src/routes/analytics-operator.ts`** (new); the OpenAPI declarations in **`api/src/routes/openapi-operator.ts`** (new); the request/response zod contracts in **`shared/src/schema/operator.ts`** (new, so runtime validation + OpenAPI generation share one definition, graph-core FR-16 pattern). No handler logic is added to `performance.ts`/`analytics.ts`. | FR-02..FR-09, NFR-05 | Mirrors `performance.ts` + `openapi-performance.ts` + `shared/schema/performance.ts`. Rejected: folding into `analytics.ts` (would grow an owned-elsewhere-adjacent file needlessly). |
| DD-02 | **Function-scope resolver is a shared internal helper** `resolveOperatorFunctions(session, seedKey?)` in `analytics-operator.ts`: one Cypher resolves the SaaS-Operator root by the foundation marker (`name:"SaaS Operator"` + `attributes.saasOperatorRoot:true`, **never a hard-coded id**) and its six `IN_MODEL` `Domain` nodes, returning `{ rootId, functions: [{ seedKey, name, domainId }] }`. A `seedKey` arg filters to one function; unknown/absent → all six. Every aggregate calls it first. | FR-01, FR-02 | Single source of the join key + the operator-root scoping; used by all five endpoints so the grouping is identical everywhere. |
| DD-03 | **`?function=<seedKey>` is a closed zod enum** `operatorFunctionEnum = z.enum(["marketing","sales","finance_accounting","customer_success","product_delivery","platform_ops"])` (the foundation's six `seedKey`s, `saas-operator-foundation` §3.2). Query parsing via the governed `_helpers.parseWith`; a malformed value throws `ValidationError` → the standard `400 {error:{code,message,details}}` envelope; **absent** is legal (→ all six). | FR-01, FR-09, AC-02 | Deviates deliberately from `performance.ts`'s soft `kind` coercion: `function` is a hard-validated enum (the requirements pin a `400` on unknown), unlike `kind`'s coerce-to-all. Rejected: soft-coerce unknown → all (requirements AC-02 wants a `400`). |
| DD-04 | **KPI status is imported, not copied (OQ-1 resolved to reuse).** `computeKpiStatus` **is exported** from `api/src/routes/performance.ts:50` (verified). This feature **imports** it directly — `import { computeKpiStatus } from "./performance"` — so status bands are literally the same code; no copy, no divergence, and `performance.ts` is **read-only-imported, never edited** (an import is not a write). AC-05 still pins parity by a shared-fixture test (belt-and-braces). The requirements' fallback "copy the band contract" branch is therefore **not** taken. | FR-03, NFR-04, AC-05 | OQ-1 closed to import-first; the export exists, so the parity-pinned-copy branch is unused. Rejected: copying the bands (needless duplication now that the export is confirmed present). |
| DD-05 | **KPI-measurement source is Neo4j `:KPIMeasurement` only, via a batched latest-per-kpi read** replayed from `performance.ts`'s `LATEST_MEASUREMENT_CYPHER` (`api/src/routes/performance.ts:170`) verbatim. This module **never imports the Postgres client** (mirrors the `performance.ts` single-store contract). **KPI-scope predicate (Resolves: C-04):** the `ALIGNED_TO` + domain-`PART_OF*1..2` clause mirrors `performance.ts`'s `DOMAIN_FILTER` (`performance.ts:131-136` — the `*1..2` depth bound and `(t)-[:PART_OF*1..2]->(:Domain {id:$domain})` target are **theirs, not invented**). It **deliberately diverges in one respect** — the design **adds** a flat `k.domain_id = d.id` disjunct that `performance.ts:129-130` **explicitly dropped** (its `DOMAIN_FILTER` is `ALIGNED_TO`-only). The cockpit re-adds the flat predicate because CS KPIs set the flat `k.domain_id` (`customer-success-process-model` FR-05) and would otherwise be invisible here; this widens *scope* only, and NFR-04/AC-05 pin parity solely on the *status bands* (via the imported `computeKpiStatus`, DD-04), not on scope, so the divergence is contract-safe. A KPI matched by both disjuncts, or `ALIGNED_TO` two entities under the same function domain, must be **de-duplicated** — the query uses `RETURN DISTINCT` (see §4.2). | FR-03, FR-04, NFR-03, AC-04 | Studio XD-02 (amended) arbitration; the measurement source is identical to the performance dashboard's so the two never disagree on status; the scope predicate is a documented, band-neutral superset (adds the flat CS `domain_id` the perf slice drops). |
| DD-06 | **Risk heatmap is derived client-of-the-governed-route via an explicit `Request`/`Response`/`.json()` invocation contract (Resolves: C-01):** `handleRiskRegisterList` returns a `Response` — `ok({ data: risks })` (`risk-register.ts:110`), **not** a row array — so the operator handler constructs `new Request("http://internal/api/v1/risk-register?domain=<functionName>")`, `await`s the handler, `await res.json()`, and reads `.data` to get the row list (contract spelled out in §4.3). It derives the `(likelihood,impact)` grid + per-severity-band counts **in-memory** from those rows. It does **not** import the pg client (XD-04/NFR-01 forbid it) nor an un-exported query helper, and does **not** use `risk-register`'s pre-rolled `aggregation/domain`/`aggregation/summary` handlers (they return counts by domain/severity **bucket** but **not** the per-cell grid nor the drill-in rows the cockpit needs). No `risk-*` file is edited (the read is invoked, not the module edited). | FR-05, AC-06 | The per-cell 5×5 grid + drill-in rows are exactly what the pre-rolled aggregates omit; deriving from the raw list is the minimal correct read. Naming the `Response`→`.json()`→`.data` convention explicitly stops the implementer reaching for the pg client. Rejected: mixing raw + aggregate reads (double-count risk). |
| DD-07 | **Risk grouping key = the function `Domain` node `name` verbatim** (`"Customer Success"`, `"Finance & Accounting"`, …), resolved from DD-02's `functions[].name`. `risk_register.domain` is free-text (`risk-register.ts:10`), and the six content slices all tag it with the function name verbatim (`customer-success-process-model` FR-11/OQ-2). One `?domain=<name>` read per function is a **constant** number of reads bounded by the six functions, not N-per-risk. | FR-01, FR-05, NFR-03/NFR-04 | The canonical cross-function key the content specs adopted; the cockpit consumes it, never re-invents one. |
| DD-08 | **Funnel status is a single bounded server-side Cypher over the operator root.** One `MATCH (f:Funnel) WHERE f.attributes_json CONTAINS $rootIdNeedle` prefilter (the `modelId` marker `funnel-pipeline-modeling` §3.1/C-06 and every content funnel stamp, e.g. `marketing-process-model` §3.3) + `OPTIONAL MATCH` to stages/transitions, then the linear-chain `overallConversion` is derived in-memory **reusing `funnel-pipeline-modeling` FR-11's exact rule** (product of per-transition `conversionRate`s; `"n/a"` for a zero/one-stage funnel or a branch). Scope is resolved **server-side** from DD-02's `rootId` — it does **not** reuse `FunnelBoard`'s client-only `useActiveModel()` (C-05). | FR-06, AC-07, NFR-03 | Server-side scoping is the only correct path for an API handler; the derivation is copied from the funnel spec's frozen contract so the cockpit and `FunnelBoard` never diverge on overall conversion. |
| DD-09 | **Funnel→function attribution is a best-effort marker with an `unattributed` bucket + a defined slice-fallback (OQ-D1 + Resolves: C-02).** Research finding: content funnels carry `attributes.modelId` (operator root) but **no** `Funnel→function-Domain` edge or `functionSeedKey` marker (`marketing-process-model` §3.3 stamps only `modelId`). So `?function=` funnel slicing has no graph key today. **Decision:** the handler reads an **optional** `attributes.functionSeedKey` marker on each `Funnel` when present (the recommended convention content specs should stamp); a funnel with a matching `functionSeedKey` is attributed to that function, and a funnel with **no** resolvable `functionSeedKey` is grouped under an **`unattributed`** bucket (surfaced, never dropped/crashed) — the exact same pattern as the SLA `unattributed` bucket (OQ-2). **Slice fallback (Resolves: C-02):** because research confirmed **no** funnel stamps `functionSeedKey` today (OQ-D1), a `?function=<seedKey>` slice would otherwise return an **empty** `functions[].funnels` while every real operator funnel sits in the suppressed `unattributed` bucket — a worse UX than showing them. So the slice **degrades to the operator-root `modelId` scope when the graph has zero `functionSeedKey`-marked funnels for that root**: it returns **all** operator-root funnels under the sliced function (marker-agnostic), and the `unattributed` key is present but `[]`. Once content specs stamp `functionSeedKey`, the slice tightens to marked funnels only (no degrade) and unmarked funnels are suppressed under a slice as before. In the **all-functions** view, marked funnels group by function and unmarked funnels always surface in `unattributed`. This keeps the marketing/sales funnel panels non-empty under a slice today while getting sharper for free as the marker lands. | FR-06, AC-07 | Rejected: (a) requiring a new `Funnel→Domain` `PART_OF` endpoint pair — a registry-endpoint decision content wave-2 owns, out of scope here and needs a schema edit; (b) dropping unmarked funnels — hides authored data; (c) hard-failing — violates the empty/edge-case contract; (d) returning an empty sliced panel today — hides all real funnels (C-02). Recommended follow-up recorded for the content specs (non-blocking). |
| DD-10 | **SLA→function attribution enumerates the whole SLA population once, then two-tier attributes each row (Resolves: B-01, C-02).** The primary read is the governed **`GET /api/v1/sla-compliance/all`** handler (`handleSlaComplianceAllGet`, `sla-compliance.ts:351`) — a **single** governed read that returns **every** non-archived SLA and, critically, its `s.domain_id` per row (`sla-compliance.ts:362,375`), **including SLAs whose `domain_id` is null/absent**. This is the read the earlier per-function `handleSlaComplianceByDomainGet` (`sla-compliance.ts:233`, `MATCH (s:SLA {domain_id:$id})`) **could not provide**: that handler returns only SLAs matching one function's `domain_id`, so a null-`domain_id` SLA is invisible to all six per-function calls and the `unattributed` bucket could never be populated — the B-01 gap. Attribution then runs **in-memory over the enumerated rows**: (tier 1, primary) an SLA whose `domain_id` equals a function domain id (from §4.1) is attributed to that function — CS SLAs set `domain_id` = the CS domain id (`customer-success-process-model` FR-09), so they attribute with **no** traversal; (tier 2, fallback) an SLA with **no** resolvable `domain_id` is matched to a function via one supplementary batched `ALIGNED_TO` traversal (§4.5) — the `kpi-sla-alignment` edge (`customer-success-process-model` FR-10, a `should`); (tier 3) an SLA resolvable by **neither** lands in the **`unattributed`** bucket (OQ-2), never dropped. No `sla-*` file edited. | FR-07, AC-08 | `sla-compliance/all` is the only governed read that surfaces null-`domain_id` SLAs, so it is the sole read that can make the `unattributed` case testable (AC-08). The `should` alignment edge may be absent at execution, so `domain_id` must be tier 1 (an SLA with a valid `domain_id` must never fall to `unattributed` because a `should` edge was skipped — the AC-08 case). |
| DD-11 | **`health` derivation for SLAs** maps the governed `sla-compliance/all` per-SLA output to `{within_target,at_risk,breached}`: `breached` when the SLA has ≥1 open breach (`breaches.open ≥ 1`, `sla-compliance.ts:412`); `at_risk` when `compliance_rate < compliance_threshold` but no open breach (degraded but recovering); `within_target` otherwise. `breachCount` = `breaches.total`. **`latestBreachAt` is sourced from ONE batched breach read, never N-per-SLA (Resolves: B-02).** The governed domain/all rollups do **not** return a per-breach list or a `latestBreachAt` (`sla-compliance.ts:335-344,420-428` return only `breaches:{total,open}`), so `latestBreachAt` cannot come from them; and issuing one `handleSlaComplianceGet` per SLA would be an N-per-SLA read that violates AC-04a. Instead the `/slas` handler (and only `/slas`, never the overview) issues **one** batched Cypher — `MATCH (b:SLABreach) WHERE b.sla_id IN $slaIds RETURN b.sla_id, max(b.breach_at)` — mirroring the domain rollup's own batched breach fetch (`sla-compliance.ts:280-288`); this is a **single constant read regardless of SLA count**. The overview compose (DD-12) omits `latestBreachAt` entirely (it is a drill-in field). This is a **read-only mapping/projection** over governed fields — it re-derives no breach state. | FR-07, AC-08, AC-04a | The three-band `health` is a display projection of governed fields, not a new SLA computation. One batched `max(breach_at)` read keeps the `/slas` round-trip count constant in SLA count (AC-04a's 1-vs-20-SLA fixture), which a per-SLA `handleSlaComplianceGet` call could not. |
| DD-12 | **The overview compose is best-effort per signal (OQ-3/OQ-4).** `handleOperatorOverview` calls the four per-signal derivations **inside four independent try/catch scopes**; a throw in one populates that function's `kpiHealth`/`riskHeatmap`/`funnelCount`/`slaHealth` field with `{ error: true }` (or `{...counts, error:false}` on success) and the overview still returns `200`. The landing render therefore hits **one** endpoint and each of the four panels can degrade independently (OQ-3) from that single response; per-signal FR-03..FR-07 endpoints exist only for drill-in detail rows (OQ-4, pinned — the design does not reopen this). **Read-count invariant (Resolves: C-03):** the overview's total governed-read count is **bounded by the fixed function count** — KPI (§4.2, ≤2 batched Neo4j reads) + funnel (§4.4, 1 Cypher) + SLA (§4.5, 1 `sla-compliance/all` read + ≤1 batched `ALIGNED_TO` fallback read) + risk (§4.3, ≤6 `Response` round-trips, one per function). "Constant/bounded" in NFR-03/AC-04a means **independent of per-function entity count** (KPI/risk/SLA/funnel *row* count), **not** literally O(1) total: the risk signal is honestly ≤6 (one per function), never N-per-risk. AC-04a's 1-vs-20-row fixture must therefore assert invariance against **entity** count, not against function count. | FR-02, FR-12, AC-15, AC-04a | This is the server-side contract OQ-3's per-panel client degradation depends on; without it, one flaky signal would `500` the whole overview. Stating the invariant against entity count (not O(1) total) keeps the honest ≤6-per-function risk read from being mis-asserted as a bug. |
| DD-13 | **URL-first slice via `route.params.function`** (the same `route.params` hash-parse seam `PerformanceDashboard` uses, `PerformanceDashboard.tsx:80`): `#/insights/operator?function=<seedKey>` drives the whole cockpit; an absent/unknown `function` → all six. Selecting a function rewrites the hash (no full nav) and **refetches the overview** for that slice (not client-filter — the overview is authoritative; the round-trip count is constant regardless). Deep link survives reload (hash router + shell context, UX-06). | FR-11, FR-13, AC-18 | Mirrors the proven `#/exec/performance?domain=…` URL-first pattern verbatim; keeps the slicer shareable + reload-durable. |
| DD-14 | **View registration is the nav orchestrator's single one-line `VIEWS` edit — DEFERRED, tracked** (XD-05/FR-13; nav-IA restructure 2026-07-07): the `operator` key under `pwa/src/views/index.tsx`'s **`insights`** surface map is wired to `(r) => <OperatorCockpit route={r} />`, plus the one import line — by the **nav orchestrator**, not this spec. **`route.ts`/`SURFACES`/`views/index.tsx` are untouched by this spec** (sole-owned by the concurrent nav session); the canonical `#/insights/operator` tab is registered there (the former `#/exec/operator` is a redirect alias, `route.ts:204`). This spec's slicer emits the canonical `#/insights/operator?function=…` hash. | FR-13, XD-05, AC-11, AC-12 | The proven `model-workspace-core`/perf-dashboard seam; the one deferred PWA route-adjacent change, owned by the orchestrator. |
| DD-15 | **Four enumerated additive edits, each a same-task pairing** (NFR-05): (1) `router.ts` — five dispatch lines mirroring `router.ts:915-917`; (2) `rbac-permissions.ts` — five `P("GET","analytics/operator/…","analytics:read")` entries mirroring `rbac-permissions.ts:40-42` (**security-critical** — a dispatched route with no entry is reachable with no RBAC check, `router.ts:386-395`); (3) `openapi.ts` — the two-line `registerOperatorPaths` import + call, mirroring `openapi.ts:108,141`; (4) `pwa/src/api.ts` — a typed `operator` client block mirroring the `performance` block (`api.ts:297`). No new permission **string**, no `ERROR_CODES` addition, no `/api/v2/`. | FR-08, FR-09, NFR-05, AC-09/AC-09a/AC-10/AC-11 | Each edit is the minimum the router gate + OpenAPI generator + client seam require, and each replays a documented precedent so the `git diff` gate (AC-11) confines the change set. |

## 3. Data contracts (`shared/src/schema/operator.ts`, new — DD-01)

All request/response shapes are zod, shared by the runtime handlers and the
OpenAPI generator (graph-core FR-16). snake_case governed field names are kept
as-built (NFR-04). New composite fields the cockpit computes are camelCase
(matching `funnel-pipeline-modeling`'s `overallConversion`/`stageCount`).

### 3.1 Slice + shared enums

```ts
export const operatorFunctionEnum = z.enum([
  "marketing", "sales", "finance_accounting",
  "customer_success", "product_delivery", "platform_ops",
]); // DD-03 — the foundation's six seedKeys (saas-operator-foundation §3.2)
export type OperatorFunction = z.infer<typeof operatorFunctionEnum>;

export const operatorSliceQuerySchema = z.object({
  function: operatorFunctionEnum.optional(), // absent → all six (FR-01)
});
```

### 3.2 Per-signal rows (drill-in, FR-03..FR-07)

```ts
// KPI health (FR-03) — reuses the performance KpiStatus enum literals.
export const operatorKpiStatusEnum = z.enum(["on_target","warning","breach","no_data"]);
export const operatorKpiRowSchema = z.object({
  kpi_id: z.string(), name: z.string(), unit: z.string().nullable(),
  target_value: z.number().nullable(), target_direction: z.string().nullable(),
  latest_value: z.number().nullable(), latest_measured_at: z.string().nullable(),
  status: operatorKpiStatusEnum,
});
export const operatorKpiTallySchema = z.object({
  on_target: z.number().int(), warning: z.number().int(),
  breach: z.number().int(), no_data: z.number().int(),
});

// Risk heatmap (FR-05) — 5×5 (likelihood,impact) grid + severity bands.
export const operatorRiskCellSchema = z.object({
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  count: z.number().int(),
});
export const operatorRiskRowSchema = z.object({
  id: z.string(), name: z.string(),
  likelihood: z.number().int().min(1).max(5), impact: z.number().int().min(1).max(5),
  status: z.enum(["open","mitigating","accepted","resolved"]),
  trend: z.enum(["up","flat","down"]),
  risk_type: z.string().nullable(), // createRiskSchema enum, kept as string
});
export const operatorRiskHeatmapSchema = z.object({
  cells: z.array(operatorRiskCellSchema),          // sparse — only non-zero cells
  bySeverityBand: z.object({                        // likelihood×impact buckets
    low: z.number().int(), medium: z.number().int(),
    high: z.number().int(), critical: z.number().int(),
  }),
  rows: z.array(operatorRiskRowSchema),             // drill-in
});

// Funnel status (FR-06) — overallConversion "n/a" | number literal-or-string.
export const operatorFunnelRowSchema = z.object({
  funnel_id: z.string(), name: z.string(),
  stageCount: z.number().int(),
  overallConversion: z.union([z.number(), z.literal("n/a")]),
});

// SLA rollup (FR-07) — health from the governed compliance read.
export const operatorSlaHealthEnum = z.enum(["within_target","at_risk","breached"]);
export const operatorSlaRowSchema = z.object({
  sla_id: z.string(), name: z.string(),
  compliance_threshold: z.number().nullable(), target_value: z.number().nullable(),
  target_unit: z.string().nullable(),
  breachCount: z.number().int(), latestBreachAt: z.string().nullable(),
  health: operatorSlaHealthEnum,
});
```

### 3.3 Per-signal responses (FR-03..FR-07) + overview envelope (FR-02)

```ts
// Each per-signal response is keyed by function seedKey (or "unattributed"
// for funnels/slas that resolve to no function — DD-09/DD-10).
export const operatorKpisResponseSchema = z.object({
  saasOperatorRoot: z.string(),
  functions: z.array(z.object({
    function: operatorFunctionEnum, name: z.string(),
    kpis: z.array(operatorKpiRowSchema), tally: operatorKpiTallySchema,
  })),
});
export const operatorRisksResponseSchema = z.object({
  saasOperatorRoot: z.string(),
  functions: z.array(z.object({
    function: operatorFunctionEnum, name: z.string(),
    heatmap: operatorRiskHeatmapSchema,
  })),
});
export const operatorFunnelsResponseSchema = z.object({
  saasOperatorRoot: z.string(),
  functions: z.array(z.object({
    function: operatorFunctionEnum, name: z.string(),
    funnels: z.array(operatorFunnelRowSchema),
  })),
  unattributed: z.array(operatorFunnelRowSchema), // DD-09
});
export const operatorSlasResponseSchema = z.object({
  saasOperatorRoot: z.string(),
  functions: z.array(z.object({
    function: operatorFunctionEnum, name: z.string(),
    slas: z.array(operatorSlaRowSchema),
  })),
  unattributed: z.array(operatorSlaRowSchema),    // DD-10
});

// Overview (FR-02) — per-function summary; each signal field carries an
// { error:true } shape on per-signal failure (best-effort compose, DD-12).
const signalErr = z.object({ error: z.literal(true) });
export const operatorOverviewRowSchema = z.object({
  function: operatorFunctionEnum, name: z.string(),
  kpiHealth: z.union([operatorKpiTallySchema, signalErr]),
  riskHeatmap: z.union([
    z.object({ low: z.number().int(), medium: z.number().int(),
               high: z.number().int(), critical: z.number().int() }),
    signalErr,
  ]),
  funnelCount: z.union([z.number().int(), signalErr]),
  slaHealth: z.union([
    z.object({ within_target: z.number().int(), at_risk: z.number().int(),
               breached: z.number().int() }),
    signalErr,
  ]),
});
export const operatorOverviewResponseSchema = z.object({
  saasOperatorRoot: z.string(),
  functions: z.array(operatorOverviewRowSchema),
});
```

Severity bands (DD-06) use the `likelihood × impact` score `risk-register.ts:107`
already orders by: `1–4 low · 5–9 medium · 10–14 high · 15–25 critical` (the
standard 5×5 risk-matrix banding; documented once here so the cockpit and any
future benchmark score agree).

## 4. Handler design (`api/src/routes/analytics-operator.ts`, new — DD-01)

All five handlers are `async (req: Request) => Promise<Response>`, open one Neo4j
`READ` session, call `resolveOperatorFunctions` first, and return via the
governed `ok(...)`/`error(...)` helpers. None imports the Postgres client
(DD-05); the risk read reaches Postgres **only** by invoking the governed
risk-register **route handler** (§4.3), never the pg client directly.

### 4.1 Function-scope resolver (DD-02, FR-01) — shared by all five

```cypher
MATCH (m:BusinessModel {name: "SaaS Operator"})
WHERE m.saasOperatorRoot = true                       // foundation marker, FR-01
OPTIONAL MATCH (d:Domain)-[:IN_MODEL]->(m)
WHERE d.seedKey IN $seedKeys                            // $seedKeys = the 6 (or 1)
RETURN m.id AS rootId,
       collect({ seedKey: d.seedKey, name: d.name, domainId: d.id }) AS functions
```

`resolveOperatorFunctions(session, seedKey?)` returns `{ rootId, functions }`;
with a `seedKey` it passes `$seedKeys:[seedKey]`, else all six. A function domain
that exists but has no content still returns a row (its downstream signals are
empty, never an error — FR-01). If the root is not found, `rootId` is `null` and
every aggregate returns an **empty** `functions:[]` with the null root surfaced
(drives the view's empty state, AC-14). One round trip, shared across signals.

> Note on `saasOperatorRoot`/`seedKey` storage: the foundation stores
> `saasOperatorRoot`/`seedKey` as **top-level node properties** (not inside
> `attributes_json`), per `saas-operator-foundation` §3.1/§3.2 (top-level
> `operatorSeedKey`/marker so they are directly MATCH-able). The resolver
> therefore MATCHes them as top-level props, not via `apoc.convert.fromJsonMap`.
> **N-03 hard gate:** a resolver that MATCHes the wrong property name silently
> returns an empty root → the whole cockpit renders empty, indistinguishable from
> "unseeded". So confirming the exact `saasOperatorRoot`/`seedKey` property names
> against the foundation's as-built seed is a **T-02 Definition-of-Done item**
> (not merely a validation checkpoint): T-02 is not done until an integration
> test seeds the foundation root and asserts `resolveOperatorFunctions` returns a
> non-null `rootId` and the six function rows. Because `saas-operator-foundation`
> is a not-yet-landed dependency, this cannot be verified at design time — the
> gate carries the risk forward to execution.

### 4.2 KPI health (`handleOperatorKpis`, FR-03/FR-04) — DD-04/DD-05

Per function domain id (from §4.1), Read 1 selects the function's KPIs reusing
the `performance.ts` scope predicate — a KPI is in scope when it is `ALIGNED_TO`
the function domain (or an entity `PART_OF` it) **or** carries the flat
`k.domain_id = $domainId` (CS FR-05). Read 2 is the **batched** latest
`:KPIMeasurement` over the union of all sliced KPI ids (the `performance.ts:170`
`LATEST_MEASUREMENT_CYPHER` verbatim — **≤ 2 Neo4j round trips total regardless
of KPI count**, NFR-03/AC-04). Status per KPI = `computeKpiStatus(kpi, latest)`
(imported, DD-04). Per-function `tally` counts the four statuses. Zero Postgres
round trips (AC-04).

Read 1 (batched across all sliced function domains in one query so the round-trip
count is constant in function/KPI count):

```cypher
MATCH (k:KPI) WHERE k.archived_at IS NULL
MATCH (d:Domain) WHERE d.id IN $domainIds
WITH k, d
WHERE k.domain_id = d.id
   OR EXISTS { MATCH (k)-[:ALIGNED_TO]->(t)
               WHERE t.id = d.id OR (t)-[:PART_OF*1..2]->(:Domain {id: d.id}) }
RETURN DISTINCT d.id AS domainId, k.id AS kpi_id, k.name AS name, k.unit AS unit,
       k.target_value AS target_value, k.target_direction AS target_direction,
       k.warning_threshold AS warning_threshold, k.critical_threshold AS critical_threshold
```

`RETURN DISTINCT` (C-04) collapses the duplicate rows a KPI produces when it is
matched by **both** the flat `k.domain_id = d.id` disjunct and the `ALIGNED_TO`
disjunct, or when it is `ALIGNED_TO` two entities that both resolve to the same
`d`. The `PART_OF*1..2` target is pinned to `(:Domain {id: d.id})` to match
`performance.ts:135` exactly (a bare `(d)` target would also traverse into
non-Domain ancestors). The flat `k.domain_id = d.id` disjunct is the deliberate
CS-KPI superset over the `ALIGNED_TO`-only `performance.ts` `DOMAIN_FILTER`
(DD-05) — a scope widening, band-neutral under NFR-04/AC-05.

### 4.3 Risk heatmap (`handleOperatorRisks`, FR-05) — DD-06/DD-07

**Reuse comparison (C-01), stated per field:** `risk-register.ts` exposes three
governed reads — raw `?domain=` list (`:44`), `aggregation/domain` (`:291`),
`aggregation/summary`. Per rollup field the cockpit needs:

| Cockpit field | Source used | Why not the pre-rolled aggregate |
|---------------|-------------|----------------------------------|
| per-cell `(likelihood,impact)` grid | **raw `?domain=` list** (derived in-memory) | `aggregation/*` return counts by domain/severity bucket, **not** the 5×5 cell grid |
| `bySeverityBand` counts | **derived from the same raw list** | avoids double-counting by mixing raw + aggregate (C-01) |
| drill-in `rows` | **raw `?domain=` list** | `aggregation/*` return no per-risk rows |

So the primary read is the **raw** governed read, invoked **once per function**
(constant in function count = ≤ 6 reads; each is one Postgres query, batched by
the governed handler, not N-per-risk — NFR-03/AC-04a).

**Invocation contract (Resolves: C-01).** `handleRiskRegisterList` returns a
`Response` — `ok({ data: risks })` (`risk-register.ts:110`), **not** a row array.
Per function the handler therefore:

```ts
const res = await handleRiskRegisterList(
  new Request(`http://internal/api/v1/risk-register?domain=${encodeURIComponent(fn.name)}`));
if (res.status !== 200) { /* per-signal error → feeds DD-12 { error:true } */ }
const { data: rows } = await res.json();   // rows: risk_register list
```

i.e. build a synthetic `Request`, `await` the handler, `await res.json()`, read
`.data`. This is one `ok()` JSON round-trip per function (≤ 6, bounded by the
fixed function count, **not** N-per-risk — satisfies AC-04a). A non-200 is treated
as a per-signal failure (surfaced via DD-12's `{ error:true }`, not a hard 500).
The handler does **not** import the pg client (XD-04/NFR-01) nor an un-exported
query helper, so no `risk-*` file is edited and the governed SQL is reused
verbatim. Only rows with
`status ∈ {open,mitigating,accepted,resolved}` are counted (all four are valid
`createRiskSchema` states; the requirements' "only these four" is the full enum,
so no filtering loss). A zero-risk function yields an all-zero heatmap
(`cells:[]`, all bands `0`, `rows:[]`), never an error.

### 4.4 Funnel status (`handleOperatorFunnels`, FR-06) — DD-08/DD-09

One bounded Cypher over the operator root (from §4.1's `rootId`), constant in
funnel count (AC-04a):

```cypher
MATCH (f:Funnel) WHERE f.attributes_json CONTAINS $rootIdNeedle   // modelId prefilter
OPTIONAL MATCH (f)-[:HAS_STAGE]->(s:Stage)
WITH f, s ORDER BY s.stageOrder
OPTIONAL MATCH (s)-[c:CONVERTS_TO]->(:Stage)
RETURN f.id AS funnel_id, f.name AS name, f.attributes_json AS funnelAttrs,
       collect({ stageId: s.id, transitionAttrs: c.attributes_json }) AS chain
ORDER BY f.name
```

`$rootIdNeedle` is `rootId` (the coarse `CONTAINS` prefilter; the authoritative
`modelId === rootId` check parses each row's `funnelAttrs`, the same
parse-and-filter `funnel-pipeline-modeling` §4.5 does — a retail funnel with no
`modelId`/a different one is excluded). `overallConversion` = product of the
parsed per-transition `conversionRate`s (`funnel-pipeline-modeling` FR-11 rule),
`"n/a"` for a zero/one-stage funnel or a branch (a stage with >1 outgoing
`CONVERTS_TO`). `stageCount` = distinct `stageId` count. **Function attribution
(DD-09):** each funnel's optional parsed `attributes.functionSeedKey` maps it to
a function; unmarked funnels go to `unattributed` in the all-functions view.

**Slice fallback (Resolves: C-02).** Because no funnel stamps `functionSeedKey`
today (OQ-D1), a naive `?function=` slice (funnels whose `functionSeedKey` = the
slice) would return an **empty** panel while all real operator funnels sit in the
suppressed `unattributed` bucket. So the handler counts `functionSeedKey`-marked
funnels for the operator root: **if zero are marked, the slice degrades to the
operator-root `modelId` scope** — it returns **all** operator-root funnels under
the sliced function and sets `unattributed: []`. If ≥1 funnel is marked, the
slice tightens to marked funnels for the requested `functionSeedKey` and unmarked
funnels are suppressed under the slice (they still surface under `unattributed`
in the all-functions view). A function with no funnels → empty list, never an
error. This keeps the sliced funnel panel non-empty today (AC-07 sub-case) and
self-sharpens once content stamps the marker.

### 4.5 SLA rollup (`handleOperatorSlas`, FR-07) — DD-10/DD-11

**Read 1 — enumerate every SLA once (Resolves: B-01).** The handler invokes the
governed **`handleSlaComplianceAllGet`** route handler (`sla-compliance.ts:351`) —
one `Request` to `/api/v1/sla-compliance/all`, `await res.json()`, read the
`slas` array. This is the **only** governed read that returns every non-archived
SLA **with its `s.domain_id`** (`sla-compliance.ts:362,375`), **including
null-`domain_id` SLAs** — precisely the rows the earlier
`handleSlaComplianceByDomainGet` (`MATCH (s:SLA {domain_id:$id})`,
`sla-compliance.ts:248`) can never surface, which is why the `unattributed`
bucket had no read path (B-01). Each row carries
`{id,name,compliance_threshold,target_value,target_unit,domain_id,compliance_rate,
risk_score,breaches:{total,open}}` — everything DD-11's `health` band and
`breachCount` need. This is **one** governed read regardless of SLA count
(the governed handler batches its own breach fetch, `sla-compliance.ts:383-389`).

**Attribution (DD-10), in-memory over Read 1's rows:**
- **tier 1 — `domain_id`:** an SLA whose `domain_id` ∈ the §4.1 function domain
  ids is attributed to that function (the AC-08 case: a valid `domain_id` wins
  even if no alignment edge exists — it never falls to `unattributed`).
- **tier 2 — `ALIGNED_TO` fallback:** SLAs with a null/absent `domain_id` (or a
  `domain_id` matching no operator function) are collected and resolved by **one
  batched** supplementary Cypher — `MATCH (s:SLA)-[:ALIGNED_TO]->()-[:PART_OF*0..2]->(d:Domain)
  WHERE s.id IN $unresolvedSlaIds AND d.id IN $functionDomainIds RETURN s.id, d.id`
  — a single read over the leftover id set, not N-per-SLA.
- **tier 3 — `unattributed`:** SLAs resolved by neither land in the
  `unattributed` array (OQ-2), never dropped.

**Read 2 — batched `latestBreachAt`, `/slas` only (Resolves: B-02).** The
governed `all`/`domain` rollups return no per-breach list or `latestBreachAt`
(`sla-compliance.ts:335-344,420-428` expose only `breaches:{total,open}`), and a
per-SLA `handleSlaComplianceGet` call would be N-per-SLA (breaks AC-04a). So the
`/slas` handler issues **one** batched Cypher over the full sliced SLA id set:

```cypher
MATCH (b:SLABreach) WHERE b.sla_id IN $slaIds
RETURN b.sla_id AS sla_id, max(b.breach_at) AS latestBreachAt
```

mirroring the domain rollup's own batched breach fetch (`sla-compliance.ts:280-288`).
`latestBreachAt` is `null` for an SLA with no breach. This is **one constant read
regardless of SLA count** — so `/slas` costs ≤ 1 (Read 1) + ≤ 1 (tier-2 fallback)
+ 1 (Read 2) governed/Neo4j reads total, invariant in SLA count (AC-04a's
1-vs-20-SLA fixture). The **overview** compose (§4.6) **omits Read 2** entirely —
`latestBreachAt` is a drill-in-only field — keeping the overview bounded.

**`health` mapping (DD-11):** `breached` when `breaches.open ≥ 1`; else `at_risk`
when `compliance_rate < compliance_threshold`; else `within_target`.
`breachCount = breaches.total`.

A `?function=<seedKey>` slice filters Read 1's rows to that function post-hoc
(the `all` read is unsliceable, but the row set is small and the filter is
in-memory — still one governed read) and returns `unattributed: []`.

### 4.6 Overview compose (`handleOperatorOverview`, FR-02) — DD-12

Calls §4.2..§4.5's per-function derivations, each wrapped in its own try/catch;
each function row's four signal fields are populated from the successful
derivations and set to `{ error: true }` on a per-signal throw. Returns `200`
with all resolvable signals (best-effort, DD-12). To honour NFR-03, the overview
uses the **summary** projections (tallies/counts) — it does **not** fetch the
per-SLA `latestBreachAt` drill-in detail (that is `/slas`'s Read 2, §4.5), so the
overview's SLA cost is the single `sla-compliance/all` read + ≤1 batched
`ALIGNED_TO` fallback read. The `?function=` slice narrows to one function's row.

**Read-count invariant (Resolves: C-03).** The overview's total read count is
**bounded by the fixed function count, not by per-function entity count**: KPI
≤2 batched Neo4j reads + funnel 1 Cypher + SLA (1 `all` + ≤1 fallback) + risk ≤6
`Response` round-trips (one per function, §4.3). "Constant/bounded" in
NFR-03/AC-04a means **independent of KPI/risk/SLA/funnel row count** — the risk
signal is honestly ≤6, never N-per-risk. AC-04a's 1-vs-20-row fixture must assert
invariance against **entity** count, not function count.

## 5. HTTP API surface

Five **new** GET routes, all under `/api/v1/analytics/operator/`, all
`analytics:read`, all read-only. Router dispatch (DD-15 edit 1), mirroring
`router.ts:915-917`:

```ts
if (sub === "analytics/operator/overview" && method === "GET") return handleOperatorOverview(req);
if (sub === "analytics/operator/kpis"     && method === "GET") return handleOperatorKpis(req);
if (sub === "analytics/operator/risks"    && method === "GET") return handleOperatorRisks(req);
if (sub === "analytics/operator/funnels"  && method === "GET") return handleOperatorFunnels(req);
if (sub === "analytics/operator/slas"     && method === "GET") return handleOperatorSlas(req);
```

RBAC entries (DD-15 edit 2), mirroring `rbac-permissions.ts:40-42`:

```ts
P("GET", "analytics/operator/overview", "analytics:read"),
P("GET", "analytics/operator/kpis",     "analytics:read"),
P("GET", "analytics/operator/risks",    "analytics:read"),
P("GET", "analytics/operator/funnels",  "analytics:read"),
P("GET", "analytics/operator/slas",     "analytics:read"),
```

`analytics/graph` is matched first in the router (`router.ts:910`) so the
`analytics/operator/*` string matches never shadow it. No `public` route; no new
permission string; `analytics:read` reused (AC-09/AC-09a).

## 6. OpenAPI registration (`api/src/routes/openapi-operator.ts`, new — DD-01/FR-09)

`registerOperatorPaths(registry: OpenAPIRegistry)` registers the §3 schemas and
the five paths, mirroring `openapi-performance.ts:22`. The two-line hook in
`openapi.ts` (DD-15 edit 3), mirroring `openapi.ts:108,141`:

```ts
import { registerOperatorPaths } from "./openapi-operator";     // near :108
// … inside getOpenApiDoc():
registerOperatorPaths(registry);                                 // near :141
```

Each path declares the `function` query param from `operatorSliceQuerySchema` and
the `200` response from the matching §3.3 response schema. No `ERROR_CODES`
addition; all under `/api/v1/` (AC-10).

## 7. PWA design (`OperatorCockpit`, FR-10..FR-14)

### 7.1 View component — `pwa/src/views/exec/OperatorCockpit.tsx` (new)

`export function OperatorCockpit({ route }: { route: Route })`, mirroring
`PerformanceDashboard`'s shape. It:

- consumes `useActiveModel()` for header context, defaulting to the SaaS-Operator
  root (same as `FunctionMap`/`PerformanceDashboard`) — never re-implements the
  context (owned by `model-workspace-core`);
- derives the slice from `route.params.function` (DD-13) via a
  `functionFromRoute(route)` helper (mirrors `sliceFromRoute`,
  `PerformanceDashboard.tsx:78`) — validated against the six seedKeys, unknown →
  all six;
- fetches `api.operator.overview(fn?)` on mount + slice change (single landing
  call, DD-12/OQ-4); fetches `api.operator.{kpis,risks,funnels,slas}(fn?)` **only**
  on panel drill-in;
- renders **four panels** in a `ViewRegion` (ARIA landmark, AC-17): KPI health
  (per-function status tally + drill-in KPI rows), risk heatmap (5×5 grid +
  bands + drill-in rows), funnel status (rows with `overallConversion`), SLA
  rollup (rows with `health`/`breachCount`);
- styling **tokens-only** via `var(--…)` from `tokens.css` in a co-located
  `OperatorCockpit.module.css`; catalog components (`ViewRegion`/`ViewHeader`/
  `Loading`/`EmptyState`/`ErrorState`/`SecLabel` from `../_shared`) before
  inventing any (NFR-07/AC-16);
- is **read-only** — no create/edit/write control (XD-08).

### 7.2 View states (FR-12, UX-01) — DD-12

| State | Trigger | Render |
|-------|---------|--------|
| loading (AC-13) | overview fetch in flight | `<Loading what="operator cockpit" />` skeleton |
| empty (AC-14) | root resolves, `functions` all empty (no content) | `<EmptyState>` prompting `bun run seed:saas-operator` + the content seeds |
| error (AC-15) | overview fetch itself fails (network/500) | `<ErrorState onRetry={refetch}/>` |
| ready (AC-12) | overview returns | the four panels |
| **per-panel error** (AC-15) | one signal field is `{error:true}` in the overview row | that **panel** shows an inline `ErrorState` with retry (refetches that signal's `/…` endpoint); the other three render normally (DD-12/OQ-3) |

### 7.3 Slicer + deep links (FR-11/FR-14) — DD-13

**`unattributed` rendering (N-02, freezes OQ-2's display question).** In the
all-functions view, the funnel panel and the SLA panel each render their
`unattributed` array as a **trailing labelled group** ("Unattributed") beneath
the per-function groups — a distinct, visible row group, not a hidden summary
count and not silently merged into a function. Under a `?function=` slice
`unattributed` is `[]` (DD-09/DD-10) so the group is omitted. This keeps
authored-but-unmapped funnels/SLAs visible (the whole point of the bucket) while
signalling they lack a function key.

A single function slicer (segmented control / select, catalog-styled) whose
selection rewrites `#/insights/operator?function=<seedKey>` (hash change, no full
nav; clearing → all six). Every rollup row deep-links into an existing registered
route (invented none): a KPI row → `#/exec/performance` (or the Explorer for that
KPI), a funnel row → `#/insights/funnels`, a function row → `#/insights/functions`
/ the Explorer for that domain. Rows activate their deep-link on Enter
(keyboard-reachable, AC-17); the `?function=` deep link survives reload (UX-06/
AC-18).

### 7.4 Client seam — `pwa/src/api.ts` `operator` block (DD-15 edit 4)

Mirrors the `performance` block (`api.ts:297`), typed from the §3 shared schemas:

```ts
operator: {
  overview: (fn?: OperatorFunction, signal?: AbortSignal) =>
    json<OperatorOverviewResponse>(
      `/api/v1/analytics/operator/overview${fn ? `?function=${fn}` : ""}`, withSignal(signal)),
  kpis:    (fn?: OperatorFunction, signal?: AbortSignal) => json<OperatorKpisResponse>(…),
  risks:   (fn?: OperatorFunction, signal?: AbortSignal) => json<OperatorRisksResponse>(…),
  funnels: (fn?: OperatorFunction, signal?: AbortSignal) => json<OperatorFunnelsResponse>(…),
  slas:    (fn?: OperatorFunction, signal?: AbortSignal) => json<OperatorSlasResponse>(…),
},
```

### 7.5 View registration — `pwa/src/views/index.tsx` (DD-14, one edit)

The `operator` entry in the `exec` surface map is rewired to
`(r) => <OperatorCockpit route={r} />` (+ the import line). `route.ts`/`SURFACES`
untouched (XD-05).

> Note (N-01): requirements FR-13 writes the registration as `() => <OperatorCockpit />`;
> the design tightens it to `(r) => <OperatorCockpit route={r} />` to match the
> as-built `VIEWS` signature (`views/index.tsx:130`,
> `performance: (r) => <PerformanceDashboard route={r} />`) — the `route` prop is
> what carries `route.params.function` for the URL-first slice (DD-13). This is a
> deliberate correction of the requirement, not a contradiction.

## 8. File-change plan → FR / AC traceability

| Path | Action | Serves FR | Closes AC |
|------|--------|-----------|-----------|
| `shared/src/schema/operator.ts` | **new** | FR-02..FR-09 | AC-01, AC-02, AC-03, AC-06, AC-07, AC-08, AC-10 |
| `api/src/routes/analytics-operator.ts` | **new** | FR-01..FR-07 | AC-01, AC-03, AC-04, AC-04a, AC-05, AC-06, AC-07, AC-08 |
| `api/src/routes/openapi-operator.ts` | **new** | FR-09 | AC-10 |
| `api/src/router.ts` | **edit** (5 dispatch lines, DD-15/1) | FR-08 | AC-09, AC-09a, AC-11 |
| `api/src/auth/rbac-permissions.ts` | **edit** (5 `analytics:read` entries, DD-15/2) | FR-08 | AC-09, AC-09a, AC-11 |
| `api/src/routes/openapi.ts` | **edit** (2-line hook, DD-15/3) | FR-09 | AC-10, AC-11 |
| `pwa/src/api.ts` | **edit** (`operator` client block, DD-15/4) | FR-10 | AC-11, AC-12 |
| `pwa/src/views/exec/OperatorCockpit.tsx` | **new** | FR-10, FR-11, FR-12, FR-14 | AC-12, AC-13, AC-14, AC-15, AC-17, AC-18 |
| `pwa/src/views/exec/OperatorCockpit.module.css` | **new** | FR-10 | AC-16 |
| `pwa/src/views/index.tsx` | **edit** (1 `operator` `VIEWS` entry, DD-14) | FR-13 | AC-11, AC-12, AC-18 |
| `api/__tests__/operator-*.test.ts` (+ `.integration.test.ts`) | **new** | (verification) | AC-01..AC-11 |
| `pwa/src/__tests__/operator-cockpit*.test.tsx` | **new** | (verification) | AC-12..AC-15 |
| `pwa/playwright/exec-operator-reload.spec.ts` | **new** | (verification) | AC-18 |

**Untouched (asserted by AC-11 `git diff`):** `api/src/routes/performance.ts`,
`PerformanceDashboard`, `pwa/src/route.ts`, `SURFACES`, `shared/src/schema/{nodes,
edges}.ts`, `api/src/errors.ts`, every `kpi-*`/`sla-*`/`risk-*`/`funnel-*`/
`metric-*` route + storage file.

### 8.1 AC → design-element trace

| AC | Design element |
|----|----------------|
| AC-01 | §4.1 resolver + §4.6 overview compose; all-zero empty function row |
| AC-02 | DD-03 closed `function` enum + `parseWith` 400; absent → all six |
| AC-03 | §4.2 KPI status + per-function tally; `no_data` on missing measurement |
| AC-04 | §4.2 batched ≤2-round-trip `:KPIMeasurement`; no Postgres import (DD-05) |
| AC-04a | §4.3 (≤6 risk `Response` round-trips) + §4.4 (1 funnel Cypher) + §4.5 (1 `sla-compliance/all` + ≤1 batched `ALIGNED_TO` + 1 batched `max(breach_at)` for `/slas`) + §4.6 overview; invariant is per-**entity**-count, not O(1) total (C-03) |
| AC-05 | DD-04 imported `computeKpiStatus`; shared-fixture parity test; no `performance.ts` diff |
| AC-06 | §4.3 raw-read heatmap grouped by verbatim function name (DD-07); no `risk-*` diff |
| AC-07 | §4.4 server-side operator-root funnel scope + FR-11 conversion/`n/a` (DD-08); slice-fallback keeps the sliced panel non-empty today (C-02, DD-09) |
| AC-08 | §4.5 Read 1 = `sla-compliance/all` enumerates null-`domain_id` SLAs (B-01) → tier-1 `domain_id` + tier-2 `ALIGNED_TO` fallback + tier-3 `unattributed` (DD-10); `latestBreachAt` from one batched Read 2 (B-02); no `sla-*` diff |
| AC-09 | §5 RBAC entries → `analytics:read`, no new permission string |
| AC-09a | §5 every route has a `ROUTE_PERMISSIONS` entry → `getRoutePermission` non-null (DD-15/2) |
| AC-10 | §6 OpenAPI module + 2-line hook; no `ERROR_CODES` add; `/api/v1/` only |
| AC-11 | §8 change-set allow-list; the four enumerated edits + new files only |
| AC-12 | §7.1 view renders four panels from overview; §7.5 registration |
| AC-13 | §7.2 loading state |
| AC-14 | §7.2 empty state |
| AC-15 | §7.2 error + per-panel error (DD-12/OQ-3) |
| AC-16 | §7.1 tokens-only + catalog components; `design-conformance.ts` gate |
| AC-17 | §7.3 keyboard-reachable slicer + rows, `ViewRegion` landmark, Enter deep-link |
| AC-18 | DD-13 URL-first slice survives reload |

## 9. Open questions

| # | Question | Resolution |
|---|----------|------------|
| OQ-D1 | **Funnel→function attribution has no graph key today.** Content funnels stamp `attributes.modelId` (operator root) but no `Funnel→function-Domain` edge or `functionSeedKey` marker (`marketing-process-model` §3.3). | **Resolved in-artifact (DD-09):** best-effort `attributes.functionSeedKey` marker + an `unattributed` bucket — correct today (no funnel lost), sharper as content specs adopt the marker. **Recommended non-blocking follow-up:** the content specs (marketing/sales) add `attributes.functionSeedKey` to their `Funnel` nodes; recorded here for the orchestrator to relay, but **not** a build blocker (the cockpit degrades gracefully without it). |

All requirements OQ-1..OQ-4 were CLOSED in `requirements.md` (XD-09 single-shot)
and are implemented here: OQ-1 → import `computeKpiStatus` (DD-04); OQ-2 →
`unattributed` bucket (DD-09/DD-10), rendered as a trailing labelled group
(N-02, §7.3); OQ-3 → per-panel error (DD-12, §7.2); OQ-4 → overview-first single
landing call, per-signal reads on drill-in (DD-12, §7.1).

**Design-review pass 1 disposition (revision 1).** Both blockers are resolved in
the SLA path: **B-01** — the `unattributed` SLA read path now exists (DD-10/§4.5
switch the primary read to `handleSlaComplianceAllGet`, the only governed read
that surfaces null-`domain_id` SLAs); **B-02** — `latestBreachAt` now comes from
one batched `max(breach_at)` Cypher on `/slas` only (never N-per-SLA, never the
overview), reconciled with AC-04a. Concerns resolved: **C-01** risk `Response`/
`.json()`/`.data` invocation contract (DD-06/§4.3); **C-02** funnel slice-fallback
to `modelId` scope when no `functionSeedKey` marker exists (DD-09/§4.4);
**C-03** NFR-03/AC-04a "constant = per-entity-invariant, ≤6-per-function" wording
(DD-12/§4.6); **C-04** cited `performance.ts:131-136` `DOMAIN_FILTER`, owned the
flat-`domain_id` divergence as a band-neutral superset, added `RETURN DISTINCT`
(DD-05/§4.2). Nits resolved: **N-01** FR-13 `()=>`→`(r)=>route` note (§7.5);
**N-02** `unattributed` renders as a trailing labelled group (§7.3); **N-03**
resolver property-name check promoted to a T-02 Definition-of-Done hard gate
(§4.1).
