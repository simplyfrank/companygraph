---
feature: "key-activity-optimizer"
reviewing: "design"
reviewing_revision: 4
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-05"
supersedes: "review of the pre-rev-4 design (pass 2, approve, 2026-07-04) — genealogy archived per design §2; its findings are re-verified below"
---

# Review: key-activity-optimizer / design (pass 1/2 — revision 4)

Reviewed cold against `requirements.md` **revision 2** (FR-01…FR-14,
NFR-01…NFR-07, AC-01…AC-17), `blueprint.md` (View Tree `:103`/`:114`, XD-02/03/06/11,
UX-01…UX-06), `.claude/CLAUDE.md`, `.claude/specs/_baseline/`, the dependency
specs (`model-workspace-core`, `story-spec-core`), and the **live codebase**.
Every load-bearing file:line citation in the revision was checked on disk.

## Verdict

**approve** — zero blockers. Revision 4 is a faithful realignment of an
already-executed design to requirements rev 2: every FR/NFR/AC traces to a
design element, every as-built citation sampled is accurate, and the three
declared conformance deltas (Δ1/Δ2/Δ3) are real — I independently confirmed
each in the code. Three concerns are recorded for the tasks phase (chiefly
OQ-A, which needs a user decision before Δ3 work starts); none invalidates
the design as written.

## Prior-review findings — re-verified in this revision

| Prior finding (pre-rev-4 review) | Status |
|----------------------------------|--------|
| ~~C-01~~ unmark via `json<T>` would throw on 204 | **resolved as-built** — `pwa/src/api.ts` `keyActivities.unmark` rides raw `fetch` + `res.ok` (verified, block at `:387ff`); `json<T>` (`:49`) unmodified; §4.11/DD-07 document it and AC-10 mocks at fetch level with a real 204 `Response` |
| ~~C-02~~ multi-journey-parent activity fans into duplicate rows | **resolved as-built** — journey aggregated in the read (`api/src/storage/key-activities.ts:87`, deterministic lowest-`j.id` pick `:97-100`); scorer de-dupes by id defensively (`key-activity-score.ts:187-193`); unit case named in §8 AC-05 |
| ~~N-02~~ idempotent unmark still bumped `updatedAt` | **resolved as-built** — true no-op: `mutate` returns `null`, statement 2 skipped (`key-activities.ts:306-311`, `lockFirstMergeWrite:246`) |
| ~~N-03~~ finding-ID genealogy sprawl | **resolved** — §2 keeps standing decisions only; genealogy archived to STATUS.md |

## Blockers

None.

## Concerns

