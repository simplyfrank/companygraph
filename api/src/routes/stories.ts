// story-spec-core T-08 (design §4.3, §3.5, §4.7) —
// /api/v1/models/:modelId/stories* handlers.
//
// Auth is the central router gate (router.ts + ROUTE_PERMISSIONS) —
// never per-route (house rule NFR-05). All bodies zod-validated at the
// boundary (T-01 schemas); errors ride the standard
// {error:{code,message,details?}} envelope via ValidationError →
// fromValidationError.
//
// Two zod→code mappings (design §3.5, §4.3):
//  (1) story create: a zod failure whose path includes `activityId`
//      (missing/empty) → 400 story_activity_required.
//  (2) AC create/patch: a zod failure whose path includes
//      `given`/`when`/`then` → 400 acceptance_criterion_clause_required
//      (NFR-03 — not the generic invalid_payload).
// All other codes (model_not_found, story_not_found,
// story_activity_not_in_model, not_found,
// acceptance_criterion_not_found) are thrown by the storage layer and
// pass through.

import type { z } from "zod";
import {
  storyCreateSchema,
  storyPatchSchema,
  acCreateSchema,
  acPatchSchema,
  bootstrapRequestSchema,
} from "@companygraph/shared/schema/story-spec";
import { getDriver } from "../neo4j/driver";
import { ValidationError } from "../errors";
import {
  listStories,
  createStory,
  getStory,
  patchStory,
  deleteStory,
  listAcs,
  createAc,
  patchAc,
  deleteAc,
  bootstrapStories,
} from "../storage/stories";
import { noContent, ok, readJson } from "./_helpers";

// Zod parse with a per-surface code mapping: any failure whose path
// touches one of `fields` maps to `code` (with details.field); other
// failures fall back to the generic invalid_payload envelope.
function parseMapped<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
  fields: readonly string[],
  code: "story_activity_required" | "acceptance_criterion_clause_required",
): z.infer<S> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const hit = r.error.issues.find((i) => i.path.some((p) => fields.includes(String(p))));
  if (hit) {
    throw new ValidationError(code, { field: String(hit.path[0]) }, 400);
  }
  throw new ValidationError("invalid_payload", {
    issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message, code: i.code })),
  });
}

const AC_CLAUSES = ["given", "when", "then"] as const;

// ---------------------------------------------------------------------------
// Story handlers (FR-05, FR-09)
// ---------------------------------------------------------------------------

export async function handleStoryList(_req: Request, modelId: string): Promise<Response> {
  return ok(await listStories(getDriver(), modelId));
}

export async function handleStoryCreate(req: Request, modelId: string): Promise<Response> {
  const body = await readJson(req);
  const input = parseMapped(storyCreateSchema, body, ["activityId"], "story_activity_required");
  return ok(await createStory(getDriver(), modelId, input), 201);
}

export async function handleStoryBootstrap(req: Request, modelId: string): Promise<Response> {
  // Body is optional — an empty/absent body bootstraps every scoped
  // activity without a story (FR-09).
  let body: unknown = {};
  const text = await req.text();
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ValidationError("invalid_payload", { cause: "request body is not valid JSON" });
    }
  }
  const r = bootstrapRequestSchema.safeParse(body);
  if (!r.success) {
    throw new ValidationError("invalid_payload", {
      issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message, code: i.code })),
    });
  }
  const opts = r.data.activityIds !== undefined ? { activityIds: r.data.activityIds } : undefined;
  return ok(await bootstrapStories(getDriver(), modelId, opts));
}

export async function handleStoryGet(
  _req: Request,
  modelId: string,
  storyId: string,
): Promise<Response> {
  return ok(await getStory(getDriver(), modelId, storyId));
}

export async function handleStoryPatch(
  req: Request,
  modelId: string,
  storyId: string,
): Promise<Response> {
  const body = await readJson(req);
  const r = storyPatchSchema.safeParse(body);
  if (!r.success) {
    throw new ValidationError("invalid_payload", {
      issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message, code: i.code })),
    });
  }
  return ok(await patchStory(getDriver(), modelId, storyId, r.data));
}

