---
feature: "key-activity-optimizer"
reviewing: "design"
artifact: ".claude/specs/key-activity-optimizer/design.md (revised, revision 2)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-04"
review_pass: "2 of at most 2"
---

# Design Review (pass 2): key-activity-optimizer

Re-reviewed cold against the approved `requirements.md` (FR-01…FR-14, NFR-01…NFR-07,
AC-01…AC-17), the app `blueprint.md` (View Tree, UX-01…UX-06, XD-03/XD-11), the
dependency specs `model-workspace-core` + `story-spec-core`, and the live
codebase. All pass-1 findings (B-01, C-01…C-05, N-01…N-03) were re-checked against
the revision, and each cited codebase/upstream claim was re-verified by reading the
files.

This is the single allowed re-review. The one pass-1 blocker is resolved and every
concern is folded in with a verifiable resolution. Verdict: **approve**.

## Pass-1 findings — resolution status

- **~~B-01~~ → resolved.** The catalog `DataTable` sort gap is now handled by
  **DD-10** (+§4.10, §6, §7): an **in-view sort layer** owned by
  `KeyActivityBoard` (`sortColumn`/`sortDir` state, client-side stable sort of the
  fetched rows, keyboard-activatable `aria-sort` headers), with the catalog
  `DataTable` explicitly **not** extended and explicitly **absent** from §7's File
  Changes. Verified against `pwa/src/components/DataTable.tsx` (read in full): it is
  a static `{columns, rows}` table with plain `<th>{label}` headers, no sort state,
  no `onSort`, no `aria-sort`, no keyboard-activatable headers — so the in-view
  ownership is the correct call, and AC-15's `aria-sort` requirement now traces to a
  concrete owner (the view). Because the ranking is a single-model fetch (NFR-05),
  client-side sort with no re-fetch is sound.
