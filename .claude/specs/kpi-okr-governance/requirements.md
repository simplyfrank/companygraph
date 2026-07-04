---
feature: "kpi-okr-governance"
created: "2026-07-04"
author: "spec-author (blueprint: business-modeling-studio, XD-16)"
status: "revised"
revision: 2
revised: "2026-07-04"
addresses_review: "review-requirements.md (pass 1: B-01, B-02, C-01, C-02, C-03, C-04, N-01, N-02)"
size: "large"
---

# Requirements: kpi-okr-governance

## Summary

Governance backfill (blueprint XD-16) for the **adopted, currently
baseline-governed KPI/SLA/OKR surface**: the nine API route files
`kpi-crud`, `kpi-measurements`, `kpi-trends`, `kpi-sla-alignment`,
`sla-crud`, `sla-breaches`, `sla-compliance`, `okr-crud`, `roll-down`
(all under `api/src/routes/`), the shared schema
`shared/src/schema/kpi-sla.ts`, and the two exec views
`pwa/src/views/exec/KpiManagement.tsx` / `OkrManagement.tsx`
(`#/exec/kpi-management`, `#/exec/okr-management`). This spec **takes
ownership of those files from `_baseline`**: it documents as-built
behavior first, verifies it against the `_baseline` FR-07/FR-08
contract with integration tests, closes the functional gaps that
verification finds, and adds the `postgres` service to the CI
integration job so the Postgres-backed routes are tested in CI.

**Not included:** new dashboards (`kpi-okr-performance-dashboards`
owns `#/exec/performance`), KPI-impact editing (`kpi-impact-mapping`),
the RollDown/RollDownAnalytics exec views (remain `_baseline`-governed
— only their API routes transfer here), and any auth-hardening work.

## Motivation

1. **The surface is a load-bearing dependency with zero tests.**
   `kpi-impact-mapping` and `kpi-okr-performance-dashboards` build
   directly on these routes (blueprint dependency graph), but
   `api/__tests__/` contains **no** kpi/sla/okr/roll-down test — the
   `_baseline` AC-07/AC-08 verification is manual-only.
2. **The manual baseline verification does not even pass as written.**
   `_baseline` AC-07 says `curl /api/v1/kpis` returns a 200 list — but
   the router registers **no GET list route** for `/api/v1/kpis` or
   `/api/v1/slas`; both return `404 not_found`. The exec views work
   around this by issuing raw Cypher through the passthrough.
3. **House rules are violated on this surface.** *(Corrected per
   review B-01.)* Five of the nine route files (`kpi-crud`,
   `sla-crud`, `kpi-trends`, `kpi-sla-alignment`, `sla-compliance`)
   use hand-rolled `if (!field)` validation instead of zod. The four
   files that **do** use zod (`okr-crud`, `kpi-measurements`,
   `sla-breaches`, `roll-down`) all call `.parse()` with **no
   ZodError → 400 mapping anywhere** in `router.ts`, `server.ts`,
   `_helpers.ts`, or the route files — a malformed body falls through
   to the server-level catch and returns **500**, not the standard
   400 envelope. Additionally `kpi-crud` uses `crypto.randomUUID()`
   (v4) and `kpi-measurements`/`sla-breaches` use the `uuid` v4
   package instead of the house UUIDv7 generator; the entire surface
   is **absent from `GET /api/v1/openapi.json`**, breaking the
   "OpenAPI is the single source of truth" contract (`_baseline`
   FR-02).
4. **CI cannot catch regressions on the Postgres-backed routes.** The
   integration job (`.github/workflows/ci.yml`) has a `neo4j` service
   only; `kpi-measurements` and `sla-breaches` read/write Postgres and
   are untestable in CI today.

## Functional Requirements

### A. Verify the as-built contract with integration tests (XD-16)

