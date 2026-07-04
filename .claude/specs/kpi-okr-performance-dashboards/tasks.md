---
feature: "kpi-okr-performance-dashboards"
created: "2026-07-04"
author: "spec-author (blueprint: business-modeling-studio, round-4 View Tree)"
status: "revised"
revision: 2
reviewing_requirements_revision: 2
reviewing_design_revision: 2
size: "large"
total_tasks: 19
---

# Tasks: kpi-okr-performance-dashboards

## Revision 2 — task-review pass 1 fixes

Every finding in `review-tasks.md` (pass 1, verdict **revise**) is
addressed; individual changes are tagged `Resolves:` inline.

| Finding | Change |
|---------|--------|
| B-01 (blocker) | The two new PWA vitest files (T-15, T-16) were the only automated verification for AC-08/09/11(auto)/12(auto), but nothing wired them into the merge gate. The CI `unit` job runs PWA vitest via **explicit file enumeration** (`.github/workflows/ci.yml:23`), so new files are never picked up. **New task T-19** appends exactly those two owned files to that line, scoped to the two files (never a whole-suite `vitest run` that would drag in the un-triaged legacy pwa tree) — mirroring `kpi-okr-governance` T-20's scoping. `.github/workflows/ci.yml` is now listed as the one File-Changes addition this revision requires (design §7 permission surface note below). T-15/T-16 traceability and the Validation-checkpoints table now state the CI gate, not just the local run; the AC→task table's "In CI?" column flips to **yes** for AC-07/08/09/11/12. |
| C-01 (concern) | T-03 and T-04 now carry an explicit note that `bun run typecheck` is a transpile (`bun build … --no-bundle`), **not** a behavior check — their opaque APOC-only Cypher (`apoc.convert.fromJsonMap(...)`, the `{kindFilter}` subquery) is only proven by the paired integration test (T-07/T-08 for T-03, T-09 for T-04). An executor must not treat green typecheck as "handler correct." |
| C-02 (concern) | The T-14 4-file view-wiring waiver (`PerformanceDashboard.tsx` + `.module.css` + `route.ts` + `views/index.tsx`) is now surfaced to the phase gate in a dedicated **"Pinned flags for the phase gate"** section below and recorded for STATUS.md, not only buried in the task body. Direct precedent: `kpi-okr-governance` N-02's identical 4-file view waiver. |
| C-03 (concern) | T-07 (AC-14) and T-09 (two-read budget) now pin the exact spy seam: wrap `getDriver().session` and assert on the returned session object's `run` call count, mirroring `kpi-okr-governance`'s `*.integration.test.ts` query-count precedent — so the executor does not invent a brittle per-`session` harness that miscounts. |
| N-01 (nit) | No change — the T-02→T-03→T-04 same-file serialization is already correct via the `Blocked by` chain; the spec-guard permission surface has the file "created" by T-02 before T-03/T-04 Edit it. Noted, not altered. |
| N-02 (nit) | No change — T-17's manual-leg platform cells (AC-07 macOS Chrome, AC-11 macOS Safari, AC-12 macOS Chrome + iPhone Safari) already match the requirements AC platform columns verbatim; STATUS.md records pass/fail per platform per AC. |
| N-03 (nit) | Traceability now includes an NFR→task table (NFR-01 read-only, NFR-02 house rules, NFR-05 systemKind import) for completeness. |

**File-Changes / permission-surface addition (from B-01).** This
revision adds exactly one file to the touched set that the design §7
File Changes table did not enumerate: `.github/workflows/ci.yml`
(modify — one scoped step appended to the `unit` job). This is the
single design-touch this revision requires; it mirrors the
`kpi-okr-governance` T-20 precedent (which listed `ci.yml` in its own
File Changes for the identical reason). If the design's permission
surface is regenerated for Phase C, add `.github/workflows/ci.yml`
(modify, narrow — `unit`-job step only) as the one new row.

## Pinned flags for the phase gate

Surfaced here (not only inside task bodies) so the Phase C
consistency/consolidated-report gate sees them explicitly. Record these
in STATUS.md's flags on completion.