- **~~C-01~~ → resolved.** §4.5 step 2 now states the snapshot is a **best-effort
  point-in-time read not tx-consistent with the step-3 write** (consistent with
  Risk #5's evidence-at-mark-time framing), calls out the per-mark full-recompute
  cost, and notes the future optimisation (accept the board's already-computed row,
  server still recomputes authoritatively). Adequate.
- **~~C-02~~ → resolved.** §4.10 error state and §6 now state the retry is a
  **separate sibling catalog `Button`**, not part of `ErrorState`, whose handler
  re-invokes `api.keyActivities.list(activeModel.id)`. Verified against
  `pwa/src/views/_shared.tsx`: `ErrorState({ message })` renders a static div with
  no retry control — the sibling-Button framing is correct.
- **~~C-03~~ → resolved.** DD-05 is trimmed: it now states the bespoke `SET`
  **bypasses `assertAttributesMatchSchema` by design** on the mark path, and confines
  the permissive-schema argument to the `upsertNode` export/import round-trip (DD-04).
  Verified: `assertAttributesMatchSchema` runs only inside `patchNode`/`createNode`/
  `upsertNode` in `api/src/storage/nodes.ts` (lines 117, 181, 229), never on a raw
  `SET`. See C-01 below for a residual precision note on the permissive claim.
- **~~C-04~~ → resolved.** §4.4 adds an explicit **display contract**: any stored
  `keyActivity` that fails `keyActivityMarkSchema` (including `marked:false`) is
  treated as unmarked (`row.key = null`) and logged at `warn`, with the underlying
  node attribute left untouched by the read path. Good.
- **~~C-05~~ → resolved.** §4.2's `PRECEDES` query now filters `p.id <> q.id` and
  `RETURN DISTINCT`, and §4.3 adds a defensive filter/de-dupe inside the pure scorer
  so the Neo4j-free unit tests assert the same invariant; §4.4's handoff pass
  iterates the same de-duplicated, self-loop-free edge set. Verified
  `buildGraphologyGraph` is `{type:"directed", multi:false}` (`api/src/ontology/
  analytics/graph.ts:103`), so the self-loop/parallel-edge throw is genuinely
  avoided.
- **~~N-01~~ → resolved.** §3.4/§4.2 now state `model_not_found` is already present
  (verified `api/src/errors.ts:36`) and add **only** `activity_not_found`.
- **~~N-02~~ → resolved.** §4.3 notes `GraphNode.name` is always present and
  `createdAt` is intentionally not carried into the graph (row-layer tiebreak only).
- **~~N-03~~ → resolved.** §8 AC-08 is explicitly a two-file split
  (`scope-authz` + `openapi`) with a note that both must appear in the tasks phase.

## Findings (this pass)

No blockers. Three low-severity concerns and one nit remain — all deferrable to the
tasks phase; none blocks approval.

### Concerns

#### C-01 — DD-05's permissive-schema claim is contingent on the `Activity` attribute schema not being strict

DD-05 asserts, for the export/import round-trip (DD-04), that "the permissive
`Activity` label schema accepts unlisted keys … `checkAttributesAgainstSchema`
returns `null`/permissive for unlisted keys." That is **not** unconditionally true.
Verified: `checkAttributesAgainstSchema` (`api/src/storage/nodes.ts:41-73`) returns
`null` (permissive) only when the label has **no registry row** (the `not_found`
catch, line 49-51). When the `Activity` label **does** carry an attribute schema,
the validator is compiled from that label's JSON Schema by `jsonSchemaToZod`
(`api/src/ontology/cache/attribute-zod.ts:57-72`). Unlisted keys like `keyActivity`
survive only because `z.object()` is non-strict **by default** — but if the
`Activity` JSON Schema ever sets `additionalProperties:false` (compiling to
`.strict()`), the `upsertNode` import path would reject the `keyActivity` key.

This does not affect the mark write path (which bypasses the validator entirely, per
the resolved C-03) and does not affect scoring. It only bites the DD-04 import
round-trip, and only under a strict `Activity` schema. Since this spec does not
control the `Activity` schema definition and the current default is permissive, this
is a latent-assumption note, not a blocker.
**Recommendation.** In DD-05/DD-04, qualify the claim to "survives import **provided
the `Activity` attribute schema is not `additionalProperties:false`** (the current
default; unlisted keys pass a non-strict `z.object`)." No code change required.

#### C-02 — AC-05's tiebreak asserts `createdAt` ordering, but `createdAt` is read from the graph and its presence is assumed

§4.3 breaks composite ties by "lowest `createdAt`, then lowest `id`," and §4.2's
read `RETURN … a.createdAt AS createdAt`. Every node is documented to carry
`createdAt` (CLAUDE.md schema section), so this is almost certainly safe — but the
pure scorer's `ScoreActivity.createdAt: string` is non-nullable (§4.1), and the
design does not say what happens if a node is missing `createdAt` (older seed data,
a hand-created node). A `null`/`undefined` `createdAt` would make the tiebreak
non-deterministic, undermining NFR-04.
**Recommendation.** In §4.3, state the tiebreak falls back to `id` alone when
`createdAt` is absent/equal (which it already does as the second key), and have the
§4.2 read coalesce a missing `createdAt` to a stable sentinel — or assert in the
scorer that `createdAt` is always present per the graph-core node contract. A
one-line note closes it; can be handled in the tasks phase.

#### C-03 — The mark write's model-scope check and the snapshot read span three separate reads, not one

§4.5 `markActivity` performs: step 1 a model-scope check (`activityId ∈
scopedNodeIds` + labelled `Activity`), step 2 `computeScores` (a full subgraph
read), and step 3 the read-merge-write tx. That is at least three round-trips
(scopedNodeIds internally is one query; computeScores is two; the write is one),
and `scopedNodeIds` is effectively computed twice (once in step 1, once inside
`computeScores → readModelSubgraph`). Correctness is fine and the resolved C-01
already frames the cost as acceptable at `retail-mini` scale, but the redundant
`scopedNodeIds` recomputation within a single mark is a small, avoidable
inefficiency worth noting for the implementer.
**Recommendation.** In §4.5, note that `computeScores` can return the scoped set
(or the scope check can reuse the set computed by step 2) so `scopedNodeIds` is not
run twice per mark. Optional; tasks-phase polish.

### Nits

- **N-01 — DD-06 cites cto-analytics FR-06 field names (`has_cycle`,
  `truncation_reason`, `longest_partial`) as snake_case to contrast with this spec's
  camelCase.** The contrast is fine and the divergence is justified (re-implementation
  over a different subgraph, house camelCase convention), but the design does not
  verify those cto-analytics field names actually ship that way — cto-analytics'
  design→tasks never ran per CLAUDE.md ("views shipped off-spec"). Harmless: this
  spec correctly owns its own camelCase wire shape regardless. No action.
- **N-02 — §4.7 dispatch ordering.** The note "The `mark` literal never collides
  with the bare `key-activities` path — different segment counts" is correct
  (4-segment GET vs 5-segment mark/unmark under `models/:modelId/…`). Retaining the
  specific-before-parameterized ordering per house convention is the right call.

## Completeness / Traceability

### FR → design coverage

| FR | Design element | Status |
|----|----------------|--------|
| FR-01 model-scoped read | §4.2 `readModelSubgraph` consumes `scopedNodeIds` (verified signature `scopedNodeIds(driver, modelId): Promise<Set<string>>`, model-workspace-core design §4.2) | covered |
| FR-02 centrality | §4.3 betweenness over directed `PRECEDES`, normalized, evidence (DD-03) | covered |
| FR-03 critical-path | §4.3 bounded DFS, caps 20/1000/4 s, cycle + truncation surface | covered |
| FR-04 handoff density | §4.3 disjoint role/system sets over de-duped `PRECEDES` neighbours | covered |
| FR-05 composite rank | §4.3 Σ weighted, weights {1,1,1}, tie createdAt→id (DD-09) | covered (see C-02) |
| FR-06 scores endpoint | §4.7, §5, §3.3 schema, §4.9 openapi | covered |
| FR-07 mark | §4.5 `markActivity`, §5 | covered |
| FR-08 unmark (reversible, idempotent) | §4.5 `unmarkActivity`, 204 no-op | covered |
| FR-09 attr-preserving write | §4.5 bespoke read-merge-write; primitives untouched (verified nodes.ts patchNode replaces whole map, line 196) | covered |
| FR-10 openapi + error code | §3.4 `activity_not_found` (verified new; `model_not_found` already at errors.ts:36), §4.9 | covered |
| FR-11 RBAC + route perms | §4.8 `ROUTE_PERMISSIONS` (verified `P()` helper + array, rbac-permissions.ts:11/18) + seed-rbac-roles append | covered |
| FR-12 KeyActivityBoard + 4 states | §4.10, §6, DD-10 (in-view sort) | **covered — B-01 resolved** |
| FR-13 mark toggle + evidence panel | §4.10, §4.11, DD-10 (sort), C-02 resolution (retry) | **covered — B-01 resolved** |
| FR-14 model-scope + reload survival | §4.10 keys fetch on `activeModel.id`; consumes `useActiveModel()` | covered |
| NFR-01 isolation | §4.2 + DD-02 (verified: scopedNodeIds excludes shared System/Role/Location, model-workspace-core design §4.2:379-381) | covered |
| NFR-02 no schema edit | §3, §4.5, DD-05 | covered |
| NFR-03 reversibility | §4.5 byte-equal restore | covered |
| NFR-04 deterministic/descriptive | §4.3 tiebreak, no suggestion field | covered (see C-02) |
| NFR-05 bounded compute | §4.3 caps | covered |
| NFR-06/07 house rules + tokens | §4.8 (auth via central gate only), §4.10, §6 | covered |

### AC → test coverage (§8)

| AC | Test artifact | Status |
|----|---------------|--------|
| AC-01..AC-05 | scores/centrality/critical-path/handoff integration + `key-activity-score.test.ts` unit | covered |
| AC-06/07 | `key-activity-mark.integration.test.ts` | covered |
| AC-08 | `scope-authz` + `openapi` integration (two-file split, N-03) | covered |
| AC-09/10 | `key-activity-board.test.tsx` + `key-activity-detail.test.tsx` (in-view sort assertion added) | covered |
| AC-11/12/13 | `key-activity-board-states.test.tsx` (error = `ErrorState` + sibling retry `Button`) | covered |
| AC-14 | design-conformance CLI `--view` (verified flag exists) | covered |
| AC-15 | manual keyboard walk — `aria-sort` now traces to the in-view sort owner (DD-10) | **covered — B-01 resolved** |
| AC-16 | `key-activity-board-context.spec.ts` playwright | covered |
| AC-17 | typecheck + `git diff` on `nodes.ts`/`edges.ts` schema arrays | covered |

No FR is un-designed; no AC is un-tested. The pass-1 gap (sortable-table mechanism
underpinning FR-12/FR-13/AC-15) is closed by DD-10.

### Things done well

- Every pass-1 finding is resolved with a **verifiable** mechanism, not hand-waving —
  the in-view sort layer (DD-10) is the correct, catalog-preserving choice given the
  verified static `DataTable`.
- DD-02's model-scoping seam (bound the Activity set + intra-scope `PRECEDES`, read
  shared Role/System **unfiltered**) is re-confirmed against model-workspace-core
  design §4.2 (structural-ids-only, shared nodes excluded from the set) — a genuinely
  correct resolution of requirements C-01, and the reason the unfiltered shared-node
  read is not a scoping violation of NFR-01.
- The self-loop/duplicate-edge safety (C-05) is now enforced at **both** the Cypher
  read (`p.id <> q.id`, `DISTINCT`) and the pure scorer (defensive filter/de-dupe),
  so the Neo4j-free unit tests hold the invariant independently.
- Auth stays house-correct: three `ROUTE_PERMISSIONS` rows + a `business_architect`
  permission-set append, enforced only by the central router gate — no per-route
  check (NFR-06).

## Verdict

**approve** — zero blockers. The pass-1 blocker B-01 is resolved (DD-10, in-view
sort layer), and C-01…C-05 / N-01…N-03 are each folded in with verified mechanisms.
Three residual low-severity concerns (a contingent permissive-schema claim, a
`createdAt`-presence tiebreak assumption, a redundant `scopedNodeIds` recompute per
mark) are recorded for the tasks phase but do not block. The design is ready to
proceed to tasks.
