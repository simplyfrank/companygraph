// T-17 — GET /api/v1/schema handler (design §6.1).
//
// Returns the full schema (nodeLabels + edgeTypes) from the schema cache.
// Optional `?alignment=<source>` filter returns only labels/types that
// have at least one external alignment with that source system.
//
// Cache hit: < 1 ms. Cache miss: one round-trip per list (node-labels +
// edge-types in parallel via Promise.all inside loadFromRegistry).

import { getSchema } from "../ontology/cache/schema";
import { ok } from "./_helpers";

export async function handleGetSchema(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const alignment = url.searchParams.get("alignment") ?? undefined;
  const schema = await getSchema(alignment ? { alignment } : undefined);
  return ok(schema);
}
