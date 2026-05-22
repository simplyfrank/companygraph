---
feature: "graph-core"
created: "2026-05-22"
author: "frank"
status: "approved"
approved_by: "frank"
approved_at: "2026-05-22"
revision: 2
reviewing_requirements_revision: 4
reviewing_design_revision: 3
size: "large"
total_tasks: 31
---

# Tasks: graph-core

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit (`Blocks` / `Blocked by`); no out-of-order execution.
- **Verification**: every task declares a concrete test path or `manual: <one-line repro>`. The completion hook blocks STATUS.md updates without one.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h with one judgment call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck`; after `code` tasks that ship behaviour, also run the listed test.

## Open design concerns — pinned decisions

Design review pass 2 left three open concerns (C-08, C-09, C-10) for the
tasks-phase author to pin. The decisions below are binding for execution.
Inline AC fixtures lock them.

| Concern | Decision | Rationale | Locked in task |
|---------|----------|-----------|----------------|
| **C-08** PATCH with empty body | **200** + bumps `updatedAt` only; no field changes. `nodeUpdateSchema.parse({})` is valid by design (all-optional). | Matches idempotent-touch semantics; lets clients use PATCH as a "refresh updatedAt" probe. Returning 400 would force callers to check `Object.keys` before sending. | T-11 storage layer (semantic) + T-25 fixture in `nodes-crud.integration.test.ts` |
| **C-09** All-phase-1-failure import HTTP status | **200** with `imported:{nodes:0, edges:0}, errors:[…]`. The HTTP-layer succeeded; row-level failures are reported in `errors[]` regardless of pass-rate. | Matches the "partial success surfaces in `errors[]`" pattern of `/import`; 400 would force clients to special-case "all failed" vs "some failed". | T-14 (and `import-phase-errors.integration.test.ts` fixture) |
| **C-10** Cross-type edge `id` collision on `DELETE /edges/:id` | **Reject at create time.** `validateEdge` checks `EXISTS { MATCH ()-[r {id:$id}]-() }` across all six edge types before `createEdge`/`upsertEdge`. On conflict → `409 id_conflict`. `DELETE /edges/:id` then has at most one match by construction. | Cleaner than scoping DELETE by `?type=`; one Cypher round-trip on writes is acceptable for foundation scope. `ontology-manager` can add a global-edge-id constraint if needed. | T-10 (and edge-id-cross-type fixture in `edges-crud.integration.test.ts`) |

## Task list

### T-01 — Workspace skeleton

**Files** (5, all simple boilerplate):
- `package.json` (workspaces: `api`, `pwa`, `shared`; scripts: `dev`, `stop`, `seed`, `schema:apply`, `typecheck`, `test`, `test:integration`)
- `tsconfig.json` (root base — strict, target ES2022, module ESNext)
- `.gitignore` (`node_modules`, `.env`, `neo4j_data/`, `dist/`)
- `.env.example` (per design §8.3)
- `README.md` (quickstart + runtime matrix + en-US identifier convention + **versioning policy paragraph per NFR-11/AC-28**)

**Maps to**: FR-01, FR-15 (partial — README), NFR-10, NFR-11
**Complexity**: simple
**Verification**: `manual: ls package.json tsconfig.json .gitignore .env.example README.md from repo root — all exist; cat README.md and confirm "/api/v2/" + "three months" parallel-support paragraph present`
**Validation**: `bun install --dry-run` succeeds
**Blocks**: T-02, T-04
**Blocked by**: —

### T-02 — Docker + runtime detection scripts

**Files**:
- `docker-compose.yml` (Neo4j 5 community per design §8.3 — `NEO4J_AUTH` fail-loud)
- `scripts/runtime-detect.sh` (per design §8.2)
- `scripts/wait-for-neo4j.sh` (polls bolt + verifies auth per design §8.3)

**Maps to**: FR-02, FR-10, Risk #7
**Complexity**: moderate (cross-runtime probing)
**Verification**: `manual: bun run dev with each of: Docker Desktop / OrbStack / colima / Podman 4 / Rancher Desktop installed (skip if a runtime is not present locally) — expect /healthz reachable within 60s on each; uninstall all runtimes, run bun run dev, expect "no compose runtime detected" stderr from runtime-detect.sh and exit 1`
**Validation**: `docker compose config -q` (or runtime equivalent) on `docker-compose.yml`
**Blocks**: T-24
**Blocked by**: T-01

### T-03 — CI workflow file

**Files**:
- `.github/workflows/ci.yml` (two jobs `unit` + `integration` per design §11)

**Maps to**: FR-14 (workflow lands), AC-16 (verification deferred to T-03b)
**Complexity**: moderate (services block + correct `NEO4J_AUTH` defaults — must avoid the literal-"neo4j" footgun called out in design §8.3)
**Verification**: static — `actionlint` (or https://rhysd.github.io/actionlint/) passes clean on `.github/workflows/ci.yml`. The end-to-end "PR turns green" verification is deferred to T-03b once unit tests actually exist.
**Validation**: actionlint
**Blocks**: T-03b
**Blocked by**: T-01

### T-03b — CI workflow live verification

**Files**:
- none (verification-only — runs after enough tests exist to make a meaningful PR run)

**Maps to**: AC-16
**Complexity**: simple (operator action, not code)
**Verification**: AC-16 — `manual: open a no-op PR against main after T-20 (first unit test) and T-24 (first integration test) have landed. Expect both 'unit' and 'integration' jobs green within 5 min. Then intentionally break the no-auth grep test in a follow-up commit and push — expect the unit job to fail and integration to remain green (or fail independently). Revert.`
**Validation**: green CI run on the PR
**Blocks**: —
**Blocked by**: T-03, T-20, T-24

### T-04 — Shared schema (nodes + edges + types)

**Files**:
- `shared/package.json`
- `shared/src/schema/nodes.ts` (NODE_LABELS + three zod schemas per design §3.1)
- `shared/src/schema/edges.ts` (EDGE_TYPES + EDGE_ENDPOINTS + edge zod per §3.2)

**Maps to**: FR-03, FR-04, design-review B-01 (three schemas), pass-2 C-02 (EDGE_ENDPOINTS matrix)
**Complexity**: moderate (schema is load-bearing — every other component imports from here)
**Verification**: `bun run typecheck` clean; `bun test shared/__tests__/schema-shapes.test.ts` (small smoke that EDGE_ENDPOINTS satisfies the `satisfies` clause and is exhaustive over EDGE_TYPES)
**Validation**: transpile
**Blocks**: T-06, T-09, T-10
**Blocked by**: T-01

### T-05 — Shared types module

**Files**:
- `shared/src/types.ts` (`Node`, `Edge`, `NodeCreateInput`, `NodeUpdateInput`, `EdgeCreateInput`, `Stats`, `ImportPayload`, `ImportResponse`, `ErrorEnvelope`)

**Maps to**: FR-03, FR-04, NFR-05
**Complexity**: simple
**Verification**: transpile-only; types are exported and import cleanly into a test stub
**Validation**: transpile
**Blocks**: T-06, T-09, T-10, T-12..T-17
**Blocked by**: T-04

### T-06 — Seed fixture

**Files**:
- `shared/seed/retail-mini.json` (the exact-count fixture per FR-08 — 4 domains, 8 journeys, 32 activities, 6 roles, 6 systems, 4 locations, plus all the `PART_OF`/`EXECUTES`/`USES_SYSTEM`/`AT_LOCATION`/`PRECEDES`/`INTEGRATES_WITH` edges that make it walkable)

**Maps to**: FR-08
**Complexity**: moderate (the only judgment call is writing realistic retail names + ensuring every edge passes `EDGE_ENDPOINTS` constraints — content is bounded)
**Verification**: structural — parse JSON, assert exact node/edge counts match FR-08; edge endpoints all reference declared node ids; every edge's `(type, fromLabel, toLabel)` combination appears in `EDGE_ENDPOINTS`
**Validation**: `bun test shared/__tests__/seed-shape.test.ts`
**Blocks**: T-26 (seed loader), T-27 (test packs needing realistic data)
**Blocked by**: T-04, T-05

### T-07 — API core utilities

**Files** (4 small leaf modules, exception to 1-3 rule — each <60 lines, all framework-free):
- `api/package.json`
- `api/src/env.ts` (loopback-default per NFR-02)
- `api/src/ids.ts` (UUIDv7 via `uuid` package)
- `api/src/errors.ts` (`ERROR_CODES` + `ValidationError` + `isConstraintViolation`)

**Maps to**: FR-01, NFR-02, NFR-05, NFR-07, design §5.3
**Complexity**: simple
**Verification**: `bun test api/__tests__/id-format.test.ts` (AC-21) — POST/GET round-trip not yet wired so test calls `generateId()` directly twice within 5 ms, asserts both match UUIDv7 regex and `id2 > id1` lexicographically
**Validation**: transpile
**Blocks**: T-08, T-09, T-10, T-11
**Blocked by**: T-01, T-05

### T-08 — Logging + validation runner

**Files**:
- `api/src/logging.ts` (per design §9)
- `api/src/validate.ts` (zod runner that normalises errors to `invalid_payload` envelope)

**Maps to**: FR-12, FR-13, NFR-05
**Complexity**: simple
**Verification**: `bun test api/__tests__/request-logging.test.ts` (AC-18) — mock console, call the logger with sample data, assert JSON line shape; also a small `validate.ts` unit test that confirms a zod failure becomes the `{error:{code:"invalid_payload"}}` envelope
**Validation**: transpile + unit test
**Blocks**: T-12..T-17
**Blocked by**: T-07

### T-09 — Neo4j driver + bootstrap + read-only session

**Files**:
- `api/src/neo4j/driver.ts` (lazy singleton, env-driven creds)
- `api/src/neo4j/bootstrap.ts` (registry-driven constraints + indexes per design §3.3 / §8.1)
- `api/src/neo4j/read-only-session.ts` (`runPassthrough` per §5.4 — observer.subscribe + cancel at row 1001)

**Maps to**: FR-02, FR-05, NFR-06, NFR-09, AC-04, AC-23
**Complexity**: complex (mid-stream cancel pattern needs to handle the cancel/onCompleted race — design pass-2 N-1)
**Verification**: `bun test:integration api/__tests__/neo4j-bootstrap.integration.test.ts` (AC-03) + `api/__tests__/schema.integration.test.ts` (AC-04 — idempotent bootstrap)
**Validation**: transpile + integration tests
**Note**: implement the cancel/reject race guard — a `cancelled` boolean flag in the closure that suppresses subsequent `onNext`/`onCompleted` callbacks after `cancel()` is called. Document inline as a one-liner comment so it's not lost.
**Blocks**: T-10, T-11, T-15, T-16, T-17 (everything that runs Cypher; route handlers T-12/T-13/T-14/T-18 transitively via storage layer)
**Blocked by**: T-07, T-08

### T-10 — Edge storage + cross-type collision check

**Files**:
- `api/src/storage/edges.ts` (`validateEdge`, `createEdge`, `upsertEdge`, `deleteEdge` per design §4.2 + **C-10 pin**: validator runs `EXISTS { MATCH ()-[r {id:$id}]-() }` across all types before create/upsert)

**Maps to**: FR-06, FR-12, AC-06, AC-13, pass-2 C-02, design-review C-10 pin
**Complexity**: complex (validator runs three round-trips: lookup fromLabel, lookup toLabel, cross-type id check; ordering of round-trips matters for clean error messages)
**Verification**: `bun test:integration api/__tests__/edges-crud.integration.test.ts` — round-trips every edge type; iterates 216 (type × from-label × to-label) combinations per AC-13; plus a fixture for the C-10 pin: create `PART_OF` with id X, attempt to create `EXECUTES` with id X → expect `409 id_conflict`
**Validation**: transpile + integration tests
**Blocks**: T-13, T-14
**Blocked by**: T-04, T-05, T-09

### T-11 — Node storage (three helpers)

**Files**:
- `api/src/storage/nodes.ts` (`createNode`, `patchNode`, `upsertNode`, `getNode`, `deleteNode` per design §4.1 + **C-08 pin**: empty-body PATCH bumps `updatedAt` only, no field changes)

**Maps to**: FR-06, AC-05, design-review B-01, C-08 pin
**Complexity**: complex (three helpers with distinct semantics; dynamic SET clause; cascade behaviour on DELETE)
**Verification**: `bun test:integration api/__tests__/nodes-crud.integration.test.ts` — CREATE returns 201 with UUIDv7; CREATE with duplicate id returns `409 id_conflict`; PATCH with `{description:"x"}` leaves `name` + `attributes` untouched; PATCH with `{}` returns 200 with bumped `updatedAt`; DELETE on missing id returns 404; DELETE with attached edges returns `409 has_edges` unless `?cascade=true`
**Validation**: transpile + integration tests
**Blocks**: T-12, T-14
**Blocked by**: T-04, T-05, T-09

### T-12 — URL param guards + node routes

**Files**:
- `api/src/routes/_helpers.ts` (`parseLabel`, `parseId` per design §5.5)
- `api/src/routes/nodes.ts` (4 handlers — POST/GET/PATCH/DELETE; each calls `parseLabel` first)

**Maps to**: FR-06, AC-05, design-review C-05 (parseLabel guard), C-08 pin (empty PATCH)
**Complexity**: moderate
**Verification**: `bun test:integration api/__tests__/url-param-guards.test.ts` — probes every node route with malicious `:label` values (empty, lowercase `domain`, `Domain) WITH n DETACH DELETE n //`, etc.) → all return `400 unknown_label`; `nodes-crud.integration.test.ts` already covers the happy paths from T-11
**Validation**: transpile + integration tests
**Blocks**: T-21 (router)
**Blocked by**: T-08, T-11

