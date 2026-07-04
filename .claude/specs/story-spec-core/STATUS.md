# Spec: story-spec-core
**Size**: large | **Created**: 2026-07-04 | **Current Phase**: tasks:draft

review_passes: 0
<!-- Per-phase review counter for the HARD CAP (1 review + max 1 re-review).
     Reset to 0 on entering each new phase. -->

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved | - | 2026-07-04 |
| Req Review | revise→resolved (0 open blockers) | - | 2026-07-04 |
| Design | approved | - | 2026-07-04 |
| Design Review | approve (0 blockers, 4 concerns, 3 nits) | - | 2026-07-04 |
| Tasks | draft | - | 2026-07-04 |
| Task Review | pending | - | - |
| Execution | pending | - | - |

**Verification:**
- `verified_at`: <pending — set at execution completion>
- `verification_artifact`: <pending — set at execution completion>

**Artifacts:**
- 📄 Requirements: `.claude/specs/story-spec-core/requirements.md`
- 📄 Design: `.claude/specs/story-spec-core/design.md`
- 📄 Tasks: `.claude/specs/story-spec-core/tasks.md` (draft — 16 tasks)
- 📝 Reviews: `.claude/specs/story-spec-core/review-requirements.md` (pass 1: revise → resolved),
  `.claude/specs/story-spec-core/review-design.md` (pass 1: approve, 4 concerns folded into tasks)

**Next**: Task review (pass 1 of 2; large spec). tasks.md breaks the work into
**16 tasks** in strict dependency order (T-01 schemas → T-02 registry → T-03
errors → T-04 derive → T-05/T-06/T-07 storage → T-08/T-09 routes+dispatch → T-10
isolation test → T-11 RBAC → T-12 openapi → T-13 api client → T-14 view → T-15
state tests → T-16 e2e). Every task carries a Verification field (test path or
`manual:`); all 18 ACs are covered. The four design-review concerns are landed as
binding decisions: C-01 (corrected false `envelope.test.ts` rationale — no such
constraint; no verify-task added), C-02 (parity projection wording), C-03 (retry
button lives in `StoryCatalog`, not `ErrorState`), C-04 (bad `roleId` → `404
not_found`, no new code), plus N-01/N-02/N-03. **Deviations to land as errata:**
AC-15 manual→CLI (design §8), DD-02 one-starter-AC default (OQ-2 — orchestrator
may still ask the user). **Hard build-order precondition:** T-01 must not start
until `model-workspace-core` merges (its `scopedNodeIds`, active-model context,
`seed-rbac-roles.ts`, and `POST /models/:id/domains` are consumed here).
