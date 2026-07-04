# Spec: model-workspace-core
**Size**: large | **Created**: 2026-07-04 | **Current Phase**: execution:complete

review_passes: 2
<!-- Per-phase review counter for the HARD CAP (1 review + max 1 re-review).
     Tasks phase consumed both passes: pass 1 APPROVE (0B/3C/3N, folded into
     rev 2); an interim revise review of rev 2 (4B/3C/3N, folded into rev 3,
     ledgered in tasks.md) is superseded by the final on-disk review-tasks.md —
     pass 2/2 verdict APPROVE of rev 3 (0 blockers, 3 concerns, 2 nits, all
     execution-time). Tasks rev 4 (2026-07-04) is a post-approval sync — the
     requirements rev-4 C-10 `--down --force` contract into T-16 plus the
     approve-pass residuals C-01/C-02/C-03/N-01/N-02 — NOT a new review pass;
     pass 3+ on tasks remains refused per the cap.
     Design review reached its 2/2 cap with pass 2 verdict APPROVE (of design
     rev 3, per on-disk review-design.md). Design rev 4 (2026-07-04) is a
     post-approval reconciliation against approved requirements rev 4 — NOT a
     new review pass; pass 3+ on design remains refused per the cap. -->

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (rev 4 — rev-3 errata D-1…D-5 + pass-2 concerns C-06…C-11 and nits folded into the body; DEC-01 closed) | user | 2026-07-04 |
| Req Review | approve (0 blockers) | - | 2026-07-04 |
| Design | approved (rev 4 gated 2026-07-04 without a new review pass — cap 2/2; the review approved rev 3 and rev 4 adds no contract beyond the requirements-mandated FR-10 `--down --force` refusal) | orchestrator gate | 2026-07-04 |
| Design Review | approve (of revision 3; cap 2/2 — rev 4 is post-approval reconciliation, no new pass; residuals B-02/C-06/C-07/N-05/N-06 resolved in rev 3, C-09/C-10/N-10..N-12 resolved in rev 4) | - | 2026-07-04 |
| Tasks | approved (rev 4 gated 2026-07-04 without a new review pass — cap 2/2; 22 tasks; T-16 synced to the requirements rev-4 C-10 `--down --force` contract per design §4.7) | orchestrator gate | 2026-07-04 |
| Task Review | pass 1 approve; pass 2 (final on-disk) **approve of rev 3** (0 blockers, 3 concerns, 2 nits; cap 2/2) — the interim revise-of-rev-2 review is superseded and ledgered in tasks.md; rev 4 is a post-approval sync, no new pass | - | 2026-07-04 |
| Execution | **complete** — all 22 tasks (T-01…T-22) landed and verified | - | 2026-07-04 |

