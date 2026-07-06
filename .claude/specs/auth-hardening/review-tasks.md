---
feature: "auth-hardening"
artifact: "tasks.md (revision 1)"
reviewer: "spec-review-agent (fresh; did not author)"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: "1 of at most 2"
upstream:
  requirements_revision: 1
  design_revision: 2 (review-design pass 2 verdict: approve, 0 blockers)
---

# Review: auth-hardening — tasks.md (pass 1)

## Scope of this review

Read cold: `tasks.md` (rev 1, 16 tasks), then upstream `requirements.md`
(rev 1) and `design.md` (rev 2), `.claude/CLAUDE.md`, and the codebase.
Verified the as-built line/behavior claims the tasks rely on against the
real files (`router.ts`, `oauth.ts`, `server.ts`, `env.ts`,
`redis-session.ts`, `rbac-permissions.ts`, `scripts/test-{unit,integration}.sh`,
`.github/workflows/ci.yml`, `package.json`, and the
`story-xd18-role-path.integration.test.ts` precedent).

The plan is unusually careful: it correctly stages **pin → harden →
prove**, keeps every contract change in the same task as its pinning test
(T-08/T-09), and pins the three tasks-phase concerns (C-06/C-07/C-08)
left open by the design review with binding decisions. The codebase
claims I spot-checked are accurate (see Verification below). No blockers.
Findings are concerns and nits.

## Verification of as-built claims (all confirmed)

- `router.ts` DEV-fallback region + `dispatch()` auth block: `devSession()`
  with `roles:["admin"], storeAccess:["*"], permissions:["*"], expiresAt:
  Number.MAX_SAFE_INTEGER`, one-shot `warnedDevAuth`, and the
  `!(globalThis as any).process?.env?.ONELOGIN_ISSUER` fallback branch all
  exist as described (confirms C-08 — the guard is the `globalThis`
  form, not `process.env.ONELOGIN_ISSUER`).
- `oauth.ts` `validateToken` empty-issuer branch (`if (!this.config.issuer)
  { console.warn(...); return this.decodeToken(idToken); }`) exists.
- `server.ts`: `const env = loadEnv()` at `:14`, `Bun.serve` at `:42`,
  `main().catch(… process.exit(1))` at `:125`. The three bootstrap
  `try/catch` blocks that swallow errors are present between `:14` and
  `:42`. T-03's placement rationale holds.
- `env.ts:18` `host` default `127.0.0.1`; hand-rolled parsing (no zod).
- `redis-session.ts` `getSessionStorage()` always returns an in-memory
  `SessionStorage` (Redis TODO unwired) — `isRealBacking(): false` is a
  faithful pin.
- `rbac-permissions.ts`: `isPublicRoute` **is** `getRoutePermission(...)
  === "public"` (`:440-441`) — confirms design N-03 / T-04's "assert the
  predicate, not a duplicated set."
- `scripts/test-unit.sh`: two subshell blocks (`api` at `:19-23`, `shared`
  at `:25-29`), `api`-relative `find` — confirms C-06's scoping to the
  `api` block.
- `scripts/test-integration.sh`: single `exec bun test … __tests__ src`
  from `api/` cwd — confirms T-10's single preload point.
- `ci.yml`: integration job `env:` with `HOST: 127.0.0.1` (`:85`), boot
  step `bun run src/server.ts` (`:104`) — confirms T-12.
- `package.json` root `dev` clause `"cd api && bun run dev"` +
  `api/package.json` `"dev": "bun --hot --env-file=../.env run
  src/server.ts"` — confirms T-11's seam and the C-07 precedence question.
- `story-xd18-role-path.integration.test.ts`: `process.env.ONELOGIN_ISSUER`
  set at `:26`, dynamic `await import("../src/router")` at `:36`, `delete`
  in `afterAll` at `:199` — the env-discipline precedent is real and
  matches the Reading-guide rule verbatim.
- Helper line refs (`hasStoreAccess` oauth.ts:301, `hasDomainAccess`
  permission-resolver.ts:167, `withStoreAccess` oauth.ts:373,
  `hasPermissionByRbac` oauth.ts:276) all confirmed.

