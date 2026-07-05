---
feature: "kpi-measurement-alignment"
created: "2026-07-05"
author: "spec-author (user-driven, fixes V-02 split-brain + alignment unification + parameter binding + ingestion)"
status: "draft"
revision: 1
size: "large"
---

# Requirements: kpi-measurement-alignment

## Summary

This spec closes four interlocking gaps in the KPI integration layer: (1) the
V-02 split-brain where REST measurement writes go to Postgres while
trends/performance analytics read Neo4j `:KPIMeasurement` nodes that are never
populated; (2) the three parallel KPI-to-entity alignment mechanisms
(`domain_id` flat property, `ALIGNED_TO` edges, `CONTRIBUTES_TO` edges) that
fragment the alignment graph and make the performance aggregate miss
API-created alignments; (3) the absence of any binding between KPI parameters
(target_value, thresholds) and live entity attributes, leaving targets as
static point-in-time values; (4) the placeholder Kafka consumer and missing
KPI-specific Prometheus metrics that leave ingestion non-functional and
unobservable.

It serves P4 Karim (CTO/Analyst) and P5 Priya (Domain SME) who need real
measurements flowing into dashboards, and P2 Ravi (Process Explorer) who needs
KPI alignments visible in entity detail views. It sits downstream of
`kpi-okr-governance` (owns the KPI/SLA CRUD + measurement REST surface) and
`kpi-okr-performance-dashboards` (owns the read-only performance aggregate).

**What it does NOT include:** the `kpi-impact-mapping` spec's activity×KPI
coverage matrix (that spec owns it, still blocked by dependency merge order);
SLA breach/compliance store unification (SLA breaches already write Postgres
and SLA compliance reads Neo4j `:SLABreach` — a parallel split-brain, but
out of scope here — flagged for a follow-up spec); the OKR roll-down workflow
(owned by `kpi-okr-governance`).

## Motivation

1. **Measurements recorded via REST never reach dashboards.** The executive
   PerformanceDashboard shows `no_data` for every KPI because
   `POST /api/v1/kpi-measurements` writes Postgres while
   `GET /api/v1/analytics/performance/kpis` reads Neo4j `:KPIMeasurement`.
   This is the single most visible defect in the KPI layer.
