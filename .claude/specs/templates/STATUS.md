# Spec: <slug>
**Size**: <size> | **Created**: <YYYY-MM-DD> | **Current Phase**: <phase:status>

review_passes: 0
<!-- Per-phase review counter for the HARD CAP (1 review + max 1 re-review).
     Reset to 0 when advancing to the next phase. Pass 3+ is refused. -->

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | <draft/in-review/revised/approved> | <who> | <date> |
| Req Review | <verdict> (<N> blockers, <N> concerns, <N> nits) | - | <date> |
| Design | <status> | <who> | <date> |
| Design Review | <verdict> (<N> blockers) | - | <date> |
| Tasks | <status> | <who> | <date> |
| Task Review | <verdict> (<N> blockers) | - | <date> |
| Execution | <pending/in-progress/complete> | - | <date> |

<!-- Small specs: omit Design + Design Review + Task Review rows.
     Medium specs: omit the Task Review row. -->

**Verification:**
- `verified_at`: <YYYY-MM-DD>
- `verification_artifact`: <test path OR manual: <one-line procedure with input mode + observable outcome>>

<!-- Both fields are required before Execution can be marked complete — the
     completion hook (.claude/hooks/spec-completion-check.sh) blocks the edit
     otherwise. Placeholder values in <angle brackets> do not count. -->

**Artifacts:**
- 📄 Requirements: `.claude/specs/<slug>/requirements.md`
- 📄 Design: `.claude/specs/<slug>/design.md`
- 📄 Tasks: `.claude/specs/<slug>/tasks.md`
- 📝 Reviews: `.claude/specs/<slug>/review-*.md`

**Next**: <what to do next>
