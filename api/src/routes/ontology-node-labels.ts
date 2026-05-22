// T-18a — REST handlers for the node-label registry (design §4.1).
//
// Routes (all under /api/v1/ontology/node-labels):
//   GET    /                    → listNodeLabels → 200 [NodeLabelRow]
//   POST   /                    → createNodeLabel → 201 NodeLabelRow
//   GET    /:name               → getNodeLabel → 200 NodeLabelRow | 404
//   PATCH  /:name               → patchNodeLabel → 200 NodeLabelRow | 404 | 409
//   DELETE /:name               → deleteNodeLabel → 204 | 404 | 409
//
// Every mutation emits `ontologyEvents.emit("ontology.changed", …)` AFTER
// the storage tx commits (ordering rule from T-05 / pass-1 B-03). The
// emit fires from the route layer so the storage helpers remain free of
// EventEmitter dependency.
//
// URL-param guard: `:name` on GET/PATCH/DELETE is validated via
// `parseRegistryLabel` (schema-cache backed, T-13 §5.5) rather than the
// compile-time `parseLabel`. This admits labels added at runtime.
//
// `?forceBackfill=true` on PATCH wires through to `patchNodeLabel`'s
// `opts.forceBackfill`. `backfillValue` comes from the request body's
// top-level `_backfillValue` key (if present) to keep the schema clean.
// `?confirm_migration_step_id=<id>` on DELETE is forwarded to storage.
// `?actor=<string>` on POST/PATCH/DELETE names the authenticated principal
// (no auth in this project — callers pass an arbitrary string, defaulting
// to "api").

import { getDriver } from "../neo4j/driver";
import {
  createNodeLabel,
  getNodeLabel,
  listNodeLabels,
  patchNodeLabel,
  deleteNodeLabel,
} from "../ontology/storage/node-labels";
import { ontologyEvents } from "../ontology/events";
import { generateId } from "../ids";
import {
  nodeLabelCreateSchema,
  nodeLabelPatchSchema,
} from "@companygraph/shared/schema/ontology";
import { ERROR_CODE_THROWERS } from "../ontology/error-throwers";
import {
  ok,
  noContent,
  error,
  readJson,
  parseRegistryLabel,
  parseQueryBool,
} from "./_helpers";

function actor(url: URL): string {
  return url.searchParams.get("actor") ?? "api";
}

// POST /api/v1/ontology/node-labels
export async function handleCreateNodeLabel(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const body = await readJson(req);
  const parsed = nodeLabelCreateSchema.safeParse(body);
  if (!parsed.success) {
    ERROR_CODE_THROWERS.invalid_payload({
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }
  const row = await createNodeLabel(getDriver(), parsed.data!, actor(url));
  ontologyEvents.emit("ontology.changed", {
    event_id: generateId(),
    version_id: generateId(),
    ts: new Date().toISOString(),
    diff: [{ op: "add", path: `/nodeLabels/${row.name}`, value: row }],
  });
  return ok(row, 201);
}

// GET /api/v1/ontology/node-labels
export async function handleListNodeLabels(): Promise<Response> {
  const rows = await listNodeLabels(getDriver());
  return ok(rows);
}

// GET /api/v1/ontology/node-labels/:name
export async function handleGetNodeLabel(
  _req: Request,
  name: string,
): Promise<Response> {
  const valid = await parseRegistryLabel(name);
  if (!valid) return error(404, "not_found", `node label '${name}' not found`, { name });
  const row = await getNodeLabel(getDriver(), valid);
  if (!row) return error(404, "not_found", `node label '${name}' not found`, { name });
  return ok(row);
}

// PATCH /api/v1/ontology/node-labels/:name
export async function handlePatchNodeLabel(
  req: Request,
  name: string,
): Promise<Response> {
  const url = new URL(req.url);
  const valid = await parseRegistryLabel(name);
  if (!valid) return error(404, "not_found", `node label '${name}' not found`, { name });

  const body = await readJson(req);
  // Strip _backfillValue from the patch body before schema validation.
  const { _backfillValue, ...patchBody } =
    (body as Record<string, unknown> & { _backfillValue?: unknown }) ?? {};
  const parsed = nodeLabelPatchSchema.safeParse(patchBody);
  if (!parsed.success) {
    ERROR_CODE_THROWERS.invalid_payload({
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const forceBackfill = parseQueryBool(url, "forceBackfill");
  const row = await patchNodeLabel(
    getDriver(),
    valid,
    parsed.data!,
    actor(url),
    { forceBackfill, backfillValue: _backfillValue },
  );
  ontologyEvents.emit("ontology.changed", {
    event_id: generateId(),
    version_id: generateId(),
    ts: new Date().toISOString(),
    diff: [{ op: "replace", path: `/nodeLabels/${row.name}`, value: row }],
  });
  return ok(row);
}

// DELETE /api/v1/ontology/node-labels/:name
export async function handleDeleteNodeLabel(
  req: Request,
  name: string,
): Promise<Response> {
  const url = new URL(req.url);
  const valid = await parseRegistryLabel(name);
  if (!valid) return error(404, "not_found", `node label '${name}' not found`, { name });

  const confirmId = url.searchParams.get("confirm_migration_step_id") ?? undefined;
  await deleteNodeLabel(getDriver(), valid, actor(url), confirmId);
  ontologyEvents.emit("ontology.changed", {
    event_id: generateId(),
    version_id: generateId(),
    ts: new Date().toISOString(),
    diff: [{ op: "remove", path: `/nodeLabels/${name}` }],
  });
  return noContent();
}
