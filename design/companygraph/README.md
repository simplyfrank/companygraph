# companygraph

A single-tenant, self-hosted platform that models a retail organisation's
business processes as an attributed graph (Bun + TypeScript + React PWA +
Neo4j 5).

This repository is the foundation spec (`graph-core`) — schema, ingestion
+ query API, base PWA shell. Interactive graph exploration, ontology
management, natural-language chat, and CTO analytics live in four
follow-up specs.

---

## Quickstart

You need:

- **Bun** 1.1+ (`https://bun.sh`)
- A **Compose-compatible container runtime**, any one of:
  Docker Desktop · OrbStack · colima · Podman 4+ · Rancher Desktop
- Either macOS or Linux (Windows untested)

```bash
cp .env.example .env             # adjust password if you like
bun install
bun run dev                      # boots Neo4j + API + PWA dev server
```

Within ~5 min (excluding the first Neo4j image pull) you should see:

- `http://127.0.0.1:8787/api/v1/healthz` → `{"ok":true,…}`
- `http://127.0.0.1:5173/` → green "Connected" banner with node + edge counts

Optional: `bun run seed` loads the retail-mini fixture (4 domains, 8
journeys, 32 activities, 6 roles, 6 systems, 4 locations).

To tear down: `bun run stop`.

---

## Layout

```
companygraph/
├─ api/        # Bun HTTP server, Neo4j storage, route handlers
├─ pwa/        # React + Vite PWA shell (placeholder in graph-core)
├─ shared/     # zod schemas, types, seed fixture
├─ scripts/    # runtime-detect.sh, wait-for-neo4j.sh
├─ docker-compose.yml
└─ .github/workflows/ci.yml
```

API surface lives under `/api/v1/*` (see `api/src/router.ts`). OpenAPI 3.1
schema served at `GET /api/v1/openapi.json`.

---

## Development

- `bun run typecheck` — transpile-only check across api/ + pwa/ (no `tsc`).
- `bun run test` — unit tests (do not need a live Neo4j).
- `bun run test:integration` — integration tests; require `bun run dev` to
  be running, or are exercised by the GitHub Actions `integration` job
  with a Neo4j sidecar.

---

## Conventions

- **en-US spelling for identifiers** (`neighbors`, `color`). Prose
  (comments, docs) may use en-GB.
- **All routes mounted under `/api/v1/`** — no root-level paths.
- **No auth, intentionally.** API binds to `127.0.0.1` by default.

---

## Versioning policy (NFR-11)

Breaking changes to the API increment the URL prefix to `/api/v2/`. After
`/api/v2/` is published, `/api/v1/` is supported in parallel for **at
least three months** before removal. Non-breaking changes (added optional
fields, new endpoints under the existing prefix) do not trigger a version
bump.

---

## Follow-up specs

Each lives under `.claude/specs/<name>/` and depends on `graph-core`:

- `ontology-manager` — entity/attribute CRUD, versioning, external alignment
- `process-explorer-ui` — interactive graph canvas, drill-down, filters
- `chat-interface` — natural-language Q&A over the graph
- `cto-analytics` — domain↔service alignment, complexity metrics, AI optimisation

A `graph-core-change-feed` follow-on spec covers the deferred `GET /api/v1/changes?since=:iso` endpoint with tombstones.
