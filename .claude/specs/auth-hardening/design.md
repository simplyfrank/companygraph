---
feature: "auth-hardening"
created: "2026-07-06"
author: "spec-author (blueprint: business-modeling-studio; governance backfill of _baseline FR-05)"
status: "revised"
revision: 2
reviewing_requirements_revision: 1
reviewing_design_review: 1
size: "large"
---

# Design: auth-hardening

## 1. Overview

This spec takes the adopted auth/RBAC/tenancy subsystem out of
`_baseline` governance and does three things in a fixed order —
**pin → harden → prove** — the same discipline `kpi-okr-governance`
used on its surface:

1. **Pin.** Document the as-built contract of the central router gate,
   the OAuth/JWT client, session lifecycle, permission resolution, and
   the store/domain helpers *exactly as the code behaves today* (§3–§4,
   read line-by-line from the eight owned files), then write
   integration/unit tests that assert that contract (FR-01…FR-08). Two
   accuracy corrections against `_baseline` FR-05 are recorded honestly,
   not tested as aspiration: store/domain gating is **not wired** into
   the gate (§4.6), and the correlation-id/rate-limit middleware are
   **not wired** into request handling (§4.9).
2. **Harden (primary, security-critical).** Make the two dev-mode
   full-permission bypasses fail closed. As-built, an unset
   `ONELOGIN_ISSUER` alone attaches a synthetic admin session to every
   request (`router.ts` `devSession()`), and an empty `config.issuer`
   makes `OAuthClient.validateToken` return an **unverified** JWT decode
   (`oauth.ts`). This design introduces a single, greppable, default-off
   opt-in (`AUTH_DEV_FALLBACK`, DEC-01), resolved once through `env.ts`,
   and requires **both** the opt-in **and** a loopback bind host before
   either bypass can activate (FR-09, FR-10). Absent the opt-in, the
   gate returns `401` and `validateToken` throws — the silent-admin hole
   is closed. Opt-in on a non-loopback host is a **boot refusal**
   (DEC-02), not a per-request degrade.
3. **Prove.** Add fail-closed regression tests that exercise the gate
   through the real `route()` entrypoint with an injected issuer + JWKS
   test double (no network egress, NFR-05), and give the legacy suite —
   which rides the dev fallback — a documented, explicit opt-in via a
   test preload (DEC-06) so hardening the default does not turn the
   whole suite red (FR-14).

**Rules this design follows:**

- **R1 — Pin before harden (DD-01).** No behavior change lands before a
  test pins the behavior it replaces. The only intentional contract
  changes are the two fail-closed hardenings (FR-09/FR-10) and the
  latch removal (FR-10); each lands *with* its regression test.
- **R2 — One opt-in, resolved once (DD-02).** The dev fallback is gated
  by exactly one env var, parsed in `api/src/env.ts` into a single
  boolean `authDevFallback`, alongside the existing `host`. Neither
  bypass reads `process.env` ad hoc for the decision (the router keeps
  reading `ONELOGIN_ISSUER` for the *issuer-configured* branch; the new
  *fallback-eligible* predicate is centralized). Resolves requirements
  NFR-02.
- **R3 — Fail closed, fail loud (DD-03).** The default (no opt-in) is
  deny. A misconfigured deploy (opt-in on a non-loopback host) crashes
  at boot with a named error, never silently 401s (DEC-02). When the
  fallback *is* active it logs on every request (latch retired, FR-10).
- **R4 — Partial ownership by comment-anchor (DD-04).** This spec owns
  exactly the `devSession()` helper and the auth block of `dispatch()`
  in `router.ts` (the pre-`dispatchInternal` section), plus the eight
  `api/src/auth/**` + `api/src/middleware/**` files. It never edits any
  `dispatchInternal()` dispatch block — those stay owned by the specs
  that added them. Merge rule in §4.8.
- **R5 — No new surface (DD-05).** No new REST route, no OpenAPI path,
  no `ERROR_CODES` addition. The 401/403 bodies stay the as-built
  `{"error":"Unauthorized"}` / `{"error":"Forbidden"}` shape
  (requirements NFR-03). Store/domain wiring and middleware wiring are
  explicitly *not* done (DEC-04, DEC-07).

**Trade-off taken:** the loopback check keys off `env.host` (the value
passed to `Bun.serve({ hostname })`), not off the peer address of each
socket. A single-tenant loopback server has one bind host; per-connection
peer inspection is unavailable at the `route(req)` seam and would be
security theatre here (§9). **Trade-off rejected:** implementing a Redis
client to retire the session stub — out of scope; DEC-05 keeps the stub
behind a boot-time backing-store assertion instead.

## 2. Prior-review concerns

Fresh draft — requirements review has not yet run. The requirements
already carry seven recorded decisions (DEC-01…DEC-07); this design
**binds** each to a concrete mechanism and records where it lands:

| DEC | Bound in | Mechanism |
|-----|----------|-----------|
| DEC-01 (opt-in var name) | §3.1, §4.4 | `AUTH_DEV_FALLBACK` (truthy `1`/`true`), parsed in `env.ts` → `env.authDevFallback` |
| DEC-02 (non-loopback → boot refusal) | §4.5 | `assertAuthPosture()` called from `server.ts main()` before `Bun.serve`; throws → `process.exit(1)` |
| DEC-03 (unmapped-route stays skip; guard with test) | §4.7 | completeness unit test, no runtime change |
| DEC-04 (store/domain helpers latent, not wired) | §4.6 | unit-tested pure logic; explicit "gate does not call these" assertion |
| DEC-05 (Redis stub keep + boot assertion) | §4.5, §4.10 | `assertSessionBacking()` in the same boot posture check |
| DEC-06 (legacy suite opt-in via bootstrap) | §4.11 | bun `--preload` script (unit + integration test scripts) + `AUTH_DEV_FALLBACK=1` inline in the root `package.json` `dev` command and the CI `Boot API server` step (Resolves: B-01) |
| DEC-07 (middleware left unwired, documented) | §4.9 | doc + a "not imported by router/server" guard test |

**Design-review pass 1 (`review-design.md`, verdict: revise) — findings
resolved in this revision:**

