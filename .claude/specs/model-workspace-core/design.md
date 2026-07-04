---
feature: "model-workspace-core"
created: "2026-07-04"
author: "spec-author"
status: "revised"
revision: 4
reviewing_requirements_revision: 4
dec_01: "closed — option (a), shared reference nodes (requirements rev 4, C-07; silent-accept per XD-17)"
size: "large"
---

# Design: model-workspace-core

> **Revision 2 (2026-07-04)** — resolves every finding in
> `review-design.md` (pass 1). **B-01** → §3.3/§3.4/§4.4/§4.5 define an explicit
> **synthetic content-id** addressing scheme (`<instanceId>::<localKey>`) so a
> non-forked instance's virtual content is addressable and the FR-08/AC-06 fork
> trigger is implementable. **C-01** → no `?model=` query parameter on any GET
> in this spec; the instance list scopes via its `:modelId` **path** param, and
> AC-21's isolation proof is re-anchored on the `scopedNodeIds` test + the
> instance list (§4.2). **C-02** → migration MERGE re-keyed on `isReference:true` with a
> non-reference-`ordinal:1` collision guard and a documented ordering rule. **C-03**
> → `targetDomainId` divergence from FR-07 called out; it flows into the zod
> schema, openapi, `api.ts`, and AC-05. **C-04** → canonical snapshot
> serialization fully specified (§3.3). **C-05** → `module_version_immutable`
> reachability path (i) reworded to the real reachable trigger (no auto-increment
> contradiction). Nits **N-01** (tokens path + design-conformance invocation),
> **N-02** (stale `Alt+1..8` comment), **N-03** (redundant delete clause), **N-04**
> (AC-06 single-reading reconciliation) all applied. No existing stable IDs
> (FR-*, AC-*, DEC-01, §-numbers) were renumbered.
>
> **Revision 3 (2026-07-04)** — resolves every finding in `review-design.md`
> (pass 2). **B-02** → `forkLocalKey` is now the **full instance-qualified
> synthetic id** (`<instanceId>::<localKey>`), giving every fork subtree a
> queryable instance anchor: post-fork synthetic resolution is a direct property
> match, raw-UUID membership is a `STARTS WITH <instanceId>::` predicate, and
> the forked-instance read anchors on `{forkLocalKey: <instanceId>::journey}`
> (§3.4, §4.4, §4.5). **B-03** → the FR-08 sibling edge route is fully specified
> (option (a)): `POST`/`DELETE …/module-instances/:instanceId/edges`, addressed
> by `(type, from, to)` with synthetic-handle support, fork-then-apply on a
> non-forked instance; §5 rows, `ROUTE_PERMISSIONS`, openapi, and AC-06 edge
> coverage added (§4.4, §5, §8). **C-06** → minimal sanctioned domain attachment
> `POST /api/v1/models/:id/domains` (`model:write`) so user-created models can be
> populated via the API and the AC-05/AC-06/AC-21 two-model tests need no
> direct-driver seeding (§4.3, §5, §8). **C-07** → the migration collision guard
> fires only on the actual first-run hijack case (reference model absent AND a
> user model present); with the reference model present, re-runs proceed
> idempotently forever (§4.7). **C-08** → a Deviations Register (§2.1) records
> the four requirements-text divergences (+ N-07's AC-16 command) for the
> orchestrator to land as a requirements rev-3 errata **before the tasks phase**.
> Nits **N-05** (checksum number wording), **N-06** (`::` path-segment note),
> **N-07** (folded into §2.1), **N-08** (checksum-coverage wording), **N-09**
> (handles are pinned-version-relative) all applied. No existing stable IDs were
> renumbered.
>
> **Revision 4 (2026-07-04) — realignment to approved requirements rev 4 +
> fold-in of the approved review's residual findings.** Design review pass 2
> (verdict **approve**, cap 2/2 reached) left only non-blocking residuals; the
> requirements have since landed rev 3 (errata: D-1…D-5, the additive
> `POST /models/:id/domains` route, N-10) and rev 4 (pass-2 concerns
> C-06…C-11 + nits folded into the body). This revision reconciles the design
> with that now-approved text — it changes **no approved contract** except the
> one addition requirements rev 4 itself mandates: **C-10 (requirements)** →
> §4.7 `--down` gains the required **`--force` refusal** while non-reference
> models exist, and §8 AC-08 asserts a second model survives a forced
> down-migration (tasks T-16 must sync this — flagged to the orchestrator).
> **Deviations Register (§2.1)** → converted from "pending orchestrator
> action" to a **landed** ledger: D-1…D-5 are now requirements body/errata
> text; zero divergences remain outstanding. **DEC-01** → recorded as
> **closed** at the requirements rev-4 gate (frontmatter `dec_01`; §1 rule 4,
> §2). **§4.2** → the `?model=` paragraph is no longer a divergence;
> requirements FR-18/AC-21 (rev 4, C-09) now agree. **N-10** → label count
> corrected to **four** labels + five edges (§1 rule 1, §3 intro, §4.1).
> **C-09 (design review)** → deleted-fork-anchor behavior specified in
> §4.4/§4.5 exactly as pinned in tasks T-08 (missing-anchor forked read →
> instance envelope with empty content, never a 500; model-scoped write →
> `404 module_instance_node_not_member`). **N-11** → DELETE-body note added to
> the edge route (§4.4). **N-12** → AC-05's "identical content" is defined as
> identical **modulo the projected handles** (§4.5, §8). **N-07 (requirements
> rev 4)** → §4.3 delete cascade explicitly includes forked-subtree copy
> nodes; **N-06 (requirements rev 4)** → §4.3 records the transactional check
> as the picked at-most-one-reference mechanism. **C-11 (requirements rev 4 /
> D-5)** → §6/§8 AC-16 use the enforced **two** `--view <file>` invocations
> (`.tsx` and `.module.css`). No stable IDs (FR-*, AC-*, DEC-01, §-numbers)
> were renumbered.

## 1. Overview

`model-workspace-core` adds a **scoping regime** on top of the as-built graph:
one `BusinessModel` root node per model, with each model's process structure
(`Domain` → `PART_OF` → `UserJourney` → `Activity`) hanging off it through a
single `IN_MODEL` edge on the domain roots. On top of that it adds a
**journey-level module lifecycle** — `BusinessModule` (catalog) → published,
immutable `BusinessModuleVersion` (a serialized snapshot) → per-model
`ModuleInstance` (a pin) that copy-on-writes a local subtree the first time it is
edited in a model. It migrates the existing retail graph into Business Model #1,
seeds a Business Architect persona/role through the existing RBAC subsystem, and
stands up the top-level **Model** PWA surface (shell, `route.ts`, shell-owned
active-model context, `ModelWorkspace` view, placeholders for sibling tabs).

The design follows four rules:

1. **Registry-only schema.** The four new labels and five new edges are
   registered through the ontology-manager runtime registry (`createNodeLabel` /
   `createEdgeType`); the compile-time `NODE_LABELS` / `EDGE_ENDPOINTS` consts are
   never touched (NFR-01, XD-01/XD-02). The registry entry only proves the label
   *exists* (AC-01/AC-02); the richer, queryable top-level property shape is owned
   by dedicated storage modules (see rule 2).
2. **Lifecycle state lives on dedicated routes, never on the generic graph-core
   primitives.** `BusinessModel.ordinal`/`status`/`isReference`,
   `BusinessModuleVersion.version`/`checksum`/`snapshot_json`, and
   `ModuleInstance.forked`/`pinnedVersion` are stored as **top-level Neo4j
   properties** (so a uniqueness constraint on `ordinal` and `WHERE version = …`
   are possible — you cannot constrain a field inside the opaque
   `attributes_json` string). The generic `createNode`/`patchNode` primitives are
   left byte-for-byte unchanged; instead a thin route-boundary guard rejects any
   generic write that targets a lifecycle label or edge (`409
   model_lifecycle_route_required`). This is the resolution of requirements
   review **C-06** — see §2.
3. **Version content is a serialized snapshot, not a re-writable subtree**
   (journey-versions prior art). A `BusinessModuleVersion` carries a
   `snapshot_json` blob + `checksum`; there is *no* separately-addressable
   "version-owned Activity node" on the generic path, so version immutability is
   structural, not enforced by mutating generic write behaviour. Fork is the only
   thing that materializes live nodes, and it materializes them **into the target
   model**, never into the version.
4. **Reference nodes are shared** (`System`/`Role`/`Location` are global across
   models) — **DEC-01 option (a), CLOSED at the requirements rev-4 approval gate**
   (requirements C-07, silent-accept per XD-17; recorded in this document's
   frontmatter `dec_01` — it is not an open question). Only
   the process structure (`Domain`/`UserJourney`/`Activity`) is model-scoped;
   snapshots and forks reference the shared nodes by id and never copy them.

Rejected at design level: storing lifecycle props inside `attributes_json` (can't
constrain/query `ordinal`); materializing version content as live graph nodes
(re-introduces the C-06 contradiction and an unbounded generic-write guard);
per-route auth (house rule — the central gate owns it).

## 2. Prior-review concerns — resolution in this design

The requirements review (pass 2, verdict **approve**) left three carry-forward
items for the design author. Each is resolved here. (Historical note, rev 4:
requirements rev 4 has since folded these resolutions back into the
requirements **body**, so the text below now *agrees with* rather than
*diverges from* the requirements.)

- **C-06 — version storage vs. "generic path untouched".** Resolved by rule 3:
  version content is a **serialized `snapshot_json` blob** on the
  `BusinessModuleVersion` node (§3.3, §4.4). Consequences, made concrete:
  - The generic `PATCH`/`DELETE /api/v1/nodes/:label/:id` primitives are
    **literally unchanged**; a thin guard at the *route handler* boundary
    (`api/src/routes/nodes.ts`, `api/src/routes/edges.ts`) rejects writes whose
    `:label`/edge `type` is a lifecycle label/edge → `409
    model_lifecycle_route_required` (§4.6). This is an additive rejection at the
    boundary, not a change to the `_baseline` storage contract.
  - Because version content is serialized, **there is no version-owned
    Activity/UserJourney node the generic path can address.** AC-06's
    "generic-path write on a version-owned node" therefore reduces to a generic
    write on the `BusinessModuleVersion` node itself → caught by the lifecycle-label
    guard (`model_lifecycle_route_required`). The `module_version_immutable` code
    stays reachable (closed-enum requirement) from **one genuine, testable path**
    (**Resolves: C-05** — the prior "two places" wording was unreachable because
    `publishVersion` auto-increments, so no caller can ever collide on a version):
    the **explicit-version publish mode** on `POST /api/v1/modules/:id/versions`.
    That route's body carries an **optional** `{version?}` (for callers — CI,
    import, deterministic re-publish — that assert a specific version integer rather
    than accept the auto-increment default); if the supplied `version` already
    exists for the module, the publish is rejected `409 module_version_immutable`
    (§4.4). Omitting `version` keeps the FR-06 auto-increment (`max+1`) behaviour.
    The model-scoped write route never mutates version content at all — on a
    non-forked instance it **forks** (materializes into the model, §4.4) rather than
    writing the version, which is the *structural* enforcement of NFR-04; it is not a
    second reachability site for this code. §8 restates AC-06 under this single
    reading, and AC-04's test exercises the explicit-version collision.
