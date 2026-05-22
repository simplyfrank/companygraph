---
feature: "graph-core"
created: "2026-05-22"
author: "frank"
status: "approved"
approved_by: "frank"
approved_at: "2026-05-22"
revision: 4
size: "large"
---

# Requirements: graph-core

## Summary

`graph-core` is the foundation spec for the **companygraph** product — a single-tenant,
self-hosted platform that models a retail organisation's business processes as an
attributed graph. This spec establishes the project scaffold (Bun + TypeScript
monorepo, React PWA shell, Neo4j storage), defines the canonical node + edge
schema for the retail process domain, and ships the ingestion + query services
that every downstream spec (`ontology-manager`, `process-explorer-ui`,
`chat-interface`, `cto-analytics`) will build on.

This spec deliberately **does not** include ontology CRUD, the interactive
explorer UI, the chat interface, the CTO analytics dashboard, or any
auth/RBAC. Those are tracked as separate downstream specs.

## Motivation

The companygraph repository is empty. Before any feature work can land we
need:

1. A reproducible project scaffold (one-command boot from a clean checkout).
2. A Neo4j-backed attributed graph store with an enforced retail-process
   schema so every downstream feature shares the same model.
3. A typed ingestion + query layer so the explorer UI, chat interface, and
   analytics never write ad-hoc Cypher against unconstrained nodes.
4. Seed data that proves the model end-to-end with a realistic mini retail
   org, so subsequent specs have something to render and analyse.

