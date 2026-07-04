---
feature: "_baseline"
created: "2026-07-04"
author: "spec-adopt (as-built audit)"
status: "approved"
approved_by: "frank"
approved_at: "2026-07-04"
revision: 1
reviewing_requirements_revision: 1
size: "large"
---

# Design: _baseline (as-built)

## 1. Overview

This is descriptive architecture documentation of the system as it stands —
not a design for new work. Its File Changes table doubles as the spec-guard
coverage map: every path prefix listed here is baseline-governed, meaning
pre-existing code can be maintained without a new spec, while genuinely new
surfaces still require `/spec new`.

```
pwa/ (Vite+React, hash routes)  ──/api/v1/*──►  api/ (Bun, 127.0.0.1:8787)
                                                  │  router.ts: OAuth session →
                                                  │  RBAC permission → route
                                                  ├── Neo4j 5      (graph: ontology, domains,
                                                  │                 journeys, OKR, KPI links)
                                                  ├── Postgres     (change-requests, risk-register,
                                                  │                 kpi-measurements, sla-breaches)
                                                  └── SQLite       (chat persistence, bun:sqlite)
shared/ (schema registries, seed fixtures, common types)
```

## 2. Design Decisions (as-built, load-bearing)

| ID | Decision | Covers |
|----|----------|--------|
| DD-01 | **Three datastores with per-route ownership.** Neo4j is the graph of record; Postgres holds tabular governance facts (measurements, breaches, registers, change requests); SQLite holds chat threads. No cross-store transactions — routes own exactly one store each, except KPI/SLA which link graph nodes to Postgres rows by id. | FR-01, FR-06, FR-07, FR-09, FR-12 |
| DD-02 | **Auth enforced centrally in the router.** `api/src/router.ts` rejects every non-public request (401 no/unknown session, 403 missing permission) before dispatch, then attaches `req.user`. Route handlers assume an authenticated, permission-checked caller. JWT verification is jose+JWKS when `ONELOGIN_*` issuer configured; dev fallback otherwise. | FR-05 |
| DD-03 | **Registry-driven schema, runtime-mutable.** Compile-time tuples in `shared/src/schema/` (18 labels / 12 edge types as-built) + ontology-manager runtime mutations; validators, OpenAPI, and seed all read the registries. | FR-01, FR-02, FR-11 |
| DD-04 | **zod at every boundary; OpenAPI generated, never hand-written.** | FR-02 |
| DD-05 | **Design-token UI.** All PWA styling via `var(--…)` from tokens.css; CSS-Module components; `scripts/design-conformance.ts` is the mechanical gate. | FR-13, FR-14, FR-15 |
| DD-06 | **Accepted debt (do not build on):** Kafka consumer orphan (`api/src/ingest/` — never imported/started), Redis session stub (in-memory fallback), phantom `better-sqlite3` dep. Removing each is a small follow-up spec. | NFR-04 |
| DD-07 | **Retired invariant:** graph-core's NFR-08/AC-22 no-auth rule. Its guard test `api/__tests__/no-auth-grep.test.ts` is deleted by this adoption; auth is governed capability FR-05. | NFR-03, FR-05 |

## 3. Subsystem map (all FRs → modules)

| Subsystem | Modules | Serves |
|-----------|---------|--------|
| HTTP core | `api/src/server.ts`, `api/src/router.ts`, `api/src/env.ts`, `api/src/errors.ts`, `api/src/validate.ts`, `api/src/ids.ts`, `api/src/logging.ts`, `api/src/metrics.ts`, `api/src/resilience.ts`, `api/src/shutdown.ts` | FR-02, FR-16 |
| Graph storage | `api/src/neo4j/` | FR-01, FR-03 |
| Routes (all REST) | `api/src/routes/` | FR-02, FR-03, FR-04, FR-06, FR-07, FR-08, FR-09, FR-10, FR-11 |
| Auth/RBAC | `api/src/auth/`, `api/src/middleware/` | FR-05 |
| Postgres layer | `api/src/storage/` | FR-06, FR-07, FR-09 |
| Ontology engine | `api/src/ontology/` | FR-11 |
| Chat | `api/src/chat/` | FR-12 |
| Ingest (orphan) | `api/src/ingest/` | NFR-04 (debt) |
| API utilities | `api/src/scripts/`, `api/scripts/` | FR-16 |
| Shared registries | shared/src (schema + index/types — see §4 for the exact coverage rows) | FR-01, FR-07 |
| PWA | pwa/src (views, components, data, lib, hooks, store, styles — see §4 for the exact coverage rows) | FR-13, FR-14, FR-15 |
| Dev/ops | `docker-compose.yml`, `scripts/`, root `package.json` | FR-16 |

