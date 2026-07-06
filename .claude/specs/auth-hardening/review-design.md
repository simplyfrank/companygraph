---
feature: "auth-hardening"
reviewing: "design"
artifact: ".claude/specs/auth-hardening/design.md (revision 2)"
reviewer: "spec-review-agent (fresh; did not author)"
verdict: "approve"
reviewed_at: "2026-07-06"
review_pass: "2 of 2"
---

# Design Review: auth-hardening (pass 2)

## Summary

Revision 2 clears the single Blocker and every Concern from pass 1, and does so
with mechanisms I re-verified against the live tree rather than taking on faith.
The design remains code-accurate: every line citation I spot-checked held —
the `devSession()` latch + full-admin shape (`router.ts:334-355`), the
`!ONELOGIN_ISSUER` short-circuit (`router.ts:363-366`), the empty-issuer
unverified decode (`oauth.ts:96-101`), the memoized `getJwks()`
(`oauth.ts:137-145`), the always-in-memory `getSessionStorage()` with the Redis
TODO (`redis-session.ts:125-135`), the fail-closed-on-driver-error resolver
(`permission-resolver.ts:82-88`), and the public-route/`HOST`/CI anchors. The
pin → harden → prove discipline is intact and the primary security goal
(fail-closed dev fallback + fail-closed `validateToken`) is fully specified with
regression tests that set env explicitly per case.

