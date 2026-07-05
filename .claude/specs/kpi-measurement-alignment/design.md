---
feature: "kpi-measurement-alignment"
created: "2026-07-05"
author: "spec-author"
status: "draft"
revision: 1
reviewing_requirements_revision: 1
size: "large"
---

# Design: kpi-measurement-alignment

> Traces the approved `requirements.md` rev 1: FR-01…FR-18, NFR-01…NFR-07,
> AC-01…AC-17. Every §-section names the FR/AC it serves; §7 is the file-change
> table (each row → an FR); §8 is the AC→test map.

## 1. Overview

This spec closes the V-02 split-brain by making `POST /api/v1/kpi-measurements`
**dual-write** to both Postgres (backward compat for REST list/get) and Neo4j
`:KPIMeasurement` (the store `kpi-trends` and `performance.ts` already read).
It unifies KPI-to-entity alignment on the `ALIGNED_TO` edge type — the
performance aggregate's filter fragments are rewritten to traverse `ALIGNED_TO`
instead of `CONTRIBUTES_TO`, and a one-time migration script converts existing
`CONTRIBUTES_TO` KPI edges. It adds a `PARAM_BINDS` edge type + CRUD routes +
a reconciliation function that reads bound entity attributes and PATCHes KPI
parameters. It implements the Kafka consumer with `kafkajs` (opt-in via
`KAFKA_BROKERS`) and registers KPI-specific Prometheus metrics.

**Rules the design follows:**

1. **No breaking changes to the REST measurement contract** — `GET /kpi-measurements` still reads Postgres; the Neo4j write is additive (dual-write).
2. **`ALIGNED_TO` is the single alignment edge** — `CONTRIBUTES_TO` KPI endpoints are retired; the performance aggregate traverses `ALIGNED_TO` only.
3. **No new datastore** — Neo4j + Postgres (existing). `kafkajs` is the only new dependency, and it's optional (env-gated).
4. **Auth via the central router gate** — no per-route auth checks (NFR-06).

**Key trade-offs:**
- **Dual-write over Neo4j-only:** chosen for backward compat. The Postgres table stays; external consumers of `GET /kpi-measurements` are unaffected. Risk: partial failure (Postgres succeeds, Neo4j fails) — mitigated by logging + future backfill job (Risk 1).
- **`ALIGNED_TO` over OR-semantics:** chosen for single-source-of-truth. OR-semantics (traverse both edge types) was rejected because it perpetuates the fragmentation. Migration is idempotent MERGE (NFR-02).
- **Binding registry over derive-on-read:** chosen for query simplicity. Derive-on-read would require every `performance.ts` query to join through bindings — complex and slow. The registry + reconciliation job keeps queries unchanged; bindings are resolved at reconciliation time, not query time.

## 2. Data model

### 2.1 Neo4j `:KPIMeasurement` node (FR-01)

Already read by `kpi-trends.ts:50-55` and `performance.ts:172-177`. The
dual-write creates nodes with exactly these properties:

```cypher
CREATE (m:KPIMeasurement {
  id: $id,
  kpi_id: $kpi_id,
  measured_at: $measured_at,
  value: $value,
  context: $context,
  source: $source,
  created_at: $created_at
})
```

No schema change needed — `:KPIMeasurement` is already a runtime-registered
node label (bootstrap seeds it). The properties match what
`kpiMeasurementSchema` in `shared/src/schema/kpi-sla.ts` declares.

### 2.2 `ALIGNED_TO` replaces `CONTRIBUTES_TO` for KPI alignment (FR-04..FR-07)

`ALIGNED_TO` already exists as the edge type used by `kpi-sla-alignment.ts`.
The performance aggregate's filter fragments (`DOMAIN_FILTER`,
`JOURNEY_FILTER`, `KIND_FILTER` in `performance.ts:132-164`) are rewritten:

**Before (DOMAIN_FILTER):**
```cypher
AND (
  k.domain_id = $domain
  OR EXISTS {
    MATCH (k)-[:CONTRIBUTES_TO]->(t)
    MATCH (t)-[:PART_OF*1..2]->(:Domain {id: $domain})
  }
)
```