- **C-01 — OQ-A is a live requirements-vs-approved-prior-design conflict that
  the design cannot close on its own; it must be answered before any Δ3 work
  executes.** The design correctly follows the approved requirements rev 2
  (FR-12: catalog `DataTable` extended additively; "inventing a non-catalog
  table is not an option") via DD-11, and correctly flags that the
  user-approved prior design (DD-10) and the shipped
  `KeyActivityBoard.tsx:271-340` inline `<table>` (verified on disk — the
  sort headers are authored in-view) contradict it. Both artifacts carry user
  approval, so the design's default (refactor the shipped view) is the right
  *traceability* call but not automatically the right *product* call.
  **Recommendation:** the orchestrator surfaces OQ-A to the user before
  tasks-phase execution of the three Δ3 rows (`DataTable.tsx`,
  `DataTable.module.css`, the `KeyActivityBoard` refactor). If the in-view
  table is blessed instead, FR-12's catalog-gap clause gets a one-line
  amendment and DD-11/Δ3 are struck — the two artifacts must not be left
  contradicting each other either way. Tasks.md should gate the Δ3 tasks on
  this decision explicitly.

- **C-02 — DD-11's `getRowKey` prop as typed cannot recover the activity id;
  §4.10's `getRowKey={row.id}` is not implementable against the declared
  signature.** The new prop is
  `getRowKey?: (row: Record<string, ReactNode>, i: number) => string`, but the
  `rows` the view hands `DataTable` are cell-ReactNode records (rank/name
  cells are formatted strings/buttons) — nothing in the declared shape
  guarantees a raw `id` is present, and `Record<string, ReactNode>` values
  are not `string`-typed. The design's own usage note ("passes …
  `getRowKey={row.id}` down") reads as passing a value, not a function.
  **Recommendation (tasks-phase, small):** pin the mechanism in the DD-11
  prop contract — e.g. state that the view includes a non-column
  `id: string` entry in each row record (legal: `string` is a `ReactNode`;
  no `Column` with id `"id"` means it never renders) and passes
  `getRowKey={(r) => String(r.id)}`, or generify `DataTable<Row extends
  Record<string, ReactNode>>`. Otherwise the Δ3 refactor trips on exactly
  this seam.

- **C-03 — Δ2's fix statement interacts with the DFS's second coverage loop;
  the fix must not regress cycle/coverage behavior.** §4.3 specs "only DFS
  paths of ≥ 2 nodes contribute to `longestThrough`". In the as-built DFS
  (`key-activity-score.ts:145-155`) the second loop re-roots from every node
  with no `longestThrough` entry — after the fix, **isolated nodes never gain
  an entry**, so that loop's guard no longer marks them visited (harmless
  re-DFS cost, but worth knowing), and if the fix is implemented inside
  `recordPath` it must not stop counting length-1 terminations against
  `PATH_BUDGET` inconsistently between the two loops.
  **Recommendation:** implement the fix as a guard in `recordPath` (`if
  (path.length >= 2)` around the `best`/`longestThrough` updates only, leaving
  `pathCount` semantics stated), and add the §8 AC-03 Δ2 unit case *plus* a
  case with an isolated node **and** a cycle-only component in the same model
  so the coverage loop is exercised post-fix.

## Nits

- **N-01** — FR-04's requirements text ("summed over all model-scoped
  predecessors, plus the same over successors") literally counts a mutual
  `a↔b` disjoint pair **twice** per side; the design (§4.4) and as-built code
  (`key-activity-score.ts:239-244`, neighbor `Set`) count it **once**
  (distinct-neighbor reading, pinned by a prior review). The design's reading
  is the sensible one; fix the FR-04 wording opportunistically if
  requirements are ever revised — do not change the code to match the letter.
- **N-02** — `markActivity` runs the `getModel` gate twice per mark
  (`gateScopedActivity:196` and again inside
  `computeScores → readModelSubgraph:63`); the scoped set is threaded but the
  model read is not. Harmless at single-model scale (NFR-05); an
  `opts.skipGate` would remove it if the per-mark recompute is ever narrowed.
- **N-03** — DD-05 cites `api/src/ontology/cache/attribute-zod.ts:57-72` for
  the "unlisted keys pass" claim; those lines show `compileToZod`
  (the mechanism), not an explicit permissiveness assertion. The claim itself
  is correct (no `additionalProperties:false` in the compiled default) and is
  pinned by the DD-04 import round-trip test, but the citation is indirect.
- **N-04** — requirements FR-01 floats `api/src/storage/key-activity-scope.ts`
  as a possible home; the design (rightly) consolidates into
  `api/src/storage/key-activities.ts`. Covered by FR-01's "(…or the score
  module directly)" hedge; no action, noted for grep-hygiene.

## Traceability check

