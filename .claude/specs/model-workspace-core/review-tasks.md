---
feature: "model-workspace-core"
reviewing: "tasks"
reviewing_revision: 4
artifact: "tasks.md (revision 4, 22 tasks)"
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 1
reviewed_at: "2026-07-04"
upstream_reviewed: ["requirements.md rev 4 (frontmatter status: revised)", "design.md rev 4 (frontmatter status: revised)", "review-design.md (approve of design rev 3)", "blueprint.md (View Tree, UX-01..06, XD-01..18)", ".claude/CLAUDE.md", "STATUS.md"]
supersedes: "prior on-disk review-tasks.md (approve of tasks rev 3, pass 2/2 of the previous cycle) — its full text is ledgered in tasks.md §'Task-review final pass'"
---

# Review: model-workspace-core / tasks (pass 1/2 — revision 4)

Reviewed cold; I did not author this artifact. This invocation is pass 1 of a
fresh review cycle against **tasks rev 4** — note the ledger tension this
creates with the artifact's own "cap 2/2, post-approval sync" framing (C-01
below). I independently re-verified the load-bearing codebase claims rather
than trusting the prior review's verification notes; results are in the
traceability section. Reality check headline: **execution has already begun**
— most of T-01…T-19's outputs exist uncommitted in the working tree
(`api/src/storage/{models,modules,model-scope,model-lifecycle-guard}.ts`,
`api/src/routes/{models,modules}.ts`, the nine `ERROR_CODES` members at
`api/src/errors.ts:36-44`, `business_architect` in
`api/src/scripts/seed-rbac-roles.ts:96`, `migrate-retail-to-model.ts`,
`register-model-labels.ts`, the `model` surface with `kbd:"0"` in
`pwa/src/route.ts:100`, the `/^[0-9]$/` handler in `pwa/src/App.tsx:51`,
`pwa/src/context/ActiveModelContext.tsx`, `pwa/src/views/model/
ModelWorkspace.module.css`, and all fourteen `api/__tests__/model-*` /
`module-*` test files). The artifact matches that reality; the gating
paperwork does not (C-02).

## Verdict

**approve** — zero blockers. Rev 4 is complete, internally consistent,
authored against the design actually on disk (rev 4), and its only new
contract (the T-16 `--down --force` refusal) matches design §4.7 rev 4 and
requirements AC-08 verbatim. All three concerns are orchestrator/process
bookkeeping and one execution-seam ambiguity — none requires re-cutting the
task list.

## Status of prior-cycle findings (verified, not taken on faith)

The previous on-disk review (approve of rev 3) left C-01/C-02/C-03/N-01/N-02;
STATUS.md additionally pinned the requirements rev-4 C-10 sync. All six are
landed in rev 4 exactly as claimed:

- ~~C-01 (PWA ordering)~~ → **resolved.** T-19 physically precedes T-18; T-17
  now claims `Blocks: T-18` only (asymmetry reconciled in favor of the
  `Blocked by` fields); T-18 counts `pwa/src/App.tsx` (Files (2)).
- ~~C-02 (checkpoint timing)~~ → **resolved.** Deferred-green rule in the
  reading guide; T-04's green point corrected T-11 → T-13; T-05…T-09/T-22
  carry the deferral marker; T-08's D-4 assertion explicitly lands with T-10.
- ~~C-03 (preconditions unactioned)~~ → **resolved on disk for requirements
  content and STATUS.md** (requirements.md is rev 4 with D-1…D-5, the domains
  route, the four-label count, and the C-10 `--force` contract in the body;
  STATUS.md records the corrected design-review history) — but see C-02
  below: neither upstream frontmatter says `approved`.
- ~~N-01~~ → **resolved** (T-10 explicitly adds the two generic-route 409
  assertions to the existing test files).
- ~~N-02~~ → **resolved** (pins-table D-4 row splits credit between
  `module-publish.integration.test.ts` and the fork/crud files).
- ~~T-16 rev-4 sync~~ → **resolved.** T-16's `--down` refusal guard
  ("refuses and writes nothing unless `--force`"), the forced-down survival
  assertion for a second model, and the documented re-apply limitation match
  design §4.7 rev 4 and AC-08 word for word.

