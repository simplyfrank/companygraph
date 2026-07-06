---
feature: "auth-hardening"
created: "2026-07-06"
author: "spec-author (blueprint: business-modeling-studio; governance backfill of _baseline FR-05)"
status: "draft"
revision: 1
reviewing_requirements_revision: 1
reviewing_design_revision: 2
size: "large"
total_tasks: 16
---

# Tasks: auth-hardening

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocks` / `Blocked by`); no out-of-order execution. The plan is
  staged **pin → harden → prove** (design §1): Stage 0 lays the config +
  security seam and its unit pins; Stage 1 pins the as-built contract;
  Stage 2 lands the security-critical fail-closed hardening WITH its
  regression tests; Stage 3 wires the legacy-suite opt-in so the
  hardened default does not turn the rest of the suite red.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook (`.claude/hooks/spec-completion-check.sh`) blocks
  STATUS.md updates without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h with one
  judgment call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck`;
  after tasks that ship behaviour, also run the listed test. No `pwa/`
  file is touched by this spec (server-only, requirements UI/UX: none),
  so no `design-conformance.ts` run applies.
- **Server-only, central-gate-only (NFR-01)**: all edits are confined to
  the `api/src/auth/**` subsystem, the `env.ts`/`server.ts` boot path,
  and the **owned auth block of `router.ts`** (design §4.8) — never a
  `dispatchInternal()` route registration, never a per-route auth check.
- **Same-task pairing (binding, design R1/DD-01 — "pin before harden")**:
  each intentional contract change lands in the **same task** as the
  test that pins its new behavior:
  1. Router fail-closed fallback branch + latch removal (FR-09/FR-10) →
     **T-08** (lands with `auth-fail-closed.integration.test.ts`).
  2. `validateToken` empty-issuer throw (FR-10) → **T-09** (lands with
     the AC-13 arm of `auth-jwt-verify.test.ts`).
- **Env discipline for router-importing tests (binding, design §4.11 /
  §8, Resolves design-review C-04)**: any test that mutates
  `ONELOGIN_ISSUER`, `AUTH_DEV_FALLBACK`, or `HOST` before exercising the
  router MUST (a) load the router via a **dynamic**
  `const { route } = await import("../src/router")` placed *after* the
  env assignments — never a static top-of-file import (which hoists above
  them and reads stale env) — and (b) `delete` each mutated var in
  `afterAll` so it never leaks into sibling files sharing the one
  `bun test` process. The `story-xd18-role-path.integration.test.ts`
  precedent (dynamic `await import` after the env set, `delete` in
  `afterAll`) is the pattern to copy.
- **Integration-test naming**: `scripts/test-integration.sh` selects by
  test-name pattern `^integration:` — every `describe` in a new
  `*.integration.test.ts` file MUST be prefixed `integration: ` or the
  suite silently skips it. Plain `*.test.ts` unit files run under the
  `unit` job.
- **No new surface (design R5/DD-05)**: no new REST route, no OpenAPI
  path, no `ERROR_CODES` addition; the 401/403 bodies stay the as-built
  `{"error":"Unauthorized"}` / `{"error":"Forbidden"}` shape (NFR-03).

## Open design concerns — pinned decisions

Design review pass 2 (`review-design.md`, verdict **approve**, 0
blockers) left three tasks-phase concerns for the tasks author to pin.
The decisions here are binding for execution.

