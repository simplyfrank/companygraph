---
feature: "auth-hardening"
created: "2026-07-06"
author: "spec-author (blueprint: business-modeling-studio; governance backfill of _baseline FR-05)"
status: "draft"
revision: 1
size: "large"
---

# Requirements: auth-hardening

## Summary

Governance backfill for the **adopted, currently `_baseline`-governed
auth / RBAC / tenancy subsystem**: `api/src/auth/{oauth,
rbac-permissions, permission-resolver, redis-session,
cache-invalidation}.ts`, `api/src/middleware/{correlation-id,
rate-limit}.ts`, and the central authorization gate inside
`api/src/router.ts` (the `dispatch()` function: OneLogin OAuth session
lookup, jose+JWKS JWT verification when `ONELOGIN_ISSUER` is set,
`UserSession` carrying `roles/storeAccess/personaAssignments/rbacRoles/
permissions`, RBAC permission resolution, central 401/403 enforcement
with `req.user` attach). This spec **takes ownership of those files from
`_baseline`**: it documents the as-built behavior first, then **hardens
the security-critical dev-mode fallback to fail-closed**, and adds
integration tests for every auth decision path (valid / invalid /
expired / unsigned JWT; missing-vs-insufficient permission → 401 vs 403;
store/domain gating).

The **primary, must, security-critical** goal is the dev-mode fallback.
Two as-built code paths bypass signature verification and effectively
grant a full-permission session when no OneLogin issuer is configured:
`api/src/router.ts` `devSession()` (the
`[auth] DEV-ONLY fallback session with full permissions` path, reached at
`dispatch()` when `process.env.ONELOGIN_ISSUER` is unset) and
`api/src/auth/oauth.ts` `OAuthClient.validateToken()` (decodes the JWT
**without signature verification** when `config.issuer` is empty). This
spec requires both to **fail closed** outside an explicit, loudly-logged,
non-default developer opt-in, so the full-permission fallback can **never**
be reached in a deployed or non-loopback context. This gates any non-local
deploy (blueprint Risk row; PROJECT-ROLLUP).

**Not included:** any new auth feature (no new SSO providers, no new
permission model, no MFA, no token refresh); the persona / RBAC-role /
user-assignment **admin PWA views** (governed by
`process-explorer-ui`/`_baseline`). The secondary Redis-session-stub
debt is documented and a keep-or-remove **decision is forced**, but no
Redis client is implemented here (that would be a new feature).

## Motivation

1. **A deployed instance is silently a full-access anonymous instance.**
   As-built, when `ONELOGIN_ISSUER` is unset the router's `dispatch()`
   attaches a synthetic `devSession()` with `roles:["admin"]`,
   `storeAccess:["*"]`, `permissions:["*"]`, `expiresAt:
   Number.MAX_SAFE_INTEGER` to **every** non-public request and skips the
   401/403 gate entirely. The only signal is a **one-time** `console.warn`
   (`warnedDevAuth` latches after the first request). Nothing ties this to
   loopback: bind the server to `0.0.0.0` (or front it with a proxy) with
   the issuer unset and the entire governance suite — KPI/OKR, risk,
   change-management, ontology writes — is open to the internet with
   admin rights. This is the blueprint's tracked "auth-hardening debt
   (dev fallback grants synthetic admin) … must precede any non-local
   deploy."

2. **The signature-verification bypass is a second, independent path.**
   `OAuthClient.validateToken()` (`api/src/auth/oauth.ts:96`) returns
   `decodeToken()` — a base64 payload decode with **no signature check** —
   whenever `config.issuer` is falsy. `handleAuthCallback` constructs its
   `OAuthClient` from `ONELOGIN_ISSUER`, so this shares the dev trigger,
   but the bypass lives in a different file and must be hardened in its own
   right (an attacker-supplied unsigned JWT is trusted).

