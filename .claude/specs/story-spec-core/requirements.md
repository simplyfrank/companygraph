---
feature: "story-spec-core"
created: "2026-07-04"
author: "spec-author"
status: "revised"
revision: 3
revised: "2026-07-04"
size: "large"
---

<!-- rev 3: responds to review-requirements.md pass 2 — resolves B-03 (XD-18
     cited + closed by AC-19 + conformance row), C-06 (activityId scope check on
     create/re-point, new error code story_activity_not_in_model, AC-08 negative
     write), C-07 (pinned-module boundary stated in Scope Boundaries), N-04
     (real tokens.css path), N-05 (status field no longer anticipates review). -->

# Requirements: story-spec-core

## Summary

`story-spec-core` is **foundation wave 2** of the Business Modeling Studio
(blueprint `.claude/specs/blueprint.md`). It makes **user stories** and their
**acceptance criteria** first-class citizens of the process graph. It introduces
two new runtime ontology labels — `UserStory` and `AcceptanceCriterion` (the
latter carrying **structured Given/When/Then** per XD-10) — plus the edges that
tie a story to the graph structure it describes (its `Activity`, and the `Role`
that executes it) and an acceptance criterion to its story. It ships REST CRUD
for both under `/api/v1/`, and a **generate-then-edit bootstrap** (XD-09) that
derives stories + ACs from a model's graph structure **server-side** (a faithful
port of the client-side `pwa/src/lib/userStories.ts` derivation) and persists
them as **editable** nodes — the derivation is the on-ramp, not a read-only view.
Finally it ships the **StoryCatalog** view at `#/model/stories`, scoped to the
active `BusinessModel`, with all four view states.

It builds directly on `model-workspace-core` (foundation wave 1), reusing its
runtime-registry label/edge path, its `scopedNodeIds(driver, modelId)`
model-scope helper, its `IN_MODEL` scoping regime, its Business Architect
persona/RBAC role, its Model surface shell + `route.ts` registration, and its
shell-owned active-model context (`useActiveModel()`). It does **not** re-spec
any of those.

It **does not** ship KPI/impact links (`kpi-impact-mapping`), capabilities or
system mapping (`ddd-system-modeling`), or the authoring wizard/canvas
(`business-model-authoring`). Story↔KPI edges, capability links, and the
multi-step authoring UX are explicitly out of scope with named owners below.

## Motivation

1. The studio's north star (blueprint Summary) is "the complete specification of
   a business" expressed as **first-class user stories with Given/When/Then
   acceptance criteria**. Today stories exist only as an ephemeral, client-side
   derivation (`pwa/src/lib/userStories.ts`, 53 lines, not persisted, not
   editable, not exported). To be a specification they must be **graph citizens**:
   persisted, addressable, editable, versionable with the model, and
   exportable (`requirements-export` depends on them).
2. Every wave-3+ feature that "reads the spec" needs a stable story/AC surface:
   `key-activity-optimizer` ranks the activities stories point at,
   `kpi-impact-mapping` attaches KPI impact to stories, `ddd-system-modeling`
   maps stories → capabilities → systems, and `requirements-export` assembles
   stories + ACs into the exported document. All of them consume this spec's
   labels + REST surface; none should re-derive stories themselves.
3. XD-09 fixes the on-ramp: rather than force authors to write every story by
   hand, one click **derives** a first draft from the graph structure already in
   the model (activities, the roles that execute them, the systems/locations they
   touch) and persists **editable** nodes. Keeping today's derived behavior as a
   generate-then-edit bootstrap is the sanctioned path (rejected: author-only).
4. XD-10 fixes the AC shape: acceptance criteria are **structured
   Given/When/Then**, not free text — so they are machine-checkable, export
   cleanly into requirements docs, and seed future test scaffolds (rejected: free
   text; rejected: both).
5. The studio needs a home for stories. The blueprint View Tree assigns
   `#/model/stories` → `StoryCatalog` to this spec; `model-workspace-core`
   already registered that route (as a placeholder) and owns `route.ts`. This
   spec replaces the placeholder with the real view, scoped to the active model.

## Functional Requirements

<!-- Priorities: must = M1 walking-skeleton / downstream dependency; should = polish. -->

### Graph domain model — UserStory + AcceptanceCriterion labels (XD-01, XD-10)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **`UserStory` label** registered as a **runtime ontology label** via the ontology-manager registry (`createNodeLabel`, `_OntologyNodeLabel`) — **NOT** as a compile-time `NODE_LABELS` addition in `shared/src/schema/nodes.ts`. Carries the standard node envelope (`id` UUIDv7 server-generated, `name`, `description`, `createdAt`, `updatedAt`, open `attributes`) plus attributes `{ persona: string, action: string, benefit: string, narrative: string, derived: boolean, sourceActivityId: string }` where `narrative` is the assembled "As a `persona`, I want to `action`, so that `benefit`." sentence and `derived:true` marks a bootstrap-generated node not yet hand-edited. Registration is **idempotent** (safe to re-run against an existing registry — MERGE-on-name semantics of the registry path). | must | XD-01, XD-09 |
| FR-02 | **`AcceptanceCriterion` label** registered via the same registry path. Carries the standard envelope plus **structured Given/When/Then** attributes `{ given: string, when: string, then: string, ordinal: int, derived: boolean }` (XD-10). `given`/`when`/`then` are each required non-empty strings on a persisted AC; `ordinal` orders ACs within a story (1-based). Registration is idempotent. **Free-text ACs are not accepted** — the boundary zod schema (FR-08) requires all three clauses. | must | XD-01, XD-10 |
| FR-03 | **Story→structure edges** registered via the ontology-manager **edge-type** registry (`createEdgeType`), with endpoint pairs written as `_OntologyEdgeEndpoint` rows (the compile-time `EDGE_ENDPOINTS` const in `shared/src/schema/edges.ts` is **off-limits** — validation is registry-only via the T-13 endpoint cache): `DESCRIBES_ACTIVITY` (`UserStory → Activity`, the activity the story is about) and `STORY_FOR_ROLE` (`UserStory → Role`, the executing role/persona). **Cardinality (decision, resolves C-01):** on the story→structure side, each `UserStory` has **exactly one** `DESCRIBES_ACTIVITY` and **at most one** `STORY_FOR_ROLE`. On the reverse (activity→story) side, an `Activity` may be the `DESCRIBES_ACTIVITY` target of **zero or more** stories (`1..*`), i.e. manual authoring permits several stories per activity (different personas/paths). The bootstrap (FR-09) is idempotent per-activity: it skips any activity that already has **≥1** story, and never double-derives — but this is a bootstrap-skip rule, **not** a hard 1:1 uniqueness constraint on the graph. `story_duplicate_for_activity` (FR-10) is therefore **reserved, not thrown** under this default (see FR-10). A wrong endpoint pair returns `400 edge_endpoint_label_mismatch` (reusing the graph-core validator). | must | XD-01, XD-09 |
| FR-04 | **AC→story edge** `ACCEPTANCE_OF` (`AcceptanceCriterion → UserStory`) registered via the edge-type registry with its `_OntologyEdgeEndpoint` row. Every persisted `AcceptanceCriterion` has exactly one `ACCEPTANCE_OF` edge to its parent story; deleting a story cascades to its ACs (FR-07). | must | XD-01, XD-10 |

