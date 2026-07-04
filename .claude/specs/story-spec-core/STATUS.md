# Spec: story-spec-core
**Size**: large | **Created**: 2026-07-04 | **Current Phase**: tasks:revised

review_passes: 1
<!-- Per-phase review counter for the HARD CAP (1 review + max 1 re-review).
     Counter now tracks the TASKS phase: pass 1 (approve, on tasks rev 1) is
     consumed; tasks rev 2 may take at most one re-review (pass 2/2) if the
     orchestrator sends it. The design phase consumed its full 2/2 (pass 1
     approve on rev 1; pass 2 approve on rev 3) and is closed. -->

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (rev 3) | - | 2026-07-04 |
| Req Review | revise→resolved over 2 passes (0 open blockers) | - | 2026-07-04 |
| Design | **approved (rev 3)** | - | 2026-07-04 |
| Design Review | pass 2/2: approve (0 blockers, 3 concerns, 2 nits — C-05/C-06/C-07/N-04/N-05 delegated to the tasks revision, all landed in tasks rev 2) | - | 2026-07-04 |
| Tasks | **revised (rev 2, 17 tasks)** — reconciled to design rev 3 (§2.1 D-3 (a)–(h)) + design-review pass-2 delegations + task-review C-01; awaiting accept or task re-review (pass 2/2, last allowed) | - | 2026-07-04 |
| Task Review | pass 1: approve (0 blockers, 4 concerns, 2 nits) on tasks rev 1 — C-01 fixed in rev 2; C-02/C-03/C-04/N-01/N-02 landed in design rev 3 | - | 2026-07-04 |
| Execution | pending | - | - |

**Verification:**
- `verified_at`: <pending — set at execution completion>
- `verification_artifact`: <pending — set at execution completion>

The completion hook (`.claude/hooks/spec-completion-check.sh`) blocks any
edit that sets Execution=complete without both fields populated. Every task
in tasks.md rev 2 carries a Verification field (test path or `manual:` repro
with input mode + observable outcome).

**Artifacts:**
- 📄 Requirements: `.claude/specs/story-spec-core/requirements.md` (rev 3, approved)
- 📄 Design: `.claude/specs/story-spec-core/design.md` (rev 3, approved — review pass 2/2 verdict approve)
- 📄 Tasks: `.claude/specs/story-spec-core/tasks.md` (**rev 2** — 17 tasks, status: revised)
- 📝 Reviews: `review-requirements.md` (2 passes → resolved),
  `review-design.md` (pass 2/2: approve), `review-tasks.md` (pass 1: approve, on rev 1)

**What tasks rev 2 changed (2026-07-04):**
1. **Design §2.1 D-3 deltas (a)–(h)**: T-03 → **five** codes (incl.
   `story_activity_not_in_model`, 404); T-05/T-07 → `404
   story_activity_not_in_model` for out-of-scope `activityId`/`activityIds`
   (not `400 story_activity_required`); new **T-17** closes AC-19
   (`story-xd18-role-path.integration.test.ts`, §4.12); T-14 → DD-09
   fork-first empty-state hint (+ T-15 state test); DD-11 detached contract
   (list includes detached rows, two-shape gate, detached-lifecycle assertions
   in the AC-03 test); PATCH re-point `SET sourceActivityId` asserted; OpenAPI
   counts five codes; "blocked on model-workspace-core" precondition dropped
   (dependency landed, interfaces re-verified on disk).
2. **Design-review pass-2 delegations landed**: C-05 → deviations row D-4
   (detached rows globally visible; FR-14/NFR-02 errata pending); C-06 →
   `getModel` model-existence gate in every `stories.ts` function (`404
   model_not_found`, asserted in the AC-03 test); C-07 → pinned
   degrade-not-guard decision for prop-less `UserStory` nodes (nullable read
   props, `narrative ?? name` render); N-04 → deviations row D-5 (derive
   module path); N-05 → detached-parent AC create/patch assertions in T-06.
3. **Task-review C-01**: `Blocks` lists recomputed as the exact inverse of
   `Blocked by` (spurious edges dropped; T-16 now gated on T-09/T-11/T-14).

**Next**: Orchestrator gate on tasks rev 2 — accept (→ execution plan), or
send to task re-review (pass 2/2, the last allowed). Open user decisions the
orchestrator may surface before execution: **OQ-2** starter-AC default
(executed as design DD-02's one-starter-AC default) and the **C-07**
prop-less-UserStory boundary (executed as documented degrade; the guard-style
hard closure via the mwc lifecycle-guard pattern remains available).