## Findings

### Blockers

None.

### Concerns

**C-01 — The T-10 preload sets `AUTH_DEV_FALLBACK=1` for the *whole*
integration run, so T-08's AC-10 fail-closed case must actively `delete`
the var, not merely "not set" it — and the task does not say so.**
`scripts/test-integration.sh` runs one `bun test` process; T-10 adds
`--preload auth-dev-fallback.preload.ts`, which sets
`process.env.AUTH_DEV_FALLBACK="1"` before *any* module loads —
including `auth-fail-closed.integration.test.ts`. T-08's AC-10 arm
requires `AUTH_DEV_FALLBACK` **unset** to observe 401 (`devFallbackEligible()`
→ `loadEnv()` snapshots `authDevFallback` at call time). The task text
says each case "sets env **explicitly** … via `process.env` **before**
the dynamic import" (good for the *set* cases AC-11/AC-12), but the AC-10
case must **`delete process.env.AUTH_DEV_FALLBACK`** to overcome the
preload — "not setting it" is insufficient because the preload already
set it. The design's intent is clear ("they observe the true hardened
default regardless of the preload"), and T-08's steps do mandate the
`afterAll` delete, but the *pre-case* explicit **unset** of the
preloaded var is the load-bearing step and is only implied.
*Recommendation:* in T-08's steps for the AC-10 arm, state explicitly:
"`delete process.env.AUTH_DEV_FALLBACK` (and `ONELOGIN_ISSUER`) **before**
the dynamic `await import`, overriding the T-10 preload, so the case
observes the fail-closed default." Same note applies to the AC-13
empty-issuer-no-opt-in arm in T-09 (`auth-jwt-verify.test.ts` is a unit
file, so the T-10 *integration* preload does not touch it — but the
*unit* preload in `test-unit.sh` does; T-09 must `delete` there too).