3. **The auth decision paths have essentially no tests.** The only auth
   test is `api/__tests__/auth-oauth.test.ts`, which unit-tests
   `OAuthClient` URL building, in-memory session get/set, and the
   `hasPermission`/`hasStoreAccess` **helper functions in isolation**. No
   test exercises the actual router gate: no test asserts a missing
   session returns 401, an unknown session returns 401, an
   insufficient-permission session returns 403, or that an expired /
   invalid / unsigned JWT is rejected. Because CI and local runs execute
   with `ONELOGIN_ISSUER` **unset**, every existing "authz" test
   (`*-authz.test.ts`) observes the dev-fallback session — the real gate
   is untested end-to-end. A regression that opens the gate would pass CI
   today.

4. **The as-built surface is smaller than `_baseline` FR-05 claims — and
   the gaps are load-bearing.** `_baseline` FR-05 describes "store/domain
   access gating (`hasStoreAccess`, `hasDomainAccess`)" as part of the
   enforced contract. In fact `withAuth`, `withPermission`,
   `withStoreAccess` (oauth.ts), `hasStoreAccess`, `hasDomainAccess`
   (permission-resolver.ts) are **dead code**: nothing outside
   `api/src/auth/` imports them, and the router gate performs **only** the
   RBAC-permission check — it never calls store/domain gating. Likewise
   `api/src/middleware/{correlation-id,rate-limit}.ts` are **not wired**
   into the router or server. This spec documents that reality honestly
   (rather than testing aspiration) and forces an explicit
   keep / wire / remove decision for each unused piece, so "governed" does
   not silently mean "believed to work but never called."

5. **Spec governance now requires it.** `.claude/specs/.specconfig` has
   `enforced: true` with `code_globs` covering `api/src/*`. The auth
   subsystem is only covered by `_baseline`; any future edit to it needs a
   governing approved spec. This is that spec.

## Functional Requirements

### A. Document the as-built contract, then pin it with tests (backfill)

Each FR asserts the **as-built** behavior (documented here from code, not
aspiration) so any later change is a visible contract change.
Verification runs in **both** issuer modes where the behavior differs
(see NFR-05): the gate's happy/deny paths are exercised with
`ONELOGIN_ISSUER` set to a test double, since the default unset mode
short-circuits to the dev fallback.

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **Central gate — 401 paths verified.** With an issuer configured, a request to a non-public route with (a) **no** `session=` cookie and (b) a cookie naming an **unknown / expired** session id both return `401` with body `{"error":"Unauthorized"}` and no `req.user` attached; the downstream handler never runs. (As-built `dispatch()` in `router.ts`.) | must | `_baseline` FR-05 |
| FR-02 | **Central gate — 403 path verified.** With an issuer configured and a **valid** session whose `permissions` do not satisfy `getRoutePermission(method, path)`, the gate returns `403 {"error":"Forbidden"}`; a session whose permissions **do** satisfy it (exact, `resource:*` prefix, or `*` wildcard per `hasPermissionByRbac`) is dispatched with `req.user` attached. | must | `_baseline` FR-05 |
| FR-03 | **Public routes bypass the gate.** The `isPublicRoute` set (`healthz`, `openapi.json`, `metrics`, `auth/login`, `auth/callback`, `auth/logout`) dispatches without a session in either issuer mode; `auth/me` is **not** public (requires `auth:read`). Verified against the as-built `ROUTE_PERMISSIONS` table (`rbac-permissions.ts`). | must | `_baseline` FR-05 |
| FR-04 | **Unmapped-route behavior documented + guarded.** As-built, `getRoutePermission` returns `null` for a route with no table entry, and the gate then **skips** the permission check (dispatches the authenticated session with no RBAC constraint). This silent-open-authenticated behavior is documented as the known as-built property and pinned by a **unit test** asserting every dispatched non-public route in `router.ts` has a non-`null` mapping (extending the existing `rbac-route-permissions.test.ts` pattern to a completeness check). Whether unmapped routes should instead fail-closed (deny) is recorded as **DEC-03**. | must | `_baseline` FR-05; security review |
| FR-05 | **JWT verification (issuer set) verified.** With `config.issuer` set, `OAuthClient.validateToken` calls `jwtVerify` against the JWKS with `issuer`+`audience` bound; a token with a bad signature, wrong issuer, wrong audience, or past `exp` is **rejected** (throws). Tested with a locally-minted RS256 keypair and a `createRemoteJWKSet` seam so no network egress is required. | must | `_baseline` FR-05 |
| FR-06 | **Session lifecycle verified.** `createSession` mints a session with the six carried fields (`roles, storeAccess, personaAssignments, rbacRoles, permissions`, `expiresAt = now + 8h`); `getSession` returns it before expiry and `null` after (`Date.now() > expiresAt`); `deleteSession` removes it. Verified against the in-memory backing (the always-active store per FR-11). | must | `_baseline` FR-05 |
| FR-07 | **Permission resolution verified.** `resolveUserPermissions(userId)` returns the union of permissions from a user's persona assignments' direct **and** `PARENT_OF`-inherited RBAC roles, the deduped `rbacRoles`, and `personaAssignments` with `domainIds`; on driver error it returns empty arrays (fail-closed to no permissions, as-built). Verified with a seeded Neo4j `User→HAS_PERSONA→Persona→HAS_RBAC_ROLE→RBACRole` fixture including one inheritance edge. | must | `_baseline` FR-05 |
| FR-08 | **Store/domain gating helpers documented as UNWIRED + unit-tested.** `hasStoreAccess` (oauth.ts), `hasDomainAccess` (permission-resolver.ts), and the `withStoreAccess` factory are documented as **not called by the router gate** (dead code as-built); their pure logic (`"*"` wildcard, membership, persona-domain fallback) is pinned with unit tests so a future wiring has a contract. The **decision to wire, keep-as-latent, or remove** them is DEC-04. This FR does **not** wire them (that is a new feature — out of scope). | must | `_baseline` FR-05 (accuracy correction); security review |

