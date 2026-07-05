---
feature: "kpi-measurement-alignment"
created: "2026-07-05"
author: "spec-author"
status: "draft"
revision: 1
reviewing_requirements_revision: 1
reviewing_design_revision: 1
size: "large"
total_tasks: 12
---

# Tasks: kpi-measurement-alignment

## Reading guide

- **Order**: tasks execute top-to-bottom. Dependencies are explicit
  (`Blocks` / `Blocked by`); no out-of-order execution.
- **Verification**: every task declares a concrete test path or
  `manual: <one-line repro with input mode + observable outcome>`.
- **Complexity**: `simple` (≤30 min mechanical), `moderate` (≤2 h with one
  judgment call), `complex` (≤half-day, multiple judgment calls).
- **Validation checkpoint**: after every task, run `bun run typecheck`; after
  tasks that ship behaviour, also run the listed test. Tasks touching
  `pwa/src/views/` or `pwa/src/components/` additionally run
  `bun run scripts/design-conformance.ts --view <file>`.

## Task list

### T-01 — Add PARAM_BINDS edge type + retire CONTRIBUTES_TO KPI endpoints

- **Files** (2): `shared/src/schema/edges.ts` (modify), `shared/src/schema/kpi-sla.ts` (modify)
- **Implements**: design §2.3, §2.4 — closes AC-07 (edge type prerequisite)
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-03, T-04
- **Steps**:
  1. In `shared/src/schema/edges.ts`: add `"PARAM_BINDS"` to `EDGE_TYPES` array; add `PARAM_BINDS` entry to `EDGE_ENDPOINTS` with pairs `[["KPI","Activity"],["KPI","UserJourney"],["KPI","System"],["KPI","Domain"]]`; set `CONTRIBUTES_TO` to `[]` (empty array — edge type stays in EDGE_TYPES for backward compat, but no new KPI→entity pairs allowed).
  2. In `shared/src/schema/kpi-sla.ts`: add `paramBindingSchema` (z.object with `id`, `kpi_id`, `target_type` enum, `target_id`, `parameter` enum ["target_value","warning_threshold","critical_threshold"], `attribute_path` string, `created_at`), `paramBindingCreateRequestSchema` (omit id/created_at), and export types.
- **Verification**: `bun run typecheck`

### T-02 — Dual-write Neo4j :KPIMeasurement in REST measurement handler

- **Files** (1): `api/src/routes/kpi-measurements.ts` (modify)
- **Implements**: design §3.1, §3.2 — closes AC-01, AC-02, AC-03
- **Complexity**: moderate
- **Blocked by**: —
- **Blocks**: T-09
- **Steps**:
  1. Import `getDriver` from `../neo4j/driver` and `metrics` from `../metrics`.
  2. In `handleKpiMeasurementPost`: after the Postgres INSERT + queryOne, add a Neo4j session that `CREATE (m:KPIMeasurement {id, kpi_id, measured_at, value, context, source, created_at})` with the same values. Wrap in try/catch — log Neo4j failure but don't fail the request (Postgres is confirmed). Increment `kpi_measurements_ingested_total{source="rest"}`.
  3. In `handleKpiMeasurementDelete`: after the Postgres DELETE, add `MATCH (m:KPIMeasurement {id: $id}) DETACH DELETE m` in a Neo4j session. Try/catch — log failure, don't fail.
  4. `GET` handlers remain unchanged (still read Postgres per FR-03).
- **Verification**: `api/__tests__/kpi-measurement-dual-write.integration.test.ts`

### T-03 — Rewrite performance aggregate filters to use ALIGNED_TO

- **Files** (1): `api/src/routes/performance.ts` (modify)
- **Implements**: design §2.2 — closes AC-04, AC-05
- **Complexity**: moderate
- **Blocked by**: T-01
- **Blocks**: T-09
- **Steps**:
  1. Replace `DOMAIN_FILTER` const: remove `k.domain_id = $domain` branch and `CONTRIBUTES_TO` traversal; use `ALIGNED_TO` traversal: `AND EXISTS { MATCH (k)-[:ALIGNED_TO]->(t) WHERE t.id = $domain OR (t)-[:PART_OF*1..2]->(:Domain {id: $domain}) }`.
  2. Replace `JOURNEY_FILTER` const: `AND EXISTS { MATCH (k)-[:ALIGNED_TO]->(t) WHERE t.id = $journey OR (t)-[:PART_OF]->(:UserJourney {id: $journey}) }`.
  3. Replace `KIND_FILTER` const: `AND EXISTS { MATCH (k)-[:ALIGNED_TO]->(t) MATCH (a:Activity) WHERE a = t OR (a)-[:PART_OF]->(t) MATCH (a)-[:USES_SYSTEM]->(s:System) WHERE apoc.convert.fromJsonMap(coalesce(s.attributes_json,"{}")).systemKind = $kind }`.
  4. Update the comment block above each filter to reference ALIGNED_TO.