- **C-07 — DEC-01 (reference-node scoping).** **CLOSED** (requirements rev 4,
  C-07 — decided at the approval gate, silent-accept per XD-17):
  **DEC-01 = option (a), shared `System`/`Role`/`Location`.** All of §4.4 (fork
  copy boundary), §4.7 (migration edge set), and §4.2 (scope resolution) are built
  to it; this document's frontmatter carries `dec_01` as closed. A later switch
  to model-scoped reference nodes is a scope change owned by a follow-up spec
  (requirements Scope Boundaries), not an open question of this design.
- **C-08 — unnamed fork-route 404/409.** Resolved: a new closed-enum code
  **`module_instance_node_not_member`** (§3.6, FR-13/§5) is returned when the
  model-scoped write route's `:nodeId` is not a member of the instance's subtree.
  The related "instance/model/module/version does not exist" cases reuse the named
  `model_not_found` / `module_not_found` / `module_version_not_found` codes.
- **N-04 (nit).** §4.2 states explicitly: `scopedNodeIds` returns *structural*
  nodes; for a **non-forked** instance the pinned journey content is **not** a set
  of live nodes — a content reader resolves it by deserializing the pinned
  version's `snapshot_json` (§4.5). The `ModuleInstance` node is in scope; its
  virtual content is resolved separately.

### 2.1 Deviations Register (Resolves: C-08 of the design review; includes N-07)

(Note: this resolves **design-review pass-2 C-08**, distinct from the
*requirements-review* C-08 — the fork-route 404/409 naming — resolved in the
bullet list above.)

**Status (rev 4): ALL LANDED — zero divergences remain outstanding.** Five
contracts in this design deliberately diverged from frozen requirements rev 2;
the design could not edit `requirements.md`, so the orchestrator was instructed
to land them as requirements errata before the tasks phase. That happened:
requirements **rev 3** carries D-1…D-5 (plus the additive
`POST /api/v1/models/:id/domains` route and the N-10 label-count fix) as an
errata block, and requirements **rev 4** folded D-1/D-4/D-5 into the body text
itself (D-2/D-3 and the domains route remain errata-only, which is sufficient —
errata override the body where they conflict). The table is kept as the
historical record of what moved and where it now lives:

| # | Requirements text (rev 2) | This design | Landed as |
|---|---------------------------|-------------|-----------|
| D-1 | FR-18/AC-21: FR-05 list/detail GETs accept an optional `?model=<id>` query parameter; AC-21 asserts "instance list with `?model=modelA`" | **No `?model=` on any GET in this spec.** Isolation is proven by the `scopedNodeIds` test + the **path**-scoped instance list (§4.2, §8 AC-21) | rev-3 errata D-1; rev-4 body (FR-18/AC-21, C-09) |
| D-2 | FR-07/AC-05: instantiate body is `{moduleId, version?}` | **`targetDomainId` is a required third field** (fork needs a concrete in-model `Domain` anchor) (§3.4, §8 AC-05) | rev-3 errata D-2 |
| D-3 | FR-06: publish always auto-increments | **Optional explicit-version publish mode** (`{version?}`); collision → `409 module_version_immutable` — the single genuine reachability site for that code (§4.4) | rev-3 errata D-3; rev-4 AC-04 |
| D-4 | AC-06: generic-path write on a version-owned node → `409 module_version_immutable` | **That arm is unreachable** (version content is a serialized blob; no version-owned live nodes exist). Replaced by `409 model_lifecycle_route_required` on the `BusinessModuleVersion` node itself (§2 C-06 resolution, §8 AC-06) | rev-3 errata D-4; rev-4 body (FR-08/AC-06, C-06) |
| D-5 | AC-16's literal command `bun scripts/design-conformance.ts pwa/src/views/model/` (N-07) | **Inert** — the script exits 0 without `--view`/`--surface`. The enforced form is the two `--view <file>` invocations (§6, §8 AC-16) | rev-3 errata D-5; rev-4 AC-16 (C-11) |

Not a deviation: FR-08's "sibling edge route" is **fully specified** (§4.4,
B-03 option (a)) rather than descoped, so the design matches the requirements
text on that point.

## 3. Data model

All four labels + five edges (N-10 count, per requirements NFR-01 rev 4) are
registered at boot via `createNodeLabel` /
`createEdgeType` (§4.1). Registry attribute schemas are **permissive** (open
`attributes`), because the queryable shape is owned by the dedicated storage
layer as top-level properties. Zod schemas for the REST boundary live in a new
`shared/src/schema/model-workspace.ts` (FR-01/02/05/06/07/08/09/13).

### 3.1 `BusinessModel` (FR-01)

Top-level Neo4j properties (not in `attributes_json`):

| Prop | Type | Notes |
|------|------|-------|
| `id` | string (UUIDv7) | server-generated |
| `name`, `description` | string | envelope |
| `ordinal` | int | unique (constraint §4.3); server-assigned `max+1` |
| `status` | `"active" \| "archived"` | archive is non-destructive |
| `isReference` | boolean | at most one `true` (app-enforced, §4.3) |
| `createdAt`, `updatedAt` | ISO string | |
| `attributes_json` | string | open map, `"{}"` default |

`zod`: `modelCreateSchema` (`name` required, `description?`, `attributes?`),
`modelPatchSchema` (all optional; omitted → unchanged), `modelReadSchema`
(adds server fields + `moduleInstanceCount:int`, C-06).

### 3.2 `BusinessModule` (FR-02, catalog)

Top-level: envelope + `sourceJourneyId: string` (the `UserJourney` it was
authored around) + `sourceModelId: string`. Journey-level: one module ≙ one
source journey subtree.

### 3.3 `BusinessModuleVersion` (FR-02, immutable snapshot — rule 3)

Top-level: envelope + `version:int` (monotonic per module) + `publishedAt:ISO` +
`checksum:string` (sha-256 hex over canonical snapshot JSON) +
`snapshot_json:string`. `snapshot_json` shape (serialized, never a live subtree):

```jsonc
{
  "journey": { "name": "...", "description": "...", "attributes": {…} },
  "activities": [ { "localKey": "a0", "name": "...", "attributes": {…} }, … ],
  "precedes":   [ { "from": "a0", "to": "a1" }, … ],   // intra-subtree order
  "roleRefs":     [ { "activityKey": "a0", "roleId": "…" }, … ],   // EXECUTES → shared Role
  "systemRefs":   [ { "activityKey": "a0", "systemId": "…" }, … ], // USES_SYSTEM → shared System
  "locationRefs": [ { "activityKey": "a0", "locationId": "…" }, … ]// AT_LOCATION → shared Location
}
```