Each FR below asserts the **as-built** behavior (documented here from
code, not aspiration) so any later change is a visible contract
change. Store of record per route: Neo4j for `kpi-crud`, `kpi-trends`,
`kpi-sla-alignment`, `sla-crud`, `sla-compliance`, `okr-crud`,
`roll-down`; Postgres (`kpi_measurements`, `sla_breaches` tables,
migrations 003/004) for `kpi-measurements`, `sla-breaches`.

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **KPI lifecycle verified** — integration tests cover `POST /api/v1/kpis` (creates a `:KPI` node; 400 on missing `name/category/unit/target_value/target_direction/measurement_frequency`), `PATCH /api/v1/kpis/:id` (dynamic SET over the allow-listed fields; 404 when missing or archived), archive (sets `archived_at`; second archive → 404), and the audit read (returns rows for an existing KPI; 404 unknown). | must | `_baseline` FR-07 / XD-16 |
| FR-02 | **KPI measurements verified against real Postgres** — `POST /api/v1/kpi-measurements` (201, zod-validated body `{kpi_id, measured_at, value, context?, source?}`), `GET /api/v1/kpi-measurements?kpi_id=…` list with time filters as-built, `GET /api/v1/kpi-measurements/:id`, `DELETE /api/v1/kpi-measurements/:id`; rows land in the `kpi_measurements` table (migration 003). | must | `_baseline` FR-07 |
| FR-03 | **KPI trends verified** — `GET /api/v1/kpi-trends/:kpiId` returns the as-built trend payload for a KPI with seeded measurements; unknown KPI → 404. | must | `_baseline` FR-07 |
| FR-04 | **KPI/SLA alignments verified** — `POST/GET /api/v1/kpi-alignments`, `DELETE /api/v1/kpi-alignments/:id`, and the `sla-alignments` mirror; weight outside `[0,1]` and bad `target_type` rejected with 400. | must | `_baseline` FR-07 |
| FR-05 | **SLA lifecycle verified** — `POST /api/v1/slas`, `PATCH /api/v1/slas/:id`, archive, audit read; same shape of negative cases as FR-01. | must | `_baseline` FR-07 |
| FR-06 | **SLA breaches verified against real Postgres** — `POST /api/v1/sla-breaches` (severity enum + resolution_status enforced), `GET` list + `GET /:id`, `PATCH /:id` (resolution updates), `DELETE /:id`; rows land in `sla_breaches` (migration 004). | must | `_baseline` FR-07 |
| FR-07 | **SLA compliance verified** — `GET /api/v1/sla-compliance/all`, `GET /api/v1/sla-compliance/:slaId`, `GET /api/v1/sla-compliance/domain/:domainId` compute compliance from seeded SLAs + breaches. | must | `_baseline` FR-07 |
| FR-08 | **OKR surface verified** — `okr-directives` CRUD (`POST`, `GET ?domain_id=` / `?product_id=`, `PATCH /:id`, `DELETE /:id`), `key-results` CRUD (`POST`, `GET ?directive_id=`, `PATCH /:id`, `DELETE /:id`), and `GET /api/v1/okr-performance?domain_id=`; UUIDv7 ids via `generateId` (already as-built here). | must | `_baseline` FR-08 |
| FR-09 | **Roll-down surface verified** — the ~24 routes under `/api/v1/roll-down/*` (kpi, kpi/product, kpi/program, okr, okr/product, okr/program, sla/domain — each POST + GET-by-scope — plus `commit`, `adjustment`, `contributions[/:domainId]`, `approve`, `reject`, `notify`). Integration tests cover at minimum: KPI roll-down create→get→commit→approve happy path, OKR roll-down create→get→reject path, contributions read, and table-driven zod-rejection cases (weight bounds 0–100, missing assignments). Exhaustive per-endpoint coverage of all product/program variants is `should`, not `must` (see Risk 3). | must | `_baseline` FR-08 |