### Story + AC REST surface

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-05 | **Story CRUD** under `/api/v1/models/:modelId/stories` (model-scoped path, following the `model-workspace-core` route convention): `POST` (create → 201 + UUIDv7 id; body carries `{ persona, action, benefit, activityId, roleId? }`; server assembles `narrative` and creates the `DESCRIBES_ACTIVITY` (+ optional `STORY_FOR_ROLE`) edges; `derived:false`), `GET` (list all stories in the model — see the model-scoping mechanism below — so model A never returns model B's stories; each item carries its activity id/name, optional role id/name, and its AC count), `GET /:storyId` (detail incl. embedded ACs ordered by `ordinal`), `PATCH /:storyId` (update `persona`/`action`/`benefit`/`description`/`attributes` and re-point `activityId`/`roleId`; re-assembles `narrative`; never clobbers omitted fields; clears `derived` to `false` on any hand edit), `DELETE /:storyId` (→ 204, cascades its ACs and its own edges). All zod-validated at the boundary; consistent `{error:{code,message,details?}}` envelope. **Write-side scope check (resolves C-06):** on `POST` (create) and on `PATCH` re-point, the supplied `activityId` must be a member of `scopedNodeIds(driver, :modelId)` — an out-of-scope activity id (e.g. an activity belonging only to another model) returns `404 story_activity_not_in_model` (added to FR-10's additive code set), so a story can never be created **through model A's route** that then surfaces in model B's list. `roleId` needs **no** membership check: `Role` nodes are global reference nodes (`model-workspace-core` DEC-01(a)), not model-scoped. | must | XD-09, XD-18, `model-workspace-core` FR-05 route pattern |
| FR-06 | **AC CRUD** under `/api/v1/models/:modelId/stories/:storyId/acceptance-criteria`: `POST` (create → 201; body `{ given, when, then, ordinal? }` — all three clauses required; server appends `ordinal = max+1` when omitted; creates the `ACCEPTANCE_OF` edge), `GET` (list ordered by `ordinal` ASC), `PATCH /:acId` (update any of `given`/`when`/`then`/`ordinal`; clears `derived`), `DELETE /:acId` (→ 204). The parent story must exist and belong to `:modelId` (else `404 story_not_found`); an AC id not under the named story returns `404 acceptance_criterion_not_found`. | must | XD-10 |
| FR-07 | **Cascade + referential integrity**: deleting a `UserStory` (FR-05 `DELETE`) removes its `AcceptanceCriterion` children and all edges across its **three participating edge types** — `DESCRIBES_ACTIVITY`, `STORY_FOR_ROLE`, and the `ACCEPTANCE_OF` edge from each of its ACs — in a **single Cypher `DETACH DELETE` transaction** over `(story)` + `(:AcceptanceCriterion)-[:ACCEPTANCE_OF]->(story)` (the graph-core cascade pattern), so "single transaction / no orphan ACs / no dangling edges" is a storage-primitive guarantee, not N per-edge `DELETE /api/v1/edges/:id` round-trips (resolves N-03, C-05). Deleting the `Activity` a story `DESCRIBES_ACTIVITY` is **out of this spec's write surface** (activities are edited via graph-core routes); a story whose activity was deleted elsewhere renders with a "detached" indicator in the view (FR-13) and is not itself deleted. | must | XD-10, data integrity |

> **Model-scoping mechanism (resolves B-01).** Stories and ACs are **not**
> themselves members of `scopedNodeIds(driver, modelId)`. That helper
> (`model-workspace-core` design §4.2) returns only **structural** ids —
> `Domain`/`UserJourney`/`Activity`/`ModuleInstance` reachable from the model
> root via `IN_MODEL` + `PART_OF*`. A `UserStory` attaches to its `Activity` via
> `DESCRIBES_ACTIVITY` (not `PART_OF`) and an `AcceptanceCriterion` via
> `ACCEPTANCE_OF`, so neither id will ever appear in that set. The isolation
> invariant this spec relies on is therefore resolved **through the activity**:
>
> - A `UserStory` is in model A **iff** its `DESCRIBES_ACTIVITY` target
>   `Activity` ∈ `scopedNodeIds(driver, modelA)`.
> - An `AcceptanceCriterion` is in model A **iff** its parent story (via
>   `ACCEPTANCE_OF`) is in model A.
>
> Every model-scoped read (FR-05 list, FR-06 list), the cascade (FR-07), and the
> bootstrap scope (FR-09) resolve through the **activity** membership set, not
> through story-id membership. The list query joins: collect the scoped activity
> ids for `:modelId`, then match `(s:UserStory)-[:DESCRIBES_ACTIVITY]->(a:Activity)`
> `WHERE a.id IN $scopedActivityIds`. `Activity` **is** a member of
> `scopedNodeIds` (it is `PART_OF*` a domain under `IN_MODEL`), so this join is
> well-defined. (Design defines the exact Cypher; requirements fix the invariant.)