| Finding | Resolved in | How |
|---------|-------------|-----|
| **B-01** (`scripts/dev.ts` absent; FR-14 local seam broken + collides with §9) | §4.11 (item 1), §7 (`package.json` row), §9 (committed-vs-local `.env` amendment) | Named the real seams: inline `AUTH_DEV_FALLBACK=1` in the root `package.json` `dev` command + `env:` add in the CI integration job; `.env.example` stays unset; §9 amended to allow a developer's git-ignored local `.env` while still rejecting a committed default |
| **C-01** (FR-12 never traced) | §7 (Serves column), §8 (opening para) | FR-12 tagged on the four decision-path test rows; §8 states FR-12 is the union of those suites |
| **C-02** (`assertSessionBacking` bricks issuer-configured loopback) | §4.5 | Predicate narrowed to `!isLoopbackHost(env.host)` alone; `issuer` disjunct dropped so loopback JWKS smoke-tests boot |
| **C-03** (phantom `cache-invalidation.ts` dependency cost) | §4.10, §9 | Framing corrected: `cache-invalidation.ts` is zero-importer dead code; keep-with-assertion rests on the cheap-and-correct reason, not a dependency cost |
| **C-04** (static import silently defeats env-before-import) | §4.11, §8 | Mandated dynamic `await import("../src/router")` + `afterAll` delete for any env-mutating test |
| **C-05** (`assertAuthPosture` placement ambiguous) | §4.5, §7 (`server.ts` row) | Placement pinned: after `loadEnv()` (`:14`), before the bootstrap `try/catch` (`:17-38`) and `Bun.serve` (`:42`) |
| **N-01** (redundant inner `!issuer`) | §4.4 | Comment added explaining the outer guard already establishes `!issuer` |
| **N-02** (`.env.example` HOST anchor) | §7 (`.env.example` row) | Cross-reference at `HOST` (`:12`) added |
| **N-03** (`isPublicRoute` single source) | §4.1 | Noted `isPublicRoute` is `getRoutePermission(...) === "public"`; test asserts the predicate, not a duplicated literal set |

## 3. Data model

No storage shapes change. This section documents the as-built types the
tests pin and the one new config field.

### 3.1 New config field (`api/src/env.ts`, FR-09 / DEC-01)

`Env` gains one field; `loadEnv()` parses one new var:

```ts
export interface Env {
  host: string;
  // …existing fields…
  authDevFallback: boolean;   // FR-09/DEC-01 — default false
}

// in loadEnv():
const authDevFallback =
  process.env.AUTH_DEV_FALLBACK === "1" ||
  process.env.AUTH_DEV_FALLBACK?.toLowerCase() === "true";
```