Without this foundation, downstream specs would each invent their own schema
shape and the graph would diverge from a coherent ontology in week one.

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01 | Bun + TypeScript monorepo scaffold: `package.json` with workspaces (`api/`, `pwa/`, `shared/`), root `tsconfig.json`, `.gitignore`, `README.md`, `.env.example` | must |
| FR-02 | Containerised Neo4j 5.x Community via `docker-compose.yml` with named volume, healthcheck, default bolt port `7687`, browser port `7474`; credentials sourced from `.env` | must |
| FR-03 | Canonical node schema for the retail process domain — six node labels: `Domain`, `UserJourney`, `Activity`, `Role`, `System`, `Location`. Each carries an immutable `id` (UUIDv7), `name`, `description`, `createdAt`, `updatedAt`, and an open `attributes` JSON map for arbitrary attributed properties. | must |
| FR-04 | Canonical edge schema — six relationship types, each used uniformly for every node-type pair it applies to: `PART_OF` (Journey→Domain, Activity→Journey, Location→Location for store/region/country hierarchy), `EXECUTES` (Role→Activity — canonical role↔activity binding; no inverse `PLAYS_ROLE` edge — the inverse direction is reached via Cypher), `USES_SYSTEM` (Activity→System), `AT_LOCATION` (Activity→Location), `PRECEDES` (Activity→Activity, ordered process flow), `INTEGRATES_WITH` (System→System) | must |
| FR-05 | Schema bootstrap script: on first `bun run dev` (or explicit `bun run schema:apply`), idempotently creates Neo4j uniqueness constraints on every node `id`, range indexes on `name`, and registers the relationship types. Safe to re-run. | must |
| FR-06 | Ingestion REST API exposed on `127.0.0.1:8787` (`api/` workspace, Bun HTTP server). **Every API path in this spec is mounted under `/api/v1/`** — no root-level routes — so `ontology-manager` and later specs can extend without rename churn. Per-node-type CRUD: `POST /api/v1/nodes/:label`, `GET /api/v1/nodes/:label/:id`, `PATCH /api/v1/nodes/:label/:id`, `DELETE /api/v1/nodes/:label/:id`. Per-relationship: `POST /api/v1/edges` with request body `{type: <one of FR-04 types>, fromId: <UUIDv7>, toId: <UUIDv7>, attributes?: object}` and response `{id: <UUIDv7>, type, fromId, toId, attributes, createdAt}` where `id` is server-generated per NFR-07; `DELETE /api/v1/edges/:id` returns `204`. Bulk import endpoint `POST /api/v1/import` accepts a JSON document `{nodes:[…], edges:[…]}` and upserts by `id`; nodes and edges in the same payload may reference each other in any order (two-phase: nodes first, then edges). | must |
| FR-07 | Typed query service with first-class helpers exposed both in-process (TS module) and over REST (`GET /api/v1/query/*`): `listDomains()`, `getDomain(id)` (returns domain + member journeys), `getJourney(id)` (returns journey + ordered activities + roles + systems + locations), `getActivity(id)`, `findPath(fromId, toId, maxDepth)`, `neighbors(id, depth)` (en-US spelling — codebase convention). A `POST /api/v1/query/cypher` passthrough endpoint accepts a read-only Cypher statement and returns rows (write statements rejected — see NFR-06). | must |
| FR-08 | Seed dataset (`shared/seed/retail-mini.json`) — **exact fixture, not a floor**, so AC-07 can assert precise counts: 4 domains (Merchandising, Store Operations, Supply Chain, Customer/CRM), 2 journeys per domain (8 total), 4 activities per journey (32 total), 6 roles, 6 systems, 4 locations (2 stores + 1 DC + 1 HQ — wired with `PART_OF` to demonstrate location hierarchy). Loadable via `bun run seed`. eCommerce and additional richness intentionally deferred to a larger `retail-demo` fixture in `ontology-manager`. | must |
| FR-09 | Base PWA shell (`pwa/`) — single-page placeholder served by Vite dev server on `127.0.0.1:5173` (proxies `/api/v1/*` to the API server). Loads `index.html`, polls `/api/v1/healthz` on mount, on `visibilitychange→visible`, and every 30 s while the tab is visible (no polling while hidden). Renders connectivity status (green/red dot) and the node/edge counts from `/api/v1/stats`. No interactive graph rendering in this spec. | must |
| FR-10 | One-command local dev runtime: `bun run dev` starts Neo4j via docker-compose (waits for healthcheck), then API server, then PWA dev server, all with hot reload. `bun run stop` tears down docker-compose. | must |
| FR-11 | Health + stats endpoints: `GET /api/v1/healthz` returns `{ok, neo4j: {connected, version}}`; `GET /api/v1/stats` returns `{nodes: {Domain, UserJourney, Activity, Role, System, Location}, edges: {PART_OF, EXECUTES, USES_SYSTEM, AT_LOCATION, PRECEDES, INTEGRATES_WITH}}` — all keys present even when value is 0. | must |
| FR-12 | Server-side write validation: required properties present, referenced endpoints exist before edge creation, label/type whitelist enforced. Reject with `400 {error:{code, message, details}}`. | must |
| FR-13 | Structured request logging (JSON lines to stdout in dev) for every API request: method, path, status, duration, Cypher query time when applicable. | should |
| FR-14 | CI bootstrap: GitHub Actions workflow (`.github/workflows/ci.yml`) that runs `bun install`, `bun run typecheck` (Bun build no-bundle), `bun test`, and verifies docker-compose config validity on every PR. | should |
| FR-15 | Inherited `.claude/` infrastructure is rewritten for this project: `CLAUDE.md` replaced with companygraph-specific architecture doc (the current file is borrowed from an unrelated assistant project); `_baseline` spec removed or marked obsolete; spec-governance hooks left intact. | must |
| FR-16 | OpenAPI 3.1 schema served at `GET /api/v1/openapi.json`, generated at server boot from the same `zod` schemas used at runtime (single source of truth). Document covers every route in FR-06/FR-07/FR-11/FR-17/FR-18, including request bodies, response shapes, and the full `ERROR_CODES` enum. Closes user story **API-1.1**. | must |
| FR-17 | Bulk JSON export at `GET /api/v1/export` — returns `{nodes:[…], edges:[…]}` with every row ordered by `id` ASC (deterministic). Round-trip property: `GET /export` → `POST /import` against a fresh DB → `GET /export` again yields byte-identical content. Closes user story **API-2.1**. | must |
| FR-18 | NDJSON streaming export at `GET /api/v1/export.ndjson` — `Content-Type: application/x-ndjson`, one JSON object per line, same ordering as FR-17 (nodes first, then edges, each section by `id` ASC). Server streams (does not buffer the whole export in memory). Closes user story **API-2.2**. | must |
| FR-19 | (Deferred to follow-on spec `graph-core-change-feed`.) `GET /api/v1/changes?since=:iso` incremental sync with tombstones for deleted ids. Not in scope of this spec — requires a soft-delete / tombstone storage shape that would slow this spec. Reference: user story **API-2.3**. | deferred |
| FR-20 | Dry-run import — `POST /api/v1/import?dryRun=true` runs both phases inside a transaction, computes the same `{imported, errors}` response, then aborts before commit. Stats are unchanged after the call. Closes user story **API-3.3**. | must |

