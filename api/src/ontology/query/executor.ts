// Query executor — executes Cypher queries against Neo4j.
//
// This provides a query interface that can be extended to support SPARQL
// in the future. Currently supports Cypher queries (Neo4j's native language).

import type { Driver, Record as NeoRecord } from "neo4j-driver";
import { runPassthrough } from "../../neo4j/read-only-session";

export interface QueryResult {
  columns: string[];
  data: Array<Record<string, unknown>>;
  summary: {
    queryType: string;
    query: string;
    executionTimeMs: number;
    resultCount: number;
  };
}

export class QueryExecutor {
  private driver: Driver;

  constructor(driver: Driver) {
    this.driver = driver;
  }

  async executeCypher(query: string, params: Record<string, unknown> = {}): Promise<QueryResult> {
    const startTime = Date.now();
    // Read queries use runPassthrough for row-cap, timeout, and error handling (C-01, N-1).
    const { rows, cypherDurationMs } = await runPassthrough(this.driver, query, params);

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return {
      columns,
      data: rows,
      summary: {
        queryType: "cypher",
        query,
        executionTimeMs: cypherDurationMs ?? (Date.now() - startTime),
        resultCount: rows.length,
      },
    };
  }

  async executeWriteCypher(query: string, params: Record<string, unknown> = {}): Promise<QueryResult> {
    const startTime = Date.now();
    const session = this.driver.session({ defaultAccessMode: "WRITE" });

    try {
      const result = await session.run(query, params);
      const columns = result.records.length > 0 ? Object.keys(result.records[0].toObject()) : [];
      const data = result.records.map((record: NeoRecord) => record.toObject());

      const executionTimeMs = Date.now() - startTime;

      return {
        columns,
        data,
        summary: {
          queryType: "cypher-write",
          query,
          executionTimeMs,
          resultCount: result.records.length,
        },
      };
    } finally {
      await session.close();
    }
  }

  // Placeholder for future SPARQL support
  async executeSparql(query: string): Promise<QueryResult> {
    // SPARQL-to-Cypher translation would go here
    // For now, return an error indicating SPARQL is not yet supported
    throw new Error("SPARQL queries are not yet supported. Please use Cypher queries.");
  }
}

export async function executeQuery(
  driver: Driver,
  query: string,
  params: Record<string, unknown> = {},
  write = false,
): Promise<QueryResult> {
  const executor = new QueryExecutor(driver);
  if (write) {
    return await executor.executeWriteCypher(query, params);
  }
  return await executor.executeCypher(query, params);
}
