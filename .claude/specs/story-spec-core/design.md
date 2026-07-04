---
feature: "story-spec-core"
created: "2026-07-04"
author: "spec-author"
status: "draft"
size: "large"
reviewing_requirements_revision: "revised (2026-07-04)"
---

# Design: story-spec-core

> Traces the approved (revised) `requirements.md`: FR-01…FR-14, NFR-01…NFR-06,
> AC-01…AC-18. Every §-section names the FR/AC it serves; §7 is the file-change
> table (each row → an FR); §8 is the AC→test map. No requirement is invented
> here; where requirements left a **default** open (OQ-2 starter-AC content) it is
> recorded in §2 as a design decision the orchestrator may still surface.

## 1. Overview

`story-spec-core` makes **user stories** and their **acceptance criteria** graph
citizens on top of the `model-workspace-core` scoping regime. It adds:

1. **Two runtime ontology labels** — `UserStory` and `AcceptanceCriterion` (the
   latter carrying **structured Given/When/Then**, XD-10) — plus **three edge
   types** (`DESCRIBES_ACTIVITY`, `STORY_FOR_ROLE`, `ACCEPTANCE_OF`), all
   registered through the ontology-manager registry (`createNodeLabel` /
   `createEdgeType`); the compile-time `NODE_LABELS` / `EDGE_ENDPOINTS` consts are
   never touched (NFR-01, XD-01). This mirrors `model-workspace-core`'s
   registry-only rule 1 exactly.
2. **Dedicated top-level Neo4j properties for story/AC domain fields.** As in
   `model-workspace-core` (its design rule 2), the queryable story shape
   (`persona`, `action`, `benefit`, `narrative`, `derived`, `sourceActivityId`)
   and AC shape (`given`, `when`, `then`, `ordinal`, `derived`) are stored as
   **top-level properties**, not inside the opaque `attributes_json` string — so
   `ORDER BY ordinal` and `WHERE derived` are expressible and the boundary zod
   schema is the single enforcement point (NFR-03). The generic
   `createNode`/`patchNode` primitives (`api/src/storage/nodes.ts`) are left
   **byte-for-byte unchanged**; story/AC writes go through a dedicated
   `api/src/storage/stories.ts` that writes those extra properties directly.
3. **Model-scoped REST CRUD** for stories + ACs under
   `/api/v1/models/:modelId/stories*`, following the `model-workspace-core` route
   convention, scoped **through the story's `DESCRIBES_ACTIVITY` activity's
   membership** in `scopedNodeIds(driver, modelId)` (consumed from
   `api/src/storage/model-scope.ts`, never re-implemented) (FR-05, FR-06, NFR-02).
4. A **server-side generate-then-edit bootstrap** (XD-09) — a faithful port of
   `pwa/src/lib/userStories.ts` in a pure `api/src/derive/story-derive.ts` module
   (N-01 placement decision, §2) — that derives one candidate story + one starter
   AC per model-scoped activity and persists **editable** nodes; idempotent
   per-activity (FR-08, FR-09).
5. The **StoryCatalog** view at `#/model/stories` (route verbatim from the
   blueprint View Tree) that replaces the `ModelTabPlaceholder` `model-workspace-core`
   registered for the `stories` tab, reads the active model from the shell-owned
   `useActiveModel()`, and specs all four view states (FR-12, FR-13, FR-14).

The design follows the same four rules as its dependency: **registry-only
schema**, **domain state on dedicated storage (not generic primitives)**,
**consume `model-workspace-core` (never re-spec)**, **auth via the central gate
only**.

### 1.1 Hard build-order dependency (requirements C-02)

Every `model-workspace-core` surface this design imports is a **new file that does
not exist on disk at authoring time** (verified: `pwa/src/views/model/`,
`pwa/src/context/`, `api/src/storage/model-scope.ts` are all absent). This spec
**cannot start implementation** until `model-workspace-core` merges. The design
references its **approved-design interfaces** by their documented signatures
(cited in §3.1); implementation binds to the real files once they land.

## 2. Design decisions & prior-review carry-forwards

The requirements review (pass 1) left B-01/B-02/C-01…C-05 resolved **in the FRs**
already. This design records where each lands and the two remaining design-level
decisions.