### B. Harden the dev-mode fallback to fail-closed (PRIMARY, security-critical)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-09 | **Router dev-fallback fails closed by default.** The `devSession()` full-permission path in `router.ts` `dispatch()` MUST NOT be reachable unless **all** of: (a) an explicit, non-default opt-in flag is set (proposed `AUTH_DEV_FALLBACK=1` / `true` — exact name a design decision, DEC-01); **and** (b) the server bind host is loopback (`127.0.0.1` / `::1` / `localhost`, per `env.host`); **and** (c) `ONELOGIN_ISSUER` is unset. If the opt-in is **absent** and no issuer is configured, the gate MUST fail closed: every non-public route returns `401` (no synthetic admin session is ever attached). If the opt-in is set but the bind host is **non-loopback**, the server MUST refuse the fallback — either fail to start (preferred; loud) or deny with 401 — never silently admit (DEC-02 picks start-refusal vs deny). The change is **security-hardening** of an as-built path, permitted under this backfill's ownership. | must (security-critical) | blueprint Risk / PROJECT-ROLLUP; primary goal |
| FR-10 | **Loud, non-latching fallback signalling.** When the dev fallback is active it MUST log a warning **on every request** (retire the `warnedDevAuth` one-shot latch) or, at minimum, at a cadence that cannot scroll out of a busy log within one request; and the warning MUST state that the instance is unauthenticated with full permissions and MUST NOT be exposed beyond loopback. The signature-verification bypass in `oauth.ts` `validateToken` MUST be gated by the **same** opt-in as FR-09: with no issuer **and** no opt-in, `validateToken` MUST throw (never return an unverified decode); the unverified `decodeToken` path is reachable only under the explicit dev opt-in. | must (security-critical) | security review; primary goal |
| FR-11 | **Redis session backing — keep-or-remove decision forced.** As-built, `redis-session.ts` `getSessionStorage()` always constructs an `InMemorySessionStorage` (the Redis client `TODO` is never wired), and `oauth.ts` `getSession/createSession/deleteSession` wrap it in a `try/require(...)/catch` that also falls back to the module-level in-memory `Map`. This spec **documents** the debt (`_baseline` NFR-04) and **forces a recorded decision** (DEC-05): (a) **remove** the stub + `cache-invalidation.ts` (which only calls `deleteAll`/`deleteByUserId` on the same stub) and keep the single honest in-memory store, or (b) **keep** the stub but add a startup assertion that a non-loopback / issuer-configured deployment MUST have a real session backing (fail-closed on multi-process session loss). No Redis **client** is implemented here either way. | must | `_baseline` NFR-04; blueprint XD-16-style backfill |

