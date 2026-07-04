---
feature: "key-activity-optimizer"
created: "2026-07-04"
author: "spec-author"
status: "draft"
revision: 1
reviewing_requirements_revision: "approved (2026-07-04, req-review pass 1 = approve, 0 blockers)"
reviewing_design_revision: "revised (2026-07-04), design-review pass 2 = approve (0 blockers, 3 concerns, 2 nits)"
size: "medium"
total_tasks: 13
---

# Tasks: key-activity-optimizer

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocked by` / `Blocks`); no out-of-order execution.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook blocks STATUS.md updates without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h, one
  judgment call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck`; after
  tasks that ship behaviour, also run the listed test. Tasks touching
  `pwa/src/views/` additionally run
  `bun run scripts/design-conformance.ts --view <file>` for **every file the
  task touches** under `pwa/src/views/` — each `.tsx` and each `.module.css`
  gets its own invocation.
- Integration tests (`*.integration.test.ts`) need Neo4j
  (`bun test:integration` after `bun run dev`); unit/component tests run under
  `bun test`.

## Hard build-order precondition (design §1.1)

Every `model-workspace-core` surface this spec consumes is a **new file that
does not exist on disk until that spec merges** (verified absent at authoring
time): `api/src/storage/model-scope.ts` (`scopedNodeIds(driver, modelId):
Promise<Set<string>>`, FR-18 — structural ids only, excludes shared
System/Role/Location), `api/src/scripts/seed-rbac-roles.ts` (the
`business_architect` role, FR-11), `pwa/src/context/ActiveModelContext.tsx`
(`useActiveModel()`, FR-15), and the `key-activities` slot in
`pwa/src/views/index.tsx` `renderView` (registered as `<ModelTabPlaceholder
spec="key-activity-optimizer"/>`, FR-17). **T-02 (the first task that imports
`scopedNodeIds`) and T-09 (the RBAC grant), T-10 (the view registration) must
not start until `model-workspace-core` has merged.** `story-spec-core` is this
spec's **declared** blueprint dependency (wave 2 → wave 3 sequencing); no direct
interface of it is consumed — this spec scores `Activity` nodes, not stories.
Each task below binds to the real files once they land; the design cites their
approved signatures (design §3.1).

## Design-review carry-forwards (design-review pass 2 = approve; 0 blockers, 3 concerns, 2 nits)

`review-design.md` closed **approve** with 0 blockers. Pass 1's one blocker
(B-01 — catalog `DataTable` cannot sort) and five concerns were already resolved
in the revised design (DD-10 in-view sort layer; §4.5 snapshot framing; §4.10
sibling-retry `Button`; DD-05 schema-bypass; §4.4 read tolerance; §4.2
self-loop/dup safety). Pass 2 left **three low-severity concerns and two nits** —
each is landed here as a binding decision so the execution agent does not
re-derive it. None changes the architecture.

| Finding | Decision (binding for execution) | Locked in task |
|---------|----------------------------------|----------------|
| **C-01 (pass 2)** — DD-05's export/import round-trip claim ("`checkAttributesAgainstSchema` returns permissive for unlisted keys") is contingent: it holds only when the `Activity` label schema is **not** `additionalProperties:false` (verified: `checkAttributesAgainstSchema` `api/src/storage/nodes.ts:41-73` returns `null` only for a label with no registry row; otherwise the compiled `z.object()` passes unlisted keys **because it is non-strict by default**). Does not touch the mark write (bypasses the validator, DD-05) or scoring — bites only the `upsertNode` import path under a strict schema. | Add a **one-line qualifier comment** where the export/import interaction is documented (T-06 import-interaction test docstring + a code comment near the mark write): `keyActivity` survives import **provided the `Activity` attribute schema is not `additionalProperties:false`** (the current default; unlisted keys pass a non-strict `z.object`). **No code change to import/`upsertNode`** — this spec does not control the `Activity` schema. The mark/unmark write is unaffected (bypasses the validator). | T-06 (docstring + comment) |
| **C-02 (pass 2)** — the composite tiebreak reads `createdAt` from the graph and the pure scorer's `ScoreActivity.createdAt: string` is non-nullable; a node missing `createdAt` (older seed / hand-created) would make the tiebreak non-deterministic (undermining NFR-04). | **Decision:** the §4.2 read **coalesces** a missing `createdAt` to a stable high-sentinel string (`coalesce(a.createdAt, "~")` — sorts last so a `createdAt`-bearing node wins the tiebreak deterministically), and the pure scorer's tiebreak is **`createdAt` asc, then `id` asc** so `id` (always present, UUIDv7) is a total fallback. The pure scorer treats `createdAt` as a plain comparable string and never assumes format. A unit case asserts two rows with equal composite + equal/absent `createdAt` order deterministically by `id`. | T-01 (schema allows the coalesced string), T-03 (scorer tiebreak + unit case), T-02 (read coalesce) |
| **C-03 (pass 2)** — `markActivity` (§4.5) computes `scopedNodeIds` twice per mark: once in the step-1 scope check and again inside step-2 `computeScores → readModelSubgraph`. Correctness is fine; the double recompute is an avoidable inefficiency. | **Decision:** `markActivity` computes the scoped set **once** and threads it through — step 2's `computeScores` accepts an **optional pre-computed scoped set / subgraph** (`computeScores(driver, modelId, opts?: { scoped?: Set<string> })`) so `scopedNodeIds` runs once per mark. The scope check (step 1) derives its answer from that same set. Server stays authoritative (it computes its own scores; never trusts a client body, §3.2). No behaviour change; a perf tidy. | T-04 (`computeScores`/`markActivity` signature), T-05 |
| **N-01 (pass 2)** — DD-06 contrasts this spec's camelCase wire shape with cto-analytics FR-06's snake_case field names, but cto-analytics' design→tasks never ran (fields may not ship as cited). Harmless: this spec owns its **own** camelCase shape regardless. | No action. The response shape is defined by this spec's zod (T-01, §3.3) — camelCase `hasCycle`/`truncated`/`truncationReason` — and does **not** depend on any cto-analytics wire shape. | T-01 (owns the shape) |
| **N-02 (pass 2)** — §4.7 dispatch ordering note (the 4-segment GET vs 5-segment mark/unmark under `models/:modelId/…` never collide by segment count) is correct; specific-before-parameterized is retained per house convention. | No action beyond keeping the specific-first ordering in T-08 (router) + T-09 (`ROUTE_PERMISSIONS`). | T-08, T-09 |

