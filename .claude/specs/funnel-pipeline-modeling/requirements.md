---
feature: "funnel-pipeline-modeling"
created: "2026-07-06"
author: "spec-author"
status: "revised"
revision: 3
size: "large"
---

# Requirements: funnel-pipeline-modeling

## Summary

`funnel-pipeline-modeling` is **foundation wave 1b** of the SaaS-Operator
business-process model (blueprint `.claude/specs/blueprint-saas-operator.md`),
scheduled in **wave 1b** alongside the sibling `saas-metric-library` after
`saas-operator-foundation` (this spec does **not** depend on `saas-metric-library`;
C-04 — the two are independent wave-1b siblings). It delivers the **multi-stage funnel/pipeline
construct** that the core `PRECEDES` edge cannot express: a **`Funnel`** and a
**`Stage`** runtime ontology-registry label, a **`HAS_STAGE`** edge
(`Funnel`→`Stage`) and a **`CONVERTS_TO`** edge (`Stage`→`Stage`) that carries
**conversion-rate / drop-off** attributes (XD-02), REST CRUD over those
constructs under `/api/v1/`, and the **`FunnelBoard`** PWA view at
`#/business/funnels` — an interactive stage board with drop-off analytics.

**Revision 2 (Resolves review-requirements pass 1).** All four open questions
are now **CLOSED in-artifact** to their recommended defaults per the XD-09
single-shot "zero open questions" gate (B-01), mirroring the sibling
`saas-operator-foundation` rev-2: OQ-1 → **funnel-owned server route validates
`CONVERTS_TO` range, returns `400 attribute_violation`** (B-01/C-01); OQ-2 →
**linear chain for the `must`**, branch deferred (B-01); OQ-3 → **reorder-only
`must` via explicit move-up/down buttons**, no global arrow-key capture (B-01);
OQ-4 → **reset-to-picker on reload** for the `must` (B-01). AC-06 and AC-18 are
rewritten to assert single deterministic outcomes (B-02); the FR-08/FR-09 read
default is fixed with a scope-isolation AC (C-02); the Native Conflicts
arrow-key branch is demoted to a rejected-note (C-03).

**Revision 3 (Resolves review-requirements B-03 — the one remaining blocker).**
The reviewer's B-03 verified that the public ontology-registry create routes are
**strict-CREATE** (returning `409 name_conflict` on a duplicate name), and that
the only MERGE-idempotent path is the seed-loader over the *compile-time* tuples —
to which this spec adds **nothing** (XD-02). So the rev-2 "re-register is a clean
no-op" claim on FR-01..FR-04 / NFR-03 / AC-01 could not hold as written. Rev 3
makes idempotency **real** via a **get-then-create guard** in the new
feature-owned registration routine `ensureFunnelOntology` (**FR-06a**): for each
of the four constructs the routine `GET`s it by name and `POST`s only on `404`, so
a second run is a *verified* no-op that never re-hits the strict-CREATE route.
FR-01..FR-04 and NFR-03 are re-worded to name this mechanism; **AC-01 is realigned
to assert the routine's idempotency** (not that the strict-CREATE route is itself
a no-op). Stable IDs preserved; no ownership or scope change.

It is the construct wave-2 content specs (`marketing-process-model`,
`sales-process-model`) instantiate to author their actual marketing/sales
funnels. This spec **does not** author any funnel instance (the marketing and
sales funnels are owned by those content specs); it **does not** own or edit
`route.ts` / `SURFACES` / `views/index.tsx` (registered up-front by
`saas-operator-foundation`, XD-05 — this spec owns **only** its
`FunnelBoard.tsx` view component file and one `VIEWS` entry (its import + map line) replacement);
it **does not** add any compile-time `NODE_LABELS` / `EDGE_TYPES` entry (XD-02 —
registry only); and it does **not** touch the metric library (`saas-metric-library`).

## Motivation

1. The core process graph's ordered-flow edge, **`PRECEDES`** (`Activity`→`Activity`),
   expresses *sequence* but has **no conversion semantics** — it cannot say
   "62% of visitors who reach Stage A advance to Stage B; 38% drop off." A SaaS
   operator's marketing and sales journeys are fundamentally funnels
   (visitor → lead → MQL → SQL → opportunity → closed-won), and the whole
   blueprint (XD-02, Feature Inventory row `funnel-pipeline-modeling`) calls out
   that the funnel construct is a **net-new capability the current engine lacks**.
