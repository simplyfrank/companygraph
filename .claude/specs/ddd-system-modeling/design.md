---
feature: "ddd-system-modeling"
created: "2026-07-04"
author: "spec-author"
status: "draft"
size: "large"
reviewing_requirements_revision: "revised (rev 2 — 2026-07-04)"
---

# Design: ddd-system-modeling

> Traces the approved (revised, rev 2) `requirements.md`: FR-01…FR-15,
> NFR-01…NFR-07, AC-01…AC-21. Every §-section names the FR/AC it serves; §8 is
> the file-change table (each row → an FR); §9 is the AC→test map. No requirement
> is invented here. The requirements review left **B-01/B-02/C-01…C-04/N-03**
> resolved **in the FRs already**; this design records where each lands (§2) and
> the design-level decisions (DD-*) needed to implement them. Every referenced
> dependency interface is cited by its real on-disk signature (§3.1); the two
> that do not yet exist on disk (`api/src/context/ActiveModelContext.tsx`,
> `pwa/src/views/model/*`) are `model-workspace-core` deliverables and are bound
> at implementation time (§1.1).

## 1. Overview

`ddd-system-modeling` closes the studio pipeline's **systematize** stage
(blueprint Summary, XD-05). On top of the `story-spec-core` story/activity model
and the process graph's `System` nodes it adds a **Capability layer** and the
mappings that make domain-driven system modeling, support-gap analysis, and an
augmentation-mix view expressible. It ships four things:

1. **One runtime ontology label** — `Capability` (XD-01) — plus **four edge
   types** (`NEEDS_CAPABILITY`, `SUPPORTED_BY`, `ASSIGNED_TO_CONTEXT`,
   `CAPABILITY_IN_MODEL`), all registered through the ontology-manager registry
   (`createNodeLabel` / `createEdgeType`, verified `api/src/ontology/storage/{node-labels,edge-types}.ts`).
   The compile-time `NODE_LABELS` / `EDGE_ENDPOINTS` consts are **never touched**
   (NFR-01, FR-01, FR-02). This mirrors `model-workspace-core`'s
   `registerModelSchema` and `story-spec-core`'s `registerStorySchema` exactly.
   `CAPABILITY_IN_MODEL` is this spec's **own** scoping edge (B-01) — it is *not*
   an endpoint-pair addition to `model-workspace-core`'s lifecycle `IN_MODEL`
   edge, so it never hits the `409 model_lifecycle_route_required` guard
   (verified `api/src/storage/model-lifecycle-guard.ts` `LIFECYCLE_EDGES` set —
   `CAPABILITY_IN_MODEL` is deliberately absent).
2. **Model-scoped REST CRUD** for capabilities + their mappings under
   `/api/v1/models/:modelId/capabilities*`, following the `model-workspace-core`
   / `story-spec-core` `/api/v1/models/:modelId/*` route convention. Every
   capability is anchored to its model by a `CAPABILITY_IN_MODEL` edge written in
   the create tx — the **authoritative** membership key (B-02), independent of
   `PART_OF` reachability so an orphan-sourced capability is never dropped.
3. **Two read aggregates** — support-gap analysis
   (`GET …/system-model/gaps`, FR-07/FR-08) and the context map
   (`GET …/system-model/context-map`, FR-09) — each a bounded, side-effect-free
   Neo4j read over the model's `CAPABILITY_IN_MODEL` membership plus the model's
   scoped activities (`scopedNodeIds`, consumed from
   `api/src/storage/model-scope.ts`, never re-implemented).
4. The **SystemModeler** view at `#/model/systems` (route verbatim from the
   blueprint View Tree) that **replaces** the `ModelTabPlaceholder`
   `model-workspace-core` registered for the `systems` tab, reads the active
   model from the shell-owned `useActiveModel()`, and specs all four view states
   (FR-12…FR-14). `systemKind` badges reuse `SYSTEM_KINDS` / `SYSTEM_KIND_LABELS`
   / catalog `Pill` from `system-augmentation-model` (XD-15, NFR-03).

The design follows the same four rules as its dependencies: **registry-only
schema**, **domain state on dedicated storage (not the generic node
primitives)**, **consume `model-workspace-core` / `story-spec-core` / the
bounded-contexts surface (never re-spec)**, **auth via the central router gate
only**.

### 1.1 Hard build-order dependency (requirements Dependencies)

Some surfaces this design imports are **new files owned by dependencies**.
Verified present on disk at authoring time (`model-workspace-core` foundation has
landed): `api/src/storage/model-scope.ts` (`scopedNodeIds` / `scopedWhereFragment`),
`api/src/storage/models.ts`, `api/src/storage/model-lifecycle-guard.ts`,
`api/src/scripts/register-model-labels.ts`, and
`shared/src/schema/system-kind.ts` (`system-augmentation-model`, implemented).
Verified **absent** at authoring time and bound at implementation time:
`pwa/src/context/ActiveModelContext.tsx` (`useActiveModel`, `model-workspace-core`
FR-15), `pwa/src/views/model/*` incl. `ModelTabPlaceholder.tsx`
(`model-workspace-core` FR-12/FR-17), and `story-spec-core`'s `UserStory` label +
`api/src/scripts/register-story-labels.ts` + `api/src/scripts/seed-rbac-roles.ts`'s
`business_architect` role. This spec **cannot start implementation** until
`story-spec-core` merges (its wave-2 predecessor). The design references
approved-design interfaces by their documented signatures; implementation binds
to the real files once they land.

## 2. Design decisions & prior-review carry-forwards

The requirements review (pass 1) resolved B-01/B-02/C-01…C-04/N-03 **in the FRs**.
This table records where each lands in the design and the design-level decisions.

