# companygraph

A single-tenant, self-hosted platform that models a retail
organisation's business processes as an attributed graph. Bun +
TypeScript monorepo with three workspaces, Neo4j 5 Community as the
store, REST API mounted under `/api/v1/`, React PWA shell on Vite.

This file is the project's architectural reference. Detailed
requirements + design + tasks live under `.claude/specs/`; this file
summarises what's true across all of them.

## Architecture

```
api/    ←→  Neo4j 5 Community  (docker-compose)
  │              ↑
  │              └─ bolt :7687, browser :7474
  │
  └─ Bun HTTP server on 127.0.0.1:8787 (NFR-02 loopback-only)
        │
        └─ All REST routes mounted under /api/v1/

pwa/    ←→  Vite dev server on 127.0.0.1:5173
              │
              └─ Proxies /api/v1/* to the API server

shared/      Workspace shared between api/ and pwa/
              (schema tuples, seed fixture, common types)
```

Three workspaces declared in the root `package.json` (`api/`, `pwa/`,
`shared/`), TypeScript transpiled by Bun (`bun build --no-bundle` is
the type-check; no `tsc` in the loop). Docker Compose v2 + a
compatible runtime (Docker Desktop, OrbStack, colima, Podman 4+,
Rancher Desktop) bring up Neo4j; `scripts/runtime-detect.sh` picks the
correct compose binary at `bun run dev` time.

The API is single-tenant by design (NFR-08): no user model, no auth,
no session, no tenant boundary. The server binds to `127.0.0.1` so the
absence of auth is not internet-exposed.

## Schema

**Six node labels** (compile-time const in `shared/src/schema/nodes.ts`,
runtime-mutable after `ontology-manager` lands):

`Domain`, `UserJourney`, `Activity`, `Role`, `System`, `Location`.

Every node carries `id` (UUIDv7, server-generated), `name`,
`description`, `createdAt`, `updatedAt`, and an open `attributes` JSON
map (stored as `attributes_json` STRING in Neo4j; parsed at the REST
boundary).

**Six edge types** (`shared/src/schema/edges.ts`):

| Type | Endpoints |
|------|-----------|
| `PART_OF` | Journey→Domain, Activity→Journey, Location→Location (hierarchy) |
| `EXECUTES` | Role→Activity |
| `USES_SYSTEM` | Activity→System |
| `AT_LOCATION` | Activity→Location |
| `PRECEDES` | Activity→Activity (ordered process flow) |
| `INTEGRATES_WITH` | System→System |

The `EDGE_ENDPOINTS` matrix in `shared/src/schema/edges.ts` is the
authoritative `(type, fromLabel, toLabel)` whitelist — 9 positive
combinations across the 6 types × 36 label pairs (216 total). The
edge-write validator iterates this matrix; pair-mismatches return
`400 edge_endpoint_label_mismatch`.

**Storage primitives** (per `graph-core/design.md` §4):

- `createNode` / `createEdge` — strict CREATE, returns `409 id_conflict` on a duplicate client-supplied id.
- `patchNode` — partial SET, dynamic SET clause; omitted fields are never clobbered.
- `upsertNode` / `upsertEdge` — MERGE-on-id, used ONLY by `/api/v1/import` and the seed loader.

Cross-type edge-id uniqueness is enforced at create time (design-review
C-10): the validator runs `EXISTS { MATCH ()-[r {id:$id}]-() }` across
all 6 types before accepting a new edge id.

## Development

**Runtime**: Bun 1.1+ (binary at `/Users/frank/.bun/bin/bun`).
**Bot framework**: n/a — this is a graph platform, not a chat bot.
**Transpile**: `bun build api/src/server.ts --no-bundle > /dev/null`
(plus PWA equivalent). No `tsc`.

**One-command boot** (NFR-03 / AC-15):

```bash
bun install              # installs all workspace deps + Bun lockfile
bun run dev              # detects compose runtime, brings up Neo4j,
                         # waits for health, starts API + PWA with hot reload
```

`bun run stop` tears down docker-compose.
`bun run seed` loads `shared/seed/retail-mini.json` via `POST /api/v1/import`.
`bun run schema:apply` (re-)applies the Neo4j constraints + indexes idempotently.

