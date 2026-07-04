---
feature: "ddd-system-modeling"
created: "2026-07-04"
author: "spec-author"
status: "revised"
revision: 2
size: "large"
---

# Requirements: ddd-system-modeling

> **Revision 2 (2026-07-04)** — addresses every finding in
> `review-requirements.md` (pass 1, verdict *revise*). Summary of changes:
> **B-01** → this spec no longer overloads `model-workspace-core`'s `IN_MODEL`
> lifecycle edge; it registers its **own** scoping edge type
> `CAPABILITY_IN_MODEL` (`Capability → BusinessModel`) via the runtime registry
> (FR-01a/FR-02/NFR-01, mechanism note under FR-06, Dependencies) — no
> lifecycle-guard collision, clean ownership. **B-02** → the mechanism note
> now states `scopedNodeIds`'s actual set (`Domain` linked `IN_MODEL` + its
> `PART_OF*` descendants + `ModuleInstance`s; `System`/`Role`/`Location`
> excluded) and makes `CAPABILITY_IN_MODEL` the **authoritative** membership
> resolution written at create *and* whenever a `NEEDS_CAPABILITY` source is
> attached — so a capability whose only source is an **orphan** activity
> (outside `scopedNodeIds`) is still scoped, never silently dropped. **C-01** →
> FR-09/AC-08 resolve inter-context `UPSTREAM_OF`/`DOWNSTREAM_OF` relationships
> to **`id`** via this spec's own Neo4j read (the bounded-contexts route's
> `target: name` shape is display-only and insufficient for linking). **C-02** →
> FR-03 (cardinality) and FR-08 (`USES_SYSTEM` reconciliation) are recorded as
> **DECIDED** under single-shot (XD-17), not "orchestrator to confirm." **C-03** →
> capability derivation/bootstrap is a **named out-of-scope** line, not a
> reopenable option. **C-04** → FR-11 now requires design to enumerate the full
> ordered `ROUTE_PERMISSIONS` list incl. the `:capabilityId`-after-its-own-
> sub-routes precedence. **N-03** → NFR-07 is explicitly a design/perf-hygiene
> target, not an AC-gated one. No existing stable IDs were renumbered.

## Summary

`ddd-system-modeling` is a **parallel wave-3** feature of the Business Modeling
Studio (blueprint `.claude/specs/blueprint.md`, XD-05). It closes the pipeline's
**systematize** stage: it lets a Business Architect model the IT systems that
support a business's steps in a **domain-driven** way. It introduces a
**Capability layer** (a new `Capability` runtime ontology label, XD-01) that sits
between the story/activity work of `story-spec-core` and the `System` nodes of the
process graph, and wires three mappings — **story/activity → capability**,
**capability → system** (each mapping carrying the system's `systemKind` from
`system-augmentation-model`, XD-15), and **capability → bounded context** — plus a
dedicated **`CAPABILITY_IN_MODEL`** scoping edge (`Capability → BusinessModel`,
owned by this spec — B-01) that anchors each capability to its active model, so the
existing ontology **bounded-contexts** surface (XD-05) gains a story-driven
**context map**. On top of those mappings it computes **support-gap analysis**
(activities/steps with no supporting system, systems mapped to no capability,
capabilities with no system, and the **augmentation mix** — functional / agentic /
AI-predictive coverage — per capability). It ships the **SystemModeler** view at
`#/model/systems` (route taken verbatim from the blueprint View Tree) with all four
view states, scoped to the active `BusinessModel`.

It builds on `story-spec-core` (foundation wave 2, consumed via its
`UserStory`/`Activity` graph citizens + model-scoping join) and
`system-augmentation-model` (foundation wave 1, consumed via the `SYSTEM_KINDS`
vocabulary + the `systemKind` attribute on `System`). It **does not** re-spec
bounded-context CRUD (the `BoundedContext` label + `GET
/api/v1/ontology/bounded-contexts` read route already exist — this spec **reads and
assigns capabilities to** those contexts, it does not create/edit contexts), the
`systemKind` schema (foundation), the `System` label itself, or any KPI/OKR work.

## Motivation

1. The studio's pipeline is **author → graph → optimize → measure →
   systematize** (blueprint Summary). The first four stages land in
   `story-spec-core`, `key-activity-optimizer`, and `kpi-impact-mapping`; the
   **systematize** stage — "use the process requirements as the base for
   domain-driven IT system modeling (capabilities, bounded contexts, support-gap
   analysis)" — has no home until this spec. Without it, the business
   specification stops at "what the business does" and never reaches "which
   systems support it, and where the gaps are."
2. Today systems attach to activities only through the raw graph-core
   `USES_SYSTEM` edge (`Activity → System`). That is too coarse for
   domain-driven modeling: it says *which system touches a step* but not *what
   business capability the step needs*, nor *whether that capability is covered
   by a system at all*. A **Capability layer** (XD-05) is the missing
   abstraction — it is the unit at which support gaps, bounded-context
   assignment, and augmentation mix become expressible.
3. The bounded-contexts ontology surface already exists (`BoundedContext` label,
   `Entity`-`PART_OF`-`BoundedContext`, `UPSTREAM_OF`/`DOWNSTREAM_OF` context
   relationships, `GET /api/v1/ontology/bounded-contexts`) but it is **disjoint
   from the story/activity model** — it was seeded from a static retail
   catalogue spec, not derived from the authored business. XD-05 says this spec
   **extends** that surface: capabilities get assigned to bounded contexts, so
   the context map becomes story-driven and the two halves of the model join up.
4. `system-augmentation-model` (foundation wave 1) established the single
   augmentation vocabulary `systemKind` (functional / agentic / ai_predictive,
   XD-15) precisely so that this spec can express **augmentation mix per
   capability** — how much of each capability's supporting-system coverage is
   plain-functional vs. agentic vs. AI-predictive. That is the round-4 "manage
   the business from this view" payoff on the modeling surface (blueprint
   round-4 extension, feature-inventory scope line).
5. The blueprint View Tree assigns `#/model/systems` → `SystemModeler` to this
   spec; `model-workspace-core` already registered that route (as a
   placeholder) and owns `route.ts`. This spec replaces the placeholder with the
   real view, scoped to the active model, so the SME/architect can see
   capabilities, their systems, the context map, and the gaps in one place.

## Functional Requirements

<!-- Priorities: must = M3 pipeline dependency / blueprint scope line; should = polish. -->

