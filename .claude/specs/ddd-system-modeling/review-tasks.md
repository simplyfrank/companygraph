---
feature: "ddd-system-modeling"
reviewing: "tasks"
artifact: "tasks.md (rev 1 — 2026-07-04, traces requirements rev 2 + design rev 1)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-04"
review_pass: "1 of 2"
---

# Tasks Review: ddd-system-modeling

Reviewed cold against the approved `requirements.md` (rev 2), `design.md` (rev 1),
`review-design.md` (approve; C-01..C-03, N-01..N-03), `.claude/CLAUDE.md` house
rules, and the on-disk codebase. I verified every load-bearing claim about
dependency-owned symbols and the design-review carry-forwards against the real
files.

## Summary

This is a disciplined, traceable task breakdown. All 22 ACs (AC-01..21 + AC-06b)
map to at least one task; every task carries a concrete verification artifact
(test path or `manual:` repro with input mode + observable outcome); no task
touches more than 3 files; and the three design-review concerns (C-01/C-02/C-03)
plus three nits (N-01/N-02/N-03) are each landed as a **binding, task-anchored
decision** in the carry-forward table rather than left for the executor to
re-derive. The dependency graph is acyclic (topological sort succeeds) and the
top-to-bottom execution order respects every real `Blocked by`.

I confirmed the highest-risk claims against reality:

- **C-01 carry-forward verified.** `getEdgeEndpoints(type, driverOverride?)` **is
  exported** (`api/src/ontology/cache/edge-endpoints.ts:53`), and `validateEdge`
  is module-private in `api/src/storage/edges.ts`. T-04's decision to call the
  exported `getEdgeEndpoints` for the MERGE-path endpoint check and leave
  `edges.ts` unedited is correct and implementable.
- **Registry actor arg verified.** `createNodeLabel` (`node-labels.ts:129`) and
  `createEdgeType` (`edge-types.ts:209`) both take a third `actor: string` arg;
  T-02's "pass the required `actor` arg to every registry call" is a real
  requirement `register-model-labels.ts` also satisfies (`ACTOR` constant).
- **DD-01 verified.** `LIFECYCLE_EDGES` contains `IN_MODEL` and **not**
  `CAPABILITY_IN_MODEL` (`model-lifecycle-guard.ts:25-26`); T-02's own membership
  edge never trips the lifecycle guard.
- **Reused error codes verified.** `model_not_found`, `not_found`,
  `edge_endpoint_label_mismatch`, `invalid_payload` are all present in
  `ERROR_CODES` (`api/src/errors.ts`); `capability_not_found`,
  `bounded_context_not_found`, `system_not_found` are absent — so T-03's three
  additive codes are genuinely additive.
- **Build-order precondition is honest.** `register-story-labels.ts`,
  `pwa/src/context/ActiveModelContext.tsx`, and `pwa/src/views/model/` are
  **absent** on disk (owned by unmerged `story-spec-core`/`model-workspace-core`);
  `model-scope.ts`, `models.ts`, `system-kind.ts` are **present**. The current
  `seed-rbac-roles.ts` has **no** `business_architect` role, exactly matching
  T-08's statement that it *modifies* a role a dependency creates. The
  precondition block ("T-01 must not start until `story-spec-core` has merged") is
  accurate wave-3 sequencing, not missing scope.
- **Router fall-through verified.** The `models*` block
  (`router.ts:394-396`) delegates to `registerModelRoutes` and falls through on
  `null` (`if (res) return res;`), so T-09's sibling `registerCapabilityRoutes`
  block after it is a real, workable insertion point (design cited line 389; the
  block is at 394 — same mechanism, off-by-a-few-lines only).
- **`_helpers.ts` exports verified.** `ok`/`noContent`/`error`/`parseWith`/
  `fromValidationError` are all exported; T-09's envelope helpers exist.

No blockers. Verdict: **approve** with concerns to fold in at execution time.

## Findings

### Blockers

None.

### Concerns

**C-01 — `Blocks` / `Blocked by` fields are not symmetric; several edges are
listed in one direction only.** A dependency-graph audit found eleven asymmetries
between the two fields (the graph is still acyclic and the execution order still
honours every `Blocked by`, so nothing mis-executes — but the bookkeeping is
misleading and can trip an executor who trusts the wrong field). Concretely:

- **T-03 (Additive error codes)** lists `Blocked by: —`, yet **T-01 and T-02 both
  list T-03 in their `Blocks`**. T-03 edits only `api/src/errors.ts` and has no
  real dependency on the zod schemas (T-01) or label registration (T-02). The
  spurious edges are T-01/T-02's `Blocks: T-03`.