- **Verification**: `api/__tests__/performance-alignment.integration.test.ts`

### T-04 — Migration script: CONTRIBUTES_TO → ALIGNED_TO

- **Files** (1): `api/src/scripts/migrate-contributions-to-aligned.ts` (new)
- **Implements**: design §3.3 — closes AC-06
- **Complexity**: simple
- **Blocked by**: T-01
- **Blocks**: T-09
- **Steps**:
  1. Create script that connects to Neo4j via `getDriver()`.
  2. Run the MERGE cypher from design §3.3 (convert CONTRIBUTES_TO → ALIGNED_TO, preserve weight, add attribution_type if missing, mark migrated_from).
  3. Print count of converted edges.
  4. Make it runnable via `bun run api/src/scripts/migrate-contributions-to-aligned.ts`.
- **Verification**: `api/__tests__/alignment-migration.integration.test.ts`

### T-05 — Param-binding CRUD routes + reconciliation module

- **Files** (2): `api/src/routes/kpi-param-bindings.ts` (new), `api/src/derive/kpi-reconcile.ts` (new)
- **Implements**: design §3.4, §4 — closes AC-07, AC-08
- **Complexity**: complex
- **Blocked by**: T-01
- **Blocks**: T-08, T-09
- **Steps**:
  1. Create `api/src/routes/kpi-param-bindings.ts` with handlers:
     - `handleParamBindingPost(req, kpiId)`: validate with `paramBindingCreateRequestSchema`, verify KPI exists, verify target entity exists, CREATE `(k)-[:PARAM_BINDS {parameter, attribute_path, created_at}]->(t)`, return edge row.
     - `handleParamBindingsGet(req, kpiId)`: `MATCH (k:KPI {id: $kpiId})-[r:PARAM_BINDS]->(t) RETURN r, t.id AS target_id, t.name AS target_name, labels(t)[0] AS target_type`.
     - `handleParamBindingDelete(req, bindingId)`: `MATCH (k:KPI)-[r:PARAM_BINDS]->() WHERE elementId(r) = $id DELETE r`.
     - `handleKpiReconcile(req, kpiId)`: call `reconcileKpiParams(kpiId)`, return result.
     - `handleKpiReconcileAll(req)`: iterate all non-archived KPIs, call `reconcileKpiParams` for each, aggregate results.
  2. Create `api/src/derive/kpi-reconcile.ts` with `reconcileKpiParams(kpiId)`:
     - Read all PARAM_BINDS edges for the KPI.
     - For each binding: resolve `attribute_path` on target entity's `attributes_json` via `apoc.convert.fromJsonMap`.
     - If resolved value differs from current KPI param value: PATCH the KPI node.
     - Return diff log (reconciled[] + unchanged[]).
     - Increment `kpi_reconciliation_runs_total` and set `kpi_reconciliation_bindings_active` gauge.
- **Verification**: `api/__tests__/param-bindings.integration.test.ts`

### T-06 — Register new routes in router + RBAC

- **Files** (2): `api/src/router.ts` (modify), `api/src/auth/rbac-permissions.ts` (modify)
- **Implements**: FR-09, FR-11, FR-18 — closes AC-13
- **Complexity**: moderate
- **Blocked by**: T-05
- **Blocks**: T-08, T-09
- **Steps**:
  1. In `api/src/router.ts`: import handlers from `kpi-param-bindings.ts`. Add route matching:
     - `POST kpis/:id/param-bindings` → `handleParamBindingPost`
     - `GET kpis/:id/param-bindings` → `handleParamBindingsGet`
     - `DELETE param-bindings/:id` → `handleParamBindingDelete`
     - `POST kpis/:id/reconcile` → `handleKpiReconcile`
     - `POST kpis/reconcile-all` → `handleKpiReconcileAll`
  2. In `api/src/auth/rbac-permissions.ts`: add `P("POST","kpis/:id/param-bindings","kpi:write")`, `P("GET","kpis/:id/param-bindings","kpi:read")`, `P("DELETE","param-bindings/:id","kpi:write")`, `P("POST","kpis/:id/reconcile","kpi:write")`, `P("POST","kpis/reconcile-all","kpi:write")`.
