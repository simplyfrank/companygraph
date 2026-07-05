// ddd-system-modeling T-09 (design §4.7, DD-11) —
// /api/v1/models/:modelId/capabilities* + /api/v1/models/:modelId/
// system-model/* handlers.
//
// Auth is the central router gate (router.ts + ROUTE_PERMISSIONS) —
// never per-route (house rule NFR-05). All bodies zod-validated at the
// boundary (T-01 schemas via parseWith); errors ride the standard
// {error:{code,message,details?}} envelope via ValidationError →
// fromValidationError. Error codes are thrown by the storage layer and
// pass through.
//
// The three PUT arms (needed-by / supported-by / context) are the
// codebase's FIRST PUT routes (DD-11) — plain `method === "PUT"`
// string compares; the router is method-generic, no router-core
// change.

import {
  capabilityCreateSchema,
  capabilityPatchSchema,
  neededBySchema,
  supportedBySchema,
  contextAssignSchema,
} from "@companygraph/shared/schema/ddd-system";
import { getDriver } from "../neo4j/driver";
import {
  listCapabilities,
  getCapability,
  createCapability,
  patchCapability,
  deleteCapability,
  addNeededBy,
  removeNeededBy,
  addSupportedBy,
  removeSupportedBy,
  setContext,
  clearContext,
} from "../storage/capabilities";
import { computeGaps, computeContextMap } from "../storage/system-model";
import { noContent, ok, parseWith, readJson } from "./_helpers";

// The exact 13 method+route literal pairs of the dispatch chain below —
// exported so T-08's authz test iterates the FULL list table-driven
// (tasks-review C-03: never a hand-enumerated subset; an unmapped route
// would be a SILENT OPEN WRITE).
export const CAPABILITY_ROUTE_LITERALS: ReadonlyArray<readonly [string, string]> = [
  ["GET", "models/:modelId/system-model/gaps"],
  ["GET", "models/:modelId/system-model/context-map"],
  ["GET", "models/:modelId/capabilities"],
  ["POST", "models/:modelId/capabilities"],
  ["PUT", "models/:modelId/capabilities/:capabilityId/needed-by"],
  ["DELETE", "models/:modelId/capabilities/:capabilityId/needed-by"],
  ["PUT", "models/:modelId/capabilities/:capabilityId/supported-by"],
  ["DELETE", "models/:modelId/capabilities/:capabilityId/supported-by/:systemId"],
  ["PUT", "models/:modelId/capabilities/:capabilityId/context"],
  ["DELETE", "models/:modelId/capabilities/:capabilityId/context"],
  ["GET", "models/:modelId/capabilities/:capabilityId"],
  ["PATCH", "models/:modelId/capabilities/:capabilityId"],
  ["DELETE", "models/:modelId/capabilities/:capabilityId"],
] as const;

// ---------------------------------------------------------------------------
// Handlers (design §4.7)
// ---------------------------------------------------------------------------

export async function handleCapabilityList(_req: Request, modelId: string): Promise<Response> {
  return ok(await listCapabilities(getDriver(), modelId));
}

export async function handleCapabilityCreate(req: Request, modelId: string): Promise<Response> {
  const input = parseWith(capabilityCreateSchema, await readJson(req));
  return ok(await createCapability(getDriver(), modelId, input), 201);
}

export async function handleCapabilityGet(
  _req: Request,
  modelId: string,
  capabilityId: string,
): Promise<Response> {
  return ok(await getCapability(getDriver(), modelId, capabilityId));
}

export async function handleCapabilityPatch(
  req: Request,
  modelId: string,
  capabilityId: string,
): Promise<Response> {
  const input = parseWith(capabilityPatchSchema, await readJson(req));
  return ok(await patchCapability(getDriver(), modelId, capabilityId, input));
}

export async function handleCapabilityDelete(
  _req: Request,
  modelId: string,
  capabilityId: string,
): Promise<Response> {
  await deleteCapability(getDriver(), modelId, capabilityId);
  return noContent();
}

export async function handleNeededByPut(
  req: Request,
  modelId: string,
  capabilityId: string,
): Promise<Response> {
  const input = parseWith(neededBySchema, await readJson(req));
  return ok(await addNeededBy(getDriver(), modelId, capabilityId, input));
}

// Body-carrying DELETE — precedent: DELETE models/:modelId/
// module-instances/:instanceId/edges (design §4.7 / N-03). Kept because
// the source is a two-field discriminated union (activityId|storyId)
// that does not path-encode cleanly.
export async function handleNeededByDelete(
  req: Request,
  modelId: string,
  capabilityId: string,
): Promise<Response> {
  const input = parseWith(neededBySchema, await readJson(req));
  await removeNeededBy(getDriver(), modelId, capabilityId, input);
  return noContent();
}