### Graph domain model — Capability label + mapping edges (XD-01, XD-05, XD-15)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **`Capability` label** registered as a **runtime ontology label** via the ontology-manager registry (`createNodeLabel`, permissive `json_schema_doc:{}`) — **NOT** as a compile-time `NODE_LABELS` addition in `shared/src/schema/nodes.ts` (XD-01). Carries the standard node envelope (`id` UUIDv7 server-generated, `name`, `description`, `createdAt`, `updatedAt`, open `attributes_json`). Registration is **idempotent** (a re-run swallows the `409 name_conflict` already-registered path, mirroring `story-spec-core`'s `registerStorySchema`). A `Capability` is a **business capability** — a cohesive ability the business must have (e.g. "Price a product", "Allocate stock to a store") — the unit at which systems, bounded contexts, and support gaps are reasoned about. | must | XD-01, XD-05 |
| FR-02 | **Mapping + scoping edges** registered via the ontology-manager **edge-type** registry (`createEdgeType`, endpoint pairs written as `_OntologyEdgeEndpoint` rows; the compile-time `EDGE_ENDPOINTS` const in `shared/src/schema/edges.ts` is **off-limits** — validation is registry-only): (a) **`NEEDS_CAPABILITY`** (`Activity → Capability`, the step needs this capability) **and** (`UserStory → Capability`, the story needs this capability) — two endpoint-pair rows on one edge type, so both an activity and a story may point at the same capability; (b) **`SUPPORTED_BY`** (`Capability → System`, the capability is supported by this system); (c) **`ASSIGNED_TO_CONTEXT`** (`Capability → BoundedContext`, the capability lives in this bounded context); (d) **`CAPABILITY_IN_MODEL`** (`Capability → BusinessModel`, the model this capability belongs to) — a **new scoping edge type owned by this spec** (B-01), registered the same way. **B-01 (resolves the `IN_MODEL` lifecycle-guard collision):** this spec does **NOT** reuse or add an endpoint pair to `model-workspace-core`'s `IN_MODEL` edge — that edge is a **lifecycle** edge type on which `model-workspace-core` FR-08 rejects every generic write with `409 model_lifecycle_route_required` ("lifecycle state is mutated *only* through the `/api/v1/models*` / `/api/v1/modules*` routes"). Writing an `IN_MODEL` edge from this spec's capability-create route would either be blocked by that guard or silently punch through it. Registering a dedicated `CAPABILITY_IN_MODEL` type avoids both: it is this spec's own edge, written by this spec's own capability routes, and requires **no coordinated change to `model-workspace-core`**. A wrong endpoint pair (e.g. `SUPPORTED_BY` from `Capability → Role`, or `CAPABILITY_IN_MODEL` from `Activity → BusinessModel`) returns `400 edge_endpoint_label_mismatch` (reusing the graph-core registry-backed validator). | must | XD-01, XD-05, XD-15, resolves B-01 |
| FR-03 | **Mapping cardinality (DECIDED — C-02; closes former OQ-1).** Under single-shot (XD-17) there is no interactive gate, so this default *is* the decision, recorded here as settled: `NEEDS_CAPABILITY` is **many-to-many** — an activity/story may need several capabilities and a capability may be needed by many activities/stories. `SUPPORTED_BY` is **many-to-many** — a capability may be supported by several systems (partial/overlapping coverage) and a system may support several capabilities; this many-to-many `SUPPORTED_BY` is the premise the augmentation-mix analysis (FR-07d/AC-07) rests on. `ASSIGNED_TO_CONTEXT` is **at most one per capability** — a capability belongs to zero or one bounded context (the DDD norm; re-assigning replaces the prior edge in one tx). `CAPABILITY_IN_MODEL` (FR-02d) is **exactly one per capability** — a capability belongs to exactly one model, written at create (FR-04) and never a duplicate. No hard graph uniqueness constraint is created for the many-to-many edges; duplicate `(from,to)` mapping creates are idempotent (a second identical map is a no-op, not a `409`). | must | XD-05, resolves C-02 (closes OQ-1) |

### Capability + mapping REST surface (model-scoped)

