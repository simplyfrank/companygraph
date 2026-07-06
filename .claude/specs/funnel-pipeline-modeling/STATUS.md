# Spec: funnel-pipeline-modeling
**Size**: large | **Created**: 2026-07-06 | **Current Phase**: tasks:draft

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | revised (rev 2) | - | 2026-07-06 |
| Req Review | revise (1 blocker: B-03) | - | 2026-07-06 |
| Design | approved (rev 1) | - | 2026-07-06 |
| Design Review | approve (0 blockers, 4 concerns) | - | 2026-07-06 |
| Tasks | draft (13 tasks) | - | 2026-07-06 |
| Task Review | pending | - | - |
| Execution | not started | - | - |

**review_passes**: 0

**Verification:**
- `verified_at`: —  ← required when Execution is `complete`
- `verification_artifact`: —  ← required when Execution is `complete`

**Artifacts:**
- 📄 Requirements: `.claude/specs/funnel-pipeline-modeling/requirements.md`
- 📄 Design: `.claude/specs/funnel-pipeline-modeling/design.md`
- 📄 Tasks: `.claude/specs/funnel-pipeline-modeling/tasks.md` (draft, 13 tasks)
- 📝 Reviews: `.claude/specs/funnel-pipeline-modeling/review-requirements.md`
  (pass 2/2, verdict revise — B-03 folded into design §2/§4.1),
  `.claude/specs/funnel-pipeline-modeling/review-design.md` (pass 1/1, verdict
  **approve** — 0 blockers, 4 concerns C-01…C-04, 3 nits N-01…N-03, all pinned in
  tasks)

**Next**: Task review (large spec — all three phases reviewed). Tasks break the
work into **13 tasks** in strict dependency order: server registry/route/read slice
(T-01…T-07, T-11, T-12) then the PWA `FunnelBoard` slice (T-08…T-10) then the final
boundary sweep (T-13). Every task carries a Verification field (a test path or
`manual: <repro with input mode + observable outcome>`). All four design-review
concerns are landed: **C-01** (AC-10 authoritative exclusion asserted in the PWA
client-filter test, not solely the `CONTAINS` Cypher → T-09), **C-02** (no listing
perf bound at small `Funnel` cardinality → T-05/T-10), **C-03** (AC-21 uses the
**widened** D-1 diff allow-list permitting the two additive router/rbac lines →
T-13), **C-04** (foundation-placeholder build precondition → T-08); nits N-01
(branch → `"n/a"` test case), N-02/N-03 noted.

**Orchestrator decision needed (carried from design D-1 / review C-03):** land the
**D-1 requirements-errata against AC-21** before execution — the new `POST
/api/v1/funnels/transitions` route requires two **additive** framework wirings
(`api/src/router.ts` dispatch line + one `P("POST","funnels/transitions",
"edge:write")` mapping in `api/src/auth/rbac-permissions.ts`, reusing the existing
`edge:write` permission) that requirements AC-21 as-written forbids. Both are a
security necessity (an unmapped route passes the router gate on any authenticated
session) and strictly additive (no new permission string). The tasks-phase AC-21
verification (T-13) already uses the widened allow-list.
