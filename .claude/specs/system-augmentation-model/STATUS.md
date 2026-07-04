# Spec: system-augmentation-model
**Size**: medium | **Created**: 2026-07-04 | **Current Phase**: execution:complete

review_passes: 0
<!-- Per-phase review counter for the HARD CAP (1 review + max 1 re-review).
     Reset to 0 on advancing to the tasks phase — the requirements phase
     consumed 1 pass (approve), the design phase consumed 2 passes
     (pass 1 revise → revision 2 → pass 2 approve; cap reached).
     Medium spec: tasks are not reviewed (no Task Review row). -->

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved | review-gate (XD-17 single-shot) | 2026-07-04 |
| Req Review | approve (0 blockers, 4 concerns → carried into design §2) | - | 2026-07-04 |
| Design | approved (revision 2) | review-gate (pass 2/2: approve) | 2026-07-04 |
| Design Review | approve (0 blockers; 1 concern + 2 nits → pinned in tasks.md "Open design concerns") | - | 2026-07-04 |
| Tasks | draft (17 tasks) | - | 2026-07-04 |
| Execution | complete (T-01..T-17) | implementer | 2026-07-04 |

**Verification:**
- `verified_at`: 2026-07-04 (re-verified same day against the tree with
  concurrent specs landed — see re-verification note below)
- `verification_artifact`: `bun run typecheck` exit 0; unit — `bun run test`
  (api 266 pass / shared 45 pass / 0 fail, includes
  `api/__tests__/system-kind-vocabulary.test.ts`) + `cd pwa && bun run test`
  (vitest, 85 files / 257 tests, 0 fail); integration — `bun test:integration`
  with Neo4j + API up: all 5 system-kind suites green
  (`system-kind-{registry,enforcement,import,migration,seed}.integration.test.ts`
  + `openapi.integration.test.ts` + `export-import-roundtrip.integration.test.ts`);
  `bun scripts/design-conformance.ts --view pwa/src/views/explorer/Systems.tsx`
  exit 0 ("clean"). Per-AC:
  - AC-01 → `api/__tests__/system-kind-vocabulary.test.ts`
  - AC-02 → `api/__tests__/system-kind-registry.integration.test.ts`
  - AC-03..AC-06 → `api/__tests__/system-kind-enforcement.integration.test.ts`
  - AC-07 → `api/__tests__/system-kind-import.integration.test.ts`
  - AC-08 + a/b/c/d → `api/__tests__/system-kind-migration.integration.test.ts`
  - AC-09 (as amended, DD-13) → `api/__tests__/system-kind-seed.integration.test.ts`
  - AC-10 (automated) / AC-11 / AC-12 → `pwa/src/__tests__/system-kind-filter.test.tsx`
  - AC-10 (touch, structural) → `pwa/src/__tests__/touch-targets.test.tsx`
  - AC-13 (automated) → `pwa/src/__tests__/system-kind-badges.test.tsx`
  - AC-14 → `bun scripts/design-conformance.ts --view pwa/src/views/explorer/Systems.tsx` exit 0
  - AC-15 → `bun run typecheck` + `openapi.integration.test.ts` +
    `export-import-roundtrip.integration.test.ts` unmodified and green
  - AC-10 (mouse, manual — **pending operator**): open
    `http://127.0.0.1:5173/#/explorer/systems?kind=agentic` in macOS Chrome and
    reload with the mouse — expect only agentic rows and the Agentic control
    shown pressed (`aria-pressed="true"`, primary tone) after reload.
  - AC-10 (touch, manual — **pending operator**): expose the dev PWA via a
    temporary `vite --host` LAN bind (API stays loopback; Vite proxies
    `/api/v1`) — or macOS Safari responsive design mode as fallback — open
    `#/explorer/systems` on iPhone Safari and tap each of the four filter
    controls in turn — expect each tap to activate the intended control
    without mis-taps and the table/chart to narrow.
  - AC-13 (keyboard, manual — **pending operator**): keyboard-only in macOS
    Safari — Tab to `Agentic`, press Enter — verify the table narrows and the
    focus ring stays visible.
  (The three manual legs could not be driven from the execution harness —
  no Chrome-extension/iPhone/Safari automation available; the automated
  structural legs for each are green. `bun run seed:enriched` was run live
  against the tightened schema — 44 nodes PATCHed, 0 errors — confirming
  the N-01 pin.)

