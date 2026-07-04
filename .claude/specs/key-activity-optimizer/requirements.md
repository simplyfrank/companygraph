---
feature: "key-activity-optimizer"
created: "2026-07-04"
author: "spec-author"
status: "draft"
size: "medium"
---

# Requirements: key-activity-optimizer

## Summary

`key-activity-optimizer` is a **parallel wave-3** feature of the Business Modeling
Studio (blueprint `.claude/specs/blueprint.md`; milestone M2). For a single
`BusinessModel` it computes **descriptive** graph scores over that model's
`Activity` nodes — **centrality**, **critical-path position**, and **handoff
density** — ranks them, and lets a Business Architect **manually mark** an activity
as *key*. Per XD-11 the optimization is purely descriptive (scores + rankings +
manual marking); there are **no prescriptive recommendations**. Per XD-03 a "key
activity" is an **attribute + score evidence on the existing `Activity` label**,
not a new node label; marking is **reversible** (unmark restores the prior state).
It ships the **KeyActivityBoard** view at `#/model/key-activities` (blueprint View
Tree, verbatim) with all four view states and the ranking table.

It builds on `story-spec-core` (its declared dependency) and, transitively,
`model-workspace-core`: it consumes the model-scoped read helper
`scopedNodeIds(driver, modelId)` (`api/src/storage/model-scope.ts`,
`model-workspace-core` FR-18), the `business_architect` RBAC role
(`api/src/scripts/seed-rbac-roles.ts`, `model-workspace-core` FR-11), the Model
surface shell + `route.ts`/`SURFACES` registration and the `ModelTabPlaceholder`
for the `key-activities` tab (`model-workspace-core` FR-17), and the shell-owned
active-model context `useActiveModel()`
(`pwa/src/context/ActiveModelContext.tsx`, `model-workspace-core` FR-15). It
does **not** re-spec any of those.

It **does not** attach KPIs to key activities (`kpi-impact-mapping`), emit
prescriptive optimization suggestions (deferred to the chat surface per XD-11),
add a new node label, or edit the compile-time `NODE_LABELS`/`EDGE_ENDPOINTS`
consts. Story-level ranking, capability mapping, and the export document are
explicitly out of scope with named owners below.

## Motivation

1. The blueprint pipeline is **author → graph → optimize → measure →
   systematize**. `key-activity-optimizer` is the **optimize** stage: once a model
   is authored (`business-model-authoring`) and its stories are graph citizens
   (`story-spec-core`), the Business Architect needs to know **which activities
   matter most** so the downstream measure/systematize stages focus effort where
   it pays off. Today the codebase has whole-graph analytics
   (`api/src/ontology/analytics/graph.ts` — betweenness/degree/pagerank via
   `graphology`) but nothing **model-scoped**, nothing that ranks **activities
   specifically**, and no way to **persist a human judgement** ("this is a key
   activity") back onto the graph.
2. XD-11 fixes the character of this stage: **descriptive, not prescriptive**.
   Deterministic, explainable scores + rankings + a reversible manual mark — the
   platform surfaces evidence; the human decides. Prescriptive "you should
   consolidate X" suggestions are deliberately deferred (rejected alternative,
   XD-11). This keeps the feature auditable and avoids a black-box recommender.
3. XD-03 fixes where the judgement lives: a **`keyActivity` attribute on the
   existing `Activity` label**, carrying **score evidence** (the three sub-scores
   at mark time), **not** a new label. Activities stay one label; scores are
   recomputable; marking is reversible. This mirrors the sanctioned
   attribute-on-node precedent that `system-augmentation-model` (`systemKind` on
   `System`) established.
4. `kpi-impact-mapping` (wave 4) depends on this spec: it attaches quantified KPI
   impact to the activities this spec ranks + marks, and its "measurability gaps"
   report reads the `keyActivity` mark to prioritise which key activities still
   lack a KPI. A stable "which activities are key, and why" surface must exist
   first.
5. The blueprint View Tree assigns `#/model/key-activities` → `KeyActivityBoard`
   to this spec; `model-workspace-core` already registered that route as a
   placeholder and owns `route.ts`. This spec replaces the placeholder with the
   real ranking board, scoped to the active model.

## Functional Requirements

<!-- Priorities: must = M2 deliverable / downstream (kpi-impact-mapping) dependency;
     should = polish. -->