### C. Integration tests for every auth decision path

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-12 | **Decision-path integration suite.** A new integration test file drives real requests through `route()` with `ONELOGIN_ISSUER` set to a test double and covers: valid JWT → session → dispatch; invalid-signature JWT → rejected; expired JWT (`exp` past) → rejected; unsigned JWT (no issuer + no opt-in) → `validateToken` throws / 401; missing permission → 403 vs missing session → 401 (the two are asserted **distinctly**); store/domain gating logic (FR-08 helpers) exercised at unit level with the wired-vs-unwired status asserted. Tests provision their own Neo4j fixtures (persona/role graph) and clean up. | must | primary goal; `_baseline` FR-05 |
| FR-13 | **Fail-closed regression tests.** Tests assert the FR-09/FR-10 hardened behavior: (a) issuer unset + opt-in absent → non-public route returns 401 (no admin session); (b) issuer unset + opt-in set + loopback host → dev fallback active (documented dev-only escape hatch still works for local dev); (c) opt-in set + non-loopback host → server refuses (start-failure or 401 per DEC-02); (d) `validateToken` with empty issuer + no opt-in throws. These are the tests that would catch a re-introduction of the silent-admin hole. | must (security-critical) | primary goal |
| FR-14 | **CI executes the hardened default.** The test suite proves the fail-closed default without breaking the existing dev-ergonomics of the rest of the suite: the auth decision-path tests set the opt-in / issuer explicitly per case, so the repo's other tests (which rely on the dev fallback) keep passing under the documented local opt-in. The design phase MUST state how the global test bootstrap sets the opt-in for the legacy suite so this spec's hardening does not turn every other integration test red (DEC-06). | must | house test conventions; regression-safety |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | Auth stays in the **central router gate** (`api/src/router.ts` `dispatch()`) + the `api/src/auth/` subsystem — this spec adds **no per-route auth check** and rolls no auth into individual handlers. | CLAUDE.md house rule; `_baseline` DD-07 |
| NFR-02 | zod is the only validation library; en-US identifiers; no `tsc`; `bun run typecheck` green throughout. Any new env-var parsing (FR-09 opt-in) is validated in `api/src/env.ts` with the existing pattern (not zod unless the file already uses it). | house rules |
| NFR-03 | All behavior changes are **hardening of existing paths**, not new API surface. No new REST route, no OpenAPI path change, no error-code addition to `ERROR_CODES`. The 401/403 bodies stay the as-built `{"error":"Unauthorized"}` / `{"error":"Forbidden"}` shape (documented; not migrated to the `{error:{code,message,details}}` envelope here — that would be a separate contract change). | CLAUDE.md Versioning / NFR-11 |
| NFR-04 | Loopback binding `127.0.0.1:8787` retained as the default (`env.host`); the FR-09 non-loopback refusal is an **additional** guard, not a change to the default bind. | `_baseline` NFR-01 |
| NFR-05 | Because CI/local default to `ONELOGIN_ISSUER` unset, the gate's authenticated happy/deny paths are only observable with an issuer configured. Tests MUST run those cases with an injected issuer + JWKS test double (no live OneLogin, no network egress) so CI stays hermetic and under the existing <5-min budget. | `_baseline` FR-16; test hermeticity |
| NFR-06 | The correlation-id and rate-limit middleware (`api/src/middleware/`) are documented as **not wired** into request handling as-built; this spec does not wire them (out of scope — see DEC-07 for the keep/remove/track disposition). No behavior change to logging or throughput. | as-built accuracy |

## UI/UX Requirements

