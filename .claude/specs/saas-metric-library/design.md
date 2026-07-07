---
feature: "saas-metric-library"
created: "2026-07-06"
author: "spec-author"
status: "draft"
reviewing_requirements_revision: 2
size: "large"
---

<!-- The File Changes table (§10) is the permission surface for implementation —
     spec-guard blocks Write/Edit on any source file not listed there (or in
     tasks.md) until this document's frontmatter status is "approved". -->

<!-- OQ-1 (the sole BLOCKING requirements open question) is RESOLVED in this
     design as option (a): the KPI→MetricDefinition edge is registered as the
     distinct SCREAMING_SNAKE name `MEASURES` (not `INSTANTIATES`). Because this
     diverges from XD-06/XD-02's literal `INSTANTIATES` label, a one-line
     **XD-06-erratum** was recorded in `.claude/specs/blueprint-saas-operator.md`
     (as the requirements/review required for option (a)). See §2 and §3.2. -->

# Design: saas-metric-library

## 1. Overview

`saas-metric-library` is **foundation wave 1b** of the SaaS-Operator fan-out
(blueprint `.claude/specs/blueprint-saas-operator.md`), depending on
`saas-operator-foundation` (wave 1a). It delivers the **canonical SaaS/finance
metric catalog** that every operator KPI is grounded in (XD-06). It builds **no
compile-time schema and no new store**; it composes existing, as-built
subsystems:

1. **A `MetricDefinition` runtime ontology-registry node label** — registered
   through `ontology-manager`'s `createNodeLabel`
   (`POST /api/v1/ontology/node-labels`), carrying a `json_schema_doc` that
   declares the metric attribute shape (`formula`, `unit`, `category`,
   `benchmark`). **Never** an entry in `NODE_LABELS`
   (`shared/src/schema/nodes.ts`) — XD-02, NFR-01.
2. **A `MEASURES` runtime edge type** (`KPI → MetricDefinition`) — registered
   through `createEdgeType` (`POST /api/v1/ontology/edge-types`). This resolves
   OQ-1 as option (a): `MEASURES` is a **distinct, unguarded** edge name, so the
   generic `POST /api/v1/edges` route accepts the KPI→metric link (the guarded
   `INSTANTIATES` module-pin edge and its `LIFECYCLE_EDGES` guard are untouched).
   **Never** an entry in `EDGE_TYPES`/`EDGE_ENDPOINTS`
   (`shared/src/schema/edges.ts`) — XD-02, NFR-01.
3. **A canonical metric seed catalog** — a frozen, enumerated roster of
   `MetricDefinition` nodes (§4), each with a **stable seed id**, seeded
   idempotently and retail-isolated, model-independent (like `System`).
4. **Metric-definition REST CRUD** — riding the generic graph-core node routes
   (`/api/v1/nodes/MetricDefinition[/:id]`) + a catalog list read via the
   existing `POST /api/v1/query/cypher`. **Zero** new REST route family, **zero**
   new RBAC permission string.
5. **The `MetricLibrary` PWA view** (`#/insights/metrics`, verbatim from the
   blueprint View Tree) — read-only v1 (OQ-6), replacing the foundation's
   `BusinessTabPlaceholder` on **one line** of `views/index.tsx`. It edits
   neither `route.ts` nor `SURFACES` (sole-owned by `saas-operator-foundation`,
   XD-05).

The design follows four rules:

- **Rule A — compose, never fork.** Every registration rides
  `ontology-manager`'s registry routes; every metric write rides graph-core's
  generic node/edge routes; the seed loads through `POST /api/v1/import`
  (`realImport`). No new storage primitive, no compile-time schema entry, no edit
  to any owned-elsewhere file.
- **Rule B — register before import.** The `MetricDefinition` label + `MEASURES`
  endpoint pair are registry rows, **not** `{nodes,edges}` import rows, so they
  MUST be ensured **before** the metric-node fixture is imported (nodes need the
  label registered first — `realImport` runs a per-row registry attribute check).
  This spec ships a **self-owned** `seed:saas-metric-library` step that ensures
  the registry then imports (OQ-4 → (ii)).
- **Rule C — single route-file owner.** All `route.ts`/`SURFACES`/`views/index.tsx`
  route registration is `saas-operator-foundation`'s (XD-05). This feature edits
  **only** its own view file(s) + its single one-line `VIEWS` entry.
- **Rule D — lifecycle-guard-clean fixture.** The seed fixture carries
  `MetricDefinition` **node rows only** — no `MEASURES` edge rows (KPI→metric
  links are created by content specs via the FR-03 write path, not the fixture),
  and certainly no lifecycle rows.

