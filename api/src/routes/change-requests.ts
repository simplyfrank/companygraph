import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../storage/postgres/client';
import { ok, error, readJson } from './_helpers';

// Validation schemas
const createChangeRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  author: z.string().min(1),
  draftSnapshot: z.object({}).passthrough(),
  baseSnapshot: z.object({}).passthrough(),
  diff: z.object({}).passthrough(),
  dependencyImpacts: z.array(z.object({}).passthrough()).default([]),
});

const updateChangeRequestSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  status: z.enum(['draft', 'pending_review', 'approved', 'rejected', 'released']).optional(),
  draftSnapshot: z.object({}).passthrough().optional(),
  diff: z.object({}).passthrough().optional(),
  dependencyImpacts: z.array(z.object({}).passthrough()).optional(),
});

const createReviewSchema = z.object({
  reviewer: z.string().min(1),
  reviewerRole: z.enum(['entity_manager', 'domain_manager', 'technical_lead']),
  status: z.enum(['approved', 'rejected', 'changes_requested']),
  comment: z.string().min(1),
});

const createSignOffSchema = z.object({
  signer: z.string().min(1),
  signerRole: z.enum(['entity_manager', 'domain_manager']),
  status: z.enum(['signed', 'declined']),
  comment: z.string().optional(),
});

// GET /change-requests - List all change requests
export async function handleChangeRequestsList(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const author = url.searchParams.get('author');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  let queryText = 'SELECT * FROM change_requests WHERE 1=1';
  const params: any[] = [];
  let paramIndex = 1;

  if (status) {
    queryText += ` AND status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (author) {
    queryText += ` AND author = $${paramIndex}`;
    params.push(author);
    paramIndex++;
  }

  queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const changeRequests = await query(queryText, params);

  // Get reviews and sign-offs for each change request
  for (const cr of changeRequests) {
    const reviews = await query(
      'SELECT * FROM reviews WHERE change_request_id = $1 ORDER BY created_at DESC',
      [cr.id]
    );
    const signOffs = await query(
      'SELECT * FROM sign_offs WHERE change_request_id = $1 ORDER BY created_at DESC',
      [cr.id]
    );
    (cr as any).reviews = reviews;
    (cr as any).signOffs = signOffs;
  }

  return ok({ data: changeRequests, limit, offset });
}

// GET /change-requests/:id - Get a specific change request
export async function handleChangeRequestGet(req: Request, id: string): Promise<Response> {
  const changeRequest = await queryOne('SELECT * FROM change_requests WHERE id = $1', [id]);

  if (!changeRequest) {
    return error(404, 'not_found', 'Change request not found', { id });
  }

  const reviews = await query(
    'SELECT * FROM reviews WHERE change_request_id = $1 ORDER BY created_at DESC',
    [id]
  );
  const signOffs = await query(
    'SELECT * FROM sign_offs WHERE change_request_id = $1 ORDER BY created_at DESC',
    [id]
  );

  return ok({ ...changeRequest, reviews, signOffs });
}

// POST /change-requests - Create a new change request
export async function handleChangeRequestCreate(req: Request): Promise<Response> {
  const body = await readJson(req);
  const validated = createChangeRequestSchema.parse(body);

  const id = uuidv4();
  const now = new Date().toISOString();

  await query(
    `INSERT INTO change_requests (id, title, description, author, created_at, updated_at, status, draft_snapshot, base_snapshot, diff, dependency_impacts)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      validated.title,
      validated.description,
      validated.author,
      now,
      now,
      'draft',
      JSON.stringify(validated.draftSnapshot),
      JSON.stringify(validated.baseSnapshot),
      JSON.stringify(validated.diff),
      JSON.stringify(validated.dependencyImpacts),
    ]
  );

  const changeRequest = await queryOne('SELECT * FROM change_requests WHERE id = $1', [id]);
  return ok(changeRequest, 201);
}

