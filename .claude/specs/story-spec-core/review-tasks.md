---
feature: "story-spec-core"
artifact: "tasks.md (revision 4)"
reviewing: "tasks"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-05"
review_pass: "1 of 2 (new cycle against rev 4 — supersedes the 2026-07-04 record for rev 2/rev 3; that cycle's history is summarized under 'Prior-cycle findings' below)"
upstream:
  requirements: "rev 3 (2026-07-04, approved)"
  design: "rev 3 (2026-07-04, review-design.md pass 2/2 = approve)"
---

# Review: story-spec-core tasks.md (rev 4)

## Scope of this pass

Rev 4 is a **post-approval reconciliation revision**: T-01…T-17 are already
executed (STATUS.md, all checkpoints green) and rev 4 (a) records the
disposition of the prior cycle's pass-2 findings (C-08/C-09/N-05/N-06/N-07)
and (b) adds **one new, open task — T-18** (CI gate for the three pwa story
component tests). A fresh review is warranted precisely because T-18 and the
rev-4 reading-guide additions were never seen by any reviewer: the 2026-07-04
pass 2 approved **rev 3**, which had 17 tasks and no C-08 disposition.

Accordingly this pass verified three things cold: (1) T-18 is correct,
feasible, and properly wired into the dependency graph; (2) the reconciled
artifact matches on-disk reality (the rev-4 comment makes factual claims
about executed code — each was checked); (3) traceability AC-01…AC-19 still
holds under the rev-4 ownership moves.

## Verification against reality (all claims checked on disk)

- **T-18 target is real and exact.** `.github/workflows/ci.yml:23` is the
  per-file vitest step (`bunx vitest run src/__tests__/exec-kpi-management.test.tsx
  src/__tests__/exec-okr-management.test.tsx`, `working-directory: pwa`) with
  the kpi-okr-governance T-20 provenance comment at lines 18–22, exactly as
  T-18 describes. `scripts/test-unit.sh` confirms the gap T-18 closes: it
  sweeps only `api/` and `shared/`, so no CI job currently executes the three
  story `.tsx` tests.
- **T-18's verification CLI runs green today.** I executed the exact
  invocation from the task (`cd pwa && bunx vitest run
  src/__tests__/story-catalog.test.tsx src/__tests__/story-detail.test.tsx
  src/__tests__/story-catalog-states.test.tsx`): 3 files, 13 tests, all pass,
  exit 0. `grep story-catalog-states .github/workflows/ci.yml` correctly
  returns nothing yet (the task is open). T-18 is landable as written.
- **Dependency graph still coherent.** T-18 `Blocked by: T-15`; T-15
  `Blocks: T-18` — the exact-inverse invariant (prior-cycle C-01) holds for
  the new node; graph remains acyclic; top-to-bottom stays a valid
  topological order. T-18 touches 1 file, has a Definition of Done
  (CLI exit 0 + grep), complexity `simple` is realistic.
- **Rev-4 disposition claims all verify:**
  - C-09 "landed in execution": all **nine** story integration files carry
    the `integration: …` describe prefix (checked all nine, incl.
    `acceptance-criteria-crud.integration.test.ts:41`).
  - N-05 "landed": `story-xd18-role-path.integration.test.ts:199` deletes
    `ONELOGIN_ISSUER` in `afterAll` (STATUS D-13's dynamic
    `await import("../src/router")` at line 36, after the env assignment at
    line 26 — the B-01 pin is honored).
  - N-06 "landed": the test reads the permission array off
    `(:RBACRole {name:"business_architect"})` (line 116), not a hard-coded list.
  - N-07 "fixed here": T-11's Files list now includes
    `api/__tests__/story-authz.test.ts` (3 files, within cap).
- **Executed-state spot checks** (the artifact now claims to describe
  reality, so reality was sampled): all files named by T-01…T-17 exist
  (`shared/src/schema/story-spec.ts`, `api/src/derive/story-derive.ts`,
  `api/src/storage/stories.ts`, `api/src/routes/stories.ts`,
  `api/src/scripts/register-story-labels.ts`, `pwa/src/views/model/StoryCatalog.{tsx,module.css}`,
  all ten test artifacts). The ten `ROUTE_PERMISSIONS` rows are at
  `api/src/auth/rbac-permissions.ts:282-291`, specific-before-parameterized
  with `:storyId` last, none public; `business_architect`
  (`seed-rbac-roles.ts:96`) carries `story:read`/`story:write` (:114-115);
  the five additive codes sit in `api/src/errors.ts:52-56` with
  `story_duplicate_for_activity` deliberately absent (comment at :48, DD-04)
  and the N-03 header rewording landed (:1-3); `register:story` is at root
  `package.json:18`; `pwa/src/views/index.tsx:166` dispatches
  `stories: (r) => <StoryCatalog route={r} />`; `shared/package.json:15`
  carries the D-9 export-map entry; `createSession` at
  `api/src/auth/oauth.ts:151` over the in-memory `Map` at :149.