`localKey` decouples snapshot content from concrete node ids so a fork can mint
fresh UUIDv7 ids while preserving intra-subtree edges. Reference edges store the
**shared** node id verbatim (DEC-01 (a)).

**`localKey` assignment (deterministic).** At publish time the serializer walks the
source journey's activities in a fixed order — **topological order of `PRECEDES`,
ties broken by ascending `createdAt` then ascending `id`** — and assigns
`a0, a1, …` in that walk. The journey itself is the reserved key `journey`. Because
the order is a pure function of the subtree, re-publishing the *same* subtree
yields byte-identical `localKey`s (and therefore an identical `checksum`).

**`checksum` — canonical serialization (Resolves: C-04).** `checksum = sha-256 hex`
over the **canonical JSON** of the `snapshot_json` object, where "canonical" is:
(1) object keys sorted lexicographically (US-ASCII code-point order) at every
depth; (2) no insignificant whitespace (`JSON.stringify` with no `space`
argument, then re-emit through a key-sorting replacer — a small
`canonicalStringify(value)` in `api/src/storage/modules.ts`); (3) arrays kept in
their **stored order** (activities in `localKey` order, `precedes`/`*Refs` sorted
by `(from,to)` / `(activityKey, <refId>)` ascending) — never re-sorted by content
hash; (4) numbers emitted in the ECMAScript `Number#toString` canonical form — i.e.
exactly what `JSON.stringify` produces, which is deterministic across platforms
(exponential form appears only at extreme magnitudes, `|n| ≥ 1e21` / very small
values, and is itself canonical — **N-05**); (5) strings (including shared
reference UUIDs) emitted verbatim as UTF-8. The checksum covers the snapshot
object only — never the **version node's own** `id` or envelope fields
(`publishedAt`, `version`); the shared `roleId`/`systemId`/`locationId` values
inside the `*Refs` rows are part of the snapshot content and **are** covered
(**N-08**). Two publishes of an unchanged subtree are therefore
checksum-identical (the AC-06 "checksum-identical" assertion and any re-publish
comparison depend on this).

### 3.4 `ModuleInstance` (FR-02, per-model pin)

Top-level: envelope + `forked:boolean` (default `false`) + `pinnedVersion:int` +
`targetDomainId:string` (the in-model `Domain`, already `IN_MODEL` to the model,
under which a fork materializes its journey — §4.4). `INSTANTIATES` points at the
pinned `BusinessModuleVersion`; `INSTANCE_IN` at the `BusinessModel`.

**`targetDomainId` — required third field (Resolves: C-03; sanctioned as
requirements rev-3 errata D-2).** FR-07's rev-2 body specifies the
instantiate body as `{moduleId, version?}`; this design **adds a required
`targetDomainId`** — now requirements text via errata D-2 — because a fork has
to attach its materialized journey under a
concrete in-model `Domain` (a module is journey-level and a `UserJourney` is
`PART_OF` a `Domain`, per the core schema — there is no defaultable anchor). This
is a deliberate design refinement, not a silent change: `targetDomainId` is a
**required** field of `instanceCreateSchema` (in `shared/src/schema/
model-workspace.ts`), so it flows into the `POST /models/:modelId/module-instances`
openapi request body (generated from that same zod schema, §5 / §4.9 openapi) and is
carried by the AC-05 two-model instantiation test (§8). The route validates it is a
`Domain` linked `IN_MODEL` to `:modelId` (else `400 invalid_payload`). This spec's
PWA ships no instantiate UI (instance authoring is downstream), so no `api.ts`
client method is added for it here; a downstream spec that adds instance authoring
consumes the same required field.

**Synthetic content ids for a non-forked instance (Resolves: B-01).** A non-forked
instance has **no live journey/activity nodes** (its content is the pinned
version's serialized snapshot, §3.3), so there is no concrete node id a client
could send to the fork-trigger PATCH route. This design defines a stable
**synthetic content-id** for every addressable snapshot member, derived purely from
the instance id and the snapshot `localKey`:

```
<instanceId>::journey          # the journey node
<instanceId>::<localKey>       # e.g.  <uuid>::a0, <uuid>::a1  (an activity)
```

These synthetic ids are what the instance read (§4.5) surfaces as each virtual
node's `id`, and what the model-scoped PATCH route (§4.4) accepts as `:nodeId` for
a **non-forked** instance to trigger the first fork. `::` is chosen because a
UUIDv7 never contains it, making the split unambiguous. It is also RFC-3986-legal
inside a path segment and the router splits paths only on `/`, so `<uuid>::a0`
travels as the `:nodeId` segment as-is — clients must send the handle verbatim
and never percent-encode or otherwise URL-mangle the `::` (**N-06**).

**On fork, the synthetic id becomes a stored instance anchor (Resolves: B-02).**
Each `localKey` is mapped to a freshly-minted UUIDv7, and every materialized node
is written with a `forkLocalKey` top-level property equal to the **full
instance-qualified synthetic id** — `"<instanceId>::journey"` on the journey,
`"<instanceId>::<localKey>"` on each activity — **never** the bare snapshot key
(bare keys `journey`/`a0`/`a1`… are deterministically identical across every fork
of a version, and `a0, a1, …` collide across modules too, which is exactly the
B-02 ambiguity). Because `localKey`s are unique within a snapshot and an instance
forks at most once, `forkLocalKey` values are **globally unique by construction**.
Three previously-undefined steps now have queryable definitions:

1. **Post-fork synthetic-id resolution** is a direct property match —
   `MATCH (n) WHERE n.forkLocalKey = $syntheticId` — unambiguous even when the
   same module is instantiated twice into the same model and `targetDomainId`
   (FR-07 places no uniqueness on `(moduleId, targetDomainId)`), and never
   confusable with the model's migrated/authored journeys (which carry no
   `forkLocalKey`).
2. **Fork-subtree membership of a raw UUIDv7**: a live node belongs to instance
   `I`'s fork iff `n.forkLocalKey STARTS WITH I + "::"`.
3. **The instance→subtree read anchor** is the journey node
   `{forkLocalKey: I + "::journey"}` (§4.5).

So the *same* synthetic id keeps resolving (to the now-live node) after the
fork — clients never have to re-derive handles.

### 3.5 Edges (FR-03, FR-04) — registered via `createEdgeType`

| Edge | Endpoint pair (`_OntologyEdgeEndpoint`) | Meaning |
|------|-----------------------------------------|---------|
| `IN_MODEL` | `Domain → BusinessModel` | scoping root of a model's subgraph |
| `HAS_VERSION` | `BusinessModule → BusinessModuleVersion` | published versions |
| `INSTANTIATES` | `ModuleInstance → BusinessModuleVersion` | the pin |
| `INSTANCE_IN` | `ModuleInstance → BusinessModel` | instance ↔ model |
| `FORKED_FROM` | `ModuleInstance → BusinessModuleVersion` | set on fork |

Endpoint pairs are written as `_OntologyEdgeEndpoint` rows by `createEdgeType`;
the registry-backed validator (`api/src/storage/edges.ts` via the
`edge-endpoints` cache) enforces them and returns `400
edge_endpoint_label_mismatch` on a wrong pair. The frozen `EDGE_ENDPOINTS` const
is not edited (C-02 held from requirements).

### 3.6 Error codes (FR-13, C-08) — additive to the closed `ERROR_CODES`

`model_not_found`, `model_reference_immutable`, `module_not_found`,
`module_version_not_found`, `module_instance_forked`, `module_version_immutable`,
`module_downgrade_not_allowed`, `model_lifecycle_route_required`,
`module_instance_node_not_member`. All additive (non-breaking, NFR-11).

## 4. Core logic

### 4.1 Label + edge registration (FR-01–04, NFR-01)

`api/src/scripts/register-model-labels.ts` exports `registerModelSchema(driver)`:
loops the four `createNodeLabel` calls (permissive `json_schema_doc: {}`) then the
five `createEdgeType` calls (N-10 counts), each wrapped so a `409 name_conflict` (already
registered) is swallowed → **idempotent** (safe re-run, FR-01). It is invoked
(a) from `applySchema` in `api/src/neo4j/bootstrap.ts` after the const-seed step
so a fresh boot has the labels, and (b) standalone via `bun run register:model`.
Because registration runs through the sanctioned registry path, the
edge-endpoints cache invalidates via the existing `ontology.changed` event and
`nodeReadSchema.label` (`z.string()`) already accepts the new labels (Risk 5).

### 4.2 Model-scoped read helper (FR-18, NFR-03a, N-04)

`api/src/storage/model-scope.ts`:

- `scopedNodeIds(driver, modelId): Promise<Set<string>>` — one read query:
  ```cypher
  MATCH (m:BusinessModel {id:$modelId})
  OPTIONAL MATCH (d:Domain)-[:IN_MODEL]->(m)
  OPTIONAL MATCH (d)<-[:PART_OF*0..]-(desc)     // journeys, activities, forked subtrees
  OPTIONAL MATCH (mi:ModuleInstance)-[:INSTANCE_IN]->(m)
  RETURN collect(DISTINCT d.id)+collect(DISTINCT desc.id)+collect(DISTINCT mi.id) AS ids
  ```
  Returns **structural** nodes only. Forked journeys are already in the set
  because a fork attaches its journey `PART_OF` the instance's `targetDomainId`
  (which is `IN_MODEL`), so `PART_OF*` descent reaches them (§4.4). **N-04:** for a
  **non-forked** instance the pinned content is *not* live nodes — a caller that
  needs the content resolves it from the version snapshot (§4.5), never expecting
  Activity nodes in this set. Shared `System`/`Role`/`Location` are **not**
  model-scoped (DEC-01 (a)) and are therefore excluded from the set but reachable
  by any model's reads.
- `scopedWhereFragment(alias, modelId)` — a `(alias.id IN $__scopeIds)` builder +
  param, for handlers that filter a larger query.

**Where the helper is applied (Resolves: C-01).** The prior revision applied
`?model=<id>` to `GET /models` and `GET /models/:id`, but neither read is
meaningfully model-scoped — `scopedNodeIds` returns Domain/journey/activity/
instance nodes, **not** `BusinessModel` roots, so the parameter did no real work on
the models list (a global catalog of models) or on the single-model detail
envelope. This spec therefore **does not** add a `?model=` query parameter to any
of its GETs. Instead the helper is applied, and proven, in exactly the two places
where it filters real content:

1. **`GET /models/:modelId/module-instances`** — the handler calls
   `scopedNodeIds(driver, :modelId)` (the model is identified by the **path**
   param, not a query param) and returns only that model's `ModuleInstance`s +
   their forked-subtree nodes, so an instance list for model A never leaks model
   B's instances (NFR-03a, AC-21 half 2).
2. The **`scopedNodeIds` unit/integration test** directly asserts
   `scopedNodeIds(modelA)` excludes every node scoped only to model B and includes
   the shared reference nodes (AC-21 half 1).

Requirements rev 4 (C-09, superseding the rev-2 `?model=` text via errata D-1)
**agrees**: FR-18/AC-21 now state that no `?model=` query parameter exists on
any GET in this spec, scope resolves from the `:modelId` path param, and the
helper is proven directly plus via the path-scoped instance list. Adding
Model-aware filters to *generic* reads is deferred to the downstream specs that
own those reads (which import this helper). FR-18's guarantee — *the helper
exists, is model-correct, and is proven* — is fully met. Generic graph-core
reads (`query.ts`, `nodes`, `analytics`) are **not** retrofitted (out of scope,
FR-18).

### 4.3 Model CRUD + ordinal allocation (FR-05, C-04)

`api/src/storage/models.ts`:

- `createModel` — inside one `executeWrite`: `MATCH (m:BusinessModel) WITH
  coalesce(max(m.ordinal),0)+1 AS next CREATE (:BusinessModel {…, ordinal:next})`.
  Uniqueness constraint (§ below) makes a concurrent double-create fail one side
  with `ConstraintValidationFailed`; caught → bounded retry (max 3) recomputing
  `max+1`. New model defaults `status:"active"`, `isReference:false`.
- `listModels` — `ORDER BY ordinal ASC`, each row computes `moduleInstanceCount`
  in the same query via `OPTIONAL MATCH (mi:ModuleInstance)-[:INSTANCE_IN]->(m)
  … count(mi)` (C-06, no N+1).
- `getModel`, `patchModel` (dynamic SET, omitted fields untouched — mirrors
  `patchNode`).
- `archiveModel` — `SET m.status="archived"`; subgraph retained.
- `deleteModel` — if `isReference` → `409 model_reference_immutable`. Else, in one
  tx: collect the `scopedNodeIds` structural set (which already excludes shared
  `System`/`Role`/`Location` per §4.2 — **N-03**, no separate subtraction needed)
  and `DETACH DELETE` the model root + its `IN_MODEL` domains + `PART_OF`
  descendants + its `ModuleInstance`s. **The cascade explicitly includes
  forked-subtree copy nodes** (requirements rev-4 N-07): fork materializes its
  journey `PART_OF` the instance's `targetDomainId` (§4.4), so forked copies
  are `PART_OF` descendants of an `IN_MODEL` domain and fall inside the
  structural set — a delete orphans nothing. **Catalog `BusinessModule`/
  `BusinessModuleVersion` nodes are model-independent and are NOT deleted.** →
  `204`.
- `attachDomain(modelId, {name, description?, attributes?})` — backs
  `POST /api/v1/models/:id/domains` (**Resolves: C-06**): in one tx, creates a new
  `Domain` node (server UUIDv7, via the sanctioned storage path) **and** its
  `IN_MODEL` edge to the model → `201` with the domain envelope; `model_not_found`
  if the model is absent. This is the minimal sanctioned API path that puts a
  `Domain` into a user-created model — without it, `instantiate`'s
  `targetDomainId` precondition (§3.4) is unsatisfiable for any non-reference
  model, and `business_architect` (deliberately without `node:write`/
  `edge:write`, §4.8) could never populate a model at all. Permission:
  `model:write` (§5). The `IN_MODEL` edge is written internally by this storage
  function — the §4.6 guard on the generic edge route is not in its path. Richer
  domain authoring (attach-existing, move, detach) stays downstream
  (`business-model-authoring`); this spec's two-model integration tests
  (AC-05/AC-06/AC-21) set up model-B domains through this route, so **no
  direct-driver test seeding is needed** (§8).

**Constraints** (added to `applySchema`, `api/src/neo4j/bootstrap.ts`, after the
registry loop, `IF NOT EXISTS` so re-run is a no-op): `CREATE CONSTRAINT
business_model_ordinal_unique … FOR (m:BusinessModel) REQUIRE m.ordinal IS
UNIQUE`, plus two **lookup indexes for the B-02 anchor** — `CREATE INDEX
user_journey_fork_local_key IF NOT EXISTS FOR (n:UserJourney) ON
(n.forkLocalKey)` and `CREATE INDEX activity_fork_local_key IF NOT EXISTS FOR
(n:Activity) ON (n.forkLocalKey)` — so §3.4's equality and `STARTS WITH`
resolutions are index-backed. **At-most-one-reference** is *not* expressible as a Neo4j Community
constraint (no partial/conditional constraints); of the two feasible mechanisms
requirements FR-05 (rev-4 N-06) names, this design **picks the transactional
check** — `createModel`/migration refuse to create a second `isReference:true`
(checks `EXISTS { (:BusinessModel {isReference:true}) }` inside the write tx).
Documented limitation.

### 4.4 Module publish + fork (FR-06, FR-07, FR-08, NFR-04)

`api/src/storage/modules.ts`:

- `createModule({sourceModelId, sourceJourneyId, name})` → `BusinessModule` node.
- `publishVersion(moduleId, {version?})` — reads the source journey subtree,
  serializes it to the §3.3 shape (deterministic `localKey` walk), computes the
  canonical `checksum` (§3.3), CREATEs the immutable `BusinessModuleVersion` +
  `HAS_VERSION`. **Default mode** (no `version` in the body): assigns `version =
  max(existing)+1` (FR-06 monotonic auto-increment). **Explicit-version mode**
  (`{version:n}` supplied — for deterministic re-publish from CI/import): if `n`
  already exists for the module → `409 module_version_immutable` (**Resolves: C-05**
  — this is the single genuine reachability site; auto-increment can never itself
  collide, so the old "re-publish over an existing version" reading was
  unreachable). Versions are never mutated in place (NFR-04) — structural, because
  content is an opaque blob and the lifecycle guard (§4.6) blocks any generic write
  to a `BusinessModuleVersion` node.
- `instantiate({modelId, moduleId, version?, targetDomainId})` — resolves the
  version (default latest → else `module_version_not_found`), CREATEs
  `ModuleInstance {forked:false, pinnedVersion, targetDomainId}` + `INSTANTIATES` +
  `INSTANCE_IN`. `targetDomainId` must be `IN_MODEL` the model (else
  `invalid_payload`). Two models instantiating the same version share the blob →
  identical content, no shared live nodes to mutate (FR-07, AC-05).
