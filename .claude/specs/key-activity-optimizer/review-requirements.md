---
feature: "key-activity-optimizer"
reviewing: "requirements"
reviewing_revision: 1
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-04"
---

# Review: key-activity-optimizer / requirements (pass 1/2)

## Verdict

**approve** — zero blockers. Requirements are measurable, every FR/AC/NFR is
traceable in both directions, upstream interfaces cited (`scopedNodeIds`,
cto-analytics FR-06 critical-path contract, `business_architect` RBAC role,
graph-core `patchNode` semantics) were verified against the dependency specs and
the on-disk code and hold. The three concerns are design-phase carry-forwards,
not requirements defects.

## Blockers

none.

## Concerns

- **C-01 — `scopedNodeIds` returns *structural* nodes only; the handoff score's
  role/system reads are correct but the spec never says so explicitly.** FR-04
  computes handoffs from "disjoint executing-role sets" and "disjoint used-system
  sets", and FR-01 says it reads `EXECUTES` (Role→Activity) and `USES_SYSTEM`
  (Activity→System). Verified in `model-workspace-core/design.md` §4.2:
  `scopedNodeIds(driver, modelId)` returns **only** Domain/journey/activity/
  ModuleInstance ids and *explicitly excludes* shared `System`/`Role`/`Location`
  (DEC-01 (a) — shared reference nodes). This is *consistent* — a scoped
  activity's own `EXECUTES`/`USES_SYSTEM` edges to shared Role/System nodes are
  still reachable, and FR-01 already excludes cross-scope `PRECEDES`, so handoff
  only ever compares two in-scope activities' role/system sets. But the spec
  frames `scopedNodeIds` as if it also bounds the role/system reads ("Scoring
  never reads … a `PRECEDES`/`EXECUTES`/`USES_SYSTEM` edge outside the model's
  scoped set", NFR-01). Since Role/System are *not* in the scoped set,
  literal-reading NFR-01 would exclude every `EXECUTES`/`USES_SYSTEM` edge (they
  land on out-of-set nodes) and zero out all handoffs. **Resolution:** the design
  must state that model-scoping bounds the **Activity** set (and the `PRECEDES`
  edges between two scoped activities), while each scoped activity's `EXECUTES`/
  `USES_SYSTEM` edges to *shared* Role/System nodes are read unconditionally.
  Reword NFR-01 in design (or an FR-01 clarification) so it doesn't read as
  "exclude any edge whose endpoint is outside `scopedNodeIds`".

- **C-02 — OQ-3 (centrality primitive) is still genuinely open, not a decided
  default.** FR-02 hard-codes **betweenness**, but Risk #3 flags "Decision needed
  (default: betweenness)" and recommends confirming with the user, and notes
  degree/pagerank are trivially swappable (all three are already vendored:
  `graphology-metrics/centrality/{betweenness,degree,pagerank}`, verified in
  `api/src/ontology/analytics/graph.ts:10-12`). This is fine to carry forward as a
  design-basis default, but the orchestrator should surface OQ-3 before design
  locks — unlike OQ-1/OQ-2 (both anchored on cto-analytics precedents), OQ-3 has
  no upstream precedent forcing the choice. Recommend the design either confirm
  betweenness or expose all three as separate reported columns (cheap; the sub-
  score evidence panel already itemises "raw betweenness / in-out degree").

- **C-03 — `keyActivity` mark round-trips through export/import, but the reference
  fixture / seed does not yet carry it; import-clobber interaction unspecified.**
  FR-07/FR-09/NFR-02 correctly place `keyActivity` inside the open `attributes`
  map so it survives graph-core export/import. But nothing states what happens
  when `POST /api/v1/import` (the `upsertNode` path, which *replaces* the whole
  attributes map) re-imports an activity — a re-import from a snapshot taken
  before a mark would silently drop the mark, and a re-import from a snapshot
  taken after would restore a possibly-stale `scoreSnapshot`/`rank`. Risk #5
  covers *graph-edit* staleness by design, but not the *import overwrite* path.
  Recommend the design add one sentence on import interaction (expected: import is
  authoritative and carries whatever `keyActivity` the snapshot holds — consistent
  with `upsertNode` being the import/seed-only primitive) and, if a fresh
  retail-Model-#1 fixture is needed for the PWA/integration tests, name it.

## Nits

- **N-01 — camelCase vs snake_case truncation fields diverge from the cited
  cto-analytics contract.** FR-03 uses `hasCycle` / `truncationReason` /
  `truncated`; cto-analytics FR-06 (the contract FR-03 says it "reuses … exact")
  uses `has_cycle` / `truncation_reason` / `longest_partial`. This is a
  *re-implementation over a different subgraph*, not shared code, and en-US
  camelCase identifiers are the house convention, so the divergence is defensible
  — but call it out in design so a reader doesn't expect byte-identical response
  shapes across the two analytics surfaces.

- **N-02 — `pwa/src/api.ts` `json<T>()` is not exported.** The Dependencies list
  cites "`pwa/src/api.ts` `json<T>()` wrapper"; verified `json<T>` at
  `pwa/src/api.ts:40` is a *private* helper wrapped by exported `api.*` methods.
  KeyActivityBoard should call (or add) an exported `api.*` method, not `json<T>`
  directly. Design detail only.

- **N-03 — N-01(design item) in the spec's own Risk table already pre-empts the
  scoring-module home question** (`api/src/storage/key-activities.ts` vs a pure
  `api/src/derive/key-activity-score.ts`). Verified `api/src/derive/` does not yet
  exist; story-spec-core's `api/src/derive/story-derive.ts` precedent the spec
  cites is the right pattern for the Neo4j-free math to stay unit-testable. No
  action for requirements; recorded so design closes it.

## Traceability check

| Check | Result |
|-------|--------|
| Every FR reaches an AC | pass — FR-01→AC-01/02, FR-02→AC-02, FR-03→AC-03, FR-04→AC-04, FR-05→AC-05, FR-06→AC-01, FR-07→AC-06, FR-08→AC-07, FR-09→AC-06, FR-10→AC-06/08, FR-11→AC-08, FR-12→AC-09/11/12/13/14, FR-13→AC-10/15, FR-14→AC-09/16; NFR-01→AC-08, NFR-02→AC-06/17, NFR-03→AC-07, NFR-04→AC-05, NFR-06→AC-17, NFR-07→AC-14 |
| Every AC traces to ≥1 FR | pass — each of AC-01..AC-17 cites its FR/NFR sources; Platforms + Verification columns populated for all 17 |
| Routes/views match the blueprint View Tree verbatim | pass — `#/model/key-activities` → `KeyActivityBoard` taken verbatim (blueprint line 84/95); replaces `model-workspace-core`'s `ModelTabPlaceholder` (FR-17), does not touch `route.ts` (correctly owned by model-workspace-core) |
| UX-* allowances covered in ACs (pwa/ spec) | pass — UX-01 four states AC-09..AC-13; UX-02 AC-14; UX-03 n/a table + Platforms/Native-Conflicts tables populated; UX-04 NFR-07; UX-05 AC-15; UX-06 AC-16 |
| XD-* cross-cutting decisions honoured | pass — XD-11 descriptive-only (NFR-04, no recommendation field, AC-05); XD-03 attribute-not-label + reversible (FR-07/08/09, NFR-02/03, AC-06/07/17); XD-06 model scoping (NFR-01); XD-02 no new store (NFR-02) |
| No file ownership conflict with another spec | pass — writes new `api/src/storage/key-activities.ts`, `KeyActivityBoard.tsx`; consumes (does not edit) `route.ts`, `model-scope.ts`, `ActiveModelContext.tsx`, generic `nodes.ts` primitives; *adds* to shared multi-owner files (`rbac-permissions.ts` ROUTE_PERMISSIONS, `seed-rbac-roles.ts` business_architect grant, `errors.ts` ERROR_CODES) additively — consistent with model-workspace-core FR-11/FR-12/FR-13 which own the base entries |

## Verified-against-reality notes

- `scopedNodeIds(driver, modelId): Promise<Set<string>>` — signature confirmed in
  `model-workspace-core/design.md:366` (requirements FR-18 said `scopedNodeIds(modelId)`;
  design is authoritative and matches this spec's `(driver, modelId)` usage).
- cto-analytics FR-06 critical-path caps (depth 20 / 1000 paths / 4 s) +
  `{has_cycle, truncated, longest_partial, truncation_reason}` — confirmed
  (`cto-analytics/requirements.md` FR-06); FR-03 reuse is faithful.
- `buildGraphologyGraph(nodes, edges)` accepts an arbitrary node/edge list
  (`api/src/ontology/analytics/graph.ts:102`) — FR-02's "reuse if it accepts an
  arbitrary node/edge list" is satisfiable.
- `patchNode` runs `assertAttributesMatchSchema` and rewrites `attributes_json`
  wholesale (`api/src/storage/nodes.ts:78,117,181,229`) — confirms the C-01
  clobber risk FR-09 mitigates is real; the dedicated read-merge-write approach is
  the correct avoidance.
- `ROUTE_PERMISSIONS` uses `P(method, path, permission)` with specific-before-
  parameterized ordering and a real `"public"` string (`api/src/auth/rbac-permissions.ts:11-25`);
  `seed-rbac-roles.ts` uses idempotent `MERGE (r:RBACRole {name})` (line 104) —
  FR-11's mechanics are feasible; `business_architect` is added by model-workspace-core FR-11.
- `ERROR_CODES` is a closed `as const` with a reachability comment
  (`api/src/errors.ts:2-4`) — FR-10's "additive, reachable" claim is enforceable.
- retail-mini seed is ~60 nodes — supports NFR-05's "live, no cache" at single-model scale.

## Summary

- Solid, unusually complete requirements: 14 FRs, 7 NFRs, 17 ACs with two-way
  traceability, populated Platforms/Native-Conflicts tables, and cross-cutting
  decisions (XD-03/XD-06/XD-11) honoured with cited mechanisms. Upstream
  interface claims survived verification against the dependency specs *and* the
  on-disk code.
- The three concerns share one root: they are the seams where this per-model
  descriptive surface meets shared/global machinery (shared Role/System reference
  nodes → C-01; centrality-primitive choice → C-02; export/import overwrite of the
  `keyActivity` mark → C-03). All three are design-phase clarifications, none
  reopens the requirements direction.
- Design should do first: (1) reword NFR-01 so it bounds the Activity set and the
  intra-scope `PRECEDES` edges, while allowing unconditional reads of a scoped
  activity's `EXECUTES`/`USES_SYSTEM` edges to shared Role/System (C-01); (2)
  confirm or column-ise the centrality primitive (C-02); (3) state the
  import-overwrite behavior of the `keyActivity` mark (C-03).
</content>