### Descriptive scoring engine (XD-11)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **Model-scoped activity read.** A new pure/model-scoped read (`api/src/storage/key-activity-scope.ts`, or the score module directly) collects the model's `Activity` nodes as `{a : a.id ∈ scopedNodeIds(driver, modelId)} ∧ a labelled Activity`, consuming `scopedNodeIds` from `api/src/storage/model-scope.ts` (`model-workspace-core` FR-18) — **never re-implemented**. For each activity it also reads the structural edges the scores need: `PRECEDES` (Activity→Activity, ordered flow, both directions), `EXECUTES` (Role→Activity), `USES_SYSTEM` (Activity→System), and the activity's parent `UserJourney` via `PART_OF`. Only edges **between two model-scoped activities** count for `PRECEDES`-derived scores (a `PRECEDES` edge to an activity outside the model's scoped set is excluded), so scoring is fully model-isolated (NFR-01). | must | XD-06, XD-11 |
| FR-02 | **Centrality score** per activity, computed over the model-scoped `PRECEDES` subgraph (directed, Activity→Activity). The score is **betweenness centrality** (via the existing `graphology-metrics/centrality/betweenness` already vendored for `api/src/ontology/analytics/graph.ts`) normalised to `[0,1]` within the model (divide by the model's max betweenness; all-zero → all `0`). Rationale + component values are reported alongside (raw betweenness, in-degree, out-degree) so the score is explainable (XD-11). A model with 0 or 1 scoped activities yields centrality `0` for each (no crash). | must | XD-11, cto-analytics AN-1 pattern |
| FR-03 | **Critical-path position score** per activity: `1` if the activity lies on the model's **longest acyclic `PRECEDES` chain** (the critical path), else a graded `[0,1)` value = `(depth of the longest acyclic chain the activity participates in) ÷ (length of the model's critical path)`. The **longest-acyclic-chain computation is depth-bounded DFS with budgeted truncation** reusing the cto-analytics algorithm contract (resolves OQ-1 default): **depth cap = 20, path-count budget = 1000 candidate paths, wall-clock budget = 4 s**. A **cyclic** `PRECEDES` subgraph is flagged (`hasCycle: true`) but not crashed — the longest acyclic sub-chain is still reported; on budget exhaustion the response carries `{truncated: true, truncationReason: "depth_cap"|"path_budget"|"wall_clock"}` and scores are computed against the longest partial found. | must | XD-11, cto-analytics FR-06 pattern |
| FR-04 | **Handoff-density score** per activity = a normalised measure of how many **role/system boundaries cross** at that activity in the process flow. Concretely: `handoffCount(a) = ` the number of `(predecessor p —PRECEDES→ a)` transitions where `p` and `a` have **disjoint executing-role sets** (a role handoff) **plus** the number where they have **disjoint used-system sets** (a system handoff), summed over all model-scoped predecessors, **plus** the same over successors. Reported normalised to `[0,1]` within the model (divide by the model max; all-zero → all `0`) with the raw `handoffCount` and its role/system breakdown as component evidence (XD-11 explainability). An activity with no `PRECEDES` neighbours scores `0`. | must | XD-11 |
| FR-05 | **Composite rank.** Each activity gets a **composite score** = weighted sum of the three normalised sub-scores with **code-default constant weights** `{ centrality: 1.0, criticalPath: 1.0, handoff: 1.0 }` (mirroring the cto-analytics RD-6 "code-default constants, tunable settings deferred" decision — **no** settings/tuning subsystem in this spec; resolves OQ-2 default). Activities are ranked by composite score **descending**, ties broken by lowest `createdAt` then lowest `id` (deterministic, matching the story-spec tiebreak convention). The rank surface reports, per activity: `id`, `name`, journey name, composite score, the three sub-scores, and the `keyActivity` mark state (FR-07). | must | XD-11 |
| FR-06 | **Scores endpoint** `GET /api/v1/models/:modelId/key-activities` (model-scoped path, following the `model-workspace-core`/`story-spec-core` route convention) runs FR-01–FR-05 **live** (no cache subsystem — this spec computes on request at `retail-mini`/single-model scale, matching cto-analytics DD-03 "serve live") and returns the ranked list plus a `meta` block `{ activityCount, hasCycle, truncated?, truncationReason?, weights }`. zod-validated at the boundary; `{error:{code,message,details?}}` envelope; appears in `GET /api/v1/openapi.json`. | must | XD-11, NFR-11 |

### Manual key-activity marking (XD-03)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-07 | **Mark as key** `POST /api/v1/models/:modelId/key-activities/:activityId/mark` sets `keyActivity` **score evidence** on the target `Activity` (XD-03: an attribute, not a new label). The stored evidence is a JSON object `{ marked: true, markedAt: <ISO>, scoreSnapshot: { centrality, criticalPath, handoff, composite }, rank: <int at mark time> }` written under the activity's open `attributes` map at key **`keyActivity`** (so it round-trips through the graph-core export/import and never touches the compile-time schema). The `:activityId` **must** be a model-scoped activity of `:modelId` (else `404 activity_not_found`; a cross-model activity is not found under this model path). Returns `200` + the updated activity's rank row. The write is **partial** — it must **not** clobber the activity's other `attributes` (FR-09 mechanism). | must | XD-03 |
| FR-08 | **Unmark (reversible)** `DELETE /api/v1/models/:modelId/key-activities/:activityId/mark` **removes** the `keyActivity` key from the activity's `attributes` map (restoring the exact prior attribute state — marking is fully reversible per XD-03), returns `204`. Idempotent: unmarking an unmarked activity returns `204` (no-op, not `404`). Re-marking after unmark writes a fresh snapshot at the then-current scores (marking is recomputable, XD-03). Model-scope check as FR-07 (`404 activity_not_found` for a non-scoped activity). | must | XD-03 |
| FR-09 | **Attribute-preserving write mechanism (resolves C-01).** The core `patchNode` primitive replaces the **whole** `attributes` map (verified: `api/src/storage/nodes.ts` `SET n.attributes_json = $attrsJson`) and runs `assertAttributesMatchSchema` — so a naive `PATCH /nodes/Activity/:id {attributes:{keyActivity}}` would **clobber** the activity's other attributes and could trip attribute-schema enforcement. The mark/unmark writes therefore go through a **dedicated model-scoped storage function** (`api/src/storage/key-activities.ts`) that reads the current `attributes_json`, sets/deletes only the `keyActivity` key in-process, and writes the merged map back in a single parameterized Cypher `SET` — preserving every other attribute. The generic `createNode`/`patchNode` primitives stay **byte-for-byte unchanged**. `keyActivity` is stored inside the **open `attributes` map** (not a top-level Neo4j property, not a registry-declared required attribute), so it is exempt from attribute-schema `required` enforcement and survives export/import. | must | XD-03, graph-core storage contract |

### API contract

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-10 | Every route in FR-06, FR-07, FR-08 is mounted under `/api/v1/`, zod-validated at the boundary, and appears in `GET /api/v1/openapi.json` (generated from the same zod definitions — no hand-maintained copy). New error codes are added to the closed `ERROR_CODES` enum (`api/src/errors.ts`) as **additive** (non-breaking) changes: at minimum `activity_not_found` (a `:activityId` that is not a model-scoped `Activity` of `:modelId`). Every added code is reachable from ≥1 route (so `envelope.test.ts`'s reachability assertion holds); no unreachable "reserved" code is added. | must | NFR-11, house rule |
| FR-11 | **Route-permission mapping**: every new `/api/v1/models/:modelId/key-activities*` route registered in `api/src/auth/rbac-permissions.ts` (`ROUTE_PERMISSIONS`) with a new `key_activity:read` (the `GET` scores route) / `key_activity:write` (the mark `POST`, unmark `DELETE`) permission and correct **specific-before-parameterized** ordering (the `:activityId/mark` rows before the bare `key-activities` row is not required for correctness since segment counts differ, but placement follows the house convention). The `business_architect` RBAC role (seeded by `model-workspace-core` FR-11) gains `key_activity:read` + `key_activity:write` in `api/src/scripts/seed-rbac-roles.ts` (idempotent MERGE by role name). Auth is enforced **only** by the central router gate (`api/src/router.ts`) + `api/src/auth/` — no per-route auth check (house rule). No new route is `public`. | must | house rule, XD-08 |

### PWA — KeyActivityBoard view (blueprint View Tree, UX-*)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-12 | **KeyActivityBoard view** (`pwa/src/views/model/KeyActivityBoard.tsx`, route `#/model/key-activities` — taken **verbatim** from the blueprint View Tree) **replaces** the `ModelTabPlaceholder` that `model-workspace-core` registered for the `key-activities` tab in `pwa/src/views/index.tsx`'s `model` surface dispatch. It reads the active `BusinessModel` from the shell-owned context (`useActiveModel()`; it does **not** re-implement model selection) and renders that model's ranked activities from `GET /api/v1/models/:modelId/key-activities`. The ready state is a **sortable ranking table** (catalog `DataTable`), each row showing rank, activity name, journey, composite score, the three sub-scores, and a **key/not-key** indicator + mark toggle. It specs **all four view states**: **loading** (skeleton while the fetch is in flight), **empty** (no scoped activities yet — a "model has no activities to score" message pointing to authoring), **error** (fetch failed — retry affordance), **ready** (ranking table). A `truncated`/`hasCycle` `meta` flag renders a visible non-blocking banner (the ranking is still shown, per FR-03). Tokens-only styling via `var(--…)` from `pwa/src/styles/companygraph/tokens.css`; catalog components (`DataTable`, `Card`, `Button`, `SidePanel`/`Modal`, `Loading`/`ErrorState` from `views/_shared.tsx`) before inventing new ones; `scripts/design-conformance.ts` passes on the view + its CSS module. | must | Blueprint View Tree, UX-01, UX-02, UX-06 |
| FR-13 | **Mark/unmark interaction + score evidence** in KeyActivityBoard: each row exposes a **mark toggle** (mark → `POST …/:activityId/mark`; unmark → `DELETE …/:activityId/mark`); the toggle is optimistic-with-rollback-on-error and the row's key indicator + the response's score snapshot re-render on success. Selecting a row opens a detail panel (catalog `SidePanel`/`Modal`) showing the **score evidence** — the composite score with its three sub-scores and their component values (raw betweenness / in-out degree for centrality, critical-path membership + partial-chain depth, raw handoff count with role/system breakdown) — so the ranking is explainable (XD-11), plus the mark state + `markedAt`/`scoreSnapshot`/`rank` when marked. All controls are keyboard-reachable (UX-05). Sorting the table by any score column is available via column-header controls (keyboard-activatable). | must | XD-03, XD-11, UX-01, UX-05 |
| FR-14 | **Model-scoped board + reload survival**: KeyActivityBoard only ever shows the active model's activities/scores; switching the active model (via the shell context) refetches for the new model; deep-linking `#/model/key-activities` and reloading re-renders the board for the persisted active model (the persistence + reconciliation is `model-workspace-core`'s FR-15; this view consumes it and refetches on `activeModel.id` change). No cross-model leakage in the ranking (server-enforced by FR-01's model-scoping — scores are computed only over `scopedNodeIds(driver, :modelId)`). | must | UX-06, `model-workspace-core` FR-15 |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | **Model isolation.** All scoring reads (FR-01–FR-06) and the mark/unmark scope check (FR-07, FR-08) are scoped by `model-workspace-core`'s `scopedNodeIds(driver, :modelId)` helper (consumed, never re-implemented). Scoring never reads an activity or a `PRECEDES`/`EXECUTES`/`USES_SYSTEM` edge outside the model's scoped set; a `PRECEDES` edge to an out-of-model activity is excluded from centrality/critical-path/handoff. A request for model A never returns or marks a model-B-only activity. | XD-06, `model-workspace-core` FR-18 |
| NFR-02 | **No new label / no compile-time schema edit** (XD-03): the "key activity" judgement is an **attribute** (`keyActivity` under the activity's open `attributes` map), **not** a new node label; `NODE_LABELS` (`shared/src/schema/nodes.ts`) and the frozen `EDGE_ENDPOINTS` const (`shared/src/schema/edges.ts`) are **not edited**. No new store — score evidence lives in **Neo4j** on the `Activity` node (XD-02). No new edge type. | XD-03, XD-02, NFR-01 of `model-workspace-core` |
| NFR-03 | **Reversibility invariant** (XD-03): unmarking (FR-08) removes the `keyActivity` key and restores the activity's `attributes` map to a byte-equal state to before the corresponding mark (no residue key, no altered sibling attributes). Verified by a round-trip test (AC-07). | XD-03 |
| NFR-04 | **Deterministic + explainable scores** (XD-11): given the same model subgraph, `GET …/key-activities` returns byte-identical scores + ranking across repeated calls (deterministic tiebreak, no randomised centrality seed — `graphology` betweenness is deterministic); every score is accompanied by its component evidence (FR-02/FR-03/FR-04) so no score is a black box. Scoring is **descriptive only** — the response carries no recommendation/suggestion field. | XD-11 |
| NFR-05 | **Bounded computation** (XD-11 explainability + operability): the critical-path DFS is depth/path/wall-clock bounded (FR-03: 20 / 1000 / 4 s) and truncation is surfaced, never silently wrong; centrality + handoff are polynomial over the scoped subgraph. The whole `GET …/key-activities` responds in < 2 s at `retail-mini`/single-model scale on the dev box (no cache subsystem needed — matches cto-analytics DD-03). | XD-11, cto-analytics FR-06 |
| NFR-06 | House rules: `zod` is the only validation library; no `tsc` (transpile via `bun run typecheck`); en-US identifiers (`centrality`, `neighbors`, `color`); server binds loopback `127.0.0.1:8787`; auth via the central router gate + `api/src/auth/` only; all routes under `/api/v1/`. | CLAUDE.md |
| NFR-07 | PWA styling is tokens-only (`var(--…)` from `tokens.css`); components come from the existing CSS-Module catalog before new ones; `scripts/design-conformance.ts` passes on every touched view (UX-02). Desktop-first, no new breakpoints (UX-04). | UX-02, UX-04 |

## UI/UX Requirements

**Views owned by this spec** (from the blueprint View Tree, verbatim):

| Route | View component | Nav surface | States specced (loading·empty·error·ready) |
|-------|----------------|-------------|---------------------------------------------|
| `#/model/key-activities` | `KeyActivityBoard` | Model tab (topbar surf-nav + subnav — registered by `model-workspace-core`) | all four — AC-11 (loading), AC-12 (empty), AC-13 (error), AC-09/AC-10 (ready) |

This spec **replaces** the `ModelTabPlaceholder` `model-workspace-core` registered
for the `key-activities` tab; it does **not** touch `route.ts` (`model-workspace-core`
owns it) beyond the `renderView`/`VIEWS` dispatch of the `key-activities` tab to
`KeyActivityBoard`.

**UX allowance conformance** (reference blueprint UX-*; do not re-decide):

| Allowance | How this spec satisfies it |
|-----------|---------------------------|
| UX-01 view states | AC-09..AC-13 cover KeyActivityBoard loading/empty/error/ready |
| UX-02 design system (tokens-only, catalog components, design-conformance passes) | FR-12, NFR-07; AC-14 runs `scripts/design-conformance.ts` |
| UX-03 input modes (canvas/gesture tables) | n/a — KeyActivityBoard is a table/detail surface (no canvas, no custom gestures). The Platforms & Input Modes + Native Conflicts tables below are populated to record this explicitly (the view still has keyboard/mouse/trackpad interactions: sortable columns, a mark toggle, a detail panel). |
| UX-04 responsiveness | NFR-07 — desktop-first, no new breakpoints |
| UX-05 accessibility | AC-15 — keyboard reachability of the sortable table, the mark toggle, and the detail panel; focus order; ARIA landmark on the view; sortable column headers are keyboard-activatable and expose `aria-sort` |
| UX-06 navigation (routes verbatim, deep links + active-model survive reload) | FR-12 (verbatim route), FR-14 (refetch on model change + reload survival); AC-16 (deep link + active model → correct board after reload) |

## Scope Boundaries

**In scope:**
- Model-scoped descriptive scoring of `Activity` nodes: centrality (betweenness over `PRECEDES`), critical-path position (depth-bounded DFS), handoff density (role/system boundary crossings).
- Composite rank with code-default constant weights (no tuning subsystem).
- `GET /api/v1/models/:modelId/key-activities` live scores + ranking endpoint.
- Manual **mark/unmark** of an activity as key via a `keyActivity` attribute + score evidence; **reversible**; attribute-preserving write.
- `key_activity:read`/`key_activity:write` permissions + route mappings; grant to `business_architect`.
- `KeyActivityBoard` view at `#/model/key-activities` with all four states, sortable ranking table, mark toggle, and score-evidence detail panel.

**Out of scope (owner named):**
- **KPI attachment / measurability of key activities** (`DRIVES_KPI`/`userStoryKPI`, direction+weight, coverage matrix, measurability gaps) → `kpi-impact-mapping`. This spec provides the ranked + marked key-activity surface that feature reads.
- **Prescriptive optimization recommendations / suggestions** ("consolidate X", "automate Y") → deferred to the chat surface per XD-11 (rejected alternative). This spec is descriptive only (NFR-04).
- **Story-level ranking / marking** — this spec ranks and marks **activities**; stories are `story-spec-core`'s surface.
- **A tunable weight/settings subsystem** (settings table, `GET/PATCH …/settings`, audit) — deferred; weights are code-default constants (FR-05; the cto-analytics RD-6 precedent).
- **A precompute/cache/scheduler subsystem** — scores serve live (FR-06, NFR-05); no `analytics_*` cache tables here.
- **`route.ts` / `SURFACES` edits, active-model context, model CRUD, `scopedNodeIds` helper** → owned by `model-workspace-core`; this spec consumes them.
- **Whole-graph (cross-model) analytics** (`#/analytics/*`, `api/src/routes/analytics.ts`) → owned by `cto-analytics`; this spec is per-model and does not touch that surface.

## Acceptance Criteria

<!-- Every AC traces to ≥1 FR. Platforms + Verification columns mandatory. -->

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | `GET /api/v1/models/:modelId/key-activities` returns a ranked list of the model's scoped activities, each with `id`, `name`, journey name, `composite`, and the three sub-scores `{centrality, criticalPath, handoff}` in `[0,1]`, plus a `meta` block `{activityCount, hasCycle, weights}`; every score has its component evidence attached (FR-01, FR-02, FR-04, FR-05, FR-06, NFR-04) | server (bun test + Neo4j) | `api/__tests__/key-activity-scores.integration.test.ts` |
| AC-02 | **Centrality** is model-scoped betweenness over `PRECEDES`, normalised to `[0,1]` within the model: a fixture with a known hub activity (on the most `PRECEDES` shortest paths) ranks highest on centrality; a leaf activity scores near-0; a model with ≤1 activity yields all-`0` centrality without crashing (FR-02) | server (bun test + Neo4j) | `api/__tests__/key-activity-centrality.integration.test.ts` |
| AC-03 | **Critical-path position**: activities on the model's longest acyclic `PRECEDES` chain score `1`; off-path activities score the graded fraction; a **cyclic** `PRECEDES` fixture sets `meta.hasCycle=true` and still reports the longest acyclic sub-chain (no crash); a 30-deep linear fixture returns `meta.truncated=true, truncationReason:"depth_cap"` and scores against the depth-20 partial (FR-03, NFR-05) | server (bun test + Neo4j) | `api/__tests__/key-activity-critical-path.integration.test.ts` |
| AC-04 | **Handoff density**: a fixture where consecutive `PRECEDES` activities have disjoint executing-role sets (a role handoff) and disjoint used-system sets (a system handoff) scores that boundary activity higher than an activity whose neighbours share all roles+systems; the raw `handoffCount` + role/system breakdown appear as component evidence; an activity with no `PRECEDES` neighbours scores `0` (FR-04) | server (bun test + Neo4j) | `api/__tests__/key-activity-handoff.integration.test.ts` |
| AC-05 | **Composite rank** orders activities by weighted sum of the three sub-scores (default weights all `1.0`) descending, ties broken by `createdAt` then `id`; `meta.weights` echoes the defaults; the response carries **no** recommendation/suggestion field (descriptive-only, NFR-04) (FR-05, NFR-04) | server (bun test + Neo4j) | `api/__tests__/key-activity-scores.integration.test.ts` |
| AC-06 | **Mark as key** (`POST …/:activityId/mark`) writes `keyActivity` score evidence `{marked:true, markedAt, scoreSnapshot:{centrality,criticalPath,handoff,composite}, rank}` **inside** the activity's `attributes` map, preserving every **other** attribute (a pre-set unrelated attribute is unchanged after mark — resolves C-01); `NODE_LABELS`/`EDGE_ENDPOINTS` unchanged; a non-scoped `:activityId` → `404 activity_not_found` (FR-07, FR-09, FR-10, NFR-02) | server (bun test + Neo4j) | `api/__tests__/key-activity-mark.integration.test.ts` |
| AC-07 | **Reversibility** (`DELETE …/:activityId/mark`): unmark removes the `keyActivity` key and the activity's `attributes` map is **byte-equal** to its pre-mark state (no residue, siblings intact — NFR-03); unmark of an unmarked activity → `204` no-op; re-mark writes a fresh snapshot at current scores (FR-08, NFR-03) | server (bun test + Neo4j) | `api/__tests__/key-activity-mark.integration.test.ts` |
| AC-08 | **Model isolation + authz**: seed two models each with their own activities; `GET /api/v1/models/:A/key-activities` scores only model-A activities and excludes model-B-only ones; marking a model-B activity under model A's path → `404 activity_not_found`; a session without `key_activity:write` gets `403` on the mark `POST`/unmark `DELETE`, `key_activity:read` gets `200` on the GET; the `business_architect` role resolves both permissions; no new route is `public`; new routes + error code appear in `GET /api/v1/openapi.json` (FR-01, FR-07, FR-10, FR-11, NFR-01) | server (bun test + Neo4j) | `api/__tests__/key-activity-scope-authz.integration.test.ts` + `api/__tests__/key-activity-openapi.integration.test.ts` |
| AC-09 | `#/model/key-activities` resolves to `KeyActivityBoard` (not `ModelTabPlaceholder`); it reads the active model from `useActiveModel()` and renders the ready-state ranking table with rank, activity name, journey, composite score, the three sub-scores, and a key/not-key indicator per row (FR-12 ready, FR-14) | macOS Chrome (mouse+kb), macOS Safari (trackpad+kb) | `pwa/src/__tests__/key-activity-board.test.tsx` |
| AC-10 | The mark toggle marks/unmarks a row (POST/DELETE `…/:activityId/mark`) and the key indicator re-renders on success (optimistic, rolls back on error); selecting a row opens the detail panel showing the composite + three sub-scores **with their component evidence** (raw betweenness/degree, critical-path membership + partial-chain depth, raw handoff count + role/system breakdown) and, when marked, `markedAt`/`scoreSnapshot`/`rank` (FR-13, XD-11) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/key-activity-detail.test.tsx` |
| AC-11 | KeyActivityBoard renders a loading skeleton while `GET /api/v1/models/:id/key-activities` is pending (FR-12, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/key-activity-board-states.test.tsx` |
| AC-12 | With no scoped activities in the active model, KeyActivityBoard shows the empty state (a "no activities to score" message pointing to authoring) and no ranking table (FR-12 empty) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/key-activity-board-states.test.tsx` |
| AC-13 | When `GET /api/v1/models/:id/key-activities` fails, KeyActivityBoard shows the error state with a retry affordance that refetches; when the response carries `meta.truncated` or `meta.hasCycle`, a non-blocking banner shows above the still-rendered ranking (FR-12, FR-03, UX-01) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/key-activity-board-states.test.tsx` |
| AC-14 | `scripts/design-conformance.ts` passes on `KeyActivityBoard.tsx` + its CSS module (tokens-only, catalog components) (NFR-07, UX-02) | CLI | `bun run scripts/design-conformance.ts --view pwa/src/views/model/KeyActivityBoard.tsx` — expect exit 0, zero token/component violations reported |
| AC-15 | KeyActivityBoard is keyboard-reachable: Tab reaches the sort controls and each row's mark toggle in DOM order; sortable column headers activate on Enter/Space and expose `aria-sort`; opening a row detail moves focus into the panel and Escape/close returns it; the view exposes an ARIA landmark (FR-12, FR-13, UX-05) | macOS Chrome (keyboard), macOS Safari (keyboard) | manual: with the stack up, load `#/model/key-activities`, keyboard-only — Tab to a sortable column header, press Enter to sort (expect `aria-sort` flips and rows reorder), Tab to a row's mark toggle and press Space (expect the key indicator toggles), Tab/Enter to open a row detail (expect focus enters the panel and Escape returns focus to the originating row) |
| AC-16 | Deep link + active model survive reload: with model B active, navigate to `#/model/key-activities`, reload — expect the same route renders `KeyActivityBoard` showing **model B's** ranked activities (active-model persistence is `model-workspace-core`'s FR-15; this view refetches for the persisted model) (FR-14, UX-06) | macOS Chrome (mouse+kb) | `pwa/playwright/key-activity-board-context.spec.ts` |
| AC-17 | Transpile is clean and no compile-time schema arrays were edited (`keyActivity` lives in the open `attributes` map, no new label/edge) (NFR-02, NFR-06) | CLI | `bun run typecheck` exit 0; manual: `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts` shows no additions to `NODE_LABELS` or `EDGE_ENDPOINTS` |

## Platforms & Input Modes

This spec touches `pwa/` (the `KeyActivityBoard` view + its dispatch in
`renderView`). It ships **no** canvas, custom gesture, scroll-container, or global
keyboard handler — KeyActivityBoard is a **sortable table + detail-panel** surface
reusing catalog components (`DataTable`, `Card`, `Button`, `SidePanel`/`Modal`)
and native controls. The tables are populated to record this explicitly (it still
has keyboard/mouse/trackpad interaction: column-sort activation, a mark toggle, and
a detail panel).

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| Ranking table + row selection | yes | yes | yes | yes | catalog `DataTable`; row → score-evidence detail panel |
| Sortable column headers | yes | yes | yes | yes | click/tap or Enter/Space to sort; `aria-sort` reflects state |
| Mark / unmark toggle (per row) | yes | yes | yes | yes | native button/switch; POST/DELETE `…/:activityId/mark`; optimistic w/ rollback |
| Score-evidence detail panel | yes | yes | yes | yes | catalog `SidePanel`/`Modal`; read-only evidence; Escape closes |
| Canvas / drag / pinch-zoom gestures | no | no | no | no | none introduced — no canvas surface in this spec |

## Native Conflicts

KeyActivityBoard introduces **no new gesture, scroll-hijack, drag, or global
keyboard handler**. It uses native buttons, a native/catalog sortable table, and
catalog `Modal`/`SidePanel` components (whose focus-trap + Escape behavior already
exist in the catalog and are reused, not re-implemented). Column sorting is a
button/`aria-sort` header activation, not a drag. There is therefore no native
behavior to suppress beyond what the reused catalog components already handle.

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| Modal/SidePanel focus trap + Escape-to-close | (reused catalog behavior) | n/a — provided by the existing catalog `Modal`/`SidePanel`; this spec reuses, does not re-implement or override |
| (no new gesture / scroll / drag / global-keyboard handling introduced) | n/a | n/a |

## Dependencies

> **Hard build-order dependency.** The `model-workspace-core` surfaces below are
> **new files** that do not exist on disk at this spec's authoring time (verified:
> `api/src/storage/model-scope.ts`, `pwa/src/context/ActiveModelContext.tsx`,
> `pwa/src/views/model/`, `api/src/scripts/seed-rbac-roles.ts` are absent). This
> spec **cannot start implementation** until `model-workspace-core` lands its
> **FR-18** (`scopedNodeIds`), **FR-15** (`ActiveModelProvider`/`useActiveModel`),
> **FR-11** (`business_architect` role), and **FR-17** (`ModelTabPlaceholder` +
> the `key-activities` slot in the `model` surface dispatch this spec replaces).
> `story-spec-core` is this spec's **declared** blueprint dependency (wave 2 →
> wave 3 sequencing); this spec does not consume story/AC labels directly — it
> scores `Activity` nodes — but the dependency fixes build order (M2 lands
> `business-model-authoring` + this together, after stories exist).