## Deviations from requirements (orchestrator: land as errata, no ID renumbering)

| Requirement text | Executed as | Why | Source |
|------------------|-------------|-----|--------|
| AC-14 `manual: run … design-conformance.ts …` | **CLI** verification (`bun run scripts/design-conformance.ts --view …` — deterministic exit code) | It is a deterministic script with an exit code (verified `--view` flag, `scripts/design-conformance.ts:125`), not a hand walk | requirements AC-14, design §8 |
| OQ-1 (critical-path budgets 20/1000/4 s), OQ-2 (constant weights), OQ-3 (betweenness centrality) | **Executed as the recorded design defaults** (DD-03, DD-09, §4.3 caps) | All three are one-line/additive changes if the user prefers otherwise (degree/pagerank columns, tunable weights, different budgets). **The orchestrator may still surface OQ-1/2/3 before execution.** | design DD-03, DD-09, §4.3; requirements OQ-1/2/3 |

## Task list

### T-01 — Key-activity zod schemas (shared)

- **Files** (1): `shared/src/schema/key-activity.ts` (new)
- **Implements**: design §3.2, §3.3, §5 — supports FR-02..FR-08, FR-10; owns the
  camelCase wire shape (N-01)
- **Complexity**: moderate
- **Blocked by**: — (hard build-order precondition applies)
- **Blocks**: T-03, T-04, T-07, T-08, T-11
- **Steps**: Define the REST-boundary zod schemas (zod only; en-US identifiers).
  - `subScoresSchema` = `{ centrality: z.number().min(0).max(1), criticalPath:
    z.number().min(0).max(1), handoff: z.number().min(0).max(1) }`.
  - `keyActivityMarkSchema` = the stored mark shape (§3.2): `{ marked:
    z.literal(true), markedAt: z.string().datetime(), scoreSnapshot:
    subScoresSchema.extend({ composite: z.number() }), rank:
    z.number().int().positive() }`. Used both to validate the merged attribute at
    write time and to **parse-on-read** (a value that fails parse is treated as
    unmarked, §4.4 / T-05).
  - `activityScoreRowSchema` = `{ id, name, journeyId: nullable, journeyName:
    nullable, rank: int positive, composite: number, scores: subScoresSchema,
    evidence: { centrality:{ betweenness:number, inDegree:int, outDegree:int },
    criticalPath:{ onCriticalPath:boolean, longestChainDepth:int,
    criticalPathLength:int }, handoff:{ handoffCount:int, roleHandoffs:int,
    systemHandoffs:int } }, key: keyActivityMarkSchema.nullable() }`.
  - `keyActivityScoresSchema` = `{ rows: activityScoreRowSchema[], meta: {
    activityCount:int, hasCycle:boolean, truncated: boolean.optional(),
    truncationReason: z.enum(["depth_cap","path_budget","wall_clock"]).optional(),
    weights: { centrality:number, criticalPath:number, handoff:number } } }`.
    The response carries **no** recommendation/suggestion field (descriptive-only,
    NFR-04) — do not add one.
  - **The mark request has no body and the unmark request has no body** (§3.2 —
    scores are snapshotted server-side, never client-supplied); both take only
    path params. No request-body schema is defined for mark/unmark.
- **Verification**: `shared/src/schema/__tests__/key-activity.test.ts` — parse
  valid/invalid payloads: `subScoresSchema` rejects a sub-score `> 1` or `< 0`;
  `keyActivityMarkSchema` rejects `marked:false` and a body missing
  `scoreSnapshot`/`rank`, and **accepts** a well-formed mark; `activityScoreRowSchema`
  accepts `key:null`; `keyActivityScoresSchema.meta.truncationReason` rejects an
  out-of-enum string; `bun run typecheck`.

### T-02 — Model-scoped subgraph read (consumes `scopedNodeIds`)

- **Files** (1): `api/src/storage/key-activities.ts` (new — `readModelSubgraph`)
- **Implements**: design §4.2, DD-02, DD-08 — closes AC-01 (read half); supports
  FR-01, NFR-01; lands the C-02 `createdAt` coalesce
- **Complexity**: complex
- **Blocked by**: — (hard build-order precondition — do not start until
  `model-workspace-core` merges `api/src/storage/model-scope.ts`)
