---
feature: "business-model-authoring"
reviewing: "tasks"
reviewing_revision: 5
reviewer: "spec-review-agent (fresh reviewer; did not author)"
verdict: "approve"
review_pass: 2
reviewed_at: "2026-07-05"
upstream_checked:
  - "requirements.md rev 3 (on disk, status revised; DD-06 amendment pending ratification — correctly held as Execution precondition #2)"
  - "design.md rev 4 (§3.1–3.5, §4.1–4.9, §5.0–5.3, §6, §7, §8 all present and cited accurately by the task bodies)"
  - "prior review-tasks.md (pass 1 on rev 4, verdict revise) — every B/C/N re-verified against the rev-5 bodies by grep"
  - "blueprint.md (View Tree :101/:112 #/model/canvas → ModelCanvas, owner business-model-authoring; UX-01..06; XD-13 :168, XD-18 :173)"
  - ".claude/CLAUDE.md house rules"
  - "on-disk: api/src/{router,ids,errors}.ts, routes/{import,models,stories}.ts, storage/model-scope.ts, auth/rbac-permissions.ts, scripts/seed-rbac-roles.ts, api/__tests__/{model-authz,story-authz}.test.ts + helpers/model-fixtures.ts, pwa/src/api.ts, pwa/src/views/index.tsx, pwa/src/components/{Typeahead,JourneyCanvas}.tsx, pwa/src/context/ActiveModelContext.tsx, shared/src/schema/{nodes,model-workspace}.ts, scripts/design-conformance.ts, .claude/hooks/spec-completion-check.sh, package.json (typecheck)"
---

# Review: business-model-authoring / tasks (pass 2/2 on rev 5)

## Verdict

**approve** — zero blockers. Revision 5 does what revision 3 only claimed:
every pass-1 finding is applied **in the task bodies** and I verified each by
grepping the body text, not the preamble. The document layout is now the one
binding execution order (T-11 physically sits after T-18; T-10 is blocked by
T-11 and runs green at its own checkpoint), the PWA client instructions match
`pwa/src/api.ts` as it exists on disk, and T-12 is scoped to a test that can
actually pass locally. One new concern (C-01, T-12 assertion (e)) and two
nits are recorded for execution; none blocks.

## Prior findings (pass 1 on rev 4) — status in rev 5

