// T-18d — GET /api/v1/ontology/export handler (design §6.2, FR-08).
//
// Returns the full ontology registry (nodeLabels + edgeTypes) as a single
// JSON document by default, or YAML when `?format=yaml` is supplied.
//
// Reuses the §6.1 schema cache so well-warmed servers respond in < 1 ms.
// Cache invalidation is handled globally via `ontologyEvents.changed`,
// so the export view is consistent with `/api/v1/schema`.
//
// The payload shape (`{nodeLabels, edgeTypes}`) is intentionally the
// inverse of `/api/v1/ontology/import` — a JSON export round-trips
// straight back through the importer.

import yaml from "js-yaml";
import { getSchema } from "../ontology/cache/schema";
import { ok } from "./_helpers";

// GET /api/v1/ontology/export
export async function handleOntologyExport(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";
  const schema = await getSchema();
  const body = { nodeLabels: schema.nodeLabels, edgeTypes: schema.edgeTypes };

  if (format === "yaml") {
    return new Response(yaml.dump(body), {
      status: 200,
      headers: { "content-type": "application/yaml" },
    });
  }
  return ok(body);
}
