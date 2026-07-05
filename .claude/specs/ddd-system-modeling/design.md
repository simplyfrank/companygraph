---
feature: "ddd-system-modeling"
created: "2026-07-04"
author: "spec-author"
status: "approved"
revision: 3
reviewing_requirements_revision: 2
size: "large"
---

# Design: ddd-system-modeling

> **Revision 3 (2026-07-04).** Addresses the rev-2 design review
> (`review-design.md`, verdict revise) in full: **B-01** → DD-14 (idempotent
> `BoundedContext` `_OntologyNodeLabel` registration before the `createEdgeType`
> calls — the rev-2 boot-order claim was false; §4.6 corrected); **B-02** →
> DD-15 (the FR-07(a) traversal gains the story-mediated support arm through
> `DESCRIBES_ACTIVITY`, and gap items carry the describing stories — §4.4);
> **C-01** → DD-16 (strict-`scopedNodeIds` `needed-by` validation recorded as a
> deliberate deviation; the AC-06b fixture construction is spelled out in §9);
> **C-02** → DD-17 (generic-edge-surface bypass: accepted risk with defined
> degradation semantics, mirroring `story-spec-core` DD-12); **C-03** → the
> "five PUT routes" miscount corrected to **three** everywhere (DD-11, §4.8,
> §4.9, §5, §8, §9); **C-04** → DD-18 (`orphanSystems` scoped to the model's own
> capabilities — §4.4(c)); **N-01** → §4.8 segment counts corrected (4/5/6, not
> 5/6/7); **N-02** → list-`[]`-vs-create-404 asymmetry pinned in §4.1 + §9;
> **N-03** → the `DELETE …/needed-by` body cites its on-disk precedent in §4.7.
> No existing DD/section ID renumbered; DD-14…DD-18 are additive.
>
> **Revision 2 (2026-07-04).** Traces the approved `requirements.md` rev 2
> (FR-01…FR-15, NFR-01…NFR-07, AC-01…AC-21 + AC-06b). Two review artifacts feed
> this revision: (a) the **fresh cold requirements review** of rev 2
> (`review-requirements.md`, verdict approve) left two design-phase obligations —
> **C-05** (state the true `matchSegments` semantics instead of the FR-11
> overstatement) and **C-06** (PUT has no prior art anywhere in the API — cover
> dispatch, RBAC rows, and OpenAPI emission explicitly) — plus nits
> **N-04/N-05/N-06**; each is resolved in §2 (DD-10, DD-11) and inline.
> (b) The design review of rev 1 (`review-design.md`, verdict approve) deferred
> **C-01/C-02/C-03** and **N-01/N-02** to the tasks phase; rev 2 folds them into
> the design proper (DD-12, DD-13, §3.1, §4.4) so tasks inherit settled
> decisions, not open concerns. No DD was renumbered; DD-01…DD-09 are unchanged
> in substance. Every referenced dependency interface is cited by its real
> on-disk signature (§3.1) — and unlike at rev-1 authoring time, **every**
> dependency file now exists on disk (§1.1).

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
   `PART_OF` reachability so an orphan-sourced capability is never dropped. The
   idempotent mapping writes use **`PUT`** — the codebase's **first** PUT routes;
   DD-11 covers dispatch, RBAC, and OpenAPI emission end-to-end (C-06).
3. **Two read aggregates** — support-gap analysis
   (`GET …/system-model/gaps`, FR-07/FR-08) and the context map
   (`GET …/system-model/context-map`, FR-09) — each a bounded, side-effect-free
   Neo4j read over the model's `CAPABILITY_IN_MODEL` membership plus the model's
   scoped activities (`scopedNodeIds`, consumed from
   `api/src/storage/model-scope.ts`, never re-implemented).
4. The **SystemModeler** view at `#/model/systems` (route verbatim from the
   blueprint View Tree) that **replaces** the `ModelTabPlaceholder`
   `model-workspace-core` registered for the `systems` tab (verified on disk:
   `pwa/src/views/index.tsx:165` renders
   `<ModelTabPlaceholder tab="Systems" spec="ddd-system-modeling" />`), reads the
   active model from the shell-owned `useActiveModel()`, and specs all four view
   states (FR-12…FR-14). `systemKind` badges reuse `SYSTEM_KINDS` /
   `SYSTEM_KIND_LABELS` / catalog `Pill` from `system-augmentation-model`
   (XD-15, NFR-03).

The design follows the same four rules as its dependencies: **registry-only
schema**, **domain state on dedicated storage (not the generic node
primitives)**, **consume `model-workspace-core` / `story-spec-core` / the
bounded-contexts surface (never re-spec)**, **auth via the central router gate
only**.

### 1.1 Build-order dependency — now fully landed (requirements Dependencies)

At rev-1 authoring time several dependency files were absent. **Re-verified at
rev-2 authoring time (2026-07-04): every consumed file now exists on disk** —
`api/src/storage/model-scope.ts` (`scopedNodeIds` / `scopedWhereFragment`),
`api/src/storage/{models,model-lifecycle-guard}.ts`,
`api/src/scripts/register-model-labels.ts`,
`api/src/scripts/register-story-labels.ts` (`story-spec-core` — merged; the
router imports `registerStoryRoutes` at `api/src/router.ts:251`),
`api/src/scripts/seed-rbac-roles.ts` (`business_architect` at line 96),
`pwa/src/context/ActiveModelContext.tsx` (`useActiveModel`),
`pwa/src/views/model/ModelTabPlaceholder.tsx` (+ `ModelWorkspace.tsx`,
`StoryCatalog.tsx`), and `shared/src/schema/system-kind.ts`
(`system-augmentation-model`). **Implementation is unblocked** — no
bind-at-implementation-time seams remain.

## 2. Design decisions & prior-review carry-forwards

DD-01…DD-09 carry from rev 1 (design-review verdict: approve — its verification
of DD-01/02/04/07 against the codebase stands). DD-10…DD-13 are new in rev 2 and
discharge the open review findings. DD-14…DD-18 are new in rev 3 and discharge
the rev-2 design review's B-01/B-02/C-01/C-02/C-04.

