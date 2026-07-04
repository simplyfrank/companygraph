// Glossary term routes — REST API for glossary term CRUD.
//
// Follows the pattern of ontology-node-labels.ts and ontology-edge-types.ts:
// - GET /api/v1/glossary/terms — list all terms
// - POST /api/v1/glossary/terms — create term
// - GET /api/v1/glossary/terms/:id — get single term
// - PATCH /api/v1/glossary/terms/:id — update term
// - DELETE /api/v1/glossary/terms/:id — delete term

import { getDriver } from "../neo4j/driver";
import {
  createGlossaryTerm,
  getGlossaryTerm,
  listGlossaryTerms,
  patchGlossaryTerm,
  deleteGlossaryTerm,
} from "../ontology/storage/glossary-terms";
import { ontologyEvents } from "../ontology/events";
import {
  glossaryTermSchema,
  glossaryTermPatchSchema,
} from "@companygraph/shared/schema/ontology";
import { ERROR_CODE_THROWERS } from "../ontology/error-throwers";
import {
  ok,
  noContent,
  error,
  readJson,
  parseQueryBool,
} from "./_helpers";

export async function handleGlossaryTerms(req: Request): Promise<Response> {
  const driver = getDriver();
  const url = new URL(req.url);
  const collectionIri = url.searchParams.get("collection_iri") || undefined;

  const terms = await listGlossaryTerms(driver, collectionIri);
  return ok(terms);
}

export async function handleCreateGlossaryTerm(req: Request): Promise<Response> {
  const driver = getDriver();
  const body = await readJson(req);

  const parsed = glossaryTermSchema.safeParse(body);
  if (!parsed.success) {
    return error(400, "invalid_payload", "Invalid glossary term payload", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const actor = req.headers.get("x-actor") || "api";
  const term = await createGlossaryTerm(driver, parsed.data, actor);
  
  ontologyEvents.emit("ontology.changed", {
    event_id: term.id,
    version_id: term.id,
    ts: new Date().toISOString(),
    diff: [{ op: "add", path: `/glossaryTerms/${term.id}`, value: term }],
  });
  
  return ok(term, 201);
}

export async function handleGlossaryTerm(req: Request): Promise<Response> {
  const driver = getDriver();
  const url = new URL(req.url);
  const id = url.pathname.split("/").pop();

  if (!id) {
    return error(400, "invalid_payload", "Term ID is required");
  }

  const term = await getGlossaryTerm(driver, id);
  if (!term) {
    return error(404, "not_found", "Glossary term not found", { name: id, kind: "glossary_term" });
  }

  return ok(term);
}

export async function handlePatchGlossaryTerm(req: Request): Promise<Response> {
  const driver = getDriver();
  const url = new URL(req.url);
  const id = url.pathname.split("/").pop();

  if (!id) {
    return error(400, "invalid_payload", "Term ID is required");
  }

  const body = await readJson(req);
  const parsed = glossaryTermPatchSchema.safeParse(body);
  if (!parsed.success) {
    return error(400, "invalid_payload", "Invalid glossary term patch payload", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const actor = req.headers.get("x-actor") || "api";
  const term = await patchGlossaryTerm(driver, id, parsed.data, actor);
  
  ontologyEvents.emit("ontology.changed", {
    event_id: term.id,
    version_id: term.id,
    ts: new Date().toISOString(),
    diff: [{ op: "replace", path: `/glossaryTerms/${term.id}`, value: term }],
  });
  
  return ok(term);
}

export async function handleDeleteGlossaryTerm(req: Request): Promise<Response> {
  const driver = getDriver();
  const url = new URL(req.url);
  const id = url.pathname.split("/").pop();

  if (!id) {
    return error(400, "invalid_payload", "Term ID is required");
  }

  const actor = req.headers.get("x-actor") || "api";
  await deleteGlossaryTerm(driver, id, actor);
  
  ontologyEvents.emit("ontology.changed", {
    event_id: id,
    version_id: id,
    ts: new Date().toISOString(),
    diff: [{ op: "remove", path: `/glossaryTerms/${id}` }],
  });
  
  return noContent();
}