- **Blueprint conformance unchanged:** `#/model/stories` → `StoryCatalog`
  **verbatim** (blueprint lines 102/113); UX-01 four states (T-14/T-15),
  UX-02 tokens + conformance CLI per-file (D-1), UX-05 keyboard walk with
  input mode + observable outcomes (AC-16), UX-06 reload/context (T-16);
  UX-03 n/a is correctly recorded (no canvas/gesture; reorder = up/down
  buttons per Native Conflicts). XD-01 (registry-only + AC-18 const guard),
  XD-02 (Neo4j only), XD-09 (T-07 generate-then-edit), XD-10 (T-01 single zod
  gate), XD-18 (T-17, executed through the real gate per D-6). House rules:
  zod-only, en-US identifiers, no tsc, `/api/v1/` only, auth exclusively via
  the central router gate — T-11 adds mappings only, no per-route check.

## Findings

### Blockers

None.

### Concerns

**C-10 — Review-cap bookkeeping contradicts this review's existence, and
rev 4 pre-declares itself `status: "approved"`.** STATUS.md states the tasks
phase "consumed 2/2 … NO further review passes are permitted", yet rev 4
materially changed the artifact (new task T-18, new binding reading-guide
conventions C-08a/C-09) after that cap was recorded — content no reviewer had
seen until this pass. Meanwhile tasks.md's frontmatter already says
`status: "approved"` / the rev-4 comment says "finalizes the phase", i.e. the
artifact asserts an approval that (for rev 4) had not happened when it was
written. The same pattern was flagged on requirements (its pass-1 N-05).
*Recommendation:* orchestrator updates STATUS.md's `review_passes` note to
record this rev-4 cycle (pass 1: approve) so the audit trail matches the
files; going forward, any post-approval revision that adds a task or a
binding convention re-enters review **before** carrying `status: "approved"`.

**C-11 — AC-17's Playwright artifact still gates nothing.** T-18 closes the
vitest half of prior-cycle C-08, but `pwa/playwright/story-catalog-context.spec.ts`
(AC-17's sole verification artifact) is run only by hand — no CI job anywhere
in `ci.yml` executes Playwright, so a regression in reload/model-context
behavior would merge silently. This is repo-wide status quo (no Playwright
harness exists in CI for any spec), so it is not a blocker for this spec —
but the gap is the same *class* T-18 exists to fix, and rev 4 is silent about
it. *Recommendation:* one line in STATUS.md's accepted-debt/next-steps
recording "AC-17's Playwright spec is not CI-gated (no repo Playwright job —
owner: a future CI-harness backfill spec)", so the debt is named rather than
implied.

### Nits

**N-08 — Stale `file:line` citations after execution shifted lines.** Rev 4
claims to reconcile the artifact with executed state, but the load-bearing
pins still carry pre-execution line numbers: `route(req)` is exported at
`api/src/router.ts:268` (pinned-decision table and T-17 say `:259`); the
per-request `ONELOGIN_ISSUER` check is now around `router.ts:343` (B-01 row
says `:334`); the `stories` placeholder cite `pwa/src/views/index.tsx:158`
now points at the *live* dispatch's neighborhood (`:166`). Harmless for
executed tasks, but the next reader following a citation lands on the wrong
line. Fix opportunistically or annotate the pins "(line numbers as of rev 2
authoring)".

**N-09 — STATUS.md counts "all 8 story-spec integration files"; there are
nine.** Rev 4's own comment correctly says nine (the count includes
`acceptance-criteria-crud.integration.test.ts`, whose filename lacks the
`story-` prefix). Fix the STATUS.md sentence when T-18 flips the Execution
row.

**N-10 — `.github/workflows/ci.yml` appears in no design File Changes row.**
Design §7's file table predates T-18; the ci.yml touch is sanctioned by the
prior review's C-08 but formally unowned by any design element. Precedent
exists for exactly this: record a one-line §7 errata (as D-6 did for §4.12)
so a later `/spec audit` traceability sweep doesn't flag the file as an
off-spec edit.

### Prior-cycle findings (rev 2 → rev 3, 2026-07-04 — for the audit trail)