- `forkInstance(instanceId)` — idempotent; returns a `Map<localKey, uuid>`. On a
  non-forked instance: deserialize the pinned `snapshot_json`, mint one fresh
  UUIDv7 per `localKey` (journey included), CREATE a live `UserJourney` + `Activity`
  nodes wired `PART_OF` the instance's `targetDomainId`, re-create intra-subtree
  `PRECEDES`, and re-link `EXECUTES`/`USES_SYSTEM`/`AT_LOCATION` to the **shared**
  Role/System/Location ids from the snapshot (DEC-01 (a) — no copy). **Each
  materialized node is written with a `forkLocalKey` top-level property equal to
  its full instance-qualified synthetic id** — `<instanceId>::journey` /
  `<instanceId>::<localKey>`, never the bare snapshot key (**Resolves: B-02**,
  §3.4) — so the synthetic content-id keeps resolving after the fork and the
  subtree is anchored to *this* instance. `SET forked=true`, CREATE `FORKED_FROM`
  → source version. Already-forked → no-op `200`, returning the existing
  `localKey → id` map **read back from the live subtree by the instance anchor**:
  `MATCH (n) WHERE n.forkLocalKey STARTS WITH $instanceId + "::"` and stripping
  the `<instanceId>::` prefix to recover each `localKey` (B-02 — the read-back
  now has a queryable definition). Fork is **per-instance and lazy** (only on
  first edit or explicit call), and journey-level, so fan-out is bounded
  (Risk 2).
- **Fork trigger — the dedicated model-scoped write route is the only place it
  lives** (FR-08; **Resolves: B-01**). `PATCH /api/v1/models/:modelId/
  module-instances/:instanceId/nodes/:nodeId` (+ the sibling edge route) resolves
  `:nodeId` **through the synthetic content-id scheme (§3.4)**, which gives a
  non-forked instance's virtual content addressable handles that no prior revision
  had:
  - **Membership resolution (Resolves: B-02).** Split `:nodeId` on `::`. If it has
    the shape `<instanceId>::<key>` and `<instanceId>` matches the route's
    `:instanceId`, the `<key>` (`journey` or an activity `localKey`) must exist in
    the pinned version's snapshot → member. Otherwise, if `:nodeId` is a raw
    UUIDv7, it must be a live node in **this instance's** materialized subtree —
    queryable definition per §3.4: `MATCH (n {id:$nodeId}) WHERE n.forkLocalKey
    STARTS WITH $instanceId + "::"`. The instance-qualified anchor makes this
    unambiguous across two forks under the same `targetDomainId` and distinct from
    the model's migrated/authored journeys (no `forkLocalKey`). Anything else →
    `404 module_instance_node_not_member` (C-08).
  - **Non-forked instance** (`forked=false`): the only accepted handle is a synthetic
    `<instanceId>::<key>` for a snapshot member. It triggers `forkInstance`, then
    maps `<key>` through the returned `localKey → freshly-minted UUIDv7` map to the
    now-live node id, and applies the edit there. (A raw UUID sent to a non-forked
    instance is never a member → `404`.)
  - **Forked instance** (`forked=true`): accepts either the live UUIDv7 **or** the
    still-valid synthetic `<instanceId>::<key>` (resolved by direct
    `forkLocalKey = :nodeId` equality match, §3.4 — B-02); no fork happens; the
    edit is applied locally. Subsequent edits are local-only (AC-06).
  - **Deleted-anchor hardening (Resolves: design-review C-09; pinned in tasks
    T-08).** `UserJourney`/`Activity` are not lifecycle labels, so a
    `node:write` session may generically delete a materialized fork node
    (including the `{forkLocalKey: <instanceId>::journey}` anchor). If a
    forked instance's handle — synthetic or raw UUID — no longer resolves to a
    live member of its subtree, the model-scoped write routes (nodes **and**
    edges) return `404 module_instance_node_not_member`; they never 500 and
    never re-fork.
  This route **never writes version content** — a non-forked write always forks into
  the model first — so `module_version_immutable` is not reachable here; it is
  reachable only through the explicit-version publish mode (§4.4 `publishVersion`,
  C-05).
- **Sibling edge route (Resolves: B-03; FR-08's "and the sibling edge route" now
  has a full contract).** The snapshot's `precedes`/`*Refs` rows carry **no edge
  ids** (§3.3), so instance edges are addressed by **`(type, endpoints)`**, never
  by edge id — this sidesteps synthetic edge-id invention entirely. Two routes,
  both in `api/src/routes/models.ts`, backed by instance-edge write/delete
  functions in `api/src/storage/modules.ts`:

  `POST /api/v1/models/:modelId/module-instances/:instanceId/edges`
  `DELETE /api/v1/models/:modelId/module-instances/:instanceId/edges`

  Body (both, zod `instanceEdgeSchema` in `shared/src/schema/model-workspace.ts`):
  `{type, from, to}`, where `type ∈ {"PRECEDES","EXECUTES","USES_SYSTEM",
  "AT_LOCATION"}` (any other type — lifecycle edges included — → `400
  invalid_payload`; lifecycle edges are mutated only by their own routes, §4.6)
  and `from`/`to` each accept a live UUIDv7 **or** a synthetic
  `<instanceId>::<key>` handle (§3.4).
  - **Membership.** `PRECEDES`: **both** endpoints must be members of this
    instance's subtree (§3.4 definition — snapshot key for a non-forked instance,
    `forkLocalKey STARTS WITH <instanceId>::` for a live node). Reference types
    (`EXECUTES`/`USES_SYSTEM`/`AT_LOCATION`): the **subtree-side** endpoint (`to`
    for `EXECUTES`, `from` for the other two) must be a member; the other endpoint
    must be an existing shared `Role`/`System`/`Location` id (DEC-01 (a)).
    Non-member subtree endpoint → `404 module_instance_node_not_member`; missing
    shared node → `404 not_found`; wrong endpoint labels for the type → `400
    edge_endpoint_label_mismatch` (same semantics as the registry matrix).
  - **Non-forked instance**: fork-then-apply, exactly like the nodes route —
    `forkInstance` runs first, handles are mapped through the returned
    `localKey → uuid` map, then the edge write applies to the live subtree. This
    closes the real FR-08 path where the *first* edit to an instance is an edge
    edit.
  - **Semantics.** `POST` MERGEs on `(type, from, to)` → idempotent (`201`
    created, `200` if the edge already exists); `DELETE` removes the matched edge
    → `204`, or `404 not_found` if absent. Neither route ever writes version
    content (a non-forked write forks first — same structural NFR-04 enforcement
    as the nodes route). **N-11 note:** the `DELETE` carries a JSON body, to
    which RFC 9110 assigns no defined semantics; acceptable on this loopback +
    Vite-proxy stack (no body-stripping intermediary). If a client ever
    misbehaves, the sanctioned fallback is `?type=&from=&to=` query params —
    recorded here so implementers don't relitigate it.
  - **Wiring.** Both routes: `module:write` in `ROUTE_PERMISSIONS` (§5, FR-12);
    openapi-registered from `instanceEdgeSchema` (FR-13); AC-06 gains edge
    coverage (§8). The generic `POST /api/v1/edges` remains usable for core edge
    types on an already-forked subtree (it was never blocked for non-lifecycle
    types), but the fork trigger for edges lives **only** here.

### 4.5 Instance read + upgrade (FR-07, FR-09)

- `listInstances(modelId)` — instances with `pinnedVersion`, `forked`. Content
  resolution (N-04): **forked** → read the live subtree, **anchored on the
  instance's journey node `{forkLocalKey: <instanceId> + "::journey"}` and its
  incoming `PART_OF` activities** (**Resolves: B-02** — "read the live subtree"
  now has a concrete instance anchor; two forks under one `targetDomainId` read
  independently); each node's `id` is its live UUIDv7 and it also carries its
  instance-qualified `forkLocalKey`. **Non-forked** → deserialize the
  pinned `snapshot_json` and project each member with its **synthetic content id**
  (`<instanceId>::journey`, `<instanceId>::<localKey>`, §3.4) as its `id`, so a
  client reading a non-forked instance receives the exact handles the fork-trigger
  PATCH route (§4.4) will accept (**Resolves: B-01** — the read and write sides now
  agree on one addressing scheme). The synthetic-id projection is a pure function of
  the instance id + snapshot; it mints no nodes.
  **Missing-anchor read (Resolves: design-review C-09; pinned in tasks T-08):**
  if a forked instance's journey anchor (`{forkLocalKey: <instanceId>::journey}`)
  matches nothing — e.g. a `node:write` session generically deleted the
  materialized journey — the read returns the instance **envelope with empty
  content** (`forked:true`, `pinnedVersion`, zero content nodes), never a 500;
  the write-side counterpart is §4.4's deleted-anchor hardening.
  **AC-05 identity semantics (N-12):** "two models read identical content" means
  identical **modulo the projected handles** — names, descriptions, attributes,
  and `precedes`/reference structure are equal, while each virtual node's `id`
  (`<instanceId>::<localKey>`) differs per instance by construction. The AC-05
  test must compare handle-stripped projections, not deep-equal raw responses.