| ID | Requirement | Requirement-detail | Priority | Source |
|----|-------------|--------------------|----------|--------|
| FR-04 | **Capability CRUD** under `/api/v1/models/:modelId/capabilities` (model-scoped path, following the `model-workspace-core` / `story-spec-core` `/api/v1/models/:modelId/*` route convention). | `POST` (create → 201 + UUIDv7 id; body `{ name, description? }`; **writes a `CAPABILITY_IN_MODEL` edge to `:modelId`'s `BusinessModel` root in the same create tx** (FR-02d) so a freshly-created, not-yet-mapped capability is model-scoped from birth — B-01/B-02; a `:modelId` that is not an existing `BusinessModel` → `404 model_not_found`), `GET` (list all capabilities in the model — model-scoping mechanism below — each row carrying its counts: needed-by activity/story count, supporting-system count, assigned bounded-context id/name), `GET /:capabilityId` (detail incl. its `NEEDS_CAPABILITY` sources, `SUPPORTED_BY` systems with their `systemKind`, and `ASSIGNED_TO_CONTEXT` context), `PATCH /:capabilityId` (update `name`/`description`/`attributes`; omitted fields never clobbered), `DELETE /:capabilityId` (→ 204, cascades its own `NEEDS_CAPABILITY`/`SUPPORTED_BY`/`ASSIGNED_TO_CONTEXT`/`CAPABILITY_IN_MODEL` edges in one `DETACH DELETE` tx — never deletes the `Activity`/`UserStory`/`System`/`BoundedContext`/`BusinessModel` on the other end). All zod-validated at the boundary; consistent `{error:{code,message,details?}}` envelope. | must | XD-05, `story-spec-core` FR-05 route pattern |
| FR-05 | **Mapping edge routes** under the capability path: `PUT /api/v1/models/:modelId/capabilities/:capabilityId/needed-by` (body `{ activityId?, storyId? }` — creates a `NEEDS_CAPABILITY` edge; idempotent per FR-03), `DELETE .../needed-by` (removes it), `PUT .../supported-by` (body `{ systemId }` — creates `SUPPORTED_BY`; idempotent), `DELETE .../supported-by/:systemId`, `PUT .../context` (body `{ boundedContextId }` — sets `ASSIGNED_TO_CONTEXT`, replacing any prior assignment per FR-03), `DELETE .../context` (unassigns). Each endpoint validates that the referenced `Activity`/`UserStory` is in `:modelId`'s scoped set, that the `System` exists, and that the `BoundedContext` exists (else the appropriate `404 *_not_found`). Endpoint-pair mismatches surface as `400 edge_endpoint_label_mismatch` from the registry validator. | must | XD-05, XD-15 |
| FR-06 | **Cascade + referential integrity**: deleting a `Capability` (FR-04 `DELETE`) removes all edges across its four participating edge types (`NEEDS_CAPABILITY`, `SUPPORTED_BY`, `ASSIGNED_TO_CONTEXT`, `CAPABILITY_IN_MODEL`) in a **single Cypher `DETACH DELETE` transaction** over `(cap)` (the graph-core/story-spec cascade pattern), so "single transaction / no dangling edges" is a storage-primitive guarantee, not N per-edge `DELETE /api/v1/edges/:id` round-trips. The `Activity`/`UserStory`/`System`/`BoundedContext`/`BusinessModel` nodes on the far end are **never** in the delete set. Deleting an `Activity`, `System`, or `BoundedContext` is **out of this spec's write surface** (owned by graph-core / bounded-contexts routes); a capability left with an unresolved `NEEDS_CAPABILITY`/`SUPPORTED_BY`/`ASSIGNED_TO_CONTEXT` target renders with a "detached" indicator (FR-13), not auto-reconciled. | must | XD-05, data integrity |

> **Model-scoping mechanism (resolves B-01 + B-02; corrected in rev 2).**
>
> **What `scopedNodeIds` actually returns (B-02 correction).** A `Capability` is
> **not** itself a member of `model-workspace-core`'s `scopedNodeIds(driver,
> modelId)` structural set. Per `model-workspace-core` FR-18 / design §4.2 the
> helper's node set is: **the `Domain`s linked `IN_MODEL` to that model, plus
> their transitive `PART_OF*` descendants (`UserJourney`s, `Activity`s), plus that
> model's `ModuleInstance`s (and their forked-subtree nodes)** — it is *not*
> enumerated by label, and `System`/`Role`/`Location` are **excluded** (shared
> reference nodes, `model-workspace-core` DEC-01(a)). A consequence made explicit
> here (B-02): an `Activity` that is **orphaned** — not `PART_OF` any scoped
> `Domain`, a state `story-spec-core` FR-08 explicitly contemplates — is **not** in
> `scopedNodeIds`. Resolving capability membership *only* through
> `NEEDS_CAPABILITY`-source-in-`scopedNodeIds` would therefore make a capability
> whose sole source is such an orphan activity invisible to every model-scoped
> read (dropped, not leaked), and AC-09's isolation proof could pass while real
> capabilities silently vanish.
>
> **The authoritative membership edge (B-01 + B-02 fix): `CAPABILITY_IN_MODEL`.**
> To avoid both the orphan-activity gap (B-02) and the `IN_MODEL` lifecycle-guard
> collision (B-01), model membership is resolved through this spec's own
> `CAPABILITY_IN_MODEL` edge (FR-02d), **not** through the `NEEDS_CAPABILITY`
> source and **not** by adding a pair to `model-workspace-core`'s lifecycle
> `IN_MODEL` edge:
>
> - **Every** `Capability` carries **exactly one** `CAPABILITY_IN_MODEL` edge to
>   its `BusinessModel` root, written in the FR-04 `POST` create tx — including a
>   capability with no `NEEDS_CAPABILITY` source yet, and a capability whose only
>   source is an orphan activity. A `Capability` is in model A **iff**
>   `(cap)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {id:$modelA})`. This is a
>   direct, label-free, O(1)-per-capability membership test that never depends on
>   `PART_OF` reachability.
> - The `NEEDS_CAPABILITY` source is used **only** to compute the analysis
>   (which activities/stories need which capabilities), never as the membership
>   key. FR-05 still validates that a `needed-by` `Activity`/`UserStory` belongs to
>   `:modelId` (an activity ∈ `scopedNodeIds(modelId)` **or**, for an orphan
>   activity, one reachable from `:modelId` by the story-spec join) so a mapping
>   cannot cross models; but a capability's *visibility* comes from
>   `CAPABILITY_IN_MODEL`.
>
> Every model-scoped read (FR-04 list/detail), the cascade (FR-06), and the
> gap-analysis / context-map scope (FR-07, FR-09) resolve through the
> `CAPABILITY_IN_MODEL` membership. `System` and `BoundedContext` are **global**
> (not model-scoped) — a system/context may be `SUPPORTED_BY`/`ASSIGNED_TO_CONTEXT`
> from capabilities in several models; that is intended (systems and contexts are
> shared infrastructure). (Design defines the exact Cypher; requirements fix the
> invariant.)

### Support-gap analysis (blueprint scope line: support-gap analysis incl. augmentation mix)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-07 | **Support-gap analysis** at `GET /api/v1/models/:modelId/system-model/gaps` — a read-only aggregate over the model's scoped subgraph returning: (a) **unsupported steps** — model-scoped `Activity`s (and the `UserStory`s that describe them) that reach **no `System`** via any `NEEDS_CAPABILITY → SUPPORTED_BY` path (nor a direct `USES_SYSTEM`, see FR-08); (b) **capabilities without a system** — model-scoped `Capability`s with zero `SUPPORTED_BY` edges; (c) **orphan systems** — `System`s referenced by this model's capabilities-or-activities but mapped to **no `Capability`** (a system used at a step with no capability layer above it); (d) **augmentation mix per capability** — for each model-scoped capability, the count and share of its `SUPPORTED_BY` systems by `systemKind` (functional / agentic / ai_predictive), plus a model-level roll-up. Each result item carries the ids/names needed to deep-link back into the view. The endpoint is deterministic and side-effect-free. | must | blueprint feature-inventory scope line |
| FR-08 | **Coverage reconciliation with raw `USES_SYSTEM` (DECIDED — C-02; closes former OQ-2).** Under single-shot (XD-17) this default is the decision, recorded as settled: the gap analysis (FR-07a) treats an activity as **supported** if it reaches a system via **either** the capability path (`Activity -NEEDS_CAPABILITY-> Capability -SUPPORTED_BY-> System`) **or** a direct graph-core `USES_SYSTEM` edge (`Activity → System`). An activity with a direct `USES_SYSTEM` but **no** capability mapping is additionally surfaced as a distinct **"capability gap"** (a supported step whose support is not yet modeled through a capability, defining the `capabilityGaps` category of AC-06) so the architect can lift raw system usage into the capability layer. This keeps the analysis honest about both *missing systems* and *unmodeled capabilities* without double-counting a step as unsupported when a `USES_SYSTEM` edge already exists. | must | resolves C-02 (closes OQ-2), graph-core `USES_SYSTEM` |
| FR-09 | **Context map** at `GET /api/v1/models/:modelId/system-model/context-map` — a read-only aggregate returning, per `BoundedContext` that has ≥1 model-scoped capability `ASSIGNED_TO_CONTEXT`: the context's id/name/domain/subdomain, the model-scoped capabilities assigned to it, and the inter-context `UPSTREAM_OF`/`DOWNSTREAM_OF` relationships **already present** on the bounded-contexts surface (read, not authored here). **Relationship identity (resolves C-01):** each inter-context relationship carries the far context's **`id`** (not only its `name`). The existing `GET /api/v1/ontology/bounded-contexts` route emits relationships as `{ type, target: <other.name> }` (verified: `api/src/routes/ontology-bounded-contexts.ts` collects `{ type: type(r), target: other.name }`) — **name-keyed, display-only, and insufficient for deep-linking or dedupe**. This spec therefore does **not** reuse that route's relationship shape; it runs its **own** Neo4j read that resolves each `UPSTREAM_OF`/`DOWNSTREAM_OF` target to `{ type, targetId, targetName }` so the view can deep-link between contexts. (It still reads the bounded-contexts surface for the context nodes themselves; it does not create/edit contexts or relationships — NFR-04.) Capabilities in the model that are **unassigned** (no `ASSIGNED_TO_CONTEXT`) are returned in an `unassigned` bucket. This is the story-driven view of the existing context map (XD-05). | must | XD-05, resolves C-01 |

### API contract

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-10 | Every route in FR-04…FR-09 is mounted under `/api/v1/`, zod-validated at the boundary, and appears in `GET /api/v1/openapi.json` (generated from the same zod definitions — no hand-maintained copy). New error codes are added to the closed `ERROR_CODES` enum (`api/src/errors.ts`) as **additive** (non-breaking) changes: at minimum `capability_not_found`, `bounded_context_not_found`, and `system_not_found` (for the mapping-target lookups; `story_not_found`/`activity`-scoping errors reuse `story-spec-core` / graph-core codes, and `model_not_found` — for the FR-04 create-time `:modelId` check — reuses `model-workspace-core`'s existing code — where already present, codes are reused, not duplicated). Only **reachable** codes are added (an unreachable code fails the `envelope.test.ts` reachability assertion) — codes already in the enum are reused, not duplicated. No `/api/v2/` bump (all changes additive). | must | NFR-11, `story-spec-core` FR-10 |
| FR-11 | **Route-permission mapping**: every new `/api/v1/models/:modelId/capabilities*` and `/api/v1/models/:modelId/system-model/*` route registered in `api/src/auth/rbac-permissions.ts` (`ROUTE_PERMISSIONS`) with a new `capability:read` (GETs incl. `system-model/gaps`, `system-model/context-map`) / `capability:write` (POST/PUT/PATCH/DELETE) permission. **Ordering (C-04): design MUST enumerate the full ordered `ROUTE_PERMISSIONS` list for these routes and prove the precedence**, because the parameterized `:capabilityId` row is **less** specific than its own sub-routes and must be ordered **after both** the collection routes **and** its sub-routes. The required order is: (1) the `system-model/gaps` + `system-model/context-map` literals; (2) the collection routes `.../capabilities` (GET/POST); (3) the capability **sub-routes** `.../capabilities/:capabilityId/needed-by`, `.../supported-by`, `.../supported-by/:systemId`, `.../context` — these are **more** specific than `.../capabilities/:capabilityId` and must precede it; (4) **last**, the parameterized `.../capabilities/:capabilityId` row (GET/PATCH/DELETE). A row placed out of this order would let a sub-route resolve to the wrong permission. The `business_architect` RBAC role (seeded by `model-workspace-core`, extended by `story-spec-core`) gains `capability:read` + `capability:write` in `api/src/scripts/seed-rbac-roles.ts` (idempotent MERGE). Auth is enforced **only** by the central router gate (`api/src/router.ts`) + `api/src/auth/` — no per-route auth check (house rule). No new route is `public`. | must | house rule, XD-08, resolves C-04 |

### PWA — SystemModeler view (blueprint View Tree, UX-*)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-12 | **SystemModeler view** (`pwa/src/views/model/SystemModeler.tsx`, route `#/model/systems` — taken **verbatim** from the blueprint View Tree) **replaces** the `ModelTabPlaceholder` that `model-workspace-core` registered for the `systems` tab in `pwa/src/views/index.tsx` `renderView`. It reads the active `BusinessModel` from the shell-owned context (`useActiveModel()`; it does **not** re-implement model selection) and presents, for that model: the **capability list** (each with its needed-by sources, supporting systems as `systemKind` badges, and assigned context), the **support-gap panel** (FR-07 categories), and the **context-map panel** (FR-09). It specs **all four view states**: **loading** (skeleton while the fetches are in flight), **empty** (no capabilities yet — offers a "New capability" action and, when the model has activities/stories, a hint to start mapping), **error** (a fetch failed — retry affordance), **ready** (panels rendered). Tokens-only styling via `var(--…)` from `tokens.css`; catalog components (`Card`, `DataTable`, `Pill`, `Modal`, `SidePanel`) before inventing new ones; `scripts/design-conformance.ts` passes on the view + its CSS module. `systemKind` badges reuse `SYSTEM_KIND_LABELS`/the catalog `Pill` from `system-augmentation-model` (never re-declared, XD-15). | must | Blueprint View Tree, UX-01, UX-02, UX-06 |
| FR-13 | **Capability detail + mapping editing** in SystemModeler: selecting a capability opens a detail panel (catalog `SidePanel`/`Modal`) showing name/description, its `NEEDS_CAPABILITY` sources (activities/stories), its `SUPPORTED_BY` systems each with a `systemKind` badge, and its `ASSIGNED_TO_CONTEXT` bounded context; the panel supports edit (PATCH capability), add/remove a needed-by source (FR-05), add/remove a supporting system (FR-05), set/clear the bounded context (FR-05), and delete the capability (FR-04). A mapping whose far-end node no longer resolves shows a **"detached"** indicator (FR-06). A supporting system's badge shows its `systemKind`; the augmentation-mix summary (FR-07d) for the selected capability is shown inline. All controls are keyboard-reachable (UX-05). | must | XD-05, XD-15, UX-01, UX-05 |
| FR-14 | **Model-scoped modeler + reload survival**: SystemModeler only ever shows the active model's capabilities, gaps, and context map; switching the active model (via the shell context) refetches for the new model; deep-linking `#/model/systems` and reloading re-renders the modeler for the persisted active model (the persistence + reconciliation is `model-workspace-core`'s FR-15; this view consumes it and refetches on model change). No cross-model leakage in the capability list or gap analysis (server-enforced by FR-04/FR-07's model-scoping mechanism — capabilities are resolved through their `CAPABILITY_IN_MODEL` membership, per the corrected note under FR-06). | must | UX-06, `model-workspace-core` FR-15 |
| FR-15 | **`systemKind` read-path reconciliation (carried from `system-augmentation-model` consolidated report):** this spec is the assigned owner of migrating the legacy shadow `attributes.kind` read path (`pwa/src/lib/journeyData.ts`, `pwa/src/components/JourneyCanvas.tsx`) to the canonical `systemKind` vocabulary **when it touches system rendering**. Where SystemModeler (or a component it reuses) reads a system's kind for a badge, it reads `attributes.systemKind` (via `SYSTEM_KINDS`/`SYSTEM_KIND_LABELS`), never the legacy `attributes.kind`; any legacy `kind` read path it touches is repointed to `systemKind`. Read paths this spec does **not** touch stay as-is (their migration remains with the surface owner). | should | `system-augmentation-model` STATUS.md consolidated-report line 3 |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | New label/edges are added **only** through the ontology-manager runtime registry (XD-01); **no** edits to the compile-time `NODE_LABELS` (`shared/src/schema/nodes.ts`) or the frozen `EDGE_ENDPOINTS` const (`shared/src/schema/edges.ts`) for `Capability` or the **four** new edge types (`NEEDS_CAPABILITY`, `SUPPORTED_BY`, `ASSIGNED_TO_CONTEXT`, `CAPABILITY_IN_MODEL`). **B-01: this spec does not touch `model-workspace-core`'s `IN_MODEL` edge at all** — no endpoint-pair addition, no const edit, no generic write to it (it is a lifecycle edge guarded by `409 model_lifecycle_route_required`); model membership rides this spec's own `CAPABILITY_IN_MODEL` type. No new store — capability/mapping data lives in **Neo4j** (XD-02). | XD-01, XD-02, resolves B-01 |
| NFR-02 | **Model isolation**: capability reads (FR-04 list/detail), gap analysis (FR-07), and context map (FR-09) are scoped by resolving each capability **through its own `CAPABILITY_IN_MODEL` edge** (FR-02d) — the authoritative membership key — not through the `NEEDS_CAPABILITY` source (B-02: a source may be an orphan activity outside `scopedNodeIds`, which would drop the capability). `model-workspace-core`'s `scopedNodeIds(driver, :modelId)` helper is still consumed (not re-implemented) to validate that a `needed-by` mapping target belongs to the model (FR-05) and to compute the gap analysis over the model's activities. A read for model A never returns a capability whose `CAPABILITY_IN_MODEL` edge points at model B. `System`/`BoundedContext` are intentionally global (shared infrastructure), so the same system/context may appear in two models' analyses. | XD-06, `model-workspace-core` FR-18, `story-spec-core` NFR-02, resolves B-02 |
| NFR-03 | **Augmentation-vocabulary reuse (XD-15)**: `systemKind` values are read from `System.attributes.systemKind` and rendered via the `SYSTEM_KINDS`/`SYSTEM_KIND_LABELS`/`systemKindSchema` module (`shared/src/schema/system-kind.ts`, owned by `system-augmentation-model`); the literal strings `"functional"`/`"agentic"`/`"ai_predictive"` and their human labels appear **nowhere else** in this spec's production source (import only). No per-feature kind field is invented (XD-15). | XD-15 |
| NFR-04 | **Bounded-contexts surface is read-and-extend, never re-specced (XD-05)**: this spec consumes the existing `BoundedContext` label, the `Entity`-`PART_OF`-`BoundedContext` / `UPSTREAM_OF` / `DOWNSTREAM_OF` structure, and the `GET /api/v1/ontology/bounded-contexts` read route (`api/src/routes/ontology-bounded-contexts.ts`). It **adds** capability→context assignment on top; it does **not** create, edit, delete, or reseed bounded contexts or their inter-context relationships (that CRUD is out of scope). | XD-05 |
| NFR-05 | House rules: `zod` is the only validation library; no `tsc` (transpile via `bun run typecheck`); en-US identifiers (`capability`, `boundedContext`, `neighbors`); server binds loopback `127.0.0.1:8787`; auth via the central router gate + `api/src/auth/` only; all routes under `/api/v1/`. | CLAUDE.md |
| NFR-06 | PWA styling is tokens-only (`var(--…)` from `tokens.css`); components come from the existing CSS-Module catalog before new ones; `scripts/design-conformance.ts` passes on every touched view (UX-02). Desktop-first, no new breakpoints (UX-04). | UX-02, UX-04 |
| NFR-07 | Gap analysis (FR-07) + context map (FR-09) each complete a single model's read in a bounded number of Cypher round-trips (no per-capability N+1 fan-out) and return in < 500 ms for a model with ≤ 500 activities / ≤ 200 capabilities on the dev stack; both are pure reads (no writes, safe to poll on view refetch). **(N-03) This budget is a design / perf-hygiene target, not an AC-gated assertion** — no AC exercises the 500 ms number; the AC-gated obligation is the *shape* (bounded round-trips / no N+1), which design proves in the Cypher and the integration tests exercise for correctness. If a perf smoke is wanted later it is additive. | house perf hygiene, N-03 |

## UI/UX Requirements

**Views owned by this spec** (from the blueprint View Tree, verbatim):

| Route | View component | Nav surface | States specced (loading·empty·error·ready) |
|-------|----------------|-------------|---------------------------------------------|
| `#/model/systems` | `SystemModeler` | Model tab (topbar surf-nav + subnav — registered by `model-workspace-core`) | all four — AC-14 (loading), AC-15 (empty), AC-16 (error), AC-10/AC-11/AC-12/AC-13 (ready) |

This spec **replaces** the `ModelTabPlaceholder` `model-workspace-core` registered
for the `systems` tab; it does **not** touch `route.ts` (`model-workspace-core`
owns it) beyond the `renderView` dispatch of the `systems` tab to `SystemModeler`.

**UX allowance conformance** (reference blueprint UX-*; do not re-decide):

| Allowance | How this spec satisfies it |
|-----------|---------------------------|
| UX-01 view states | AC-10..AC-16 cover SystemModeler loading/empty/error/ready |
| UX-02 design system (tokens-only, catalog components, design-conformance passes) | FR-12, NFR-06; AC-17 runs `scripts/design-conformance.ts` |
| UX-03 input modes (canvas/gesture tables) | n/a — SystemModeler is a list/panel/form surface (no canvas, no custom gestures; the context map renders as a grouped list/table, **not** a drag-canvas — see Risk 4). The Platforms & Input Modes + Native Conflicts tables below are populated to record this explicitly (the view still has keyboard/mouse/trackpad interactions and text inputs). |
| UX-04 responsiveness | NFR-06 — desktop-first, no new breakpoints |
| UX-05 accessibility | AC-18 — keyboard reachability of list/detail/mapping controls, focus order in the detail panel, ARIA landmark on the view; `systemKind` conveyed by badge **text** not color alone |
| UX-06 navigation (routes verbatim, deep links + active-model survive reload) | FR-12 (verbatim route), FR-14 (refetch on model change + reload survival); AC-19 (deep link + active model → correct modeler after reload) |

## Scope Boundaries

**In scope:**
- `Capability` runtime registry label (XD-01).
- `NEEDS_CAPABILITY` (`Activity|UserStory → Capability`), `SUPPORTED_BY`
  (`Capability → System`), `ASSIGNED_TO_CONTEXT` (`Capability → BoundedContext`),
  and this spec's own `CAPABILITY_IN_MODEL` (`Capability → BusinessModel`) scoping
  edge — all via the runtime registry. (B-01: this spec does **not** add a pair to
  `model-workspace-core`'s lifecycle `IN_MODEL` edge; `CAPABILITY_IN_MODEL` is its
  own type.)
- Capability + mapping REST CRUD, model-scoped, with cascade delete.
- Support-gap analysis (unsupported steps, capabilities without systems, orphan
  systems, augmentation mix per capability) — read aggregate.
- Context map (model capabilities joined to the existing bounded-contexts
  surface) — read aggregate.
- `capability:read`/`capability:write` permissions + route mappings; grant to
  `business_architect`.
- `SystemModeler` view at `#/model/systems` with all four states, capability
  detail/edit, mapping editing, gap + context-map panels, `systemKind` badges.
- The `systemKind` shadow-`kind` read-path repoint **where SystemModeler touches
  system rendering** (FR-15, carried from `system-augmentation-model`).

**Out of scope (owner named):**
- **Bounded-context CRUD** (create/edit/delete `BoundedContext`, `Entity`,
  `UPSTREAM_OF`/`DOWNSTREAM_OF` relationships) — the surface **exists**
  (`api/src/routes/ontology-bounded-contexts.ts` + `bounded-contexts-spec.ts`);
  this spec reads and assigns capabilities to it (XD-05), it does not re-spec it.
- **`systemKind` schema, enforcement, migration, badges/filter on
  `#/explorer/systems`** → `system-augmentation-model` (foundation; this spec
  imports the vocabulary).
- **`System` label / `USES_SYSTEM` edge CRUD** → graph-core (consumed; FR-08
  reads `USES_SYSTEM`, does not author it).
- **`UserStory`/`AcceptanceCriterion` CRUD + bootstrap** → `story-spec-core`
  (consumed; capabilities map to its stories/activities).
- **Key-activity scoring/marking** → `key-activity-optimizer`.
- **KPI/impact links, coverage matrix, roll-up vs measurements** →
  `kpi-impact-mapping`.
- **Performance dashboard, slicing analytics by systemKind** →
  `kpi-okr-performance-dashboards`.
- **`route.ts` / `SURFACES` edits, active-model context, model CRUD,
  `scopedNodeIds` helper** → `model-workspace-core` (consumed).
- **Export document assembly** (system map into MD/JSON) → `requirements-export`.
- **Prescriptive recommendations** (which capability to build, which system to
  buy) — the analysis is **descriptive** (gaps + mix), consistent with XD-11's
  descriptive stance; suggestions are deferred to the chat surface.
- **Capability derivation / "generate candidate capabilities from
  activities/journeys" bootstrap (closes former OQ-3 — C-03):** explicitly **out
  of scope**. Unlike `story-spec-core`'s generate-then-edit story bootstrap
  (XD-09, a mechanical projection of graph structure), a `Capability` is a
  modeling judgment, not a derivation of an activity; deriving candidates is not
  in this feature's blueprint scope line and would enlarge an already-`large`
  spec. Capability authoring here is **manual-only** (create via FR-04, map via
  FR-05). A derive-capabilities on-ramp, if ever wanted, is an additive endpoint +
  empty-state action (no schema change) and belongs to a follow-up, not this spec.

## Acceptance Criteria

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | `Capability` registers through the ontology-manager registry and appears in `GET /api/v1/schema`; `NODE_LABELS` in `shared/src/schema/nodes.ts` is unchanged; re-running registration is idempotent (no duplicate label rows) (FR-01, NFR-01) | server (bun test + Neo4j) | `api/__tests__/capability-labels.integration.test.ts` |
| AC-02 | `NEEDS_CAPABILITY` (both `Activity→Capability` and `UserStory→Capability` pairs), `SUPPORTED_BY` (`Capability→System`), `ASSIGNED_TO_CONTEXT` (`Capability→BoundedContext`), and `CAPABILITY_IN_MODEL` (`Capability→BusinessModel`) register through `createEdgeType` with endpoint pairs as `_OntologyEdgeEndpoint` rows (the frozen `EDGE_ENDPOINTS` const unchanged); a wrong pair (e.g. `SUPPORTED_BY` from `Capability→Role`) returns `400 edge_endpoint_label_mismatch`; the test also asserts **no** `Capability→BusinessModel` pair was added to `IN_MODEL` (B-01 — the lifecycle edge is untouched) (FR-02, NFR-01) | server (bun test + Neo4j) | `api/__tests__/capability-edges.integration.test.ts` |
| AC-03 | Capability CRUD round-trips under `/api/v1/models/:modelId/capabilities`: create → 201 + UUIDv7 id + a `CAPABILITY_IN_MODEL` edge to `:modelId`'s `BusinessModel` (B-01/B-02 — written at create even with no mapping yet); a create against an unknown `:modelId` → `404 model_not_found`; list scoped to the model with counts; detail embeds needed-by sources, supporting systems (with `systemKind`), and assigned context; PATCH preserves omitted fields; DELETE → 204 (FR-04) | server (bun test + Neo4j) | `api/__tests__/capability-crud.integration.test.ts` |
| AC-04 | Mapping routes round-trip (FR-05): `PUT .../needed-by {activityId}` and `{storyId}` each create a `NEEDS_CAPABILITY` edge (idempotent — a repeat is a no-op, not 409); `PUT .../supported-by {systemId}` creates `SUPPORTED_BY`; `PUT .../context {boundedContextId}` sets `ASSIGNED_TO_CONTEXT` and re-`PUT`ting a different context replaces the prior edge (at-most-one, FR-03); each `DELETE` removes its edge; an unknown capability/system/context → the matching `404 *_not_found` (FR-05, FR-03, FR-10) | server (bun test + Neo4j) | `api/__tests__/capability-mapping.integration.test.ts` |
| AC-05 | Deleting a capability cascades: all its `NEEDS_CAPABILITY`/`SUPPORTED_BY`/`ASSIGNED_TO_CONTEXT`/`CAPABILITY_IN_MODEL` edges are gone in one transaction (no dangling edges); the far-end `Activity`/`UserStory`/`System`/`BoundedContext`/`BusinessModel` nodes are **not** deleted (FR-06) | server (bun test + Neo4j) | `api/__tests__/capability-cascade.integration.test.ts` |
| AC-06 | Support-gap analysis (FR-07, FR-08): seed a model where activity X has a capability supported by a system, activity Y has a `USES_SYSTEM` but no capability, activity Z has neither, capability C has no system, and system S is used but mapped to no capability. `GET /api/v1/models/:modelId/system-model/gaps` returns: Z in `unsupportedSteps`, Y in `capabilityGaps` (supported via `USES_SYSTEM`, unmodeled), C in `capabilitiesWithoutSystem`, S in `orphanSystems`; X is not flagged (FR-07, FR-08) | server (bun test + Neo4j) | `api/__tests__/system-gap-analysis.integration.test.ts` |
| AC-06b | **Orphan-source scoping (B-02):** seed a capability whose **only** `NEEDS_CAPABILITY` source is an activity that is **not** `PART_OF` any of the model's domains (i.e. **not** in `scopedNodeIds(modelId)`), created via `POST` so it carries a `CAPABILITY_IN_MODEL` edge. It **still appears** in `GET .../capabilities` and in the gap analysis for that model (resolved via `CAPABILITY_IN_MODEL`, not via source-in-`scopedNodeIds`) — proving the capability is not silently dropped (FR-06 note, NFR-02) | server (bun test + Neo4j) | `api/__tests__/capability-model-scope.integration.test.ts` |
| AC-07 | Augmentation mix (FR-07d): a capability supported by two `functional`, one `agentic`, and one `ai_predictive` system reports per-kind counts `{functional:2, agentic:1, ai_predictive:1}` and shares; the model-level roll-up sums correctly; kinds are read from `System.attributes.systemKind` via `SYSTEM_KINDS` (no re-declared literals) (FR-07, NFR-03) | server (bun test + Neo4j) | `api/__tests__/system-gap-analysis.integration.test.ts` |
| AC-08 | Context map (FR-09): assign two model-scoped capabilities to `BC1 Product Catalogue` and one to `BC4 Pricing & Markdown`, leave one unassigned. `GET /api/v1/models/:modelId/system-model/context-map` groups capabilities under BC1/BC4 (with each context's existing `domain`/`subdomain`), surfaces the pre-existing `UPSTREAM_OF`/`DOWNSTREAM_OF` relationships between them **with the far context's `id` (not only `name`)** so a relationship deep-links (C-01), and returns the unassigned capability in the `unassigned` bucket; no `BoundedContext`/relationship is created or mutated (FR-09, NFR-04) | server (bun test + Neo4j) | `api/__tests__/context-map.integration.test.ts` |
| AC-09 | Model isolation (NFR-02): seed two models each with their own activities+capabilities; `GET /api/v1/models/:modelA/capabilities` and `.../system-model/gaps` return only model-A capabilities (resolved through each capability's `CAPABILITY_IN_MODEL` edge) and **exclude** every capability whose `CAPABILITY_IN_MODEL` points at model B; the test asserts a capability id is **not** itself a member of `scopedNodeIds` (proving isolation rides `CAPABILITY_IN_MODEL`, not `PART_OF` membership); a shared `System` may appear in both models' analyses; router gate enforces the new permissions — a session without `capability:write` gets 403 on `POST/PUT/PATCH/DELETE`, a `capability:read` session gets 200 on GETs, `business_architect` resolves both `capability:*`; the `:capabilityId` route resolves to the right permission despite its sub-routes (C-04 ordering); new routes + error codes appear in `GET /api/v1/openapi.json`; no new route is `public` (NFR-02, FR-10, FR-11) | server (bun test + Neo4j) | `api/__tests__/capability-model-scope.integration.test.ts` + `api/__tests__/capability-authz.test.ts` + `api/__tests__/capability-openapi.integration.test.ts` |
| AC-10 | `#/model/systems` resolves to `SystemModeler` (not `ModelTabPlaceholder`); it reads the active model from `useActiveModel()` and renders the ready-state capability list with, per capability, its needed-by source count, supporting systems as `systemKind` badges, and assigned context name (FR-12 ready, FR-14) | macOS Chrome (mouse+kb), macOS Safari (trackpad+kb) | `pwa/src/__tests__/system-modeler.test.tsx` |
| AC-11 | The support-gap panel renders the four FR-07 categories (unsupported steps, capability gaps, capabilities without systems, orphan systems) with counts and deep-link affordances into the relevant capability/activity; the augmentation-mix summary renders per-kind coverage using `systemKind` badges (FR-12, FR-07) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/system-modeler-gaps.test.tsx` |
| AC-12 | The context-map panel groups the model's capabilities under their assigned bounded contexts (with the unassigned bucket) and shows the inter-context relationships read from the bounded-contexts surface (FR-12, FR-09) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/system-modeler-context-map.test.tsx` |
| AC-13 | Selecting a capability opens the detail panel with name/description, needed-by sources, supporting systems (each with a `systemKind` badge), and assigned context; editing the capability PATCHes; add/remove needed-by, add/remove supporting system, set/clear context call the FR-05 routes and update the panel; a mapping with an unresolved far-end shows the "detached" indicator (FR-13) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/system-modeler-detail.test.tsx` |
| AC-14 | SystemModeler renders a loading skeleton while its capability/gap/context-map fetches are pending (FR-12, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/system-modeler-states.test.tsx` |
| AC-15 | With no capabilities in the active model, SystemModeler shows the empty state offering a "New capability" action (and, when the model has activities/stories, a hint to start mapping); creating a capability POSTs and it appears (FR-12 empty, FR-04) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/system-modeler-states.test.tsx` |
| AC-16 | When a SystemModeler fetch fails, the view shows the error state with a retry affordance that refetches (FR-12, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/system-modeler-states.test.tsx` |
| AC-17 | `scripts/design-conformance.ts` passes on `SystemModeler.tsx` + its CSS module (tokens-only, catalog components incl. reused `Pill` for `systemKind`) (NFR-06, UX-02) | CLI | manual: run `bun run scripts/design-conformance.ts --view pwa/src/views/model/SystemModeler.tsx` — expect exit 0, zero token/component violations reported |
| AC-18 | SystemModeler is keyboard-reachable: Tab reaches the "New capability" control and the capability list in DOM order; opening a capability detail moves focus into the panel and Escape/close returns it; mapping controls (add/remove needed-by/system, set/clear context) are reachable and activatable by keyboard; `systemKind` badges carry text labels (not color-only); the view exposes an ARIA landmark (FR-12, FR-13, UX-05) | macOS Chrome (keyboard), macOS Safari (keyboard) | manual: with the stack up, load `#/model/systems`, keyboard-only: Tab to "New capability" and activate with Enter, Tab into the capability list, Enter to open a capability — expect focus enters the detail panel, moves through the mapping controls in order, each `systemKind` badge shows its text label, and Escape returns focus to the originating list row |
| AC-19 | Deep link + active model survive reload: with model B active, navigate to `#/model/systems`, reload — expect the same route renders `SystemModeler` showing **model B's** capabilities/gaps/context-map (active-model persistence is `model-workspace-core`'s FR-15; this view refetches for the persisted model) (FR-14, UX-06) | macOS Chrome (mouse+kb) | `pwa/playwright/system-modeler-context.spec.ts` |
| AC-20 | The `systemKind` read path SystemModeler uses reads `attributes.systemKind` via `SYSTEM_KINDS`/`SYSTEM_KIND_LABELS`; grep shows this spec's production source declares no `systemKind` literal outside imports of `shared/src/schema/system-kind.ts`; any legacy `attributes.kind` read path SystemModeler touches is repointed to `systemKind` (FR-15, NFR-03) | server (bun test) + CLI | `pwa/src/__tests__/system-modeler-kind.test.tsx` + manual: `git grep -n '"agentic"\|"ai_predictive"' pwa/src/views/model/SystemModeler.tsx` — expect no matches (literals only in the imported vocabulary module) |
| AC-21 | Transpile is clean and no compile-time schema arrays were edited for the new label / **four** new edge types (`NEEDS_CAPABILITY`, `SUPPORTED_BY`, `ASSIGNED_TO_CONTEXT`, `CAPABILITY_IN_MODEL`) (NFR-01, NFR-05) | CLI | `bun run typecheck` exit 0; manual: `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts` shows no additions to `NODE_LABELS` or `EDGE_ENDPOINTS` (incl. **no** `IN_MODEL` endpoint-pair change — B-01) |

## Platforms & Input Modes

This spec touches `pwa/` (the `SystemModeler` view + its dispatch in `renderView`,
and the FR-15 `systemKind` read-path repoint). It ships **no** canvas, custom
gesture, scroll-container, or global keyboard handler — SystemModeler is a
list/panel/form surface reusing catalog components (`Card`, `DataTable`, `Pill`,
`Modal`, `SidePanel`) and native form controls. The context map renders as a
**grouped list/table**, not a drag-canvas (Risk 4). The tables are populated to
record this explicitly (it still has keyboard/mouse/trackpad interaction and text
inputs).

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| Capability list + row selection | yes | yes | yes | yes | standard list/row activation; row → detail panel |
| Support-gap panel (categories + deep links) | yes | yes | yes | yes | read-only lists with deep-link affordances; no gesture |
| Context-map panel (grouped list + relationships) | yes | yes | yes | yes | grouped list/table, not a drag-canvas |
| Capability detail panel (edit; add/remove needed-by, systems, context) | yes | yes | yes | yes | catalog `SidePanel`/`Modal`; native form inputs + select/combobox for mapping targets; Escape closes |
| New-capability / mapping controls | yes | yes | yes | yes | standard buttons + forms |
| `systemKind` badges | yes | yes | yes | n/a | non-interactive text pills (catalog `Pill`) |
| Canvas / drag / pinch-zoom gestures | no | no | no | no | none introduced — no canvas surface in this spec |

## Native Conflicts

SystemModeler introduces **no new gesture, scroll-hijack, drag, or global keyboard
handler**. It uses native buttons, native text inputs / selects, and catalog
`Modal`/`SidePanel` components (whose focus-trap + Escape behavior already exist in
the catalog and are reused, not re-implemented). The context map is a grouped
list/table (no drag), so no scroll or drag behavior needs suppressing. There is
therefore no native behavior to suppress beyond what the reused catalog components
already handle.

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| Modal/SidePanel focus trap + Escape-to-close | (reused catalog behavior) | n/a — provided by the existing catalog `Modal`/`SidePanel`; this spec reuses, does not re-implement or override |
| (no new gesture / scroll / drag / global-keyboard handling introduced) | n/a | n/a |

## Dependencies

> **Hard build-order dependency.** This spec's model-scoped routes and view
> consume **new files owned by `model-workspace-core`** (foundation wave 1) and
> `story-spec-core` (foundation wave 2) — several do not exist on disk at this
> spec's authoring time and are verifiable only after those specs merge. This spec
> **cannot start implementation** until: **`model-workspace-core`
> FR-18 → `api/src/storage/model-scope.ts`** (`scopedNodeIds` /
> `scopedWhereFragment`); **FR-15 → `pwa/src/context/ActiveModelContext.tsx`**
> (`ActiveModelProvider` + `useActiveModel` + persistence); **FR-11 →
> `api/src/scripts/seed-rbac-roles.ts`** (`business_architect` role/persona);
> **FR-17 → `pwa/src/views/model/ModelTabPlaceholder.tsx`** + the `systems` slot in
> `pwa/src/views/index.tsx` `renderView` (which this spec replaces); the
> `BusinessModel` root + `scopedNodeIds` regime (targets/inputs of this spec's own
> `CAPABILITY_IN_MODEL` scoping, **not** the reused `IN_MODEL` lifecycle edge —
> B-01) — and **`story-spec-core`** has landed its `UserStory` label + model-scoped
> stories (so `NEEDS_CAPABILITY` from `UserStory` and the mapping-target validation
> join are well-defined). This is correct wave-3 sequencing, not missing scope.

- **`model-workspace-core`** (foundation wave 1): consumed, never re-specced.
  - `scopedNodeIds(driver, modelId)` / `scopedWhereFragment`
    (`api/src/storage/model-scope.ts`) — model-scoped reads (FR-04, FR-07, FR-09,
    NFR-02).
  - `BusinessModel` root — the **target** of this spec's own `CAPABILITY_IN_MODEL`
    edge (FR-02d), which scopes every capability (mechanism note under FR-06).
    B-01: this spec does **not** reuse or extend `model-workspace-core`'s lifecycle
    `IN_MODEL` edge (guarded by `409 model_lifecycle_route_required`, its FR-08); it
    only reads the `BusinessModel` root node the `:modelId` path param resolves to.
  - `business_architect` RBAC role + persona (`api/src/scripts/seed-rbac-roles.ts`)
    — this spec adds `capability:*` to it (FR-11).
  - Model surface shell + `route.ts`/`SURFACES` registration + `ModelTabPlaceholder`
    for the `systems` tab — replaced by `SystemModeler` (FR-12).
  - Shell-owned active-model context + `useActiveModel()`
    (`pwa/src/context/ActiveModelContext.tsx`) — consumed by SystemModeler (FR-12,
    FR-14).
- **`story-spec-core`** (foundation wave 2): `UserStory` label + model-scoped
  stories (`NEEDS_CAPABILITY` from `UserStory`). **B-02:** a capability's *model
  membership* rides its own `CAPABILITY_IN_MODEL` edge, **not** a story/activity
  join; the `DESCRIBES_ACTIVITY`-through-`scopedNodeIds` resolution (story-spec-core
  NFR-02) is consumed only to **validate a `needed-by` mapping target** belongs to
  the model (FR-05). `story-spec-core`'s registry-registration + model-scoped route
  patterns are the template this spec mirrors.
- **`system-augmentation-model`** (foundation wave 1, **implemented**): the
  `SYSTEM_KINDS` / `SystemKind` / `systemKindSchema` / `SYSTEM_KIND_LABELS`
  vocabulary (`shared/src/schema/system-kind.ts`) — read + rendered for
  `systemKind` badges and augmentation mix (FR-07, FR-12, FR-13, NFR-03). This
  spec also inherits its consolidated-report line 3 (the shadow-`kind` read-path
  repoint, FR-15).
- **Bounded-contexts surface** (as-built): the `BoundedContext` label,
  `Entity`-`PART_OF`-`BoundedContext` / `UPSTREAM_OF` / `DOWNSTREAM_OF`
  structure, and `GET /api/v1/ontology/bounded-contexts`
  (`api/src/routes/ontology-bounded-contexts.ts`, `bounded-contexts-spec.ts`) —
  **read + assigned to** (XD-05, NFR-04), never re-specced.
- **ontology-manager runtime registry** (`createNodeLabel`, `createEdgeType`,
  `_OntologyEdgeEndpoint`, `assertEndpointLabelsExist`): the only sanctioned path
  for the `Capability` label + the **four** new edge types (`NEEDS_CAPABILITY`,
  `SUPPORTED_BY`, `ASSIGNED_TO_CONTEXT`, `CAPABILITY_IN_MODEL`) (XD-01).
- **graph-core storage primitives + registry-backed edge-endpoint validator**
  (`api/src/storage/edges.ts` validating against `_OntologyEdgeEndpoint`; the
  compile-time `EDGE_ENDPOINTS` const is off-limits), `USES_SYSTEM` edge (read by
  FR-08), UUIDv7 ids, `DETACH DELETE` cascade pattern.
- **Central router gate** (`api/src/router.ts`) + `ROUTE_PERMISSIONS`
  (`api/src/auth/rbac-permissions.ts`): all new routes dispatched + auth-gated
  here; no per-route auth.
- **OpenAPI generation** (`api/src/routes/openapi.ts`) + `ERROR_CODES`
  (`api/src/errors.ts`).
- **PWA shell + catalog** (`pwa/src/views/index.tsx` `renderView`,
  `pwa/src/components/{Card,DataTable,Pill,Modal,SidePanel}.tsx`, `tokens.css`,
  `scripts/design-conformance.ts`).

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | **OQ-1 — mapping cardinality — CLOSED (C-02; FR-03).** Was: should `SUPPORTED_BY` be many-to-many or exactly-one, and a capability in one bounded context or several? | Decides the shape of the gap/mix analysis and the mapping UI. | **Decided (settled in FR-03, no longer open):** `NEEDS_CAPABILITY` + `SUPPORTED_BY` are **many-to-many** (partial/overlapping coverage is real and the augmentation-mix analysis needs it); `ASSIGNED_TO_CONTEXT` is **at most one** (DDD norm); `CAPABILITY_IN_MODEL` is **exactly one**. Under single-shot (XD-17) this default *is* the decision. If the user later wants one-owning-system, `SUPPORTED_BY` gains a duplicate check and augmentation mix degenerates to one kind per capability. |
| 2 | **OQ-2 — raw `USES_SYSTEM` vs capability path — CLOSED (C-02; FR-08).** Was: does the gap analysis count a raw `Activity -USES_SYSTEM-> System` as "supported", or only the capability path? | Decides whether existing system usage counts as coverage, and whether "unmodeled capability" is a distinct gap category. | **Decided (settled in FR-08, no longer open):** an activity is **supported** if it reaches a system via **either** path; an activity supported only by raw `USES_SYSTEM` is surfaced as a distinct **"capability gap"**. Under single-shot this default is the decision. Alternative (capability-path-only) rejected: it flags already-supported steps as unsupported. |
| 3 | **OQ-3 — capability bootstrap — CLOSED out-of-scope (C-03).** Was: offer a "derive candidate capabilities" bootstrap like story-spec-core, or manual-only? | On-ramp effort; scope size on an already-`large` spec. | **Closed: manual-only, derivation explicitly out of scope** (named line in Scope Boundaries). A capability is a modeling judgment, not a mechanical activity projection; derivation is not in the blueprint scope line and would enlarge the spec. If ever wanted it is an additive endpoint + empty-state action for a follow-up — it cannot creep in at design time. |
| 1a | **B-01 — RESOLVED — `IN_MODEL` lifecycle-guard collision.** Rev-1 overloaded `model-workspace-core`'s lifecycle `IN_MODEL` edge to scope capabilities; that edge rejects generic writes with `409 model_lifecycle_route_required` (its FR-08). | Would have blocked this spec's create path or silently punched a dependency's guard. | **Resolved in rev 2:** this spec registers its **own** `CAPABILITY_IN_MODEL` edge type (FR-02d), written by its own capability routes — no `IN_MODEL` touch, no coordinated change to `model-workspace-core`. See FR-02, FR-04, FR-06 note, NFR-01. |
| 2a | **B-02 — RESOLVED — `scopedNodeIds` over-statement + orphan-activity gap.** Rev-1 mis-stated the helper's set and resolved membership through the `NEEDS_CAPABILITY` source, dropping capabilities whose only source is an orphan activity (outside `scopedNodeIds`). | Isolation ACs could pass while real capabilities vanish from the modeler. | **Resolved in rev 2:** FR-06 note restates the helper's actual set (`Domain` + `PART_OF*` descendants + `ModuleInstance`s; `System`/`Role`/`Location` excluded) and makes `CAPABILITY_IN_MODEL` the authoritative membership key, written at create for **every** capability incl. orphan-sourced ones. AC-06b proves it. |
| 3a | **C-01 — RESOLVED — context-relationship identity.** The bounded-contexts route emits inter-context relationships as `{ type, target: name }` — name-keyed, insufficient for deep-linking. | Context-map deep-links between contexts need stable ids. | **Resolved in rev 2:** FR-09 runs this spec's own Neo4j read resolving each `UPSTREAM_OF`/`DOWNSTREAM_OF` target to `{ type, targetId, targetName }`; AC-08 asserts the `id` is present. |
| 4 | **Context-map rendering — list vs graph canvas.** FR-09/AC-12 render the context map. A node-link **graph canvas** (react-flow, like `JourneyCanvas`) would be richer but introduces gestures/drag → the Platforms & Input Modes + Native Conflicts tables would need full canvas rows and the spec would promote further into gesture territory. | Scope creep into canvas/gesture handling; input-mode complexity. | **Default (recorded in UX-03 + Platforms table): grouped list/table**, not a drag-canvas — keeps the Native Conflicts table free of new gestures and the spec within list/panel/form input modes. A canvas rendering is explicitly deferred; if added later the input-mode tables must be re-opened (and it likely reuses the `JourneyCanvas`/react-flow pattern per blueprint Risks). |
| 5 | **`System`/`BoundedContext` are global, not model-scoped.** A `SUPPORTED_BY`/`ASSIGNED_TO_CONTEXT` target is shared across models (FR-06 note, NFR-02). | A system's kind or a context's shape edited elsewhere changes every model's analysis. | **Accepted by design** — systems and bounded contexts are shared infrastructure (they predate the multi-model regime; XD-12 migrates only the process graph into Model #1). The analyses read them live; no per-model copy. Flagged so reviewers do not mistake it for a leak. |
| 6 | **Registry-label additions vs. compile-time expectations** (blueprint Risks row 7). | Some legacy code may assume fixed `NODE_LABELS`/`EDGE_ENDPOINTS`. | NFR-01/AC-21 forbid editing those consts; `nodeReadSchema.label`/`edgeCreateSchema.type` are already `z.string()` and the endpoint validator is registry-backed — `story-spec-core` + `model-workspace-core` proved this path end-to-end for their labels. |
| 7 | **N-01 (design item) — capability storage home.** Capability + mapping writes likely live in a dedicated `api/src/storage/capabilities.ts` (mirroring `story-spec-core`'s `stories.ts`) rather than the generic node primitives, since model-scoped membership + cascade need bespoke Cypher. | Cosmetic placement / design detail. | Design confirms the storage module split and whether gap/context-map reads live in a sibling `api/src/storage/system-model.ts`. Not a requirements blocker. |
| 8 | **N-02 (design item) — `NEEDS_CAPABILITY` two-endpoint-pair on one edge type vs two edge types.** FR-02 registers `Activity→Capability` and `UserStory→Capability` as two `_OntologyEdgeEndpoint` rows on **one** `NEEDS_CAPABILITY` type. | Query/validator ergonomics. | Design confirms one-type-two-pairs is supported by `createEdgeType` (it is — `NEEDS_CAPABILITY`-style multi-pair rows exist for graph-core `PART_OF`). If not, split into `ACTIVITY_NEEDS_CAPABILITY` / `STORY_NEEDS_CAPABILITY`; ACs are written to the one-type default. Not a requirements blocker. |