2. Two wave-2 content specs (`marketing-process-model`, `sales-process-model`)
   **depend on this feature** (blueprint Dependency Graph) — they instantiate a
   marketing funnel and a sales pipeline respectively. Without the `Funnel`/`Stage`
   labels and the `HAS_STAGE`/`CONVERTS_TO` edges registered first, those content
   seeds would reference labels that do not exist (blueprint Risk "New label
   registration timing"). Wave ordering exists precisely so this construct lands
   before content wave 2.
3. The blueprint View Tree pre-registers `#/business/funnels` → `FunnelBoard`
   (owner `funnel-pipeline-modeling`). The route already resolves to a
   `BusinessTabPlaceholder` after foundation; this feature must replace that
   placeholder with the live interactive stage board that visualizes a funnel's
   stages and its stage-to-stage conversion/drop-off, satisfying UX-03's explicit
   requirement that the **FunnelBoard** carry Platforms & Input Modes and Native
   Conflicts tables (interactive stage board / drag).
4. Conversion analytics (per-stage drop-off, overall funnel conversion) are a
   read the operator cockpit (`cross-function-exec-rollup`, wave 3) will roll up.
   Defining conversion/drop-off as **first-class edge attributes on `CONVERTS_TO`**
   (not derived, not stored off-graph) keeps the funnel model self-contained on
   the process graph and gives the cockpit a single governed source.

## Functional Requirements

<!-- Priorities: must = M1 walking-skeleton / content-wave-2 unblock depends on
     it; should = polish. Grouped by capability. -->

### Runtime registry: `Funnel` / `Stage` labels + `HAS_STAGE` / `CONVERTS_TO` edges (XD-02)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **`Funnel` runtime node label** is registered via the existing ontology-registry route `POST /api/v1/ontology/node-labels` (`handleCreateNodeLabel`, `api/src/routes/ontology-node-labels.ts`; validated by `nodeLabelCreateSchema`, `shared/src/schema/ontology.ts:178`) with a `json_schema_doc` (JSON-Schema 2020-12 supported subset) describing its attributes. It is **not** added to the compile-time `NODE_LABELS` tuple in `shared/src/schema/nodes.ts` (XD-02 — rejected: core-schema additions). **Idempotency (Resolves: B-03).** The public create route is strict-CREATE — it returns `409 name_conflict` on a duplicate name (verified `api/src/ontology/storage/node-labels.ts:193`) and this spec adds **nothing** to the compile-time tuples the seed-loader MERGE covers, so re-POSTing is *not* a clean no-op at the route level. Idempotency is therefore made real in **this feature's own seed/registration routine** (FR-06a) via a **get-then-create guard**: the routine first `GET`s `/api/v1/ontology/node-labels/Funnel`; if it returns `200`, the label already exists and the routine skips the create (a verified no-op); only on `404` does it `POST` the label. Running the routine twice leaves exactly one `Funnel` label and errors nothing. The label name is `Funnel` (PascalCase, matches `NODE_LABEL_NAME_REGEX`). | must | XD-02 |
| FR-02 | **`Stage` runtime node label** is registered the same way (`POST /api/v1/ontology/node-labels`), with a `json_schema_doc` describing at minimum a **`stageOrder`** integer attribute (the stage's ordinal position in its funnel) so a funnel's stages have a deterministic order independent of graph traversal. Registration is idempotent via the same **get-then-create guard** as FR-01 (`GET /api/v1/ontology/node-labels/Stage`; `POST` only on `404`; re-run is a verified no-op) (Resolves: B-03). Label name is `Stage`. | must | XD-02 |
| FR-03 | **`HAS_STAGE` runtime edge type** (`Funnel`→`Stage`) is registered via `POST /api/v1/ontology/edge-types` (`handleCreateEdgeType`, `api/src/routes/ontology-edge-types.ts`; validated by `edgeTypeCreateSchema`, `shared/src/schema/ontology.ts:236`) with its `endpoints` set to the single pair `{ fromLabel:"Funnel", toLabel:"Stage" }`. Registering the edge type writes the `_OntologyEdgeEndpoint` rows the edge-write validator reads via `getEdgeEndpoints` (`api/src/ontology/cache/edge-endpoints.ts`), so a `HAS_STAGE` edge whose endpoints are anything other than `Funnel`→`Stage` is rejected `400 edge_endpoint_label_mismatch` (`api/src/storage/edges.ts:91`). It is **not** added to compile-time `EDGE_TYPES`/`EDGE_ENDPOINTS` (XD-02). Idempotency is made real via the same **get-then-create guard** as FR-01 (`GET /api/v1/ontology/edge-types/HAS_STAGE`; `POST` only on `404`; re-run is a verified no-op) (Resolves: B-03). | must | XD-02 |
| FR-04 | **`CONVERTS_TO` runtime edge type** (`Stage`→`Stage`) is registered via `POST /api/v1/ontology/edge-types` with `endpoints` `{ fromLabel:"Stage", toLabel:"Stage" }`. It is the conversion edge `PRECEDES` cannot be (motivation 1): `CONVERTS_TO` carries the conversion/drop-off data (FR-05) as edge attributes. `Stage`→`Stage` endpoints only — any other pair rejected `400 edge_endpoint_label_mismatch`. Not added to compile-time `EDGE_TYPES` (XD-02). Idempotency is made real via the same **get-then-create guard** as FR-01 (`GET /api/v1/ontology/edge-types/CONVERTS_TO`; `POST` only on `404`; re-run is a verified no-op) (Resolves: B-03). | must | XD-02 |
| FR-05 | **`CONVERTS_TO` carries conversion-rate / drop-off attributes, range-validated at a funnel-owned seam.** A `CONVERTS_TO` edge's `attributes` map (stored as `attributes_json` on the relationship, `api/src/storage/edges.ts:134`) carries at minimum **`conversionRate`** (a number in `[0,1]` — the fraction of the source stage's population that advances to the target stage) and **`dropOffRate`** (a number in `[0,1]` — the complement fraction that leaves the funnel at this transition). **Decision (Resolves: B-01/OQ-1, C-01): the `[0,1]` range is enforced server-side by a funnel-owned route that fronts `CONVERTS_TO` edge writes** (FR-07), returning **`400 attribute_violation`** (an existing closed `ERROR_CODES` member, `api/src/errors.ts:24`) on an out-of-range value. This keeps the graph's stored conversion data trustworthy for the cockpit rollup (motivation 4) **without** editing an owned-elsewhere file: verified today, `edgeCreateSchema.attributes` is a free `z.record(z.unknown()).default({})` (`shared/src/schema/edges.ts:59`) and the attribute-zod cache validates **node labels only** (`api/src/ontology/cache/attribute-zod.ts:3`), so there is no per-edge-type attribute validation in the generic edge path — and both `shared/src/schema/edges.ts` and `api/src/routes/edges.ts` / `api/src/storage/edges.ts` are graph-core files this spec does **not** own (NFR-02). Adding a `type==="CONVERTS_TO"` branch there would violate ownership. The range check therefore lives in a **new funnel-owned server route** (see FR-07), not in the generic write path. (Rejected: **(a-schema)** a per-edge-type `json_schema_doc` — no such mechanism exists for edges today; **(c)** UI-only soft guard — leaves the stored data untrustworthy for the cockpit, defeating motivation 4.) This feature defines the attribute contract (names, `[0,1]` ranges, `conversionRate + dropOffRate` semantics); the funnel-analytics read (FR-11) derives per-funnel roll-ups from these attributes. | must | XD-02, blueprint scope |

### REST CRUD for funnels + stages + conversion edges (via existing graph write paths)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-06 | **Funnel / Stage node CRUD** reuses the existing generic registry-node CRUD under `/api/v1/nodes/:label` — `POST /api/v1/nodes/Funnel` and `POST /api/v1/nodes/Stage` (create, `handleNodePost`), `GET`/`PATCH`/`DELETE /api/v1/nodes/{Funnel,Stage}/:id` (`api/src/routes/nodes.ts`). Because `Funnel`/`Stage` are registered runtime labels (FR-01/FR-02), `parseRegistryLabel` resolves them and node attributes are validated against each label's `json_schema_doc` via the attribute-zod cache (`api/src/ontology/cache/attribute-zod.ts`). This feature adds **no new node CRUD route** — it relies on the runtime-label path graph-core already ships. A `Stage` write with a non-integer `stageOrder` fails attribute validation (`400 attribute_violation`). | must | XD-02, graph-core node CRUD |
| FR-06a | **Feature-owned idempotent registration routine (`ensureFunnelOntology`) — the real B-03 mechanism (Resolves: B-03).** A **feature-owned** routine (`api/src/seed/ensure-funnel-ontology.ts`, exported and invoked by the `seed:funnel-pipeline` CLI, FR-01..FR-04) registers the four constructs in dependency order (`Funnel` → `Stage` → `HAS_STAGE` → `CONVERTS_TO`, since `assertEndpointLabelsExist` requires the endpoint labels first). For each construct it performs a **get-then-create guard**: (i) `GET` the construct by name (`GET /api/v1/ontology/{node-labels,edge-types}/<name>`); (ii) on `200`, the construct already exists — **skip the create** (verified no-op); (iii) on `404`, `POST` the registration payload. This makes idempotency real *in the routine* without editing the strict-CREATE registry routes or the compile-time tuples (XD-02, NFR-01): a first run creates all four; a second run finds all four via `GET` and creates nothing. The routine drives the loopback API as trusted operator tooling (same posture as `ensureOperatorRoot`/`ensureMetricDefinitionLabel`). It does **not** author any funnel *instance* (content-spec-owned). | must | XD-02, B-03 |
| FR-07 | **`HAS_STAGE` / `CONVERTS_TO` edge writes go through a funnel-owned route (Resolves: B-01/OQ-1, C-01).** `HAS_STAGE` edges (which carry no range-checked attributes) may use the existing generic edge path — `POST /api/v1/edges` (`handleEdgePost`, `api/src/routes/edges.ts`; body `{ type, fromId, toId, attributes }` per `edgeCreateSchema`) and `DELETE /api/v1/edges/:id` — since the graph-core validator already enforces the FR-03 endpoint whitelist and cross-type edge-id uniqueness (per CLAUDE.md). **`CONVERTS_TO` writes go through a new funnel-owned route** (e.g. `POST /api/v1/funnels/transitions`, exact path named at design) that: (i) range-validates `attributes.conversionRate`/`attributes.dropOffRate` ∈ `[0,1]` with `zod` and returns **`400 attribute_violation`** on violation (FR-05), then (ii) delegates the write to graph-core's `createEdge` (`api/src/storage/edges.ts`) exactly as `handleEdgePost` does — so the FR-04 endpoint whitelist and edge-id uniqueness still apply. This route file is **owned by this spec** (a new file under `api/src/routes/`); it does **not** edit `api/src/routes/edges.ts`, `api/src/storage/edges.ts`, or `shared/src/schema/edges.ts` (NFR-02). It is mapped to the same graph-write permission the generic `/api/v1/edges` route already uses — **no new RBAC permission string** (FR-10). This feature adds **no new *generic* edge CRUD route** and does not modify the generic one; it adds one thin funnel-owned validating wrapper. | must | XD-02, graph-core edge CRUD, C-01 |
| FR-08 | **Funnel composition read** — a read that, given a funnel id, returns the funnel node plus its ordered stages (`HAS_STAGE`, ordered by `stageOrder`) and the `CONVERTS_TO` edges between them with their `conversionRate`/`dropOffRate`. **Decision (Resolves: C-02): the read is served by the existing read-only passthrough Cypher route** `POST /api/v1/query/cypher` (`handleCypher` → `runPassthrough`, `api/src/routes/query.ts:3,150`; read-only, mapped to `query:read`), which `FunctionMap` already uses (`api.cypher`). The shape is expressible in one scoped statement — `MATCH (f:Funnel {id:$id})-[:HAS_STAGE]->(s:Stage) OPTIONAL MATCH (s)-[c:CONVERTS_TO]->(s2:Stage) RETURN f, s, c, s2 ORDER BY s.stageOrder` — so **no new route is needed for the `must`**. A new read-only route owned by this spec (not an owned-elsewhere file, mapped to `query:read`) is a **fallback the design MAY exercise only if profiling shows the passthrough is insufficient** — it is not a coin-flip; **no `models.ts`/generic query route file is edited** either way. **Scope isolation (Resolves: C-02):** the statement is keyed on the funnel `id` (a UUIDv7, globally unique in the graph), so a SaaS-Operator funnel read can never return a retail Model #1 funnel; AC-09a asserts this isolation. | must | graph-core read path |
| FR-09 | **Funnel listing read** — a read returning all `Funnel` nodes (id/name/description + stage count) for the active model, so `FunnelBoard` can present a funnel picker / list. **Decision (Resolves: C-02): served via the existing `POST /api/v1/query/cypher` read** (mapped to `query:read`), scoped to the active SaaS-Operator model's subgraph — the funnels reachable from the operator root the shell provides (the `saasOperatorRoot:true` root per `saas-operator-foundation` OQ-1), so retail Model #1 funnels are never listed. The scope is expressed in the Cypher (traverse from the active-model root the `FunnelBoard` obtains via `useActiveModel()`), not by a raw unscoped `MATCH (:Funnel)`. AC-10 asserts the listing is confined to the active model. No new owned-elsewhere route edited; no new route needed for the `must`. | must | graph-core read path |
| FR-10 | **Auth + route-permission mapping.** Any read/write this feature performs goes through the central router gate (`api/src/router.ts`) + `api/src/auth/` — never a per-route auth check (house rule). Funnel/Stage node + edge **writes** reuse the existing graph-write permission already mapped for `/api/v1/nodes/*` and `/api/v1/edges` (no new RBAC permission string added by this spec); **reads** reuse `query:read`. Registering the labels/edge-types (FR-01..FR-04) reuses the ontology-registry write permission already mapped for `/api/v1/ontology/*`. | must | House rule |

### Drop-off analytics (FunnelBoard read) 

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-11 | **Drop-off analytics derivation (linear chain).** For a funnel, the analytics surfaced by `FunnelBoard` are: (a) **per-transition** conversion + drop-off (the `conversionRate`/`dropOffRate` on each `CONVERTS_TO` edge, FR-05); and (b) an **overall funnel conversion** = the product of the per-transition `conversionRate`s along the ordered `Stage` chain (top stage → bottom stage). These are **descriptive read-only** derivations over the graph-stored attributes (no writes, no operational records per XD-03). The derivation is computed either in the FR-08 read query or client-side in `FunnelBoard` from the FR-08 payload — resolved at design; either way it introduces no new store and no write path. **Decision (Resolves: B-01/OQ-2): a funnel is a strict linear chain for the `must`** — a single ordered path by `stageOrder`; the two wave-2 content specs (marketing/sales) build linear funnels, so linear covers all wave-2 needs. Branching (a stage with multiple outgoing `CONVERTS_TO`) is **deferred**: if the design encounters a branch it renders each transition's per-transition rate and shows overall conversion as **`n/a`** rather than crashing, but no multi-path/tree rendering is built for the `must`. (Rejected: modeling funnels as a branching DAG now — no wave-2 content needs it and it complicates both the analytics and the stage-board rendering.) **Edge-case rendered strings (Resolves: N-01):** a funnel with **zero stages** renders the empty state (FR-13); a funnel with **one stage** (no transitions) renders overall conversion as the literal string **`n/a`** (not undefined, not a crash); a **branch** likewise renders overall conversion as **`n/a`**. | must | blueprint scope, XD-03 |

### PWA — FunnelBoard view (XD-05, UX-01, UX-03)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-12 | **View-registration seam (single `VIEWS` entry — Resolves: N-02).** `saas-operator-foundation` (XD-05) is the sole owner of `pwa/src/route.ts` / `SURFACES` / `pwa/src/views/index.tsx`, and has already registered `#/business/funnels` → a shared `BusinessTabPlaceholder`. This feature replaces **only its own one `VIEWS` entry** (one logical entry — its import line + its `funnels` map line) in `views/index.tsx` — wiring `funnels` → the live `FunnelBoard` — and **does not** edit `route.ts` / `SURFACES` (NFR-03 / the `ModelTabPlaceholder` precedent). It never renames or re-orders the route; `#/business/funnels` is taken verbatim from the View Tree. | must | Blueprint View Tree, XD-05, UX-06 |
| FR-13 | **`FunnelBoard` view** (`pwa/src/views/business/FunnelBoard.tsx`, route `#/business/funnels`): the interactive stage board for the active SaaS-Operator model. It **consumes** the shell-level active-model context (`useActiveModel()`, owned by `model-workspace-core` — never re-implemented) and defaults to the SaaS-Operator root (same pattern as `FunctionMap.tsx`). It lets the user pick a funnel (FR-09) and renders that funnel's ordered stages as a **stage board** (a column/row of stage cards in `stageOrder`), with each stage-to-stage transition annotated with its conversion rate and drop-off (FR-05/FR-11) and the overall funnel conversion shown as a summary. Specs all **four view states** (UX-01): **loading** (skeleton while the funnel-list / funnel-composition fetch is in flight), **empty** (no `Funnel` nodes in the active model yet — prompts that content specs seed funnels), **error** (fetch failed — retry affordance), **ready** (stage board rendered). Tokens-only styling via `var(--…)`; catalog components (`ViewRegion`/`ViewHeader`/`Loading`/`EmptyState`/`ErrorState` from `pwa/src/views/_shared.tsx`) before new ones; `scripts/design-conformance.ts` passes. | must | Blueprint View Tree, UX-01, UX-02, UX-03 |
| FR-14 | **Interactive stage board — pointer drag + explicit keyboard move controls (UX-03).** The stage board is **interactive**: the user can **reorder stages** by dragging a stage card to a new position (pointer: mouse + trackpad) **and** by a keyboard-accessible affordance — **explicit per-card move-up / move-down buttons** — so no interaction is pointer-only. **Decision (Resolves: B-01/OQ-3): the keyboard reorder affordance is explicit move-up/down buttons, not arrow-key capture on a focused card.** This gives the simplest, most predictable keyboard story and — critically — never steals the browser's global arrow-key scroll (so the Native Conflicts arrow-key-suppression row is not needed, see C-03). A reorder **persists** the new order by PATCHing each affected `Stage` node's `stageOrder` (`PATCH /api/v1/nodes/Stage/:id`, FR-06) and re-reads (FR-08). This is the interactive drag surface UX-03 names; the Platforms & Input Modes and Native Conflicts tables below are REQUIRED for it. **Scope decision (Resolves: B-01/OQ-3): the `must` is reorder-only** (drag + move-up/down buttons); inline create/delete of stages/funnels is `should` (FR-15), built only if wave-2 needs it. (Rejected for the `must`: arrow-key-on-card reorder — needs global arrow-scroll suppression and a documented key the a11y story must teach; explicit buttons are self-describing.) | must | UX-03, blueprint (interactive stage board) |
| FR-15 | **Inline stage/funnel editing + funnel-id deep-link (`should`).** `FunnelBoard` **may** offer inline create/rename/delete of stages and edit of a transition's `conversionRate`/`dropOffRate` (via the FR-06 node CRUD + the FR-07 funnel-owned transition route), so an operator can shape a funnel without leaving the board. It **may** also deep-link the selected funnel id into the hash (via the `entityId` route field `FunctionMap` uses) so a specific funnel survives reload (the OQ-4 `should`, beyond the `must`'s reset-to-picker). Marked `should` (the `must` is visualize + reorder, FR-13/FR-14); if included it obeys the same view-state, tokens-only, and keyboard-reachability rules. Authoring the *content* of the marketing/sales funnels remains out of scope (owned by content specs) — this is generic editing UI, not seeded instances. | should | blueprint scope |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | **No new store, no compile-time labels/edges.** This feature adds **zero** entries to `NODE_LABELS`/`EDGE_TYPES`/`EDGE_ENDPOINTS` in `shared/src/schema/{nodes,edges}.ts`; `Funnel`/`Stage`/`HAS_STAGE`/`CONVERTS_TO` are **runtime registry** constructs only (XD-02). Conversion/drop-off live as edge attributes on the graph — no new table, no Postgres, no SQLite. | XD-02, NFR-01 (foundation) |
| NFR-02 | **Route-file single ownership (XD-05) + funnel-owned server files only.** On the PWA side this feature edits **only** `pwa/src/views/business/FunnelBoard.tsx` (+ its `.module.css`) and **one** logical `VIEWS` entry (its import + map line) in `pwa/src/views/index.tsx`; it never edits `route.ts` / `SURFACES`. On the server side it adds **only its own new files** — the funnel-owned `CONVERTS_TO` transition route (FR-07) and funnel test/registration code — and **never edits** any file owned by another spec: not the graph-core generic edge path (`api/src/routes/edges.ts`, `api/src/storage/edges.ts`, `shared/src/schema/edges.ts`), not the generic node CRUD (`api/src/routes/nodes.ts`), not the query route (`api/src/routes/query.ts`), and not risk/SLA/change/performance/metric-library code or the foundation's shell. | XD-05, C-01 |
| NFR-03 | **Idempotent, additive registry writes (via the FR-06a get-then-create guard — Resolves: B-03).** Registering `Funnel`/`Stage`/`HAS_STAGE`/`CONVERTS_TO` is idempotent **because `ensureFunnelOntology` (FR-06a) `GET`s each construct by name and creates it only when absent** — the public create routes are strict-CREATE (`409 name_conflict`), so idempotency is a property of the *routine*, not of a bare re-POST. A re-run adds nothing and errors nothing. Registration is additive — it never deprecates or mutates existing registry labels/edges (e.g. the core `PRECEDES`), and never touches retail Business Model #1's subgraph. | XD-01, B-03, house data-integrity |
| NFR-04 | House rules: `zod` is the only validation library; no `tsc` (transpile via `bun run typecheck`); en-US identifiers; server binds loopback `127.0.0.1:8787`; auth via the central router gate + `api/src/auth/` only; all REST under `/api/v1/`. | CLAUDE.md |
| NFR-05 | PWA styling is tokens-only (`var(--…)` from `tokens.css`); components come from the existing CSS-Module catalog before new ones; `scripts/design-conformance.ts` passes on `FunnelBoard.tsx` + its CSS module (UX-02). Desktop-first, no new breakpoints (UX-04). | UX-02, UX-04 |
| NFR-06 | **Performance / footprint.** The funnel-composition read (FR-08) for a single funnel of ≤ 20 stages returns in ≤ 50 ms p99 against a warm graph (one scoped indexed traversal). Drop-off derivation (FR-11) is O(stages) and adds no additional round-trip beyond the FR-08 read. A stage-reorder PATCH batch (FR-14) issues at most one PATCH per moved stage. | perf bound |

