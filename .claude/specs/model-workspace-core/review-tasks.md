---
feature: "model-workspace-core"
reviewing: "tasks"
reviewing_revision: 3
artifact: "tasks.md (revision 3, 22 tasks)"
reviewer: "spec-review-agent"
verdict: "approve"
review_pass: 2
reviewed_at: "2026-07-04"
upstream_reviewed: ["requirements.md rev 2 (rev-3 errata pending)", "design.md rev 3", "review-design.md (approve of rev 3, C-11 gate)", "blueprint.md", ".claude/CLAUDE.md", "STATUS.md (stale — see C-03)"]
---

# Review: model-workspace-core / tasks (pass 2/2 — re-review of revision 3)

Reviewed cold; I did not author this artifact. This is the final pass in the
phase budget (1 review + 1 re-review). The prior on-disk review (of rev 2,
verdict revise, B-01…B-04 / C-01…C-03 / N-01…N-03) is superseded by this file;
its full text is ledgered in tasks.md §"Task-review pass 2 — resolutions".

Checked: internal consistency; traceability against requirements rev 2 +
design rev 3 (including the §2.1 Deviations Register D-1…D-5); blueprint View
Tree / UX-* / XD-*; house rules. Independently re-verified the load-bearing
codebase claims this pass: `pwa/src/route.ts` (nine surfaces, `kbd` 1–9 —
`"0"` free), `pwa/src/App.tsx` (`/^[1-9]$/` Alt-branch at line 50,
`e.preventDefault()`, stale `Alt+1..8` comment at line 40),
`api/src/auth/rbac-permissions.ts` (`ROUTE_PERMISSIONS` ordered array,
first-match `getRoutePermission`, length-first `matchSegments`),
`api/src/router.ts:341` (a `null` permission skips the RBAC block — T-13's
security note is accurate), `api/src/errors.ts` (closed enum; `not_found` +
`invalid_payload` present; zero collisions with the nine new codes),
`api/src/routes/nodes.ts` / `edges.ts` handler + `parseRegistryLabel` names,
`api/src/scripts/seed-rbac-roles.ts` (`RBAC_ROLES`) +
`migrate-persona-hierarchy.ts`, `views/_shared.tsx` (`Loading`/`ErrorState`),
root `typecheck` script, and `scripts/design-conformance.ts` (`--view <file>`
is single-file and content-based — passing the `.module.css` directly, as
T-20 does, is a real scan, so the pass-1 C-01 fix is sound). Integration-test
style verified against `api/__tests__/*.integration.test.ts`: they `fetch` a
running server on `127.0.0.1:8787` (relevant to C-02 below).

## Status of prior findings (pass 2 on revision 2)

All ten landed in rev 3 exactly as prescribed:

- ~~B-01~~ → **resolved.** New T-22 (instance-edge storage + the two
  `…/edges` handlers, add-only on the T-08 seam, slotted after T-08 / before
  T-11/T-13/T-14 as recommended); `instanceEdgeSchema` in T-01 (closed enum,
  lifecycle types excluded, synthetic-handle support); `module:write` rows in
  T-13; openapi paths in T-14; design §8's AC-06 edge assertions — including
  the first-edit-is-an-edge-edit fork path, non-member → 404
  `module_instance_node_not_member`, idempotent re-POST → 200, DELETE →
  204/404 — in T-22's verification. Membership sides (`to` for `EXECUTES`,
  `from` for `USES_SYSTEM`/`AT_LOCATION`) match the core schema directions.
- ~~B-02~~ → **resolved.** `attachDomain` in T-05 steps + verification
  (one-tx Domain + `IN_MODEL`, absent model → `model_not_found`); handler in
  T-11; `model:write` row in T-13; openapi in T-14; `domainAttachSchema` in
  T-01; T-04/T-07/T-08 fixtures explicitly API-only via
  `POST /models/:id/domains`.
- ~~B-03~~ → **resolved.** T-16 guard rewritten to design §4.7 rev 3 (abort
  only when reference model absent AND a non-reference model exists; with the
  reference model present, re-runs proceed idempotently forever), with the
  superseded rev-2 guard explicitly marked "must NOT be built"; verification
  adds both the re-run-after-user-model and guard-abort assertions.
