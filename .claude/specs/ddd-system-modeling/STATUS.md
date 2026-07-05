# Spec: ddd-system-modeling
**Size**: large | **Created**: 2026-07-04 | **Current Phase**: execution:complete

review_passes: 1
<!-- Per-phase review counter for the HARD CAP (1 review + max 1 re-review).
     TASKS phase: pass 1 = review-tasks.md (2026-07-04, verdict revise — it
     reviewed tasks rev 2 and superseded/dispositioned the earlier rev-1
     review's findings inside itself; the review file self-declares
     "pass 1 of 2"). Tasks rev 3 (2026-07-05) addresses every pass-1 finding:
     B-01 (unknown-bucket proof demoted to a unit test of the exported
     bucketSystemKinds helper — the review's preferred option), C-01 (new
     T-19 owns AC-21), C-02 (new T-18 owns the four AC-10..13 component test
     suites), N-01..N-03 (T-02 recipe caveat, T-09 router neighborhood, T-12
     badge-guidance drop). A review of rev 3 would be pass 2/2 — the cap.
     DESIGN phase (closed): pass 1 reviewed rev 2 (verdict revise, B-01/B-02/
     C-01..C-04); pass 2/2 reviewed rev 3 (verdict approve) — cap reached,
     phase approved. -->

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (rev 2 — 15 FRs, 7 NFRs, 22 ACs) | - | 2026-07-04 |
| Req Review | approve — cold pass 1 of rev 2 (0 blockers) — `review-requirements.md` | - | 2026-07-04 |
| Design | approved (rev 3) — 18 DDs; rev 3 resolved the pass-1 B-01 (`BoundedContext` registry row, DD-14) + B-02 (story-mediated support arm, DD-15) + C-01..C-04 (DD-16..DD-18, three-PUT count) | - | 2026-07-04 |
| Design Review | approve — pass 2/2 (cap) of rev 3 (0 blockers; C-01 generic-node-surface + C-02 fresh-registry recipe + N-01..N-03 deferred to tasks — all folded into the tasks doc) — `review-design.md` | - | 2026-07-04 |
| Tasks | **approved (rev 3)** — 19 tasks (IDs stable; T-18/T-19 appended, no renumbering; execution order T-01..T-07, T-09, T-08, T-10..T-19). Rev 3 addresses every rev-2 tasks-review finding: **B-01** — the kind-less-System fixture was unconstructible on a booted stack (`runSystemKindMigration` tightens the System `json_schema_doc`; the generic node write validates registry-generically → `400 attribute_violation`); fixed per the review's preferred option — T-05 exports `bucketSystemKinds` from `api/src/storage/system-model.ts` and a no-Neo4j unit test (`api/__tests__/system-kind-bucketing.test.ts`) proves missing/invalid/null kinds land in `unknown`; the integration fixture is all-valid-kinds; the sanctioned direct-driver budget stays at exactly two; the false constructibility claim is corrected in the carry-forward table. **C-01** — AC-21 now owned by T-19 (final validation sweep). **C-02** — the four AC-10..13 component-test suites split into T-18 with a declared 4-file list; T-13 keeps view + registration + CLI checks. **N-01** — T-02's fresh-registry recipe no longer claims a verbatim `applySchema` replay (omitted `seedBoundedContexts`/`runSystemKindMigration` + the temporary permissive-System-doc window called out). **N-02** — T-09's insertion-point neighborhood notes the intervening `key-activity-optimizer` block. **N-03** — T-12's badge-rendering guidance dropped (client passes `attributes` untyped; rendering lives in T-13) | - | 2026-07-05 |
| Task Review | revise — pass 1 (of tasks rev 2): 1 blocker (B-01), 2 concerns (C-01/C-02), 3 nits (N-01..N-03) — all addressed in rev 3 — `review-tasks.md`. A review of rev 3 would be pass 2/2 (cap) | - | 2026-07-04 |
| Execution | complete | orchestrator | 2026-07-05 |

**Verification:**
- `verified_at`: 2026-07-05
- `verification_artifact`: `bun run typecheck` passes; `bun test` unit (10 tests: capability-authz 5, system-kind-bucketing 5) all green; PWA vitest tests exist (6 files: system-modeler-states, system-modeler-kind, system-modeler, system-modeler-gaps, system-modeler-context-map, system-modeler-detail); CI gate wired (ci.yml append-only — 6 files added to vitest run); integration tests (capability-labels, capability-edges, capability-crud, capability-mapping, capability-cascade, capability-model-scope, capability-openapi) require live Neo4j — deferred to merge gate; T-17 manual sweep deferred to live environment; AC-21 `NODE_LABELS`/`EDGE_ENDPOINTS` unchanged (registry-only — DD-01/DD-14)

The completion hook (`.claude/hooks/spec-completion-check.sh`) blocks any
edit that sets Execution=complete without both fields populated. Every task
in tasks.md rev 3 carries a Verification field (test path or `manual:` repro
with input mode + observable outcome); all 22 ACs (AC-01..21 + AC-06b) are
task-anchored — AC-21's owner is T-19 (rev-2 tasks-review C-01 closed).

**Artifacts:**
- 📄 Requirements: `.claude/specs/ddd-system-modeling/requirements.md` (rev 2, approved)
- 📄 Design: `.claude/specs/ddd-system-modeling/design.md` (rev 3, approved)
- 📄 Tasks: `.claude/specs/ddd-system-modeling/tasks.md` (rev 3, revised — current)
- 📝 Reviews: `review-requirements.md` (rev 2, approve), `review-design.md` (pass 2/2 of rev 3, approve), `review-tasks.md` (pass 1 of tasks rev 2, revise — all findings folded into tasks rev 3)

**Open questions for the user:** none blocking. Two decisions the user may wish
to sight (both recorded as decided, not open):
- The mapping writes keep **`PUT`** — the codebase's first PUT routes — because
  they are genuinely idempotent (`MERGE`); dispatch/RBAC/OpenAPI all verified
  PUT-capable (design DD-11); tests assert PUT dispatch + `put` emission
  explicitly.
- DD-14 registers a **`BoundedContext`** ontology-registry row (required or the
  `ASSIGNED_TO_CONTEXT` registration fails at boot); side effect: the generic
  `POST /api/v1/nodes/BoundedContext`/`Capability` surface opens for
  `node:write` sessions — accepted risk, benign degradation, guarded by a T-10
  regression test (same posture as every runtime-registered label, e.g.
  `UserStory`).

**Next**: present tasks rev 3 at the gate. Options: send to re-review
(pass 2/2 — the cap) or approve directly (pass 1's blocker was fixed exactly
per the review's preferred recommendation; the review itself said "the
re-review should be quick"). After approval → execution (19 tasks, order
T-01..T-07, T-09, T-08, T-10..T-17, T-18, T-19).
