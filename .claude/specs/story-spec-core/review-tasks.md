---
feature: "story-spec-core"
artifact: "tasks.md (revision 3)"
reviewing: "tasks"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-04"
review_pass: "2 of 2 (re-review after pass 1 verdict: revise against rev 2)"
upstream:
  requirements: "rev 3 (2026-07-04, approved)"
  design: "rev 3 (2026-07-04, review-design.md pass 2/2 = approve)"
---

# Review: story-spec-core tasks.md (rev 3)

## Summary

Rev 3 lands every pass-1 finding, and every fix survives verification against
the actual code. The B-01 fix is the load-bearing one and it is **sound**:
`route(req)` is exported at `api/src/router.ts:259` (the exact function
`Bun.serve` wraps); the `ONELOGIN_ISSUER` check at `router.ts:334` is
**per-request** (not import-time), so setting the env var in the test process
flips the gate onto the real path — cookie parse (`:340`) → `getSession`
(`:348`) → `getRoutePermission` (`:357`) → `hasPermissionByRbac` (`:360`) →
403/attach. `createSession` (`oauth.ts:151`) and `getSession` (`oauth.ts:178`)
both go through the **same** `getSessionStorage()` singleton with symmetric
in-memory fallback, so a same-process mint-then-resolve is coherent in every
configuration (Redis stub or Map). The jose JWKS set is lazily constructed
only inside the OAuth-callback verify path (`oauth.ts:139-144`), so a fake
issuer value (`"https://test.invalid"`) triggers no network fetch on import or
dispatch. `seedRbacRoles()` in-test has exact precedent
(`model-rbac.integration.test.ts:21`), and handlers self-acquire the driver
via `getDriver()`, so in-process dispatch needs no server co-process — and CI
boots the API server anyway (`.github/workflows/ci.yml:79-88`), so the
registry/labels are applied to the shared Neo4j before the suite runs. T-17
as pinned in D-6 is genuinely end-to-end with no production-code change.

The other pass-1 items are equally clean: T-11's verification now matches the
`model-authz.test.ts` unit pattern clause-for-clause with the e2e 403/200
moved to T-17 step 6 (D-7); the C-06 deferred first-run gate appears in the
reading guide, in each of T-05/T-06/T-07, at T-09's checkpoint, and in the
validation-checkpoints table; T-02 pins `registerStorySchema` as step 3c
before the step-4 registry iteration (verified: `registerModelSchema` at
`bootstrap.ts:63`, step-4 iteration at `:65-76` — the pin is exactly what
prevents the deferred-constraint failure mode); T-03 fixes the stale
`errors.ts:1-2` header (verified the false `envelope.test.ts` claim is still
there today); AC-12/13/14 ownership is unambiguous (T-15 sole closer, T-14
"implements-but-does-not-close").

I recomputed the 17-task dependency graph from scratch: `Blocks` is the exact
inverse of `Blocked by` at every node, the graph is acyclic, and top-to-bottom
order is a valid topological order. All other rev-3 claims spot-checked true:
`stories` placeholder at `pwa/src/views/index.tsx:158` with the
`(route: Route) => ReactNode` dispatch signature T-14 relies on;
`register:model` at root `package.json:17`, `typecheck` at `:19`;
`business_architect` at `seed-rbac-roles.ts:96`; the `input.id !== undefined`
collision short-circuit in `storage/edges.ts`; `#/model/stories` →
`StoryCatalog` verbatim at blueprint lines 102/113.

What remains are two new concern-level gaps in the **verification harness**
(not in the tasks' content): the pwa component tests run under vitest and are
CI-gated per-file by house precedent, which no task wires up; and the
integration suite selects tests by the `integration:` **name prefix**, a
convention the tasks never state. Both are one-line fixes an executor can
land without design change. Zero blockers → approve with concerns recorded.

## Findings

### Resolved from pass 1

- ~~B-01~~ (T-17 session transport unimplementable) → **resolved** via D-6 +
  the new pinned-decision row: in-process `route()` dispatch, same-process
  `createSession`, `ONELOGIN_ISSUER` set. Verified feasible against
  `router.ts:259/334/340-366`, `oauth.ts:139-192` (symmetric session-storage
  singleton, lazy JWKS), `model-rbac.integration.test.ts:21`, and the CI
  server boot. §4.12's persona/fixture/assertions stand untouched; only the
  transport clause is erratum'd, exactly as pass 1 asked.
- ~~C-05~~ (T-11 full-HTTP 403 not locally reproducible) → **resolved**:
  T-11's verification is now the `model-authz.test.ts` pattern (non-null
  `getRoutePermission` for all ten rows, `hasPermissionByRbac` allow/deny
  composition, seeded role contains both `story:*`, `isPublicRoute` false);
  literal 403/200 statuses live in T-17 step 6; AC-09 wording rides the
  register as D-7.