| ID | Decision | Where |
|----|----------|-------|
| DD-01 | **`CAPABILITY_IN_MODEL` is this spec's own edge, not an `IN_MODEL` pair (resolves B-01).** Registered via `createEdgeType` in this spec's `register-capability-labels.ts`; written by this spec's own capability-create tx. It is **not** in `model-workspace-core`'s `LIFECYCLE_EDGES` set (verified `model-lifecycle-guard.ts`), so the generic `/nodes`/`/edges` lifecycle guard never fires on it, and no coordinated change to `model-workspace-core` is required. The wrong pair (`CAPABILITY_IN_MODEL` from `Activity → BusinessModel`) still returns `400 edge_endpoint_label_mismatch` from the registry-backed validator (§3.3, AC-02). | §3.3, §4.6 |
| DD-02 | **Model membership resolves through `CAPABILITY_IN_MODEL`, never through the `NEEDS_CAPABILITY` source (resolves B-02).** `scopedNodeIds(driver, modelId)` returns only structural ids (`Domain` + `PART_OF*` descendants + `ModuleInstance`s; `System`/`Role`/`Location` excluded — verified `model-scope.ts`). A `Capability` id is **never** in that set. Every capability list/detail/gap/context-map read matches `(cap:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id:$modelId})` as the membership predicate. `scopedNodeIds` is consumed only to (a) **validate** a `needed-by` mapping target belongs to the model (FR-05) and (b) enumerate the model's activities for the gap analysis (FR-07). This keeps a capability whose only source is an orphan activity (outside `scopedNodeIds`) visible (AC-06b). | §3.4, §4.1–4.5 |
| DD-03 | **Capability domain fields are the standard node envelope only; no bespoke top-level props.** Unlike `story-spec-core` (which needed `ORDER BY ordinal` / `WHERE derived`), a `Capability` carries only `name`/`description`/`attributes` — no queryable extra field is required (the analysis joins on edges, not capability properties). So capabilities store via a dedicated `api/src/storage/capabilities.ts` that writes the envelope + wires `CAPABILITY_IN_MODEL` in one tx; the generic `createNode`/`patchNode` primitives (`api/src/storage/nodes.ts`) stay **byte-for-byte unchanged** (they cannot write `CAPABILITY_IN_MODEL` atomically nor run the membership check). `attributes` is stored as `attributes_json` per the envelope. | §3.2, §4.2 |
| DD-04 | **`NEEDS_CAPABILITY` is ONE edge type with TWO endpoint pairs (resolves requirements N-02).** `createEdgeType` accepts a multi-pair `endpoints` array (verified `edge-types.ts` `createEndpointRows` writes one `_OntologyEdgeEndpoint` row per pair; graph-core `PART_OF` already carries 3 pairs). So `NEEDS_CAPABILITY` registers `[{Activity,Capability},{UserStory,Capability}]` — one type, both an activity and a story may point at the same capability. **Not** split into `ACTIVITY_NEEDS_CAPABILITY` / `STORY_NEEDS_CAPABILITY`; ACs are written to the one-type default. | §3.3 |
| DD-05 | **Gap analysis / context map live in a sibling `api/src/storage/system-model.ts` (resolves requirements N-01).** Writes (capability CRUD + mapping edges) live in `api/src/storage/capabilities.ts`; the two read aggregates (bounded-round-trip Cypher, no writes) live in `system-model.ts`. Keeps the write module small and the read module purely analytical (mirrors the `stories.ts` write / `story-derive.ts` compute split in `story-spec-core`). | §4.4, §4.5, §8 |
| DD-06 | **Mapping idempotency via `MERGE`, not a duplicate check (FR-03).** The many-to-many `NEEDS_CAPABILITY` / `SUPPORTED_BY` `PUT`s use `MERGE (from)-[:TYPE]->(to)` so a repeat is a no-op (not a `409`) — matching FR-03's "duplicate `(from,to)` map is idempotent". `MERGE` runs **after** the registry endpoint-label validation (a wrong pair still 400s). `ASSIGNED_TO_CONTEXT` (at-most-one) deletes any prior edge then creates in one tx; `CAPABILITY_IN_MODEL` (exactly-one) is written once at create and never re-`PUT`. No new graph uniqueness constraint is created (FR-03). | §4.3 |
| DD-07 | **Context-relationship identity resolves to `id` via this spec's own read (resolves C-01).** The existing `GET /api/v1/ontology/bounded-contexts` route emits inter-context relationships as `{ type, target: other.name }` (**verified** `api/src/routes/ontology-bounded-contexts.ts` line 22 — name-keyed, display-only). This spec does **not** reuse that shape; `system-model.ts`'s context-map read matches `(bc)-[r:UPSTREAM_OF|DOWNSTREAM_OF]->(other:BoundedContext)` and returns `{ type: type(r), targetId: other.id, targetName: other.name }` so the view deep-links (AC-08). It reads the bounded-contexts surface for the context nodes; it does **not** create/edit contexts or relationships (NFR-04). | §4.5 |
| DD-08 | **No `?model=` query param (consistency with `model-workspace-core` D-1).** Every capability / system-model read is scoped by the `:modelId` **path** param, never a query param. Isolation is proven by the `CAPABILITY_IN_MODEL` membership predicate (§4.1) + the two-model integration test (AC-09). | §4.1, §5 |
| DD-09 | **FR-08 dual-path support uses `USES_SYSTEM` read-only.** The gap analysis counts an activity supported if it reaches a system via `NEEDS_CAPABILITY→SUPPORTED_BY` **or** a direct graph-core `USES_SYSTEM` (verified edge type, read never written here); an activity supported only by raw `USES_SYSTEM` is surfaced in the distinct `capabilityGaps` category. This spec never writes/deletes `USES_SYSTEM` (graph-core owns it, requirements Scope). | §4.4 |

## 3. Data model

The `Capability` label + all four edges register at boot via `createNodeLabel` /
`createEdgeType` (§4.6). Registry attribute schemas are **permissive**
(`json_schema_doc: {}`) — the capability shape is the plain node envelope (DD-03).
REST-boundary zod schemas live in a new `shared/src/schema/ddd-system.ts`.

### 3.1 Dependency interfaces consumed (verified signatures)

| Symbol | File (verified) | Signature used |
|--------|-----------------|----------------|
| `scopedNodeIds` | `api/src/storage/model-scope.ts` | `(driver, modelId) => Promise<Set<string>>` — structural ids only |
| `createNodeLabel` | `api/src/ontology/storage/node-labels.ts` | strict CREATE; `409 name_conflict` on dup (swallowed for idempotency) |
| `createEdgeType` | `api/src/ontology/storage/edge-types.ts` | strict CREATE; multi-pair `endpoints`; `assertEndpointLabelsExist` pre-check; `409 name_conflict` on dup |
| `createEdge` | `api/src/storage/edges.ts` | `(driver, {type,fromId,toId,attributes?}) => Promise<Edge>` — runs the registry endpoint-label whitelist (`400 edge_endpoint_label_mismatch`) |
| `SYSTEM_KINDS` / `SYSTEM_KIND_LABELS` / `systemKindSchema` | `shared/src/schema/system-kind.ts` | augmentation vocabulary (XD-15) |
| `LIFECYCLE_EDGES` | `api/src/storage/model-lifecycle-guard.ts` | proves `CAPABILITY_IN_MODEL` is **not** a lifecycle edge (DD-01) |
| `ok`/`noContent`/`error`/`parseWith`/`fromValidationError` | `api/src/routes/_helpers.ts` | route envelope helpers |
| `getRoutePermission` / `P` / `ROUTE_PERMISSIONS` | `api/src/auth/rbac-permissions.ts` | segment-matched route→permission (§4.8) |

### 3.2 `Capability` (FR-01, DD-03)