### Generate-then-edit bootstrap (XD-09)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-08 | **Server-side derivation** (`api/src/storage/story-derive.ts`) — a faithful port of the client `pwa/src/lib/userStories.ts` logic. For a given model it reads the model-scoped graph structure (`Activity`s whose id ∈ `scopedNodeIds(driver, :modelId)`, the `Role`s that `EXECUTES` each activity, the `System`s each activity `USES_SYSTEM`, the `Location`s via `AT_LOCATION`, and **each activity's parent `UserJourney` via `PART_OF`** — the journey name is resolved **per-activity**, not per-model, since a model has many journeys) and computes, per activity, a candidate story: `persona = primaryRole?.name ?? "user"`, `action = activity.name`, `benefit = "the <journeyName lower-cased> workflow completes"` where `<journeyName>` is that activity's parent journey; `narrative = "As a <persona>, I want to <action>, so that <benefit>."` (the exact `formulateUserStories` formulation). **Orphan fallback (resolves C-03):** an activity with **no** parent `UserJourney` yields `benefit = "the workflow completes"` (no journey token), keeping derivation **total**. **Deterministic primary selection (resolves B-02 tiebreak):** the client's order-dependent "primary role/location = `[0]`" is made deterministic on the server by selecting the primary `Role` (and `Location`) as the candidate with the **lowest `createdAt`, then lowest `id`** as tiebreak; this ordering is the contract the parity harness (NFR-04/AC-06) constructs its fixture to agree with. This module is **pure derivation** (no writes) and unit-testable against a fixture without Neo4j on the read shape it is handed. | must | XD-09 |
| FR-09 | **Bootstrap endpoint** `POST /api/v1/models/:modelId/stories/bootstrap` runs FR-08's derivation over the activities in `scopedNodeIds(driver, :modelId)` and **persists editable nodes**: for each derived candidate whose `Activity` has **no existing `DESCRIBES_ACTIVITY` story** (the activity→story-count-is-zero skip rule per FR-03's `1..*` cardinality — resolves C-01), it `createNode`s a `UserStory` with `derived:true`, wires `DESCRIBES_ACTIVITY` (+ `STORY_FOR_ROLE` when a primary role exists), and creates a **derived starter AC** (`given:"the <journey> preconditions are met"`, `when:"the <role> performs <activity>"`, `then:"the <journey> workflow advances"`, `ordinal:1`, `derived:true`) wired `ACCEPTANCE_OF` — where `<journey>` uses the activity's per-activity parent journey (FR-08), falling back to the article-free "the workflow" phrasing when the activity is orphaned. It is **idempotent**: re-running never creates a second story for an activity that already has **≥1** story (`{ created: N, skipped: M }` in the response; `skipped` counts activities with an existing story). Persisted nodes are ordinary editable stories/ACs (FR-05/FR-06) — editing one clears its `derived` flag. Optional body `{ activityIds?: string[] }` scopes the bootstrap to specific activities (each must be a scoped activity of `:modelId`; default: whole model). | must | XD-09, XD-18 |

### API contract

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-10 | Every route in FR-05, FR-06, FR-09 is mounted under `/api/v1/`, zod-validated at the boundary, and appears in `GET /api/v1/openapi.json` (generated from the same zod definitions — no hand-maintained copy). New error codes are added to the closed `ERROR_CODES` enum (`api/src/errors.ts`) as **additive** (non-breaking) changes: at minimum `story_not_found`, `acceptance_criterion_not_found`, `story_activity_required` (body `activityId` **missing**), `story_activity_not_in_model` (supplied `activityId` present but **not** ∈ `scopedNodeIds(:modelId)` — the FR-05 create/re-point write-side scope check, resolves C-06), and `acceptance_criterion_clause_required` (a missing `given`/`when`/`then`). **`story_duplicate_for_activity` is reserved but NOT thrown under this spec's default cardinality (resolves C-01):** FR-03 decides activity→story is `1..*` (manual create allows multiple stories per activity; bootstrap skips activities with ≥1 story), so no live route emits it. It is listed here only as a reserved additive code for a future hard-1:1 toggle; ACs/tests are written to the `1..*` default and do not assert it. If the user later wants hard 1:1, FR-05 `POST` gains a duplicate check that throws it. | must | `model-workspace-core` FR-13, NFR-11 |
| FR-11 | **Route-permission mapping**: every new `/api/v1/models/:modelId/stories*` route registered in `api/src/auth/rbac-permissions.ts` (`ROUTE_PERMISSIONS`) with a new `story:read` (GETs) / `story:write` (POST/PATCH/DELETE/bootstrap) permission and correct specific-before-parameterized ordering (the AC sub-routes and `bootstrap` before the `:storyId` parameterized rows). The `business_architect` RBAC role (seeded by `model-workspace-core` FR-11) gains `story:read` + `story:write` in `api/src/scripts/seed-rbac-roles.ts` (idempotent MERGE). Auth is enforced **only** by the central router gate (`api/src/router.ts`) + `api/src/auth/` — no per-route auth check (house rule). No new route is `public`. These grants are what makes the **Business Architect persona write path** (blueprint XD-18) real: the persona's RBAC role must resolve `story:write` end-to-end through the gate (closed by AC-19). | must | house rule, XD-08, XD-18 |