- `upgradeInstance(instanceId, toVersion, allowDowngrade?)` — forked instance →
  `409 module_instance_forked` (three-way reconciliation deferred, Risk 3);
  `toVersion` missing → `404 module_version_not_found`; `toVersion < pinnedVersion`
  without `allowDowngrade` → `400 module_downgrade_not_allowed` (C-03); else re-point
  `INSTANTIATES` + `SET pinnedVersion=toVersion`. Publishing a new version never
  auto-upgrades (no write touches other instances). **Handle-stability warning
  (N-09):** synthetic content ids are **pinned-version-relative** — after an
  upgrade re-pins a non-forked instance, `<instanceId>::a0` denotes the *new*
  version's `a0`, which may be a different activity. Clients must not cache
  synthetic handles across an upgrade; re-read the instance after
  `POST …/upgrade`. (Forked instances are unaffected — they reject upgrade with
  `409 module_instance_forked`.)

### 4.6 Generic-route lifecycle guard (FR-08 guard, C-06)

`api/src/storage/model-lifecycle-guard.ts` exports
`LIFECYCLE_LABELS`/`LIFECYCLE_EDGES` sets + `assertNotLifecycleLabel(label)` /
`assertNotLifecycleEdge(type)` throwing `ValidationError("model_lifecycle_route_
required", …, 409)`. Called at the top of `handleNodePatch`/`handleNodeDelete`/
`handleNodePost` (after `parseRegistryLabel`) and `handleEdgePost`/
`handleEdgeDelete` (after body parse / edge-type lookup) in the existing route
files. Storage primitives themselves are unchanged. This makes `DELETE
/api/v1/nodes/BusinessModel/:id` return `409` — FR-05's reference protection
cannot be bypassed (AC-03), and no `node:write` session can corrupt lifecycle
state (FR-11 rationale).

### 4.7 Retail → Business Model #1 migration (FR-10, NFR-02)

`api/src/scripts/migrate-retail-to-model.ts`, wired `bun run migrate:model`
(root `package.json`). Flags: default (apply), `--down`, `--dry-run`.

- **apply (Resolves: C-02)** — the reference model is keyed on **`isReference:true`,
  not `ordinal:1`**, because `createModel` (§4.3) also allocates `ordinal` from
  `max+1` starting at 1, so a user-created model could already hold `ordinal:1`; a
  `MERGE {ordinal:1}` would then *match that user model*, never fire `ON CREATE`
  (leaving `isReference:false`), and mis-scope the retail domains under it.
  Sequence, in one tx:
  1. **Collision guard (Resolves: C-07 — fires only on the actual first-run
    hijack case):** abort **only when the reference model is absent AND a
    non-reference model exists** — `NOT EXISTS { (:BusinessModel
    {isReference:true}) } AND EXISTS { (x:BusinessModel) WHERE
    coalesce(x.isReference,false)=false }` — i.e. a user model was created before
    the first migration ever ran, the one state where scoping could land on the
    wrong root. When the reference model **already exists**, the presence of user
    models is normal and the script proceeds idempotently: step 2's MERGE matches
    the existing reference model, step 3 scopes only still-unscoped domains. So
    `migrate:model` stays re-runnable forever (NFR-02) — including after a user
    creates model #2+ — and AC-08's "second run adds zero nodes/edges" holds in
    that state too, not just on a pristine graph.
  2. `MERGE (m:BusinessModel {isReference:true}) ON CREATE SET m.id=<uuidv7>,
    m.name="Retail Reference", m.status="active", m.ordinal=1, timestamps` — a
    second run matches the existing reference model and sets nothing new.
  3. For every top-level `Domain` not already `IN_MODEL` any model,
    `MERGE (d)-[:IN_MODEL]->(m)` (keyed by the (domain,model) pair).
  Idempotent (MERGE on `isReference:true` + the `ordinal` uniqueness constraint,
  C-04) — re-run adds zero nodes/edges (NFR-02). **Ordering rule (documented in the
  script header + `bun run migrate:model` help):** the **first** `migrate:model`
  run must precede the first `POST /api/v1/models`; on a fresh graph this is the
  natural order, and the step-1 guard fails loudly if it is violated. Subsequent
  re-runs are unrestricted (C-07).
- **--down** — **refusal guard first (requirements rev-4 C-10):** if any
  **other** (non-reference) `BusinessModel` exists, `--down` **refuses and
  writes nothing unless `--force` is also passed** — the operator must
  explicitly acknowledge that user models will remain while the reference
  scoping is removed. When it proceeds (no user models, or `--force`):
  `MATCH (d)-[r:IN_MODEL]->(m:BusinessModel {isReference:true}) DELETE r` then
  `DETACH DELETE m` (matched on `isReference:true`, consistent with apply) —
  **never an unqualified `IN_MODEL` sweep**, so a later-created model's
  `IN_MODEL` edges and subgraph survive intact (AC-08 asserts a second model
  survives a forced down-migration). Domain/journey/activity nodes untouched →
  counts identical to pre-migration (AC-08). **Documented limitation
  (design-review C-10, pinned in tasks T-16):** re-applying after a forced
  `--down` while user models exist trips the apply-step collision guard and is
  unsupported — documented in the script header + help text, not
  special-cased; the `--force` refusal exists precisely so that state is
  entered knowingly.
- **--dry-run** — runs the same MATCHes read-only, prints the node/edge deltas it
  *would* write, commits nothing (`/api/v1/stats` unchanged, NFR-02/AC-08).

Requires the `ordinal` constraint to exist first — `migrate:model` calls
`applySchema` (or documents `schema:apply` as a prerequisite).

### 4.8 Persona / RBAC (FR-11, FR-12)

- `api/src/scripts/seed-rbac-roles.ts` — add a `business_architect` role to
  `RBAC_ROLES` with permissions `["model:read","model:write","module:read",
  "module:write","domain:read","domain:write","journey:read","journey:write",
  "query:read","analytics:read"]` (MERGE by name → idempotent). It does **not**
  include `node:write`/`edge:write` (FR-11 rationale: fork + lifecycle writes ride
  the dedicated `module:*`/`model:*` routes, and the generic routes reject
  lifecycle labels). Seed also MERGEs a `Business Architect` `Persona` and
  `HAS_RBAC_ROLE` binding (pattern from `migrate-persona-hierarchy.ts`); the SME
  persona is left unchanged.
- `api/src/auth/rbac-permissions.ts` — new `ROUTE_PERMISSIONS` rows, **specific
  before parameterized** (§5 lists each). Reads → `*:read`, writes (incl.
  archive/delete/fork/upgrade) → `*:write`. No route is `public`. Auth stays in
  the central gate (`router.ts`) — no per-route check (NFR-05, house rule).

### 4.9 PWA shell (FR-14, FR-15, FR-16, FR-17)

- **`pwa/src/route.ts`** — append a `model` surface to `SURFACES`: `{id:"model",
  label:"Model", kbd:"0", tabs:[models, canvas, stories, key-activities,
  kpi-impact, systems, export]}` — all seven blueprint View-Tree tabs verbatim
  (FR-14, UX-06). `parseHash`/`toHash` need no special-casing (generic).
- **`pwa/src/App.tsx`** — (a) extend the keydown handler regex `/^[1-9]$/` →
  `/^[0-9]$/` with `idx = e.key === "0" ? 9 : Number(e.key)-1`, keeping
  `e.preventDefault()` (Native-Conflicts row; Risk 6). This maps the Model surface
  (10th) to `Alt+0`. **Also update the stale line-40 comment** `Alt+1..8 to jump
  surfaces` → `Alt+1..9 / Alt+0 to jump surfaces` so it matches the handler
  (**N-02**; requirements Risk 6 flagged the comment for design). (b) Wrap the app
  in `<ActiveModelProvider>` above the `renderView` call so every Model view can
  consume the context.
- **`pwa/src/context/ActiveModelContext.tsx`** — `ActiveModelProvider` +
  `useActiveModel()`. Loads `GET /api/v1/models`, defaults to Business Model #1,
  persists the active id in `localStorage` (per-origin key
  `cg.activeModelId`), reconciles against a `?model=<id>` URL param on mount so a
  deep link + reload restore selection (FR-15, UX-06, AC-18). Exposes
  `{activeModel, models, setActiveModel, reload, status}`.
- **`pwa/src/views/model/ModelWorkspace.tsx` + `.module.css`** (FR-16) — see §6.
- **`pwa/src/views/model/ModelTabPlaceholder.tsx`** (FR-17) — names the owning
  downstream spec; reads `useActiveModel()` to prove the context is available; does
  not error.
- **`pwa/src/views/index.tsx`** — register `model` in `VIEWS`: `models →
  <ModelWorkspace/>`, and the six sibling tabs → `<ModelTabPlaceholder spec="…"/>`.
- **`pwa/src/api.ts`** — add `models` client methods (`list`, `get`, `create`,
  `patch`, `archive`, `remove`, `listInstances`).

## 5. HTTP API surface