## Non-Functional Requirements

| ID | Requirement | Category |
|----|-------------|----------|
| NFR-01 | All TypeScript transpiles cleanly with `bun build --no-bundle`; no `tsc` step required. | reliability |
| NFR-02 | API server binds to `127.0.0.1` only by default; no exposure beyond localhost without explicit `HOST=` override. | security |
| NFR-03 | Reproducible boot: from clean `git clone`, `bun install && bun run dev` succeeds in <5 min on a macOS dev box with a supported container runtime (Docker Desktop, OrbStack, colima, Podman 4+, or Rancher Desktop) running. Neo4j image pull excluded from the budget. | usability |
| NFR-04 | All ingestion operations are idempotent on `id` — running `bun run seed` twice yields zero new nodes or edges. | data-integrity |
| NFR-05 | API response envelope is consistent: success returns the resource (or `{rows:[…]}` for queries); errors return `{error:{code,message,details?}}`. | api-quality |
| NFR-06 | Cypher passthrough is read-only — any statement containing `CREATE`, `MERGE`, `DELETE`, `SET`, `REMOVE`, `DROP`, or `CALL` against write procedures is rejected at parse time. | security |
| NFR-07 | Node + edge `id` values are UUIDv7 — sortable, monotonic, generated server-side; client-supplied ids accepted only via `POST /import` for round-tripping. | data-integrity |
| NFR-08 | Single-tenant self-hosted scope: no user model, no auth, no multi-tenant data isolation. Documented as an out-of-scope decision so it is not silently re-introduced. | scope |
| NFR-09 | `findPath(fromId, toId, maxDepth)` and `neighbors(id, depth)` enforce `maxDepth ≤ 8` and a `≤ 1000`-row result cap; exceeding either returns `400 {error:{code:"depth_exceeded"}}` or `{error:{code:"result_truncated"}}` respectively. The Cypher passthrough enforces the same row cap. | performance |
| NFR-10 | TypeScript codebase uses **en-US spelling for identifiers** (e.g. `neighbors`, `color`); prose comments and documentation MAY use en-GB. Convention documented in `README.md`. | code-style |
| NFR-11 | API versioning policy: breaking changes to the `/api/v1/` surface increment the URL prefix to `/api/v2/`, and `/api/v1/` is supported in parallel for **at least three months** after `/api/v2/` is published. Non-breaking changes (added optional fields, new endpoints under existing prefix) do not trigger a version bump. Policy documented in `README.md` + `.claude/CLAUDE.md`. Closes user story **API-1.3** (continuation). | policy |

## Scope Boundaries

**In scope:**
- Project scaffold (Bun workspaces, React PWA shell, Neo4j docker-compose).
- Canonical node + edge schema for the retail process domain (6 labels, 6 edge types).
- Ingestion REST API + bulk import.
- Typed query service + read-only Cypher passthrough.
- Seed retail-mini dataset.
- Health + stats endpoints.
- Server-side validation + structured logging.
- CI bootstrap (typecheck + test workflow).
- Rewrite of inherited `.claude/CLAUDE.md`; cleanup of `_baseline` spec from
  the prior project (the inherited copy refers to a personal-assistant
  codebase that does not exist in this repo).

**Out of scope (tracked in separate specs):**
- Ontology CRUD, versioning, import/export, external alignment → `ontology-manager`.
- Interactive graph rendering, filters, drill-down, path-finding UI → `process-explorer-ui`.
- Natural-language chat over the graph → `chat-interface`.
- Domain↔service alignment matrix, integration pathways, complexity metrics,
  AI optimisation recommendations → `cto-analytics`.
- Authentication, authorisation, RBAC, multi-user, multi-tenant.
- Production deployment (TLS termination, reverse proxy, secrets management,
  Neo4j Enterprise features, clustering, backups).
- Migration tooling beyond first-run schema bootstrap.
- Real-time graph subscriptions (websockets) — REST only in this spec.