| ID | Decision | Where |
|----|----------|-------|
| DD-01 | **`CAPABILITY_IN_MODEL` is this spec's own edge, not an `IN_MODEL` pair (resolves B-01).** Registered via `createEdgeType` in this spec's `register-capability-labels.ts`; written by this spec's own capability-create tx. It is **not** in `model-workspace-core`'s `LIFECYCLE_EDGES` set (verified `model-lifecycle-guard.ts:26`), so the generic `/nodes`/`/edges` lifecycle guard never fires on it, and no coordinated change to `model-workspace-core` is required. The wrong pair (`CAPABILITY_IN_MODEL` from `Activity → BusinessModel`) still returns `400 edge_endpoint_label_mismatch` from the registry-backed validator (§3.3, AC-02). | §3.3, §4.6 |
| DD-02 | **Model membership resolves through `CAPABILITY_IN_MODEL`, never through the `NEEDS_CAPABILITY` source (resolves B-02).** `scopedNodeIds(driver, modelId)` returns only structural ids (`Domain` + `PART_OF*` descendants + `ModuleInstance`s; `System`/`Role`/`Location` excluded — verified `model-scope.ts:22-47`). A `Capability` id is **never** in that set. Every capability list/detail/gap/context-map read matches `(cap:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id:$modelId})` as the membership predicate. `scopedNodeIds` is consumed only to (a) **validate** a `needed-by` mapping target belongs to the model (FR-05) and (b) enumerate the model's activities for the gap analysis (FR-07). This keeps a capability whose only source is an orphan activity (outside `scopedNodeIds`) visible (AC-06b). | §3.4, §4.1–4.5 |
| DD-03 | **Capability domain fields are the standard node envelope only; no bespoke top-level props.** Unlike `story-spec-core` (which needed `ORDER BY ordinal` / `WHERE derived`), a `Capability` carries only `name`/`description`/`attributes` — no queryable extra field is required (the analysis joins on edges, not capability properties). So capabilities store via a dedicated `api/src/storage/capabilities.ts` that writes the envelope + wires `CAPABILITY_IN_MODEL` in one tx; the generic `createNode`/`patchNode` primitives (`api/src/storage/nodes.ts`) stay **byte-for-byte unchanged** (they cannot write `CAPABILITY_IN_MODEL` atomically nor run the membership check). `attributes` is stored as `attributes_json` per the envelope. | §3.2, §4.2 |
| DD-04 | **`NEEDS_CAPABILITY` is ONE edge type with TWO endpoint pairs (resolves requirements N-02).** `createEdgeType` accepts a multi-pair `endpoints` array (verified `edge-types.ts:185` — `createEndpointRows` writes one `_OntologyEdgeEndpoint` row per pair; graph-core `PART_OF` already carries 3 pairs). So `NEEDS_CAPABILITY` registers `[{Activity,Capability},{UserStory,Capability}]` — one type, both an activity and a story may point at the same capability. **Not** split into `ACTIVITY_NEEDS_CAPABILITY` / `STORY_NEEDS_CAPABILITY`; ACs are written to the one-type default. | §3.3 |
| DD-05 | **Gap analysis / context map live in a sibling `api/src/storage/system-model.ts` (resolves requirements N-01).** Writes (capability CRUD + mapping edges) live in `api/src/storage/capabilities.ts`; the two read aggregates (bounded-round-trip Cypher, no writes) live in `system-model.ts`. Keeps the write module small and the read module purely analytical (mirrors the `stories.ts` write / `story-derive.ts` compute split in `story-spec-core`). | §4.4, §4.5, §8 |
| DD-06 | **Mapping idempotency via `MERGE`, not a duplicate check (FR-03).** The many-to-many `NEEDS_CAPABILITY` / `SUPPORTED_BY` `PUT`s use `MERGE (from)-[:TYPE]->(to)` so a repeat is a no-op (not a `409`) — matching FR-03's "duplicate `(from,to)` map is idempotent". `MERGE` runs **after** the registry endpoint-label validation (DD-12; a wrong pair still 400s). `ASSIGNED_TO_CONTEXT` (at-most-one) deletes any prior edge then creates in one tx; `CAPABILITY_IN_MODEL` (exactly-one) is written once at create and never re-`PUT`. No new graph uniqueness constraint is created (FR-03). | §4.3 |
| DD-07 | **Context-relationship identity resolves to `id` via this spec's own read (resolves C-01 of the requirements review pass 1).** The existing `GET /api/v1/ontology/bounded-contexts` route emits inter-context relationships as `{ type, target: other.name }` (**verified** `api/src/routes/ontology-bounded-contexts.ts:22` — name-keyed, display-only). This spec does **not** reuse that shape; `system-model.ts`'s context-map read matches `(bc)-[r:UPSTREAM_OF|DOWNSTREAM_OF]->(other:BoundedContext)` and returns `{ type: type(r), targetId: other.id, targetName: other.name }` so the view deep-links (AC-08). It reads the bounded-contexts surface for the context nodes; it does **not** create/edit contexts or relationships (NFR-04). | §4.5 |
| DD-08 | **No `?model=` query param (consistency with `model-workspace-core` D-1).** Every capability / system-model read is scoped by the `:modelId` **path** param, never a query param. Isolation is proven by the `CAPABILITY_IN_MODEL` membership predicate (§4.1) + the two-model integration test (AC-09). | §4.1, §5 |
| DD-09 | **FR-08 dual-path support uses `USES_SYSTEM` read-only.** The gap analysis counts an activity supported if it reaches a system via `NEEDS_CAPABILITY→SUPPORTED_BY` **or** a direct graph-core `USES_SYSTEM` (verified edge type, read never written here); an activity supported only by raw `USES_SYSTEM` is surfaced in the distinct `capabilityGaps` category. This spec never writes/deletes `USES_SYSTEM` (graph-core owns it, requirements Scope). | §4.4 |
| DD-10 | **Route-permission ordering is convention/forward-proofing, not correctness — the matcher disambiguates on segment count first (Resolves: C-05, requirements review of rev 2).** Verified: `matchSegments` (`api/src/auth/rbac-permissions.ts:326`) returns `false` immediately when `pattern.length !== path.length`, and its own house comment (line 258-260) says ordering "only bites same-length literal-vs-param rows — kept as forward-proofing". For this route set, no two rows of equal segment count can shadow each other (§4.8 proof), so **FR-11's claim that a mis-ordered row "would let a sub-route resolve to the wrong permission" is an overstatement for these routes** — recorded here so no task wastes effort proving a precedence the matcher makes moot. The FR-11 enumerated order is still adopted verbatim (house convention + forward-proofing against future same-length rows), and AC-09's assertion stays (it passes either way). The **actually** load-bearing property is the SECURITY-CRITICAL one documented at `rbac-permissions.ts:260-263`: an **unmapped** route returns `null` from `getRoutePermission` and the router then **skips the RBAC check entirely** — so the real obligation is *every new route has a row*, which §4.8's list satisfies and `capability-authz.test.ts` asserts per-route. | §4.8 |
| DD-11 | **`PUT` is adopted for the idempotent mapping writes and is covered end-to-end — these are the codebase's first PUT routes (Resolves: C-06, requirements review of rev 2).** Verified at all three layers: (1) **Dispatch** — the router is method-generic: `const method = req.method.toUpperCase()` (`api/src/router.ts:263`) flows into `dispatch`/`dispatchInternal` and every route matches with a plain `method === "…"` string compare; there is no method whitelist to extend. The capability delegate (§4.7) matches `method === "PUT"` exactly like the existing `"PATCH"` arms. (2) **RBAC** — `getRoutePermission` compares `rp.method === upperMethod` as a plain string (`rbac-permissions.ts:339-348`), so `P("PUT", …)` rows work unchanged; §4.8 lists all **three** (`needed-by`, `supported-by`, `context` — count corrected per design-review C-03). (3) **OpenAPI** — the generator is `@asteasolutions/zod-to-openapi` and its `RouteConfig` `Method` union **includes `'put'`** (verified `api/node_modules/@asteasolutions/zod-to-openapi/dist/openapi-registry.d.ts:21`), so `registry.registerPath({ method: "put", … })` emits `put` operations; AC-09's openapi test additionally asserts a `put` operation is present for `…/needed-by`. `PUT` is kept (not switched to POST) because the mapping writes are genuinely idempotent (`MERGE`, DD-06) — PUT's semantics are the honest contract. Because there is **no PUT prior art**, the integration tests exercise PUT dispatch explicitly (AC-04) rather than assuming parity with PATCH. | §4.7, §4.8, §4.9, §9 |
| DD-12 | **MERGE-path endpoint validation calls the exported `getEdgeEndpoints`, not the private `validateEdge` (folds design-review C-01).** `validateEdge` (`api/src/storage/edges.ts:38`) is module-private and `edges.ts` is out of scope ("Not edited"). The exported primitive `validateEdge` itself uses is `getEdgeEndpoints(type, driver)` (`api/src/ontology/cache/edge-endpoints.ts:53`, imported by `edges.ts:8`, returns `ReadonlyArray<readonly [string, string]>`). `capabilities.ts` imports `getEdgeEndpoints` directly, compares the returned pair list against `(fromLabel, toLabel)` before each `MERGE`, and throws `edge_endpoint_label_mismatch` (400) on a miss. `validateEdge` is **not** exported; `edges.ts` is **not** edited. | §3.1, §4.3 |
| DD-13 | **"Detached" is a defensively-rendered read-model field, constructible in tests (folds design-review C-02).** A Neo4j relationship cannot outlive either endpoint (`DETACH DELETE` removes it), so a literally dangling edge is unconstructible for graph-core-deletable nodes; "detached" covers a far-end node whose **expected label no longer matches** (id reuse, partial import). `getCapability` computes `detached: {kind:"needed-by"|"supported-by"|"context", targetId}[]` via `OPTIONAL MATCH` label checks (§4.6). **Testability:** the storage-level integration test constructs the state with a direct-driver `REMOVE n:BoundedContext` on a fixture context (the one sanctioned direct-driver write, test-only) and asserts `detached[]` is non-empty; the AC-13 **component** test asserts the indicator renders when fed a stub response with non-empty `detached[]` — decoupling the UI assertion from constructing a live dangling edge. | §4.6, §9 |

