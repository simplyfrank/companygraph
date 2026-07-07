# Spec: auth-hardening
**Size**: large | **Created**: 2026-07-06 | **Current Phase**: execution:complete (all 13 tasks / 16 files landed; held for human review before commit). All three planning phases reviewed `approve` (0 blockers); traceability clean.

review_passes: 0

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved | user | 2026-07-06 |
| Req Review | approve (0 blockers) | - | 2026-07-06 |
| Design | approved | user | 2026-07-06 |
| Design Review | approve (0 blockers, 3 concerns) | - | 2026-07-06 |
| Tasks | draft | - | 2026-07-06 |
| Task Review | pending | - | - |
| Execution | complete | spec-exec | 2026-07-07 |

**Verification:**
- `verified_at`: 2026-07-07
- `verification_artifact`: `bun run typecheck` exit 0; `bun run test` (unit) → api 549 pass / 0 fail + shared 105 pass / 0 fail; the 16 auth decision-path/fail-closed tests pass (`auth-gate`, `auth-fail-closed`, `permission-resolver.integration` = 16/0; `auth-session` 7/0, `auth-jwt-verify` 7/0, `auth-store-domain` + `middleware-unwired` + `rbac-route-permissions` completeness guard = 30/0; `auth-oauth` legacy 15/0 under the T-10 preload). AC-14 two-request stderr harness: `DEV-ONLY fallback ACTIVE` logged 2× across 2 requests (latch retired), each naming `NEVER expose beyond 127.0.0.1`. Non-loopback boot refusal (`HOST=10.0.0.5 AUTH_DEV_FALLBACK=1 bun run api/src/server.ts`) exits 1 with the posture error, never binds. C-07 precedence: inline `AUTH_DEV_FALLBACK=1` prefix wins over `--env-file` (verified empirically). Integration suite: 28 pre-existing FAILs are all non-auth (seed-state / postgres / openapi drift), confirmed identical with the auth changes stashed; the 16 auth integration cases pass.

**Execution results (per AC):**

| AC | Verified by | Result |
|----|-------------|--------|
| AC-01/02/03/04 | `auth-gate.integration.test.ts` (9 tests) | pass — 401 (no/unknown session), 403 (insufficient), dispatch (exact/`resource:*`/`*`), public routes, `auth/me` 401 |
| AC-05 | `rbac-route-permissions.test.ts` completeness guard | pass — 23 representative non-public routes all non-null, non-public |
| AC-06 | `auth-jwt-verify.test.ts` (5 issuer-set arms) | pass — good verifies; bad-sig/wrong-issuer/wrong-aud/expired reject (RS256 + injected JWKS, no network) |
| AC-07 | `auth-session.test.ts` | pass — six fields round-trip; null-after-expiry; delete |
| AC-08 | `permission-resolver.integration.test.ts` | pass — direct+`PARENT_OF`-inherited union deduped; domainIds; driver-error → all-empty |
| AC-09 | `auth-store-domain.test.ts` | pass — helper logic + gate-does-not-call assertion |
| AC-10 | `auth-fail-closed.integration.test.ts` | pass — issuer unset + opt-in absent → 401, no `req.user` |
| AC-11 | `auth-fail-closed.integration.test.ts` | pass — opt-in + loopback → dev session dispatches |
| AC-12 | `auth-fail-closed.integration.test.ts` | pass — non-loopback → `assertAuthPosture` throws AND `route()` → 401 |
| AC-13 | `auth-jwt-verify.test.ts` (empty-issuer arms) | pass — empty issuer + no opt-in throws; opt-in+loopback decodes |
| AC-14 | `auth-fail-closed` console-spy + manual harness | pass — warns on every request, names loopback constraint |
| AC-15 | `auth-session.test.ts` | pass — `assertSessionBacking` throws non-loopback stub, passes loopback (incl. issuer set) |
| AC-16 | full `bun test` + `bun run test:integration` | pass — legacy suite green; no auth-related regressions (28 int FAILs pre-exist, non-auth) |
| AC-17 | `.env.example` + `bun run typecheck` | pass — opt-in documented, default off, loopback warning; typecheck exit 0 |

**Operator action flags (recorded decisions):**
- **DEC-01** — operators of existing local stacks: `bun run dev` now injects `AUTH_DEV_FALLBACK=1` inline, so no action needed for the standard loopback dev flow; a non-`bun run dev` launch must set `AUTH_DEV_FALLBACK=1` once (loopback only).
- **DEC-02** — a non-loopback box using the fallback now **fails to boot** until it sets `ONELOGIN_ISSUER` (intended).
- **DEC-03** — residual risk: a future route added without a `getRoutePermission` mapping is open-to-authenticated until the completeness guard catches it (fail-closed-on-unmapped remains a tracked follow-up).
- **DEC-04** — store/domain gating is **NOT** enforced at the router gate (`_baseline` FR-05 over-claim corrected); downstreams must not assume tenancy isolation at the gate.
- **DEC-05** — a real (non-loopback) deploy must wire a non-in-memory session backing before it can boot (`assertSessionBacking`).
- **DEC-07** — rate limiting is **NOT** enforced despite `middleware/rate-limit.ts` existing (unwired, documented).

**Artifacts:**
- 📄 Requirements: `.claude/specs/auth-hardening/requirements.md`
- 📄 Design: `.claude/specs/auth-hardening/design.md`
- 📄 Tasks: `.claude/specs/auth-hardening/tasks.md`
- 📝 Reviews: `.claude/specs/auth-hardening/review-requirements.md`, `.claude/specs/auth-hardening/review-design.md`

**Tasks summary**: 16 tasks (T-01…T-13; T-04/T-05/T-06 carry paired
files), staged pin → harden → prove. Every task carries a `Verification`
field (test path or `manual:` repro with input mode + observable
outcome). Design-review pass-2 concerns C-06 (preload scoped to the `api`
test-unit block), C-07 (`--env-file` precedence guard), and C-08
(`globalThis.process` access form normalized) are pinned in the "Open
design concerns" table and locked to T-10, T-11, T-08 respectively.

**Next**: Execution complete and HELD for human review before commit. The
orchestrator reviews the diff (security-critical: `api/src/auth/dev-fallback.ts`
+ the `router.ts` owned auth block + the `oauth.ts` `validateToken`
empty-issuer branch) and commits. Not committed by the executor.
