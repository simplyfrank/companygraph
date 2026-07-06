---
feature: "auth-hardening"
reviewing: "requirements"
artifact: "requirements.md (revision 1)"
reviewer: "spec-review-agent"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: "1 of 2"
---

# Review: auth-hardening / requirements.md (rev 1)

## Verdict: approve (with 4 concerns, 3 nits)

Zero blockers. This is an unusually well-grounded backfill: every as-built
claim I spot-checked maps exactly to the code, the upstream `_baseline`
contract (FR-05, NFR-04) is cited faithfully (including where it *over*-claims),
and the blueprint Risk row + PROJECT-ROLLUP deploy-gate are correctly the
source for the primary hardening goal. The security-critical FR-09/FR-10
fail-closed requirements are precise and testable. The concerns below are
real and should be resolved in — or explicitly deferred by — the design phase;
none is severe enough to block requirements approval, and per the 1+1 review
cap they are actionable within the design pass.

## Verification performed (claims vs. reality)

Confirmed against the codebase — the as-built assertions are accurate:

- `router.ts` `devSession()` returns `roles:["admin"] / storeAccess:["*"] /
  permissions:["*"] / expiresAt: Number.MAX_SAFE_INTEGER` and `dispatch()`
  attaches it whenever `process.env.ONELOGIN_ISSUER` is unset, skipping the
  401/403 gate (lines 338-401). The `warnedDevAuth` one-shot latch is real
  (line 338). **Motivation §1 and FR-09 are accurate.**
- `oauth.ts` `validateToken()` returns `decodeToken()` (base64 payload, no
  signature check) whenever `config.issuer` is falsy (lines 96-101). **Motivation
  §2 and FR-10 are accurate.**
- `withAuth` / `withPermission` / `withStoreAccess` (oauth.ts 306-408),
  `hasStoreAccess` (oauth.ts 301), `hasDomainAccess` (permission-resolver.ts
  167) are **dead code** — the router gate calls only `getSession` +
  `hasPermissionByRbac`. **FR-08 / DEC-04 accuracy correction confirmed.**
- `redis-session.ts` `getSessionStorage()` always constructs
  `SessionStorage()` with the in-memory fallback (the Redis `TODO` at lines
  127-132 is never wired), and `oauth.ts` wraps it in `try/require/catch`
  (lines 165-215). `cache-invalidation.ts` only touches the same stub.
  **FR-11 / DEC-05 confirmed.**
- `api/src/middleware/{correlation-id,rate-limit}.ts` exist but nothing in
  `router.ts` / `server.ts` imports them — **NFR-06 confirmed.**
- `resolveUserPermissions` unions direct + `PARENT_OF*`-inherited RBAC roles
  and returns all-empty on driver error (permission-resolver.ts 24-92).
  **FR-07 confirmed, including the fail-closed-on-error claim.**
- `isPublicRoute` = `getRoutePermission === "public"`; the public set is
  exactly `healthz, openapi.json, metrics, auth/{login,callback,logout}` and
  `auth/me` requires `auth:read` (rbac-permissions.ts 20-28, 440-442).
  **FR-03 / AC-04 confirmed.**
- `env.host` defaults to `127.0.0.1` via `process.env.HOST` (env.ts 18); no
  `AUTH_DEV_FALLBACK` var exists yet. **NFR-04 / DEC-01 premise confirmed.**
- `.specconfig` has `enforced: true` with `code_globs` covering `api/src/*`.
  **Motivation §5 confirmed.**
- Existing auth tests (`auth-oauth.test.ts`) unit-test URL building, in-memory
  session get/set, and helper functions in isolation — **no** test drives the
  router gate's 401/403 decision. **Motivation §3 confirmed.**

## Findings

### Blockers

None.

### Concerns