Rejected at design level (see §12): keeping the literal `INSTANTIATES` name
(OQ-1 b/c — needs an owned-elsewhere guard edit or a bespoke bypass route); a new
`GET /api/v1/metric-definitions` route family (OQ-5 — the generic `query/cypher`
serves the catalog list, matching `FunctionMap`'s proven pattern); an in-view
metric editor (OQ-6 — read-only v1; CRUD proven at the REST layer); a
foundation-owned edit to `seed-saas-operator.ts` for the metric ensure-step
(OQ-4 (i) — couples two specs and edits a file this feature does not own).

## 2. Requirements open questions — resolution in this design

The requirements are approved at rev 2 (`review-requirements.md`, verdict
`approve`) with **one blocking open question (OQ-1)** and five design-time OQs.
This design closes all six. None reopens a settled XD decision beyond the
XD-06-erratum that OQ-1 (a) mandates.

| OQ | Requirements question | Resolution in this design | Section |
|----|----------------------|---------------------------|---------|
| **OQ-1** (BLOCKING) | The `INSTANTIATES` edge name collides with the lifecycle-guarded module-pin edge — pick (a) rename / (b) dedicated bypass route / (c) narrow the guard | **Option (a).** The KPI→MetricDefinition edge is registered as **`MEASURES`** (distinct SCREAMING_SNAKE name, `KPI→MetricDefinition` endpoint pair) via `createEdgeType`. `MEASURES` is **not** in `LIFECYCLE_EDGES`, so the generic `POST /api/v1/edges` route accepts it with **zero** guard edits and **zero** owned-elsewhere edits. The **XD-06-erratum** required for option (a) is recorded in `blueprint-saas-operator.md` (verified free of collision: no `MEASURES` in `shared/src`/`api/src`). | §3.2, §5.2 |
| **OQ-2** | KPI→metric cardinality enforcement — (a) reject second / (b) replace / (c) descriptive | **Option (a): reject the second link.** A KPI links to **at most one** `MetricDefinition`; a second `MEASURES` write from the same KPI is rejected `409 kpi_metric_already_linked` by a small pre-write cardinality guard in this feature's own write path (§5.3). Canonical integrity over silent replacement. | §5.3 |
| **OQ-3** | The `category` closed enum | **Closed six-value enum** `acquisition · revenue · retention · efficiency · financial · reliability`, expressed as a JSON-Schema `enum` inside the registered `json_schema_doc` (§3.1) so the as-built attribute-enforcement path rejects an out-of-enum `category` at the REST boundary. | §3.1, §4 |
| **OQ-4** | Metric-seed placement + ownership | **Option (ii): a self-owned `seed:saas-metric-library` step** (`api/scripts/seed-saas-metric-library.ts`) that (1) ensures the `MetricDefinition` label + `MEASURES` endpoint pair via the ontology registry, then (2) imports the metric-node fixture via `POST /api/v1/import`. It does **not** land the fixture in `shared/seed/saas-operator/` (avoids the register-before-import ordering hazard N-02' — the foundation loader would import it before this feature's registration runs). The fixture lives in a **feature-owned** path `shared/seed/saas-metric-library/metrics.json`. | §5.4, §7 |
| **OQ-5** | Catalog list route | **Reuse `POST /api/v1/query/cypher`** (`query:read`) — matches `FunctionMap`'s proven pattern, adds zero route and zero permission. No `GET /api/v1/metric-definitions` route is created. | §5.5, §6.4 |
| **OQ-6** | PWA create/edit UI scope | **Read-only v1.** `MetricLibrary` browses the seed-authored canonical catalog; CRUD is exercised via REST/curl and proven at the REST layer (AC-10). No in-view editor ships; AC-12..AC-18 cover only the read/browse surface (no editor AC), exactly as the requirements pinned. | §6 |

### 2.1 OQ-1 verification (why option (a) is clean)

Verified against the tree at design time:

- `INSTANTIATES` is in `LIFECYCLE_EDGES` (`api/src/storage/model-lifecycle-guard.ts:28`);
  `assertNotLifecycleEdge` gates `POST /api/v1/edges` (`api/src/routes/edges.ts:14`)
  and the import pre-scan (`api/src/routes/import.ts:184`). Any `INSTANTIATES`
  write via the generic route → `409 model_lifecycle_route_required`.
- The edge-endpoint whitelist is **registry-backed**, not compile-time: the
  edge-write validator resolves allowed `(fromLabel, toLabel)` pairs from the
  runtime `_OntologyEdgeEndpoint` registry via `getEdgeEndpoints`
  (`api/src/storage/edges.ts:49`; comment lines 17–28). So registering
  `MEASURES` with a `KPI→MetricDefinition` endpoint pair through `createEdgeType`
  is sufficient for `POST /api/v1/edges` to accept a `MEASURES` write — **no**
  edit to `EDGE_TYPES`/`EDGE_ENDPOINTS` (NFR-01), **no** edit to the guard.
- `MEASURES` is a fresh name: `grep -rn "MEASURES" shared/src api/src` returns
  nothing (verified). `edgeTypeCreateSchema` requires SCREAMING_SNAKE
  (`^[A-Z][A-Z0-9_]*$`, `shared/src/schema/ontology.ts:228`); `MEASURES`
  satisfies it.

## 3. Data model

This spec adds **no** compile-time schema. It registers **one runtime node
label** and **one runtime edge type**, both through `ontology-manager`.

### 3.1 `MetricDefinition` node label (FR-01, FR-08) — via `createNodeLabel`

Registered by POSTing `nodeLabelCreateSchema`
(`shared/src/schema/ontology.ts:178`) to `POST /api/v1/ontology/node-labels`
(`ontology:write`). Registration payload:

| Field | Value |
|-------|-------|
| `name` | `"MetricDefinition"` (PascalCase, matches `NODE_LABEL_NAME_REGEX`) |
| `description` | `"A canonical SaaS/finance metric definition (formula, unit, category, benchmark) that operator KPIs measure via the MEASURES edge."` |
| `usage_example` | `"NRR — Net Revenue Retention; unit=percent; category=retention"` |
| `json_schema_doc` | the attribute schema below (supported JSON-Schema subset) |

`json_schema_doc` (the supported subset — `type/properties/required/enum/
additionalProperties`, all within the `MAX_JSON_SCHEMA_DEPTH`=8 /
`MAX_JSON_SCHEMA_BYTES`=32768 limits):

```json
{
  "type": "object",
  "properties": {
    "formula":   { "type": "string", "minLength": 1 },
    "unit":      { "type": "string",
                   "enum": ["currency", "ratio", "percent", "days", "months", "count"] },
    "category":  { "type": "string",
                   "enum": ["acquisition", "revenue", "retention",
                            "efficiency", "financial", "reliability"] },
    "benchmark": { "type": "string", "minLength": 1 }
  },
  "required": ["formula", "unit", "category", "benchmark"],
  "additionalProperties": true
}
```

- `additionalProperties: true` keeps supplementary keys open (a metric may carry
  extra descriptive attributes) while `required` + the two `enum`s make the four
  core attributes enforced at the REST boundary by the as-built attribute-zod
  path (`api/src/storage/nodes.ts:126` `assertAttributesMatchSchema` →
  `getAttributeValidator`, which `safeParse`s and throws
  `attribute_violation` 400 on a missing `unit` or an out-of-enum `category`).
- `unit` and `category` are the two closed enums (OQ-3). `formula` and
  `benchmark` are free non-empty strings.

**Idempotency (FR-01, AC-01).** `createNodeLabel` is a **strict CREATE** — a
second create of `MetricDefinition` returns `409 name_conflict`
(`api/src/ontology/storage/node-labels.ts:193`). The seed step (§5.4) treats a
`409 name_conflict` as **"already registered → continue"**, not a hard failure,
so a re-run is a no-op. `NODE_LABELS` in `shared/src/schema/nodes.ts` is never
edited (NFR-01, AC-01).

Once registered, `parseRegistryLabel("MetricDefinition")` resolves (schema-cache
backed), so `POST /api/v1/nodes/MetricDefinition` (`handleNodePost`,
`api/src/routes/nodes.ts:32`) accepts metric-instance writes — and
`MetricDefinition` is **not** in `LIFECYCLE_LABELS`, so `assertNotLifecycleLabel`
passes.

### 3.2 `MEASURES` edge type (FR-02, FR-03) — via `createEdgeType` (OQ-1 a)

Registered by POSTing `edgeTypeCreateSchema`
(`shared/src/schema/ontology.ts:236`) to `POST /api/v1/ontology/edge-types`
(`ontology:write`):

| Field | Value |
|-------|-------|
| `name` | `"MEASURES"` (SCREAMING_SNAKE, matches `EDGE_TYPE_NAME_REGEX`) |
| `description` | `"Links an operator KPI to the canonical MetricDefinition it measures (XD-06). Named MEASURES rather than INSTANTIATES to avoid the lifecycle-guarded module-pin edge — blueprint XD-06-erratum."` |
| `usage_example` | `"KPI 'Q3 NRR' MEASURES MetricDefinition 'NRR'"` |
| `endpoints` | `[{ "fromLabel": "KPI", "toLabel": "MetricDefinition" }]` |

- The `KPI` label exists (`shared/src/schema/nodes.ts:13`); `MetricDefinition`
  is registered first (§5.4 ordering), so `createEdgeType`'s
  `assertEndpointLabelsExist` (`api/src/ontology/storage/edge-types.ts:218`)
  passes.
- `MEASURES` is a **brand-new** edge type (not an append to an existing row), so
  `createEdgeType` is the right call — no `patchEdgeType` endpoint-append needed.
  A second `createEdgeType` returns `409 name_conflict`; the seed step treats it
  as "already registered" (idempotency, mirroring §3.1).
- `EDGE_TYPES`/`EDGE_ENDPOINTS` in `shared/src/schema/edges.ts` are never edited
  (NFR-01, AC-03).

**Consequence:** because `MEASURES ∉ LIFECYCLE_EDGES`, the generic
`POST /api/v1/edges` route accepts a `{type:"MEASURES", fromId:<kpiId>,
toId:<metricId>}` write; the validator resolves the `KPI→MetricDefinition`
endpoint pair from the registry (`getEdgeEndpoints`) and passes it; a wrong pair
(e.g. `Domain→MetricDefinition`) returns `400 edge_endpoint_label_mismatch`
(inherited from graph-core — no new validation code, FR-03).

### 3.3 KPI → MetricDefinition link (FR-03) — a `MEASURES` edge

A KPI is linked to exactly one canonical `MetricDefinition` by a `MEASURES` edge
(`KPI → MetricDefinition`). The write path is the **generic
`POST /api/v1/edges`** route (OQ-1 (a) makes this possible), wrapped by this
feature's own cardinality guard (§5.3, OQ-2). Reads (a KPI's metric, and the
inverse — which KPIs measure a given metric) are scoped reads via
`POST /api/v1/query/cypher` (`query:read`). Content specs create these links when
they author their KPIs; this feature ships the label, edge type, guard, and the
catalog they point at.