## Blockers

None.

## Concerns

- **C-01 — The review ledger and this invocation contradict each other;
  the orchestrator must reconcile to one source of truth.** tasks.md
  frontmatter (`review_pass_2: … cap 2/2`), the pins section ("Review budget
  stays exhausted (2/2); this is a post-approval sync, not a new review
  pass"), and STATUS.md ("pass 3+ on tasks remains refused per the cap") all
  assert that rev 4 would receive **no** further review — yet this
  commissioned pass-1 review of rev 4 now exists and **overwrites the on-disk
  approve-of-rev-3 review** that those ledger entries point at.
  *Recommendation:* record in STATUS.md that tasks rev 4 opened a fresh
  review cycle (this file = pass 1, approve) and update the `review_passes`
  comment accordingly, or explicitly designate this file as the final
  authoritative tasks review. Do not leave two mutually exclusive cap
  accounts standing; the next agent to read STATUS.md will refuse a re-review
  that the workflow may still owe.
- **C-02 — Execution has outrun the artifact's own stated gate.** The
  preconditions section says "**One orchestrator item remains before further
  source edits**: gate design rev 4 (`status: revised` → `approved`) …
  `spec-gate-check` blocks source-file edits on design-named files while
  design status is not `approved`." On disk today: `design.md` frontmatter is
  still `status: revised`, `requirements.md` frontmatter is **also**
  `status: revised` (despite the preconditions text claiming rev 4 was
  "approved by the user 2026-07-04" — STATUS.md agrees with the text, the
  frontmatter does not), and the working tree already contains most of
  T-01…T-19's design-named source files, uncommitted. Either the gate was
  bypassed or the precondition paragraph is stale — both are bad states to
  leave on record mid-execution. *Recommendation:* orchestrator flips
  `requirements.md` and `design.md` frontmatter to `approved` (both caps
  consumed; both rev 4s are reconciliations of user/reviewer-approved
  content) **before any further source edits**, and the preconditions
  paragraph is updated at the artifact's next touch to reflect that the gate
  is closed, not pending.
- **C-03 — T-17/T-20's joint test file has no creation owner and T-17's
  slice may not be green at the T-17 checkpoint.** T-17's verification cites
  `pwa/src/__tests__/model-workspace.test.tsx` "(jointly with T-20)", but no
  step in either task says who **creates** the file, and T-20 is blocked by
  T-18/T-19 — three tasks later. Worse, if the T-17 slice (surface + seven-tab
  subnav render) mounts the full App at `#/model/models`, it cannot pass until
  T-21 registers the `model` views in `pwa/src/views/index.tsx`; the
  deferred-green rule in the reading guide covers only the API-side tests
  (T-04…T-09/T-22 → T-13/T-10) and says nothing about this PWA seam. The
  artifact solved the identical problem on `routes/models.ts` with an explicit
  seam DoD (T-08/T-22/T-11). *Recommendation (execution-time, no revision
  needed):* T-17 creates the file with the key→index unit assertions plus a
  SubNav/SURFACES-level render assertion that needs no view registration
  (green at the T-17 checkpoint); T-20 extends it add-only — mirroring the
  T-08 seam discipline. If the surface render must go through `renderView`,
  tag that assertion deferred-green to the T-21 checkpoint.

## Nits

- **N-01** — T-19's verification is `bun run typecheck` plus "consumed +
  asserted transitively" by T-20's test. It names a concrete artifact, so it
  clears the verification bar, but one direct assertion (e.g. a typed
  `api.models.list()` return-shape check in the T-20 test named as T-19's)
  would make the task self-contained instead of borrowing its proof.
- **N-02** — AC-20 is owned by no task (cross-cutting sweep only). The
  reasoning is sound ("not a standalone task"), but the completion hook keys
  on task verification fields; name where the sweep result is recorded
  (STATUS.md `verification_artifact` is the natural home) so AC-20's proof
  has a durable anchor.

## Traceability check

| Check | Result |
|-------|--------|
| Every FR reaches a task | **pass** — FR-01…FR-18 + NFR-01…06 all mapped (table below); every design §7 File-Changes row has an owning task, no orphans in either direction |
| Every AC is closed by a task with Verification | **pass** — AC-01…AC-21 mapped; all 22 tasks carry a concrete test path or `manual:` repro with input mode + observable outcome; AC-20 is an explicit final-sweep check (N-02) |
| Routes/views match the blueprint View Tree verbatim | **pass** — T-17 registers `#/model` + `models, canvas, stories, key-activities, kpi-impact, systems, export` verbatim in View-Tree order (blueprint.md:99-106); `#/model/models` → `ModelWorkspace` (T-20); six siblings → `ModelTabPlaceholder` naming the View-Tree owners (T-21); no invented or renamed route |
| UX-* allowances covered | **pass** — UX-01 four states (T-20 → AC-13/14/15 + AC-11/12 ready); UX-02 tokens-only from `pwa/src/styles/companygraph/tokens.css` (exists) + catalog-first + two real `--view` scans (T-20; `--view` verified single-file at `scripts/design-conformance.ts:125-127`); UX-03 n/a (no canvas here — ModelCanvas is `business-model-authoring`'s); UX-04 no new breakpoints; UX-05 keyboard walk + ARIA landmark + key-mapping unit assertion (T-17/T-20); UX-06 verbatim routes + deep-link/active-model reload (T-18 playwright, AC-18) |
| XD-* honoured | **pass** — XD-01/02: registry-only labels via `createNodeLabel`/`createEdgeType` (both verified exported from `api/src/ontology/storage/`), Neo4j only, `NODE_LABELS` guarded by AC-20 sweep (T-03); XD-06: `IN_MODEL` scoping root + `scopedNodeIds` (T-04); XD-07: publish/instantiate/fork/upgrade, explicit-upgrade-only (T-06…T-09, T-22); XD-08: `business_architect` via existing RBAC subsystem, SME untouched (T-15); XD-12: idempotent + reversible + dry-run migration with the rev-4 `--force` refusal (T-16) |
| House rules | **pass** — zod-only (T-01); all routes `/api/v1/`; central router gate + `ROUTE_PERMISSIONS` rows for every route, no `public`, unmapped-route ⇒ RBAC-skip hazard closed with an explicit non-null assertion (T-13; `getRoutePermission`/`matchSegments` verified at `api/src/auth/rbac-permissions.ts:309-339`); no per-route auth; no `tsc` (`bun run typecheck` verified in root `package.json:19`); en-US identifiers; additive-only `ERROR_CODES` (T-02; zero collisions verified against `api/src/errors.ts`) |
| No file ownership conflict | **pass** — `pwa/src/route.ts` owned here per blueprint ("this feature owns route.ts changes"); sibling views left to owning specs; `kbd:"0"` was the free slot (1–9 taken, verified `pwa/src/route.ts`) |

### FR / NFR → tasks

| FR / NFR | Task(s) | Status |
|----------|---------|--------|
| FR-01, FR-02 four labels (runtime registry) | T-01, T-03 | ok — four `createNodeLabel`, `NODE_LABELS` untouched |
| FR-03, FR-04 IN_MODEL + lifecycle edges | T-03 | ok — five `createEdgeType`, endpoint pairs per design §3.5 |
| FR-05 model CRUD + ordinal + cascade delete | T-05, T-11 | ok — incl. `attachDomain` + `moduleInstanceCount` no-N+1 |
| FR-06 publish/versions (D-3 explicit mode) | T-06, T-12 | ok — canonical checksum pinned to N-05 number form |
| FR-07 instantiate (D-2 `targetDomainId`) | T-01, T-05, T-07, T-11 | ok — API-only fixtures via the domains route |
| FR-08 fork on edit (nodes + edges) + generic guard | T-08, T-22, T-10, T-11 | ok — first-edit-is-an-edge-edit path covered (T-22); deleted-anchor hardening (T-08) |
| FR-09 explicit upgrade | T-09, T-11 | ok |
| FR-10 migration (rev-4 `--force`) | T-16 | ok — matches design §4.7 rev 4 verbatim |
| FR-11 Business Architect role/persona | T-15 | ok — no `node:write`/`edge:write` |
| FR-12 route-permission mapping | T-13 | ok — every §5 route incl. domains + both edge routes; shadowing assertion |
| FR-13 openapi + 9 error codes | T-02, T-14 (reachability: T-08/T-10/T-11/T-12/T-22) | ok |
| FR-14 Model surface + 7 tabs verbatim | T-17 | ok (C-03 seam note) |
| FR-15 active-model shell context | T-18 | ok — localStorage + URL reconcile |
| FR-16 ModelWorkspace + 4 states | T-19, T-20 | ok |
| FR-17 sibling placeholder | T-21 | ok |
| FR-18 scope helper (D-1: no `?model=`) | T-04, T-11 | ok |
| NFR-01 registry-only | T-03 + AC-20 sweep | ok |
| NFR-02 idempotent/reversible migration | T-16 | ok |
| NFR-03a/b isolation | T-04, T-08, T-11, T-22 | ok |
| NFR-04 version immutability | T-06, T-08, T-10, T-22 | ok — D-4 single reading |
| NFR-05 house rules | all | ok |
| NFR-06 tokens-only | T-20 | ok — two `--view` scans incl. the `.module.css` |

### AC → tasks

| AC | Task(s) | Status |
|----|---------|--------|
| AC-01, AC-02 | T-03 | ok |
| AC-03 | T-05, T-10, T-11 | ok |
| AC-04 | T-06, T-12 | ok |
| AC-05 | T-07 (setup via T-05/T-11) | ok — N-12 "modulo projected handles" comparison |
| AC-06 | T-08 (nodes) + T-22 (edges) + T-10 (generic 409s) | ok — deferred-green markers honest about T-10/T-13 timing |
| AC-07 | T-09 | ok |
| AC-08 | T-16 | ok — guard-abort, re-run-after-user-model, `--force` refusal + survival all asserted |
| AC-09 | T-15 | ok |
| AC-10 | T-13 (authz) + T-14 (openapi) | ok |
| AC-11–AC-17 | T-17, T-20 | ok — component tests + `manual:` keyboard repros + two design-conformance scans (C-03 seam note on the shared test file) |
| AC-18 | T-18 | ok — playwright |
| AC-19 | T-21 | ok |
| AC-20 | cross-cutting final sweep | ok (N-02) |
| AC-21 | T-04 (part 1) + T-11 (part 2) | ok — green at T-13 per deferred-green rule |

## Dependency-order check

DAG confirmed, no cycles (roots T-01, T-02, T-03, T-15, T-17). Physical order
is now a valid topological order end-to-end: T-22 sits between T-08 and T-09;
T-19 precedes T-18; every task's `Blocked by` list appears physically earlier.
Storage → routes → router/authz → openapi sequencing is correct; the
T-08 → T-22 → T-11 seam on `routes/models.ts` has a compiling DoD at every
step. No task exceeds 3 files (T-10 at 3; T-18 correctly counts App.tsx at 2).
Complexity ratings are realistic — the `complex` set (T-05, T-06, T-08, T-16,
T-20, T-22) is exactly the multi-judgment set. Validation checkpoints include
`bun run typecheck` after every task plus per-file design-conformance for pwa
views; the deferred-green rule makes the checkpoint claims honest against the
fetch-a-running-server integration-test style.

## Summary

- Solid: complete FR/AC coverage with universally concrete verification
  fields; every design-rev-4 mechanism (instance-qualified `forkLocalKey`,
  D-1…D-5, endpoint-addressed instance edges, the narrowed migration guard,
  the `--down --force` refusal) names both a locking task and a concrete
  fixture; blueprint routes verbatim; the RBAC unmapped-route hazard is closed
  with an explicit assertion. All codebase claims I re-checked are true.
- Common thread of the findings: governance bookkeeping has fallen behind an
  execution that is already most of the way through the task list — the
  review-cap ledger, the upstream `approved` flags, and the "before further
  source edits" precondition all describe a world that no longer exists.
- Do first: reconcile the review ledger (C-01) and flip the two upstream
  frontmatters to `approved` (C-02) before the next source edit; then pin the
  T-17/T-20 test-file seam (C-03) when the PWA chain resumes.