**After:**
```cypher
AND EXISTS {
  MATCH (k)-[:ALIGNED_TO]->(t)
  WHERE t.id = $domain
     OR (t)-[:PART_OF*1..2]->(:Domain {id: $domain})
}
```

The flat `k.domain_id` is no longer read (FR-06). `JOURNEY_FILTER` and
`KIND_FILTER` follow the same `CONTRIBUTES_TO` → `ALIGNED_TO` substitution.

### 2.3 `PARAM_BINDS` edge type (FR-08)

New edge type added to `shared/src/schema/edges.ts`:

```typescript
PARAM_BINDS: [
  ["KPI", "Activity"],
  ["KPI", "UserJourney"],
  ["KPI", "System"],
  ["KPI", "Domain"],
],
```

Edge properties: `parameter` (enum: `target_value`, `warning_threshold`,
`critical_threshold`), `attribute_path` (string, dotted path into
`attributes_json`), `created_at` (ISO datetime).

### 2.4 `CONTRIBUTES_TO` KPI endpoints retired (FR-05)

`EDGE_ENDPOINTS.CONTRIBUTES_TO` is reduced to `[]` (empty array) — the edge
type remains in `EDGE_TYPES` for backward compat with existing edges, but no
new KPI→entity `CONTRIBUTES_TO` edges can be created. The migration script
converts existing ones to `ALIGNED_TO`.

## 3. Core logic

### 3.1 Dual-write in `handleKpiMeasurementPost` (FR-01, §4.1)

```
1. Validate body (existing createKpiMeasurementSchema)
2. Generate id (UUIDv7), set now
3. Postgres INSERT (existing code, unchanged)
4. Neo4j CREATE :KPIMeasurement node (NEW)
5. If Neo4j write fails: log error, return success (Postgres is confirmed)
6. Increment kpi_measurements_ingested_total{source="rest"}
7. Return ok(measurement, 201) (existing response shape)
```

### 3.2 Dual-delete in `handleKpiMeasurementDelete` (FR-02, §4.2)

```
1. Check Postgres row exists (existing code)
2. Postgres DELETE (existing code)
3. Neo4j MATCH (m:KPIMeasurement {id: $id}) DETACH DELETE m (NEW)
4. Return ok({ deleted: true })
```

### 3.3 Alignment migration script (FR-05, §4.3)

New script `api/src/scripts/migrate-contributions-to-aligned.ts`:

```cypher
MATCH (k:KPI)-[old:CONTRIBUTES_TO]->(t)
WHERE k.archived_at IS NULL
MERGE (k)-[new:ALIGNED_TO]->(t)
SET new.weight = old.weight,
    new.attribution_type = coalesce(old.attribution_type, 'direct'),
    new.alignment_notes = old.alignment_notes,
    new.created_at = old.created_at,
    new.migrated_from = 'CONTRIBUTES_TO'
DELETE old
```

Idempotent: MERGE ensures no duplicate `ALIGNED_TO` edges on re-run.
`migrated_from` property marks converted edges for audit.

### 3.4 Parameter binding reconciliation (FR-10, §4.4)

New module `api/src/derive/kpi-reconcile.ts`:

```typescript
export async function reconcileKpiParams(kpiId: string): Promise<{
  kpi_id: string;
  reconciled: Array<{ parameter: string; old_value: number; new_value: number; entity_id: string }>;
  unchanged: string[];
}> {
  // 1. MATCH (k:KPI {id: $kpiId})-[:PARAM_BINDS]->(e)
  //    RETURN k, e, r.parameter AS param, r.attribute_path AS path
  // 2. For each binding: resolve attribute_path on e.attributes_json
  //    via apoc.convert.fromJsonMap(coalesce(e.attributes_json, "{}"))
  // 3. If resolved value differs from k[param]: PATCH k SET k[param] = $value
  // 4. Return diff log
}
```