## UI/UX Requirements

**Views owned by this spec** (from the blueprint View Tree, verbatim):

| Route | View component | Nav surface | States specced (loading·empty·error·ready) |
|-------|----------------|-------------|---------------------------------------------|
| `#/business/funnels` | `FunnelBoard` | Business tab (topbar surf-nav + subnav) | all four — AC-13 (loading), AC-14 (empty), AC-15 (error), AC-12 (ready) |

**Routes NOT owned here** (registered by `saas-operator-foundation`, this spec only replaces its one `VIEWS` line): `#/business/{functions,metrics,benchmarks}` and `#/exec/operator` are other specs' surfaces — untouched.

**UX allowance conformance** (reference blueprint UX-*; do not re-decide):

| Allowance | How this spec satisfies it |
|-----------|---------------------------|
| UX-01 view states | FR-13; AC-12..AC-15 cover FunnelBoard loading/empty/error/ready |
| UX-02 design system (tokens-only, catalog components, design-conformance passes) | FR-13, NFR-05; AC-16 runs `scripts/design-conformance.ts` |
| UX-03 input modes | **REQUIRED here** — `FunnelBoard` is the interactive stage board / drag surface UX-03 names. FR-14; Platforms & Input Modes + Native Conflicts tables below; AC-17 (pointer drag reorder), AC-18 (keyboard reorder) |
| UX-04 responsiveness | NFR-05 — desktop-first, no new breakpoints |
| UX-05 accessibility | AC-19 — keyboard reachability of the funnel picker + stage cards + reorder affordance, focus order, ARIA landmark (`ViewRegion`) |
| UX-06 navigation (routes verbatim, deep links survive reload) | FR-12 (verbatim route), AC-20 (deep link to `#/business/funnels` survives reload). **Decision (Resolves: B-01/OQ-4): the route + active-model context survive reload; the in-view selected funnel resets to the picker on reload for the `must`** — UX-06 requires the *route* and active-model context survive, not the finer in-view selection. Deep-linking a specific funnel id into the hash (via the `entityId` route field `FunctionMap` uses) is a `should` (FR-15), built only if a clean hash slot is confirmed. (Rejected for the `must`: forcing funnel-id persistence — adds route-field coupling with no AC requiring it.) |

