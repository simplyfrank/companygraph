import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../storage/postgres/client';
import { ok, error, readJson } from './_helpers';

// Validation schemas
const createRiskSchema = z.object({
  name: z.string().min(1),
  owner: z.string().min(1),
  domain: z.string().min(1),
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  status: z.enum(['open', 'mitigating', 'accepted', 'resolved']),
  trend: z.enum(['up', 'flat', 'down']),
  description: z.string().optional(),
  mitigation_plan: z.string().optional(),
  category: z.string().optional(),
  risk_type: z.enum(['strategic', 'operational', 'financial', 'compliance', 'security', 'technical']).optional(),
  linked_entity_type: z.string().optional(),
  linked_entity_id: z.string().optional(),
  risk_owner_id: z.string().optional(),
  escalation_level: z.number().int().min(1).max(5).optional(),
});

const updateRiskSchema = z.object({
  name: z.string().min(1).optional(),
  owner: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  likelihood: z.number().int().min(1).max(5).optional(),
  impact: z.number().int().min(1).max(5).optional(),
  status: z.enum(['open', 'mitigating', 'accepted', 'resolved']).optional(),
  trend: z.enum(['up', 'flat', 'down']).optional(),
  description: z.string().optional(),
  mitigation_plan: z.string().optional(),
  category: z.string().optional(),
  risk_type: z.enum(['strategic', 'operational', 'financial', 'compliance', 'security', 'technical']).optional(),
  linked_entity_type: z.string().optional(),
  linked_entity_id: z.string().optional(),
  risk_owner_id: z.string().optional(),
  escalation_level: z.number().int().min(1).max(5).optional(),
});

// GET /risk-register - List all risks
export async function handleRiskRegisterList(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const owner = url.searchParams.get('owner');
  const domain = url.searchParams.get('domain');
  const status = url.searchParams.get('status');
  const category = url.searchParams.get('category');
  const risk_type = url.searchParams.get('risk_type');
  const linked_entity_type = url.searchParams.get('linked_entity_type');
  const linked_entity_id = url.searchParams.get('linked_entity_id');
  const escalation_level = url.searchParams.get('escalation_level');

  let queryText = 'SELECT * FROM risk_register WHERE 1=1';
  const params: any[] = [];
  let paramIndex = 1;

  if (owner) {
    queryText += ` AND owner = $${paramIndex}`;
    params.push(owner);
    paramIndex++;
  }

  if (domain) {
    queryText += ` AND domain = $${paramIndex}`;
    params.push(domain);
    paramIndex++;
  }

  if (status) {
    queryText += ` AND status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (category) {
    queryText += ` AND category = $${paramIndex}`;
    params.push(category);
    paramIndex++;
  }

  if (risk_type) {
    queryText += ` AND risk_type = $${paramIndex}`;
    params.push(risk_type);
    paramIndex++;
  }

  if (linked_entity_type) {
    queryText += ` AND linked_entity_type = $${paramIndex}`;
    params.push(linked_entity_type);
    paramIndex++;
  }

  if (linked_entity_id) {
    queryText += ` AND linked_entity_id = $${paramIndex}`;
    params.push(linked_entity_id);
    paramIndex++;
  }

  if (escalation_level) {
    queryText += ` AND escalation_level >= $${paramIndex}`;
    params.push(parseInt(escalation_level));
    paramIndex++;
  }

  queryText += ' ORDER BY (likelihood * impact) DESC, created_at DESC';

  const risks = await query(queryText, params);
  return ok({ data: risks });
}

// GET /risk-register/:id - Get a specific risk
export async function handleRiskRegisterGet(req: Request, id: string): Promise<Response> {
  const risk = await queryOne('SELECT * FROM risk_register WHERE id = $1', [id]);

  if (!risk) {
    return error(404, 'not_found', 'Risk not found', { id });
  }

  return ok(risk);
}

// POST /risk-register - Create a new risk
export async function handleRiskRegisterCreate(req: Request): Promise<Response> {
  const body = await readJson(req);
  const validated = createRiskSchema.parse(body);

  const id = uuidv4();
  const now = new Date().toISOString();

  await query(
    `INSERT INTO risk_register (id, name, owner, domain, likelihood, impact, status, trend, description, mitigation_plan, category, risk_type, linked_entity_type, linked_entity_id, risk_owner_id, escalation_level, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      id,
      validated.name,
      validated.owner,
      validated.domain,
      validated.likelihood,
      validated.impact,
      validated.status,
      validated.trend,
      validated.description || null,
      validated.mitigation_plan || null,
      validated.category || null,
      validated.risk_type || null,
      validated.linked_entity_type || null,
      validated.linked_entity_id || null,
      validated.risk_owner_id || null,
      validated.escalation_level || 1,
      now,
      now,
    ]
  );

  const risk = await queryOne('SELECT * FROM risk_register WHERE id = $1', [id]);
  return ok(risk, 201);
}

