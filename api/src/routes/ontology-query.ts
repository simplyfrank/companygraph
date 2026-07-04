// Ontology query API routes — executes Cypher/SPARQL queries against the graph.
//
// Provides a query interface for executing queries against the Neo4j graph.
// Currently supports Cypher queries with placeholder for future SPARQL support.

import { getDriver } from "../neo4j/driver";
import { executeQuery } from "../ontology/query/executor";
import { ok, error, readJson } from "./_helpers";

export async function handleOntologyQuery(req: Request): Promise<Response> {
  const driver = getDriver();
  const url = new URL(req.url);
  const queryType = url.searchParams.get("type") || "cypher";

  try {
    const body = await readJson(req);
    const query = body.query as string;
    const params = body.params as Record<string, unknown> || {};
    const write = body.write as boolean || false;

    if (!query || typeof query !== "string") {
      return error(400, "invalid_payload", "Missing or invalid query field");
    }

    // Reject obviously dangerous write patterns in read mode
    if (!write) {
      const writeKeywords = ["CREATE", "DELETE", "SET", "REMOVE", "MERGE"];
      const upperQuery = query.toUpperCase();
      if (writeKeywords.some((kw) => upperQuery.includes(kw))) {
        return error(400, "write_statement_rejected", "Write keywords detected in read-only query");
      }
    }

    if (queryType === "sparql") {
      try {
        const result = await executeQuery(driver, query, params, write);
        return ok(result);
      } catch (e) {
        if (e instanceof Error && e.message.includes("SPARQL")) {
          return error(501, "not_implemented", e.message);
        }
        throw e;
      }
    }

    if (queryType === "cypher") {
      const result = await executeQuery(driver, query, params, write);
      return ok(result);
    }

    return error(400, "invalid_payload", "Invalid query type. Supported types: cypher, sparql");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return error(500, "query_timeout", `Query execution failed: ${message}`);
  }
}