- **Verification**: `api/__tests__/rbac-route-permissions.test.ts` (modified in T-10)

### T-07 — Register new routes in OpenAPI

- **Files** (1): `api/src/routes/openapi-kpi-okr.ts` (modify)
- **Implements**: FR-17 — closes AC-12
- **Complexity**: moderate
- **Blocked by**: T-05, T-06
- **Blocks**: T-09
- **Steps**:
  1. Import `paramBindingSchema`, `paramBindingCreateRequestSchema` from `@companygraph/shared/schema/kpi-sla`.
  2. Register the 5 new routes in the OpenAPI registry (same pattern as existing kpi-alignment registration).
  3. Add response schemas for reconcile endpoints (permissive records).
- **Verification**: `api/__tests__/openapi-kpi-binding.integration.test.ts`

### T-08 — Kafka consumer implementation with kafkajs

- **Files** (3): `api/src/ingest/kafka-consumer.ts` (modify), `api/src/server.ts` (modify), `api/package.json` (modify)
- **Implements**: design §3.5 — closes AC-09, AC-10
- **Complexity**: complex
- **Blocked by**: T-02
- **Blocks**: T-09
- **Steps**:
  1. Add `kafkajs` to `api/package.json` dependencies (`bun add kafkajs` in api/).
  2. Rewrite `api/src/ingest/kafka-consumer.ts`:
     - Export `startKafkaConsumerIfConfigured()` — reads `KAFKA_BROKERS` env, returns early if unset (FR-13).
     - Dynamic `import('kafkajs')` (keeps it out of the bundle when unused).
     - Subscribe to `kpi-measurements` topic.
     - `eachMessage`: parse JSON, validate with `createKpiMeasurementSchema`, dual-write (Neo4j :KPIMeasurement + Postgres row), increment `kpi_measurements_ingested_total{source="kafka"}`.
     - Error handling: log + skip invalid messages (FR-14). Connection failure: log warning, retry with backoff, never crash server (NFR-03).
  3. In `api/src/server.ts`: call `startKafkaConsumerIfConfigured()` after server boot (non-blocking, catch errors).
- **Verification**: `api/__tests__/kafka-kpi-consumer.test.ts`

### T-09 — Register KPI-specific Prometheus metrics

- **Files** (1): `api/src/metrics.ts` (modify)
- **Implements**: FR-15, FR-16 — closes AC-11
- **Complexity**: simple
- **Blocked by**: —
- **Blocks**: T-10
- **Steps**:
  1. In `api/src/metrics.ts`: register 4 new metrics:
     - `kpi_measurements_ingested_total` (counter, labels: source)
     - `kpi_measurement_write_duration_ms` (histogram)
     - `kpi_reconciliation_runs_total` (counter)
     - `kpi_reconciliation_bindings_active` (gauge)
- **Verification**: `api/__tests__/kpi-metrics.test.ts`

### T-10 — Update PWA API client for param-bindings + reconcile

- **Files** (1): `pwa/src/api.ts` (modify)
- **Implements**: FR-09, FR-11 (PWA client) — closes AC-14
- **Complexity**: simple
- **Blocked by**: T-06
- **Blocks**: T-11
- **Steps**:
  1. Add to the `kpi` object in `pwa/src/api.ts`:
     - `createParamBinding(kpiId, data)` → POST `/api/v1/kpis/${kpiId}/param-bindings`
     - `getParamBindings(kpiId, signal?)` → GET `/api/v1/kpis/${kpiId}/param-bindings`
     - `deleteParamBinding(bindingId)` → DELETE `/api/v1/param-bindings/${bindingId}`
     - `reconcile(kpiId)` → POST `/api/v1/kpis/${kpiId}/reconcile`
     - `reconcileAll()` → POST `/api/v1/kpis/reconcile-all`
  2. Add TypeScript interfaces: `ParamBinding`, `ParamBindingCreate`, `ReconcileResult`.