| DD-14 | **`registerCapabilitySchema` ensures the `BoundedContext` `_OntologyNodeLabel` row before any `createEdgeType` call (Resolves: B-01, design review of rev 2).** Rev 2's boot-order claim was **false**: `BoundedContext` is *not* a registered ontology label anywhere in the codebase — `assertEndpointLabelsExist` (`api/src/ontology/storage/edge-types.ts:150`) requires every endpoint label to exist as an `_OntologyNodeLabel` row (else `type_pair_violation`); the registry is seeded from the compile-time `NODE_LABELS` (18 entries, no `BoundedContext`); and `seedBoundedContexts` (`api/src/ontology/seed.ts:63`) MERGEs only the **data** nodes (`MERGE (bc:BoundedContext {id:$id})`), never a registry row. As rev-2-designed, the third `createEdgeType` (`ASSIGNED_TO_CONTEXT`) would throw at boot. Fix: `registerCapabilitySchema`'s **first** step is `createNodeLabel("BoundedContext", { json_schema_doc: {} })` (permissive), swallowing `409 name_conflict` exactly like every other registration — idempotent, same pattern `register-story-labels.ts` uses for `UserStory`. **Observable consequence:** `BoundedContext` now appears in `GET /api/v1/schema` — an **additive** registry change. **NFR-04-compatible:** NFR-04's read-only rule covers the bounded-contexts *data* surface (no context node or `UPSTREAM_OF`/`DOWNSTREAM_OF` relationship is created/edited); an `_OntologyNodeLabel` registry row is ontology metadata written through the sanctioned `createNodeLabel` primitive, touching zero context data. AC-01/AC-02's integration tests run against a **fresh registry** so the full registration order (ensure `BoundedContext` → 4 × `createEdgeType`) is proven end-to-end (§9). | §4.6, §9 |
| DD-15 | **The FR-07(a) support traversal includes the story-mediated capability path (Resolves: B-02, design review of rev 2).** FR-07(a) defines unsupported steps as model-scoped `Activity`s "(and the `UserStory`s that describe them)" that reach no `System` via **any** `NEEDS_CAPABILITY → SUPPORTED_BY` path — and DD-04 registers `UserStory → Capability` precisely so a story can carry the capability need. Rev 2's query (a) counted only the direct `(a)-[:NEEDS_CAPABILITY]->…` arm, misclassifying an activity whose support is modeled through its describing story (`(a)<-[:DESCRIBES_ACTIVITY]-(:UserStory)-[:NEEDS_CAPABILITY]->(:Capability)-[:SUPPORTED_BY]->(:System)`) into `unsupportedSteps`/`capabilityGaps` — a false gap. Fix: §4.4 query (a) gains the story arm (one extra `OPTIONAL MATCH`; direction verified — `register-story-labels.ts:5` registers `DESCRIBES_ACTIVITY` as `UserStory → Activity`), an activity is capability-supported iff **either** arm reaches a system, and every `unsupportedSteps`/`capabilityGaps` item carries `describingStories: {id,name}[]` (FR-07's "ids/names needed to deep-link" — the parenthetical stories are now in the payload). The AC-06 fixture adds activity **W**: supported *only* via its story's `NEEDS_CAPABILITY` → must **not** be flagged (§9). | §4.4, §9 |
| DD-16 | **`needed-by` target validation is strictly `scopedNodeIds` — a deliberate, recorded deviation from the FR-06 mechanism note's orphan clause (Resolves: C-01, design review of rev 2).** The mechanism note admits a `needed-by` activity target "∈ `scopedNodeIds(modelId)` **or**, for an orphan activity, one reachable from `:modelId` by the story-spec join" — but that clause is circular: the story-spec join itself resolves through the story's `DESCRIBES_ACTIVITY` activity, which for an orphan activity is *also* outside `scopedNodeIds`, so the "or" arm has no well-defined resolution and would open a cross-model mapping hole. §4.3 therefore adopts the strict first arm only: an orphan activity (or a story whose described activity is orphaned) is `404 not_found` on `PUT …/needed-by`. **The AC-06b state remains constructible and legitimate**: the mapping is written while the activity is scoped, and the activity is orphaned *afterwards* (delete its `PART_OF` edge via the generic graph-core edge surface) — existing edges to since-orphaned activities stay valid and the capability stays visible via `CAPABILITY_IN_MODEL` (DD-02). The exact fixture recipe is spelled in §9 (AC-06b). | §4.3, §9 |
| DD-17 | **Generic-edge-surface bypass: accepted risk with defined degradation semantics (Resolves: C-02, design review of rev 2; mirrors `story-spec-core` DD-12).** All four new types are ordinary registered edges — none is in `LIFECYCLE_EDGES` (deliberate, DD-01) — so `POST /api/v1/edges` can violate the FR-03 cardinalities: a second `CAPABILITY_IN_MODEL`, a second `ASSIGNED_TO_CONTEXT`, or a cross-model `NEEDS_CAPABILITY`. A per-type write guard on the generic surface is a graph-core contract change, out of scope; recorded as a future-guard candidate. Mitigation is **graceful degradation, not corruption**: (i) a duplicate `CAPABILITY_IN_MODEL` to the *same* model collapses in every read (§4.1 aggregates group per `cap`; counts are `DISTINCT`); (ii) a rogue second `CAPABILITY_IN_MODEL` to *another* model surfaces the capability in **both** models' lists/analyses — the honest reading of an already-invalid graph (each read resolves its own membership edge; no first-edge-wins arbitration), exactly `story-spec-core` DD-12's posture; (iii) multiple `ASSIGNED_TO_CONTEXT` edges: list/detail reads report one deterministic context (first by `bc.name`, §4.1), and the state **self-heals** — `setContext`'s replace tx deletes **all** prior `ASSIGNED_TO_CONTEXT` edges (§4.3); (iv) a forged cross-model `NEEDS_CAPABILITY` appears in the capability's `neededBy` detail (visible, diagnosable) but never affects membership or list isolation (membership rides `CAPABILITY_IN_MODEL`, DD-02). AC-09 asserts isolation for graphs written through this spec's routes. | §3.3, §4.1, §4.3 |
| DD-18 | **`orphanSystems` is scoped to the model's own capabilities (Resolves: C-04, design review of rev 2).** Rev 2's query (c) used a global `WHERE NOT (:Capability)-[:SUPPORTED_BY]->(sys)` — so a system used by model A's activities but capability-mapped only in model B was *not* reported as A's orphan, making A's gap analysis silently depend on B's modeling. That cuts against NFR-02's per-model framing and FR-07(c)'s intent ("a system used at a step with no capability layer above it" — in *this* model). Fix: the no-capability check resolves through the model's `CAPABILITY_IN_MODEL` membership (`WHERE NOT EXISTS { MATCH (c:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id:$modelId}), (c)-[:SUPPORTED_BY]->(sys) }`, §4.4(c)). A shared system therefore appears as an orphan in every model that uses it without its own capability layer — consistent with "systems are global" (requirements Risk 5, §3.4). The AC-06 fixture adds the cross-model case: S stays in model A's `orphanSystems` even after model B maps a capability to S (§9). | §4.4, §9 |

**Nit dispositions (requirements review of rev 2 + design review of rev 1):**

- **N-04 (no duplicate error code):** verified by grep across `api/src/errors.ts`
  and every sibling spec's `requirements.md`/`design.md` — **no** other spec or
  enum entry declares `system_not_found`, `capability_not_found`, or
  `bounded_context_not_found`. All three are genuinely additive (§3.5).
- **N-05 (BoundedContext existence check):** there is no single-context lookup
  route to lean on (only the list route exists); `setContext` runs a direct
  `MATCH (:BoundedContext {id:$id})` read — a read, permitted under NFR-04
  (§4.3).
- **N-06 (real reachability-test path):** the walk-every-code assertion lives in
  `api/__tests__/ontology-envelope.test.ts` (line 29: "Walk every code…") — **not**
  a non-existent `envelope.test.ts`. §3.5 and §9 cite the real file.
- **Design-review N-01 (orphanSystems arm):** FR-07(c)'s
  "capabilities-**or**-activities" phrasing — the capability arm is **vacuous**
  for the orphan definition: a system reached through `SUPPORTED_BY` *is* mapped
  to a capability and can never be an orphan, so the activities-only traversal
  in §4.4 is complete, not a missing branch.
- **Design-review N-02 (mix bucket key):** the defensive bucket for a
  missing/invalid `systemKind` is keyed **`"unknown"`** — present in
  `gapsResultSchema` and read by the PWA render, so server and view agree
  (§4.4, no AC asserts it; defensive only).
- **Design-review C-03 (§3.1 hygiene):** the consumed-interfaces table now
  lists **imports only**; symbols edited in place are split into their own
  table (§3.1).

## 3. Data model

The `Capability` label + all four edges register at boot via `createNodeLabel` /
`createEdgeType` (§4.6). Registry attribute schemas are **permissive**
(`json_schema_doc: {}`) — the capability shape is the plain node envelope (DD-03).
REST-boundary zod schemas live in a new `shared/src/schema/ddd-system.ts`.

### 3.1 Dependency interfaces consumed (verified signatures)

**Imported (consume-only — this spec never edits these files):**

| Symbol | File (verified) | Signature used |
|--------|-----------------|----------------|
| `scopedNodeIds` | `api/src/storage/model-scope.ts` | `(driver, modelId) => Promise<Set<string>>` — structural ids only |
| `createNodeLabel` | `api/src/ontology/storage/node-labels.ts` | strict CREATE; `409 name_conflict` on dup (swallowed for idempotency) |
| `createEdgeType` | `api/src/ontology/storage/edge-types.ts` | strict CREATE; multi-pair `endpoints`; `assertEndpointLabelsExist` pre-check; `409 name_conflict` on dup |
| `getEdgeEndpoints` | `api/src/ontology/cache/edge-endpoints.ts:53` | `(type, driver) => Promise<ReadonlyArray<readonly [string, string]>>` — the MERGE-path endpoint check (DD-12) |
| `SYSTEM_KINDS` / `SYSTEM_KIND_LABELS` / `systemKindSchema` | `shared/src/schema/system-kind.ts` | augmentation vocabulary (XD-15) |
| `LIFECYCLE_EDGES` | `api/src/storage/model-lifecycle-guard.ts:26` | proves `CAPABILITY_IN_MODEL` is **not** a lifecycle edge (DD-01) |
| `ok`/`noContent`/`error`/`parseWith`/`fromValidationError` | `api/src/routes/_helpers.ts` | route envelope helpers |
| `useActiveModel` | `pwa/src/context/ActiveModelContext.tsx` | shell-owned active model (FR-12/FR-14) |