## Scope Boundaries

**In scope:**
- Registering the `Funnel` + `Stage` runtime node labels (with attribute `json_schema_doc`s) and the `HAS_STAGE` + `CONVERTS_TO` runtime edge types (with endpoint whitelists) via the existing ontology-registry routes.
- Defining the `CONVERTS_TO` conversion/drop-off attribute contract (`conversionRate`, `dropOffRate` in `[0,1]`), range-validated at a **funnel-owned transition route** (FR-07) that returns `400 attribute_violation` and delegates the write to graph-core `createEdge` — no edit to any graph-core edge file.
- Funnel/Stage node CRUD + `HAS_STAGE` edges **via the existing generic graph write paths** (`/api/v1/nodes/:label`, `/api/v1/edges`); `CONVERTS_TO` writes via the one thin funnel-owned validating route — no edit to the generic edge CRUD route.
- The funnel-composition + funnel-listing reads (FR-08/FR-09) and drop-off analytics derivation (FR-11) via the existing `POST /api/v1/query/cypher` passthrough read (a new read-only route owned here is a design-only fallback, not built for the `must`).
- The live `FunnelBoard` view at `#/business/funnels`: funnel picker, ordered stage board, per-transition + overall conversion/drop-off, pointer + keyboard stage reorder (FR-14), four view states.
- The one-line `VIEWS` entry replacement in `views/index.tsx` (foundation's placeholder seam).

**Out of scope (owner named):**
- **The actual marketing and sales funnel instances** (stages, conversion values) → `marketing-process-model` / `sales-process-model` (they instantiate this construct via seed fixtures + the CRUD routes).
- `route.ts` / `SURFACES` / `views/index.tsx` **route registration** → `saas-operator-foundation` (XD-05; this spec touches only its own `VIEWS` line).
- `MetricDefinition` label + `INSTANTIATES` edge + `MetricLibrary` view → `saas-metric-library`.
- The `OperatorCockpit` funnel-status rollup + `GET /api/v1/analytics/operator*` → `cross-function-exec-rollup` (it reads this construct read-only; this spec does not build the cockpit).
- Any operational/transactional entity (`Lead`/`Opportunity`/`Subscription`/…) → **never created** (XD-03).
- Active-model selection UI + shell context → `model-workspace-core` (consumed via `useActiveModel()`, never re-implemented).

## Acceptance Criteria

<!-- Every AC traces to ≥1 FR. Platforms + Verification are mandatory. -->

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | **The `ensureFunnelOntology` routine (FR-06a) is idempotent via its get-then-create guard (Resolves: B-03).** Running `ensureFunnelOntology` once registers the `Funnel` node label (`GET /api/v1/ontology/node-labels/Funnel` returns it, 200); running it a **second** time is a verified no-op — the routine `GET`s `Funnel` (200), **skips** the create, and leaves **exactly one** `Funnel` label with **no error thrown** (the strict-CREATE route is never re-hit, so no `409` surfaces). This AC asserts the **routine's** idempotency, **not** that the public strict-CREATE route is itself a no-op (it is not — a bare re-POST returns `409 name_conflict`). `NODE_LABELS` in `shared/src/schema/nodes.ts` is unchanged (FR-01, FR-06a, NFR-01, NFR-03) | server (bun test + Neo4j) + CLI | `api/__tests__/funnel-registry.integration.test.ts`; manual: `git diff shared/src/schema/nodes.ts` — expect no additions |
| AC-02 | Registering the `Stage` node label succeeds and its `json_schema_doc` requires an integer `stageOrder`; creating a `Stage` node with a non-integer `stageOrder` via `POST /api/v1/nodes/Stage` is rejected `400 attribute_violation` (FR-02, FR-06) | server (bun test + Neo4j) | `api/__tests__/funnel-registry.integration.test.ts` |
| AC-03 | Registering the `HAS_STAGE` edge type sets its endpoints to `Funnel`→`Stage` only; a `HAS_STAGE` edge created with any other endpoint pair (e.g. `Stage`→`Funnel`) is rejected `400 edge_endpoint_label_mismatch`; `EDGE_TYPES`/`EDGE_ENDPOINTS` in `shared/src/schema/edges.ts` are unchanged (FR-03, NFR-01) | server (bun test + Neo4j) + CLI | `api/__tests__/funnel-edges.integration.test.ts`; manual: `git diff shared/src/schema/edges.ts` — expect no additions |
| AC-04 | Registering the `CONVERTS_TO` edge type sets endpoints to `Stage`→`Stage` only; a `CONVERTS_TO` edge with any other pair is rejected `400 edge_endpoint_label_mismatch` (FR-04) | server (bun test + Neo4j) | `api/__tests__/funnel-edges.integration.test.ts` |
| AC-05 | A `CONVERTS_TO` edge created via the funnel-owned transition route (FR-07) with valid `attributes:{conversionRate,dropOffRate}` (both in `[0,1]`) persists those attributes; a read of the edge returns them intact (round-trip through `attributes_json`) (FR-05, FR-07) | server (bun test + Neo4j) | `api/__tests__/funnel-edges.integration.test.ts` |
| AC-06 | A `CONVERTS_TO` edge posted through the funnel-owned transition route (FR-07) whose `conversionRate` or `dropOffRate` is outside `[0,1]` is rejected **`400 attribute_violation`** (the OQ-1-locked outcome); a valid one (both in `[0,1]`) is accepted (201) and persisted. The funnel route delegates the accepted write to graph-core `createEdge` (so the FR-04 endpoint whitelist still applies), and **no owned-elsewhere edge file was edited** (FR-05, FR-07) | server (bun test + Neo4j) + CLI | `api/__tests__/funnel-edges.integration.test.ts`; manual: `git diff --stat api/src/routes/edges.ts api/src/storage/edges.ts shared/src/schema/edges.ts` — expect no change |
| AC-07 | `Funnel` and `Stage` node CRUD round-trips through the existing generic path: `POST /api/v1/nodes/Funnel` and `POST /api/v1/nodes/Stage` create (201), `GET`/`PATCH`/`DELETE /api/v1/nodes/{Funnel,Stage}/:id` behave per graph-core contract; no new node CRUD route was added (FR-06, NFR-02) | server (bun test + Neo4j) + CLI | `api/__tests__/funnel-crud.integration.test.ts`; manual: `git diff --stat api/src/routes/nodes.ts` — expect no change |
| AC-08 | A `HAS_STAGE` edge (`Funnel`→`Stage`) created via `POST /api/v1/edges` links a funnel to a stage; the funnel-composition read (FR-08) returns that stage; no new edge CRUD route was added (FR-07, NFR-02) | server (bun test + Neo4j) + CLI | `api/__tests__/funnel-crud.integration.test.ts`; manual: `git diff --stat api/src/routes/edges.ts` — expect no change |
| AC-09 | The funnel-composition read, given a funnel id, returns the funnel plus its stages ordered by `stageOrder` and the `CONVERTS_TO` transitions between them with `conversionRate`/`dropOffRate`; it is served via the `POST /api/v1/query/cypher` passthrough (`query:read`) and edits no owned-elsewhere route file (FR-08) | server (bun test + Neo4j) | `api/__tests__/funnel-read.integration.test.ts` |
| AC-09a | **Scope isolation (Resolves: C-02):** with both a SaaS-Operator funnel and a retail Model #1 funnel present in the graph, the FR-08 composition read keyed on the SaaS-Operator funnel's `id` returns **only** that funnel's stages/transitions and never the retail funnel's; the FR-08 statement never returns cross-model nodes (FR-08, NFR-03) | server (bun test + Neo4j) | `api/__tests__/funnel-read.integration.test.ts` |
| AC-10 | The funnel-listing read returns all `Funnel` nodes **for the active SaaS-Operator model only** (traversed from the operator root), with a stage count each; with a retail Model #1 funnel also present, the listing scoped to the SaaS-Operator root **excludes** it (Resolves: C-02) (FR-09) | server (bun test + Neo4j) | `api/__tests__/funnel-read.integration.test.ts` |
| AC-11 | Drop-off analytics: for a 3-stage funnel with transitions of `conversionRate` 0.5 and 0.4, the overall funnel conversion is 0.20 (product), and a single-stage funnel reports overall conversion `n/a` (no transition) without error (FR-11) | server (bun test) + macOS Chrome | `api/__tests__/funnel-analytics.test.ts`; and `pwa/src/__tests__/funnel-board-analytics.test.tsx` |
| AC-12 | `#/business/funnels` resolves to `FunnelBoard`, which consumes `useActiveModel()`, defaults to the SaaS-Operator root, lets the user pick a funnel, and renders its ordered stages with per-transition + overall conversion/drop-off (FR-13 ready state, FR-11) | macOS Chrome (mouse+kb), macOS Safari (trackpad+kb) | `pwa/src/__tests__/funnel-board.test.tsx` |
| AC-13 | `FunnelBoard` renders a loading skeleton while its funnel-list / composition fetch is pending (FR-13, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/funnel-board-states.test.tsx` |
| AC-14 | With the SaaS-Operator model present but no `Funnel` nodes, `FunnelBoard` shows the empty state prompting that content specs seed funnels (FR-13, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/funnel-board-states.test.tsx` |
| AC-15 | When `FunnelBoard`'s fetch fails, it shows the error state with a retry affordance that refetches (FR-13, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/funnel-board-states.test.tsx` |
| AC-16 | `scripts/design-conformance.ts` passes on `FunnelBoard.tsx` + its CSS module (tokens-only, catalog components) (NFR-05, UX-02) | CLI | manual: `bun scripts/design-conformance.ts --view pwa/src/views/business/FunnelBoard.tsx` and `... FunnelBoard.module.css` — expect both exit 0 with zero token/component violations |
| AC-17 | **Pointer drag reorder**: dragging a stage card from position 2 to position 1 reorders the board and PATCHes the affected `Stage` nodes' `stageOrder`, and the re-read reflects the new order (FR-14) | macOS Chrome (mouse), macOS Safari (trackpad) | manual: with the stack up, load `#/business/funnels`, select a funnel, drag the 2nd stage card above the 1st — expect the board reorders, a `PATCH /api/v1/nodes/Stage/:id` fires per moved stage (Network tab), and a reload shows the persisted order |
| AC-18 | **Keyboard reorder via explicit move controls** (no pointer): Tab to a stage card's **move-up** (or **move-down**) button and activate it with Enter/Space; the order changes and persists identically to AC-17 — reorder is not pointer-only, and there is **no arrow-key capture** (the OQ-3-locked affordance) (FR-14, UX-03, UX-05) | macOS Chrome (keyboard), macOS Safari (keyboard) | manual: load `#/business/funnels`, select a funnel, Tab to the 2nd stage's **move-up** button, press Enter — expect the stage moves up, focus stays on the moved stage's move-up button, a `PATCH /api/v1/nodes/Stage/:id` fires per moved stage (Network tab), and the new `stageOrder` persists on reload |
| AC-19 | `FunnelBoard` is keyboard-reachable: Tab reaches the funnel picker then the stage cards / reorder controls in DOM order, the view has an ARIA landmark (`ViewRegion`/`<section aria-label>`), and no interactive element is pointer-only (FR-13, FR-14, UX-05) | macOS Chrome (keyboard), macOS Safari (keyboard) | manual: load `#/business/funnels`, Tab through the view — expect focus lands on the section landmark, then the funnel picker, then each stage's controls in order, each activating on Enter/Space |
| AC-20 | Deep link survives reload: navigate to `#/business/funnels`, select a funnel, reload — expect the same route renders and the active model (SaaS-Operator root) is still the subject; **the in-view funnel selection resets to the picker** (the OQ-4-locked `must` behavior — route + active-model survive, in-view selection does not) (FR-12, UX-06) | macOS Chrome (mouse+kb) | `pwa/playwright/business-funnels-reload.spec.ts` |
| AC-21 | Transpile is clean; no compile-time schema arrays edited, no new RBAC permission string added, no `route.ts`/`SURFACES` edit, no edit to any graph-core edge/node/query file, and only this spec's own `VIEWS` entry (its import + map line) changed (NFR-01, NFR-02, NFR-04) | CLI | `bun run typecheck` exit 0; manual: `git diff --stat` — expect changes confined to `pwa/src/views/business/FunnelBoard.*`, the one `VIEWS` entry (import + map line) in `pwa/src/views/index.tsx`, and **new** `api/` funnel files (the funnel-owned transition route + funnel test/registration code); no schema-array, `route.ts`, `SURFACES`, `rbac-permissions.ts`, `api/src/routes/edges.ts`, `api/src/storage/edges.ts`, `api/src/routes/nodes.ts`, or `api/src/routes/query.ts` edits |

## Platforms & Input Modes

This spec touches `pwa/` and ships the **interactive stage board** (`FunnelBoard`)
UX-03 explicitly calls out: it has a **drag-to-reorder** pointer interaction and a
**keyboard reorder** equivalent (FR-14). It adds **no** new keyboard surf-jump
accelerator (`#/business/funnels` is reached through the `business` surf-nav /
subnav that `saas-operator-foundation` already registered; per that spec's OQ-2
the `business` surface has no `Alt`-digit accelerator — untouched here).

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| Funnel picker (list/select) | yes | yes | yes | yes | standard list/select; catalog component |
| Stage board — view / focus stage cards | yes | yes | yes | yes | cards are focusable; standard reading |
| Stage board — **reorder** stages | yes | yes | yes | yes | pointer drag (mouse/trackpad) AND explicit keyboard move-up/down buttons (OQ-3; FR-14, AC-17/AC-18); touch drag follows the same pointer path (desktop-first, so touch is best-effort, not a specced platform target — see Native Conflicts) |
| Transition conversion/drop-off annotations | no | no | no | no | read-only display; no input handling |
| Inline stage/funnel edit (FR-15, `should`) | yes | yes | yes | yes | if built, form inputs via catalog components; keyboard-reachable |

## Native Conflicts

The new input handling is the stage-board **drag-to-reorder** (FR-14, pointer)
and its keyboard equivalent, **explicit move-up/down buttons** (the OQ-3-locked
affordance). Drag introduces the usual native conflicts: browser text-selection
during a drag, native HTML5 drag-image / drag-and-drop defaults, and (on
trackpad/touch) scroll/pan of the board container while a drag is in progress.
Each is suppressed at the drag surface. **The keyboard reorder path uses plain
buttons (Enter/Space activation) — it introduces no gesture and captures no
arrow keys, so it has no native conflict to suppress** (this is why OQ-3 chose
buttons over arrow-key capture, C-03). `FunnelBoard` is desktop-first; touch
drag rides the same pointer-event path but is not a specced platform target
(UX-04).

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| Native text selection during pointer drag | Drag-to-reorder a stage card (FR-14) | `e.preventDefault()` on `pointerdown`/`dragstart` of the drag handle + `user-select: none` (via token'd CSS-Module class) on the stage card while dragging |
| Native HTML5 drag-image / `dragover` default (drop rejected) | Custom pointer-driven reorder | Use pointer events (`pointerdown`/`pointermove`/`pointerup` with `setPointerCapture`) rather than the HTML5 DnD API, OR if HTML5 DnD is used, `e.preventDefault()` on `dragover` to permit drop — decided at design; either way the native drag-image is suppressed |
| Trackpad/touch scroll (pan) of the board container mid-drag | Pointer drag of a stage card | `touch-action: none` on the drag handle (token'd CSS-Module class) so the browser does not claim the gesture for scrolling while a reorder is active |
| Keyboard reorder move (explicit move-up/down buttons — OQ-3 decision) | (nothing — buttons activate on Enter/Space and capture no keys) | **none needed.** The keyboard reorder is plain focusable buttons; no arrow-key capture, so the browser's global arrow-scroll is never stolen. (Rejected alternative — arrow-key-on-card reorder — *would* have required `e.preventDefault()` on the handled arrow keydown to avoid stealing arrow-scroll globally; not built, per OQ-3, C-03.) |
| (no new focus-trap or pinch-zoom introduced) | n/a | n/a |

## Dependencies

- **saas-operator-foundation** (`.claude/specs/saas-operator-foundation/`): the SaaS-Operator `BusinessModel` root (found by the `name:"SaaS Operator"` + `attributes.saasOperatorRoot:true` marker, per that spec's OQ-1), the `#/business` surface + `route.ts`/`SURFACES` registration, the `views/index.tsx` `BusinessTabPlaceholder` seam for `funnels` (this spec replaces its one line), and the consumed `useActiveModel()` shell context (`pwa/src/context/ActiveModelContext.tsx`). `FunctionMap.tsx` is the pattern precedent for `FunnelBoard.tsx`.
- **ontology-manager registry** (`api/src/routes/ontology-node-labels.ts` `handleCreateNodeLabel`, `api/src/routes/ontology-edge-types.ts` `handleCreateEdgeType`; `nodeLabelCreateSchema`/`edgeTypeCreateSchema` in `shared/src/schema/ontology.ts`; the `_OntologyEdgeEndpoint` rows read by `getEdgeEndpoints`, `api/src/ontology/cache/edge-endpoints.ts`; the attribute-zod cache `api/src/ontology/cache/attribute-zod.ts`; the `ontology.changed` invalidation event): the sanctioned path to register `Funnel`/`Stage`/`HAS_STAGE`/`CONVERTS_TO` as runtime constructs (FR-01..FR-04).
- **graph-core node + edge CRUD** (`api/src/routes/nodes.ts` `handleNodePost`/`handleNodePatch`/… behind `/api/v1/nodes/:label`, with `parseRegistryLabel` runtime-label resolution + attribute validation; `api/src/routes/edges.ts` `handleEdgePost`/`handleEdgeDelete` behind `/api/v1/edges`, with the `getEdgeEndpoints` endpoint-whitelist validator returning `400 edge_endpoint_label_mismatch`, `api/src/storage/edges.ts:91`, and edge `attributes` persisted as `attributes_json`): the CRUD path for funnels/stages/edges (FR-06/FR-07) — reused, never re-implemented.
- **graph query read route** (`POST /api/v1/query/cypher` → `handleCypher`/`runPassthrough`, read-only, mapped to `query:read`; consumed in the PWA via `api.cypher(statement, params)`, `api/src/api.ts` / `pwa/src/api.ts:157`): the **decided** source for the funnel-composition + funnel-listing reads (FR-08/FR-09) and the `FunnelBoard` data. No `models.ts`/query file edited; a new read-only funnel-owned route is a design-only fallback, not built for the `must`.
- **funnel-owned `CONVERTS_TO` transition route** (new, owned by this spec, e.g. `POST /api/v1/funnels/transitions`): range-validates `conversionRate`/`dropOffRate` ∈ `[0,1]` (→ `400 attribute_violation`) then delegates to graph-core `createEdge` (FR-05/FR-07, C-01). This is the ownership-safe home for the range check — it does not edit `api/src/routes/edges.ts` / `api/src/storage/edges.ts` / `shared/src/schema/edges.ts`.
- **PWA shell** (`pwa/src/views/index.tsx` `VIEWS` map + `BusinessTabPlaceholder`, `pwa/src/views/_shared.tsx` `ViewRegion`/`ViewHeader`/`Loading`/`EmptyState`/`ErrorState`, `pwa/src/route.ts` `toHash`, `tokens.css`, `scripts/design-conformance.ts`): the `FunnelBoard` view + its one-line registration replacement.

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | **OQ-1 (CLOSED — locked to a funnel-owned server range check per XD-09 single-shot, Resolves: B-01/B-02/C-01).** Where does `CONVERTS_TO` conversion/drop-off validation live? Verified: edge attributes are **not** validated by a per-edge-type `json_schema_doc` today (the attribute-zod cache validates **node** labels only — `api/src/ontology/cache/attribute-zod.ts:3`; `edgeCreateSchema.attributes` is a free `z.record(z.unknown())`, `shared/src/schema/edges.ts:59`), and the generic edge path files are graph-core-owned. **Decision: a new funnel-owned route** (`POST /api/v1/funnels/transitions`, FR-07) range-validates `conversionRate`/`dropOffRate` ∈ `[0,1]` with `zod`, returns **`400 attribute_violation`** (existing closed error code, `api/src/errors.ts:24`), then delegates the write to graph-core `createEdge`. This keeps the stored data trustworthy for the cockpit rollup **without** editing an owned-elsewhere file. (Rejected: **(a-schema)** per-edge-type `json_schema_doc` — no such mechanism for edges; **(b-inline)** a `type==="CONVERTS_TO"` branch in `handleEdgePost`/`createEdge` — an ownership violation of graph-core files (C-01, NFR-02); **(c)** UI-only soft guard — untrustworthy stored data.) FR-05/FR-07/AC-06 are pinned to this. No open question remains for the single-shot gate. | Determines FR-05/FR-07/AC-06: the range check is a funnel-owned route returning `400 attribute_violation`. | **Closed.** Design builds the funnel-owned transition route; no owned-elsewhere edge file is touched. |
| 2 | **OQ-2 (CLOSED — locked to a linear chain for the `must` per XD-09 single-shot, Resolves: B-01).** Does a funnel model a strict linear chain or a branching DAG? **Decision: strict linear chain for the `must`** — single ordered path by `stageOrder`; overall conversion = product of per-transition `conversionRate`s (FR-11). Marketing/sales wave-2 funnels are linear, so this covers all wave-2 needs. A branch (a stage with multiple outgoing `CONVERTS_TO`) renders each transition's per-transition rate and shows overall conversion as the literal **`n/a`** without crashing; multi-path/tree rendering is deferred. (Rejected: a branching DAG now — no wave-2 content needs it; it complicates analytics + rendering.) FR-11 is pinned. No open question remains. | Determines FR-11 analytics + `FunnelBoard` rendering (single column, no tree). | **Closed in FR-11.** |
| 3 | **OQ-3 (CLOSED — locked to reorder-only + explicit move buttons per XD-09 single-shot, Resolves: B-01/B-02/C-03).** (a) Reorder-only or also inline create/delete? (b) Keyboard reorder via arrow keys on a focused card, or explicit move-up/down buttons? **Decision: `must` = reorder-only via pointer drag + explicit per-card move-up/down buttons** (no arrow-key capture, so no global arrow-scroll suppression is needed — the Native Conflicts arrow-key row is demoted to a rejected note, C-03); **inline create/delete = `should`** (FR-15), built only if wave-2 needs it. (Rejected for the `must`: arrow-key-on-card reorder — needs arrow-scroll suppression + a documented key; explicit buttons are self-describing.) FR-14/FR-15/AC-18 + the Native Conflicts table are pinned. No open question remains. | Determines FR-14/FR-15 build scope + the (now concrete) Native Conflicts table. | **Closed in FR-14.** |
| 4 | **OQ-4 (CLOSED — locked to reset-to-picker on reload for the `must` per XD-09 single-shot, Resolves: B-01).** Does the selected funnel survive reload? **Decision: for the `must`, the route + active-model context survive reload; the in-view funnel selection resets to the picker** — UX-06 requires the route + active-model survive, not the finer in-view selection. Deep-linking a specific funnel id into the hash (via the `entityId` route field `FunctionMap` uses) is a `should` (FR-15). (Rejected for the `must`: forcing funnel-id persistence — route-field coupling with no AC requiring it.) AC-20 is pinned to reset-to-picker. No open question remains. | Determines AC-20 scope + whether `FunnelBoard` reads a funnel id from the route (`should` only). | **Closed in FR-15/AC-20.** |
| 5 | **New-label registration timing** (blueprint Risk): content wave-2 seeds reference `Funnel`/`Stage`/`HAS_STAGE`/`CONVERTS_TO` before they exist if this spec slips. | Content specs blocked. | Dependency waves enforce ordering (this is wave 1b, content is wave 2); FR-01..FR-04 register the constructs idempotently; the registration must run as part of this feature's seed/bootstrap so the labels exist before any content seed loads. Design pins **when** registration runs (bootstrap vs. seed script). |
| 6 | **`PRECEDES` vs `CONVERTS_TO` confusion** — an author might model a funnel with `PRECEDES` (sequence) instead of `CONVERTS_TO` (conversion), losing drop-off. | Funnels without conversion data; cockpit rollup empty. | Documented in the `Funnel`/`Stage` label `usage_example` + `CONVERTS_TO` description at registration (FR-01..FR-04): `CONVERTS_TO` is the conversion edge, `PRECEDES` is plain sequence. Not a code risk; a modeling-guidance one surfaced in the registry metadata. |