- **`model-workspace-core`** (foundation wave 1 — transitive dependency): consumed, never re-specced.
  - `scopedNodeIds(driver, modelId)` (`api/src/storage/model-scope.ts`, FR-18) — model-scoped activity + edge reads (FR-01, NFR-01).
  - `IN_MODEL` scoping regime + `BusinessModel` root (FR-06 model-scoped routes).
  - `business_architect` RBAC role (`api/src/scripts/seed-rbac-roles.ts`, FR-11) — this spec adds `key_activity:*` to it (FR-11).
  - Model surface shell + `route.ts`/`SURFACES` registration + `ModelTabPlaceholder` for the `key-activities` tab — replaced by `KeyActivityBoard` (FR-12).
  - Shell-owned active-model context + `useActiveModel()` (`pwa/src/context/ActiveModelContext.tsx`, FR-15) — consumed by KeyActivityBoard (FR-12, FR-14).
- **`story-spec-core`** (declared blueprint dependency): sequences build order (wave 2 → wave 3). No direct interface consumed — this spec scores `Activity` nodes, not stories.
- **graph-core storage primitives** (`api/src/storage/nodes.ts` — `patchNode` semantics + `assertAttributesMatchSchema`; **not edited**, C-01/FR-09): the mark write is a dedicated attribute-preserving function that reads/merges/writes `attributes_json` directly, leaving the generic primitives untouched.
- **Existing graph analytics vendored libs** (`graphology` + `graphology-metrics/centrality/betweenness`, already imported by `api/src/ontology/analytics/graph.ts`): reused for the model-scoped centrality (FR-02). This spec builds its **own** model-scoped subgraph (not the whole-graph `fetchGraphFromNeo4j`); it may reuse the `buildGraphologyGraph` helper if it accepts an arbitrary node/edge list.
- **cto-analytics critical-path algorithm contract** (`.claude/specs/cto-analytics/` FR-06: depth-bounded DFS, caps 20/1000/4 s, `{truncated, truncationReason}` surface): the specified algorithm this spec's FR-03 reuses (contract, not code — the cto-analytics implementation is whole-graph journey-scoped; this spec re-implements the same bounded DFS over the model-scoped `PRECEDES` subgraph). Not a hard build-order dependency.
- **Central router gate** (`api/src/router.ts`) + `ROUTE_PERMISSIONS` (`api/src/auth/rbac-permissions.ts`): all new routes dispatched + auth-gated here; no per-route auth.
- **OpenAPI generation** (`api/src/routes/openapi.ts`) + `ERROR_CODES` (`api/src/errors.ts`) + `envelope`/route helpers (`api/src/routes/_helpers.ts`).
- **PWA shell + catalog** (`pwa/src/views/index.tsx` `model`-surface dispatch, `pwa/src/components/{DataTable,Card,Button,Modal,SidePanel}.tsx`, `pwa/src/views/_shared.tsx` `Loading`/`ErrorState`, `pwa/src/styles/companygraph/tokens.css`, `scripts/design-conformance.ts`, `pwa/src/api.ts` `json<T>()` wrapper).

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | **OQ-1 — critical-path budget reuse. DECIDED (default recorded in FR-03).** cto-analytics FR-06 fixed a depth-bounded DFS with caps 20 / 1000 / 4 s and a `{truncated, truncationReason}` surface. FR-03 **reuses that exact contract** for the model-scoped `PRECEDES` critical path. | Was: whether to invent new budgets. Now closed — same contract, so behavior is consistent across the two analytics surfaces. | **Decided default in FR-03.** The orchestrator may still surface it if the user wants different budgets for the smaller model-scoped graph (they can be lowered without risk). Not a design blocker. |
| 2 | **OQ-2 — composite weights: constants vs tunable. DECIDED (default recorded in FR-05).** Weights are **code-default constants** `{1.0, 1.0, 1.0}`; a settings/tuning subsystem is **out of scope** (mirrors cto-analytics RD-6). | Affects whether a settings table + `GET/PATCH …/settings` ship here. | **Decided default: constants.** Alternative (tunable weights + settings pane + audit) is a clean follow-up that reuses this endpoint's `meta.weights` echo. Flagged for the orchestrator to confirm; not a design blocker. |
| 3 | **OQ-3 — is centrality "betweenness" the right primitive, or degree/pagerank?** FR-02 picks **betweenness over `PRECEDES`** (activities that lie on many process shortest-paths are structurally central — the natural "which step is a chokepoint" reading), reusing the vendored `graphology-metrics/centrality/betweenness`. | Choice of centrality changes which activities rank high. | **Decision needed (default: betweenness).** Alternatives: degree centrality (simpler, "most-connected step"), pagerank (flow-weighted). Betweenness best matches "chokepoint / handoff-adjacent" intuition and is already vendored + deterministic. Trivial to swap or expose all three as separate columns. Recommend confirming with the user. |
| 4 | **C-01 (resolved in FR-09) — `patchNode` clobbers the whole attributes map + runs schema enforcement.** A naive `PATCH /nodes/Activity/:id {attributes:{keyActivity}}` would drop the activity's other attributes and could trip `attribute_violation`. | Would silently corrupt activity attributes and break reversibility (NFR-03). | **Resolved in FR-09/NFR-02:** mark/unmark go through a dedicated attribute-preserving storage function (read → merge only the `keyActivity` key → write merged map) in a single Cypher `SET`; generic primitives untouched; `keyActivity` lives in the open `attributes` map (exempt from `required` schema enforcement). Verified by AC-06/AC-07. |
| 5 | **Score evidence staleness after unmark/re-mark or graph edit.** `scoreSnapshot` in the `keyActivity` mark is captured **at mark time**; a later graph edit changes the live scores but not the stored snapshot. | A marked activity's stored `rank`/`scoreSnapshot` may drift from live `GET …/key-activities` scores. | **By design (XD-03 "scores recomputable, marking reversible"):** the mark is a **human judgement + evidence-at-the-time**; the live endpoint always recomputes. FR-13's detail panel shows both the live scores and the mark's snapshot so drift is visible. Re-marking captures a fresh snapshot (FR-08). No auto-recompute of stored snapshots (avoids surprise mutation). |
| 6 | **N-01 (design item) — scoring-module home + graphology reuse.** FR-01/FR-02 place the model-scoped read + scoring at `api/src/storage/key-activities.ts` (+ a pure scoring helper). Whether the pure scoring math lives in a `derive/`-style sibling (like story-spec's `api/src/derive/story-derive.ts`) or inline, and whether `buildGraphologyGraph` is reusable as-is. | Cosmetic placement + reuse extent. | Design confirms placement (recommend a pure `api/src/derive/key-activity-score.ts` for the Neo4j-free math so it is unit-testable against a fixture, mirroring story-spec's DD-01) and whether `buildGraphologyGraph` accepts an arbitrary node/edge subset. Not a requirements blocker. |
</content>