## Acceptance Criteria

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | Repository scaffold present: `package.json` with workspaces, `tsconfig.json`, `.env.example`, `README.md`, `.gitignore`, `docker-compose.yml`. | n/a (build) | manual: `ls api pwa shared docker-compose.yml package.json` from repo root — expect all paths exist |
| AC-02 | All TypeScript transpiles | n/a (build) | `bun build api/src/server.ts --no-bundle > /dev/null` and `bun build pwa/src/main.ts --no-bundle > /dev/null` — exit 0 |
| AC-03 | Neo4j container starts and accepts bolt connections | n/a (server) | `api/__tests__/neo4j-bootstrap.test.ts` — spins up docker-compose, connects via driver, runs `RETURN 1` |
| AC-04 | Schema bootstrap creates expected constraints + indexes idempotently | n/a (server) | `api/__tests__/schema.test.ts` — runs bootstrap twice, asserts `SHOW CONSTRAINTS` count unchanged on second run |
| AC-05 | All six node-label CRUD endpoints work | n/a (server) | `api/__tests__/nodes-crud.test.ts` — round-trips each label through POST/GET/PATCH/DELETE |
| AC-06 | All six edge types creatable via `POST /api/v1/edges` with the FR-06 payload shape, deletable via `DELETE /api/v1/edges/:id`; validation rejects unknown `type`, missing `fromId`/`toId`, and dangling endpoints | n/a (server) | `api/__tests__/edges-crud.test.ts` — for each of `PART_OF`, `EXECUTES`, `USES_SYSTEM`, `AT_LOCATION`, `PRECEDES`, `INTEGRATES_WITH`: POST → assert response has UUIDv7 `id` + echoed fields → DELETE → 204. Plus rejection cases: unknown type, missing field, non-existent endpoint id |
| AC-07 | Bulk import endpoint loads the retail-mini seed with the exact counts declared in FR-08 | n/a (server) | `api/__tests__/import.test.ts` — POSTs seed file, asserts `/api/v1/stats` returns `{nodes:{Domain:4, UserJourney:8, Activity:32, Role:6, System:6, Location:4}, edges:{…non-zero for every type used by the fixture…}}` |
| AC-08 | Bulk import is idempotent | n/a (server) | `api/__tests__/import-idempotent.test.ts` — runs `POST /api/v1/import` twice with same payload, asserts node + edge counts unchanged on second run |
| AC-09 | Typed query helpers return expected shapes | n/a (server) | `api/__tests__/query-service.test.ts` — calls each helper on the seed graph, asserts shape and key counts |
| AC-10 | Cypher passthrough accepts reads, rejects writes | n/a (server) | `api/__tests__/cypher-passthrough.test.ts` — `MATCH … RETURN …` succeeds; `CREATE …` / `MERGE …` / `SET …` / `DELETE …` / `CALL apoc.*` rejected with `400` |
| AC-11 | `/api/v1/healthz` reports Neo4j connectivity and version | n/a (server) | `api/__tests__/healthz.test.ts` — assert `{ok:true, neo4j:{connected:true, version:/^5\./}}` |
| AC-12 | `/api/v1/stats` returns label + edge counts | n/a (server) | `api/__tests__/stats.test.ts` — assert all six labels + all six edge types are keys, counts are numbers (including zero) |
| AC-13 | Write validation rejects malformed payloads | n/a (server) | `api/__tests__/validation.test.ts` — missing required props, unknown label, dangling edge endpoint, wrong type — each returns `400 {error:{code,message}}` |
| AC-14 | PWA shell loads and shows live connectivity status; banner reflects status changes within one poll interval (≤30 s) | iPhone Safari (touch), iPad Safari, macOS Safari (trackpad), macOS Chrome (mouse+kb) | manual: `bun run dev`, open `http://127.0.0.1:5173/` on each platform — expect "Connected" banner with green dot + node-count summary + no console errors; then `bun run stop`, observe banner flips to "Disconnected" red within 30 s without page reload |
| AC-15 | One-command boot: `bun run dev` brings up Neo4j, API, PWA from clean clone | n/a (build) | manual: in a fresh clone with a supported container runtime running, execute `bun install && bun run dev` — within 5 min (excluding image pull), `/api/v1/healthz` returns ok and the PWA shell renders connected |
| AC-16 | CI workflow runs typecheck + test on PR | n/a (CI) | `.github/workflows/ci.yml` present; manual: open a no-op PR, expect green check from `ci` workflow |
| AC-17 | Inherited `.claude/CLAUDE.md` replaced with companygraph-specific content of substance | n/a (docs) | manual: open `.claude/CLAUDE.md`, assert (a) title contains "companygraph"; (b) no occurrences of `Personal Productivity Assistant`, `telegram/`, `PWA Telegram bot`, `EC2 t4g.small`, `grammY`, `osascript`; (c) H2 sections present named `Architecture`, `Schema`, `Development`, `Follow-up specs` (or equivalents that cover those four topics); (d) the four follow-up specs (`ontology-manager`, `process-explorer-ui`, `chat-interface`, `cto-analytics`) are each named at least once |
| AC-18 | Structured request logging (FR-13) writes one JSON line per request with required fields | n/a (server) | `api/__tests__/request-logging.test.ts` — fire a `GET /api/v1/healthz` and a `GET /api/v1/query/listDomains`, capture stdout, assert each produces exactly one JSON line with keys `{ts, method, path, status, durationMs}`; the query call additionally has `cypherDurationMs` |
| AC-19 | API server binds to `127.0.0.1` by default (NFR-02) | n/a (server) | `api/__tests__/bind-host.test.ts` — start server with no env overrides, attempt a TCP connect to the server's port via `0.0.0.0` — expect `ECONNREFUSED`; loopback connect succeeds |
| AC-20 | Response envelope is consistent (NFR-05) | n/a (server) | `api/__tests__/envelope.test.ts` — for one success + one error from each of `/api/v1/nodes/*`, `/api/v1/edges`, `/api/v1/query/*`, `/api/v1/import`, assert success returns the resource (or `{rows:[…]}` for queries) and error returns `{error:{code,message,details?}}` with the documented shape |
| AC-21 | Server-generated ids are UUIDv7 and monotonic (NFR-07) | n/a (server) | `api/__tests__/id-format.test.ts` — POST two nodes within 5 ms, assert each `id` matches `/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`, and `id2 > id1` lexicographically |
| AC-22 | No auth code paths present (NFR-08) | n/a (codebase) | manual: `grep -rE "(authorization|bearer|jwt|session|cookie|user_id|tenant)" api/src/ pwa/src/` returns zero production hits; only test fixtures permitted |
| AC-23 | `findPath` / `neighbors` / Cypher passthrough enforce depth + row caps (NFR-09) | n/a (server) | `api/__tests__/query-caps.test.ts` — call `findPath` with `maxDepth=9` → expect `400 depth_exceeded`; load a contrived 1001-row Cypher → expect `400 result_truncated`; same boundary tests at `maxDepth=8` and 1000 rows succeed |
| AC-24 | `GET /api/v1/openapi.json` returns a valid OpenAPI 3.1 document covering every route (FR-16) | n/a (server) | `api/__tests__/openapi.integration.test.ts` — GET endpoint, validate against OpenAPI 3.1 JSON Schema (e.g. `@apidevtools/swagger-parser`); assert every path in §5.1 of design.md is present; assert every `ERROR_CODES` member appears as an enum value in the schema; assert request/response shapes match the zod definitions (single-source-of-truth check) |
| AC-25 | Bulk JSON export round-trips through import with zero diff (FR-17) | n/a (server) | `api/__tests__/export-import-roundtrip.integration.test.ts` — seed retail-mini, `GET /api/v1/export` → store as `exportA`; reset DB; `POST /api/v1/import` with `exportA`; `GET /api/v1/export` → `exportB`; deep-equal `exportA` and `exportB` (same `id` order, same content) |
| AC-26 | NDJSON streaming export (FR-18) | n/a (server) | `api/__tests__/export-ndjson.integration.test.ts` — `GET /api/v1/export.ndjson`; assert `Content-Type: application/x-ndjson`; assert response body has exactly `Σ nodes + Σ edges` lines (matches `/stats` totals); each line parses as JSON; nodes come before edges; within each section ordered by `id` ASC; assert streaming via response observer (handler must not buffer entire payload) |
| AC-27 | Dry-run import does not write (FR-20) | n/a (server) | `api/__tests__/import-dryrun.integration.test.ts` — start with empty DB; `POST /api/v1/import?dryRun=true` with retail-mini; assert response shape matches non-dry-run (same `imported.nodes`, `imported.edges` counts); then `GET /api/v1/stats` — assert all counts are `0`. Negative case: `POST /api/v1/import?dryRun=true` with a payload containing one invalid node + one valid node — assert `errors[]` carries the invalid row AND the DB remains empty afterwards |
| AC-28 | NFR-11 versioning policy documented | n/a (docs) | manual: open `README.md` and `.claude/CLAUDE.md`, assert each contains a paragraph stating "breaking changes increment to `/api/v2/`; `/api/v1/` is supported in parallel for at least three months" (or equivalent wording with the 3-month parallel-support commitment) |