### T-13 — Edge routes

**Files**:
- `api/src/routes/edges.ts` (POST + DELETE handlers calling `createEdge` / `deleteEdge`)

**Maps to**: FR-06, AC-06
**Complexity**: simple
**Verification**: covered by `edges-crud.integration.test.ts` from T-10 (route layer is thin; tests already hit it via fetch)
**Validation**: transpile + integration tests
**Blocks**: T-21
**Blocked by**: T-08, T-10

### T-14 — Import route (with dry-run + phase semantics)

**Files**:
- `api/src/routes/import.ts` (collect-and-continue + `?dryRun=true` per design §4.3 + §2.3 + **C-09 pin**: 200 status even when 100 % of phase-1 fails)

**Maps to**: FR-06, FR-20, AC-07, AC-08, AC-27, design-review C-03 + C-09 pin
**Complexity**: complex (two-phase + dry-run wrapping + per-row error envelope)
**Verification**: `bun test:integration api/__tests__/import.integration.test.ts` (AC-07 — seed loads with exact counts) + `import-idempotent.integration.test.ts` (AC-08) + `import-dryrun.integration.test.ts` (AC-27) + `import-phase-errors.integration.test.ts` (covers C-03 phase disambiguation AND C-09 all-fail = 200)
**Validation**: transpile + integration tests
**Blocks**: T-21 (seed loader POSTs to `/api/v1/import`), T-26 (integration tests for `/import` semantics including dry-run + phase errors)
**Blocked by**: T-08, T-10, T-11