The B-01 fix is the important one and it is correct: `scripts/dev.ts` genuinely
does not exist; the two real spawn seams the design now names both exist as
described — the root `package.json` `dev` clause `"cd api && bun run dev"` (which
delegates to `api/package.json`'s `"dev": "bun --hot --env-file=../.env run
src/server.ts"`), and the CI `Boot API server` step `bun run src/server.ts`
(`ci.yml:104`) under the job `env:` that sets `HOST: 127.0.0.1` (`ci.yml:85`).
`.env` is confirmed git-ignored (`git check-ignore .env`), so §9's
committed-vs-local distinction rests on fact.

No blocker remains. Three small, tasks-phase concerns are recorded below; none
gates approval. This is an **approve** (open concerns recorded).

## Findings

### Prior findings — resolution audit

| Prior | Status | Verification |
|-------|--------|--------------|
| ~~B-01~~ (`scripts/dev.ts` absent; local DEC-06 seam broken + §9 collision) | **resolved** | §4.11(1), §7, §9 amendment. Confirmed `scripts/dev.ts` absent; root `dev` clause + `api/--env-file=../.env` chain + CI boot step (`ci.yml:104`, `HOST` at `:85`) all exist as described; `.env` git-ignored. |
| ~~C-01~~ (FR-12 never traced) | **resolved** | §8 opening para states FR-12 is the union of the four decision-path suites; File Changes "Serves" column tags FR-12 on the four test rows. |
| ~~C-02~~ (`assertSessionBacking` bricks issuer-configured loopback) | **resolved** | §4.5 predicate narrowed to `!isLoopbackHost(env.host)` alone; `issuer` disjunct dropped; AC-07/15 assert loopback-with-issuer still boots. |
| ~~C-03~~ (phantom `cache-invalidation.ts` dependency cost) | **resolved** | §4.10/§9 reframed on the honest reason. Independently verified: `cache-invalidation.ts` has zero module importers and its `invalidateUserSessions`/`invalidatePersonaSessions` have zero callers — genuinely dead. |
| ~~C-04~~ (static import defeats env-before-import) | **resolved** | §4.11/§8 mandate dynamic `await import("../src/router")` + `afterAll` delete; the cited `story-xd18` precedent verified (`await import` at `:36`, `delete` at `:199`). |
| ~~C-05~~ (`assertAuthPosture` placement ambiguous) | **resolved** | §4.5/§7 pin placement after `loadEnv()` (`server.ts:14`), before the bootstrap `try/catch` (`:17-40`) and `Bun.serve` (`:42`). Verified the outer `main().catch(process.exit(1))` (`:125-128`) turns a throw into a non-zero exit before any port bind. |
| ~~N-01/N-02/N-03~~ | **resolved** | Comment on redundant `!issuer` (§4.4); `.env.example` `HOST` cross-ref (§7); `isPublicRoute = getRoutePermission(...)==="public"` single-source note (§4.1). |

### Concerns (tasks-phase; non-blocking)

**C-06 — `test-unit.sh` runs `bun test` twice; only the `api` block may carry the
preload.**
`scripts/test-unit.sh` has two invocations: one in the `api` workspace
(`test-unit.sh:22`) and one in `shared` (`:28`). The preload file
`api/__tests__/_setup/auth-dev-fallback.preload.ts` is `api/`-relative and does
not exist for `shared`. The design (§4.11(2), §7) says "per-workspace addition
run from `api/` cwd" but does not flag that the `shared` invocation must be left
untouched (adding the flag there would error — no such preload path).
*Recommendation:* In the tasks phase, scope the `--preload` edit to the `api`
block of `test-unit.sh` (line 22) only, and note the `shared` block is
unaffected. One line in a task DoD closes this; no design change needed.

**C-07 — `--env-file` vs inline-prefix precedence is an assumption worth a
one-line guard.**
§4.11 relies on the inline `AUTH_DEV_FALLBACK=1` in the `dev` command winning
because the var is "absent from `../.env`". `api/package.json`'s `dev` uses `bun
--hot --env-file=../.env`; if a developer's local `.env` sets
`AUTH_DEV_FALLBACK=` (empty/false), Bun's `--env-file` could shadow the inline
prefix depending on precedence. The design's mitigation (`.env.example` leaves it
unset; local `.env` is the developer's own) is reasonable, but the precedence is
an assumption, not a verified fact.
*Recommendation:* In tasks, add a one-line manual check to the FR-14 task DoD:
after the edit, `bun run dev` on loopback with an unset issuer serves a non-public
route (not 401). If precedence bites, fall back to the documented git-ignored
local-`.env` route (§9 already permits it).

**C-08 — Router as-built reads `(globalThis as any).process?.env?.ONELOGIN_ISSUER`,
not `process.env.ONELOGIN_ISSUER`.**
The design's §4.1 tree and §4.4 hardened branch write the guard as
`if (!process.env.ONELOGIN_ISSUER)`, but the as-built line
(`router.ts:363`) is `if (!(globalThis as any).process?.env?.ONELOGIN_ISSUER)`.
Behaviorally identical, and the design's owned-block edit replaces this whole
branch anyway, so it is cosmetic — but the pinning tests and the implementer
should read the real access form so the "documented exactly as the code behaves"
claim (Overview) stays literally true.
*Recommendation:* Note the `globalThis.process` access form in §4.1 (or normalize
it in the owned-block edit). Nit-adjacent; record and move on.

## Completeness / Traceability

| Requirement | Design coverage | Status |
|-------------|-----------------|--------|
| FR-01 (401 paths) | §4.1 tree, §5, `auth-gate.integration.test.ts` | covered |
| FR-02 (403 path) | §4.1, §3.3 matcher, §5 | covered |
| FR-03 (public routes) | §4.1 public set (vs `rbac-permissions.ts:19-25`), §5, AC-04 | covered |
| FR-04 (unmapped→skip guard) | §4.7, `rbac-route-permissions.test.ts` (extended) | covered |
| FR-05 (JWT verify) | §4.2 + `jwksOverride` seam, `auth-jwt-verify.test.ts` | covered |
| FR-06 (session lifecycle) | §4.3, `auth-session.test.ts` | covered |
| FR-07 (permission resolution) | §3.3, §8, `permission-resolver.integration.test.ts` | covered (matches resolver fail-closed `:82-88`) |
| FR-08 (store/domain unwired) | §4.6 + negative assertion | covered; correction verified true (zero external importers) |
| FR-09 (fail-closed default) | §4.4, §4.5, DEC-01/02 | covered |
| FR-10 (loud + validateToken throw) | §4.4 | covered |
| FR-11 (Redis decision) | §4.10, DEC-05, `auth-session.test.ts` | covered; C-02/C-03 resolved |
| FR-12 (decision-path suite) | §8 union statement + File Changes "Serves" | **covered — C-01 resolved** |
| FR-13 (fail-closed regression) | §4.4, §8, `auth-fail-closed.integration.test.ts` | covered |
| FR-14 (CI hardened default) | §4.11 real seams, §7 rows | **covered — B-01 resolved** |
| NFR-01 (central gate only) | §4.8 owned block; no per-route auth | honoured |
| NFR-02 (zod/en-US/no tsc) | §3.1 hand-rolled parse matches `env.ts` pattern | honoured |
| NFR-03 (no new surface) | §5, DD-05, §9 | honoured (no `ERROR_CODES` add) |
| NFR-04 (loopback default) | §3.1, §4.5 | honoured |
| NFR-05 (hermetic tests) | §4.2 injected JWKS, §4.11 | honoured |
| NFR-06 (middleware unwired) | §4.9, `middleware-unwired.test.ts` | covered (verified zero importers) |

**AC coverage:** AC-01…AC-17 each map to a named test file or a `manual:` repro
with an observable outcome (§7/§8). No AC orphaned.

**Blueprint conformance:** Server-only; no `pwa/` touch, no View Tree route, no
UX-* in play — correctly declared (§6). The blueprint's tracked "auth-hardening
debt (dev fallback grants synthetic admin) … must precede any non-local deploy"
(`blueprint.md:232`) is exactly what FR-09/FR-10 + DEC-02 discharge — the design
aligns with app-level law, no XD-*/house-rule conflict. NFR-01 (central gate,
never per-route) respected: edits are confined to the `devSession()`/`dispatch()`
auth block (`router.ts:334-401`) and never a `dispatchInternal()` route.

**Done well:** code-accurate citations re-verified end to end; the two `_baseline`
FR-05 over-claims (store/domain gating unwired; middleware unwired) independently
confirmed true; the `jwksOverride` seam is a clean network-free signature-verify
path; the partial-ownership merge rule mirrors kpi-okr-governance; DEC-02's
boot-refusal-over-silent-401 is the right call; C-03's dead-code reframing is now
both honest and factually correct.

## Verdict

**approve.** All pass-1 findings (B-01 + C-01…C-05 + N-01…N-03) are resolved with
mechanisms verified against the live tree. Three residual concerns (C-06 preload
scoped to the `api` test-unit block; C-07 `--env-file` precedence guard; C-08
`globalThis.process` access form) are tasks-phase details, not design defects —
record them and carry into tasks. The direction is correct, the primary
security-critical hardening is fully specified and testable, and the design is
ready to proceed.