- **Blocks**: T-04, T-05
- **Steps**: `readModelSubgraph(driver, modelId): Promise<ScoreSubgraph>` in
  `api/src/storage/key-activities.ts`.
  1. `const scoped = await scopedNodeIds(driver, modelId)` — **imported from
     `api/src/storage/model-scope.ts`, never re-implemented** (`model-workspace-core`
     FR-18; structural ids only, excludes shared System/Role/Location, DD-02). An
     **unknown `:modelId`** yields an empty set → the handler (T-08) maps that to
     `404 model_not_found` (already in `ERROR_CODES`, verified `errors.ts:36`), so
     an unknown model is a 404, not an empty ranking.
  2. Activities-in-scope + journey + **unfiltered** shared Role/System read
     (§4.2, DD-02(c) — Role/System are never in `scoped`; filtering them would
     zero every handoff): `MATCH (a:Activity) WHERE a.id IN $scopedIds` +
     `OPTIONAL MATCH (a)-[:PART_OF]->(j:UserJourney)` + `OPTIONAL MATCH
     (r:Role)-[:EXECUTES]->(a)` + `OPTIONAL MATCH (a)-[:USES_SYSTEM]->(sys:System)`;
     `RETURN a.id, a.name, coalesce(a.createdAt, "~") AS createdAt`
     (**C-02 coalesce — a missing `createdAt` sorts last so the `id` fallback is
     deterministic**), `j.id`, `j.name`, `collect(DISTINCT r.id) AS roleIds`,
     `collect(DISTINCT sys.id) AS systemIds`, plus `a.attributes_json` (for the
     live-mark attach, T-05).
  3. `PRECEDES` edges — **both endpoints scoped**, self-loops excluded, parallel
     collapsed (C-05): `MATCH (p:Activity)-[:PRECEDES]->(q:Activity) WHERE p.id IN
     $scopedIds AND q.id IN $scopedIds AND p.id <> q.id RETURN DISTINCT p.id AS
     fromId, q.id AS toId`.
  4. Assemble the `ScoreSubgraph` (activities + precedes + `weights` = the DD-09
     constants `{1.0,1.0,1.0}`); attach each activity's raw `attributes_json` on
     the side for T-05's live-mark parse.
  Do **not** touch `NODE_LABELS`/`EDGE_ENDPOINTS` (NFR-02, AC-17). Do **not** edit
  the generic `createNode`/`patchNode` primitives (FR-09).
- **Verification**: exercised through the scores route by
  `api/__tests__/key-activity-scores.integration.test.ts` (T-11 — read shape +
  model-scoping) and `api/__tests__/key-activity-scope-authz.integration.test.ts`
  (T-12 — two-model isolation, a `PRECEDES` edge to an out-of-scope activity
  excluded); `bun run typecheck`.

### T-03 — Pure scoring module (Neo4j-free)

- **Files** (2): `api/src/derive/key-activity-score.ts` (new),
  `api/__tests__/key-activity-score.test.ts` (new)
- **Implements**: design §4.1, §4.3, DD-01, DD-03 — closes AC-02, AC-03, AC-04,
  AC-05 (unit half); supports FR-02, FR-03, FR-04, FR-05, NFR-04, NFR-05; lands
  C-02 (tiebreak) + N-01 (owns camelCase shape)