- **C-01 — AC-05 completeness guard is RED against the current code; the
  requirement does not acknowledge it.** FR-04/AC-05 assert a test proving
  "every non-public route reachable in `dispatchInternal` has a non-`null`
  `getRoutePermission` mapping." That property is **violated today**:
  `analytics/settings`, `analytics/exec-summary.pdf`, and
  `analytics/snapshot/:x` are dispatched (router.ts 924-928) with **no**
  `ROUTE_PERMISSIONS` entry (grep of rbac-permissions.ts returns 0), so they
  are silent-open-authenticated right now — the exact hole FR-04 exists to
  catch. As written, the AC-05 test would fail on day one, and closing it
  means either (a) adding permission rows for routes owned by
  `cto-analytics-reporting` (scope creep across the router co-ownership line
  this spec is careful to respect in Scope Boundaries), or (b) shipping a
  documented allowlist of known-unmapped routes. **Recommendation:** the design
  phase MUST state which path FR-04/AC-05 takes and, given the partial-ownership
  rule, likely (b): assert completeness *modulo* an explicit, comment-justified
  allowlist of pre-existing unmapped routes, each tagged with the owning spec,
  so this backfill does not silently reach into another spec's dispatch block.
  Add this as a recorded decision (DEC-08) so the guard is honest about what it
  does and does not currently cover.

- **C-02 — DEC-05 default (keep stub + startup assertion) can brick the exact
  hardened deploy FR-09 enables, with no migration guidance.** DEC-05 option
  (b) says a non-loopback **or** issuer-configured deployment must have a real
  (non-in-memory) session backing "else refuse to start." But this spec
  explicitly does **not** implement a Redis client (Out of scope), so the only
  session backing that exists after this spec is in-memory. Net effect: the
  first legitimate issuer-configured deploy (the whole point of FR-09) would
  **fail to boot** with no supported way to satisfy the assertion. That is a
  chicken-and-egg deadlock. **Recommendation:** either (a) flip the DEC-05
  default to option (a) "remove the stub, keep one honest in-memory store"
  (which pairs cleanly with the fact that the app is single-process today and
  loopback-bound), or (b) narrow the assertion trigger to *non-loopback* only
  (drop the "or issuer-configured" arm) and add an explicit escape env var, so
  a loopback issuer-configured deploy still boots. Resolve in design; the
  current default is not shippable as stated.

- **C-03 — DEC-02/DEC-06 interaction is under-specified and risks a boot-time
  deadlock in the legacy suite.** DEC-06 sets `AUTH_DEV_FALLBACK=1` globally in
  the test bootstrap so the ~30 legacy `*-authz`/integration tests keep riding
  the dev fallback; DEC-02 says opt-in-set + non-loopback → server **refuses to
  start**. CI runs on `ubuntu-latest` where the API may bind to a non-loopback
  address (or the test host reads `HOST`), and integration tests that boot a
  server with `AUTH_DEV_FALLBACK=1` could hit the DEC-02 refusal and fail the
  whole suite. FR-14/AC-16 assert "legacy suite stays green" but the mechanism
  by which the bootstrap guarantees a loopback host under DEC-02 is not stated.
  **Recommendation:** the design phase (per FR-14) must pin the bootstrap to
  force a loopback `HOST` alongside `AUTH_DEV_FALLBACK=1`, and AC-16 should add
  an explicit assertion that the DEC-02 refusal does not trigger under the test
  bootstrap. Name the bootstrap file (DEC-06 already flags this) and the host
  it pins.

- **C-04 — AC-14 and AC-16/AC-17 lean on `manual:` verification for
  security-relevant behavior that is automatable.** AC-14 (loud per-request
  warning), AC-16 (legacy suite green), and AC-17 (`.env.example` warning +
  typecheck) are all marked `manual:`. AC-14 in particular pins a
  security-signalling property (the latch is removed, warning fires per
  request) that is straightforwardly assertable by spying on the logger /
  capturing stderr in a two-request harness — the FR-13 fail-closed tests
  already stand up the server. Leaving it manual weakens the regression net
  that Motivation §3 says is the whole point. **Recommendation:** convert AC-14
  to an automated assertion (spy on `console.warn`/the logging seam; assert the
  `[auth] DEV-ONLY …` line fires ≥2× across 2 requests). AC-16 legitimately
  observes CI job state (manual is defensible) but should at least name a
  smoke assertion. AC-17's typecheck arm can be a CI gate rather than manual.

### Nits

- **N-01 — FR-02 and AC-03 conflate `hasPermissionByRbac`'s two-segment
  `resource:*` rule with a generic prefix rule.** FR-02 says "`resource:*`
  prefix, or `*` wildcard." The as-built `hasPermissionByRbac` (oauth.ts
  276-299) only honors a wildcard when the granted permission splits into
  **exactly two** `:`-segments with the second being `*` (e.g. `kpi:*`
  matches `kpi:read`); it is **not** a general string-prefix match (unlike the
  legacy `hasPermission` which does `endsWith("*")`). The wording is close
  enough not to mislead a careful reader, but design should quote the exact
  two-segment rule so the AC-03 `resource:*` case is written against the real
  semantics.