- ~~B-04~~ → **resolved.** (a) `reviewing_design_revision: 3`; (b) preamble
  rewritten as "Design-basis pins" against §2.1's non-colliding D-1…D-5 IDs,
  with the prior misstatement corrected in place; (c) T-03 carries the two
  `forkLocalKey` lookup indexes + a re-run-idempotence verification line;
  (d) the requirements rev-3 errata + STATUS.md correction are recorded as
  explicit orchestrator preconditions before T-01 (see C-03 — recorded, but
  not yet actioned on disk).
- ~~C-01~~ → **resolved** (T-08 deleted-anchor hardening: empty-content
  envelope, never a 500; write → 404; one assertion in the fork test).
- ~~C-02~~ → **resolved** (T-07: "identical modulo the projected handles",
  comparing names/descriptions/attributes/`precedes`/ref structure per
  design N-12).
- ~~C-03~~ → **resolved** (`listInstances` owned by T-07's steps with the
  §4.5 content resolution; design N-11's DELETE-body note carried into T-22
  with a do-not-relitigate marker).
- ~~N-01~~ / ~~N-02~~ / ~~N-03~~ → **resolved** (dangling pointers removed;
  STATUS.md correction recorded as precondition #2; reading-guide checkpoint
  sentence aligned with the checkpoints table).

## Blockers

None.

## Concerns

