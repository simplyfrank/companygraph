# Spec: risk-compliance-change
**Size**: large | **Created**: 2026-07-06 | **Current Phase**: execution:complete

review_passes: 0

| Phase | Status | Approved By | Date |
|-------|--------|-------------|------|
| Requirements | approved | re-review (approve) | 2026-07-06 |
| Req Review | approve (0 blockers) | - | 2026-07-06 |
| Design | approved | design-review (approve) | 2026-07-06 |
| Design Review | approve (0 blockers, 3 concerns) | - | 2026-07-06 |
| Tasks | approved | task-review (revise → all folded) | 2026-07-06 |
| Task Review | approve (folded) | - | 2026-07-06 |
| Execution | complete | implementer | 2026-07-07 |

**Verification:**
- `verified_at`: 2026-07-07
- `verification_artifact`: api/__tests__/risk-register.integration.test.ts, api/__tests__/change-requests.integration.test.ts, api/__tests__/compliance-rules.integration.test.ts, api/__tests__/risk-compliance.integration.test.ts, api/__tests__/openapi.integration.test.ts (extended); plus manual live-server repros recorded per-AC below.

## Execution result

All 12 tasks executed. Gates: `bun run typecheck` exit 0 throughout;
`bun run test` (unit) green at **api 513 pass / 2 skip / 0 fail**,
**shared 105 pass / 0 fail** (baseline preserved, no regressions).
Both `should` FRs (FR-10 UUIDv7, FR-11 transition guard) were **retained**
(not descoped) — no off-ramp taken.

### Tasks
| Task | Summary | State |
|------|---------|-------|
| T-05 | `ERROR_CODES` += `invalid_transition`, `bad_request` (additive) | done |
| T-01 | `risk-register.integration.test.ts` (CRUD, filters, 5 aggregations, validation) | done |
| T-02 | risk-register.ts → `parseWith` + `generateId` (v4→v7) | done |
| T-03 | `change-requests.integration.test.ts` + route: `parseWith`, `generateId`, transition guard | done |
| T-08 | compliance-rules path-id threading (router + 3 handlers) + test | done |
| T-09 | `risk-compliance.integration.test.ts` (3 reports over seeded subgraph) | done |
| T-06 | new `shared/src/schema/risk-change.ts`; risk-register imports moved schemas | done |
| T-07 | change-request schemas → shared module (`.default([])` preserved) | done |
| T-10 | OpenAPI registration (14 paths) + openapi test enumeration | done |
| T-11 | CI verify — no `ci.yml` edit (migrate step already applies 001/002/005) | done (no-op) |
| T-12 | final sweep + this STATUS | done |

### Per-AC verification
| AC | How verified | Status |
|----|--------------|--------|
| AC-01 risk CRUD + default escalation + 404s + empty-patch code | `risk-register.integration.test.ts` (needs Postgres) | integration |
| AC-02 list order + 8 filters | `risk-register.integration.test.ts` | integration |
| AC-03 five aggregations (summary shape + relational invariant, C-01/C-02) | `risk-register.integration.test.ts` | integration |
| AC-04 risk validation → 400 issues[] | `risk-register.integration.test.ts` | integration |
| AC-05 change-request CRUD, forced draft, JSONB round-trip, cascade | `change-requests.integration.test.ts` (needs Postgres) | integration |
| AC-06 `{data,limit,offset}` + filters + nested arrays | `change-requests.integration.test.ts` | integration |
| AC-07 reviews/sign-offs enums, `signed_at`, 404 parent | `change-requests.integration.test.ts` | integration |
| AC-08 transition guard (draft→pending_review ok; draft→released 400) | `change-requests.integration.test.ts` | integration |
| AC-09 compliance path-form CRUD + literal-path evaluate | `compliance-rules.integration.test.ts` **+ manual live repro** (see below) | integration + manual |
| AC-10 three risk-compliance reports + per-report envelopes | `risk-compliance.integration.test.ts` **+ manual live repro** (see below) | integration + manual |
| AC-11 zod-rejection envelopes (issues[] for PG files, fieldErrors for compliance) | inside the three route test files **+ manual live repro** | integration + manual |
| AC-12 UUIDv7 ids; no `uuidv4` import in the two route files | risk-register + change-requests tests; grep confirms imports gone | integration + static |
| AC-13 OpenAPI covers all FR-01…FR-07 paths + new error codes in enum | `openapi.integration.test.ts` (extended) **+ getOpenApiDoc() static check: 153 paths, 0 missing** | integration + static |
| AC-14 CI applies 001/002/005 + PG suites pass | manual: open the PR `integration` job run — verify `postgres` healthy, `run-migrations.ts` logs 001/002/005 applied, risk-register/change-requests suites green. **run-migrations.ts reads all sorted *.sql, so 001/002/005 apply with zero ci.yml change (DD-09 confirmed).** | manual (CI) |
| AC-15 `test:integration` ×2 idempotent | manual: with `bun run dev` stack up, run `bun test:integration` twice — tests use tracked-id cleanup + unique run markers | manual (local stack) |