- **Verification**: `bun run typecheck`

### T-11 — Write integration tests

- **Files** (7): `api/__tests__/kpi-measurement-dual-write.integration.test.ts` (new), `api/__tests__/performance-alignment.integration.test.ts` (new), `api/__tests__/alignment-migration.integration.test.ts` (new), `api/__tests__/param-bindings.integration.test.ts` (new), `api/__tests__/openapi-kpi-binding.integration.test.ts` (new), `api/__tests__/kafka-kpi-consumer.test.ts` (new), `api/__tests__/kpi-metrics.test.ts` (new)
- **Implements**: AC-01..AC-12 — closes AC-01..AC-12
- **Complexity**: complex
- **Blocked by**: T-02, T-03, T-04, T-05, T-07, T-08, T-09
- **Blocks**: —
- **Steps**:
  1. `kpi-measurement-dual-write.integration.test.ts`: POST a measurement, assert Postgres row + Neo4j :KPIMeasurement node both exist with matching properties. DELETE it, assert both removed. GET still reads Postgres.
  2. `performance-alignment.integration.test.ts`: Create KPI + ALIGNED_TO edge to domain + measurement via REST. GET performance/kpis — assert status is not `no_data`. Verify domain filter uses ALIGNED_TO (create KPI with ALIGNED_TO but no domain_id — assert it appears in domain slice).
  3. `alignment-migration.integration.test.ts`: Create a CONTRIBUTES_TO edge, run migration script, assert ALIGNED_TO edge exists with preserved weight + migrated_from property. Run again — assert idempotent (no duplicate).
  4. `param-bindings.integration.test.ts`: Create KPI + Activity with attributes. POST param-binding (target_value → activity.attributes.throughputTarget). POST reconcile — assert KPI target_value updated. DELETE binding — assert removed.
  5. `openapi-kpi-binding.integration.test.ts`: GET openapi.json — assert 5 new paths present.
  6. `kafka-kpi-consumer.test.ts`: Mock kafkajs, assert consumer connects when KAFKA_BROKERS set, skips when unset. Assert message handler dual-writes.
  7. `kpi-metrics.test.ts`: Assert metrics export includes all 4 new KPI metrics.
- **Verification**: `bun test:integration` (integration tests) + `bun test` (unit tests)

### T-12 — Write PWA test + update RBAC test + final validation

- **Files** (2): `pwa/src/__tests__/kpi-dashboard-alignment.test.tsx` (new), `api/__tests__/rbac-route-permissions.test.ts` (modify)
- **Implements**: AC-13, AC-14 — closes AC-13, AC-14
- **Complexity**: moderate
- **Blocked by**: T-10, T-11
- **Blocks**: —
- **Steps**:
  1. `kpi-dashboard-alignment.test.tsx`: Mock `api.kpi.getAlignments` to return ALIGNED_TO-based rows, mock `api.kpi.getMeasurements` to return measurement data. Render KpiDashboard — assert KPI cards show with measurement values (not empty/no_data).
  2. In `rbac-route-permissions.test.ts`: add assertions for the 5 new routes (POST/GET/DELETE param-bindings, POST reconcile, POST reconcile-all) — assert correct permission mapping.
  3. Run final validation: `bun run typecheck` + `bun test` + `bun test:integration`.
- **Verification**: `bun test` + `bun test:integration`

## Validation checkpoints

| After | Run |
|-------|-----|
| every task | `bun run typecheck` |
| T-02 | `bun test:integration api/__tests__/kpi-measurement-dual-write.integration.test.ts` |
| T-03 | `bun test:integration api/__tests__/performance-alignment.integration.test.ts` |
| T-04 | `bun test:integration api/__tests__/alignment-migration.integration.test.ts` |
| T-05 | `bun test:integration api/__tests__/param-bindings.integration.test.ts` |
| T-07 | `bun test:integration api/__tests__/openapi-kpi-binding.integration.test.ts` |
| T-08 | `bun test api/__tests__/kafka-kpi-consumer.test.ts` |
| T-09 | `bun test api/__tests__/kpi-metrics.test.ts` |
| T-12 (final) | `bun run typecheck` + `bun test` + `bun test:integration` |