| Flag | Detail | Precedent / rationale |
|------|--------|-----------------------|
| **4-file view waiver (T-14, Resolves: C-02)** | T-14 touches four files — `PerformanceDashboard.tsx` (new), `.module.css` (new), `route.ts` (modify — exec-tab append), `views/index.tsx` (modify — factory row) — exceeding the review-checklist "no task > 3 files" rule. The tab row, view, styles, and factory registration are inseparable for a *reachable* view; splitting them lands an unreachable view or an orphan tab. | Identical to `kpi-okr-governance` N-02's recorded 4-file view waiver. |
| **CI gate scope (T-19, Resolves: B-01)** | The `unit`-job CI step gates exactly the two owned pwa vitest files (`performance-dashboard.test.tsx`, `performance-dashboard-a11y.test.tsx`) via explicit enumeration — NOT a whole-suite `vitest run`. The wider un-triaged legacy pwa `error-scenarios` tree is deliberately left out of this spec's merge gate (out of charter). | Mirrors `kpi-okr-governance` T-20 step (4)'s scoping rationale. |
| **Exec-tab single owner (T-14/T-18)** | The `#/exec/performance` row is appended by exactly one task (T-14) after `okr-management`; T-18's ownership diff asserts no `#/model/*` `route.ts` row and no `kpi-okr-governance`-owned file is touched — one clean owner for the exec/performance row (FILE-OWNERSHIP). | Design DD-05 / blueprint FILE-OWNERSHIP. |

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocks` / `Blocked by`); no out-of-order execution.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`. The
  completion hook blocks STATUS.md updates without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h with one
  judgment call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck` from the
  repo root; after tasks that ship behaviour, also run the listed test. Tasks
  touching `pwa/src/views/` additionally run
  `bun run scripts/design-conformance.ts` (AC-10 gate).
- **PWA tests are vitest, never `bun test` (same constraint as
  `kpi-okr-governance` tasks)**: root `bun test` runs `scripts/test-unit.sh`,
  which cds into `api/` and `shared/` only and never discovers a `pwa/` file;
  invoking `bun test <pwa path>` uses Bun's runner, which ignores
  `pwa/vitest.config.ts` (no jsdom, no `@`/`@shared` aliases, no `setupFiles`).
  Any test under `pwa/src/__tests__/` is run as
  `cd pwa && bunx vitest run <path relative to pwa/>` (design §8: jsdom/vitest).
- **Integration-test naming**: `scripts/test-integration.sh` selects by
  test-name pattern `^integration:` — every `describe` in a new
  `*.integration.test.ts` file MUST be prefixed `integration: ` or the suite
  silently skips it.
- **Same-task pairing (binding, from design §4.7 / DD-05):** every new
  route-surface dispatch lands in the **same task** as its
  `ROUTE_PERMISSIONS` entry. An unlisted route is an authorization hole
  when `ONELOGIN_ISSUER` is set (the router gate skips the check when
  `getRoutePermission` returns `null`). T-05 therefore carries the router
  dispatch and the RBAC section together; the RBAC pinning unit test is T-06.
- **Read-only contract (NFR-01):** no task adds a write path, a CRUD route,
  an `ERROR_CODES` entry, or a `/api/v2/` bump. No task modifies a
  `kpi-okr-governance`-owned route/view file or `RollDown.tsx` /
  `RollDownAnalytics.tsx` (link-out target only) — AC-13 asserts this.

## Open design concerns — pinned decisions

Design review pass 2 (verdict **approve**, `review-design.md`) left one
concern (C-06) and one nit (N-04) for the tasks author to pin. Both are
design-internal and covered by the AC-04 integration test; the decisions
below are binding for execution.

| Concern | Decision | Rationale | Locked in task |
|---------|----------|-----------|----------------|
| C-06 — Read B `d`/`a` may be null under the `OPTIONAL MATCH`; implicit grouping key for `count(adj)` | In §4.5 Read B, the aggregation grouping key set is exactly `(dir.id, a.domain_id, d.name, a.status, a.weight)` so `count(adj)` aggregates **per `(directive, domain)`**, never across the whole result. Rows where `a` is null (a `:RollDown` with no assignment) are **dropped in the handler** before `okrDomainAssignmentSchema` validation (the schema requires non-null `domain_id`/`status`). `ORDER BY dir.name, d.name` may carry a null `d.name` for a dropped row — harmless because the row is filtered before projection. | The schema requires non-null `domain_id`; feeding a null row would fail zod at the response boundary. Filtering server-side keeps the response valid and the grouping unambiguous. | T-04 (Read B + join), asserted by AC-04 in T-09 |
| N-04 — `?domain` scope on `/okr`: does it narrow the per-domain assignment columns too? | `?domain` on `/analytics/performance/okr` filters **directives** via the governed `dir.attributes_json CONTAINS $domainId` predicate (§4.5.1); it does **not** re-filter the per-domain assignment rows in Read B. An unsliced `/okr` returns all top-level directives with all their assignment rows. This is the stated exec default; the view author must not assume `?domain` narrows the domain columns. | Faithful to the two governed handlers (directive predicate vs. RollDown walk read disjoint subgraphs); re-filtering Read B by `?domain` would diverge from the surface this spec only reads. | T-04 (directive predicate), documented in the handler; view consumes as-is in T-11 |

## Task list

### T-01 — Shared zod schemas for the performance aggregates

- **Files** (3): `shared/src/schema/performance.ts` (new),
  `shared/package.json` (modify — narrow), `shared/src/index.ts` (modify —
  narrow)
- **Implements**: design §3.2 — the request/response contract for FR-05..FR-09
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-02, T-03, T-04, T-05, T-07
- **Steps**:
  - Create `shared/src/schema/performance.ts` exactly per design §3.2:
    `performanceSliceQuerySchema` (`domain`/`journey` as `z.string().uuid().optional()`,
    `kind` as `z.string().optional()` — coerced in the handler, never
    hard-validated), `kpiStatusEnum` (`on_target|warning|breach|no_data`),
    `kpiStatusRowSchema` + `kpiStatusResponseSchema`,
    `rollDownAssignmentStatusEnum` (`pending|committed|approved|rejected` — the
    four as-built literals, never a re-invented `assigned`/`adjustment_requested`),
    `okrDomainAssignmentSchema` (`weight` NOT `contribution`;
    `adjustment_requested: z.boolean()`), `okrPerformanceRowSchema`
    (`key_results[].progress` nullable), `okrPerformanceResponseSchema`,
    `journeyAxisResponseSchema`, and the inferred types.
  - Import `SYSTEM_KINDS` from `./system-kind` only for reference; do not
    re-declare the literals (NFR-05).
  - Add the `"./schema/performance": "./src/schema/performance.ts"` row to the
    `shared/package.json` `exports` map (mirror the existing
    `./schema/system-kind` row) and re-export from `shared/src/index.ts`.
- **Verification**: `bun run typecheck` (schema compiles + exports resolve);
  the schemas are exercised end-to-end by the integration tests in T-07..T-10.

### T-02 — `computeKpiStatus` pure function + unit test

- **Files** (2): `api/src/routes/performance.ts` (new — this task creates the
  file and adds only `computeKpiStatus`; handlers land in T-03/T-04),
  `api/__tests__/performance-status.test.ts` (new)
- **Implements**: design §4.2 status computation (DD-02) — FR-02, FR-05
- **Complexity**: moderate
- **Blocked by**: T-01
- **Blocks**: T-03
- **Steps**:
  - Implement `computeKpiStatus(kpi, latest): KpiStatus` per the §4.2 table:
    `latest == null → no_data`; `higher_is_better` (`v>=target→on_target`,
    `v<critical→breach`, `v<warning→warning`, else `on_target`);
    `lower_is_better` mirror; `target_is_exact` = **exact equality** plus
    absolute deviation bands (`|v-target|>critical→breach`,
    `|v-target|>warning→warning`, else `on_target` when `v===target`, per N-02).
    Null threshold → skip that branch (degrade to the coarser verdict).
    Unrecognized `target_direction` → `no_data` guard, never throw. Repeat the
    exact-equality-plus-absolute-band contract in a code comment (N-02).
  - Unit test `performance-status.test.ts` covers all three directions, the
    breach/warning/on_target boundaries, `no_data` (null latest), null-threshold
    degradation, and the unknown-direction guard.
- **Verification**: `bun test api/__tests__/performance-status.test.ts`
  — closes the AC-01 pure-function leg.

### T-03 — KPI portfolio aggregate handler (`handlePerformanceKpis`)

- **Files** (1): `api/src/routes/performance.ts` (modify — adds `resolveSlice`,
  `handlePerformanceKpis`, and the `{domainFilter}`/`{journeyFilter}`/`{kindFilter}`
  fragment composition)
- **Implements**: design §4.1, §4.2, §4.3 — FR-04, FR-05, FR-02, FR-06
- **Complexity**: complex
- **Blocked by**: T-01, T-02
- **Blocks**: T-05, T-07, T-08
- **Steps**:
  - `resolveSlice(url)` per §4.1: parse `domain`/`journey`/`kind` via
    `parseWith(performanceSliceQuerySchema, …)` (reuse the governed
    `_helpers.parseWith`, DD-04); coerce `kind` to a `SystemKind` only when it
    is in `SYSTEM_KINDS`, else `undefined` (the `all` slice). Malformed
    `domain`/`journey` → `parseWith` throws → standard 400 envelope (AC-06).
  - `handlePerformanceKpis(req)`: **Read 1 (one Neo4j round trip)** — the §4.2
    KPI query with the base `WHERE k.archived_at IS NULL` and each optional
    fragment appended as `AND …` (the fragment composition rule C-03: exactly
    one `WHERE`, fragments never open a second). Include `{domainFilter}` (flat
    `k.domain_id = $domain` OR the `CONTRIBUTES_TO`→`PART_OF*1..2` path, OR
    semantics per §4.2), `{journeyFilter}` (§4.2), and `{kindFilter}` (the §4.3
    `EXISTS` subquery with `apoc.convert.fromJsonMap(...).systemKind = $kind`,
    inclusive-any DD-06). **Read 2 (one Postgres round trip)** — the §4.2
    `DISTINCT ON (kpi_id) … WHERE kpi_id = ANY($1) ORDER BY kpi_id, measured_at
    DESC` keyed by Read 1's id array; empty id set short-circuits (no Postgres
    call).
  - In-memory join + `computeKpiStatus` (T-02); rename only `value →
    latest_value` / `measured_at → latest_measured_at` (N-01), all other fields
    keep as-built snake_case (NFR-04). Respond `kpiStatusResponseSchema` rows.
  - Add the code-comment Risk R-1 note (portfolio latest value is Postgres
    `kpi_measurements`, distinct from the `kpi-trends` Neo4j split-brain).
- **C-01 (Resolves):** the post-task `bun run typecheck` is
  `bun build … --no-bundle` — a **transpile, not a behavior check**. The
  `apoc.convert.fromJsonMap(...)` reads and the `{kindFilter}` `EXISTS`
  subquery are opaque Cypher strings; a typo there passes typecheck and
  only surfaces at runtime. This handler's real proof is the paired
  integration test (T-07 for AC-01/02/14, T-08 for the AC-03 systemKind
  slice) — do not treat a green post-task typecheck as "handler correct."
- **Verification**: `bun test:integration` scoped to
  `api/__tests__/performance-kpis.integration.test.ts` (authored in T-07) —
  status correctness (AC-01), slice narrowing (AC-02), query-count invariant
  (AC-14); the systemKind slice is AC-03 in T-08.

### T-04 — OKR roll-down performance handler (`handlePerformanceOkr`)

- **Files** (1): `api/src/routes/performance.ts` (modify — adds
  `handlePerformanceOkr`, Read A + Read B + server-side join)
- **Implements**: design §4.5 (DD-04) — FR-07, FR-03; pins C-06, N-04
- **Complexity**: complex
- **Blocked by**: T-03 (shares the module + `resolveSlice`)
- **Blocks**: T-05, T-09
- **Steps**:
  - **Read A (one Neo4j round trip)** — directive + key-result progress per
    §4.5: `MATCH (dir:OKRDirective) {directivePredicate}` where
    `{directivePredicate}` is the governed `dir.attributes_json CONTAINS
    $domainId` when `?domain` is present, else the governed top-level
    `NOT dir.attributes_json CONTAINS '"domain_id"'` (cite by handler name
    `handleOkrPerformanceGet` / the directive-list handler, not line — C-05).
    `progress` read via `apoc.convert.fromJsonMap(coalesce(kr.attributes_json,
    "{}")).progress` (C-01, inside `attributes_json`, not a top-level prop).
  - **Read B (one Neo4j round trip)** — anchored on `(:RollDown {type:'okr'})`,
    restricted to Read A's directive id set: replay the real topology verbatim
    `(:RollDown{type:'okr'})-[:FOR_OKR]->(:OKRDirective)`,
    `OPTIONAL MATCH (r)-[:HAS_ASSIGNMENT]->(a:RollDownAssignment)-[:FOR_DOMAIN]->(d:Domain)`,
    `OPTIONAL MATCH (adj:RollDownAdjustment {status:'pending'}) WHERE
    adj.roll_down_id = r.id AND adj.domain_id = a.domain_id`. Project `a.status`
    (four literals), `a.weight` (NOT `contribution`, B-02), and
    `count(adj) > 0 AS adjustment_requested` (derived from the adjustment node,
    never from `status`, FR-03). **C-06:** the grouping key is exactly
    `(dir.id, a.domain_id, d.name, a.status, a.weight)`; drop rows where `a` is
    null in the handler **before** `okrDomainAssignmentSchema` validation.
  - **Server-side join** by `directive_id`: fold Read B rows into each Read A
    directive's `domains: okrDomainAssignmentSchema[]`; directives with no
    roll-down / no assignments get `domains: []`. Respond
    `okrPerformanceResponseSchema`.
  - **N-04 note in the handler:** `?domain` filters directives (Read A
    predicate) only; Read B assignment rows are not re-filtered by `?domain`.
  - **R-2 note in the handler:** the `CONTAINS $domainId` substring match's
    false-positive envelope is inherited from the governed handler, not fixed
    here (correcting it is a `kpi-okr-governance` concern).
  - Round-trip budget: **exactly two Neo4j reads, zero Postgres**, both batched
    over the directive id set — no per-directive N+1 (N-03).
  - **C-01 (Resolves):** the post-task `bun run typecheck` is a transpile
    (`bun build … --no-bundle`), **not** a behavior check. Read A's
    `apoc.convert.fromJsonMap(coalesce(kr.attributes_json,"{}")).progress`
    and Read B's topology walk are opaque Cypher — a typo passes typecheck.
    This handler's real proof is the paired integration test T-09 (AC-04);
    do not treat a green post-task typecheck as "handler correct."
- **Verification**: `bun test:integration` scoped to
  `api/__tests__/performance-okr.integration.test.ts` (authored in T-09) —
  four-literal status readback, `weight`, `progress` from `attributes_json`,
  `adjustment_requested` from adjustment nodes, and the two-read spy (AC-04).

### T-05 — Journey-axis handler + router dispatch + RBAC entries

- **Files** (3): `api/src/routes/performance.ts` (modify — adds
  `handlePerformanceJourneys`), `api/src/router.ts` (modify — narrow §4.7),
  `api/src/auth/rbac-permissions.ts` (modify — narrow §4.7)
- **Implements**: design §4.4, §4.1, §4.7 (DD-07, DD-05) — FR-08, FR-05..FR-08,
  NFR-02
- **Complexity**: moderate
- **Blocked by**: T-03, T-04
- **Blocks**: T-06, T-10, T-12
- **Steps**:
  - `handlePerformanceJourneys(req)` per §4.4: `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain
    {id:$domain}) RETURN j.id AS id, j.name AS name ORDER BY j.name`. `$domain`
    required (validated as UUID via `resolveSlice`); absent/unknown domain →
    `{rows:[]}` (never every journey, never 404). Respond
    `journeyAxisResponseSchema`.
  - `api/src/router.ts`: add the three dispatch lines from §4.1 in the
    `// Graph analytics routes` block **immediately after `analytics/graph`**,
    comment-anchored, plus the import of the three handlers. Touch nothing else
    in the router.
  - `api/src/auth/rbac-permissions.ts`: add a `── Performance dashboards ──`
    section with three `P("GET", "analytics/performance/kpis"|"…/okr"|"…/journeys",
    "analytics:read")` entries (mirror `P("GET","analytics/graph","analytics:read")`).
    New section only; do not touch `getRoutePermission`/`matchSegments`. **This
    RBAC edit lands in this same task as the router dispatch** (same-task
    pairing) so no route ships as an authorization hole.
