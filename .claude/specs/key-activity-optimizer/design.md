---
feature: "key-activity-optimizer"
created: "2026-07-04"
revised: "2026-07-05"
author: "spec-author"
status: "revised"
revision: 4
reviewing_requirements_revision: 2
size: "medium"
---

# Design: key-activity-optimizer

> **Revision 4 (2026-07-05)** — realigns the (previously approved) design to
> **requirements revision 2** (approved 2026-07-05, review pass 2, 0 blockers)
> and to the **as-built code now on disk**. What changed:
>
> 1. **FR-12 catalog-gap conflict resolved by DD-11 (DD-10 superseded).**
>    Requirements rev 2 FR-12 mandates an *additive, backward-compatible
>    catalog extension* for the sortable table ("inventing a non-catalog table
>    is not an option"). The prior design's DD-10 (in-view `<table>`, catalog
>    untouched) and the as-built `KeyActivityBoard` contradict that. This
>    revision follows the approved requirements: DD-11 extends the catalog
>    `DataTable` with optional controlled-sort props; the as-built view gets a
>    small refactor (§4.10, §6, §7). **Flagged as Open Question OQ-A** — the
>    user approved both artifacts; if the shipped in-view table is preferred,
>    FR-12 needs a one-line amendment instead.
> 2. **Requirements-review pass-2 nits absorbed:** N-01 depth cap = 20 **nodes**
>    (same unit as chain length, §4.3); N-02 ranked-list field pinned to `rows`
>    (§3.3); N-03 isolated-activity `longestChainDepth 0 → criticalPath 0`
>    stated outright (§4.3) — an as-built delta, see §1.2.
> 3. **Requirements rev-2 text alignment:** FR-04 empty-set handoff rule (both
>    sides **non-empty** and disjoint, §4.4 — an as-built delta, §1.2); NFR-03
>    restated reversibility (siblings as-of-unmark-time, §4.5); FR-10's
>    reachability discipline anchored in this spec's own OpenAPI test, not a
>    repo-wide `envelope.test.ts` (§3.4); `json<T>` citation corrected to
>    `pwa/src/api.ts:49` (DD-07).
> 4. **Final design-review (pass 2, approve) concerns folded in as landed:**
>    C-01 raw-fetch unmark (§4.11, as-built `pwa/src/api.ts:387`), C-02
>    journey aggregation + duplicate-id de-dupe (§4.2, §4.3, as-built), N-02
>    true no-op unmark (§4.5, as-built).
> 5. **Finding-ID genealogy collapsed** (design-review N-03): the four
>    generations of same-letter review IDs are archived in `STATUS.md`; §2
>    below keeps only the standing decisions. Review documents remain the
>    provenance record (`review-requirements.md`, `review-design.md`).
>
> Traces the approved `requirements.md` **revision 2**: FR-01…FR-14,
> NFR-01…NFR-07, AC-01…AC-17. Every §-section names the FR/AC it serves; §7 is
> the file-change table (each row → an FR); §8 is the AC→test map. No stable ID
> is renumbered; DD-10 is retained and marked superseded.

## 1. Overview

`key-activity-optimizer` is the **optimize** stage of the Business Modeling
Studio pipeline (blueprint `author → graph → optimize → measure → systematize`,
milestone M2). For a single `BusinessModel` it computes **descriptive** graph
scores over that model's `Activity` nodes (XD-11 — scores + rankings + manual
marking, never prescriptive recommendations), ranks them, and lets a Business
Architect **manually mark** an activity as *key* — reversibly — as an attribute
with score evidence on the existing `Activity` label (XD-03, never a new
label). It ships the **KeyActivityBoard** view at `#/model/key-activities`
(blueprint View Tree, verbatim).

Four parts, in dependency style identical to `story-spec-core`:

1. **A pure, Neo4j-free scoring module** — `api/src/derive/key-activity-score.ts`
   (DD-01) — computing the three sub-scores (centrality, critical-path
   position, handoff density), composite and rank over a plain model-scoped
   subgraph read-shape, unit-testable with **no Neo4j** (FR-02–FR-05).
2. **A model-scoped Neo4j read + scoring orchestrator + mark/unmark storage** —
   `api/src/storage/key-activities.ts` — (a) `getModel` existence gate first,
   then reads the model's `Activity` subgraph consuming
   `scopedNodeIds(driver, modelId)` (never re-implemented), (b) calls the pure
   scorer, (c) writes/removes the `keyActivity` attribute through a dedicated
   **lock-first, attribute-preserving read-merge-write** that leaves the
   generic `createNode`/`patchNode` primitives byte-for-byte unchanged
   (FR-01, FR-06–FR-09).
3. **Three model-scoped REST routes** under
   `/api/v1/models/:modelId/key-activities*`, zod-validated, in
   `openapi.json` (FR-10), RBAC-gated by `key_activity:read`/`key_activity:write`
   granted to `business_architect` (FR-11) — central router gate only.
4. The **KeyActivityBoard** view replacing the `ModelTabPlaceholder` for the
   `key-activities` tab: all four view states, a **catalog-`DataTable`-based
   sortable ranking table (DD-11)**, a mark toggle, and a score-evidence
   detail panel (FR-12–FR-14).

Rules the design follows throughout: **no compile-time schema edit** (NFR-02),
**domain writes on a dedicated storage module, generic primitives untouched**
(FR-09), **consume `model-workspace-core`, never re-spec it**, **auth via the
central gate only** (NFR-06), **descriptive only — no recommendation field
anywhere in the wire shape** (NFR-04).

### 1.1 Consumed surfaces — landed and verified

Every `model-workspace-core`/`story-spec-core` surface this design consumes is
on disk (re-verified 2026-07-05):