| Concern | Decision | Rationale | Locked in task |
|---------|----------|-----------|----------------|
| C-06 — `scripts/test-unit.sh` runs `bun test` in **two** workspace blocks (`api` at `:22`, `shared` at `:28`); the preload file is `api/`-relative and does not exist for `shared`. | The `--preload __tests__/_setup/auth-dev-fallback.preload.ts` flag is added to the **`api` block ONLY** (the `bun test … $files` line inside the `( cd api … )` subshell). The `shared` block is left untouched — adding the flag there would fail (no such path resolvable from `shared/` cwd), and `shared` has no auth tests to gate. `scripts/test-integration.sh` runs a single `bun test` from `api/` cwd, so its preload flag is unambiguous. | The preload seeds the loopback dev opt-in for `api` router-importing unit tests only; `shared` never imports the router. Scoping avoids a broken `shared` invocation. | T-10 |
| C-07 — the inline `AUTH_DEV_FALLBACK=1` in the `dev` command relies on winning over `api`'s `--env-file=../.env`; Bun's inline-prefix-vs-`--env-file` precedence is an assumption, not a verified fact. | Land the inline prefix as designed (§4.11), then **verify precedence empirically** in the T-11 DoD: with an unset `ONELOGIN_ISSUER` and no `AUTH_DEV_FALLBACK` line in a local `.env`, `bun run dev` on loopback must serve a non-public route (not 401). If precedence bites (inline shadowed by `--env-file`), fall back to the design §9-permitted **git-ignored local `.env`** route (`AUTH_DEV_FALLBACK=1` in the developer's own untracked `.env`) — a documented, sanctioned alternative that needs no re-review. | The fail-closed default must not silently brick local `bun run dev`; the fallback route is already blessed by §9. A one-line manual check closes the assumption. | T-11 |
| C-08 — the as-built router guard reads `(globalThis as any).process?.env?.ONELOGIN_ISSUER` (`router.ts:363`), not the `process.env.ONELOGIN_ISSUER` form the design's §4.1/§4.4 snippets write (behaviorally identical). | The T-08 owned-block edit **normalizes** the issuer read to `process.env.ONELOGIN_ISSUER` (Bun exposes `process` globally; the `globalThis.process?.` guard is defensive cruft the rewrite discards) so the "documented exactly as the code behaves" claim stays literally true post-edit. The pinning tests read the real (normalized) form. Purely cosmetic — no behavior change. | Keeps the code and the spec in sync after the owned-block rewrite; avoids a second access form drifting in the one branch this spec rewrites wholesale. | T-08 |

## Task list

### Stage 0 — config field + security seam (no behavior change yet)

### T-01 — `AUTH_DEV_FALLBACK` env field in `env.ts`

- **Files** (1): `api/src/env.ts` (modify)
- **Implements**: design §3.1 — serves FR-09, DEC-01, NFR-02 (feeds
  AC-10, AC-11, AC-12, AC-17)
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-02, T-05
- **Steps**: Add one field `authDevFallback: boolean` to the `Env`
  interface. In `loadEnv()`, parse it with the file's existing
  hand-rolled pattern (NOT zod — NFR-02 permits matching `env.ts`'s
  style): `const authDevFallback = process.env.AUTH_DEV_FALLBACK === "1"
  || process.env.AUTH_DEV_FALLBACK?.toLowerCase() === "true";` and
  include it in the returned object. Default is **false/unset** (the
  safe, closed state). Leave `host` (default `127.0.0.1`, `env.ts:18`)
  and every other field unchanged — `host` is the authoritative bind host
  the loopback check keys off.
- **Verification**: manual: from repo root run
  `AUTH_DEV_FALLBACK=1 bun -e 'import {loadEnv} from "./api/src/env"; console.log(loadEnv().authDevFallback)'`
  then `bun -e 'import {loadEnv} from "./api/src/env"; console.log(loadEnv().authDevFallback)'`
  (CLI) — expect `true` then `false` (opt-in parsed; default off). If
  `bun -e` quoting/cwd misbehaves, drop the snippet into a scratch file
  and `bun <file>` — same expected output, no re-review needed

### T-02 — `dev-fallback.ts` security module (predicate + posture asserts)

- **Files** (2): `api/src/auth/dev-fallback.ts` (new),
  `api/src/auth/redis-session.ts` (modify — narrow: add exported
  `isRealBacking(): boolean` returning `false` while the Redis TODO
  stands; no other change)
- **Implements**: design §4.4, §4.5, §4.10 — serves FR-09, FR-10, FR-11,
  DEC-01, DEC-02, DEC-05 (feeds AC-10, AC-11, AC-12, AC-15)
- **Complexity**: moderate
- **Blocked by**: T-01
- **Blocks**: T-03, T-08, T-09, T-06 (via `assertSessionBacking`)
- **Steps**: Create `api/src/auth/dev-fallback.ts` exporting, verbatim
  from design §4.4/§4.5:
  1. `isLoopbackHost(host: string): boolean` — `true` for `127.0.0.1`,
     `::1`, `localhost`.
  2. `devFallbackEligible(env = loadEnv(), issuer = process.env.ONELOGIN_ISSUER): boolean`
     — `env.authDevFallback && isLoopbackHost(env.host) && !issuer`
     (all three must hold; any other combination → not eligible → fail
     closed). The `env`/`issuer` params default to live values but are
     injectable so unit tests stay hermetic (no `process.env` mutation).
  3. `assertSessionBacking(env = loadEnv()): void` — throws a named error
     when `!isLoopbackHost(env.host)` **and** `!isRealBacking()` (the
     in-memory stub). Keys on **host alone**, NOT on `issuer` (Resolves
     design C-02: a loopback OneLogin smoke-test must still boot; the
     single-process loopback in-memory `Map` is a correct backing there).
  4. `assertAuthPosture(env = loadEnv()): void` — (a) DEC-02: throw a
     named error when `env.authDevFallback && !isLoopbackHost(env.host)`
     (opt-in on a non-loopback host is a misconfiguration → crash loudly);
     (b) call `assertSessionBacking(env)`. Error messages per design
     §4.4/§4.5 (name `AUTH_DEV_FALLBACK`, `HOST`, and the loopback-only /
     set-`ONELOGIN_ISSUER` remediation).
  In `redis-session.ts`, export `isRealBacking(): boolean { return false; }`
  (design §4.10) — the only edit to that file; `getSessionStorage()`
  stays as-built (always in-memory). No import of this module anywhere
  yet (wiring lands in T-08/T-09/T-05); keep it inert.
- **Verification**: `api/__tests__/auth-fail-closed.integration.test.ts`
  (unit-level arms — created in T-08; this task's logic is exercised
  there via direct `devFallbackEligible`/`assertAuthPosture` calls with
  injected `env` objects). Interim self-check: manual: from repo root run
  `bun -e 'import {devFallbackEligible,assertAuthPosture} from "./api/src/auth/dev-fallback"; console.log(devFallbackEligible({authDevFallback:true,host:"127.0.0.1"} as any, undefined)); try{assertAuthPosture({authDevFallback:true,host:"10.0.0.5"} as any)}catch(e){console.log("threw:",e.message.slice(0,20))}'`
  (CLI) — expect `true` then `threw: [auth] AUTH_DEV_FALLB…`

### T-03 — Boot-time posture assertion wired into `server.ts`

- **Files** (1): `api/src/server.ts` (modify — narrow)
- **Implements**: design §4.5, §7 (`server.ts` row) — serves FR-09,
  DEC-02, DEC-05 (feeds AC-12)
- **Complexity**: simple
- **Blocked by**: T-02
- **Blocks**: T-08
- **Steps**: Import `assertAuthPosture` from `./auth/dev-fallback` and
  call `assertAuthPosture(env)` **synchronously** in `main()`
  **immediately after** `const env = loadEnv();` (`server.ts:14`) and
  **before both** (a) the three bootstrap `try/catch` blocks
  (`server.ts:17-38`, which swallow their errors and would mask a throw)
  **and** (b) `Bun.serve(...)` (`server.ts:42`, which would otherwise
  bind the port before the check) — placement is load-bearing (Resolves
  design C-05). A thrown posture error unwinds to the existing outer
  `main().catch(… process.exit(1))` (`server.ts:125-127`), so a
  misconfigured deploy exits non-zero without ever binding. No other
  `server.ts` line changes; the default loopback bind (NFR-04) is
  unchanged.
- **Verification**: manual: from repo root run
  `HOST=10.0.0.5 AUTH_DEV_FALLBACK=1 bun run api/src/server.ts`
  (CLI) — expect the process to **exit non-zero** and log the
  `[auth] AUTH_DEV_FALLBACK is set but HOST=10.0.0.5 is not loopback`
  posture error, never binding the port; then `bun run api/src/server.ts`
  (default loopback, no opt-in, no issuer) — expect it to boot normally
  (fail-closed at the gate, not at boot). Kill the loopback run after the
  bind log

### Stage 1 — pin the as-built contract (no behavior change)

### T-04 — Central gate contract pins (401 / 403 / public / session)

- **Files** (2): `api/__tests__/auth-gate.integration.test.ts` (new),
  `api/__tests__/auth-session.test.ts` (new)
- **Implements**: design §4.1, §4.3, §3.2, §3.3 — closes AC-01, AC-02,
  AC-03, AC-04, AC-07; serves FR-01, FR-02, FR-03, FR-06, FR-12
- **Complexity**: complex
- **Blocked by**: — (pins as-built behavior; runs against the
  issuer-configured branch, which is unchanged by this spec)
- **Blocks**: T-08 (the gate pins must be green *before* the fallback
  branch is rewritten — pin-before-harden, R1)
- **Steps**:
  `auth-gate.integration.test.ts` (`describe` prefixed `integration: `;
  needs Neo4j): set `process.env.ONELOGIN_ISSUER` to a test double **and**
  `AUTH_DEV_FALLBACK` unset before the mandatory dynamic
  `const { route } = await import("../src/router")` (env discipline —
  Reading guide); `delete` both in `afterAll`. Seed a
  `User→HAS_PERSONA→Persona→HAS_RBAC_ROLE→RBACRole` graph via the
  production `getDriver()`; mint a session with `createSession` (from
  `auth/oauth`) carrying known `permissions`; set the `session=` cookie
  on the request. Assert, on a single non-public route to prove the
  branch split (AC-03): no `session=` cookie → `401 {"error":"Unauthorized"}`,
  downstream handler not invoked (AC-01); unknown session id → `401`;
  expired session (past `expiresAt`) → `401` (AC-02); valid session
  **lacking** the route permission → `403 {"error":"Forbidden"}`; the
  **same** valid session **with** a satisfying permission (cover exact,
  `resource:*` prefix, and `*` wildcard per `hasPermissionByRbac`,
  `oauth.ts:276-299`) → dispatched with `req.user` populated (AC-02/AC-03).
  Public routes (`healthz`, `openapi.json`, `metrics`, `auth/login`,
  `auth/callback`, `auth/logout`) dispatch with **no** session; `auth/me`
  **without** a session → `401` (not public — AC-04). `afterAll`
  `DETACH DELETE` the seeded persona graph by id.
  `auth-session.test.ts` (unit `*.test.ts`): round-trip the six carried
  fields through `createSession → getSession → deleteSession`
  (`oauth.ts:149-215`); assert `getSession` returns `null` after
  `expiresAt` (construct a short-TTL / past-expiry session directly);
  `deleteSession` removes it (AC-07). Note: the DEC-05 `assertSessionBacking`
  outcome for this file lands in T-06 (AC-15) — keep the two AC families
  in their tasks.
- **Verification**: `api/__tests__/auth-gate.integration.test.ts` (via
  `bun run test:integration`; needs Neo4j) + `api/__tests__/auth-session.test.ts`
  (via `bun test`)

### T-05 — JWT verification pins (issuer-set reject cases)

- **Files** (2): `api/src/auth/oauth.ts` (modify — additive
  `jwksOverride` constructor seam, §4.2; **no** behavior change to the
  issuer-set path, and the empty-issuer hardening is deferred to T-09),
  `api/__tests__/auth-jwt-verify.test.ts` (new)
- **Implements**: design §4.2, §3.3 — closes AC-06; serves FR-05, FR-12
- **Complexity**: moderate
- **Blocked by**: T-01
- **Blocks**: T-09 (T-09 adds the empty-issuer throw arm to this same
  test file and the `validateToken` empty-issuer branch to this same
  source file)
- **Steps**: `oauth.ts`: add the **additive, test-only** JWKS seam per
  design §4.2 — a second optional constructor param
  `jwksOverride?: JwksResolver` (`type JwksResolver = ReturnType<typeof createRemoteJWKSet>`),
  and in `getJwks()` return `this.jwksOverride` when present, else the
  existing memoized remote set (`oauth.ts:137-145`). Production callers
  (`routes/auth.ts:17`) construct with one arg, so the seam is inert
  outside tests (DD-05 — no new surface). Do **not** touch the
  empty-issuer branch in this task (that is T-09's paired change).
  `auth-jwt-verify.test.ts` (unit): mint an RS256 keypair with jose
  `generateKeyPair("RS256")` (already a dep — no network, NFR-05); sign
  tokens with `new SignJWT(...).setIssuer(...).setAudience(...)`; pass
  `createLocalJWKSet({ keys: [publicJwk] })` as `jwksOverride`. Construct
  an `OAuthClient` with `config.issuer` **set**. Assert: a good token
  verifies; bad-signature (signed by a *different* key), wrong-`issuer`,
  wrong-`audience`, and expired (`exp` in the past) tokens all **reject**
  (throw). No `process.env` mutation needed (issuer is on the config
  object, not env) — keep hermetic. The AC-13 empty-issuer arms land in
  T-09.
- **Verification**: `api/__tests__/auth-jwt-verify.test.ts` (via
  `bun test`; no network)

### T-06 — Permission resolver + session-backing pins

- **Files** (2): `api/__tests__/permission-resolver.integration.test.ts`
  (new), `api/__tests__/auth-session.test.ts` (modify — append the
  DEC-05 `assertSessionBacking` arm, AC-15)
- **Implements**: design §3.3, §4.10, §8 — closes AC-08, AC-15; serves
  FR-07, FR-11, DEC-05
- **Complexity**: moderate
- **Blocked by**: T-02 (consumes `assertSessionBacking`/`isRealBacking`),
  T-04 (extends `auth-session.test.ts`)
- **Blocks**: —
- **Steps**:
  `permission-resolver.integration.test.ts` (`describe` prefixed
  `integration: `; needs Neo4j): seed a
  `User→HAS_PERSONA→Persona→HAS_RBAC_ROLE→RBACRole` fixture via
  `getDriver()` including **one** `PARENT_OF` inheritance edge between
  two RBAC roles. Assert `resolveUserPermissions(userId)`
  (`permission-resolver.ts`) returns: the union of **direct**
  (`HAS_RBAC_ROLE`) **and** `PARENT_OF`-inherited role permissions; a
  **deduped** `rbacRoles`; and `personaAssignments` carrying `domainIds`.
  Then assert the **driver-error → all-empty** fail-closed path
  (`permission-resolver.ts:82-88`) — e.g. by querying with a
  driver/session forced to error, expecting `{personaAssignments:[],
  rbacRoles:[], permissions:[]}`. `afterAll` `DETACH DELETE` the seeded
  graph by id.
  `auth-session.test.ts` (append, AC-15 / DEC-05): assert
  `assertSessionBacking` **throws** for a **non-loopback** `env`
  (`{authDevFallback:false, host:"10.0.0.5"}` on the in-memory backing —
  `isRealBacking()===false`), and does **not** throw for a **loopback**
  `env` — including loopback **with** `ONELOGIN_ISSUER` set (C-02: the
  JWKS smoke-test path must still boot), not only loopback-no-issuer.
  Call it with injected `env` objects (no `process.env` mutation).
- **Verification**: `api/__tests__/permission-resolver.integration.test.ts`
  (via `bun run test:integration`; needs Neo4j) +
  `api/__tests__/auth-session.test.ts` (via `bun test`)

### T-07 — Store/domain unwired pins + unmapped-route + middleware-unwired guards

- **Files** (3): `api/__tests__/auth-store-domain.test.ts` (new),
  `api/__tests__/rbac-route-permissions.test.ts` (modify — append the
  completeness guard; existing file),
  `api/__tests__/middleware-unwired.test.ts` (new)
- **Implements**: design §4.6, §4.7, §4.9 — closes AC-05, AC-09; serves
  FR-04, FR-08, NFR-06, DEC-03, DEC-04, DEC-07, FR-12
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: —
- **Steps**:
  `auth-store-domain.test.ts` (unit, AC-09 / FR-08 / DEC-04): pin the
  pure logic of the **unwired** helpers — `hasStoreAccess`
  (`oauth.ts:301-303`: `"*"` wildcard, exact membership), `hasDomainAccess`
  (`permission-resolver.ts:167-177`: persona-domain `*`/membership),
  and the `withStoreAccess` factory's 403-vs-pass composition
  (`oauth.ts:373-408`) driven with a synthetic `req` object (no HTTP).
  Also `hasPermissionByRbac` exact / `resource:*` / `*` if not already
  covered by T-04. Add the **assertion of the negative** (design §4.6):
  document in a header comment + one explicit assertion that the router
  gate does **not** consult store/domain gating as-built — the cleanest
  form is a comment citing DEC-04 plus a grep-style guard (no external
  importer wires these), so a future wiring becomes a visible contract
  change.
  `rbac-route-permissions.test.ts` (append, AC-05 / FR-04 / DEC-03): add
  a **completeness** case — for a curated list of representative
  non-public routes (one per resource family, drawn from design §5),
  assert `getRoutePermission(method, path) != null`. NOT an exhaustive
  ~200-arm enumeration (that duplicates each downstream spec's own test
  and rots). The header comment documents the as-built unmapped→skip
  property and cites DEC-03 (fail-closed-on-unmapped is a tracked
  follow-up, out of blast radius).
  `middleware-unwired.test.ts` (new, NFR-06 / DEC-07): assert neither
  `router.ts` nor `server.ts` imports `middleware/correlation-id.ts`
  (`withCorrelationId`) or `middleware/rate-limit.ts`
  (`checkRateLimit`/`cleanupExpiredEntries`) — e.g. read the two source
  files and assert the import strings are absent — so the "unwired"
  status is pinned and any future wiring is a visible change.
- **Verification**: `api/__tests__/auth-store-domain.test.ts`,
  `api/__tests__/rbac-route-permissions.test.ts`,
  `api/__tests__/middleware-unwired.test.ts` (all via `bun test`)

### Stage 2 — harden the dev fallback (PRIMARY, security-critical)

### T-08 — Router fail-closed fallback branch + non-latching signal + regression tests

- **Files** (2): `api/src/router.ts` (modify — **owned block only**,
  design §4.8: the `devSession()`/`warnedDevAuth` region `:334-355` and
  the auth block of `dispatch()` `:357-401`, plus the import line),
  `api/__tests__/auth-fail-closed.integration.test.ts` (new)
- **Implements**: design §4.4, §4.8, §8 — closes AC-10, AC-11, AC-12,
  AC-14; serves FR-09, FR-10, FR-12, FR-13; **primary security-critical
  goal**
- **Complexity**: complex
- **Blocked by**: T-02 (consumes `devFallbackEligible`), T-03
  (`assertAuthPosture` boots the posture check), T-04 (the gate pins must
  be green *before* the branch is rewritten — pin-before-harden R1)
- **Blocks**: —
- **Steps**: Edit **only** the owned block (design §4.8; merge rule: this
  spec never touches a `dispatchInternal()` registration; conflicts
  resolve by section ownership, not last-writer-wins).
  1. Replace the `warnedDevAuth` one-shot + `devSession()` region
     (`router.ts:334-355`) — keep the `devSession()` **shape**
     (`roles:["admin"]`, `permissions:["*"]`, `storeAccess:["*"]`,
     `expiresAt: Number.MAX_SAFE_INTEGER`) but retire the latch; add
     `warnDevFallbackEveryRequest()` that `console.warn`s the design
     §4.4 message ("[auth] DEV-ONLY fallback ACTIVE — this instance is
     UNAUTHENTICATED with FULL admin permissions … NEVER expose beyond
     127.0.0.1 …") on **every** call (FR-10; per-request noise accepted,
     requirements Risk 6).
  2. Rewrite the `dispatch()` fallback branch (`router.ts:363-366`).
     Normalize the issuer read to `process.env.ONELOGIN_ISSUER`
     (Resolves C-08 — drop the `(globalThis as any).process?.` cruft).
     Inside the `if (!process.env.ONELOGIN_ISSUER)` branch: if
     `devFallbackEligible()` → `warnDevFallbackEveryRequest()`;
     `(req as any).user = devSession()`; `return dispatchInternal(...)`;
     **else** fail closed → `return new Response(JSON.stringify({ error:
     "Unauthorized" }), { status: 401, headers: {"content-type":
     "application/json"} })`. Keep the N-01 comment noting the branch's
     outer guard already establishes `!issuer`. The issuer-configured
     branch below is **unchanged**.
  3. Add the `devFallbackEligible` / warn-helper import at the top of
     the file. Touch **no** `dispatchInternal()` line.
  `auth-fail-closed.integration.test.ts` (`describe` prefixed
  `integration: `): each case sets env **explicitly** (never relying on
  the T-10 preload) via `process.env` **before** the mandatory dynamic
  `const { route } = await import("../src/router")`, and `delete`s each
  var in `afterAll` (env discipline). Assert:
  - **AC-10** (fail-closed default): `ONELOGIN_ISSUER` unset +
    `AUTH_DEV_FALLBACK` unset → a non-public route returns `401`; **no**
    `devSession()` admin context attached (`req.user` never set).
  - **AC-11** (dev escape hatch): issuer unset + `AUTH_DEV_FALLBACK=1` +
    loopback `HOST` → dev fallback active, non-public route dispatches
    with the full-permission dev session.
  - **AC-12** (non-loopback refusal): opt-in set + non-loopback `HOST` →
    either `assertAuthPosture` **throws** (drive it directly as a unit
    call — the throw *is* the "server refuses" behavior, no real server
    spawn needed) **or** `route()` yields `401` (DEC-02 accepts either).
  - **AC-14** (loud, non-latching): with the fallback active, spy/capture
    `console.warn` across **two** sequential requests and assert the
    `[auth] DEV-ONLY …` warning appears for **each** (the latch is gone),
    naming the loopback-only constraint.
- **Verification**: `api/__tests__/auth-fail-closed.integration.test.ts`
  (via `bun run test:integration`)

### T-09 — `validateToken` empty-issuer fail-closed + AC-13 arm

- **Files** (2): `api/src/auth/oauth.ts` (modify — the empty-issuer
  branch of `validateToken`, `oauth.ts:96-101`),
  `api/__tests__/auth-jwt-verify.test.ts` (modify — append the AC-13
  empty-issuer throw/allow arms; existing file from T-05)
- **Implements**: design §4.4 (validateToken hardening), §8 — closes
  AC-13; serves FR-10, FR-12, FR-13; **primary security-critical goal**
- **Complexity**: moderate
- **Blocked by**: T-02 (consumes `devFallbackEligible`), T-05 (adds the
  `jwksOverride` seam + the base `auth-jwt-verify.test.ts` this task
  extends)
- **Blocks**: —
- **Steps**: `oauth.ts`: replace the empty-issuer branch
  (`if (!this.config.issuer) { console.warn(...); return this.decodeToken(idToken); }`,
  `oauth.ts:97-101`) with design §4.4's hardened form — inside the
  `!this.config.issuer` guard: if `!devFallbackEligible()` →
  `throw new Error("[auth] refusing to decode JWT without signature
  verification (no ONELOGIN_ISSUER and AUTH_DEV_FALLBACK not enabled on a
  loopback host)")`; else `console.warn("[auth] DEV-ONLY fallback — JWT
  signature NOT verified (decodeToken)")` and `return
  this.decodeToken(idToken)`. Import `devFallbackEligible` from
  `./dev-fallback`. The issuer-set path (`jwtVerify` + `jwksOverride`
  seam from T-05) is untouched.
  `auth-jwt-verify.test.ts` (append, AC-13, env discipline — these arms
  mutate `AUTH_DEV_FALLBACK`/`HOST`, so set them before constructing the
  client and `delete` in `afterAll`): with `config.issuer` **empty** and
  the dev opt-in **absent** → `validateToken` **throws** (never returns
  an unverified decode); with `AUTH_DEV_FALLBACK=1` + loopback `HOST` +
  empty issuer → returns the decoded payload (documented escape hatch).
- **Verification**: `api/__tests__/auth-jwt-verify.test.ts` (via
  `bun test`)

### Stage 3 — legacy-suite opt-in + docs (prove the default without breaking CI)

### T-10 — Test preload + test-script wiring (legacy suite stays green)

- **Files** (3): `api/__tests__/_setup/auth-dev-fallback.preload.ts`
  (new), `scripts/test-unit.sh` (modify — **`api` block only**, C-06),
  `scripts/test-integration.sh` (modify)
- **Implements**: design §4.11(2), §7 — serves FR-14, DEC-06 (feeds
  AC-16)
- **Complexity**: moderate
- **Blocked by**: T-08, T-09 (the hardened default must exist before the
  legacy suite needs the opt-in to stay green)
- **Blocks**: T-11, T-12
- **Steps**: Create `api/__tests__/_setup/auth-dev-fallback.preload.ts`:
  a bun preload that sets `process.env.AUTH_DEV_FALLBACK = "1"` (leaving
  `HOST` to default loopback) **before any test module loads**, so
  `route()`-level unit/integration tests that ride the dev fallback keep
  passing under the hardened default (§4.11(2)). `scripts/test-unit.sh`:
  add `--preload __tests__/_setup/auth-dev-fallback.preload.ts` to the
  `bun test … $files` invocation inside the **`api` subshell only**
  (`:22`); **leave the `shared` block (`:28`) untouched** (Resolves C-06
  — the preload path is `api/`-relative and does not resolve from
  `shared/` cwd; `shared` has no auth tests). `scripts/test-integration.sh`:
  add the same `--preload` flag to its single `exec bun test … __tests__
  src` line (already runs from `api/` cwd). This spec's own fail-closed
  tests (T-08/T-09) set env explicitly per case and do **not** rely on
  the preload, so they still observe the true hardened default.
- **Verification**: manual: from repo root run `bun run test` and
  `bun run test:integration` (needs Neo4j) (CLI) — expect both green with
  no auth-related regressions in the unrelated legacy `*-authz` /
  integration tests (they ride the preloaded loopback opt-in), while
  T-08's `auth-fail-closed` cases still observe 401 on the fail-closed
  default (they set env explicitly)

### T-11 — Local `bun run dev` opt-in seam (`package.json`)

- **Files** (1): `package.json` (root, modify — narrow)
- **Implements**: design §4.11(1), §7 (`package.json` row), §9
  amendment — serves FR-14, DEC-06 (feeds AC-16)
- **Complexity**: simple
- **Blocked by**: T-08 (the hardened default exists), T-10
- **Blocks**: T-13
- **Steps**: In the root `dev` script, change the API clause
  `"cd api && bun run dev"` → `"cd api && AUTH_DEV_FALLBACK=1 bun run
  dev"` (Resolves design B-01 — the real local spawn seam; `scripts/dev.ts`
  does not exist). This keeps the opt-in in the dev **command** (visible,
  greppable in `package.json`), never in a committed `.env` (design §9's
  committed-vs-local distinction). Do not add the var to `.env.example`
  (that is a committed default — rejected, §9). **C-07 precedence check
  (binding DoD):** `api/package.json`'s `dev` uses `--env-file=../.env`;
  after the edit, verify empirically that the inline prefix wins on a
  loopback box with an unset issuer and no `AUTH_DEV_FALLBACK` line in a
  local `.env`. If precedence bites, fall back to the design §9-permitted
  git-ignored local-`.env` route (no re-review needed).
- **Verification**: manual: with Neo4j up, run `bun run dev` on the
  default loopback host with `ONELOGIN_ISSUER` **unset** and no
  `AUTH_DEV_FALLBACK` in a local `.env` (CLI) — expect a non-public route
  (e.g. `curl -s http://127.0.0.1:8787/api/v1/domains`) to return `200`
  (dev fallback active via the inline opt-in), **not** `401`; confirm the
  `[auth] DEV-ONLY …` warning logs. If it returns `401`, apply the C-07
  local-`.env` fallback and re-verify

### T-12 — CI integration-job opt-in + `.env.example` doc

- **Files** (2): `.github/workflows/ci.yml` (modify — narrow: add one
  line to the integration job `env:` block), `.env.example` (modify)
- **Implements**: design §4.11(1), §7 (`.github/workflows/ci.yml` +
  `.env.example` rows) — serves FR-14, FR-09, DEC-06, AC-17 (feeds
  AC-16, AC-17)
- **Complexity**: simple
- **Blocked by**: T-08, T-10
- **Blocks**: T-13
- **Steps**: `ci.yml`: add `AUTH_DEV_FALLBACK: "1"` to the **integration
  job's `env:` block**, adjacent to the existing `HOST: 127.0.0.1`
  (`ci.yml:81-85`), so the `Boot API server` step's `bun run
  src/server.ts` (`ci.yml:104`) inherits it (loopback + opt-in + no
  issuer → dev session serves the integration suite exactly as before).
  Do **not** add it to the `unit` job (the T-10 preload handles unit
  tests). `.env.example`: document `AUTH_DEV_FALLBACK` (default **off**)
  near the `ONELOGIN` block (`:37-43`) with the security warning
  ("loopback-only; NEVER set outside local dev / a deployed instance;
  set `ONELOGIN_ISSUER` instead") and add a one-line cross-reference at
  `HOST` (`:12`) noting the fallback's loopback constraint is a `HOST`
  property (Resolves design N-02). Leave `AUTH_DEV_FALLBACK` **unset** in
  `.env.example` (committed template stays closed — §9).
- **Verification**: manual: open `.env.example` (editor) — verify
  `AUTH_DEV_FALLBACK` is present, commented, defaults off, and carries
  the "loopback-only / never deployed" warning + the `HOST`
  cross-reference; open `.github/workflows/ci.yml` — verify
  `AUTH_DEV_FALLBACK: "1"` sits in the integration job `env:` beside
  `HOST` and NOT in the `unit` job; run `bun run typecheck` — expect
  exit 0

### T-13 — Final validation sweep + STATUS completion

- **Files** (1): `.claude/specs/auth-hardening/STATUS.md` (modify)
- **Implements**: spec completion gate — closes AC-16, AC-17; serves
  FR-14, NFR-02
- **Complexity**: moderate
- **Blocked by**: T-11, T-12 (and transitively every earlier task)
- **Blocks**: —
- **Steps**: Run the full sweep and record per-AC verification artifacts
  in STATUS.md (`verified_at` + `verification_artifact` — the completion
  hook blocks otherwise):
  1. `bun run typecheck` green (NFR-02, AC-17).
  2. `bun test` (unit) + `bun run test:integration` (needs Neo4j) both
     green with the hardened default — the T-10 preload + T-12 CI opt-in
     keep the legacy `*-authz` suite green while T-08's `auth-fail-closed`
     cases observe 401 on the fail-closed default (AC-16).
  3. AC-14 manual arm (design §8): a two-request harness with
     `AUTH_DEV_FALLBACK=1` + loopback + no issuer; capture stderr; verify
     the `[auth] DEV-ONLY …` warning appears for **each** request (latch
     gone) and names the loopback-only constraint.
  4. AC-16 manual arm: confirm the PR's `unit` + `integration` jobs pass
     (record in the PR description) with no auth-related regressions.
  5. AC-17: `.env.example` opt-in doc present (T-12) + `bun run
     typecheck` exit 0.
  Update STATUS.md Execution → complete with the results table and the
  consolidated-report flags for the recorded decisions the operator must
  action: DEC-01 (operators of existing local stacks must set
  `AUTH_DEV_FALLBACK=1` once — or rely on the `bun run dev` inline seam);
  DEC-02 (a non-loopback box using the fallback now fails to boot until it
  sets `ONELOGIN_ISSUER`); DEC-03 (residual: a future route added without
  a `getRoutePermission` mapping is open-to-authenticated until the
  completeness guard catches it); DEC-04 (store/domain gating is **not**
  enforced at the gate — `_baseline` FR-05 over-claim corrected;
  downstreams must not assume tenancy isolation at the gate); DEC-05 (a
  real deploy needs a non-in-memory session backing before it can boot);
  DEC-07 (rate limiting is **not** enforced despite the middleware file
  existing).
- **Verification**: manual: with the dev stack up, run `bun run
  typecheck` (exit 0), `bun test`, and `bun run test:integration` (CLI) —
  expect all green; run the two-request AC-14 harness and verify the
  per-request `[auth] DEV-ONLY …` warning; confirm the PR CI jobs pass in
  GitHub Actions (browser)

## Traceability

| AC | Closed by | | FR | Implemented by |
|----|-----------|-|----|----------------|
| AC-01 | T-04 | | FR-01 | T-04 |
| AC-02 | T-04 | | FR-02 | T-04 |
| AC-03 | T-04 | | FR-03 | T-04 |
| AC-04 | T-04 | | FR-04 | T-07 |
| AC-05 | T-07 | | FR-05 | T-05 |
| AC-06 | T-05 | | FR-06 | T-04 |
| AC-07 | T-04 | | FR-07 | T-06 |
| AC-08 | T-06 | | FR-08 | T-07 |
| AC-09 | T-07 | | FR-09 | T-01, T-02, T-03, T-08 |
| AC-10 | T-08 | | FR-10 | T-08, T-09 |
| AC-11 | T-08 | | FR-11 | T-02, T-06 |
| AC-12 | T-08 | | FR-12 | T-04, T-05, T-07, T-08 |
| AC-13 | T-09 | | FR-13 | T-08 |
| AC-14 | T-08 | | FR-14 | T-10, T-11, T-12 |
| AC-15 | T-06 | | NFR-01 | (all — central-gate/subsystem only) |
| AC-16 | T-10, T-11, T-12, T-13 | | NFR-02 | T-01, T-12, T-13 |
| AC-17 | T-12, T-13 | | NFR-03 | T-08 (401/403 shape unchanged) |
|  |  | | NFR-04 | T-03 (default loopback bind unchanged) |
|  |  | | NFR-05 | T-04, T-05, T-06 (injected JWKS/no egress) |
|  |  | | NFR-06 | T-07 |

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| tasks with behaviour (unit) | the task's listed `*.test.ts` via `bun test <path>` |
| tasks with behaviour (integration) | the task's listed `*.integration.test.ts` via `bun run test:integration` (needs Neo4j) |
| T-08, T-09 | the paired fail-closed / empty-issuer test lands **in the same task** as the hardening (pin-before-harden R1); re-run it before considering the task done |
| T-10 | full `bun test` + `bun run test:integration` — legacy `*-authz` suite must stay green under the preload while fail-closed cases stay 401 |
| final task (T-13) | `bun run typecheck` + `bun test` + `bun run test:integration` (needs Neo4j) + the AC-14 two-request warning harness + the AC-16 CI-job confirmation |
