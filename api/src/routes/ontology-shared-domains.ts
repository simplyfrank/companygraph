import { getDriver } from "../neo4j/driver";
import { ok, error } from "./_helpers";

/**
 * GET /api/v1/ontology/shared-domains
 *
 * Returns all shared domains with their associated bounded contexts.
 * Shared domains are reusable workflow components not scoped to a
 * single BusinessModel — they can be referenced across models.
 */
export async function handleSharedDomains(): Promise<Response> {
  const driver = getDriver();
  const session = driver.session();

  try {
    const result = await session.run(`
      MATCH (sd:SharedDomain)
      OPTIONAL MATCH (bc:BoundedContext)-[:BELONGS_TO_SHARED_DOMAIN]->(sd)
      WITH sd,
           collect(DISTINCT bc.name) as bounded_contexts
      RETURN sd.id as id,
             sd.name as name,
             sd.description as description,
             sd.tags as tags,
             bounded_contexts
      ORDER BY sd.name
    `);

    const sharedDomains = result.records.map((record) => ({
      id: record.get("id"),
      name: record.get("name"),
      description: record.get("description") ?? "",
      tags: record.get("tags") ?? [],
      bounded_contexts: record.get("bounded_contexts") as string[],
    }));

    return ok(sharedDomains);
  } catch (e) {
    console.error("Error fetching shared domains:", e);
    return error(500, "neo4j_unreachable", "Failed to fetch shared domains", {
      cause: e instanceof Error ? e.message : String(e),
    });
  } finally {
    await session.close();
  }
}