**AC-09 verification amendment (DD-13, carried verbatim as the approved
design mandates):** *AC-09 is verified via direct POST of
`shared/seed/retail-mini.json` to `POST /api/v1/import` (the wire path the
graph-core seed contract defined) in
`system-kind-seed.integration.test.ts`; the root seed script's drift is
owned by `_baseline` and is out of this spec's scope.*

**Execution deviations (recorded):**
1. Root script form: `"migrate:system-kind": "bun --cwd api scripts/migrate-system-kind.ts"`
   (without `run`) — the tasks' prescribed `bun --cwd api run scripts/…`
   form is broken under Bun 1.3.9 (prints usage; the pre-existing
   `schema:apply` script has the same defect). The working form mirrors the
   root `seed` script.
2. One file outside the design's file-change table was minimally edited:
   `api/__tests__/chat/tool-cross-section.integration.test.ts` — its
   `resetNodeAttrsToBasic` helper PATCHed `attributes: {}` onto System
   nodes, which is a 400 `attribute_violation` by design post-tightening
   (the enriched fixture's System rows now carry `systemKind`, so the
   helper stopped skipping them). Fixed to reset Systems to the basic-seed
   state `{systemKind: "functional"}`. Flagged for the chat-interface
   surface owner.
3. **Re-verification (2026-07-04, second pass on the concurrent tree):**
   AC-08c's original assertion (`_OntologyEvent` count grows by exactly 1 on
   a fresh-registry `applySchema`) was broken by `model-workspace-core`'s
   bootstrap step 3b (`registerModelSchema`), which legally re-registers its
   4 labels + 5 edges (with their own events) when the test empties the
   registry. Fixed inside this spec's own test file
   (`api/__tests__/system-kind-migration.integration.test.ts`): the
   assertion now proves the actual contract — the seed event fired
   (count strictly grows) AND the migration contributed zero
   patch/backfill rows, detected via its unique `_OntologyVersion` actor
   `"system:migration:system-kind"` (count unchanged). All 7 migration-suite
   tests green standalone and in the full run. No non-owned file touched in
   this pass.
4. Pre-existing integration reds (reproduced identically on the pre-change
   tree via `git stash`; NOT caused by this spec):
   `ontology-bootstrap-reconcile` ("Product" probe label collides with the
   adopted 18-label NODE_LABELS — `node_id_unique_Product` legitimately
   exists after every bootstrap), `ontology-routes` export→import
   round-trip (Entity rows with null fields rejected by ontology-import
   zod), and an intermittent full-suite-only module-load error in
   `ontology-cache.integration.test.ts` (passes standalone).

**Artifacts:**
- 📄 Requirements: `.claude/specs/system-augmentation-model/requirements.md`
- 📄 Design: `.claude/specs/system-augmentation-model/design.md`
- 📄 Tasks: `.claude/specs/system-augmentation-model/tasks.md`
- 📝 Reviews: `.claude/specs/system-augmentation-model/review-requirements.md`, `.claude/specs/system-augmentation-model/review-design.md`

**Consolidated-report lines (carried per tasks.md "Notes for the orchestrator"):**
1. **OQ-1 closed as decided (DD-03)**: import injects `systemKind: "functional"`
   into System rows lacking the key; POST/PATCH stay strict.
2. **AC-09 verification amendment (DD-13)** — verbatim text above.
3. **Shadow `kind` assignment (design-review pass-2 C-01)**: the legacy
   `attributes.kind` read path (`pwa/src/lib/journeyData.ts:189-190`,
   `pwa/src/components/JourneyCanvas.tsx:796`) is NOT the vocabulary; its
   `kind` → `systemKind` migration is assigned to the spec that next owns
   the journey canvas (`ddd-system-modeling` when it touches system
   rendering, else the process-explorer-ui surface owner).

**Next**: operator executes the three pending manual repros (mouse /
touch / keyboard) and appends outcomes here; downstream
`ddd-system-modeling` owns the SystemModeler UI + the shadow-`kind`
read-path migration.