- **C-01 — PWA-chain ordering metadata is internally inconsistent
  (T-17/T-18/T-19).** The reading guide says "tasks execute top-to-bottom …
  no out-of-order execution" and makes a point of physically slotting T-22 at
  its dependency position — but T-18 (`Blocked by: T-17, T-19`) is listed
  *before* T-19, and its steps consume T-19's output ("Load `GET
  /api/v1/models` (via T-19 `api.ts`)"). A literal top-to-bottom executor
  stalls at T-18. Additionally the dependency fields are asymmetric: T-17
  claims `Blocks: T-18, T-19` while T-19 lists only `Blocked by: T-01`. And
  T-18's Files list says "(1): `pwa/src/context/ActiveModelContext.tsx`"
  while its steps also modify `pwa/src/App.tsx` ("the mount edit rides with
  this task") — the file accounting understates by one (still ≤3 files).
  *Recommendation (execution-time, no re-review needed):* execute the PWA
  chain as T-17 → T-19 → T-18 → T-20/T-21 (the `Blocked by` fields are
  authoritative, exactly like the T-22 slotting note); reconcile the
  T-17/T-19 asymmetry; count `pwa/src/App.tsx` in T-18's touched files.
- **C-02 — Per-task checkpoint timing for HTTP-level assertions is
  over-stated for T-05…T-09/T-22.** Existing integration tests `fetch` a
  running API server (verified, e.g.
  `api/__tests__/cypher-passthrough.integration.test.ts` → `127.0.0.1:8787`),
  so any assertion phrased as an HTTP status (`create→201`, `409` codes,
  fixtures via `POST /models/:id/domains`, `PATCH …/nodes/:nodeId`,
  `POST …/edges`) cannot run green until the route handlers (T-11/T-12) *and*
  the router dispatch (T-13) are live in the server — yet the checkpoint rule
  says "after tasks that ship behaviour, also run the listed test". T-04
  handles this correctly with an explicit deferred-green note, but pins the
  green point at T-11 when dispatch actually lands at T-13; T-05…T-09/T-22
  carry no such note at all. The same family: T-08's verification lists the
  D-4 assertion (generic PATCH on `BusinessModuleVersion` → 409), but the
  guard it exercises lands in T-10, which is physically later and not in
  T-08's `Blocked by`. *Recommendation:* at execution, run storage-level
  halves at each task's checkpoint and defer HTTP-level/guard assertions to
  the T-13 checkpoint (extend the T-04-style note to T-05…T-09/T-22; land the
  D-4 assertion when T-10 completes — T-10's verification already claims it).
- **C-03 — The two execution preconditions are recorded but not yet actioned
  on disk; approval is conditional on them.** `requirements.md` is still
  rev 2 (frozen AC-06/AC-16/AC-21/FR-06/FR-07 text contradicts the D-1…D-5
  tests this artifact builds) and `STATUS.md` still records the superseded
  state ("Design Review: revise (2/2 cap)…", "21 tasks, T-01 → T-21") that
  produced the rev-2 blockers — while `review-design.md` on disk is an
  approve of rev 3 and this artifact has 22 tasks. tasks.md does the only
  thing it can (it cannot edit approved upstream artifacts): it pins both as
  orchestrator preconditions before T-01. *Recommendation:* the orchestrator
  MUST land the requirements rev-3 errata (D-1…D-5 + the additive
  `POST /api/v1/models/:id/domains` + the N-10 four-label count; no ID
  renumbering) and correct STATUS.md (including `total_tasks: 22`) **before
  T-01 starts** — design-review C-11 made this a condition of the design
  approval, and executing without it invites the completion hook and the AC
  sweep to disagree.

## Nits

- **N-01** — T-10's verification says its guard behavior is "covered in
  `model-crud.integration.test.ts` … and `module-fork.integration.test.ts`"
  but no step states that T-10 *extends* those files with the guard
  assertions (its Files list is the three source files, consistent with house
  style, but the test-edit ownership is implicit). One line — "T-10 adds the
  two generic-route 409 assertions to the existing test files" — would make
  the seam explicit.
- **N-02** — Pins-table row D-4 credits its locking fixture as "T-06 + T-08 +
  T-10 + `module-fork.integration.test.ts`", but T-06's half of D-4 (the
  explicit-version publish collision) is proven in
  `module-publish.integration.test.ts` per T-06's own verification. Label
  imprecision only; the assertions themselves are correctly placed.

## Traceability check

| Check | Result |
|-------|--------|
| Every FR reaches a task | **pass** — FR-01…FR-18 all mapped (see table below) |
| Every AC is closed by a task with Verification | **pass** — AC-01…AC-21 all mapped; every task has a test path or `manual:` repro with input mode + observable outcome; AC-20 explicitly a final-sweep check |
| Routes/views match the blueprint View Tree verbatim | **pass** — T-17 registers `#/model` + all seven tabs (`models, canvas, stories, key-activities, kpi-impact, systems, export`) verbatim, in View-Tree order; `#/model/models` → `ModelWorkspace` (T-20); six siblings → placeholder (T-21), owners named per the Tree |
| UX-* allowances covered | **pass** — UX-01 four states (T-20, AC-13/14/15); UX-02 tokens-only + catalog-first + two real `--view` scans (T-20); UX-03 n/a (no canvas here, per requirements' populated tables); UX-04 no new breakpoints; UX-05 keyboard walk + ARIA landmark (T-17/T-20 `manual:`); UX-06 verbatim routes + deep-link/active-model reload (T-18 playwright) |
| XD-* honoured | **pass** — XD-01/XD-02 registry-only labels, Neo4j only (T-03, AC-20 sweep); XD-06 scoping root + `scopedNodeIds` (T-04); XD-07 publish/instantiate/fork/upgrade with explicit-upgrade-only (T-06…T-09, T-22); XD-08 Business Architect via existing RBAC subsystem, SME untouched (T-15); XD-12 idempotent + reversible + dry-run migration (T-16) |
| House rules | **pass** — zod-only (T-01), `/api/v1/` only, central router gate + `ROUTE_PERMISSIONS` with no `public` route and the unmapped-route ⇒ RBAC-skip hazard explicitly closed (T-13), no per-route auth, no `tsc`, en-US identifiers, additive-only `ERROR_CODES` (T-02) |
| No file ownership conflict | **pass** — `pwa/src/route.ts` owned here per blueprint; sibling views left to their owning specs; no collisions with existing `api/src/routes/*` or `ERROR_CODES` members (verified) |

### FR / NFR → tasks

| FR / NFR | Task(s) | Status |
|----------|---------|--------|
| FR-01, FR-02 labels | T-01, T-03 | ok (four labels per design-review N-10) |
| FR-03, FR-04 edges | T-03 | ok (5 × `createEdgeType`, endpoint pairs per §3.5) |
| FR-05 CRUD + ordinal + delete | T-05, T-11 | ok |
| FR-06 publish/versions (+D-3) | T-06, T-12 | ok |
| FR-07 instantiate (+D-2, domain attach) | T-01, T-05, T-07, T-11 | ok |
| FR-08 fork (nodes + edges) + guards | T-08, T-22, T-10, T-11 | ok — edge half now built (T-22) |
| FR-09 upgrade | T-09, T-11 | ok |
| FR-10 migration | T-16 | ok — rev-3 §4.7 guard |
| FR-11 BA role/persona | T-15 | ok (no `node:write`/`edge:write`) |
| FR-12 route permissions | T-13 | ok — every route incl. domains + both edge routes; shadowing assertion |
| FR-13 openapi + codes | T-02, T-14 (+T-08/T-10/T-11/T-12/T-22 reachability) | ok |
| FR-14 surface + 7 tabs | T-17 | ok — verbatim |
| FR-15 active-model context | T-18 | ok (C-01 ordering note) |
| FR-16 ModelWorkspace + states | T-19, T-20 | ok |
| FR-17 placeholder | T-21 | ok |
| FR-18 scope helper (+D-1) | T-04, T-11 | ok — no `?model=` anywhere |
| NFR-01 registry-only | T-03 + AC-20 sweep | ok |
| NFR-02 migration | T-16 | ok |
| NFR-03a/b isolation | T-04, T-08, T-11, T-22 | ok |
| NFR-04 immutability | T-06, T-08, T-10, T-22 | ok |
| NFR-05 house rules | all | ok |
| NFR-06 tokens-only | T-20 | ok |

### AC → tasks

| AC | Task(s) | Status |
|----|---------|--------|
| AC-01, AC-02 | T-03 | ok |
| AC-03 | T-05, T-10, T-11 | ok |
| AC-04 | T-06, T-12 | ok |
| AC-05 | T-07 (setup via T-05/T-11 domains route) | ok — D-2 body, N-12 comparison |
| AC-06 | T-08 (nodes) + T-22 (edges) + T-10 (generic 409s) | ok — D-4 single reading; deleted-anchor case included |
| AC-07 | T-09 | ok |
| AC-08 | T-16 | ok — incl. re-run-after-user-model + guard-abort |
| AC-09 | T-15 | ok |
| AC-10 | T-13 (authz) + T-14 (openapi) | ok |
| AC-11–AC-17 | T-17, T-20 | ok — component tests + `manual:` keyboard repros + two design-conformance scans (D-5 form only) |
| AC-18 | T-18 | ok — playwright |
| AC-19 | T-21 | ok |
| AC-20 | final sweep | ok — explicitly non-standalone |
| AC-21 | T-04 (part 1) + T-11 (part 2) | ok — deferred-green note present (see C-02 re: T-13) |

## Dependency-order check

DAG confirmed, no cycles (roots T-01, T-02, T-03, T-15, T-17; storage → routes
→ router/authz → openapi; T-22 correctly slotted between T-08 and T-11/T-13/
T-14; T-16 after T-03 + T-05). The one physical-vs-dependency mismatch is the
T-18/T-19 pair (C-01). No task exceeds 3 files once T-18's App.tsx edit is
counted (T-10 and T-18 at 3 and 2 respectively). Complexity ratings are
realistic (the four `complex` tasks — T-05, T-06, T-08, T-22, T-16, T-20 —
are genuinely the multi-judgment ones). The T-08 → T-22 → T-11 seam on
`routes/models.ts` has a compiling DoD at every step.

## Verdict

**approve** — zero blockers. Revision 3 lands all four rev-2 blockers and all
three concerns exactly as prescribed, and the artifact is now authored against
the design actually on disk (rev 3, itself an approved artifact). The three
concerns are execution-time discipline (task ordering in the PWA chain,
checkpoint timing of server-dependent assertions) plus one hard condition the
artifact itself already pins: **the orchestrator must land the requirements
rev-3 errata and correct STATUS.md before T-01** (C-03; design-review C-11).
Review budget for this phase is now exhausted (2/2); the concerns are recorded
here for the execution agent to pin — none requires another tasks revision.

## Summary

- Solid: complete AC coverage with universally concrete verification fields;
  the security-critical RBAC gaps (unmapped-route ⇒ silent open write,
  same-length shadowing) are closed with explicit assertions; every
  design-rev-3 mechanism (instance-qualified `forkLocalKey`, D-1…D-5,
  endpoint-addressed instance edges, the narrowed migration guard) names both
  a locking task and a concrete fixture.
- Common thread of the findings: sequencing bookkeeping, not coverage — the
  work items are all present; two ordering/timing notes and the pending
  upstream errata are what remain.
- Do first: action the two orchestrator preconditions (requirements errata +
  STATUS.md, C-03) before starting T-01; then execute the PWA chain as
  T-17 → T-19 → T-18 (C-01).