## 4. File Changes (as-built coverage map)

<!-- Path prefixes below are the spec-guard baseline coverage tokens. -->

<!-- Deliberately NO bare workspace-root catch-all rows (api/src, pwa/src,
     shared/src, unticked on purpose — the spec-guard treats every backticked
     path in this file as a coverage prefix, comments included): a catch-all
     would make every future file under those roots baseline-covered and
     defang the guard. New subsystems (a new directory under a workspace src
     root) therefore require a new spec. Loose top-level files are enumerated
     explicitly. -->

| Path | Action | Serves |
|------|--------|--------|
| `api/src/server.ts` `api/src/router.ts` `api/src/env.ts` `api/src/errors.ts` `api/src/validate.ts` `api/src/ids.ts` `api/src/logging.ts` `api/src/metrics.ts` `api/src/resilience.ts` `api/src/shutdown.ts` `api/src/create-entity-labels.ts` | as-built | FR-02, FR-16 |
| `api/src/auth/` | as-built | FR-05 |
| `api/src/middleware/` | as-built | FR-05 |
| `api/src/routes/` | as-built | FR-02, FR-03, FR-04, FR-06, FR-07, FR-08, FR-09, FR-10, FR-11 |
| `api/src/storage/` | as-built | FR-06 |
| `api/src/neo4j/` | as-built | FR-01, FR-03 |
| `api/src/ontology/` | as-built | FR-11 |
| `api/src/chat/` | as-built | FR-12 |
| `api/src/ingest/` | as-built (orphan, NFR-04) | NFR-04 |
| `api/src/scripts/` | as-built | FR-16 |
| `api/scripts/` | as-built | FR-16 |
| `shared/src/schema/` `shared/src/index.ts` `shared/src/types.ts` | as-built | FR-01, FR-07 |
| `pwa/src/views/` `pwa/src/components/` `pwa/src/data/` `pwa/src/lib/` `pwa/src/hooks/` `pwa/src/store/` `pwa/src/styles/` `pwa/src/api/` | as-built | FR-13, FR-14, FR-15 |
| `pwa/src/App.tsx` `pwa/src/App.module.css` `pwa/src/main.tsx` `pwa/src/route.ts` `pwa/src/api.ts` `pwa/src/useFetch.ts` | as-built | FR-15 |
| `pwa/public/` | as-built | FR-15 |
| `scripts/` | as-built | FR-16 |
| `docker-compose.yml` | as-built | FR-16 |
| `api/__tests__/no-auth-grep.test.ts` | **delete** (DD-07) | NFR-03 |

## 5. Test strategy

As-built coverage: unit suites (`bun test`) for auth, ontology envelopes,
resilience, URL guards, chat; integration suites (`bun test:integration`,
Neo4j required) for CRUD/import/export/query/ontology (AC-01..AC-04, AC-10);
PWA vitest suites + Playwright for explorer/shell (AC-12, AC-14). Postgres-
backed surfaces (AC-06..AC-09) and exec/analytics views (AC-13) have **no
automated coverage** — manual procedures recorded per AC; automated backfill
belongs to the follow-up specs per surface.

## 6. Rejected alternatives

- **Revert to the 2026-05-23 spec-compliant tree** — rejected by the user
  2026-07-04 (destroys ~8,500 lines of product direction).
- **Backfill fine-grained specs before governance** — rejected: weeks of
  ungoverned interim. Baseline first, then per-surface backfill specs.
