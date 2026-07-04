---
feature: "story-spec-core"
artifact: "tasks.md (revision 1)"
reviewing: "tasks"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-04"
review_pass: "1 of at most 2"
upstream:
  requirements: "revised (2026-07-04)"
  design: "draft (2026-07-04), design-review pass 1 = approve"
---

# Review: story-spec-core tasks.md (pass 1)

## Summary

A strong, execution-ready task breakdown. Every AC-01…AC-18 maps to at least one
task; every task carries a concrete Verification (test path or `manual:` repro
with input mode + observable outcome); no task exceeds the 3-file cap; the
`Blocked by` ordering is acyclic and topologically executable top-to-bottom. The
author correctly verified the codebase — `createEdge` (edges.ts:127),
`createNodeLabel`/`createEdgeType` (both `(driver, input, actor)`),
`design-conformance.ts --view`, the `typecheck` script, the catalog components,
and the real `model-workspace-core` interfaces — and landed the six design-review
carry-forwards (C-01…C-04, N-01…N-03) as binding decisions so the executor does
not re-derive them. Notably, the tasks **correctly override two false claims** in
upstream artifacts (the non-existent `envelope.test.ts` reachability constraint,
and design §4.10's "`--view` also checks the co-located `.module.css`"), which I
independently confirmed against the code.

No blockers. Four concerns and two nits, all bookkeeping/wording — none changes
the architecture or blocks execution. Verdict: **approve** with the concerns
recorded.

## Findings

### Blockers

None.

### Concerns

**C-01 — Forward `Blocks` adjacency lists are inconsistent with the `Blocked by`
lists (cosmetic, but they disagree).** The reverse (`Blocked by`) edges are the
ones an executor follows and they are internally coherent and acyclic. But the
forward `Blocks` lists contain spurious/missing back-references:
- **T-01 Blocks** lists `T-03, T-08, T-11, T-16`, yet none of T-03/T-08/T-11 lists
  T-01 in its `Blocked by`. T-03 (edits only `errors.ts`) genuinely does **not**
  depend on T-01; listing T-03 under T-01's Blocks is simply wrong.
- **T-05 Blocks** lists `T-11`, but T-11's `Blocked by` is `T-09` only, and T-05
  (story storage) does not gate T-11 (RBAC permission rows).
- **T-02 / T-03 Blocks** list `T-07`, but T-07's `Blocked by` is `T-04, T-05,
  T-06` (which already transitively cover T-02/T-03 via T-05).
  *Recommendation:* reconcile each `Blocks` list to be the exact inverse of the
  `Blocked by` graph (or drop the `Blocks` field and keep only `Blocked by`, since
  that is the field execution honors) so no one trusts the wrong adjacency list.

**C-02 — "`scopedNodeIds` filtered to `Activity`" understates a step.** T-05 and
T-07 (step 1) say "the scoped activity id set = `scopedNodeIds(driver, modelId)`
filtered to `Activity`". Verified against `model-workspace-core` design §4.2:
`scopedNodeIds` returns `Promise<Set<string>>` of **mixed unlabeled** structural
ids (Domain + journey + activity + instance ids) — there is no label information
in the set to "filter to Activity" on the JS side. The design §4.1 list Cypher
handles this correctly (the `(s:UserStory)-[:DESCRIBES_ACTIVITY]->(a:Activity)
WHERE a.id IN $scoped` match naturally restricts to activities), but T-07's
"filtered to `Activity`" for the bootstrap scope and its `NOT EXISTS` skip needs
the same trick — pass the whole set and let the `:Activity` label + edge match do
the filtering, since the ids themselves are not label-tagged.
  *Recommendation:* in T-05/T-07 replace "filtered to `Activity`" with "restricted
  to activities by the `:Activity` label in the query" (or an explicit
  `MATCH (a:Activity) WHERE a.id IN $scoped` pre-pass), matching how design §4.1
  already scopes. No new interface needed; wording only.

**C-03 — Tasks silently diverge from design §4.2 on the bad-`roleId` error code
without an errata row.** Design §4.2 still states a bad `roleId` returns `400
story_activity_required` (with `details.field:"roleId"`); the tasks (C-04
carry-forward, T-05, T-03) correctly change this to `404 not_found` with
`details.field:"roleId"` per the design-review recommendation. This is the right
call, but it is a tasks-vs-approved-design contract change recorded only in the
carry-forward table, not in the "Deviations from requirements" errata block (which
lists only AC-15 and OQ-2).
  *Recommendation:* keep the decision, but list the roleId→`404 not_found` change
  in the Deviations block (or explicitly note "supersedes design §4.2 sentence")
  so the orchestrator lands it as a design errata and the two documents don't
  read as contradicting each other.

**C-04 — Cross-type edge-id uniqueness pre-check not addressed for the three new
edge types.** CLAUDE.md records that `createEdge` runs `EXISTS { MATCH ()-[r
{id:$id}]-() }` across all edge types before accepting a new edge id (design-review
C-10). The tasks correctly reuse `createEdge` for `DESCRIBES_ACTIVITY` /
`STORY_FOR_ROLE` / `ACCEPTANCE_OF` (so the whitelist runs for free), but neither
T-02 nor T-05/T-06/T-07 states whether that cross-type uniqueness scan already
iterates the runtime-registered edge types (registry-backed) or only the six
compile-time ones — a bootstrap that creates hundreds of edges will hit this scan
per edge.
  *Recommendation:* add one line to T-05 (or T-02's Verification) confirming the
  edge-id uniqueness pre-check covers the registry-registered types, or note it as
  a non-issue because ids are server-generated UUIDv7 (collision-free) and the
  scan is therefore never expected to reject. Either way, make the assumption
  explicit so the bootstrap's per-edge cost is understood.

### Nits

**N-01 — T-02 idempotency swallows `409 name_conflict`, but the design/registry
naming should be pinned.** T-02 says each `createNodeLabel`/`createEdgeType` is
"wrapped to swallow `409 name_conflict`". Verified: both throw
`ERROR_CODE_THROWERS.name_conflict` on duplicate (node-labels.ts:193,
edge-types.ts:240). Good. Nit: state whether the swallow matches on the error
**code** (`name_conflict`) rather than HTTP 409 alone, since other 409s
(`id_conflict`, `would_invalidate`) exist and must **not** be swallowed.

**N-02 — Design §4.10's "`--view` also checks the co-located `.module.css`" is
false; tasks fixed it but don't flag the fix as a design correction.** I confirmed
`design-conformance.ts` `--view` mode checks **only** the single file passed
(`targets = [{ files: [wantView] }]`, line ~133) — it does **not** auto-include
the co-located CSS. The tasks correctly require a **separate** invocation per file
(`.tsx` and `.module.css` each get their own — reading guide + T-14 + validation
table). This is a genuine correction of a wrong design claim; add a one-line note
(like the C-01…N-03 carry-forwards) so the divergence from design §4.10 line 521 /
AC-15 wording is recorded rather than silent.

## Completeness / Traceability

Every AC appears in ≥1 task; every FR/NFR is covered; every task has a
Verification artifact; max files/task = 3 (T-02, T-14) — within cap; dependency
graph is acyclic.

| AC | Covered by | Verification artifact | OK |
|----|-----------|----------------------|----|
| AC-01 | T-02 | `story-labels.integration.test.ts` | ✅ |
| AC-02 | T-02 | `story-edges.integration.test.ts` | ✅ |
| AC-03 | T-05 (+T-03 code, T-08 route) | `story-crud.integration.test.ts` | ✅ |
| AC-04 | T-06, T-08 (clause mapping) | `acceptance-criteria-crud.integration.test.ts` | ✅ |
| AC-05 | T-05 (cascade) | `story-cascade.integration.test.ts` | ✅ |
| AC-06 | T-04, T-06 (parity) | `story-derive-parity.test.ts` (unit, Neo4j-free) | ✅ |
| AC-07 | T-07 | `story-bootstrap.integration.test.ts` | ✅ |
| AC-08 | T-10 | `story-model-scope.integration.test.ts` | ✅ |
| AC-09 | T-11 (authz), T-12 (openapi), T-03 (codes) | `story-authz.test.ts` + `story-openapi.integration.test.ts` | ✅ |
| AC-10 | T-14 | `story-catalog.test.tsx` | ✅ |
| AC-11 | T-14 | `story-detail.test.tsx` | ✅ |
| AC-12 | T-14, T-15 | `story-catalog-states.test.tsx` | ✅ |
| AC-13 | T-14, T-15 | `story-catalog-states.test.tsx` | ✅ |
| AC-14 | T-14, T-15 | `story-catalog-states.test.tsx` (C-03 retry in StoryCatalog) | ✅ |
| AC-15 | T-14 | CLI `design-conformance.ts --view` (×2 files) | ✅ |
| AC-16 | T-14 | `manual:` keyboard walk (input mode + focus outcome) | ✅ |
| AC-17 | T-16 | `story-catalog-context.spec.ts` (playwright) | ✅ |
| AC-18 | cross-cutting sweep | `typecheck` + `git diff` NODE_LABELS/EDGE_ENDPOINTS | ✅ |

**Verified against reality (strengths):**
- `createEdge` (edges.ts:127), `createNodeLabel`/`createEdgeType` both
  `(driver, input, actor)` throwing `name_conflict` on dup — N-01 carry-forward
  is correct.
- No `envelope.test.ts` exists; `ontology-envelope.test.ts` covers the *different*
  `ONTOLOGY_ERROR_CODES`; `openapi.integration.test.ts:101-113` asserts every
  `ERROR_CODES` member appears in the OpenAPI enum (the **opposite** direction of
  a reachability test). Tasks' C-01 reasoning is **correct**; T-12 registering the
  four codes in OpenAPI is what actually satisfies that assertion.
- `scopedNodeIds → Promise<Set<string>>` mixed structural ids — matches the
  `model-workspace-core` design; the activity-join scoping in design §4.1 is
  well-founded (see C-02 for the wording nit).
- `_shared.tsx` exports `Loading`/`ErrorState`; `ErrorState({message})` renders no
  retry — C-03 carry-forward (retry lives in `StoryCatalog`, not `ErrorState`) is
  accurate.
- All catalog components exist; `design-conformance.ts --view` and `tokens.css`
  path (`pwa/src/styles/companygraph/tokens.css`) are real.
- Route/view taken verbatim from the blueprint View Tree (`#/model/stories` →
  `StoryCatalog`); no `route.ts`/`SURFACES` edit (owned by `model-workspace-core`);
  auth via central gate + `ROUTE_PERMISSIONS` (no per-route check) — house rules
  and blueprint honored.

## Verdict

**approve.** Zero blockers. Four concerns and two nits, all wording/bookkeeping
that can be folded into a single light revision or carried as open concerns into
execution without re-review. The task graph is complete, traceable, acyclic, and
grounded in verified real interfaces.