// PATCH /change-requests/:id - Update a change request
export async function handleChangeRequestPatch(req: Request, id: string): Promise<Response> {
  const body = await readJson(req);
  const validated = updateChangeRequestSchema.parse(body);

  const existing = await queryOne('SELECT * FROM change_requests WHERE id = $1', [id]);
  if (!existing) {
    return error(404, 'not_found', 'Change request not found', { id });
  }

  const updates: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (validated.title !== undefined) {
    updates.push(`title = $${paramIndex}`);
    params.push(validated.title);
    paramIndex++;
  }

  if (validated.description !== undefined) {
    updates.push(`description = $${paramIndex}`);
    params.push(validated.description);
    paramIndex++;
  }

  if (validated.status !== undefined) {
    updates.push(`status = $${paramIndex}`);
    params.push(validated.status);
    paramIndex++;
  }

  if (validated.draftSnapshot !== undefined) {
    updates.push(`draft_snapshot = $${paramIndex}`);
    params.push(JSON.stringify(validated.draftSnapshot));
    paramIndex++;
  }

  if (validated.diff !== undefined) {
    updates.push(`diff = $${paramIndex}`);
    params.push(JSON.stringify(validated.diff));
    paramIndex++;
  }

  if (validated.dependencyImpacts !== undefined) {
    updates.push(`dependency_impacts = $${paramIndex}`);
    params.push(JSON.stringify(validated.dependencyImpacts));
    paramIndex++;
  }

  if (updates.length === 0) {
    return error(400, 'bad_request', 'No valid fields to update', {});
  }

  params.push(id);
  await query(
    `UPDATE change_requests SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
    params
  );

  const updated = await queryOne('SELECT * FROM change_requests WHERE id = $1', [id]);
  return ok(updated);
}

// DELETE /change-requests/:id - Delete a change request
export async function handleChangeRequestDelete(req: Request, id: string): Promise<Response> {
  const existing = await queryOne('SELECT * FROM change_requests WHERE id = $1', [id]);

  if (!existing) {
    return error(404, 'not_found', 'Change request not found', { id });
  }

  await query('DELETE FROM change_requests WHERE id = $1', [id]);
  return ok({ message: 'Change request deleted' }, 200);
}

// POST /change-requests/:id/reviews - Add a review to a change request
export async function handleChangeRequestReviewCreate(req: Request, id: string): Promise<Response> {
  const body = await readJson(req);
  const validated = createReviewSchema.parse(body);

  const existing = await queryOne('SELECT * FROM change_requests WHERE id = $1', [id]);
  if (!existing) {
    return error(404, 'not_found', 'Change request not found', { id });
  }

  const reviewId = uuidv4();
  const now = new Date().toISOString();

  await query(
    `INSERT INTO reviews (id, change_request_id, reviewer, reviewer_role, status, comment, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [reviewId, id, validated.reviewer, validated.reviewerRole, validated.status, validated.comment, now, now]
  );

  const review = await queryOne('SELECT * FROM reviews WHERE id = $1', [reviewId]);
  return ok(review, 201);
}

// POST /change-requests/:id/sign-offs - Add a sign-off to a change request
export async function handleChangeRequestSignOffCreate(req: Request, id: string): Promise<Response> {
  const body = await readJson(req);
  const validated = createSignOffSchema.parse(body);

  const existing = await queryOne('SELECT * FROM change_requests WHERE id = $1', [id]);
  if (!existing) {
    return error(404, 'not_found', 'Change request not found', { id });
  }

  const signOffId = uuidv4();
  const now = new Date().toISOString();
  const signedAt = validated.status === 'signed' ? now : null;

  await query(
    `INSERT INTO sign_offs (id, change_request_id, signer, signer_role, status, signed_at, comment, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [signOffId, id, validated.signer, validated.signerRole, validated.status, signedAt, validated.comment, now]
  );

  const signOff = await queryOne('SELECT * FROM sign_offs WHERE id = $1', [signOffId]);
  return ok(signOff, 201);
}
