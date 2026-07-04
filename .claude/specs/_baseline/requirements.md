---
feature: "_baseline"
created: "2026-07-04"
author: "spec-adopt (as-built audit)"
status: "approved"
approved_by: "frank"
approved_at: "2026-07-04"
revision: 1
size: "large"
---

# Requirements: _baseline (as-built)

## Summary

Reverse-documentation of the companygraph system **as it exists in the working
tree on 2026-07-04**, adopted per the user's 2026-07-04 decision to keep the
post-2026-05-23 expansion (see
`.claude/specs/ARCHITECTURE-REVIEW-2026-06-30.md`). This spec is descriptive,
not aspirational: each FR names a capability that is already built; each AC's
Verification points at an existing test or a written manual procedure. It
exists so pre-existing code is governed by the spec-guard — new behavior goes
in new specs, never here.

**Adoption decision recorded here:** the original NFR-08 "no auth code paths"
invariant (graph-core AC-22) is **retired**. The as-built system is a
multi-tenant, OAuth/RBAC-secured governance suite on three datastores (Neo4j +
Postgres + SQLite). `api/__tests__/no-auth-grep.test.ts` is deleted as part of
this adoption.

## Motivation

Between 2026-05-23 and 2026-06-30 the system expanded far beyond its specs
(~8,500 lines uncommitted): auth/RBAC/tenancy, KPI/SLA/OKR governance,
risk/compliance, a Postgres storage layer, and exec/analytics PWA views. The
user chose **adopt** over revert. Governance requires a baseline spec that
makes the as-built system the governed starting point.

## Functional Requirements

### Graph core (as specced, still true)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | **Graph store + registry-driven schema** — Neo4j 5 Community holds the process graph. Node labels and edge types are declared as registry tuples in `shared/src/schema/nodes.ts` / `edges.ts` — as-built: **18 node labels, 12 edge types** (grown from the original 6+6 by persona/KPI-SLA additions). Constraints + indexes bootstrap idempotently. | must | graph-core + drift |
| FR-02 | **REST API under `/api/v1/`** — Bun HTTP server, all routes mounted under `/api/v1/`, zod-validated at the boundary, OpenAPI 3.1 served at `GET /api/v1/openapi.json` generated from the same zod definitions. | must | graph-core FR-16 |
| FR-03 | **CRUD + storage primitives** — createNode/patchNode/upsertNode, createEdge/upsertEdge with the EDGE_ENDPOINTS whitelist; bulk import/export (JSON + NDJSON) with two-phase collect-and-continue; seed loaders. | must | graph-core |
| FR-04 | **Query surface** — read-only Cypher passthrough (native read-transaction gate + caps), query service, per-label fulltext search helper. | must | graph-core |

### Adopted expansion (previously ungoverned)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-05 | **Auth / RBAC / tenancy** — OneLogin OAuth (`ONELOGIN_*` env), JWT signature-verified via jose+JWKS when an issuer is configured (dev-mode fallback skips verification when unset); sessions with `roles, storeAccess, personaAssignments, rbacRoles, permissions`; router enforces 401/403 on every non-public route and attaches `req.user`; store/domain access gating (`hasStoreAccess`, `hasDomainAccess`). Redis session backing is a stub that falls back to in-memory. | must | drift (api/src/auth/, api/src/middleware/, router.ts) |
| FR-06 | **Postgres storage layer** — `pg` pool client + 5 SQL migrations under `api/src/storage/postgres/`; system of record for change-requests, risk-register, kpi-measurements, sla-breaches. `postgres` service in docker-compose. | must | drift |
| FR-07 | **KPI / SLA governance** — routes `kpi-crud`, `kpi-measurements`, `kpi-trends`, `kpi-sla-alignment`, `sla-crud`, `sla-breaches`, `sla-compliance`; shared schema `shared/src/schema/kpi-sla.ts`. Data split across Postgres (measurements/breaches) + Neo4j (graph links). | must | drift |
| FR-08 | **OKR + roll-down** — routes `okr-crud`, `roll-down`; Neo4j-backed objective/key-result modelling with roll-down across the domain/journey hierarchy. | must | drift |
| FR-09 | **Risk / compliance / change management** — routes `risk-register`, `risk-compliance`, `compliance-rules`, `change-requests` (Postgres-backed). | must | drift |
| FR-10 | **Typed domain/journey CRUD + versioning** — routes `domain-crud`, `journey-crud`, `journey-versions` (Neo4j). | must | drift |
| FR-11 | **Ontology manager surface** — runtime-mutable schema CRUD, SSE change events, audit + retention, migrations, glossary, bounded contexts, proposals, RDF import/export, snapshots. | must | ontology-manager + drift extras |
| FR-12 | **Chat interface** — NL → Cypher → grounded answer with role-prompt library (`api/src/chat/roles/prompts/`), SQLite (`bun:sqlite`) persistence. | must | chat-interface |