| Check | Result |
|-------|--------|
| Every FR reaches design file-changes / a task | **pass** — see FR table below; every §7 row names its FR, no orphan file change |
| Every AC is closed by a test artifact in §8 | **pass** — AC-01…AC-17 all mapped; AC-15 is `manual:` with input mode + observable outcomes; all cited test files exist on disk |
| Routes/views match the blueprint View Tree verbatim | **pass** — `#/model/key-activities` → `KeyActivityBoard` (blueprint `:103`/`:114`); no route invented/renamed; no `route.ts`/`SURFACES` edit |
| UX-* allowances covered (pwa/ work) | **pass** — UX-01 four states (§4.10); UX-02 tokens + catalog-first (DD-11 makes the table catalog-based); UX-03 n/a recorded with populated tables in requirements; UX-04 no new breakpoints; UX-05 `aria-sort` + keyboard map + reused Modal focus trap; UX-06 deep link + reload (FR-14/AC-16) |
| XD-* cross-cutting decisions honoured | **pass** — XD-03 (attribute + evidence, no new label — DD-05, §9); XD-11 (descriptive only, no suggestion field — §3.3, NFR-04); XD-02 (Neo4j only, no new store — §3); XD-06 (model-scoped via `scopedNodeIds` — DD-02) |
| No file ownership conflict with another spec | **pass** — `views/index.tsx` dispatch-swap only (the `stories` precedent); `seed-rbac-roles.ts` is a declared additive coordination hotspot; `DataTable.tsx` has no other spec claiming an edit; `route.ts`, `model-scope.ts`, `nodes.ts`, `json<T>` all listed Not-edited and verified untouched by this surface |

### FR/NFR → design coverage (verified against code where as-built)

| Req | Design element | Verified |
|-----|----------------|----------|
| FR-01 | §4.2 read; `getModel` gate first (`key-activities.ts:63`), `scopedNodeIds` consumed not re-implemented (`:64`) | ✓ on disk |
| FR-02 | §4.3 betweenness via `buildGraphologyGraph` (`analytics/graph.ts:42-43`, engine call shape `:131`), normalize + all-zero guard, evidence | ✓ on disk (`key-activity-score.ts:209-227,266-269`) |
| FR-03 | §4.3 DFS 20 nodes/1000/4 s (`:50-52`), `hasCycle`, truncation, ≥2-node chain rule; **Δ2 gap honestly declared** (`recordPath:96-102` records length-1 paths — confirmed) | ✓ delta confirmed |
| FR-04 | §4.4 distinct-neighbor handoffs; **Δ1 gap honestly declared** (`disjoint():174-177` lacks non-empty guard — confirmed) | ✓ delta confirmed |
| FR-05 | §4.3 composite, weights {1,1,1} (`DEFAULT_WEIGHTS:55`), tie `createdAt`→`id` with `"~"` sentinel (`:305-313`) | ✓ on disk |
| FR-06 | §4.7/§5/§3.3/§4.9; empty model → 200 `rows:[]` (handler comment + storage gate) | ✓ on disk |
| FR-07 | §4.5 `markActivity` — gate sequencing, server-computed snapshot (`:280-285`), lock-first write | ✓ on disk |
| FR-08 | §4.5 `unmarkActivity` — 204, true no-op (`:306-311`) | ✓ on disk |
| FR-09 | §4.5 bespoke lock-first read-merge-write; generic primitives untouched (`nodes.ts` patch/upsert semantics verified `:178-198`, `:243-252`) | ✓ on disk |
| FR-10 | §3.4/§4.9 — `activity_not_found` only addition (`errors.ts:64`), `model_not_found` reused (`:37`), 3 OpenAPI paths (`openapi.ts:836-858`), reachability anchored in this spec's own test | ✓ on disk |
| FR-11 | §4.8 — 3 `ROUTE_PERMISSIONS` rows (`rbac-permissions.ts:301-303`), `business_architect` grants (`seed-rbac-roles.ts:120-121`), central gate only, no public route | ✓ on disk |
| FR-12 | §4.10/§6, DD-11 catalog `DataTable` extension; **Δ3 gap honestly declared** (`KeyActivityBoard.tsx:271-340` inline table, `DataTable.tsx` verified static `{columns, rows}`) | ✓ delta confirmed (C-01/C-02 apply) |
| FR-13 | §4.10 toggle (optimistic, rollback-on-rejection) + evidence Modal; §4.11 client (unmark raw fetch, DD-07) | ✓ on disk |
| FR-14 | §4.10 fetch keyed on `activeModel.id` (`useActiveModel` verified `ActiveModelContext.tsx:121`) | ✓ |
| NFR-01 | DD-02 + §4.2 — scoped Activity set + intra-scope PRECEDES; shared Role/System unfiltered (matches `model-scope.ts:22-33` structural-ids-only Cypher) | ✓ |
| NFR-02 | §3, DD-05, §7 Not-edited; AC-17 diff guard | ✓ |
| NFR-03 | §4.5 siblings-as-of-unmark-time invariant (rev-2 wording adopted verbatim) | ✓ |
| NFR-04 | deterministic tiebreak + traversal sort (`key-activity-score.ts:82`), no suggestion field (§3.3 + schema comment) | ✓ |
| NFR-05 | §4.3 caps, §4.5 per-mark cost note, client-side sort no re-fetch | ✓ |
| NFR-06 | central-gate auth (§4.8, route file carries no auth code — verified), zod-only, `/api/v1/`, en-US camelCase (DD-06), no tsc | ✓ |
| NFR-07 | §6 tokens-only + AC-14 (`design-conformance.ts --view` flag verified `:125-127`) | ✓ |

