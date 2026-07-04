// Glossary collection routes — REST API for glossary collection CRUD.
//
// Follows the pattern of ontology-node-labels.ts and ontology-edge-types.ts:
// - GET /api/v1/glossary/collections — list all collections
// - POST /api/v1/glossary/collections — create collection
// - GET /api/v1/glossary/collections/:iri — get single collection
// - PATCH /api/v1/glossary/collections/:iri — update collection
// - DELETE /api/v1/glossary/collections/:iri — delete collection

import { getDriver } from "../neo4j/driver";
import {
  createGlossaryCollection,
  getGlossaryCollection,
  listGlossaryCollections,
  patchGlossaryCollection,
  deleteGlossaryCollection,
} from "../ontology/storage/glossary-collections";
import { ontologyEvents } from "../ontology/events";
import {
  glossaryCollectionSchema,
  glossaryCollectionPatchSchema,
} from "@companygraph/shared/schema/ontology";
import { ERROR_CODE_THROWERS } from "../ontology/error-throwers";
import {
  ok,
  noContent,
  error,
  readJson,
  parseQueryBool,
} from "./_helpers";

export async function handleGlossaryCollections(req: Request): Promise<Response> {
  const driver = getDriver();
  const url = new URL(req.url);
  const scopeLevel = url.searchParams.get("scope_level") || undefined;

  const collections = await listGlossaryCollections(driver, scopeLevel);
  return ok(collections);
}

export async function handleCreateGlossaryCollection(req: Request): Promise<Response> {
  const driver = getDriver();
  const body = await readJson(req);

  const parsed = glossaryCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return error(400, "invalid_payload", "Invalid glossary collection payload", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const actor = req.headers.get("x-actor") || "api";
  const collection = await createGlossaryCollection(driver, parsed.data, actor);
  
  ontologyEvents.emit("ontology.changed", {
    event_id: collection.iri,
    version_id: collection.iri,
    ts: new Date().toISOString(),
    diff: [{ op: "add", path: `/glossaryCollections/${collection.iri}`, value: collection }],
  });
  
  return ok(collection, 201);
}

export async function handleGlossaryCollection(req: Request): Promise<Response> {
  const driver = getDriver();
  const url = new URL(req.url);
  const iri = url.pathname.split("/").pop();

  if (!iri) {
    return error(400, "invalid_payload", "Collection IRI is required");
  }

  const collection = await getGlossaryCollection(driver, iri);
  if (!collection) {
    return error(404, "not_found", "Glossary collection not found", { name: iri, kind: "glossary_collection" });
  }

  return ok(collection);
}

export async function handlePatchGlossaryCollection(req: Request): Promise<Response> {
  const driver = getDriver();
  const url = new URL(req.url);
  const iri = url.pathname.split("/").pop();

  if (!iri) {
    return error(400, "invalid_payload", "Collection IRI is required");
  }

  const body = await readJson(req);
  const parsed = glossaryCollectionPatchSchema.safeParse(body);
  if (!parsed.success) {
    return error(400, "invalid_payload", "Invalid glossary collection patch payload", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const actor = req.headers.get("x-actor") || "api";
  const collection = await patchGlossaryCollection(driver, iri, parsed.data, actor);
  
  ontologyEvents.emit("ontology.changed", {
    event_id: collection.iri,
    version_id: collection.iri,
    ts: new Date().toISOString(),
    diff: [{ op: "replace", path: `/glossaryCollections/${collection.iri}`, value: collection }],
  });
  
  return ok(collection);
}

export async function handleDeleteGlossaryCollection(req: Request): Promise<Response> {
  const driver = getDriver();
  const url = new URL(req.url);
  const iri = url.pathname.split("/").pop();

  if (!iri) {
    return error(400, "invalid_payload", "Collection IRI is required");
  }

  const actor = req.headers.get("x-actor") || "api";
  await deleteGlossaryCollection(driver, iri, actor);
  
  ontologyEvents.emit("ontology.changed", {
    event_id: iri,
    version_id: iri,
    ts: new Date().toISOString(),
    diff: [{ op: "remove", path: `/glossaryCollections/${iri}` }],
  });
  
  return noContent();
}
