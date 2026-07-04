---
feature: "key-activity-optimizer"
created: "2026-07-04"
author: "spec-author"
status: "revised"
size: "medium"
reviewing_requirements_revision: "approved (2026-07-04, review pass 1 — approve, 0 blockers)"
revised_after: "review-design.md (pass 1 — revise, 1 blocker B-01, 5 concerns C-01..C-05)"
---

# Design: key-activity-optimizer

> Traces the approved `requirements.md`: FR-01…FR-14, NFR-01…NFR-07,
> AC-01…AC-17. Every §-section names the FR/AC it serves; §7 is the file-change
> table (each row → an FR); §8 is the AC→test map. No requirement is invented
> here; where requirements left a **default** open (OQ-1 budgets, OQ-2 constant
> weights, OQ-3 centrality primitive) it is recorded in §2 as a design decision
> the orchestrator may still surface. The requirements review (pass 1, approve)
> left three carry-forward concerns (C-01 role/system scoping, C-02 centrality
> primitive, C-03 import-overwrite) — each is resolved in §2 and cited at the
> section that acts on it.

## 1. Overview

`key-activity-optimizer` is the **optimize** stage of the Business Modeling
Studio pipeline (blueprint `author → graph → optimize → measure → systematize`,
milestone M2). For a single `BusinessModel` it computes **descriptive** graph
scores over that model's `Activity` nodes, ranks them, and lets a Business
Architect **manually mark** an activity as *key* — reversibly — as an attribute
on the existing `Activity` label. It ships the **KeyActivityBoard** view at
`#/model/key-activities`.

It adds, in dependency style identical to `story-spec-core`:

