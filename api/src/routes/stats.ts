import { getDriver } from "../neo4j/driver";
import { NODE_LABELS, type NodeLabel } from "@companygraph/shared/schema/nodes";
import { EDGE_TYPES, type EdgeType } from "@companygraph/shared/schema/edges";
import { ok } from "./_helpers";
import type { Stats } from "@companygraph/shared/types";

// /api/v1/stats — all 6 node + 6 edge keys always present (FR-11). Zero
// means "constraint exists but no rows", same shape as non-zero.
//
// Architecture: a single UNION ALL query replaces the previous N+1 loop
// (12 sequential session.run() calls). All counts arrive in one round-trip.
// Node labels use MATCH (n:Label), edge types use directed MATCH (a)-[r:TYPE]->(b)
// so no /2 divide is required (each edge is counted exactly once).
export async function handleStats(): Promise<Response> {
  const nodeBranches = NODE_LABELS.map(
    (l) => `MATCH (n:\`${l}\`) RETURN 'node' AS kind, '${l}' AS name, count(n) AS c`,
  );
  const edgeBranches = EDGE_TYPES.map(
    (t) => `MATCH (a)-[r:\`${t}\`]->(b) RETURN 'edge' AS kind, '${t}' AS name, count(r) AS c`,
  );
  const cypher = [...nodeBranches, ...edgeBranches].join("\nUNION ALL\n");

  const nodes: Record<NodeLabel, number> = Object.fromEntries(
    NODE_LABELS.map((l) => [l, 0]),
  ) as Record<NodeLabel, number>;
  const edges: Record<EdgeType, number> = Object.fromEntries(
    EDGE_TYPES.map((t) => [t, 0]),
  ) as Record<EdgeType, number>;

  const session = getDriver().session({ defaultAccessMode: "READ" });
  try {
    const result = await session.run(cypher);
    for (const rec of result.records) {
      const kind = rec.get("kind") as string;
      const name = rec.get("name") as string;
      const c = (rec.get("c") as number | undefined) ?? 0;
      if (kind === "node") nodes[name as NodeLabel] = c;
      else edges[name as EdgeType] = c;
    }
  } finally {
    await session.close();
  }

  const body: Stats = { nodes, edges };
  return ok(body);
}