| Finding | Status | Verified how |
|---------|--------|--------------|
| ~~B-01~~ (PWA client wall) | → **resolved** | T-06's Steps name the standalone exports `models`/`stories` and sanction exactly three `json<T>` wrappers (`modules.list`, `models.createDomain`, `models.createInstance`); binding carry-forwards row **TR2-B-01** exists; grep for `api.models.*`/`api.modules.*`/`api.stories.*` in the bodies finds only negative statements ("there is **no** … spelling") and preamble history — T-08 uses `models.createDomain`/`models.list()`/`modules.list()`/`models.createInstance`, T-09 uses the standalone `stories.bootstrap`/`stories.*`/`stories.acs.*`, T-14 uses `stories.list(modelId)`. On disk (`pwa/src/api.ts`): `models` export (:1243 — `list/get/create/patch/archive/remove/listInstances`, **no** `createDomain`/`createInstance`, so no collision), `stories` (:1306, incl. `bootstrap` :1337, `acs` :1344), **no `modules` export**, `api.search` (:119) — all exactly as T-06 states |
| ~~B-02~~ (two contradictory orders; T-10 checkpoint) | → **resolved** | Document order is now T-01→T-02→T-03→T-04→T-05→T-18→**T-11**→T-06→T-07→T-08→T-09→T-10→T-12→T-13→T-19→T-14→T-15→T-16→T-17 — T-11 directly after T-18 as the Reading guide states; the checkpoint caveat covers exactly T-04/T-05/T-18 and explains why T-10 needs none; T-10's `Blocked by` includes T-11. Document order is a valid topological order of every declared `Blocked by` edge (checked all 19 tasks; acyclic) |
| ~~B-03~~ (T-12 unrunnable as specified) | → **resolved** | T-12's assertions (a)–(e) are the `getRoutePermission → hasPermissionByRbac` composition pattern of `api/__tests__/model-authz.test.ts` (verified on disk — that file imports exactly those two symbols plus `isPublicRoute` and asserts allow/deny over permission arrays); the "full run succeeds" + Step-4 `query/search` clause now lives in T-10's real-Neo4j file; the design §8 AC-10 live-HTTP over-claim is recorded as a Deviations row (review cap 2/2 spent — the mechanism pass 1 prescribed). See new C-01 for a residue inside assertion (e) |
| ~~C-01~~ (T-15 Files line) | → **resolved** | T-15 Files lists all 4 (`toJourneyData.ts`, its test, `ModelCanvas.tsx` modify, `model-canvas.test.tsx` modify) with the soft-cap breach noted |
| ~~C-02~~ (T-19 assertion (2) unfalsifiable) | → **resolved** | Reworded to what the server-side file proves (instances exist; structure readable via `authoring/graph`; the clone script itself issues no `authoring/apply`; `409 model_lifecycle_route_required` guard intact — code exists, `api/src/errors.ts:44`); the UI-side "only these routes" claim is explicitly delegated to T-08's fetch-intercepting component test |
| ~~C-03~~ (citation drift) | → **resolved** | Bodies cite symbols; Execution preconditions #1 carries the one-time re-verify policy ("trust the symbol, never a stale line number"). Residual stale numbers exist (see N-02) but are exactly the class the policy covers |
| ~~N-01~~ (T-14 phantom T-16 edge) | → **resolved** — T-14 Blocks is `T-15, T-17` |
| ~~N-02~~ (git diff in T-13's test) | → **resolved** — T-13 keeps the `ERROR_CODES` membership assertion; the `git diff api/src/errors.ts` guard is re-homed to the final validation sweep (checkpoint table, last row) |
| ~~N-03~~ (over-constrained edges) | → **resolved** — T-07 `Blocked by: T-01` only; T-13 dropped the redundant T-18 edge |

## Blockers

None.

## Concerns

- **C-01 — T-12 assertion (e) cannot assert what it names: `RBAC_ROLES` is
  module-private, so "the seeded `business_architect` set" is not readable by
  a unit test.** Verified on disk: `api/src/scripts/seed-rbac-roles.ts:4` is
  `const RBAC_ROLES = [` with only `seedRbacRoles` exported (:201), and the
  cited precedents (`model-authz.test.ts` :70–77, `story-authz.test.ts`
  :60–71) assert `hasPermissionByRbac` over **hardcoded** permission arrays —
  they never read the seed. So (e) as written ("the seeded
  `business_architect` set contains all four exercised families … asserted
  via `hasPermissionByRbac` over the role's permission list") will in
  practice test a hand-copied replica of the seed literals, which passes even
  if the seed later drops a family — it proves `hasPermissionByRbac`
  semantics, not seed content. T-12's own parenthetical acknowledges the
  privacy but not the consequence.
  **Recommendation (execution-time, no re-review needed):** either (i) add
  the one-line `export` of `RBAC_ROLES` (or a `getRbacRoles()` accessor) to
  `seed-rbac-roles.ts` and list that file in T-12's Files (3 files, note the
  breach like T-14/T-15 do), asserting the four families against the real
  const; or (ii) keep the file untouched and reword (e) to what the replica
  proves ("the four families the wizard exercises are each accepted by
  `hasPermissionByRbac` for the permission set documented at the
  `business_architect` seed entry — literals pinned by comment to
  `seed-rbac-roles.ts`"), leaving live proof to T-10's full run. Either is a
  one-task-local edit; AC-10's substance is unaffected.

## Nits

- **N-01 — Blocks/Blocked-by bookkeeping asymmetries (harmless).**
  T-01 `Blocks` lists T-05, but T-05's `Blocked by` is only T-04 (T-01 is
  transitive via T-04); T-04 `Blocks` lists T-18, but T-18's `Blocked by` is
  T-01/T-05 (transitive via T-05); T-05 `Blocks` lists T-14, but T-14's
  `Blocked by` is T-07/T-08/T-09 (transitive via T-08). Document order
  satisfies every edge from either side, so nothing mis-sequences — optional
  tidy only.
- **N-02 — Residual stale line numbers, all inside the sanctioned policy.**
  `models`/`stories` cited at `api.ts:1099`/`:1162` (on disk today :1243/
  :1306), `ModuleInstance` pins at `model-scope.ts:33` (on disk :32). Every
  symbol resolves; the Execution-preconditions citation policy already
  instructs the one-time grep sweep and forbids trusting the numbers — no
  edit required, just flagging what that sweep will catch.

## Completeness / traceability

| Check | Result |
|-------|--------|
| Every FR reaches a task | **pass** — FR-01..FR-14 + NFR-01..06 all mapped in the traceability table; FR-10 correctly deferred as `should` (NFR-06, blueprint Risks row 6) with AC-15's manual repro recorded |
| Every AC closed by a task with a verification artifact | **pass** — AC-01..AC-20 each have a deterministic owning artifact (map at the foot of tasks.md, cross-checked against requirements rev 3's AC table and design §8's artifact names — file paths agree everywhere); every task carries a test path or `manual:`/CLI with input mode + observable outcome, satisfying `.claude/hooks/spec-completion-check.sh` (verified: the hook greps `verification_artifact`) |
| Design §7 File Changes ↔ tasks | **pass** — all 18 rows owned: T-01 (shared schema), T-02 (import.ts export), T-04/T-05/T-18/T-11 (routes/authoring.ts), T-11 (router.ts), T-12 (rbac-permissions.ts), T-13 (openapi.ts), T-14 (views/index.tsx, ModelCanvas.tsx+css, wizard.module.css), T-07 (wizardModel.ts), T-15 (toJourneyData.ts + ModelCanvas ready state), T-08/T-09 (five step components), T-06 (pwa/src/api.ts). No task file outside the design's list except sanctioned test files |
| Routes/views match the blueprint View Tree verbatim | **pass** — `#/model/canvas` → `ModelCanvas` (blueprint :101/:112); T-14's registration replaces the on-disk `ModelTabPlaceholder` dispatch (`pwa/src/views/index.tsx:163`) and touches neither `route.ts` nor `SURFACES`; all API routes under `/api/v1/`; no invented/renamed route |
| UX-* allowances | **pass** — UX-01 four states (T-14, AC-12/13/14); UX-02 tokens + catalog + per-file `design-conformance --view` checkpoints (T-08/09/14/15; `--view` verified as the enforced mode in the script); UX-03 honoured (no new gesture handler in `must`; FR-10 drag deferred); UX-04 no new breakpoints; UX-05 keyboard/ARIA (T-14 + AC-17 manual with input mode); UX-06 deep link + active-model reload (T-17) |
| XD-* honoured | **pass** — XD-13 clone via module instantiation only (T-08 UI + T-19 server, `409` guard asserted intact); XD-18 proven by a real-Neo4j integration test (T-10 — AC-06 with the `scopedNodeIds` membership assertion); central-gate auth only (T-04/T-18 step 1 "no handler auth check", T-12 rows; no per-route auth); zod-only (T-01); no new label/edge/store/permission (T-01 DTO-only, T-04 payload constraints, AC-20 final sweep) |
| Dependency order | **pass** — acyclic; document order is a valid topological order of all declared edges **and** now matches the Reading guide's stated order (pass-1 B-02 closed); T-04/T-05/T-18's authored-then-run-at-T-11 caveat is precise |
| On-disk interface claims | **pass** — every symbol the tasks lean on verified: `generateId` (`ids.ts:4`), `realImport` private at `import.ts:157` + `handleImport` use :82, `scopedNodeIds` (`model-scope.ts:22`) with `ModuleInstance` pins, router delegate blocks + `query/search` dispatch, all five reused `ERROR_CODES` + `model_lifecycle_route_required`, rbac rows `models/:id/domains` POST :276 / `module-instances` :278 / `stories/bootstrap` :294 (T-12's PATCH row param style matches its nearest neighbor as claimed), `business_architect` seed with `model:*`/`module:*`/`story:*`/`query:read`, `LayoutMode` incl. `"chain"`/`"multi"` + `JourneyData` shape in `JourneyCanvas.tsx`, `Typeahead label` prop calling `api.search(label, q, 20)`, `useActiveModel`, `typecheck` script, `isReference` in `shared/src/schema/model-workspace.ts` |
| Execution preconditions | **pass** — the DD-06/requirements-rev-3 ratification gate is correctly BLOCKING with a defined fallback (T-18 + third rbac/openapi entries fall away, design re-cut — "do not improvise"); the Deviations table gives the orchestrator everything needed to land the amendment without ID renumbering |

## What is done well

The carry-forwards table is now genuinely binding (TR2-B-01 landed as a row,
not history); T-04's seven-step apply with DD-09 orphan semantics + the
DR3-N-01 label check, T-16's read/write/recovery isolation suite, and the
superseded-instructions block are execution-grade and unusually hard to
misread. The Deviations table's AC-10 rescope row is the correct use of the
mechanism given the spent design-review cap.

## Summary

Rev 5 closes all three pass-1 blockers and all concerns/nits in the bodies,
verified by grep and against the working tree. Zero blockers remain. C-01
(T-12's assertion (e) vs. the module-private `RBAC_ROLES`) and the two nits
are recorded for execution and need no further review pass. Approved for
execution, gated only by the already-stated precondition: requirements rev 3
(DD-06 amendment) ratification + design rev 4 acceptance before T-01 starts.
