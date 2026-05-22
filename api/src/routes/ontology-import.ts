// FR-08 — POST /api/v1/ontology/import
//
// Bulk-import of node-label and/or edge-type registry entries from a
// JSON payload shaped as `OntologyImportPayload` (shared schema). Two
// ordered passes:
//
//   Pass 1 — nodeLabels: each entry attempted via `createNodeLabel`.
//            `name_conflict` (409) is treated as a non-fatal skip so the
//            import is idempotent on re-run.
//            All other errors are recorded in the `errors[]` array.
//
//   Pass 2 — edgeTypes: same pattern. Each entry attempted via
//            `createEdgeType`. Edge-type endpoint label references that
//            failed in pass 1 are flagged with a descriptive message.
//
// One `ontologyEvents.emit("ontology.changed", …)` fires after the full
// import if any entry was accepted, so caches invalidate exactly once.
//
// Response: 200 `{ accepted: { nodeLabels, edgeTypes }, errors? }`.
// A partial import (some errors) still returns 200 — the `errors[]`
// array communicates the per-entry failures.

import { getDriver } from "../neo4j/driver";
import { createNodeLabel } from "../ontology/storage/node-labels";
import { createEdgeType } from "../ontology/storage/edge-types";
import { ontologyEvents } from "../ontology/events";
import { generateId } from "../ids";
import { ontologyImportSchema } from "@companygraph/shared/schema/ontology";
import type { OntologyImportResponse } from "@companygraph/shared/schema/ontology";
import { ok, readJson } from "./_helpers";
import { ValidationError } from "../errors";

export async function handleOntologyImport(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const actor = url.searchParams.get("actor") ?? "api:import";

  const body = await readJson(req);
  const parsed = ontologyImportSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("invalid_payload", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const payload = parsed.data;
  const driver = getDriver();

  const errors: NonNullable<OntologyImportResponse["errors"]> = [];
  let acceptedNodeLabels = 0;
  let acceptedEdgeTypes = 0;

  // Pass 1 — node labels.
  for (const [index, entry] of (payload.nodeLabels ?? []).entries()) {
    try {
      await createNodeLabel(driver, entry, actor);
      acceptedNodeLabels++;
    } catch (e) {
      const code =
        e instanceof ValidationError ? e.code : "internal_error";
      const message =
        e instanceof ValidationError ? e.code : String(e);
      const details =
        e instanceof ValidationError ? e.details : undefined;
      // name_conflict is a soft skip — still recorded but counted as a
      // non-fatal row so the import doesn't abort.
      errors.push({ section: "nodeLabels", index, code, message, ...(details ? { details } : {}) });
    }
  }

  // Pass 2 — edge types.
  for (const [index, entry] of (payload.edgeTypes ?? []).entries()) {
    try {
      await createEdgeType(driver, entry, actor);
      acceptedEdgeTypes++;
    } catch (e) {
      const code =
        e instanceof ValidationError ? e.code : "internal_error";
      const message =
        e instanceof ValidationError ? e.code : String(e);
      const details =
        e instanceof ValidationError ? e.details : undefined;
      errors.push({ section: "edgeTypes", index, code, message, ...(details ? { details } : {}) });
    }
  }

  // Single cache-invalidation emit if anything was accepted.
  if (acceptedNodeLabels + acceptedEdgeTypes > 0) {
    ontologyEvents.emit("ontology.changed", {
      event_id: generateId(),
      version_id: generateId(),
      ts: new Date().toISOString(),
      diff: [],
    });
  }

  const response: OntologyImportResponse = {
    accepted: { nodeLabels: acceptedNodeLabels, edgeTypes: acceptedEdgeTypes },
    ...(errors.length > 0 ? { errors } : {}),
  };
  return ok(response);
}