Pass 1 (vs rev 2, verdict revise): B-01 (T-17 transport unimplementable),
C-05, C-06, C-07, N-03, N-04 — all resolved in rev 3. Pass 2 (vs rev 3,
verdict approve): C-08, C-09, N-05, N-06, N-07 recorded — disposition landed
in rev 4 and verified on disk by this pass (see above); ~~C-08~~ → T-18
(open), ~~C-09~~/~~N-05~~/~~N-06~~ → landed in execution, ~~N-07~~ → fixed in
the artifact.

## Completeness / Traceability

18 tasks; `Blocks` ≡ inverse(`Blocked by`) at every node incl. T-18; acyclic;
max files/task = 3 (T-02, T-11, T-14) — within cap. Every task declares a
verification artifact (test path, CLI with exit code, or `manual:` with input
mode + observable outcome) — including T-18 (CLI + grep).

| AC | Covered by | Verification artifact | Status |
|----|-----------|----------------------|--------|
| AC-01 | T-02 | `story-labels.integration.test.ts` | pass — exists, `integration:` prefixed |
| AC-02 | T-02 | `story-edges.integration.test.ts` | pass — exists |
| AC-03 | T-05 (+T-03, T-08) | `story-crud.integration.test.ts` (detached lifecycle + re-point) | pass — exists |
| AC-04 | T-06, T-08 | `acceptance-criteria-crud.integration.test.ts` (detached-parent case) | pass — exists |
| AC-05 | T-05 | `story-cascade.integration.test.ts` | pass — exists |
| AC-06 | T-04, T-06 | `story-derive-parity.test.ts` (Neo4j-free) | pass — exists |
| AC-07 | T-07 | `story-bootstrap.integration.test.ts` | pass — exists |
| AC-08 | T-10 | `story-model-scope.integration.test.ts` (read+write side, D-4 carve-out) | pass — exists |
| AC-09 | T-11 (unit) + T-17 step 6 (e2e, D-7) + T-12/T-03 (openapi) | `story-authz.test.ts` + `story-openapi.integration.test.ts` + T-17 | pass — all exist; 10 perm rows verified |
| AC-10 | T-14 | `story-catalog.test.tsx` | pass — runs green under vitest; CI gate = T-18 (open) |
| AC-11 | T-14 | `story-detail.test.tsx` | pass — runs green; CI gate = T-18 (open) |
| AC-12/13/14 | T-15 sole closer (T-14 implements) | `story-catalog-states.test.tsx` (incl. DD-09 hint) | pass — runs green; CI gate = T-18 (open) |
| AC-15 | T-14 | CLI `design-conformance.ts --view` ×2 (per-file, D-1) | pass |
| AC-16 | T-14 | `manual:` keyboard walk (input mode + focus outcomes) | pass |
| AC-17 | T-16 | `pwa/playwright/story-catalog-context.spec.ts` | pass — exists; **not CI-gated (C-11)** |
| AC-18 | cross-cutting sweep | `typecheck` + `git diff` NODE_LABELS/EDGE_ENDPOINTS | pass |
| AC-19 | T-17 | `story-xd18-role-path.integration.test.ts` (in-process `route()`, D-6; N-05/N-06 hardening verified in file) | pass |

FR/NFR coverage: FR-01…FR-14, NFR-01…NFR-06 all map to tasks per the
Traceability summary (FR-12's row correctly gained T-18); every design
element §3–§6 / DD-01…DD-12 has an owning task; deviations D-1…D-7 each name
their executing task, and the execution-side D-8…D-13 in STATUS.md are
consistent with what is on disk (each was spot-verified). T-18 closes no AC
and says so honestly — its purpose (making AC-10…AC-14's artifacts
merge-gating) is correctly framed as harness, not coverage.

**Done well:** rev 4 resists the temptation to retro-edit executed tasks —
T-18 as a separate task instead of amending completed T-15's Files row is the
right call for audit integrity, and the reasoning is written down; the
nine-file `integration:` prefix convention and the vitest/Playwright runner
split are now stated in the reading guide instead of living in tribal memory;
and every "landed in execution" claim in the rev-4 comment survived on-disk
verification without exception.

## Verdict

**approve** — zero blockers. The single open task (T-18) is verified
feasible: its target line, house-precedent comment, and dependency wiring all
check out, and its exact verification CLI already exits 0 on the three test
files. Two concerns (C-10 review-cap/STATUS bookkeeping; C-11 the un-gated
Playwright artifact) and three nits (N-08 stale line pins, N-09 STATUS
8-vs-9 count, N-10 ci.yml design-errata row) are recorded — all are
documentation/bookkeeping-level and none blocks executing T-18.
