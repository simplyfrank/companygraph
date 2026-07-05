# Spec: key-activity-optimizer
**Size**: medium | **Created**: 2026-07-04 | **Current Phase**: execution:complete (T-01..T-16 as-built + residual T-17..T-20 executed 2026-07-05)

review_passes: 2
<!-- Per-phase review counter (HARD CAP: 1 review + max 1 re-review).
     The DESIGN phase consumed both passes on 2026-07-04 (pass 2 verdict:
     approve). Revisions since are NOT review responses: design rev 4
     (2026-07-05) realigns to requirements rev 2 + the as-built code; tasks
     rev 3 (2026-07-05) realigns to design rev 4. Per the cap, no third
     design review may be launched; the gate is direct user approval.
     Medium spec: no Task Review pass is scheduled. -->

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (revision 2) | user | 2026-07-05 |
| Req Review | approve, pass 2/2 (0 blockers; 3 nits absorbed by design rev 4) | - | 2026-07-05 |
| Design | revised (revision 4 — realigned to requirements rev 2 + as-built; awaiting approval, gated on OQ-A) | - | 2026-07-05 |
| Design Review | approve, pass 2/2 (0 blockers; cap reached — no further passes) | - | 2026-07-04 |
| Tasks | draft (revision 3 — realigned to design rev 4; T-01..T-16 recorded as landed as-built, residual T-17..T-20) | - | 2026-07-05 |
| Execution | **complete** — T-01..T-16 as-built; T-17 (Δ1), T-18 (Δ2), T-19+T-20 (Δ3 on the DD-11 path) executed + verified 2026-07-05 | executor (per orchestrator execute-every-task directive) | 2026-07-05 |

<!-- Medium spec: Task Review row omitted. -->

**Tasks revision 3 (2026-07-05) — what and why:**
- Realigns to design revision 4: revision 2's full task bodies for
  T-01..T-16 are compressed to as-built records (every design-§8 test file
  exists on disk, re-verified 2026-07-05); no ID renumbered.
- Adds the residual delta tasks: **T-17** (Δ1 — FR-04 non-empty handoff
  guard at the counting site + roleless/systemless fixtures, AC-04),
  **T-18** (Δ2 — FR-03 ≥2-node chain rule in `recordPath` so an isolated
  activity scores `criticalPath 0` + fixtures, AC-03), **T-19/T-20** (Δ3 —
  DD-11 additive catalog `DataTable` sort extension + `KeyActivityBoard`
  refactor onto it, with AC-09/AC-14/AC-15 re-runs; **execute only if OQ-A
  resolves to DD-11** — otherwise mark deprecated, no renumbering).
- Corrects T-01's verification citation to the as-built
  `shared/__tests__/key-activity.test.ts` (revision 2 cited a
  never-created `shared/src/schema/__tests__/` path).
- Pinned decisions from the approve-pass design review (final-review
  C-01/C-02/N-02) are recorded as **executed as-built** with code citations.

<!-- Review-finding genealogy (archive — full text in review-*.md):
     * Requirements review pass 1 (revise): B-01 unknown-:modelId gate,
       B-02 NFR-01 scoping wording, C-01 DataTable catalog gap, C-02
       analytics path, C-03 handoff empty sets, C-04 chain-length unit,
       C-05 reversibility/atomicity, C-06 phantom envelope.test.ts, C-07
       export/import qualification, N-01..N-05 → all resolved in
       requirements revision 2 (2026-07-05).
     * Requirements review pass 2 (approve, 0 blockers): nits N-01 depth-cap
       unit, N-02 `rows` field name, N-03 isolated-activity score → absorbed
       by design revision 4.
     * Design review pass 1 (revise): B-01 DataTable cannot sort → then-DD-10;
       C-01 snapshot tx-consistency, C-02 ErrorState retry sibling, C-03
       schema-claim trim, C-04 z.literal(true) read tolerance, C-05
       self-loop/duplicate PRECEDES → resolved in design rev 2.
     * Design pass-2 residuals (approve): C-01 permissive-schema qualifier,
       C-02 createdAt tiebreak coalesce, C-03 scoped-set threading → folded
       into design + tasks.
     * Cold pass (revise): B-01 empty-set≠404 (getModel gate), C-01 dead
       analytics path, C-02 stale build-order framing, C-03 lock-first write,
       N-01 mutual-pair pin, N-02 errors.ts line → resolved in design rev 3.
     * Final design review pass 2 (approve): C-01 unmark raw fetch, C-02
       journey aggregation/de-dupe, N-02 true no-op unmark → landed as-built,
       folded into design rev 4 text (§4.11, §4.2/§4.3, §4.5). -->