**None.** This spec is server-only. It touches **no** `pwa/` file, adds
no view, no route, no gesture/keyboard/input handler. The persona /
RBAC-role / user-assignment admin views remain governed by
`process-explorer-ui`/`_baseline` and are explicitly **out of scope**.
The blueprint View Tree and UX-* allowances therefore do not apply to any
artifact in this spec. (Per the spec-workflow size-promotion rule, the
Platforms & Input Modes and Native Conflicts tables below carry the
explicit `n/a` / none rows because this spec adds no input handling.)

## Scope Boundaries

**In scope:**
- **Ownership transfer from `_baseline`** of: `api/src/auth/{oauth,
  rbac-permissions, permission-resolver, redis-session,
  cache-invalidation}.ts`, `api/src/middleware/{correlation-id,
  rate-limit}.ts`, and the **authorization gate section of
  `api/src/router.ts`** — specifically the `devSession()` helper and the
  `dispatch()` function's pre-`dispatchInternal` auth block (public-route
  check, dev-fallback branch, session lookup, RBAC check, `req.user`
  attach). `dispatchInternal()` route registrations remain owned by the
  specs that added them (partial-ownership of `router.ts`, mirroring
  kpi-okr-governance's precedent).
- **Router co-ownership rule.** Ownership of `router.ts` is **partial**:
  exactly the `devSession()` + `dispatch()` auth block. Other specs own
  their `dispatchInternal()` dispatch blocks. The design phase MUST name
  the owned block by comment-anchor granularity (not line numbers) and
  state the merge rule: this spec never edits dispatch blocks outside the
  auth gate; conflicts resolve by section ownership, not last-writer-wins.
- Hardening the two dev-fallback paths to fail-closed (FR-09, FR-10) with
  an explicit, loopback-only, non-default opt-in and loud signalling.
- A recorded keep-or-remove decision for the Redis session stub +
  `cache-invalidation.ts` (FR-11 / DEC-05).
- New auth decision-path + fail-closed **integration tests**
  (`api/__tests__/`), plus unit tests for the resolver and the
  unwired-helper logic; extension of `rbac-route-permissions.test.ts` for
  the mapping-completeness guard (FR-04).
- A new env var for the dev opt-in (FR-09), added to `env.ts` and
  `.env.example` with a security warning.

**Out of scope:**
- **Any new auth feature**: additional SSO providers, token refresh, MFA,
  a new permission model, session rotation, CSRF beyond the as-built
  `SameSite=Strict` cookie. This spec hardens and tests what exists.
- The **persona / RBAC-role / user-assignment admin PWA views** and their
  `#/…` routes → `process-explorer-ui` / `_baseline`.
- **Implementing a Redis client** — FR-11 forces a decision and, if
  "keep", adds only a startup assertion, not a client. A real Redis
  backing is a future feature spec.
- **Wiring** `withStoreAccess` / store-domain gating into routes, or
  wiring the correlation-id / rate-limit middleware — documented as
  unwired (FR-08, NFR-06); any wiring is a new feature (DEC-04, DEC-07).
- Migrating the 401/403 bodies to the standard error envelope (NFR-03).
- The KPI/OKR, risk, change-management, ontology surfaces themselves
  (their own specs) — this spec only governs the gate that protects them.

## Acceptance Criteria

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | With an issuer configured (test double), a non-public route with **no** `session=` cookie → `401 {"error":"Unauthorized"}`, downstream handler not invoked (FR-01) | server (bun test) | `api/__tests__/auth-gate.integration.test.ts` |
| AC-02 | With an issuer configured, a `session=` cookie naming an **unknown** id and one naming an **expired** session both → `401`; a valid session dispatches with `req.user` populated from the session (FR-01, FR-06) | server (bun test + Neo4j) | `api/__tests__/auth-gate.integration.test.ts` |
| AC-03 | Valid session **lacking** the route's required permission → `403 {"error":"Forbidden"}`; the **same** session with a satisfying permission (exact, `resource:*`, and `*` cases) → dispatched. Missing-session (401) and missing-permission (403) are asserted as **distinct** outcomes on the same route (FR-02) | server (bun test + Neo4j) | `api/__tests__/auth-gate.integration.test.ts` |
| AC-04 | Every public route (`healthz`, `openapi.json`, `metrics`, `auth/login`, `auth/callback`, `auth/logout`) dispatches with no session in both issuer modes; `auth/me` requires `auth:read` (FR-03) | server (bun test) | `api/__tests__/auth-gate.integration.test.ts` |
| AC-05 | Unit assertion: **every** non-public route reachable in `dispatchInternal` has a non-`null` `getRoutePermission` mapping (mapping-completeness guard); the as-built unmapped→skip behavior is documented in the test's comment and DEC-03 (FR-04) | server (bun test) | `api/__tests__/rbac-route-permissions.test.ts` (extended) |
| AC-06 | With `config.issuer` set, `validateToken` **rejects** a bad-signature JWT, a wrong-`issuer` JWT, a wrong-`audience` JWT, and an expired (`exp` past) JWT, using a locally-minted RS256 key + injected JWKS (no network) (FR-05) | server (bun test) | `api/__tests__/auth-jwt-verify.test.ts` |
| AC-07 | `createSession`→`getSession` round-trips the six carried fields; `getSession` returns `null` after `expiresAt`; `deleteSession` removes it (FR-06) | server (bun test) | `api/__tests__/auth-session.test.ts` |
| AC-08 | `resolveUserPermissions` returns the union of direct + `PARENT_OF`-inherited RBAC-role permissions, deduped `rbacRoles`, and `personaAssignments.domainIds` for a seeded graph with one inheritance edge; driver error → all-empty (fail-closed) (FR-07) | server (bun test + Neo4j) | `api/__tests__/permission-resolver.integration.test.ts` |
| AC-09 | Unit tests pin `hasStoreAccess`, `hasDomainAccess`, and `withStoreAccess`/`hasPermissionByRbac` pure logic (`*` wildcard, exact, `resource:*`, persona-domain fallback); a test-level assertion documents that the router gate does **not** call store/domain gating as-built (FR-08) | server (bun test) | `api/__tests__/auth-store-domain.test.ts` |
| AC-10 | **Fail-closed default:** `ONELOGIN_ISSUER` unset **and** dev opt-in absent → a non-public route returns `401`; **no** `devSession()` admin context is attached (assert `req.user` never set) (FR-09, FR-13a) | server (bun test) | `api/__tests__/auth-fail-closed.integration.test.ts` |
| AC-11 | **Dev escape hatch still works:** issuer unset + opt-in set + loopback `env.host` → dev fallback active and a non-public route dispatches with the full-permission dev session (FR-09, FR-13b) | server (bun test) | `api/__tests__/auth-fail-closed.integration.test.ts` |
| AC-12 | **Non-loopback refusal:** opt-in set + non-loopback bind host → the server refuses the fallback (start-failure or 401 per DEC-02); the admin dev session is never admitted over a non-loopback bind (FR-09, FR-13c) | server (bun test) | `api/__tests__/auth-fail-closed.integration.test.ts` |
| AC-13 | **Signature-bypass gated:** `validateToken` with empty `issuer` **and** no dev opt-in **throws** (never returns an unverified decode); with the opt-in set + loopback it returns the decoded payload (documented escape hatch) (FR-10, FR-13d) | server (bun test) | `api/__tests__/auth-jwt-verify.test.ts` |
| AC-14 | **Loud signalling:** with the dev fallback active, a warning is logged on every request (the `warnedDevAuth` latch removed), stating unauthenticated-full-permission + do-not-expose (FR-10) | server (bun test) | manual: run the suite / a two-request harness with opt-in+loopback set, capture stderr — verify the `[auth] DEV-ONLY …` warning appears for **each** request, not just the first, and names the loopback-only constraint |
| AC-15 | **Redis decision applied:** per DEC-05 either (a) `redis-session.ts` + `cache-invalidation.ts` removed and callers use the single in-memory store with no dead `require`, or (b) the stub retained with a startup assertion that a non-loopback / issuer-configured deployment has a real session backing; the chosen path has a test (FR-11) | server (bun test) | `api/__tests__/auth-session.test.ts` (asserts the DEC-05 outcome) |
| AC-16 | **Legacy suite stays green:** the repo's existing tests that rely on the dev fallback still pass after hardening, via the DEC-06 bootstrap that sets the local opt-in for the legacy suite (FR-14) | CI (ubuntu-latest) | manual: open the PR's `unit` + `integration` job runs — verify `bun test` and `bun test:integration` pass with the hardened default and no auth-related regressions in unrelated `*-authz` tests |
| AC-17 | `.env.example` and `api/src/env.ts` document the new dev opt-in var with a security warning; `bun run typecheck` is green (FR-09, NFR-02) | CLI | manual: open `.env.example` — verify the opt-in var is present, defaults off, and carries a "never set outside local dev / loopback" warning; run `bun run typecheck` — expect exit 0 |

## Platforms & Input Modes

Server-only spec — no `pwa/`, no gesture/keyboard/input handling. Table
carries the explicit rows so the gap is stated, not assumed.

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| Auth gate + auth subsystem | n/a | n/a | n/a | n/a | server-side; exercised via `route()` / bun test / curl |
| Any PWA surface | n/a | n/a | n/a | n/a | no pwa/ file touched (admin views out of scope) |

## Native Conflicts

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| (none — server-only spec; no gesture/scroll/keyboard/focus work) | n/a | n/a |

## Dependencies

- **Upstream specs:** none (foundation tier, `depends on: none`). Consumes
  the `_baseline` contract it takes ownership of (FR-05 auth gate, FR-06
  Postgres/graph layer for the persona graph) and the graph-core storage
  primitives for test fixtures.
- **Downstream dependents:** every spec whose routes sit behind the gate
  (all of them) benefits from the hardening, but none is blocked on this
  spec at the code level; the **deploy gate** is the dependency —
  non-local deploy MUST NOT proceed until FR-09/FR-10 land (blueprint
  Risk / PROJECT-ROLLUP).
- **Infrastructure:** Neo4j 5 (bolt 7687) for the persona/RBAC fixture;
  Bun 1.1+; `jose` (already a dep — JWKS/JWT verify); a locally-minted
  RS256 keypair for FR-05/AC-06 (via `jose`'s `generateKeyPair`, no new
  dep). No Redis. No network egress in tests (injected JWKS).
- **Shared code:** `api/src/env.ts` (new opt-in var), `api/src/logging.ts`
  (warning path), `api/src/auth/rbac-permissions.ts` (`getRoutePermission`
  for FR-02/FR-04), `.env.example`.

## Risks & Recorded Decisions

**Recorded decisions** (blueprint XD-17 single-shot mode has no mid-run
user gate — deterministic defaults are recorded here for the design phase
to bind and flagged for the consolidated report):

| ID | Decision (proposed default) | Rationale | Flag for consolidated report |
|----|------------------------------|-----------|------------------------------|
| DEC-01 | Dev opt-in is a new env var **`AUTH_DEV_FALLBACK`** (truthy = `1`/`true`), defaulting **off/unset**. Exact name/semantics finalized in design. | Explicit, greppable, defaults to the safe (closed) state; separate from `ONELOGIN_ISSUER` so "no issuer" alone can never open the gate. | yes — operators of existing local stacks must set it once |
| DEC-02 | Opt-in set on a **non-loopback** bind host → **server refuses to start** (loud, fail-fast) rather than degrading to 401 per-request. | A misconfigured deploy should crash visibly at boot, not silently 401 every request (which looks like "auth works"). | yes — a non-loopback dev box using the fallback will now fail to boot until it sets an issuer |
| DEC-03 | Unmapped-route behavior (`getRoutePermission` → `null` → gate **skips** RBAC) is **kept as-built** for this spec; hardening it to fail-closed (deny unmapped) is a **follow-up**, because flipping it now could 403 legitimately-unmapped routes across the whole app and is out of this spec's blast radius. FR-04 instead **guards** completeness with a test so no route ships unmapped. | Fail-closed-on-unmapped is correct long-term but is an app-wide behavior change touching every spec's routes; the completeness test closes the practical hole without that blast radius. | yes — residual risk: a future route added without a mapping is open-to-authenticated until the guard test catches it |
| DEC-04 | `hasStoreAccess`/`hasDomainAccess`/`withStoreAccess` are **kept as latent, unit-tested code, NOT wired** into the router by this spec. Wiring store/domain gating into routes is a **new tenancy feature** (which routes? which param source?) beyond a hardening backfill. | Wiring requires per-route policy decisions the as-built never made; documenting + testing the logic preserves it for that future spec without scope creep. | yes — "store/domain gating" in `_baseline` FR-05 is **not** enforced by the router today; downstreams must not assume tenancy isolation at the gate |
| DEC-05 | Redis session stub disposition (**default: option (b) keep + startup assertion**): retain `redis-session.ts`/`cache-invalidation.ts` but add a boot-time assertion that a non-loopback **or** issuer-configured deployment has a real (non-in-memory) session backing, else refuse to start. Removal (option a) is the alternative if design finds the stub adds no value. | A keep-with-guard closes the "sessions silently vaporize on multi-process / restart in a real deploy" hole without building a Redis client; aligns with the FR-09 non-loopback fail-fast posture. | yes — a real deploy will need a session backing before it can boot; this is intended |
| DEC-06 | The **global test bootstrap** sets `AUTH_DEV_FALLBACK=1` (+ loopback host) so the ~30 existing `*-authz` / integration tests that rely on the dev fallback keep passing; this spec's own fail-closed tests set/unset the var explicitly per case. | Hardening the default must not turn the whole suite red; the legacy suite's reliance on the fallback is exactly the local-dev use the escape hatch is for. | no (internal test mechanics) — but design must name the bootstrap file |
| DEC-07 | The unwired `correlation-id` / `rate-limit` middleware is **documented as unwired and left in place** (NFR-06); no wiring, no removal, in this spec. | Wiring rate-limiting is a new feature with its own policy questions; removal risks losing intended-but-unfinished work. A tracking note suffices. | yes — rate limiting is **not** enforced today despite the file existing |

**Risks:**

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| 1 | Hardening the default fallback turns the entire existing test suite red (every `*-authz` and integration test currently rides the silent dev admin). | CI goes fully red; spec looks like a regression. | DEC-06 global-bootstrap opt-in; FR-14/AC-16 make legacy-green a must; write the fail-closed tests to set the var explicitly, not globally. |
| 2 | The gate's authenticated happy/deny paths are unobservable in the default (issuer-unset) mode, so tests need an issuer + JWKS double — easy to get subtly wrong (e.g. accidentally hitting the network). | Flaky/hermetic-breaking tests; false confidence. | NFR-05 mandates an injected JWKS + locally-minted RS256 key (jose `generateKeyPair`); no live OneLogin; assert no egress. |
| 3 | `_baseline` FR-05 over-claims store/domain gating as enforced; correcting the record could look like scope reduction. | Reviewer confusion; perceived contract loss. | Motivation §4 + FR-08 + DEC-04 state the correction explicitly and preserve the logic under test; nothing that worked stops working (it was never wired). |
| 4 | `router.ts` is co-owned with other foundation-wave specs; editing the auth block risks merge collisions. | Ownership-gate ambiguity / merge conflicts. | Scope Boundaries records partial-ownership (auth block only, comment-anchor granularity); design enumerates the exact owned section + merge rule (kpi-okr-governance precedent). |
| 5 | The non-loopback start-refusal (DEC-02) could brick a legitimately non-loopback dev/test box that was relying on the fallback. | Unexpected boot failure for some users. | The refusal only triggers with the opt-in **set** on a non-loopback host; the safe path (configure `ONELOGIN_ISSUER`) is documented in the `.env.example` warning (AC-17). |
| 6 | Removing the `warnedDevAuth` latch (FR-10) could flood logs on a busy dev instance. | Log noise. | Acceptable: the fallback is a local-dev-only, must-be-loud state by design; if noise is a real problem design may pick a bounded cadence (still per-N-requests, never one-shot). |