### Manual live-server repros performed this session (2026-07-07)
A fresh ephemeral API server (`API_PORT=8799 bun run src/server.ts`) with
the current code + live Neo4j (Postgres was down) verified:
- **FR-12 / AC-09**: `POST /compliance/rules` → `GET /compliance/rules/<id>`
  by **path** = **200** (was 400 "Missing rule id" before the fix);
  `PATCH` by path = 200; unknown path = 404; invalid create body = 400 with
  `details.fieldErrors` (not `issues[]`); `DELETE` by path = 204;
  `POST /compliance/rules/evaluate?id=<known>` = 200, `?id=<unknown>` = 404,
  missing `?id=` = 400. List `?rule_type=COMPLIANCE&enabled=true` filters.
- **FR-07 / AC-10**: over a seeded subgraph, `regulated-activity-inventory`
  returns exactly `{domains,matrix,regulations}` (no `count`);
  `sod-violations` returns `{count,violations}` with the seeded CONFLICTS_WITH
  pair; `third-party-register` returns `{count,register}` with the seeded
  `is_third_party:true` System.
- **AC-13 (static)**: `getOpenApiDoc()` in-process → 153 total paths, 0 of the
  17 required risk/change/compliance paths missing; `ErrorEnvelope.code` enum
  contains `invalid_transition` and `bad_request`.
- The two **Postgres** suites (risk-register, change-requests) were
  **transpile-verified** (`bun build <file> --target=bun --no-bundle` OK) but
  not run headless (Postgres down); they are integration-verified in CI (AC-14).

## Consolidated-report flags (DEC-01…DEC-04 + notes)
- **DEC-01** — a minimal transition guard now rejects out-of-lifecycle
  `status` jumps on `PATCH /change-requests/:id` (`400 invalid_transition`,
  additive error code). Any caller relying on arbitrary status writes breaks
  (no in-repo caller does). Allowed set: draft→pending_review;
  pending_review→{approved,rejected,draft}; approved→released; rejected→draft;
  identity + non-status patches always pass.
- **DEC-02** — reviews and sign-offs remain **advisory**: creating one does
  NOT auto-transition the CR. Documented, not changed. Downstream consumers
  must not assume a state machine drives status from reviews.
- **DEC-03** — the undocumented `?id=` query form of GET/PATCH/DELETE
  `/compliance/rules` is **retired**; the OpenAPI-documented `:id` path form
  is now the only shape. Any out-of-repo script using `?id=` breaks. (Evaluate
  keeps `?id=` — it is a literal path, C-05.)
- **DEC-04** — no new risk/change audit-trail storage added. Consumers must
  not assume a risk/change audit trail exists.
- **`should` off-ramps**: NONE taken. FR-10 (UUIDv7) and FR-11 (guard) both
  landed; AC-08 and AC-12 are hard-verified, not struck.
- **`bad_request` (C-02)**: was a latent type-gap — emitted at
  `change-requests.ts` empty-patch but absent from `ERROR_CODES`; added
  additively without changing the emitted code (AC-11 carve-out). `bun build`
  strips types so this never surfaced before; the membership check confirms it.
- **Blueprint bookkeeping (N-02)**: this backfill ran **outside** the frozen
  blueprint Feature Inventory table (directly commissioned; blueprint frozen).
- **Out-of-table wiring note**: the design File Changes table lists
  `shared/src/schema/risk-change.ts` (new) but omitted the required
  `shared/package.json` exports-map entry that makes the new subpath
  importable (Bun enforces the exports map — a non-listed subpath fails to
  resolve). One additive line `"./schema/risk-change": "..."` was added
  (analogous to every prior schema module). `shared/package.json` was clean /
  uncontended at session start; no other spec owns it.

**Artifacts:**
- 📄 Requirements: `.claude/specs/risk-compliance-change/requirements.md`
- 📄 Design: `.claude/specs/risk-compliance-change/design.md`
- 📄 Tasks: `.claude/specs/risk-compliance-change/tasks.md`
- 📝 Reviews: `.claude/specs/risk-compliance-change/review-requirements.md`, `.claude/specs/risk-compliance-change/review-design.md`