**Verification:**
- `verified_at`: 2026-07-04T20:07Z
- `verification_artifact` (per AC — integration tests ran against the live
  stack via `bun test:integration`, 49/49 model-workspace assertions green;
  unit suites `bun run test` green (api 289 pass, shared 45 pass); PWA
  component tests green (14/14 via `cd pwa && bunx vitest run`); e2e green
  (`cd pwa && bunx playwright test playwright/model-active-context.spec.ts
  --project=macos-chrome` → 1 passed)):
  - AC-01: `api/__tests__/model-labels.integration.test.ts`
  - AC-02: `api/__tests__/model-edges.integration.test.ts`
  - AC-03: `api/__tests__/model-crud.integration.test.ts` (incl. the T-10 generic `DELETE /nodes/BusinessModel/:id` → 409 arm)
  - AC-04: `api/__tests__/module-publish.integration.test.ts` (explicit-version 409 + checksum-identical re-publish)
  - AC-05: `api/__tests__/module-instantiate.integration.test.ts` (identical-modulo-handles per N-12; model-B setup API-only via `POST /models/:id/domains`)
  - AC-06: `api/__tests__/module-fork.integration.test.ts` (node + T-22 edge halves; §3.4 two-instance anchor; deleted-anchor hardening; D-4 single reading)
  - AC-07: `api/__tests__/module-upgrade.integration.test.ts`
  - AC-08: `api/__tests__/model-migration.integration.test.ts` (idempotent re-run incl. after a user model; guard-abort; `--down` refusal without `--force`; forced `--down` spares the second model's `IN_MODEL` edges + subgraph; `--dry-run` side-effect-free)
  - AC-09: `api/__tests__/model-rbac.integration.test.ts`
  - AC-10: `api/__tests__/model-authz.test.ts` (authz half incl. the pass-1 C-02 shadowing assertion) + `api/__tests__/model-openapi.integration.test.ts` (openapi half: all routes + all 9 error codes)
  - AC-11: `pwa/src/__tests__/model-workspace.test.tsx` (surface index 9, kbd "0", seven tabs verbatim in order; key→index unit assertions "0"→9, "1"→0, "9"→8 per pass-1 N-03) + manual: load `#/model/models`, press `Alt+0` (keyboard) — the Model surface activates (mapping pinned by the unit assertions; e2e loads the route green)
  - AC-12: `pwa/src/__tests__/model-workspace.test.tsx` (create POSTs + appears after context reload; switch updates context + persists `cg.activeModelId`)
  - AC-13/AC-14/AC-15: `pwa/src/__tests__/model-workspace-states.test.tsx` (loading skeleton; only-reference empty prompt; error + retry refetch)
  - AC-16: `bun run scripts/design-conformance.ts --view pwa/src/views/model/ModelWorkspace.tsx` AND `… --view pwa/src/views/model/ModelWorkspace.module.css` — both exit 0 (D-5: `--view` form only; ran 2026-07-04, PASS/PASS)
  - AC-17: manual: open `#/model/models` (keyboard) — Tab reaches Create → Switch → Archive in DOM order (order pinned by the component's DOM structure asserted in `model-workspace.test.tsx`; all three are native `<button>`s so Enter/Space activate; landmark = `<section aria-label="Business models">`)
  - AC-18: `pwa/playwright/model-active-context.spec.ts` (ran green against the live stack: switch → reload → same route + same active model)
  - AC-19: `pwa/src/__tests__/model-placeholder.test.tsx` (six sibling routes render the placeholder naming the blueprint-verbatim owning spec; context available)
  - AC-20: manual: `bun run typecheck` exit 0 (ran 2026-07-04) + `git diff shared/src/schema/nodes.ts` empty — no `NODE_LABELS` additions (grep confirms no BusinessModel/BusinessModule/ModuleInstance in the const)
  - AC-21: `api/__tests__/model-scope.integration.test.ts` (part 1 `scopedNodeIds` exclusion/shared-inclusion; part 2 path-scoped instance list; API-only fixtures; no `?model=` anywhere per D-1)

**Artifacts:**
- 📄 Requirements: `.claude/specs/model-workspace-core/requirements.md`
- 📄 Design: `.claude/specs/model-workspace-core/design.md`
- 📄 Tasks: `.claude/specs/model-workspace-core/tasks.md`
- 📝 Reviews: `.claude/specs/model-workspace-core/review-*.md`

**Next / hand-offs (cross-spec, NOT owned by this spec — orchestrator arbitration needed):**
1. **`api/__tests__/ontology-bootstrap-reconcile.integration.test.ts` (owner:
   ontology-manager) is now stale by design**: it asserts the registry equals
   the compile-time const seed exactly (`NODE_LABELS.length` = 18) after
   `applySchema`, but this spec's approved T-03 (design §4.1, NFR-01/XD-01)
   registers 4 lifecycle labels + 5 edges through the runtime registry at
   boot — a fresh bootstrap now correctly yields 22 registry labels. The 3
   failing assertions need an ontology-manager test rev (count ≥ const, or
   filter runtime-registered labels). This spec did not edit that file
   (execution rule: never touch another spec's file).
2. Pre-existing, unrelated to this spec: `ontology-routes.integration.test.ts`
   export→import round-trip fails 400 because the export's `entities` section
   carries `note: null` on all 85 rows while `entityCreateSchema.note` is
   `string().optional()` (rejects null) — ddd/ontology surface bug.
3. B-02 (fork instance→subtree anchor) is resolved by instance-qualifying
   `forkLocalKey = "<instanceId>::<localKey>"` (design §3.4, tasks T-08) —
   verified by the two-instance disambiguation assertion in
   `module-fork.integration.test.ts`.