### PWA (as-built surface)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-13 | **Process explorer** — domain/journey/activity/system/role/location drill-down, search palette, journey canvas + board, path finder, SME write paths (add/review/quarterly), interactive ERD. | must | process-explorer-ui |
| FR-14 | **Analytics + exec views** — analytics overview/complexity/matrix/AI-candidates (`pwa/src/views/analytics/`) and exec finance/ops/risk/transform (`pwa/src/views/exec/`). Built off-spec from cto-analytics; adopted as-built. | must | cto-analytics (partial) + drift |
| FR-15 | **PWA shell** — Vite + React, hash routing (`pwa/src/route.ts`), service-worker degradation, design-token styling (`var(--…)` from tokens.css) with CSS-Module component library. | must | graph-core + process-explorer-ui |

### Operations

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-16 | **Dev/ops infrastructure** — docker-compose (neo4j + postgres), runtime detection, one-command boot (`bun run dev`), `bun run typecheck` (no tsc), split unit/integration test suites, logging/metrics/resilience/shutdown modules, seed fixtures. | must | graph-core + drift |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | Server binds loopback `127.0.0.1:8787` (auth now exists, but the loopback posture is retained as-built). | graph-core NFR-02 |
| NFR-02 | zod is the only validation library; no tsc in the loop; en-US identifiers. | house rules |
| NFR-03 | **Retired:** the former NFR-08 "no auth code paths". Auth is now a governed capability (FR-05). | this adoption |
| NFR-04 | Known debt, accepted as-built: Kafka consumer orphan (`api/src/ingest/`, never started, no `kafkajs` dep), Redis session stub (interface, no client), phantom `better-sqlite3` dep (code uses `bun:sqlite`). Removal requires its own small spec. | ARCHITECTURE-REVIEW §3/§5 |

## Scope Boundaries

**In scope:** everything present in the working tree on 2026-07-04, as
documentation + governance coverage.
**Out of scope:** any new behavior (new specs); fixing the known debt in
NFR-04; committing the working tree (a user git action); backfill of
fine-grained specs for the adopted surfaces (follow-up specs, tracked in
PROJECT-ROLLUP).