- **Verification**: `bun test:integration` scoped to
  `api/__tests__/performance-journeys.integration.test.ts` (authored in T-10)
  — AC-05; the RBAC mapping is pinned by the unit test in T-06.

### T-06 — RBAC route-permission unit test

- **Files** (1): `api/__tests__/performance-rbac.test.ts` (new)
- **Implements**: design §4.7 RBAC rationale — NFR-02
- **Complexity**: simple
- **Blocked by**: T-05
- **Blocks**: —
- **Steps**:
  - Assert `getRoutePermission("GET", ["analytics","performance","kpis"])`
    returns `"analytics:read"` (never `null`); same for `…,"okr"]` and
    `…,"journeys"]`. Mirror `kpi-okr-governance`'s
    `rbac-route-permissions.test.ts`. (Integration runs use the dev-fallback
    session with `ONELOGIN_ISSUER` unset and cannot observe a missing mapping,
    so this unit test is the guard.)
- **Verification**: `bun test api/__tests__/performance-rbac.test.ts` —
  companion to AC-06 (RBAC null-hole closed).

### T-07 — KPI portfolio integration test (status, slice, query-count)

- **Files** (1): `api/__tests__/performance-kpis.integration.test.ts` (new)
- **Implements**: design §8 — closes AC-01, AC-02, AC-14
- **Complexity**: complex
- **Blocked by**: T-01, T-03
- **Blocks**: T-15
- **Steps**:
  - `describe("integration: performance kpis", …)` (the `integration:` prefix
    is mandatory or the suite skips it). Fixtures via the production
    `getDriver()` (Neo4j) + Postgres `query()`, per the `kpi-okr-governance`
    §3.4 convention.
  - **AC-01**: seed `higher_is_better` / `lower_is_better` / `target_is_exact`
    KPIs with measurements at the on_target / warning / breach boundaries and a
    KPI with no measurement (`no_data`); assert the computed `status` per row
    end-to-end over HTTP against `127.0.0.1:8787`.
  - **AC-02**: `?domain=<id>` narrows; `?journey=<id>` narrows; combined filters
    intersect; an unknown well-formed id returns `{rows:[]}` (200, not 404).
  - **AC-14 (C-03 spy seam pinned):** install the round-trip spy at the
    **`getDriver().session` seam** — wrap the singleton driver's `session`
    method so every session it opens is captured, and assert on the returned
    session object's `run` call count summed across the sessions opened during
    one request; spy the Postgres `query` singleton the same way. Mirror
    `kpi-okr-governance`'s `*.integration.test.ts` query-count precedent
    (wrap-the-`session`-factory, not a naked per-`session` spy — a naked spy on
    one per-call `session` object misses a handler that opens a second session
    and can double-count a reused one). Restore both spies in `afterEach`.
    Assert **at most one Neo4j round trip and at most one Postgres round trip**
    per request, and that a 50-KPI fixture and a 5-KPI fixture yield the
    **same** round-trip count (no per-KPI growth).