2. **Three alignment mechanisms, none unified.** A KPI can be "in" a domain
   via `k.domain_id`, via `ALIGNED_TO` (the alignment API), or via
   `CONTRIBUTES_TO` (the performance aggregate's traversal). The performance
   aggregate reads only `CONTRIBUTES_TO` — alignments created via the REST
   alignment API are invisible to dashboards.
3. **No parameter binding.** KPI `target_value` is a static value set at
   creation. There is no mechanism to bind it to a live entity attribute
   (e.g., an Activity's `attributes.throughputTarget`), so targets drift from
   reality and require manual PATCH updates.
4. **Ingestion is a placeholder.** The Kafka consumer has `TODO: Initialize
   actual Kafka consumer` and no KPI measurement handler. No KPI-specific
   Prometheus metrics exist, so ingestion health is unobservable.

## Functional Requirements

### Measurement store unification (V-02 fix)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-01 | `POST /api/v1/kpi-measurements` writes to BOTH Postgres `kpi_measurements` (backward compat for existing REST list/get) AND Neo4j `:KPIMeasurement` node (so trends/performance see it). The Neo4j node carries the same properties `kpi-trends.ts` and `performance.ts` already read: `id`, `kpi_id`, `measured_at`, `value`, `context`, `source`, `created_at`. | must | V-02 split-brain |
| FR-02 | `DELETE /api/v1/kpi-measurements/:id` removes the row from BOTH Postgres and Neo4j `:KPIMeasurement`. | must | V-02 consistency |
| FR-03 | Existing `GET /api/v1/kpi-measurements` and `GET /api/v1/kpi-measurements/:id` continue to read from Postgres (no breaking change to the REST list/get contract). | must | backward compat |

### Alignment unification (standardize on ALIGNED_TO)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-04 | The performance aggregate (`performance.ts`) domain filter and journey filter traverse `ALIGNED_TO` edges instead of `CONTRIBUTES_TO` edges. `ALIGNED_TO` is the single edge type for all KPI-to-entity alignments. | must | alignment fragmentation |
| FR-05 | A one-time migration script converts existing `CONTRIBUTES_TO` edges from KPI nodes to `ALIGNED_TO` edges, preserving `weight` and adding `attribution_type: "direct"` if missing. The `CONTRIBUTES_TO` edge type is removed from `EDGE_ENDPOINTS` for KPI endpoints. | must | data migration |
| FR-06 | The `domain_id` flat property on `:KPI` nodes remains as a denormalized convenience but is NO LONGER read by the performance aggregate. Domain membership is determined solely by `ALIGNED_TO` traversal. | must | single source of truth |
| FR-07 | The kind filter (`performance.ts` KIND_FILTER) is updated to traverse `ALIGNED_TO` instead of `CONTRIBUTES_TO` for the KPI→activity→system path. | must | filter consistency |

### Parameter binding registry

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-08 | A new edge type `PARAM_BINDS` (KPI→Activity, KPI→UserJourney, KPI→System, KPI→Domain) carries `parameter` (one of `target_value`, `warning_threshold`, `critical_threshold`), `attribute_path` (dotted path into the entity's `attributes` JSON), and `created_at`. | must | parameter binding |
| FR-09 | `POST /api/v1/kpis/:id/param-bindings` creates a `PARAM_BINDS` edge. `GET /api/v1/kpis/:id/param-bindings` lists them. `DELETE /api/v1/param-bindings/:bindingId` removes one. | must | binding CRUD |
| FR-10 | A reconciliation function `reconcileKpiParams(kpiId)` reads all `PARAM_BINDS` edges for a KPI, resolves each `attribute_path` on the target entity's `attributes_json`, and PATCHes the KPI node's bound parameter to the resolved value. Static (unbound) parameters are left untouched. | must | reconciliation |
| FR-11 | `POST /api/v1/kpis/:id/reconcile` triggers a single-KPI reconciliation. A batch endpoint `POST /api/v1/kpis/reconcile-all` reconciles all non-archived KPIs. | should | operational trigger |

### Kafka ingestion

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-12 | The Kafka consumer (`api/src/ingest/kafka-consumer.ts`) is implemented with `kafkajs` (not a placeholder). It subscribes to a `kpi-measurements` topic and writes each message as a Neo4j `:KPIMeasurement` node AND a Postgres row (dual-write parity with FR-01). | must | ingestion |
| FR-13 | The consumer is opt-in: it starts only when `KAFKA_BROKERS` env var is set. Without it, the server boots normally (no Kafka dependency for local dev). | must | dev ergonomics |
| FR-14 | The consumer handles `kpi-measurements` topic messages with schema `{kpi_id, measured_at, value, context?, source?}` — same as the REST POST body. Invalid messages are logged and skipped (not retried indefinitely). | must | ingestion robustness |

### Observability

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-15 | Prometheus metrics registered in `api/src/metrics.ts`: `kpi_measurements_ingested_total` (counter, labels: `source` = rest|kafka), `kpi_measurement_write_duration_ms` (histogram), `kpi_reconciliation_runs_total` (counter), `kpi_reconciliation_bindings_active` (gauge). | must | observability |
| FR-16 | The `/metrics` endpoint (if it exists) or the metrics export includes the new KPI metrics. | should | observability |

### OpenAPI + RBAC

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-17 | The new routes (param-bindings CRUD, reconcile) are registered in `openapi.json` via the openapi-kpi-okr module. | must | API contract |
| FR-18 | RBAC permissions added: `kpi:write` for POST/DELETE param-bindings, `kpi:read` for GET param-bindings, `kpi:write` for reconcile endpoints. | must | auth |

## Non-Functional Requirements

| ID | Requirement | Source |
|----|-------------|--------|
| NFR-01 | Dual-write adds ≤1 Neo4j round trip to the existing Postgres write in `handleKpiMeasurementPost`. Total latency ≤50ms p95 for the REST POST (local Neo4j). | perf |
| NFR-02 | The migration script (FR-05) is idempotent — running it twice produces the same state. It uses `MERGE` not `CREATE` for the converted `ALIGNED_TO` edges. | operability |
| NFR-03 | The Kafka consumer (FR-12) does not block server boot. It connects asynchronously; failure to connect logs a warning and retries with backoff, never crashes the API server. | resilience |
| NFR-04 | Reconciliation (FR-10) is O(bindings) per KPI — one Neo4j read per binding edge, one PATCH per changed parameter. No full-graph scans. | perf |
| NFR-05 | All new routes are under `/api/v1/` (no `/api/v2/` bump — additive only). | versioning |
| NFR-06 | Auth goes through the central router gate (`api/src/router.ts`) — no per-route auth checks. | security |
| NFR-07 | `bun run typecheck` passes after every task. `bun test` passes after tasks that ship behaviour. | CI |

## Scope Boundaries

**In scope:**
- Dual-write Neo4j `:KPIMeasurement` in the REST measurement handler
- Standardizing performance aggregate on `ALIGNED_TO` (replacing `CONTRIBUTES_TO` traversal)
- One-time migration of existing `CONTRIBUTES_TO` KPI edges to `ALIGNED_TO`
- `PARAM_BINDS` edge type + binding CRUD routes + reconciliation
- Kafka consumer implementation with `kafkajs` + `kpi-measurements` topic handler
- KPI-specific Prometheus metrics
- OpenAPI + RBAC registration for new routes
- PWA component updates for unified alignment display

**Out of scope:**
- SLA breach/compliance store unification (parallel split-brain — flagged for follow-up spec `sla-measurement-alignment`)
- `kpi-impact-mapping` spec's activity×KPI coverage matrix (owned by that spec)
- OKR roll-down workflow changes (owned by `kpi-okr-governance`)
- Kafka consumer for non-KPI topics (store-transactions, inventory-updates, etc. — those remain placeholders)
- Postgres `kpi_measurements` table deprecation (kept for backward compat per FR-03)

## Acceptance Criteria

| ID | Criterion | Platforms | Verification |
|----|-----------|-----------|--------------|
| AC-01 | `POST /api/v1/kpi-measurements` creates both a Postgres row and a Neo4j `:KPIMeasurement` node with matching properties (FR-01) | server (curl) | `api/__tests__/kpi-measurement-dual-write.integration.test.ts` |
| AC-02 | `DELETE /api/v1/kpi-measurements/:id` removes both the Postgres row and the Neo4j node (FR-02) | server (curl) | `api/__tests__/kpi-measurement-dual-write.integration.test.ts` |
| AC-03 | `GET /api/v1/kpi-measurements` still reads from Postgres only (FR-03) | server (curl) | `api/__tests__/kpi-measurement-dual-write.integration.test.ts` |
| AC-04 | `GET /api/v1/analytics/performance/kpis` returns `on_target`/`warning`/`breach` (not `no_data`) for a KPI with a measurement recorded via REST (FR-01 + FR-04) | server (curl) | `api/__tests__/performance-alignment.integration.test.ts` |
| AC-05 | Performance aggregate domain filter traverses `ALIGNED_TO` not `CONTRIBUTES_TO` (FR-04) | server (curl) | `api/__tests__/performance-alignment.integration.test.ts` |
| AC-06 | Migration script converts existing `CONTRIBUTES_TO` KPI edges to `ALIGNED_TO` idempotently (FR-05) | server (script) | `api/__tests__/alignment-migration.integration.test.ts` |
| AC-07 | `POST /api/v1/kpis/:id/param-bindings` creates a `PARAM_BINDS` edge; `GET` lists it; `DELETE` removes it (FR-09) | server (curl) | `api/__tests__/param-bindings.integration.test.ts` |
| AC-08 | `POST /api/v1/kpis/:id/reconcile` updates the KPI's bound parameter from the entity attribute; unbound parameters unchanged (FR-10) | server (curl) | `api/__tests__/param-bindings.integration.test.ts` |
| AC-09 | Kafka consumer with `KAFKA_BROKERS` set connects and processes `kpi-measurements` topic messages into dual-write (FR-12, FR-14) | server (unit) | `api/__tests__/kafka-kpi-consumer.test.ts` |
| AC-10 | Server boots normally without `KAFKA_BROKERS` set (FR-13) | server (curl) | `api/__tests__/kafka-kpi-consumer.test.ts` |
| AC-11 | Prometheus metrics export includes `kpi_measurements_ingested_total`, `kpi_measurement_write_duration_ms`, `kpi_reconciliation_runs_total`, `kpi_reconciliation_bindings_active` (FR-15) | server (curl) | `api/__tests__/kpi-metrics.test.ts` |
| AC-12 | New routes appear in `GET /api/v1/openapi.json` (FR-17) | server (curl) | `api/__tests__/openapi-kpi-binding.integration.test.ts` |
| AC-13 | RBAC permissions for new routes are enforced (403 without, 200 with) (FR-18) | server (curl) | `api/__tests__/rbac-route-permissions.test.ts` (modified) |
| AC-14 | PWA KpiDashboard shows measurements recorded via REST (FR-01 + FR-04 end-to-end) | macOS Chrome (mouse+kb) | `pwa/src/__tests__/kpi-dashboard-alignment.test.tsx` |
| AC-15 | `bun run typecheck` passes | server | `bun run typecheck` |
| AC-16 | `bun test` passes (unit) | server | `bun test` |
| AC-17 | `bun test:integration` passes for new + existing KPI suites | server (Neo4j) | `bun test:integration` |

## Dependencies

- **`kpi-okr-governance`** (approved, execution complete) — owns the KPI/SLA
  CRUD + measurement REST surface. This spec modifies `kpi-measurements.ts`
  and `performance.ts` which that spec created.
- **`kpi-okr-performance-dashboards`** (approved) — owns the read-only
  performance aggregate. This spec modifies `performance.ts` filter fragments.
- **`shared/src/schema/edges.ts`** — `PARAM_BINDS` edge type added; KPI
  endpoints removed from `CONTRIBUTES_TO`.
- **`kafkajs`** — new runtime dependency for the Kafka consumer (optional,
  only loaded when `KAFKA_BROKERS` is set).
- Neo4j 5 Community (existing) + Postgres (existing) — no new datastores.

## Risks & Open Questions

| # | Risk / question | Impact | Mitigation / needed decision |
|---|-----------------|--------|------------------------------|
| 1 | Dual-write partial failure (Postgres succeeds, Neo4j fails) | Measurement exists in Postgres but not Neo4j — dashboard still shows `no_data` for that measurement | Log the Neo4j failure, return success (Postgres is the write-confirmed store). A future reconciliation job can backfill Neo4j from Postgres. |
| 2 | Migration script runs while server is live | New `ALIGNED_TO` edges created while old `CONTRIBUTES_TO` still traversed | Migration is idempotent MERGE; run during low-traffic window. Performance aggregate is updated in the same deploy. |
| 3 | `kafkajs` adds a dependency that must work with Bun | Bun compatibility risk | `kafkajs` is pure JS (no native deps). Test with `bun install kafkajs` in T-05. Fallback: use Bun's native TCP if kafkajs fails. |
| 4 | `PARAM_BINDS` edge type addition requires `EDGE_ENDPOINTS` registry update | Runtime edge validator rejects writes to unregistered edge types | Add `PARAM_BINDS` to `EDGE_TYPES` + `EDGE_ENDPOINTS` in `shared/src/schema/edges.ts` (T-03). |
| 5 | Reconciliation reads `attributes_json` which is a STRING in Neo4j | Must parse JSON before resolving dotted path | Use `apoc.convert.fromJsonMap` (same pattern as `performance.ts` KIND_FILTER). |