### PWA — StoryCatalog view (blueprint View Tree, UX-*)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-12 | **StoryCatalog view** (`pwa/src/views/model/StoryCatalog.tsx`, route `#/model/stories` — taken **verbatim** from the blueprint View Tree) **replaces** the `ModelTabPlaceholder` that `model-workspace-core` registered for the `stories` tab in `pwa/src/views/index.tsx` `renderView`. It reads the active `BusinessModel` from the shell-owned context (`useActiveModel()`; it does **not** re-implement model selection) and lists that model's stories from `GET /api/v1/models/:modelId/stories`, each row showing narrative, the linked activity name, the role, and AC count. It specs **all four view states**: **loading** (skeleton while the fetch is in flight), **empty** (no stories yet — offers the "Generate from graph" bootstrap action and manual create), **error** (fetch failed — retry affordance), **ready** (list rendered). Tokens-only styling via `var(--…)` from `pwa/src/styles/companygraph/tokens.css` (real path — resolves N-04); catalog components (`Card`, `DataTable`, `Modal`, `SidePanel`) before inventing new ones; `scripts/design-conformance.ts` passes on the view + its CSS module. | must | Blueprint View Tree, UX-01, UX-02, UX-06 |
| FR-13 | **Story detail + edit + AC editing** in StoryCatalog: selecting a story opens a detail panel (catalog `SidePanel`/`Modal`) showing the assembled narrative, the linked activity/role, and its ACs as **Given/When/Then triples**; the panel supports edit (PATCH story), add/edit/delete/reorder ACs (FR-06 routes), delete story, and a per-story **"Generate from graph"** action (FR-09 bootstrap scoped to that story's activity). A `derived:true` story/AC shows a "derived" badge; a hand edit clears it. A story whose `DESCRIBES_ACTIVITY` target no longer resolves shows a **"detached"** indicator (FR-07). All controls are keyboard-reachable (UX-05). | must | XD-09, XD-10, UX-01, UX-05 |
| FR-14 | **Model-scoped catalog + reload survival**: StoryCatalog only ever shows the active model's stories; switching the active model (via the shell context) refetches for the new model; deep-linking `#/model/stories` and reloading re-renders the catalog for the persisted active model (the persistence + reconciliation is `model-workspace-core`'s FR-15; this view consumes it and refetches on model change). No cross-model leakage in the list (server-enforced by FR-05's model-scoping mechanism — stories are resolved through their `DESCRIBES_ACTIVITY` activity's membership in `scopedNodeIds`, per the note under FR-07; stories are not themselves in the scoped set). | must | UX-06, `model-workspace-core` FR-15 |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | New labels/edges are added **only** through the ontology-manager runtime registry (XD-01); **no** edits to the compile-time `NODE_LABELS` (`shared/src/schema/nodes.ts`) or the frozen `EDGE_ENDPOINTS` const (`shared/src/schema/edges.ts`) for `UserStory`/`AcceptanceCriterion`/the three new edge types (`DESCRIBES_ACTIVITY`, `STORY_FOR_ROLE`, `ACCEPTANCE_OF`); no new store — story/AC data lives in **Neo4j** (XD-02). | XD-01, XD-02, NFR of `model-workspace-core` |
| NFR-02 | **Model isolation (resolves B-01)**: story/AC reads (FR-05 list, FR-06 list) are scoped by resolving each story **through its `DESCRIBES_ACTIVITY` activity's membership** in `model-workspace-core`'s `scopedNodeIds(driver, :modelId)` helper (consumed, not re-implemented) — a `UserStory` is in model A iff its activity ∈ `scopedNodeIds(modelA)`; an `AcceptanceCriterion` is in model A iff its parent story is. Stories/ACs are **not** themselves members of `scopedNodeIds` (they attach via `DESCRIBES_ACTIVITY`/`ACCEPTANCE_OF`, not `PART_OF`), so filtering by story-id membership would return the empty set — see the mechanism note under FR-07. A read for model A never returns a story/AC whose activity belongs only to model B. Bootstrap (FR-09) only derives from and writes into the named model's scoped activity set. | XD-06, `model-workspace-core` FR-18 |
| NFR-03 | **Structured-AC invariant** (XD-10): no persisted `AcceptanceCriterion` exists without all three of `given`/`when`/`then`; the boundary zod schema is the single enforcement point and rejects free-text or partial ACs with `400 acceptance_criterion_clause_required`. | XD-10 |
| NFR-04 | **Derivation fidelity via a defined projection (resolves B-02)** (XD-09): the client `formulateUserStories(data: JourneyData, journeyName)` consumes a **column-indexed** shape (roles/systems/locations attach to activities by shared `column` numbers; "primary role" = first by column membership) while the server derivation (FR-08) reads a **Neo4j structural** shape (`EXECUTES`/`USES_SYSTEM`/`AT_LOCATION`/`PART_OF` edges, no `column` concept). These two functions **cannot literally share one input object**. Fidelity is therefore specified as a **parity harness with an explicit projection**: (1) a single **canonical structural fixture**; (2) a documented, deterministic **mapping** from that fixture to each function's input shape (the graph read shape for `deriveStories`, a `JourneyData` projection for `formulateUserStories`); (3) a **specified deterministic tiebreak** — primary role/location = lowest `createdAt` then lowest `id` (FR-08) — and the `JourneyData` projection is **constructed so client column-order agrees with that server tiebreak**. Under that construction, `deriveStories(structuralFixture)` and `formulateUserStories(projectedFixture, journeyName)` yield **equal `narrative` strings** per activity and the same primary role/location. Bit-for-bit parity is asserted against this parity-fixture, **not** against arbitrary client input (whose column-order primary is not otherwise stable). Design owns the exact mapping + fixture; requirements fix that the assertion is well-defined. | XD-09 |
| NFR-05 | House rules: `zod` is the only validation library; no `tsc` (transpile via `bun run typecheck`); en-US identifiers; server binds loopback `127.0.0.1:8787`; auth via the central router gate + `api/src/auth/` only; all routes under `/api/v1/`. | CLAUDE.md |
| NFR-06 | PWA styling is tokens-only (`var(--…)` from `pwa/src/styles/companygraph/tokens.css` — resolves N-04); components come from the existing CSS-Module catalog before new ones; `scripts/design-conformance.ts` passes on every touched view (UX-02). Desktop-first, no new breakpoints (UX-04). | UX-02, UX-04 |