### B. Close the functional gaps verification finds

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-10 | **List endpoints exist** — *(extended per review B-02)* four additive list endpoints close the gaps that make `_baseline` AC-07 unexecutable and FR-15 unimplementable: (a) `GET /api/v1/kpis` and (b) `GET /api/v1/slas` return `{rows:[…]}` of unarchived resources ordered by `created_at` DESC, with `?include_archived=true` including archived; (c) `GET /api/v1/okr-directives` **without** `domain_id`/`product_id` (as-built this falls through to 404 — the router dispatches only when a filter param is present) returns the top-level directives (OKR cycles: no `domain_id` in `attributes_json`) ordered `created_at` DESC — exactly the list `OkrManagement.tsx` renders today via Cypher; (d) `GET /api/v1/domains` returns `{rows:[…]}` of Domain nodes ordered by `name` — the list `KpiManagement.tsx`'s domain dropdown needs, with no as-built REST source (`domain-crud.ts` exports POST/PATCH/archive/audit only). All additive under `/api/v1/` (NFR-11 policy). (d) is a narrowly scoped ownership touch on `api/src/routes/domain-crud.ts` — the new list handler only; the rest of that file stays `_baseline`-governed. | must | `_baseline` AC-07 gap; Resolves: B-02 |
| FR-11 | **zod at every boundary, ZodError → 400 everywhere** — *(corrected + extended per review B-01)* two parts: **(a)** replace hand-rolled validation in the five files that lack zod — `kpi-crud`, `sla-crud`, `kpi-trends`, `kpi-sla-alignment`, `sla-compliance` — with zod schemas derived from / aligned with `shared/src/schema/kpi-sla.ts`. For the GET-only surfaces (`kpi-trends`, `sla-compliance`) this means **path/query-param schemas only** — do not invent body schemas (per review N-01). **(b)** map `ZodError` to the standard 400 `{error:{code,message,details}}` envelope across **all nine** route files: as-built, the four zod-using files (`okr-crud`, `kpi-measurements`, `sla-breaches`, `roll-down`) call `.parse()` with no ZodError handler anywhere, so malformed bodies return 500. Whether via per-route `safeParse` or one shared mapper in `_helpers.ts`/router is a design-phase decision (DD in design.md). As-built accepted payloads MUST continue to be accepted (no tightening beyond the documented required fields). | must | house rule (zod-only), `_baseline` NFR-02; Resolves: B-01 |
| FR-12 | **OpenAPI covers the surface** — every route in FR-01…FR-10 registered in `GET /api/v1/openapi.json`, generated from the same zod schemas as FR-11 (no hand-maintained copy). | must | `_baseline` FR-02 / graph-core FR-16 |
| FR-13 | **Resource-shaped detail routes** — `GET /api/v1/kpis/:id` / `GET /api/v1/slas/:id` return the resource; archive moves to `POST /api/v1/kpis/:id/archive` (resp. slas) and audit to `GET /api/v1/kpis/:id/audit` (resp. slas) — the paths the handlers themselves document. The as-built overloads (`POST /kpis/:id` → archive, `GET /kpis/:id` → audit rows) are retired in the same change per recorded decision DEC-01 (clean retirement; see Risks & Recorded Decisions). | must | verification gap (router/handler path mismatch); Resolves: C-01 |
| FR-14 | **UUIDv7 ids everywhere** — `kpi-crud` (`crypto.randomUUID()`), `kpi-measurements` and `sla-breaches` (`uuid` v4 package) switch to the house `generateId()` (`api/src/ids.ts`); remove the `uuid` + `@types/uuid` deps from `api/package.json` if no other consumer remains. Existing v4 ids in stores remain valid (`z.string().uuid()` accepts both). | should | graph-core NFR-07 |

