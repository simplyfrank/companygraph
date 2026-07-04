// T-18d — GET /api/v1/ontology/export handler (design §6.2, FR-08).
//
// Returns the full ontology registry (nodeLabels + edgeTypes + boundedContexts + entities + boundedContextRelationships)
// as a single JSON document by default, or YAML when `?format=yaml` is supplied.
//
// Reuses the §6.1 schema cache for nodeLabels and edgeTypes, and fetches bounded contexts and entities from Neo4j.
// Cache invalidation is handled globally via `ontologyEvents.changed`, so the export view is consistent.
//
// The payload shape (`{nodeLabels, edgeTypes, boundedContexts, entities, boundedContextRelationships}`) is intentionally the
// inverse of `/api/v1/ontology/import` — a JSON export round-trips straight back through the importer.

import yaml from "js-yaml";
import { getSchema } from "../ontology/cache/schema";
import { getDriver } from "../neo4j/driver";
import { ok } from "./_helpers";

// GET /api/v1/ontology/export
export async function handleOntologyExport(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";
  const schema = await getSchema();

  // Fetch bounded contexts with their attributes
  const driver = getDriver();
  const session = driver.session();

  const boundedContextsResult = await session.run(`
    MATCH (bc:BoundedContext)
    RETURN bc.id as id,
           bc.name as name,
           bc.description as description,
           bc.domain as domain,
           bc.subdomain as subdomain,
           bc.type as type,
           bc.oracle_system as oracle_system,
           bc.jira_projects as jira_projects
    ORDER BY bc.name
  `);

  const boundedContexts = boundedContextsResult.records.map((record) => ({
    id: record.get("id"),
    name: record.get("name"),
    description: record.get("description"),
    domain: record.get("domain"),
    subdomain: record.get("subdomain"),
    type: record.get("type"),
    oracle_system: record.get("oracle_system"),
    jira_projects: record.get("jira_projects") || [],
  }));

  // Fetch entities with their attributes
  const entitiesResult = await session.run(`
    MATCH (e:Entity)
    RETURN e.id as id,
           e.name as name,
           e.description as description,
           e.subdomain as subdomain,
           e.bounded_context as bounded_context,
           e.entity_number as entity_number,
           e.status as status,
           e.oracle_table as oracle_table,
           e.note as note
    ORDER BY e.entity_number
  `);

  const entities = entitiesResult.records.map((record) => ({
    id: record.get("id"),
    name: record.get("name"),
    description: record.get("description"),
    subdomain: record.get("subdomain"),
    bounded_context: record.get("bounded_context"),
    entity_number: record.get("entity_number"),
    status: record.get("status"),
    oracle_table: record.get("oracle_table"),
    note: record.get("note"),
  }));

  // Fetch bounded context relationships
  const relationshipsResult = await session.run(`
    MATCH (from:BoundedContext)-[r:UPSTREAM_OF|DOWNSTREAM_OF]->(to:BoundedContext)
    RETURN from.name as from, to.name as to, type(r) as type
    ORDER BY from.name, to.name
  `);

  const boundedContextRelationships = relationshipsResult.records.map((record) => ({
    from: record.get("from"),
    to: record.get("to"),
    type: record.get("type"),
  }));

  await session.close();

  const body = {
    nodeLabels: schema.nodeLabels,
    edgeTypes: schema.edgeTypes,
    boundedContexts,
    entities,
    boundedContextRelationships,
  };

  if (format === "yaml") {
    return new Response(yaml.dump(body), {
      status: 200,
      headers: { "content-type": "application/yaml" },
    });
  }
  return ok(body);
}
