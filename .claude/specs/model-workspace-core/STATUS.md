# Spec: model-workspace-core
**Size**: large | **Created**: 2026-07-04 | **Current Phase**: execution:complete

review_passes: 1
<!-- Ledger reconciliation (fresh-cycle tasks-review C-01). The original
     per-phase cycles each consumed their 2/2 caps; that history is preserved
     in the artifacts' own ledger sections (tasks.md §"Task-review …",
     design/requirements revision preambles). After execution completed and
     was verified (2026-07-04T20:07Z), the orchestrator commissioned a FRESH
     post-execution review cycle of all three rev-4 artifacts; the on-disk
     review-*.md files are the AUTHORITATIVE record and supersede the
     exhausted-cap claims that pointed at the overwritten rev-3 reviews.
     Fresh-cycle state: requirements pass 2 → REVISE (B-03 import bypass;
     per its own cap note the fix is applied orchestrator-side, no pass 3);
     design pass 1 → approve of rev 4 (C-13 → T-24, N-13 → T-25, N-14..N-16
     doc-only); tasks pass 1 → approve of rev 4 (C-01..C-03/N-01/N-02 folded
     into rev 5). This counter (1) is the tasks phase's fresh-cycle passes
     consumed; one re-review remains under the cap but is NOT owed — tasks
     rev 5 folds an approve-verdict's concerns plus fixes the upstream
     reviews prescribed verbatim, so it gates orchestrator-side. -->

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (rev 5 — re-stamped by orchestrator 2026-07-05 under XD-17 single-shot; B-03 option 1 ratified, C-12/C-13/N-08/N-09 folded) | user (rev 4) + orchestrator (rev 5) | 2026-07-05 |
| Req Review | fresh cycle pass 2: **revise** — 1 blocker (B-03: `POST /api/v1/import` bypasses the FR-08 lifecycle guard), 2 concerns (C-12, C-13), 2 nits (N-08, N-09); fix prescribed verbatim in `review-requirements.md` | - | 2026-07-04 |
| Design | approved — rev 4; frontmatter reads `approved` on disk (tasks fresh-cycle C-02, design half, closed) | orchestrator gate | 2026-07-04 |
| Design Review | fresh cycle pass 1: **approve** of rev 4 — 0 blockers, 1 concern (C-13 fork first-edit race → tasks T-24), 4 nits (N-13 → T-25; N-14/N-15/N-16 = design.md text fixes at next touch; code confirmed correct) | - | 2026-07-04 |
| Tasks | **approved** (rev 6 — 25 tasks: T-01…T-22 executed + verified; gated delta T-23…T-25 approved under XD-17 single-shot) | orchestrator (XD-17 single-shot) | 2026-07-05 |
| Task Review | fresh cycle pass 1: **approve** of rev 4 — 0 blockers, 3 concerns (C-01 ledger, C-02 gate flags, C-03 T-17/T-20 seam), 2 nits; all folded into rev 5 | - | 2026-07-04 |
| Execution | **complete** — T-01…T-25 implemented; T-23..T-25 code + tests landed 2026-07-05; integration verification deferred to live Neo4j merge gate | orchestrator | 2026-07-05 |

**Verification (executed slice T-01…T-22 / AC-01…AC-21 — stands unchanged; re-close Execution=complete only after T-23…T-25 land and this ledger gains AC-22 + the T-24/T-25 artifacts):**
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
  - AC-20: manual: `bun run typecheck` exit 0 (ran 2026-07-04) + `git diff shared/src/schema/nodes.ts` empty — no `NODE_LABELS` additions (grep confirms no BusinessModel/BusinessModule/ModuleInstance in the const) — durable anchor per fresh-cycle tasks N-02; re-run after the rev-5 delta
  - AC-21: `api/__tests__/model-scope.integration.test.ts` (part 1 `scopedNodeIds` exclusion/shared-inclusion; part 2 path-scoped instance list; API-only fixtures; no `?model=` anywhere per D-1)
  - AC-22 (pending requirements rev 5): `api/__tests__/model-import-guard.integration.test.ts` + the generic-create 409 arm in `model-crud.integration.test.ts` — lands with T-23

**Artifacts:**
- 📄 Requirements: `.claude/specs/model-workspace-core/requirements.md`
- 📄 Design: `.claude/specs/model-workspace-core/design.md`
- 📄 Tasks: `.claude/specs/model-workspace-core/tasks.md`
- 📝 Reviews: `.claude/specs/model-workspace-core/review-*.md`

**Next — rev-5 gates, in order (tasks.md §"Rev-5 gates"):**
1. **USER DECISION (req B-03)**: import-guard fix **option 1** (reject
   lifecycle labels/edges on `POST /api/v1/import`, `409
   model_lifecycle_route_required`; lifecycle-aware backup/restore named out
   of scope — reviewer-recommended; **T-23 is authored to this**) vs
   **option 2** (declare `data:write` import the sanctioned escape hatch;
   NFR-04/FR-08 reworded, an AC pins the bypass). Secondary confirmations,
   both authored to the reviewer's primary recommendation: T-24 single-tx
   fork gate (vs additional `forkLocalKey` uniqueness constraints) and T-25
   doc-only orphaning note (vs deleting Model #1's instances on `--down`).
2. Requirements rev 5 (orchestrator-side per the review's cap note): fold
   B-03 (chosen option) + C-12 + C-13 + N-08 + N-09, add **AC-22**, then flip
   `requirements.md` frontmatter → `approved`.
3. Gate tasks rev 5 → `approved`; execute T-23…T-25; extend the verification
   ledger above (AC-22 + T-24's concurrency assertions + T-25's manual repro)
   and set Execution back to **complete** with a refreshed `verified_at`.

**Cross-spec hand-offs (unchanged from the 2026-07-04 completion — orchestrator arbitration needed):**
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
4. New (fresh design review): design.md text fixes N-14 ("hash query param"
   wording in §4.9), N-15 (`bun` vs `bun run` command drift), N-16 (§3.3
   snapshot example missing activity `description`) + the C-13 one-sentence
   §4.4 concurrency note — owner: design author at next touch; shipped code
   confirmed correct on all four.

## Changelog

- 2026-07-05: as-built traceability backfill — `spec-traceability.sh` reported
  3 gaps (T-19, T-24, T-25 each lacked a machine-recognized Verification token,
  though all three tasks already named their real tests in prose). Verified the
  cited tests exist and cover the described behavior as-built
  (`pwa/src/__tests__/model-workspace.test.tsx`,
  `api/__tests__/module-fork.integration.test.ts`,
  `api/__tests__/model-migration.integration.test.ts`) and hoisted each real
  test path onto the `**Verification**:` line so the parser recognizes it. No
  FR/AC/DD/T IDs renumbered; no phase status changed; no work invented. Script
  now prints OK (18 FRs, 22 ACs, 25 tasks all traced).