### C. Exec views verified (owned views: KpiManagement, OkrManagement)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-15 | **Views consume the REST contract, not raw Cypher** — the three as-built `api.cypher(…)` calls each get a named REST replacement (per review B-02): `KpiManagement.tsx` KPI list → `GET /api/v1/kpis` (FR-10a), `KpiManagement.tsx` domain dropdown → `GET /api/v1/domains` (FR-10d), `OkrManagement.tsx` top-level directive list → unfiltered `GET /api/v1/okr-directives` (FR-10c). This also fixes the as-built field mismatch (views sort/read `createdAt` while nodes store `created_at`). Write paths (create KPI, assignments, OKR edits) go through the same REST routes. | must | XD-16 + as-built defect; Resolves: B-02 |
| FR-16 | **View states + conformance verified** — both views render loading, empty, error, and ready states; styling is tokens-only (`var(--…)`) with catalog components; `bun scripts/design-conformance.ts` passes on both files; interactive controls are keyboard-reachable with visible focus; deep links `#/exec/kpi-management` and `#/exec/okr-management` survive reload. Existing error-scenario tests under `pwa/src/__tests__/error-scenarios/exec/{kpi-management,okr-management}/` keep passing. | must | UX-01/02/05/06 |

### D. CI + operations

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-17 | **Postgres in CI** — the `integration` job in `.github/workflows/ci.yml` gains a `postgres:16-alpine` service (matching docker-compose) with a `pg_isready` healthcheck and a `POSTGRES_URI` env var; migrations (`api/src/storage/postgres/run-migrations.ts`) run before `bun run test:integration`. | must | blueprint scope / XD-16 |
| FR-18 | **Tests are self-provisioning and isolated** — Postgres-backed integration tests apply migrations idempotently if needed, create their own fixtures, and clean up rows/nodes they create so `bun test:integration` is order-independent and re-runnable against a dirty local stack. | must | house test conventions |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | Full CI (both jobs) stays under the existing 5-minute budget on `ubuntu-latest` with the added Postgres service + new tests. | `_baseline` FR-16 |
| NFR-02 | zod is the only validation library; en-US identifiers; no `tsc`; `bun run typecheck` green throughout. | house rules |
| NFR-03 | All API changes in this spec are **additive** under `/api/v1/` per the versioning policy — no removal that would require a `/api/v2/` bump. The FR-13 retirement of the undocumented `POST|GET /kpis/:id` overloads is claimed as a defect fix on a never-published contract (not in OpenAPI, no in-repo consumer); recorded decision DEC-01 records the call (Resolves: C-01). | CLAUDE.md Versioning / NFR-11 |
| NFR-04 | The snake_case field convention of this surface (`target_value`, `created_at`, …) is **kept as-built** — renaming to camelCase would be a breaking contract change out of scope here. Documented so it is not "fixed" casually. | as-built |
| NFR-05 | Auth stays in the central router gate (`api/src/router.ts` + `api/src/auth/`); this spec adds no per-route auth checks. Loopback binding `127.0.0.1:8787` retained. | house rules / `_baseline` NFR-01 |

## UI/UX Requirements

**Views owned by this spec** (from the blueprint round-4 View Tree, verbatim —
existing views, verified + tested; no new routes):

| Route | View component | Nav surface | States specced (loading·empty·error·ready) |
|-------|----------------|-------------|---------------------------------------------|
| `#/exec/kpi-management` | `KpiManagement` (`ExecKpiManagement`) | Exec tab subnav | AC-14, AC-15 |
| `#/exec/okr-management` | `OkrManagement` | Exec tab subnav | AC-14, AC-15 |

**UX allowance conformance** (blueprint UX-*; not re-decided here):

| Allowance | How this spec satisfies it |
|-----------|---------------------------|
| UX-01 view states | AC-14, AC-15 (loading/empty/error/ready per view) |
| UX-02 design system (tokens-only, catalog components, design-conformance passes) | AC-16 |
| UX-03 input modes | n/a — no canvas/gesture work; keyboard + mouse only (see Platforms table) |
| UX-04 responsiveness | n/a: desktop-first per blueprint, no new breakpoints introduced |
| UX-05 accessibility | AC-17 (keyboard reachability, focus visibility, logical focus order, ARIA landmarks — full allowance per review C-03) |
| UX-06 navigation (deep links survive reload) | AC-18 |