- **T-10 (isolation test)** lists `Blocks: T-11`, but **T-11 (`Blocked by: T-01,
  T-03, T-08, T-09`) does not list T-10**. T-11 (OpenAPI registration) does not
  depend on a test task; T-10's `Blocks: T-11` is spurious.
- **T-01 `Blocks` T-09/T-13**, **T-02 `Blocks` T-06**, **T-03 `Blocks` T-05/T-06**
  — the named successors' `Blocked by` omit these because the dependency is
  transitive (e.g. T-13←T-12←T-01). Redundant-but-not-wrong direct edges.
- **T-04, T-13, T-01** omit T-07/T-17/T-12 respectively from their `Blocks`,
  though those successors correctly list them in `Blocked by`.

*Recommendation:* treat `Blocked by` as the authoritative field (it is internally
consistent and drives the topo order) and reconcile `Blocks` to be its exact
inverse — specifically remove `T-03` from T-01/T-02's `Blocks`, remove `T-11`
from T-10's `Blocks`, and add the four missing inverse edges (T-04→T-07,
T-13→T-17, T-01→T-12). No re-review needed; a one-pass edit at execution.

**C-02 — AC-06 augmentation-mix verification undersells the `unknown` bucket that
N-02 made load-bearing.** T-05 (and T-01's `gapsResultSchema`) now include the
`unknown` mix bucket as a **schema-present** key (N-02 carry-forward), and T-01's
verification asserts the schema *accepts* a fixture "incl. the `unknown` mix
bucket." But the AC-07 integration test in T-05 only asserts
`{functional:2, agentic:1, ai_predictive:1}` — it never seeds a system with a
missing/invalid `systemKind` to prove the `unknown` bucket actually **populates**
at the aggregate layer (only the zod schema round-trip in T-01 touches it). Since
N-02 is explicitly "defensive only (a pre-migration system with a missing/invalid
`systemKind`)" and no AC gates it, this is a concern not a blocker.
*Recommendation:* add one seed system with an absent `systemKind` to the T-05
`system-gap-analysis` fixture and assert `augmentationMix.model.unknown >= 1`, so
the defensive path has a regression guard co-located with the code that computes
it (rather than only in the schema-parse test).

**C-03 — T-08 is `Blocked by: T-09`, but T-08's own note says the two are
partly parallel — the ordering is slightly self-contradictory and risks a stall.**
T-08 (`Blocked by: T-09`) states its RBAC `P(...)` rows "can be authored from
design §4.8 in parallel [with T-09] but must be reconciled against T-09's final
path literals," while T-09 (`Blocked by: T-04,T-05,T-06`, `Blocks: T-08`) is a
`complex` route-handler task. Making the whole of T-08 hard-blocked on the whole
of T-09 is defensible (the route strings must match), but the security-critical
property T-08 guards — *every* new route has a `ROUTE_PERMISSIONS` row, or an
unmapped route silently skips the RBAC check (open write) — means the two must be
kept in lockstep. As written this is fine; flagging so the executor does not
author T-08's rows against design §4.8 and forget to reconcile against T-09's
final regex literals (a drift here is a silent-open-write, not a test failure,
because an *unmapped* route returns `getRoutePermission null` → the gate skips).
*Recommendation:* keep the hard block, but add to T-08's verification an explicit
assertion that iterates the T-09 dispatch route set and asserts
`getRoutePermission` is non-null for **each** — the tasks already state this
("`getRoutePermission` resolves **every** new route (never null)"); make it a
table-driven check over the exact literal list, not a hand-enumerated subset.

### Nits

**N-01 — `bun run typecheck` / `register:capability` script path unverified in
tasks.** T-02 adds a `register:capability` script "mirroring
`register:model`"; on disk `package.json` has `register:model` at line 17
(`bun --cwd api src/scripts/register-model-labels.ts`) but the tasks' validation
checkpoints reference `bun run typecheck` throughout. Both are consistent with the
existing repo; no action — just confirming the pattern exists.

**N-02 — T-13 packs four ACs (AC-10/11/12/13) + AC-17/AC-20 CLI halves into one
`complex` view task across 3 files.** Within the file-count rule and the `complex`
budget, and the four test files are separately named, but this is the single
largest task. No split required (the panels share one component); flagging that it
is the most likely to overrun the half-day `complex` ceiling.