## Acceptance Criteria

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | Schema registries load and constraints bootstrap idempotently (FR-01) | server (bun test + Neo4j) | api/__tests__/schema.integration.test.ts |
| AC-02 | OpenAPI 3.1 served and matches the zod-defined routes (FR-02) | server (curl/bun test) | api/__tests__/openapi.integration.test.ts |
| AC-03 | Node/edge CRUD + import/export round-trips (FR-03) | server (bun test + Neo4j) | api/__tests__/export-import-roundtrip.integration.test.ts |
| AC-04 | Cypher passthrough enforces read-only + caps; search returns grouped hits (FR-04) | server (bun test + Neo4j) | api/__tests__/cypher-passthrough.integration.test.ts |
| AC-05 | OAuth session parsing, RBAC permission resolution, 401/403 enforcement (FR-05) | server (bun test) | api/__tests__/auth-oauth.test.ts |
| AC-06 | Postgres migrations apply and Postgres-backed routes read/write (FR-06, FR-09) | server (CLI) | manual: with docker-compose postgres up, run `bun --cwd api src/storage/postgres/run-migrations.ts` then `curl 127.0.0.1:8787/api/v1/change-requests` — expect 200 JSON list, no migration errors logged |
| AC-07 | KPI/SLA endpoints respond with zod-validated payloads (FR-07) | server (CLI) | manual: `curl 127.0.0.1:8787/api/v1/kpis` and `/api/v1/slas` with a seeded store — expect 200 envelopes; POST an invalid body — expect 400 validation error |
| AC-08 | OKR roll-down aggregates across the domain hierarchy (FR-08) | server (CLI) | manual: seed OKRs, `curl 127.0.0.1:8787/api/v1/roll-down?domain=<id>` — expect aggregated key-result progress per child journey |
| AC-09 | Typed domain/journey CRUD + versions endpoints respond (FR-10) | server (CLI) | manual: `curl -X POST 127.0.0.1:8787/api/v1/domains` with a valid body — expect 201 + UUIDv7 id; GET journey versions — expect ordered version list |
| AC-10 | Ontology CRUD, SSE events, audit retention behave as shipped (FR-11) | server (bun test + Neo4j) | api/__tests__/ontology-routes.integration.test.ts |
| AC-11 | Chat produces grounded answers with SQLite persistence (FR-12) | server (bun test) | api/__tests__/chat/ |
| AC-12 | Explorer drill-down, deep links, and SME writes work (FR-13) | macOS Chrome/Safari (mouse+kb), iPad Safari (touch) | pwa/src/__tests__/domain-index.test.tsx |
| AC-13 | Analytics + exec views render from live API data (FR-14) | macOS Chrome (mouse+kb) | manual: open `#/analytics/overview` and `#/exec/finance` with the stack up — expect populated charts/cards, no console errors |
| AC-14 | Shell routing + SW degradation survive reload/offline (FR-15) | macOS Chrome (mouse+kb) | pwa/playwright/sw-degradation.spec.ts |
| AC-15 | One-command boot brings up neo4j+postgres+api+pwa; typecheck green (FR-16) | CLI | manual: `bun run dev` from clean checkout — expect both stores healthy and API/PWA served; `bun run typecheck` — expect exit 0 |

## Platforms & Input Modes

As-built PWA targets desktop-first browsers; touch support exists on explorer
views (per process-explorer-ui's tables, which remain authoritative for those
views). This baseline adds no new input handling.

| Surface | Touch | Mouse | Trackpad | Keyboard | Notes |
|---------|-------|-------|----------|----------|-------|
| Explorer views | yes | yes | yes | yes | governed by process-explorer-ui spec |
| Analytics/exec views | no | yes | yes | partial | as-built; keyboard nav incomplete |

## Native Conflicts

| Native behavior | Conflicts with | Suppression |
|-----------------|----------------|-------------|
| (none — baseline adds no new gesture/keyboard handling) | n/a | n/a |

## Dependencies

Neo4j 5 (bolt 7687), Postgres (docker-compose), Bun 1.1+, OneLogin OAuth
(`ONELOGIN_*` env — dev fallback when unset), jose/JWKS, pg, bun:sqlite.

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | Dev-mode JWT fallback (no issuer → verification skipped) | auth bypass if deployed unset | guard before any non-dev deploy; candidate first backfill spec |
| 2 | Business data split across Postgres + Neo4j undercuts "everything is a node/edge" | analytics/chat queries can miss Postgres-side facts | document per-route store ownership in follow-up specs |
| 3 | Working tree still uncommitted (~270 entries) | one bad `git clean` loses the system | user to commit; CI will then gate via scripts/spec/spec-coverage.sh |