## Platforms & Input Modes

This spec touches `pwa/` so the table is populated, but the PWA in this
spec is intentionally a connectivity placeholder — interactive graph
manipulation is deferred to `process-explorer-ui`. Rows reflect that.

| Surface | iPhone Safari (touch) | iPad Safari (touch + Apple Pencil) | macOS Safari (trackpad + keyboard) | macOS Chrome (mouse + keyboard) |
|---------|-----------------------|-------------------------------------|-------------------------------------|----------------------------------|
| PWA shell page load | yes | yes | yes | yes |
| `/api/v1/healthz` poll + connectivity banner | yes | yes | yes | yes |
| Display of node + edge counts from `/api/v1/stats` | yes | yes | yes | yes |
| Interactive graph rendering (pan/zoom/select) | no — out of scope, deferred to `process-explorer-ui` | no — deferred | no — deferred | no — deferred |
| Keyboard shortcuts | no — none in this spec | no | no | no |
| Drag/drop / gesture input | no | no | no | no |

## Native Conflicts

This spec ships only a static-shell PWA with a single status banner. It
intentionally introduces **no** gestures, scroll containers, keyboard
shortcuts, or focus traps. The row below is the explicit declaration
required by the workflow.

| Conflicting native behaviour | Affected surface | Suppression mechanism |
|------------------------------|------------------|------------------------|
| (none) | n/a | n/a |

