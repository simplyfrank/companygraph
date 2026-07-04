# Spec: ddd-system-modeling
**Size**: large | **Created**: 2026-07-04 | **Current Phase**: tasks:draft

review_passes: 0
<!-- Per-phase review counter for the HARD CAP (1 review + max 1 re-review).
     Reset to 0 on advancing to each new phase. Large spec: requirements,
     design, AND tasks are each reviewed. Requirements + Design approved.
     Tasks drafted (17 tasks) — counter reset for the tasks phase; ready for
     task review (pass 1/2). -->

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (rev 2 — 15 FRs, 7 NFRs, 22 ACs; B-01/B-02/C-01..C-04/N-03 resolved) | - | 2026-07-04 |
| Req Review | revise (2 blockers, 4 concerns) → revised → approved | - | 2026-07-04 |
| Design | approved (9 DDs, 16 file changes [6 new / 10 modify], all FR→file + AC→test traced) | - | 2026-07-04 |
| Design Review | approve (0 blockers, 3 concerns C-01..C-03, 3 nits) — folded into tasks | - | 2026-07-04 |
| Tasks | draft (17 tasks; every task Verification-carrying; C-01/C-02/C-03 + N-01/N-02/N-03 landed) | - | 2026-07-04 |
| Task Review | - | - | - |
| Execution | - | - | - |

**Verification:**
- `verified_at`: -  ← required when Execution is `complete`
- `verification_artifact`: -  ← required when Execution is `complete`

**Artifacts:**
- 📄 Requirements: `.claude/specs/ddd-system-modeling/requirements.md`
- 📄 Design: `.claude/specs/ddd-system-modeling/design.md`
- 📄 Tasks: `.claude/specs/ddd-system-modeling/tasks.md`
- 📝 Reviews: `.claude/specs/ddd-system-modeling/review-requirements.md`, `review-design.md`

**Open questions for the user:** none blocking. All three former open
questions were closed in rev 2 under single-shot (XD-17):
- OQ-1 (FR-03) cardinality → **closed decided** (`SUPPORTED_BY` many-to-many,
  `ASSIGNED_TO_CONTEXT`/`CAPABILITY_IN_MODEL` at-most-one/exactly-one).
- OQ-2 (FR-08) `USES_SYSTEM` reconciliation → **closed decided** (dual-path
  support + distinct `capabilityGaps` category).
- OQ-3 (Risk 3) capability derivation → **closed out-of-scope** (manual-only;
  named out-of-scope line).
Reviewer may still wish to confirm the B-01 fix direction (this spec now owns a
new `CAPABILITY_IN_MODEL` edge rather than requiring a coordinated change to
`model-workspace-core`'s `IN_MODEL` lifecycle guard) — recorded as decided.

**Next**: Task review (pass 1/2). On approval, advance to execution.