export async function handleSupportedByPut(
  req: Request,
  modelId: string,
  capabilityId: string,
): Promise<Response> {
  const input = parseWith(supportedBySchema, await readJson(req));
  return ok(await addSupportedBy(getDriver(), modelId, capabilityId, input.systemId));
}

export async function handleSupportedByDelete(
  _req: Request,
  modelId: string,
  capabilityId: string,
  systemId: string,
): Promise<Response> {
  await removeSupportedBy(getDriver(), modelId, capabilityId, systemId);
  return noContent();
}

export async function handleContextPut(
  req: Request,
  modelId: string,
  capabilityId: string,
): Promise<Response> {
  const input = parseWith(contextAssignSchema, await readJson(req));
  return ok(await setContext(getDriver(), modelId, capabilityId, input.boundedContextId));
}

export async function handleContextDelete(
  _req: Request,
  modelId: string,
  capabilityId: string,
): Promise<Response> {
  await clearContext(getDriver(), modelId, capabilityId);
  return noContent();
}

export async function handleGaps(_req: Request, modelId: string): Promise<Response> {
  return ok(await computeGaps(getDriver(), modelId));
}

export async function handleContextMap(_req: Request, modelId: string): Promise<Response> {
  return ok(await computeContextMap(getDriver(), modelId));
}

// ---------------------------------------------------------------------------
// Dispatch delegate (design §4.7) — specific-before-parameterized
// ---------------------------------------------------------------------------

export async function registerCapabilityRoutes(
  method: string,
  sub: string,
  req: Request,
): Promise<Response | null> {
  // (1)+(2) system-model read aggregates — most specific literals first
  const gaps = sub.match(/^models\/([^/]+)\/system-model\/gaps$/);
  if (gaps && method === "GET") return handleGaps(req, gaps[1]!);

  const contextMap = sub.match(/^models\/([^/]+)\/system-model\/context-map$/);
  if (contextMap && method === "GET") return handleContextMap(req, contextMap[1]!);

  // (3) capability collection — GET list, POST create
  const collection = sub.match(/^models\/([^/]+)\/capabilities$/);
  if (collection) {
    if (method === "GET") return handleCapabilityList(req, collection[1]!);
    if (method === "POST") return handleCapabilityCreate(req, collection[1]!);
  }

  // (4) needed-by — PUT (first-PUT dispatch, DD-11), body-carrying DELETE
  const neededBy = sub.match(/^models\/([^/]+)\/capabilities\/([^/]+)\/needed-by$/);
  if (neededBy) {
    if (method === "PUT") return handleNeededByPut(req, neededBy[1]!, neededBy[2]!);
    if (method === "DELETE") return handleNeededByDelete(req, neededBy[1]!, neededBy[2]!);
  }

  // (5) supported-by — PUT
  const supportedBy = sub.match(/^models\/([^/]+)\/capabilities\/([^/]+)\/supported-by$/);
  if (supportedBy && method === "PUT") {
    return handleSupportedByPut(req, supportedBy[1]!, supportedBy[2]!);
  }

  // (6) supported-by/:systemId — DELETE
  const supportedByOne = sub.match(
    /^models\/([^/]+)\/capabilities\/([^/]+)\/supported-by\/([^/]+)$/,
  );
  if (supportedByOne && method === "DELETE") {
    return handleSupportedByDelete(req, supportedByOne[1]!, supportedByOne[2]!, supportedByOne[3]!);
  }

  // (7) context — PUT, DELETE
  const context = sub.match(/^models\/([^/]+)\/capabilities\/([^/]+)\/context$/);
  if (context) {
    if (method === "PUT") return handleContextPut(req, context[1]!, context[2]!);
    if (method === "DELETE") return handleContextDelete(req, context[1]!, context[2]!);
  }

  // (8) capability one — GET, PATCH, DELETE — LAST (parameterized)
  const one = sub.match(/^models\/([^/]+)\/capabilities\/([^/]+)$/);
  if (one) {
    if (method === "GET") return handleCapabilityGet(req, one[1]!, one[2]!);
    if (method === "PATCH") return handleCapabilityPatch(req, one[1]!, one[2]!);
    if (method === "DELETE") return handleCapabilityDelete(req, one[1]!, one[2]!);
  }

  return null;
}
