# Spec: risk-compliance-change
**Size**: large | **Created**: 2026-07-06 | **Current Phase**: tasks:approved (planning-complete — plan mode; execution deferred). All three phases reviewed `approve` (0 blockers); traceability clean.

review_passes: 0

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved | re-review (approve) | 2026-07-06 |
| Req Review | approve (0 blockers) | - | 2026-07-06 |
| Design | approved | design-review (approve) | 2026-07-06 |
| Design Review | approve (0 blockers, 3 concerns) | - | 2026-07-06 |
| Tasks | draft | - | 2026-07-06 |
| Task Review | - | - | - |
| Execution | - | - | - |

**Verification:**
- `verified_at`: -  ← required when Execution is `complete`
- `verification_artifact`: -  ← required when Execution is `complete`

**Artifacts:**
- 📄 Requirements: `.claude/specs/risk-compliance-change/requirements.md`
- 📄 Design: `.claude/specs/risk-compliance-change/design.md`
- 📄 Tasks: `.claude/specs/risk-compliance-change/tasks.md`
- 📝 Reviews: `.claude/specs/risk-compliance-change/review-requirements.md`, `.claude/specs/risk-compliance-change/review-design.md`

**Next**: Tasks drafted — 12 tasks (T-01…T-12; 5 new files: 4 integration test files + 1 shared schema module, 7 touched, 1 verify-only CI). Verify-then-fix ordering; all 3 design-review concerns (C-01 FR-09 framing, C-02 `bad_request` additive fix, C-03 Postgres aggregate string round-trip) + 2 nits folded in. Large spec → send tasks to review, then execute.