### 3.5 Kafka consumer (FR-12..FR-14, §4.5)

`api/src/ingest/kafka-consumer.ts` is rewritten:

```typescript
import { Kafka } from 'kafkajs'; // dynamic import, env-gated

export async function startKafkaConsumerIfConfigured(): Promise<void> {
  const brokers = process.env.KAFKA_BROKERS;
  if (!brokers) return; // opt-in (FR-13)
  
  const kafka = new Kafka({ brokers: brokers.split(','), clientId: 'companygraph' });
  const consumer = kafka.consumer({ groupId: 'companygraph-kpi' });
  await consumer.connect();
  await consumer.subscribe({ topic: 'kpi-measurements', fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => {
      const payload = JSON.parse(message.value.toString());
      // validate with createKpiMeasurementSchema
      // dual-write (same as handleKpiMeasurementPost but with source: 'kafka')
    },
  });
}
```

Called from server boot (`api/src/server.ts`) — non-blocking, catches errors.

## 4. HTTP API surface

| Method | Route | FR | Request → Response |
|--------|-------|----|--------------------|
| POST | `/api/v1/kpis/:id/param-bindings` | FR-09 | `{target_type, target_id, parameter, attribute_path}` → `PARAM_BINDS` edge row |
| GET | `/api/v1/kpis/:id/param-bindings` | FR-09 | `?target_type=&target_id=` (optional) → `{ rows: ParamBinding[] }` |
| DELETE | `/api/v1/param-bindings/:bindingId` | FR-09 | → `{ deleted: true }` |
| POST | `/api/v1/kpis/:id/reconcile` | FR-11 | → `{ kpi_id, reconciled: [...], unchanged: [...] }` |
| POST | `/api/v1/kpis/reconcile-all` | FR-11 | → `{ reconciled_kpis: N, total_bindings: M }` |

All routes under `/api/v1/` (NFR-05). Auth via central router (NFR-06).

## 5. File Changes

| Path | Action | Serves | Notes |
|------|--------|--------|-------|
| `api/src/routes/kpi-measurements.ts` | modify | FR-01, FR-02 | Add Neo4j dual-write to POST, dual-delete to DELETE |
| `api/src/routes/performance.ts` | modify | FR-04, FR-06, FR-07 | Replace DOMAIN_FILTER/JOURNEY_FILTER/KIND_FILTER to use ALIGNED_TO |
| `api/src/routes/kpi-param-bindings.ts` | new | FR-09, FR-11 | Param-binding CRUD + reconcile endpoints |
| `api/src/derive/kpi-reconcile.ts` | new | FR-10 | Reconciliation logic (pure Neo4j reads + PATCH) |
| `api/src/scripts/migrate-contributions-to-aligned.ts` | new | FR-05 | One-time migration script |
| `api/src/ingest/kafka-consumer.ts` | modify | FR-12, FR-13, FR-14 | Replace placeholder with kafkajs implementation |
| `api/src/metrics.ts` | modify | FR-15 | Register KPI-specific metrics |
| `api/src/server.ts` | modify | FR-13 | Call `startKafkaConsumerIfConfigured()` at boot |
| `api/src/router.ts` | modify | FR-09, FR-11, FR-18 | Register new routes + RBAC |
| `api/src/auth/rbac-permissions.ts` | modify | FR-18 | Add param-bindings + reconcile permissions |
| `api/src/routes/openapi-kpi-okr.ts` | modify | FR-17 | Register new routes in OpenAPI |
| `shared/src/schema/edges.ts` | modify | FR-05, FR-08 | Add PARAM_BINDS, retire CONTRIBUTES_TO KPI endpoints |
| `shared/src/schema/kpi-sla.ts` | modify | FR-08 | Add paramBindingSchema + create request schema |
| `api/package.json` | modify | FR-12 | Add kafkajs dependency |
| `pwa/src/api.ts` | modify | FR-09 | Add paramBindings + reconcile API methods |
| `pwa/src/components/KpiDashboard.tsx` | modify | FR-04 | Works with unified alignment (no code change needed — already uses getAlignments) |
| `api/__tests__/kpi-measurement-dual-write.integration.test.ts` | new | AC-01..AC-03 | Integration test for dual-write/delete |
| `api/__tests__/performance-alignment.integration.test.ts` | new | AC-04, AC-05 | Integration test for ALIGNED_TO-based performance |
| `api/__tests__/alignment-migration.integration.test.ts` | new | AC-06 | Migration script test |
| `api/__tests__/param-bindings.integration.test.ts` | new | AC-07, AC-08 | Param-binding CRUD + reconcile test |
| `api/__tests__/kafka-kpi-consumer.test.ts` | new | AC-09, AC-10 | Kafka consumer unit test (mocked) |
| `api/__tests__/kpi-metrics.test.ts` | new | AC-11 | Metrics registration test |
| `api/__tests__/openapi-kpi-binding.integration.test.ts` | new | AC-12 | OpenAPI coverage test |
| `api/__tests__/rbac-route-permissions.test.ts` | modify | AC-13 | Add new route permission assertions |
| `pwa/src/__tests__/kpi-dashboard-alignment.test.tsx` | new | AC-14 | PWA dashboard test with unified alignment |