- `api/src/storage/model-scope.ts:22-27` — `scopedNodeIds(driver: Driver,
  modelId: string): Promise<Set<string>>`; its Cypher (`:28-33`) collects
  structural ids only (`IN_MODEL` domains, `PART_OF*0..` descendants,
  `INSTANCE_IN` module instances) — shared `System`/`Role`/`Location` never
  enter the set (DD-02's premise).
- `api/src/storage/models.ts:134` — `getModel(driver, id)`, throwing
  `404 model_not_found` on miss — the §4.2/§4.5 existence gate.
- `api/src/storage/stories.ts:135-143` — `resolveModelScope` (`getModel`
  **then** `scopedNodeIds`; "unknown model → 404 `model_not_found`, never a
  silent {0,0}", `stories.ts:706`) — the documented pattern this spec mirrors.
- `pwa/src/context/ActiveModelContext.tsx:121` — `useActiveModel()` returning
  `{ activeModel: ModelRead | null, status, … }`.
- `api/src/scripts/seed-rbac-roles.ts:96` — the `business_architect` role
  with a rewritable permission array (story rows precedent:
  `api/src/auth/rbac-permissions.ts:282-289`).
- `pwa/src/views/index.tsx` `model`-surface dispatch — the `key-activities`
  tab slot (swap precedent: `stories` → `StoryCatalog`).
- `api/src/analytics/graph.ts:42` — `buildGraphologyGraph(nodes, edges)`
  (`new Graph({type:"directed", multi:false})` at `:43`); `betweenness`
  imported at `:18`; the engine's own call shape
  `betweennessCentrality(graph, {getEdgeWeight: null})` at `:131`.

### 1.2 As-built status + conformance deltas (this revision's ground truth)

The implementation has **landed on disk** (files carry `key-activity-optimizer
T-xx` task tags; STATUS.md's Execution row lags it). This revision cites the
as-built lines as the implementation reference. Verified conformant as-built:
schemas (`shared/src/schema/key-activity.ts`), storage
(`api/src/storage/key-activities.ts` — `getModel` gate `:63`, single scoped-set
threading `:64`/`:197`, journey aggregation `:87-100`, read-tolerance `:168-174`,
lock-first write `:232`, true no-op unmark `:306-311`), routes
(`api/src/routes/key-activities.ts`, router dispatch `api/src/router.ts:416`,
OpenAPI `api/src/routes/openapi.ts:835-858`), RBAC
(`rbac-permissions.ts:301-303`, `seed-rbac-roles.ts:120-121`), error codes
(`api/src/errors.ts:37` `model_not_found` reused, `:64` `activity_not_found`
added), PWA client (`pwa/src/api.ts:387` `keyActivities` block, unmark on raw
fetch), view dispatch (`pwa/src/views/index.tsx:170`), and the full test file
set of §8.

**Three deltas** between the as-built code and requirements revision 2 remain —
they are the residual implementation work this design governs:

| # | Delta | Requirement | As-built state | Fix (owner section) |
|---|-------|-------------|----------------|---------------------|
| Δ1 | Handoff empty-set rule | FR-04: a role/system handoff counts **only when both sides' sets are non-empty and disjoint** | `disjoint()` (`key-activity-score.ts:174-177`) treats an empty set as disjoint from everything — a roleless activity spuriously receives a handoff per neighbour | §4.4 — non-empty guard in the handoff pass + roleless/systemless fixtures (AC-04) |
| Δ2 | Isolated-activity critical-path score | FR-03 + req-review N-03: a chain requires ≥ 2 nodes; an isolated activity participates in no chain → `longestChainDepth 0 → criticalPath 0` | `recordPath` (`key-activity-score.ts:96-102`) records length-1 paths, so an isolated activity gets depth 1 → graded `1/criticalPathLength` ≠ 0 | §4.3 — only paths of ≥ 2 nodes contribute to `longestThrough`; fixture row (AC-03) |
| Δ3 | Sortable table not catalog-based | FR-12: catalog `DataTable` **extended additively** (or a sortable catalog variant); a non-catalog table "is not an option" | `KeyActivityBoard.tsx:271-340` renders its own inline `<table>` (the superseded DD-10 approach) | DD-11, §4.10, §6 — extend `DataTable`, refactor the view (**OQ-A** — see §2 Open Questions) |

## 2. Design decisions

Standing decisions only; the review-finding genealogy (requirements pass 1/2,
design pass 1/2, cold pass) is archived in `STATUS.md` and the `review-*.md`
files.

| ID | Decision | Where |
|----|----------|-------|
| DD-01 | **Scoring-module home.** The pure, I/O-free scoring math lives at `api/src/derive/key-activity-score.ts` — a `derive/` sibling of story-spec's `story-derive.ts`, not under `storage/` (reserved for Neo4j-touching modules). `scoreActivities(subgraph)` takes a plain read-shape (no `Driver`) and returns ranked rows + `meta`, so AC-02..AC-05 math tests are Neo4j-free. The Neo4j read → score → response wiring lives in `api/src/storage/key-activities.ts`. | §4.1, §4.3 |
| DD-02 | **Model-scoping bounds the Activity set + intra-scope `PRECEDES` edges only — NOT the `EXECUTES`/`USES_SYSTEM` reads.** `scopedNodeIds` returns structural ids only and never contains shared `System`/`Role`/`Location` (`model-scope.ts:28-33`). So: (a) the scored set is `{a : a.id ∈ scopedNodeIds ∧ a:Activity}`; (b) a `PRECEDES` edge counts only when **both** endpoints are in that set (NFR-01); (c) each scoped activity's `EXECUTES`/`USES_SYSTEM` edges to shared Role/System nodes are read **unconditionally** — filtering them by `scopedNodeIds` would zero out every handoff. Matches requirements NFR-01 (rev-2 wording). | §4.2, §4.4 |
| DD-03 | **Centrality primitive = betweenness over the model-scoped `PRECEDES` subgraph (recorded default — OQ-3).** The "chokepoint" reading: activities on many process shortest-paths. Reuses the governed graphology engine (`api/src/analytics/graph.ts`; `graphology-metrics@^2.4.0`, `api/package.json:20`); degree evidence from `graph.inDegree/outDegree`. Evidence itemises raw betweenness + in/out-degree, so degree is visible without extra columns; adding degree/pagerank as ranked columns later is additive. **Orchestrator may still surface OQ-3.** | §4.3 |
| DD-04 | **Import is authoritative for the `keyActivity` mark.** `POST /api/v1/import` (`upsertNode`) replaces the whole `attributes_json`: a pre-mark snapshot re-imports without the mark; a post-mark snapshot restores the mark with its point-in-time `scoreSnapshot`/`rank` (which the live `GET` always recomputes — evidence-at-mark-time by design, requirements risk #5). This spec does not touch import/`upsertNode`; the interaction is pinned by `api/__tests__/key-activity-import.integration.test.ts` (§8). | §4.6, §8 |
| DD-05 | **`keyActivity` lives inside the open `attributes` map, not a top-level property** (unlike story-spec's DD-03 — the mark is never a Cypher predicate; the board recomputes live scores and reads the mark per row). It therefore (a) round-trips through export/import (DD-04) and (b) never touches `NODE_LABELS`/`EDGE_ENDPOINTS` (NFR-02, AC-17). The mark write (§4.5) is a bespoke parameterized `SET a.attributes_json = $merged` that **bypasses `patchNode`/`assertAttributesMatchSchema` by design**; the permissive-`Activity`-schema argument bites only on the import path, and only **provided the `Activity` attribute schema is not `additionalProperties:false`** (current default: unlisted keys pass — `api/src/ontology/cache/attribute-zod.ts:57-72`). A future strict `Activity` schema must declare `keyActivity` (requirements FR-09/risk row 7; recorded as a docstring in the storage module). | §3.2, §4.5 |
| DD-06 | **Response identifiers are en-US camelCase (`hasCycle`/`truncated`/`truncationReason`)**, diverging from cto-analytics FR-06's snake_case — this spec reuses that spec's algorithm **contract** (caps 20/1000/4 s + truncation surface), not its wire shape (requirements FR-03 casing note; NFR-06). | §3.3, §4.3 |
| DD-07 | **PWA calls the exported `api.keyActivities.*` block, never the private `json<T>` helper** (`pwa/src/api.ts:49`, module-private — requirements N-05). `list`/`mark` ride `json<T>` (JSON-returning 200s); **`unmark` rides raw `fetch` + `res.ok`** — `json<T>` unconditionally calls `res.json()` and would throw on the 204's empty body, spuriously rolling back a successful unmark (design-review C-01; `stories.remove` precedent, `pwa/src/api.ts` — as-built at `:387`). The shared `json<T>` is not modified. | §4.11 |
| DD-08 | **No `?model=` query param — model identified by the `:modelId` path segment** (consistency with `model-workspace-core` D-1 / `story-spec-core` DD-06). Isolation proven by the `scopedNodeIds` join + the two-model test (AC-08). | §4.2, §5 |
| DD-09 | **Composite weights are code-default constants `{centrality:1.0, criticalPath:1.0, handoff:1.0}` (recorded default — OQ-2; mirrors cto-analytics RD-6).** No settings/tuning subsystem. `meta.weights` echoes the constants so a future tunable-weights follow-up reuses this shape. **Orchestrator may still surface OQ-2.** | §4.3, §5 |
| DD-10 | ~~In-view sort layer; catalog `DataTable` NOT extended.~~ **SUPERSEDED by DD-11** — requirements rev 2 FR-12 mandates an additive catalog extension and rules out a non-catalog table. Retained (not renumbered) for traceability; the as-built view still implements DD-10 and is refactored under Δ3. | §1.2 (Δ3) |
| DD-11 | **The catalog `DataTable` is extended additively with optional controlled-sort props; sort *logic and state* stay in the view (resolves FR-12's catalog-gap decision; supersedes DD-10).** Exact choice (named here per FR-12): extend `pwa/src/components/DataTable.tsx` itself — **not** a parallel `SortableDataTable` variant (one canonical table component; a variant would fork the styling surface). New optional props (§4.10): per-column `sortable?: boolean`; `sort?: {column, dir}` (controlled); `onSort?(columnId)`; `getRowKey?(row, index)`. A `sortable` column header renders a keyboard-activatable `<button>` inside `<th aria-sort=…>`; without the new props the component renders **byte-identically to today** (plain `<th>{label}`, index-keyed rows), so every existing consumer compiles and renders unchanged (backward-compatible, FR-12). `onRowClick` is deliberately **not** added: row selection stays a per-cell ReactNode button (the name cell), which is keyboard-reachable without making a whole `<tr>` interactive (UX-05). Comparators, sort state, and the stable client-side sort remain in `KeyActivityBoard` (no re-fetch on sort — the full ranking is one response, NFR-05). | §4.10, §6, §7 |

**Open Questions for the orchestrator/user:**

- **OQ-A (new, needs a decision):** FR-12 rev 2 (catalog extension mandatory)
  vs the user-approved prior design DD-10 + as-built in-view table. This
  revision follows the requirements (DD-11 + Δ3 refactor of the shipped view).
  Alternative: amend FR-12's catalog-gap clause to bless the as-built in-view
  sort (zero code churn, but leaves `DataTable` static and the sortable-table
  pattern non-reusable). Cannot be silently resolved both ways.
- **OQ-1** (critical-path budgets — default: cto-analytics contract 20 nodes /
  1000 paths / 4 s, §4.3), **OQ-2** (constant weights — DD-09), **OQ-3**
  (betweenness — DD-03): decided defaults, may still be surfaced.

## 3. Data model

**No new label, no new edge type, no new store** (NFR-02, XD-02, XD-03). The
"key activity" judgement is a key inside the existing `Activity` node's open
`attributes` map. `NODE_LABELS` / `EDGE_ENDPOINTS` are **not edited** (AC-17).
REST-boundary zod schemas live in `shared/src/schema/key-activity.ts`
(as-built, verified against §3.2/§3.3 below).

### 3.1 Consumed upstream interfaces (cited, not re-specced)

| Interface | Source (landed, verified) | Signature used |
|-----------|---------------------------|----------------|
| `scopedNodeIds` | `api/src/storage/model-scope.ts:22-27` (`model-workspace-core` FR-18) | `(driver, modelId) => Promise<Set<string>>` — structural ids only; excludes shared System/Role/Location |
| `getModel` | `api/src/storage/models.ts:134` | throws `404 model_not_found` on miss — the §4.2/§4.5 existence gate |
| `business_architect` role | `api/src/scripts/seed-rbac-roles.ts:96` (`model-workspace-core` FR-11) | idempotent `MERGE (r:RBACRole {name})`, rewritable permission array (as-built grant at `:120-121`) |
| `key-activities` tab slot | `pwa/src/views/index.tsx:170` (`model-workspace-core` FR-17) | dispatch target swapped to `KeyActivityBoard` (as-built) |
| `useActiveModel()` | `pwa/src/context/ActiveModelContext.tsx:121` (`model-workspace-core` FR-15) | `{ activeModel: ModelRead \| null, status, … }` |
| `buildGraphologyGraph(nodes, edges)` | `api/src/analytics/graph.ts:42` | directed, `multi:false` (`:43`); accepts an arbitrary node/edge list; `GraphNode {id; label; name}` from `api/src/neo4j/read-only-graph.ts:29-34` |
| generic node primitives | `api/src/storage/nodes.ts` (graph-core) | **not edited**; mark write is the bespoke lock-first read-merge-write (§4.5) |
| catalog `DataTable` | `pwa/src/components/DataTable.tsx` | today static `{columns, rows}`; extended additively per DD-11 |

### 3.2 The `keyActivity` attribute (FR-07, FR-09, DD-05, XD-03)

Stored under `Activity.attributes.keyActivity` (inside `attributes_json`):

```jsonc
{
  "marked": true,
  "markedAt": "2026-07-04T12:00:00.000Z",   // ISO 8601, server-set
  "scoreSnapshot": {                          // scores AT MARK TIME (evidence)
    "centrality": 0.83, "criticalPath": 1.0, "handoff": 0.5, "composite": 2.33
  },
  "rank": 1                                   // 1-based rank AT MARK TIME
}
```

zod (`shared/src/schema/key-activity.ts`, as-built): `keyActivityMarkSchema`
(`marked: z.literal(true)`, `markedAt: z.string().datetime()`,
`scoreSnapshot: subScoresSchema.extend({composite: z.number()})`,
`rank: z.number().int().positive()`) and `subScoresSchema` (three
`z.number().min(0).max(1)` fields). The **mark request has no body** (`POST
…/mark` snapshots the *live server-computed* scores — a client cannot forge a
snapshot); the **unmark request has no body**. Both take only path params.

### 3.3 Score-response shape (FR-06, DD-06) — `keyActivityScoresSchema`

As-built in `shared/src/schema/key-activity.ts`:

```ts
export const activityScoreRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  journeyId: z.string().nullable(),      // parent UserJourney via PART_OF
  journeyName: z.string().nullable(),
  rank: z.number().int().positive(),     // 1-based, composite desc
  composite: z.number(),
  scores: subScoresSchema,               // three normalized [0,1] sub-scores
  evidence: z.object({
    centrality:   z.object({ betweenness: z.number(), inDegree: z.number().int(),
                             outDegree: z.number().int() }),
    criticalPath: z.object({ onCriticalPath: z.boolean(),
                             longestChainDepth: z.number().int(),
                             criticalPathLength: z.number().int() }),
    handoff:      z.object({ handoffCount: z.number().int(),
                             roleHandoffs: z.number().int(),
                             systemHandoffs: z.number().int() }),
  }),
  key: keyActivityMarkSchema.nullable(), // the stored mark, or null
});

export const keyActivityScoresSchema = z.object({
  rows: z.array(activityScoreRowSchema),
  meta: z.object({
    activityCount: z.number().int(),
    hasCycle: z.boolean(),
    truncated: z.boolean().optional(),
    truncationReason: z.enum(["depth_cap", "path_budget", "wall_clock"]).optional(),
    weights: z.object({ centrality: z.number(), criticalPath: z.number(),
                        handoff: z.number() }),
  }),
});
```

**The ranked-list field is named `rows`** — pinned here once (requirements
review pass-2 N-02) so AC-08/AC-12's assertions and the zod shape agree
byte-for-byte. `meta.weights` echoes the DD-09 constants. The response carries
**no** recommendation/suggestion field (descriptive-only — NFR-04, AC-05; the
schema file carries a "do not add one" comment).

### 3.4 Error codes (FR-10) — additive to the closed `ERROR_CODES`

| Code | HTTP | Thrown from |
|------|------|-------------|
| `activity_not_found` | 404 | `POST`/`DELETE …/:activityId/mark` when — **after** the `getModel` gate confirmed `:modelId` exists — `:activityId` is not a model-scoped `Activity` of `:modelId` (a cross-model or non-existent activity is not found under this model path) |

Only **one** code is added (as-built: `api/src/errors.ts:64`). The unknown-model
case **reuses** `model_not_found` (already present, `api/src/errors.ts:37` —
consumed, never re-added). An *existing* model with zero scoped activities is
**not** an error — `200` empty ranking (§4.2). Reachability discipline is
anchored in **this spec's own test** (requirements C-06 — there is no repo-wide
`envelope.test.ts` reachability assertion):
`api/__tests__/key-activity-openapi.integration.test.ts` asserts
`activity_not_found` appears in the OpenAPI error-envelope enum **and** is
returned by a real request (AC-08). No unreachable "reserved" code.

## 4. Core logic

### 4.1 Module split (DD-01)

| Module | Kind | Responsibility |
|--------|------|----------------|
| `api/src/derive/key-activity-score.ts` | pure, no Neo4j | `scoreActivities(subgraph): {rows; meta}` — three sub-scores + composite + rank + `meta`; unit-tested against fixtures (AC-02..05) |
| `api/src/storage/key-activities.ts` | Neo4j | `readModelSubgraph(driver, modelId, opts?: {scoped?})`, `computeScores(driver, modelId, opts?: {scoped?})` (read → score → attach live marks), `markActivity`, `unmarkActivity` (lock-first attribute-preserving write, §4.5). The optional `scoped` set threads a pre-computed `scopedNodeIds` result so a mark computes it once (as-built `:64`, `:197`) |
| `api/src/routes/key-activities.ts` | route | 3 handlers, zod boundary, `{error}` envelope |

The pure scorer's input shape (as-built):

```ts
export interface ScoreActivity {
  id: string; name: string; createdAt: string;   // "~" sentinel when absent (§4.3)
  journeyId: string | null; journeyName: string | null;
  roleIds: string[];    // via EXECUTES — shared nodes, unfiltered (DD-02)
  systemIds: string[];  // via USES_SYSTEM — shared nodes, unfiltered (DD-02)
}
export interface ScoreEdge { fromId: string; toId: string; }  // intra-scope PRECEDES
export interface ScoreSubgraph {
  activities: ScoreActivity[]; precedes: ScoreEdge[];
  weights: { centrality: number; criticalPath: number; handoff: number };
}
```

### 4.2 Model-scoped subgraph read (FR-01, NFR-01, DD-02)

`readModelSubgraph(driver, modelId)` (as-built `api/src/storage/key-activities.ts`):

1. **Model-existence gate first.** `await getModel(driver, modelId)` — miss →
   `404 model_not_found`. This gate opens **all three** handlers, mirroring
   `resolveModelScope` (`stories.ts:135-143`). Only then
   `scopedNodeIds(driver, modelId)` (or the threaded `opts.scoped`). An
   **empty scoped set is NOT a 404**: a freshly created, not-yet-authored
   model legitimately returns a **valid empty ranking** (`200`, `rows: []`,
   `meta.activityCount: 0`) — exactly what the board's empty state keys on
   (AC-12, §4.10). Empty-vs-unknown is therefore unambiguous (requirements
   B-01 contract).
2. Two read queries, parameterised by `$scopedIds = [...scoped]`:

```cypher
// Activities in scope + AGGREGATED journey + UNFILTERED shared Role/System
MATCH (a:Activity) WHERE a.id IN $scopedIds
OPTIONAL MATCH (a)-[:PART_OF]->(j:UserJourney)
OPTIONAL MATCH (r:Role)-[:EXECUTES]->(a)          // shared Role — read anyway (DD-02)
OPTIONAL MATCH (a)-[:USES_SYSTEM]->(sys:System)   // shared System — read anyway (DD-02)
RETURN a.id AS id, a.name AS name,
       coalesce(a.createdAt, "~") AS createdAt,   // missing createdAt → high sentinel,
                                                  // id fallback decides (§4.3 tiebreak)
       [x IN collect(DISTINCT j) WHERE x IS NOT NULL | {id: x.id, name: x.name}] AS journeys,
       collect(DISTINCT r.id) AS roleIds,
       collect(DISTINCT sys.id) AS systemIds
```

   The journey is **aggregated** (design-review C-02): nothing enforces a
   single `Activity→UserJourney` `PART_OF` parent, and a non-aggregated `j.id`
   return would fan a multi-parent activity into duplicate rows (duplicate
   ranked entries, double-counted handoffs). The row layer sorts the collected
   journeys and picks the **lowest `j.id`** deterministically (as-built
   `:94-106`); the scorer additionally de-dupes by activity id defensively
   (§4.3).

```cypher
// PRECEDES — BOTH endpoints in the scoped Activity set (DD-02(b), NFR-01);
// self-loops excluded, parallel edges collapsed (multi:false graph safety)
MATCH (p:Activity)-[:PRECEDES]->(q:Activity)
WHERE p.id IN $scopedIds AND q.id IN $scopedIds AND p.id <> q.id
RETURN DISTINCT p.id AS fromId, q.id AS toId
```

   Model-scoping bounds the **Activity set** and the **intra-scope `PRECEDES`
   edges**; `EXECUTES`/`USES_SYSTEM` edges to shared Role/System nodes are
   deliberately unfiltered — Role/System are never in the scoped set, and
   filtering would zero out all handoffs (NFR-01 rev-2 wording; DD-02).

A model with 0 or 1 scoped activities yields all sub-scores `0` without
crashing (FR-02/FR-04); the board renders the empty state at
`meta.activityCount === 0` (AC-12).

### 4.3 Scoring math (FR-02–FR-05) — pure `scoreActivities`

**Defensive input guards (as-built `key-activity-score.ts:187-207`).** Before
any math: (a) de-dupe activities by `id` (first occurrence wins — a
duplicate-id input collapses to one ranked row, design-review C-02); (b) filter
self-loops, de-dupe `(fromId, toId)` pairs, drop edges whose endpoints left the
activity set. The **same** cleaned edge set feeds centrality, critical path and
handoff, so neighbour sets cannot diverge.

**Betweenness centrality (FR-02, DD-03).** Build the directed graph via the
reused `buildGraphologyGraph` (`ScoreActivity → GraphNode{id, label:"Activity",
name}`; `createdAt` deliberately not carried — it is only a rank-tiebreak
input). Run `betweennessCentrality(graph, {getEdgeWeight: null})` (the engine's
own call, `analytics/graph.ts:131`; deterministic — NFR-04). Normalise to
`[0,1]` by the model max; **all-zero → all 0** (guards ≤1-activity / no-edge
models). Evidence: raw `betweenness`, `inDegree`, `outDegree`.

**Critical-path position (FR-03).** Re-implements the cto-analytics FR-06
**contract** over the model-scoped `PRECEDES` subgraph (camelCase fields,
DD-06). Memoised depth-bounded DFS from every in-degree-0 source (all nodes
when none), visited-set per path:

- **Units (requirements C-04 + review N-01): everything is counted in
  nodes.** Chain length = node count (a chain requires **≥ 2 nodes**); the
  **depth cap is 20 nodes** — the DFS bound (`path.length >= DEPTH_CAP`,
  as-built `:117`) and the chain-length unit use the same measure, so AC-03's
  30-node linear fixture truncates to a 20-node partial
  (`truncationReason: "depth_cap"`) and matches cto-analytics AC-06's
  20-node `longest_partial`.
- Budgets (OQ-1 recorded default): depth 20 nodes / 1000 candidate paths /
  4 s wall-clock (as-built `:50-52`). On exhaustion: `meta.truncated = true`,
  `truncationReason ∈ {"depth_cap","path_budget","wall_clock"}`; scores are
  computed against the longest partial found.
- `criticalPathLength` = node count of the longest acyclic chain, `0` when no
  chain exists (zero intra-scope edges → every `criticalPath` sub-score `0`;
  no division by zero — the graded formula is guarded).
- Per activity: sub-score `1` on the critical path, else
  `longestChainDepth(a) / criticalPathLength` graded `[0,1)`.
  **Isolated-activity rule stated outright (review N-03, Δ2):** an activity
  with no intra-scope `PRECEDES` edges participates in **no chain** (a chain
  needs ≥ 2 nodes), so `longestChainDepth = 0` and `criticalPath = 0` — even
  in a model that *does* have a critical path. Implementation: only DFS paths
  of **≥ 2 nodes** contribute to `longestThrough` (the as-built `recordPath`
  currently records length-1 paths — the Δ2 fix). Evidence:
  `{onCriticalPath, longestChainDepth, criticalPathLength}`.
- **Cycles:** a cyclic subgraph sets `meta.hasCycle = true` (DFS revisits a
  path node) but never crashes — the longest *acyclic* sub-chain is still
  reported (AC-03).

**Handoff density (FR-04, DD-02).** Over each activity's **distinct**
model-scoped `PRECEDES` neighbours (predecessors ∪ successors, computed from
the cleaned edge set — a mutual `a↔b` pair yields **one** neighbour slot per
side, never two):

- A **role handoff** with neighbour `n` counts iff `a.roleIds` and `n.roleIds`
  are **both non-empty and disjoint**; likewise a **system handoff** on
  `systemIds`. **Empty sets never count (requirements C-03, Δ1):** empty sets
  are vacuously disjoint from everything, and counting them would rank an
  *under-modeled* activity spuriously high — the opposite of trustworthy
  evidence (XD-11). The as-built `disjoint()` lacks the non-empty guard — the
  Δ1 fix adds `a.roleIds.length > 0 && n.roleIds.length > 0 &&
  disjoint(…)` (resp. systems).
- `handoffCount(a) = roleHandoffs + systemHandoffs`. Normalise by the model
  max; all-zero → all 0; no `PRECEDES` neighbours → 0. Evidence: raw
  `handoffCount`, `roleHandoffs`, `systemHandoffs`. Because
  `roleIds`/`systemIds` come from the unfiltered shared-node reads (DD-02(c)),
  both sides' sets are always fully populated and comparable.

**Composite + rank (FR-05, DD-09).** `composite = Σ wᵢ·scoreᵢ` with constants
`{1.0, 1.0, 1.0}` (`DEFAULT_WEIGHTS`, as-built `:55`). Rank by `composite`
**descending**; ties by **lowest `createdAt`, then lowest `id`** (story-spec
tiebreak convention — NFR-04). `createdAt` is a plain comparable string; a
missing value arrives as the §4.2 `"~"` sentinel (sorts last), and `id`
(UUIDv7, always present) is the total final fallback — deterministic even
against legacy data. `rank` is 1-based; `meta.weights` echoes the constants.

### 4.4 Attaching live marks to score rows (FR-01, FR-06)

`computeScores`: after `scoreActivities` produces `rows`, the subgraph read's
returned nodes supply each activity's `attributes_json`; the storage layer
parses it and attaches `row.key = attributes.keyActivity ?? null`, validated by
`keyActivityMarkSchema`. The `GET` response therefore shows **live** scores
next to the **point-in-time** mark snapshot, so drift (requirements risk #5) is
visible in the detail panel (FR-13).

**Read-path tolerance (documented display contract).** Unmark deletes the whole
key and this spec never writes `marked: false`; but an import or hand-edit
could plant a foreign value. **Any stored `keyActivity` that fails
`keyActivityMarkSchema` — including `marked:false` — is treated as unmarked
(`row.key = null`) and logged at `warn`, never crashing the ranking**
(as-built `:168-174`). The node attribute is left untouched by the read path —
displayed-as-unmarked, never silently deleted.

### 4.5 Mark / unmark — lock-first attribute-preserving write (FR-07–FR-09, NFR-03, DD-05)

The generic `patchNode` replaces the **whole** `attributes_json` and runs
`assertAttributesMatchSchema` (`api/src/storage/nodes.ts:180-198`) — a naive
`PATCH /nodes/Activity/:id` would clobber sibling attributes. Mark/unmark
therefore use a dedicated read-merge-write that never calls the generic
primitives (as-built `api/src/storage/key-activities.ts`):

`markActivity(driver, modelId, activityId)`:

1. **Gate sequencing.** `getModel` first — unknown model → `404
   model_not_found` **before** any activity check (matches the story routes'
   combined-404 convention, `api/src/routes/openapi.ts:742`). Then
   `scopedNodeIds` **once** (as-built `:197`); `activityId ∈ scoped` and
   labelled `Activity`, else `404 activity_not_found` (no cross-model mark,
   AC-08).
2. **Snapshot live scores.** `computeScores(driver, modelId, { scoped })` —
   threading the step-1 set — and pick the row for `activityId` → its
   `{centrality, criticalPath, handoff, composite}` + `rank`. The snapshot is
   **server-computed, never client-supplied** (§3.2). It is a best-effort
   point-in-time read, **not tx-consistent with the step-3 write** —
   acceptable by design: the mark is evidence-at-mark-time (risk #5) and the
   live `GET` always recomputes, so drift is surfaced, not hidden. Cost: one
   full-model scoring per mark — within NFR-05 at single-model scale; a
   future optimisation may narrow the recompute, staying server-authoritative.
3. **Lock-first read-merge-write in one tx** — merge in JS (no APOC), inside
   a single `session.executeWrite`:

```cypher
// statement 1 — TAKE THE WRITE LOCK, then read under it.
// Neo4j is read-committed and a plain MATCH…RETURN takes no lock; the no-op
// SET acquires the node's exclusive lock (held to commit) BEFORE the read,
// so concurrent attribute writers serialise behind the mark and the
// read-modify-write is race-free.
MATCH (a:Activity {id:$activityId})
SET a.updatedAt = a.updatedAt
RETURN a.attributes_json
```

   `JSON.parse` → `attrs`; `attrs.keyActivity = mark` (validated by
   `keyActivityMarkSchema` before write, as-built `:280`); then in the same
   tx, lock still held:

```cypher
// statement 2 — the merged write
MATCH (a:Activity {id:$activityId})
SET a.attributes_json = $merged, a.updatedAt = $now
```

   Every **other** attribute is preserved byte-for-byte — only the
   `keyActivity` key is added/replaced (AC-06). No attribute-schema check runs
   on this bespoke `SET` (the bypass is the point of not using `patchNode` —
   DD-05, §9). Returns `200` + the updated activity's rank row (`key`
   populated).

`unmarkActivity(driver, modelId, activityId)`:

1. Same gate sequencing (`model_not_found` → `activity_not_found`).
2. Statement-1 lock-first read; if **no `keyActivity` key exists, the write is
   skipped entirely** — a **true no-op**: statement 2 never runs and
   `updatedAt` is untouched (design-review N-02; as-built `:306-311`) →
   `204` (idempotent, FR-08 — never a 404).
3. Otherwise `delete attrs.keyActivity`, write the merged map (statement 2).
   **Reversibility invariant (NFR-03, rev-2 wording):** unmark removes *only*
   the `keyActivity` key — **all sibling attributes as of unmark time are
   preserved byte-for-byte** (no residue, no altered siblings). A sibling
   legitimately edited between mark and unmark keeps its edited value — unmark
   never restores pre-mark sibling state. (AC-07's fixture edits no siblings
   in between, so it also observes byte-equality with the pre-mark map.)
4. Re-marking after unmark writes a **fresh** snapshot at then-current live
   scores (marking is recomputable, XD-03, AC-07).

The generic `createNode`/`patchNode` primitives stay **byte-for-byte
unchanged** (FR-09, AC-17).

### 4.6 Import interaction (DD-04)

`POST /api/v1/import` (`upsertNode`) replaces the whole `attributes_json`
(`nodes.ts:245-251`); because `keyActivity` lives in `attributes`, import is
authoritative (pre-mark snapshot → mark dropped; post-mark snapshot → mark
restored with its point-in-time evidence). Import/`upsertNode` are **not
touched**; the round-trip is pinned by
`api/__tests__/key-activity-import.integration.test.ts` (§8) — which also pins
the DD-05 permissive-schema assumption (requirements risk row 7).

### 4.7 Route handlers + dispatch (FR-06–FR-08, FR-10)

`api/src/routes/key-activities.ts` (as-built) — handlers return the
`{error:{code,message,details?}}` envelope via `_helpers.ts`
(`ok`/`noContent`); the `getModel` gate runs inside the storage functions:

| Handler | Method + route | Returns |
|---------|----------------|---------|
| `handleKeyActivityScores` | `GET /models/:modelId/key-activities` | `200 keyActivityScoresSchema`; unknown model → `404 model_not_found`; existing 0-activity model → `200 rows:[] / activityCount:0` (never 404) |
| `handleKeyActivityMark` | `POST /models/:modelId/key-activities/:activityId/mark` | `200 activityScoreRowSchema` (`key` populated); 404s sequenced `model_not_found` → `activity_not_found` |
| `handleKeyActivityUnmark` | `DELETE /models/:modelId/key-activities/:activityId/mark` | `204`; same 404 sequencing; unmarking unmarked → `204` (true no-op) |

**Dispatch** (`api/src/router.ts:416`, as-built): a
`models/:modelId/key-activities*` block after the `models*` and `stories*`
blocks, specific-before-parameterized (the `mark` literal never collides with
the bare `key-activities` path — different segment counts — but ordering
follows the house convention). Mark/unmark requests have **no body** (§3.2).

### 4.8 Route-permission mapping + RBAC (FR-11)

`api/src/auth/rbac-permissions.ts` (as-built `:301-303`):

```
P("GET",    "models/:modelId/key-activities",                   "key_activity:read"),
P("POST",   "models/:modelId/key-activities/:activityId/mark",  "key_activity:write"),
P("DELETE", "models/:modelId/key-activities/:activityId/mark",  "key_activity:write"),
```

**No new route is `public`**; auth is enforced only by the central gate
(`router.ts` → `getRoutePermission` → RBAC check) — never per-route (NFR-06).
`api/src/scripts/seed-rbac-roles.ts` — `business_architect` gains
`key_activity:read` + `key_activity:write` (as-built `:120-121`; idempotent
MERGE; role created by `model-workspace-core`, only its permission list is
extended here — the `story:read`/`story:write` precedent).

### 4.9 OpenAPI (FR-10)

`api/src/routes/openapi.ts` (as-built `:835-858`): the three paths registered
from the same zod definitions (no hand-maintained copy). The `GET` scores path
documents `404: model_not_found`; mark/unmark document
`404: model_not_found | activity_not_found` (the story routes' combined-404
convention, `openapi.ts:742`). AC-08's OpenAPI test asserts routes + the new
code appear in `GET /api/v1/openapi.json` and that `activity_not_found` is
returned by a real request (§3.4).

### 4.10 PWA — KeyActivityBoard view (FR-12–FR-14, DD-11)

- **`pwa/src/views/index.tsx`** — the `model` surface's `key-activities` entry
  dispatches to `<KeyActivityBoard route={r} />` (as-built `:170`; the only
  edit to that file — `route.ts`/`SURFACES` stay `model-workspace-core`'s).
- **`pwa/src/components/DataTable.tsx` + `DataTable.module.css` — additive
  extension (DD-11, Δ3, FR-12).** New optional props:

  ```ts
  interface Column { id: string; label: string; align?: "left"|"right";
                     kind?: ColKind; sortable?: boolean }          // NEW: sortable
  interface DataTableProps {
    columns: Column[];
    rows: Array<Record<string, ReactNode>>;
    sort?: { column: string; dir: "asc" | "desc" };                // NEW: controlled sort state
    onSort?: (columnId: string) => void;                           // NEW
    getRowKey?: (row: Record<string, ReactNode>, i: number) => string; // NEW: stable row keys
  }
  ```

  A `sortable` column renders `<th aria-sort={ascending|descending|none}>`
  containing a native `<button type="button">` (keyboard-activatable via
  Enter/Space for free) with the label + a token-styled sort glyph; clicking
  calls `onSort(column.id)`. `getRowKey` replaces index keying when supplied
  (stable identity under client-side re-sort). **Without the new props the
  render output is byte-identical to today** (plain `<th>{label}`, index
  keys) — every existing consumer compiles and renders unchanged
  (backward-compatible, FR-12). Sort *logic* never lives in the catalog: the
  component renders state and reports clicks.
- **`pwa/src/views/model/KeyActivityBoard.tsx` + `.module.css`** (as-built;
  refactored under Δ3 to render the ranking through the extended `DataTable`
  instead of its inline `<table>`): reads the active model from
  `useActiveModel()` (never re-implements model selection), fetches via
  `api.keyActivities.list(modelId)` keyed on `activeModel.id`. **All four
  states (UX-01):**
  - **loading** (AC-11) — `Loading` from `views/_shared.tsx` while the fetch
    is in flight.
  - **empty** (AC-12) — `meta.activityCount === 0` → a `Card` with a "no
    activities to score" message linking to authoring (`#/model/canvas`); no
    ranking table. Driven by the `200 rows:[]` contract — reachable for every
    existing model, including a brand-new 0-domain one (never a 404).
  - **error** (AC-13) — `ErrorState` from `views/_shared.tsx` (verified: it
    renders the message only, no retry control) **plus a sibling catalog
    `Button`** whose click re-invokes `api.keyActivities.list` and re-enters
    loading.
  - **ready** (AC-09) — the sortable ranking table via the extended
    `DataTable` (DD-11): columns rank / activity / journey / composite / the
    three sub-scores (all `sortable`) + a Key column. The view holds
    `sortColumn`/`sortDir` state, sorts the fetched `rows` client-side
    (stable; default `composite` desc = the server's DD-09 rank order; text
    columns default asc), passes `sort` + `onSort` + `getRowKey={row.id}`
    down, and builds cells as ReactNodes: the activity-name cell is a button
    opening the detail panel; the Key cell holds the key badge + mark-toggle
    `Button`. No re-fetch on sort — the full ranking is one response
    (NFR-05).
  - `meta.truncated` / `meta.hasCycle` → a **non-blocking banner** (`role=
    "status"`) above the still-rendered ranking (AC-13, FR-03).
- **Mark/unmark + detail (FR-13, AC-10)** — the mark toggle is
  **optimistic-with-rollback-on-error**: toggle the row's `key` immediately;
  revert **only on a rejected promise** (a successful 204 unmark resolves
  `void` — no rollback; DD-07). On mark success the server's returned rank
  row replaces the optimistic one. Selecting a row opens the catalog `Modal`
  (focus-trap + Escape reused, not re-implemented) showing the **score
  evidence**: composite + three sub-scores with component values (raw
  betweenness / in-out degree; `onCriticalPath` + `longestChainDepth` /
  `criticalPathLength`; raw `handoffCount` + role/system breakdown) — XD-11
  explainability — plus, when marked, `markedAt`/`scoreSnapshot`/`rank` so
  live-vs-snapshot drift is visible.
- **Model scope + reload survival (FR-14, AC-16)** — fetch keyed on
  `activeModel.id`; model switch refetches; deep link + reload re-renders for
  the persisted active model (persistence is `model-workspace-core` FR-15).
  No cross-model leakage (server-enforced, §4.2).
- **Tokens + a11y (NFR-07, UX-02/05; AC-14/AC-15)** — CSS modules use only
  `var(--…)` from `pwa/src/styles/companygraph/tokens.css`; catalog
  components first. ARIA landmark on the view (`<section aria-label>`); Tab
  reaches sort headers then each row's controls in DOM order; sortable
  headers activate on Enter/Space and expose `aria-sort`; detail `Modal`
  moves focus in and Escape/close returns it. `bun run
  scripts/design-conformance.ts --view pwa/src/views/model/KeyActivityBoard.tsx`
  exits 0 (AC-14).

### 4.11 PWA api client (FR-12, FR-13, DD-07)

`pwa/src/api.ts` — the exported `keyActivities` block (as-built `:387`; the
private `json<T>` at `:49` is wrapped, never exported):

```ts
keyActivities: {
  list: (modelId, signal?) => json<KeyActivityScores>(…),   // 200 JSON
  mark: (modelId, activityId) => json<ActivityScoreRow>(…, { method: "POST" }), // 200 JSON
  // 204 NO-BODY: json<T> would throw on res.json() and trigger a spurious
  // optimistic rollback — unmark rides raw fetch + res.ok (stories.remove
  // precedent). The shared json<T> helper is NOT modified.
  unmark: async (modelId, activityId): Promise<void> => { /* raw fetch + res.ok */ },
},
```

AC-10's component test mocks at the **`fetch` level with a real
`new Response(null, { status: 204 })`** so the 204 path is actually exercised
(mocking `api.keyActivities.unmark` itself would mask the failure mode).

## 5. HTTP API surface

All under `/api/v1/`, zod-validated, `{error:{code,message,details?}}`
envelope, in `openapi.json` (FR-10). Permission column = `ROUTE_PERMISSIONS`
(FR-11). No `?model=` param (DD-08); no settings route (DD-09); no
recommendation field anywhere (NFR-04).

| Method | Route | FR | Perm | Notes |
|--------|-------|----|------|-------|
| GET | `/api/v1/models/:modelId/key-activities` | FR-06 | `key_activity:read` | live scores + ranking; `meta{activityCount,hasCycle,truncated?,truncationReason?,weights}`; unknown model → 404 `model_not_found`; existing 0-activity model → 200 `rows:[]` |
| POST | `/api/v1/models/:modelId/key-activities/:activityId/mark` | FR-07 | `key_activity:write` | server-side snapshot into `attributes.keyActivity` (lock-first, §4.5); 200 + rank row; 404s `model_not_found` → `activity_not_found` |
| DELETE | `/api/v1/models/:modelId/key-activities/:activityId/mark` | FR-08 | `key_activity:write` | removes the key (siblings-as-of-unmark preserved, NFR-03); 204; idempotent true no-op |

`activity_not_found` added to `ERROR_CODES` (§3.4), reachable from mark +
unmark.

## 6. UI design

- **View-tree placement (FR-12, UX-06).** `#/model/key-activities` →
  `KeyActivityBoard` — route **verbatim** from the blueprint View Tree. No
  `route.ts`/`SURFACES` edit; only the `renderView`/`VIEWS` dispatch swap
  (§4.10).
- **Component plan (UX-02, DD-11).** Catalog-first: **`DataTable` (extended
  additively — the one catalog edit, FR-12/Δ3)** for the ranking table;
  `Card` (empty state + ranking frame), `Button` (mark toggle, retry sibling
  of `ErrorState`), `Modal` (score-evidence detail — focus-trap/Escape
  reused), `Loading`/`ErrorState` from `views/_shared.tsx`. Key badge +
  truncation banner are token-styled `<span>`/`<div>`s. **No new catalog
  component**; no non-catalog table (FR-12 — the prior in-view table is
  refactored away, §1.2 Δ3).
- **States (UX-01):** loading / empty / error / ready per §4.10
  (AC-09/11/12/13).
- **Tokens (UX-02, NFR-07):** `KeyActivityBoard.module.css` +
  `DataTable.module.css` additions use only `var(--…)` from
  `pwa/src/styles/companygraph/tokens.css`; design-conformance passes on the
  touched views (AC-14).
- **Input modes (UX-03/05):** no canvas/gesture/scroll-hijack/global-keyboard
  handler — a table + detail-panel surface on native controls. Column sort is
  a native-button `aria-sort` header activation (not a drag). Keyboard map:
  Tab order = sort headers → row name buttons → mark toggles; Enter/Space
  activate; Escape closes the detail Modal returning focus (AC-15). Matches
  the requirements' Platforms & Input Modes + Native Conflicts tables (no
  native behavior suppressed beyond the reused Modal's own).

## 7. File Changes

Every row serves an FR; "as-built" = already on disk and verified conformant;
"as-built + Δn" = on disk, needs the named §1.2 conformance fix.

| Path | Action | Serves | Status / Notes |
|------|--------|--------|----------------|
| `shared/src/schema/key-activity.ts` | new | FR-02–07, FR-10 | as-built — zod: `subScoresSchema`, `keyActivityMarkSchema`, `activityScoreRowSchema`, `keyActivityScoresSchema` (`rows` field pinned, §3.3) |
| `api/src/derive/key-activity-score.ts` | new | FR-02–05, NFR-04 | **as-built + Δ1 + Δ2** — add the non-empty handoff guard (§4.4) and the ≥2-node chain rule for `longestThrough` (§4.3) |
| `api/src/storage/key-activities.ts` | new | FR-01, FR-06–09, NFR-01, NFR-03 | as-built — `getModel` gate, scoped-set threading, journey aggregation, lock-first write, true no-op unmark, read tolerance |
| `api/src/routes/key-activities.ts` | new | FR-06–08, FR-10 | as-built — 3 handlers, no-body mark/unmark |
| `api/src/errors.ts` | modify | FR-10 | as-built — `activity_not_found` (`:64`); `model_not_found` reused (`:37`) |
| `api/src/router.ts` | modify | FR-06–08 | as-built — dispatch block (`:416`) |
| `api/src/auth/rbac-permissions.ts` | modify | FR-11 | as-built — 3 rows (`:301-303`) |
| `api/src/scripts/seed-rbac-roles.ts` | modify | FR-11 | as-built — `business_architect` grants (`:120-121`) |
| `api/src/routes/openapi.ts` | modify | FR-10 | as-built — 3 paths + schemas (`:835-858`) |
| `pwa/src/components/DataTable.tsx` | modify | FR-12, UX-02/05 | **Δ3 (DD-11)** — additive optional `sortable`/`sort`/`onSort`/`getRowKey` props; prop-less render byte-identical for existing consumers |
| `pwa/src/components/DataTable.module.css` | modify | FR-12, NFR-07 | **Δ3** — sort-header button + glyph styles, tokens-only |
| `pwa/src/views/index.tsx` | modify | FR-12 | as-built — `key-activities` dispatch → `KeyActivityBoard` (`:170`) |
| `pwa/src/views/model/KeyActivityBoard.tsx` | new | FR-12–14, UX-01/02/05 | **as-built + Δ3** — refactor the inline ranking `<table>` (`:271-340`) to the extended `DataTable`; states, toggle, evidence Modal already conformant |
| `pwa/src/views/model/KeyActivityBoard.module.css` | new | FR-12, NFR-07 | as-built + Δ3 (drop table/sort styles that move to `DataTable.module.css`); tokens-only |
| `pwa/src/api.ts` | modify | FR-12, FR-13 | as-built — `keyActivities` block (`:387`); unmark on raw fetch (DD-07) |

**Not edited (consumed):** `shared/src/schema/{nodes,edges}.ts` (NFR-02,
AC-17), `api/src/storage/{nodes,edges}.ts` (generic primitives untouched,
FR-09), `api/src/storage/model-scope.ts`, `api/src/storage/models.ts`,
`pwa/src/context/ActiveModelContext.tsx`, `pwa/src/route.ts` (all
`model-workspace-core`'s), `api/src/routes/import.ts` / `upsertNode` (DD-04),
`api/src/analytics/graph.ts` (`buildGraphologyGraph` reused, not edited),
`pwa/src/api.ts` `json<T>` helper (not modified — DD-07).

## 8. Test strategy

All test files exist as-built; Δ-rows name the cases this revision adds.

| AC | Kind | File / cases |
|----|------|--------------|
| AC-01 | integration | `api/__tests__/key-activity-scores.integration.test.ts` — ranked `rows` with full shape + `meta`; evidence on every score; unknown `:modelId` → 404 `model_not_found`; fresh 0-domain model → 200 `rows:[]` / `activityCount:0` (never 404). Optional NFR-05 soft-bound timing assertion lives here |
| AC-02 | integration + unit | `key-activity-centrality.integration.test.ts` — hub ranks highest, leaf ≈0, ≤1-activity model all-0 no-crash; pure cases in `key-activity-score.test.ts` (Neo4j-free, DD-01) |
| AC-03 | integration + unit | `key-activity-critical-path.integration.test.ts` — on-path 1 / off-path graded; cyclic → `hasCycle` + longest acyclic sub-chain; 30-node linear → `truncated`, `"depth_cap"`, scored vs the 20-**node** partial (§4.3 unit note); zero-edge model → all `criticalPath` 0. **Δ2 case:** model *with* a critical path + one isolated activity → that activity's `longestChainDepth 0`, `criticalPath 0` (unit + fixture row) |
| AC-04 | integration + unit | `key-activity-handoff.integration.test.ts` — disjoint role+system boundary scores higher than all-shared; evidence breakdown; no-neighbour → 0. **Δ1 cases:** a roleless (and a systemless) activity counts **no** handoffs on the empty dimension (integration fixture + pure unit case); mutual `a↔b` disjoint-role pair → `roleHandoffs = 1` per side, not 2 (unit, already as-built) |
| AC-05 | unit + integration | `key-activity-score.test.ts` — composite = Σ weighted sub-scores (weights 1.0), desc, tie `createdAt`→`id` (incl. equal/absent-`createdAt` → deterministic by `id`); duplicate-id inputs collapse to one row; `meta.weights` echo; **no** recommendation field. Cross-checked in `key-activity-scores.integration.test.ts` |
| AC-06 | integration | `key-activity-mark.integration.test.ts` — mark writes evidence inside `attributes` preserving a pre-set unrelated sibling; `NODE_LABELS`/`EDGE_ENDPOINTS` unchanged; 404 sequencing `model_not_found` → `activity_not_found` |
| AC-07 | integration | `key-activity-mark.integration.test.ts` — unmark removes the key; siblings intact (fixture edits none in between → also byte-equal to pre-mark, NFR-03); unmark of unmarked → 204 **true no-op** (`updatedAt` untouched, §4.5); re-mark writes a fresh snapshot |
| AC-08 | integration (two-file split — both bound in tasks) | `key-activity-scope-authz.integration.test.ts` (two models: A's GET excludes B-only activities; marking a B activity under A → 404 `activity_not_found`; missing `key_activity:write` → 403; `key_activity:read` → 200; `business_architect` resolves both; no route `public`) **+** `key-activity-openapi.integration.test.ts` (3 routes in openapi; `activity_not_found` in the error-envelope enum **and** returned by a real request — the FR-10/C-06 anchor) |
| DD-04 / risk 7 | integration | `key-activity-import.integration.test.ts` — export→import round-trip: post-mark snapshot restores the mark; pins the permissive-`Activity`-schema assumption |
| AC-09 | component (jsdom) | `pwa/src/__tests__/key-activity-board.test.tsx` — route renders `KeyActivityBoard` (not placeholder); reads `useActiveModel()`; ready table rows complete; activating a score column header re-orders rows client-side, `aria-sort` flips, no re-fetch; default `composite` desc. **Δ3:** assertions target the extended-`DataTable` markup |
| AC-10 | component | `pwa/src/__tests__/key-activity-detail.test.tsx` — toggle POST/DELETE + optimistic re-render, rollback only on rejection (unmark mocked at fetch level with a real `Response(null, {status:204})` — DD-07); detail Modal shows evidence + mark snapshot |
| AC-11/12/13 | component | `pwa/src/__tests__/key-activity-board-states.test.tsx` — loading skeleton; empty driven by mocked `200 {rows:[], meta:{activityCount:0}}`; error = `ErrorState` + sibling retry `Button` that refetches; `truncated`/`hasCycle` banner above the still-rendered ranking |
| AC-14 | CLI | `bun run scripts/design-conformance.ts --view pwa/src/views/model/KeyActivityBoard.tsx` — exit 0 (view + module CSS; the `DataTable` edit stays tokens-only) |
| AC-15 | manual | keyboard-only walk of `#/model/key-activities` (input mode: keyboard): Tab to a sortable header, Enter → expect `aria-sort` flips + rows reorder; Tab to a mark toggle, Space → expect key indicator toggles; Tab/Enter into a row detail → expect focus enters the Modal, Escape returns it to the originating row |
| AC-16 | e2e | `pwa/playwright/key-activity-board-context.spec.ts` — model B active, deep-link + reload → `KeyActivityBoard` with model B's ranking |
| AC-17 | CLI | `bun run typecheck` exit 0; `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts` shows no `NODE_LABELS`/`EDGE_ENDPOINTS` additions |

Integration tests need Neo4j (`bun test:integration`); unit/component run under
`bun test`. Fixtures seed via the API (`POST /api/v1/models/:id/domains`, core
`domains`/`journeys`/`nodes`/`edges` routes — all verified in
`ROUTE_PERMISSIONS`); no direct-driver seeding, no fresh retail fixture
(DD-04).

## 9. Rejected alternatives

- **Marking via `PATCH /nodes/Activity/:id {attributes:{keyActivity}}`** —
  `patchNode` replaces the whole attributes map + runs schema enforcement:
  clobbers siblings, risks `attribute_violation`. Rejected → dedicated
  lock-first read-merge-write (§4.5, FR-09).
- **A new `KeyActivity` label / `MARKED_KEY` edge** — violates XD-03 and edits
  the frozen schema consts. Rejected → attribute in the open `attributes` map
  (DD-05, NFR-02).
- **`keyActivity` as a top-level Neo4j property (story-spec DD-03 style)** —
  the mark is never a Cypher predicate. Rejected → `attributes` map, which
  also round-trips import/export (DD-04).
- **In-view non-catalog ranking table (the former DD-10)** — contradicts FR-12
  rev 2 ("inventing a non-catalog table is not an option") and leaves the
  sortable-table pattern unreusable. Rejected → additive `DataTable`
  extension (DD-11; pending OQ-A confirmation).
- **A `SortableDataTable` catalog variant** — forks the canonical table's
  styling/markup surface for the sake of not touching props that are
  backward-compatible anyway. Rejected → extend `DataTable` itself (DD-11).
- **Changing the shared `json<T>` to tolerate 204s** — touches every API
  consumer to fix one call site. Rejected → raw-fetch unmark local to the
  `keyActivities` block (DD-07).
- **Precompute/cache/scheduler for scores** — live compute is within NFR-05
  at single-model scale (cto-analytics DD-03 precedent). Rejected.
- **Tunable-weights settings subsystem** — deferred (DD-09, cto-analytics
  RD-6 precedent); constants echoed in `meta.weights`.
- **Prescriptive recommendations** — deferred to the chat surface per XD-11.
  The response carries no suggestion field (NFR-04).
- **Filtering `EXECUTES`/`USES_SYSTEM` by `scopedNodeIds`** — would zero out
  every handoff (Role/System never in the set). Rejected → DD-02.
- **Re-implementing model selection in the view** — re-specs
  `model-workspace-core`. Rejected → `useActiveModel()` (§4.10).
