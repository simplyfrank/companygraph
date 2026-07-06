// kpi-impact-mapping T-08 (design §4.7, §4.1, N-01, N-03) — 8 route handlers.

import { getDriver } from "../neo4j/driver";
import { ok, noContent, error, parseWith, readJson } from "./_helpers";
import { ValidationError } from "../errors";
import {
  createActivityLink,
  listActivityLinks,
  deleteActivityLink,
  createStoryLink,
  listStoryLinks,
  deleteStoryLink,
  readMatrixInputs,
  readRollupInputs,
} from "../storage/kpi-impact";
import { assembleMatrix, assembleRollup } from "../derive/kpi-impact-matrix";
import {
  activityLinkCreateSchema,
  storyLinkCreateSchema,
} from "@companygraph/shared/schema/kpi-impact";
import { handleKpiTrendsGet } from "./kpi-trends";

// T-06/DD-03/DD-04: server-side in-process composition of the governed
// kpi-trends route (no network round-trip, no direct store query, NFR-02).
// A non-ok response (e.g. the KPI is archived → 404) is a per-KPI miss →
// null → no_data. A THROWN error (the measurement source is unreachable)
// is deliberately NOT swallowed: it propagates so readRollupInputs can
// flip measurementsAvailable=false and degrade the whole roll-up to
// no_data rather than 500-ing (§4.6, FR-09).
async function fetchTrends(kpiId: string): Promise<{ measurements: Array<{ value: number }> } | null> {
  const req = new Request(`http://localhost/api/v1/kpi-trends/${kpiId}`);
  const res = await handleKpiTrendsGet(req, kpiId);
  if (!res.ok) return null;
  const body = await res.json();
  return body as { measurements: Array<{ value: number }> };
}

// ── Route registration (T-08, design §4.7, N-03) ──────────────────────
// Eight endpoints, specific-before-parameterized (5-segment DELETEs
// before 4-segment list/create). Auth stays in the central gate.

export async function registerKpiImpactRoutes(
  method: string,
  sub: string,
  req: Request,
): Promise<Response | null> {
  // GET …/matrix
  const matrixMatch = sub.match(/^models\/([^/]+)\/kpi-impact\/matrix$/);
  if (matrixMatch && method === "GET") return handleMatrix(req, matrixMatch[1]!);

  // GET …/rollup
  const rollupMatch = sub.match(/^models\/([^/]+)\/kpi-impact\/rollup$/);
  if (rollupMatch && method === "GET") return handleRollup(req, rollupMatch[1]!);

  // GET/POST …/activity-links
  const actLinksMatch = sub.match(/^models\/([^/]+)\/kpi-impact\/activity-links$/);
  if (actLinksMatch) {
    if (method === "GET") return handleActivityLinksList(req, actLinksMatch[1]!);
    if (method === "POST") return handleActivityLinkCreate(req, actLinksMatch[1]!);
  }

  // DELETE …/activity-links/:linkId
  const actLinkDeleteMatch = sub.match(/^models\/([^/]+)\/kpi-impact\/activity-links\/([^/]+)$/);
  if (actLinkDeleteMatch && method === "DELETE") return handleActivityLinkDelete(req, actLinkDeleteMatch[1]!, decodeURIComponent(actLinkDeleteMatch[2]!));

  // GET/POST …/story-links
  const storyLinksMatch = sub.match(/^models\/([^/]+)\/kpi-impact\/story-links$/);
  if (storyLinksMatch) {
    if (method === "GET") return handleStoryLinksList(req, storyLinksMatch[1]!);
    if (method === "POST") return handleStoryLinkCreate(req, storyLinksMatch[1]!);
  }

  // DELETE …/story-links/:linkId
  const storyLinkDeleteMatch = sub.match(/^models\/([^/]+)\/kpi-impact\/story-links\/([^/]+)$/);
  if (storyLinkDeleteMatch && method === "DELETE") return handleStoryLinkDelete(req, storyLinkDeleteMatch[1]!, decodeURIComponent(storyLinkDeleteMatch[2]!));

  return null;
}

// ── Activity links ──

export async function handleActivityLinkCreate(
  req: Request,
  modelId: string,
): Promise<Response> {
  const body = parseWith(activityLinkCreateSchema, await readJson(req));
  try {
    const row = await createActivityLink(getDriver(), modelId, body);
    return ok(row, 201);
  } catch (e) {
    if (e instanceof ValidationError) {
      return error(e.httpStatus, e.code, e.code, e.details);
    }
    throw e;
  }
}

export async function handleActivityLinksList(
  req: Request,
  modelId: string,
): Promise<Response> {
  const url = new URL(req.url);
  const filters: { activityId?: string; kpiId?: string } = {};
  const activityId = url.searchParams.get("activityId");
  if (activityId) filters.activityId = activityId;
  const kpiId = url.searchParams.get("kpiId");
  if (kpiId) filters.kpiId = kpiId;
  const rows = await listActivityLinks(getDriver(), modelId, filters);
  return ok({ rows });
}

export async function handleActivityLinkDelete(
  _req: Request,
  modelId: string,
  linkId: string,
): Promise<Response> {
  try {
    await deleteActivityLink(getDriver(), modelId, linkId);
    return noContent();
  } catch (e) {
    if (e instanceof ValidationError) {
      return error(e.httpStatus, e.code, e.code, e.details);
    }
    throw e;
  }
}

// ── Story links ──

export async function handleStoryLinkCreate(
  req: Request,
  modelId: string,
): Promise<Response> {
  const body = parseWith(storyLinkCreateSchema, await readJson(req));
  try {
    const row = await createStoryLink(getDriver(), modelId, body);
    return ok(row, 201);
  } catch (e) {
    if (e instanceof ValidationError) {
      return error(e.httpStatus, e.code, e.code, e.details);
    }
    throw e;
  }
}

export async function handleStoryLinksList(
  req: Request,
  modelId: string,
): Promise<Response> {
  const url = new URL(req.url);
  const filters: { storyId?: string; kpiId?: string } = {};
  const storyId = url.searchParams.get("storyId");
  if (storyId) filters.storyId = storyId;
  const kpiId = url.searchParams.get("kpiId");
  if (kpiId) filters.kpiId = kpiId;
  const rows = await listStoryLinks(getDriver(), modelId, filters);
  return ok({ rows });
}

export async function handleStoryLinkDelete(
  _req: Request,
  modelId: string,
  linkId: string,
): Promise<Response> {
  try {
    await deleteStoryLink(getDriver(), modelId, linkId);
    return noContent();
  } catch (e) {
    if (e instanceof ValidationError) {
      return error(e.httpStatus, e.code, e.code, e.details);
    }
    throw e;
  }
}

// ── Matrix + Rollup ──

export async function handleMatrix(
  _req: Request,
  modelId: string,
): Promise<Response> {
  const { found, input } = await readMatrixInputs(getDriver(), modelId);
  if (!found) {
    return error(404, "model_not_found", "model not found", { modelId });
  }
  const matrix = assembleMatrix(input);
  return ok(matrix);
}

export async function handleRollup(
  _req: Request,
  modelId: string,
): Promise<Response> {
  try {
    const { found, input } = await readRollupInputs(getDriver(), modelId, fetchTrends);
    if (!found) {
      return error(404, "model_not_found", "model not found", { modelId });
    }
    const rollup = assembleRollup(input);
    return ok(rollup);
  } catch {
    // FR-09: degrade to no_data + measurementsAvailable:false, never 500
    return ok({
      rows: [],
      meta: { kpiCount: 0, measurementsAvailable: false },
    });
  }
}