### 3.4 No new zod at a REST boundary

The only zod this feature authors is the small internal seed-input shape for the
metric-catalog rows (§5.4), permissive and internal to the seed harness — never a
REST boundary. Registration and metric writes reuse the as-built
`nodeLabelCreateSchema` / `edgeTypeCreateSchema` / `nodeCreateSchema` +
the registered `json_schema_doc` attribute-zod (NFR-04, FR-08).

## 4. Canonical metric catalog — FROZEN roster (FR-04, AC-06)

Per requirements C-02, the catalog is **frozen here as an exact enumerated
roster**. AC-06 asserts the seeded set of `MetricDefinition` names equals this
table **exactly** (no missing, no extra). The 17 blueprint-named metrics are the
mandatory minimum; this table is the authoritative complete roster (20 metrics).

Every row carries the standard node envelope (`id` = the stable seed id below,
`name`, `description`) plus the four enforced attributes. `unit ∈ {currency,
ratio, percent, days, months, count}`; `category ∈ {acquisition, revenue,
retention, efficiency, financial, reliability}` (§3.1 enums).

| # | `name` | stable seed id (`id`) | `unit` | `category` | `formula` (human-readable) | `benchmark` |
|---|--------|-----------------------|--------|------------|----------------------------|-------------|
| 1 | CAC | `metric-cac` | currency | acquisition | Total sales & marketing spend ÷ new customers acquired (period) | Lower is better; varies by ACV — track CAC-payback alongside |
| 2 | LTV | `metric-ltv` | currency | revenue | ARPA × gross margin % ÷ customer churn rate | LTV:CAC ≥ 3 healthy |
| 3 | LTV:CAC Ratio | `metric-ltv-cac-ratio` | ratio | efficiency | LTV ÷ CAC | ≥ 3 healthy; < 1 unsustainable |
| 4 | MRR | `metric-mrr` | currency | revenue | Σ monthly recurring revenue across active subscriptions | Growth trend > level; track net-new MRR |
| 5 | ARR | `metric-arr` | currency | revenue | MRR × 12 | Growth rate the headline; > 100% YoY early-stage |
| 6 | NRR | `metric-nrr` | percent | retention | (Starting MRR + expansion − contraction − churn) ÷ starting MRR | > 100% healthy; > 120% best-in-class |
| 7 | GRR | `metric-grr` | percent | retention | (Starting MRR − contraction − churn) ÷ starting MRR | > 90% healthy (SMB), > 95% (enterprise) |
| 8 | Logo Churn | `metric-logo-churn` | percent | retention | Customers lost in period ÷ customers at period start | < 1%/mo SMB; lower enterprise |
| 9 | Revenue Churn | `metric-revenue-churn` | percent | retention | MRR lost to churn+contraction ÷ starting MRR | < 1%/mo; negative net-churn ideal |
| 10 | CAC Payback | `metric-cac-payback` | months | efficiency | CAC ÷ (new MRR × gross margin %) | < 12 mo healthy; < 18 mo acceptable |
| 11 | DSO | `metric-dso` | days | financial | (Accounts receivable ÷ revenue) × days in period | < 45 days healthy for SaaS billing |
| 12 | Gross Margin | `metric-gross-margin` | percent | financial | (Revenue − COGS) ÷ revenue | > 75% for SaaS; > 80% best-in-class |
| 13 | Burn | `metric-burn` | currency | financial | Net cash outflow per month (gross or net burn) | Trend vs. plan; net burn < gross burn |
| 14 | Runway | `metric-runway` | months | financial | Cash on hand ÷ net monthly burn | > 18 mo healthy; < 6 mo critical |
| 15 | Rule of 40 | `metric-rule-of-40` | percent | financial | Revenue growth rate % + profit (or FCF) margin % | ≥ 40% healthy |
| 16 | Pipeline Conversion | `metric-pipeline-conversion` | percent | acquisition | Deals won ÷ qualified opportunities entering pipeline | Varies by motion; track per-stage drop-off |
| 17 | Win Rate | `metric-win-rate` | percent | acquisition | Deals won ÷ (deals won + deals lost) | 20–30% typical mid-market |
| 18 | MTTR | `metric-mttr` | days | reliability | Σ incident resolution time ÷ incidents (period) | Lower is better; hours not days for SEV1 |
| 19 | Uptime | `metric-uptime` | percent | reliability | Available minutes ÷ total minutes (period) | ≥ 99.9% (three nines) SLA-typical |
| 20 | Deploy Frequency | `metric-deploy-frequency` | count | efficiency | Production deployments per period | Elite: on-demand / multiple per day |

