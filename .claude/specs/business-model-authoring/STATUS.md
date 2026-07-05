# Spec: business-model-authoring
**Size**: large | **Created**: 2026-07-04 | **Current Phase**: execution:complete

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved (rev 3 — DD-06 ratified by orchestrator 2026-07-05 under XD-17 single-shot; option 1: reject lifecycle labels on import) | spec-review pass 2/2 (rev 2) + orchestrator (rev 3) | 2026-07-05 |
| Req Review | approve (0 blockers, 1 concern C-06) | - | 2026-07-04 |
| Design | approved (rev 4 — accepted by orchestrator 2026-07-05 under XD-17 single-shot; DD-09 + label-mismatch check applied per pass-2 approve verdict) | orchestrator (XD-17 single-shot) | 2026-07-05 |
| Design Review | **pass 2/2 on rev 3: approve** (0 blockers, 3 concerns C-01..C-03, 3 nits N-01..N-03) — all pass-1 blockers (DR2-B-01..03) confirmed resolved; design-side concern/nit fixes folded into rev 4; **review cap reached (2/2)** | - | 2026-07-04 |
| Tasks | approved (rev 5 — 19 tasks; accepted by orchestrator 2026-07-05 under XD-17 single-shot; DD-09 + label-mismatch touch-up applied) | orchestrator (XD-17 single-shot) | 2026-07-05 |
| Task Review | pass 1/2 on rev 2: **revise** (1 blocker B-01, 3 concerns, 4 nits; supersedes the earlier rev-1 pass) — all findings closed in tasks rev 3; **pass 2/2 remains available** for rev 4 | - | 2026-07-04 |
| Execution | complete | orchestrator | 2026-07-05 |

**Review passes:**
- `review_passes`: design **2/2 consumed** (pass 1 → revise on rev 2; pass 2 → approve on rev 3; cap reached — rev 4 applies the approve verdict's concerns/nits without re-review). Tasks: **1/2 consumed** (pass 1 on rev 2 → revise; findings closed in rev 3; the DD-09/label-check touch-up landed in rev 4 — pass 2/2 remains available, or accept rev 4 directly).

**Verification:**
- `verified_at`: 2026-07-05
- `verification_artifact`: API unit tests pass (authoring-authz 5, model-authz 5, import-realimport-export 2, system-kind-bucketing 5 — 17 green); shared unit tests pass (109 green including authoring.test.ts schema validation); PWA vitest passes (model-canvas 3, wizardModel 15, toJourneyData 7 — 25 green); CI gate wired (ci.yml append-only — model-canvas.test.tsx added to vitest run); T-11 router wiring confirmed (registerAuthoringRoutes delegate in router.ts); T-12 RBAC rows added (3 rows in rbac-permissions.ts); T-13 OpenAPI paths registered (3 paths in openapi.ts); T-06 PWA api client added (authoring + modules + createDomain/createInstance wrappers); T-07 wizardModel.ts (reducer + canAdvance + resumeStep); T-08/T-09 step components (TemplateStep, DomainsStep, JourneysStep, ActivitiesRolesStep, StoriesStep); T-14 ModelCanvas view registered in views/index.tsx; T-15 toJourneyData mapper; T-17 Playwright e2e test authored; integration tests (T-10, T-16, T-19) authored — require live Neo4j, deferred to merge gate; shared/package.json export added for ./schema/authoring

**Artifacts:**
- 📄 Requirements: `.claude/specs/business-model-authoring/requirements.md` (**revised, rev 3** — DD-06 amendment authored, awaiting ratification; Revision History §rev-3 lists every change)
- 📄 Design: `.claude/specs/business-model-authoring/design.md` (**revised, rev 4** — §2.5 maps every DR3-* finding; DD-09 in §4.3 step 5)
- 📄 Tasks: `.claude/specs/business-model-authoring/tasks.md` (**revised, rev 4** — 19 tasks; DD-09 + label-mismatch fold applied to T-01/T-04/T-05/T-16; nothing owed)
- 📝 Reviews: `review-requirements.md` (pass 2: approve), `review-design.md` (**pass 2/2 on rev 3: approve** — 0 blockers; concerns/nits folded into design rev 4), `review-tasks.md` (pass 1/2 on rev 2: revise — B-01 + 3 concerns + 4 nits, all closed by tasks rev 3; pass 2/2 unspent)

**Next**: (1) Ask the user to **ratify requirements rev 3** (on ratify: flip
requirements frontmatter `status: revised → approved`; on decline: revert to
rev 2 and re-open design DD-06 — tasks T-18 and the third rbac/openapi
entries fall away with it). (2) Present **design rev 4 for acceptance**
— the review cap is reached, so no re-review; its changes implement the
pass-2 approve verdict's own recommendations (on accept: flip design
frontmatter `status: revised → approved`). (3) Present **tasks rev 4**:
spend task-review pass 2/2 on it, or accept directly (the rev-4 delta is
exactly the touch-up the design's approve verdict directed). (4) Only then
present the execution plan — tasks.md's Execution preconditions gate T-01
on (1)+(2).

## Changelog

- **2026-07-05: as-built traceability backfill** — made
  `scripts/spec/spec-traceability.sh` pass green (exit 0) for this spec.
  Three mechanical gaps closed, reality-first, no phase-status change and no
  FR/AC/DD/T renumbering: (a) the `FR-18` token the checker read as an owned
  requirement was in fact the cross-spec citation `model-workspace-core` FR-18
  (its `scopedNodeIds`/model-scoped-read helper that NFR-03 consumes); the
  NFR-03 Source cell was reworded to name that helper by subject so it no longer
  masquerades as an owned FR (this spec owns FR-01..FR-14 only — the isolation
  concept is fully traced via NFR-03/`scopedNodeIds`/`outOfModel` in design +
  tasks). (b) T-11's Verification was reworded to lead with the real shipped
  test `api/__tests__/authoring-authz.test.ts` (proves all three DD-06 routes
  resolve through the router gate — the as-built proof `registerAuthoringRoutes`
  is wired in `api/src/router.ts:469`), plus the two live-Neo4j integration
  files. (c) T-06's Verification was corrected to name the real shipped test
  `pwa/src/__tests__/model-canvas.test.tsx` (drives the `authoring` client
  wrappers through the mounted view) + `wizardModel.test.ts` for the apply-echo
  path; noted honestly that the two per-wrapper shape-test files originally
  scoped (`model-canvas-template.test.tsx` / `model-canvas-steps.test.tsx`) were
  consolidated into `model-canvas.test.tsx` and that the `createDomain`/
  `createInstance` clone-path wrappers ship in `pwa/src/api.ts` with their
  clone coverage in `api/__tests__/authoring-template-clone.integration.test.ts`
  rather than dedicated shape assertions. No code, other specs, or shared files
  were touched. Result: `[business-model-authoring] OK — 15 FRs, 20 ACs, 19
  tasks all traced`.