When `process-explorer-ui` lands, its requirements doc must populate this
table (pinch-zoom on the graph canvas, two-finger pan, browser back-gesture
during deep-link nav, etc.).

## Dependencies

| Module/API | How it's affected |
|------------|-------------------|
| Neo4j 5.x Community Edition (docker image `neo4j:5-community`) | Primary store. Operator must have a Docker Compose v2-compatible container runtime — see Risks for the supported runtime matrix. |
| Bun 1.1+ | Runtime + bundler + test runner for the whole monorepo. |
| `neo4j-driver` (official JS) | Bolt client in the API workspace. |
| React 18 + Vite | PWA dev server + build tool. Locked at requirements time (HMR + TS support + small surface) so design doesn't re-litigate. |
| `zod` | Server-side payload validation library — **locked**, not "or equivalent". Single ecosystem choice keeps the API surface predictable for `ontology-manager`. |
| Docker Compose v2 (or Compose-compatible runtime) | Local Neo4j orchestration only — production deployment is out of scope. |
| `.claude/` spec-governance hooks (inherited) | Left in place; the inherited `_baseline` spec referencing the personal-assistant codebase is removed in FR-15. |

## Risks & Open Questions

1. **Graph rendering library choice deferred.** Whether `process-explorer-ui`
   uses Cytoscape.js, react-flow, sigma.js, or a custom d3-force renderer is
   out of scope here. This spec ships no interactive renderer — only a
   placeholder shell — so no commitment is made.
2. **Neo4j Community licence at scale.** Single-tenant retail org with
   tens-of-thousands of nodes is well within Community limits. If the graph
   later needs clustering, RBAC, or fine-grained property security, an
   Enterprise migration is its own spec.
3. **Bun runtime maturity for `neo4j-driver`.** The official JS driver is
   Node-targeted but exposes a Web-compatible API; design phase should
   confirm Bun compatibility (or fall back to Node via `bun --bun` /
   `bun --target=node` for the server). If incompatible, this is an early
   design-phase finding, not a requirements-phase blocker.
4. **Cypher passthrough safety.** Regex-based write detection is brittle.
   Design phase must choose between (a) parse-tree-based gating via a
   Neo4j-side stored procedure that runs only `CALL apoc.cypher.runRead`,
   or (b) running the bolt session in a strict read-only transaction. The
   latter is preferred.
5. **Schema evolution after this spec.** `ontology-manager` will introduce
   user-defined node + edge types. The constraint-bootstrap approach in
   FR-05 must be compatible with that — design should not over-fit to the
   six built-in labels (e.g., the constraint runner should iterate a
   registry, not hard-code six `CREATE CONSTRAINT` lines).
6. **`.claude/CLAUDE.md` rewrite scope.** The inherited file is ~70 KB of
   personal-assistant boilerplate. Design phase must decide whether to (a)
   wholesale-replace with a minimal companygraph stub now and grow it as
   features land, or (b) keep a longer authoritative doc from day one. AC-17
   pins the minimum content floor (companygraph title, four named H2
   sections, four follow-up specs cited).
