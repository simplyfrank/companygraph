# Spec: requirements-export
**Size**: small | **Created**: 2026-07-04 | **Current Phase**: tasks:draft

review_passes: 0
<!-- Per-phase review counter for the HARD CAP (1 review + max 1 re-review).
     Small spec: no design + no reviews per size rules — counter stays 0. -->

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | draft | - | 2026-07-04 |
| Tasks | draft | - | 2026-07-04 |
| Execution | pending | - | - |

<!-- Small spec: Design, Design Review, Req Review, and Task Review rows omitted
     per spec-workflow (small = requirements → tasks → execute; no reviews). -->

**Verification:**
- `verified_at`: <YYYY-MM-DD>
- `verification_artifact`: <test path OR manual: <one-line procedure with input mode + observable outcome>>

**Artifacts:**
- 📄 Requirements: `.claude/specs/requirements-export/requirements.md`
- 📄 Tasks: `.claude/specs/requirements-export/tasks.md` (11 tasks; small spec — no design/review)

**Next**: Present tasks at the gate for approval; on approval, execute (small spec skips design + reviews). Execution is **blocked by build order** — all five dependencies (`story-spec-core`, `key-activity-optimizer`, `kpi-impact-mapping`, `ddd-system-modeling`) + transitive `model-workspace-core` must merge first (wave 5). Orchestrator: surface OQ-1 (in-process seam) + OQ-2 (hand-rolled Markdown) in the consolidated report (XD-17).