**N-03 — `detached` fixture (C-02 design carry-forward) uses the one sanctioned
direct-driver test write.** T-04's `capability-detached.test.ts` removes a
`BoundedContext` label via `REMOVE n:BoundedContext` "the sole allowed test-only
direct-driver write." Correctly fenced and unit-scoped; noted as done-well (it
makes the otherwise-unconstructible detached state testable per design C-02(b)).

## Completeness / Traceability

Every AC maps to at least one task with a concrete verification artifact; every
FR/NFR has task coverage. Verified against the codebase where load-bearing.

| AC | Task(s) | Verification artifact | Status |
|----|---------|-----------------------|--------|
| AC-01 | T-02 | `capability-labels.integration.test.ts` | covered |
| AC-02 | T-02 | `capability-edges.integration.test.ts` (incl. no `IN_MODEL` pair — B-01) | covered |
| AC-03 | T-04 | `capability-crud.integration.test.ts` | covered |
| AC-04 | T-04 | `capability-mapping.integration.test.ts` | covered |
| AC-05 | T-07 | `capability-cascade.integration.test.ts` | covered |
| AC-06 | T-05 | `system-gap-analysis.integration.test.ts` | covered — see **C-02** on `unknown` |
| AC-06b | T-10 | `capability-model-scope.integration.test.ts` | covered |
| AC-07 | T-05 | `system-gap-analysis.integration.test.ts` | covered — see **C-02** |
| AC-08 | T-06 | `context-map.integration.test.ts` (targetId — C-01) | covered |
| AC-09 | T-08, T-10, T-11 | `capability-authz.test.ts` + `capability-model-scope` + `capability-openapi` | covered |
| AC-10 | T-13 | `system-modeler.test.tsx` | covered |
| AC-11 | T-13 | `system-modeler-gaps.test.tsx` | covered |
| AC-12 | T-13 | `system-modeler-context-map.test.tsx` | covered |
| AC-13 | T-04 (detached), T-13/T-14 (indicator) | `system-modeler-detail.test.tsx` + `capability-detached.test.ts` | covered (C-02 design decoupled) |
| AC-14/15/16 | T-14 | `system-modeler-states.test.tsx` | covered |
| AC-17 | T-13 | CLI `design-conformance.ts --view` (.tsx + .module.css) | covered |
| AC-18 | T-17 | `manual:` keyboard walk | covered |
| AC-19 | T-16 | `system-modeler-context.spec.ts` (playwright) | covered |
| AC-20 | T-13 (CLI), T-15 (component) | `system-modeler-kind.test.tsx` + CLI grep | covered |
| AC-21 | cross-cutting §"AC-21" | `bun run typecheck` + `git diff` NODE_LABELS/EDGE_ENDPOINTS | covered |

**FR coverage:** FR-01..FR-15 and NFR-01..NFR-07 each map to tasks in the
Traceability summary table (lines 647-671); spot-checked FR-06 (T-04 detached /
T-07 cascade / T-13-14 indicator), FR-11 (T-08), FR-15 (T-12/T-13/T-15) — all
land on real files.

**Done well:**
- The design-review carry-forward table (C-01..C-03, N-01..N-03) converts every
  open concern into a *binding* task decision with the exact task anchored, so the
  executor does not re-open a settled interface question. C-01's resolution
  (exported `getEdgeEndpoints`, `edges.ts` untouched) is verified correct against
  the real export.
- The Deviations table (AC-17/AC-20 `manual:` → CLI with deterministic exit codes,
  §3.1 table-hygiene errata) is an honest record that keeps the AC IDs stable
  while acknowledging the requirements phrased them as `manual:`.
- The build-order precondition names exactly which dependency files are
  present-vs-absent on disk; I verified each and it is accurate.
- Every PWA-view-touching task correctly invokes `design-conformance.ts` per file
  (`.tsx` and `.module.css` separately), matching the reading-guide rule.

## Verdict

**approve** — zero blockers. Fold C-01 (make `Blocks` the exact inverse of the
authoritative `Blocked by` — remove the two spurious edges T-01/T-02→T-03 and
T-10→T-11, add the three missing inverse edges), C-02 (seed one missing-`systemKind`
system in the T-05 fixture and assert the `unknown` bucket populates), and C-03
(make T-08's "every route resolves a permission" check table-driven over T-09's
exact literal set) into execution. No re-review of tasks required; the executor
should confirm C-01's dependency-field reconciliation and C-03's exhaustive
route-permission assertion landed.