- **Complexity**: complex
- **Blocked by**: T-01
- **Blocks**: T-05, T-11
- **Steps**: `scoreActivities(sg: ScoreSubgraph): { rows: ActivityScoreRow[];
  meta: ScoreMeta }` — **pure, opens no Neo4j session** (DD-01, so AC-02..AC-05
  math is unit-testable Neo4j-free). Input shapes per §4.1 (`ScoreActivity`,
  `ScoreEdge`, `ScoreSubgraph`).
  - **Defensive self-loop/dup guard (C-05):** filter `fromId===toId` and de-dupe
    `(fromId,toId)` from `sg.precedes` before any graph build, so the unit tests
    hold the invariant independent of the §4.2 query.
  - **Centrality (FR-02, DD-03):** build a directed graphology graph via the
    **reused** `buildGraphologyGraph(nodes, edges)`
    (`api/src/ontology/analytics/graph.ts:102`, `{type:"directed", multi:false}`,
    verified — **not edited**), mapping `ScoreActivity → GraphNode{id,
    label:"Activity", name}` and `ScoreEdge →
    GraphEdge{id:`${from}->${to}:PRECEDES`, source, target, type:"PRECEDES"}`. Run
    `betweennessCentrality(graph, { getEdgeWeight: null })` (deterministic, NFR-04);
    normalise each raw score to `[0,1]` by the model max; **all-zero → all `0`**
    (guards ≤1-activity / no-edge). Evidence: raw `betweenness`, `graph.inDegree`,
    `graph.outDegree`.
  - **Critical path (FR-03):** longest **acyclic** `PRECEDES` chain via memoised
    depth-bounded DFS from every source (in-degree-0, or every node when none),
    visited-set per path skips cycles. Caps **depth 20 / 1000 candidate paths /
    4 s wall-clock** (design §4.3 / cto-analytics contract). `criticalPathLength`
    = node count of the longest acyclic chain; per activity `criticalPath` = `1`
    on the critical path else `longestChainDepth(a) / criticalPathLength` (guard
    `criticalPathLength===0 → 0`). Cyclic subgraph → `meta.hasCycle=true`, **no
    crash**, longest acyclic sub-chain still reported. Budget exhaustion →
    `meta.truncated=true`, `meta.truncationReason ∈
    {"depth_cap","path_budget","wall_clock"}`, scores against the longest partial.
  - **Handoff density (FR-04, DD-02):** over each activity's `PRECEDES`
    neighbours (predecessors + successors, from the **same** de-duped self-loop-free
    edge set as centrality — C-05), `handoffCount(a)` = (# distinct neighbours with
    a **disjoint** `roleIds` set) + (# with a disjoint `systemIds` set). Normalise
    to `[0,1]` by the model max; all-zero → all `0`; no-neighbour activity → `0`.
    Evidence: raw `handoffCount`, `roleHandoffs`, `systemHandoffs`.
  - **Composite + rank (FR-05, DD-09):** `composite = Σ w·subscore` with weights
    `{1.0,1.0,1.0}`. Rank by `composite` **desc**; **tie → `createdAt` asc, then
    `id` asc** (C-02 — `createdAt` is a plain comparable string, coalesced in
    T-02; `id` is the total fallback, always present). `rank` 1-based;
    `meta.weights` echoes the constants; `meta.activityCount = rows.length`.
- **Verification**: `api/__tests__/key-activity-score.test.ts` (Neo4j-free unit,
  DD-01): a known-hub fixture ranks highest on centrality, a leaf ≈0, a
  ≤1-activity subgraph → all-0 no crash (AC-02); critical-path activities score 1,
  off-path graded, a cyclic fixture → `hasCycle:true` + longest acyclic sub-chain
  no crash, a 30-deep linear fixture → `truncated:true,
  truncationReason:"depth_cap"` scored against the depth-20 partial (AC-03); a
  disjoint-role + disjoint-system boundary activity scores higher on handoff than
  an all-shared one, a no-`PRECEDES` activity → 0 (AC-04); composite = Σ weighted
  desc, ties `createdAt`→`id` (incl. **two rows with equal composite + equal/absent
  `createdAt` ordered deterministically by `id`** — C-02), `meta.weights` echoes
  `{1,1,1}`, **no** recommendation field (AC-05, NFR-04); a self-loop/duplicate
  `PRECEDES` input is filtered (C-05); `bun run typecheck`.

### T-04 — Scores orchestrator + live-mark attach

- **Files** (1): `api/src/storage/key-activities.ts` (extend — `computeScores`)
- **Implements**: design §4.4, C-03 (threaded scoped set) — closes AC-01 (compute
  half); supports FR-01, FR-06
- **Complexity**: moderate
- **Blocked by**: T-02, T-03
- **Blocks**: T-05, T-08
- **Steps**: `computeScores(driver, modelId, opts?: { scoped?: Set<string> }):
  Promise<{ rows; meta }>` (the optional `scoped` threads a pre-computed set so a
  mark does not recompute `scopedNodeIds` twice — **C-03**):
  1. `readModelSubgraph(driver, modelId)` (T-02); if `opts.scoped` is provided,
     `readModelSubgraph` reuses it rather than re-calling `scopedNodeIds`.
  2. `scoreActivities(subgraph)` (T-03) → `rows` + `meta`.
  3. **Attach live marks (FR-01, §4.4):** for each row, `JSON.parse` the
     activity's `attributes_json` (carried from T-02) and set `row.key =
     keyActivityMarkSchema.safeParse(attrs.keyActivity).success ?
     attrs.keyActivity : null`. **Read-path tolerance (C-04, §4.4):** any stored
     `keyActivity` that fails the schema (wrong shape, missing `scoreSnapshot`, or
     `marked:false`) → `row.key = null` and **log at `warn`**; the underlying node
     attribute is **left untouched** (the mark write, T-05, is the only mutator).
- **Verification**: exercised by `api/__tests__/key-activity-scores.integration.test.ts`
  (T-11 — a marked activity shows live scores + `key` snapshot; a hand-planted
  `marked:false` renders as `key:null`, C-04); `bun run typecheck`.

### T-05 — Mark / unmark — attribute-preserving read-merge-write

- **Files** (1): `api/src/storage/key-activities.ts` (extend — `markActivity`,
  `unmarkActivity`)
- **Implements**: design §4.5, DD-05, C-03 — closes AC-06, AC-07 (storage half);
  supports FR-07, FR-08, FR-09, NFR-02, NFR-03
- **Complexity**: complex
- **Blocked by**: T-03, T-04
- **Blocks**: T-08
- **Steps**: Both writes go through a **dedicated read-merge-write** that **never**
  calls the generic `createNode`/`patchNode` primitives (which replace the whole
  `attributes_json` + run `assertAttributesMatchSchema`, verified
  `nodes.ts:180-198` — that is why they are not used, §9). The generic primitives
  stay **byte-for-byte unchanged** (FR-09, AC-17).
  - `markActivity(driver, modelId, activityId)`:
    1. **Model-scope check, single set (C-03):** compute `scoped =
       scopedNodeIds(driver, modelId)` **once**; confirm `activityId ∈ scoped` and
       is labelled `Activity`. Miss → `404 activity_not_found` (a cross-model /
       non-existent activity — no cross-model mark, AC-08).
    2. **Snapshot live scores:** `computeScores(driver, modelId, { scoped })`
       (threads the set from step 1 — **C-03**, `scopedNodeIds` not re-run); pick
       the row for `activityId` → `{centrality, criticalPath, handoff, composite}`
       + `rank`. **Best-effort point-in-time read, not tx-consistent with step 3
       (Risk #5, §4.5) — acceptable by design:** the mark is evidence-at-mark-time
       and the live `GET` always recomputes.
    3. **Atomic read-merge-write (no APOC, §4.5):** inside one
       `session.executeWrite(tx => …)` — `MATCH (a:Activity {id:$id}) RETURN
       a.attributes_json`, `JSON.parse → attrs`, `attrs.keyActivity = { marked:true,
       markedAt: <ISO now>, scoreSnapshot, rank }`, then `MATCH (a:Activity {id:$id})
       SET a.attributes_json = $merged, a.updatedAt = $now` with `$merged =
       JSON.stringify(attrs)`. **Every other attribute preserved byte-for-byte**
       (only the `keyActivity` key is added/replaced, AC-06). Validate the merged
       `attrs.keyActivity` against `keyActivityMarkSchema` before write. → `200` +
       `activityScoreRowSchema` (the row with `key` populated).
  - `unmarkActivity(driver, modelId, activityId)`:
    1. Model-scope check as above (`404 activity_not_found` for a non-scoped id).
    2. Read `attributes_json` → `attrs`, `delete attrs.keyActivity`, write the
       merged map back in one atomic tx. The `attributes` map is restored
       **byte-equal** to its pre-mark state (no residue key, siblings intact —
       NFR-03, AC-07).
    3. **Idempotent:** unmarking an activity with no `keyActivity` key is a no-op
       write → `204` (not `404`, FR-08).
    4. Re-marking after unmark writes a **fresh** snapshot at then-current scores
       (recomputable, XD-03, AC-07).
- **Verification**: `api/__tests__/key-activity-mark.integration.test.ts` — `POST
  …/:activityId/mark` writes `keyActivity` evidence **inside** `attributes`
  preserving a pre-set unrelated attribute (AC-06); a non-scoped `:activityId` →
  `404 activity_not_found`; `NODE_LABELS`/`EDGE_ENDPOINTS` unchanged; `DELETE
  …/mark` restores `attributes` **byte-equal** to pre-mark (no residue, siblings
  intact, NFR-03), unmark of unmarked → `204` no-op, re-mark writes a fresh
  snapshot at current scores (AC-07); `bun test:integration`.

### T-06 — Import-interaction test + schema-contingency documentation

- **Files** (1): `api/__tests__/key-activity-import.integration.test.ts` (new)
- **Implements**: design §4.6, DD-04, DD-05 — closes AC-06 (import-round-trip
  half); lands C-01 (pass-2) qualifier
- **Complexity**: moderate
- **Blocked by**: T-05
- **Blocks**: —
- **Steps**: This spec **does not** touch `POST /api/v1/import` / `upsertNode`
  (DD-04); it only documents + asserts the interaction. A test proves that because
  `keyActivity` lives in the open `attributes` map: (a) a snapshot taken **before**
  a mark re-imports the activity **without** the mark (mark dropped — import is
  authoritative); (b) a snapshot taken **after** restores the mark **with** its
  point-in-time `scoreSnapshot`/`rank` (which the live `GET` recomputes fresh).
  **C-01 (pass-2) qualifier:** the test docstring **and** a one-line code comment
  near the mark write (T-05) state the round-trip holds **provided the `Activity`
  attribute schema is not `additionalProperties:false`** (the current default;
  unlisted keys pass a non-strict `z.object`, verified `nodes.ts:41-73`). **No code
  change to import/`upsertNode`.**
- **Verification**: `api/__tests__/key-activity-import.integration.test.ts` — the
  pre-mark and post-mark export→import round-trip behaviours above; `bun
  test:integration`.

### T-07 — Additive error code

- **Files** (1): `api/src/errors.ts` (modify)
- **Implements**: design §3.4 — closes part of FR-10
- **Complexity**: simple
- **Blocked by**: T-01
- **Blocks**: T-08, T-13
- **Steps**: Append **one** additive code to the closed `ERROR_CODES` array
  (NFR-11; no existing code removed/reordered): `activity_not_found` (404, thrown
  from `POST`/`DELETE …/:activityId/mark` when `:activityId` is not a model-scoped
  `Activity` of `:modelId`). **Do NOT add a `model_not_found` code** — it is
  **already present** (`errors.ts:36`, verified); the scores/mark handlers consume
  it. `activity_not_found` is reachable from both mark and unmark (AC-06/AC-08) so
  no unreachable "reserved" code is added. Keep the exhaustive assertion in
  `errors.ts` happy.
- **Verification**: `api/__tests__/key-activity-openapi.integration.test.ts` (with
  T-13) asserts `activity_not_found` is a member of `ERROR_CODES` and appears in
  the OpenAPI `ErrorEnvelope.code` enum; `bun run typecheck` passes the
  exhaustiveness assertion.

### T-08 — Route handlers + router dispatch

- **Files** (2): `api/src/routes/key-activities.ts` (new),
  `api/src/router.ts` (modify)
- **Implements**: design §4.7, N-02 (dispatch ordering) — supports FR-06, FR-07,
  FR-08, FR-10
- **Complexity**: complex
- **Blocked by**: T-04, T-05, T-07
- **Blocks**: T-09, T-11, T-12, T-13
- **Steps**: Three handlers in `api/src/routes/key-activities.ts` returning the
  `{error:{code,message,details?}}` envelope via `_helpers.ts`
  (`ok`/`noContent`/`error`/`fromValidationError`, verified exports):
  - `handleKeyActivityScores` — `GET /models/:modelId/key-activities` → `200
    keyActivityScoresSchema`; unknown model (`computeScores` on an empty scoped
    set) → `404 model_not_found`.
  - `handleKeyActivityMark` — `POST /models/:modelId/key-activities/:activityId/mark`
    → `200 activityScoreRowSchema`; non-scoped activity → `404 activity_not_found`.
    **No request body** (§3.2 — scores snapshotted server-side).
  - `handleKeyActivityUnmark` — `DELETE
    /models/:modelId/key-activities/:activityId/mark` → `204`; non-scoped → `404
    activity_not_found`; unmark of unmarked → `204` (idempotent).
  In `api/src/router.ts` add a `models/:modelId/key-activities*` block of
  `sub.match(/…/)` regexes **after** `model-workspace-core`'s `models*` block (and
  the `story-spec-core` `stories*` block if present), specific-before-parameterized
  (N-02): (1) `^models\/([^/]+)\/key-activities$` (GET scores); (2)
  `^models\/([^/]+)\/key-activities\/([^/]+)\/mark$` (POST mark, DELETE unmark).
  The `mark` literal never collides with the bare `key-activities` path (different
  segment counts) but specific-first is kept per house convention.
- **Verification**: exercised through the route surface by
  `api/__tests__/key-activity-scores.integration.test.ts` (T-11),
  `key-activity-mark.integration.test.ts` (T-05), and
  `key-activity-scope-authz.integration.test.ts` (T-12 — `getRoutePermission`
  resolves each new route); `bun run typecheck`.

### T-09 — Route-permission mapping + RBAC role grant

- **Files** (2): `api/src/auth/rbac-permissions.ts` (modify),
  `api/src/scripts/seed-rbac-roles.ts` (modify)
- **Implements**: design §4.8, N-02 (ordering) — closes AC-08 (authz half);
  supports FR-11
- **Complexity**: moderate
- **Blocked by**: T-08 (hard build-order precondition — `seed-rbac-roles.ts` +
  `business_architect` role land with `model-workspace-core`)
- **Blocks**: T-12
- **Steps**: In `rbac-permissions.ts` add **three** `ROUTE_PERMISSIONS` rows (the
  `P(method, path, permission)` helper, verified), specific-before-parameterized:
  `P("GET", "models/:modelId/key-activities", "key_activity:read")`, `P("POST",
  "models/:modelId/key-activities/:activityId/mark", "key_activity:write")`,
  `P("DELETE", "models/:modelId/key-activities/:activityId/mark",
  "key_activity:write")`. `matchSegments` rejects on segment-count first, so
  ordering only bites same-length rows — but the security-critical property is
  that **every** new route has a row (an unmapped route → `getRoutePermission`
  returns `null` → router skips the RBAC check → silent open write). **No new
  route is `public`**; auth stays in the central gate (`router.ts` →
  `getRoutePermission` → RBAC check) — **no per-route check** (NFR-06). In
  `seed-rbac-roles.ts` **add** `"key_activity:read"` + `"key_activity:write"` to
  the existing `business_architect` role's permission array (idempotent `MERGE
  (r:RBACRole {name})` — this spec **modifies** the role `model-workspace-core`
  FR-11 created; it does **not** create it).
- **Verification**: `api/__tests__/key-activity-scope-authz.integration.test.ts`
  (T-12 — a session without `key_activity:write` → `403` on the mark `POST` /
  unmark `DELETE`, with it → `200`/`204`; a `key_activity:read` session → `200` on
  the scores `GET`; `getRoutePermission` resolves each new route, never `null`;
  the `business_architect` role resolves both permissions; no new route
  `isPublicRoute`); `bun run typecheck`.

### T-10 — OpenAPI registration

- **Files** (1): `api/src/routes/openapi.ts` (modify)
- **Implements**: design §4.9 — closes AC-08 (openapi half); supports FR-10
- **Complexity**: moderate
- **Blocked by**: T-07, T-08
- **Blocks**: T-13
- **Steps**: Register `keyActivityScoresSchema`, `activityScoreRowSchema`,
  `subScoresSchema`, `keyActivityMarkSchema` and `registerPath` each of the three
  routes (§4.7), generated from the same T-01 zod definitions (no hand-maintained
  copy, FR-10). The new `activity_not_found` code surfaces in the shared
  `errorEnvelopeSchema` responses.
- **Verification**: `api/__tests__/key-activity-openapi.integration.test.ts` (with
  T-07) — the three route paths and the `activity_not_found` code appear in `GET
  /api/v1/openapi.json` (AC-08 openapi half); `bun test:integration`.

### T-11 — Scores/centrality/critical-path/handoff integration tests

- **Files** (4): `api/__tests__/key-activity-scores.integration.test.ts` (new),
  `api/__tests__/key-activity-centrality.integration.test.ts` (new),
  `api/__tests__/key-activity-critical-path.integration.test.ts` (new),
  `api/__tests__/key-activity-handoff.integration.test.ts` (new)
- **Implements**: design §8, §4.2–§4.4 — closes AC-01, AC-02, AC-03, AC-04, AC-05
  (integration half)
- **Complexity**: complex
- **Blocked by**: T-04, T-08
- **Blocks**: —
- **Steps**: Seed model subgraphs **API-only** (design §8 — no direct-driver
  seeding): `POST /api/v1/models` + `model-workspace-core`'s `POST
  /api/v1/models/:id/domains` + core `POST /api/v1/domains`/`journeys`/`nodes`
  (activities) + `POST /api/v1/edges` (`PRECEDES`/`EXECUTES`/`USES_SYSTEM`). Then:
  - `key-activity-scores.integration.test.ts` — `GET …/key-activities` returns
    ranked rows w/ `id`/`name`/`journeyName`/`composite`/`scores∈[0,1]` +
    `meta{activityCount,hasCycle,weights}`, every score carrying its `evidence`
    block (AC-01); composite desc + tie `createdAt`→`id`, `meta.weights` echoes
    `{1,1,1}`, **no** recommendation field (AC-05, NFR-04); a marked activity shows
    live scores + `key` snapshot; a hand-planted `marked:false` → `key:null`
    (C-04).
  - `key-activity-centrality.integration.test.ts` — a known-hub fixture ranks
    highest on centrality; a leaf ≈0; a ≤1-activity model → all-0, no crash (AC-02).
  - `key-activity-critical-path.integration.test.ts` — critical-path activities
    score 1, off-path graded; a cyclic `PRECEDES` fixture → `meta.hasCycle=true` +
    longest acyclic sub-chain, no crash; a 30-deep linear fixture →
    `meta.truncated=true, truncationReason:"depth_cap"`, scored against the
    depth-20 partial (AC-03, NFR-05).
  - `key-activity-handoff.integration.test.ts` — a disjoint-role + disjoint-system
    boundary activity scores higher than an all-shared one; raw `handoffCount` +
    role/system breakdown in evidence; a no-`PRECEDES`-neighbour activity → 0
    (AC-04).
- **Verification**: the four files above; `bun test:integration`.

### T-12 — Model-isolation + authz integration test

- **Files** (1): `api/__tests__/key-activity-scope-authz.integration.test.ts` (new)
- **Implements**: design §4.2, §4.8, DD-02, DD-08 — closes AC-08 (isolation +
  authz half, the N-03 two-file split — the openapi half is T-10); supports
  NFR-01, FR-11
- **Complexity**: moderate
- **Blocked by**: T-08, T-09
- **Blocks**: —
- **Steps**: **AC-08 is a two-file split (design §8, N-03) — this is the
  scope+authz half; `key-activity-openapi.integration.test.ts` (T-10) is the
  openapi half; both must exist so neither is orphaned.** Seed **two** models each
  with its own activities (+ a `PRECEDES` edge from a model-A activity to a
  model-B activity to prove cross-scope exclusion). Assert: `GET
  /api/v1/models/:A/key-activities` scores **only** model-A activities and excludes
  model-B-only ones (the cross-scope `PRECEDES` edge contributes **nothing** to
  A's centrality/critical-path/handoff, NFR-01); marking a model-B activity under
  model A's path → `404 activity_not_found`; a session without `key_activity:write`
  → `403` on the mark `POST` / unmark `DELETE`; a `key_activity:read` session →
  `200` on the scores `GET`; the `business_architect` role resolves both
  permissions; no new route `isPublicRoute`. Seed API-only (design §8).
- **Verification**: `api/__tests__/key-activity-scope-authz.integration.test.ts`
  (AC-08 isolation + authz half); `bun test:integration`.

### T-13 — PWA api client (keyActivities block)

- **Files** (1): `pwa/src/api.ts` (modify)
- **Implements**: design §4.11, DD-07 — supports FR-12, FR-13
- **Complexity**: simple
- **Blocked by**: T-01
- **Blocks**: T-14
- **Steps**: Add a `keyActivities` block to the exported `api` object (design
  §4.11), reusing the **private** `json<T>()` fetch wrapper internally (the
  *block* is exported, `json` is not — DD-07): `list(modelId, signal?)` (GET
  `…/key-activities`), `mark(modelId, activityId)` (POST `…/:activityId/mark`),
  `unmark(modelId, activityId)` (DELETE `…/:activityId/mark`). Types
  (`KeyActivityScores`, `ActivityScoreRow`) inferred from the shared T-01 zod
  schemas.
- **Verification**: `bun run typecheck`; consumed + asserted transitively by
  `pwa/src/__tests__/key-activity-board.test.tsx` (T-14).

### T-14 — KeyActivityBoard view + in-view sort + mark toggle + evidence panel + 4 states + registration

- **Files** (3): `pwa/src/views/model/KeyActivityBoard.tsx` (new),
  `pwa/src/views/model/KeyActivityBoard.module.css` (new),
  `pwa/src/views/index.tsx` (modify)
- **Implements**: design §4.10, §6, DD-10 (in-view sort, B-01), C-02 (sibling
  retry `Button`) — closes AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15;
  supports FR-12, FR-13, FR-14, UX-01/02/05/06
- **Complexity**: complex
- **Blocked by**: T-13 (hard build-order precondition — `useActiveModel()` +
  the `key-activities` `ModelTabPlaceholder` slot land with `model-workspace-core`)
- **Blocks**: T-15, T-16
- **Steps**: In `pwa/src/views/index.tsx`, **replace** the `key-activities` tab's
  `<ModelTabPlaceholder spec="key-activity-optimizer"/>` dispatch with
  `"key-activities": (r) => <KeyActivityBoard route={r} />` (the **only** edit to
  that file — `route.ts`/`SURFACES` stay `model-workspace-core`'s). `KeyActivityBoard`
  reads the active `BusinessModel` from `useActiveModel()`
  (`pwa/src/context/ActiveModelContext.tsx` — **does not re-implement model
  selection**), keys its fetch on `activeModel.id`, and fetches `GET
  /api/v1/models/:modelId/key-activities` via `api.keyActivities.list` (T-13).
  Render **all four states**:
  - **loading** (AC-11) — skeleton via `Loading` from `views/_shared.tsx` while
    the fetch is in flight.
  - **empty** (AC-12) — `meta.activityCount === 0` → a `Card` "model has no
    activities to score" message pointing to authoring (`#/model/canvas`); no
    ranking table.
  - **error** (AC-13) — `ErrorState` from `views/_shared.tsx` renders the message
    **plus a separate sibling catalog `Button`** for retry (C-02 — `ErrorState`
    has no retry control, verified `_shared.tsx`); the retry re-invokes
    `api.keyActivities.list(activeModel.id)` and re-enters loading.
  - **ready** (AC-09) — a **sortable ranking table** whose sort layer is **owned
    by `KeyActivityBoard`** (DD-10/B-01 — the catalog `DataTable` is static and
    **not** extended). Hold `sortColumn`/`sortDir` state; sort the fetched `rows`
    **client-side** (stable, default `composite` desc = server rank order);
    keyboard-activatable column headers (Enter/Space) carry `aria-sort`
    (`ascending`/`descending`/`none`). No re-fetch on sort (full ranking already
    in memory, NFR-05). Each row: rank, activity name, journey, composite score,
    the three sub-scores, key/not-key indicator + mark toggle.
  - A `meta.truncated` or `meta.hasCycle` flag → a **non-blocking banner** above
    the still-rendered ranking (AC-13, FR-03).
  **Mark/unmark + detail (FR-13, AC-10):** each row's mark toggle marks (`POST
  …/:activityId/mark`) / unmarks (`DELETE …/:activityId/mark`),
  **optimistic-with-rollback-on-error** (toggle the row's `key` immediately;
  revert + surface an inline error on rejection). Selecting a row opens a catalog
  `SidePanel`/`Modal` showing the **score evidence**: composite + three sub-scores
  with component values (raw betweenness / in-out degree; critical-path membership
  + `longestChainDepth`/`criticalPathLength`; raw `handoffCount` + role/system
  breakdown) — explainable (XD-11) — plus, when marked, `markedAt`/`scoreSnapshot`/
  `rank` (live-vs-snapshot drift visible). **Tokens + a11y (NFR-07, UX-02/05):**
  `KeyActivityBoard.module.css` uses only `var(--…)` from
  `pwa/src/styles/companygraph/tokens.css`; catalog components (`Card`, `Button`,
  `Modal`/`SidePanel`, `Loading`/`ErrorState`, `DataTable` for the static cell
  body) before inventing new ones; ARIA landmark on the view; Tab reaches the sort
  controls then each row's mark toggle in DOM order; opening a row detail moves
  focus into the panel, Escape/close returns it (reusing the catalog
  `SidePanel`/`Modal` focus-trap — not re-implemented). **The catalog
  `DataTable` is NOT edited** (DD-10) — the sortable-header/`aria-sort` markup
  lives in the view.
- **Verification**: `pwa/src/__tests__/key-activity-board.test.tsx` (`#/model/
  key-activities` → `KeyActivityBoard` not `ModelTabPlaceholder`; reads
  `useActiveModel()`; ready ranking table w/ rank/name/journey/composite/3
  sub-scores/key indicator per row; **in-view sort** — activating a score column
  header re-orders rows client-side and flips its `aria-sort`, no re-fetch, default
  `composite` desc — AC-09) + `pwa/src/__tests__/key-activity-detail.test.tsx`
  (mark toggle POST/DELETEs + optimistic re-render w/ rollback-on-error; detail
  panel shows composite + 3 sub-scores **with component evidence** + (when marked)
  `markedAt`/`scoreSnapshot`/`rank` — AC-10) + **CLI** (AC-14, design §8
  promotion — deterministic exit code): `bun run scripts/design-conformance.ts
  --view pwa/src/views/model/KeyActivityBoard.tsx` **and** `bun run
  scripts/design-conformance.ts --view
  pwa/src/views/model/KeyActivityBoard.module.css` — both exit 0, zero
  token/component violations + **manual** (AC-15, keyboard): with the stack up,
  load `#/model/key-activities` keyboard-only — Tab to a sortable column header,
  press Enter to sort (expect `aria-sort` flips and rows reorder), Tab to a row's
  mark toggle and press Space (expect the key indicator toggles), Tab/Enter to
  open a row detail (expect focus enters the panel and Escape returns focus to the
  originating row).

### T-15 — KeyActivityBoard view-state tests (loading / empty / error+retry / banner)

- **Files** (1): `pwa/src/__tests__/key-activity-board-states.test.tsx` (new)
- **Implements**: design §4.10, §6 — closes AC-11, AC-12, AC-13
- **Complexity**: moderate
- **Blocked by**: T-14
- **Blocks**: —
- **Steps**: jsdom component test of the non-ready states: **loading** skeleton
  while `GET /api/v1/models/:id/key-activities` is pending (AC-11); **empty** state
  (`meta.activityCount===0`) showing the "no activities to score → authoring"
  message and **no** ranking table (AC-12); **error** state renders `ErrorState`
  **plus the sibling retry `Button`** (C-02 — retry is not part of `ErrorState`)
  whose click re-invokes `api.keyActivities.list(activeModel.id)` and re-enters
  loading; a `meta.truncated`/`meta.hasCycle` response → a **non-blocking banner**
  above the still-rendered ranking (AC-13, FR-03).
- **Verification**: `pwa/src/__tests__/key-activity-board-states.test.tsx` (AC-11,
  AC-12, AC-13).

### T-16 — KeyActivityBoard model-context reload e2e

- **Files** (1): `pwa/playwright/key-activity-board-context.spec.ts` (new)
- **Implements**: design §4.10 — closes AC-16; supports FR-14, UX-06
- **Complexity**: moderate
- **Blocked by**: T-14
- **Blocks**: —
- **Steps**: Playwright spec: with a non-reference model (model B) active,
  navigate to `#/model/key-activities`, reload → the same route renders
  `KeyActivityBoard` showing **model B's** ranked activities (active-model
  persistence is `model-workspace-core` FR-15; this view refetches for the
  persisted model). Assert no cross-model leakage in the ranking (server-enforced,
  §4.2). Seed via the API (models + domains + activities + edges routes).