All under `/api/v1/`, zod-validated, `{error:{code,message,details?}}` envelope,
registered in `openapi.json` (FR-13). Permission column = `ROUTE_PERMISSIONS` map
(FR-12).

| Method | Route | FR | Perm | Notes |
|--------|-------|----|------|-------|
| POST | `/api/v1/models` | FR-05 | `model:write` | 201 + UUIDv7 + `ordinal` |
| GET | `/api/v1/models` | FR-05 | `model:read` | ordinal ASC; `moduleInstanceCount`; global catalog — no `?model=` (C-01) |
| GET | `/api/v1/models/:id` | FR-05 | `model:read` | |
| PATCH | `/api/v1/models/:id` | FR-05 | `model:write` | omitted fields kept |
| POST | `/api/v1/models/:id/archive` | FR-05 | `model:write` | non-destructive |
| DELETE | `/api/v1/models/:id` | FR-05 | `model:write` | ref → 409 `model_reference_immutable`; else cascade 204 |
| POST | `/api/v1/models/:id/domains` | FR-07 setup (C-06) | `model:write` | create `Domain` + `IN_MODEL` in one tx → 201 |
| POST | `/api/v1/models/:modelId/module-instances` | FR-07 | `module:write` | `{moduleId,version?,targetDomainId}` |
| GET | `/api/v1/models/:modelId/module-instances` | FR-07 | `module:read` | |
| PATCH | `/api/v1/models/:modelId/module-instances/:instanceId/nodes/:nodeId` | FR-08 | `module:write` | fork trigger (nodes) |
| POST | `/api/v1/models/:modelId/module-instances/:instanceId/edges` | FR-08 | `module:write` | edge add by `(type,from,to)`; fork trigger (edges) — B-03 |
| DELETE | `/api/v1/models/:modelId/module-instances/:instanceId/edges` | FR-08 | `module:write` | edge remove by `(type,from,to)` — B-03 |
| POST | `/api/v1/models/:modelId/module-instances/:instanceId/fork` | FR-08 | `module:write` | idempotent |
| POST | `/api/v1/models/:modelId/module-instances/:instanceId/upgrade` | FR-09 | `module:write` | `{toVersion,allowDowngrade?}` |
| POST | `/api/v1/modules` | FR-06 | `module:write` | `{sourceModelId,sourceJourneyId,name}` |
| GET | `/api/v1/modules` | FR-06 | `module:read` | |
| POST | `/api/v1/modules/:id/versions` | FR-06 | `module:write` | publish immutable version; optional `{version?}` (explicit-version mode; collision → 409 `module_version_immutable`, C-05) |
| GET | `/api/v1/modules/:id/versions` | FR-06 | `module:read` | version DESC |

`ROUTE_PERMISSIONS` insertion order (specific → parameterized): the two
`module-instances` collection routes and the `fork`/`upgrade`/`nodes/:nodeId`/
`edges` (B-03) sub-routes, plus `models/:id/domains` (C-06), are listed
**before** `models/:id`; `modules` specific paths before `modules/:id`.

Router dispatch (`api/src/router.ts`): a `models*` block and a `modules*` block of
`sub.match(/…/)` regexes mirroring the existing per-resource blocks, plus the
generic-route guard calls in the node/edge handlers (§4.6).

Error codes (§3.6) added to `ERROR_CODES` and surfaced through at least one route
each (envelope reachability test): `model_lifecycle_route_required` from the
generic node/edge guard; the rest from the model/module handlers.

## 6. UI design

- **View tree placement (FR-14, UX-06).** New top-level **Model** surface
  (`kbd:"0"`) with the seven View-Tree tabs verbatim. `#/model/models` →
  `ModelWorkspace`; the other six → `ModelTabPlaceholder`. TopBar surf-nav + SubNav
  render from `SURFACES` with no special-casing.
- **Component plan.** `ModelWorkspace` reuses catalog components first: `Card` /
  `DomainCard`-style list rows, `Button` (tones), `Modal` for the create form,
  `SubNav`/`TopBar` (shell). `Loading` / `ErrorState` from `views/_shared.tsx`. No
  new catalog component is justified (UX-02). The reference badge is a token-styled
  `<span>`; the active-model indicator reuses existing selected-row styling.
- **States (UX-01, FR-16).**
  - **loading** — skeleton rows while `GET /api/v1/models` is in flight (AC-13).
  - **empty** — only the reference model present → empty-state card prompting
    "Create your first business model" (AC-14).
  - **error** — fetch failed → `ErrorState` + a retry button that refetches
    (AC-15).
  - **ready** — list of models (ordinal, name, status, reference badge,
    `moduleInstanceCount`); per-row actions: **switch** active (updates context +
    persists), **archive** (non-reference only); a header **Create** button opens
    the modal → `POST /api/v1/models` → list refreshes + context refresh (AC-11,
    AC-12).
- **Tokens (UX-02, NFR-06).** `ModelWorkspace.module.css` uses only `var(--…)`
  from `pwa/src/styles/companygraph/tokens.css` (**N-01** — the tokens file lives
  under `companygraph/`, not directly under `styles/`; the check resolves every
  `var(--…)` against that file). Enforced form (requirements rev-4 AC-16 /
  C-11, locked in tasks T-20): **two** `--view <file>` invocations —
  `bun run scripts/design-conformance.ts --view pwa/src/views/model/ModelWorkspace.tsx`
  **and** `bun run scripts/design-conformance.ts --view
  pwa/src/views/model/ModelWorkspace.module.css` — both must exit 0 (AC-16;
  the bare positional-directory form is inert and proves nothing).
- **Input modes / Native Conflicts (UX-03, UX-05).** No canvas/gesture surface
  here (ModelCanvas is downstream). The only new input handler is the extended
  `Alt+0` surf-jump — `e.preventDefault()` in the same App.tsx branch as the
  existing `Alt+1..9` (Native-Conflicts table). Keyboard: Tab reaches
  create→switch→archive in DOM order; the surface exposes an ARIA landmark; each
  control activates on Enter/Space (AC-17).

## 7. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `shared/src/schema/model-workspace.ts` | new | FR-01,02,05,06,07,08,09,13 | zod: model/module/version/instance + request/response bodies; `instanceEdgeSchema` (B-03); domain-attach body (C-06) |
| `api/src/scripts/register-model-labels.ts` | new | FR-01,02,03,04, NFR-01 | idempotent `createNodeLabel`/`createEdgeType`; `register:model` |
| `api/src/storage/model-scope.ts` | new | FR-18, NFR-03a | `scopedNodeIds`, `scopedWhereFragment` |
| `api/src/storage/models.ts` | new | FR-05, C-06 | Model CRUD + ordinal alloc + `moduleInstanceCount` + cascade delete + `attachDomain` |
| `api/src/storage/modules.ts` | new | FR-06,07,08,09, NFR-04 | publish/snapshot/checksum, instantiate, fork, upgrade, instance-edge write/delete (B-03) |
| `api/src/storage/model-lifecycle-guard.ts` | new | FR-08 | lifecycle label/edge guard sets + assert helpers |
| `api/src/routes/models.ts` | new | FR-05,07,08,09, C-06 | `/api/v1/models*` handlers incl. `:id/domains` + instance `edges` routes (B-03) |
| `api/src/routes/modules.ts` | new | FR-06 | `/api/v1/modules*` handlers |
| `api/src/scripts/migrate-retail-to-model.ts` | new | FR-10, NFR-02 | apply/`--down`/`--dry-run`; `--down` refuses without `--force` while user models exist (rev-4 C-10); `migrate:model` |
| `api/src/errors.ts` | modify | FR-13, C-08 | +9 error codes |
| `api/src/router.ts` | modify | FR-05–09, FR-08 | dispatch `models*`/`modules*`; guard calls |
| `api/src/routes/nodes.ts` | modify | FR-08 | `assertNotLifecycleLabel` guard |
| `api/src/routes/edges.ts` | modify | FR-08 | `assertNotLifecycleEdge` guard |
| `api/src/auth/rbac-permissions.ts` | modify | FR-12 | new `ROUTE_PERMISSIONS` rows |
| `api/src/scripts/seed-rbac-roles.ts` | modify | FR-11 | `business_architect` role + Business Architect persona |
| `api/src/neo4j/bootstrap.ts` | modify | FR-01–04, FR-05 (C-04) | call `registerModelSchema`; `ordinal` uniqueness constraint; `forkLocalKey` lookup indexes (B-02) |
| `api/src/routes/openapi.ts` | modify | FR-13 | register model/module paths + schemas |
| `package.json` | modify | FR-10, FR-01 | `migrate:model`, `register:model` scripts |
| `pwa/src/route.ts` | modify | FR-14, UX-06 | `model` surface + 7 tabs |
| `pwa/src/App.tsx` | modify | FR-14,15 | `Alt+0` handler; mount `ActiveModelProvider` |
| `pwa/src/context/ActiveModelContext.tsx` | new | FR-15 | provider + `useActiveModel` + persistence |
| `pwa/src/views/index.tsx` | modify | FR-16,17 | register model views |
| `pwa/src/views/model/ModelWorkspace.tsx` | new | FR-16, UX-01/02/05 | list/create/switch/archive + 4 states |
| `pwa/src/views/model/ModelWorkspace.module.css` | new | FR-16, NFR-06 | tokens-only |
| `pwa/src/views/model/ModelTabPlaceholder.tsx` | new | FR-17 | names owning spec; consumes context |
| `pwa/src/api.ts` | modify | FR-16 | `models` client methods |