## UI/UX Requirements

**Views owned by this spec** (from the blueprint View Tree, verbatim):

| Route | View component | Nav surface | States specced (loading·empty·error·ready) |
|-------|----------------|-------------|---------------------------------------------|
| `#/model/stories` | `StoryCatalog` | Model tab (topbar surf-nav + subnav — registered by `model-workspace-core`) | all four — AC-12 (loading), AC-13 (empty), AC-14 (error), AC-10/AC-11 (ready) |

This spec **replaces** the `ModelTabPlaceholder` `model-workspace-core` registered
for the `stories` tab; it does **not** touch `route.ts` (`model-workspace-core`
owns it) beyond the `renderView` dispatch of the `stories` tab to `StoryCatalog`.

**UX allowance conformance** (reference blueprint UX-*; do not re-decide):

| Allowance | How this spec satisfies it |
|-----------|---------------------------|
| UX-01 view states | AC-10..AC-14 cover StoryCatalog loading/empty/error/ready |
| UX-02 design system (tokens-only, catalog components, design-conformance passes) | FR-12, NFR-06; AC-15 runs `scripts/design-conformance.ts` |
| UX-03 input modes (canvas/gesture tables) | n/a — StoryCatalog is a list/detail/form surface (no canvas, no custom gestures). The Platforms & Input Modes + Native Conflicts tables below are populated to record this explicitly (the view still has keyboard/mouse/trackpad interactions and text inputs). |
| UX-04 responsiveness | NFR-06 — desktop-first, no new breakpoints |
| UX-05 accessibility | AC-16 — keyboard reachability of list/detail/edit controls, focus order in the detail panel, ARIA landmark on the view |
| UX-06 navigation (routes verbatim, deep links + active-model survive reload) | FR-12 (verbatim route), FR-14 (refetch on model change + reload survival); AC-17 (deep link + active model → correct catalog after reload) |
| **XD-18 verification mandate** (blueprint: "domain experts can model key activities per role end-to-end" proven by **explicit ACs** in this spec + `business-model-authoring`; this spec owns the **story-surface half** — the Business Architect persona write path through the story-per-role surface; `business-model-authoring` FR-05/AC-06 owns the `EXECUTES`-core half) | **AC-19** (explicit end-to-end closing AC: real `business_architect` session through the router gate → bootstrap over `Role-EXECUTES-Activity` structure → `STORY_FOR_ROLE` per executing role → hand-edit clears `derived`); supporting coverage: AC-06/AC-07 (derivation from `EXECUTES` structure), AC-09 (permission resolution), AC-11 (UI edit). Cited in FR-05/FR-09/FR-11 Source. Resolves B-03 |

## Scope Boundaries

**In scope:**
- `UserStory` + `AcceptanceCriterion` runtime registry labels (Given/When/Then structured ACs).
- `DESCRIBES_ACTIVITY`, `STORY_FOR_ROLE`, `ACCEPTANCE_OF` edges via the runtime registry.
- Story + AC REST CRUD, model-scoped, with cascade delete.
- Server-side generate-then-edit bootstrap (port of `userStories.ts`) creating editable persisted nodes; idempotent.
- `story:read`/`story:write` permissions + route mappings; grant to `business_architect`.
- `StoryCatalog` view at `#/model/stories` with all four states, detail/edit, per-story + per-model bootstrap.