## Scope Boundaries

**In scope:**
- Ownership transfer from `_baseline` of: `api/src/routes/{kpi-crud,kpi-measurements,kpi-trends,kpi-sla-alignment,sla-crud,sla-breaches,sla-compliance,okr-crud,roll-down}.ts`, `shared/src/schema/kpi-sla.ts`, `pwa/src/views/exec/{KpiManagement,OkrManagement}.tsx`, and the KPI/SLA/OKR route registrations in `api/src/router.ts`.
- **Router co-ownership rule (per review C-04):** ownership of `api/src/router.ts` is **partial** — exactly the KPI/SLA/OKR/roll-down dispatch blocks (the contiguous sections registering the nine route surfaces plus the FR-10 list registrations). `model-workspace-core` and `system-augmentation-model` run in the same foundation wave and may touch other sections of the file. The design phase MUST enumerate the owned dispatch blocks (comment-anchor or section granularity, not line numbers) and state the merge rule: this spec never edits dispatch blocks outside its sections; conflicts resolve by section ownership, not last-writer-wins.
- **Narrow touch on `api/src/routes/domain-crud.ts`** (per review B-02): the FR-10d `GET /api/v1/domains` list handler only; all other exports of that file remain `_baseline`-governed.
- New integration test files for the nine route surfaces; extension of `api/__tests__/openapi.integration.test.ts`.
- Gap fixes FR-10…FR-14; view fixes FR-15/FR-16; CI postgres service FR-17.

**Out of scope:**
- New dashboards / `#/exec/performance` → `kpi-okr-performance-dashboards`.
- Quantified KPI-impact links, coverage matrix → `kpi-impact-mapping`.
- `RollDown.tsx`, `RollDownAnalytics.tsx`, `ProgramManagement.tsx` views (stay `_baseline`-governed; only the `/api/v1/roll-down/*` **routes** transfer here).
- Real audit-trail storage for KPI/SLA audit endpoints (as-built placeholder documented; recorded decision DEC-02).
- Auth hardening, Redis session backing, Kafka/`better-sqlite3` debt (`_baseline` NFR-04).
- camelCase field migration (NFR-04 here).

