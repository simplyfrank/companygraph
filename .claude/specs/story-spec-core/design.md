---
feature: "story-spec-core"
created: "2026-07-04"
author: "spec-author"
status: "revised"
revision: 3
revised: "2026-07-04"
size: "large"
reviewing_requirements_revision: "revised rev 3 (2026-07-04)"
---

<!-- rev 3 (2026-07-04): closes the pass-1 review of design rev 2
     (review-design.md, verdict revise): B-01 → new DD-11 detached-story
     contract (list includes detached rows with `detached:true`; two-shape
     membership gate on detail/PATCH/DELETE; §4.1/§4.2/§5/§8 aligned; the
     AC-11 indicator is now producible end-to-end via a real integration
     seam); C-01 → stale "four codes" fixed to five in §4.9 + §8 AC-09 row;
     C-02 → new DD-12 cardinality enforcement boundary + DISTINCT-hardened
     list query; C-03 → PATCH re-point now `SET s.sourceActivityId` in the
     same tx (§4.2, asserted in §8 AC-03); C-04 → §1.1 rewritten (the
     model-workspace-core dependency has LANDED; interfaces re-verified);
     N-01 → DD-10/§3.3 quote the `edges.ts` pre-check exactly (incl. the
     `input.id !== undefined` short-circuit); N-02 → DD-02 gains the no-role
     starter-AC `when` fallback; N-03 → §4.12 anchors `createSession`
     (`api/src/auth/oauth.ts:151`), not a forward self-reference. No IDs
     renumbered; DD-11/DD-12 are additive. §2.1 D-3 extended with the new
     tasks-phase deltas. -->

<!-- rev 2 (2026-07-04): (a) reconciles the design with requirements REV 3,
     which post-dates design rev 1 — adds the AC-19 / XD-18 end-to-end path
     (§4.12), the fifth additive error code `story_activity_not_in_model` (404,
     DD-08/§3.5), and the pinned-module "fork first" boundary (DD-09, §4.5,
     §4.10); (b) lands every review erratum: design-review C-01 (DD-04/§3.5/§9
     false `envelope.test.ts` rationale corrected), C-02 (parity projection
     wording, §4.5), C-03 (retry lives in StoryCatalog, §4.10/§6), C-04→DD-07
     (bad `roleId` → `404 not_found`), N-01 (`actor` arg, §4.6), N-02 (test-file
     rows, §7), N-03 (§2.1 deviations register); task-review C-02 ("filtered to
     Activity" wording, §4.1/§4.5), C-03 (roleId contract recorded as a design
     decision, DD-07), C-04→DD-10 (edge-id uniqueness scan assumption, §3.3),
     N-01 (swallow `name_conflict` by CODE, §4.6), N-02 (`--view` checks ONLY
     the single file passed — per-file invocations, §4.10/§6/§8). tasks.md
     rev 1 predates this revision — §2.1 lists the deltas the tasks phase must
     pick up. -->

# Design: story-spec-core

> Traces the approved `requirements.md` **rev 3**: FR-01…FR-14, NFR-01…NFR-06,
> AC-01…**AC-19**. Every §-section names the FR/AC it serves; §7 is the
> file-change table (each row → an FR); §8 is the AC→test map. No requirement is
> invented here; where requirements left a **default** open (OQ-2 starter-AC
> content) it is recorded in §2 as a design decision the orchestrator may still
> surface.

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

### 1.1 Dependency status: `model-workspace-core` has landed (Resolves: design-review C-04)

Rev 1/2 recorded a hard "cannot start implementation until `model-workspace-core`
merges" precondition. That is now **stale**: the dependency is on disk, and every
interface this design cites was **re-verified against the real files** at rev-3
authoring time — `scopedNodeIds(driver, modelId): Promise<Set<string>>`
(`api/src/storage/model-scope.ts`), `useActiveModel()`
(`pwa/src/context/ActiveModelContext.tsx`), the `business_architect` seed
(`api/src/scripts/seed-rbac-roles.ts:96`), `ModelTabPlaceholder` + the `stories`
placeholder slot in `pwa/src/views/index.tsx`, and `registerModelSchema` inside
`applySchema` (`api/src/neo4j/bootstrap.ts:63`). Implementation is **unblocked**;
the tasks phase must **not** carry a "blocked on dependency" precondition
(§2.1 D-3).

## 2. Design decisions & prior-review carry-forwards

The requirements review left B-01/B-02/C-01…C-05 (pass 1) and B-03/C-06/C-07
(pass 2 → requirements rev 3) resolved **in the FRs** already. This design
records where each lands, the remaining design-level decisions, the decisions
that closed the rev-1 design-review (C-01…C-04, N-01…N-03) and task-review
(C-02…C-04, N-01…N-02) findings, and — as of rev 3 — the decisions that close
the design-rev-2 review (`review-design.md`): B-01 → DD-11, C-02 → DD-12,
C-01/C-03/C-04/N-01/N-02/N-03 folded into the sections named per finding.

