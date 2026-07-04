/**
 * GET /api/v1/analytics/graph — graph analytics powered by graphology.
 *
 * Runs on the server against live Neo4j data. Returns:
 *   • nodeCount, edgeCount, density
 *   • cycles (elementary cycles ≥ 3 nodes)
 *   • sccs (strongly connected components)
 *   • communities (Louvain modularity)
 *   • betweenness centrality (Brandes)
 *   • pagerank
 *   • degree stats (in/out)
 *   • orphans (zero-degree nodes)
 *   • bottlenecks (top 10 betweenness)
 */

import { runGraphAnalytics } from "../ontology/analytics/graph";
import { ok } from "./_helpers";

export async function handleGraphAnalytics(): Promise<Response> {
  const result = await runGraphAnalytics();
  return ok(result);
}
