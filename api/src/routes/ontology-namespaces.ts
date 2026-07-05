import { getDriver } from "../neo4j/driver";
import { ok, error } from "./_helpers";

/**
 * GET /api/v1/ontology/namespaces
 *
 * Returns all namespaces with their associated business model and
 * bounded contexts.  Namespaces partition work within a BusinessModel
 * so different teams or individuals can work independently.
 *
 * Optional query param `?model_id=<uuid>` filters by BusinessModel.
 */
export async function handleNamespaces(req: Request): Promise<Response> {
  const driver = getDriver();
  const session = driver.session();
  const url = new URL(req.url);
  const modelId = url.searchParams.get("model_id");

  try {
    let result;
    if (modelId) {
      result = await session.run(`
        MATCH (ns:Namespace {model_id: $modelId})
        OPTIONAL MATCH (ns)-[:NAMESPACE_OF]->(m:BusinessModel)
        OPTIONAL MATCH (bc:BoundedContext)-[:IN_NAMESPACE]->(ns)
        WITH ns,
             m.name as model_name,
             collect(DISTINCT bc.name) as bounded_contexts
        RETURN ns.id as id,
               ns.name as name,
               ns.description as description,
               ns.model_id as model_id,
               model_name,
               bounded_contexts
        ORDER BY ns.name
      `, { modelId });
    } else {
      result = await session.run(`
        MATCH (ns:Namespace)
        OPTIONAL MATCH (ns)-[:NAMESPACE_OF]->(m:BusinessModel)
        OPTIONAL MATCH (bc:BoundedContext)-[:IN_NAMESPACE]->(ns)
        WITH ns,
             m.name as model_name,
             collect(DISTINCT bc.name) as bounded_contexts
        RETURN ns.id as id,
               ns.name as name,
               ns.description as description,
               ns.model_id as model_id,
               model_name,
               bounded_contexts
        ORDER BY ns.name
      `);
    }

    const namespaces = result.records.map((record) => ({
      id: record.get("id"),
      name: record.get("name"),
      description: record.get("description") ?? "",
      model_id: record.get("model_id"),
      model_name: record.get("model_name"),
      bounded_contexts: record.get("bounded_contexts") as string[],
    }));

    return ok(namespaces);
  } catch (e) {
    console.error("Error fetching namespaces:", e);
    return error(500, "neo4j_unreachable", "Failed to fetch namespaces", {
      cause: e instanceof Error ? e.message : String(e),
    });
  } finally {
    await session.close();
  }
}