**Out of scope (owner named):**
- **Story ↔ KPI impact links** (`DRIVES_KPI`/`userStoryKPI`, direction+weight) → `kpi-impact-mapping`. **Join-key boundary note (resolves C-04):** the pre-existing `userStoryKPI` link schema (`shared/src/schema/kpi-sla.ts`, "Links KPIs to user stories") predates any real `UserStory` node. This spec introduces the first real `UserStory` label; **this spec's `UserStory.id` (UUIDv7) is the identity that `kpi-impact-mapping`'s existing `userStoryKPI` link will attach to.** `kpi-impact-mapping` must join on this id — it must **not** invent a parallel story identity. No schema change here; flagged so the downstream owner reuses the id.
- **Capabilities and story→capability→system mapping** → `ddd-system-modeling`.
- **Authoring wizard / ModelCanvas** (multi-step domains→journeys→activities×roles→stories authoring UX; blank/retail template flows) → `business-model-authoring`. This spec provides the story/AC CRUD + bootstrap those flows call, not the wizard.
- **Key-activity scoring/marking** → `key-activity-optimizer`.
- **Export document assembly** (stories+ACs into MD/JSON) → `requirements-export`.
- **`route.ts` / `SURFACES` edits, active-model context, model CRUD, `scopedNodeIds` helper** → owned by `model-workspace-core`; this spec consumes them.
- **Deletion/repair of stories whose activity was deleted elsewhere** — surfaced as a "detached" indicator (FR-13), not auto-reconciled here.
- **Stories for activities inside non-forked `ModuleInstance`s (resolves C-07).** A non-forked module instance's journey content is **not** live nodes — it lives in the pinned version's `snapshot_json` (per `api/src/storage/model-scope.ts`'s own header, mwc N-04), so those activities are not members of `scopedNodeIds` and cannot carry a `DESCRIBES_ACTIVITY` edge. Consequence, stated as intended behavior: stories/ACs attach **only to materialized activities** (in-model or forked); pinned non-forked module content is out of story reach until the module is **forked** (fork surface owned by `model-workspace-core` FR-08). Bootstrap (FR-09) therefore reports such activities in neither `created` nor `skipped` — they are simply outside the scoped set; a model built entirely from pinned modules bootstraps to `{created:0, skipped:0}`. Design should have the StoryCatalog empty state / bootstrap response hint at "fork first, then generate" when the model has module instances but no materialized activities.

## Acceptance Criteria

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | `UserStory` + `AcceptanceCriterion` register through the ontology-manager registry and appear in `GET /api/v1/schema`; `NODE_LABELS` in `shared/src/schema/nodes.ts` is unchanged; re-running registration is idempotent (no duplicate label rows) (FR-01, FR-02, NFR-01) | server (bun test + Neo4j) | `api/__tests__/story-labels.integration.test.ts` |
| AC-02 | `DESCRIBES_ACTIVITY`, `STORY_FOR_ROLE`, `ACCEPTANCE_OF` register through `createEdgeType` with endpoint pairs written as `_OntologyEdgeEndpoint` rows (the frozen `EDGE_ENDPOINTS` const unchanged); a wrong endpoint pair (e.g. `DESCRIBES_ACTIVITY` from `UserStory`→`Role`) returns `400 edge_endpoint_label_mismatch` (FR-03, FR-04, NFR-01) | server (bun test + Neo4j) | `api/__tests__/story-edges.integration.test.ts` |
| AC-03 | Story CRUD round-trips under `/api/v1/models/:modelId/stories`: create → 201 + UUIDv7 id + server-assembled `narrative` + `DESCRIBES_ACTIVITY` (and `STORY_FOR_ROLE` when `roleId` given); list scoped to the model; detail embeds ACs ordered by `ordinal`; PATCH preserves omitted fields, re-assembles `narrative`, and flips `derived` to false; DELETE → 204 (FR-05) | server (bun test + Neo4j) | `api/__tests__/story-crud.integration.test.ts` |
| AC-04 | AC CRUD round-trips under `/api/v1/models/:modelId/stories/:storyId/acceptance-criteria`: create requires all three of `given`/`when`/`then` (a missing clause → `400 acceptance_criterion_clause_required`, NFR-03); server appends `ordinal=max+1`; list ordered ASC; PATCH edits a clause; DELETE → 204; a bad parent story → `404 story_not_found` (FR-06, NFR-03, FR-10) | server (bun test + Neo4j) | `api/__tests__/acceptance-criteria-crud.integration.test.ts` |
| AC-05 | Deleting a story cascades: its ACs and all its `DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE`/`ACCEPTANCE_OF` edges are gone in one transaction (no orphan ACs, no dangling edges); the story's `Activity`/`Role` nodes are **not** deleted (FR-07) | server (bun test + Neo4j) | `api/__tests__/story-cascade.integration.test.ts` |
| AC-06 | The server derivation (FR-08) reproduces the client `formulateUserStories` output through the **defined projection** (NFR-04, resolves B-02): a single canonical **structural fixture** is mapped to (a) the graph read shape for `deriveStories` and (b) a `JourneyData` projection (constructed so client column-order matches the server's `createdAt`-then-`id` tiebreak) for `formulateUserStories(projected, journeyName)`; both yield **equal `narrative` strings** per activity and the same primary role/location selection. The fixture is single-journey so the client's one `journeyName` argument is well-defined; a separate case asserts the **orphan-activity fallback** narrative (`"…so that the workflow completes."`) on the server side (FR-08, NFR-04) | server (bun test) | `api/__tests__/story-derive-parity.test.ts` |
| AC-07 | `POST /api/v1/models/:modelId/stories/bootstrap` derives + persists **editable** `UserStory`+starter-AC nodes (`derived:true`) for each activity lacking a story; re-running is idempotent (`{created,skipped}`, no doubles); an optional `{activityIds}` scopes it; a persisted derived story then PATCHes normally and its `derived` flag clears (FR-09, XD-09) | server (bun test + Neo4j) | `api/__tests__/story-bootstrap.integration.test.ts` |
| AC-08 | Model isolation (resolves B-01): seed two models each with their own activities+stories; `GET /api/v1/models/:modelA/stories` returns model-A stories (those whose `DESCRIBES_ACTIVITY` activity ∈ `scopedNodeIds(modelA)`) and **excludes** every story whose activity belongs only to model B; the test also asserts a story id is **not** itself a member of `scopedNodeIds` (proving isolation is resolved through the activity join, not story-id membership); bootstrap on model A derives only from model-A scoped activities; **write-side (resolves C-06):** `POST /api/v1/models/:modelA/stories` with a model-B-only `activityId` (and a `PATCH` re-pointing an existing model-A story to it) is rejected with `404 story_activity_not_in_model` and creates/moves nothing — model B's list is unchanged after both attempts (FR-05, FR-09, FR-10, NFR-02) | server (bun test + Neo4j) | `api/__tests__/story-model-scope.integration.test.ts` |
| AC-09 | Router gate enforces the new permissions: a session without `story:write` gets 403 on `POST /api/v1/models/:id/stories` and on `.../bootstrap`; with `story:write`, 201/200; a `story:read` session gets 200 on the list GET; the `business_architect` role resolves both `story:*` permissions; no new route is `public`; new routes + error codes appear in `GET /api/v1/openapi.json` (FR-10, FR-11) | server (bun test) | `api/__tests__/story-authz.test.ts` + `api/__tests__/story-openapi.integration.test.ts` |
| AC-10 | `#/model/stories` resolves to `StoryCatalog` (not `ModelTabPlaceholder`); it reads the active model from `useActiveModel()` and renders the ready-state list with narrative, linked activity name, role, and AC count for each story (FR-12 ready, FR-14) | macOS Chrome (mouse+kb), macOS Safari (trackpad+kb) | `pwa/src/__tests__/story-catalog.test.tsx` |
| AC-11 | Selecting a story opens the detail panel with the narrative, activity/role, and ACs as Given/When/Then triples; editing the story PATCHes and clears the `derived` badge; adding/editing/deleting an AC calls the FR-06 routes and updates the panel; a `derived:true` node shows the derived badge; a story with an unresolved activity shows the "detached" indicator (FR-13) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/story-detail.test.tsx` |
| AC-12 | StoryCatalog renders a loading skeleton while `GET /api/v1/models/:id/stories` is pending (FR-12, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/story-catalog-states.test.tsx` |
| AC-13 | With no stories in the active model, StoryCatalog shows the empty state offering the "Generate from graph" bootstrap action and a manual create affordance; triggering bootstrap POSTs `.../bootstrap` and the derived stories appear (FR-12 empty, FR-09) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/story-catalog-states.test.tsx` |
| AC-14 | When `GET /api/v1/models/:id/stories` fails, StoryCatalog shows the error state with a retry affordance that refetches (FR-12, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/story-catalog-states.test.tsx` |
| AC-15 | `scripts/design-conformance.ts` passes on `StoryCatalog.tsx` + its CSS module (tokens-only, catalog components) (NFR-06, UX-02) | CLI | manual: run `bun run scripts/design-conformance.ts --view pwa/src/views/model/StoryCatalog.tsx` — expect exit 0, zero token/component violations reported |
| AC-16 | StoryCatalog is keyboard-reachable: Tab reaches the bootstrap/create controls and the story list in DOM order; opening a story detail moves focus into the panel and Escape/close returns it; the view exposes an ARIA landmark (FR-12, FR-13, UX-05) | macOS Chrome (keyboard), macOS Safari (keyboard) | manual: with the stack up, load `#/model/stories`, keyboard-only: Tab to "Generate from graph" and activate with Enter, Tab into the list, Enter to open a story — expect focus enters the detail panel, moves through AC edit controls in order, and Escape returns focus to the originating list row |
| AC-17 | Deep link + active model survive reload: with model B active, navigate to `#/model/stories`, reload — expect the same route renders `StoryCatalog` showing **model B's** stories (active-model persistence is `model-workspace-core`'s FR-15; this view refetches for the persisted model) (FR-14, UX-06) | macOS Chrome (mouse+kb) | `pwa/playwright/story-catalog-context.spec.ts` |
| AC-18 | Transpile is clean and no compile-time schema arrays were edited for the two new labels / three new edge types (NFR-01, NFR-05) | CLI | `bun run typecheck` exit 0; manual: `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts` shows no additions to `NODE_LABELS` or `EDGE_ENDPOINTS` |
| AC-19 | **XD-18 story-surface path, end-to-end (resolves B-03):** seed a model with `(:Role)-[:EXECUTES]->(:Activity)` structure (≥2 activities, distinct executing roles); as a session bound to the **Business Architect persona** (`business_architect` RBAC role — a real session through the central router gate, not a synthetic permission stub), run `POST /api/v1/models/:modelId/stories/bootstrap` → expect one `derived:true` story per activity, each with `DESCRIBES_ACTIVITY` to its activity and `STORY_FOR_ROLE` to its **executing** role, each with a starter Given/When/Then AC; then `PATCH` one story's starter AC (edit a clause) as the same session → expect 200 and the AC's `derived` flag clears. Proves a domain expert with the Business Architect persona can model key activities per role end-to-end through the story surface (FR-05, FR-09, FR-11; supporting coverage: AC-06, AC-07, AC-09, AC-11) | server (bun test + Neo4j) | `api/__tests__/story-xd18-role-path.integration.test.ts` |

## Platforms & Input Modes

This spec touches `pwa/` (the `StoryCatalog` view + its dispatch in `renderView`).
It ships **no** canvas, custom gesture, scroll-container, or global keyboard
handler — StoryCatalog is a list/detail/form surface reusing catalog components
(`Card`, `DataTable`, `Modal`, `SidePanel`) and native form controls. The tables
are populated to record this explicitly (it still has keyboard/mouse/trackpad
interaction and text inputs).

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| StoryCatalog list + row selection | yes | yes | yes | yes | standard list/row activation; row → detail panel |
| Story detail panel (edit story, add/edit/delete/reorder ACs) | yes | yes | yes | yes | catalog `SidePanel`/`Modal`; native form inputs (text for narrative parts + G/W/T clauses); Escape closes |
| Bootstrap / create controls | yes | yes | yes | yes | standard buttons; POST bootstrap / open create form |
| Canvas / drag / pinch-zoom gestures | no | no | no | no | none introduced — no canvas surface in this spec |

## Native Conflicts

StoryCatalog introduces **no new gesture, scroll-hijack, drag, or global keyboard
handler**. It uses native buttons, native text inputs, and catalog
`Modal`/`SidePanel` components (whose focus-trap + Escape behavior already exist
in the catalog and are reused, not re-implemented). AC reorder, if implemented via
drag, must not hijack page scroll — but the default/spec'd reorder is up/down
buttons (keyboard-reachable per AC-16), so no drag handler is required. There is
therefore no native behavior to suppress beyond what the reused catalog components
already handle.

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| Modal/SidePanel focus trap + Escape-to-close | (reused catalog behavior) | n/a — provided by the existing catalog `Modal`/`SidePanel`; this spec reuses, does not re-implement or override |
| (no new gesture / scroll / drag / global-keyboard handling introduced) | n/a | n/a |

## Dependencies

> **Hard build-order dependency (resolves C-02).** The surfaces below are **new
> files owned by `model-workspace-core`** — none exists on disk at this spec's
> authoring time; they are verifiable only after that spec merges. This spec
> **cannot start implementation** until the following `model-workspace-core` FRs
> land: **FR-18 → `api/src/storage/model-scope.ts`** (`scopedNodeIds` /
> `scopedWhereFragment`); **FR-15 → `pwa/src/context/ActiveModelContext.tsx`**
> (`ActiveModelProvider` + `useActiveModel` + persistence); **FR-11 →
> `api/src/scripts/seed-rbac-roles.ts`** (the `business_architect` role + persona);
> **FR-17 → `pwa/src/views/model/ModelTabPlaceholder.tsx`** + the `stories` slot in
> `pwa/src/views/index.tsx` `renderView` (which this spec replaces). This is
> correct foundation-wave-2 sequencing, not missing scope.

- **`model-workspace-core`** (foundation wave 1 — this spec's declared dependency): consumed, never re-specced.
  - `scopedNodeIds(driver, modelId)` / `scopedWhereFragment` (`api/src/storage/model-scope.ts`) — model-scoped reads (FR-05, FR-06, NFR-02).
  - `IN_MODEL` scoping regime + `BusinessModel` root (FR-05 model-scoped routes).
  - `business_architect` RBAC role + persona (`api/src/scripts/seed-rbac-roles.ts`) — story-spec adds `story:*` to it (FR-11).
  - Model surface shell + `route.ts`/`SURFACES` registration + `ModelTabPlaceholder` for the `stories` tab — replaced by `StoryCatalog` (FR-12).
  - Shell-owned active-model context + `useActiveModel()` (`pwa/src/context/ActiveModelContext.tsx`) — consumed by StoryCatalog (FR-12, FR-14).
- **ontology-manager runtime registry** (`api/src/ontology/storage/{node-labels,edge-types}.ts` — `createNodeLabel`, `createEdgeType`): the only sanctioned path for the two labels + three edge types (XD-01).
- **graph-core storage primitives + registry-backed edge-endpoint validator** (`api/src/storage/edges.ts` validating against `_OntologyEdgeEndpoint`; the compile-time `EDGE_ENDPOINTS` const is off-limits): create/patch/delete nodes+edges, endpoint-label whitelist, UUIDv7 ids.
- **Client derivation source** (`pwa/src/lib/userStories.ts`, `formulateUserStories` + `JourneyData` shape from `pwa/src/components/JourneyCanvas.tsx`): the reference the server port (FR-08) reproduces and the parity test (AC-06) compares against.
- **Central router gate** (`api/src/router.ts`) + `ROUTE_PERMISSIONS` (`api/src/auth/rbac-permissions.ts`): all new routes dispatched + auth-gated here; no per-route auth.
- **OpenAPI generation** (`api/src/routes/openapi.ts`) + `ERROR_CODES` (`api/src/errors.ts`).
- **PWA shell + catalog** (`pwa/src/views/index.tsx` `renderView`, `pwa/src/components/{Card,DataTable,Modal,SidePanel}.tsx`, `pwa/src/styles/companygraph/tokens.css`, `scripts/design-conformance.ts`).

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | **OQ-1 — "exactly one story per activity"? — DECIDED (resolves C-01).** The reverse (activity→story) cardinality is no longer open: it is fixed in **FR-03** as `1..*` (manual create allows multiple stories per activity; each story still has exactly one `DESCRIBES_ACTIVITY`). Bootstrap (FR-09) skips any activity with ≥1 existing story — a skip rule, not a graph uniqueness constraint. `story_duplicate_for_activity` is **reserved, not thrown** (FR-10). | Was: decides whether `story_duplicate_for_activity` is a live error path. Now closed in the FRs. | **Decided default recorded in FR-03/FR-09/FR-10.** If the user later wants hard 1:1, the single change is a duplicate check on FR-05 `POST` throwing the reserved code; ACs/tests currently assume `1..*`. No open blocker for design. |
| 2 | **OQ-2 — starter-AC content.** FR-09 generates one derived Given/When/Then starter AC per story from the journey/role/activity names. Is a single generic starter AC the right on-ramp, or should bootstrap generate none (story-only) and let authors add ACs? | Affects how much derived content authors must clean up. | **Decision needed (default: proceed):** *one derived starter AC per story* (gives a non-empty, immediately-editable Given/When/Then to demonstrate the shape). Alternative: story-only bootstrap (ACs authored by hand). Default keeps the "generate-then-edit" spirit of XD-09 strongest; trivial to switch to story-only. |
| 3 | **Port fidelity vs. richer read shape — TIEBREAK SPECIFIED (resolves B-02).** The client `formulateUserStories` works off `JourneyData` (column-indexed, `[0]`-order primary); the server reads real Neo4j structure (no column concept). The two shapes cannot share one input object. | The parity assertion must be well-defined. | **NFR-04 now specifies a parity harness with a defined projection + tiebreak:** server primary role/location = lowest `createdAt` then lowest `id`; the `JourneyData` projection is constructed so client column-order agrees; a single canonical structural fixture maps to both shapes (AC-06). Design owns the exact mapping/fixture; the requirements-level assertion is no longer ambiguous. |
| 4 | **Registry-label additions vs. compile-time expectations** (blueprint Risks row 5). | Some legacy code may assume fixed `NODE_LABELS`/`EDGE_ENDPOINTS`. | NFR-01/AC-18 forbid editing those consts; `nodeReadSchema.label`/`edgeCreateSchema.type` are already `z.string()` (verified), and the endpoint validator is registry-backed — `model-workspace-core` proved this path end-to-end for its own five labels. |
| 5 | **AC reorder UX.** FR-06 has an `ordinal`; FR-13 supports reorder. Drag-reorder would introduce a gesture (Native Conflicts). | Scope creep into gesture handling. | Default reorder is up/down buttons (keyboard-reachable, AC-16) — **no drag handler**, so the Native Conflicts table stays empty of new gestures. Drag reorder is explicitly deferred; if added later it needs the input-mode tables re-opened. |
| 6 | **N-01 (design item) — derivation module home.** FR-08 places pure derivation at `api/src/storage/story-derive.ts` (consistent with the `model-scope.ts` neighbor). | Cosmetic placement. | Design confirms whether pure, I/O-free derivation belongs under `storage/` or a `derive/`/`lib/` sibling. Not a requirements blocker. |
| 7 | **N-02 (tasks item) — AC-15 could be CI, not manual.** AC-15 runs `scripts/design-conformance.ts` as a `manual:` repro, but it is a deterministic CLI with an exit code. | Verification quality. | Tasks may promote AC-15 to an automated CI check instead of a manual repro. Flagged for the tasks phase. |
