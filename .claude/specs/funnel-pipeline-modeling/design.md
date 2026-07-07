---
feature: "funnel-pipeline-modeling"
created: "2026-07-06"
author: "spec-author"
status: "revised"
revision: 2
reviewing_requirements_revision: 3
size: "large"
---

# Design: funnel-pipeline-modeling

<!-- The File Changes table (§9) is the permission surface for implementation —
     spec-guard blocks Write/Edit on any source file not listed there (or in
     tasks.md) until this document's frontmatter status is "approved". -->

## 1. Overview

`funnel-pipeline-modeling` is **foundation wave 1b** of the SaaS-Operator
fan-out (blueprint `.claude/specs/blueprint-saas-operator.md`), a wave-1b sibling
of `saas-metric-library` that depends only on `saas-operator-foundation`. It
delivers the **multi-stage funnel/pipeline construct** that the core `PRECEDES`
edge cannot express — a construct wave-2 content specs (`marketing-process-model`,
`sales-process-model`) instantiate. It ships four things:

1. **Two runtime ontology-registry node labels** — `Funnel` and `Stage` —
   registered through the sanctioned `POST /api/v1/ontology/node-labels` route
   (XD-02), each with a `json_schema_doc` describing its attributes (`Stage`
   requires an integer `stageOrder`). **No** entry is added to the compile-time
   `NODE_LABELS` tuple.
2. **Two runtime ontology-registry edge types** — `HAS_STAGE` (`Funnel→Stage`)
   and `CONVERTS_TO` (`Stage→Stage`) — registered through
   `POST /api/v1/ontology/edge-types` (XD-02). `CONVERTS_TO` carries the
   `conversionRate` / `dropOffRate` edge attributes that `PRECEDES` cannot. **No**
   entry is added to `EDGE_TYPES` / `EDGE_ENDPOINTS`.
3. **A thin funnel-owned transition write route** — `POST /api/v1/funnels/transitions`
   — that range-validates `conversionRate`/`dropOffRate` ∈ `[0,1]` with `zod`
   (→ `400 attribute_violation`) and then delegates the accepted write to
   graph-core's `createEdge`, so the FR-04 endpoint whitelist + edge-id
   uniqueness still apply. This is the ownership-safe home for the range check
   (the generic edge path does not validate per-edge-type attributes, and its
   files are graph-core-owned). Funnel/Stage node CRUD and `HAS_STAGE` edges ride
   the **existing** generic graph write paths (`/api/v1/nodes/:label`,
   `/api/v1/edges`); the composition + listing reads ride the **existing**
   `POST /api/v1/query/cypher` passthrough.
4. **The live `FunnelBoard` PWA view** at `#/business/funnels` — an interactive
   stage board with a funnel picker, an ordered stage board, per-transition +
   overall conversion/drop-off, pointer drag reorder + explicit keyboard
   move-up/down controls, and all four view states. It replaces **only** the one
   `VIEWS` entry `saas-operator-foundation` pre-registered for `funnels`.

The design follows five rules:

- **Rule A — registry, never compile-time schema.** `Funnel`/`Stage`/
  `HAS_STAGE`/`CONVERTS_TO` are runtime-registry constructs only (XD-02/NFR-01).
  Zero edit to `shared/src/schema/{nodes,edges}.ts`.
- **Rule B — idempotency = get-then-create guard (Resolves review B-03, rev-3).**
  The public registry-create routes are strict-CREATE (`409 name_conflict` on a
  duplicate — verified `api/src/ontology/storage/{node-labels,edge-types}.ts`), so
  re-register is **not** a bare-POST no-op, and this feature adds nothing to the
  compile-time tuples the seed-loader MERGE covers. This feature's registration
  routine `ensureFunnelOntology` therefore **`GET`s each construct by name first
  and `POST`s only on `404`** — a get-then-create guard (requirements rev-3 FR-06a).
  A `200` on the `GET` means the construct already exists → skip the create → a
  *verified* no-op that never re-hits the strict-CREATE route (so no `409` is ever
  produced on a re-run). This is the ownership-safe idempotency mechanism: it edits
  neither the strict-CREATE registry routes nor the compile-time tuples, and it
  mirrors the lookup-before-create posture of `ensureOperatorRoot`
  (`api/src/seed/ensure-operator-root.ts:48`).
- **Rule C — range check on a funnel-owned seam, delegate to graph-core.** The
  `[0,1]` range validation lives in a **new** `api/src/routes/funnels.ts` route;
  it never edits `api/src/routes/edges.ts`, `api/src/storage/edges.ts`, or
  `shared/src/schema/edges.ts`. It reuses the existing `edge:write` permission
  (no **new** permission string — Deviation D-1 records the additive dispatch +
  mapping wiring).
- **Rule D — reads ride the existing passthrough; scope by id/marker.** The
  composition read is keyed on the funnel `id` (globally unique UUIDv7 → cannot
  cross models); the listing read is scoped to the active operator model by a
  funnel-carried `attributes.modelId` marker (Resolves review C-06 — no new
  `PART_OF` endpoint pair, no owned-elsewhere edit).
- **Rule E — single PWA view-registration line; route taken verbatim.**
  `#/business/funnels` is taken verbatim from the View Tree; this spec replaces
  **only** its one `VIEWS` entry (import + map line) in `pwa/src/views/index.tsx`
  and never edits `pwa/src/route.ts` / `SURFACES` (XD-05).

Rejected at design level (see §11): a per-edge-type `json_schema_doc` for
`CONVERTS_TO` (no such mechanism exists for edges — attribute-zod validates node
labels only); an inline `type==="CONVERTS_TO"` branch in `handleEdgePost` /
`createEdge` (an ownership violation of graph-core files); a UI-only soft range
guard (leaves stored data untrustworthy for the cockpit rollup); leaving the new
transition route unmapped in `rbac-permissions.ts` (a security regression — an
unmapped route passes the gate on **any** authenticated session, weaker than the
`edge:write` the generic edge route requires); a new `PART_OF` `Funnel→Domain`
endpoint pair for listing scope (needs a registry-endpoint decision content
wave-2 owns); a branching-DAG funnel model (no wave-2 content needs it).

## 2. Prior-review concerns — resolution in this design

Requirements are approved at rev 2 (`status: revised`). The rev-2 review
(`review-requirements.md`, pass 2/2, verdict "revise") left **one Blocker and
two design-resolvable Concerns**; all three are pinned here. (The four OQs are
already closed in-artifact by rev-2 — this design implements those closures, it
does not re-decide them.)