## Acceptance Criteria

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | KPI create→patch→archive round-trip; 400 on missing required field; PATCH/archive of archived KPI → 404; created id is UUIDv7 format (version nibble `7` — FR-14, should; per review C-02) (FR-01, FR-14) | server (bun test + Neo4j) | `api/__tests__/kpi-crud.integration.test.ts` |
| AC-02 | `GET /api/v1/kpis` lists unarchived KPIs ordered `created_at` DESC; `?include_archived=true` includes archived; `GET /api/v1/slas` mirrors (FR-10a/b) | server (bun test + Neo4j) | `api/__tests__/kpi-crud.integration.test.ts`, `api/__tests__/sla-crud.integration.test.ts` |
| AC-03 | `GET /api/v1/kpis/:id` returns the KPI resource; `POST /api/v1/kpis/:id/archive` archives; `GET /api/v1/kpis/:id/audit` returns audit rows; old `POST|GET /kpis/:id` overloads gone (FR-13) | server (bun test + Neo4j) | `api/__tests__/kpi-crud.integration.test.ts` |
| AC-04 | Measurement POST persists a row in Postgres `kpi_measurements`; list filters by `kpi_id`; GET one + DELETE behave; invalid body → 400 zod envelope; created id is UUIDv7 format (FR-14, should; per review C-02) (FR-02, FR-14, FR-18) | server (bun test + Postgres) | `api/__tests__/kpi-measurements.integration.test.ts` |
| AC-05 | `GET /api/v1/kpi-trends/:kpiId` returns the trend payload for seeded measurements; unknown KPI → 404 (FR-03) | server (bun test + Neo4j + Postgres) | `api/__tests__/kpi-trends.integration.test.ts` |
| AC-06 | KPI + SLA alignments create/list/delete; weight >1 or <0 → 400; bad `target_type` → 400 (FR-04) | server (bun test + Neo4j) | `api/__tests__/kpi-sla-alignment.integration.test.ts` |
| AC-07 | SLA create→patch→archive→audit lifecycle incl. negative cases (FR-05, FR-13) | server (bun test + Neo4j) | `api/__tests__/sla-crud.integration.test.ts` |
| AC-08 | SLA breach POST/list/GET/PATCH/DELETE against Postgres `sla_breaches`; severity + resolution_status enums enforced; created id is UUIDv7 format (FR-14, should; per review C-02) (FR-06, FR-14, FR-18) | server (bun test + Postgres) | `api/__tests__/sla-breaches.integration.test.ts` |
| AC-09 | Compliance endpoints (`all`, `:slaId`, `domain/:domainId`) compute rates from seeded SLAs + breaches (FR-07) | server (bun test + Neo4j + Postgres) | `api/__tests__/sla-compliance.integration.test.ts` |
| AC-10 | OKR directives + key results CRUD with `domain_id`/`product_id`/`directive_id` query filters; `okr-performance` aggregates for a seeded domain; ids are UUIDv7 (FR-08) | server (bun test + Neo4j) | `api/__tests__/okr-crud.integration.test.ts` |
| AC-11 | Roll-down: KPI create→get→commit→approve; OKR create→get→reject; contributions read; table-driven zod rejections (weight bounds, missing assignments) (FR-09) | server (bun test + Neo4j) | `api/__tests__/roll-down.integration.test.ts` |
| AC-12 | All **nine** route files parse request body/query with zod; a malformed payload to each POST/PATCH endpoint returns 400 `{error:{code,message,details}}` — including the four already-zod files (`okr-crud`, `kpi-measurements`, `sla-breaches`, `roll-down`) where a malformed body as-built surfaces as 500 for lack of a ZodError mapper (FR-11a+b; per review B-01) | server (bun test + Neo4j + Postgres) | zod-rejection cases inside each `api/__tests__/{kpi-*,sla-*,okr-crud,roll-down}.integration.test.ts` |
| AC-13 | `GET /api/v1/openapi.json` includes paths for every FR-01…FR-10 endpoint; assertion enumerates the expected path list (FR-12) | server (bun test) | `api/__tests__/openapi.integration.test.ts` (extended) |
| AC-14 | KpiManagement + OkrManagement render loading state, then ready state from mocked REST responses of `GET /kpis`, `GET /domains`, and unfiltered `GET /okr-directives` (FR-10a/c/d); no `api.cypher` calls remain in either view; rows show `created_at`-derived dates correctly (FR-15, FR-16; per review B-02) | jsdom (automated; platform column per review N-02) | `pwa/src/__tests__/exec-kpi-management.test.tsx`, `pwa/src/__tests__/exec-okr-management.test.tsx` |
| AC-15 | Empty state (no KPIs / no directives) and error state (API 500) render distinct, non-blank UI in both views (FR-16) | jsdom (automated; per review N-02) | `pwa/src/__tests__/exec-kpi-management.test.tsx`, `pwa/src/__tests__/exec-okr-management.test.tsx` + existing `pwa/src/__tests__/error-scenarios/exec/{kpi-management,okr-management}/` |
| AC-16 | Design conformance passes on both touched views (FR-16) | CLI | manual: run `bun scripts/design-conformance.ts` — expect exit 0 with no violations reported for `pwa/src/views/exec/KpiManagement.tsx` or `OkrManagement.tsx` |
| AC-17 | With keyboard only, Tab reaches every interactive control (tabs, create button, form fields) in both views with a visible focus ring in a logical order (header → tabs → primary action → list); Enter activates the focused control; each view exposes ARIA landmarks (a `main` region and labeled navigation for the tab controls) (FR-16; extended per review C-03 to cover full UX-05) | macOS Chrome (keyboard) | manual: open `#/exec/kpi-management`, press Tab repeatedly — verify focus ring visits list/assignments tabs, Create KPI button, and modal fields in visual order; Enter opens the create modal; in devtools Accessibility pane verify a `main` landmark and a labeled tab group; repeat on `#/exec/okr-management` |
| AC-18 | Deep links `#/exec/kpi-management` and `#/exec/okr-management` survive a hard reload and land on the same view (FR-16) | macOS Chrome (mouse+kb) | manual: navigate to each route, press Cmd+R — expect the same view rendered with data reloaded, no redirect to a default tab |
| AC-19 | CI integration job provisions Postgres, runs migrations, and passes the Postgres-backed tests (FR-17, FR-18) | CI (ubuntu-latest) | manual: open the PR's `integration` job run — verify a `postgres` service container starts healthy, migration step logs "applied", and `kpi-measurements` + `sla-breaches` integration tests pass |
| AC-20 | `bun test:integration` run twice in a row against the same local stack passes both times (isolation/idempotence) (FR-18) | CLI (local stack) | manual: with `bun run dev` stack up, run `bun test:integration` twice — expect exit 0 both runs, no unique-constraint or leftover-fixture failures |
| AC-21 | Unfiltered `GET /api/v1/okr-directives` returns top-level directives only (directives created with `domain_id` excluded), ordered `created_at` DESC; `?domain_id=`/`?product_id=` filters keep their as-built behavior; `GET /api/v1/domains` returns Domain rows ordered by `name` (FR-10c/d; added per review B-02) | server (bun test + Neo4j) | `api/__tests__/okr-crud.integration.test.ts`, `api/__tests__/kpi-crud.integration.test.ts` (domains list exercised alongside the KPI-view contract) |