## 8. Test strategy

| AC | Kind | File |
|----|------|------|
| AC-01 | integration | `api/__tests__/model-labels.integration.test.ts` — labels in `GET /schema`; `NODE_LABELS` unchanged |
| AC-02 | integration | `api/__tests__/model-edges.integration.test.ts` — edges via `createEdgeType`; wrong pair → 400 |
| AC-03 | integration | `api/__tests__/model-crud.integration.test.ts` — CRUD round-trip, DELETE ref→409, cascade, `moduleInstanceCount`, generic `DELETE nodes/BusinessModel/:id`→409 `model_lifecycle_route_required` |
| AC-04 | integration | `api/__tests__/module-publish.integration.test.ts` — snapshot immutable, version auto-increments; **explicit-version publish** of an existing version → 409 `module_version_immutable` (C-05 reachability); re-publishing an unchanged subtree is checksum-identical (C-04 canonical serialization); versions list DESC |
| AC-05 | integration | `api/__tests__/module-instantiate.integration.test.ts` — model-B domain set up via `POST /models/:id/domains` (C-06 — API-only setup, no direct-driver seeding); instantiate body carries required `targetDomainId` (C-03), validated `IN_MODEL` (bad domain → 400); two models instantiate the same version, read identical content **modulo the projected handles** (N-12, §4.5 — names/descriptions/attributes/`precedes`/ref structure equal; projected `id`s differ by construction, so no naive deep-equal), no shared-node mutation |
| AC-06 | integration | `api/__tests__/module-fork.integration.test.ts` — instance read of a **non-forked** instance surfaces synthetic content ids (`<instanceId>::<localKey>`, B-01); a model-scoped PATCH to one of those synthetic ids forks (forked flips, FORKED_FROM set, new UUIDv7 ids each carrying the **instance-qualified** `forkLocalKey = <instanceId>::<localKey>` — B-02; other model's snapshot checksum-identical, C-04); a 2nd edit via the same synthetic id (now resolving by direct `forkLocalKey` match) stays local; **per-instance disambiguation (B-02): the same version instantiated twice into the same model + `targetDomainId`, both forked — each instance's synthetic ids resolve only to its own subtree, and each instance's read returns only its own fork**; **edge coverage (B-03): on a fresh non-forked instance, `POST …/edges {type:"USES_SYSTEM", from:"<instanceId>::a0", to:<sharedSystemId>}` forks it and lands the edge on the live copy (first-edit-is-an-edge-edit path); non-member endpoint → 404 `module_instance_node_not_member`; re-POST of the same edge → 200 (idempotent MERGE); `DELETE …/edges` of it → 204, absent → 404**; a non-member `:nodeId` → 404 `module_instance_node_not_member` (C-08); generic PATCH on `BusinessModuleVersion`→409 `model_lifecycle_route_required` (single §2 reading per Deviations Register D-4, N-04); **deleted-anchor hardening (design-review C-09, tasks T-08): generically delete a forked instance's journey anchor → instance read returns the envelope with empty content (no 500), and a model-scoped write to any of its handles → 404 `module_instance_node_not_member`** |
| AC-07 | integration | `api/__tests__/module-upgrade.integration.test.ts` — re-pin M≥N; downgrade→400; missing→404; forked→409; no auto-upgrade |
| AC-08 | integration | `api/__tests__/model-migration.integration.test.ts` — create+scope, idempotent re-run, **re-run after a user model exists still succeeds and adds zero nodes/edges (C-07)**, first-run-with-user-model-and-no-reference-model aborts (guard), `--down` restores counts, **`--down` while a second (non-reference) model exists refuses without `--force`, and with `--force` that model survives with its `IN_MODEL` edges + subgraph intact (requirements rev-4 C-10)**, `--dry-run` leaves `/stats` unchanged |
| AC-09 | integration | `api/__tests__/model-rbac.integration.test.ts` — role+persona seed idempotent; resolves `model:*`/`module:*`; SME unchanged |
| AC-10 | unit + integration | `api/__tests__/model-authz.test.ts` (403 without `model:write`, 201 with; no `public`) + `api/__tests__/model-openapi.integration.test.ts` (routes+codes in openapi) |
| AC-21 | integration | `api/__tests__/model-scope.integration.test.ts` — **two-part isolation proof re-anchored per C-01**: (1) `scopedNodeIds(modelA)` excludes every B-only node and includes shared `System`/`Role`/`Location`; (2) `GET /models/:modelId/module-instances` for model A returns only A's instances/forked nodes, never B's. Both models' domains set up via `POST /models/:id/domains` (C-06 — API-only setup). (No `?model=` query param is asserted — this spec adds none; C-01/D-1.) |
| AC-11, AC-12 | component (jsdom) | `pwa/src/__tests__/model-workspace.test.tsx` — ready state lists seeded models; create POSTs + appears; switch updates+persists |
| AC-13, AC-14, AC-15 | component | `pwa/src/__tests__/model-workspace-states.test.tsx` — loading skeleton, empty, error+retry |
| AC-19 | component | `pwa/src/__tests__/model-placeholder.test.tsx` — six sibling routes render placeholder + context available |
| AC-18 | e2e | `pwa/playwright/model-active-context.spec.ts` — deep link + active model survive reload |
| AC-16 | manual | **two invocations** (requirements rev-4 AC-16 / C-11): `bun run scripts/design-conformance.ts --view pwa/src/views/model/ModelWorkspace.tsx` **and** `… --view pwa/src/views/model/ModelWorkspace.module.css` — expect both exit 0, zero token/component violations (N-01: `--view` mode; tokens resolve against `pwa/src/styles/companygraph/tokens.css`; the bare positional form is inert) |
| AC-17 | manual | keyboard walk of `#/model/models` (Alt+0 jump, Tab order, Enter/Space) |
| AC-20 | manual + CLI | `bun run typecheck` exit 0; `git diff shared/src/schema/nodes.ts` shows no `NODE_LABELS` additions |

Integration tests need Neo4j (`bun test:integration`); unit/component run under
`bun test`.

## 9. Rejected alternatives

- **Lifecycle props inside `attributes_json`** — can't put a uniqueness constraint
  on `ordinal` or filter `version` server-side. Rejected → top-level props +
  dedicated storage (§3, rule 2).
- **Version content as live graph nodes** — reintroduces the C-06 contradiction and
  an unbounded generic-write immutability guard; and copy-on-instantiate would
  break FR-07's "two instances observe identical content". Rejected → serialized
  `snapshot_json` blob (rule 3, journey-versions prior art).
- **Guard inside the generic storage primitives** — would be a `_baseline` FR-03
  contract change. Rejected → route-boundary guard (§4.6) leaves the primitives
  literally untouched.
- **Model-scoped `System`/`Role`/`Location`** — DEC-01 option (b); heavier fork +
  migration (copy every referenced system/role/location) for isolation nobody has
  asked for yet. Rejected per DEC-01 (a); reopenable.
- **`kbd`-field lookup for surf-jump** — cleaner long-term but touches the shared
  handler contract for all surfaces; minimal change is `Alt+0`→index 9. Chose the
  minimal extension (Risk 6).
- **Bare-key `forkLocalKey`** (`a0`, `journey`) — deterministically identical
  across every fork of a version and colliding across modules, leaving post-fork
  resolution ambiguous by construction (B-02). Rejected → the stored value is the
  full instance-qualified synthetic id (§3.4).
- **Descoping the sibling edge route** (B-03 option (b)) — would leave FR-08's
  "first edit is an edge edit" path broken on a non-forked instance and require a
  recorded requirements deviation. Rejected → specified endpoint-addressed
  (`(type, from, to)`, §4.4), which also avoids inventing synthetic *edge* ids
  for id-less snapshot rows.
- **Direct-driver test seeding for model-B domains** (C-06 fallback) — would
  leave "attach a domain to a user model" impossible through the sanctioned API
  and permanently empty user models within this spec. Rejected → minimal
  `POST /api/v1/models/:id/domains` here; richer domain authoring stays with
  `business-model-authoring`.
- **Three-way fork/upgrade reconciliation** — the studio's hardest novel design;
  deferred behind `409 module_instance_forked` for a future `module-reconcile`
  spec (Risk 3, FR-09).
