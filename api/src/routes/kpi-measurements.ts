// KPI Measurement tracking handlers
// POST /api/v1/kpi-measurements - record KPI measurement
// GET /api/v1/kpi-measurements - list KPI measurements for a KPI
// GET /api/v1/kpi-measurements/:id - get single KPI measurement
// DELETE /api/v1/kpi-measurements/:id - delete KPI measurement

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../storage/postgres/client';
import { ok, error, readJson } from './_helpers';

// Validation schemas
const createKpiMeasurementSchema = z.object({
  kpi_id: z.string().min(1),
  measured_at: z.string(),
  value: z.number(),
  context: z.record(z.unknown()).optional(),
  source: z.string().optional(),
});

// POST /api/v1/kpi-measurements - record KPI measurement
export async function handleKpiMeasurementPost(req: Request): Promise<Response> {
  const body = await readJson(req);
  const validated = createKpiMeasurementSchema.parse(body);

  const id = uuidv4();
  const now = new Date().toISOString();

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

// DELETE /api/v1/kpi-measurements/:id - delete KPI measurement
export async function handleKpiMeasurementDelete(req: Request, measurementId: string): Promise<Response> {
  const existing = await queryOne('SELECT * FROM kpi_measurements WHERE id = $1', [measurementId]);

  if (!existing) {
    return error(404, "not_found", "measurement not found", { id: measurementId });
  }

  await query('DELETE FROM kpi_measurements WHERE id = $1', [measurementId]);
  return ok({ deleted: true });
}