`host` already exists (`env.ts:18`, default `127.0.0.1`) and is the
value handed to `Bun.serve({ hostname: env.host })` (`server.ts:43`) —
it is the authoritative bind host for the FR-09 loopback check. No zod
here: `env.ts` uses hand-rolled parsing (requirements NFR-02 permits
matching the file's existing pattern).

### 3.2 As-built `UserSession` (pinned, unchanged — `oauth.ts:29-39`)

Six carried fields beyond identity, exactly as-built (FR-06):
`userId, email, name, roles[], storeAccess[], personaAssignments[],
rbacRoles[], permissions[], expiresAt`. `createSession` sets
`expiresAt = Date.now() + 8*60*60*1000` (`oauth.ts:162`). The synthetic
`devSession()` (`router.ts:339-355`) sets `roles:["admin"]`,
`permissions:["*"]`, `storeAccess:["*"]`, `expiresAt:
Number.MAX_SAFE_INTEGER` — this shape is retained (the escape hatch still
mints it) but is only reachable under the hardened predicate (§4.4).

### 3.3 As-built RBAC/permission shapes (pinned — `permission-resolver.ts`)

`ResolvedPermissions { personaAssignments[], rbacRoles[], permissions[] }`;
`resolveUserPermissions(userId)` unions direct (`HAS_RBAC_ROLE`) and
inherited (`<-[:PARENT_OF*]-`) role permissions over a user's
`HAS_PERSONA` personas, returning **all-empty on driver error**
(`permission-resolver.ts:82-88` — fail-closed, pinned by FR-07). The
matcher `hasPermissionByRbac` (`oauth.ts:276-299`) accepts exact match,
`resource:*` prefix (two-segment only), and `*` wildcard — pinned by
FR-02/AC-03.

## 4. Core logic

### 4.1 The as-built gate, documented (FR-01…FR-04)

`dispatch()` (`router.ts:357-401`) runs this decision tree per request:

```
isPublicRoute(method,path)?          → dispatchInternal (no session)      [FR-03]
!process.env.ONELOGIN_ISSUER?        → req.user = devSession(); dispatch  [FR-09 target]
cookie session= missing?             → 401 {"error":"Unauthorized"}       [FR-01]
getSession(id) == null?              → 401 {"error":"Unauthorized"}       [FR-01]
getRoutePermission(method,path):
   != null && != "public"
   && !hasPermissionByRbac(perms,p)? → 403 {"error":"Forbidden"}          [FR-02]
   == null?                          → (skip check — dispatch)            [FR-04/DEC-03]
otherwise                            → req.user = session; dispatch       [FR-02]
```

Facts the pinning tests assert verbatim:
- **401 vs 403 are distinct** (AC-03): missing/unknown/expired session →
  401 *before* any permission check; valid session lacking the
  permission → 403. Both on the same route to prove the branch split.
- **Public set** (`rbac-permissions.ts:19-25`): `healthz`,
  `openapi.json`, `metrics`, `auth/login`, `auth/callback`,
  `auth/logout`. `auth/me` maps to `auth:read` — **not** public (FR-03).
  N-03: `isPublicRoute` is **not** a separate hardcoded set — it is
  implemented as `getRoutePermission(method, path) === "public"`, so
  `ROUTE_PERMISSIONS` is the single source of the public decision. The
  pinning test therefore asserts against that one predicate
  (`getRoutePermission(...) === "public"` per route), **never** a
  duplicated literal list that could drift from `ROUTE_PERMISSIONS`.
  Note `metrics` is *mapped* `public` in `ROUTE_PERMISSIONS` but its
  dispatch lives at `router.ts:938` inside `dispatchInternal` (reachable
  only past the gate) — the `public` mapping is exactly what makes the
  gate skip the session check for it.
- **Unmapped → skip** (FR-04/DEC-03): `getRoutePermission` returns `null`
  for any unmatched pair and the gate then dispatches the authenticated
  session with no RBAC constraint. Documented as the known as-built
  property; **not** flipped to deny in this spec (DEC-03, blast-radius).

### 4.2 JWT verification, documented (FR-05)

`OAuthClient.validateToken` (`oauth.ts:96-116`): with `config.issuer`
set it calls `jwtVerify(idToken, jwks, {issuer, audience: clientId})`
where `jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))`
(`oauth.ts:139-145`). A bad signature, wrong issuer, wrong audience, or
past `exp` throws. With `config.issuer` **empty** it currently returns
`decodeToken()` — an unverified base64 payload decode (`oauth.ts:118-135`).
FR-10 gates that empty-issuer branch (§4.6).

**Test seam (NFR-05, no network egress).** `getJwks()` builds a remote
JWKS set lazily and memoizes it in `this._jwks` (`oauth.ts:137-145`).
To verify against a **locally-minted** RS256 key without hitting
`https://.../jwks.json`, the design adds a narrow, test-only override:
`OAuthClient` gains an optional constructor-injected JWKS resolver used
by `getJwks()` when present.

```ts
// oauth.ts — additive, no behavior change when the seam is unused.
type JwksResolver = ReturnType<typeof createRemoteJWKSet>;
constructor(private config: OAuthConfig, private jwksOverride?: JwksResolver) {}
private getJwks(): JwksResolver {
  if (this.jwksOverride) return this.jwksOverride;   // test seam
  if (!this._jwks) { /* …existing remote set… */ }
  return this._jwks;
}
```

`auth-jwt-verify.test.ts` mints an RS256 keypair with jose
`generateKeyPair("RS256")` (already a dep — requirements Dependencies),
signs tokens with `new SignJWT(...).setIssuer(...).setAudience(...)`,
and passes `createLocalJWKSet({ keys: [publicJwk] })` (or an equivalent
in-memory `KeyLike` resolver) as `jwksOverride`. It asserts: good token
verifies; bad-signature / wrong-issuer / wrong-audience / expired-`exp`
all reject. Production code (`routes/auth.ts:17`) constructs the client
with **one** arg, so the seam is inert outside tests (DD-05 — no new
surface).

### 4.3 Session lifecycle, documented (FR-06)

`createSession → getSession → deleteSession` over the module-level
in-memory `Map` (`oauth.ts:149-215`). The Redis path is a
`try { require("./redis-session"); …set/get/delete } catch { in-memory }`
wrapper; `getSessionStorage()` **always** returns an
`InMemorySessionStorage`-backed `SessionStorage` (the Redis client TODO
is never wired — `redis-session.ts:125-135`), so both the `try` and the
`catch` resolve to in-memory today (FR-11). `getSession` returns `null`
after `Date.now() > expiresAt`. `auth-session.test.ts` round-trips the
six carried fields, asserts null-after-expiry (using a short-TTL session
constructed directly, or advancing time), and asserts delete removes it.

### 4.4 Hardened dev fallback (FR-09, FR-10 — PRIMARY)

**Single predicate, one home.** New helper in a new tiny module
`api/src/auth/dev-fallback.ts` (keeps the security logic out of the
crowded router and gives the tests a direct unit seam):

```ts
import { loadEnv } from "../env";

/** Loopback bind hosts the dev fallback is permitted on. */
export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

/**
 * The dev full-permission fallback is eligible ONLY when all hold:
 *   (a) AUTH_DEV_FALLBACK opt-in is set (env.authDevFallback), AND
 *   (b) the bind host is loopback, AND
 *   (c) no ONELOGIN_ISSUER is configured.
 * Any other combination → NOT eligible → the gate/validateToken fail closed.
 */
export function devFallbackEligible(env = loadEnv(), issuer = process.env.ONELOGIN_ISSUER): boolean {
  return env.authDevFallback && isLoopbackHost(env.host) && !issuer;
}
```

**Router change (owned block only).** `dispatch()`'s fallback branch
(`router.ts:363-366`) becomes:

```
if (!process.env.ONELOGIN_ISSUER) {
  // N-01: the outer guard already establishes !issuer; devFallbackEligible()'s
  // own !issuer clause is redundant *inside this branch* and is there only for
  // its direct-unit-call callers (validateToken, tests) that invoke it without
  // this guard. Harmless; kept single-source rather than passing issuer=false here.
  if (devFallbackEligible()) {          // opt-in + loopback (+ no issuer, already true)
    warnDevFallbackEveryRequest();      // FR-10 — no latch
    (req as any).user = devSession();
    return dispatchInternal(...);
  }
  // FR-09 fail-closed default: no issuer AND not eligible → deny.
  return new Response(JSON.stringify({ error: "Unauthorized" }),
    { status: 401, headers: { "content-type": "application/json" } });
}
// …unchanged issuer-configured branch (session lookup, RBAC, attach)…
```

The non-loopback-with-opt-in case never reaches here as a per-request
degrade: `assertAuthPosture()` (§4.5) has already refused boot. In the
`route()`-level tests, where no server booted, `devFallbackEligible()`
returns false for a non-loopback `env.host`, so the branch yields 401 —
consistent with DEC-02's "never silently admit". (AC-12 accepts either
the boot-refusal *or* the 401, per DEC-02.)

**Loud, non-latching signal (FR-10).** `warnDevFallbackEveryRequest()`
replaces the `warnedDevAuth` one-shot (`router.ts:338-343`). It logs on
every request:

```
console.warn("[auth] DEV-ONLY fallback ACTIVE — this instance is UNAUTHENTICATED " +
  "with FULL admin permissions. AUTH_DEV_FALLBACK is set on a loopback host with no " +
  "ONELOGIN_ISSUER. NEVER expose beyond 127.0.0.1. Set ONELOGIN_ISSUER to disable.");
```

