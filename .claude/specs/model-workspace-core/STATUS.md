# Spec: model-workspace-core
**Size**: large | **Created**: 2026-07-04 | **Current Phase**: execution:in-progress

review_passes: 1
<!-- Per-phase review counter for the HARD CAP (1 review + max 1 re-review).
     Tasks pass 1 verdict: APPROVE (0 blockers, 3 concerns, 3 nits) — all
     findings folded into tasks.md rev 2; no re-review needed (concerns were
     verification/DoD tightenings the reviewer said could ride inside
     implementation). One re-review remains in budget but is not requested.
     Design review reached its 2/2 cap with pass 2 verdict APPROVE (of design
     rev 3, per on-disk review-design.md). Design rev 4 (2026-07-04) is a
     post-approval reconciliation against approved requirements rev 4 — NOT a
     new review pass; pass 3+ on design remains refused per the cap. -->

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (rev 4 — rev-3 errata D-1…D-5 + pass-2 concerns C-06…C-11 and nits folded into the body; DEC-01 closed) | user | 2026-07-04 |
| Req Review | approve (0 blockers) | - | 2026-07-04 |
| Design | revised (rev 4 — realigned to requirements rev 4; folds approved-review residuals C-09/C-10/N-10/N-11/N-12; reconciliation-only except the requirements-mandated FR-10 `--down --force` refusal, rev-4 C-10) | - | 2026-07-04 |
| Design Review | approve (of revision 3; cap 2/2 — rev 4 is post-approval reconciliation, no new pass; residuals B-02/C-06/C-07/N-05/N-06 resolved in rev 3, C-09/C-10/N-10..N-12 resolved in rev 4) | - | 2026-07-04 |
| Tasks | revised (rev 3, 22 tasks; both review passes folded) — needs one T-16 sync line (see Next) | - | 2026-07-04 |
| Task Review | pass 1 approve; pass 2 revise — all findings folded into rev 3 (2/2 cap) | - | 2026-07-04 |
| Execution | in progress | - | 2026-07-04 |

**Verification:**
- `verified_at`: <pending — set at execution completion>
- `verification_artifact`: <pending — set at execution completion>

**Artifacts:**
- 📄 Requirements: `.claude/specs/model-workspace-core/requirements.md`
- 📄 Design: `.claude/specs/model-workspace-core/design.md`
- 📄 Tasks: `.claude/specs/model-workspace-core/tasks.md`
- 📝 Reviews: `.claude/specs/model-workspace-core/review-*.md`

**Next**: Continue execution against design rev 4 + tasks rev 3. The three
frozen-requirements reconciliations previously pinned here (C-06 AC-06 arm,
C-07/D-1 `?model=` supersession, N-02/C-11 two-invocation AC-16) are **landed**
— requirements rev 4 folded them into the body and design rev 4 now agrees;
zero deviations remain outstanding (design §2.1 is a landed ledger). Two items
for the orchestrator:
1. **Sync tasks.md T-16** with the requirements rev-4 C-10 contract now in
   design §4.7: `--down` refuses without `--force` while a non-reference model
   exists, and the AC-08 test adds "second model survives a forced
   down-migration with its `IN_MODEL` edges + subgraph intact". This is the
   only tasks delta design rev 4 introduces (T-08's deleted-anchor hardening
   and T-20's two `--view` invocations were already pinned in tasks rev 3 and
   now match the design).
2. **Gate design rev 4** — decide whether to flip design.md frontmatter
   `status: revised` → `approved` without a new review pass (cap 2/2 reached;
   review approved rev 3; rev 4 is reconciliation with the user-approved
   requirements rev 4, no new contract beyond the requirements-mandated
   `--force`). Note: spec-gate-check blocks source-file edits on files the
   design names while status is not "approved".
B-02 (fork instance→subtree anchor) is resolved by instance-qualifying
`forkLocalKey = "<instanceId>::<localKey>"` (design §3.4, tasks T-08).