- **Verification**: `bun test:integration` (needs Neo4j + Postgres) —
  `api/__tests__/performance-kpis.integration.test.ts` green.

### T-08 — systemKind slice integration test (inclusive-any)

- **Files** (1): `api/__tests__/performance-systemkind-slice.integration.test.ts` (new)
- **Implements**: design §4.3, DD-06 — closes AC-03
- **Complexity**: moderate
- **Blocked by**: T-03
- **Blocks**: T-15
- **Steps**:
  - `describe("integration: performance systemKind slice", …)`. Because the
    retail seed is monochrome (`functional` only, Risk R-3), create fixtures for
    **all three** kinds: KPIs with `CONTRIBUTES_TO` paths reaching `functional`,
    `agentic`, and `ai_predictive` Systems (`systemKind` set inside
    `attributes_json`, imported from `SYSTEM_KINDS` — never re-declared).
  - Assert `?kind=agentic` returns only KPIs reaching an agentic System
    (inclusive-any — a KPI reaching both functional + agentic still matches);
    a KPI with no KPI→…→System path is excluded from a non-`all` slice;
    `kind` absent / `all` / `nonsense` all return the full in-scope set (200,
    the `all` slice — AC-03/AC-06 N-03), never a 400.
- **Verification**: `bun test:integration` —
  `api/__tests__/performance-systemkind-slice.integration.test.ts` green.