Requirements Risk 6 accepts per-request noise as intentional; the design
keeps it unconditional (simplest, loudest). AC-14 verifies the message
appears for *each* of two requests.

**validateToken hardening (FR-10, `oauth.ts`).** The empty-issuer branch
(`oauth.ts:97-101`) changes from "warn + return unverified decode" to:

```
if (!this.config.issuer) {
  if (!devFallbackEligible()) {
    throw new Error("[auth] refusing to decode JWT without signature verification " +
      "(no ONELOGIN_ISSUER and AUTH_DEV_FALLBACK not enabled on a loopback host)");
  }
  console.warn("[auth] DEV-ONLY fallback — JWT signature NOT verified (decodeToken)");
  return this.decodeToken(idToken);
}
```

So an attacker-supplied unsigned JWT is **rejected** unless the operator
has explicitly opted into the loopback dev escape hatch. AC-13 pins both
arms.

### 4.5 Boot-time posture assertion (DEC-02, DEC-05)

New `assertAuthPosture(env = loadEnv())` in `api/src/auth/dev-fallback.ts`,
called from `server.ts main()` immediately after `loadEnv()`, before
`Bun.serve`:

```ts
export function assertAuthPosture(env = loadEnv()): void {
  const issuer = process.env.ONELOGIN_ISSUER;
  // DEC-02 — opt-in on a non-loopback host is a misconfiguration; crash loudly.
  if (env.authDevFallback && !isLoopbackHost(env.host)) {
    throw new Error(`[auth] AUTH_DEV_FALLBACK is set but HOST=${env.host} is not loopback. ` +
      `The full-permission dev fallback is loopback-only. Set ONELOGIN_ISSUER for a ` +
      `deployed instance, or bind to 127.0.0.1 for local dev.`);
  }
  // DEC-05 — a non-loopback deployment must have a real (non-in-memory)
  // session backing, else sessions vaporize across processes/restarts.
  assertSessionBacking(env);
}
```

`server.ts main()` wraps the call so a throw becomes a fatal exit
(the existing `main().catch(… process.exit(1))` at `server.ts:125-127`
already does this). **Placement is load-bearing (Resolves: C-05):**
`assertAuthPosture(env)` must be called synchronously immediately after
`const env = loadEnv();` (`server.ts:14`) and **before both** (a) the
three bootstrap `try/catch` blocks (`server.ts:17-38`, which *swallow*
their errors and would mask a throw) **and** (b) `Bun.serve(...)`
(`server.ts:42`, which would otherwise bind the port before the check).
Called there, an unsatisfied posture throws synchronously, is not
swallowed by any inner `try/catch`, unwinds to the outer
`main().catch(… process.exit(1))`, and the process exits non-zero
without ever binding. AC-12 drives `assertAuthPosture` **directly** as a
unit call (no real server spawn needed) — the throw *is* the observable
"server refuses" behavior.

`assertSessionBacking(env)` (DEC-05, §4.10) throws when the bind host is
**non-loopback** (`!isLoopbackHost(env.host)`) **and** the session
storage is still the in-memory stub. As-built, `getSessionStorage()` is
always in-memory, so this assertion fires for any non-loopback deploy —
which is the intended gate (a real multi-process deploy must wire a
backing before it can boot). Detection: `redis-session.ts` gains an
exported `isRealBacking(): boolean` returning `false` while the TODO
stands; `assertSessionBacking` reads it.