**Roster note.** The 17 blueprint-named metrics (rows 1–2, 4–14, 16–19) are all
present; rows 3 (LTV:CAC), 15 (Rule of 40), and 20 (Deploy Frequency) are the
three design-enumerated additions (from the requirements' explicit candidate
list), making the frozen total **20**. AC-06 asserts set-equality against these
20 names; adding or removing a metric later is a design-doc change that updates
this table + AC-06's expected set together.

**Model-independence (FR-05, NFR-02).** Metric definitions are reference/canonical
nodes (like `System` per `model-workspace-core` DEC-01) — **not** `IN_MODEL`-scoped.
They are a shared catalog available to any model's KPIs (retail or operator). The
"overlap with commercial-domain metrics" risk (blueprint Risks) is resolved by
this being the **single** canonical definition per metric.

## 5. Server-side logic

This feature adds **no new REST route** and **no new RBAC permission string**.
All server writes/reads ride existing routes (§5.6 table).

### 5.1 `MetricDefinition` label ensure (FR-01, AC-01)

`api/src/seed/ensure-metric-label.ts` exports
`ensureMetricDefinitionLabel(baseUrl): Promise<void>`:

1. POST the §3.1 payload to `POST /api/v1/ontology/node-labels`.
2. On `201` → registered. On `409 name_conflict` → already registered, treat as
   success (idempotent, AC-01). On any other non-2xx → throw (surface the seed
   failure).

