# Spec: _baseline
**Size**: large | **Created**: 2026-07-04 | **Current Phase**: execution:complete

review_passes: 0
<!-- As-built baseline: authored + ratified by /spec-adopt, approved by the
     user's 2026-07-04 adopt decision. No autonomous review loop applies. -->

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (as-built audit, revision 1) | frank (adopt decision) | 2026-07-04 |
| Design | approved (as-built coverage map, revision 1) | frank (adopt decision) | 2026-07-04 |
| Tasks | approved (16 ratify tasks) | frank (adopt decision) | 2026-07-04 |
| Execution | complete (T-01..T-15 ratified as-built; T-16 executed — no-auth-grep.test.ts deleted, auth suite green 15/15) | - | 2026-07-04 |

**Verification:**
- `verified_at`: 2026-07-04
- `verification_artifact`: manual: run scripts/spec/spec-traceability.sh .claude/specs/_baseline (CLI) — expect exit 0 "16 FRs, 16 ACs, 16 tasks all traced"; run bun test api/__tests__/auth-oauth.test.ts — expect 15 pass / 0 fail

**Artifacts:**
- 📄 Requirements: `.claude/specs/_baseline/requirements.md`
- 📄 Design: `.claude/specs/_baseline/design.md`
- 📄 Tasks: `.claude/specs/_baseline/tasks.md`
- 📊 Inventory: `.claude/specs/_inventory.md`
- 📄 Source audit: `.claude/specs/ARCHITECTURE-REVIEW-2026-06-30.md`

**Next**: flip `.specconfig.enforced` to true (/spec-adopt Phase 3, user gate),
then backfill per-surface specs (auth-hardening, kpi-sla-okr, risk-compliance,
cto-analytics completion) via /spec new or /spec-app.
