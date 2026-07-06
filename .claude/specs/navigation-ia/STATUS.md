# Spec: navigation-ia
**Size**: large | **Created**: 2026-07-04 | **Current Phase**: tasks:approved (execution next)

review_passes: 2 (design + tasks — cap 2/2 each)

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (rev 2) | Frank | 2026-07-04 |
| Req Review | pass 1: revise (4 blockers) → pass 2: approve (0 blockers, 2 concerns folded in) | - | 2026-07-04 |
| Design | **approved** (rev 2 — rev 1 had 2 blockers + 3 concerns; rev 2 resolves all 5; 3 nits shipped open) | review-design.md (pass 1, verdict approve on rev 2) | 2026-07-06 |
| Design Review | approve (0 blockers, 0 concerns, 3 nits shipped open) | - | 2026-07-06 |
| Tasks | **approved** (rev 2 — rev 1 had 1 blocker; rev 2 resolves it; 2 concerns shipped open) | review-tasks.md (pass 1, verdict approve on rev 2) | 2026-07-06 |
| Task Review | approve (0 blockers, 0 concerns, 2 nits shipped open) | - | 2026-07-06 |
| Execution | - | - | - |

**Verification:**
- `verified_at`: -
- `verification_artifact`: -

**Artifacts:**
- 📄 Requirements: `.claude/specs/navigation-ia/requirements.md`
- 📄 Design: `.claude/specs/navigation-ia/design.md` (rev 2, status `approved`)
- 📝 Reviews: `review-requirements.md` (pass 1, revise), `review-requirements-pass2.md` (pass 2, approve), `review-design.md` (pass 1, approve on rev 2), `review-tasks.md` (pass 1, approve on rev 2)
- 📝 Blueprint amendment: `.claude/specs/blueprint.md` § Round-5 Amendment (2026-07-06)
- 📄 Tasks: `.claude/specs/navigation-ia/tasks.md` (rev 2, status `approved`, 22 tasks)

**Precondition status:**
- ✅ Blueprint single-shot execution complete (all 10 features execution:complete or reported)
- ✅ `kpi-okr-performance-dashboards` execution:complete + verified (FR-04† "landed" branch)
- ✅ Blueprint round-5 amendment applied (FR-12 precondition)
- ✅ Post-blueprint route-table inventory completed (verified against current `route.ts` + `views/index.tsx`)

**Next**: Execution phase — implement tasks T-01 through T-22 in dependency order.