### T-15 — Query routes (typed helpers + cypher passthrough)

**Files**:
- `api/src/routes/query.ts` (listDomains, getDomain, getJourney, getActivity, findPath via shortestPath, neighbors with LIMIT 1001, POST /query/cypher via `runPassthrough` from T-09)

**Maps to**: FR-07, NFR-06, NFR-09, AC-09, AC-10, AC-23
**Complexity**: complex (six query helpers + cypher passthrough; findPath's shortestPath + 5s timeout per pass-1 C-02)
**Verification**: `bun test:integration api/__tests__/query-service.integration.test.ts` (AC-09) + `cypher-passthrough.integration.test.ts` (AC-10 — incl. the `MATCH (n {name:"CREATE INDEX"}) RETURN n` literal-keyword case from pass-1 C-04) + `query-caps.integration.test.ts` (AC-23 — depth, row, and timeout caps)
**Validation**: transpile + integration tests
**Blocks**: T-21
**Blocked by**: T-09

### T-16 — Healthz + stats

**Files**:
- `api/src/routes/healthz.ts` (returns `{ok, neo4j:{connected, version}}`)
- `api/src/routes/stats.ts` (returns all-keys-present map per FR-11)

**Maps to**: FR-11, AC-11, AC-12
**Complexity**: simple
**Verification**: `bun test:integration api/__tests__/healthz.integration.test.ts` + `stats.integration.test.ts`
**Validation**: transpile + integration tests
**Blocks**: T-21, T-28 (PWA polls these)
**Blocked by**: T-09

### T-17 — Export routes (JSON + NDJSON)

**Files**:
- `api/src/routes/export.ts` (`GET /api/v1/export` buffered; `GET /api/v1/export.ndjson` streamed via observer per design §2.3)

**Maps to**: FR-17, FR-18, AC-25, AC-26
**Complexity**: moderate (streaming NDJSON needs `Bun.write` direct-to-response — non-trivial for first-time)
**Verification**: `bun test:integration api/__tests__/export-import-roundtrip.integration.test.ts` (AC-25) + `export-ndjson.integration.test.ts` (AC-26 — incl. the streaming assertion)
**Validation**: transpile + integration tests
**Blocks**: T-21
**Blocked by**: T-09

### T-18 — OpenAPI route

**Files**:
- `api/src/routes/openapi.ts` (boot-time `zod-to-openapi` generator + handler per design §2.3)

**Maps to**: FR-16, AC-24
**Complexity**: moderate (registering every zod schema + walking the §5.1 route table as data)
**Verification**: `bun test:integration api/__tests__/openapi.integration.test.ts` (AC-24)
**Validation**: transpile + integration test
**Blocks**: T-19
**Blocked by**: T-08 (zod runner). **Implementation note**: the OpenAPI generator declares its **own** static `Route[]` array literal inside `openapi.ts`, mirroring design §5.1 — no cross-task module dependency. The generator does NOT block on every route handler existing because it constructs the OpenAPI doc from the static table + the zod schemas in `shared/src/schema/`.

### T-19 — Router + server entry

**Files**:
- `api/src/router.ts` (dispatch table mounting `/api/v1/*` — single source of truth for the §5.1 route table)
- `api/src/server.ts` (`Bun.serve` entry + `applySchema` call + `logRequest` middleware + bind-host enforcement per NFR-02)

**Maps to**: FR-06, FR-07, FR-11, FR-13, FR-16, FR-17, FR-18, FR-20, NFR-02
**Complexity**: moderate (wiring everything; bind-host correctness; logging middleware shape)
**Verification**: `bun test:integration api/__tests__/bind-host.integration.test.ts` (AC-19) + `envelope.test.ts` (AC-20 — exhaustive ERROR_CODES coverage via mocked DB)
**Validation**: transpile + integration tests
**Blocks**: T-23, T-25..T-28
**Blocked by**: T-12, T-13, T-14, T-15, T-16, T-17, T-18

### T-20 — No-auth grep test + AC-22 polish

**Files**:
- `api/__tests__/no-auth-grep.test.ts` (per design §6.4 — tightened pattern, jsdoc-line filter, comment allowlist)

**Maps to**: NFR-08, AC-22
**Complexity**: simple (test-only)
**Verification**: this IS the verification — runs as part of `bun test`. Passes on a clean codebase; intentionally add a `req.auth` reference to a stub file → expect fail; intentionally add a comment `// authentication: intentional: no auth` → expect pass
**Validation**: unit test runs in CI
**Blocks**: —
**Blocked by**: T-19

### T-21 — Schema-apply + seed scripts

**Files**:
- `api/scripts/schema-apply.ts` (standalone bootstrap runner wrapping `applySchema(driver)`)
- `api/scripts/seed.ts` (loader that POSTs `shared/seed/retail-mini.json` to `/api/v1/import`)

**Maps to**: FR-05 (explicit script), FR-08 (loader)
**Complexity**: simple
**Verification**: `manual: bun run schema:apply against a fresh Neo4j — second run completes cleanly with no constraint creation (existing constraints recognised); bun run seed loads the fixture` PLUS automated backstop: `api/__tests__/seed-script-idempotent.integration.test.ts` — invokes the `scripts/seed.ts` entry point twice via `Bun.spawn` (not via the HTTP `/import` endpoint directly), asserts `/api/v1/stats` counts unchanged on the second invocation. This exercises the script-layer wiring (env loading, payload streaming, exit codes) that T-14/T-26's pure HTTP tests do not — the two tests are orthogonal coverage of NFR-04 at different layers.
**Validation**: transpile + integration test + manual smoke
**Blocks**: T-26 (the test packs use seed)
**Blocked by**: T-09, T-14, T-19

### T-22 — PWA workspace + dev tooling

**Files**:
- `pwa/package.json`
- `pwa/tsconfig.json`
- `pwa/vite.config.ts` (proxy `/api/v1` → `127.0.0.1:8787`)

**Maps to**: FR-01, FR-09
**Complexity**: simple
**Verification**: `manual: from pwa/ dir, vite build runs clean and produces dist/; vite dev starts on 5173 and proxies /api/v1/healthz to the API correctly (curl http://127.0.0.1:5173/api/v1/healthz returns the API's response)`
**Validation**: transpile
**Blocks**: T-23
**Blocked by**: T-01

### T-23 — PWA shell content

**Files** (4 files — documented exception to the 1-3 rule; rationale: these are the four atomic pieces of a Vite/React SPA bootstrap and there is no meaningful seam between them — index.html mounts `<div id="root">`, main.tsx renders `<App/>`, App.tsx is the only view, api.ts is the only data dependency. Splitting across multiple tasks would create artificial transpile-only steps that ship nothing observable. T-01 (5-file scaffold pack) and T-07 (4 leaf utilities) follow the same logic):
- `pwa/index.html`
- `pwa/src/main.tsx`
- `pwa/src/App.tsx` (connectivity banner + stats summary + poll cadence per design §7.1)
- `pwa/src/api.ts` (typed client — only `getHealthz()` + `getStats()`)

**Maps to**: FR-09, AC-14
**Complexity**: moderate (visibility-change poll toggle is the only judgment call; otherwise pure markup + fetch)
**Verification**: AC-14 — `manual: bun run dev on macOS, open http://127.0.0.1:5173/ in iPhone Safari (via local IP), iPad Safari, macOS Safari (trackpad), macOS Chrome — expect "Connected" banner + node-count summary in each; then bun run stop and observe banner flips to red within 30 s without page reload`
**Validation**: transpile
**Blocks**: —
**Blocked by**: T-16, T-19, T-22

### T-24 — Integration test pack 1: bootstrap + health

**Files**:
- `api/__tests__/neo4j-bootstrap.integration.test.ts`
- `api/__tests__/schema.integration.test.ts`
- `api/__tests__/healthz.integration.test.ts`
- `api/__tests__/stats.integration.test.ts`

**Note**: Files written incrementally during T-09, T-16 above. This task captures the consolidation pass — confirm the four files pass together against a single docker-compose-up; harness fixtures (`docker compose up neo4j` in `beforeAll`) wired correctly.

**Maps to**: AC-03, AC-04, AC-11, AC-12
**Complexity**: moderate (harness wiring — `beforeAll` boots Neo4j, `afterAll` tears down; or relies on `bun run dev` being running)
**Verification**: `bun test:integration api/__tests__/neo4j-bootstrap.integration.test.ts api/__tests__/schema.integration.test.ts api/__tests__/healthz.integration.test.ts api/__tests__/stats.integration.test.ts` — all pass
**Validation**: integration tests pass
**Blocks**: T-25..T-28
**Blocked by**: T-02, T-09, T-16

### T-25 — Integration test pack 2: nodes + edges + validation

**Files**:
- `api/__tests__/nodes-crud.integration.test.ts` (written in T-11; consolidated here)
- `api/__tests__/edges-crud.integration.test.ts` (written in T-10; consolidated)
- `api/__tests__/url-param-guards.test.ts` (written in T-12; consolidated)
- `api/__tests__/validation.integration.test.ts` (the 216-combination iterator per AC-13)

**Maps to**: AC-05, AC-06, AC-13, design-review C-05 + C-10
**Complexity**: moderate (the 216-combo iterator + the C-10 cross-type-id fixture + the empty-PATCH fixture from C-08)
**Verification**: `bun test:integration` on the four files — all pass
**Validation**: integration tests pass
**Blocks**: —
**Blocked by**: T-10, T-11, T-12, T-24

### T-26 — Integration test pack 3: import (incl. dryRun + phase errors)

**Files**:
- `api/__tests__/import.integration.test.ts`
- `api/__tests__/import-idempotent.integration.test.ts`
- `api/__tests__/import-dryrun.integration.test.ts`
- `api/__tests__/import-phase-errors.integration.test.ts` (covers C-03 phase tag AND **C-09 all-fail = 200**)

**Maps to**: AC-07, AC-08, AC-27, design-review C-03 + C-09 pin
**Complexity**: moderate (mostly fixture authoring; C-09 fixture is the one judgment-call test)
**Verification**: `bun test:integration` on the four files — all pass
**Validation**: integration tests pass
**Blocks**: —
**Blocked by**: T-06, T-14, T-21, T-24

### T-27 — Integration test pack 4: query + caps

**Files**:
- `api/__tests__/query-service.integration.test.ts`
- `api/__tests__/cypher-passthrough.integration.test.ts` (incl. `MATCH (n {name:"CREATE INDEX"}) RETURN n` from C-04)
- `api/__tests__/query-caps.integration.test.ts` (depth + row + timeout)

**Maps to**: AC-09, AC-10, AC-23
**Complexity**: complex (the row-cap timing assertion requires instrumenting the driver to confirm only 1001 records were materialised; query-timeout test uses a contrived **Cartesian product** — e.g. `MATCH (a),(b),(c),(d),(e),(f) RETURN count(*)` against the 32-activity fixture — which produces ~10⁹ combinations and easily exceeds the 5 s tx timeout. No APOC plugin needed in CI, sidestepping the absence of `NEO4J_PLUGINS` in design §11's services block.)
**Verification**: `bun test:integration` on the three files — all pass
**Validation**: integration tests pass
**Blocks**: —
**Blocked by**: T-15, T-24

### T-28 — Integration test pack 5: OpenAPI + export

**Files**:
- `api/__tests__/openapi.integration.test.ts`
- `api/__tests__/export-import-roundtrip.integration.test.ts`
- `api/__tests__/export-ndjson.integration.test.ts`

**Maps to**: AC-24, AC-25, AC-26
**Complexity**: moderate (the OpenAPI validation against the JSON Schema is the non-trivial step; round-trip is straightforward)
**Verification**: `bun test:integration` on the three files — all pass
**Validation**: integration tests pass
**Blocks**: —
**Blocked by**: T-17, T-18, T-21, T-24, T-26

### T-29 — `.claude/` cleanup

**Files**:
- `.claude/CLAUDE.md` (rewrite per design §12 — five H2 sections, four follow-up specs cited, NFR-11 versioning paragraph)
- `.claude/specs/_baseline/` (delete the directory)
- `api/__tests__/claude-md-content.test.ts` (AC-17 file inspection per design §15)

**Maps to**: FR-15, AC-17, AC-28 (versioning paragraph)
**Complexity**: moderate (writing a new CLAUDE.md of substance, not a one-line stub)
**Verification**: `bun test api/__tests__/claude-md-content.test.ts` (AC-17 — asserts title contains "companygraph"; H2 sections "Architecture"/"Schema"/"Development"/"Follow-up specs"/"Versioning" or equivalents; four follow-up spec names each cited; forbidden strings absent) + manual AC-28 paragraph check
**Validation**: unit test + manual file inspection
**Blocks**: T-30
**Blocked by**: T-19 (so the architecture doc can reference the live route table)

### T-30 — End-to-end clean-clone-to-connected verification (AC-15)

**Files**:
- none (verification-only — runs against the live system after every other task has landed; **closes review pass-1 B-01: AC-15's previous task-orphan status**)

**Maps to**: AC-15
**Complexity**: simple (operator procedure, no code; rests on the success of all prior tasks)
**Verification**: AC-15 — `manual: in a fresh git clone with a supported container runtime running (Docker Desktop, OrbStack, colima, Podman 4+, or Rancher Desktop — pick one), execute exactly bun install && bun run dev. Within 5 min (excluding Neo4j image pull), expect: (a) docker-compose up reports neo4j healthy; (b) curl -s http://127.0.0.1:8787/api/v1/healthz returns {"ok":true,"neo4j":{"connected":true,"version":"5.x.x"}}; (c) opening http://127.0.0.1:5173/ in a browser shows the green "Connected" banner with node/edge counts populated (run bun run seed first if counts should be non-zero). Record the actual elapsed time in the spec's STATUS.md verification_artifact field.`
**Validation**: live system smoke
**Blocks**: STATUS.md completion (this AC is the one most likely to surface env-specific regressions late)
**Blocked by**: T-01, T-02, T-04, T-05, T-06, T-07, T-08, T-09, T-10, T-11, T-12, T-13, T-14, T-15, T-16, T-17, T-18, T-19, T-21, T-22, T-23, T-24, T-25, T-26, T-27, T-28, T-29 (every code-shipping task — T-03/T-03b/T-20 are meta-checks not on the AC-15 critical path).

## Execution sequence (dependency-ordered)

Authoritative dependency listing — every edge is declared in the per-task
`Blocks` / `Blocked by` fields above; this diagram only summarises.

```
Scaffold
  T-01 ──┬─→ T-02 ─→ T-24
         ├─→ T-03 ─→ T-03b (also blocked by T-20, T-24)
         ├─→ T-04 ─→ T-05 ─→ T-06
         └─→ T-22 ─→ T-23

API foundation (after T-05)
  T-05 ─→ T-07 ─→ T-08 ─┬─→ T-12 ──┐
                        ├─→ T-14   │
                        └─→ T-18 ──┤
  T-07 ─→ T-09 ─┬─→ T-10 ──┬─→ T-13┤
                ├─→ T-11 ──┤       │
                ├─→ T-15   │       │
                ├─→ T-16   │       │
                └─→ T-17   │       │
                           ↓       │
                        T-12, T-14 │
                                   ↓
Wire up + verify              T-19 ─┬─→ T-20
                                    ├─→ T-21
                                    └─→ T-29 ──→ T-30
PWA + browser smoke
  T-22 ─→ T-23 (also needs T-16 + T-19)
Integration consolidation
  T-09, T-16, T-02 ─→ T-24 ─┬─→ T-25
                            ├─→ T-26
                            ├─→ T-27
                            └─→ T-28
End-to-end (closes AC-15)
  every other task ─→ T-30
```

## Risk register (carry-over from design)

The five design-§18 risks remain. Tasks introduce no new risks. The
three open concerns from design pass-2 review (C-08, C-09, C-10) are
pinned at the top of this file and locked into specific tasks (C-08 →
T-11 storage + T-25 fixture; C-09 → T-14 + T-26 fixture; C-10 → T-10 +
T-25 fixture).

## Estimated effort

- Tasks at `simple`: 14 (T-01, T-03b, T-05, T-07, T-13, T-16, T-20, T-21, T-22, T-25 light parts, T-30 — operator procedures and small leaf modules)
- Tasks at `moderate`: 11 (T-02, T-03, T-04, T-06, T-08, T-12, T-17, T-18, T-19, T-23, T-26, T-28, T-29)
- Tasks at `complex`: 5 (T-09 cancel/race guard, T-10 cross-type collision validator, T-11 three node helpers, T-14 import with dryRun + phase semantics, T-15 query routes incl. shortestPath + timeout, T-27 query-caps instrumentation)
- Total: **31 tasks** (T-01..T-29 = 29, plus T-03b, plus T-30 = 31), expected end-to-end **5–8 working days** for one engineer, longer if the PWA platform sweep (T-23 manual cross-platform) takes a half-day on its own. Traceability tooling that pattern-matches task IDs MUST accept `T-[\w-]+` (T-03b is the only non-numeric ID).

## Post-completion amendment from process-explorer-ui

| ID | Task | Files | FR / AC | Complexity | Depends on | Validation |
|----|------|-------|---------|-----------:|------------|------------|
| **T-31** | **Add `GET /api/v1/query/search?label&q&limit` + 6 per-label fulltext indexes**. Amendment from `process-explorer-ui/FR-17` and `process-explorer-ui/AC-28`. **Filed against graph-core after `execution:complete`** — graph-core's foundation is shipped and this is a strictly-additive amendment honouring NFR-07 (one new read-only helper, no other API surface extensions). Endpoint inlines its zod `searchSchema` co-located with the handler (no separate `schemas.ts` aggregator exists). The 6 fulltext indexes (`<label_lower>_name_fulltext`) are added inside the existing `applySchema()` loop in `bootstrap.ts`, additive to the per-label range index already there. All DDLs use `IF NOT EXISTS` so the call remains idempotent (process-explorer-ui/AC-32). | `api/src/routes/query.ts` (append handler + inline searchSchema), `api/src/router.ts` (register route), `api/src/neo4j/bootstrap.ts` (append fulltext index per label), `api/src/routes/openapi.ts` (register OpenAPI path), `api/__tests__/search-helper.test.ts` (new integration test) | process-explorer-ui FR-17 / AC-28 / AC-32 | simple | T-09 (bootstrap), T-15 (query routes), T-19 (openapi) — all shipped | `bun test:integration api/__tests__/search-helper.test.ts` green; `bun run schema:apply` second-run leaves `SHOW FULLTEXT INDEXES WHERE name ENDS WITH '_name_fulltext'` count unchanged at 6; `GET /api/v1/openapi.json` includes the new path |
