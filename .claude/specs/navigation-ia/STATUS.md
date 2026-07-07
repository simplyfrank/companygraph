# Spec: navigation-ia
**Size**: large | **Created**: 2026-07-04 | **Current Phase**: execution:complete

review_passes: 2 (design + tasks — cap 2/2 each)

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (rev 2) | Frank | 2026-07-04 |
| Req Review | pass 1: revise (4 blockers) → pass 2: approve (0 blockers, 2 concerns folded in) | - | 2026-07-04 |
| Design | **approved** (rev 2 — rev 1 had 2 blockers + 3 concerns; rev 2 resolves all 5; 3 nits shipped open) | review-design.md (pass 1, verdict approve on rev 2) | 2026-07-06 |
| Design Review | approve (0 blockers, 0 concerns, 3 nits shipped open) | - | 2026-07-06 |
| Tasks | **approved** (rev 2 — rev 1 had 1 blocker; rev 2 resolves it; 2 concerns shipped open) | review-tasks.md (pass 1, verdict approve on rev 2) | 2026-07-06 |
| Task Review | approve (0 blockers, 0 concerns, 2 nits shipped open) | - | 2026-07-06 |
| Execution | **complete** — IA restructure landed in commit `fb43471` (task-oriented surfaces incl. `#/govern` + `#/insights`, aliases, breadcrumbs, search palette); studio + SaaS-operator views reconciled under the new IA; verified 2026-07-07 | - | 2026-07-07 |

**Verification:**
- `verified_at`: 2026-07-07
- `verification_artifact`: pwa vitest **510/510 pass** (incl. `breadcrumbs.test.tsx`, `breadcrumb-stores.test.ts`, `route-parse.test.ts`, `business-placeholder.test.tsx`); `#/govern` + `#/insights` surfaces + tabs verified present in `pwa/src/route.ts`; restructure committed in `fb43471`. Reconciliation regression (a stale `#/exec/okr-management` assert in `performance-dashboard.test.tsx`) resolved to `#/govern/okr-management`.

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