**Edited in place (module internals of files in the §8 File Changes table —
not importable interfaces; folds design-review C-03):**

| Symbol | File | Edit |
|--------|------|------|
| `ROUTE_PERMISSIONS` + `P(...)` (module-private) | `api/src/auth/rbac-permissions.ts` | +13 rows (§4.8). `getRoutePermission` stays a consumed export used by the router — unchanged. |
| `ERROR_CODES` | `api/src/errors.ts` | +3 additive codes (§3.5) |
| role permission arrays | `api/src/scripts/seed-rbac-roles.ts` | `business_architect` (line 96) gains `capability:read`/`capability:write` |

### 3.2 `Capability` (FR-01, DD-03)

Standard node envelope only: `id` (UUIDv7 server-generated), `name`,
`description`, `createdAt`, `updatedAt`, open `attributes_json`. A `Capability` is
a **business capability** — a cohesive ability the business must have (e.g. "Price
a product", "Allocate stock to a store"). `zod` (`shared/src/schema/ddd-system.ts`):

- `capabilityCreateSchema` — `{ name: z.string().min(1), description: z.string().optional(), attributes: z.record(z.unknown()).optional() }`.
- `capabilityPatchSchema` — `{ name?: z.string().min(1), description?: z.string(), attributes?: z.record(z.unknown()) }` (omitted → unchanged; mirrors `patchNode`).
- `capabilityReadSchema` — envelope **plus** derived read fields:
  - list row: `neededByCount:int` (distinct `NEEDS_CAPABILITY` sources), `supportingSystemCount:int`, `assignedContextId:string|null`, `assignedContextName:string|null`.
  - detail: `neededBy: {kind:"activity"|"story", id, name}[]`, `supportedBy: {id, name, systemKind: SystemKind}[]`, `assignedContext: {id, name, domain, subdomain}|null`, and `detached: {kind:"needed-by"|"supported-by"|"context", targetId}[]` (FR-06/FR-13, DD-13).

### 3.3 Edges (FR-02, DD-01, DD-04) — registered via `createEdgeType`

| Edge | Endpoint pair(s) (`_OntologyEdgeEndpoint`) | Cardinality | Meaning |
|------|--------------------------------------------|-------------|---------|
| `NEEDS_CAPABILITY` | `Activity → Capability` **and** `UserStory → Capability` (two pairs, one type — DD-04) | many-to-many (FR-03) | the step/story needs this capability |
| `SUPPORTED_BY` | `Capability → System` | many-to-many (FR-03) | the capability is supported by this system |
| `ASSIGNED_TO_CONTEXT` | `Capability → BoundedContext` | at most one per capability (FR-03) | the capability lives in this bounded context |
| `CAPABILITY_IN_MODEL` | `Capability → BusinessModel` | **exactly one** per capability (FR-03) | this spec's own model-membership edge (B-01/DD-01) |

Endpoint pairs are written as `_OntologyEdgeEndpoint` rows by `createEdgeType`
(verified `createEndpointRows`); the registry-backed validator enforces them and
returns `400 edge_endpoint_label_mismatch` on a wrong pair (AC-02). The frozen
`EDGE_ENDPOINTS` const is not edited (NFR-01, AC-21).

> **Direct `createEdge` vs. bespoke Cypher.** `NEEDS_CAPABILITY`,
> `SUPPORTED_BY`, and `ASSIGNED_TO_CONTEXT` are ordinary graph edges (no lifecycle
> state). `CAPABILITY_IN_MODEL` is likewise ordinary — it is **not** in
> `LIFECYCLE_EDGES` (DD-01), so no `model_lifecycle_route_required` guard fires.
> The **create tx** wires `CAPABILITY_IN_MODEL` inside `capabilities.ts` via
> parameterized Cypher (so the capability node + its membership edge are one
> atomic write, DD-03); the mapping `PUT`s use `MERGE` (DD-06) — both after the
> `getEdgeEndpoints` endpoint-label check (DD-12, §4.3).

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
  models — the **strict** arm only; the mechanism note's orphan "or…" clause is
  deliberately not implemented (DD-16).

`System` and `BoundedContext` are **global** (not model-scoped) — the same
system/context may be `SUPPORTED_BY`/`ASSIGNED_TO_CONTEXT` from capabilities in
several models; that is intended (shared infrastructure, requirements Risk 5).

### 3.5 Error codes (FR-10) — additive to the closed `ERROR_CODES`

Added to `ERROR_CODES` (`api/src/errors.ts`), all additive/non-breaking (NFR-11).
**N-04 discharged:** grep across `api/src/errors.ts` + every sibling spec's
requirements/design shows none of the three new codes exists anywhere — no
duplicate enum entry can trip the exhaustiveness assertion.

| Code | HTTP | Thrown from | Reuse note |
|------|------|-------------|------------|
| `capability_not_found` | 404 | capability detail/patch/delete; mapping routes when `:capabilityId` is absent or not in `:modelId` | new |
| `bounded_context_not_found` | 404 | `PUT …/context` when `boundedContextId` is not a `BoundedContext` | new |
| `system_not_found` | 404 | `PUT …/supported-by` when `systemId` is not a `System` | new |
| `model_not_found` | 404 | FR-04 create when `:modelId` is not a `BusinessModel` | **reused** (`model-workspace-core`) — not re-added |
| `not_found` (existing) | 404 | `needed-by` when `activityId`/`storyId` is not an `Activity`/`UserStory` in the model | **reused**; details carry `{field}` |
| `edge_endpoint_label_mismatch` (existing) | 400 | wrong endpoint pair | **reused** (registry validator / DD-12 check) |

Only **reachable** codes are added — the three new codes are each reachable from
≥1 route, exercised by AC-04/AC-09, and walked by the reachability assertion in
**`api/__tests__/ontology-envelope.test.ts`** (line 29 "Walk every code…" — the
real file; N-06). Codes already in the enum are **reused, not duplicated** (FR-10).

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
       collect(DISTINCT {id: bc.id, name: bc.name}) AS contexts
ORDER BY cap.createdAt ASC
```

JS-side, `contexts` is filtered of its `{id:null,…}` miss row and mapped to
`assignedContextId`/`assignedContextName` via sort-by-name-take-first — so the
list emits **one row per capability id** with a deterministic context even under
a DD-17 cardinality violation (the well-formed zero-or-one case is unaffected).

The membership `MATCH` is the sole model filter — no `scopedNodeIds` join, so an
orphan-sourced capability lists correctly (AC-06b). A `:modelId` that resolves to
no `BusinessModel` returns `[]` for the list (the FR-04 create path checks
existence explicitly and 404s; reads simply return empty). **This
list-`[]`-vs-create-404 asymmetry is deliberate and pinned** (design-review
N-02): FR-04 mandates only the create-side `model_not_found`, and
`story-spec-core` pinned the identical asymmetry for its list route — the
AC-03 integration test asserts both sides so a future change cannot silently
"fix" the list to 404 (§9). Under aggregation the list emits **one row per
capability id** even if a rogue duplicate `CAPABILITY_IN_MODEL` edge exists
(DD-17 — grouping per `cap`, `DISTINCT` counts, deterministic first-by-name
context). `scopedNodeIds` is
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
  and `detached` (§4.6 / DD-13).
- `patchCapability(driver, modelId, capabilityId, patch)` — membership check;
  dynamic SET of supplied `name`/`description`/`attributes`; omitted fields
  untouched (mirrors `patchNode`); `SET cap.updatedAt=$now`. → `200`.
- `deleteCapability(driver, modelId, capabilityId)` — membership check, then the
  single-transaction cascade (§4.4). → `204`.

### 4.3 Mapping edge routes (FR-05, FR-03, DD-06, DD-12)

`api/src/storage/capabilities.ts` — each validates the capability is in `:modelId`
first (`404 capability_not_found`), then the far-end node, then writes:

- `addNeededBy(driver, modelId, capabilityId, {activityId?, storyId?})` — exactly
  one of `activityId`/`storyId` required (zod refine). Validate the referenced
  `Activity`/`UserStory` belongs to the model: an `Activity` ∈
  `scopedNodeIds(modelId)`; a `UserStory` whose `DESCRIBES_ACTIVITY` activity ∈
  `scopedNodeIds(modelId)` (consumes `story-spec-core`'s join, does not
  re-implement). Miss → `404 not_found` (`details.field:"activityId"|"storyId"`).
  **Strict arm only** — an orphan activity (or a story describing one) is
  `404 not_found` at `PUT` time; the mechanism note's orphan "or…" clause is a
  recorded, deliberate deviation (DD-16 — the AC-06b state is constructed by
  orphaning *after* mapping, §9).
  Then `MERGE (src)-[:NEEDS_CAPABILITY]->(cap)` — idempotent (DD-06). → `200`.
- `removeNeededBy(driver, modelId, capabilityId, {activityId?|storyId?})` —
  `MATCH (src {id:$srcId})-[r:NEEDS_CAPABILITY]->(cap {id:$capabilityId}) DELETE r`. → `204`.
  The JSON body on this `DELETE` follows the on-disk precedent
  `DELETE models/:modelId/module-instances/:instanceId/edges` (body-carrying,
  per `rbac-permissions.ts`) — kept because the source is a two-field
  discriminated union (`activityId`|`storyId`) that does not path-encode
  cleanly, unlike `…/supported-by/:systemId` (design-review N-03; deliberate).
- `addSupportedBy(driver, modelId, capabilityId, {systemId})` — verify
  `(:System {id:$systemId})` exists (else `404 system_not_found`); `MERGE (cap)-[:SUPPORTED_BY]->(sys)`
  — idempotent. → `200`.
- `removeSupportedBy(driver, modelId, capabilityId, systemId)` —
  `MATCH (cap {id:$capabilityId})-[r:SUPPORTED_BY]->(:System {id:$systemId}) DELETE r`. → `204`.
- `setContext(driver, modelId, capabilityId, {boundedContextId})` — verify the
  context exists via a direct `MATCH (:BoundedContext {id:$boundedContextId})`
  read (N-05 — there is no single-context lookup route; a read is permitted under
  NFR-04); else `404 bounded_context_not_found`. Then **replace** in one tx
  (at-most-one, FR-03):
  `MATCH (cap {id:$capabilityId}) OPTIONAL MATCH (cap)-[old:ASSIGNED_TO_CONTEXT]->() DELETE old WITH cap MATCH (bc:BoundedContext {id:$boundedContextId}) MERGE (cap)-[:ASSIGNED_TO_CONTEXT]->(bc)`. → `200`.
- `clearContext(driver, modelId, capabilityId)` —
  `MATCH (cap {id:$capabilityId})-[r:ASSIGNED_TO_CONTEXT]->() DELETE r`. → `204`.

**Endpoint validation for `MERGE` paths (DD-12).** Because `MERGE`-based writes
bypass the `createEdge` whitelist, `capabilities.ts` imports the **exported**
`getEdgeEndpoints(type, driver)` (`api/src/ontology/cache/edge-endpoints.ts:53` —
the same primitive the private `validateEdge` uses) and asserts
`(fromLabel, toLabel)` is in the returned pair list before each `MERGE`; a forged
wrong pair returns `400 edge_endpoint_label_mismatch` (AC-02/AC-04).
`api/src/storage/edges.ts` is **not** edited; `validateEdge` stays private.

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
unresolved mapping renders the "detached" indicator (§4.6/DD-13), not
auto-reconciled.

**Support-gap analysis (FR-07, FR-08, DD-09)** — `api/src/storage/system-model.ts`
`computeGaps(driver, modelId)`. Precompute `scopedActivityIds =
[...scopedNodeIds(driver, modelId)]` (JS-side; the set contains only structural
ids — the `MATCH (a:Activity) WHERE a.id IN $scopedActivityIds` naturally
restricts to activities). Returns the four categories in a **bounded** set of
reads (no per-capability N+1, NFR-07):

```cypher
// (a) unsupportedSteps + (FR-08) capabilityGaps — one pass over model activities.
//     BOTH capability arms count (DD-15): direct activity-need AND the
//     story-mediated need through the describing story.
MATCH (a:Activity) WHERE a.id IN $scopedActivityIds
OPTIONAL MATCH (a)-[:NEEDS_CAPABILITY]->(:Capability)-[:SUPPORTED_BY]->(capSys:System)
OPTIONAL MATCH (a)<-[:DESCRIBES_ACTIVITY]-(:UserStory)
               -[:NEEDS_CAPABILITY]->(:Capability)-[:SUPPORTED_BY]->(storySys:System)
OPTIONAL MATCH (a)-[:USES_SYSTEM]->(directSys:System)
OPTIONAL MATCH (a)<-[:DESCRIBES_ACTIVITY]-(story:UserStory)
WITH a,
     count(DISTINCT capSys)    AS activityPathSystems,
     count(DISTINCT storySys)  AS storyPathSystems,
     count(DISTINCT directSys) AS directSystems,
     collect(DISTINCT {id: story.id, name: story.name}) AS describingStories
RETURN a.id AS activityId, a.name AS activityName,
       activityPathSystems + storyPathSystems AS capPathSystems,
       directSystems, describingStories
```

(`DESCRIBES_ACTIVITY` direction verified: `UserStory → Activity`,
`register-story-labels.ts:5`; the `describingStories` miss row `{id:null,…}` is
filtered JS-side, same as the §4.5 relationships note.)

Post-classify each activity (DD-09 / FR-08 / DD-15):
- `capPathSystems = 0 AND directSystems = 0` → **`unsupportedSteps`** (Z in AC-06).
- `capPathSystems = 0 AND directSystems > 0` → **`capabilityGaps`** (Y — supported
  via raw `USES_SYSTEM` but unmodeled through a capability).
- `capPathSystems > 0` → supported, not flagged (X; **and W**, whose only support
  is story-mediated — DD-15).

Each `unsupportedSteps`/`capabilityGaps` item carries
`{activityId, activityName, describingStories: {id,name}[]}` — FR-07(a)'s
"(and the `UserStory`s that describe them)" is in the payload, deep-linkable
(DD-15; `gapsResultSchema` includes `describingStories`).

```cypher
// (b) capabilitiesWithoutSystem — model-scoped capabilities with zero SUPPORTED_BY
MATCH (cap:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id:$modelId})
WHERE NOT (cap)-[:SUPPORTED_BY]->(:System)
RETURN cap.id AS capabilityId, cap.name AS name