| Finding | Resolution | Section |
|---------|-----------|---------|
| **B-03** — the FR-01..FR-04 / NFR-03 / AC-01 "re-register is a clean no-op" claim is false: the public registry-create routes are strict-CREATE (`409 name_conflict`); the spec names no real idempotency mechanism | **Get-then-create guard in the funnel-owned registration routine (requirements rev-3 FR-06a).** `ensureFunnelOntology` `GET`s each of the four constructs by name (`GET /api/v1/ontology/{node-labels,edge-types}/<name>`) and `POST`s the registration payload **only on a `404`**; a `200` means the construct already exists → skip the create. The routine never re-hits the strict-CREATE route on a duplicate, so a second run creates nothing and produces no `409`. AC-01 (rev-3) asserts **the routine's** idempotency — "the registration routine run twice leaves exactly one `Funnel` label and errors nothing" (§4.1, §8) — not that the public strict-CREATE route is itself a no-op. Mirrors the lookup-before-create posture of `ensureOperatorRoot` (`api/src/seed/ensure-operator-root.ts:48`). | §4.1, §8 (AC-01) |
| **C-05** — is `stageOrder` a *required integer* under the `json_schema_doc` supported subset? | **Yes — verified.** `jsonSchemaDocSchema` supports the `required` keyword (`shared/src/schema/ontology.ts:71`, `required: z.array(z.string()).optional()`), and the attribute-zod cache compiles the whole doc — including `required` — via `json-schema-to-zod` before every `createNode`/`patchNode` (`api/src/ontology/cache/attribute-zod.ts`). So `json_schema_doc: { type:"object", required:["stageOrder"], properties:{ stageOrder:{ type:"integer" } } }` makes a missing or non-integer `stageOrder` fail `attribute_violation` at the generic node route (AC-02). §3.2 pins the exact doc. | §3.2, §8 (AC-02) |
| **C-06** — FR-09/AC-10 scope the listing "from the operator root" but never name the `Funnel`→root attachment edge | **A `Funnel` carries a top-level-of-`attributes` `modelId` marker (the operator root id) set at create time; the listing filters on it — no graph attachment edge is required for the `must`.** The `Funnel` `json_schema_doc` declares an optional `modelId` string attribute; `FunnelBoard` (and any funnel-creating seed) stamps the active operator-root id into it. FR-09's listing Cypher is `MATCH (f:Funnel) WHERE f.attributes_json CONTAINS $rootId … ` — more precisely a parse-and-filter on `modelId` (§6.4/§4.4) — so a retail Model #1 funnel (no `modelId`, or a different one) is excluded (AC-10). This avoids adding a new `PART_OF` `Funnel→Domain` endpoint pair (a registry-endpoint decision content wave-2 owns) and touches no owned-elsewhere file. Where a funnel *also* attaches into a function `Domain` graph-structurally is a content-spec concern, explicitly out of scope here. | §3.1, §4.4, §6.4, §8 (AC-10) |

## 2.1 Deviations Register

One requirements citation understates the wiring a **new** server route needs.
The design cannot edit `requirements.md`; the divergence is recorded here for the
orchestrator to land as a requirements-errata note. It does **not** change any
FR's intent — only the honest file surface of the FR-07 route.

| # | Requirements text | As-built reality (verified) | This design |
|---|-------------------|-----------------------------|-------------|
| D-1 | FR-07 says the `CONVERTS_TO` transition route is "a new file under `api/src/routes/`" and NFR-02/FR-10/AC-21 assert "no new RBAC permission string" and "no `route.ts`/`SURFACES` edit". This reads as if the route needs **no** framework wiring. | A new REST route needs two additive edits to reach dispatch + the gate: (1) `api/src/router.ts` is a hardcoded `if (sub === …)` dispatch chain (181 branches, no dynamic route-registration seam — verified) — a new route needs one `if (sub === "funnels/transitions" && method === "POST") return handleFunnelTransitionPost(req);` line; (2) `getRoutePermission` returns `null` for an **unmapped** route, and the router gate lets a `null`-permission route through on **any** authenticated session (`api/src/router.ts:386-395`) — weaker than the `edge:write` the generic edge route requires. So the route **must** be mapped in `api/src/auth/rbac-permissions.ts` (`P("POST", "funnels/transitions", "edge:write")`) to preserve parity, and that is an **additive** edit, not a new *permission string*. | The route lives in **new** `api/src/routes/funnels.ts` (owned by this spec). Two **additive** wirings are made: one dispatch line in `api/src/router.ts`, and one `P(...)` mapping line in `api/src/auth/rbac-permissions.ts` **reusing the existing `edge:write` permission** (`api/src/auth/rbac-permissions.ts:57`). NFR-02/AC-21's substantive guarantees hold **verbatim**: no **new** permission string, no `pwa/src/route.ts`/`SURFACES` edit (D-1 concerns the **API** `router.ts`, a different file from the PWA `route.ts`), and no edit to any graph-core **edge/node/query** file. AC-21's git-diff boundary check is widened to *permit* these two additive lines while still forbidding schema-array / graph-core-edge / PWA-`route.ts` edits (§8, §9). The `pwa/src/route.ts` in AC-21 remains untouched. |

Rationale for choosing the funnel-owned route over the metric-library shape:
`saas-metric-library` added **no** new API route because its `MEASURES` edge
needs only cardinality enforcement it could place in a seed/write **helper** that
POSTs to the generic `/api/v1/edges`. This feature's `CONVERTS_TO` needs a
**server-side, always-on** range check on the stored data (FR-05 motivation 4 —
the cockpit rollup must trust the persisted rates; the requirements explicitly
reject a UI-only soft guard). A seed-time helper would only guard the seed path,
leaving `FunnelBoard`'s inline transition edits (FR-15) and any future direct
POST unguarded. A server route is the only seam that guards **every** write path
without editing a graph-core file — hence the two additive framework wirings
above.

## 3. Data model

This feature adds **no** compile-time schema. Every construct is a runtime
registry label/edge; the only new zod is the transition route's request shape
(§3.4). The `Funnel`/`Stage` node attributes are validated by the attribute-zod
cache against each label's registered `json_schema_doc` (C-05).

### 3.1 `Funnel` node label (FR-01) — via `createNodeLabel`

Registered by POSTing `nodeLabelCreateSchema`-conformant payload to
`POST /api/v1/ontology/node-labels`:

| Field | Value |
|-------|-------|
| `name` | `"Funnel"` (PascalCase, matches `NODE_LABEL_NAME_REGEX`) |
| `description` | `"A multi-stage conversion funnel/pipeline. Its ordered Stage nodes (HAS_STAGE) and the CONVERTS_TO edges between them carry conversion/drop-off the core PRECEDES edge cannot express."` |
| `usage_example` | `"Funnel 'Marketing Lead Funnel' HAS_STAGE Stage 'Visitor'; Stage 'Visitor' CONVERTS_TO Stage 'Lead' {conversionRate:0.62, dropOffRate:0.38}"` |
| `json_schema_doc` | `{ type:"object", properties:{ modelId:{ type:"string" } }, additionalProperties:true }` |

