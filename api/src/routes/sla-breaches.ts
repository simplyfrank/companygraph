// SLA Breach tracking handlers
// POST /api/v1/sla-breaches - record SLA breach
// GET /api/v1/sla-breaches - list SLA breaches for an SLA
// GET /api/v1/sla-breaches/:id - get single SLA breach
// PATCH /api/v1/sla-breaches/:id - update SLA breach (resolution)
// DELETE /api/v1/sla-breaches/:id - delete SLA breach

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../storage/postgres/client';
import { ok, error, readJson } from './_helpers';

// Validation schemas
const createSlaBreachSchema = z.object({
  sla_id: z.string().min(1),
  breach_at: z.string(),
  actual_value: z.number(),
  target_value: z.number(),
  severity: z.enum(['minor', 'major', 'critical']),
  impact_description: z.string().optional(),
  root_cause: z.string().optional(),
});

const updateSlaBreachSchema = z.object({
  resolution_status: z.enum(['open', 'resolved', 'mitigated']).optional(),
  resolved_at: z.string().optional(),
  resolution_notes: z.string().optional(),
  severity: z.enum(['minor', 'major', 'critical']).optional(),
  impact_description: z.string().optional(),
  root_cause: z.string().optional(),
});

// POST /api/v1/sla-breaches - record SLA breach
export async function handleSlaBreachPost(req: Request): Promise<Response> {
  const body = await readJson(req);
  const validated = createSlaBreachSchema.parse(body);

  const id = uuidv4();
  const now = new Date().toISOString();

  await query(
    `INSERT INTO sla_breaches (id, sla_id, breach_at, actual_value, target_value, severity, impact_description, root_cause, resolution_status, resolved_at, resolution_notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id,
      validated.sla_id,
      validated.breach_at,
      validated.actual_value,
      validated.target_value,
      validated.severity,
      validated.impact_description || null,
      validated.root_cause || null,
      'open',
      null,
      null,
      now,
      now,
    ]
  );

  const breach = await queryOne('SELECT * FROM sla_breaches WHERE id = $1', [id]);
  return ok(breach, 201);
}

// GET /api/v1/sla-breaches - list SLA breaches for an SLA
export async function handleSlaBreachesGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const sla_id = url.searchParams.get("sla_id");
  const resolution_status = url.searchParams.get("resolution_status");
  const limit = parseInt(url.searchParams.get("limit") || "100", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  if (!sla_id) {
    return error(400, "invalid_payload", "missing sla_id query param", { required: ["sla_id"] });
  }

  let queryText = 'SELECT * FROM sla_breaches WHERE sla_id = $1';
  const params: any[] = [sla_id];
  let paramIndex = 2;

  if (resolution_status) {
    queryText += ` AND resolution_status = $${paramIndex}`;
    params.push(resolution_status);
    paramIndex++;
  }

  queryText += ' ORDER BY breach_at DESC LIMIT $' + paramIndex + ' OFFSET $' + (paramIndex + 1);
  params.push(limit, offset);

  const rows = await query(queryText, params);
  return ok({ rows });
}

// GET /api/v1/sla-breaches/:id - get single SLA breach
export async function handleSlaBreachGet(req: Request, breachId: string): Promise<Response> {
  const breach = await queryOne('SELECT * FROM sla_breaches WHERE id = $1', [breachId]);

  if (!breach) {
    return error(404, "not_found", "breach not found", { id: breachId });
  }

  return ok(breach);
}

// PATCH /api/v1/sla-breaches/:id - update SLA breach (resolution)
export async function handleSlaBreachPatch(req: Request, breachId: string): Promise<Response> {
  const body = await readJson(req);
  const validated = updateSlaBreachSchema.parse(body);

  const existing = await queryOne('SELECT * FROM sla_breaches WHERE id = $1', [breachId]);
  if (!existing) {
    return error(404, "not_found", "breach not found", { id: breachId });
  }

  const updates: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (validated.resolution_status !== undefined) {
    updates.push(`resolution_status = $${paramIndex}`);
    params.push(validated.resolution_status);
    paramIndex++;
  }

  if (validated.resolved_at !== undefined) {
    updates.push(`resolved_at = $${paramIndex}`);
    params.push(validated.resolved_at);
    paramIndex++;
  }

  if (validated.resolution_notes !== undefined) {
    updates.push(`resolution_notes = $${paramIndex}`);
    params.push(validated.resolution_notes);
    paramIndex++;
  }

  if (validated.severity !== undefined) {
    updates.push(`severity = $${paramIndex}`);
    params.push(validated.severity);
    paramIndex++;
  }

  if (validated.impact_description !== undefined) {
    updates.push(`impact_description = $${paramIndex}`);
    params.push(validated.impact_description);
    paramIndex++;
  }

  if (validated.root_cause !== undefined) {
    updates.push(`root_cause = $${paramIndex}`);
    params.push(validated.root_cause);
    paramIndex++;
  }

  if (updates.length === 0) {
    return error(400, "invalid_payload", "no fields to update", {});
  }

  params.push(breachId);
  await query(
    `UPDATE sla_breaches SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
    params
  );

  const updated = await queryOne('SELECT * FROM sla_breaches WHERE id = $1', [breachId]);
  return ok(updated);
}

// DELETE /api/v1/sla-breaches/:id - delete SLA breach
export async function handleSlaBreachDelete(req: Request, breachId: string): Promise<Response> {
  const existing = await queryOne('SELECT * FROM sla_breaches WHERE id = $1', [breachId]);

  if (!existing) {
    return error(404, "not_found", "breach not found", { id: breachId });
  }

  await query('DELETE FROM sla_breaches WHERE id = $1', [breachId]);
  return ok({ deleted: true });
}