- ~~C-06~~ (T-05/T-06/T-07 route-level tests unsatisfiable at their own
  checkpoint) → **resolved**: reading-guide "deferred first-run gate" bullet +
  per-task notes + T-09 checkpoint runs all three + the exception row in the
  validation-checkpoints table.
- ~~C-07~~ (`registerStorySchema` insertion point) → **resolved**: T-02 pins
  step 3c, strictly before the step-4 registry iteration, with the step-3b
  rationale comment and an explicit "do not append at the end" anti-pattern.
- ~~N-03~~ (stale `errors.ts` header) → **resolved**: T-03 rewords it in
  passing (task already touches the file).
- ~~N-04~~ (AC-12/13/14 double ownership) → **resolved**: T-15 sole closer.

### Blockers

None.

### Concerns

**C-08 — The three pwa vitest files (AC-10…AC-14's artifacts) run under
vitest, not `bun test`, and no task adds them to the CI per-file gate.**
Two halves. (a) *Runner*: `pwa/src/__tests__/setup.ts` imports from `vitest`
and the suite runs via `vitest run` (`pwa/package.json:10`); the
validation-checkpoints table's generic "the task's listed test
(`bun test <path>` / `bun test:integration`)" does not hold for
T-14/T-15's `story-catalog.test.tsx` / `story-detail.test.tsx` /
`story-catalog-states.test.tsx` — the working invocation is
`bunx vitest run src/__tests__/<file>` from `pwa/` (and Playwright for T-16).
(b) *CI gate*: `scripts/test-unit.sh` sweeps only `api/` and `shared/`; CI
gates pwa component tests by **explicit file list** (house precedent:
kpi-okr-governance T-20 / its review C-02, `.github/workflows/ci.yml:18-24`).
No story-spec-core task touches `ci.yml`, so AC-10…AC-14 would never gate
merge, and the final-sweep checkpoint ("`bun test` + `bun test:integration`")
never executes them either.
*Recommendation:* (a) add a row to the validation-checkpoints table: tasks
touching `pwa/src/__tests__/` verify with `bunx vitest run <file>`
(cwd `pwa/`); (b) add the three files to the `ci.yml:23` vitest step —
cleanest as a one-line addition to T-15's Files/Steps (it is the states-test
task and last of the three), mirroring the kpi-okr precedent comment.

**C-09 — Integration-suite selection is name-based and the tasks never state
the `integration:` describe-prefix convention.** `scripts/test-integration.sh`
runs `bun test --test-name-pattern '^integration:'`; `scripts/test-unit.sh`
excludes `*.integration.test.ts` at the **file** level. A new
`*.integration.test.ts` whose `describe` is not titled `integration: …` runs
in **neither** suite — silently green everywhere. The tasks author nine such
files (T-02 ×2, T-05 ×2, T-06, T-07, T-10, T-12, T-17) and never mention the
prefix; every existing neighbor uses it (e.g. `model-crud.integration.test.ts:44`),
so an executor copying a neighbor is probably safe, but the failure mode is
invisible when it bites.
*Recommendation:* one reading-guide line: "every integration `describe` must
be titled `integration: …` — suite selection is name-based
(`--test-name-pattern '^integration:'`); a misnamed describe runs in neither
suite."

### Nits

**N-05 — T-17 should restore `ONELOGIN_ISSUER` in `afterAll`.** The bun test
process is shared across files in a run; today no other test imports
`src/router` for in-process dispatch (verified — zero hits in
`api/__tests__/`), but the leaked flag is a latent trap for the next
in-process-dispatch test. `afterAll(() => { delete process.env.ONELOGIN_ISSUER; })`
alongside the existing `closeDriver()` house pattern.

**N-06 — T-17 step 3's "its seeded permission set" should be read from the
seeded `RBACRole` node, not hard-coded.** `hasPermissionByRbac` checks only
`session.permissions`, which the test supplies to `createSession`. Reading
the permission array off `(:RBACRole {name:"business_architect"})` (the
`model-rbac.integration.test.ts` read pattern) makes seed↔session drift
impossible to hide. Low stakes — T-11's unit test independently asserts the
seed contains both `story:*` — but it is a one-line strengthening of the
"no synthetic stub" claim.

**N-07 — T-11's Files list omits its new test file.** Test-only tasks (T-10,
T-15, T-16) count their test file as the task's file; T-11 creates
`api/__tests__/story-authz.test.ts` but lists only the two modified source
files. Bookkeeping consistency for the completion hook.

## Completeness / Traceability

