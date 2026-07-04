# Spec: key-activity-optimizer
**Size**: medium | **Created**: 2026-07-04 | **Current Phase**: tasks:draft

review_passes: 0
<!-- Per-phase review counter for the HARD CAP (1 review + max 1 re-review).
     Reset to 0 when advancing to the next phase. Pass 3+ is refused.
     Reset to 0 on advancing design → tasks (design review reached its
     approve verdict at pass 2). -->

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved | user | 2026-07-04 |
| Req Review | approve (0 blockers) | - | 2026-07-04 |
| Design | approved | user | 2026-07-04 |
| Design Review | approve (0 blockers, 3 concerns, 2 nits) | - | 2026-07-04 |
| Tasks | draft | - | 2026-07-04 |
| Execution | pending | - | - |

<!-- Medium spec: Task Review row omitted (design + design review kept). -->
<!-- 13 tasks (T-01..T-16 numbering; see tasks.md total_tasks). -->
<!-- Design-review pass-2 carry-forwards folded into tasks as binding decisions:
     C-01 (permissive-schema qualifier → T-06), C-02 (createdAt tiebreak
     coalesce/fallback → T-01/T-02/T-03), C-03 (single scoped-set thread → T-04/T-05). -->

**Verification:**
- `verified_at`: <YYYY-MM-DD>
- `verification_artifact`: <test path OR manual: <one-line procedure with input mode + observable outcome>>

**Artifacts:**
- 📄 Requirements: `.claude/specs/key-activity-optimizer/requirements.md`
- 📄 Design: `.claude/specs/key-activity-optimizer/design.md`
- 📄 Tasks: `.claude/specs/key-activity-optimizer/tasks.md`
- 📝 Reviews: `.claude/specs/key-activity-optimizer/review-requirements.md` · `review-design.md`

**Next**: Tasks are drafted (medium spec — no Task Review gate). Present the tasks gate; on approval, present the execution plan and, on explicit confirmation, execute T-01..T-16 in dependency order (each followed by `bun run typecheck`; behaviour tasks run their listed test; T-14 also runs `design-conformance.ts`). **Hard build-order precondition:** T-02/T-09/T-10/T-14 cannot start until `model-workspace-core` has merged `scopedNodeIds`, the `business_architect` role, `useActiveModel()`, and the `key-activities` `ModelTabPlaceholder` slot.

**Open questions still for the user (recorded as design/tasks defaults, not blockers):** OQ-3 (centrality primitive — default betweenness, DD-03; degree/pagerank trivially addable as columns), OQ-2 (constant weights vs tunable — default constants, DD-09), OQ-1 (critical-path budgets — default cto-analytics contract 20/1000/4 s, §4.3).
</content>
