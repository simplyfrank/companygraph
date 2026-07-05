// KPI Measurement tracking handlers
// POST /api/v1/kpi-measurements - record KPI measurement (dual-write: Postgres + Neo4j)
// GET /api/v1/kpi-measurements - list KPI measurements for a KPI (Postgres)
// GET /api/v1/kpi-measurements/:id - get single KPI measurement (Postgres)
// DELETE /api/v1/kpi-measurements/:id - delete KPI measurement (dual-delete)

import { z } from 'zod';
import { generateId } from '../ids';
import { query, queryOne } from '../storage/postgres/client';
import { getDriver } from '../neo4j/driver';
import { metrics } from '../metrics';
import { ok, error, readJson, parseWith } from './_helpers';

// Validation schemas — exported so openapi-kpi-okr.ts can register them
// (kpi-okr-governance FR-12).
export const createKpiMeasurementSchema = z.object({
  kpi_id: z.string().min(1),
  measured_at: z.string(),
  value: z.number(),
  context: z.record(z.unknown()).optional(),
  source: z.string().optional(),
});

// kpi-measurement-alignment FR-01 — dual-write helper. Writes a
// :KPIMeasurement node to Neo4j with the same properties kpi-trends.ts
// and performance.ts already read. Non-fatal: if Neo4j fails, the
// Postgres write is already confirmed — log and continue (Risk 1).
async function writeNeo4jMeasurement(
  id: string,
  kpiId: string,
  measuredAt: string,
  value: number,
  context: Record<string, unknown> | null,
  source: string | null,
  createdAt: string,
): Promise<void> {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });
  try {
    await session.run(
      `CREATE (m:KPIMeasurement {
        id: $id,
        kpi_id: $kpiId,
        measured_at: $measuredAt,
        value: $value,
        context: $context,
        source: $source,
        created_at: $createdAt
      })`,
      {
        id,
        kpiId,
        measuredAt,
        value,
        context: context ? JSON.stringify(context) : null,
        source,
        createdAt,
      },
    );
  } catch (err) {
    // Non-fatal — Postgres is the confirmed write. Log for backfill.
    console.error("[kpi-measurements] Neo4j dual-write failed (non-fatal):", err);
  } finally {
    await session.close();
  }
}

// kpi-measurement-alignment FR-02 — dual-delete helper. Removes the
// :KPIMeasurement node from Neo4j. Non-fatal on Neo4j failure.
async function deleteNeo4jMeasurement(id: string): Promise<void> {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });
  try {
    await session.run(
      `MATCH (m:KPIMeasurement {id: $id}) DETACH DELETE m`,
      { id },
    );
  } catch (err) {
    console.error("[kpi-measurements] Neo4j dual-delete failed (non-fatal):", err);
  } finally {
    await session.close();
  }
}

// POST /api/v1/kpi-measurements - record KPI measurement (dual-write)
export async function handleKpiMeasurementPost(req: Request): Promise<Response> {
  const body = await readJson(req);
  const validated = parseWith(createKpiMeasurementSchema, body);

  const id = generateId();
  const now = new Date().toISOString();
  const writeStart = Date.now();

  // Postgres write (primary — confirmed store)
  await query(
    `INSERT INTO kpi_measurements (id, kpi_id, measured_at, value, context, source, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      validated.kpi_id,
      validated.measured_at,
      validated.value,
      validated.context ? JSON.stringify(validated.context) : null,
      validated.source || null,
      now,
    ]
  );

  // Neo4j dual-write (FR-01) — populates :KPIMeasurement for trends/performance
  await writeNeo4jMeasurement(
    id,
    validated.kpi_id,
    validated.measured_at,
    validated.value,
    validated.context ?? null,
    validated.source ?? null,
    now,
  );

  // Observability (FR-15)
  metrics.increment("kpi_measurements_ingested_total", { source: "rest" });
  metrics.observe("kpi_measurement_write_duration_ms", Date.now() - writeStart);

  const measurement = await queryOne('SELECT * FROM kpi_measurements WHERE id = $1', [id]);
  return ok(measurement, 201);
}

// GET /api/v1/kpi-measurements - list KPI measurements for a KPI
export async function handleKpiMeasurementsGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const kpi_id = url.searchParams.get("kpi_id");
  const limit = parseInt(url.searchParams.get("limit") || "100", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  if (!kpi_id) {
    return error(400, "invalid_payload", "missing kpi_id query param", { required: ["kpi_id"] });
  }

  const rows = await query(
    `SELECT * FROM kpi_measurements WHERE kpi_id = $1 ORDER BY measured_at DESC LIMIT $2 OFFSET $3`,
    [kpi_id, limit, offset]
  );

  // Parse JSONB context and convert numeric values
  const parsedRows = rows.map((r: any) => ({
    ...r,
    value: parseFloat(r.value),
    context: typeof r.context === 'string' ? JSON.parse(r.context) : r.context,
  }));

  return ok({ rows: parsedRows });
}

// GET /api/v1/kpi-measurements/:id - get single KPI measurement
export async function handleKpiMeasurementGet(req: Request, measurementId: string): Promise<Response> {
  const measurement = await queryOne('SELECT * FROM kpi_measurements WHERE id = $1', [measurementId]);

  if (!measurement) {
    return error(404, "not_found", "measurement not found", { id: measurementId });
  }

  // Parse JSONB context and convert numeric values
  const parsed = {
    ...(measurement as any),
    value: parseFloat((measurement as any).value),
    context: typeof (measurement as any).context === 'string' ? JSON.parse((measurement as any).context) : (measurement as any).context,
  };

  return ok(parsed);
}

// DELETE /api/v1/kpi-measurements/:id - delete KPI measurement (dual-delete)
export async function handleKpiMeasurementDelete(req: Request, measurementId: string): Promise<Response> {
  const existing = await queryOne('SELECT * FROM kpi_measurements WHERE id = $1', [measurementId]);

  if (!existing) {
    return error(404, "not_found", "measurement not found", { id: measurementId });
  }

  // Postgres delete (primary)
  await query('DELETE FROM kpi_measurements WHERE id = $1', [measurementId]);

  // Neo4j dual-delete (FR-02)
  await deleteNeo4jMeasurement(measurementId);

  return ok({ deleted: true });
}