// (c) orphanSystems — Systems reached by this model's activities but mapped
//     to NO capability OF THIS MODEL (DD-18 — per-model check, not global)
MATCH (a:Activity) WHERE a.id IN $scopedActivityIds
MATCH (a)-[:USES_SYSTEM]->(sys:System)
WHERE NOT EXISTS {
  MATCH (c:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id:$modelId}),
        (c)-[:SUPPORTED_BY]->(sys)
}
RETURN DISTINCT sys.id AS systemId, sys.name AS name
```

> **FR-07(c) wording note (design-review N-01 + DD-18).** FR-07(c) says
> "capabilities-**or**-activities"; the capability arm is **vacuous** — a system
> reached through a *model-scoped* capability's `SUPPORTED_BY` is by definition
> mapped to one of this model's capabilities and fails the DD-18 `NOT EXISTS`
> check. The activities-only traversal is therefore the complete implementation,
> not a missing branch. Under DD-18 the check is **per-model**: a system
> capability-mapped only in model B is still model A's orphan (verified by the
> AC-06 cross-model case, §9).

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
(pre-migration edge case) is counted under the **`unknown`** bucket key
(design-review N-02 — the key is fixed here so `gapsResultSchema` and the PWA
render agree; defensive only, no AC asserts it), not silently dropped.

`computeGaps` returns `{ unsupportedSteps[], capabilityGaps[], capabilitiesWithoutSystem[], orphanSystems[], augmentationMix: { perCapability[], model: {...} } }`,
each item carrying the ids/names needed to deep-link (FR-07). Deterministic,
side-effect-free.

### 4.5 Context map (FR-09, DD-07)

`api/src/storage/system-model.ts` `computeContextMap(driver, modelId)` — a bounded
read joining the model's assigned capabilities to the existing bounded-contexts
surface, resolving inter-context relationships to **`id`** (DD-07):

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

### 4.6 Label + edge registration + detached computation (FR-01–02, FR-06, NFR-01, DD-13)

`api/src/scripts/register-capability-labels.ts` exports
`registerCapabilitySchema(driver)`, in strict order (DD-14):

1. `createNodeLabel("BoundedContext", { json_schema_doc: {} })` — **ensures the
   `_OntologyNodeLabel` row that does not exist anywhere today** (Resolves: B-01;
   `NODE_LABELS` has no `BoundedContext` entry and `seedBoundedContexts` writes
   only data nodes — DD-14). Additive: `BoundedContext` now appears in
   `GET /api/v1/schema`; NFR-04-compatible (registry metadata only, zero context
   data touched).
2. `createNodeLabel("Capability", { json_schema_doc: {} })` (permissive, DD-03).
3. Four `createEdgeType` calls (`NEEDS_CAPABILITY` with its **two** endpoint
   pairs — DD-04 —, `SUPPORTED_BY`, `ASSIGNED_TO_CONTEXT`,
   `CAPABILITY_IN_MODEL` with their §3.3 pairs).

Every call is wrapped so a `409 name_conflict` (already-registered) is swallowed
→ **idempotent** (mirrors `register-model-labels.ts` `isNameConflict`). Invoked
(a) from `applySchema` in `api/src/neo4j/bootstrap.ts` **after**
`registerModelSchema` (so `BusinessModel` exists for the `CAPABILITY_IN_MODEL`
endpoint) and after `registerStorySchema` (so `UserStory` exists for the second
`NEEDS_CAPABILITY` pair) — `createEdgeType` calls `assertEndpointLabelsExist`,
so the endpoint labels must pre-exist; and (b) standalone via
`bun run register:capability`.

**Boot ordering (corrected — Resolves: B-01).** `createEdgeType`'s
`assertEndpointLabelsExist` (`edge-types.ts:150`) requires every endpoint label
to exist as an `_OntologyNodeLabel` row, else `type_pair_violation`. At
`registerCapabilitySchema` time the rows exist for `Activity`/`System` (seeded
from `NODE_LABELS` via `seedRegistryFromConstTuples`), `UserStory`
(`registerStorySchema`), and `BusinessModel` (`registerModelSchema`) — but
**not** for `BoundedContext` (rev 2 wrongly claimed it was "present at boot";
`BoundedContext` data nodes exist, its registry row does not). Step 1 above
closes exactly that gap **before** the third `createEdgeType`
(`ASSIGNED_TO_CONTEXT`) needs it. So `registerCapabilitySchema` runs **after**
both `registerModelSchema` and `registerStorySchema` in `applySchema` (the
`story-spec-core` ordering pattern), and its own internal order is
label-rows-first. The AC-01/AC-02 integration tests run the registration
against a **fresh registry** to prove the order end-to-end (§9).

**Detached computation (FR-06, FR-13, DD-13).** A mapping is "detached" when its
far-end node's expected label no longer matches (id reuse, partial import) — a
truly dangling edge cannot exist (a relationship never outlives its endpoints).
`getCapability` computes `detached` by `OPTIONAL MATCH` on each mapping edge with
and without the expected far-end label and reports any edge whose expected label
is absent as `{kind, targetId}`; in the normal path `detached` is `[]`. It is a
**defensively-rendered read-model field**: the storage integration test
constructs the state via a test-only direct-driver `REMOVE n:BoundedContext`; the
UI test feeds a stub with non-empty `detached[]` (§9).

### 4.7 Route handlers + dispatch (FR-04, FR-05, FR-07, FR-09, FR-10, DD-11)

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

**Dispatch (`api/src/router.ts`).** The router is method-generic
(`const method = req.method.toUpperCase()`, `router.ts:263`) — **PUT needs no
router-core change** (DD-11); the delegate's `method === "PUT"` arms are ordinary
string compares, the same mechanism every `"PATCH"` arm uses. The existing
`models*` blocks fall through when their delegate returns `null`: the
`model-workspace-core` block at `router.ts:396-399`, then the `story-spec-core`
block at `router.ts:404-407`. This spec adds a sibling
`registerCapabilityRoutes(method, sub, req)` **immediately after the story
block** (before the `modules*` block), so `models/:modelId/capabilities*` and
`models/:modelId/system-model/*` paths that the earlier delegates do not own
resolve here. Inside the delegate, a `sub.match(/…/)` chain ordered
**specific-before-parameterized**:

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

### 4.8 Route-permission mapping + RBAC (FR-11, DD-10, DD-11)

`api/src/auth/rbac-permissions.ts` — new `ROUTE_PERMISSIONS` rows via the
module-private `P(...)` helper (edited in place, §3.1). **The full ordered list
(FR-11/C-04 — enumerated verbatim, adopted as house convention):**

```
// system-model read aggregates — most specific literals, first
P("GET",    "models/:modelId/system-model/gaps",         "capability:read"),
P("GET",    "models/:modelId/system-model/context-map",  "capability:read"),
// capability collection
P("GET",    "models/:modelId/capabilities",              "capability:read"),
P("POST",   "models/:modelId/capabilities",              "capability:write"),
// capability sub-routes — before the parameterized :capabilityId row
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

**True matcher semantics (DD-10, resolves C-05).** `matchSegments`
(`rbac-permissions.ts:326`) rejects on **segment count first**
(`pattern.length !== path.length → false`), then compares literals
(`:param` matches any one segment); `getRoutePermission` (line 339) is
first-match-wins over method + segments. For this route set **no ordering
hazard exists** (segment counts corrected per design-review N-01): after the
`/api/v1/` strip, the parameterized `models/:modelId/capabilities/:capabilityId`
row is **4** segments and can never match the **5**-segment (`…/needed-by`,
`…/supported-by`, `…/context`) or **6**-segment (`…/supported-by/:systemId`)
sub-routes (count differs); the equal-length **4**-segment
`system-model/gaps|context-map` literals cannot be shadowed by it either (their
3rd segment `system-model` ≠ the pattern literal `capabilities`). FR-11's "would let a
sub-route resolve to the wrong permission" is therefore an **overstatement for
these routes** — the order above is kept as convention + forward-proofing
against future same-length literal-vs-param rows (exactly what the house
comment at `rbac-permissions.ts:258-260` prescribes), and no task should spend
effort "proving" precedence beyond AC-09's assertion (which passes either way).
The **load-bearing** property is instead the SECURITY-CRITICAL one
(`rbac-permissions.ts:260-263`): an unmapped route returns `null` and the router
then **skips the RBAC check entirely** — so `capability-authz.test.ts` asserts
`getRoutePermission` returns a non-null `capability:*` permission for **every**
one of the 13 method+route pairs (no silent-open route), incl. the **three**
`PUT` rows — `needed-by`, `supported-by`, `context` (count corrected per
design-review C-03) — (DD-11; `rp.method === upperMethod` is a plain string compare, so `PUT`
needs no matcher change). No new route is `public`; auth is enforced only by the
central gate (`router.ts` → `getRoutePermission` → RBAC) — no per-route check
(NFR-05, FR-11).

`api/src/scripts/seed-rbac-roles.ts` — the `business_architect` role (seeded by
`model-workspace-core` FR-11, verified on disk at line 96; extended by
`story-spec-core`) gains `"capability:read"` + `"capability:write"` in its
permission array (idempotent `MERGE` by role name — the seed re-writes the
role's permission set). This spec **modifies** that role's permission list; it
does not create the role.

### 4.9 OpenAPI (FR-10, DD-11)

`api/src/routes/openapi.ts` — register the request+response schemas
(`capabilityCreateSchema`, `capabilityPatchSchema`, `capabilityReadSchema`,
`neededBySchema`, `supportedBySchema`, `contextAssignSchema`, `gapsResultSchema`,
`contextMapResultSchema`) and `registry.registerPath` each route (§4.7),
generated from the same zod definitions (no hand-maintained copy, FR-10). **PUT
emission (DD-11, resolves C-06):** the generator's `RouteConfig` `Method` union
includes `'put'` (verified
`@asteasolutions/zod-to-openapi/dist/openapi-registry.d.ts:21`), so the three
`PUT` mapping routes register with `method: "put"` and the document emits `put`
operations — `capability-openapi.integration.test.ts` asserts
`paths["/api/v1/models/{modelId}/capabilities/{capabilityId}/needed-by"].put`
exists (first `put` operation in the document). The three new `ERROR_CODES`
surface through the shared `errorEnvelopeSchema` responses. AC-09 asserts routes
+ codes appear in `GET /api/v1/openapi.json`.

### 4.10 PWA — SystemModeler view (FR-12, FR-13, FR-14)

- **`pwa/src/views/index.tsx`** — the model surface's `systems` entry (verified
  on disk at line 165:
  `systems: () => <ModelTabPlaceholder tab="Systems" spec="ddd-system-modeling" />`)
  is **replaced** with `systems: (r) => <SystemModeler route={r} />`. This is the
  only edit to that file (`route.ts`/`SURFACES` stay `model-workspace-core`'s).
  Note the **explorer** surface's own `"systems"` key (line 76 →
  `ExplorerSystems`) and the **analytics** surface's (line 110 →
  `AnalyticsSystems`) are different surfaces' tabs — untouched.
- **`pwa/src/views/model/SystemModeler.tsx` + `.module.css`** (FR-12, FR-13) —
  reads the active `BusinessModel` from `useActiveModel()`
  (`pwa/src/context/ActiveModelContext.tsx`, verified on disk); it does **not**
  re-implement model selection. Fetches capability list, gaps, and context map
  via a new `api.capabilities.*` / `api.systemModel.*` client (§4.11), keyed on
  `activeModel.id`. Renders **all four states**:
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
  capability (FR-04). A mapping with non-empty `detached[]` shows the "detached"
  indicator (DD-13 — rendered from the read-model field); the selected
  capability's augmentation mix (FR-07d) shows inline. All controls
  keyboard-reachable (UX-05, AC-18).
- **Model-scope + reload survival** (FR-14, AC-19) — the view keys its fetches on
  `activeModel.id`; switching the active model (shell context) refetches for the
  new model; deep-linking `#/model/systems` + reload re-renders for the persisted
  active model (persistence is `model-workspace-core` FR-15; this view consumes it
  via `useActiveModel()` and refetches on `activeModel.id` change). No cross-model
  leakage (server-enforced via `CAPABILITY_IN_MODEL` membership, §4.1).
- **Tokens + a11y** (NFR-06, UX-02/05; AC-17/AC-18) — `SystemModeler.module.css`
  uses only `var(--…)` from the tokens file; catalog components (`Card`,
  `DataTable`, `Pill`, `Modal`, `SidePanel`) before inventing new ones. The view
  exposes an ARIA landmark; Tab reaches "New capability" then the list in DOM
  order; opening detail moves focus into the panel, Escape returns it (reusing
  the catalog `SidePanel`/`Modal` focus-trap — not re-implemented). `systemKind`
  conveyed by `Pill` **text** (`SYSTEM_KIND_LABELS`), not color alone.
  `bun run scripts/design-conformance.ts --view pwa/src/views/model/SystemModeler.tsx`
  exits 0 (AC-17; `--view` mode checks the co-located `.module.css`).

### 4.11 PWA api client (FR-12/FR-13) + `systemKind` read-path (FR-15)

`pwa/src/api.ts` — add `capabilities` + `systemModel` blocks reusing the existing
`json<T>()` fetch wrapper:

```ts
capabilities: {
  list:   (modelId, signal?) => json(`/api/v1/models/${modelId}/capabilities`, withSignal(signal)),
  get:    (modelId, capId, signal?) => json(`…/capabilities/${capId}`, withSignal(signal)),
  create: (modelId, body) => json(`…/capabilities`, {method:"POST", …}),
  patch:  (modelId, capId, body) => json(`…/capabilities/${capId}`, {method:"PATCH", …}),
  remove: (modelId, capId) => json(`…/capabilities/${capId}`, {method:"DELETE", …}),
  neededBy:   { put: (m,c,body)=>…, remove:(m,c,body)=>… },      // method:"PUT" (DD-11)
  supportedBy:{ put: (m,c,body)=>…, remove:(m,c,systemId)=>… },  // method:"PUT"
  context:    { put: (m,c,body)=>…, clear:(m,c)=>… },            // method:"PUT"
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
The **three** `PUT` routes (`needed-by`, `supported-by`, `context`) are the
codebase's first (DD-11; count corrected per design-review C-03).

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
| GET | `/api/v1/models/:modelId/system-model/gaps` | FR-07,08 | `capability:read` | 4 categories (step items carry `describingStories` — DD-15; orphan check per-model — DD-18) + augmentation mix (`unknown` bucket defensive); read-only |
| GET | `/api/v1/models/:modelId/system-model/context-map` | FR-09 | `capability:read` | contexts+capabilities+relationships(w/ `targetId`)+unassigned; read-only |

Error codes (§3.5): three added (`capability_not_found`, `bounded_context_not_found`,
`system_not_found`), each reachable from ≥1 route; `model_not_found`/`not_found`/
`edge_endpoint_label_mismatch`/`invalid_payload` reused.

## 6. UI design

- **View-tree placement (FR-12, UX-06).** `#/model/systems` → `SystemModeler`
  (route verbatim from the blueprint View Tree). No `route.ts`/`SURFACES` edit —
  the tab is registered by `model-workspace-core`; this spec swaps the model
  surface's `systems` dispatch target (`pwa/src/views/index.tsx:165`, §4.10).
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
- **Switch the mapping writes from `PUT` to `POST` to avoid first-PUT risk** —
  the writes are genuinely idempotent (`MERGE`, DD-06); POST would misstate the
  contract to dodge a risk that dissolves on inspection (dispatch is
  method-generic, RBAC compares method strings, the OpenAPI `Method` union
  includes `'put'` — all verified, DD-11). Rejected → keep `PUT`, test it
  explicitly (C-06).
- **Export `validateEdge` from `api/src/storage/edges.ts` for the MERGE-path
  check** — widens a graph-core module's surface and adds `edges.ts` to the edit
  set for no gain. Rejected → import the already-exported `getEdgeEndpoints`
  (DD-12, design-review C-01).
- **Reuse the `GET /api/v1/ontology/bounded-contexts` route's relationship shape**
  — it is name-keyed (`{type,target:name}`), insufficient for deep-linking or
  dedupe. Rejected → this spec's own read resolving `{type,targetId,targetName}`
  (DD-07, AC-08).
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
- **A per-type write guard on the generic `POST /api/v1/edges` surface for the
  four new edge types** — a graph-core contract change out of this spec's scope,
  and `story-spec-core` set the precedent (its DD-12) of accepted risk + defined
  degradation instead. Rejected → DD-17 (accepted risk, degradation semantics,
  future-guard candidate; design-review C-02).
- **Global no-capability check for `orphanSystems`** — makes model A's gap
  analysis depend on model B's modeling, against NFR-02's per-model framing.
  Rejected → per-model `NOT EXISTS` through `CAPABILITY_IN_MODEL` (DD-18,
  design-review C-04).
- **Capability derivation / "generate candidates from activities" bootstrap** —
  requirements Scope names it out-of-scope (C-03 of the requirements review,
  pass 1): a capability is a modeling judgment, not a mechanical projection.
  Rejected → manual authoring only.

## 8. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `shared/src/schema/ddd-system.ts` | new | FR-01,02,04,05,07,09,10 | zod: capability create/patch/read + mapping bodies + gaps/context-map result schemas (incl. `unknown` mix bucket + `describingStories` on step items — DD-15) |
| `api/src/scripts/register-capability-labels.ts` | new | FR-01,02, NFR-01 | idempotent: ensure `BoundedContext` label row (DD-14, B-01) → `createNodeLabel("Capability")` → 4 `createEdgeType` (incl. `NEEDS_CAPABILITY` 2 pairs, `CAPABILITY_IN_MODEL`); `register:capability` |
| `api/src/storage/capabilities.ts` | new | FR-04,05,06, NFR-02 | capability CRUD + mapping edges + `DETACH DELETE` cascade; atomic create+`CAPABILITY_IN_MODEL`; consumes `scopedNodeIds` + `getEdgeEndpoints` (DD-03, DD-12) |
| `api/src/storage/system-model.ts` | new | FR-07,08,09, NFR-07 | `computeGaps` (incl. story-mediated arm — DD-15; per-model orphan check — DD-18) + `computeContextMap` read aggregates; bounded round-trips (DD-05) |
| `api/src/routes/capabilities.ts` | new | FR-04,05,07,09,10 | 13 handlers incl. the three PUT arms (DD-11, C-03); zod at boundary; envelope helpers |
| `api/src/errors.ts` | modify | FR-10 | +3 codes (`capability_not_found`, `bounded_context_not_found`, `system_not_found`); reuse `model_not_found`/`not_found` (N-04 verified no dupes) |
| `api/src/router.ts` | modify | FR-04,05,07,09 | `registerCapabilityRoutes` block after the story-spec-core block (§4.7); PUT arms are plain method compares (DD-11) |
| `api/src/auth/rbac-permissions.ts` | modify | FR-11 | 13 `ROUTE_PERMISSIONS` rows (ordered §4.8, DD-10); `capability:read`/`capability:write`; three `P("PUT",…)` rows (DD-11, C-03) |
| `api/src/scripts/seed-rbac-roles.ts` | modify | FR-11 | add `capability:*` to `business_architect` (consumed role; MERGE) |
| `api/src/neo4j/bootstrap.ts` | modify | FR-01,02 | call `registerCapabilitySchema` after `registerModelSchema` + `registerStorySchema` |
| `api/src/routes/openapi.ts` | modify | FR-10 | register capability/system-model paths + schemas; three `method:"put"` registrations (DD-11, C-03) |
| `package.json` | modify | FR-01 | `register:capability` script |
| `pwa/src/views/index.tsx` | modify | FR-12 | swap model surface `systems` tab dispatch (line 165) → `<SystemModeler>` |
| `pwa/src/views/model/SystemModeler.tsx` | new | FR-12,13,14, UX-01/02/05 | list + gap + context-map panels + detail/edit + 4 states |
| `pwa/src/views/model/SystemModeler.module.css` | new | FR-12, NFR-06 | tokens-only |
| `pwa/src/api.ts` | modify | FR-12,13,15 | `capabilities` + `systemModel` client blocks (§4.11, PUT methods); `systemKind` read via `system-kind.ts` |
| `pwa/src/lib/journeyData.ts` | modify (conditional) | FR-15 | ONLY if SystemModeler reuses its system-render helper: repoint the `sAttrs.kind` read (line 189) to `systemKind`; otherwise untouched (FR-15 is `should`, scoped to what this spec exercises) |

**Not edited (consumed):** `shared/src/schema/{nodes,edges}.ts` (NFR-01/AC-21),
`api/src/storage/{nodes,edges,model-scope,model-lifecycle-guard,models}.ts`
(primitives + `model-workspace-core`'s helpers untouched — `validateEdge` stays
private, DD-12), `api/src/ontology/cache/edge-endpoints.ts` (imported),
`shared/src/schema/system-kind.ts` (`system-augmentation-model`'s vocabulary),
`api/src/routes/ontology-bounded-contexts.ts` (read-only, NFR-04),
`pwa/src/context/ActiveModelContext.tsx` / `pwa/src/route.ts` (all
`model-workspace-core`'s).

## 9. Test strategy

| AC | Kind | File |
|----|------|------|
| AC-01 | integration | `api/__tests__/capability-labels.integration.test.ts` — **runs `registerCapabilitySchema` against a fresh registry** (wiped `_Ontology*` rows re-seeded from `NODE_LABELS`, proving the DD-14 order end-to-end — B-01): `BoundedContext` **and** `Capability` label rows exist afterwards and both appear in `GET /schema`; `NODE_LABELS` unchanged; idempotent re-run (no dup rows, `409 name_conflict` swallowed) |
| AC-02 | integration | `api/__tests__/capability-edges.integration.test.ts` — same fresh-registry setup (DD-14): all 4 `createEdgeType` calls succeed **without** `type_pair_violation` (B-01 — proves the `BoundedContext` row precedes `ASSIGNED_TO_CONTEXT`); 2 pairs on `NEEDS_CAPABILITY`; wrong pair (`SUPPORTED_BY` `Capability→Role`) → `400 edge_endpoint_label_mismatch`; assert **no** `Capability→BusinessModel` pair added to `IN_MODEL` (B-01 of the requirements pass); `EDGE_ENDPOINTS` unchanged |
| AC-03 | integration | `api/__tests__/capability-crud.integration.test.ts` — create→201+UUIDv7+`CAPABILITY_IN_MODEL` edge (even with no mapping); unknown model→`404 model_not_found` **while `GET` list on the same unknown model → `200 []`** (the pinned asymmetry, design-review N-02); list scoped w/ counts; detail embeds needed-by/supported-by(w/ systemKind)/context; PATCH preserves omitted; DELETE→204; **detached fixture**: direct-driver `REMOVE n:BoundedContext` on an assigned context → `detached[]` non-empty (DD-13) |
| AC-04 | integration | `api/__tests__/capability-mapping.integration.test.ts` — **first-PUT dispatch proven end-to-end (DD-11)**: `PUT needed-by {activityId}`/`{storyId}` idempotent `MERGE`; `PUT supported-by {systemId}`; `PUT context` replaces prior (at-most-one); each DELETE removes; unknown cap/system/context → matching `404 *_not_found`; forged wrong pair → `400 edge_endpoint_label_mismatch` via `getEdgeEndpoints` check (DD-12) |
| AC-05 | integration | `api/__tests__/capability-cascade.integration.test.ts` — DELETE cascades all 4 edge types in one tx (no dangles); Activity/UserStory/System/BoundedContext/BusinessModel survive |
| AC-06 | integration | `api/__tests__/system-gap-analysis.integration.test.ts` — seeded X/Y/Z + capability C + system S; gaps returns Z∈unsupportedSteps, Y∈capabilityGaps, C∈capabilitiesWithoutSystem, S∈orphanSystems, X unflagged. **Plus (DD-15/B-02):** activity **W** supported *only* via its describing story (`story -NEEDS_CAPABILITY-> cap -SUPPORTED_BY-> sys`, no direct activity edge) is **not** flagged; Z's/Y's items carry `describingStories` `{id,name}` for their seeded stories. **Plus (DD-18/C-04):** after model B maps its own capability to S, S **still** ∈ model A's `orphanSystems` (per-model check) |
| AC-06b | integration | `api/__tests__/capability-model-scope.integration.test.ts` — capability whose only `NEEDS_CAPABILITY` source is an orphan activity (∉ `scopedNodeIds`) still appears in list + gaps (resolved via `CAPABILITY_IN_MODEL`). **Fixture recipe (DD-16/C-01 — the state is constructed through real routes, since `PUT …/needed-by` strictly requires a scoped target):** (1) create the activity `PART_OF` a scoped domain (core node/edge writes); (2) create the capability via POST (gets `CAPABILITY_IN_MODEL`); (3) `PUT …/needed-by {activityId}` while scoped; (4) **orphan** the activity by `DELETE`ing its `PART_OF` edge via the generic graph-core edge surface; (5) assert the capability still lists + appears in gaps, and a fresh `PUT …/needed-by` against the now-orphan activity → `404 not_found` (DD-16's strict arm) |
| AC-07 | integration | `api/__tests__/system-gap-analysis.integration.test.ts` — augmentation mix `{functional:2,agentic:1,ai_predictive:1}` + shares + model roll-up; kinds read via `SYSTEM_KINDS` (no re-declared literals) |
| AC-08 | integration | `api/__tests__/context-map.integration.test.ts` — assign 2 caps to BC1, 1 to BC4, 1 unassigned; context-map groups under BC1/BC4 (w/ domain/subdomain), relationships carry far context **`id`** (DD-07), unassigned bucket; no BC/relationship mutated |
| AC-09 | unit+integration | `api/__tests__/capability-model-scope.integration.test.ts` (two-model isolation via `CAPABILITY_IN_MODEL`; a cap id **not** in `scopedNodeIds`; shared System in both) + `api/__tests__/capability-authz.test.ts` (403 w/o `capability:write` on POST/**PUT**/PATCH/DELETE; 200 GET w/ `capability:read`; `business_architect` resolves both; `getRoutePermission` non-null for **all 13** method+route pairs incl. the three PUT rows (C-03) — DD-10's no-silent-open property + DD-11; no `public`) + `api/__tests__/capability-openapi.integration.test.ts` (routes + 3 codes in openapi; asserts the `…/needed-by` path has a **`put`** operation — DD-11) |
| AC-10 | component (jsdom) | `pwa/src/__tests__/system-modeler.test.tsx` — `#/model/systems`→`SystemModeler` (not placeholder); reads `useActiveModel()`; ready capability list w/ needed-by count, `systemKind` badges, context name |
| AC-11 | component | `pwa/src/__tests__/system-modeler-gaps.test.tsx` — 4 gap categories + counts + deep-links; augmentation-mix summary via `systemKind` badges |
| AC-12 | component | `pwa/src/__tests__/system-modeler-context-map.test.tsx` — capabilities grouped under contexts + unassigned bucket + inter-context relationships |
| AC-13 | component | `pwa/src/__tests__/system-modeler-detail.test.tsx` — detail panel w/ name/desc + needed-by + supported-by(badges) + context; edit PATCHes; add/remove needed-by/system + set/clear context call FR-05 routes + update panel; **detached indicator renders when fed a stub response with non-empty `detached[]`** (DD-13 — no live dangling edge needed) |
| AC-14,15,16 | component | `pwa/src/__tests__/system-modeler-states.test.tsx` — loading skeleton; empty w/ "New capability" (POST → appears) + hint; error + retry refetch |
| AC-17 | CLI | `bun run scripts/design-conformance.ts --view pwa/src/views/model/SystemModeler.tsx` — expect exit 0, zero token/component violations |
| AC-18 | manual | keyboard walk of `#/model/systems`: Tab → "New capability" (Enter), Tab into list, Enter opens a capability → focus enters detail panel, moves through mapping controls in order, each `systemKind` badge shows its text label, Escape returns focus to the originating row |
| AC-19 | e2e | `pwa/playwright/system-modeler-context.spec.ts` — model B active, nav `#/model/systems`, reload → same route renders `SystemModeler` w/ model B's capabilities/gaps/context-map |
| AC-20 | component + CLI | `pwa/src/__tests__/system-modeler-kind.test.tsx` (reads `attributes.systemKind` via `SYSTEM_KINDS`/`SYSTEM_KIND_LABELS`) + manual: `git grep -n '"agentic"\|"ai_predictive"' pwa/src/views/model/SystemModeler.tsx` → no matches (literals only in the imported vocabulary module) |
| AC-21 | CLI | `bun run typecheck` exit 0; `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts` shows no `NODE_LABELS`/`EDGE_ENDPOINTS` additions (incl. no `IN_MODEL` pair change — B-01) |

The three new error codes are additionally walked by the existing reachability
assertion in `api/__tests__/ontology-envelope.test.ts` ("Walk every code…", line
29 — the real path, N-06).

Integration tests need Neo4j (`bun test:integration`); unit/component run under
`bun test`. Two-model + orphan-activity fixtures are built via
`model-workspace-core`'s model/domain routes + core node writes for
activities/systems + `story-spec-core`'s story routes (the AC-06b orphaning
step deletes a `PART_OF` edge via the generic graph-core edge surface — a real
route, not a driver write; DD-16). Exactly **two** sanctioned test-only
direct-driver operations exist: the `REMOVE n:BoundedContext` that constructs
the detached state (DD-13), and the AC-01/AC-02 fresh-registry setup that wipes
the `_Ontology*` rows before re-running registration (DD-14). `System.attributes.systemKind` is set on seed
systems via the core node write (systems default `functional` per
`system-augmentation-model`; the augmentation-mix fixture sets explicit kinds).
