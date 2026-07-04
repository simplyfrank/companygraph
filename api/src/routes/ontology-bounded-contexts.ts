import { getDriver } from "../neo4j/driver";
import { sanitizeLabelName } from "@companygraph/shared/schema/ontology";
import { ok, error } from "./_helpers";

/**
 * GET /api/v1/ontology/bounded-contexts
 * 
 * Returns all bounded contexts with their associated entities and relationships.
 * This enables the ERD view to render bounded contexts as actual graph nodes.
 */
export async function handleBoundedContexts(): Promise<Response> {
  const driver = getDriver();
  const session = driver.session();

  try {
    const result = await session.run(`
      MATCH (bc:BoundedContext)
      OPTIONAL MATCH (e:Entity)-[:PART_OF]->(bc)
      OPTIONAL MATCH (bc)-[r:UPSTREAM_OF|DOWNSTREAM_OF]->(other:BoundedContext)
      WITH bc, 
           collect(DISTINCT e.name) as entities,
           collect(DISTINCT { type: type(r), target: other.name }) as relationships
      RETURN bc.id as id,
             bc.name as name,
             bc.description as description,
             bc.domain as domain,
             bc.subdomain as subdomain,
             bc.type as type,
             bc.oracle_system as oracle_system,
             bc.jira_projects as jira_projects,
             size(entities) as entity_count,
             entities,
             relationships
      ORDER BY bc.name
    `);

    const contexts = result.records.map((record) => ({
      id: record.get("id"),
      name: record.get("name"),
      description: record.get("description"),
      domain: record.get("domain") || "Unknown",
      subdomain: record.get("subdomain") || "Unknown",
      type: record.get("type") || "Unknown",
      oracle_system: record.get("oracle_system"),
      jira_projects: record.get("jira_projects") || [],
      entity_count: record.get("entity_count"),
      entities: record.get("entities") as string[],
      relationships: record.get("relationships"),
    }));

    return ok(contexts);
  } catch (e) {
    console.error("Error fetching bounded contexts:", e);
    return error(500, "neo4j_unreachable", "Failed to fetch bounded contexts", {
      cause: e instanceof Error ? e.message : String(e),
    });
  } finally {
    await session.close();
  }
}
