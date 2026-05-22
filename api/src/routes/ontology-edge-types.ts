// T-18b — REST handlers for the edge-type registry (design §4.2).
//
// Routes (all under /api/v1/ontology/edge-types):
//   GET    /                    → listEdgeTypes → 200 [EdgeTypeRow]
//   POST   /                    → createEdgeType → 201 EdgeTypeRow
//   GET    /:name               → getEdgeType → 200 EdgeTypeRow | 404
//   PATCH  /:name               → patchEdgeType → 200 EdgeTypeRow | 404 | 409
//   DELETE /:name               → deleteEdgeType → 204 | 404 | 409
//
// Same mutation/emit pattern as ontology-node-labels.ts (T-18a).
// `?confirm_migration_step_id=<id>` on DELETE forwarded to storage.
// `?actor=<string>` names the actor, defaults to "api".

import { getDriver } from "../neo4j/driver";
import {
  createEdgeType,
  getEdgeType,
  listEdgeTypes,
  patchEdgeType,
  deleteEdgeType,
} from "../ontology/storage/edge-types";
import { ontologyEvents } from "../ontology/events";
import { generateId } from "../ids";
import {
  edgeTypeCreateSchema,
  edgeTypePatchSchema,
} from "@companygraph/shared/schema/ontology";
import { ERROR_CODE_THROWERS } from "../ontology/error-throwers";
import {
  ok,
  noContent,
  error,
  readJson,
  parseEdgeTypeName,
} from "./_helpers";

function actor(url: URL): string {
  return url.searchParams.get("actor") ?? "api";
}

// POST /api/v1/ontology/edge-types
export async function handleCreateEdgeType(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const body = await readJson(req);
  const parsed = edgeTypeCreateSchema.safeParse(body);
  if (!parsed.success) {
    ERROR_CODE_THROWERS.invalid_payload({
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }
  const row = await createEdgeType(getDriver(), parsed.data!, actor(url));
  ontologyEvents.emit("ontology.changed", {
    event_id: generateId(),
    version_id: generateId(),
    ts: new Date().toISOString(),
    diff: [{ op: "add", path: `/edgeTypes/${row.name}`, value: row }],
  });
  return ok(row, 201);
}

// GET /api/v1/ontology/edge-types
export async function handleListEdgeTypes(): Promise<Response> {
  const rows = await listEdgeTypes(getDriver());
  return ok(rows);
}

// GET /api/v1/ontology/edge-types/:name
export async function handleGetEdgeType(
  _req: Request,
  name: string,
): Promise<Response> {
  const valid = await parseEdgeTypeName(name);
  if (!valid) return error(404, "not_found", `edge type '${name}' not found`, { name });
  const row = await getEdgeType(getDriver(), valid);
  if (!row) return error(404, "not_found", `edge type '${name}' not found`, { name });
  return ok(row);
}

// PATCH /api/v1/ontology/edge-types/:name
export async function handlePatchEdgeType(
  req: Request,
  name: string,
): Promise<Response> {
  const url = new URL(req.url);
  const valid = await parseEdgeTypeName(name);
  if (!valid) return error(404, "not_found", `edge type '${name}' not found`, { name });

  const body = await readJson(req);
  const parsed = edgeTypePatchSchema.safeParse(body);
  if (!parsed.success) {
    ERROR_CODE_THROWERS.invalid_payload({
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const row = await patchEdgeType(getDriver(), valid, parsed.data!, actor(url));
  ontologyEvents.emit("ontology.changed", {
    event_id: generateId(),
    version_id: generateId(),
    ts: new Date().toISOString(),
    diff: [{ op: "replace", path: `/edgeTypes/${row.name}`, value: row }],
  });
  return ok(row);
}

// DELETE /api/v1/ontology/edge-types/:name
export async function handleDeleteEdgeType(
  req: Request,
  name: string,
): Promise<Response> {
  const url = new URL(req.url);
  const valid = await parseEdgeTypeName(name);
  if (!valid) return error(404, "not_found", `edge type '${name}' not found`, { name });

  const confirmId = url.searchParams.get("confirm_migration_step_id") ?? undefined;
  await deleteEdgeType(getDriver(), valid, actor(url), confirmId);
  ontologyEvents.emit("ontology.changed", {
    event_id: generateId(),
    version_id: generateId(),
    ts: new Date().toISOString(),
    diff: [{ op: "remove", path: `/edgeTypes/${name}` }],
  });
  return noContent();
}