1. **A pure, Neo4j-free scoring module** — `api/src/derive/key-activity-score.ts`
   (DD-01, mirroring story-spec's `api/src/derive/story-derive.ts`) — computing
   the three sub-scores (centrality, critical-path position, handoff density) and
   the composite rank over a plain model-scoped subgraph read-shape, so the math
   is unit-testable against a fixture with **no Neo4j** (FR-02–FR-05).
2. **A model-scoped Neo4j read + scoring orchestrator + mark/unmark storage** —
   `api/src/storage/key-activities.ts` — that (a) reads the model's `Activity`
   subgraph consuming `scopedNodeIds(driver, modelId)` (never re-implemented),
   (b) calls the pure scorer, and (c) writes/removes the `keyActivity` attribute
   through a **dedicated attribute-preserving read-merge-write** function that
   leaves the generic `createNode`/`patchNode` primitives byte-for-byte
   unchanged (FR-01, FR-07, FR-08, FR-09).
3. **Three model-scoped REST routes** under `/api/v1/models/:modelId/key-activities*`
   following the `model-workspace-core`/`story-spec-core` convention (FR-06,
   FR-07, FR-08), zod-validated at the boundary, in `openapi.json` (FR-10),
   RBAC-gated by two new permissions granted to `business_architect` (FR-11).
4. The **KeyActivityBoard** view at `#/model/key-activities` (route verbatim from
   the blueprint View Tree) that **replaces** the `ModelTabPlaceholder`
   `model-workspace-core` registered for the `key-activities` tab, reads the
   active model from the shell-owned `useActiveModel()`, and specs all four view
   states + a sortable ranking table + a mark toggle + a score-evidence detail
   panel (FR-12, FR-13, FR-14).

The design follows the same rules as its dependencies: **no compile-time schema
edit** (the judgement is an attribute, XD-03 — never a new label/edge, NFR-02),
**domain writes on a dedicated storage module (not the generic primitives)**,
**consume `model-workspace-core` (never re-spec)**, **auth via the central gate
only** (NFR-06).

### 1.1 Hard build-order dependency (requirements Dependencies note)

Every `model-workspace-core` surface this design imports is a **new file that
does not exist on disk at authoring time** (verified: `api/src/storage/model-scope.ts`,
`pwa/src/context/ActiveModelContext.tsx`, `pwa/src/views/model/`,
`api/src/scripts/seed-rbac-roles.ts` are all absent). This spec **cannot start
implementation** until `model-workspace-core` merges FR-18 (`scopedNodeIds`),
FR-15 (`ActiveModelProvider`/`useActiveModel`), FR-11 (`business_architect`
role), and FR-17 (`ModelTabPlaceholder` + the `key-activities` slot in the
`model` surface dispatch this spec replaces). The design references its
**approved-design interfaces** by their documented signatures (cited in §3.1);
implementation binds to the real files once they land. `story-spec-core` is this
spec's **declared** blueprint dependency (wave 2 → wave 3 sequencing); no direct
interface of it is consumed — this spec scores `Activity` nodes, not stories.

## 2. Design decisions & prior-review carry-forwards

The requirements review (pass 1, **approve**, 0 blockers) left three concerns
(C-01…C-03) and three nits (N-01…N-03). This design records where each lands,
plus the design-level decisions.

> **Design-review pass 1 (revise) — this revision.** The design review raised one
> blocker and five concerns; each is resolved here and cited at the section that
> acts on it (the review's IDs, not the requirements' IDs of the same letters):
> **B-01** (catalog `DataTable` cannot sort → in-view sort layer) → **DD-10**,
> §4.10, §6, §7; **C-01** (snapshot not tx-consistent + per-mark recompute cost)
> → §4.5 step 2 note; **C-02** (`ErrorState` has no retry → sibling `Button`) →
> §4.10 error state, §6; **C-03** (permissive-schema claim moot on the bypassing
> write) → **DD-05** trimmed + §4.5; **C-04** (`z.literal(true)` read tolerance) →
> §4.4 note; **C-05** (self-loop/duplicate `PRECEDES`) → §4.2 query + §4.3/§4.4.
> Nits **N-01** (`model_not_found` already in enum) → §3.4, **N-02** (`createdAt`
> not in graph) → §4.3, **N-03** (AC-08 two-file split) → §8 are also folded in.

| ID | Decision | Resolves | Where |
|----|----------|----------|-------|
| DD-01 | **Scoring-module home (resolves requirements N-01/N-03).** The pure, I/O-free scoring math lives at **`api/src/derive/key-activity-score.ts`** — a `derive/` sibling of story-spec's `story-derive.ts`, *not* under `storage/` (reserved for Neo4j-touching modules). `scoreActivities(subgraph)` takes a plain read-shape object (no `Driver`, no session) and returns the ranked rows + `meta`. This keeps the score-math unit tests (AC-02/03/04/05) **Neo4j-free**. The Neo4j read → `scoreActivities` → response wiring lives in `api/src/storage/key-activities.ts`. | N-01, N-03 | §4.1, §4.6, §7 |
| DD-02 | **Model-scoping bounds the Activity set + intra-scope `PRECEDES` edges only — NOT the `EXECUTES`/`USES_SYSTEM` reads (resolves requirements C-01).** `scopedNodeIds(driver, modelId)` returns **structural** ids only (`Domain`/`UserJourney`/`Activity`/`ModuleInstance`) and *explicitly excludes* shared `System`/`Role`/`Location` (verified: `model-workspace-core` design §4.2, DEC-01(a)). Therefore: (a) the **Activity set** scored is `{a : a.id ∈ scopedNodeIds ∧ a:Activity}`; (b) a `PRECEDES` edge counts **only when both endpoints are in that Activity set** (cross-scope `PRECEDES` excluded — NFR-01); (c) each scoped activity's `EXECUTES` (Role→Activity) and `USES_SYSTEM` (Activity→System) edges to **shared** Role/System nodes are read **unconditionally** — they are NOT filtered by `scopedNodeIds` (doing so would zero out every handoff, since Role/System are never in the set). The read query (§4.2) enforces exactly this. NFR-01's wording is corrected accordingly in §4.2. | C-01 | §4.2, §4.4 |
| DD-03 | **Centrality primitive = betweenness over the model-scoped `PRECEDES` subgraph (recorded default, resolves requirements C-02/OQ-3).** FR-02 picks betweenness (the "chokepoint" reading: activities on many process shortest-paths). All three primitives are already vendored (`graphology-metrics/centrality/{betweenness,degree,pagerank}`, verified `api/src/ontology/analytics/graph.ts:10-12`), so swapping or column-ising is a one-line change. The response's centrality evidence already itemises **raw betweenness + in-degree + out-degree** (FR-02), so a reader sees the degree components alongside betweenness even without extra columns. **The orchestrator may still surface OQ-3** — if the user wants degree/pagerank as additional ranked columns, it is additive (add fields to `centralityEvidence` + the table); no structural change. Default: betweenness only, degree reported as evidence. | C-02, OQ-3 | §4.3 |
| DD-04 | **Import is authoritative for the `keyActivity` mark (resolves requirements C-03).** `keyActivity` lives inside the open `attributes` map, so `POST /api/v1/import` (the `upsertNode` path, which **replaces** the whole `attributes_json`) carries whatever the snapshot holds: a snapshot taken **before** a mark re-imports the activity **without** the mark (mark dropped — consistent with import being the authoritative bulk-load primitive); a snapshot taken **after** restores the mark **with its point-in-time `scoreSnapshot`/`rank`** (which the live `GET …/key-activities` always recomputes fresh — the snapshot is evidence-at-mark-time by design, requirements Risk #5). This spec **does not** change import/`upsertNode`; it only documents the interaction. No fresh seed fixture is required — the integration tests seed via the API (§8), and the reference retail Model #1 need not carry a mark. | C-03 | §4.5, §8 |
| DD-05 | **`keyActivity` is stored inside the open `attributes` map, not a top-level property (unlike story-spec's DD-03).** story-spec put domain fields top-level because it needed `ORDER BY ordinal`/`WHERE derived`. This spec needs **neither** — the mark is never queried by Cypher predicate (the board recomputes live scores and reads the mark per-row from the returned node's `attributes`). Storing it in `attributes` (XD-03) means it (a) round-trips through graph-core export/import unchanged (DD-04), and (b) never touches `NODE_LABELS`/`EDGE_ENDPOINTS` (NFR-02, AC-17). **Schema-enforcement note (resolves review C-03).** The mark write (§4.5) is a **bespoke parameterized `SET a.attributes_json = $merged`** that deliberately **bypasses `patchNode`/`assertAttributesMatchSchema` entirely** — that bypass is the *whole point* of not using `patchNode` (§4.5, §9), so no attribute-schema check runs on the mark path and the permissive-vs-required distinction is irrelevant there. The permissive-`Activity`-schema argument bites **only** on the *export/import round-trip* (DD-04), where `upsertNode` **does** run `assertAttributesMatchSchema`: there the `keyActivity` key survives because it is not a registry-declared required attribute and the permissive `Activity` label schema accepts unlisted keys (verified: `checkAttributesAgainstSchema` returns `null`/permissive for unlisted keys, `api/src/storage/nodes.ts:41-73`). | XD-03 | §4.5, §3.2, DD-04 |
| DD-06 | **Response identifiers are en-US camelCase (`hasCycle`/`truncated`/`truncationReason`), diverging from cto-analytics FR-06's snake_case (`has_cycle`/`truncation_reason`/`longest_partial`) (resolves requirements N-01 nit — the review's N-01, on field-casing).** FR-03 reuses cto-analytics' **algorithm contract** (depth-bounded DFS, caps 20/1000/4 s), not its wire shape — this is a re-implementation over a different (model-scoped) subgraph, and camelCase is the house identifier convention (NFR-06). A reader should **not** expect byte-identical response shapes across the two analytics surfaces. | N-01 | §3.3, §4.3 |
| DD-07 | **PWA calls a new exported `api.keyActivities.*` block, never the private `json<T>` helper (resolves requirements N-02).** `json<T>` at `pwa/src/api.ts:40` is a private helper wrapped by the exported `api.*` methods (verified). KeyActivityBoard uses a new `api.keyActivities.{list,mark,unmark}` block added to the `api` object (§4.11). | N-02 | §4.11 |
| DD-08 | **No `?model=` query param — model identified by the `:modelId` path segment (consistency with `model-workspace-core` D-1 / `story-spec-core` DD-06).** All scoring reads + mark/unmark are scoped by the `:modelId` path param; isolation is proven by the `scopedNodeIds` join (§4.2) + the two-model integration test (AC-08). | — | §4.2, §5 |
| DD-09 | **Composite weights are code-default constants `{centrality:1.0, criticalPath:1.0, handoff:1.0}` (recorded default, requirements OQ-2 / FR-05, mirrors cto-analytics RD-6).** No settings/tuning subsystem, no `analytics_settings`-style table, no `GET/PATCH …/settings`. `meta.weights` echoes the constants so a future tunable-weights follow-up reuses this endpoint's shape. **The orchestrator may still surface OQ-2.** | OQ-2 | §4.3, §5 |
| DD-10 | **The sortable ranking table is built with an in-view sort layer inside `KeyActivityBoard`; the catalog `DataTable` is NOT extended (resolves review B-01).** The catalog `DataTable` (`pwa/src/components/DataTable.tsx`, verified) is a **static** table — `columns: Column[]` + `rows`, plain `<th>{label}` headers, no sort state, no `onSort`, no `aria-sort`, no keyboard-activatable headers — so it cannot satisfy FR-12/FR-13/AC-15 unmodified. Rather than edit a shared catalog component (which has other consumers to keep backward-compatible), `KeyActivityBoard` owns the sort: it holds `sortColumn`/`sortDir` state, sorts the fetched `rows` **client-side** (stable sort, default `composite` desc — the server's DD-09 rank order), and renders the table with its own keyboard-activatable, `aria-sort`-bearing column headers (Enter/Space activate; header `aria-sort` reflects `ascending`/`descending`/`none`). It still reuses `DataTable` for the **cell body** where practical, or renders a token-styled `<table>` when the sortable-header markup must live inline — either way the sortable-header/`aria-sort`/keyboard behaviour is authored **in the view**, not in the catalog. Client-side sort is safe: the whole ranking (≤ a single model's activities, NFR-05) is fetched in one call, so no re-fetch on sort. AC-15's `aria-sort` requirement therefore traces to a concrete owner (`KeyActivityBoard`). **The catalog `DataTable` is not added to §7's File Changes table.** | B-01 | §4.10, §6, §7 |

## 3. Data model

**No new label, no new edge type, no new store** (NFR-02, XD-02, XD-03). The
"key activity" judgement is a key **inside the existing `Activity` node's open
`attributes` map**. `NODE_LABELS` (`shared/src/schema/nodes.ts`) and the frozen
`EDGE_ENDPOINTS` const (`shared/src/schema/edges.ts`) are **not edited** (AC-17).
REST-boundary zod schemas live in a new `shared/src/schema/key-activity.ts`.

### 3.1 Consumed upstream interfaces (cited, not re-specced)

| Interface | Source (approved) | Signature used |
|-----------|-------------------|----------------|
| `scopedNodeIds` | `model-workspace-core` design §4.2 (FR-18) | `scopedNodeIds(driver: Driver, modelId: string): Promise<Set<string>>` — structural ids only (Domain/journey/activity/instance); excludes shared System/Role/Location |
| `business_architect` role | `model-workspace-core` FR-11 (`api/src/scripts/seed-rbac-roles.ts`) | idempotent `MERGE (r:RBACRole {name})`; this spec appends two permissions to its set |
| `ModelTabPlaceholder` + `key-activities` slot | `model-workspace-core` FR-17 (`pwa/src/views/index.tsx` model-surface dispatch) | this spec swaps the `key-activities` dispatch target to `KeyActivityBoard` |
| `useActiveModel()` | `model-workspace-core` FR-15 (`pwa/src/context/ActiveModelContext.tsx`) | `{ activeModel: { id; name } \| null }`; consumed, not re-implemented |
| `buildGraphologyGraph(nodes, edges)` | `api/src/ontology/analytics/graph.ts:102` | accepts an arbitrary node/edge list (verified) — reused for centrality (§4.3) |
| generic node primitives | `api/src/storage/nodes.ts` (graph-core) | **not edited**; the mark write is a bespoke read-merge-write (§4.5) |

### 3.2 The `keyActivity` attribute (FR-07, FR-09, DD-05, XD-03)

Stored under `Activity.attributes.keyActivity` (i.e. inside `attributes_json`),
shape:

```jsonc
{
  "marked": true,
  "markedAt": "2026-07-04T12:00:00.000Z",     // ISO 8601, server-set
  "scoreSnapshot": {                            // scores AT MARK TIME (evidence)
    "centrality": 0.83,
    "criticalPath": 1.0,
    "handoff": 0.5,
    "composite": 2.33
  },
  "rank": 1                                     // 1-based rank AT MARK TIME
}
```

`zod` (`shared/src/schema/key-activity.ts`):

- `keyActivityMarkSchema` — the stored shape above (`marked: z.literal(true)`,
  `markedAt: z.string().datetime()`, `scoreSnapshot: subScoresSchema.extend({
  composite: z.number() })`, `rank: z.number().int().positive()`). Used to
  validate the merged attributes at write time and to parse on read.
- `subScoresSchema` — `{ centrality: z.number().min(0).max(1), criticalPath:
  z.number().min(0).max(1), handoff: z.number().min(0).max(1) }`.
- The **mark request has no body** (`POST …/mark` snapshots the *live* scores
  server-side — never client-supplied, so a client cannot forge a snapshot); the
  **unmark request has no body**. Both take only path params.

### 3.3 Score-response shape (FR-06, DD-06) — `keyActivityScoresSchema`

```ts
// shared/src/schema/key-activity.ts
export const activityScoreRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  journeyId: z.string().nullable(),      // parent UserJourney via PART_OF
  journeyName: z.string().nullable(),
  rank: z.number().int().positive(),     // 1-based, composite desc
  composite: z.number(),
  scores: subScoresSchema,               // the three normalised [0,1] sub-scores
  evidence: z.object({
    centrality: z.object({ betweenness: z.number(), inDegree: z.number().int(),
                           outDegree: z.number().int() }),
    criticalPath: z.object({ onCriticalPath: z.boolean(),
                             longestChainDepth: z.number().int(),
                             criticalPathLength: z.number().int() }),
    handoff: z.object({ handoffCount: z.number().int(),
                        roleHandoffs: z.number().int(),
                        systemHandoffs: z.number().int() }),
  }),
  key: keyActivityMarkSchema.nullable(),  // the stored mark, or null when unmarked
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

`meta.weights` echoes the DD-09 constants. The response carries **no**
recommendation/suggestion field (descriptive-only, NFR-04, AC-05).

### 3.4 Error codes (FR-10) — additive to the closed `ERROR_CODES`

Added to `ERROR_CODES` (`api/src/errors.ts`), additive/non-breaking (NFR-11):

| Code | HTTP | Thrown from |
|------|------|-------------|
| `activity_not_found` | 404 | `POST`/`DELETE …/:activityId/mark` when `:activityId` is not a model-scoped `Activity` of `:modelId` (a cross-model or non-existent activity is *not found* under this model path — no cross-model mark) |

Only **one** code is added. The `GET …/key-activities` scores route needs no new
code — an unknown `:modelId` surfaces `model_not_found`, which is **already
present in `ERROR_CODES`** today (`api/src/errors.ts:36`, verified — regardless of
`model-workspace-core`); this spec consumes it and adds no `model_not_found`
row (see §4.2 note). `activity_not_found` is reachable
from both mark and unmark (AC-06/AC-08), so `envelope.test.ts`'s reachability
assertion holds; no unreachable "reserved" code is added.

## 4. Core logic

### 4.1 Module split (DD-01)

| Module | Kind | Responsibility |
|--------|------|----------------|
| `api/src/derive/key-activity-score.ts` | pure, no Neo4j | `scoreActivities(subgraph): { rows; meta }` — the three sub-scores + composite + rank + `meta`. Unit-tested against fixtures (AC-02/03/04/05). |
| `api/src/storage/key-activities.ts` | Neo4j | `readModelSubgraph(driver, modelId)` (consumes `scopedNodeIds`), `computeScores(driver, modelId)` (read → `scoreActivities` → attach each activity's live `keyActivity` mark), `markActivity(driver, modelId, activityId)`, `unmarkActivity(driver, modelId, activityId)` (attribute-preserving, §4.5). |
| `api/src/routes/key-activities.ts` | route | 3 handlers, zod boundary, `{error}` envelope. |

The pure scorer's input shape (Neo4j-free):

```ts
// api/src/derive/key-activity-score.ts
export interface ScoreActivity {
  id: string; name: string; createdAt: string;
  journeyId: string | null; journeyName: string | null;
  roleIds: string[];      // via EXECUTES (Role→Activity) — shared nodes, unfiltered (DD-02)
  systemIds: string[];    // via USES_SYSTEM (Activity→System) — shared nodes, unfiltered (DD-02)
}
export interface ScoreEdge { fromId: string; toId: string; }  // PRECEDES, both endpoints in the scoped Activity set (DD-02)
export interface ScoreSubgraph {
  activities: ScoreActivity[];
  precedes: ScoreEdge[];
  weights: { centrality: number; criticalPath: number; handoff: number };
}
export function scoreActivities(sg: ScoreSubgraph): {
  rows: ActivityScoreRow[]; meta: ScoreMeta;
};
```

### 4.2 Model-scoped subgraph read (FR-01, NFR-01, DD-02 — resolves C-01)

`readModelSubgraph(driver, modelId)` in `api/src/storage/key-activities.ts`:

1. `const scoped = await scopedNodeIds(driver, modelId)` (consumed from
   `api/src/storage/model-scope.ts`, **never re-implemented**). When
   `:modelId` is unknown, `scopedNodeIds` returns an empty set (the `MATCH
   (m:BusinessModel {id})` misses) — the handler maps that to
   `model_not_found` (§4.7) so an unknown model is a 404, not an empty ranking.
2. One read query, parameterised by `$scopedIds = [...scoped]`:

```cypher
// Activities in scope + their journey + shared Role/System (UNFILTERED — DD-02)
MATCH (a:Activity) WHERE a.id IN $scopedIds
OPTIONAL MATCH (a)-[:PART_OF]->(j:UserJourney)
OPTIONAL MATCH (r:Role)-[:EXECUTES]->(a)          // shared Role — not in $scopedIds, read anyway
OPTIONAL MATCH (a)-[:USES_SYSTEM]->(sys:System)   // shared System — not in $scopedIds, read anyway
RETURN a.id AS id, a.name AS name, a.createdAt AS createdAt,
       j.id AS journeyId, j.name AS journeyName,
       collect(DISTINCT r.id) AS roleIds,
       collect(DISTINCT sys.id) AS systemIds
```

```cypher
// PRECEDES edges — BOTH endpoints must be in the scoped Activity set (DD-02(b), NFR-01)
// Self-loops excluded (p.id <> q.id) so the graphology build cannot throw (C-05);
// DISTINCT collapses parallel a->b PRECEDES edges to one, matching the multi:false graph.
MATCH (p:Activity)-[:PRECEDES]->(q:Activity)
WHERE p.id IN $scopedIds AND q.id IN $scopedIds AND p.id <> q.id
RETURN DISTINCT p.id AS fromId, q.id AS toId
```

> **C-01 resolution (NFR-01 corrected wording).** Model-scoping bounds the
> **Activity set** and the **`PRECEDES` edges between two scoped activities**.
> Each scoped activity's `EXECUTES`/`USES_SYSTEM` edges to **shared** Role/System
> nodes are read **unconditionally** — they are deliberately *not* filtered by
> `$scopedIds` (Role/System are never in that set; filtering them would zero out
> all handoffs). The requirements NFR-01 phrase "Scoring never reads a
> `PRECEDES`/`EXECUTES`/`USES_SYSTEM` edge outside the model's scoped set" is
> read as: *no `PRECEDES` edge whose **Activity** endpoints leave the scoped set,
> and no Activity outside the set* — never as "exclude any edge touching a shared
> node". This is the exact seam the review's C-01 flagged.

A model with 0 or 1 scoped activities returns a subgraph the scorer handles
without crashing (all sub-scores `0`, FR-02/FR-04) and the handler renders the
empty state when `activities.length === 0` (AC-12).

### 4.3 Scoring math (FR-02, FR-03, FR-04, FR-05) — pure, `scoreActivities`

**Betweenness centrality (FR-02, DD-03).** Build a directed graphology graph
from `sg.activities` (nodes) + `sg.precedes` (edges) via the reused
`buildGraphologyGraph(nodes, edges)` (mapping `ScoreActivity → GraphNode{id,
label:"Activity", name}` — `GraphNode.name` is required and always present, N-02;
`createdAt` is intentionally **not** carried into the graph, it is used only for
the row-layer rank tiebreak, §4.5 — and `ScoreEdge → GraphEdge{id:`${from}->${to}:PRECEDES`,
source, target, type:"PRECEDES"}`). Run `betweennessCentrality(graph,
{getEdgeWeight: null})` (deterministic — NFR-04). Normalise each raw score to
`[0,1]` by dividing by the model's max betweenness; **all-zero → all `0`**
(guards the ≤1-activity and no-edge cases, FR-02). Evidence: raw `betweenness`,
`inDegree = graph.inDegree(id)`, `outDegree = graph.outDegree(id)`.

> **Self-loop / duplicate-edge safety (C-05 resolution).** The §4.2 `PRECEDES`
> read already excludes self-edges (`p.id <> q.id`) and `DISTINCT`-collapses
> parallel `a->b` edges, so `sg.precedes` is a self-loop-free, de-duplicated edge
> set. Consequently `buildGraphologyGraph` (a `{type:"directed", multi:false}`
> graph, verified) never calls `addEdgeWithKey` with `source===target` (which
> graphology throws on) and never hits a `multi:false` parallel-edge collision.
> The scorer also defensively guards this: if it is ever fed a raw subgraph with
> a self-loop or duplicate, it filters `fromId===toId` and de-dupes
> `(fromId,toId)` before the graphology build, so the pure `scoreActivities` unit
> tests (Neo4j-free, DD-01) can assert the same invariant without depending on the
> §4.2 query. The handoff pass (§4.4) iterates the **same** de-duplicated,
> self-loop-free edge set, so the centrality neighbour set and the handoff
> neighbour set cannot diverge.

**Critical-path position (FR-03) — depth-bounded DFS with budgeted truncation.**
Re-implements the cto-analytics FR-06 **contract** (caps **depth 20 / 1000
candidate paths / 4 s wall-clock**) over the model-scoped `PRECEDES` subgraph
(DD-06 — camelCase response fields, not cto-analytics' snake_case):

- Compute the model's **critical path** = the longest **acyclic** `PRECEDES`
  chain, via memoised depth-bounded DFS from every source (in-degree-0 node,
  or every node when none). Track a visited-set per path to skip cycles.
- `criticalPathLength` = the length (node count) of that longest acyclic chain.
- Per activity: `longestChainDepth(a)` = the longest acyclic chain **through**
  `a`. `criticalPath` sub-score = `1` if `a` is on the model's critical path,
  else `longestChainDepth(a) / criticalPathLength` (graded `[0,1)`), guarding
  `criticalPathLength === 0 → 0`.
- **Cycle handling:** a cyclic `PRECEDES` subgraph sets `meta.hasCycle = true`
  (detected when DFS revisits a path node) but **does not crash** — the longest
  *acyclic* sub-chain is still reported (AC-03).
- **Budget exhaustion:** on exceeding depth/path/wall-clock, set `meta.truncated
  = true` and `meta.truncationReason ∈ {"depth_cap","path_budget","wall_clock"}`;
  scores are computed against the **longest partial** found so far (AC-03: a
  30-deep linear fixture → `truncationReason:"depth_cap"`, scored against the
  depth-20 partial).

**Handoff density (FR-04, DD-02).** For each scoped activity `a`, over its
model-scoped `PRECEDES` neighbours (predecessors **and** successors) — computed
from the **same de-duplicated, self-loop-free `sg.precedes` edge set** the
centrality build uses (C-05), so `a` never counts itself as its own neighbour and
a parallel `a->b` edge is one neighbour, not two:
`handoffCount(a)` = (# distinct neighbours whose `roleIds` set is **disjoint**
from `a`'s roleIds — a role handoff) + (# distinct neighbours whose `systemIds`
set is disjoint from `a`'s systemIds — a system handoff). Because `roleIds`/`systemIds` come from the
**unfiltered** shared-node reads (DD-02(c)), two in-scope activities' role/system
sets are always fully populated and comparable. Normalise to `[0,1]` by the model
max; **all-zero → all `0`**; an activity with no `PRECEDES` neighbours scores `0`
(FR-04). Evidence: raw `handoffCount`, `roleHandoffs`, `systemHandoffs`.

**Composite + rank (FR-05, DD-09).** `composite = w.centrality·centrality +
w.criticalPath·criticalPath + w.handoff·handoff` with the constant weights
`{1.0, 1.0, 1.0}`. Rank rows by `composite` **descending**; ties broken by
**lowest `createdAt`, then lowest `id`** (deterministic, matches the story-spec
tiebreak convention — NFR-04). `rank` is 1-based. `meta.weights` echoes the
constants.

### 4.4 Attaching live marks to score rows (FR-01, FR-06)

`computeScores(driver, modelId)`: after `scoreActivities` produces `rows`, the
same subgraph read (§4.2) already returned each activity's full node — the
handler parses `attributes_json` and attaches `row.key = attributes.keyActivity ??
null` (validated by `keyActivityMarkSchema`). The `GET` response therefore
shows **live** scores + rank next to the **point-in-time** mark snapshot, so drift
(requirements Risk #5) is visible in the board's detail panel (FR-13).

> **Read-path tolerance for foreign/legacy `keyActivity` values (C-04
> resolution — documented display contract).** `keyActivityMarkSchema` uses
> `marked: z.literal(true)` (§3.2), and unmark **deletes** the whole
> `keyActivity` key (§4.5), so this spec never itself writes a `marked:false`.
> But an import or hand-edit could plant a foreign snapshot whose
> `keyActivity` fails the schema (wrong shape, missing `scoreSnapshot`, or
> `marked:false`). **Any stored `keyActivity` value that does not parse against
> `keyActivityMarkSchema` — including `marked:false` — is treated as unmarked
> (`row.key = null`) and logged (at `warn`), never crashing the ranking.** This
> makes the `z.literal(true)` choice an intentional display contract: only a
> well-formed, affirmatively-`true` mark shows as marked; anything else
> renders as not-key. The underlying node attribute is **left untouched** by the
> read path (the mark write in §4.5 is the only mutator), so a foreign value is
> displayed-as-unmarked but not silently deleted on read.

### 4.5 Mark / unmark — attribute-preserving write (FR-07, FR-08, FR-09, NFR-03, DD-05)

The generic `patchNode` replaces the **whole** `attributes_json` and runs
`assertAttributesMatchSchema` (verified `api/src/storage/nodes.ts:180-198`), so a
naive `PATCH /nodes/Activity/:id {attributes:{keyActivity}}` would **clobber**
the activity's other attributes. Mark/unmark therefore go through a **dedicated
read-merge-write** in `api/src/storage/key-activities.ts` that never calls the
generic primitives:

`markActivity(driver, modelId, activityId)`:

1. **Model-scope check.** Confirm `activityId ∈ scopedNodeIds(driver, modelId)`
   **and** is labelled `Activity` (single read). Miss → `404
   activity_not_found` (a cross-model / non-existent activity — no cross-model
   mark, AC-08).
2. **Snapshot live scores.** Call `computeScores(driver, modelId)` (§4.4) and
   pick the row for `activityId` → its `{centrality, criticalPath, handoff,
   composite}` + `rank`. The mark snapshots the *server-computed* live scores
   (never client-supplied, §3.2).

   > **Snapshot ordering (C-01 resolution).** `computeScores` runs on its own
   > read session, so the snapshot is a **best-effort point-in-time read that is
   > not tx-consistent with the step-3 write** — a concurrent graph edit between
   > this read and the write would yield a `scoreSnapshot` that never
   > corresponded to a single consistent graph state. This is **acceptable by
   > design**: the snapshot is *evidence-at-mark-time* (requirements Risk #5), and
   > the live `GET …/key-activities` always recomputes fresh (§4.4), so any drift
   > is surfaced, not hidden. Cost: marking N activities is N full-model scorings
   > (betweenness + bounded DFS + handoff over the whole model each time). At
   > single-model / `retail-mini` scale this stays within NFR-05 (< 2 s). If a
   > future model grows enough for the per-mark recompute to bite, the mark
   > handler may accept the already-computed row from the board and recompute
   > **only** that row's context — still server-authoritative because the server
   > recomputes its own scores and never trusts a client-supplied snapshot body
   > (§3.2). This spec ships the simple full-recompute path.
3. **Read-merge-write in one tx** — read the current `attributes_json`, set the
   `keyActivity` key **in-process**, write the merged map back via a single
   parameterised `SET`:

```cypher
MATCH (a:Activity {id:$activityId})
WITH a, apoc.convert.fromJsonMap(a.attributes_json) AS attrs  // if APOC unavailable, see note
...
```

> **No-APOC merge (implementation note).** APOC is not guaranteed. The merge is
> done **in JS**, not Cypher: read `a.attributes_json` in the same tx
> (`MATCH (a:Activity {id:$id}) RETURN a.attributes_json`), `JSON.parse` →
> `attrs`, `attrs.keyActivity = mark`, then
> `MATCH (a:Activity {id:$id}) SET a.attributes_json = $merged, a.updatedAt = $now`
> with `$merged = JSON.stringify(attrs)`. Both statements run inside one
> `session.executeWrite(tx => …)` so the read-modify-write is atomic. **Every
> other attribute is preserved byte-for-byte** (only the `keyActivity` key is
> added/replaced) — AC-06.

   Because this bespoke `SET` never calls `patchNode`/`assertAttributesMatchSchema`
   (verified: that assertion runs only inside `nodes.ts` `patchNode`/`upsertNode`,
   not on a raw `SET`), **no attribute-schema check runs on the mark write** — the
   bypass is by design (that is why `patchNode` is not used; §9). The
   permissive-`Activity`-schema reasoning applies only to the export/import
   `upsertNode` path (DD-04, DD-05), not here. Returns `200` + the updated
   activity's rank row (`activityScoreRowSchema` with `key` populated).

`unmarkActivity(driver, modelId, activityId)`:

1. Model-scope check as above (`404 activity_not_found` for a non-scoped id).
2. Read `attributes_json` → `attrs`, **delete** the `keyActivity` key
   (`delete attrs.keyActivity`), write the merged map back in one tx (same
   atomic read-merge-write). The `attributes` map is restored **byte-equal** to
   its pre-mark state (no residue key, siblings intact — NFR-03, AC-07).
3. **Idempotent:** unmarking an activity with no `keyActivity` key is a no-op
   write (deleting an absent key leaves `attrs` unchanged) → `204` (not `404`,
   FR-08).
4. Re-marking after unmark writes a **fresh** snapshot at the then-current live
   scores (marking is recomputable, XD-03, AC-07).

The generic `createNode`/`patchNode` primitives stay **byte-for-byte unchanged**
(FR-09, AC-17).

### 4.6 Import interaction (DD-04 — resolves C-03)

`POST /api/v1/import` (the `upsertNode` path) **replaces** the whole
`attributes_json` from the snapshot (verified `nodes.ts:245-251`). Because
`keyActivity` lives in `attributes`, import is **authoritative**: a
pre-mark snapshot re-imports without the mark; a post-mark snapshot restores the
mark with its point-in-time snapshot (which the live `GET` always recomputes).
This spec **does not** touch import/`upsertNode` — it only documents the behavior
(DD-04). No fresh fixture required (§8 seeds via API).

### 4.7 Route handlers + dispatch (FR-06, FR-07, FR-08, FR-10)

`api/src/routes/key-activities.ts` — handlers returning the
`{error:{code,message,details?}}` envelope via `_helpers.ts`
(`ok`/`noContent`/`error`/`fromValidationError`, verified exports):

| Handler | Method + route | Returns |
|---------|----------------|---------|
| `handleKeyActivityScores` | `GET /models/:modelId/key-activities` | `200 keyActivityScoresSchema`; unknown model → `404 model_not_found` |
| `handleKeyActivityMark` | `POST /models/:modelId/key-activities/:activityId/mark` | `200 activityScoreRowSchema`; non-scoped activity → `404 activity_not_found` |
| `handleKeyActivityUnmark` | `DELETE /models/:modelId/key-activities/:activityId/mark` | `204`; non-scoped activity → `404 activity_not_found`; unmarking unmarked → `204` (idempotent) |

**Dispatch** (`api/src/router.ts`) — a `models/:modelId/key-activities*` block of
`sub.match(/…/)` regexes, inserted **after** the `model-workspace-core` `models*`
block (and, if present, the `story-spec-core` `stories*` block), specific-before-
parameterized:

1. `^models\/([^/]+)\/key-activities$` (GET scores)
2. `^models\/([^/]+)\/key-activities\/([^/]+)\/mark$` (POST mark, DELETE unmark)

(The `mark` literal never collides with the bare `key-activities` path — different
segment counts — but ordering is kept per the house convention.)

### 4.8 Route-permission mapping + RBAC (FR-11)

`api/src/auth/rbac-permissions.ts` — new `ROUTE_PERMISSIONS` rows (the `P(method,
path, permission)` helper, verified), specific-before-parameterized:

```
P("GET",    "models/:modelId/key-activities", "key_activity:read"),
P("POST",   "models/:modelId/key-activities/:activityId/mark", "key_activity:write"),
P("DELETE", "models/:modelId/key-activities/:activityId/mark", "key_activity:write"),
```

Inserted before `model-workspace-core`'s parameterized `models/:id` rows (the
`matchSegments` matcher requires equal segment count, so the 4-/5-segment
`key-activities*` rows never collide with the 3-segment `models/:id` rows — but
placement stays specific-first per the house convention). **No new route is
`public`**; auth is enforced only by the central gate (`router.ts` →
`getRoutePermission` → RBAC check) — no per-route check (NFR-06).

`api/src/scripts/seed-rbac-roles.ts` — the `business_architect` role (seeded by
`model-workspace-core` FR-11) gains `"key_activity:read"` + `"key_activity:write"`
in its permission array (idempotent `MERGE (r:RBACRole {name})` — the seed
re-writes the role's permission set, verified line 104). This spec **modifies**
that role's permission list; it does **not** create the role.

### 4.9 OpenAPI (FR-10)

`api/src/routes/openapi.ts` — register `keyActivityScoresSchema`,
`activityScoreRowSchema`, and `registerPath` each of the three routes (§4.7),
generated from the same zod definitions (no hand-maintained copy, FR-10). The new
`activity_not_found` code surfaces in the shared `errorEnvelopeSchema` responses.
AC-08 asserts routes + the code appear in `GET /api/v1/openapi.json`.

### 4.10 PWA — KeyActivityBoard view (FR-12, FR-13, FR-14)

- **`pwa/src/views/index.tsx`** — the `model` surface's `key-activities` entry
  (registered as `<ModelTabPlaceholder spec="key-activity-optimizer"/>` by
  `model-workspace-core`) is **replaced** with `"key-activities": (r) =>
  <KeyActivityBoard route={r} />`. This is the **only** edit to that file
  (`route.ts`/`SURFACES` stay `model-workspace-core`'s — never touched).
- **`pwa/src/views/model/KeyActivityBoard.tsx` + `.module.css`** — reads the
  active `BusinessModel` from `useActiveModel()`
  (`pwa/src/context/ActiveModelContext.tsx`, `model-workspace-core` FR-15); it
  does **not** re-implement model selection. Fetches `GET
  /api/v1/models/:modelId/key-activities` via a new `api.keyActivities.list`
  (§4.11, DD-07). Renders **all four states**:
  - **loading** (AC-11) — skeleton while the fetch is in flight (`Loading` from
    `views/_shared.tsx`).
  - **empty** (AC-12) — `meta.activityCount === 0` → a `Card` with a "model has
    no activities to score" message pointing to authoring (`#/model/canvas`); no
    ranking table.
  - **error** (AC-13, resolves C-02) — `ErrorState` from `views/_shared.tsx`
    renders the message only (verified: `ErrorState({ message })` has **no**
    retry control). The retry is therefore a **separate sibling catalog
    `Button`** the view renders alongside `ErrorState` (the retry is *not* part
    of `ErrorState`). Its click handler re-invokes
    `api.keyActivities.list(activeModel.id)` and re-enters the loading state.
  - **ready** (AC-09) — a **sortable ranking table** whose sort layer is owned by
    `KeyActivityBoard` (DD-10 — the catalog `DataTable` cannot sort and is not
    extended). Each row: rank, activity name, journey, composite score, the three
    sub-scores, and a key/not-key indicator + mark toggle. The view holds
    `sortColumn`/`sortDir` state and sorts the fetched `rows` client-side (stable,
    default `composite` desc = the server rank order); column headers are
    keyboard-activatable (Enter/Space) and carry `aria-sort`
    (`ascending`/`descending`/`none`). No re-fetch on sort — the full ranking is
    already in memory.
  - A `meta.truncated` or `meta.hasCycle` flag renders a **non-blocking banner**
    above the still-rendered ranking (AC-13, FR-03).
- **Mark/unmark + detail (FR-13, AC-10)** — each row's mark toggle marks
  (`POST …/:activityId/mark`) / unmarks (`DELETE …/:activityId/mark`),
  **optimistic-with-rollback-on-error** (toggle the row's `key` indicator
  immediately; on rejection revert + surface a toast/inline error). Selecting a
  row opens a catalog `SidePanel`/`Modal` showing the **score evidence**:
  composite + three sub-scores with component values (raw betweenness / in-out
  degree; critical-path membership + `longestChainDepth`/`criticalPathLength`;
  raw `handoffCount` + role/system breakdown) — so the ranking is explainable
  (XD-11) — plus, when marked, `markedAt`/`scoreSnapshot`/`rank` (showing live vs
  snapshot drift). **Sorting** by any score column is via keyboard-activatable
  column-header controls exposing `aria-sort`, authored **in the view** (DD-10),
  not in the catalog `DataTable` (AC-15, resolves B-01).
- **Model-scope + reload survival (FR-14, AC-16)** — the view keys its fetch on
  `activeModel.id`; switching the active model (shell context) refetches for the
  new model; deep-linking `#/model/key-activities` + reload re-renders for the
  persisted active model (persistence is `model-workspace-core` FR-15; this view
  consumes it via `useActiveModel()` and refetches on `activeModel.id` change).
  No cross-model leakage (server-enforced, §4.2).
- **Tokens + a11y (NFR-07, UX-02/05; AC-14/AC-15)** — `KeyActivityBoard.module.css`
  uses only `var(--…)` from `pwa/src/styles/companygraph/tokens.css`; catalog
  components (`DataTable`, `Card`, `Button`, `Modal`/`SidePanel`,
  `Loading`/`ErrorState` from `views/_shared.tsx`) before inventing new ones. The
  view exposes an ARIA landmark; Tab reaches the sort controls then each row's
  mark toggle in DOM order; sortable headers activate on Enter/Space and expose
  `aria-sort`; opening a row detail moves focus into the panel and Escape/close
  returns it (reusing the catalog `SidePanel`/`Modal` focus-trap — not
  re-implemented). `bun run scripts/design-conformance.ts --view
  pwa/src/views/model/KeyActivityBoard.tsx` exits 0 (AC-14).

### 4.11 PWA api client (FR-12, FR-13, DD-07)

`pwa/src/api.ts` — add a `keyActivities` block to the exported `api` object
(reusing the private `json<T>()` wrapper internally — the *block* is exported,
`json` is not, DD-07):

```ts
keyActivities: {
  list:   (modelId, signal?) =>
    json<KeyActivityScores>(`/api/v1/models/${encodeURIComponent(modelId)}/key-activities`, withSignal(signal)),
  mark:   (modelId, activityId) =>
    json<ActivityScoreRow>(`/api/v1/models/${encodeURIComponent(modelId)}/key-activities/${encodeURIComponent(activityId)}/mark`, { method: "POST" }),
  unmark: (modelId, activityId) =>
    json<void>(`/api/v1/models/${encodeURIComponent(modelId)}/key-activities/${encodeURIComponent(activityId)}/mark`, { method: "DELETE" }),
},
```

Types (`KeyActivityScores`, `ActivityScoreRow`) are inferred from the shared zod
schemas (§3.3) or declared alongside the PWA's existing API types.

## 5. HTTP API surface

All under `/api/v1/`, zod-validated, `{error:{code,message,details?}}` envelope,
registered in `openapi.json` (FR-10). Permission column = `ROUTE_PERMISSIONS`
(FR-11). No `?model=` query param on any route (DD-08). No settings route
(DD-09).

| Method | Route | FR | Perm | Notes |
|--------|-------|----|------|-------|
| GET | `/api/v1/models/:modelId/key-activities` | FR-06 | `key_activity:read` | live scores + ranking (§4.2–4.4); `meta{activityCount,hasCycle,truncated?,truncationReason?,weights}`; unknown model → 404 `model_not_found` |
| POST | `/api/v1/models/:modelId/key-activities/:activityId/mark` | FR-07 | `key_activity:write` | snapshots live scores into `attributes.keyActivity` (attr-preserving); 200 + rank row; non-scoped activity → 404 `activity_not_found` |
| DELETE | `/api/v1/models/:modelId/key-activities/:activityId/mark` | FR-08 | `key_activity:write` | removes `keyActivity` key (byte-equal restore); 204; idempotent; non-scoped → 404 `activity_not_found` |

`activity_not_found` (§3.4) added to `ERROR_CODES`, reachable from mark + unmark.

## 6. UI design

- **View-tree placement (FR-12, UX-06).** `#/model/key-activities` →
  `KeyActivityBoard` (route verbatim from the blueprint View Tree). No
  `route.ts`/`SURFACES` edit — the tab is already registered by
  `model-workspace-core`; this spec only swaps the `renderView`/`VIEWS` dispatch
  target (§4.10).
- **Component plan (UX-02).** `KeyActivityBoard` reuses catalog components first:
  `Card` (empty state), `Button` (mark toggle, and the **retry** sibling next to
  `ErrorState`, C-02), `SidePanel`/`Modal` (score-evidence detail),
  `Loading`/`ErrorState` from `views/_shared.tsx`. Key/not-key indicators + the
  truncation banner are token-styled `<span>`/`<div>`s.
  - **Ranking table sort (B-01, DD-10).** The catalog `DataTable`
    (`pwa/src/components/DataTable.tsx`, verified) is a **static, non-sortable**
    table (no sort state, no `onSort`, no `aria-sort`, no keyboard-activatable
    headers) and **cannot** satisfy FR-12/FR-13/AC-15 unmodified. This design does
    **not** extend the shared catalog component; instead the sort layer
    (`sortColumn`/`sortDir` state, client-side stable sort of the fetched `rows`,
    keyboard-activatable `aria-sort` column headers) is authored **inside
    `KeyActivityBoard`** — the cheapest path that keeps the catalog untouched and
    its other consumers unaffected. `DataTable` may still be reused for the
    static cell body; the sortable-header markup lives in the view.
  - **No new catalog component** is added and **no catalog component is edited** —
    the sortable-header/`aria-sort` behaviour lives in the view (DD-10), so
    `pwa/src/components/DataTable.tsx` does **not** appear in §7's File Changes.
- **States (UX-01):** loading / empty / error / ready per §4.10
  (AC-09/11/12/13).
- **Tokens (UX-02, NFR-07):** `KeyActivityBoard.module.css` uses only `var(--…)`
  from `pwa/src/styles/companygraph/tokens.css`; `bun run
  scripts/design-conformance.ts --view pwa/src/views/model/KeyActivityBoard.tsx`
  exits 0 (AC-14).
- **Input modes / Native Conflicts (UX-03/05):** no canvas/gesture/scroll-hijack/
  global-keyboard handler introduced — a table + detail-panel surface reusing
  catalog components + native controls. Column sort = `aria-sort` header
  activation (not a drag). ARIA landmark on the view; Tab order sort-controls →
  per-row mark toggles; `SidePanel`/`Modal` focus-trap + Escape reused from the
  catalog (AC-15).

## 7. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `shared/src/schema/key-activity.ts` | new | FR-02–07, FR-10 | zod: `subScoresSchema`, `activityScoreRowSchema`, `keyActivityScoresSchema`, `keyActivityMarkSchema` |
| `api/src/derive/key-activity-score.ts` | new | FR-02,03,04,05, NFR-04 | pure `scoreActivities(subgraph)` — betweenness + bounded-DFS critical path + handoff + composite; no Neo4j (DD-01) |
| `api/src/storage/key-activities.ts` | new | FR-01,06,07,08,09, NFR-01,03 | `readModelSubgraph`/`computeScores`/`markActivity`/`unmarkActivity`; consumes `scopedNodeIds`; attribute-preserving read-merge-write (§4.5) |
| `api/src/routes/key-activities.ts` | new | FR-06,07,08,10 | 3 handlers; zod at boundary; `{error}` envelope |
| `api/src/errors.ts` | modify | FR-10 | +1 code `activity_not_found` (additive, reachable — §3.4) |
| `api/src/router.ts` | modify | FR-06,07,08 | `models/:modelId/key-activities*` dispatch block (§4.7) |
| `api/src/auth/rbac-permissions.ts` | modify | FR-11 | 3 `ROUTE_PERMISSIONS` rows; `key_activity:read`/`key_activity:write` |
| `api/src/scripts/seed-rbac-roles.ts` | modify | FR-11 | add `key_activity:*` to `business_architect` permission set |
| `api/src/routes/openapi.ts` | modify | FR-10 | register key-activity paths + schemas |
| `pwa/src/views/index.tsx` | modify | FR-12 | swap `key-activities` tab dispatch → `<KeyActivityBoard>` |
| `pwa/src/views/model/KeyActivityBoard.tsx` | new | FR-12,13,14, UX-01/02/05 | ranking table + **in-view sort layer (DD-10/B-01: `sortColumn`/`sortDir`, keyboard-activatable `aria-sort` headers — catalog `DataTable` NOT extended)** + 4 states (error = `ErrorState` + sibling retry `Button`, C-02) + mark toggle + evidence panel |
| `pwa/src/views/model/KeyActivityBoard.module.css` | new | FR-12, NFR-07 | tokens-only |
| `pwa/src/api.ts` | modify | FR-12,13 | `keyActivities` client block (§4.11, DD-07) |

**Not edited (consumed):** `shared/src/schema/{nodes,edges}.ts` (NFR-02/AC-17),
`api/src/storage/{nodes,edges}.ts` (generic primitives untouched, FR-09),
`api/src/storage/model-scope.ts` / `pwa/src/context/ActiveModelContext.tsx` /
`pwa/src/route.ts` (all `model-workspace-core`'s), `api/src/routes/import.ts` /
`upsertNode` (import unchanged, DD-04), `api/src/ontology/analytics/graph.ts`
(`buildGraphologyGraph` reused, not edited), `pwa/src/components/DataTable.tsx`
(catalog `DataTable` **not** extended — the sort layer lives in the view per
DD-10/B-01).

## 8. Test strategy

| AC | Kind | File |
|----|------|------|
| AC-01 | integration | `api/__tests__/key-activity-scores.integration.test.ts` — `GET …/key-activities` returns ranked rows w/ `id`/`name`/`journeyName`/`composite`/`scores{centrality,criticalPath,handoff}∈[0,1]` + `meta{activityCount,hasCycle,weights}`; every score carries its `evidence` block |
| AC-02 | integration | `api/__tests__/key-activity-centrality.integration.test.ts` — known-hub fixture ranks highest on centrality; leaf ≈0; ≤1-activity model → all-0, no crash (FR-02). (Pure-math cases also in `api/__tests__/key-activity-score.test.ts`, Neo4j-free per DD-01.) |
| AC-03 | integration | `api/__tests__/key-activity-critical-path.integration.test.ts` — critical-path activities score 1, off-path graded; cyclic fixture → `meta.hasCycle=true` + longest acyclic sub-chain, no crash; 30-deep linear → `meta.truncated=true, truncationReason:"depth_cap"`, scored against depth-20 partial (FR-03, NFR-05). Bounded-DFS unit cases in `key-activity-score.test.ts`. |
| AC-04 | integration | `api/__tests__/key-activity-handoff.integration.test.ts` — disjoint-role + disjoint-system boundary activity scores higher than an all-shared one; raw `handoffCount`+role/system breakdown in evidence; no-`PRECEDES`-neighbour activity → 0 (FR-04) |
| AC-05 | unit + integration | `api/__tests__/key-activity-score.test.ts` (composite = Σ weighted sub-scores, weights all 1.0, desc, tie `createdAt`→`id`; `meta.weights` echoes; **no** recommendation field) + assertion in `key-activity-scores.integration.test.ts` (NFR-04) |
| AC-06 | integration | `api/__tests__/key-activity-mark.integration.test.ts` — `POST …/mark` writes `keyActivity` evidence inside `attributes`, preserving a pre-set unrelated attribute (C-01/FR-09); `NODE_LABELS`/`EDGE_ENDPOINTS` unchanged; non-scoped `:activityId` → 404 `activity_not_found` |
| AC-07 | integration | `api/__tests__/key-activity-mark.integration.test.ts` — `DELETE …/mark` restores `attributes` **byte-equal** to pre-mark (no residue, siblings intact — NFR-03); unmark of unmarked → 204 no-op; re-mark writes fresh snapshot at current scores (FR-08) |
| AC-08 | integration | **AC-08 is a two-file split — both must appear in the tasks phase so neither half is orphaned (N-03):** `api/__tests__/key-activity-scope-authz.integration.test.ts` (two models: `GET /models/:A` scores only A's activities, excludes B-only; marking a B activity under A → 404 `activity_not_found`; no `key_activity:write` → 403 on POST/DELETE; `key_activity:read` → 200 on GET; `business_architect` resolves both; no route `public`) **and** `api/__tests__/key-activity-openapi.integration.test.ts` (3 routes + `activity_not_found` in openapi) |
| AC-09 | component (jsdom) | `pwa/src/__tests__/key-activity-board.test.tsx` — `#/model/key-activities` → `KeyActivityBoard` (not placeholder); reads `useActiveModel()`; ready ranking table w/ rank/name/journey/composite/3 sub-scores/key indicator per row; **in-view sort (DD-10/B-01):** clicking/activating a score column header re-orders rows client-side and its `aria-sort` flips `ascending`↔`descending` (no re-fetch); default order is `composite` desc |
| AC-10 | component | `pwa/src/__tests__/key-activity-detail.test.tsx` — mark toggle POST/DELETEs + optimistic re-render w/ rollback-on-error; row detail panel shows composite + 3 sub-scores **with component evidence** + (when marked) `markedAt`/`scoreSnapshot`/`rank` |
| AC-11,12,13 | component | `pwa/src/__tests__/key-activity-board-states.test.tsx` — loading skeleton; empty ("no activities to score" → authoring) + no table; error state renders `ErrorState` **plus a sibling retry `Button`** (C-02 — retry is not part of `ErrorState`) whose click re-invokes `api.keyActivities.list(activeModel.id)` and re-enters loading; `meta.truncated`/`hasCycle` → non-blocking banner above the still-rendered ranking |
| AC-14 | CLI | `bun run scripts/design-conformance.ts --view pwa/src/views/model/KeyActivityBoard.tsx` — expect exit 0, zero token/component violations (view + co-located `.module.css`) |
| AC-15 | manual | keyboard walk of `#/model/key-activities` (input mode: keyboard): Tab to a sortable column header, Enter to sort (expect `aria-sort` flips + rows reorder), Tab to a row's mark toggle + Space (expect key indicator toggles), Tab/Enter to open a row detail (expect focus enters the panel; Escape returns focus to the originating row) |
| AC-16 | e2e | `pwa/playwright/key-activity-board-context.spec.ts` — model B active, nav `#/model/key-activities`, reload → same route renders `KeyActivityBoard` w/ model B's ranked activities |
| AC-17 | CLI | `bun run typecheck` exit 0; `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts` shows no `NODE_LABELS`/`EDGE_ENDPOINTS` additions |

Integration tests need Neo4j (`bun test:integration`); unit/component run under
`bun test`. Two-model + subgraph fixtures set up model domains/journeys/activities
via `model-workspace-core`'s `POST /api/v1/models/:id/domains` (its C-06 route) +
core `POST /api/v1/domains`/`journeys`/`nodes` for activities, and `PRECEDES`/
`EXECUTES`/`USES_SYSTEM` edges via core `POST /api/v1/edges` — no direct-driver
seeding required. No fresh retail-Model-#1 mark fixture is needed (DD-04, C-03).

## 9. Rejected alternatives

- **Marking via `PATCH /nodes/Activity/:id {attributes:{keyActivity}}`** — the
  generic `patchNode` replaces the **whole** attributes map and runs schema
  enforcement (verified), clobbering siblings + risking `attribute_violation`.
  Rejected → dedicated attribute-preserving read-merge-write (§4.5, C-01/FR-09).
- **A new `KeyActivity` node label / a `MARKED_KEY` edge** — violates XD-03
  (activities stay one label; the mark is an attribute) and would edit the frozen
  `NODE_LABELS`/`EDGE_ENDPOINTS` consts. Rejected → attribute in the open
  `attributes` map (DD-05, NFR-02).
- **Storing `keyActivity` as a top-level Neo4j property (like story-spec DD-03)** —
  unnecessary: the mark is never a Cypher predicate (the board recomputes live
  scores and reads the mark per-row). Rejected → open `attributes` map, which
  also round-trips through export/import (DD-04, DD-05).
- **A precompute/cache/scheduler subsystem for scores** — scores serve live at
  `retail-mini`/single-model scale (NFR-05, cto-analytics DD-03). Rejected → live
  compute on request (§4.4).
- **A tunable-weights settings subsystem (`analytics_settings`-style table +
  `GET/PATCH …/settings` + audit)** — deferred; weights are code-default
  constants (DD-09, FR-05, cto-analytics RD-6 precedent). Rejected → constants
  echoed in `meta.weights` (a future follow-up reuses this endpoint's shape).
- **Prescriptive recommendations ("consolidate X", "automate Y")** — deferred to
  the chat surface per XD-11 (rejected alternative in the blueprint). Rejected →
  descriptive-only; the response carries no suggestion field (NFR-04).
- **Filtering `EXECUTES`/`USES_SYSTEM` reads by `scopedNodeIds`** — Role/System
  are shared reference nodes never in the scoped set, so this would zero out every
  handoff (the review's C-01). Rejected → shared-node reads are unfiltered;
  model-scoping bounds only the Activity set + intra-scope `PRECEDES` (DD-02).
- **Calling the private `json<T>` helper from the view** — not exported (verified,
  N-02). Rejected → new exported `api.keyActivities.*` block (DD-07, §4.11).
- **Re-implementing model selection in KeyActivityBoard** — re-specs
  `model-workspace-core`. Rejected → consume `useActiveModel()` (§4.10).