**The predicate keys on host alone — NOT on `issuer` (Resolves: C-02).**
The earlier draft also fired the assertion when `ONELOGIN_ISSUER` was
set, which **bricked a legitimate loopback OneLogin smoke-test**: a
developer running `bun run dev` bound to `127.0.0.1` with a real
`ONELOGIN_ISSUER` to exercise actual JWKS verification could not boot at
all, since no Redis client ships here (out of scope). Loopback is a
single-process bind, so the in-memory `Map` is a *correct* backing there
regardless of issuer — sessions do not cross processes on `127.0.0.1`.
Dropping the `issuer` disjunct therefore lets issuer-configured loopback
boot (the manual JWKS smoke-test path) while still refusing any
non-loopback deploy on the stub. The DEC-05 rationale ("sessions
vaporize across processes/restarts in a *real deploy*") is exactly the
non-loopback case; the `issuer` disjunct over-reached beyond it.

### 4.6 Store/domain gating — documented UNWIRED, latent, tested (FR-08, DEC-04)

Grep confirms nothing outside `api/src/auth/**` and `routes/auth.ts`
imports `withAuth`/`withPermission`/`withStoreAccess` (`oauth.ts`) or
`hasDomainAccess` (`permission-resolver.ts`); the router gate (§4.1)
calls **only** `getSession` + `hasPermissionByRbac`. So store/domain
gating is **dead code** — `_baseline` FR-05 over-claims it as enforced
(requirements Motivation §4). This design:

- **Does not wire it** (DEC-04 — wiring is a new tenancy feature).
- Pins the pure logic with unit tests: `hasStoreAccess` (`*`/membership,
  `oauth.ts:301-303`), `hasDomainAccess` (persona-domain `*`/membership,
  `permission-resolver.ts:167-177`), and the `withStoreAccess`
  factory's 403-vs-pass composition (`oauth.ts:373-408`) driven with a
  synthetic `req` object (no HTTP).
- Adds one **assertion of the negative**: a test that constructs the
  router gate path and asserts a `req` that would fail `hasStoreAccess`
  still dispatches (proving the gate does not consult it) — so the
  "unwired" claim is itself pinned and a future wiring is a visible
  contract change. This is the AC-09 documentation assertion.

### 4.7 Unmapped-route completeness guard (FR-04, DEC-03)

Extends `api/__tests__/rbac-route-permissions.test.ts` (the existing
`getRoutePermission` unit test) with a **completeness** case: for a
curated list of representative non-public routes reachable in
`dispatchInternal` — one per resource family, drawn from the §5 table —
assert `getRoutePermission(method, path) != null`. This is a guard, not
an exhaustive enumeration of all ~200 dispatch arms (that would duplicate
each downstream spec's own route-permission test and rot on every new
route). The test's header comment documents the as-built
unmapped→skip property and cites DEC-03 (fail-closed-on-unmapped is a
tracked follow-up, out of this spec's blast radius).

### 4.8 Owned section of `router.ts` + merge rule (DD-04)

**Owned (this spec edits only these):**

| Anchor | Lines (as-built) | Change |
|--------|------------------|--------|
| `// DEV-ONLY fallback …` + `warnedDevAuth` + `devSession()` | `router.ts:334-355` | remove latch; add `warnDevFallbackEveryRequest`; keep `devSession` shape |
| the auth block of `async function dispatch(...)` | `router.ts:357-401` | fail-closed fallback branch (§4.4); issuer-configured branch unchanged |
| import list | top of file | add `devFallbackEligible` (+ warn helper) import |

**Never edited:** every `dispatchInternal()` dispatch block
(`router.ts:403-941`) — owned by the specs that added them. **Merge
rule:** conflicts on `router.ts` resolve by *section ownership*
(re-apply this spec's `devSession`/`dispatch`-auth section; re-apply
other specs' `dispatchInternal` sections), never last-writer-wins —
mirroring kpi-okr-governance design §4.9. This spec's edits are confined
above line ~401 and touch no route registration.

### 4.9 Correlation-id / rate-limit middleware — documented unwired (NFR-06, DEC-07)

`middleware/correlation-id.ts` (`withCorrelationId`) and
`middleware/rate-limit.ts` (`checkRateLimit`/`cleanupExpiredEntries`)
are **not imported** by `router.ts` or `server.ts` (grep-confirmed).
This design leaves them in place unchanged and adds a **guard test**
asserting neither `router.ts` nor `server.ts` imports them (so the
"unwired" status is pinned; wiring is DEC-07 future work). No behavior
change to logging or throughput.

### 4.10 Redis session stub disposition (FR-11, DEC-05)

Per DEC-05 default (option b — keep + boot assertion), the stub stays:
`redis-session.ts` and `cache-invalidation.ts` are retained. The only
code change is an exported `isRealBacking(): boolean` in
`redis-session.ts` (returns `false` while the Redis TODO stands) that
`assertSessionBacking` (§4.5) consults. This closes the "sessions
silently vaporize in a real multi-process/restart deploy" hole by
refusing to boot such a deploy on the in-memory stub — without building
a Redis client (out of scope). `auth-session.test.ts` asserts the
DEC-05 outcome (AC-15): `assertSessionBacking` throws for a
**non-loopback** env on the in-memory backing, and does **not** throw
for loopback (issuer set or not — see C-02 in §4.5).

**Honest rationale for keep-over-remove (Resolves: C-03).** The default
is *not* justified by a dependency cost. Grep confirms
`api/src/auth/cache-invalidation.ts` has **zero importers** — it is
itself unwired dead code, the same class as the store/domain helpers
(§4.6) and the two middleware (§4.9). So DEC-05 option (a) removal would
delete a dead module (`cache-invalidation.ts`) that depends on a dead
surface (`deleteAll`/`deleteByUserId`); the blast radius is near-nil,
not the "invalidation surface `cache-invalidation.ts` depends on" the
earlier draft claimed. The real reason to keep is cheaper and honest:
the boot assertion closes the genuine multi-process/restart hole with
**one exported boolean and no new code**, whereas removal is churn that
buys nothing a hardening backfill needs. This is itself the FR-08/NFR-06
thesis — "governed ≠ believed-to-work": `cache-invalidation.ts` is
documented dead, not silently trusted. Either disposition is defensible;
keep-with-assertion is chosen on the cheap-and-correct reason, not a
phantom dependency.

### 4.11 Legacy-suite bootstrap (FR-14, DEC-06)

The problem: hardening the default means "issuer unset + opt-in absent →
401". Two consumer classes rely on the dev fallback today and would go
red:

1. **Full-HTTP integration tests** (`*.integration.test.ts`) — they
   fetch `http://127.0.0.1:8787`, an **externally spawned** server
   (`bun run dev` locally, or the CI boot step). Their auth posture is
   the *server's* env, not the test process's. Fix: the spawned server
   must boot with `AUTH_DEV_FALLBACK=1` on its loopback host, set in the
   boot path — **not** in a committed repo-wide `.env`. **There is no
   `scripts/dev.ts`** (the earlier draft named a file that does not
   exist — Resolves: B-01). The two real spawn seams are:

   - **Local `bun run dev`.** The as-built chain is the root
     `package.json` `dev` script (`… concurrently … "cd api && bun run
     dev" …`) delegating to `api/package.json`'s `"dev": "bun --hot
     --env-file=../.env run src/server.ts"`. The API dev server reads
     env from `../.env` via `--env-file`. The opt-in is injected
     **inline into the root `dev` command** by changing that one clause
     to `"cd api && AUTH_DEV_FALLBACK=1 bun run dev"`. This keeps the
     opt-in in the dev *command* (visible, greppable in
     `package.json`), never in a committed `.env` — so §9's rejection of
     a committed-`.env` default still holds. An inline env prefix on the
     command wins over `--env-file` only if absent from `../.env`; since
     `.env.example` (the committed template) leaves it unset and a
     developer's `.env` is git-ignored, the inline value is the source.
     (A developer who prefers may instead set `AUTH_DEV_FALLBACK=1` in
     their own **git-ignored** local `.env`; §9 permits this — it
     rejects only a *committed* default, not an uncommitted local one.
     See §9's amended row.)
   - **CI integration job.** The `Boot API server` step runs `bun run
     src/server.ts` (`.github/workflows/ci.yml:104`) under the job-level
     `env:` that already sets `HOST: 127.0.0.1`
     (`.github/workflows/ci.yml:81-85`). Add `AUTH_DEV_FALLBACK: "1"` to
     that job `env:` block, adjacent to `HOST`.

   Either way the spawned server satisfies §4.5 (loopback + opt-in, no
   issuer) and serves the dev session exactly as before; the hardened
   default (§4.4) is preserved everywhere the opt-in is *not* injected.
2. **`route()`-level unit tests** and any test importing the router
   directly — their posture is `process.env` at import time. Fix: a bun
   **preload** `api/__tests__/_setup/auth-dev-fallback.preload.ts` that
   sets `process.env.AUTH_DEV_FALLBACK = "1"` (and leaves `HOST`
   defaulting to loopback) before any test module loads. Both
   `scripts/test-unit.sh` and `scripts/test-integration.sh` add
   `--preload __tests__/_setup/auth-dev-fallback.preload.ts` to their
   `bun test` invocation (a one-line, per-workspace addition run from
   `api/` cwd where the tests already run).

This spec's **own** fail-closed tests (`auth-fail-closed.integration.test.ts`,
`auth-jwt-verify.test.ts`) do **not** rely on the preload default: they
set/unset `AUTH_DEV_FALLBACK`, `ONELOGIN_ISSUER`, and `HOST` **explicitly
per case** (via `process.env` before importing/calling the router, and
via `loadEnv()` overrides passed to `devFallbackEligible`/`assertAuthPosture`),
so they observe the true hardened default regardless of the preload.
The preload only prevents *unrelated* legacy tests from going red
(requirements Risk 1). The `story-xd18-role-path.integration.test.ts`
precedent shows the env-before-import discipline the fail-closed tests
reuse.

**Mandatory dynamic import for env-mutating tests (Resolves: C-04).**
A plain top-of-file `import { route } from "../src/router"` is hoisted
by the module loader **above** any `process.env` assignment in the same
file, so it reads stale env. The `story-xd18` precedent avoids this
precisely — it assigns `process.env.ONELOGIN_ISSUER` at line 26, then
loads the router at line 36 with `const { route } = await import("../src/router")`,
and `delete`s the var in `afterAll` (line 199). This design therefore
**mandates**, for any test that mutates `ONELOGIN_ISSUER`,
`AUTH_DEV_FALLBACK`, or `HOST` before exercising `route`:
  1. a **dynamic** `const { route } = await import("../src/router")`
     *after* the env assignments — never a static top-of-file import; and
  2. an `afterAll` that `delete`s each mutated var so it does not leak
     into sibling files sharing the one `bun test` process (Risk 2).
Although `router.ts` reads `process.env.ONELOGIN_ISSUER` per request (so
that var is import-time-tolerant), `devFallbackEligible()` calls
`loadEnv()` which snapshots `HOST`/`AUTH_DEV_FALLBACK` at call time — the
dynamic-import + `afterAll`-delete rule is what keeps the per-case env
mutation deterministic and order-independent across files. This is a
checkable rule, not a convention.

CI budget: the preload is a single `process.env` assignment; the boot
step already exists (kpi-okr-governance added it, `ci.yml:101-110`) —
this adds only the one `AUTH_DEV_FALLBACK: "1"` line to the existing job
`env:` block. No new services, no measurable time cost (NFR-05
hermeticity, requirements Risk 2).

## 5. HTTP API surface

**No new routes, no route removed, no shape changed.** The gate protects
the same surface; only *whether* the gate admits an unauthenticated
request changes. For traceability, the auth-relevant behaviors of the
existing surface (all under `/api/v1/`, gate per §4.1):

| Method / Route class | FR | Auth behavior (as-built = pinned; **bold** = hardened) |
|----------------------|----|--------------------------------------------------------|
| Public set (`healthz`, `openapi.json`, `metrics`, `auth/login`, `auth/callback`, `auth/logout`) | FR-03 | dispatch with no session, both issuer modes |
| `GET auth/me` | FR-03 | requires `auth:read` (not public) |
| Any non-public route, issuer set, no/unknown/expired session | FR-01 | `401 {"error":"Unauthorized"}` |
| Any non-public route, issuer set, valid session, insufficient perm | FR-02 | `403 {"error":"Forbidden"}` |
| Any non-public route, issuer set, valid session, sufficient perm | FR-02 | dispatch, `req.user` attached |
| Any non-public route, **issuer unset + opt-in absent** | **FR-09** | **`401` — no synthetic admin session (was: dev admin)** |
| Any non-public route, issuer unset + opt-in set + loopback | FR-09 | dev fallback admits full-permission session (escape hatch) |
| Any non-public route, opt-in set + **non-loopback** bind | **FR-09/DEC-02** | **server refuses to boot (or 401 at `route()` level)** |
| `auth/callback` → `validateToken`, **empty issuer + opt-in absent** | **FR-10** | **throws — no unverified decode (was: unverified decode)** |

Error bodies stay the as-built `{"error":"…"}` shape (NFR-03) — **not**
migrated to the `{error:{code,message,details}}` envelope.

## 6. UI design

**None.** This spec touches no `pwa/` file, adds no view, no route, no
input handler. The blueprint View Tree and UX-* allowances do not apply
(requirements UI/UX Requirements: server-only). The persona/RBAC/
user-assignment admin views remain governed by `process-explorer-ui` /
`_baseline`.

## 7. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `api/src/env.ts` | modify | FR-09, DEC-01, NFR-02 | add `authDevFallback` field + parse `AUTH_DEV_FALLBACK` (§3.1) |
| `api/src/auth/dev-fallback.ts` | new | FR-09, FR-10, DEC-02, DEC-05 | `isLoopbackHost`, `devFallbackEligible`, `assertAuthPosture`, `assertSessionBacking` (§4.4/§4.5) |
| `api/src/router.ts` | modify (owned block §4.8) | FR-09, FR-10 | fail-closed fallback branch, `warnDevFallbackEveryRequest`, latch removed; **no `dispatchInternal` edit** |
| `api/src/auth/oauth.ts` | modify | FR-05, FR-10 | `jwksOverride` seam (§4.2); empty-issuer `validateToken` throws unless eligible (§4.4) |
| `api/src/auth/redis-session.ts` | modify (narrow) | FR-11, DEC-05 | export `isRealBacking(): boolean` (returns false); no other change |
| `api/src/server.ts` | modify (narrow) | FR-09, DEC-02, DEC-05 | call `assertAuthPosture(env)` right after `loadEnv()` (`server.ts:14`), **before the three bootstrap `try/catch` blocks (`:17-38`) so the throw is not swallowed, and before `Bun.serve` (`:42`)** — C-05 |
| `.env.example` | modify | FR-09, AC-17 | document `AUTH_DEV_FALLBACK` (default off) with the "loopback-only, never deployed" warning near the ONELOGIN block (`:37-43`); N-02 — also add a one-line cross-reference at `HOST` (`:12`) noting the fallback's loopback constraint is a `HOST` property, so a reader editing `HOST` sees it |
| `package.json` (root) | modify (narrow) | FR-14, DEC-06 | change the `dev` script clause `"cd api && bun run dev"` → `"cd api && AUTH_DEV_FALLBACK=1 bun run dev"` (Resolves: B-01 — the real local-dev spawn seam; `scripts/dev.ts` does not exist) |
| `.github/workflows/ci.yml` | modify (narrow) | FR-14, DEC-06 | add `AUTH_DEV_FALLBACK: "1"` to the integration job's `env:` block (adjacent to `HOST`, `ci.yml:81-85`) so the `Boot API server` step's `bun run src/server.ts` (`ci.yml:104`) inherits it |
| `scripts/test-unit.sh` | modify (narrow) | FR-14, DEC-06 | add `--preload …auth-dev-fallback.preload.ts` to the `api` `bun test` |
| `scripts/test-integration.sh` | modify (narrow) | FR-14, DEC-06 | same preload flag |
| `api/__tests__/_setup/auth-dev-fallback.preload.ts` | new | FR-14, DEC-06 | sets `process.env.AUTH_DEV_FALLBACK="1"` before test modules load (§4.11) |
| `api/__tests__/auth-gate.integration.test.ts` | new | FR-01, FR-02, FR-03, FR-06, FR-12 | AC-01/02/03/04 — issuer-configured gate via `route()` + Neo4j persona fixture |
| `api/__tests__/auth-jwt-verify.test.ts` | new | FR-05, FR-10, FR-12 | AC-06/13 — RS256 keypair + `jwksOverride`; empty-issuer throw/allow |
| `api/__tests__/auth-session.test.ts` | new | FR-06, FR-11, DEC-05 | AC-07/15 — lifecycle round-trip; `assertSessionBacking` outcome |
| `api/__tests__/permission-resolver.integration.test.ts` | new | FR-07 | AC-08 — seeded persona/role graph incl. one `PARENT_OF` edge; driver-error empty |
| `api/__tests__/auth-store-domain.test.ts` | new | FR-08, FR-12, DEC-04 | AC-09 — helper logic + gate-does-not-call assertion |
| `api/__tests__/auth-fail-closed.integration.test.ts` | new | FR-09, FR-10, FR-12, FR-13 | AC-10/11/12/14 — the security regressions |
| `api/__tests__/rbac-route-permissions.test.ts` | modify | FR-04, DEC-03 | AC-05 — completeness guard appended (existing file) |
| `api/__tests__/middleware-unwired.test.ts` | new | NFR-06, DEC-07 | asserts router/server do not import the two middleware |

Not changed, deliberately: `permission-resolver.ts` /
`cache-invalidation.ts` / the two `middleware/*.ts` files (documented,
tested, but no code edit); `routes/auth.ts` (constructs `OAuthClient`
with one arg — the seam is opt-in); `ERROR_CODES` (no new code, NFR-03);
any `pwa/` file (server-only).

## 8. Test strategy

**FR-12 (decision-path integration suite) is the union of the tests
below** (Resolves: C-01). FR-12 does not name a single new file; it is
satisfied collectively by `auth-gate.integration.test.ts`
(valid/missing/unknown/expired session → 401 vs 403; public routes),
`auth-jwt-verify.test.ts` (valid/invalid/wrong-issuer/wrong-aud/expired/
unsigned JWT), `auth-store-domain.test.ts` (store/domain gating logic),
and `auth-fail-closed.integration.test.ts` (issuer-unset/opt-in
combinations). Every auth decision path required by FR-12 is closed by
one of those four; the File Changes "Serves" column tags each with
FR-12 so the "every FR addressed" check passes on the page.

**Issuer-configured integration (`*.integration.test.ts`, HTTP or
`route()` with `ONELOGIN_ISSUER` set before router import; Neo4j
persona fixtures; NFR-05 no network egress):**

- **AC-01/02/03/04** — `auth-gate.integration.test.ts`. Sets
  `ONELOGIN_ISSUER` before importing `route`. Seeds a
  `User→HAS_PERSONA→Persona→HAS_RBAC_ROLE→RBACRole` graph, mints a
  session via `createSession`, sets the `session=` cookie. Asserts:
  no cookie → 401; unknown id → 401; expired session → 401; valid but
  insufficient perm → 403; sufficient perm → 200 with `req.user`;
  public routes dispatch with no session; `auth/me` → 401 without a
  session. 401 and 403 asserted as distinct on one route.
- **AC-08** — `permission-resolver.integration.test.ts`. Seeds direct
  + `PARENT_OF`-inherited roles, asserts the deduped union of
  `permissions`/`rbacRoles` and `personaAssignments.domainIds`;
  driver-error path returns all-empty (fail-closed). Cleans up by
  seeded id.

**Fail-closed regression (security-critical — the tests that catch a
re-introduced silent-admin hole):**

- **AC-10/11/12/14** — `auth-fail-closed.integration.test.ts`, each
  case setting env explicitly (never relying on the preload):
  (a) issuer unset + opt-in absent → non-public route 401, `req.user`
  never set; (b) issuer unset + opt-in set + loopback → dev session
  dispatches; (c) opt-in set + non-loopback → `assertAuthPosture`
  throws (unit call) **or** `route()` yields 401 (DEC-02); (d) latch
  removed — two sequential requests each log the `[auth] DEV-ONLY …`
  warning (spy/capture on `console.warn`).
- **AC-13** — `auth-jwt-verify.test.ts`: `validateToken` with empty
  issuer + no opt-in **throws**; with opt-in + loopback returns the
  decoded payload.

**Unit (`*.test.ts`):**

- **AC-06** — `auth-jwt-verify.test.ts`: RS256 keypair via jose
  `generateKeyPair`; good/bad-sig/wrong-issuer/wrong-aud/expired via
  `jwksOverride` (`createLocalJWKSet`), no network.
- **AC-07/15** — `auth-session.test.ts`: lifecycle round-trip of the
  six fields; null-after-expiry; delete; `assertSessionBacking`
  throws for a **non-loopback** env on the in-memory backing, and
  passes for a **loopback** env — including loopback *with*
  `ONELOGIN_ISSUER` set (C-02: the JWKS smoke-test path must still
  boot), not only loopback-no-issuer.
- **AC-05** — `rbac-route-permissions.test.ts` (extended): completeness
  guard over representative non-public routes; documents DEC-03.
- **AC-09** — `auth-store-domain.test.ts`: `hasStoreAccess`,
  `hasDomainAccess`, `withStoreAccess` logic + the gate-does-not-call
  assertion.
- **NFR-06** — `middleware-unwired.test.ts`: router/server import guard.

**Manual with repro (from requirements):**

- **AC-14** — `manual:` two-request harness with `AUTH_DEV_FALLBACK=1`
  + loopback + no issuer; capture stderr; verify the `[auth] DEV-ONLY …`
  warning appears for **each** request and names the loopback-only
  constraint. (Also covered by the console spy in AC-14's automated
  arm; the manual line is the requirements' verification of record.)
- **AC-16** — `manual:` open the PR's `unit` + `integration` job runs;
  verify `bun test` and `bun test:integration` pass with the hardened
  default (preload + boot-step opt-in) and no auth-related regressions
  in unrelated `*-authz` tests.
- **AC-17** — `manual:` open `.env.example` — verify `AUTH_DEV_FALLBACK`
  present, defaults off, carries the "never outside loopback dev"
  warning; run `bun run typecheck` — expect exit 0.

**Env discipline (C-04).** The issuer-configured and fail-closed tests
set `process.env.ONELOGIN_ISSUER` / `AUTH_DEV_FALLBACK` / `HOST`
**before** loading `route` via the **mandatory dynamic**
`const { route } = await import("../src/router")` (never a static
top-of-file import, which hoists above the assignments — the
`story-xd18-role-path` precedent, §4.11) and `delete` each var in
`afterAll` so it never leaks into sibling files sharing the one
`bun test` process. Unit-level posture tests call
`devFallbackEligible`/`assertAuthPosture`/`assertSessionBacking` with an
explicit `env` object rather than mutating `process.env`, keeping them
hermetic and order-independent.

## 9. Rejected alternatives

- **Per-connection peer-address loopback check** — rejected: the
  `route(req)` seam has no socket peer; a single-tenant server has one
  bind host. Keying off `env.host` (the `Bun.serve` hostname) is the
  honest, checkable signal. Peer inspection would be misleading theatre.
- **Reuse `ONELOGIN_ISSUER` unset as the *only* fallback trigger** —
  rejected (the as-built hole): "no issuer" is the *default* local state,
  so it can never be the safety gate. A separate, default-off opt-in
  (`AUTH_DEV_FALLBACK`) makes the closed state the default and the open
  state a deliberate, greppable act (DEC-01).
- **Non-loopback opt-in degrades to per-request 401 instead of boot
  refusal** — rejected per DEC-02: a per-request 401 looks like "auth
  works" and hides the misconfiguration; a boot crash surfaces it
  immediately. (The `route()`-level tests still accept 401 because no
  server booted there — AC-12 allows either.)
- **Flip unmapped-route behavior to fail-closed (deny) now** — rejected
  per DEC-03: an app-wide behavior change touching every downstream
  spec's routes; a route legitimately missing a mapping would start
  403ing. The completeness guard test (§4.7) closes the practical hole
  within this spec's blast radius; the deny flip is a tracked follow-up.
- **Wire store/domain gating into routes** — rejected per DEC-04: which
  routes, which param source, which tenancy policy — none of that was
  ever decided; wiring is a new tenancy feature. Pin the logic, keep it
  latent, make a future wiring a visible change.
- **Remove the Redis stub (DEC-05 option a)** — rejected as the default,
  but on honest grounds (Resolves: C-03). Removal's blast radius is
  near-nil: `cache-invalidation.ts` (the module that references
  `deleteAll`/`deleteByUserId`) has **zero importers** and is itself
  dead code, so deleting it would remove a dead module depending on a
  dead surface — *not* a live invalidation surface as an earlier draft
  implied. Keep-with-boot-assertion is chosen instead because it closes
  the real hole (no session backing in a real multi-process/restart
  deploy) with one exported boolean and no code churn, whereas removal
  is churn a hardening backfill does not need. Left as the alternative
  if review prefers to prune the dead module.
- **Implement a Redis client here** — rejected: a new feature beyond a
  hardening backfill; the boot assertion (DEC-05) gates a real deploy
  without it.
- **Global (repo-wide) `AUTH_DEV_FALLBACK` in a *committed* `.env` /
  `.env.example`** — rejected: a committed default would set the opt-in
  for *all* environments including any future non-loopback one,
  re-opening the hole; and `.env.example` is the committed template.
  The opt-in lives only in the dev/test boot paths — inline in the root
  `package.json` `dev` command and the CI job `env:` (DEC-06, §4.11) —
  and in the test preload, never in a committed default env.
  **Amendment (Resolves: B-01):** this rejection targets a *committed*
  default only. A developer's own **git-ignored local `.env`** (which is
  not tracked — `git check-ignore .env` confirms) is *not* a committed
  default and is a permitted place for a developer to set
  `AUTH_DEV_FALLBACK=1` for their loopback machine; it never ships to
  another environment. The primary, zero-developer-action seam remains
  the inline `AUTH_DEV_FALLBACK=1` in the `dev` command (so `bun run dev`
  works out of the box on loopback without editing any `.env`); the
  local-`.env` route is the optional developer-choice alternative. The
  distinction is "committed default (rejected)" vs "uncommitted local
  (allowed)", which the earlier draft did not draw and which B-01
  required.
- **Migrate 401/403 bodies to the `{error:{code,message,details}}`
  envelope** — rejected per NFR-03: a separate contract change for every
  gate consumer; out of a hardening backfill's scope.