### T-09 — OKR roll-down integration test (four literals, adjustment, two-read spy)

- **Files** (1): `api/__tests__/performance-okr.integration.test.ts` (new)
- **Implements**: design §4.5, §8 — closes AC-04
- **Complexity**: complex
- **Blocked by**: T-01, T-04
- **Blocks**: T-15
- **Steps**:
  - `describe("integration: performance okr", …)`. Build fixtures through the
    governed roll-down write routes / driver: `(:RollDown{type:'okr'})-[:FOR_OKR]->(:OKRDirective)`,
    `-[:HAS_ASSIGNMENT]->(:RollDownAssignment)-[:FOR_DOMAIN]->(:Domain)`,
    `(:OKRDirective)-[:HAS_KEY_RESULT]->(:KeyResult)` with a `progress` inside
    `KeyResult.attributes_json`.
  - Assert a fresh assignment reads back `status:'pending'`; after the governed
    commit/approve/reject transitions it reads `committed`/`approved`/`rejected`
    — **no `assigned`/`adjustment_requested` literal is ever asserted** (FR-03).
  - Assert `weight` surfaces from `a.weight` (not `contribution`, B-02);
    `key_results[].progress` surfaces from `attributes_json` (C-01);
    `adjustment_requested` becomes `true` only after
    `POST /roll-down/request-adjustment` creates a pending `:RollDownAdjustment`,
    never derived from `status` (FR-03).
  - **C-06 assertion:** a directive whose `:RollDown` has no assignment yields
    `domains: []` (the null-`a` row is dropped, not surfaced as a null-domain
    row); the response validates against `okrPerformanceResponseSchema`.
  - **Two-read spy (C-03 seam pinned):** install the spy at the
    **`getDriver().session` seam** — wrap the singleton driver's `session`
    method and sum the returned session objects' `run` call counts across one
    request (mirroring `kpi-okr-governance`'s `*.integration.test.ts`
    query-count precedent), never a naked per-`session` spy that would miss a
    second session or double-count a reused one; restore in `afterEach`.
    Assert the endpoint issues **exactly two Neo4j reads** regardless of
    directive/assignment count (N-03, no per-directive N+1).
  - Do **not** assert the substring-match false positive as a defect (R-2 is
    inherited, `kpi-okr-governance`'s to fix).
- **Verification**: `bun test:integration` —
  `api/__tests__/performance-okr.integration.test.ts` green (AC-04).

### T-10 — Journey-axis integration test

- **Files** (1): `api/__tests__/performance-journeys.integration.test.ts` (new)
- **Implements**: design §4.4 — closes AC-05
- **Complexity**: simple
- **Blocked by**: T-05
- **Blocks**: T-15
- **Steps**:
  - `describe("integration: performance journeys", …)`. Seed a domain with two
    `UserJourney` nodes `PART_OF` it; assert `?domain=<id>` returns both rows
    ordered by `name`; an unknown domain → `{rows:[]}`; an absent `domain` →
    `{rows:[]}` (not every journey).
- **Verification**: `bun test:integration` —
  `api/__tests__/performance-journeys.integration.test.ts` green.

### T-11 — OpenAPI registration for the performance paths

- **Files** (2): `api/src/routes/openapi-performance.ts` (new),
  `api/src/routes/openapi.ts` (modify — narrow §4.7, two lines)
- **Implements**: design §4.6 — FR-09
- **Complexity**: moderate
- **Blocked by**: T-01
- **Blocks**: T-13
- **Steps**:
  - `openapi-performance.ts` exporting
    `registerPerformancePaths(registry: OpenAPIRegistry): void`, mirroring
    `openapi-kpi-okr.ts`. Register the §3.2 request/response schemas and a
    `registerPath` entry for each of the three new routes
    (`/analytics/performance/{kpis,okr,journeys}`); the `kpi-trends` sparkline
    is already registered by `kpi-okr-governance`. 400/404 responses reference
    the existing `errorEnvelopeSchema`.
  - `openapi.ts`: add exactly two lines — the import of
    `registerPerformancePaths` and one call inside `getOpenApiDoc()`. Touch
    nothing else.
- **Verification**: covered by the extended
  `api/__tests__/openapi.integration.test.ts` in T-13 (AC-06); interim check
  is `bun run typecheck`.

### T-12 — PWA data layer: `api.performance` client

- **Files** (1): `pwa/src/api.ts` (modify — narrow §4.7, new `performance`
  object)
- **Implements**: design §6 data layer, §4.7 — FR-02..FR-04
- **Complexity**: simple
- **Blocked by**: T-01, T-05
- **Blocks**: T-14
- **Steps**:
  - Add a new `performance` client object with `kpis(slice, signal)` →
    `GET /analytics/performance/kpis` (serializing `domain`/`journey`/`kind`
    query params), `okr(domainId?, signal)` → `.../okr`,
    `journeys(domainId, signal)` → `.../journeys`. New object only; do **not**
    touch `getPerformance` (per-domain, unchanged — N-02), `kpi.list`, or
    `domains.list`. Import the response types from
    `@companygraph/shared/schema/performance`.
- **Verification**: `bun run typecheck`; exercised by the view tests (T-15) via
  mocked fetches.

### T-13 — OpenAPI integration test extension (path enumeration + 400/coercion)

- **Files** (1): `api/__tests__/openapi.integration.test.ts` (modify)
- **Implements**: design §8 — closes AC-06
- **Complexity**: simple
- **Blocked by**: T-11, T-05
- **Blocks**: T-15
- **Steps**:
  - Extend the existing path-enumeration assertion to require the three new
    `/api/v1/analytics/performance/*` paths in `GET /api/v1/openapi.json`.
  - Assert a malformed hard-validated `domain` (bad UUID shape) on
    `/analytics/performance/kpis` returns the standard
    `400 {error:{code,message,details}}` envelope; assert `?kind=nonsense`
    returns **200 with the `all` slice**, not 400 (N-03).
  - Keep the existing assertions green (aggregates are additive — AC-13).
- **Verification**: `bun test:integration` —
  `api/__tests__/openapi.integration.test.ts` green (AC-06).

### T-14 — `PerformanceDashboard` view + exec-tab registration

- **Files** (3): `pwa/src/views/exec/PerformanceDashboard.tsx` (new),
  `pwa/src/views/exec/PerformanceDashboard.module.css` (new),
  `pwa/src/route.ts` (modify — narrow §4.7, one exec-tab append)
- **Implements**: design §6 (FR-01..FR-04, UX-01/02/05/06); pins N-04 for the view
- **Complexity**: complex
- **Blocked by**: T-12
- **Blocks**: T-15, T-16
- **Steps**:
  - `pwa/src/route.ts`: append **one** row `{ id: "performance", label:
    "Performance" }` to the `exec` surface's `tabs` array **after
    `{ id: "okr-management", … }`** (the array ends there, `route.ts:76`),
    comment-anchored `// kpi-okr-performance-dashboards: exec performance tab`.
    Touch **no** `#/model/*` row and no other surface (DD-05, FILE-OWNERSHIP —
    one clean owner for the `#/exec/performance` row).
  - `PerformanceDashboard.tsx` (pure renderer): read `route.params.domain /
    .journey / .kind`; slice changes rewrite `location.hash` via
    `toHash({surface:"exec",tab:"performance"}, params)` (same pattern as
    `#/explorer/systems?kind=`); unknown/absent params → `All` on that axis.
    Fetch `api.performance.kpis(slice)`, `.okr(domain)`, `.journeys(domain)`
    plus `api.domains.list()` for the domain axis, via `useFetch` with
    `AbortSignal`; the selected-KPI sparkline lazily fetches `kpi-trends`
    (DD-08). **N-04:** consume `/okr` as-is — `?domain` narrows directives, not
    the domain columns.
  - Components (catalog-first, UX-02): KPI status panel = one `KpiCard` per KPI
    (`tone` mapped `on_target→good|warning→warn|breach→danger|no_data→neutral`)
    plus a text `Pill` per status ("On target"/"Warning"/"Breach"/"No data" —
    text + tone, never color alone); trend = `LineChartCard`; OKR panel = `Card`
    per directive with a status `Pill` per assigned domain (`pending` MAY
    display as "Awaiting" — display mapping only, FR-03) and an
    `adjustment_requested` badge; link-out `Button` to `#/exec/okr-management`
    (display + link-out only, no mutation). Slicer = domain `<select>`, journey
    `<select>` (disabled until a domain is chosen), and a systemKind `<div
    role="group" aria-label="Filter by system kind">` of catalog `Button`s
    (labels from `SYSTEM_KIND_LABELS`, values from `SYSTEM_KINDS` — NFR-05;
    active button `aria-pressed`). `ViewHeader`/`Loading`/`ErrorState` from
    `views/_shared.tsx`.
  - States (UX-01): loading (`<Loading>`), error (`<ErrorState>`), empty-no-KPIs
    ("No KPIs yet"), empty-slice-zero-match (distinct "No KPIs match this slice"
    + a working clear-slice affordance resetting that axis to `All`), ready.
  - `.module.css` uses `var(--…)` tokens only — no hex/rgba/oklch literals.
  - Register the view factory row `"performance": (r) => <PerformanceDashboard
    route={r} />` in `pwa/src/views/index.tsx` (see T-16 note — the factory row
    is added here if `index.tsx` is not otherwise touched; if a same-task file
    budget is tight, the factory row moves to T-16). **Decision: add the factory
    row in this task** so the view is reachable the moment the tab lands.
    (Files list above already accounts for `route.ts`; `views/index.tsx` is the
    accepted 4th narrow file for this view-wiring task — a documented waiver, as
    the tab row, view, styles, and factory registration are inseparable for a
    reachable view.)
- **Verification**: `bun run scripts/design-conformance.ts` exits 0 with
  `PerformanceDashboard.tsx` clean (AC-10); behaviour verified by T-15.

### T-15 — Dashboard behaviour tests (URL slice, states, click-path)

- **Files** (1): `pwa/src/__tests__/performance-dashboard.test.tsx` (new)
- **Implements**: design §8 — closes AC-07, AC-08, AC-09, AC-12 (automated leg)
- **Complexity**: complex
- **Blocked by**: T-14
- **Blocks**: T-17, T-19 (this file must exist before T-19 wires it into CI —
  Resolves: B-01)
- **Steps**:
  - vitest/jsdom (`cd pwa && bunx vitest run src/__tests__/performance-dashboard.test.tsx`).
  - **AC-07**: mounting with `route.params` from
    `#/exec/performance?domain=…&journey=…&kind=agentic` renders pre-sliced on
    all three axes; a slice change rewrites the hash (URL-first) without full
    navigation.
  - **AC-08**: mocked aggregate fetches drive loading / error (failed fetch) /
    ready (KPI status panel + trend cards + OKR panel).
  - **AC-09**: zero KPIs → "No KPIs yet"; an active slice matching zero KPIs →
    distinct zero-match message + a working clear-slice affordance returning to
    `All` on that axis.
  - **AC-12 (automated leg)**: selecting domain→journey→kind narrows both panels
    consistently and updates the hash; a selected KPI's sparkline renders from a
    mocked `kpi-trends` response.
- **Verification**: `cd pwa && bunx vitest run
  src/__tests__/performance-dashboard.test.tsx` green locally; this file is
  wired into the `unit` CI job by T-19 so AC-07/08/09/12's automated legs
  **gate merge** (Resolves: B-01) — a local-only pass is not the gate.

### T-16 — Dashboard a11y test

- **Files** (1): `pwa/src/__tests__/performance-dashboard-a11y.test.tsx` (new)
- **Implements**: design §6 a11y (UX-05) — closes AC-11 (automated leg)
- **Complexity**: moderate
- **Blocked by**: T-14
- **Blocks**: T-17, T-19 (this file must exist before T-19 wires it into CI —
  Resolves: B-01)
- **Steps**:
  - vitest/jsdom. Assert Tab reaches every slicer control (domain select,
    journey select, systemKind buttons) in DOM order; the active systemKind
    button exposes selected state (`aria-pressed`); each KPI status is present
    as text (e.g. "Breach"), not color alone; a `main` landmark is present
    (the app shell provides it via `pwa/src/App.tsx` `<main>` — the test asserts
    the routed content sits inside it; no source edit to add a landmark).
- **Verification**: `cd pwa && bunx vitest run
  src/__tests__/performance-dashboard-a11y.test.tsx` green locally; this file is
  wired into the `unit` CI job by T-19 so AC-11's automated leg **gates merge**
  (Resolves: B-01).

### T-19 — CI: gate the two owned PWA vitest files in the `unit` job

- **Files** (1): `.github/workflows/ci.yml` (modify — narrow: append the two
  owned files to the `unit` job's existing PWA `vitest run` step)
- **Implements**: the CI merge-gate for AC-07, AC-08, AC-09, AC-11 (auto leg),
  AC-12 (auto leg) — Resolves: B-01
- **Complexity**: simple
- **Blocked by**: T-15, T-16 (both files must exist)
- **Blocks**: T-18
- **Steps**:
  - The `unit` job already runs PWA vitest via **explicit file enumeration**
    (`.github/workflows/ci.yml:23`):
    `bunx vitest run src/__tests__/exec-kpi-management.test.tsx src/__tests__/exec-okr-management.test.tsx`
    (`working-directory: pwa`). New PWA test files are **not** discovered
    unless added to that line — root `bun test` / `scripts/test-unit.sh` never
    cds into `pwa/`, so nothing else picks them up.
  - Append the two owned files to that exact `vitest run` line, in-place:
    `bunx vitest run src/__tests__/exec-kpi-management.test.tsx src/__tests__/exec-okr-management.test.tsx src/__tests__/performance-dashboard.test.tsx src/__tests__/performance-dashboard-a11y.test.tsx`.
    Update the adjacent scoping comment to note this spec's two files are
    added under the same scoped-enumeration rationale.
  - **Scope discipline (Resolves: B-01 / Pinned flag):** add **exactly** these
    two files. Do **not** switch the step to a whole-suite `vitest run` (no
    args) — that would drag the un-triaged legacy pwa `error-scenarios` tree
    into this spec's merge gate, which is out of charter. Mirror
    `kpi-okr-governance` T-20 step (4)'s scoping decision.
  - Touch nothing else in `ci.yml` (no `integration`-job change — the Postgres
    service, migrations, and API-boot step already exist from
    `kpi-okr-governance` T-20; this spec's integration tests ride them).
- **Verification**: manual: open the PR's `unit` job run in GitHub Actions
  (browser) — verify the `vitest run` step now lists and passes
  `performance-dashboard.test.tsx` and `performance-dashboard-a11y.test.tsx`,
  so AC-07/08/09/11(auto)/12(auto) gate merge; also
  `cd pwa && bunx vitest run src/__tests__/performance-dashboard.test.tsx src/__tests__/performance-dashboard-a11y.test.tsx`
  green locally.

### T-17 — Manual acceptance sweep (deep link, keyboard, click/touch)

- **Files** (0): manual verification only; no source edits
- **Implements**: the manual legs of AC-07, AC-11, AC-12
- **Complexity**: simple
- **Blocked by**: T-15, T-16
- **Blocks**: T-18
- **Steps**:
  - Bring the app up (`bun run dev`), seed if needed, and run the three manual
    repros below. Record pass/fail per AC in STATUS.md's verification notes.
- **Verification**: manual:
  (AC-07) open `http://127.0.0.1:5173/#/exec/performance?domain=<id>&journey=<id>&kind=agentic`
  in macOS Chrome and press Cmd+R (mouse) — verify all three slicers show active
  and rows stay filtered;
  (AC-11) keyboard-only on macOS Safari — Tab through the three slicers, press
  Enter on `Agentic`, verify rows narrow, the focus ring stays visible, and
  status pills read as text;
  (AC-12) macOS Chrome click domain→journey→kind (mouse) — expect both panels +
  hash update; iPhone Safari tap the same controls (touch) — expect tap targets
  activate.

### T-18 — Full validation + ownership check + completion gate

- **Files** (0): validation + STATUS.md update only; no source edits
- **Implements**: design §8 regression/gate — closes AC-10, AC-13; final AC sweep
- **Complexity**: moderate
- **Blocked by**: T-17, T-19 (both the manual sweep and the CI wiring must land
  before the completion gate — Resolves: B-01)
- **Blocks**: —
- **Steps**:
  - `bun run typecheck` exits 0 (AC-13).
  - `bun run scripts/design-conformance.ts` exits 0 with the Performance view
    listed clean (AC-10).
  - `bun test` (unit) + `bun test:integration` (Neo4j + Postgres) all green;
    the pre-existing `openapi.integration.test.ts` stays green (aggregates
    additive).
  - `cd pwa && bunx vitest run src/__tests__/performance-dashboard.test.tsx src/__tests__/performance-dashboard-a11y.test.tsx`
    green (the two owned view tests; vitest entry point, never root `bun test`).
  - **CI gate check (Resolves: B-01):** confirm the `unit` job's PWA
    `vitest run` step in `.github/workflows/ci.yml` enumerates both owned files
    (T-19 landed), so AC-07/08/09/11(auto)/12(auto) gate merge and are not
    local-only. Record this in STATUS.md's flags.
  - **Ownership check (AC-13):** `git diff --name-only` shows **no** change
    under any `kpi-okr-governance`-owned route/view path, `RollDown.tsx`,
    `RollDownAnalytics.tsx`, `system-kind.ts`, or a `#/model/*` `route.ts` row —
    only the additive exec-tab append and the enumerated §7 files.
  - Populate STATUS.md `verified_at` + `verification_artifact` and mark
    Execution complete (the completion hook blocks otherwise).
- **Verification**: `bun run typecheck` + `bun test` + `bun test:integration` +
  `git diff --name-only` review (expect no `kpi-okr-governance`-owned or
  `#/model/*` change) — closes AC-10, AC-13.

## Traceability — AC → task

| AC | Closed by | Kind | CI-gated (Resolves: B-01) |
|----|-----------|------|---------------------------|
| AC-01 (status computed correctly) | T-02 (pure fn), T-07 (end-to-end) | unit + integration | yes (`unit` + `integration` jobs) |
| AC-02 (domain/journey slice narrows) | T-07 | integration | yes |
| AC-03 (systemKind inclusive-any slice) | T-08 | integration | yes |
| AC-04 (OKR four literals + adjustment + two-read) | T-09 | integration | yes |
| AC-05 (journey axis) | T-10 | integration | yes |
| AC-06 (OpenAPI paths + 400/coercion) | T-13, T-06 (RBAC companion) | integration + unit | yes |
| AC-07 (deep-link survives reload) | T-15 (auto, CI via T-19), T-17 (manual) | jsdom + manual | auto leg yes (T-19) |
| AC-08 (loading/error/ready states) | T-15 (CI via T-19) | jsdom | yes (T-19) |
| AC-09 (empty variants) | T-15 (CI via T-19) | jsdom | yes (T-19) |
| AC-10 (design-conformance) | T-14, T-18 | CLI | yes |
| AC-11 (keyboard/a11y) | T-16 (auto, CI via T-19), T-17 (manual) | jsdom + manual | auto leg yes (T-19) |
| AC-12 (slice click path + sparkline) | T-15 (auto, CI via T-19), T-17 (manual) | jsdom + manual | auto leg yes (T-19) |
| AC-13 (transpile + ownership) | T-18 | CLI | yes |
| AC-14 (query-count invariant) | T-07 | integration | yes |

### Traceability — NFR → task (Resolves: N-03)

| NFR | Guaranteed by |
|-----|---------------|
| NFR-01 (read-only: no write path, no `ERROR_CODES` add, no `/api/v2/`) | reading-guide read-only contract; T-18 ownership diff (no governed route/view file, no `RollDown*.tsx`, no `#/model/*` row) |
| NFR-02 (house rules: zod-only, en-US, auth via central gate + `api/src/auth/`) | T-05 RBAC via `rbac-permissions.ts` (same-task pairing, never per-route); T-01 zod schemas; T-06 RBAC null-hole unit test |
| NFR-05 (systemKind imported, never re-declared) | T-01 imports `SYSTEM_KINDS` for reference only; T-08 fixtures + T-14 slicer use `SYSTEM_KINDS`/`SYSTEM_KIND_LABELS` from `system-kind.ts` |

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` (repo root) — **transpile only, not behavior** (C-01): for T-03/T-04 the real proof is the paired integration test, not this checkpoint |
| tasks with API behaviour (T-02..T-13) | the task's listed test (`bun test <path>` / `bun test:integration`) |
| tasks touching pwa views (T-14) | `bun run scripts/design-conformance.ts` |
| pwa view/a11y tests (T-15, T-16) | `cd pwa && bunx vitest run <path relative to pwa/>` locally; **gated in CI by T-19** (Resolves: B-01) |
| CI wiring (T-19) | GitHub Actions `unit` job's PWA `vitest run` step lists + passes the two owned files (`performance-dashboard.test.tsx`, `performance-dashboard-a11y.test.tsx`) — AC-07/08/09/11(auto)/12(auto) gate merge |
| final task (T-18) | `bun test` + `bun test:integration` (needs Neo4j + Postgres) + the two owned pwa vitest files + full AC sweep + `git diff --name-only` ownership check + confirm T-19 CI gate is present |
</content>
</invoke>
