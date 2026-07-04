---
feature: "business-model-authoring"
created: "2026-07-04"
author: "spec-author"
status: "draft"
revision: 1
reviewing_requirements_revision: 2
size: "large"
---

# Design: business-model-authoring

## 1. Overview

`business-model-authoring` is a **composition layer**: it adds exactly **one** new
REST route and **one** new PWA view, and stands up a guided **authoring wizard**
that walks the Business Architect persona from an empty `BusinessModel` to a
populated one — **Template → Domains → Journeys → Activities × Roles → Stories +
ACs** — by orchestrating calls into surfaces that upstream specs already own
(`model-workspace-core`, `story-spec-core`, graph-core `import`). It introduces
**no** node label, edge type, store, RBAC role, or permission (NFR-01, NFR-02);
the wizard's only server-side novelty is a thin **model-scoped batch-authoring
endpoint** (`POST /api/v1/models/:modelId/authoring/apply`) that assembles a
graph-core-shaped `{nodes, edges}` payload and lands it through the **existing**
`POST /api/v1/import` two-phase writer.

The design follows four rules:

1. **Reuse the proven writer in-process, never re-implement it.** The authoring
   endpoint exports and calls `import.ts`'s currently-private `realImport`
   collect-and-continue core (OQ-1 default (a)); it never HTTP-loopbacks, never
   re-derives phase-1/phase-2 blame logic, and returns `import`'s
   `{ imported, errors? }` shape **verbatim** (C-03). Every other persisted write
   — domains, template clone, stories/ACs — dispatches to an **existing** upstream
   route (C-02, XD-13, XD-09).
2. **The server owns the ids.** Because `import` MERGEs on a **client-supplied**
   id (`upsertNode`/`upsertEdge` are MERGE-on-id), the authoring handler mints a
   **server-side UUIDv7** for every new node/edge before assembling the payload,
   **echoes the stamped ids in the response** (N-04), and re-submitting a step
   with those same ids upserts idempotently instead of duplicating (C-04).
3. **The wizard is the authoritative authoring path (`must`); the canvas is a
   read-and-review surface (`must`) with direct-manipulation editing deferred
   (`should`).** This is the blueprint's Risks-row-6 scope guard against
   "author a business" ballooning into a full graph editor.
4. **Model-scoped structure only; shared reference nodes are global.**
   `Domain`/`UserJourney`/`Activity` are model-scoped (via mwc's `IN_MODEL` regime,
   consumed not re-implemented); `Role`/`System`/`Location` are **shared/global**
   (`model-workspace-core` DEC-01 (a)) — the role picker is **pick-or-create-global**
   and isolation is asserted on the model-scoped structure only (B-01).