- **Verification**: `pwa/playwright/key-activity-board-context.spec.ts` (AC-16).

## Cross-cutting verification (whole-spec)

- **AC-17** (transpile clean + no compile-time schema-array edit): `bun run
  typecheck` exit 0; `manual: git diff shared/src/schema/nodes.ts
  shared/src/schema/edges.ts` shows **no** additions to `NODE_LABELS` or
  `EDGE_ENDPOINTS` (the `keyActivity` judgement lives in the open `attributes`
  map; no new label/edge — NFR-02). Not a standalone task — checked at the final
  validation sweep (after T-02/T-05).

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with behaviour | the task's listed test (`bun test <path>` / `bun test:integration`) |
| tasks touching pwa views (T-14) | `bun run scripts/design-conformance.ts --view <file>` for **every file the task touches** under `pwa/src/views/` — `.tsx` and `.module.css` each get their own invocation |
| final task | `bun test` + `bun test:integration` (needs Neo4j) + full AC-01..AC-17 sweep + AC-17 (`git diff` NODE_LABELS/EDGE_ENDPOINTS) |

## Traceability summary

| FR | Tasks | AC |
|----|-------|-----|
| FR-01 model-scoped read | T-02, T-04 | AC-01, AC-08 |
| FR-02 centrality | T-01, T-03, T-11 | AC-01, AC-02 |
| FR-03 critical-path | T-03, T-11 | AC-03 |
| FR-04 handoff density | T-03, T-11 | AC-04 |
| FR-05 composite rank | T-01, T-03, T-11 | AC-05 |
| FR-06 scores endpoint | T-01, T-04, T-08, T-10 | AC-01, AC-08 |
| FR-07 mark | T-01, T-05, T-08 | AC-06 |
| FR-08 unmark (reversible, idempotent) | T-05, T-08 | AC-07 |
| FR-09 attr-preserving write | T-05 | AC-06, AC-07, AC-17 |
| FR-10 openapi + error code | T-01, T-07, T-08, T-10 | AC-08 |
| FR-11 route-perm + RBAC | T-09 | AC-08 |
| FR-12 KeyActivityBoard + 4 states + in-view sort | T-13, T-14, T-15 | AC-09, AC-11, AC-12, AC-13, AC-14, AC-15 |
| FR-13 mark toggle + evidence panel | T-14 | AC-10, AC-15 |
| FR-14 model-scope + reload survival | T-14, T-16 | AC-16 |
| NFR-01 model isolation | T-02, T-12 | AC-08 |
| NFR-02 no new label / no schema edit | T-02, T-05 | AC-06, AC-17 |
| NFR-03 reversibility | T-05 | AC-07 |
| NFR-04 deterministic + descriptive | T-03, T-11 | AC-05 |
| NFR-05 bounded compute | T-03, T-11 | AC-03 |
| NFR-06 house rules | T-08, T-09, all | AC-08, AC-17 |
| NFR-07 tokens-only + conformance | T-14 | AC-14, AC-15 |
</content>