Loopback POST (the seed script runs as trusted operator tooling, same as the
foundation's `seed-saas-operator.ts` loader posts to `POST /api/v1/import`). No
`NODE_LABELS` edit (NFR-01).

### 5.2 `MEASURES` edge-type ensure (FR-02, AC-03) — OQ-1 (a)

`api/src/seed/ensure-measures-edge.ts` exports
`ensureMeasuresEdgeType(baseUrl): Promise<void>`:

1. POST the §3.2 payload to `POST /api/v1/ontology/edge-types`.
2. `201` → registered; `409 name_conflict` → already registered → success
   (idempotent, AC-03); other non-2xx → throw.

Runs **after** `ensureMetricDefinitionLabel` (the endpoint pair references
`MetricDefinition`, which must exist first — `assertEndpointLabelsExist`). No
`EDGE_TYPES`/`EDGE_ENDPOINTS` edit (NFR-01). The module-pin `INSTANTIATES` edge +
its `LIFECYCLE_EDGES` guard are never touched (AC-04).

### 5.3 KPI→metric cardinality guard (FR-03, AC-05) — OQ-2 (a)

FR-03 requires a KPI to link to **at most one** `MetricDefinition`. The generic
`POST /api/v1/edges` route does **not** enforce edge cardinality, so this feature
supplies the guard **in its own write path** without editing graph-core's
`edges.ts` (Rule A / NFR-06). Two viable placements — the design picks the
first:

- **Chosen: a feature-owned thin write helper** used by content specs (and the
  AC-05 test) to link a KPI to its metric:
  `api/src/seed/link-kpi-metric.ts` → `linkKpiToMetric(baseUrl, kpiId, metricId)`:
  1. Pre-check via `POST /api/v1/query/cypher`
     (`MATCH (k:KPI {id:$kpiId})-[m:MEASURES]->() RETURN count(m) AS n`).
  2. If `n > 0` → throw `kpi_metric_already_linked` (mapped to a `409` by the
     caller); else POST `{type:"MEASURES", fromId:$kpiId, toId:$metricId}` to
     `POST /api/v1/edges`.

  This is the sanctioned write path FR-03 references, keeps the cardinality
  invariant, and touches no owned-elsewhere file. Content specs import this
  helper (or replicate the two-step check) when authoring KPI→metric links.

  > The cardinality guard is **advisory-in-the-helper**, not a hard graph
  > constraint: a raw `POST /api/v1/edges` could still create a second
  > `MEASURES` edge (the graph has no native single-edge cardinality). The
  > requirements accept this (OQ-2 (a) is enforced at the write path the specs
  > use); a hard uniqueness constraint on `(KPI)-[:MEASURES]->()` is out of
  > scope (it would need a Neo4j schema constraint owned by the bootstrap path).
  > AC-05 proves the helper rejects the second link and a read returns exactly
  > one metric per KPI.

### 5.4 Register-then-import seed step (FR-05, FR-06, AC-06, AC-07, AC-08) — OQ-4 (ii)

`api/scripts/seed-saas-metric-library.ts` — the CLI entrypoint, wired
`bun run seed:saas-metric-library` (§7). Sequence:

1. **Step (a) — ensure registry** (always): `ensureMetricDefinitionLabel` →
   `ensureMeasuresEdgeType` (§5.1, §5.2). This is why an already-seeded run is a
   clean no-op (both are idempotent).
2. **Step (b) — import the metric fixture**:
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
   // non-2xx → surface + fail (a 409 model_lifecycle_route_required means a
   // malformed fixture carrying a lifecycle row — see FR-06/AC-08)
   ```

**Register-before-import ordering (Rule B, N-02').** Step (a) MUST precede step
(b): `realImport` runs a per-row registry attribute check
(`api/src/routes/import.ts:123`, "Unregistered…") — importing a
`MetricDefinition` node row before the label is registered would fail. This
feature owns the ordering by owning the whole step. The fixture lives at a
**feature-owned** path `shared/seed/saas-metric-library/metrics.json`,
deliberately **not** in `shared/seed/saas-operator/` — dropping it in the
foundation loader's directory would let that loader import it before this
feature's registration ran (N-02' hazard). The metric catalog is not part of the
foundation's directory scan.

**Fixture shape (FR-06, AC-08).** The fixture is a `{nodes, edges}` import
payload carrying **only** 20 `MetricDefinition` node rows (the §4 roster, each
with its stable seed `id` + the four attributes) and an **empty `edges` array**.
No `MEASURES` edge rows (KPI→metric links are created via §5.3, not the fixture);
no lifecycle rows. Because `MetricDefinition ∉ LIFECYCLE_LABELS` and there are no
edge rows, `realImport`'s lifecycle pre-scan (`import.ts:167-185`,
`assertNotLifecycleLabel`/`assertNotLifecycleEdge`) passes and the nodes are
written. A hand-constructed fixture with a `MEASURES`/`INSTANTIATES` edge row —
or any lifecycle row — is what AC-08's negative case feeds to prove the guard
still rejects `409 model_lifecycle_route_required` with nothing written.

**Idempotency + isolation (FR-05, NFR-02, AC-07).** `realImport` upserts each
node MERGE-on-id (`upsertNode`), so the stable seed ids make a re-run net-zero.
The step writes only `MetricDefinition` nodes; it never issues a write against
retail Business Model #1's subgraph or the retail/commercial seed files. Metric
definitions are not `IN_MODEL`-scoped. AC-07 proves a pre/post `/api/v1/stats`
diff for a re-run is zero and the retail root is untouched.

### 5.5 Catalog list read (FR-07, OQ-5) — reuse `query/cypher`

The catalog list (for the PWA view + the content-spec lookup) is a scoped read
via the existing `POST /api/v1/query/cypher` (`query:read`, `runPassthrough`,
read-only):

```cypher
MATCH (m:MetricDefinition)
RETURN m.id AS id, m.name AS name, m.description AS description,
       m.attributes_json AS attributes_json
ORDER BY m.name
```

No `GET /api/v1/metric-definitions` route is added (OQ-5). The 20-row result is
comfortably within `runPassthrough`'s `TX_TIMEOUT_MS` + row caps.

### 5.6 HTTP API surface (no new route)

| Method | Route | Permission (existing) | FR | Role in this spec |
|--------|-------|-----------------------|----|-------------------|
| POST | `/api/v1/ontology/node-labels` | `ontology:write` | FR-01 | register `MetricDefinition` (§5.1) |
| POST | `/api/v1/ontology/edge-types` | `ontology:write` | FR-02 | register `MEASURES` (§5.2) |
| POST | `/api/v1/nodes/MetricDefinition` | `node:write` | FR-07 | create a metric definition |
| GET | `/api/v1/nodes/MetricDefinition/:id` | `node:read` | FR-07 | read one |
| PATCH | `/api/v1/nodes/MetricDefinition/:id` | `node:write` | FR-07 | update (e.g. `benchmark`) |
| DELETE | `/api/v1/nodes/MetricDefinition/:id` | `node:write` | FR-07 | delete |
| POST | `/api/v1/edges` | `edge:write` | FR-03 | KPI→metric `MEASURES` link (via §5.3 helper) |
| POST | `/api/v1/query/cypher` | `query:read` | FR-03, FR-07, FR-10 | catalog list + KPI-metric reads |
| POST | `/api/v1/import` | `data:write` | FR-05 | metric-fixture load (§5.4) |

Every route above is already mapped in `api/src/auth/rbac-permissions.ts`
(verified: `ontology:write` line 89/94, `node:write`/`node:read` lines 51–54,
`edge:write` line 57, `query:read` line 67). **Zero** new permission string,
**zero** new `getRoutePermission` mapping, **zero** new `ERROR_CODES` entry
(`kpi_metric_already_linked` is not an `ERROR_CODES` member — the §5.3 helper
raises it as a helper-local 409 message, not a wire enum extension; if a future
reviewer wants it in `ERROR_CODES`, that is an additive `graph-core`/errors
change owned elsewhere, not this feature). Auth via the central router gate only
(FR-09, NFR-04).

## 6. UI design — `MetricLibrary` (read-only v1, OQ-6)

### 6.1 View-tree placement (FR-10, FR-12, UX-06)

Route `#/insights/metrics` — **canonical route per the nav-IA restructure**
(2026-07-07; retargeted from the blueprint's original `#/business/metrics`, which
no longer exists — the nav orchestrator now owns `route.ts`/`SURFACES`/`views/index.tsx`
under a 7-surface IA with `insights` as the analytics surface; XD-05). This feature
does **not** edit `route.ts` or `SURFACES`. The nav orchestrator wires the
`#/insights/metrics` → `MetricLibrary` VIEWS entry; this feature contributes only
the live view component.

### 6.2 View registration — the sole `views/index.tsx` edit (FR-12, XD-05, AC-11)

The **only** `views/index.tsx` change is replacing this feature's **one line** in
the `business` surface `VIEWS` map — the **`metrics:` key**
(currently `metrics: () => <BusinessTabPlaceholder tab="Metrics"
spec="saas-metric-library" />`, authored by the foundation; referenced by **key,
not line number**, since the foundation owns and may re-touch that file before
this lands — requirements N-01'):

```tsx
// before (foundation placeholder):
metrics: () => <BusinessTabPlaceholder tab="Metrics" spec="saas-metric-library" />,
// after (this feature):
metrics: () => <MetricLibrary />,
```

The `import { MetricLibrary } from "./business/MetricLibrary"` line is added to
the file's import block. **Neither** `route.ts` **nor** `SURFACES` is edited
(NFR-03). This is the proven `model-workspace-core` / foundation seam.

### 6.3 Component plan (catalog-first, UX-02)

| Component | Source | Use |
|-----------|--------|-----|
| `ViewRegion` | `pwa/src/views/_shared` (catalog) | ARIA `role="region"` landmark (AC-17) |
| `ViewHeader` | `pwa/src/views/_shared` (catalog) | title + lede |
| `Loading` | `pwa/src/views/_shared` (catalog) | loading state (AC-13) |
| `EmptyState` | `pwa/src/views/_shared` (catalog) | empty state (AC-14) |
| `ErrorState` | `pwa/src/views/_shared` (catalog) | error state + retry (AC-15) |
| `useActiveModel()` | `pwa/src/context/ActiveModelContext` (consumed) | header context only — **never** re-implemented |
| `api.cypher` | `pwa/src/api` (existing) | catalog fetch (§5.5) |
| `MetricLibrary` | **new**, `pwa/src/views/business/MetricLibrary.tsx` | the live catalog view |

Imports follow the `FunctionMap.tsx:23` precedent verbatim:
`import { ViewRegion, ViewHeader, Loading, EmptyState, ErrorState } from "../_shared";`
(the catalog components live in the single file `pwa/src/views/_shared.tsx` —
requirements C-03). No new low-level primitive is invented; the view composes
catalog components + a CSS module.

### 6.4 `MetricLibrary` behavior + states (FR-10, FR-11, UX-01)

Route `#/insights/metrics`. Consumes `useActiveModel()` for header context only
(the catalog is model-independent, §4/FR-05 — the view lists **all**
`MetricDefinition` nodes regardless of active model). It fetches the catalog via
**one** `api.cypher(...)` call (§5.5 query), mirroring `FunctionMap`'s
load/state pattern (`FunctionMap.tsx:74`). Each row's `attributes_json` is parsed
to surface `formula`/`unit`/`category`/`benchmark`.

Render: each metric shows `name`, `category`, `unit`, `formula`, `benchmark`,
**grouped or filterable by `category`** (a category filter control — standard
`<select>`/segmented control, no drag). Metrics render as a keyboard-reachable
list/grid.

**States (UX-01), matching `FunctionMap`'s `LoadState` shape:**

- **loading** (AC-13) — `<Loading what="metrics" />` while the catalog fetch is
  in flight.
- **empty** (AC-14) — `MetricDefinition` registered but zero metric nodes seeded:
  `<EmptyState what="metric definitions" />` + a prompt to run
  `bun run seed:saas-metric-library`.
- **error** (AC-15) — the fetch failed: `<ErrorState message={…}
  onRetry={refetch} />` with a retry affordance that refetches.
- **ready** (AC-12) — the catalog rendered as a keyboard-reachable,
  category-grouped list/grid.

### 6.5 Accessibility + deep links (FR-13, UX-05, UX-06, AC-17, AC-18)

- The view root is the catalog `ViewRegion` (`<section role="region"
  aria-label="Metric library">`) landmark. The category filter and each metric
  row are keyboard-reachable in DOM order (Tab), native controls/anchors — no
  focus trap, no gesture handler (AC-17).
- Where a per-metric KPI list is shown (read-only, optional in v1), each linked
  KPI is a native anchor that deep-links into the existing Explorer for that KPI
  (via `toHash({surface:"explorer", …})`, the `FunctionMap` deep-link pattern).
- The `#/insights/metrics` deep link survives reload (the shell active-model
  context + hash router guarantee this — the same guarantee `FunctionMap` relies
  on; AC-18).

### 6.6 Tokens + design conformance (NFR-05, UX-02, UX-04, AC-16)

`MetricLibrary.tsx` styles via `MetricLibrary.module.css` using **only**
`var(--…)` tokens from `pwa/src/styles/companygraph/tokens.css` (the
`FunctionMap.module.css` precedent — grid + card + token vars). Catalog
components before any new one. Desktop-first, no new breakpoints (UX-04). AC-16
runs `bun run scripts/design-conformance.ts --view
pwa/src/views/business/MetricLibrary.tsx` and the same for the `.module.css`,
both expected to exit 0 (the enforced two-invocation form, per foundation
precedent).

### 6.7 Input modes / Native Conflicts (UX-03)

`MetricLibrary` ships **no** canvas/gesture/drag surface (the interactive
`FunnelBoard` is owned by `funnel-pipeline-modeling`). The only input handling is
standard link/list/filter keyboard + pointer interaction; native anchors and a
standard form control (the category filter). No new `Alt+<digit>` accelerator
(the `#/business` surface's accelerator situation is owned by
`saas-operator-foundation`, which assigned none). This matches the requirements'
Platforms & Input Modes and Native Conflicts (`(none) | n/a | n/a`) tables
exactly — `App.tsx` is not edited.

## 7. Wiring

- **`package.json`** — add
  `"seed:saas-metric-library": "bun --cwd api scripts/seed-saas-metric-library.ts"`
  (matches the existing `seed` / `seed:saas-operator` `bun --cwd api scripts/…`
  form). This is the sole `package.json` edit.
- **`shared/seed/saas-metric-library/metrics.json`** — the frozen 20-metric
  `{nodes, edges:[]}` fixture (§4, §5.4). Feature-owned path, **not** in
  `shared/seed/saas-operator/` (N-02' ordering hazard).

## 8. Test strategy

| AC | Kind | Test file |
|----|------|-----------|
| AC-01 | integration (Neo4j) + CLI | `api/__tests__/metric-library-label.integration.test.ts` — `GET /api/v1/ontology/node-labels` includes `MetricDefinition` with its `json_schema_doc`; re-register is a `409 name_conflict` treated as no-op; `git diff shared/src/schema/nodes.ts` shows no additions (manual) |
| AC-02 | integration (Neo4j) | `api/__tests__/metric-library-crud.integration.test.ts` — `POST /api/v1/nodes/MetricDefinition` creates a node; `GET …/:id` returns it with `formula`/`unit`/`category`/`benchmark` |
| AC-03 | integration (Neo4j) + CLI | `api/__tests__/metric-library-edge.integration.test.ts` — `GET /api/v1/ontology/edge-types/MEASURES` shows the `KPI→MetricDefinition` pair; `git diff shared/src/schema/edges.ts` shows no additions (manual) |
| AC-04 | integration (Neo4j) | `api/__tests__/metric-library-edge.integration.test.ts` — a KPI→MetricDefinition `MEASURES` write via `POST /api/v1/edges` succeeds (**not** 409); a `POST /api/v1/edges` with a lifecycle `INSTANTIATES`/`IN_MODEL` row still returns `409 model_lifecycle_route_required` (module-pin edge + guard unaffected) |
| AC-05 | integration (Neo4j) | `api/__tests__/metric-library-cardinality.integration.test.ts` — the §5.3 helper links KPI→metric once; a second link on the same KPI is rejected `409 kpi_metric_already_linked`; a read returns exactly one metric per KPI |
| AC-06 | integration (Neo4j) | `api/__tests__/metric-library-seed.integration.test.ts` — the seeded `MetricDefinition` name set **equals** the §4 frozen roster exactly (no missing/no extra; count = 20); each node has a non-empty `formula`, an enum `unit`, an enum `category`, a non-empty `benchmark` |
| AC-07 | integration (Neo4j) | `api/__tests__/metric-library-seed.integration.test.ts` — re-seed yields zero net new nodes (MERGE-on-id); a pre/post `/api/v1/stats` diff for the retail root is zero; metrics are not `IN_MODEL`-scoped |
| AC-08 | integration (Neo4j) | `api/__tests__/metric-library-seed-lifecycle-guard.integration.test.ts` — the real fixture (nodes-only) imports and writes; a hand-built fixture with a `MEASURES`/`INSTANTIATES` edge row → `409 model_lifecycle_route_required`, nothing written |
| AC-09 | integration (Neo4j) | `api/__tests__/metric-library-attribute-enforcement.integration.test.ts` — a `POST /api/v1/nodes/MetricDefinition` missing `unit`, or with an out-of-enum `category`, is rejected (`attribute_violation`); a valid write succeeds |
| AC-10 | integration (Neo4j) + CLI | `api/__tests__/metric-library-crud.integration.test.ts` — create → read → PATCH (`benchmark`) → DELETE, each on `node:write`/`node:read`; `git diff api/src/auth/rbac-permissions.ts` shows no additions (manual) |
| AC-11 | CLI | `bun run typecheck` exit 0; `git diff --stat` — no `pwa/src/route.ts` change, no `shared/src/schema/{nodes,edges}.ts` array additions, `views/index.tsx` limited to the `metrics:` line + its import (manual) |
| AC-12 | unit (PWA) | `pwa/src/__tests__/metric-library.test.tsx` — `#/insights/metrics` renders `MetricLibrary` (not `BusinessTabPlaceholder`) with name/category/unit/formula/benchmark, category-grouped, keyboard-reachable (mocked cypher response) |
| AC-13, AC-14, AC-15 | unit (PWA) | `pwa/src/__tests__/metric-library-states.test.tsx` — loading skeleton / empty (registered, zero nodes) / error + retry-refetch |
| AC-16 | manual (CLI) | `bun run scripts/design-conformance.ts --view pwa/src/views/business/MetricLibrary.tsx` and the `.module.css` — both exit 0, zero token/component violations |
| AC-17 | manual | with the stack up, load `#/insights/metrics`, Tab through the view — expect focus lands on the `ViewRegion` section landmark then moves through the category filter and each metric row in DOM order; any linked KPI activates on Enter |
| AC-18 | e2e (Playwright) | `pwa/playwright/business-metrics-reload.spec.ts` — navigate to `#/insights/metrics`, reload, expect the live `MetricLibrary` re-renders |

**Preconditions.** AC-12 renders from a mocked cypher response; AC-17/AC-18
against the live stack require `bun run seed:saas-metric-library` to have run
(the 20 seeded metrics are what the view renders). AC-04/AC-05 require a `KPI`
node fixture (the `KPI` label already exists) as the `MEASURES` edge's `fromId`.

## 9. Ownership boundaries — explicitly NOT edited

Spec-guard must block Write/Edit on these (owned elsewhere):

- `shared/src/schema/nodes.ts`, `shared/src/schema/edges.ts` — no compile-time
  label/edge/endpoint array edit (NFR-01; `MetricDefinition`/`MEASURES` are
  runtime-registry only).
- `api/src/storage/model-lifecycle-guard.ts` — the `LIFECYCLE_EDGES` guard is
  **not** narrowed (OQ-1 (a) needs no guard edit); `model-workspace-core`-owned.
- `api/src/routes/{edges,nodes,import,query}.ts`, `api/src/storage/edges.ts` —
  graph-core, reused as-is (the cardinality guard lives in this feature's own
  `link-kpi-metric.ts` helper, §5.3).
- `api/src/routes/ontology-*.ts`, `api/src/ontology/**` — ontology-manager,
  reused as-is.
- `api/src/auth/rbac-permissions.ts` — no new permission string (FR-09, AC-10).
- `api/src/errors.ts` (`ERROR_CODES`) — no new wire error code (§5.6).
- `pwa/src/route.ts`, `pwa/src/App.tsx`, and `SURFACES` — sole-owned by
  `saas-operator-foundation` (XD-05, NFR-03); this feature edits only the
  `metrics:` line of `views/index.tsx`.
- KPI/OKR route code (`api/src/routes/kpi-*`), risk/SLA/compliance code —
  owned by `kpi-okr-governance` / `kpi-measurement-alignment` /
  `risk-compliance-change` (NFR-06).
- `api/scripts/seed-saas-operator.ts` — foundation's loader; not edited
  (OQ-4 (ii) keeps the metric seed self-owned).

## 10. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `api/src/seed/ensure-metric-label.ts` | new | FR-01 | `ensureMetricDefinitionLabel` — POST `createNodeLabel`, 409-as-idempotent (§5.1) |
| `api/src/seed/ensure-measures-edge.ts` | new | FR-02 | `ensureMeasuresEdgeType` — POST `createEdgeType` `MEASURES` `KPI→MetricDefinition`, 409-as-idempotent (§5.2, OQ-1 a) |
| `api/src/seed/link-kpi-metric.ts` | new | FR-03 | `linkKpiToMetric` — cardinality-guarded `MEASURES` write via `POST /api/v1/edges` (§5.3, OQ-2 a) |
| `api/src/seed/metric-catalog.ts` | new | FR-04 | the frozen 20-metric roster data + internal zod input shape (§4, §3.4); source for the fixture |
| `api/scripts/seed-saas-metric-library.ts` | new | FR-05, FR-06 | CLI: step (a) ensure registry → step (b) import fixture via `POST /api/v1/import` (§5.4) |
| `shared/seed/saas-metric-library/metrics.json` | new | FR-05, FR-06 | frozen `{nodes:[20 MetricDefinition], edges:[]}` fixture (§4, §7) |
| `package.json` | modify | FR-05 | add `seed:saas-metric-library` script (§7) |
| `pwa/src/views/business/MetricLibrary.tsx` | new | FR-10, FR-11, FR-13 | the live catalog view, four states, read-only v1 (§6.4) |
| `pwa/src/views/business/MetricLibrary.module.css` | new | FR-10, NFR-05 | tokens-only styling (§6.6) |
| `pwa/src/views/index.tsx` | modify | FR-12 | replace the `metrics:` `VIEWS` line + add the `MetricLibrary` import (SOLE views/index.tsx edit, §6.2) |
| `api/__tests__/metric-library-label.integration.test.ts` | new | AC-01 | |
| `api/__tests__/metric-library-crud.integration.test.ts` | new | AC-02, AC-10 | |
| `api/__tests__/metric-library-edge.integration.test.ts` | new | AC-03, AC-04 | |
| `api/__tests__/metric-library-cardinality.integration.test.ts` | new | AC-05 | |
| `api/__tests__/metric-library-seed.integration.test.ts` | new | AC-06, AC-07 | |
| `api/__tests__/metric-library-seed-lifecycle-guard.integration.test.ts` | new | AC-08 | |
| `api/__tests__/metric-library-attribute-enforcement.integration.test.ts` | new | AC-09 | |
| `pwa/src/__tests__/metric-library.test.tsx` | new | AC-12 | |
| `pwa/src/__tests__/metric-library-states.test.tsx` | new | AC-13, AC-14, AC-15 | |
| `pwa/playwright/business-metrics-reload.spec.ts` | new | AC-18 | |

## 11. Traceability

| FR | Design | ACs |
|----|--------|-----|
| FR-01 (`MetricDefinition` runtime label) | §3.1, §5.1 | AC-01, AC-02 |
| FR-02 (`MEASURES` edge type, OQ-1 a) | §3.2, §5.2 | AC-03, AC-04 |
| FR-03 (KPI→metric link CRUD, cardinality) | §3.3, §5.3 | AC-04, AC-05 |
| FR-04 (frozen canonical roster) | §4 | AC-06 |
| FR-05 (seed idempotency + retail isolation) | §5.4, §7 | AC-06, AC-07 |
| FR-06 (lifecycle-guard-clean fixture) | §5.4 | AC-08 |
| FR-07 (CRUD via generic node routes + list read) | §5.5, §5.6 | AC-02, AC-10 |
| FR-08 (attribute validation from schema) | §3.1 | AC-09 |
| FR-09 (auth via central gate, no new RBAC) | §5.6, §9 | AC-10, AC-11 |
| FR-10 (`MetricLibrary` view) | §6.1, §6.3, §6.4, §6.6 | AC-12, AC-16, AC-17 |
| FR-11 (four view states) | §6.4 | AC-12, AC-13, AC-14, AC-15 |
| FR-12 (sole `views/index.tsx` edit) | §6.2 | AC-11, AC-12, AC-18 |
| FR-13 (keyboard/deep-link, read-only v1) | §6.5 | AC-17, AC-18 |
| NFR-01 (no compile-time schema, no new store) | §3, §10 | AC-01, AC-03, AC-11 |
| NFR-02 (idempotency + retail isolation) | §4, §5.4 | AC-07 |
| NFR-03 (route-file single ownership) | §6.2, §9, §10 | AC-11 |
| NFR-04 (house rules, zod-only, no tsc, loopback) | §3.4, §5.6, §9 | AC-11 |
| NFR-05 (PWA design conformance) | §6.6 | AC-16 |
| NFR-06 (ownership boundaries) | §5.3, §9 | AC-10, AC-11 |

## 12. Rejected alternatives

- **Keep the literal `INSTANTIATES` name (OQ-1 b/c).** (b) a dedicated
  guard-bypassing KPI→metric write route conflates two very different edges under
  one type and touches the guard's assumptions; (c) narrowing
  `model-lifecycle-guard.ts` so `INSTANTIATES` is guarded only for
  `ModuleInstance→BusinessModuleVersion` edits a `model-workspace-core`-owned
  file (ownership-boundary violation) and risks the module-pin invariant.
  Rejected → option (a) `MEASURES`: a fresh, unguarded name registered via the
  registry, zero owned-elsewhere edits, generic edge route works (§3.2). The
  required XD-06-erratum is recorded in the blueprint.
- **Replace-on-second-link cardinality (OQ-2 b) / descriptive-only (OQ-2 c).**
  Replace silently drops the prior link (surprising for a canonical link);
  descriptive leaves the invariant unenforced. Rejected → reject-on-second
  (OQ-2 a, §5.3) for canonical integrity.
- **A `GET /api/v1/metric-definitions` route family (OQ-5).** Cleaner client
  typing, but adds a route + a maintenance surface the generic `query/cypher`
  already covers (the `FunctionMap` precedent). Rejected → reuse `query/cypher`
  (§5.5).
- **An in-view metric create/edit editor (OQ-6).** The catalog is a curated
  canonical roster, not user-authored churn; an editor grows the view surface for
  little value in v1. Rejected → read-only v1; CRUD proven at the REST layer
  (AC-10). If a future spec wants an editor, it adds a view + its own ACs.
- **Foundation-owned metric ensure-step in `seed-saas-operator.ts` (OQ-4 i).**
  Couples this feature to a foundation edit it cannot make (XD-05/NFR-06) and
  requires the foundation loader to grow a metric-specific ensure-call. Rejected →
  self-owned `seed:saas-metric-library` step (OQ-4 ii, §5.4).
- **Landing the metric fixture in `shared/seed/saas-operator/` (N-02').** The
  foundation loader would import it before this feature's registration runs, and
  `realImport`'s per-row registry check would fail. Rejected → feature-owned
  fixture path (§5.4, §7).
- **A hard Neo4j `(KPI)-[:MEASURES]->()` uniqueness constraint.** Would need a
  bootstrap/schema-constraint edit owned by the graph-core bootstrap path.
  Rejected → write-path cardinality guard (§5.3); OQ-2 (a) accepts write-path
  enforcement.