Task graph: 17 tasks; recomputed both directions — `Blocks` ≡
inverse(`Blocked by`), acyclic, top-to-bottom is a valid topological order.
Max implementation files/task = 3 (T-02, T-14) — within cap. Every task
declares a verification artifact (test path, CLI with exit code, or `manual:`
with input mode + observable outcome).

| AC | Covered by | Verification artifact | OK |
|----|-----------|----------------------|----|
| AC-01 | T-02 | `story-labels.integration.test.ts` | pass |
| AC-02 | T-02 | `story-edges.integration.test.ts` | pass |
| AC-03 | T-05 (+T-03 codes, T-08 routes) | `story-crud.integration.test.ts` incl. detached lifecycle + `sourceActivityId` re-point | pass (run gate: T-09) |
| AC-04 | T-06, T-08 (clause mapping) | `acceptance-criteria-crud.integration.test.ts` incl. detached-parent case | pass (run gate: T-09) |
| AC-05 | T-05 | `story-cascade.integration.test.ts` | pass |
| AC-06 | T-04, T-06 | `story-derive-parity.test.ts` (Neo4j-free, NFR-04 projection/tiebreak) | pass |
| AC-07 | T-07 | `story-bootstrap.integration.test.ts` incl. DD-09 `{0,0}` boundary | pass (run gate: T-09) |
| AC-08 | T-10 | `story-model-scope.integration.test.ts` read- + write-side, D-4 carve-out | pass |
| AC-09 | T-11 (unit composition) + T-17 step 6 (e2e 403/200, D-7) + T-12/T-03 (openapi) | `story-authz.test.ts` + `story-openapi.integration.test.ts` + `story-xd18-role-path.integration.test.ts` | pass (was pass-1 C-05) |
| AC-10 | T-14 | `story-catalog.test.tsx` | pass (CI wiring: C-08) |
| AC-11 | T-14 | `story-detail.test.tsx` (payload producible via T-05's DD-11 seam) | pass (CI wiring: C-08) |
| AC-12/13/14 | T-15 sole closer (T-14 implements) | `story-catalog-states.test.tsx` incl. DD-09 fork-first hint | pass (CI wiring: C-08) |
| AC-15 | T-14 | CLI `design-conformance.ts --view` ×2 (per-file, D-1) | pass |
| AC-16 | T-14 | `manual:` keyboard walk (input mode + focus outcomes) | pass |
| AC-17 | T-16 | `pwa/playwright/story-catalog-context.spec.ts` | pass |
| AC-18 | cross-cutting sweep | `typecheck` + `git diff` NODE_LABELS/EDGE_ENDPOINTS | pass |
| AC-19 | T-17 | `story-xd18-role-path.integration.test.ts`, in-process `route()` per D-6 | **pass (was B-01)** |

FR/NFR coverage: FR-01…FR-14 and NFR-01…NFR-06 all map to tasks per the
Traceability summary; no design element (§3–§6, DD-01…DD-12) lacks an owning
task; D-1…D-7 in the deviations register each carry the executing task.
Blueprint conformance: `#/model/stories` → `StoryCatalog` **verbatim** (View
Tree lines 102/113); UX-01 (four states, T-14/T-15), UX-02 (tokens +
conformance CLI, T-14), UX-05 (keyboard walk + ARIA, T-14), UX-06 (reload +
active-model context, T-16) all carried into ACs; UX-03 n/a (no canvas/gesture
work — reorder is up/down buttons, no drag, per Native Conflicts); XD-01
(registry-only, T-02 + AC-18 guard), XD-02 (Neo4j-only), XD-09
(generate-then-edit, T-07), XD-10 (GWT single zod gate, T-01/T-06/T-08),
XD-18 (T-17, now implementable). House rules: zod-only, en-US identifiers,
no tsc (`bun run typecheck`), all routes under `/api/v1/`, auth exclusively
via the central gate (T-11 adds mappings only — no per-route check).

**Done well:** the pinned-decision table remains the artifact's spine — the
new B-01 row names the exact failure modes it forecloses (silently-vacuous
dev-fallback vs cross-process 401) with file:line evidence that all checks
out; and the D-6/D-7 deviations keep the requirements-text erratum honest
instead of quietly rewording the ACs.

## Verdict

**approve** — zero blockers. Pass-1 B-01 is resolved with a transport that
verifiably works against the real gate; all five remaining pass-1 findings
landed as asked. Two concerns are recorded for execution (C-08: pwa
vitest/CI-gate wiring per the kpi-okr precedent; C-09: state the
`integration:` describe-prefix convention) plus three nits (N-05 env-var
cleanup, N-06 read the seeded permission set, N-07 T-11 Files bookkeeping) —
all are one-line, executor-landable, and none warrants holding the phase.