## Platforms & Input Modes

This spec touches `pwa/` (two exec views) but adds no gesture, canvas, or
custom keyboard-shortcut handling; interaction is standard form/list UI.

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| KpiManagement list/assignments tabs + create modal | no | yes | yes | yes | desktop-first per `_baseline`; touch untargeted for exec views |
| OkrManagement directives/key-results UI | no | yes | yes | yes | same |
| API surface | n/a | n/a | n/a | n/a | server (curl / bun test) |

## Native Conflicts

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| (none — no gesture/scroll/focus-trap work; standard buttons, tabs, and modal from the component catalog) | n/a | n/a |

## Dependencies

- **Upstream specs:** none (foundation wave 1, parallel with
  `model-workspace-core` and `system-augmentation-model`). Consumes the
  `_baseline` contract (FR-02 OpenAPI, FR-05 router auth gate, FR-06
  Postgres layer, FR-07/FR-08 the surface itself).
- **Downstream dependents:** `kpi-impact-mapping`,
  `kpi-okr-performance-dashboards` (blueprint dependency graph) — both
  blocked on this spec landing.
- **Infrastructure:** Neo4j 5 (bolt 7687), Postgres 16 (docker-compose
  `postgres` service; migrations 003 `kpi_measurements`, 004
  `sla_breaches`), Bun 1.1+, `zod`, `pg`; GitHub Actions service
  containers for CI (FR-17).
- **Shared code:** `shared/src/schema/kpi-sla.ts` (zod source for
  FR-11/FR-12), `api/src/ids.ts` (`generateId`, FR-14),
  `api/src/routes/_helpers.ts` (`ok`/`error` envelope).

## Risks & Recorded Decisions

**Recorded decisions** (converted from Open Questions per review C-01:
blueprint XD-17 single-shot mode has no mid-run user gate — deterministic
defaults are recorded here and flagged for the consolidated report):