| ID | Decision | Where |
|----|----------|-------|
| DD-01 | **Derivation module home (resolves requirements N-01).** Pure, I/O-free derivation lives at **`api/src/derive/story-derive.ts`**, a new `derive/` sibling — *not* under `storage/` (which is reserved for Neo4j-touching modules). `deriveStories(input)` takes a plain read-shape object and returns candidates; it opens no session. The bootstrap **endpoint** (`api/src/storage/stories.ts`) does the Neo4j read → calls `deriveStories` → does the writes. This keeps the parity unit test (AC-06) Neo4j-free. | §4.5, §7 |
| DD-02 | **Starter-AC content (requirements OQ-2 — recorded default).** Bootstrap generates **one** derived Given/When/Then starter AC per story (`given:"the <journey> preconditions are met"`, `when:"the <role> performs <activity>"`, `then:"the <journey> workflow advances"`, `ordinal:1`, `derived:true`), per FR-09. This is the recorded default (keeps XD-09's "generate-then-edit" spirit strongest); switching to story-only is a one-line change (skip the AC create). **The orchestrator may still surface OQ-2 to the user.** | §4.5 |
| DD-03 | **Story/AC domain fields are top-level Neo4j properties, not `attributes_json`** (mirrors `model-workspace-core` rule 2). Enables `ORDER BY ac.ordinal`, `WHERE s.derived`, and `WHERE a.id IN $scopedActivityIds` joins. The generic node primitives stay untouched; `api/src/storage/stories.ts` writes these props directly via parameterized Cypher. `attributes` (the open map) is still stored as `attributes_json` per the node envelope. | §3.1, §3.2 |
| DD-04 | **Activity→story cardinality is `1..*` (requirements C-01, FR-03).** No graph uniqueness constraint on `(activityId)` for `DESCRIBES_ACTIVITY`; manual create allows multiple stories per activity; bootstrap **skips** any activity with ≥1 story (a per-activity skip rule, §4.5). `story_duplicate_for_activity` is **reserved but not thrown** — it is **not** added to `ERROR_CODES` by this spec (adding an unreachable code would fail `envelope.test.ts`'s reachability assertion). If the user later wants hard 1:1, the single change is a duplicate check on `POST /stories` + adding the code then. | §3.5, §4.2 |
| DD-05 | **`derived` clears on any hand edit (FR-05, FR-06).** `PATCH /stories/:id` and `PATCH …/acceptance-criteria/:acId` always `SET n.derived = false` in the same tx as the field update, regardless of which fields the caller sent (an edit is an edit). This is enforced in the storage function, not the route, so it cannot be bypassed. | §4.2, §4.3 |
| DD-06 | **No `?model=` query param (consistency with `model-workspace-core` C-01/D-1).** All story/AC reads are scoped by the **`:modelId` path param**, never a query param. Model isolation is proven by the `scopedNodeIds` activity-join (§4.1) + the two-model integration test (AC-08). | §4.1, §5 |

## 3. Data model

All two labels + three edges are registered at boot via `createNodeLabel` /
`createEdgeType` (§4.6). Registry attribute schemas are **permissive** (open
`attributes`), because the queryable shape is owned by the dedicated storage layer
as top-level properties (DD-03). REST-boundary zod schemas live in a new
`shared/src/schema/story-spec.ts`.

### 3.1 `UserStory` (FR-01)

Standard node envelope (`id` UUIDv7 server-generated, `name`, `description`,
`createdAt`, `updatedAt`, `attributes_json`) **plus** top-level properties:

| Prop | Type | Notes |
|------|------|-------|
| `persona` | string | e.g. "Store Associate"; `"user"` fallback in derivation |
| `action` | string | the activity name |
| `benefit` | string | e.g. "the checkout workflow completes" |
| `narrative` | string | server-assembled "As a `<persona>`, I want to `<action>`, so that `<benefit>`." |
| `derived` | boolean | `true` = bootstrap-generated, not yet hand-edited; clears on any PATCH (DD-05) |
| `sourceActivityId` | string | the `Activity` id the story `DESCRIBES_ACTIVITY` (denormalized for read convenience; the edge is authoritative) |

`name` defaults to the `narrative` (the story's display label); `description`
defaults `""`. `zod` (`shared/src/schema/story-spec.ts`):

- `storyCreateSchema` — `{ persona: z.string().min(1), action: z.string().min(1),
  benefit: z.string().min(1), activityId: z.string().min(1), roleId:
  z.string().min(1).optional(), description: z.string().optional(), attributes:
  z.record(z.unknown()).optional() }`. **`narrative` is server-assembled, never
  client-supplied** (§4.2).
- `storyPatchSchema` — all of `persona`/`action`/`benefit`/`description`/
  `attributes`/`activityId`/`roleId` optional (omitted → unchanged, DD-05
  re-assembles `narrative` when any of persona/action/benefit changed).
- `storyReadSchema` — envelope + the six props + `activityId`/`activityName`,
  `roleId?`/`roleName?`, `acCount:int` (list rows), and `detached:boolean` (the
  `DESCRIBES_ACTIVITY` target no longer resolves — FR-07/FR-13). Detail adds
  `acceptanceCriteria: acReadSchema[]` ordered by `ordinal`.

### 3.2 `AcceptanceCriterion` (FR-02, XD-10)

Envelope **plus** top-level properties (DD-03):

| Prop | Type | Notes |
|------|------|-------|
| `given` | string (non-empty) | precondition clause |
| `when` | string (non-empty) | action clause |
| `then` | string (non-empty) | outcome clause |
| `ordinal` | int | 1-based order within a story; unique-per-story by server allocation (§4.3) |
| `derived` | boolean | `true` = bootstrap starter AC; clears on PATCH (DD-05) |

`name` defaults to a compact `"<when> → <then>"` label; `description` `""`. `zod`:

- `acCreateSchema` — `{ given: z.string().min(1), when: z.string().min(1), then:
  z.string().min(1), ordinal: z.number().int().positive().optional() }`. The
  three `.min(1)` are the **single enforcement point** for NFR-03 (free-text /
  partial ACs → `400 acceptance_criterion_clause_required`, mapped in §4.3).
- `acPatchSchema` — `{ given?, when?, then?, ordinal? }`, each clause still
  `.min(1)` when present.
- `acReadSchema` — envelope + the five props.

### 3.3 Edges (FR-03, FR-04) — registered via `createEdgeType`

| Edge | Endpoint pair (`_OntologyEdgeEndpoint`) | Cardinality | Meaning |
|------|-----------------------------------------|-------------|---------|
| `DESCRIBES_ACTIVITY` | `UserStory → Activity` | story: exactly 1; activity: `0..*` (DD-04) | the activity the story is about |
| `STORY_FOR_ROLE` | `UserStory → Role` | story: `0..1` | the executing persona/role |
| `ACCEPTANCE_OF` | `AcceptanceCriterion → UserStory` | AC: exactly 1 | AC's parent story |

Endpoint pairs are written as `_OntologyEdgeEndpoint` rows by `createEdgeType`;
the registry-backed validator (`api/src/storage/edges.ts` → `getEdgeEndpoints`
cache) enforces them and returns `400 edge_endpoint_label_mismatch` on a wrong
pair (AC-02). The frozen `EDGE_ENDPOINTS` const is not edited (NFR-01, AC-18).

> **Note — direct `createEdge` vs. bespoke Cypher.** `DESCRIBES_ACTIVITY`,
> `STORY_FOR_ROLE`, and `ACCEPTANCE_OF` are ordinary graph edges (no lifecycle
> state), so `api/src/storage/stories.ts` uses the existing
> `createEdge(driver, {type, fromId, toId})` primitive to wire them — which runs
> the endpoint-label whitelist for free. There is **no** `model_lifecycle_route_
> required` guard on these edge types (they are not lifecycle edges; that guard
> is `model-workspace-core`'s and covers only its five edges).

### 3.4 Model-scoping mechanism (FR-05 note, NFR-02, resolves requirements B-01)

Stories/ACs are **not** members of `scopedNodeIds(driver, modelId)` — that helper
(`model-workspace-core` design §4.2) returns only **structural** ids
(`Domain`/`UserJourney`/`Activity`/`ModuleInstance` reachable via
`IN_MODEL` + `PART_OF*`). A `UserStory` attaches to its `Activity` via
`DESCRIBES_ACTIVITY` (not `PART_OF`), so its id never appears in that set.
Isolation is therefore resolved **through the activity**:

- A `UserStory` is in model A **iff** its `DESCRIBES_ACTIVITY` target `Activity`
  ∈ `scopedNodeIds(driver, modelA)`.
- An `AcceptanceCriterion` is in model A **iff** its parent story (via
  `ACCEPTANCE_OF`) is in model A.

Because `Activity` **is** a member of `scopedNodeIds` (it is `PART_OF*` a domain
under `IN_MODEL`), the join in §4.1 is well-defined. This is the exact invariant
requirements FR-07's note fixed; §4.1 gives the Cypher.

### 3.5 Error codes (FR-10) — additive to the closed `ERROR_CODES`

Added to `ERROR_CODES` (`api/src/errors.ts`), all additive/non-breaking (NFR-11):

| Code | HTTP | Thrown from |
|------|------|-------------|
| `story_not_found` | 404 | story detail/patch/delete; AC routes when parent story absent or not in `:modelId` |
| `acceptance_criterion_not_found` | 404 | AC patch/delete when the AC id is not under the named story |
| `story_activity_required` | 400 | `POST /stories` when `activityId` is absent, not an `Activity`, or not scoped to `:modelId` |
| `acceptance_criterion_clause_required` | 400 | AC create/patch when any of `given`/`when`/`then` is missing/empty (NFR-03) — surfaced by mapping the zod `.min(1)` failure to this code (§4.3) |

`story_duplicate_for_activity` is **NOT added** (DD-04 — reserved-but-unreachable;
adding it would break `envelope.test.ts` reachability). Each added code is
reachable from ≥1 route (verified by `envelope.test.ts` + AC-04/AC-09).

## 4. Core logic

### 4.1 Model-scoped read helper usage (FR-05, FR-06, NFR-02)

`api/src/storage/stories.ts` imports `scopedNodeIds` from
`api/src/storage/model-scope.ts` (`model-workspace-core` FR-18). The story **list**
query (`listStories(driver, modelId)`):

```cypher
// $scopedActivityIds = [...scopedNodeIds(driver, modelId)]  (JS-side, filtered to Activity ids —
// the set already contains only structural ids; the DESCRIBES_ACTIVITY match below
// naturally restricts to Activity because the edge endpoint is UserStory→Activity)
MATCH (s:UserStory)-[:DESCRIBES_ACTIVITY]->(a:Activity)
WHERE a.id IN $scopedActivityIds
OPTIONAL MATCH (s)-[:STORY_FOR_ROLE]->(r:Role)
OPTIONAL MATCH (ac:AcceptanceCriterion)-[:ACCEPTANCE_OF]->(s)
RETURN s, a.id AS activityId, a.name AS activityName,
       r.id AS roleId, r.name AS roleName, count(ac) AS acCount
ORDER BY s.createdAt ASC
```

`detached` is always `false` on a list row (the `MATCH` requires a resolvable
activity). A story whose activity was deleted elsewhere (FR-07) is surfaced only
in **detail** (§4.2) — the list query cannot return it because its
`DESCRIBES_ACTIVITY` no longer resolves, which is the correct "hidden from the
model list, still addressable by id" behavior. (Detail-by-id resolves the story
node directly and reports `detached:true` when the activity `OPTIONAL MATCH`
misses.)

`scopedNodeIds` is called once per list/detail/AC-list/bootstrap request; a model
with no scoped activities returns `[]` fast (empty-state, AC-13).

### 4.2 Story CRUD (FR-05, DD-05)

`api/src/storage/stories.ts`:

- `createStory(driver, modelId, input)` —
  1. **Activity validation.** Confirm `input.activityId` ∈ `scopedNodeIds(driver,
     modelId)` **and** is labelled `Activity` (single read). Miss → `400
     story_activity_required`. When `roleId` supplied, confirm it is a `Role`
     (else `400 story_activity_required` with `details.field:"roleId"`, or reuse
     `not_found` — chosen: `story_activity_required` keeps one create-precondition
     code).
  2. **Assemble `narrative`** server-side: `"As a <persona>, I want to <action>,
     so that <benefit>."` (never client-supplied — §3.1).
  3. `createNode`-style write **through `stories.ts`** (not the generic
     primitive, DD-03): `CREATE (s:UserStory { …envelope…, persona, action,
     benefit, narrative, derived:false, sourceActivityId:$activityId })`.
  4. Wire edges via `createEdge`: `DESCRIBES_ACTIVITY` (UserStory→Activity), and
     `STORY_FOR_ROLE` (UserStory→Role) when `roleId` present. → `201` + full
     `storyReadSchema` body incl. `acCount:0`, `detached:false`.
- `getStory(driver, modelId, storyId)` — resolve the story by id, verify its
  `DESCRIBES_ACTIVITY` activity ∈ `scopedNodeIds(modelId)` (else `404
  story_not_found` — a story of another model is *not found* under this model
  path, so no cross-model read), embed ACs ordered by `ordinal ASC`, compute
  `detached` (activity unresolved). 
- `patchStory(driver, modelId, storyId, patch)` — model-membership check as
  above; dynamic SET of the supplied `persona`/`action`/`benefit`/`description`/
  `attributes`; **re-assemble `narrative`** if any of persona/action/benefit
  changed; re-point `DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE` when `activityId`/
  `roleId` supplied (delete old edge, create new — new `activityId` re-validated
  scoped); **always `SET s.derived = false`** (DD-05); omitted fields untouched
  (mirrors `patchNode`). → `200`.
- `deleteStory(driver, modelId, storyId)` — model-membership check, then the
  single-transaction cascade (§4.4). → `204`.

### 4.3 AC CRUD (FR-06, NFR-03, DD-05)

`api/src/storage/stories.ts`:

- `createAc(driver, modelId, storyId, input)` — verify the parent story exists
  **and** is in `:modelId` (§4.2 membership) else `404 story_not_found`. Allocate
  `ordinal = coalesce(max(existing.ordinal),0)+1` in-tx when omitted. `CREATE
  (ac:AcceptanceCriterion {…, given, when, then, ordinal, derived:false})` then
  `createEdge` `ACCEPTANCE_OF` (AcceptanceCriterion→UserStory). → `201`.
- `listAcs(driver, modelId, storyId)` — parent-in-model check, `MATCH
  (ac)-[:ACCEPTANCE_OF]->(s {id:$storyId}) RETURN ac ORDER BY ac.ordinal ASC`.
- `patchAc(driver, modelId, storyId, acId, patch)` — verify story-in-model **and**
  the AC is under that story (`(ac {id:$acId})-[:ACCEPTANCE_OF]->(s {id:$storyId})`)
  else `404 acceptance_criterion_not_found`; dynamic SET of any of
  `given`/`when`/`then`/`ordinal`; **`SET ac.derived=false`** (DD-05). → `200`.
- `deleteAc(driver, modelId, storyId, acId)` — same membership check; `DETACH
  DELETE ac`. → `204`.

**NFR-03 enforcement.** The zod `.min(1)` on each clause (§3.2) is the single
gate. The route handler maps a zod failure whose path includes `given`/`when`/
`then` to `ValidationError("acceptance_criterion_clause_required", {field}, 400)`
(instead of the generic `invalid_payload`), so AC-04's exact-code assertion holds.
Reorder (FR-13) is expressed as a `PATCH …/:acId {ordinal}` — no dedicated route.

### 4.4 Cascade delete (FR-07, resolves requirements N-03/C-05)

Deleting a `UserStory` removes its ACs and **all** edges across its three
participating edge types in **one Cypher `DETACH DELETE` transaction** — not N
per-edge `DELETE /edges/:id` round-trips:

```cypher
MATCH (s:UserStory {id:$storyId})
OPTIONAL MATCH (ac:AcceptanceCriterion)-[:ACCEPTANCE_OF]->(s)
DETACH DELETE ac, s
RETURN count(s) AS deleted
```

`DETACH DELETE` drops every relationship on the deleted nodes — the story's
`DESCRIBES_ACTIVITY` + `STORY_FOR_ROLE` and each AC's `ACCEPTANCE_OF` — in the
same tx, so "single transaction / no orphan ACs / no dangling edges" is a
storage-primitive guarantee (AC-05). The story's `Activity`/`Role` nodes are
**never** in the `DELETE` list, so they survive (AC-05). Deleting an `Activity` is
out of this spec's write surface (graph-core routes own it); a story left detached
by such a delete is handled by the `detached` indicator (§4.1, FR-13), not
auto-reconciled.

### 4.5 Server-side derivation + bootstrap (FR-08, FR-09, NFR-04, DD-01, DD-02)

**Pure derivation** — `api/src/derive/story-derive.ts` (DD-01, no Neo4j):

```ts
export interface DeriveActivityInput {
  activity: { id: string; name: string; createdAt: string };
  roles:    { id: string; name: string; createdAt: string }[];  // via EXECUTES
  systems:  { id: string; name: string; createdAt: string }[];  // via USES_SYSTEM
  locations:{ id: string; name: string; createdAt: string }[];  // via AT_LOCATION
  journeyName: string | null;  // parent UserJourney (PER-ACTIVITY, via PART_OF); null = orphan
}
export interface DerivedStory {
  activityId: string; persona: string; action: string; benefit: string;
  narrative: string; roleId?: string; roleName?: string;
  systemIds: string[]; locationId?: string; locationName?: string;
}
export function deriveStories(inputs: DeriveActivityInput[]): DerivedStory[];
```

Per activity (faithful port of `formulateUserStories`):

- **Deterministic primary selection (resolves requirements B-02 tiebreak).**
  primary `Role`/`Location` = the candidate with **lowest `createdAt`, then lowest
  `id`** (the client's order-dependent `[0]` made deterministic server-side).
- `persona = primaryRole?.name ?? "user"`; `action = activity.name`.
- `benefit = "the " + journeyName.toLowerCase() + " workflow completes"` when a
  parent journey exists; **orphan fallback** (resolves requirements C-03):
  `journeyName === null` → `benefit = "the workflow completes"` (no journey
  token), keeping derivation **total**.
- `narrative = "As a <persona>, I want to <action>, so that <benefit>."`.

**Bootstrap endpoint** — `POST /api/v1/models/:modelId/stories/bootstrap`, backed
by `bootstrapStories(driver, modelId, opts?)` in `api/src/storage/stories.ts`:

1. Compute the scoped activity id set = `scopedNodeIds(driver, modelId)` filtered
   to `Activity`. Optional body `{ activityIds?: string[] }` narrows to those ids
   (each must be a scoped activity of `:modelId`, else `400
   story_activity_required`).
2. **Skip rule (DD-04).** Drop any activity that already has ≥1
   `DESCRIBES_ACTIVITY` story — `WHERE NOT EXISTS { (:UserStory)-[:DESCRIBES_ACTIVITY]->(a) }`
   — so re-running never double-derives (`skipped` counts these).
3. For each remaining activity, read its structural neighborhood (roles via
   `EXECUTES`, systems via `USES_SYSTEM`, locations via `AT_LOCATION`, **parent
   journey per-activity** via `PART_OF`) into the `DeriveActivityInput` shape, then
   call `deriveStories`.
4. Persist each candidate as an **editable** node: `createStory`-equivalent with
   `derived:true`, wire `DESCRIBES_ACTIVITY` (+ `STORY_FOR_ROLE` when a primary
   role exists), and create **one derived starter AC** (DD-02) wired
   `ACCEPTANCE_OF` with `derived:true`, `ordinal:1`, and the journey/role/activity
   clauses (orphan → the article-free "the workflow" phrasing).
5. → `200 { created: N, skipped: M }`. Persisted nodes are ordinary editable
   stories/ACs; a later PATCH clears `derived` (DD-05, AC-07).

**Parity harness (NFR-04, AC-06).** `deriveStories` and the client
`formulateUserStories(data, journeyName)` **cannot share one input object** (the
client consumes a column-indexed `JourneyData`; the server reads a structural
shape). The parity test (`api/__tests__/story-derive-parity.test.ts`) therefore:
(1) declares **one canonical single-journey structural fixture**; (2) maps it to
(a) `DeriveActivityInput[]` for `deriveStories` and (b) a `JourneyData` projection
for `formulateUserStories`, **constructed so the client's column-order primary
agrees with the server's `createdAt`-then-`id` tiebreak**; (3) asserts **equal
`narrative` strings** per activity and the same primary role/location. A separate
case asserts the **orphan-activity fallback** narrative
(`"…so that the workflow completes."`) on the server side. Single-journey keeps
the client's one `journeyName` argument well-defined.

### 4.6 Label + edge registration (FR-01–04, NFR-01)

`api/src/scripts/register-story-labels.ts` exports
`registerStorySchema(driver)`: two `createNodeLabel` calls (`UserStory`,
`AcceptanceCriterion`, permissive `json_schema_doc:{}`) then three
`createEdgeType` calls (`DESCRIBES_ACTIVITY`, `STORY_FOR_ROLE`, `ACCEPTANCE_OF`
with their §3.3 endpoint pairs), each wrapped so a `409 name_conflict`
(already-registered) is swallowed → **idempotent** (FR-01/FR-02, AC-01). Invoked
(a) from `applySchema` in `api/src/neo4j/bootstrap.ts` **after**
`model-workspace-core`'s `registerModelSchema` (so `Activity`/`Role`/`UserStory`
all exist when the edge endpoints are checked — `assertEndpointLabelsExist`
requires the endpoint labels to pre-exist), and (b) standalone via `bun run
register:story`. The edge-endpoints cache invalidates via the existing
`ontology.changed` event; `nodeReadSchema.label` (`z.string()`) already accepts
the new labels.

**Boot ordering (verified requirement).** `createEdgeType` calls
`assertEndpointLabelsExist(tx, endpoints)` (verified in `edge-types.ts`), so
`DESCRIBES_ACTIVITY`'s `UserStory`/`Activity` and `STORY_FOR_ROLE`'s `Role` must
be registered first. `UserStory`/`AcceptanceCriterion` are registered by this
spec's node-label step (same function, ordered before the edge step); `Activity`/
`Role` are core labels already registered at boot. So `registerStorySchema`'s
internal ordering (nodes then edges) is sufficient; it need only run after the
core-label seed (which it does, via `applySchema`).

### 4.7 Route handlers + dispatch (FR-05, FR-06, FR-09, FR-10)

`api/src/routes/stories.ts` — handlers returning the `{error:{code,message,
details?}}` envelope via `_helpers.ts` (`ok`/`noContent`/`error`/`readJson`/
`fromValidationError`), mirroring the existing route files:

| Handler | Method + route |
|---------|----------------|
| `handleStoryList` | `GET /models/:modelId/stories` |
| `handleStoryCreate` | `POST /models/:modelId/stories` |
| `handleStoryBootstrap` | `POST /models/:modelId/stories/bootstrap` |
| `handleStoryGet` | `GET /models/:modelId/stories/:storyId` |
| `handleStoryPatch` | `PATCH /models/:modelId/stories/:storyId` |
| `handleStoryDelete` | `DELETE /models/:modelId/stories/:storyId` |
| `handleAcList` | `GET /models/:modelId/stories/:storyId/acceptance-criteria` |
| `handleAcCreate` | `POST /models/:modelId/stories/:storyId/acceptance-criteria` |
| `handleAcPatch` | `PATCH /models/:modelId/stories/:storyId/acceptance-criteria/:acId` |
| `handleAcDelete` | `DELETE /models/:modelId/stories/:storyId/acceptance-criteria/:acId` |

**Dispatch** (`api/src/router.ts`) — a `models/:modelId/stories*` block of
`sub.match(/…/)` regexes mirroring the existing per-resource blocks, inserted so
**more specific paths match first**: `bootstrap` and the `acceptance-criteria`
sub-routes **before** the `:storyId` parameterized rows. Order:

1. `^models\/([^/]+)\/stories$` (GET list, POST create)
2. `^models\/([^/]+)\/stories\/bootstrap$` (POST)
3. `^models\/([^/]+)\/stories\/([^/]+)\/acceptance-criteria$` (GET, POST)
4. `^models\/([^/]+)\/stories\/([^/]+)\/acceptance-criteria\/([^/]+)$` (PATCH, DELETE)
5. `^models\/([^/]+)\/stories\/([^/]+)$` (GET, PATCH, DELETE) — **last**

(`bootstrap` and `acceptance-criteria` literals never collide with a `:storyId`
UUIDv7, but ordering specific-before-parameterized is kept for clarity and matches
the `model-workspace-core` convention.) This block sits **after** the
`model-workspace-core` `models*` block in `router.ts`.

### 4.8 Route-permission mapping + RBAC (FR-11)

`api/src/auth/rbac-permissions.ts` — new `ROUTE_PERMISSIONS` rows, **specific
before parameterized** (the AC sub-routes + `bootstrap` before `:storyId`):

```
P("GET",    "models/:modelId/stories", "story:read"),
P("POST",   "models/:modelId/stories", "story:write"),
P("POST",   "models/:modelId/stories/bootstrap", "story:write"),
P("GET",    "models/:modelId/stories/:storyId/acceptance-criteria", "story:read"),
P("POST",   "models/:modelId/stories/:storyId/acceptance-criteria", "story:write"),
P("PATCH",  "models/:modelId/stories/:storyId/acceptance-criteria/:acId", "story:write"),
P("DELETE", "models/:modelId/stories/:storyId/acceptance-criteria/:acId", "story:write"),
P("GET",    "models/:modelId/stories/:storyId", "story:read"),
P("PATCH",  "models/:modelId/stories/:storyId", "story:write"),
P("DELETE", "models/:modelId/stories/:storyId", "story:write"),
```

These rows are inserted **before** `model-workspace-core`'s `models/:id`
parameterized rows (the `matchSegments` matcher requires equal segment count, so a
6-/7-/8-segment `stories*` row never collides with the 3-segment `models/:id`
rows — but placement stays specific-first per the house convention). No new route
is `public`; auth is enforced only by the central gate (`router.ts` →
`getRoutePermission` → `hasPermissionByRbac`) — no per-route check (NFR-05).

`api/src/scripts/seed-rbac-roles.ts` — the `business_architect` role (seeded by
`model-workspace-core` FR-11) gains `"story:read"` + `"story:write"` in its
permission array (idempotent MERGE by role name — the seed re-writes the role's
permission set). This spec **modifies** that role's permission list; it does not
create the role.

### 4.9 OpenAPI (FR-10)

`api/src/routes/openapi.ts` — register the story/AC request+response schemas
(`storyCreateSchema`, `storyPatchSchema`, `storyReadSchema`, `acCreateSchema`,
`acPatchSchema`, `acReadSchema`, `bootstrapRequestSchema`, `bootstrapResultSchema`)
and `registerPath` each of the ten routes (§4.7), generated from the same zod
definitions (no hand-maintained copy, FR-10). The four new `ERROR_CODES` surface
in the shared `errorEnvelopeSchema` responses. AC-09 asserts routes + codes appear
in `GET /api/v1/openapi.json`.

### 4.10 PWA — StoryCatalog view (FR-12, FR-13, FR-14)

- **`pwa/src/views/index.tsx`** — the `model` surface's `stories` entry
  (registered as `<ModelTabPlaceholder spec="story-spec-core"/>` by
  `model-workspace-core`) is **replaced** with `"stories": (r) => <StoryCatalog
  route={r} />`. This is the only edit to that file (`route.ts`/`SURFACES` stay
  `model-workspace-core`'s).
- **`pwa/src/views/model/StoryCatalog.tsx` + `.module.css`** (FR-12, FR-13) —
  reads the active `BusinessModel` from `useActiveModel()`
  (`pwa/src/context/ActiveModelContext.tsx`, `model-workspace-core` FR-15); it
  does **not** re-implement model selection. Fetches `GET
  /api/v1/models/:modelId/stories` via a new `api.stories.*` client (§4.11).
  Renders **all four states**:
  - **loading** (AC-12) — skeleton rows while the fetch is in flight (`Loading`
    from `views/_shared.tsx`).
  - **empty** (AC-13) — no stories → empty-state `Card` offering **"Generate from
    graph"** (POST `.../bootstrap`) and a manual **Create** affordance.
  - **error** (AC-14) — `ErrorState` from `views/_shared.tsx` + retry button that
    refetches.
  - **ready** (AC-10) — a `DataTable`/`Card` list, each row: narrative, linked
    activity name, role, AC count.
- **Detail + edit** (FR-13, AC-11) — selecting a row opens a catalog `SidePanel`
  (or `Modal`) showing the narrative, activity/role, and ACs as **Given/When/Then
  triples**. Controls: edit story (PATCH), add/edit/delete/**reorder** ACs
  (reorder = up/down buttons → `PATCH …/:acId {ordinal}`, keyboard-reachable — no
  drag handler, per requirements Native Conflicts), delete story, and a per-story
  **"Generate from graph"** (bootstrap scoped to that story's activity via
  `{activityIds:[activityId]}`). A `derived:true` story/AC shows a **"derived"
  badge**; a hand edit clears it (the PATCH response's `derived:false` re-renders
  it away). A story with `detached:true` shows a **"detached" indicator**.
- **Model-scope + reload survival** (FR-14, AC-17) — the view keys its fetch on
  `activeModel.id`; switching the active model (shell context) refetches for the
  new model; deep-linking `#/model/stories` + reload re-renders for the persisted
  active model (persistence is `model-workspace-core` FR-15; this view consumes it
  via `useActiveModel()` and refetches on `activeModel.id` change). No cross-model
  leakage (server-enforced, §4.1).
- **Tokens + a11y** (NFR-06, UX-02/05; AC-15/AC-16) — `StoryCatalog.module.css`
  uses only `var(--…)` from `pwa/src/styles/companygraph/tokens.css`; catalog
  components (`Card`, `DataTable`, `Modal`, `SidePanel`) before inventing new
  ones. The view exposes an ARIA landmark; Tab reaches bootstrap/create then the
  list in DOM order; opening detail moves focus into the panel, Escape returns it
  (reusing the catalog `SidePanel`/`Modal` focus-trap — not re-implemented).
  `bun run scripts/design-conformance.ts --view pwa/src/views/model/StoryCatalog.tsx`
  exits 0 (AC-15; `--view` mode also checks the co-located `.module.css`).

### 4.11 PWA api client (FR-12/FR-13)

`pwa/src/api.ts` — add a `stories` block to the `api` object:

```ts
stories: {
  list:   (modelId, signal?) => json(`/api/v1/models/${modelId}/stories`, {signal}),
  get:    (modelId, storyId, signal?) => json(`…/stories/${storyId}`, {signal}),
  create: (modelId, body) => json(`…/stories`, {method:"POST", …}),
  patch:  (modelId, storyId, body) => json(`…/stories/${storyId}`, {method:"PATCH", …}),
  remove: (modelId, storyId) => json(`…/stories/${storyId}`, {method:"DELETE", …}),
  bootstrap: (modelId, body?) => json(`…/stories/bootstrap`, {method:"POST", …}),
  acs: {
    list:   (modelId, storyId, signal?) => json(`…/acceptance-criteria`, {signal}),
    create: (modelId, storyId, body) => json(`…/acceptance-criteria`, {method:"POST", …}),
    patch:  (modelId, storyId, acId, body) => json(`…/acceptance-criteria/${acId}`, {method:"PATCH", …}),
    remove: (modelId, storyId, acId) => json(`…/acceptance-criteria/${acId}`, {method:"DELETE", …}),
  },
},
```

Reuses the existing `json<T>()` fetch wrapper (verified in `api.ts`).

## 5. HTTP API surface

All under `/api/v1/`, zod-validated, `{error:{code,message,details?}}` envelope,
registered in `openapi.json` (FR-10). Permission column = `ROUTE_PERMISSIONS`
(FR-11). No `?model=` query param on any route (DD-06).

| Method | Route | FR | Perm | Notes |
|--------|-------|----|------|-------|
| GET | `/api/v1/models/:modelId/stories` | FR-05 | `story:read` | model-scoped via activity join (§4.1); rows carry activity/role/acCount |
| POST | `/api/v1/models/:modelId/stories` | FR-05 | `story:write` | `{persona,action,benefit,activityId,roleId?}`; assembles narrative; 201 + UUIDv7; `derived:false` |
| POST | `/api/v1/models/:modelId/stories/bootstrap` | FR-09 | `story:write` | derive+persist editable nodes; `{activityIds?}`; idempotent → `{created,skipped}` |
| GET | `/api/v1/models/:modelId/stories/:storyId` | FR-05 | `story:read` | detail + embedded ACs (ordinal ASC) + `detached` |
| PATCH | `/api/v1/models/:modelId/stories/:storyId` | FR-05 | `story:write` | re-assembles narrative; re-points edges; clears `derived` |
| DELETE | `/api/v1/models/:modelId/stories/:storyId` | FR-05,07 | `story:write` | single-tx cascade → 204 |
| GET | `/api/v1/models/:modelId/stories/:storyId/acceptance-criteria` | FR-06 | `story:read` | ordinal ASC |
| POST | `/api/v1/models/:modelId/stories/:storyId/acceptance-criteria` | FR-06 | `story:write` | all three clauses required; ordinal=max+1; 201 |
| PATCH | `…/acceptance-criteria/:acId` | FR-06 | `story:write` | edit clause/ordinal (reorder); clears `derived` |
| DELETE | `…/acceptance-criteria/:acId` | FR-06 | `story:write` | 204 |

Error codes (§3.5) added to `ERROR_CODES` and surfaced through ≥1 route each.

## 6. UI design

- **View-tree placement (FR-12, UX-06).** `#/model/stories` → `StoryCatalog`
  (route verbatim from the blueprint View Tree). No `route.ts`/`SURFACES` edit —
  the tab is already registered by `model-workspace-core`; this spec only swaps
  the `renderView`/`VIEWS` dispatch target (§4.10).
- **Component plan (UX-02).** `StoryCatalog` reuses catalog components first:
  `Card`/`DataTable` (list), `SidePanel`/`Modal` (detail + create/edit forms),
  `Button` tones, `Loading`/`ErrorState`/`NotFoundPanel` from `views/_shared.tsx`.
  Badges ("derived", "detached") are token-styled `<span>`s. No new catalog
  component is justified.
- **States (UX-01):** loading / empty / error / ready per §4.10 (AC-10/12/13/14).
- **Tokens (UX-02, NFR-06):** `StoryCatalog.module.css` uses only `var(--…)` from
  `pwa/src/styles/companygraph/tokens.css`; `bun run scripts/design-conformance.ts
  --view pwa/src/views/model/StoryCatalog.tsx` exits 0 (AC-15).
- **Input modes / Native Conflicts (UX-03/05):** no canvas/gesture/scroll-hijack/
  global-keyboard handler introduced — list/detail/form surface reusing catalog
  components + native form controls. AC reorder = up/down buttons (no drag). ARIA
  landmark on the view; Tab order bootstrap→create→list; SidePanel focus-trap +
  Escape reused from the catalog (AC-16).

## 7. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `shared/src/schema/story-spec.ts` | new | FR-01,02,05,06,09,10 | zod: story/AC create/patch/read + bootstrap req/result |
| `api/src/scripts/register-story-labels.ts` | new | FR-01–04, NFR-01 | idempotent `createNodeLabel`/`createEdgeType`; `register:story` |
| `api/src/derive/story-derive.ts` | new | FR-08, NFR-04 | pure `deriveStories` port of `userStories.ts`; no Neo4j (DD-01) |
| `api/src/storage/stories.ts` | new | FR-05,06,07,09, NFR-02,03 | story/AC CRUD + cascade + bootstrap; consumes `scopedNodeIds`; top-level props (DD-03) |
| `api/src/routes/stories.ts` | new | FR-05,06,09,10 | 10 handlers; zod at boundary; clause-required mapping (§4.3) |
| `api/src/errors.ts` | modify | FR-10 | +4 error codes (DD-05: NOT `story_duplicate_for_activity`) |
| `api/src/router.ts` | modify | FR-05,06,09 | `models/:modelId/stories*` dispatch block (§4.7) |
| `api/src/auth/rbac-permissions.ts` | modify | FR-11 | 10 `ROUTE_PERMISSIONS` rows; `story:read`/`story:write` |
| `api/src/scripts/seed-rbac-roles.ts` | modify | FR-11 | add `story:*` to `business_architect` permission set |
| `api/src/neo4j/bootstrap.ts` | modify | FR-01–04 | call `registerStorySchema` after `registerModelSchema` |
| `api/src/routes/openapi.ts` | modify | FR-10 | register story/AC paths + schemas |
| `package.json` | modify | FR-01 | `register:story` script |
| `pwa/src/views/index.tsx` | modify | FR-12 | swap `stories` tab dispatch → `<StoryCatalog>` |
| `pwa/src/views/model/StoryCatalog.tsx` | new | FR-12,13,14, UX-01/02/05 | list/detail/edit + 4 states + bootstrap |
| `pwa/src/views/model/StoryCatalog.module.css` | new | FR-12, NFR-06 | tokens-only |
| `pwa/src/api.ts` | modify | FR-12,13 | `stories` client block (§4.11) |

**Not edited (consumed):** `shared/src/schema/{nodes,edges}.ts` (NFR-01/AC-18),
`api/src/storage/{nodes,edges}.ts` (generic primitives untouched, DD-03),
`api/src/storage/model-scope.ts` / `pwa/src/context/ActiveModelContext.tsx` /
`pwa/src/route.ts` (all `model-workspace-core`'s).

## 8. Test strategy

| AC | Kind | File |
|----|------|------|
| AC-01 | integration | `api/__tests__/story-labels.integration.test.ts` — labels via registry in `GET /schema`; `NODE_LABELS` unchanged; idempotent re-run (no dup rows) |
| AC-02 | integration | `api/__tests__/story-edges.integration.test.ts` — 3 edges via `createEdgeType`; wrong pair (`UserStory→Role` for `DESCRIBES_ACTIVITY`) → 400 `edge_endpoint_label_mismatch`; `EDGE_ENDPOINTS` unchanged |
| AC-03 | integration | `api/__tests__/story-crud.integration.test.ts` — create→201+UUIDv7+assembled narrative+edges; list model-scoped; detail embeds ACs by ordinal; PATCH preserves omitted, re-assembles narrative, flips `derived`→false; DELETE→204 |
| AC-04 | integration | `api/__tests__/acceptance-criteria-crud.integration.test.ts` — create requires all 3 clauses (missing → 400 `acceptance_criterion_clause_required`); ordinal=max+1; list ASC; PATCH clause; DELETE→204; bad parent → 404 `story_not_found` |
| AC-05 | integration | `api/__tests__/story-cascade.integration.test.ts` — DELETE story removes ACs + all 3 edge types in one tx (no orphans/dangles); Activity/Role survive |
| AC-06 | unit | `api/__tests__/story-derive-parity.test.ts` — canonical structural fixture mapped to both shapes; `deriveStories` vs `formulateUserStories(projected, journeyName)` equal narratives + same primary role/location; orphan-fallback narrative case (Neo4j-free) |
| AC-07 | integration | `api/__tests__/story-bootstrap.integration.test.ts` — bootstrap derives+persists editable `derived:true` story+starter-AC per activity-without-story; idempotent `{created,skipped}`; `{activityIds}` scopes; persisted derived story PATCHes and clears `derived` |
| AC-08 | integration | `api/__tests__/story-model-scope.integration.test.ts` — two models w/ own activities+stories; `GET /models/:A/stories` returns A's, excludes B-only; asserts a story id is NOT in `scopedNodeIds` (isolation via activity join); bootstrap on A derives only from A's scoped activities |
| AC-09 | unit + integration | `api/__tests__/story-authz.test.ts` (403 without `story:write` on POST + bootstrap; 201/200 with; `story:read`→200 list; `business_architect` resolves both; no `public`) + `api/__tests__/story-openapi.integration.test.ts` (routes+4 codes in openapi) |
| AC-10 | component (jsdom) | `pwa/src/__tests__/story-catalog.test.tsx` — `#/model/stories`→`StoryCatalog`; reads `useActiveModel()`; ready list w/ narrative/activity/role/acCount |
| AC-11 | component | `pwa/src/__tests__/story-detail.test.tsx` — detail panel w/ narrative+activity/role+GWT triples; edit PATCHes+clears badge; AC add/edit/delete calls FR-06 routes; derived badge; detached indicator |
| AC-12,13,14 | component | `pwa/src/__tests__/story-catalog-states.test.tsx` — loading skeleton; empty w/ "Generate from graph"+create (bootstrap POST → stories appear); error+retry refetch |
| AC-15 | CLI | `bun run scripts/design-conformance.ts --view pwa/src/views/model/StoryCatalog.tsx` — expect exit 0, zero token/component violations (promoted from manual per requirements N-02; deterministic exit code) |
| AC-16 | manual | keyboard walk of `#/model/stories`: Tab → "Generate from graph" (Enter), Tab into list, Enter opens a story → focus enters detail panel, moves through AC edit controls in order, Escape returns focus to the originating row |
| AC-17 | e2e | `pwa/playwright/story-catalog-context.spec.ts` — model B active, nav `#/model/stories`, reload → same route renders `StoryCatalog` w/ model B's stories |
| AC-18 | CLI | `bun run typecheck` exit 0; `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts` shows no `NODE_LABELS`/`EDGE_ENDPOINTS` additions |

Integration tests need Neo4j (`bun test:integration`); unit/component run under
`bun test`. Integration tests that need a two-model fixture set up model-B domains
via `model-workspace-core`'s `POST /api/v1/models/:id/domains` (its C-06 route) +
core `POST /api/v1/domains`/`journeys`/`nodes` for activities — no direct-driver
seeding required.

> **AC-15 promotion (requirements N-02).** Requirements listed AC-15 as `manual:`;
> this design promotes it to a **CLI** check (it is a deterministic script with an
> exit code). The orchestrator may land this as a requirements errata; no behavior
> change.

## 9. Rejected alternatives

- **Story/AC fields inside `attributes_json`** — can't `ORDER BY ordinal` or
  `WHERE derived`/`WHERE a.id IN …` server-side, and duplicates
  `model-workspace-core`'s rejected-alternative. Rejected → top-level props +
  dedicated `stories.ts` (DD-03).
- **Editing the generic `createNode`/`patchNode` primitives to know about
  story/AC props** — a `_baseline` contract change. Rejected → dedicated storage
  module writing the extra props via its own Cypher; primitives untouched.
- **N per-edge `DELETE /edges/:id` for cascade** — N round-trips, orphan window.
  Rejected → single `DETACH DELETE` tx (§4.4, requirements N-03/C-05).
- **Adding `story_duplicate_for_activity` now** — unreachable under the `1..*`
  default (DD-04) and would fail `envelope.test.ts` reachability. Rejected →
  reserved, not added; introduced only if the user later chooses hard 1:1.
- **Sharing one input object between `deriveStories` and `formulateUserStories`** —
  impossible (column-indexed vs structural shapes). Rejected → parity harness with
  an explicit projection + deterministic tiebreak (§4.5, requirements B-02).
- **Re-implementing model selection in StoryCatalog** — re-specs
  `model-workspace-core`. Rejected → consume `useActiveModel()` (§4.10).
- **Drag-reorder for ACs** — introduces a gesture/scroll-hijack (Native
  Conflicts). Rejected → up/down buttons (`PATCH {ordinal}`), keyboard-reachable
  (§4.10, AC-16).