Rejected at design level: an authoring endpoint that itself writes `Domain` +
`IN_MODEL` (duplicates mwc's `POST /models/:id/domains`, C-02); a bespoke
template-copy path (bypasses XD-13's module-instantiation machinery); a
client-side id scheme (breaks `import`'s MERGE-on-id idempotency, C-04); a new
`authoring:write` permission (structural authoring into a model is a `model:write`,
FR-14).

## 2. Prior-review concerns — resolution in this design

The requirements review (pass 2/2, verdict **approve**) left one concern (C-06)
and two nits (N-04, N-05) for the design author. Each is resolved here.

- **C-06 — FR-14 omits `story:write`, which the `must` Step 5 path exercises.**
  Resolved in §5.2 and §4.6: the "permissions the feature exercises" enumeration is
  now **three** families — `model:write` (the new `authoring/apply` route, the
  **only** mapping this spec adds), `module:write` (the mwc-owned clone route), and
  **`story:write`/`story:read`** (the story-spec-core-owned Step 5 routes). This
  spec adds and re-maps **none** of the story-spec-core or mwc mappings. **AC-10a**
  is extended (§8) to assert a session lacking `story:write` is 403'd on the Step 5
  bootstrap call, closing the same class of gap B-02 closed for the clone path.
- **N-04 — the idempotency claim presumes the apply response echoes the
  server-generated ids.** Resolved in §3.2 / §4.3 / §5.1: `POST …/authoring/apply`
  responds with `{ imported, errors?, ids: { nodes: {...}, edges: {...} } }` where
  `ids` maps each **request-row index** to the **server-minted UUIDv7** the handler
  stamped (nodes and edges separately). The client keeps those ids and re-submits
  them on a step re-run, so the MERGE-on-id upsert is idempotent (C-04) rather than
  aspirational.
- **N-05 — OQ-2 (retail-reference module granularity) depends on facts not yet on
  disk.** Resolved as a design decision in §4.2 (DD-04): the clone action reads the
  module catalog and instantiates **every** published module whose `sourceModelId`
  is the reference model (`GET /api/v1/models` → the `isReference:true` model;
  `GET /api/v1/modules` filtered by `sourceModelId`), one `POST …/module-instances`
  per module, presented as a **single** "Clone retail reference" action. mwc
  publishes modules at **journey level** (its FR-06 / design §3.2: one module ≙ one
  source journey), so the count equals the number of reference journeys the mwc
  migration publishes — the clone is **count-agnostic** (loops the catalog result),
  so AC-03 does not hard-code a module count. Subset-selection is a deferred
  `should`-tier follow-up (OQ-2 alternative).

## 3. Data model

This spec adds **no** node label, edge type, or persisted schema (NFR-01). It
introduces two **zod request/response** shapes for its one new route, plus the
in-memory wizard step model. Everything persisted is an instance of a label an
upstream spec already registered.

### 3.1 Authoring-apply request (`authoringApplySchema`) — FR-07

New file `shared/src/schema/authoring.ts`. The request is a graph-core-shaped
batch of **journeys/activities/roles + their edges** — **never** `Domain` and
**never** `IN_MODEL` (C-02; domains come from mwc's `POST /models/:id/domains`,
§4.1):

```ts
// shared/src/schema/authoring.ts
import { z } from "zod";

// A node row the wizard wants created. `clientKey` is a wizard-local handle
// (e.g. "j0", "a3", "role:cashier") used ONLY to wire edges within the same
// batch before the server has minted ids; the server maps it to a UUIDv7.
const authoringNodeSchema = z.object({
  clientKey: z.string().min(1),
  label: z.enum(["UserJourney", "Activity", "Role"]), // NOT Domain (C-02)
  name: z.string().min(1),
  description: z.string().optional(),
  attributes: z.record(z.unknown()).optional(),
  // For a pick-existing Role/global node the client sends an existing id
  // instead of asking for creation (§4.3 role pick-or-create-global, FR-05).
  existingId: z.string().uuid().optional(),
});

// An edge row addressed by clientKey OR an existing UUID on either end.
const authoringEdgeSchema = z.object({
  type: z.enum(["PART_OF", "EXECUTES", "PRECEDES"]), // structural authoring set
  from: z.string().min(1), // clientKey or existing UUID
  to: z.string().min(1),   // clientKey or existing UUID
});

export const authoringApplySchema = z.object({
  nodes: z.array(authoringNodeSchema),
  edges: z.array(authoringEdgeSchema),
});
export type AuthoringApply = z.infer<typeof authoringApplySchema>;
```

Notes:
- `label` is a **narrowed enum** (`UserJourney`/`Activity`/`Role`) — the endpoint
  physically cannot create a `Domain`, `System`, `Location`, or any lifecycle
  label, so C-02's delegation is enforced at the schema boundary, not by
  convention. `USES_SYSTEM`/`AT_LOCATION` wiring to existing shared `System`/
  `Location` is out of this spec's `must` set (Scope Boundaries) and is not in the
  edge enum.
- `existingId` on a node row is the **pick-existing** case (a global `Role` the
  Architect selected from the catalog, FR-05): the handler emits **no** node row
  for it and simply resolves the `clientKey` → `existingId` when wiring `EXECUTES`.
- The **wrong endpoint pair** (e.g. `PART_OF` with `from=Activity, to=Role`) is
  **not** pre-validated in zod — it is caught by the registry-backed edge validator
  inside `upsertEdge` and surfaces as a per-row `edge_endpoint_label_mismatch` in
  `errors[]` (collect-and-continue, AC-05).

### 3.2 Authoring-apply response (`authoringApplyResultSchema`) — FR-07, N-04

```ts
export const authoringApplyResultSchema = z.object({
  imported: z.object({ nodes: z.number().int(), edges: z.number().int() }),
  errors: z
    .array(
      z.object({
        section: z.enum(["nodes", "edges"]),
        index: z.number().int(), // index into the ASSEMBLED import payload
        code: z.string(),
        message: z.string(),
        details: z.record(z.unknown()).optional(),
      }),
    )
    .optional(),
  // N-04: the server-minted ids, keyed by the REQUEST row's clientKey, so the
  // client can resubmit the exact UUIDv7s on a step re-run (C-04 idempotency).
  ids: z.object({
    nodes: z.record(z.string().uuid()), // clientKey -> UUIDv7
    // edge ids keyed by "<type>:<fromClientKeyOrId>->:<toClientKeyOrId>"
    edges: z.record(z.string().uuid()),
  }),
});
```

`imported` + `errors` are `realImport`'s shape verbatim (C-03; the `index` refers
to the assembled payload's row order, which the handler builds deterministically
from the request rows — §4.3). `ids` is the additive N-04 echo.

### 3.3 Wizard step model (PWA, in-memory only) — FR-01, FR-12

`pwa/src/views/model/authoring/wizardModel.ts` (pure types + a reducer, no I/O):

```ts
export type WizardStep = "template" | "domains" | "journeys" | "activities" | "stories";
export const WIZARD_STEPS: WizardStep[] = ["template","domains","journeys","activities","stories"];

export interface WizardState {
  step: WizardStep;
  template: "blank" | "retail-clone" | null; // Step 1 choice (FR-02)
  // committed ids the client holds for idempotent re-submit (C-04, N-04)
  committed: {
    domainIds: string[];            // from mwc POST /models/:id/domains (FR-03)
    nodeIds: Record<string, string>;// clientKey -> UUIDv7 (authoring/apply echo)
    edgeIds: Record<string, string>;
  };
  // current step's uncommitted draft fields (NOT persisted across reload, FR-12)
  draft: Record<string, unknown>;
  error: { code: string; message: string } | null;
}
```

Per FR-12, only **committed** graph state survives a reload (re-fetched from the
model); `draft` is intentionally not persisted (the "commit each step" model,
OQ-3). The reducer enforces per-step validation gating (FR-01): a step with an
empty required field cannot advance (`canAdvance(state)` returns false → Next is
disabled + inline message).

## 4. Core logic

### 4.1 Step 2 — Domains via mwc's domain-attach route (FR-03, C-02)

The wizard **does not** create `Domain` nodes or write `IN_MODEL`. Step 2 calls
`model-workspace-core`'s existing `POST /api/v1/models/:modelId/domains`
(`model:write`, mwc design §4.3 / line 715) with `{name, description?}`; the mwc
route creates the `Domain` + its `IN_MODEL` edge in one tx and returns the domain
envelope. The returned `id` is pushed to `committed.domainIds` and becomes the
`PART_OF` anchor for Step 3 journeys. Advancing Step 2 requires
`committed.domainIds.length >= 1` (FR-03).

### 4.2 Step 1 — Template choice + retail clone (FR-02, FR-08, XD-13, DD-04)

Exactly two options (XD-13): **Blank** and **Clone retail reference**.

- **Blank** → set `template="blank"`, advance to Step 2 with no pre-populated
  structure.
- **Clone retail reference** (`template="retail-clone"`) — implemented **only** via
  mwc's module-instantiation machinery (XD-13, NFR-02), in this order:
  1. **Ensure a target domain (C-01).** mwc's `POST …/module-instances` requires a
     **`targetDomainId`** (mwc design D-2 / §3.4 — a fork anchors its journey
     `PART_OF` a concrete in-model `Domain`). Since Step 1 precedes Step 2, the
     clone first calls `POST /api/v1/models/:modelId/domains` (§4.1) to
     auto-create (or let the user name) a **"Retail"** target domain, pushing its
     id to `committed.domainIds` (so it also appears, pre-listed and editable, in
     Step 2).
  2. **Discover the reference modules (DD-04).** `GET /api/v1/models` → the model
     with `isReference:true`; `GET /api/v1/modules` → filter to modules whose
     `sourceModelId` equals that reference model's id.
  3. **Instantiate each (DD-04).** For **every** discovered module, `POST
     /api/v1/models/:activeModelId/module-instances` with
     `{moduleId, targetDomainId}` (version omitted → latest, mwc §4.4). The action
     is count-agnostic (loops the catalog result), so AC-03 asserts "clone
     instantiates the reference module(s)" without a hard-coded count.
  4. Advance to **Step 3** with the cloned journey structure listed (read back via
     mwc's `GET …/module-instances` + the active-model-scoped reads, §4.4).
  - **No published module** → the clone option is **disabled** with an explanatory
    affordance (not an error), per FR-08.
  - This spec touches **no** other module-lifecycle route (the
    `409 model_lifecycle_route_required` guard from mwc FR-08 stands, asserted
    intact by AC-09).

Re-running the wizard on an already-populated model **appends** (no destructive
reset): each step's create/instantiate is additive.

### 4.3 The authoring-apply endpoint (FR-07, C-03, C-04, N-04)

`api/src/routes/authoring.ts` → `handleAuthoringApply(req, modelId)`:

1. **Auth** is already enforced by the central router gate (`model:write`, §5.2) —
   the handler contains **no** auth check (house rule, NFR-04).
2. **Model existence.** `MATCH (m:BusinessModel {id:$modelId})` — absent →
   `404 model_not_found` (envelope-level, not a per-row error).
3. **Parse** the body with `authoringApplySchema` → envelope failure `400
   invalid_payload` (mirrors `import`'s envelope behaviour, §4.3 note).
4. **Mint ids + assemble the import payload.** For each request node row **without**
   `existingId`, mint a UUIDv7 (`Bun.randomUUIDv7()` / the same generator the
   storage layer uses) and record `clientKey → uuid` in a map; rows **with**
   `existingId` map `clientKey → existingId` (no import node row emitted — the
   global `Role` already exists, FR-05). For each edge row, resolve `from`/`to`
   through that map (a token that is neither a known `clientKey` nor a UUID is a
   per-row error, surfaced as `invalid_payload` in `errors[]`), mint a UUIDv7 for
   the **edge** id, and emit an `import`-shaped edge row
   `{ id, type, fromId, toId }`. The assembled payload is exactly the
   `{ nodes: [{id,label,name,…}], edges: [{id,type,fromId,toId}] }` shape
   `importPayloadSchema` accepts.
5. **Land it** by calling the **exported** `realImport(getDriver(), assembled)`
   (§4.7) — the same two-phase collect-and-continue writer `POST /api/v1/import`
   uses. It returns `{ imported, errors? }` verbatim (C-03).
6. **Respond** `200` with `{ imported, errors?, ids }` (§3.2), where `ids.nodes`
   is the `clientKey → uuid` map (existing-id rows included so the client always
   has a resolvable id per key) and `ids.edges` is `"<type>:<from>-><to>" → uuid`.
   Per `import`'s pinned decision (C-09 in `import.ts`), the response is **200 even
   when 100% of rows fail** — row failures live in `errors[]`; `400` is reserved for
   the envelope parse failure in step 3 (AC-08).

**Idempotent re-submit (C-04, N-04).** Because `import` MERGEs on the supplied id,
re-submitting the same step re-uses the `ids` the client kept from the prior
response: the wizard client rebuilds the node rows with `id` = the echoed UUIDv7
(so the row carries `clientKey` **and** the prior id) — the MERGE matches the
existing node and updates rather than duplicating. (Implementation detail: on a
re-run the client sends the prior id via a `id?` field on `authoringNodeSchema`
rows; when present the handler uses it instead of minting. This keeps the request
schema forward-compatible — `id` is optional and additive.)

> **Schema addendum (folded into §3.1).** `authoringNodeSchema` and
> `authoringEdgeSchema` each carry an optional `id: z.string().uuid().optional()`;
> when present the handler reuses it (re-run idempotency), when absent it mints.
> This is the mechanism behind rule 2 / N-04 and is listed here so §3.1's schema is
> read with it.

**No `IN_MODEL`, no new label/edge (NFR-01, NFR-02).** The assembled payload only
ever contains `UserJourney`/`Activity`/`Role` node rows and
`PART_OF`/`EXECUTES`/`PRECEDES` edge rows. `PART_OF` from a journey targets a
`Domain` **already** created + `IN_MODEL`-scoped by §4.1 (its UUID travels as
`to`), so the journey attaches under an in-model domain without this endpoint ever
writing the scoping edge (C-02). AC-20 asserts no compile-time schema array was
edited and no `createNodeLabel`/`createEdgeType` is called.

### 4.4 Model-scoped reads for the canvas + step lists (FR-09, FR-12, NFR-03)

The canvas and the per-step "already-added" lists read the active model's
structure through mwc's `scopedNodeIds(driver, modelId)` regime (consumed, not
re-implemented). A new read helper `api/src/routes/authoring.ts`
→ `handleAuthoringGraph(req, modelId)` (`GET
/api/v1/models/:modelId/authoring/graph`, `model:read`) returns a
JourneyCanvas-shaped projection of the model-scoped structure:

- `scopedNodeIds(modelId)` → the model's `Domain`/`UserJourney`/`Activity` ids
  (shared `Role`/`System`/`Location` are **excluded** from the set by mwc design,
  DEC-01 (a), but are still **read** and attached as layers via `EXECUTES`/
  `USES_SYSTEM`/`AT_LOCATION` from the in-scope activities — §4.4 note).
- Shape: `{ journeys: [{id,name,domainId, activities:[{id,name,order}], … }],
  roles: […], systems: […], locations: […], precedes: […] }`, mapped into the
  `JourneyData` interface (`pwa/src/components/JourneyCanvas.tsx`) client-side.

> **Design decision DD-01 — a second read route vs. reuse graph-core reads.**
> graph-core's `query/*` reads (`getJourney`, `neighbors`) are **not** model-scoped
> and would leak sibling-model structure (NFR-03). mwc's
> `GET …/module-instances` returns instances, not a canvas projection. So this spec
> adds **one** model-scoped read route (`authoring/graph`, `model:read`) alongside
> its one write route. This keeps the feature to two new routes total; both are
> model-scoped by the `:modelId` path param and `scopedNodeIds`. (Alternative —
> retrofit `?model=` onto graph-core reads — is explicitly out of scope per mwc
> design §4.2 / D-1.)

**Isolation (NFR-03, AC-18).** Every read (`authoring/graph`) and the write
(`authoring/apply`) is scoped by `:modelId`; a wizard run on model A never reads or
mutates B's **model-scoped** structure. Shared `Role`/`System`/`Location` are
legitimately cross-model (DEC-01 (a)) and are **excluded** from the isolation
assertion (AC-18 asserts A's `Domain`/`UserJourney`/`Activity` are invisible to B,
not its roles).

### 4.5 Step 4 — Activities × Roles, the XD-18 core (FR-05, B-01)

The key-activities-per-role authoring path:

1. Create an `Activity` (`authoring/apply` node row, `label:"Activity"`) and wire
   `PART_OF` to a chosen `UserJourney` (edge row `{type:"PART_OF", from:"<activity
   clientKey>", to:"<journey clientKey or id>"}`).
2. **Role — pick-or-create-global (B-01).** The role picker (catalog `Typeahead`)
   queries the **global** `Role` catalog (graph-core `query` / a `GET
   /api/v1/nodes` read — roles are not model-scoped). Picking an existing role →
   node row with `existingId`; typing a new name → a `label:"Role"` node row
   (creates a **global** `Role`, DEC-01 (a)).
3. Wire `EXECUTES` (`{type:"EXECUTES", from:"<role clientKey or existingId>",
   to:"<activity clientKey>"}`). The registry validator enforces `Role → Activity`.
4. Optionally order two activities with `PRECEDES` (`{type:"PRECEDES",
   from:"<a0>", to:"<a1>"}`).

The persisted result is a `(:Role)-[:EXECUTES]->(:Activity)` edge whose **`Activity`
end ∈ `scopedNodeIds(activeModelId)`** (the `Role` end is global and excluded from
the set) — this is exactly what AC-06 round-trips as a real-Neo4j integration test.

### 4.6 Step 5 — Stories + ACs via story-spec-core (FR-06, C-05, C-06)

All Step 5 persistence dispatches to **story-spec-core's existing routes** — this
spec adds **no** story/AC route (NFR-02):

- **Generate from graph** → `POST /api/v1/models/:modelId/stories/bootstrap` with
  `{ activityIds: [<the wizard's activity ids>] }` (story-spec-core FR-09). Returns
  `{ created: N, skipped: M }`. **Idempotency (C-05):** re-running on
  already-bootstrapped activities legitimately returns `created:0` — the wizard
  renders that as an **idempotent "already generated"** state surfacing both counts
  (e.g. "0 new, N already generated"), **not** an error (AC-07).
- **Manual create/edit** → `POST/PATCH /api/v1/models/:modelId/stories` and
  `.../acceptance-criteria` (story-spec-core FR-05/FR-06). Editing a derived
  story/AC clears its `derived` flag — a story-spec-core guarantee (its DD-05) this
  view **surfaces**, not re-implements.

**Permissions exercised (C-06).** All Step 5 calls map to **`story:write`**
(bootstrap, create, patch) / **`story:read`** (list) in story-spec-core's
`ROUTE_PERMISSIONS` (its design §4.9, lines 443–452). This spec **neither adds nor
re-maps** those rows. The `business_architect` role already carries `story:read` +
`story:write` (story-spec-core FR-11 / design line 463), so the persona is fully
covered. §5.2 records all three exercised permission families; **AC-10a** asserts a
session lacking `story:write` is 403'd on the Step 5 bootstrap call.

### 4.7 Exporting `realImport` — the reuse seam (FR-07, C-03, OQ-1 (a))

`api/src/routes/import.ts` currently exports only `handleImport`; `realImport`
(line 157) is private. This design **exports** `realImport` (add `export` to its
declaration) so `handleAuthoringApply` can call it in-process with an assembled
`{nodes, edges}` payload. No behaviour change to `import.ts` — the function body,
the `RowError` shape (`{section,index,code,message,details?}`), the two-phase
collect-and-continue logic, and `POST /api/v1/import`'s own use of it are all
untouched; the sole edit is the `export` keyword. This is OQ-1's default (a):
reuse the proven writer + `errors[]` contract without an HTTP round-trip and
without re-deriving phase-1/phase-2 blame logic.

> **Rejected OQ-1 alternatives:** (b) extract a thinner `upsertNode`/`upsertEdge`
> seam — risks re-deriving the phase-1-failed-id blame set `realImport` already
> maintains (`phase1FailedIds`, import.ts:169); (c) HTTP-loopback to
> `/api/v1/import` — a self-call through the router gate, needless latency + a
> session-forwarding problem. Chose (a).

## 5. HTTP API surface

Two new routes, both under `/api/v1/`, zod-validated, `{error:{code,message,
details?}}` envelope, registered in `openapi.json` (FR-13). All template-clone,
domain-attach, and story/AC calls go to **existing** upstream routes.

### 5.1 Routes (this spec)

| Method | Route | FR | Perm | Request → Response |
|--------|-------|----|------|--------------------|
| POST | `/api/v1/models/:modelId/authoring/apply` | FR-07 | `model:write` | `authoringApplySchema` → `200 { imported, errors?, ids }` (§3.2); envelope fail → `400 invalid_payload`; model absent → `404 model_not_found` |
| GET | `/api/v1/models/:modelId/authoring/graph` | FR-09 | `model:read` | → `200` JourneyCanvas-shaped model-scoped projection (§4.4); model absent → `404 model_not_found` |

**Router dispatch** (`api/src/router.ts`): mwc's `models*` block (router.ts:388,
`sub.startsWith("models/")`) already owns the top-level `models/` prefix. Following
the same multi-spec pattern story-spec-core uses (it adds its `models/:modelId/
stories*` matches to the same block), this spec adds two `sub.match` arms inside
that block, ordered **before** the generic `models/:id` arms so the literal
`authoring/apply` / `authoring/graph` segments never collide with a `:id`:

```
^models\/([^/]+)\/authoring\/apply$   (POST)
^models\/([^/]+)\/authoring\/graph$   (GET)
```

### 5.2 Route-permission mapping (FR-14, C-06)

The **only** `ROUTE_PERMISSIONS` rows this spec **adds** (`api/src/auth/
rbac-permissions.ts`), inserted **before** mwc's `models/:id` rows (specific →
parameterized):

```ts
P("POST", "models/:modelId/authoring/apply", "model:write"),
P("GET",  "models/:modelId/authoring/graph", "model:read"),
```

**Permissions the feature exercises** (C-06 — the full picture; only the first
family is a mapping this spec owns):

| Permission | Route(s) | Owned by | Carried by `business_architect`? |
|-----------|----------|----------|----------------------------------|
| `model:write` | `POST …/authoring/apply` (this spec's new route) | **this spec** (adds the row) | yes (mwc FR-11) |
| `model:read` | `GET …/authoring/graph` (this spec's new route) | **this spec** (adds the row) | yes (mwc FR-11) |
| `module:write` | `POST …/module-instances` (clone, FR-08) | `model-workspace-core` (mwc design line 716) | yes (mwc FR-11) |
| `model:write` | `POST …/models/:id/domains` (domain-attach, FR-03) | `model-workspace-core` (mwc design line 715) | yes (mwc FR-11) |
| `story:write` / `story:read` | `POST …/stories/bootstrap`, `POST/PATCH …/stories[/…/acceptance-criteria]`, `GET …/stories` (Step 5) | `story-spec-core` (its design lines 443–452) | yes (story-spec-core FR-11) |

So a full `must` wizard run touches **three** permission families
(`model:*`, `module:write`, `story:*`), **all** carried by `business_architect`.
This spec adds **no** RBAC role or permission, re-maps **no** existing route, and
introduces **no** `public` route (house rule, XD-08, NFR-04). Auth is enforced
**only** by the central router gate (`api/src/router.ts`) + `api/src/auth/`.

### 5.3 Error codes (FR-13, N-01)

The endpoint reuses **existing** `ERROR_CODES` — `invalid_payload`,
`attribute_violation`, `edge_endpoint_label_mismatch`, `model_not_found` (all four
verified present in `api/src/errors.ts`). **No new error code is warranted** (N-01
resolved): every failure mode is an existing code — envelope parse
(`invalid_payload`), per-row validation (`invalid_payload`/`attribute_violation`),
per-row endpoint mismatch (`edge_endpoint_label_mismatch`, from `upsertEdge`),
missing model (`model_not_found`). Adding a code that no route can reach would fail
the envelope reachability test, so this spec adds none.

## 6. UI design

- **View tree placement (FR-01, FR-09, UX-06).** `#/model/canvas` → `ModelCanvas`
  (route verbatim from the blueprint View Tree; owner `business-model-authoring`).
  This spec **replaces** the `ModelTabPlaceholder` mwc registered for the `canvas`
  tab by swapping the `renderView`/`VIEWS` dispatch target in
  `pwa/src/views/index.tsx` (the `model` surface's `canvas` entry →
  `(r) => <ModelCanvas/>`). It does **not** edit `pwa/src/route.ts`/`SURFACES`
  (mwc owns them — the `canvas` tab is already registered).
- **Component plan (UX-02).** `ModelCanvas` and its wizard sub-components reuse
  catalog components first:
  - Wizard shell + step indicator: `Card` + token-styled `<ol>` step list; Next/Back
    are catalog `Button`s.
  - Step forms: native text inputs + catalog `Typeahead` (role picker,
    journey-parent picker), `Modal` (create dialogs), `SidePanel` (node detail on
    the canvas). `Loading`/`ErrorState` from `pwa/src/views/_shared.tsx`.
  - Review canvas: the existing `JourneyCanvas` component
    (`pwa/src/components/JourneyCanvas.tsx`), fed a `JourneyData` projection built
    from `GET …/authoring/graph` (§4.4). No new canvas component is invented — the
    JourneyCanvas/react-flow patterns are reused (blueprint Risks row 6).
  - Story step: reuses the same story/AC editing affordances story-spec-core's
    `StoryCatalog` establishes; Step 5 embeds a compact create/edit form calling
    `api.stories.*` (story-spec-core's client block, its design §4.11).
- **States (UX-01, FR-11).** All four on `ModelCanvas`:
  - **loading** (AC-12) — skeleton while `GET …/authoring/graph` for the active
    model is pending.
  - **empty** (AC-13) — active model has no domains/journeys → empty-state `Card`
    whose primary affordance **opens the wizard on Step 1 (Template)**.
  - **error** (AC-14) — a fetch or authoring write failed → `ErrorState` + a retry
    that refetches/re-submits and **does not discard** the in-progress wizard
    step's entered `draft` fields.
  - **ready** (AC-01/AC-11) — the wizard flow and/or the populated review canvas
    (journeys as lanes, activities ordered, roles/systems/locations as layers),
    with an **"Edit in wizard"** affordance that reopens the wizard at the relevant
    step.
- **Active-model + reload (FR-12, UX-06).** `ModelCanvas` reads the active model
  from mwc's shell-owned `useActiveModel()` (`pwa/src/context/
  ActiveModelContext.tsx`) — it does **not** re-implement model selection. With no
  active model it shows a pick/create-a-model prompt (linking `#/model/models`).
  Switching the active model refetches for the new model; deep-linking
  `#/model/canvas` + reload re-renders for the persisted active model (persistence
  is mwc FR-15; this view consumes it). Uncommitted `draft` fields are **not**
  restored across reload (committed graph state is) — FR-12 / OQ-3.
- **Tokens (UX-02, NFR-05).** All new CSS is tokens-only (`var(--…)` from
  `pwa/src/styles/companygraph/tokens.css` — the same path mwc/story-spec-core use).
  `scripts/design-conformance.ts` must pass in its enforced **`--view`** form
  (mwc D-5; the positional form is inert) on `ModelCanvas.tsx` + its
  `.module.css` + each wizard sub-component `.module.css` (AC-16). Desktop-first,
  no new breakpoints (UX-04).
- **Input modes / Native Conflicts (UX-03, UX-05).** The **wizard** introduces no
  new gesture/scroll/global-keyboard handler — native buttons + inputs + catalog
  `Typeahead`/`Modal`/`SidePanel` (whose focus-trap + Escape are reused, not
  re-implemented). Keyboard (AC-17): Tab reaches template options → step inputs →
  Next/Back in DOM order; per-step validation blocks Next with a **focusable**
  inline error; the view exposes an ARIA landmark and the step indicator announces
  the current step. The **canvas drag editing (FR-10, `should`)** is the only new
  gesture surface (AC-15): per the requirements' Native Conflicts table, canvas
  pointer/drag handlers `e.preventDefault()` **scoped to the pane** (not the
  document) so page scroll is not hijacked; pinch/wheel-zoom is contained to the
  react-flow viewport; a **keyboard move-up/down equivalent** on a focused activity
  achieves the same `PRECEDES` reorder without a pointer. Touch-drag is deferred
  with the rest of FR-10 polish.

## 7. File Changes

The authoritative list. Every FR maps to ≥1 row; every row serves ≥1 FR.

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `shared/src/schema/authoring.ts` | new | FR-07, FR-13 | `authoringApplySchema` + `authoringApplyResultSchema` (§3.1/§3.2); node rows optional `id` (C-04) |
| `api/src/routes/import.ts` | modify | FR-07 (C-03, OQ-1 a) | **export** `realImport` — sole change is the `export` keyword; no behaviour change (§4.7) |
| `api/src/routes/authoring.ts` | new | FR-07, FR-09 | `handleAuthoringApply` (id-mint + assemble + `realImport`, §4.3); `handleAuthoringGraph` (model-scoped canvas projection, §4.4) |
| `api/src/router.ts` | modify | FR-07, FR-09 | two `authoring/apply`\|`authoring/graph` match arms inside the existing `models*` block, before `models/:id` (§5.1) |
| `api/src/auth/rbac-permissions.ts` | modify | FR-14, C-06 | +2 rows: `…/authoring/apply`→`model:write`, `…/authoring/graph`→`model:read` (§5.2); no re-map |
| `api/src/routes/openapi.ts` | modify | FR-13 | register the two authoring paths + their zod schemas |
| `pwa/src/views/index.tsx` | modify | FR-09 | swap the `model` surface's `canvas` dispatch → `<ModelCanvas/>` (replaces `ModelTabPlaceholder`) |
| `pwa/src/views/model/ModelCanvas.tsx` | new | FR-01,09,11,12, UX-01/02/05/06 | wizard shell + review canvas + 4 states; reads `useActiveModel()` |
| `pwa/src/views/model/ModelCanvas.module.css` | new | FR-11, NFR-05 | tokens-only |
| `pwa/src/views/model/authoring/wizardModel.ts` | new | FR-01, FR-12 | step types + reducer + `canAdvance` (§3.3); pure, no I/O |
| `pwa/src/views/model/authoring/TemplateStep.tsx` | new | FR-02, FR-08 | two-option picker; retail-clone orchestration (§4.2) |
| `pwa/src/views/model/authoring/DomainsStep.tsx` | new | FR-03 | calls mwc `POST …/domains` (§4.1) |
| `pwa/src/views/model/authoring/JourneysStep.tsx` | new | FR-04 | journeys `PART_OF` a domain via `authoring/apply` |
| `pwa/src/views/model/authoring/ActivitiesRolesStep.tsx` | new | FR-05, XD-18 | activity×role×EXECUTES×PRECEDES; pick-or-create-global role `Typeahead` (§4.5) |
| `pwa/src/views/model/authoring/StoriesStep.tsx` | new | FR-06 | calls `story-spec-core` bootstrap + story/AC CRUD; idempotent "already generated" render (§4.6) |
| `pwa/src/views/model/authoring/wizard.module.css` | new | FR-11, NFR-05 | tokens-only; shared by wizard sub-components |
| `pwa/src/api.ts` | modify | FR-07, FR-09 | `authoring.apply` + `authoring.graph` client methods; reuse the existing `json<T>` wrapper |

**Consumed, not modified** (owned by upstream specs; this spec calls them):
mwc `POST /models/:id/domains`, `GET /models`, `GET /modules`,
`POST …/module-instances`, `GET …/module-instances`, `ActiveModelContext`,
`scopedNodeIds`; story-spec-core `api.stories.*` + `…/stories*` routes;
`JourneyCanvas`, catalog components, `tokens.css`, `design-conformance.ts`.

## 8. Test strategy

| AC | Kind | File / procedure |
|----|------|------------------|
| AC-01 | component (jsdom) | `pwa/src/__tests__/model-canvas.test.tsx` — `#/model/canvas`→`ModelCanvas` (not placeholder); wizard opens Step 1 reading `useActiveModel()`; no active model → pick/create prompt |
| AC-02 | component | `pwa/src/__tests__/model-canvas-template.test.tsx` — exactly two template options (no third asserted); Blank → Step 2, no structure |
| AC-03 | component (mocked module routes) | `pwa/src/__tests__/model-canvas-template.test.tsx` — Clone: discovers `isReference` model + its `sourceModelId` modules, `POST …/module-instances` per module (count-agnostic, DD-04), advances to Step 3; no published module → option disabled (not error) |
| AC-04 | integration + component | `api/__tests__/authoring-apply.integration.test.ts` (domain created via mwc `POST …/domains`, `IN_MODEL`-scoped, absent from sibling model) + `pwa/src/__tests__/model-canvas-steps.test.tsx` (advance blocked until ≥1 domain, inline message) — **Resolves: C-02** |
| AC-05 | integration | `api/__tests__/authoring-apply.integration.test.ts` — `UserJourney` `PART_OF` a chosen domain; wrong pair → per-row `edge_endpoint_label_mismatch` in `errors[]`; advance needs ≥1 journey |
| AC-06 | integration (real Neo4j) | `api/__tests__/authoring-key-activity-per-role.integration.test.ts` — Activity + create/pick **global** Role + `EXECUTES` round-trips; asserts the persisted `(:Role)-[:EXECUTES]->(:Activity)` edge with the **`Activity` end ∈ `scopedNodeIds(modelId)`** (Role end global, excluded); `PRECEDES` order round-trips — **Resolves: B-01, XD-18** |
| AC-07 | component (mocked story routes) | `pwa/src/__tests__/model-canvas-stories-step.test.tsx` — bootstrap scoped to `activityIds`; derived story+AC appear editable; re-run → `{created:0, skipped:N}` renders **idempotent "already generated"** (counts surfaced), not error; manual story+G/W/T create via story routes; no story/AC route added — **Resolves: C-05** |
| AC-08 | integration | `api/__tests__/authoring-apply.integration.test.ts` — lands via `realImport`; one bad row → `200 { imported, errors:[{section,index,code}] }` (valid rows persist, collect-and-continue); server-minted UUIDv7 echoed in `ids`; re-submit with echoed ids upserts idempotently (no duplicate); no new label/edge; no `IN_MODEL` written — **Resolves: C-03, C-04, N-04** |
| AC-09 | integration | `api/__tests__/authoring-template-clone.integration.test.ts` — clone uses only `GET /modules` + `POST …/module-instances`; a generic node/edge write to lifecycle state still → `409 model_lifecycle_route_required` (mwc guard intact) |
| AC-10a | unit + integration | `api/__tests__/authoring-authz.test.ts` — no `model:write` → 403 on `…/authoring/apply`, with it → 201; no `module:write` → 403 on `…/module-instances` (mwc mapping, asserted in force), with it → success; **no `story:write` → 403 on `…/stories/bootstrap`** (C-06); `business_architect` carries all three → full run succeeds; no route `public` |
| AC-10b | integration | `api/__tests__/authoring-openapi.integration.test.ts` — `…/authoring/apply` + `…/authoring/graph` + their error codes appear in `GET /api/v1/openapi.json` (generated from the zod schemas) |
| AC-11 | component | `pwa/src/__tests__/model-canvas.test.tsx` — ready state renders the authored structure on `JourneyCanvas` from `authoring/graph`; "Edit in wizard" reopens at the relevant step |
| AC-12,13,14 | component | `pwa/src/__tests__/model-canvas-states.test.tsx` — loading skeleton; empty → wizard Step 1; error → retry that refetches/re-submits and preserves in-progress `draft` fields |
| AC-15 (should) | manual | with the stack up + a populated model, load `#/model/canvas`, trackpad-drag an activity onto a new position — **expect** the `PRECEDES` order persists (re-fetch shows new order) and the page does **not** scroll under the drag; then keyboard-only focus an activity and press the documented move-up/down key — **expect** the same reorder persists |
| AC-16 | CLI | `bun run scripts/design-conformance.ts --view pwa/src/views/model/ModelCanvas.tsx` then the same `--view` on `ModelCanvas.module.css` and each wizard `.module.css` — **expect** exit 0, zero token/component violations (enforced `--view` form, mwc D-5) |
| AC-17 | manual | load `#/model/canvas`, keyboard-only: Tab to a template option, Enter; Tab through Step 2 to "Next", Enter with an empty required field — **expect** Next blocked + focus moves to the inline error; complete the field + Enter — **expect** advance to Step 3 |
| AC-18 | integration + component | `api/__tests__/authoring-model-scope.integration.test.ts` (model A run; `GET …/authoring/graph` for B returns none of A's `Domain`/`UserJourney`/`Activity`; a `Role` from A's run **is** visible to B by design — excluded from the assertion) + `pwa/src/__tests__/model-canvas.test.tsx` (switching active model resets/refetches) — **Resolves: B-01** |
| AC-19 | e2e | `pwa/playwright/model-canvas-context.spec.ts` — model B active, nav `#/model/canvas`, reload → same route renders `ModelCanvas` for model B; uncommitted wizard input not restored |
| AC-20 | CLI + manual | `bun run typecheck` exit 0; `git diff shared/src/schema/{nodes,edges}.ts` shows no additions; grep confirms no `createNodeLabel`/`createEdgeType` call in this spec's code |

Integration tests need Neo4j (`bun test:integration`); unit/component run under
`bun test`; the Playwright spec runs in the PWA e2e job.

## 9. Rejected alternatives

- **Authoring endpoint writes `Domain` + `IN_MODEL`** — duplicates mwc's
  `POST /models/:id/domains` (C-02) and re-implements the model-scoping regime.
  Rejected → `authoringApplySchema.label` is narrowed to exclude `Domain`; domains
  come from mwc's route (§4.1).
- **Bespoke template-copy path** — bypasses XD-13's module-instantiation machinery
  and lets templates drift from modules. Rejected → clone is `GET /modules` +
  `POST …/module-instances` only (§4.2, NFR-02).
- **Client-supplied node/edge ids** — `import` MERGEs on id, so client ids risk
  cross-client collision and break idempotency. Rejected → server mints UUIDv7 +
  echoes them (rule 2, §4.3, C-04/N-04).
- **HTTP-loopback to `/api/v1/import`** (OQ-1 c) / **thin upsert seam** (OQ-1 b) —
  a self-call through the gate / re-deriving the phase-blame set. Rejected → export
  and call `realImport` in-process (§4.7).
- **Retrofit `?model=` onto graph-core reads for the canvas** — out of scope per
  mwc design §4.2 / D-1; would touch graph-core-owned reads. Rejected → one
  model-scoped `authoring/graph` read route (§4.4, DD-01).
- **A new `authoring:write` permission** — structural authoring into a model is a
  `model:write`; the persona already carries it. Rejected → reuse `model:write`
  (FR-14).
- **Canvas direct-manipulation as `must`** — blueprint Risks row 6 caps it as
  `should`; making it `must` reopens the scope-explosion risk. Rejected → FR-10 is
  `should`, gated out of the `must` AC set (NFR-06).