| ID | Decision | Where |
|----|----------|-------|
| DD-01 | **Derivation module home (resolves requirements N-01).** Pure, I/O-free derivation lives at **`api/src/derive/story-derive.ts`**, a new `derive/` sibling — *not* under `storage/` (which is reserved for Neo4j-touching modules). `deriveStories(input)` takes a plain read-shape object and returns candidates; it opens no session. The bootstrap **endpoint** (`api/src/storage/stories.ts`) does the Neo4j read → calls `deriveStories` → does the writes. This keeps the parity unit test (AC-06) Neo4j-free. | §4.5, §7 |
| DD-02 | **Starter-AC content (requirements OQ-2 — recorded default).** Bootstrap generates **one** derived Given/When/Then starter AC per story (`given:"the <journey> preconditions are met"`, `when:"the <role> performs <activity>"`, `then:"the <journey> workflow advances"`, `ordinal:1`, `derived:true`), per FR-09. This is the recorded default (keeps XD-09's "generate-then-edit" spirit strongest); switching to story-only is a one-line change (skip the AC create). **No-role activity (Resolves: design-review N-02):** `persona` falls back to `"user"` (§4.5), so the starter `when` clause is `"the user performs <activity>"` — every clause template is total, matching FR-08's total-derivation guarantee. **The orchestrator may still surface OQ-2 to the user.** | §4.5 |
| DD-03 | **Story/AC domain fields are top-level Neo4j properties, not `attributes_json`** (mirrors `model-workspace-core` rule 2). Enables `ORDER BY ac.ordinal`, `WHERE s.derived`, and `WHERE a.id IN $scopedActivityIds` joins. The generic node primitives stay untouched; `api/src/storage/stories.ts` writes these props directly via parameterized Cypher. `attributes` (the open map) is still stored as `attributes_json` per the node envelope. | §3.1, §3.2 |
| DD-04 | **Activity→story cardinality is `1..*` (requirements C-01, FR-03).** No graph uniqueness constraint on `(activityId)` for `DESCRIBES_ACTIVITY`; manual create allows multiple stories per activity; bootstrap **skips** any activity with ≥1 story (a per-activity skip rule, §4.5). `story_duplicate_for_activity` is **reserved but not thrown** — it is **not** added to `ERROR_CODES` by this spec, **because it would be a dead code** (no route emits it under the `1..*` default) — *not* because any test forbids it: there is **no** `envelope.test.ts`, and no test asserts every `ERROR_CODES` member is thrown by a live route; `api/__tests__/openapi.integration.test.ts` asserts the **opposite** direction (every member appears in the OpenAPI enum), which the omission trivially satisfies (Resolves: design-review C-01). If the user later wants hard 1:1, the single change is a duplicate check on `POST /stories` + adding the code then. | §3.5, §4.2 |
| DD-05 | **`derived` clears on any hand edit (FR-05, FR-06).** `PATCH /stories/:id` and `PATCH …/acceptance-criteria/:acId` always `SET n.derived = false` in the same tx as the field update, regardless of which fields the caller sent (an edit is an edit). This is enforced in the storage function, not the route, so it cannot be bypassed. | §4.2, §4.3 |
| DD-06 | **No `?model=` query param (consistency with `model-workspace-core` C-01/D-1).** All story/AC reads are scoped by the **`:modelId` path param**, never a query param. Model isolation is proven by the `scopedNodeIds` activity-join (§4.1) + the two-model integration test (AC-08). | §4.1, §5 |
| DD-07 | **Bad `roleId` → `404 not_found` with `details.field:"roleId"` (Resolves: design-review C-04, task-review C-03).** A supplied `roleId` that does not resolve to a `Role` node returns the **existing generic `not_found`** — no new `story_role_required` code, and **no reuse of the activity-named `story_activity_required`** for a role failure. `Role` is a **global reference node** (`model-workspace-core` DEC-01(a), requirements FR-05 rev 3), so there is **no model-membership check** on `roleId` — only existence + label. `story_activity_required` is reserved strictly for the *missing/empty `activityId`* precondition. | §3.5, §4.2 |
| DD-08 | **Out-of-scope `activityId` → `404 story_activity_not_in_model` (requirements rev 3, C-06 / FR-05 / FR-10).** On `POST /stories` (create), `PATCH /stories/:id` (re-point), and the bootstrap body's `{activityIds}` narrowing: an `activityId` that is present but does **not** resolve to an `:Activity` whose id ∈ `scopedNodeIds(driver, :modelId)` returns `404 story_activity_not_in_model` (with `details.field` naming the offending field). One Cypher check covers both failure shapes — `MATCH (a:Activity {id:$activityId}) WHERE a.id IN $scoped` misses equally for "not in this model" and "in the scoped set but not an Activity" (the scoped set is unlabeled/mixed, §3.4). This is the **fifth additive error code** (§3.5); it supersedes rev-1's "unscoped → `400 story_activity_required`" wording. A story can therefore never be created through model A's route that surfaces in model B's list (AC-08 write-side). | §3.5, §4.2, §4.5 |
| DD-09 | **Pinned-module boundary: "fork first, then generate" (requirements rev 3, C-07 / Scope Boundaries).** Activities inside **non-forked** `ModuleInstance`s live in the pinned version's `snapshot_json`, are not members of `scopedNodeIds`, and cannot carry a `DESCRIBES_ACTIVITY` edge — they are outside story reach until forked (fork surface: `model-workspace-core` FR-08). Bootstrap counts them in **neither** `created` nor `skipped`; a model built entirely from pinned modules bootstraps to `{created:0, skipped:0}`. The bootstrap **response shape is unchanged**; the UX hint is view-side: when a bootstrap attempt returns `{created:0, skipped:0}`, the StoryCatalog empty state shows a "no materialized activities — if this model uses pinned modules, fork the module first, then generate" hint (§4.10). | §4.5, §4.10 |
| DD-10 | **Cross-type edge-id uniqueness scan: explicit non-issue (Resolves: task-review C-04; quote corrected per design-review N-01).** The real pre-check in `createEdge` (`api/src/storage/edges.ts:56`) is `EXISTS { MATCH ()-[r {id: $edgeId}]-() WHERE type(r) <> $edgeType }` — a cross-*other*-type scan, **and it is built only when `input.id !== undefined`** (client-supplied id); when the id is server-generated the expression short-circuits to the literal `false` (verified in code, rev 3). This spec reuses `createEdge` for all three new edge types with **server-generated UUIDv7 ids only**, so the bootstrap path never even builds the scan — the cost concern is moot, and there is no rejection path to handle. No bypass, no batching change. | §3.3, §4.5 |
| DD-11 | **Detached-story contract (Resolves: design-review B-01 — rev 2's §4.1 and §4.2 contradicted each other, making `detached:true` unproducible).** A story is *detached* when its `DESCRIBES_ACTIVITY` target no longer resolves — the activity was `DETACH DELETE`d elsewhere, which also removed the edge, so the story's denormalized `sourceActivityId` is the only trace. The model-membership gate on detail/PATCH/DELETE distinguishes **two miss shapes**: **(a)** the activity resolves but is ∉ `scopedNodeIds(:modelId)` → `404 story_not_found` (the cross-model isolation case DD-06/AC-08 protects); **(b)** no activity resolves at all → the request **proceeds**: detail returns `200` with `detached:true`; PATCH (re-point to a scoped activity, validated per DD-08) and DELETE (§4.4 cascade) are the sanctioned repair paths. **Attribution consequence, accepted:** a deleted activity's id is in no model's scoped set, so a detached story is **model-unattributable** — it is addressable, and **listed with `detached:true`** (§4.1 `OPTIONAL MATCH`), under **any** model's route until repaired. This is deliberate: hiding detached rows from the list (rev 2) stranded them (unreachable/uneditable/undeletable); global list visibility is what makes FR-13's indicator and repair affordances reachable, and it gives AC-11 a real integration seam (§8, AC-03 row). AC-08's isolation guarantee applies to **attached** stories; a detached row leaks no other model's content — the model-scoped thing (the activity) no longer exists. | §4.1, §4.2, §5, §8 |
| DD-12 | **Cardinality enforcement boundary (Resolves: design-review C-02).** The §3.3 cardinalities (`DESCRIBES_ACTIVITY` exactly-1 per story, `STORY_FOR_ROLE` 0..1, `ACCEPTANCE_OF` exactly-1) are invariants **of this spec's routes only**: create wires exactly one of each, PATCH re-point deletes-then-creates, bootstrap follows create. The **generic `POST /api/v1/edges` surface can violate them** — the registry validator checks label pairs only, and these three types carry no lifecycle-route guard (§3.3 note). **Accepted risk, no guard in this spec**: a per-type write guard on the generic edge surface is a graph-core contract change, out of scope; recorded as a future-guard candidate. Mitigation is **graceful degradation, not corruption**: the §4.1 list query uses `count(DISTINCT ac)` so `acCount` stays exact under any fanout, a story with two scoped `DESCRIBES_ACTIVITY` targets shows as one row per target (visible, diagnosable), and a rogue second edge into another model's activity surfaces the story in both lists — the honest reading of an already-invalid graph, not a silent isolation hole; AC-08 asserts isolation for graphs written through this spec's routes. | §3.3, §4.1 |

### 2.1 Deviations register (orchestrator: land as errata; no ID renumbering)

Recorded per the `model-workspace-core` precedent (Resolves: design-review N-03).

| # | Divergence | Status |
|---|-----------|--------|
| D-1 | **AC-15 `manual:` → CLI verification.** Requirements AC-15 words the design-conformance check as `manual:`; it is a deterministic script with an exit code, so §8 executes it as a **CLI** check — one invocation **per file** (`StoryCatalog.tsx` and `StoryCatalog.module.css` each get their own run; `--view` checks only the single file passed — task-review N-02). Requirements errata pending; no behavior change. | open (errata) |
| D-2 | **DD-02 one-starter-AC default (requirements OQ-2).** Executed as the recorded default; the orchestrator may still surface OQ-2 to the user before execution. | open (user-optional) |
| D-3 | **tasks.md rev 1 deltas.** tasks.md rev 1 was written against design rev 1 + requirements rev 2 and must pick up: (a) T-03 adds **five** codes (incl. `story_activity_not_in_model`); (b) T-05/T-07 use `404 story_activity_not_in_model` for out-of-scope `activityId` (not `400 story_activity_required`); (c) a task/test closing **AC-19** (`api/__tests__/story-xd18-role-path.integration.test.ts`, §4.12); (d) T-14 adds the DD-09 fork-first empty-state hint; **rev 3 additions:** (e) the DD-11 detached contract — list query is now `OPTIONAL MATCH` including detached rows, and detail/PATCH/DELETE use the two-shape membership gate (§4.1/§4.2), with the detached-lifecycle integration assertions folded into the AC-03 test (§8); (f) PATCH re-point `SET s.sourceActivityId` + its AC-03 assertion (design-review C-03); (g) any task asserting OpenAPI code counts uses **five** codes (design-review C-01); (h) drop any "blocked on model-workspace-core" precondition — the dependency landed (§1.1, design-review C-04). | open (tasks revision) |

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
  `DESCRIBES_ACTIVITY` target no longer resolves — FR-07/FR-13; produced by both
  the list and detail queries per DD-11, with `activityId`/`activityName` null on
  a detached row). Detail adds `acceptanceCriteria: acReadSchema[]` ordered by
  `ordinal`.

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
>
> **Enforcement boundary (DD-12, Resolves: design-review C-02).** Because these
> types have no lifecycle-route guard, the generic `POST /api/v1/edges` surface
> *can* create a duplicate `DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE`/`ACCEPTANCE_OF`
> edge — the cardinality column above is guaranteed only for writes through this
> spec's routes. Accepted risk; the §4.1 list query is hardened
> (`count(DISTINCT ac)`) so a violation degrades gracefully (DD-12).
>
> `createEdge` also carries the **cross-type edge-id uniqueness pre-check**
> (graph-core design-review C-10) — exactly
> `EXISTS { MATCH ()-[r {id: $edgeId}]-() WHERE type(r) <> $edgeType }`, built
> **only when a client-supplied `id` is present** (`api/src/storage/edges.ts:56`;
> Resolves: design-review N-01 — rev 2 quoted the unqualified form). All story/AC
> edge ids are server-generated UUIDv7, so on this spec's calls the expression
> short-circuits to `false`; no cost, no rejection path (DD-10).

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
| `story_activity_required` | 400 | `POST /stories` when `activityId` is **missing/empty** (the route maps the zod failure on the `activityId` path to this code, mirroring §4.3's clause mapping). Strictly the *absence* precondition — never a role failure (DD-07), never the out-of-scope case (DD-08) |
| `story_activity_not_in_model` | 404 | `POST /stories` (create), `PATCH /stories/:id` (re-point), and bootstrap `{activityIds}` narrowing, when the supplied `activityId` does not resolve to an `:Activity` ∈ `scopedNodeIds(:modelId)` (DD-08; requirements rev 3 C-06, AC-08 write-side) |
| `acceptance_criterion_clause_required` | 400 | AC create/patch when any of `given`/`when`/`then` is missing/empty (NFR-03) — surfaced by mapping the zod `.min(1)` failure to this code (§4.3) |

A bad `roleId` throws the **existing generic `not_found`** with
`details.field:"roleId"` (DD-07) — no new code. `story_duplicate_for_activity`
is **NOT added** (DD-04 — reserved because it would be a dead code under the
`1..*` default; no test forbids adding it — the `envelope.test.ts` reachability
claim in rev 1 was false, design-review C-01). Each added code is reachable from
≥1 route and appears in the OpenAPI `ErrorEnvelope.code` enum
(`openapi.integration.test.ts` asserts every `ERROR_CODES` member is in the
enum; AC-04/AC-08/AC-09 exercise the codes live).

## 4. Core logic

### 4.1 Model-scoped read helper usage (FR-05, FR-06, NFR-02)

`api/src/storage/stories.ts` imports `scopedNodeIds` from
`api/src/storage/model-scope.ts` (`model-workspace-core` FR-18). The story **list**
query (`listStories(driver, modelId)`):

```cypher
// $scopedActivityIds = [...scopedNodeIds(driver, modelId)]  — the WHOLE scoped set,
// passed as-is. It is a MIXED, UNLABELED id set (Domain/UserJourney/Activity/
// ModuleInstance — mwc design §4.2), so there is nothing to "filter to Activity"
// JS-side (task-review C-02); the `:Activity` label in the OPTIONAL MATCH below
// is what restricts the join to activities.
MATCH (s:UserStory)
OPTIONAL MATCH (s)-[:DESCRIBES_ACTIVITY]->(a:Activity)
WITH s, a
WHERE (a IS NOT NULL AND a.id IN $scopedActivityIds)  // attached, in this model
   OR a IS NULL                                       // detached (DD-11)
OPTIONAL MATCH (s)-[:STORY_FOR_ROLE]->(r:Role)
OPTIONAL MATCH (ac:AcceptanceCriterion)-[:ACCEPTANCE_OF]->(s)
RETURN s, a.id AS activityId, a.name AS activityName, a IS NULL AS detached,
       r.id AS roleId, r.name AS roleName, count(DISTINCT ac) AS acCount
ORDER BY s.createdAt ASC
```

`detached` is computed **in-query** (`a IS NULL`), so the list is one of the two
real producers of `detached:true` (detail is the other, §4.2) — resolving the
rev-2 contradiction in which no response could ever carry it (Resolves:
design-review B-01, per DD-11):

- **Attached, in this model** → listed with `detached:false` and the
  activity/role/acCount columns.
- **Attached, another model's activity** → excluded (`a.id ∉ $scopedActivityIds`)
  — the AC-08 isolation guarantee, unchanged.
- **Detached** (activity `DETACH DELETE`d elsewhere, FR-07) → listed with
  `detached:true` and `activityId`/`activityName` null. Per DD-11 a detached
  story is model-unattributable, so it appears in **every** model's list until
  repaired — the UI always has a path to reach FR-13's "detached" indicator and
  its repair affordances (re-point or delete, §4.2).
- **Under a DD-12 cardinality violation** (second `DESCRIBES_ACTIVITY` via the
  generic edge surface) the query degrades gracefully: `count(DISTINCT ac)`
  keeps `acCount` exact, and the story emits one row per scoped activity target
  (visible, not corrupted) (Resolves: design-review C-02, query-hardening half).

`scopedNodeIds` is called once per list/detail/AC-list/bootstrap request; a model
with no scoped activities returns `[]` fast (empty-state, AC-13).

### 4.2 Story CRUD (FR-05, DD-05)

`api/src/storage/stories.ts`:

- `createStory(driver, modelId, input)` —
  1. **Activity + role validation (DD-07, DD-08).** A missing/empty `activityId`
     never reaches storage — the route maps that zod failure to `400
     story_activity_required` (§3.5). Storage confirms the supplied
     `input.activityId` resolves to an `:Activity` whose id ∈
     `scopedNodeIds(driver, modelId)` in one read (`MATCH (a:Activity
     {id:$activityId}) WHERE a.id IN $scoped`); miss → `404
     story_activity_not_in_model` with `details.field:"activityId"` (DD-08 —
     covers both "another model's activity" and "scoped id that is not an
     Activity"). When `roleId` is supplied, confirm it resolves to a `Role`
     node — existence + label only, **no model-membership check** (`Role` is a
     global reference node); miss → `404 not_found` with
     `details.field:"roleId"` (DD-07).
  2. **Assemble `narrative`** server-side: `"As a <persona>, I want to <action>,
     so that <benefit>."` (never client-supplied — §3.1).
  3. `createNode`-style write **through `stories.ts`** (not the generic
     primitive, DD-03): `CREATE (s:UserStory { …envelope…, persona, action,
     benefit, narrative, derived:false, sourceActivityId:$activityId })`.
  4. Wire edges via `createEdge`: `DESCRIBES_ACTIVITY` (UserStory→Activity), and
     `STORY_FOR_ROLE` (UserStory→Role) when `roleId` present. → `201` + full
     `storyReadSchema` body incl. `acCount:0`, `detached:false`.
- **Shared membership gate (DD-11, Resolves: design-review B-01).** Detail,
  PATCH, and DELETE all resolve the story by id and `OPTIONAL MATCH` its
  `DESCRIBES_ACTIVITY` activity, then apply the **two-shape gate**: (a) activity
  **resolves** but ∉ `scopedNodeIds(modelId)` → `404 story_not_found` (another
  model's story is *not found* under this model path — no cross-model read);
  (b) activity **does not resolve** → the story is detached and the request
  **proceeds** (repair access under any model route, DD-11). Rev 2's blanket
  "activity must be in the scoped set" check is gone — it made detached stories
  permanently unreadable/uneditable/undeletable.
- `getStory(driver, modelId, storyId)` — gate as above; embed ACs ordered by
  `ordinal ASC`; return `detached: (activity unresolved)` — `200` with
  `detached:true` for a detached story (the second real producer of
  `detached:true`, alongside the §4.1 list).
- `patchStory(driver, modelId, storyId, patch)` — gate as above (a detached
  story is patchable: re-point is the DD-11 repair path); dynamic SET of the
  supplied `persona`/`action`/`benefit`/`description`/`attributes`;
  **re-assemble `narrative`** if any of persona/action/benefit changed; re-point
  `DESCRIBES_ACTIVITY`/`STORY_FOR_ROLE` when `activityId`/`roleId` supplied
  (delete old edge if present, create new — a new `activityId` is re-validated
  against the scoped set, miss → `404 story_activity_not_in_model` (DD-08); a
  new `roleId` is re-validated as a `Role`, miss → `404 not_found` field
  `roleId` (DD-07)). Every re-point also runs **`SET s.sourceActivityId =
  $activityId` in the same tx**, so the denormalized property tracks the edge
  instead of silently drifting after the first re-point (Resolves:
  design-review C-03; asserted in §8 AC-03). **Always `SET s.derived = false`**
  (DD-05); omitted fields untouched (mirrors `patchNode`). → `200`.
- `deleteStory(driver, modelId, storyId)` — gate as above (a detached story is
  deletable under any model route — the other DD-11 repair path), then the
  single-transaction cascade (§4.4). → `204`.

### 4.3 AC CRUD (FR-06, NFR-03, DD-05)

`api/src/storage/stories.ts`:

- `createAc(driver, modelId, storyId, input)` — verify the parent story exists
  and passes the §4.2 **two-shape gate** (DD-11: shape (a) cross-model → `404
  story_not_found`; shape (b) detached parent → proceeds, so a detached story's
  ACs stay editable during repair). Allocate
  `ordinal = coalesce(max(existing.ordinal),0)+1` in-tx when omitted. `CREATE
  (ac:AcceptanceCriterion {…, given, when, then, ordinal, derived:false})` then
  `createEdge` `ACCEPTANCE_OF` (AcceptanceCriterion→UserStory). → `201`.
- `listAcs(driver, modelId, storyId)` — same parent gate, `MATCH
  (ac)-[:ACCEPTANCE_OF]->(s {id:$storyId}) RETURN ac ORDER BY ac.ordinal ASC`.
- `patchAc(driver, modelId, storyId, acId, patch)` — same parent gate, **and**
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
by such a delete follows the DD-11 contract — listed and readable with
`detached:true`, repairable by re-point or delete (§4.1/§4.2, FR-13) — not
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

1. Fetch the scoped set = `scopedNodeIds(driver, modelId)` and pass it **whole**
   into the Cypher — the set is mixed/unlabeled (task-review C-02), so the
   restriction to activities is the `:Activity` label in the query (`MATCH
   (a:Activity) WHERE a.id IN $scoped`), **not** a JS-side filter. Optional body
   `{ activityIds?: string[] }` narrows to those ids — each must resolve to a
   scoped `:Activity` of `:modelId`, else `404 story_activity_not_in_model`
   with `details.field:"activityIds"` (DD-08).
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

**Pinned-module boundary (DD-09, requirements rev 3 C-07).** Activities inside
non-forked `ModuleInstance`s live in the pinned version's `snapshot_json` and
are **not** in `scopedNodeIds` — bootstrap reports them in neither `created` nor
`skipped`. A model built entirely from pinned modules returns
`{created:0, skipped:0}`; the response shape is unchanged and the "fork first,
then generate" hint is rendered view-side (§4.10).

**Parity harness (NFR-04, AC-06).** `deriveStories` and the client
`formulateUserStories(data, journeyName)` **cannot share one input object** (the
client consumes a column-indexed `JourneyData`; the server reads a structural
shape). The parity test (`api/__tests__/story-derive-parity.test.ts`) therefore:
(1) declares **one canonical single-journey structural fixture**; (2) maps it to
(a) `DeriveActivityInput[]` for `deriveStories` and (b) a `JourneyData` projection
for `formulateUserStories`, where **the projected `roles`/`locations` arrays are
ordered so array-index-0 is the same node the server selects by
`createdAt`-then-`id`** — the client picks `filtered[0]` by pure array-index
order and `JourneyData` carries **no** `createdAt` or column-primacy concept
(Resolves: design-review C-02; the projection ordering is the coupling point);
(3) asserts **equal `narrative` strings** per activity and the same primary
role/location. A separate
case asserts the **orphan-activity fallback** narrative
(`"…so that the workflow completes."`) on the server side. Single-journey keeps
the client's one `journeyName` argument well-defined.

### 4.6 Label + edge registration (FR-01–04, NFR-01)

`api/src/scripts/register-story-labels.ts` exports
`registerStorySchema(driver)`: two `createNodeLabel` calls (`UserStory`,
`AcceptanceCriterion`, permissive `json_schema_doc:{}`) then three
`createEdgeType` calls (`DESCRIBES_ACTIVITY`, `STORY_FOR_ROLE`, `ACCEPTANCE_OF`
with their §3.3 endpoint pairs). Both registry functions are `(driver, input,
actor)` — every call passes **`actor = "system:story-spec"`** (Resolves:
design-review N-01). Each call is wrapped so an already-registered error is
swallowed — matching on the error **code `name_conflict`**, never on HTTP 409
alone (other 409s such as `id_conflict`/`would_invalidate` must propagate;
Resolves: task-review N-01) → **idempotent** (FR-01/FR-02, AC-01). Invoked
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
definitions (no hand-maintained copy, FR-10). The **five** new `ERROR_CODES`
(§3.5, incl. `story_activity_not_in_model`) surface in the shared
`errorEnvelopeSchema` responses (Resolves: design-review C-01 — rev 2's "four"
was stale). AC-09 asserts routes + codes appear in `GET /api/v1/openapi.json`.

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
    graph"** (POST `.../bootstrap`) and a manual **Create** affordance. When a
    bootstrap attempt returns `{created:0, skipped:0}`, the empty state adds the
    **fork-first hint** ("no materialized activities — if this model uses pinned
    modules, fork the module first, then generate") per DD-09.
  - **error** (AC-14) — `ErrorState` from `views/_shared.tsx` **plus a local
    retry `<Button onClick={refetch}>` rendered by `StoryCatalog` alongside it**
    — `ErrorState({message})` renders no retry itself and is **not** modified
    (Resolves: design-review C-03).
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
  it away). A story with `detached:true` shows a **"detached" indicator** — on
  the list row (the §4.1 query now returns detached rows, DD-11) and in the
  detail panel, where the repair affordances are the existing edit (re-point to
  a scoped activity) and delete controls; no new control is needed.
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
  `design-conformance.ts --view` checks **only the single file passed** (it does
  **not** auto-include the co-located CSS — rev 1's claim was false; Resolves:
  task-review N-02), so AC-15 runs **two invocations**:
  `bun run scripts/design-conformance.ts --view pwa/src/views/model/StoryCatalog.tsx`
  **and** `… --view pwa/src/views/model/StoryCatalog.module.css` — both exit 0.

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

### 4.12 XD-18 end-to-end verification path (AC-19; requirements rev 3, B-03)

The blueprint's XD-18 mandate — "domain experts can model key activities per
role end-to-end", story-surface half — is closed by a dedicated integration
test, **`api/__tests__/story-xd18-role-path.integration.test.ts`**, that
exercises the full stack with **no synthetic permission stub**:

1. **Fixture (API-only, per §8):** a model with ≥2 activities, each with a
   **distinct** executing `Role` wired `(:Role)-[:EXECUTES]->(:Activity)`
   (core node/edge routes + `POST /api/v1/models/:id/domains`).
2. **Session:** a real session bound to the **`business_architect`** RBAC role
   (the Business Architect persona), created via the real
   `createSession(userInfo, roles, storeAccess, personaAssignments, rbacRoles,
   permissions)` helper (`api/src/auth/oauth.ts:151`) with
   `rbacRoles: ["business_architect"]` and its seeded permission set, then sent
   as the session cookie so every request is authorized **through the central
   router gate** (`router.ts` → `getRoutePermission` → `hasPermissionByRbac`) —
   a concrete existing mechanism, not a forward reference to this spec's own
   test files and not a bypassed gate (Resolves: design-review N-03).
3. **Bootstrap:** `POST /api/v1/models/:modelId/stories/bootstrap` as that
   session → expect one `derived:true` story **per activity**, each with
   `DESCRIBES_ACTIVITY` to its activity and `STORY_FOR_ROLE` to its
   **executing** role (the `EXECUTES` structure drives §4.5's primary-role
   selection), each with one starter Given/When/Then AC (DD-02).
4. **Hand edit:** `PATCH …/stories/:id/acceptance-criteria/:acId` (edit one
   clause) as the same session → `200`, and the AC's `derived` flag clears
   (DD-05).

This is additional **coverage**, not new behavior: every step rides FR-05/FR-09
storage (§4.2, §4.5) and FR-11 authz (§4.8). Supporting coverage: AC-06/AC-07
(derivation from `EXECUTES`), AC-09 (permission resolution), AC-11 (UI edit).
The `EXECUTES`-core half of XD-18 is owned by `business-model-authoring`
(its FR-05/AC-06), per the requirements UX-conformance table.

## 5. HTTP API surface

All under `/api/v1/`, zod-validated, `{error:{code,message,details?}}` envelope,
registered in `openapi.json` (FR-10). Permission column = `ROUTE_PERMISSIONS`
(FR-11). No `?model=` query param on any route (DD-06).

| Method | Route | FR | Perm | Notes |
|--------|-------|----|------|-------|
| GET | `/api/v1/models/:modelId/stories` | FR-05 | `story:read` | model-scoped via activity join (§4.1); rows carry activity/role/acCount; detached stories included w/ `detached:true` (DD-11) |
| POST | `/api/v1/models/:modelId/stories` | FR-05 | `story:write` | `{persona,action,benefit,activityId,roleId?}`; assembles narrative; 201 + UUIDv7; `derived:false`; out-of-scope `activityId` → 404 `story_activity_not_in_model` (DD-08); bad `roleId` → 404 `not_found` (DD-07) |
| POST | `/api/v1/models/:modelId/stories/bootstrap` | FR-09 | `story:write` | derive+persist editable nodes; `{activityIds?}` (out-of-scope id → 404 `story_activity_not_in_model`); idempotent → `{created,skipped}`; pinned-only model → `{0,0}` (DD-09) |
| GET | `/api/v1/models/:modelId/stories/:storyId` | FR-05 | `story:read` | detail + embedded ACs (ordinal ASC); two-shape gate (DD-11): cross-model → 404 `story_not_found`, detached → 200 `detached:true` |
| PATCH | `/api/v1/models/:modelId/stories/:storyId` | FR-05 | `story:write` | re-assembles narrative; re-points edges (re-point validation per DD-07/DD-08, `SET sourceActivityId` — C-03); clears `derived`; detached story patchable (DD-11 repair) |
| DELETE | `/api/v1/models/:modelId/stories/:storyId` | FR-05,07 | `story:write` | single-tx cascade → 204; detached story deletable (DD-11 repair) |
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
  `pwa/src/styles/companygraph/tokens.css`; `scripts/design-conformance.ts
  --view` is run **once per file** — `StoryCatalog.tsx` and
  `StoryCatalog.module.css` each — both exit 0 (AC-15; task-review N-02).
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
| `api/src/errors.ts` | modify | FR-10 | +**5** error codes incl. `story_activity_not_in_model` (DD-08); NOT `story_duplicate_for_activity` (DD-04) |
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
| `api/__tests__/story-*.{test,integration.test}.ts`, `api/__tests__/acceptance-criteria-crud.integration.test.ts`, `shared/src/schema/__tests__/story-spec.test.ts` | new | AC-01..09, AC-19 | test files per §8 (design-review N-02) |
| `pwa/src/__tests__/story-{catalog,detail,catalog-states}.test.tsx`, `pwa/playwright/story-catalog-context.spec.ts` | new | AC-10..14, AC-17 | test files per §8 (design-review N-02) |

**Not edited (consumed):** `shared/src/schema/{nodes,edges}.ts` (NFR-01/AC-18),
`api/src/storage/{nodes,edges}.ts` (generic primitives untouched, DD-03),
`api/src/storage/model-scope.ts` / `pwa/src/context/ActiveModelContext.tsx` /
`pwa/src/route.ts` (all `model-workspace-core`'s).

## 8. Test strategy

| AC | Kind | File |
|----|------|------|
| AC-01 | integration | `api/__tests__/story-labels.integration.test.ts` — labels via registry in `GET /schema`; `NODE_LABELS` unchanged; idempotent re-run (no dup rows) |
| AC-02 | integration | `api/__tests__/story-edges.integration.test.ts` — 3 edges via `createEdgeType`; wrong pair (`UserStory→Role` for `DESCRIBES_ACTIVITY`) → 400 `edge_endpoint_label_mismatch`; `EDGE_ENDPOINTS` unchanged |
| AC-03 | integration | `api/__tests__/story-crud.integration.test.ts` — create→201+UUIDv7+assembled narrative+edges; bad `roleId` → 404 `not_found` field `roleId` (DD-07); missing `activityId` → 400 `story_activity_required`; list model-scoped; detail embeds ACs by ordinal; PATCH preserves omitted, re-assembles narrative, flips `derived`→false; **PATCH re-point updates `sourceActivityId` to the new activity id** (design-review C-03); **detached lifecycle (DD-11, the AC-11 integration seam):** delete the story's activity via the core node route → list row **and** detail both return `detached:true` (activity fields null), PATCH re-point to a scoped activity repairs (`detached:false`, `sourceActivityId` updated), and DELETE of a detached story → 204; DELETE→204 |
| AC-04 | integration | `api/__tests__/acceptance-criteria-crud.integration.test.ts` — create requires all 3 clauses (missing → 400 `acceptance_criterion_clause_required`); ordinal=max+1; list ASC; PATCH clause; DELETE→204; bad parent → 404 `story_not_found` |
| AC-05 | integration | `api/__tests__/story-cascade.integration.test.ts` — DELETE story removes ACs + all 3 edge types in one tx (no orphans/dangles); Activity/Role survive |
| AC-06 | unit | `api/__tests__/story-derive-parity.test.ts` — canonical structural fixture mapped to both shapes; `deriveStories` vs `formulateUserStories(projected, journeyName)` equal narratives + same primary role/location; orphan-fallback narrative case (Neo4j-free) |
| AC-07 | integration | `api/__tests__/story-bootstrap.integration.test.ts` — bootstrap derives+persists editable `derived:true` story+starter-AC per activity-without-story; idempotent `{created,skipped}`; `{activityIds}` scopes; persisted derived story PATCHes and clears `derived` |
| AC-08 | integration | `api/__tests__/story-model-scope.integration.test.ts` — two models w/ own activities+stories; `GET /models/:A/stories` returns A's, excludes B-only; asserts a story id is NOT in `scopedNodeIds` (isolation via activity join); bootstrap on A derives only from A's scoped activities; **write-side (rev 3 C-06):** `POST /models/:A/stories` with a model-B-only `activityId` and a `PATCH` re-point to it are both rejected `404 story_activity_not_in_model` (DD-08), creating/moving nothing — model B's list unchanged after both attempts |
| AC-09 | unit + integration | `api/__tests__/story-authz.test.ts` (403 without `story:write` on POST + bootstrap; 201/200 with; `story:read`→200 list; `business_architect` resolves both; no `public`) + `api/__tests__/story-openapi.integration.test.ts` (routes + **5** codes in openapi — design-review C-01) |
| AC-10 | component (jsdom) | `pwa/src/__tests__/story-catalog.test.tsx` — `#/model/stories`→`StoryCatalog`; reads `useActiveModel()`; ready list w/ narrative/activity/role/acCount |
| AC-11 | component | `pwa/src/__tests__/story-detail.test.tsx` — detail panel w/ narrative+activity/role+GWT triples; edit PATCHes+clears badge; AC add/edit/delete calls FR-06 routes; derived badge; detached indicator (list row + panel — mocked here, but the payload is now producible by the real contract: DD-11, integration seam in the AC-03 row) |
| AC-12,13,14 | component | `pwa/src/__tests__/story-catalog-states.test.tsx` — loading skeleton; empty w/ "Generate from graph"+create (bootstrap POST → stories appear); error+retry refetch |
| AC-15 | CLI | `bun run scripts/design-conformance.ts --view pwa/src/views/model/StoryCatalog.tsx` **and** `… --view pwa/src/views/model/StoryCatalog.module.css` — `--view` checks only the file passed (task-review N-02), so each file gets its own invocation; expect exit 0, zero violations on both (CLI, promoted from `manual:` — §2.1 D-1) |
| AC-16 | manual | keyboard walk of `#/model/stories`: Tab → "Generate from graph" (Enter), Tab into list, Enter opens a story → focus enters detail panel, moves through AC edit controls in order, Escape returns focus to the originating row |
| AC-17 | e2e | `pwa/playwright/story-catalog-context.spec.ts` — model B active, nav `#/model/stories`, reload → same route renders `StoryCatalog` w/ model B's stories |
| AC-18 | CLI | `bun run typecheck` exit 0; `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts` shows no `NODE_LABELS`/`EDGE_ENDPOINTS` additions |
| AC-19 | integration | `api/__tests__/story-xd18-role-path.integration.test.ts` — the §4.12 XD-18 end-to-end path: real `business_architect` session through the router gate → bootstrap over `(:Role)-[:EXECUTES]->(:Activity)` structure (≥2 activities, distinct roles) → one `derived:true` story per activity w/ `DESCRIBES_ACTIVITY` + `STORY_FOR_ROLE` to the executing role + starter GWT AC → PATCH one starter AC clause as the same session → 200 + `derived` clears |

Integration tests need Neo4j (`bun test:integration`); unit/component run under
`bun test`. Integration tests that need a two-model fixture set up model-B domains
via `model-workspace-core`'s `POST /api/v1/models/:id/domains` (its C-06 route) +
core `POST /api/v1/domains`/`journeys`/`nodes` for activities — no direct-driver
seeding required.

> **AC-15 promotion (requirements N-02, §2.1 D-1).** Requirements list AC-15 as
> `manual:`; this design promotes it to a **CLI** check (deterministic script,
> exit code) run once per file. The orchestrator may land this as a requirements
> errata; no behavior change.

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
  default (DD-04), so it would be a dead code (no test forbids adding it —
  design-review C-01 corrected rev 1's false `envelope.test.ts` claim). Rejected
  → reserved, not added; introduced only if the user later chooses hard 1:1.
- **Sharing one input object between `deriveStories` and `formulateUserStories`** —
  impossible (column-indexed vs structural shapes). Rejected → parity harness with
  an explicit projection + deterministic tiebreak (§4.5, requirements B-02).
- **Re-implementing model selection in StoryCatalog** — re-specs
  `model-workspace-core`. Rejected → consume `useActiveModel()` (§4.10).
- **Drag-reorder for ACs** — introduces a gesture/scroll-hijack (Native
  Conflicts). Rejected → up/down buttons (`PATCH {ordinal}`), keyboard-reachable
  (§4.10, AC-16).