**Tests**: two test suites with two CI jobs.

```bash
bun test                 # unit tests — *.test.ts (excludes *.integration.test.ts)
bun test:integration     # integration tests — *.integration.test.ts
                         # (needs Neo4j running, either via `bun run dev`
                         #  or the CI services: neo4j sidecar)
```

CI runs both jobs against every PR — see `.github/workflows/ci.yml`.
Both jobs gate merge; full CI in <5 min on `ubuntu-latest`.

**Coding conventions**:

- en-US spelling in identifiers (`neighbors`, `color`, `behavior`); en-GB acceptable in prose.
- `zod` is the only validation library (locked, not "or equivalent").
- No `tsc` step.
- No auth code paths (NFR-08 / AC-22). The `api/__tests__/no-auth-grep.test.ts` test enforces this.

## Follow-up specs

`graph-core` is the foundation. Four downstream specs build on it,
each owning a distinct surface:

| Spec | Persona | Surface | Stories |
|------|---------|---------|---------|
| **ontology-manager** | P1 Maya (Ontology Author) | REST CRUD for runtime-mutable schema; owns `/api/v1/schema` + `/api/v1/ontology/events` (SSE) | OA-1..OA-3 (10) |
| **process-explorer-ui** | P2 Ravi (Process Explorer), P5 Priya (Domain SME) | Interactive PWA — drill-down, search, canvas, SME write paths | PE-1..PE-3, SME-1..SME-3 (18) |
| **chat-interface** | P3 Lin (Chat User) | NL → Cypher → grounded answer with cited deep-links | CU-1..CU-3 (9) |
| **cto-analytics** | P4 Karim (CTO/Analyst) | System map, complexity scoring, AI-leverage candidates, PDF exec summary | AN-1..AN-3 (8) |

User stories source: `companygraph-user-stories.html` (v0.1,
2026-05-22). Each downstream spec's `requirements.md` enumerates the
specific stories it owns. The four specs are sequenced so that
`ontology-manager` lands first (runtime schema unblocks the others);
`process-explorer-ui` is the largest in scope and lands second;
`chat-interface` + `cto-analytics` can run in parallel last.

## Versioning

REST API versioning policy (NFR-11):

- All routes are mounted under `/api/v1/`. No root-level routes.
- The OpenAPI 3.1 schema at `GET /api/v1/openapi.json` is the single
  source of truth for the v1 contract (FR-16) — generated at server
  boot from the same `zod` definitions used at runtime. No hand-maintained copy.
- Additive changes (new endpoints, optional fields, new error codes)
  ship under `/api/v1/` without bumping the version.
- **Breaking changes increment to `/api/v2/`**, and the previous
  version stays supported in parallel for **at least three months**.
  During the overlap, both `/api/v1/openapi.json` and
  `/api/v2/openapi.json` are served; `Sunset` HTTP headers on `/api/v1/`
  responses carry the deprecation date.
- The `ERROR_CODES` enum (`api/src/errors.ts`) is closed and asserted
  exhaustive — adding a code is a non-breaking additive change; removing
  one is a breaking change that requires a `/api/v2/` bump.

## Reference

| Resource | Location |
|----------|----------|
| Approved spec | `.claude/specs/graph-core/{requirements,design,tasks}.md` |
| Downstream specs | `.claude/specs/{ontology-manager,process-explorer-ui,chat-interface,cto-analytics}/` |
| User stories | `companygraph-user-stories.html` |
| Spec workflow skill | `.claude/skills/spec-workflow/SKILL.md` (read before invoking `/spec`) |
| Spec review skill | `.claude/skills/spec-review/SKILL.md` |
| Environment template | `.env.example` (NEO4J_USER, NEO4J_PASSWORD, HOST, API_PORT) |
| Key ports | 7687 (Neo4j bolt), 7474 (Neo4j browser), 8787 (API), 5173 (PWA dev) |
| Workspaces | `api/`, `pwa/`, `shared/` |
| Container runtime detector | `scripts/runtime-detect.sh` |