export async function handleStoryDelete(
  _req: Request,
  modelId: string,
  storyId: string,
): Promise<Response> {
  await deleteStory(getDriver(), modelId, storyId);
  return noContent();
}

// ---------------------------------------------------------------------------
// AC handlers (FR-06)
// ---------------------------------------------------------------------------

export async function handleAcList(
  _req: Request,
  modelId: string,
  storyId: string,
): Promise<Response> {
  return ok(await listAcs(getDriver(), modelId, storyId));
}

export async function handleAcCreate(
  req: Request,
  modelId: string,
  storyId: string,
): Promise<Response> {
  const body = await readJson(req);
  const input = parseMapped(acCreateSchema, body, AC_CLAUSES, "acceptance_criterion_clause_required");
  return ok(await createAc(getDriver(), modelId, storyId, input), 201);
}

export async function handleAcPatch(
  req: Request,
  modelId: string,
  storyId: string,
  acId: string,
): Promise<Response> {
  const body = await readJson(req);
  const input = parseMapped(acPatchSchema, body, AC_CLAUSES, "acceptance_criterion_clause_required");
  return ok(await patchAc(getDriver(), modelId, storyId, acId, input));
}

export async function handleAcDelete(
  _req: Request,
  modelId: string,
  storyId: string,
  acId: string,
): Promise<Response> {
  await deleteAc(getDriver(), modelId, storyId, acId);
  return noContent();
}

// ---------------------------------------------------------------------------
// Dispatch (T-09 target, design §4.7) — one entry point the router
// delegates to for every /api/v1/models/:modelId/stories* sub-path.
// Returns null when no stories route matches (router falls through).
// Order: specific-before-parameterized (bootstrap + acceptance-criteria
// literals before the :storyId rows) per the house convention.
// ---------------------------------------------------------------------------

export async function registerStoryRoutes(
  method: string,
  sub: string,
  req: Request,
): Promise<Response | null> {
  // (1) collection — GET list, POST create
  const collection = sub.match(/^models\/([^/]+)\/stories$/);
  if (collection) {
    if (method === "GET") return handleStoryList(req, collection[1]!);
    if (method === "POST") return handleStoryCreate(req, collection[1]!);
  }

  // (2) bootstrap — POST
  const bootstrap = sub.match(/^models\/([^/]+)\/stories\/bootstrap$/);
  if (bootstrap && method === "POST") return handleStoryBootstrap(req, bootstrap[1]!);

  // (3) AC collection — GET, POST
  const acCollection = sub.match(/^models\/([^/]+)\/stories\/([^/]+)\/acceptance-criteria$/);
  if (acCollection) {
    if (method === "GET") return handleAcList(req, acCollection[1]!, acCollection[2]!);
    if (method === "POST") return handleAcCreate(req, acCollection[1]!, acCollection[2]!);
  }

  // (4) AC one — PATCH, DELETE
  const acOne = sub.match(
    /^models\/([^/]+)\/stories\/([^/]+)\/acceptance-criteria\/([^/]+)$/,
  );
  if (acOne) {
    if (method === "PATCH") return handleAcPatch(req, acOne[1]!, acOne[2]!, acOne[3]!);
    if (method === "DELETE") return handleAcDelete(req, acOne[1]!, acOne[2]!, acOne[3]!);
  }

  // (5) story one — GET, PATCH, DELETE — LAST (parameterized)
  const one = sub.match(/^models\/([^/]+)\/stories\/([^/]+)$/);
  if (one) {
    if (method === "GET") return handleStoryGet(req, one[1]!, one[2]!);
    if (method === "PATCH") return handleStoryPatch(req, one[1]!, one[2]!);
    if (method === "DELETE") return handleStoryDelete(req, one[1]!, one[2]!);
  }

  return null;
}