Standard node envelope only: `id` (UUIDv7 server-generated), `name`,
`description`, `createdAt`, `updatedAt`, open `attributes_json`. A `Capability` is
a **business capability** — a cohesive ability the business must have (e.g. "Price
a product", "Allocate stock to a store"). `zod` (`shared/src/schema/ddd-system.ts`):

- `capabilityCreateSchema` — `{ name: z.string().min(1), description: z.string().optional(), attributes: z.record(z.unknown()).optional() }`.
- `capabilityPatchSchema` — `{ name?: z.string().min(1), description?: z.string(), attributes?: z.record(z.unknown()) }` (omitted → unchanged; mirrors `patchNode`).
- `capabilityReadSchema` — envelope **plus** derived read fields:
  - list row: `neededByCount:int` (distinct `NEEDS_CAPABILITY` sources), `supportingSystemCount:int`, `assignedContextId:string|null`, `assignedContextName:string|null`.
  - detail: `neededBy: {kind:"activity"|"story", id, name}[]`, `supportedBy: {id, name, systemKind: SystemKind}[]`, `assignedContext: {id, name, domain, subdomain}|null`, and `detached: {kind, targetId}[]` (FR-06/FR-13 — a mapping whose far-end node no longer resolves).

### 3.3 Edges (FR-02, DD-01, DD-04) — registered via `createEdgeType`

| Edge | Endpoint pair(s) (`_OntologyEdgeEndpoint`) | Cardinality | Meaning |
|------|--------------------------------------------|-------------|---------|
| `NEEDS_CAPABILITY` | `Activity → Capability` **and** `UserStory → Capability` (two pairs, one type — DD-04) | many-to-many (FR-03) | the step/story needs this capability |
| `SUPPORTED_BY` | `Capability → System` | many-to-many (FR-03) | the capability is supported by this system |
| `ASSIGNED_TO_CONTEXT` | `Capability → BoundedContext` | at most one per capability (FR-03) | the capability lives in this bounded context |
| `CAPABILITY_IN_MODEL` | `Capability → BusinessModel` | **exactly one** per capability (FR-03) | this spec's own model-membership edge (B-01/DD-01) |

Endpoint pairs are written as `_OntologyEdgeEndpoint` rows by `createEdgeType`
(verified `createEndpointRows`); the registry-backed validator
(`api/src/storage/edges.ts` → `validateEdge`) enforces them and returns
`400 edge_endpoint_label_mismatch` on a wrong pair (AC-02). The frozen
`EDGE_ENDPOINTS` const is not edited (NFR-01, AC-21).

> **Direct `createEdge` vs. bespoke Cypher.** `NEEDS_CAPABILITY`,
> `SUPPORTED_BY`, and `ASSIGNED_TO_CONTEXT` are ordinary graph edges (no lifecycle
> state). `CAPABILITY_IN_MODEL` is likewise ordinary — it is **not** in
> `LIFECYCLE_EDGES` (DD-01), so no `model_lifecycle_route_required` guard fires.
> The **create tx** wires `CAPABILITY_IN_MODEL` inside `capabilities.ts` via
> parameterized Cypher (so the capability node + its membership edge are one
> atomic write, DD-03); the mapping `PUT`s use `MERGE` (DD-06) — both after the
> registry endpoint-label check. `createEdge` (which runs the whitelist for free)
> is used for the mapping-edge cases where a fresh id + endpoint check are wanted;
> `MERGE`-based idempotency requires the endpoint check to be applied explicitly
> (§4.3).

### 3.4 Model-scoping mechanism (FR-06 note, NFR-02, resolves B-01 + B-02)

A `Capability` is **not** a member of `scopedNodeIds(driver, modelId)` — that
helper returns only structural ids (`Domain` + `PART_OF*` descendants +
`ModuleInstance`s; verified `model-scope.ts`). Model membership therefore rides
this spec's own edge:

- A `Capability` is in model A **iff** `(cap)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id:$modelA})`.
- Every capability carries **exactly one** such edge, written in the FR-04 create
  tx — including a capability with no `NEEDS_CAPABILITY` source yet, and one whose
  only source is an **orphan** activity (not `PART_OF` any scoped `Domain`, a
  state `story-spec-core` FR-08 contemplates). This is a direct, label-free,
  O(1)-per-capability membership test that never depends on `PART_OF` reachability
  (AC-06b).
- The `NEEDS_CAPABILITY` source is used **only** to compute the analysis, never as
  the membership key. FR-05 still validates a `needed-by` target belongs to the
  model (an activity ∈ `scopedNodeIds(modelId)`, a story via its
  `DESCRIBES_ACTIVITY` activity ∈ `scopedNodeIds`) so a mapping cannot cross
  models.

`System` and `BoundedContext` are **global** (not model-scoped) — the same
system/context may be `SUPPORTED_BY`/`ASSIGNED_TO_CONTEXT` from capabilities in
several models; that is intended (shared infrastructure, requirements Risk 5).

### 3.5 Error codes (FR-10) — additive to the closed `ERROR_CODES`

Added to `ERROR_CODES` (`api/src/errors.ts`), all additive/non-breaking (NFR-11):

| Code | HTTP | Thrown from | Reuse note |
|------|------|-------------|------------|
| `capability_not_found` | 404 | capability detail/patch/delete; mapping routes when `:capabilityId` is absent or not in `:modelId` | new |
| `bounded_context_not_found` | 404 | `PUT …/context` when `boundedContextId` is not a `BoundedContext` | new |
| `system_not_found` | 404 | `PUT …/supported-by` when `systemId` is not a `System` | new |
| `model_not_found` | 404 | FR-04 create when `:modelId` is not a `BusinessModel` | **reused** (`model-workspace-core`, verified `errors.ts:36`) — not re-added |
| `not_found` (existing) | 404 | `needed-by` when `activityId`/`storyId` is not an `Activity`/`UserStory` in the model | **reused**; details carry `{field}` |
| `edge_endpoint_label_mismatch` (existing) | 400 | wrong endpoint pair | **reused** (registry validator) |

Only **reachable** codes are added — the three new codes are each reachable from
≥1 route (verified by `envelope.test.ts` reachability + AC-04/AC-09). Codes
already in the enum (`model_not_found`, `not_found`, `edge_endpoint_label_mismatch`,
`invalid_payload`) are **reused, not duplicated** (FR-10).

## 4. Core logic

### 4.1 Model-scoped membership + read helper usage (FR-04, FR-07, FR-09, NFR-02)

`api/src/storage/capabilities.ts` and `api/src/storage/system-model.ts` share the
membership predicate. The capability **list** (`listCapabilities(driver, modelId)`):

```cypher
MATCH (cap:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id: $modelId})
OPTIONAL MATCH (src)-[:NEEDS_CAPABILITY]->(cap)          // src: Activity|UserStory
OPTIONAL MATCH (cap)-[:SUPPORTED_BY]->(sys:System)
OPTIONAL MATCH (cap)-[:ASSIGNED_TO_CONTEXT]->(bc:BoundedContext)
RETURN cap,
       count(DISTINCT src)  AS neededByCount,
       count(DISTINCT sys)  AS supportingSystemCount,
       bc.id AS assignedContextId, bc.name AS assignedContextName
ORDER BY cap.createdAt ASC
```

The membership `MATCH` is the sole model filter — no `scopedNodeIds` join, so an
orphan-sourced capability lists correctly (AC-06b). A `:modelId` that resolves to
no `BusinessModel` returns `[]` for the list (the FR-04 create path checks
existence explicitly and 404s; reads simply return empty). `scopedNodeIds` is
called only where FR-05 validates a mapping target and where FR-07 enumerates the
model's activities.

### 4.2 Capability CRUD (FR-04, DD-03)

`api/src/storage/capabilities.ts`:

- `createCapability(driver, modelId, input)` —
  1. **Model check.** `MATCH (m:BusinessModel {id:$modelId}) RETURN m` — miss →
     `404 model_not_found` (reused code).
  2. **Atomic create + membership** in one write tx:
     `CREATE (cap:Capability {id:$id, name:$name, description:$desc, createdAt:$now, updatedAt:$now, attributes_json:$attrs}) WITH cap MATCH (m:BusinessModel {id:$modelId}) MERGE (cap)-[:CAPABILITY_IN_MODEL]->(m)` (id = server UUIDv7). The `MERGE` is over a fresh node so it always creates; the endpoint pair is a registered one so no mismatch. → `201` + full `capabilityReadSchema` body (counts all 0, `assignedContext:null`, `detached:[]`).
- `getCapability(driver, modelId, capabilityId)` — resolve by id **and** membership
  (`(cap {id:$capabilityId})-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id:$modelId})`)
  else `404 capability_not_found` (a capability of another model is *not found*
  under this model path — no cross-model read, AC-09). Embeds `neededBy`,
  `supportedBy` (each with `systemKind` read from `sys.attributes_json`'s
  `systemKind`, parsed at the boundary via `systemKindSchema`), `assignedContext`,
  and `detached` (§4.6 detached computation).
- `patchCapability(driver, modelId, capabilityId, patch)` — membership check;
  dynamic SET of supplied `name`/`description`/`attributes`; omitted fields
  untouched (mirrors `patchNode`); `SET cap.updatedAt=$now`. → `200`.
- `deleteCapability(driver, modelId, capabilityId)` — membership check, then the
  single-transaction cascade (§4.4). → `204`.

### 4.3 Mapping edge routes (FR-05, FR-03, DD-06)

`api/src/storage/capabilities.ts` — each validates the capability is in `:modelId`
first (`404 capability_not_found`), then the far-end node, then writes:

- `addNeededBy(driver, modelId, capabilityId, {activityId?, storyId?})` — exactly
  one of `activityId`/`storyId` required (zod refine). Validate the referenced
  `Activity`/`UserStory` belongs to the model: an `Activity` ∈
  `scopedNodeIds(modelId)`; a `UserStory` whose `DESCRIBES_ACTIVITY` activity ∈
  `scopedNodeIds(modelId)` (consumes `story-spec-core`'s join, does not
  re-implement). Miss → `404 not_found` (`details.field:"activityId"|"storyId"`).
  Then `MERGE (src)-[:NEEDS_CAPABILITY]->(cap)` — idempotent (DD-06). The pair is
  registered (both `Activity→Capability` and `UserStory→Capability`), so a valid
  target never 400s; a caller-forged wrong label surfaces `400 edge_endpoint_label_mismatch`
  via the endpoint check applied before `MERGE`. → `200`.
- `removeNeededBy(driver, modelId, capabilityId, {activityId?|storyId?})` —
  `MATCH (src {id:$srcId})-[r:NEEDS_CAPABILITY]->(cap {id:$capabilityId}) DELETE r`. → `204`.
- `addSupportedBy(driver, modelId, capabilityId, {systemId})` — verify
  `(:System {id:$systemId})` exists (else `404 system_not_found`); `MERGE (cap)-[:SUPPORTED_BY]->(sys)`
  — idempotent. → `200`.
- `removeSupportedBy(driver, modelId, capabilityId, systemId)` —
  `MATCH (cap {id:$capabilityId})-[r:SUPPORTED_BY]->(:System {id:$systemId}) DELETE r`. → `204`.
- `setContext(driver, modelId, capabilityId, {boundedContextId})` — verify
  `(:BoundedContext {id:$boundedContextId})` exists (else `404 bounded_context_not_found`);
  **replace** in one tx (at-most-one, FR-03):
  `MATCH (cap {id:$capabilityId}) OPTIONAL MATCH (cap)-[old:ASSIGNED_TO_CONTEXT]->() DELETE old WITH cap MATCH (bc:BoundedContext {id:$boundedContextId}) MERGE (cap)-[:ASSIGNED_TO_CONTEXT]->(bc)`. → `200`.
- `clearContext(driver, modelId, capabilityId)` —
  `MATCH (cap {id:$capabilityId})-[r:ASSIGNED_TO_CONTEXT]->() DELETE r`. → `204`.

**Endpoint validation for `MERGE` paths.** Because `MERGE`-based writes bypass the
`createEdge` whitelist, `capabilities.ts` calls the shared endpoint validator
(`validateEdge`-equivalent lookup over `_OntologyEdgeEndpoint`, the same the
registry uses) on the `(type, fromLabel, toLabel)` triple before each `MERGE`, so
a forged wrong pair still returns `400 edge_endpoint_label_mismatch` (AC-02/AC-04).

### 4.4 Cascade delete + support-gap analysis (FR-06, FR-07, FR-08, DD-05, DD-09)

**Cascade (FR-06).** Deleting a `Capability` removes all edges across its four
participating types in **one Cypher `DETACH DELETE` transaction**:

```cypher
MATCH (cap:Capability {id:$capabilityId})-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id:$modelId})
DETACH DELETE cap
RETURN count(cap) AS deleted
```

`DETACH DELETE` drops every relationship on `cap` — its `NEEDS_CAPABILITY` (in),
`SUPPORTED_BY`, `ASSIGNED_TO_CONTEXT`, `CAPABILITY_IN_MODEL` (out) — in the same
tx, so "single transaction / no dangling edges" is a storage-primitive guarantee
(AC-05). The `Activity`/`UserStory`/`System`/`BoundedContext`/`BusinessModel`
nodes on the far end are **never** in the delete set (they are not matched into
`DETACH DELETE`). Deleting one of those nodes is out of this spec's write surface
(graph-core / bounded-contexts routes own it); a capability left with an
unresolved mapping renders the "detached" indicator (§4.6, FR-13), not
auto-reconciled.

**Support-gap analysis (FR-07, FR-08, DD-09)** — `api/src/storage/system-model.ts`
`computeGaps(driver, modelId)`. Precompute `scopedActivityIds =
[...scopedNodeIds(driver, modelId)]` (JS-side; the set contains only structural
ids — the `MATCH (a:Activity) WHERE a.id IN $scopedActivityIds` naturally
restricts to activities). Returns the four categories in a **bounded** set of
reads (no per-capability N+1, NFR-07):

```cypher
// (a) unsupportedSteps + (b')(FR-08) capabilityGaps — one pass over model activities
MATCH (a:Activity) WHERE a.id IN $scopedActivityIds
OPTIONAL MATCH (a)-[:NEEDS_CAPABILITY]->(:Capability)-[:SUPPORTED_BY]->(capSys:System)
OPTIONAL MATCH (a)-[:USES_SYSTEM]->(directSys:System)
WITH a,
     count(DISTINCT capSys)    AS capPathSystems,
     count(DISTINCT directSys) AS directSystems
RETURN a.id AS activityId, a.name AS activityName, capPathSystems, directSystems
```

Post-classify each activity (DD-09 / FR-08):
- `capPathSystems = 0 AND directSystems = 0` → **`unsupportedSteps`** (Z in AC-06).
- `capPathSystems = 0 AND directSystems > 0` → **`capabilityGaps`** (Y — supported
  via raw `USES_SYSTEM` but unmodeled through a capability).
- `capPathSystems > 0` → supported, not flagged (X).

```cypher
// (b) capabilitiesWithoutSystem — model-scoped capabilities with zero SUPPORTED_BY
MATCH (cap:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id:$modelId})
WHERE NOT (cap)-[:SUPPORTED_BY]->(:System)
RETURN cap.id AS capabilityId, cap.name AS name

// (c) orphanSystems — Systems reached by this model's activities/capabilities
//     but mapped to NO Capability
MATCH (a:Activity) WHERE a.id IN $scopedActivityIds
MATCH (a)-[:USES_SYSTEM]->(sys:System)
WHERE NOT (:Capability)-[:SUPPORTED_BY]->(sys)
RETURN DISTINCT sys.id AS systemId, sys.name AS name
```

`(d) augmentation mix` — per model-scoped capability, group its `SUPPORTED_BY`
systems by `systemKind`:

```cypher
MATCH (cap:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id:$modelId})
OPTIONAL MATCH (cap)-[:SUPPORTED_BY]->(sys:System)
RETURN cap.id AS capabilityId, cap.name AS name, collect(sys.attributes_json) AS systemAttrsJson
```

JS-side, parse each `attributes_json`, read `systemKind` via `systemKindSchema`
(`SYSTEM_KINDS`, never a re-declared literal, NFR-03), and produce per-capability
`{functional, agentic, ai_predictive}` counts + shares plus a model-level roll-up
(sum over capabilities) — AC-07. A system with a missing/invalid `systemKind`
(pre-migration edge case) is counted under a `null`/`unknown` bucket surfaced in
the roll-up, not silently dropped.

`computeGaps` returns `{ unsupportedSteps[], capabilityGaps[], capabilitiesWithoutSystem[], orphanSystems[], augmentationMix: { perCapability[], model: {...} } }`,
each item carrying the ids/names needed to deep-link (FR-07). Deterministic,
side-effect-free.

### 4.5 Context map (FR-09, DD-07)

`api/src/storage/system-model.ts` `computeContextMap(driver, modelId)` — a bounded
read joining the model's assigned capabilities to the existing bounded-contexts
surface, resolving inter-context relationships to **`id`** (DD-07, C-01):

```cypher
// contexts that have >=1 model-scoped capability assigned
MATCH (cap:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id:$modelId})
MATCH (cap)-[:ASSIGNED_TO_CONTEXT]->(bc:BoundedContext)
OPTIONAL MATCH (bc)-[r:UPSTREAM_OF|DOWNSTREAM_OF]->(other:BoundedContext)
WITH bc,
     collect(DISTINCT {id:cap.id, name:cap.name}) AS capabilities,
     collect(DISTINCT {type:type(r), targetId:other.id, targetName:other.name}) AS relationships
RETURN bc.id AS id, bc.name AS name, bc.domain AS domain, bc.subdomain AS subdomain,
       capabilities, relationships
ORDER BY bc.name
```

The `relationships` shape is `{ type, targetId, targetName }` — **not** the
bounded-contexts route's name-only `{ type, target }` (DD-07). Relationship rows
where `r` is null (a context with no outgoing relationship) are filtered JS-side
(the `collect` yields a `{type:null,...}` row when `OPTIONAL MATCH` misses; it is
dropped).

```cypher
// unassigned bucket — model capabilities with no ASSIGNED_TO_CONTEXT
MATCH (cap:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id:$modelId})
WHERE NOT (cap)-[:ASSIGNED_TO_CONTEXT]->(:BoundedContext)
RETURN cap.id AS id, cap.name AS name
```

Returns `{ contexts: [{id,name,domain,subdomain,capabilities[],relationships[]}], unassigned: [{id,name}] }`.
No `BoundedContext`/relationship is created or mutated (NFR-04, AC-08).

### 4.6 Label + edge registration + detached computation (FR-01–02, FR-06, NFR-01)

`api/src/scripts/register-capability-labels.ts` exports
`registerCapabilitySchema(driver)`: one `createNodeLabel` (`Capability`,
permissive `json_schema_doc:{}`) then four `createEdgeType` calls
(`NEEDS_CAPABILITY` with its **two** endpoint pairs — DD-04 —, `SUPPORTED_BY`,
`ASSIGNED_TO_CONTEXT`, `CAPABILITY_IN_MODEL` with their §3.3 pairs), each wrapped
so a `409 name_conflict` (already-registered) is swallowed → **idempotent**
(mirrors `register-model-labels.ts` `isNameConflict`). Invoked (a) from
`applySchema` in `api/src/neo4j/bootstrap.ts` **after** `registerModelSchema`
(so `BusinessModel` exists for the `CAPABILITY_IN_MODEL` endpoint) and after
`registerStorySchema` (so `UserStory` exists for the second `NEEDS_CAPABILITY`
pair) — `createEdgeType` calls `assertEndpointLabelsExist`, so the endpoint labels
must pre-exist; and (b) standalone via `bun run register:capability`.

**Boot ordering (verified requirement).** `createEdgeType`'s
`assertEndpointLabelsExist` (verified `edge-types.ts:218`) requires
`Activity`/`System`/`BoundedContext` (core/as-built labels — present at boot),
`UserStory` (`story-spec-core`), and `BusinessModel` (`model-workspace-core`) to be
registered first. So `registerCapabilitySchema` runs **after** both
`registerModelSchema` and `registerStorySchema` in `applySchema` — the same
ordering pattern `story-spec-core` uses.

**Detached computation (FR-06, FR-13).** A mapping is "detached" when its far-end
node no longer resolves — but with `DETACH DELETE` on the far node the edge itself
is removed, so a truly dangling edge cannot exist for graph-core-deletable nodes.
The "detached" indicator therefore covers the case a `SUPPORTED_BY` /
`NEEDS_CAPABILITY` / `ASSIGNED_TO_CONTEXT` edge points at a node whose label no
longer matches (e.g. an id reused, or a partial import). `getCapability` computes
`detached` by `OPTIONAL MATCH` on each mapping and reporting any edge whose
expected endpoint label is absent; in the normal path `detached` is `[]`.

### 4.7 Route handlers + dispatch (FR-04, FR-05, FR-07, FR-09, FR-10)

`api/src/routes/capabilities.ts` — handlers returning the
`{error:{code,message,details?}}` envelope via `_helpers.ts`, mirroring existing
route files:

| Handler | Method + route |
|---------|----------------|
| `handleCapabilityList` | `GET /models/:modelId/capabilities` |
| `handleCapabilityCreate` | `POST /models/:modelId/capabilities` |
| `handleGaps` | `GET /models/:modelId/system-model/gaps` |
| `handleContextMap` | `GET /models/:modelId/system-model/context-map` |
| `handleCapabilityGet` | `GET /models/:modelId/capabilities/:capabilityId` |
| `handleCapabilityPatch` | `PATCH /models/:modelId/capabilities/:capabilityId` |
| `handleCapabilityDelete` | `DELETE /models/:modelId/capabilities/:capabilityId` |
| `handleNeededByPut` / `handleNeededByDelete` | `PUT`/`DELETE /models/:modelId/capabilities/:capabilityId/needed-by` |
| `handleSupportedByPut` | `PUT /models/:modelId/capabilities/:capabilityId/supported-by` |
| `handleSupportedByDelete` | `DELETE /models/:modelId/capabilities/:capabilityId/supported-by/:systemId` |
| `handleContextPut` / `handleContextDelete` | `PUT`/`DELETE /models/:modelId/capabilities/:capabilityId/context` |

**Dispatch (`api/src/router.ts`).** The existing `models*` block (verified
`router.ts:389`) delegates to `registerModelRoutes` and **falls through** when it
returns `null` (`if (res) return res;`). This spec adds a sibling
`registerCapabilityRoutes(method, sub, req)` **immediately after** that block, so
`models/:modelId/capabilities*` and `models/:modelId/system-model/*` that
`registerModelRoutes` does not own resolve here. Inside the delegate, a
`sub.match(/…/)` chain ordered **specific-before-parameterized**:

1. `^models\/([^/]+)\/system-model\/gaps$` (GET)
2. `^models\/([^/]+)\/system-model\/context-map$` (GET)
3. `^models\/([^/]+)\/capabilities$` (GET, POST)
4. `^models\/([^/]+)\/capabilities\/([^/]+)\/needed-by$` (PUT, DELETE)
5. `^models\/([^/]+)\/capabilities\/([^/]+)\/supported-by$` (PUT)
6. `^models\/([^/]+)\/capabilities\/([^/]+)\/supported-by\/([^/]+)$` (DELETE)
7. `^models\/([^/]+)\/capabilities\/([^/]+)\/context$` (PUT, DELETE)
8. `^models\/([^/]+)\/capabilities\/([^/]+)$` (GET, PATCH, DELETE) — **last**

The sub-route literals (`needed-by`, `supported-by`, `context`, `system-model`)
never collide with a `:capabilityId` UUIDv7, but specific-before-parameterized is
kept per the house convention and mirrors `story-spec-core`'s block.

### 4.8 Route-permission mapping + RBAC (FR-11, resolves C-04)

`api/src/auth/rbac-permissions.ts` — new `ROUTE_PERMISSIONS` rows via the `P(...)`
helper (verified structure). The matcher `matchSegments` (verified `rbac-permissions.ts:302`)
requires **equal segment count** and matches first-listed-wins (`getRoutePermission`,
verified line 315), so ordering must be specific-before-parameterized. **The full
ordered list (C-04 — design MUST enumerate it and prove precedence):**

```
// system-model read aggregates — most specific literals, first
P("GET",    "models/:modelId/system-model/gaps",         "capability:read"),
P("GET",    "models/:modelId/system-model/context-map",  "capability:read"),
// capability collection
P("GET",    "models/:modelId/capabilities",              "capability:read"),
P("POST",   "models/:modelId/capabilities",              "capability:write"),
// capability SUB-ROUTES — MORE specific than :capabilityId, MUST precede it
P("PUT",    "models/:modelId/capabilities/:capabilityId/needed-by",             "capability:write"),
P("DELETE", "models/:modelId/capabilities/:capabilityId/needed-by",             "capability:write"),
P("PUT",    "models/:modelId/capabilities/:capabilityId/supported-by",          "capability:write"),
P("DELETE", "models/:modelId/capabilities/:capabilityId/supported-by/:systemId","capability:write"),
P("PUT",    "models/:modelId/capabilities/:capabilityId/context",               "capability:write"),
P("DELETE", "models/:modelId/capabilities/:capabilityId/context",               "capability:write"),
// parameterized capability row — LAST
P("GET",    "models/:modelId/capabilities/:capabilityId",  "capability:read"),
P("PATCH",  "models/:modelId/capabilities/:capabilityId",  "capability:write"),
P("DELETE", "models/:modelId/capabilities/:capabilityId",  "capability:write"),
```

**Precedence proof (C-04).** `matchSegments` requires equal segment count, so a
6-segment `.../:capabilityId/needed-by` row and the 5-segment
`.../capabilities/:capabilityId` row can never both match a given path — segment
count alone disambiguates most rows. The one genuine risk is the 5-segment
parameterized `.../capabilities/:capabilityId` (GET/PATCH/DELETE) vs a 5-segment
literal that should out-rank it: there is none among these routes
(`.../capabilities` is 4 segments; every sub-route is ≥6 segments). The
`system-model/gaps|context-map` rows (5 segments) precede the `:capabilityId` row
so a path `models/X/system-model/gaps` matches the literal, not
`models/X/capabilities/:capabilityId` (different 4th segment anyway). Placement
above `model-workspace-core`'s `models/:id` (3-segment) rows is therefore
unnecessary for correctness (segment count differs) but the block is inserted
**before** them per the house specific-first convention. No new route is `public`;
auth is enforced only by the central gate (`router.ts` → `getRoutePermission` →
`hasPermissionByRbac`) — no per-route check (NFR-05, FR-11).

`api/src/scripts/seed-rbac-roles.ts` — the `business_architect` role (seeded by
`model-workspace-core` FR-11, extended by `story-spec-core`) gains
`"capability:read"` + `"capability:write"` in its permission array (idempotent
`MERGE` by role name — the seed re-writes the role's permission set). This spec
**modifies** that role's permission list; it does not create the role.

### 4.9 OpenAPI (FR-10)

`api/src/routes/openapi.ts` — register the request+response schemas
(`capabilityCreateSchema`, `capabilityPatchSchema`, `capabilityReadSchema`,
`neededBySchema`, `supportedBySchema`, `contextAssignSchema`, `gapsResultSchema`,
`contextMapResultSchema`) and `registerPath` each route (§4.7), generated from the
same zod definitions (no hand-maintained copy, FR-10). The three new `ERROR_CODES`
surface through the shared `errorEnvelopeSchema` responses. AC-09 asserts routes +
codes appear in `GET /api/v1/openapi.json`.

### 4.10 PWA — SystemModeler view (FR-12, FR-13, FR-14)

- **`pwa/src/views/index.tsx`** — the `model` surface's `systems` entry
  (registered as `<ModelTabPlaceholder … />` by `model-workspace-core`) is
  **replaced** with `"systems": (r) => <SystemModeler route={r} />` in the model
  surface's `renderView`/`VIEWS` dispatch. This is the only edit to that file
  (`route.ts`/`SURFACES` stay `model-workspace-core`'s). (Note: the current
  on-disk `"systems"` key at `pwa/src/views/index.tsx:62` is the **explorer**
  surface's systems tab → `ExplorerSystems`; the **model** surface's `systems`
  slot is `model-workspace-core`'s and does not exist on disk yet — §1.1.)
- **`pwa/src/views/model/SystemModeler.tsx` + `.module.css`** (FR-12, FR-13) —
  reads the active `BusinessModel` from `useActiveModel()`
  (`pwa/src/context/ActiveModelContext.tsx`, `model-workspace-core` FR-15); it
  does **not** re-implement model selection. Fetches capability list, gaps, and
  context map via a new `api.capabilities.*` / `api.systemModel.*` client (§4.11),
  keyed on `activeModel.id`. Renders **all four states**:
  - **loading** (AC-14) — skeleton while the three fetches are in flight
    (`Loading` from `views/_shared.tsx`).
  - **empty** (AC-15) — no capabilities → empty-state `Card` offering a **"New
    capability"** action and, when the model has activities/stories, a hint to
    start mapping.
  - **error** (AC-16) — `ErrorState` from `views/_shared.tsx` + retry button that
    refetches.
  - **ready** (AC-10/11/12) — three panels: the **capability list**
    (`DataTable`/`Card`, each row: name, needed-by count, supporting systems as
    `systemKind` `Pill`s, assigned context name); the **support-gap panel**
    (four FR-07 categories with counts + deep-link affordances + the
    augmentation-mix summary); the **context-map panel** (grouped list of
    contexts + their capabilities + inter-context relationships, and the
    `unassigned` bucket).
- **Detail + mapping editing** (FR-13, AC-13) — selecting a capability opens a
  catalog `SidePanel`/`Modal` showing name/description, its `NEEDS_CAPABILITY`
  sources, `SUPPORTED_BY` systems each with a `systemKind` `Pill`, and assigned
  context. Controls: edit (PATCH capability), add/remove needed-by source, add/
  remove supporting system, set/clear context (all FR-05 routes), delete the
  capability (FR-04). A mapping with an unresolved far-end shows the "detached"
  indicator; the selected capability's augmentation mix (FR-07d) shows inline. All
  controls keyboard-reachable (UX-05, AC-18).
- **Model-scope + reload survival** (FR-14, AC-19) — the view keys its fetches on
  `activeModel.id`; switching the active model (shell context) refetches for the
  new model; deep-linking `#/model/systems` + reload re-renders for the persisted
  active model (persistence is `model-workspace-core` FR-15; this view consumes it
  via `useActiveModel()` and refetches on `activeModel.id` change). No cross-model
  leakage (server-enforced via `CAPABILITY_IN_MODEL` membership, §4.1).
- **Tokens + a11y** (NFR-06, UX-02/05; AC-17/AC-18) — `SystemModeler.module.css`
  uses only `var(--…)` from `pwa/src/styles/companygraph/tokens.css`; catalog
  components (`Card`, `DataTable`, `Pill`, `Modal`, `SidePanel`) before inventing
  new ones. The view exposes an ARIA landmark; Tab reaches "New capability" then
  the list in DOM order; opening detail moves focus into the panel, Escape returns
  it (reusing the catalog `SidePanel`/`Modal` focus-trap — not re-implemented).
  `systemKind` conveyed by `Pill` **text** (`SYSTEM_KIND_LABELS`), not color
  alone.
  `bun run scripts/design-conformance.ts --view pwa/src/views/model/SystemModeler.tsx`
  exits 0 (AC-17; `--view` mode checks the co-located `.module.css`).

### 4.11 PWA api client (FR-12/FR-13) + `systemKind` read-path (FR-15)

`pwa/src/api.ts` — add `capabilities` + `systemModel` blocks reusing the existing
`json<T>()` fetch wrapper (verified `api.ts:40`):

```ts
capabilities: {
  list:   (modelId, signal?) => json(`/api/v1/models/${modelId}/capabilities`, withSignal(signal)),
  get:    (modelId, capId, signal?) => json(`…/capabilities/${capId}`, withSignal(signal)),
  create: (modelId, body) => json(`…/capabilities`, {method:"POST", …}),
  patch:  (modelId, capId, body) => json(`…/capabilities/${capId}`, {method:"PATCH", …}),
  remove: (modelId, capId) => json(`…/capabilities/${capId}`, {method:"DELETE", …}),
  neededBy:   { put: (m,c,body)=>…, remove:(m,c,body)=>… },      // needed-by
  supportedBy:{ put: (m,c,body)=>…, remove:(m,c,systemId)=>… },  // supported-by
  context:    { put: (m,c,body)=>…, clear:(m,c)=>… },            // context
},
systemModel: {
  gaps:       (modelId, signal?) => json(`…/system-model/gaps`, withSignal(signal)),
  contextMap: (modelId, signal?) => json(`…/system-model/context-map`, withSignal(signal)),
},
```

**FR-15 (`systemKind` read-path repoint).** Where SystemModeler (or a component it
reuses) reads a system's kind for a badge it reads `attributes.systemKind` via
`SYSTEM_KINDS`/`SYSTEM_KIND_LABELS` (`shared/src/schema/system-kind.ts`), **never**
the legacy `attributes.kind`. This spec's server reads `systemKind` off
`System.attributes_json` (§4.2/§4.4); its view renders via `SYSTEM_KIND_LABELS`.
The legacy shadow-`kind` read path this spec **touches** (if it reuses any system
render helper that reads `sAttrs.kind` — verified present at
`pwa/src/lib/journeyData.ts:189`) is repointed to `systemKind` **only where
SystemModeler exercises it**; read paths this spec does not touch stay with their
surface owner (FR-15 is `should`, requirements). AC-20 greps
`SystemModeler.tsx` for `systemKind`-literal violations.

## 5. HTTP API surface

All under `/api/v1/`, zod-validated at the boundary, `{error:{code,message,
details?}}` envelope, registered in `openapi.json` (FR-10). Permission column =
`ROUTE_PERMISSIONS` (§4.8, FR-11). No `?model=` query param on any route (DD-08).

| Method | Route | FR | Perm | Notes |
|--------|-------|----|------|-------|
| GET | `/api/v1/models/:modelId/capabilities` | FR-04 | `capability:read` | list, model-scoped via `CAPABILITY_IN_MODEL`; rows carry counts + assigned context |
| POST | `/api/v1/models/:modelId/capabilities` | FR-04 | `capability:write` | `{name,description?}`; 201 + UUIDv7 + `CAPABILITY_IN_MODEL` edge; unknown model → `404 model_not_found` |
| GET | `/api/v1/models/:modelId/capabilities/:capabilityId` | FR-04 | `capability:read` | detail + neededBy/supportedBy(w/ systemKind)/assignedContext/detached |
| PATCH | `/api/v1/models/:modelId/capabilities/:capabilityId` | FR-04 | `capability:write` | name/description/attributes; omitted preserved |
| DELETE | `/api/v1/models/:modelId/capabilities/:capabilityId` | FR-04,06 | `capability:write` | single-tx `DETACH DELETE` cascade → 204 |
| PUT | `.../capabilities/:capabilityId/needed-by` | FR-05 | `capability:write` | `{activityId?|storyId?}`; idempotent `MERGE`; target validated in-model |
| DELETE | `.../capabilities/:capabilityId/needed-by` | FR-05 | `capability:write` | removes the edge → 204 |
| PUT | `.../capabilities/:capabilityId/supported-by` | FR-05 | `capability:write` | `{systemId}`; idempotent; unknown → `404 system_not_found` |
| DELETE | `.../capabilities/:capabilityId/supported-by/:systemId` | FR-05 | `capability:write` | removes edge → 204 |
| PUT | `.../capabilities/:capabilityId/context` | FR-05 | `capability:write` | `{boundedContextId}`; replaces prior (at-most-one); unknown → `404 bounded_context_not_found` |
| DELETE | `.../capabilities/:capabilityId/context` | FR-05 | `capability:write` | unassigns → 204 |
| GET | `/api/v1/models/:modelId/system-model/gaps` | FR-07,08 | `capability:read` | 4 categories + augmentation mix; read-only |
| GET | `/api/v1/models/:modelId/system-model/context-map` | FR-09 | `capability:read` | contexts+capabilities+relationships(w/ `targetId`)+unassigned; read-only |

Error codes (§3.5): three added (`capability_not_found`, `bounded_context_not_found`,
`system_not_found`), each reachable from ≥1 route; `model_not_found`/`not_found`/
`edge_endpoint_label_mismatch`/`invalid_payload` reused.

## 6. UI design

- **View-tree placement (FR-12, UX-06).** `#/model/systems` → `SystemModeler`
  (route verbatim from the blueprint View Tree). No `route.ts`/`SURFACES` edit —
  the tab is registered by `model-workspace-core`; this spec swaps the
  `renderView`/`VIEWS` dispatch target for the model surface's `systems` tab
  (§4.10).
- **Component plan (UX-02).** `SystemModeler` reuses catalog components first:
  `Card`/`DataTable` (capability list + gap panels), `SidePanel`/`Modal` (detail +
  create/edit forms), `Pill` (`systemKind` badges — verified `Pill.tsx` `tone` +
  `children` props), `Loading`/`ErrorState`/`NotFoundPanel` from
  `views/_shared.tsx`. "detached" is a token-styled `<span>`. No new catalog
  component is justified.
- **States (UX-01):** loading / empty / error / ready per §4.10
  (AC-14/15/16/10-11-12-13).
- **Tokens (UX-02, NFR-06):** `SystemModeler.module.css` uses only `var(--…)`;
  `bun run scripts/design-conformance.ts --view pwa/src/views/model/SystemModeler.tsx`
  exits 0 (AC-17).
- **Input modes / Native Conflicts (UX-03/05):** no canvas/gesture/scroll-hijack/
  global-keyboard handler introduced — list/detail/form surface reusing catalog
  components + native form controls. The context map is a **grouped list/table**,
  not a drag-canvas (requirements Risk 4). ARIA landmark on the view; Tab order
  "New capability" → list → detail; `SidePanel` focus-trap + Escape reused from the
  catalog (AC-18).

## 7. Rejected alternatives

- **Reuse / extend `model-workspace-core`'s `IN_MODEL` edge to scope
  capabilities** — that edge is a lifecycle edge (`LIFECYCLE_EDGES`, verified);
  a generic write to it returns `409 model_lifecycle_route_required`, and adding
  an endpoint pair would demand a coordinated change to another spec. Rejected →
  this spec's own `CAPABILITY_IN_MODEL` type (DD-01, B-01).
- **Resolve model membership through the `NEEDS_CAPABILITY` source ∈
  `scopedNodeIds`** — drops a capability whose only source is an orphan activity
  (outside `scopedNodeIds`), so isolation ACs could pass while real capabilities
  vanish. Rejected → `CAPABILITY_IN_MODEL` as the authoritative key (DD-02, B-02,
  AC-06b).
- **Reuse the `GET /api/v1/ontology/bounded-contexts` route's relationship shape**
  — it is name-keyed (`{type,target:name}`), insufficient for deep-linking or
  dedupe. Rejected → this spec's own read resolving `{type,targetId,targetName}`
  (DD-07, C-01, AC-08).
- **Store capability domain fields as bespoke top-level props (like `story-spec-core`)**
  — a `Capability` has no queryable extra field (analysis joins on edges).
  Rejected → plain envelope + a dedicated `capabilities.ts` that only needs the
  atomic create+membership write (DD-03).
- **Two edge types `ACTIVITY_NEEDS_CAPABILITY` / `STORY_NEEDS_CAPABILITY`** —
  `createEdgeType` supports multi-pair endpoints (verified). Rejected → one
  `NEEDS_CAPABILITY` type, two pairs (DD-04, N-02).
- **N per-edge `DELETE /api/v1/edges/:id` for the cascade** — N round-trips +
  orphan window. Rejected → single `DETACH DELETE` tx (§4.4, FR-06).
- **Capability-path-only gap analysis (ignore raw `USES_SYSTEM`)** — flags
  already-supported steps as unsupported. Rejected → dual-path support + distinct
  `capabilityGaps` category (DD-09, FR-08).
- **A react-flow drag-canvas for the context map** — introduces gestures/scroll
  suppression, promoting the spec into canvas/input-mode territory. Rejected →
  grouped list/table (requirements Risk 4, UX-03).
- **Re-implementing model selection in SystemModeler** — re-specs
  `model-workspace-core`. Rejected → consume `useActiveModel()` (§4.10).
- **Capability derivation / "generate candidates from activities" bootstrap** —
  requirements Scope names it out-of-scope (C-03): a capability is a modeling
  judgment, not a mechanical projection. Rejected → manual authoring only.

## 8. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `shared/src/schema/ddd-system.ts` | new | FR-01,02,04,05,07,09,10 | zod: capability create/patch/read + mapping bodies + gaps/context-map result schemas |
| `api/src/scripts/register-capability-labels.ts` | new | FR-01,02, NFR-01 | idempotent `createNodeLabel` + 4 `createEdgeType` (incl. `NEEDS_CAPABILITY` 2 pairs, `CAPABILITY_IN_MODEL`); `register:capability` |
| `api/src/storage/capabilities.ts` | new | FR-04,05,06, NFR-02 | capability CRUD + mapping edges + `DETACH DELETE` cascade; atomic create+`CAPABILITY_IN_MODEL`; consumes `scopedNodeIds` (DD-03) |
| `api/src/storage/system-model.ts` | new | FR-07,08,09, NFR-07 | `computeGaps` + `computeContextMap` read aggregates; bounded round-trips (DD-05) |
| `api/src/routes/capabilities.ts` | new | FR-04,05,07,09,10 | 13 handlers; zod at boundary; envelope helpers |
| `api/src/errors.ts` | modify | FR-10 | +3 codes (`capability_not_found`, `bounded_context_not_found`, `system_not_found`); reuse `model_not_found`/`not_found` |
| `api/src/router.ts` | modify | FR-04,05,07,09 | `registerCapabilityRoutes` block after the `models*` block (§4.7) |
| `api/src/auth/rbac-permissions.ts` | modify | FR-11 | 13 `ROUTE_PERMISSIONS` rows (ordered §4.8); `capability:read`/`capability:write` |
| `api/src/scripts/seed-rbac-roles.ts` | modify | FR-11 | add `capability:*` to `business_architect` (consumed role; MERGE) |
| `api/src/neo4j/bootstrap.ts` | modify | FR-01,02 | call `registerCapabilitySchema` after `registerModelSchema` + `registerStorySchema` |
| `api/src/routes/openapi.ts` | modify | FR-10 | register capability/system-model paths + schemas |
| `package.json` | modify | FR-01 | `register:capability` script |
| `pwa/src/views/index.tsx` | modify | FR-12 | swap model surface `systems` tab dispatch → `<SystemModeler>` |
| `pwa/src/views/model/SystemModeler.tsx` | new | FR-12,13,14, UX-01/02/05 | list + gap + context-map panels + detail/edit + 4 states |
| `pwa/src/views/model/SystemModeler.module.css` | new | FR-12, NFR-06 | tokens-only |
| `pwa/src/api.ts` | modify | FR-12,13,15 | `capabilities` + `systemModel` client blocks (§4.11); `systemKind` read via `system-kind.ts` |

**Not edited (consumed):** `shared/src/schema/{nodes,edges}.ts` (NFR-01/AC-21),
`api/src/storage/{nodes,edges,model-scope,model-lifecycle-guard,models}.ts`
(primitives + `model-workspace-core`'s helpers untouched), `shared/src/schema/system-kind.ts`
(`system-augmentation-model`'s vocabulary), `api/src/routes/ontology-bounded-contexts.ts`
(read-only, NFR-04), `pwa/src/context/ActiveModelContext.tsx` / `pwa/src/route.ts`
(all `model-workspace-core`'s).

## 9. Test strategy

| AC | Kind | File |
|----|------|------|
| AC-01 | integration | `api/__tests__/capability-labels.integration.test.ts` — `Capability` via registry in `GET /schema`; `NODE_LABELS` unchanged; idempotent re-run (no dup rows) |
| AC-02 | integration | `api/__tests__/capability-edges.integration.test.ts` — 4 edges via `createEdgeType` (2 pairs on `NEEDS_CAPABILITY`); wrong pair (`SUPPORTED_BY` `Capability→Role`) → `400 edge_endpoint_label_mismatch`; assert **no** `Capability→BusinessModel` pair added to `IN_MODEL` (B-01); `EDGE_ENDPOINTS` unchanged |
| AC-03 | integration | `api/__tests__/capability-crud.integration.test.ts` — create→201+UUIDv7+`CAPABILITY_IN_MODEL` edge (even with no mapping); unknown model→`404 model_not_found`; list scoped w/ counts; detail embeds needed-by/supported-by(w/ systemKind)/context; PATCH preserves omitted; DELETE→204 |
| AC-04 | integration | `api/__tests__/capability-mapping.integration.test.ts` — `PUT needed-by {activityId}`/`{storyId}` idempotent `MERGE`; `PUT supported-by {systemId}`; `PUT context` replaces prior (at-most-one); each DELETE removes; unknown cap/system/context → matching `404 *_not_found` |
| AC-05 | integration | `api/__tests__/capability-cascade.integration.test.ts` — DELETE cascades all 4 edge types in one tx (no dangles); Activity/UserStory/System/BoundedContext/BusinessModel survive |
| AC-06 | integration | `api/__tests__/system-gap-analysis.integration.test.ts` — seeded X/Y/Z + capability C + system S; gaps returns Z∈unsupportedSteps, Y∈capabilityGaps, C∈capabilitiesWithoutSystem, S∈orphanSystems, X unflagged |
| AC-06b | integration | `api/__tests__/capability-model-scope.integration.test.ts` — capability whose only `NEEDS_CAPABILITY` source is an orphan activity (∉ `scopedNodeIds`) created via POST still appears in list + gaps (resolved via `CAPABILITY_IN_MODEL`) |
| AC-07 | integration | `api/__tests__/system-gap-analysis.integration.test.ts` — augmentation mix `{functional:2,agentic:1,ai_predictive:1}` + shares + model roll-up; kinds read via `SYSTEM_KINDS` (no re-declared literals) |
| AC-08 | integration | `api/__tests__/context-map.integration.test.ts` — assign 2 caps to BC1, 1 to BC4, 1 unassigned; context-map groups under BC1/BC4 (w/ domain/subdomain), relationships carry far context **`id`** (C-01), unassigned bucket; no BC/relationship mutated |
| AC-09 | unit+integration | `api/__tests__/capability-model-scope.integration.test.ts` (two-model isolation via `CAPABILITY_IN_MODEL`; a cap id **not** in `scopedNodeIds`; shared System in both) + `api/__tests__/capability-authz.test.ts` (403 w/o `capability:write` on POST/PUT/PATCH/DELETE; 200 GET w/ `capability:read`; `business_architect` resolves both; `:capabilityId` route resolves right despite sub-routes — C-04; no `public`) + `api/__tests__/capability-openapi.integration.test.ts` (routes+3 codes in openapi) |
| AC-10 | component (jsdom) | `pwa/src/__tests__/system-modeler.test.tsx` — `#/model/systems`→`SystemModeler` (not placeholder); reads `useActiveModel()`; ready capability list w/ needed-by count, `systemKind` badges, context name |
| AC-11 | component | `pwa/src/__tests__/system-modeler-gaps.test.tsx` — 4 gap categories + counts + deep-links; augmentation-mix summary via `systemKind` badges |
| AC-12 | component | `pwa/src/__tests__/system-modeler-context-map.test.tsx` — capabilities grouped under contexts + unassigned bucket + inter-context relationships |
| AC-13 | component | `pwa/src/__tests__/system-modeler-detail.test.tsx` — detail panel w/ name/desc + needed-by + supported-by(badges) + context; edit PATCHes; add/remove needed-by/system + set/clear context call FR-05 routes + update panel; detached indicator |
| AC-14,15,16 | component | `pwa/src/__tests__/system-modeler-states.test.tsx` — loading skeleton; empty w/ "New capability" (POST → appears) + hint; error + retry refetch |
| AC-17 | CLI | `bun run scripts/design-conformance.ts --view pwa/src/views/model/SystemModeler.tsx` — expect exit 0, zero token/component violations |
| AC-18 | manual | keyboard walk of `#/model/systems`: Tab → "New capability" (Enter), Tab into list, Enter opens a capability → focus enters detail panel, moves through mapping controls in order, each `systemKind` badge shows its text label, Escape returns focus to the originating row |
| AC-19 | e2e | `pwa/playwright/system-modeler-context.spec.ts` — model B active, nav `#/model/systems`, reload → same route renders `SystemModeler` w/ model B's capabilities/gaps/context-map |
| AC-20 | component + CLI | `pwa/src/__tests__/system-modeler-kind.test.tsx` (reads `attributes.systemKind` via `SYSTEM_KINDS`/`SYSTEM_KIND_LABELS`) + manual: `git grep -n '"agentic"\|"ai_predictive"' pwa/src/views/model/SystemModeler.tsx` → no matches (literals only in the imported vocabulary module) |
| AC-21 | CLI | `bun run typecheck` exit 0; `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts` shows no `NODE_LABELS`/`EDGE_ENDPOINTS` additions (incl. no `IN_MODEL` pair change — B-01) |

Integration tests need Neo4j (`bun test:integration`); unit/component run under
`bun test`. Two-model + orphan-activity fixtures are built via
`model-workspace-core`'s model/domain routes + core `POST /api/v1/domains`/
`journeys`/`nodes` for activities/systems + `story-spec-core`'s story routes — no
direct-driver seeding required. `System.attributes.systemKind` is set on seed
systems via the core node write (systems default `functional` per
`system-augmentation-model`; the augmentation-mix fixture sets explicit kinds).