7. **Container runtime matrix.** NFR-03 / FR-10 assume a Compose v2-compatible
   runtime, but Docker Desktop is no longer the only sane option (licensing on
   macOS for commercial use, sandbox isolation preferences). Design phase
   should validate the compose file against the runtimes the operator
   actually targets — Docker Desktop, OrbStack, colima, Podman 4+, Rancher
   Desktop — and the failure mode in `bun run dev` must be a clear
   "compose runtime not detected (tried: docker, orb, podman; see README §X)"
   not a cryptic `command not found`. Pinning to a single runtime is
   acceptable; silently assuming Docker Desktop is not.

## Traceability — user-story coverage

The `companygraph-user-stories.html` catalog (v0.1, 2026-05-22) assigns
14 stories to `graph-core`: API-1.x (discover/navigate the API), API-2.x
(read paths — query/export), API-3.x (write paths — ingestion), and
XC-1..XC-3 (cross-cutting concerns). The 40 remaining stories are owned
by the four downstream specs.

### Stories already covered by this spec

| Story | Covered by | Notes |
|-------|------------|-------|
| API-1.2 | NFR-05 + AC-20 | Consistent `{error:{code,message,details?}}` envelope across every 4xx/5xx. |
| API-1.3 | FR-06 (all routes under `/api/v1/`) | Versioned base path established; v1↔v2 parallel-support window is implicit (story AC-3 — see Gaps). |
| API-3.1 | FR-06 + NFR-04 + AC-08 | `/import` upserts by `id` (idempotent on re-run). |
| API-3.2 | FR-06 ("upserts by `id`; nodes and edges in the same payload may reference each other in any order") + design §4.3 | Two-phase ingestion + collect-and-continue per-row error surface. |
| XC-1.1 | FR-09 (PWA polls `/api/v1/healthz` on mount, on `visibilitychange→visible`, and every 30 s while visible) | This spec scopes XC-1.1 to the shell only; downstream specs must reuse the same polling contract. |
| XC-1.2 | FR-11 (`/api/v1/stats` — all keys present) + FR-09 (shell renders counts) | Counts surface in the placeholder shell; downstream specs render them in their own shells. |
| XC-2.1 | NFR-08 + AC-22 (no auth code paths in production sources) | Single-tenant, no user/session/tenant model. |
| XC-2.2 | NFR-06 + AC-10 + design §5.4 | Read-only Cypher passthrough via Neo4j's read-tx `AccessMode` gate (regex retired in design pass-1 C-04). |
| XC-3.1 | NFR-03 + AC-15 + FR-10 | Reproducible boot in <5 min on supported container runtimes. |

### Gaps closure (revision 4, 2026-05-22) — decision recorded

The spec owner's scope decision was: **accept the recommendation** —
add FR-16, FR-17, FR-18, FR-20, and NFR-11 to this spec; defer FR-19
(change feed + tombstones) to a small follow-on spec `graph-core-change-feed`.

| Story | Outcome |
|-------|---------|
| **API-1.1** | Closed by **FR-16 + AC-24** (OpenAPI 3.1 at `/api/v1/openapi.json`) |
| **API-2.1** | Closed by **FR-17 + AC-25** (bulk JSON export, round-trip-safe) |
| **API-2.2** | Closed by **FR-18 + AC-26** (NDJSON streaming export) |
| **API-2.3** | **Deferred** to `graph-core-change-feed` spec (FR-19 marked `deferred` for traceability) |
| **API-3.3** | Closed by **FR-20 + AC-27** (`?dryRun=true` on `/import`) |
| **API-1.3** (continuation) | Closed by **NFR-11 + AC-28** (v1↔v2 parallel-support policy ≥ 3 months) |

Design phase will bump to revision 3 to map these to file changes
(`api/src/routes/openapi.ts`, `api/src/routes/export.ts`, dry-run flag
threaded through `routes/import.ts`).

### Cross-cutting concerns mapped to downstream specs

XC-1.1, XC-1.2, XC-2.1, XC-2.2, XC-3.1 are stated as cross-cutting in
the user-story catalog. This spec lands them in the foundation; the four
downstream specs inherit them by reference (each spec's requirements.md
will cite the relevant FR/NFR/AC here rather than restate the
constraint).