**C-02 — T-09's AC-13 fail-closed arm rides the `test-unit.sh` preload,
which the task does not account for.** `auth-jwt-verify.test.ts` is a
plain `*.test.ts` unit file (T-05/T-09), so it runs under
`scripts/test-unit.sh`, to which T-10 adds the *same* preload
(`AUTH_DEV_FALLBACK=1`). T-09's "empty issuer + opt-in **absent** →
throws" arm therefore needs the same explicit `delete
process.env.AUTH_DEV_FALLBACK` before constructing the client and calling
`validateToken`. T-09's steps mention env discipline generically
("set them before … and `delete` in `afterAll`") but, like C-01, the
active-unset-of-the-preloaded-var is the step that actually makes the
fail-closed arm fail closed. *Recommendation:* make the pre-case `delete`
explicit in T-09's AC-13-absent arm; note that `devFallbackEligible()`
inside `validateToken` reads `loadEnv().host` (loopback by default under
the preload) — so *only* `AUTH_DEV_FALLBACK` gates the throw here, making
its unset the single point that must be right.

**C-03 — T-11's C-07 precedence check is a `manual:` DoD that may fail on
the reviewer's/CI's machine but silently pass on the author's, and its
fallback ("git-ignored local `.env`") is unverifiable in review.** The
task correctly lands the inline `AUTH_DEV_FALLBACK=1` prefix and
empirically verifies precedence over `--env-file=../.env`. But the whole
correctness of the primary local-dev seam hinges on Bun's
inline-prefix-vs-`--env-file` precedence, which the design itself calls
"an assumption." If it bites, the sanctioned fallback is a developer's
untracked `.env` — which means `bun run dev` does **not** work
out-of-the-box, contradicting the design's "primary,
zero-developer-action seam" claim. This is not a blocker (the escape
hatch works either way, and CI uses the `ci.yml env:` route which is
unambiguous), but the DoD should record the *observed* precedence result
so the next reviewer/executor knows which path is live. *Recommendation:*
have T-11's DoD write the empirically-observed outcome (inline wins /
inline shadowed → local-`.env` fallback applied) into STATUS.md, so the
"works out of the box" claim is either confirmed or explicitly downgraded
to "requires local `.env`."

**C-04 — AC-14's two-request non-latching assertion is claimed under both
an integration test (T-08) and a manual harness (T-13), and the two may
disagree on how `console.warn` is observed under the preload.** T-08's
AC-14 arm spies `console.warn` across two sequential `route()` calls;
T-13 re-runs it as a manual stderr harness. Both are fine, but the T-08
automated arm needs the fallback *active* (opt-in set + loopback), which
under the integration preload is already the default — so the T-08 AC-14
case must be careful **not** to `delete AUTH_DEV_FALLBACK` (unlike the
AC-10 case in the same file). Two cases in the same file wanting opposite
env is exactly the order-dependence the env-discipline rule guards
against; the file must set/unset per `describe` and never leak. This is
manageable but under-specified. *Recommendation:* T-08 should state that
AC-10 and AC-14 live in **separate `describe` blocks** each with their
own `beforeAll` set/`afterAll` delete of `AUTH_DEV_FALLBACK`, so the
"unset for AC-10, set for AC-14" split is explicit and order-independent.

**C-05 — `warnDevFallbackEveryRequest()` per-request `console.warn` is
correct per FR-10/Risk-6, but T-08 does not budget the log-volume
interaction with the T-10 preload in CI.** With the preload active, every
integration test that rides the fallback now emits the warning **per
request** (latch gone), across the ~30 legacy `*-authz`/integration
tests. Requirements Risk 6 accepts the noise "on a busy dev instance,"
but the CI integration job will now print the multi-line
`[auth] DEV-ONLY …` warning on essentially every request in the suite.
That is cosmetically noisy and could bury a real failure in the CI log.
*Recommendation:* acceptable as-is per the recorded decision, but note in
T-10 or T-13 that the CI integration log will carry per-request warnings;
if it obscures failures, the design's own Risk-6 escape ("bounded
cadence, still per-N-requests, never one-shot") is the sanctioned relief
and needs no re-review.

### Nits

**N-01 — Line-number drift in as-built refs.** The empty-issuer branch is
`oauth.ts:96-100` in the current tree (T-05/T-09 cite `:96-101` and
`:97-101`); the `dispatch()` fallback branch is at the lines around
`:361-366` (tasks cite `:363-366`). All within a line or two and the
comment-anchors (design DD-04) are the authoritative granularity, so this
is harmless — but T-08/T-09 executors should locate by anchor, not the
cited number.

**N-02 — T-07 folds three unrelated test files into one task (AC-05 +
AC-09 + NFR-06/DEC-07 middleware guard).** All three are "pin an unwired
surface," so the grouping is defensible and each has a verification path,
but T-07 touches 3 files with 3 distinct concerns — the largest fan-out
in the plan. Not a blocker (the review cap for `router.ts` edits is not
implicated; these are test-only). *Optional:* if execution stalls,
splitting the middleware-unwired guard into its own task is a clean seam.

**N-03 — T-13 flags seven recorded decisions (DEC-01…DEC-07) into the
consolidated report, but DEC-06 was marked "no (internal test mechanics)"
in the requirements Risks table.** T-13's step 5 lists DEC-01/02/03/04/05/07
(correctly omits DEC-06) — good, this is consistent. Noting only to
confirm the reviewer checked it; no change needed.

## Completeness / Traceability

Every FR and AC from `requirements.md` maps to a task, and the
`tasks.md` Traceability table matches what the task bodies actually do.
Cross-checked against the design's File Changes table — all 20 file
changes are claimed by a task, and no task invents a file outside the
design. Spot-checks below.

| AC | Requirement | Closed by (tasks) | Design ref | Assessment |
|----|-------------|-------------------|------------|------------|
| AC-01 | FR-01 no-session→401 | T-04 | §4.1 | Covered; `req.user` not-set + downstream-not-invoked asserted |
| AC-02 | FR-01/FR-06 unknown/expired→401, valid→dispatch | T-04 | §4.1/§4.3 | Covered (Neo4j fixture) |
| AC-03 | FR-02 403 vs 401 distinct, perm matching | T-04 | §4.1/§3.3 | Covered incl. exact/`resource:*`/`*` |
| AC-04 | FR-03 public routes + `auth/me` not public | T-04 | §4.1 | Covered; asserts the `=== "public"` predicate (N-03 design) |
| AC-05 | FR-04 mapping-completeness guard | T-07 | §4.7 | Covered; representative (not exhaustive) — matches DEC-03 rationale |
| AC-06 | FR-05 issuer-set reject cases | T-05 | §4.2 | Covered; RS256 + `jwksOverride`, no network |
| AC-07 | FR-06 session lifecycle | T-04 | §4.3 | Covered |
| AC-08 | FR-07 resolver union + driver-error empty | T-06 | §3.3/§4 | Covered (PARENT_OF edge + fail-closed) |
| AC-09 | FR-08 unwired helpers + gate-does-not-call | T-07 | §4.6 | Covered (pure logic + negative assertion) |
| AC-10 | FR-09 fail-closed default | T-08 | §4.4 | Covered — **see C-01 (must delete preloaded var)** |
| AC-11 | FR-09 escape hatch | T-08 | §4.4 | Covered |
| AC-12 | FR-09/DEC-02 non-loopback refusal | T-08 (+T-03 boot) | §4.5 | Covered; accepts throw-or-401 per DEC-02 |
| AC-13 | FR-10 signature-bypass gated | T-09 | §4.4 | Covered — **see C-02 (unit preload)** |
| AC-14 | FR-10 loud non-latching | T-08 + T-13 manual | §4.4 | Covered — **see C-04 (env split)** |
| AC-15 | FR-11 Redis decision applied | T-06 (+T-02 seam) | §4.10 | Covered (option b: keep + `assertSessionBacking`) |
| AC-16 | FR-14 legacy suite green | T-10/11/12/13 | §4.11 | Covered — **see C-05 (CI log noise)** |
| AC-17 | FR-09/NFR-02 env doc + typecheck | T-12/13 | §7 | Covered |

FR-side: FR-01…FR-14 + NFR-01…NFR-06 each map to a task in the tasks
Traceability table; verified against task bodies. NFR-01
(central-gate-only) is enforced structurally by the Reading-guide
"never a `dispatchInternal()` registration" rule and T-08's owned-block
constraint — good.

**Done well:**
- Same-task pinning (T-08/T-09) honours design R1 exactly; the pin-tests
  (T-04) are correctly a `Blocks` dependency of the harden task (T-08).
- The three open design concerns (C-06/C-07/C-08) are pinned with binding
  decisions and each anchored to a specific task — nothing left for the
  executor to re-litigate.
- Every task has a concrete `Verification` field (test path or `manual:`
  with input mode + observable outcome) — the completion-hook gate is
  satisfiable. No task exceeds 3 files.
- Env discipline (dynamic import + `afterAll` delete) is elevated from a
  design paragraph to a checkable Reading-guide rule with a real
  precedent — the single most likely source of cross-file flakiness is
  pre-empted.

## Verdict

**approve.** Zero blockers. The plan is faithful to an already-approved
(rev 2) design, the codebase claims it rests on are accurate, and
traceability is complete and honest. The five concerns (C-01…C-05) all
concern the same root subtlety — the T-10 preload sets
`AUTH_DEV_FALLBACK=1` globally, so the fail-closed test arms must
**actively delete** it per-case, not merely refrain from setting it — and
are worth landing during execution (they are one-line clarifications to
the T-08/T-09 step text, well within the remaining review budget). They
do not block approval because the design's stated intent ("observe the
true hardened default regardless of the preload") and T-08/T-09's
`afterAll` deletes already establish the mechanism; C-01/C-02 only ask
that the *pre-case* unset be made explicit so an executor cannot get it
subtly wrong. Recommend the author fold C-01…C-04 into the T-08/T-09 step
text and record C-03's precedence outcome and C-05's log-noise note when
executing.