- **N-02 — "six carried fields" is miscounted.** FR-06 and AC-07 say the
  session carries "the six carried fields (`roles, storeAccess,
  personaAssignments, rbacRoles, permissions`, `expiresAt`)" — that
  parenthetical lists **six** but the `UserSession` interface (oauth.ts 29-39)
  actually carries nine (`userId, email, name` too). Harmless, but tighten the
  count/label so the AC-07 round-trip assertion is unambiguous about which
  fields it checks.

- **N-03 — FR-10's "at minimum, a bounded cadence" softens a `must`.** FR-10
  offers "on every request … or, at minimum, at a cadence that cannot scroll
  out of a busy log." An optional fallback inside a `must (security-critical)`
  FR makes the AC (AC-14 asserts *every* request) stricter than the FR. Pick
  one in design (the AC's per-request stance is the safer default) so FR and AC
  do not disagree.

## Completeness / Traceability

Every FR maps to at least one AC, and every AC traces to an FR. Table below;
gaps flagged inline.

| FR | Covered by AC | Notes |
|----|---------------|-------|
| FR-01 (401 paths) | AC-01, AC-02 | Clean. No-cookie + unknown/expired both asserted. |
| FR-02 (403 path) | AC-03 | See N-01 on the `resource:*` semantics. |
| FR-03 (public routes) | AC-04 | Matches as-built public set + `auth/me`. |
| FR-04 (unmapped-route guard) | AC-05 | **C-01: guard is red today; needs allowlist decision (DEC-08).** |
| FR-05 (JWT verify) | AC-06 | RS256 + injected JWKS, hermetic. Strong. |
| FR-06 (session lifecycle) | AC-02, AC-07 | See N-02 on field count. |
| FR-07 (permission resolution) | AC-08 | Inheritance + fail-closed-on-error both asserted. |
| FR-08 (unwired helpers) | AC-09 | Documents dead code honestly; DEC-04. |
| FR-09 (fail-closed default) | AC-10, AC-11, AC-12 | Primary goal; three-way opt-in/host matrix well covered. |
| FR-10 (loud + bypass gated) | AC-13, AC-14 | See N-03; **C-04: AC-14 should be automated.** |
| FR-11 (Redis decision) | AC-15 | **C-02: default (b) can deadlock a real deploy.** |
| FR-12 (decision-path suite) | AC-01..AC-03, AC-06..AC-09 | Well-decomposed across the integration + unit files. |
| FR-13 (fail-closed regression) | AC-10..AC-13 | The regression net for the silent-admin hole. |
| FR-14 (CI hardened default) | AC-16 | **C-03: DEC-02/DEC-06 host interaction under-specified.** |
| NFR-01..NFR-06 | (constraints) | All verified against house rules + as-built; NFR-03 correctly refuses to migrate the 401/403 bodies to the error envelope. |

**Done well (acknowledged):**
- The as-built accuracy corrections (FR-08 dead code, NFR-06 unwired
  middleware, FR-04 unmapped-skip) are honest and verified — this spec
  documents reality, not aspiration, exactly as a backfill should.
- FR-09's three-condition opt-in (flag AND loopback AND no-issuer) plus the
  non-loopback refusal is the correct fail-closed shape and closes the
  blueprint Risk row precisely.
- NFR-05 + Risk #2 correctly identify the hermeticity trap (issuer-unset mode
  hides the gate) and mandate an injected JWKS with a locally-minted key — no
  network egress.
- The router co-ownership rule (partial ownership of the `dispatch()` auth
  block by comment-anchor, kpi-okr-governance precedent) is the right way to
  share `router.ts` and is stated up front.
- The UI/UX "None" section, Platforms & Input Modes `n/a` rows, and Native
  Conflicts `none` row are correctly present for a server-only spec per the
  size-promotion rule — no invented routes, no blueprint View Tree conflict.

## Recommendation

Approve for the design phase. Carry C-01..C-04 into design as binding
open items (C-01 and C-02 in particular change what the design must build,
not merely how it is described). Fold N-01..N-03 into the same design pass.
