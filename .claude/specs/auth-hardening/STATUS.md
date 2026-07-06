# Spec: auth-hardening
**Size**: large | **Created**: 2026-07-06 | **Current Phase**: tasks:approved (planning-complete — plan mode; execution deferred). All three phases reviewed `approve` (0 blockers); traceability clean.

review_passes: 0

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved | user | 2026-07-06 |
| Req Review | approve (0 blockers) | - | 2026-07-06 |
| Design | approved | user | 2026-07-06 |
| Design Review | approve (0 blockers, 3 concerns) | - | 2026-07-06 |
| Tasks | draft | - | 2026-07-06 |
| Task Review | pending | - | - |
| Execution | not started | - | - |

**Verification:**
- `verified_at`: —  ← required when Execution is `complete`
- `verification_artifact`: —  ← required when Execution is `complete`

**Artifacts:**
- 📄 Requirements: `.claude/specs/auth-hardening/requirements.md`
- 📄 Design: `.claude/specs/auth-hardening/design.md`
- 📄 Tasks: `.claude/specs/auth-hardening/tasks.md`
- 📝 Reviews: `.claude/specs/auth-hardening/review-requirements.md`, `.claude/specs/auth-hardening/review-design.md`

**Tasks summary**: 16 tasks (T-01…T-13; T-04/T-05/T-06 carry paired
files), staged pin → harden → prove. Every task carries a `Verification`
field (test path or `manual:` repro with input mode + observable
outcome). Design-review pass-2 concerns C-06 (preload scoped to the `api`
test-unit block), C-07 (`--env-file` precedence guard), and C-08
(`globalThis.process` access form normalized) are pinned in the "Open
design concerns" table and locked to T-10, T-11, T-08 respectively.

**Next**: Present tasks at the approval gate; large spec → send tasks to
review before execution.