| ID | Decision | Rationale | Flag for consolidated report |
|----|----------|-----------|------------------------------|
| DEC-01 | FR-13 performs a **clean retirement** of the as-built `POST /kpis/:id` (archive) and `GET /kpis/:id` (audit rows) overloads in favor of the `/archive` + `/audit` subpaths the handlers document; `GET /kpis/:id` is repointed to return the resource. No deprecated aliases. | The overloads were never in OpenAPI and have no in-repo consumer (views use Cypher passthrough) — defect fix on a never-published contract, not a breaking change (NFR-03). Alias upkeep would perpetuate the router/handler mismatch this spec exists to close. | yes — any out-of-repo script calling the old shapes breaks; the report must call this out |
| DEC-02 | KPI/SLA audit endpoints stay the **as-built placeholder** (one synthetic row from node timestamps, `user_id: "system"`); real audit-trail storage is deferred to a future spec. FR-01/FR-05 test the placeholder behavior and OpenAPI documents its shape honestly. | XD-16 scope is "close gaps verification finds", not "build new features"; a real audit log is a new storage shape and scope growth. | yes — downstream consumers must not assume a real audit trail exists |

**Risks** (numbering unchanged; rows 1–2 above were Open Questions 1–2):

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| 3 | The roll-down surface is 1,483 lines across ~24 endpoints; exhaustive per-endpoint tests could dominate the CI budget and the spec timeline | NFR-01 budget; diminishing returns | FR-09 sets a P0 flow floor (must) with variant coverage as should; table-driven zod-rejection tests amortize cost |
| 4 | Converting the five hand-rolled route files to zod and adding the ZodError→400 mapper (FR-11a+b) may unintentionally tighten validation and reject payloads the as-built checks accepted | Silent contract tightening breaks callers | FR-11 requires as-built-accepted payloads to keep passing; integration tests written **before** the zod conversion (verify-then-fix ordering) pin the contract |
| 5 | Adding a Postgres service + migrations to CI extends job wall time | NFR-01 (<5 min) breach | `postgres:16-alpine` boots in seconds; migrations are 5 small files; measure in the first PR and trim test fixtures if needed |
| 6 | Field-casing split (snake_case here vs camelCase core) will keep confusing view code (the `createdAt` bug in KpiManagement is exactly this) | Recurring mapper bugs | NFR-04 documents the convention as frozen; FR-15 fixes the one known mismatch; downstream specs inherit the documented convention |
| 7 | `api/src/router.ts` is co-owned with wave-1 specs `model-workspace-core` and `system-augmentation-model` (review C-04) | Merge conflicts / ownership-gate ambiguity | Scope Boundaries records the partial-ownership rule (owned dispatch blocks only); design.md must enumerate the exact owned sections and the merge rule before implementation |

## Revision Notes (pass 1 → revision 2)

| Finding | Disposition |
|---------|-------------|
| B-01 | Motivation §3 corrected (five hand-rolled files, not six; `okr-crud` already zod); FR-11 split into (a) zod conversion for the five files and (b) ZodError→400 mapping across all nine; AC-12 now explicitly covers the four already-zod files whose malformed bodies as-built return 500 |
| B-02 | FR-10 extended with (c) unfiltered `GET /okr-directives` and (d) `GET /domains` (narrow `domain-crud.ts` ownership touch); FR-15 names a REST replacement for each of the three `api.cypher` calls; new AC-21 verifies the two new lists |
| C-01 | Open Questions 1–2 converted to recorded decisions DEC-01/DEC-02 with the stated defaults, flagged for the consolidated report; FR-13 and NFR-03 now cite DEC-01 instead of a user gate |
| C-02 | UUIDv7-format assertions added to AC-01/AC-04/AC-08 (FR-14 targets), priority kept `should`; FR-14 now traceable |
| C-03 | AC-17 extended with focus-order and ARIA-landmark assertions; UX-05 row updated to full-allowance coverage |
| C-04 | Router partial-ownership rule added to Scope Boundaries + Risk 7; design phase must enumerate owned dispatch blocks and the merge rule |
| N-01 | FR-11a states GET-only surfaces (`kpi-trends`, `sla-compliance`) get path/query-param schemas only |
| N-02 | AC-14/AC-15 platform column changed to `jsdom (automated)`; browser platforms remain only on manual ACs (AC-17/AC-18) |
