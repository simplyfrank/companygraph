---
feature: "_baseline"
created: "2026-07-04"
author: "spec-adopt (as-built audit)"
status: "approved"
approved_by: "frank"
approved_at: "2026-07-04"
revision: 1
reviewing_requirements_revision: 1
reviewing_design_revision: 1
size: "large"
total_tasks: 16
---

# Tasks: _baseline (ratification)

## Reading guide

Baseline tasks are **ratify** entries: each confirms an as-built capability
against its AC's verification artifact. Nothing here builds new behavior. The
one mutating task is T-16 (delete the retired no-auth guard test, DD-07).

## Task list

### T-01 — Ratify graph store + schema registries
- **Covers**: FR-01, AC-01
- **Verification**: api/__tests__/schema.integration.test.ts

### T-02 — Ratify REST surface + OpenAPI
- **Covers**: FR-02, AC-02
- **Verification**: api/__tests__/openapi.integration.test.ts

### T-03 — Ratify CRUD + import/export primitives
- **Covers**: FR-03, AC-03
- **Verification**: api/__tests__/export-import-roundtrip.integration.test.ts

### T-04 — Ratify query surface (passthrough, caps, search)
- **Covers**: FR-04, AC-04
- **Verification**: api/__tests__/cypher-passthrough.integration.test.ts

### T-05 — Ratify auth/RBAC/tenancy
- **Covers**: FR-05, AC-05
- **Verification**: api/__tests__/auth-oauth.test.ts

### T-06 — Ratify Postgres layer + change/risk routes
- **Covers**: FR-06, FR-09, AC-06, AC-09 (typed CRUD: FR-10)
- **Verification**: manual: with docker-compose postgres up, run migrations then `curl 127.0.0.1:8787/api/v1/change-requests` — expect 200 JSON list and clean migration log

### T-07 — Ratify KPI/SLA governance
- **Covers**: FR-07, AC-07
- **Verification**: manual: `curl 127.0.0.1:8787/api/v1/kpis` + `/api/v1/slas` — expect 200 envelopes; invalid POST — expect 400

### T-08 — Ratify OKR + roll-down
- **Covers**: FR-08, AC-08
- **Verification**: manual: seed OKRs, `curl 127.0.0.1:8787/api/v1/roll-down?domain=<id>` — expect aggregated progress per child journey

### T-09 — Ratify typed domain/journey CRUD + versions
- **Covers**: FR-10, AC-09
- **Verification**: manual: `curl -X POST 127.0.0.1:8787/api/v1/domains` valid body — expect 201 + UUIDv7; GET versions — expect ordered list

### T-10 — Ratify ontology manager surface
- **Covers**: FR-11, AC-10
- **Verification**: api/__tests__/ontology-routes.integration.test.ts

### T-11 — Ratify chat interface
- **Covers**: FR-12, AC-11
- **Verification**: api/__tests__/chat/ (bun test suite directory)

### T-12 — Ratify process explorer PWA
- **Covers**: FR-13, AC-12
- **Verification**: pwa/src/__tests__/domain-index.test.tsx

### T-13 — Ratify analytics + exec views
- **Covers**: FR-14, AC-13
- **Verification**: manual: open `#/analytics/overview` + `#/exec/finance` with stack up (mouse) — expect populated charts, no console errors

### T-14 — Ratify PWA shell (routing, SW, tokens)
- **Covers**: FR-15, AC-14
- **Verification**: pwa/playwright/sw-degradation.spec.ts

### T-15 — Ratify dev/ops infrastructure
- **Covers**: FR-16, AC-15; NFR-01, NFR-02, NFR-04 debt recorded
- **Verification**: manual: `bun run dev` from clean checkout — expect neo4j+postgres healthy, API+PWA served; `bun run typecheck` — expect exit 0

### T-16 — Retire the no-auth guard test (DD-07)
- **Files** (1): `api/__tests__/no-auth-grep.test.ts` (delete)
- **Covers**: NFR-03, AC-05 context
- **Verification**: manual: run `bun test` — expect no `AC-22 no-auth-grep` failure present; auth suite api/__tests__/auth-oauth.test.ts still green

## Validation checkpoints

| After | Run |
|-------|-----|
| T-16 | `bun run typecheck` + `bun test` (unit suite) |
| all | `scripts/spec/spec-traceability.sh .claude/specs/_baseline` — expect exit 0 |