**Open Questions — disposition at execution (2026-07-05):**
- **OQ-A — executed on the DD-11 path, NOT silently:** the orchestrator's
  execution directive was "implement every task in tasks.md", which includes
  T-19/T-20 as authored on the DD-11 path; that path follows the
  **user-approved requirements rev 2 FR-12** ("inventing a non-catalog table
  is not an option"). T-19 extended the catalog `DataTable` additively
  (prop-less render unchanged — pinned by `pwa/src/__tests__/data-table.test.tsx`
  case (a)); T-20 refactored `KeyActivityBoard` onto it and removed the
  DD-10 in-view `<table>`. If the user instead amends FR-12 at the design
  gate, the DD-10 board can be restored from git history — but the DD-11
  markup is now the verified state on disk.
- OQ-1 (critical-path budgets — default 20 nodes/1000/4 s), OQ-2 (constant
  weights — DD-09), OQ-3 (betweenness — DD-03): executed as the recorded
  defaults; one-line changes if the user prefers otherwise.

**Cross-spec findings (not owned by this spec, reported not fixed):**
- Catalog `Modal` (`pwa/src/components/Modal.tsx`, baseline-owned):
  plain **Escape only deactivates the focus trap** (focus-trap-react default)
  — it neither closes the dialog nor reliably restores focus. Keyboard
  dismissal works via the Modal's Close button (first tabbable; Enter →
  onClose → FocusTrap unmount returns focus to the originating row —
  verified in the AC-15 walk). One-line fix for the owner:
  `focusTrapOptions={{ onDeactivate: onClose }}`.
- Pre-existing suite failures NOT caused by this spec (files never touched
  here): unit — `api/__tests__/system-kind-vocabulary.test.ts` grep guard
  (offenders in `api/src/storage/system-model.ts`,
  `shared/src/schema/ddd-system.ts`; system-augmentation-model /
  ddd-system-modeling ownership); integration — ontology-manager suites
  (applySchema bootstrap reconcile, ontology export round-trip, per-label
  attribute enforcement) under concurrent modification.

**Verification:**
- `verified_at`: 2026-07-05
- `verification_artifact`: per-AC map below (all executed 2026-07-05; unit
  via `bun test` / pwa vitest, integration via `bun test:integration`
  with Neo4j + API up):
  - AC-01: `api/__tests__/key-activity-scores.integration.test.ts` (pass)
  - AC-02: `api/__tests__/key-activity-score.test.ts` +
    `api/__tests__/key-activity-centrality.integration.test.ts` (pass)
  - AC-03: `api/__tests__/key-activity-score.test.ts` (incl. Δ2
    isolated-activity case) +
    `api/__tests__/key-activity-critical-path.integration.test.ts` (pass)
  - AC-04: `api/__tests__/key-activity-score.test.ts` (incl. Δ1
    roleless/systemless cases) +
    `api/__tests__/key-activity-handoff.integration.test.ts` (pass)
  - AC-05: `api/__tests__/key-activity-score.test.ts` +
    `api/__tests__/key-activity-scores.integration.test.ts` (pass)
  - AC-06: `api/__tests__/key-activity-mark.integration.test.ts` +
    `api/__tests__/key-activity-import.integration.test.ts` (pass)
  - AC-07: `api/__tests__/key-activity-mark.integration.test.ts` (pass)
  - AC-08: `api/__tests__/key-activity-openapi.integration.test.ts` +
    `api/__tests__/key-activity-scope-authz.integration.test.ts` (pass)
  - AC-09: `pwa/src/__tests__/key-activity-board.test.tsx` (updated to the
    DD-11 DataTable markup) + `pwa/src/__tests__/data-table.test.tsx` (pass)
  - AC-10: `pwa/src/__tests__/key-activity-detail.test.tsx` (pass, unmodified)
  - AC-11/AC-12/AC-13: `pwa/src/__tests__/key-activity-board-states.test.tsx`
    (pass, unmodified)
  - AC-14: CLI — `bun run scripts/design-conformance.ts --view <f>` exits 0
    for all four touched files (`KeyActivityBoard.tsx`,
    `KeyActivityBoard.module.css`, `DataTable.tsx`, `DataTable.module.css`)
  - AC-15: manual (input mode: keyboard), executed via automated Playwright
    walk 2026-07-05: load `#/model/key-activities` keyboard-only — Tab to the
    Rank `DataTable` header button, Enter (aria-sort flipped onto Rank, prior
    Composite header dropped to "none", rows reordered, no re-fetch), Tab +
    Space on a mark toggle (key badge appeared), Shift+Tab + Enter on a row
    detail (focus entered the Modal), Enter on the Modal Close button (panel
    detached, focus returned to the originating row button). Escape-only
    close is a catalog Modal limitation — see cross-spec findings.
  - AC-16: `pwa/playwright/key-activity-board-context.spec.ts` (updated to
    DD-11 `ka-detail-*` anchors; 4/4 projects pass incl. WebKit)
  - AC-17: `bun run typecheck` exit 0 after every task; manual (input mode:
    CLI): `git diff shared/src/schema/nodes.ts shared/src/schema/edges.ts`
    run 2026-07-05 → empty (no NODE_LABELS / EDGE_ENDPOINTS additions)

**Artifacts:**
- 📄 Requirements: `.claude/specs/key-activity-optimizer/requirements.md` (revision 2, approved)
- 📄 Design: `.claude/specs/key-activity-optimizer/design.md` (revision 4, revised — awaiting approval)
- 📄 Tasks: `.claude/specs/key-activity-optimizer/tasks.md` (revision 3, draft — aligned to design rev 4)
- 📝 Reviews: `.claude/specs/key-activity-optimizer/review-requirements.md` (pass 2, approve) · `review-design.md` (pass 2, approve)

**Next**: Execution is complete on the DD-11 path. Remaining for the user:
formally approve design revision 4 + tasks revision 3 at the gate (the
OQ-A decision was executed per the orchestrator's directive, following the
approved requirements rev 2 FR-12 — reverse only by amending FR-12 and
restoring the DD-10 board from git history). Consider handing the catalog
`Modal` Escape finding (cross-spec findings above) to its owner.
