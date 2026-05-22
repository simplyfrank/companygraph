import { getDriver } from "../neo4j/driver";
import { NODE_LABELS, type NodeLabel } from "@companygraph/shared/schema/nodes";
import { EDGE_TYPES, type EdgeType } from "@companygraph/shared/schema/edges";
import type { Stats } from "@companygraph/shared/types";

// /api/v1/stats — all 6 node + 6 edge keys always present (FR-11). Zero
// means "constraint exists but no rows", same shape as non-zero.
export async function handleStats(): Promise<Response> {
  const session = getDriver().session({ defaultAccessMode: "READ" });
  try {
    const nodes: Record<NodeLabel, number> = Object.fromEntries(
      NODE_LABELS.map((l) => [l, 0]),
    ) as Record<NodeLabel, number>;
    const edges: Record<EdgeType, number> = Object.fromEntries(
      EDGE_TYPES.map((t) => [t, 0]),
    ) as Record<EdgeType, number>;

    for (const label of NODE_LABELS) {
      const r = await session.run(`MATCH (n:\`${label}\`) RETURN count(n) AS c`);
      const c = (r.records[0]?.get("c") as { toNumber: () => number } | undefined)?.toNumber() ?? 0;
      nodes[label] = c;
    }
    for (const type of EDGE_TYPES) {
      const r = await session.run(`MATCH ()-[r:\`${type}\`]-() RETURN count(r) AS c`);
      // edges are undirected in the MATCH so each edge appears twice — divide.
      const c = ((r.records[0]?.get("c") as { toNumber: () => number } | undefined)?.toNumber() ?? 0) / 2;
      edges[type] = c;
    }

    const body: Stats = { nodes, edges };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } finally {
    await session.close();
  }
}