**Total: 25 files (11 new, 14 modify)**

## 6. UI design

This spec touches `pwa/` minimally — the `KpiDashboard` component already uses
`api.kpi.getAlignments()` which reads `ALIGNED_TO` edges. The performance
dashboard already uses `api.performance.kpis()`. No view-level changes needed
for the alignment unification (the API contract is unchanged).

The `pwa/src/api.ts` file gains new methods for param-bindings + reconcile
(FR-09, FR-11). These are used by the existing `KpiManagement` view's "Domain
Assignments" tab (which currently has placeholder inputs without save logic —
this spec wires them to the binding API).

**No new views, no new routes, no design-system changes.** Design-conformance
is not triggered (no touched views).

## 7. Test strategy

| AC | Test type | File |
|----|-----------|------|
| AC-01..AC-03 | integration (Neo4j + Postgres) | `api/__tests__/kpi-measurement-dual-write.integration.test.ts` |
| AC-04, AC-05 | integration (Neo4j) | `api/__tests__/performance-alignment.integration.test.ts` |
| AC-06 | integration (Neo4j, script) | `api/__tests__/alignment-migration.integration.test.ts` |
| AC-07, AC-08 | integration (Neo4j) | `api/__tests__/param-bindings.integration.test.ts` |
| AC-09, AC-10 | unit (mocked Kafka) | `api/__tests__/kafka-kpi-consumer.test.ts` |
| AC-11 | unit | `api/__tests__/kpi-metrics.test.ts` |
| AC-12 | integration | `api/__tests__/openapi-kpi-binding.integration.test.ts` |
| AC-13 | unit | `api/__tests__/rbac-route-permissions.test.ts` (modified) |
| AC-14 | unit (vitest/jsdom) | `pwa/src/__tests__/kpi-dashboard-alignment.test.tsx` |
| AC-15 | transpile | `bun run typecheck` |
| AC-16 | unit | `bun test` |
| AC-17 | integration | `bun test:integration` |

## 8. Rejected alternatives

- **Neo4j-only (no Postgres):** rejected — breaking change to `GET /kpi-measurements` consumers. Dual-write is additive.
- **Postgres-only (move reads to Postgres):** rejected — `performance.ts` is pinned to Neo4j-only by `performance-no-postgres-import.test.ts`. Would require rewriting that test + the entire performance module.
- **OR-semantics (traverse both ALIGNED_TO + CONTRIBUTES_TO):** rejected — perpetuates fragmentation, two edge types for the same concept.
- **Derive-on-read for parameter binding:** rejected — every performance query would need to join through bindings. Complex, slow. Reconciliation job keeps queries unchanged.
- **Bun native TCP for Kafka:** rejected — kafkajs is pure JS, well-tested, handles protocol negotiation. Bun TCP would require reimplementing the Kafka protocol.
