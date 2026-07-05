// key-activity-optimizer T-08 (design §4.7) —
// /api/v1/models/:modelId/key-activities* handlers.
//
// Auth is the central router gate (router.ts → getRoutePermission →
// RBAC check) — never per-route (house rule NFR-06). All three handlers
// open with the getModel existence gate (it runs INSIDE the storage
// functions — not re-implemented here); 404s on the mark/unmark paths
// are sequenced model_not_found (unknown model) → activity_not_found
// (non-scoped activity) per cold-pass B-01. Errors ride the standard
// {error:{code,message,details?}} envelope via ValidationError →
// fromValidationError (router catch).
//
// The mark request has NO body and the unmark request has NO body
// (design §3.2 — scores are snapshotted server-side, never
// client-supplied); both take only path params.

import { getDriver } from "../neo4j/driver";
import { computeScores, markActivity, unmarkActivity } from "../storage/key-activities";
import { noContent, ok } from "./_helpers";

// GET /models/:modelId/key-activities → 200 keyActivityScoresSchema.
// Unknown model → 404 model_not_found (getModel gate). An existing
// model with ZERO scoped activities → 200 rows:[] / activityCount:0 —
// never a 404 (cold-pass B-01; the board's empty state keys on this,
// AC-12).
export async function handleKeyActivityScores(
  _req: Request,
  modelId: string,
): Promise<Response> {
  return ok(await computeScores(getDriver(), modelId));
}

// POST /models/:modelId/key-activities/:activityId/mark → 200
// activityScoreRowSchema (key populated).
export async function handleKeyActivityMark(
  _req: Request,
  modelId: string,
  activityId: string,
): Promise<Response> {
  return ok(await markActivity(getDriver(), modelId, activityId));
}

// DELETE /models/:modelId/key-activities/:activityId/mark → 204;
// unmark of unmarked → 204 (idempotent true no-op, T-05).
export async function handleKeyActivityUnmark(
  _req: Request,
  modelId: string,
  activityId: string,
): Promise<Response> {
  await unmarkActivity(getDriver(), modelId, activityId);
  return noContent();
}

// Dispatch block (design §4.7) — called from router.ts AFTER the
// models* and stories* blocks; specific-before-parameterized per the
// house convention (the `mark` literal never collides with the bare
// `key-activities` path — different segment counts — but ordering is
// kept anyway).
export async function registerKeyActivityRoutes(
  method: string,
  sub: string,
  req: Request,
): Promise<Response | null> {
  const scores = sub.match(/^models\/([^/]+)\/key-activities$/);
  if (scores && method === "GET") return handleKeyActivityScores(req, scores[1]!);

  const mark = sub.match(/^models\/([^/]+)\/key-activities\/([^/]+)\/mark$/);
  if (mark) {
    if (method === "POST") return handleKeyActivityMark(req, mark[1]!, mark[2]!);
    if (method === "DELETE") return handleKeyActivityUnmark(req, mark[1]!, mark[2]!);
  }

  return null;
}