`modelId` (optional string) is the **operator-root marker** (Resolves C-06): a
`Funnel` created for the SaaS-Operator model stamps the operator root id here so
the FR-09 listing can scope to the active model without a graph attachment edge.
`additionalProperties:true` keeps the label open for content-spec attributes.
The `usage_example` doubles as the modeling-guidance surface (Risk #6) — it
names `CONVERTS_TO` as the conversion edge, distinct from plain `PRECEDES`.

### 3.2 `Stage` node label (FR-02) — via `createNodeLabel`

| Field | Value |
|-------|-------|
| `name` | `"Stage"` |
| `description` | `"An ordered position within a Funnel. stageOrder gives a deterministic ordinal independent of graph traversal; Stage→Stage CONVERTS_TO edges carry conversion/drop-off."` |
| `usage_example` | `"Stage 'MQL' {stageOrder:2} in Funnel 'Marketing Lead Funnel'"` |
| `json_schema_doc` | `{ type:"object", required:["stageOrder"], properties:{ stageOrder:{ type:"integer" } }, additionalProperties:true }` |

**`required:["stageOrder"]` + `stageOrder:{type:"integer"}` (Resolves C-05).**
Verified: `jsonSchemaDocSchema` accepts `required` (`ontology.ts:71`) and the
attribute-zod cache compiles it (`attribute-zod.ts`), so a `POST /api/v1/nodes/Stage`
with a missing or non-integer `stageOrder` fails `attribute_violation` at the
generic node route (AC-02). `additionalProperties:true` admits content-spec
attributes (e.g. a stage's population count).

### 3.3 `HAS_STAGE` + `CONVERTS_TO` edge types (FR-03, FR-04) — via `createEdgeType`

Both registered by POSTing `edgeTypeCreateSchema`-conformant payloads to
`POST /api/v1/ontology/edge-types`. `createEdgeType` writes one
`_OntologyEdgeEndpoint` row per pair (`api/src/ontology/storage/edge-types.ts:181,246`),
which the edge-write validator reads via `getEdgeEndpoints`
(`api/src/ontology/cache/edge-endpoints.ts`) — so an edge whose endpoints are
anything other than the registered pair is rejected `400 edge_endpoint_label_mismatch`
(`api/src/storage/edges.ts:91`).

| | `HAS_STAGE` | `CONVERTS_TO` |
|-|-------------|---------------|
| `name` | `"HAS_STAGE"` (SCREAMING_SNAKE, matches `EDGE_TYPE_NAME_REGEX`) | `"CONVERTS_TO"` |
| `endpoints` | `[{ fromLabel:"Funnel", toLabel:"Stage" }]` | `[{ fromLabel:"Stage", toLabel:"Stage" }]` |
| `description` | `"Links a Funnel to each of its ordered Stage nodes."` | `"A conversion transition between two Stages, carrying conversionRate + dropOffRate in [0,1]. Use CONVERTS_TO for conversion; PRECEDES is plain sequence with no drop-off."` |
| `usage_example` | `"Funnel 'Marketing Lead Funnel' HAS_STAGE Stage 'Visitor'"` | `"Stage 'Visitor' CONVERTS_TO Stage 'Lead' {conversionRate:0.62, dropOffRate:0.38}"` |

Neither is added to compile-time `EDGE_TYPES`/`EDGE_ENDPOINTS` (NFR-01). Neither
name collides with an existing edge type: `grep -rn "HAS_STAGE\|CONVERTS_TO"
shared/src api/src` is empty, so both are brand-new registry rows (not appends),
and neither is in `LIFECYCLE_EDGES` — the generic `POST /api/v1/edges` accepts a
`HAS_STAGE` write and the funnel-owned route's delegated `createEdge` accepts a
`CONVERTS_TO` write, with no lifecycle-guard interference.

`assertEndpointLabelsExist` (`edge-types.ts:218`) requires the endpoint labels to
be registered first, so registration order is **`Funnel` → `Stage` →
`HAS_STAGE` → `CONVERTS_TO`** (§4.1).

### 3.4 Transition route request shape (zod) — the only new zod at a boundary

`api/src/routes/funnels.ts` defines the transition-write request schema
(reusing the shared `uuidv7` primitive):

```ts
// api/src/routes/funnels.ts
import { z } from "zod";
import { uuidv7 } from "@companygraph/shared/schema/nodes"; // existing primitive (exported from nodes.ts:26, same as edgeCreateSchema imports it)

const rate = z.number().min(0).max(1);                     // [0,1], inclusive
export const funnelTransitionSchema = z.object({
  fromId: uuidv7,                                          // source Stage id
  toId: uuidv7,                                            // target Stage id
  conversionRate: rate,
  dropOffRate: rate,
  attributes: z.record(z.unknown()).default({}),          // free supplementary keys
});
export type FunnelTransitionInput = z.infer<typeof funnelTransitionSchema>;
```

`conversionRate`/`dropOffRate` are top-level for a clean `zod` range check; the
route folds them into the edge's `attributes` map before delegating to
`createEdge` (so they persist as `attributes_json` on the `CONVERTS_TO`
relationship, `api/src/storage/edges.ts`, round-tripping intact — AC-05). A value
outside `[0,1]` fails `funnelTransitionSchema.safeParse` → `400 attribute_violation`
(AC-06). No `shared/src/schema/edges.ts` edit — this schema is local to the
funnel route file (Rule C).

## 4. Core logic

### 4.1 Funnel-ontology ensure (FR-01..FR-04, AC-01, AC-03, AC-04) — Rule B

`api/src/seed/ensure-funnel-ontology.ts` exports
`ensureFunnelOntology(baseUrl): Promise<void>` — the register-before-use routine
(run at seed/bootstrap time so the labels exist before any content-wave-2 seed
loads, Risk #5). Sequence, in dependency order (`assertEndpointLabelsExist`
requires labels first, §3.3):

1. Ensure the §3.1 `Funnel` label — `GET /api/v1/ontology/node-labels/Funnel`; on `404` `POST` the §3.1 payload; on `200` skip.
2. Ensure the §3.2 `Stage` label — `GET /api/v1/ontology/node-labels/Stage`; on `404` `POST` the §3.2 payload; on `200` skip.
3. Ensure the §3.3 `HAS_STAGE` edge type — `GET /api/v1/ontology/edge-types/HAS_STAGE`; on `404` `POST` the §3.3 payload; on `200` skip.
4. Ensure the §3.3 `CONVERTS_TO` edge type — `GET /api/v1/ontology/edge-types/CONVERTS_TO`; on `404` `POST` the §3.3 payload; on `200` skip.

**Idempotency (Resolves B-03) — get-then-create guard (requirements rev-3 FR-06a).**
Each of the four steps is a `getThenCreate(getPath, postPath, payload)` helper:
it issues the `GET`; a `200` returns immediately (construct already registered →
no-op); a `404` `POST`s the payload and treats `201` as success; a defensive
`409 name_conflict` on the `POST` (a race where the construct appeared between the
`GET` and the `POST`) is **also** tolerated as success; any other non-2xx throws
(surface the failure). Because the routine `GET`s first and only `POST`s when the
construct is genuinely absent, a second run of `ensureFunnelOntology` finds all
four via the `GET` and creates nothing, leaving exactly one of each construct and
erroring nothing (AC-01/AC-03/AC-04) — without editing the compile-time tuples
this spec adds nothing to (XD-02) or the strict-CREATE registry routes. The
routine runs as trusted operator tooling on the loopback API (same posture as
`ensureOperatorRoot` and the metric-library's ensure steps).

**Placement.** `ensureFunnelOntology` is exported so it can be invoked by a
**feature-owned** `seed:funnel-pipeline` package script (author-lean, mirrors
`saas-metric-library` OQ-4 option (ii)) — it does **not** edit the foundation's
`seed-saas-operator.ts` (that file is foundation-owned; the foundation loader
exposes no ensure-hook seam). The content-wave-2 marketing/sales seeds depend on
this routine having run; the seed script wiring is §7.

### 4.2 Funnel/Stage node CRUD (FR-06, AC-02, AC-07) — existing generic path

No new node CRUD code. Because `Funnel`/`Stage` are registered (§4.1),
`parseRegistryLabel` (`api/src/routes/nodes.ts:33`) resolves them, so:

- `POST /api/v1/nodes/Funnel` / `POST /api/v1/nodes/Stage` → `handleNodePost`
  create (201), attributes validated against each label's `json_schema_doc` via
  the attribute-zod cache (a non-integer `stageOrder` → `400 attribute_violation`,
  AC-02).
- `GET`/`PATCH`/`DELETE /api/v1/nodes/{Funnel,Stage}/:id` → the graph-core
  handlers, per graph-core contract.

`FunnelBoard`'s stage-reorder (FR-14) PATCHes each moved stage's `stageOrder`
through `PATCH /api/v1/nodes/Stage/:id` (§6.5). `api/src/routes/nodes.ts` is
**not** edited (AC-07/NFR-02).

### 4.3 `HAS_STAGE` edge writes (FR-07, AC-08) — existing generic path

`HAS_STAGE` edges carry no range-checked attributes, so they use the existing
generic `POST /api/v1/edges` (`handleEdgePost`) / `DELETE /api/v1/edges/:id`. The
graph-core validator already enforces the FR-03 `Funnel→Stage` endpoint whitelist
(`400 edge_endpoint_label_mismatch` on any other pair, AC-03) and cross-type
edge-id uniqueness. `api/src/routes/edges.ts` is **not** edited (AC-08/NFR-02).

### 4.4 `CONVERTS_TO` transition write (FR-05, FR-07, AC-05, AC-06) — funnel-owned route, Rule C

`api/src/routes/funnels.ts` exports `handleFunnelTransitionPost(req)`:

1. `readJson(req)` → `funnelTransitionSchema.safeParse(body)` (§3.4). On failure
   (including a `conversionRate`/`dropOffRate` outside `[0,1]`) → throw
   `ValidationError("attribute_violation", …)` → `400 attribute_violation`
   (`api/src/errors.ts:24`, an existing closed `ERROR_CODES` member). (AC-06.)
2. Fold the two rates into the edge attributes and delegate to graph-core's
   `createEdge` exactly as `handleEdgePost` does:
   ```ts
   const { fromId, toId, conversionRate, dropOffRate, attributes } = parsed.data;
   const edge = await createEdge(getDriver(), {
     type: "CONVERTS_TO",
     fromId, toId,
     attributes: { ...attributes, conversionRate, dropOffRate },
   });
   return ok(edge, 201);
   ```
   `createEdge` runs `validateEdge` → the FR-04 `Stage→Stage` endpoint whitelist
   (`400 edge_endpoint_label_mismatch` on any other pair, AC-04) + cross-type
   edge-id uniqueness, then persists the rates as `attributes_json` on the
   relationship (round-trips intact on read — AC-05).

The route imports `createEdge` from `api/src/storage/edges.ts` (a read-only
import — it **calls** the exported function, it does **not** edit the file) and
does **not** import or touch `api/src/routes/edges.ts` or
`shared/src/schema/edges.ts` (Rule C, NFR-02, AC-06 git-diff check). A
`DELETE /api/v1/funnels/transitions/:id` is **not** built for the `must` — a
`CONVERTS_TO` edge is deleted through the generic `DELETE /api/v1/edges/:id`
(same as `HAS_STAGE`); the funnel route exists solely to gate the range-checked
**create**.

### 4.5 Funnel-composition + funnel-listing reads (FR-08, FR-09, AC-09, AC-09a, AC-10) — existing passthrough, Rule D

No new read route for the `must`. Both reads ride the existing
`POST /api/v1/query/cypher` (`handleCypher` → `runPassthrough`, read-only,
`query:read` — `api/src/routes/query.ts`, `rbac-permissions.ts:67`), the same
`api.cypher(...)` client `FunctionMap` uses (`pwa/src/api.ts:159`).

**Composition read (FR-08, AC-09/AC-09a)** — keyed on the funnel `id`
(globally-unique UUIDv7 → cannot cross models, Resolves C-02):

```cypher
MATCH (f:Funnel {id:$funnelId})
OPTIONAL MATCH (f)-[:HAS_STAGE]->(s:Stage)
WITH f, s ORDER BY s.stageOrder
OPTIONAL MATCH (s)-[c:CONVERTS_TO]->(s2:Stage)
RETURN f.id AS funnelId, f.name AS funnelName,
       s.id AS stageId, s.name AS stageName, s.attributes_json AS stageAttrs,
       c.attributes_json AS transitionAttrs, s2.id AS toStageId
ORDER BY s.stageOrder
```

Because the anchor is `Funnel {id:$funnelId}`, a SaaS-Operator funnel read never
returns a retail Model #1 funnel's stages/transitions (AC-09a). `stageOrder` and
the `conversionRate`/`dropOffRate` are recovered client-side by parsing the
returned `attributes_json` strings (mirrors `deserializeModel`, `models.ts:33`;
`FunctionMap`'s `toCount` coercion precedent).

**Listing read (FR-09, AC-10)** — scoped to the active operator model by the
`modelId` marker (Resolves C-06):

```cypher
MATCH (f:Funnel)
WHERE f.attributes_json CONTAINS $rootIdNeedle          // coarse index-free prefilter
OPTIONAL MATCH (f)-[:HAS_STAGE]->(s:Stage)
WITH f, count(s) AS stageCount
RETURN f.id AS id, f.name AS name, f.description AS description,
       f.attributes_json AS attributes_json, stageCount
ORDER BY f.name
```

`$rootIdNeedle` is the operator root id (`FunnelBoard` obtains it from
`useActiveModel()` by the OQ-1 marker, §6.2). The `CONTAINS` clause is a coarse
prefilter; `FunnelBoard` does the authoritative check by parsing each row's
`attributes_json` and keeping only rows whose `modelId === operatorRootId`
(a retail funnel has no `modelId`, or a different one → excluded, AC-10). This
keeps the listing confined to the active model without a `MATCH (:Funnel)`
unscoped scan and without a new `PART_OF` endpoint pair.

**Fallback (design-only, not built for the `must`).** If profiling ever shows the
passthrough insufficient (NFR-06's ≤50 ms p99 for ≤20 stages is comfortably
within `runPassthrough`'s caps for a single-funnel read), a read-only route owned
by this spec (in `api/src/routes/funnels.ts`, mapped to `query:read`) is the
escape hatch — it edits no `models.ts`/generic query file either way. Not built.

### 4.6 Drop-off analytics derivation (FR-11, AC-11) — linear chain, client-side

The analytics `FunnelBoard` surfaces are **descriptive read-only** derivations
over the composition payload (§4.5) — no writes, no store, no operational records
(XD-03):

- **Per-transition** conversion + drop-off = the `conversionRate`/`dropOffRate`
  parsed from each `CONVERTS_TO` edge's `attributes_json` (§4.4).
- **Overall funnel conversion** = the **product** of the per-transition
  `conversionRate`s along the ordered `Stage` chain (linear chain, OQ-2). For a
  3-stage funnel with transition rates 0.5 and 0.4 → `0.5 × 0.4 = 0.20` (AC-11).

**Edge cases rendered as the literal string `n/a` (never undefined, never a
crash, FR-11):** a **zero-stage** funnel → the empty-state branch (§6.3); a
**one-stage** funnel (no transition) → overall conversion renders `"n/a"`; a
**branch** (a stage with >1 outgoing `CONVERTS_TO`) → per-transition rates render
but overall conversion renders `"n/a"` (no multi-path/tree rendering for the
`must`). The derivation is O(stages), adds no round-trip beyond the §4.5 read
(NFR-06), and is unit-tested independently of the DOM
(`funnel-board-analytics.test.tsx`, AC-11) plus a server-side arithmetic check
(`funnel-analytics.test.ts`, AC-11).

## 5. HTTP API surface

One **new** route; everything else rides existing routes.

| Method | Route | FR | Request → Response | Permission |
|--------|-------|----|--------------------|------------|
| POST | `/api/v1/funnels/transitions` **(new)** | FR-05, FR-07 | `funnelTransitionSchema` → `201` `Edge` \| `400 attribute_violation` (range) \| `400 edge_endpoint_label_mismatch` (wrong pair) \| `409 id_conflict` | `edge:write` (reused, D-1) |
| GET | `/api/v1/ontology/node-labels/:name`, `/api/v1/ontology/edge-types/:name` | FR-06a | get-then-create guard probe (`200` → skip, `404` → create) | `ontology:read` (existing) |
| POST | `/api/v1/ontology/node-labels` | FR-01, FR-02 | label register (created only on the `GET` `404`; idempotent via the FR-06a get-then-create guard) | `ontology:write` (existing) |
| POST | `/api/v1/ontology/edge-types` | FR-03, FR-04 | edge-type register (created only on the `GET` `404`; idempotent via the FR-06a get-then-create guard) | `ontology:write` (existing) |
| POST/GET/PATCH/DELETE | `/api/v1/nodes/{Funnel,Stage}[/:id]` | FR-06 | generic registry-node CRUD | `node:write`/`node:read` (existing) |
| POST | `/api/v1/edges` | FR-07 | `HAS_STAGE` create (generic) | `edge:write` (existing) |
| DELETE | `/api/v1/edges/:id` | FR-07 | `HAS_STAGE`/`CONVERTS_TO` delete (generic) | `edge:write` (existing) |
| POST | `/api/v1/query/cypher` | FR-08, FR-09 | composition + listing reads (read-only) | `query:read` (existing) |

**Error codes.** No new `ERROR_CODES` member — `attribute_violation`,
`edge_endpoint_label_mismatch`, `id_conflict`, `invalid_payload` are all existing
closed members (`api/src/errors.ts`). **Permission.** No **new** RBAC permission
string — the new route reuses `edge:write`. Wiring for the new route (Deviation
D-1): one dispatch line in `api/src/router.ts`; one `P("POST",
"funnels/transitions", "edge:write")` line in `api/src/auth/rbac-permissions.ts`.

## 6. UI design

### 6.1 View-tree placement (FR-12, UX-06)

Route `#/business/funnels` → `FunnelBoard`, taken **verbatim** from the blueprint
View Tree (line 106/115). `saas-operator-foundation` (XD-05) already registered
the route in `pwa/src/route.ts` `SURFACES` (`business` surface, `funnels` tab) and
stood up a `BusinessTabPlaceholder` for it in `pwa/src/views/index.tsx`. This spec
**does not** edit `route.ts`/`SURFACES`; `parseHash`/`toHash` already resolve
`#/<surface>/<tab>` generically (`pwa/src/route.ts`). Deep link + active-model
context survive reload (AC-20); the in-view funnel selection resets to the picker
(OQ-4 `must`).

### 6.2 View registration (FR-12, NFR-02) — the single `VIEWS` entry

This feature's **only** PWA registration diff — replace the `funnels`
placeholder entry in `pwa/src/views/index.tsx` with the live view (one import line
+ one map line), leaving every sibling entry (`metrics`, `benchmarks`,
`operator`) as its `BusinessTabPlaceholder`:

```tsx
// import (added):
import { FunnelBoard } from "./business/FunnelBoard";
// business VIEWS map — only the funnels line changes:
funnels: (r) => <FunnelBoard route={r} />,   // was: BusinessTabPlaceholder tab="Funnels" …
```

Never `route.ts`/`SURFACES` (XD-05/NFR-02). This is the `ModelTabPlaceholder`
precedent the foundation established for sibling tabs.

### 6.3 Component plan

| Component | Source | Use |
|-----------|--------|-----|
| `ViewRegion`, `ViewHeader`, `Loading`, `EmptyState`, `ErrorState` | `pwa/src/views/_shared` (catalog) | landmark + header + loading/empty/error states |
| `useActiveModel()` | `pwa/src/context/ActiveModelContext` (consumed) | active-model context — never re-implemented |
| `api.cypher` | `pwa/src/api.ts:159` (existing) | composition + listing reads (FR-08/FR-09) |
| `Button` | `pwa/src/components/Button` (catalog) | retry, move-up/down, picker affordances |
| `FunnelBoard` | **new**, `pwa/src/views/business/FunnelBoard.tsx` | the interactive stage board |

No new low-level primitive is invented — `FunnelBoard` composes catalog
components + a CSS module (`FunnelBoard.module.css`), mirroring `FunctionMap.tsx`
(the foundation precedent, verified present with the same
`useActiveModel`/`api.cypher`/`_shared` composition).

### 6.4 `FunnelBoard` — subject, reads, states (FR-13, AC-12..AC-15)

Route `#/business/funnels`. Consumes `useActiveModel()` and resolves the
SaaS-Operator root by the same OQ-1 marker `FunctionMap` uses
(`name:"SaaS Operator"` + `attributes.saasOperatorRoot === true`), defaulting to
it even when the active model is something else (FR-13). Two reads:

1. On mount → the **listing** read (§4.5) → the funnel picker's options (name +
   `stageCount`), filtered client-side to `modelId === operatorRootId` (C-06).
2. On funnel select → the **composition** read (§4.5) keyed on the chosen funnel
   `id` → the ordered stages + transitions + the §4.6 analytics.

**States (UX-01):**

- **loading** (AC-13) — a skeleton (`Loading`) while the listing or composition
  fetch is in flight.
- **empty** (AC-14) — the SaaS-Operator model resolves but the listing returns
  zero `Funnel` nodes: `EmptyState` prompting that content specs (marketing/sales)
  seed funnels.
- **error** (AC-15) — a read failed (including a `runPassthrough` timeout/cap
  hit): `ErrorState` + a `Button` retry that refetches.
- **ready** (AC-12) — the picker + the selected funnel's stage board: stage
  cards in `stageOrder`, each transition annotated with its `conversionRate`/
  `dropOffRate`, and the overall funnel conversion (or `"n/a"`, §4.6) as a
  summary.

### 6.5 Interactive stage board — reorder (FR-14, AC-17, AC-18) — UX-03

The stage board is the interactive surface UX-03 names. Reorder is available two
ways, neither pointer-only:

- **Pointer drag (mouse + trackpad, AC-17).** Each stage card has a drag handle.
  Reorder uses **pointer events** (`pointerdown`/`pointermove`/`pointerup` with
  `setPointerCapture` on the handle) rather than the HTML5 DnD API, so there is no
  native drag-image to fight. On drop, the new ordinal positions are computed and
  each **moved** stage's `stageOrder` is persisted by `PATCH /api/v1/nodes/Stage/:id`
  (FR-06), then the composition read (§4.5) re-runs to reflect the persisted
  order.
- **Explicit keyboard move controls (AC-18, OQ-3).** Each stage card carries a
  **move-up** and **move-down** `Button`. Tab reaches them in DOM order; Enter/
  Space swaps the card with its neighbor, PATCHing the two affected stages'
  `stageOrder` and re-reading identically to the drag path. Focus stays on the
  moved stage's move-up button after the move. **No arrow-key capture** — this is
  why OQ-3 chose buttons: the browser's global arrow-scroll is never stolen, so
  the Native Conflicts arrow-key row is not needed (C-03).

A reorder issues at most one PATCH per **moved** stage (NFR-06); an adjacent
swap issues two.

**Native Conflicts (UX-03) — drag path suppressions**, implemented exactly as the
requirements' table pins them:

| Native behavior | Suppression |
|-----------------|-------------|
| Native text selection during pointer drag | `e.preventDefault()` on the handle's `pointerdown`; `user-select:none` (token'd `.dragging` class) on the card while dragging |
| HTML5 drag-image / `dragover` default | Pointer events + `setPointerCapture` (HTML5 DnD API not used) — no native drag-image exists to suppress |
| Trackpad/touch scroll (pan) mid-drag | `touch-action:none` (token'd `.handle` class) on the drag handle so the browser does not claim the gesture for scroll |
| Keyboard reorder (move-up/down buttons) | **none needed** — plain focusable buttons activate on Enter/Space and capture no keys (OQ-3, C-03) |

`FunnelBoard` is desktop-first; touch drag rides the same pointer path but is
best-effort, not a specced platform target (UX-04).

### 6.6 Accessibility (FR-13, FR-14, AC-19) — UX-05

The view root is the catalog `ViewRegion` (`<section aria-label>`) landmark. Tab
order in DOM order: the section landmark → the funnel picker → each stage card's
controls (move-up, move-down) in `stageOrder`. Every interactive element is a
native `<button>`/anchor activating on Enter/Space (no interactive element is
pointer-only — AC-19). No focus trap, no gesture-only affordance.

### 6.7 Tokens + design conformance (NFR-05, AC-16) — UX-02, UX-04

`FunnelBoard.tsx` styles via `FunnelBoard.module.css` using **only** `var(--…)`
tokens from `pwa/src/styles/companygraph/tokens.css` (same token file
`FunctionMap.module.css` uses); catalog components before any new one;
desktop-first, no new breakpoints. AC-16 runs `bun scripts/design-conformance.ts
--view pwa/src/views/business/FunnelBoard.tsx` and the same for the `.module.css`,
both expected exit 0 (the enforced two-invocation form, foundation precedent).

### 6.8 Inline editing + funnel-id deep-link (FR-15, `should`)

`FunnelBoard` **may** offer inline create/rename/delete of stages (via FR-06 node
CRUD) and edit of a transition's `conversionRate`/`dropOffRate` (via the FR-07
funnel-owned route), and **may** deep-link the selected funnel id into the hash
via the existing `entityId` route field (`pwa/src/route.ts:148`) so a specific
funnel survives reload (beyond the `must`'s reset-to-picker). Marked `should`
(no AC gates it) — built only if wave-2 needs it, obeying the same view-state /
tokens-only / keyboard-reachability rules. Authoring the *content* of the
marketing/sales funnels stays out of scope (content specs).

## 7. Wiring

- **`package.json`** — add `"seed:funnel-pipeline": "bun --cwd api scripts/seed-funnel-pipeline.ts"`
  (matches the existing `bun --cwd api scripts/…` seed-script form). The script
  calls `ensureFunnelOntology(baseUrl)` (§4.1) so the four constructs are
  registered idempotently before any content seed runs (Risk #5). It seeds **no**
  funnel instances (those are content-spec-owned).
- **`api/src/router.ts`** — one **additive** dispatch line (Deviation D-1):
  `if (sub === "funnels/transitions" && method === "POST") return handleFunnelTransitionPost(req);`
  placed with the other resource routes.
- **`api/src/auth/rbac-permissions.ts`** — one **additive** mapping line (D-1):
  `P("POST", "funnels/transitions", "edge:write")` — reusing the existing
  `edge:write` permission (no **new** permission string).

## 8. Test strategy

| AC | Kind | Test file |
|----|------|-----------|
| AC-01 | integration (Neo4j) | `api/__tests__/funnel-registry.integration.test.ts` — `ensureFunnelOntology` registers `Funnel`; run **twice** → exactly one label, the second run `GET`s `Funnel` (200) and **skips** the create (get-then-create guard, B-03), erroring nothing; `GET …/node-labels/Funnel` returns it; **manual** `git diff shared/src/schema/nodes.ts` → no additions (NFR-01) |
| AC-02 | integration (Neo4j) | `api/__tests__/funnel-registry.integration.test.ts` — `Stage` label `json_schema_doc` requires integer `stageOrder`; `POST /api/v1/nodes/Stage` with non-integer/missing `stageOrder` → `400 attribute_violation` (C-05) |
| AC-03 | integration (Neo4j) + CLI | `api/__tests__/funnel-edges.integration.test.ts` — `HAS_STAGE` endpoints `Funnel→Stage`; wrong pair (`Stage→Funnel`) → `400 edge_endpoint_label_mismatch`; **manual** `git diff shared/src/schema/edges.ts` → no additions |
| AC-04 | integration (Neo4j) | `api/__tests__/funnel-edges.integration.test.ts` — `CONVERTS_TO` endpoints `Stage→Stage`; wrong pair → `400 edge_endpoint_label_mismatch` |
| AC-05 | integration (Neo4j) | `api/__tests__/funnel-edges.integration.test.ts` — `CONVERTS_TO` via the funnel route with valid rates persists `conversionRate`/`dropOffRate`; read round-trips them through `attributes_json` |
| AC-06 | integration (Neo4j) + CLI | `api/__tests__/funnel-edges.integration.test.ts` — out-of-range rate → `400 attribute_violation`; in-range → `201` persisted; delegated `createEdge` still applies the endpoint whitelist; **manual** `git diff --stat api/src/routes/edges.ts api/src/storage/edges.ts shared/src/schema/edges.ts` → no change |
| AC-07 | integration (Neo4j) + CLI | `api/__tests__/funnel-crud.integration.test.ts` — `Funnel`/`Stage` node CRUD round-trip via the generic path; **manual** `git diff --stat api/src/routes/nodes.ts` → no change |
| AC-08 | integration (Neo4j) + CLI | `api/__tests__/funnel-crud.integration.test.ts` — `HAS_STAGE` via `POST /api/v1/edges` links funnel→stage; composition read returns it; **manual** `git diff --stat api/src/routes/edges.ts` → no change |
| AC-09 | integration (Neo4j) | `api/__tests__/funnel-read.integration.test.ts` — composition read via `POST /api/v1/query/cypher` returns funnel + stages ordered by `stageOrder` + `CONVERTS_TO` rates |
| AC-09a | integration (Neo4j) | `api/__tests__/funnel-read.integration.test.ts` — with a SaaS-Operator funnel **and** a retail funnel present, the id-keyed composition read returns only the SaaS-Operator funnel's stages (scope isolation, C-02) |
| AC-10 | integration (Neo4j) | `api/__tests__/funnel-read.integration.test.ts` — listing scoped to the operator root's `modelId` marker excludes a retail funnel; each row carries a `stageCount` (C-06) |
| AC-11 | unit (server) + unit (PWA) | `api/__tests__/funnel-analytics.test.ts` (product `0.5×0.4=0.20`; single-stage → `n/a`) + `pwa/src/__tests__/funnel-board-analytics.test.tsx` (same derivation, DOM-independent) |
| AC-12 | unit (PWA) | `pwa/src/__tests__/funnel-board.test.tsx` — ready state: picker, ordered stages, per-transition + overall conversion (mocked `api.cypher`) |
| AC-13, AC-14, AC-15 | unit (PWA) | `pwa/src/__tests__/funnel-board-states.test.tsx` — loading / empty / error(+retry) |
| AC-16 | manual (CLI) | `bun scripts/design-conformance.ts --view pwa/src/views/business/FunnelBoard.tsx` and `… FunnelBoard.module.css` → both exit 0 |
| AC-17 | manual | stack up, `#/business/funnels`, drag 2nd stage above 1st → board reorders, one `PATCH /api/v1/nodes/Stage/:id` per moved stage (Network tab), reload shows persisted order |
| AC-18 | manual | `#/business/funnels`, Tab to 2nd stage's move-up, Enter → stage moves up, focus stays on its move-up button, PATCH per moved stage fires, new `stageOrder` persists on reload; no arrow-key capture |
| AC-19 | manual | `#/business/funnels`, Tab through → focus lands on the section landmark, then the funnel picker, then each stage's controls in order, each activating on Enter/Space |
| AC-20 | e2e (Playwright) | `pwa/playwright/business-funnels-reload.spec.ts` — deep link `#/business/funnels` survives reload; active model (operator root) still the subject; in-view funnel selection resets to the picker (OQ-4) |
| AC-21 | CLI | `bun run typecheck` exit 0; **manual** `git diff --stat` → changes confined to `pwa/src/views/business/FunnelBoard.*`, the one `VIEWS` entry in `pwa/src/views/index.tsx`, **new** `api/` funnel files (`api/src/routes/funnels.ts`, `api/src/seed/ensure-funnel-ontology.ts`, `api/scripts/seed-funnel-pipeline.ts`, funnel tests), and the two **additive** D-1 wiring lines (`api/src/router.ts`, `api/src/auth/rbac-permissions.ts`); **no** edit to `shared/src/schema/{nodes,edges}.ts`, `pwa/src/route.ts`, `SURFACES`, `api/src/routes/{edges,nodes,query}.ts`, `api/src/storage/edges.ts`; **no** new RBAC permission string |

**Fixture precondition.** The server integration tests (AC-01..AC-10) run
`ensureFunnelOntology` as their setup step and create their own throwaway
`Funnel`/`Stage` nodes; they do not depend on any content-wave-2 seed. AC-09a/
AC-10 additionally create a stub "retail" funnel (a `Funnel` with a different/
absent `modelId`) to prove scope isolation.

## 9. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `api/src/seed/ensure-funnel-ontology.ts` | new | FR-01, FR-02, FR-03, FR-04, FR-06a | `ensureFunnelOntology` — **get-then-create guard**: `GET` each construct, `POST` only on `404` (B-03); order `Funnel`→`Stage`→`HAS_STAGE`→`CONVERTS_TO` |
| `api/src/routes/funnels.ts` | new | FR-05, FR-07 | `funnelTransitionSchema` + `handleFunnelTransitionPost` — range-validate `[0,1]` → `400 attribute_violation`, delegate to `createEdge` (Rule C) |
| `api/scripts/seed-funnel-pipeline.ts` | new | FR-01..FR-04 | CLI: `ensureFunnelOntology(baseUrl)` (register-before-use, Risk #5); seeds no instances |
| `package.json` | modify | FR-01..FR-04 | add `seed:funnel-pipeline` script (`bun --cwd api scripts/…` form) |
| `api/src/router.ts` | modify | FR-07 | **additive** — one dispatch line for `POST /api/v1/funnels/transitions` (Deviation D-1) |
| `api/src/auth/rbac-permissions.ts` | modify | FR-07, FR-10 | **additive** — one `P("POST","funnels/transitions","edge:write")` mapping (reuses `edge:write`; no **new** permission string) (D-1) |
| `pwa/src/views/business/FunnelBoard.tsx` | new | FR-13, FR-14, FR-15 | the live interactive stage board, four states, pointer + keyboard reorder |
| `pwa/src/views/business/FunnelBoard.module.css` | new | FR-13, NFR-05 | tokens-only styling (`.grid`/`.card`/`.handle`/`.dragging`) |
| `pwa/src/views/index.tsx` | modify | FR-12 | replace **only** the `funnels` `VIEWS` entry (import + map line) — the sole PWA registration diff (XD-05) |
| `api/__tests__/funnel-registry.integration.test.ts` | new | AC-01, AC-02 | |
| `api/__tests__/funnel-edges.integration.test.ts` | new | AC-03, AC-04, AC-05, AC-06 | |
| `api/__tests__/funnel-crud.integration.test.ts` | new | AC-07, AC-08 | |
| `api/__tests__/funnel-read.integration.test.ts` | new | AC-09, AC-09a, AC-10 | |
| `api/__tests__/funnel-analytics.test.ts` | new | AC-11 | |
| `pwa/src/__tests__/funnel-board.test.tsx` | new | AC-12 | |
| `pwa/src/__tests__/funnel-board-states.test.tsx` | new | AC-13, AC-14, AC-15 | |
| `pwa/src/__tests__/funnel-board-analytics.test.tsx` | new | AC-11 | |
| `pwa/playwright/business-funnels-reload.spec.ts` | new | AC-20 | |

**Explicitly NOT edited** (ownership boundaries — spec-guard must not allow):
`shared/src/schema/{nodes,edges}.ts` (no compile-time label/edge, NFR-01);
`api/src/routes/edges.ts`, `api/src/storage/edges.ts` (graph-core generic edge
path — the funnel route only *imports* `createEdge`, never edits the file, Rule C);
`api/src/routes/nodes.ts`, `api/src/routes/query.ts` (graph-core node CRUD +
query passthrough, reused as-is);
`pwa/src/route.ts`, `SURFACES`, and every sibling `VIEWS` entry
(`saas-operator-foundation`-owned, XD-05 — only the `funnels` entry changes);
`api/src/routes/ontology-{node-labels,edge-types}.ts` + the ontology storage
(ontology-manager-owned, reused as-is);
`api/scripts/seed-saas-operator.ts` (foundation-owned seed loader);
risk/SLA/change/performance/metric-library code.
**Additive-only** (D-1, not a rewrite): `api/src/router.ts` (one dispatch line),
`api/src/auth/rbac-permissions.ts` (one mapping line, reusing `edge:write`).

## 10. Traceability

| FR | Design | ACs |
|----|--------|-----|
| FR-01 | §3.1, §4.1 | AC-01 |
| FR-02 | §3.2, §4.1 | AC-02 |
| FR-03 | §3.3, §4.1 | AC-03 |
| FR-04 | §3.3, §4.1 | AC-04 |
| FR-05 | §3.4, §4.4 | AC-05, AC-06 |
| FR-06 | §4.2 | AC-02, AC-07 |
| FR-06a | §4.1 (Rule B, get-then-create) | AC-01, AC-03, AC-04 |
| FR-07 | §3.4, §4.3, §4.4, §5, §7 | AC-05, AC-06, AC-08 |
| FR-08 | §4.5 | AC-09, AC-09a |
| FR-09 | §4.5 | AC-10 |
| FR-10 | §5, §7 (D-1) | AC-21 |
| FR-11 | §4.6 | AC-11 |
| FR-12 | §6.1, §6.2 | AC-20, AC-21 |
| FR-13 | §6.3, §6.4, §6.7 | AC-12, AC-13, AC-14, AC-15, AC-16 |
| FR-14 | §6.5, §6.6 | AC-17, AC-18, AC-19 |
| FR-15 (`should`) | §6.8 | (no AC — acceptable for `should`) |
| NFR-01 | §3, §9 | AC-01, AC-03, AC-21 |
| NFR-02 | §4.2, §4.3, §4.4, §6.2, §9 | AC-06, AC-07, AC-08, AC-21 |
| NFR-03 | §4.1 | AC-01, AC-03, AC-04 |
| NFR-04 | §3.4, §5, §7 | AC-21 |
| NFR-05 | §6.7 | AC-16 |
| NFR-06 | §4.5, §4.6, §6.5 | AC-11, AC-17 |

## 11. Rejected alternatives

- **Per-edge-type `json_schema_doc` for `CONVERTS_TO` range validation.** No such
  mechanism exists for edges: the attribute-zod cache validates **node** labels
  only (`api/src/ontology/cache/attribute-zod.ts`) and `edgeCreateSchema.attributes`
  is a free `z.record(z.unknown())` (`shared/src/schema/edges.ts:59`). Rejected →
  the funnel-owned transition route (§4.4).
- **Inline `type==="CONVERTS_TO"` branch in `handleEdgePost` / `createEdge`.**
  Both files are graph-core-owned; a branch there violates NFR-02. Rejected →
  the new funnel route (Rule C, §4.4).
- **UI-only soft range guard in `FunnelBoard`.** Leaves the stored data
  untrustworthy for the cockpit rollup (defeats FR-05 motivation 4) and guards
  neither the seed path nor any future direct POST. Rejected → server-side range
  check (§4.4). (Requirements OQ-1 rejected this as option (c).)
- **Leaving `POST /api/v1/funnels/transitions` unmapped in `rbac-permissions.ts`.**
  `getRoutePermission` returns `null` for an unmapped route, and the router gate
  lets a `null`-permission route through on **any** authenticated session
  (`router.ts:386-395`) — strictly weaker than the `edge:write` the generic edge
  route requires (a security regression). Rejected → an additive `edge:write`
  mapping (D-1, §5, §7).
- **A new `PART_OF` `Funnel→Domain` endpoint pair for the FR-09 listing scope.**
  Adding that endpoint pair to the registry is a modeling decision about *where*
  funnels attach in the graph — a content-wave-2 concern (marketing/sales own
  their funnels' attachment), and it would drag this foundation feature into
  content territory. Rejected → a `Funnel.attributes.modelId` marker + client-side
  filter (Rule D, §4.5, Resolves C-06).
- **Arrow-key-on-card reorder.** Would need `e.preventDefault()` on the handled
  arrow keydown to avoid stealing the browser's global arrow-scroll, plus a
  documented key the a11y story must teach. Rejected → explicit move-up/down
  buttons (OQ-3, §6.5, C-03).
- **A branching-DAG funnel model.** No wave-2 content needs it; it complicates
  both the analytics (§4.6) and the single-column stage-board rendering. Rejected
  → strict linear chain for the `must`; a branch renders overall conversion as
  `"n/a"` (OQ-2, §4.6).
- **A new read-only funnel route for FR-08/FR-09.** The existing
  `POST /api/v1/query/cypher` passthrough expresses both reads within its caps;
  a new route is a design-only fallback if profiling ever shows the passthrough
  insufficient. Not built (§4.5).