// PATCH /risk-register/:id - Update a risk
export async function handleRiskRegisterPatch(req: Request, id: string): Promise<Response> {
  const body = await readJson(req);
  const validated = updateRiskSchema.parse(body);

  const existing = await queryOne('SELECT * FROM risk_register WHERE id = $1', [id]);
  if (!existing) {
    return error(404, 'not_found', 'Risk not found', { id });
  }

  const updates: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (validated.name !== undefined) {
    updates.push(`name = $${paramIndex}`);
    params.push(validated.name);
    paramIndex++;
  }

  if (validated.owner !== undefined) {
    updates.push(`owner = $${paramIndex}`);
    params.push(validated.owner);
    paramIndex++;
  }

  if (validated.domain !== undefined) {
    updates.push(`domain = $${paramIndex}`);
    params.push(validated.domain);
    paramIndex++;
  }

  if (validated.likelihood !== undefined) {
    updates.push(`likelihood = $${paramIndex}`);
    params.push(validated.likelihood);
    paramIndex++;
  }

  if (validated.impact !== undefined) {
    updates.push(`impact = $${paramIndex}`);
    params.push(validated.impact);
    paramIndex++;
  }

  if (validated.status !== undefined) {
    updates.push(`status = $${paramIndex}`);
    params.push(validated.status);
    paramIndex++;
  }

  if (validated.trend !== undefined) {
    updates.push(`trend = $${paramIndex}`);
    params.push(validated.trend);
    paramIndex++;
  }

  if (validated.description !== undefined) {
    updates.push(`description = $${paramIndex}`);
    params.push(validated.description);
    paramIndex++;
  }

  if (validated.mitigation_plan !== undefined) {
    updates.push(`mitigation_plan = $${paramIndex}`);
    params.push(validated.mitigation_plan);
    paramIndex++;
  }

  if (validated.category !== undefined) {
    updates.push(`category = $${paramIndex}`);
    params.push(validated.category);
    paramIndex++;
  }

  if (validated.risk_type !== undefined) {
    updates.push(`risk_type = $${paramIndex}`);
    params.push(validated.risk_type);
    paramIndex++;
  }

  if (validated.linked_entity_type !== undefined) {
    updates.push(`linked_entity_type = $${paramIndex}`);
    params.push(validated.linked_entity_type);
    paramIndex++;
  }

  if (validated.linked_entity_id !== undefined) {
    updates.push(`linked_entity_id = $${paramIndex}`);
    params.push(validated.linked_entity_id);
    paramIndex++;
  }

  if (validated.risk_owner_id !== undefined) {
    updates.push(`risk_owner_id = $${paramIndex}`);
    params.push(validated.risk_owner_id);
    paramIndex++;
  }

  if (validated.escalation_level !== undefined) {
    updates.push(`escalation_level = $${paramIndex}`);
    params.push(validated.escalation_level);
    paramIndex++;
  }

  if (updates.length === 0) {
    return error(400, 'invalid_payload', 'No valid fields to update', {});
  }

  params.push(id);
  await query(
    `UPDATE risk_register SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
    params
  );

  const updated = await queryOne('SELECT * FROM risk_register WHERE id = $1', [id]);
  return ok(updated);
}

// DELETE /risk-register/:id - Delete a risk
export async function handleRiskRegisterDelete(req: Request, id: string): Promise<Response> {
  const existing = await queryOne('SELECT * FROM risk_register WHERE id = $1', [id]);

  if (!existing) {
    return error(404, 'not_found', 'Risk not found', { id });
  }

  await query('DELETE FROM risk_register WHERE id = $1', [id]);
  return ok({ message: 'Risk deleted' }, 200);
}

// GET /risk-register/aggregation/domain - Risk rollup by domain
export async function handleRiskAggregationByDomain(req: Request): Promise<Response> {
  const result = await query(`
    SELECT 
      domain,
      COUNT(*) as total_risks,
      COUNT(*) FILTER (WHERE status = 'open') as open_risks,
      COUNT(*) FILTER (WHERE status = 'mitigating') as mitigating_risks,
      COUNT(*) FILTER (WHERE status = 'resolved') as resolved_risks,
      AVG(likelihood * impact) as avg_severity,
      MAX(likelihood * impact) as max_severity,
      COUNT(*) FILTER (WHERE escalation_level >= 3) as escalated_risks
    FROM risk_register
    GROUP BY domain
    ORDER BY avg_severity DESC
  `);
  return ok({ data: result });
}

// GET /risk-register/aggregation/owner - Risk rollup by owner
export async function handleRiskAggregationByOwner(req: Request): Promise<Response> {
  const result = await query(`
    SELECT 
      owner,
      COUNT(*) as total_risks,
      COUNT(*) FILTER (WHERE status = 'open') as open_risks,
      COUNT(*) FILTER (WHERE status = 'mitigating') as mitigating_risks,
      COUNT(*) FILTER (WHERE status = 'resolved') as resolved_risks,
      AVG(likelihood * impact) as avg_severity,
      MAX(likelihood * impact) as max_severity,
      COUNT(*) FILTER (WHERE escalation_level >= 3) as escalated_risks
    FROM risk_register
    GROUP BY owner
    ORDER BY total_risks DESC
  `);
  return ok({ data: result });
}

// GET /risk-register/aggregation/category - Risk rollup by category
export async function handleRiskAggregationByCategory(req: Request): Promise<Response> {
  const result = await query(`
    SELECT 
      COALESCE(category, 'Uncategorized') as category,
      COUNT(*) as total_risks,
      COUNT(*) FILTER (WHERE status = 'open') as open_risks,
      COUNT(*) FILTER (WHERE status = 'mitigating') as mitigating_risks,
      COUNT(*) FILTER (WHERE status = 'resolved') as resolved_risks,
      AVG(likelihood * impact) as avg_severity,
      MAX(likelihood * impact) as max_severity
    FROM risk_register
    GROUP BY category
    ORDER BY total_risks DESC
  `);
  return ok({ data: result });
}

// GET /risk-register/aggregation/risk-type - Risk rollup by risk type
export async function handleRiskAggregationByRiskType(req: Request): Promise<Response> {
  const result = await query(`
    SELECT 
      COALESCE(risk_type, 'Unclassified') as risk_type,
      COUNT(*) as total_risks,
      COUNT(*) FILTER (WHERE status = 'open') as open_risks,
      COUNT(*) FILTER (WHERE status = 'mitigating') as mitigating_risks,
      COUNT(*) FILTER (WHERE status = 'resolved') as resolved_risks,
      AVG(likelihood * impact) as avg_severity,
      MAX(likelihood * impact) as max_severity
    FROM risk_register
    GROUP BY risk_type
    ORDER BY total_risks DESC
  `);
  return ok({ data: result });
}

// GET /risk-register/aggregation/summary - Organizational risk summary
export async function handleRiskAggregationSummary(req: Request): Promise<Response> {
  const result = await query(`
    SELECT 
      COUNT(*) as total_risks,
      COUNT(*) FILTER (WHERE status = 'open') as open_risks,
      COUNT(*) FILTER (WHERE status = 'mitigating') as mitigating_risks,
      COUNT(*) FILTER (WHERE status = 'accepted') as accepted_risks,
      COUNT(*) FILTER (WHERE status = 'resolved') as resolved_risks,
      AVG(likelihood * impact) as avg_severity,
      MAX(likelihood * impact) as max_severity,
      COUNT(*) FILTER (WHERE likelihood * impact >= 16) as critical_risks,
      COUNT(*) FILTER (WHERE likelihood * impact >= 9 AND likelihood * impact < 16) as high_risks,
      COUNT(*) FILTER (WHERE likelihood * impact >= 4 AND likelihood * impact < 9) as medium_risks,
      COUNT(*) FILTER (WHERE likelihood * impact < 4) as low_risks,
      COUNT(*) FILTER (WHERE escalation_level >= 3) as escalated_risks,
      COUNT(DISTINCT domain) as domains_affected,
      COUNT(DISTINCT owner) as owners_involved
    FROM risk_register
  `);
  return ok({ data: result[0] });
}