### AC → §8 test coverage

| AC | Artifact | Status |
|----|----------|--------|
| AC-01…05 | scores/centrality/critical-path/handoff integration + Neo4j-free `key-activity-score.test.ts`; Δ1/Δ2 cases named per-file | covered — all files exist |
| AC-06/07 | `key-activity-mark.integration.test.ts` (sibling preservation, true no-op, re-mark fresh snapshot) | covered |
| AC-08 | two-file split (scope-authz + openapi) — both exist; `activity_not_found` enum + real-request assertion | covered |
| AC-09/10 | board + detail component tests; Δ3 note retargets assertions to extended-`DataTable` markup; fetch-level 204 mock pinned | covered |
| AC-11/12/13 | `key-activity-board-states.test.tsx` — empty keyed on `200 rows:[]`, error = `ErrorState` + sibling retry, truncation banner | covered |
| AC-14 | design-conformance CLI on the view (+ tokens-only `DataTable` edit) | covered |
| AC-15 | manual keyboard walk — input mode + observable outcomes stated | covered |
| AC-16 | `pwa/playwright/key-activity-board-context.spec.ts` — exists | covered |
| AC-17 | typecheck + schema-array `git diff` | covered |
| DD-04/risk 7 | `key-activity-import.integration.test.ts` — exists; pins permissive-schema assumption | covered (extra, good) |

## Summary

- **Solid:** the revision does the hard, honest thing — instead of quietly
  blessing the as-built code, it diffs it against requirements rev 2 and
  declares exactly three conformance deltas, each of which I independently
  confirmed in the source (Δ1 empty-set handoffs, Δ2 length-1 chains, Δ3
  non-catalog table). Every sampled file:line citation is accurate, the
  lock-first write and 404 gate sequencing match the dependency's own
  patterns, and blueprint/XD/UX conformance is airtight.
- **Common thread of the findings:** all three concerns sit at the Δ3 seam —
  the one part of the design not yet in code. C-01 (OQ-A) decides *whether*
  Δ3 happens; C-02 pins *how* its one new prop works; C-03 keeps Δ2's fix
  from disturbing the DFS coverage loop.
- **Do first:** surface OQ-A to the user (C-01) before cutting Δ3 tasks;
  then bind C-02/C-03 as explicit task notes with the named unit cases.
  Δ1/Δ2 are small, well-fixtured fixes and can proceed regardless of OQ-A.
- Approved with the three concerns recorded for the tasks phase; no design
  re-revision needed within the review cap.
