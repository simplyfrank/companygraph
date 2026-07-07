import { generateId } from '../ids';
import { query, queryOne } from '../storage/postgres/client';
import { ok, error, readJson, parseWith } from './_helpers';
// Validation schemas moved to the shared module (design DD-05) so the
// runtime routes and OpenAPI share one zod source. Identical schemas —
// the `dependencyImpacts` `.default([])` runtime default is preserved
// (N-01). Aliased to the local names to keep the call sites unchanged.
import {
  changeRequestCreateSchema as createChangeRequestSchema,
  changeRequestPatchSchema as updateChangeRequestSchema,
  reviewCreateSchema as createReviewSchema,
  signOffCreateSchema as createSignOffSchema,
} from '@companygraph/shared/schema/risk-change';

// FR-11 / DEC-01 — minimal change-request status transition guard.
// The status vocabulary is the verified as-built enum shared by
// migration 001 (CHECK) and updateChangeRequestSchema below:
// ('draft','pending_review','approved','rejected','released').
// Only the allowed EDGES between those states are the DEC-01 decision;
// reviews/sign-offs stay advisory (DEC-02 — they do NOT auto-transition).
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ['pending_review'],
  pending_review: ['approved', 'rejected', 'draft'],
  approved: ['released'],
  rejected: ['draft'],
  released: [],
};

function isAllowedTransition(from: string, to: string): boolean {
  if (from === to) return true; // identity no-op always allowed
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

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
  const validated = parseWith(createChangeRequestSchema, body);

  const id = generateId();
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
  const validated = parseWith(updateChangeRequestSchema, body);

  const existing = await queryOne('SELECT * FROM change_requests WHERE id = $1', [id]);
  if (!existing) {
    return error(404, 'not_found', 'Change request not found', { id });
  }

  // FR-11 / DEC-01 — reject out-of-lifecycle status jumps. Only checked
  // when the patch carries a status; identity + non-status patches pass.
  if (validated.status !== undefined) {
    const from = existing.status as string;
    const to = validated.status;
    if (!isAllowedTransition(from, to)) {
      return error(
        400,
        'invalid_transition',
        `change request cannot move from '${from}' to '${to}'`,
        { from, to }
      );
    }
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
  const validated = parseWith(createReviewSchema, body);

  const existing = await queryOne('SELECT * FROM change_requests WHERE id = $1', [id]);
  if (!existing) {
    return error(404, 'not_found', 'Change request not found', { id });
  }

  const reviewId = generateId();
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
  const validated = parseWith(createSignOffSchema, body);

  const existing = await queryOne('SELECT * FROM change_requests WHERE id = $1', [id]);
  if (!existing) {
    return error(404, 'not_found', 'Change request not found', { id });
  }

  const signOffId = generateId();
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
