# Spec: kpi-impact-mapping
**Size**: medium | **Created**: 2026-07-04 | **Current Phase**: tasks:draft

review_passes: 0
<!-- Per-phase review counter for the HARD CAP (1 review + max 1 re-review).
     Reset to 0 when advancing to the next phase. Pass 3+ is refused.
     Reset to 0 on advancing design→tasks (per-phase counter).
     Medium spec: no Task Review gate — tasks go straight to execute after approval. -->

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved | review pass 2/2 (approve) | 2026-07-04 |
| Req Review | approve (0 blockers, pass 2/2) | - | 2026-07-04 |
| Design | approved | design review pass 1/1 (approve) | 2026-07-04 |
| Design Review | approve (0 blockers, 2 concerns, 3 nits) | - | 2026-07-04 |
| Tasks | draft | - | 2026-07-04 |
| Execution | pending | - | - |

<!-- Medium spec: Task Review row omitted (design + design review kept). -->
<!-- 14 FRs, 17 ACs, 7 NFRs. design.md: 13 DDs, 15 file changes (6 new, 9 modify), 8 routes/handlers.
     Carry-forward concerns resolved: C-05 (latestValue extraction, DD-04), C-06 (error-code reuse, DD-05).
     tasks.md: 16 tasks. Design-review carry-forwards landed as binding task decisions:
       C-01 (roll-up source = :KPIMeasurement via kpi-trends; OQ-2 escalated) → T-06/T-12;
       C-02 (story display name = s.name, not s.title) → T-04/T-11;
       N-01 (model_not_found pre-check on matrix AND rollup) → T-05/T-06/T-08;
       N-02 (->(a:Activity) endpoint filter deliberate) → T-03/T-05;
       N-03 (8 handlers, not 6) → T-08/T-09. -->

**Verification:**
- `verified_at`: <YYYY-MM-DD>
- `verification_artifact`: <test path OR manual: <one-line procedure with input mode + observable outcome>>

**Artifacts:**
- 📄 Requirements: `.claude/specs/kpi-impact-mapping/requirements.md` (approved)
- 📄 Design: `.claude/specs/kpi-impact-mapping/design.md` (approved)
- 📄 Tasks: `.claude/specs/kpi-impact-mapping/tasks.md` (draft)
- 📝 Reviews: `.claude/specs/kpi-impact-mapping/review-requirements.md` (pass 2, approve); `review-design.md` (pass 1, approve)

**Next**: `tasks.md` drafted — 16 tasks in dependency order, every task carries a Verification field (test path or `manual:` with input mode + observable outcome), full FR→task→AC traceability. Medium spec → no Task Review gate. Present the tasks gate; on approval present the execution plan (Phase 5). **Execution is blocked by the hard build-order precondition** (see below) — all three deps + `model-workspace-core` must merge first.

**Hard build-order precondition:** implementation cannot start until all three declared dependencies merge — `story-spec-core` (`UserStory` label + `UserStory.id` join key), `key-activity-optimizer` (`attributes.keyActivity` mark for gap detection), and `kpi-okr-governance` (`GET /api/v1/kpis`, `GET /api/v1/kpi-trends/:kpiId`, the `ALIGNED_TO`/`kpi-alignments` base contract, the ZodError→400 mapper). `model-workspace-core`'s `scopedNodeIds` is already present on disk. The roll-up integration test (AC-06) needs only the Neo4j CI service (seeds `:KPIMeasurement`, the source `kpi-trends` reads); it does **not** need the Postgres CI service.

**Open questions still for the user (defaults recorded; OQ-2 now needs a real decision):**
- **OQ-1 (DEC-01) — XD-04 literal edge-name discrepancy.** XD-04 names `DRIVES_KPI`, but the as-built weighted activity→KPI link is `ALIGNED_TO` (`DRIVES_KPI` is `KeyResult→KPI`). Default: extend the as-built `ALIGNED_TO`/`kpi-alignments` link with a `direction` property + implement the `userStoryKPI` schema as a runtime `IMPACTS_KPI` edge. **Confirm this reading of XD-04 with the user.**
- **OQ-2 (RE-STATED per B-01 — needs a user decision) — roll-up measurement store of truth (V-02 split-brain).** `kpi-trends` reads **Neo4j `:KPIMeasurement`**; `POST /kpi-measurements` writes the **disjoint Postgres `kpi_measurements`** table. This spec composes `kpi-trends` (DEC-02), so the roll-up reflects `:KPIMeasurement`, not Postgres. **Ask the user:** is `:KPIMeasurement` the intended source of truth, or must the roll-up reflect Postgres? If Postgres, the V-02 split must be resolved in `kpi-okr-governance` (out of this spec's scope) — this spec will not open a direct-Postgres read.
- **OQ-3 — gap detection scope.** Default: activity→KPI links only clear a gap (story links are a `should` coverage rider, FR-07).
- **OQ-4 (DEC-03, new — split from Risk 4 per C-04) — does an *undirected* pre-existing `ALIGNED_TO` clear a measurability gap?** Default: **no** — only a `direction`-bearing link clears a gap (matches XD-04's directional-impact intent). Looser alternative (any `ALIGNED_TO` clears it) flagged. Confirm the stricter default.
- **C-01 flag — second-writer MERGE on `kpi-okr-governance`'s `ALIGNED_TO`.** This spec's `…/activity-links` POST MERGEs on the same edge type the base `kpi-alignments` POST CREATEs. Confirm with that spec's owner that a second writer with MERGE idempotency is acceptable; whether the two POST surfaces converge is a design/consolidated-report flag.
