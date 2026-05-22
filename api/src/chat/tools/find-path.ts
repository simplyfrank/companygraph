import { z } from "zod";
import { runPassthrough } from "../../neo4j/read-only-session";
import type { ToolDef, ToolContext } from "./types";

// FR-T07 — find_path. shortestPath() between two node ids, undirected. Up to
// 5 paths returned (Neo4j returns one shortest path per (a,b) pair via
// shortestPath; we wrap in a top-level LIMIT 5 for forward compatibility if
// the implementation is ever switched to `allShortestPaths`).
//
// Cypher does not allow `*..` with a parameter for the upper bound — `maxDepth`
// is therefore interpolated AFTER zod-validation pins it to 1..8. The other
// inputs (fromId, toId) ride through as parameters.

const argsSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  maxDepth: z.number().int().min(1).max(8).default(6),
}).strict();
type Args = z.infer<typeof argsSchema>;

interface EdgeRef {
  id: string;
  type: string;
  fromId: string;
  toId: string;
}

interface Data {
  paths: string[][];      // node-id arrays, one per path
  edges: EdgeRef[][];     // edge arrays, parallel to paths
}

export const TOOL_DEF: ToolDef<Args, Data> = {
  name: "find_path",
  description:
    "Return the shortest undirected path between two nodes (by id), up to maxDepth hops. " +
    "Returns parallel arrays of node-id sequences and edge sequences (paths[i] ↔ edges[i]).",
  schema: argsSchema,
  run: async (args: Args, ctx: ToolContext): Promise<Data> => {
    // Re-validate the depth bound before string-interpolating into Cypher.
    if (!Number.isInteger(args.maxDepth) || args.maxDepth < 1 || args.maxDepth > 8) {
      throw new Error(`maxDepth_out_of_range:${args.maxDepth}`);
    }
    const stmt = `MATCH p = shortestPath((a { id: $fromId })-[*..${args.maxDepth}]-(b { id: $toId }))
RETURN [n IN nodes(p) | n.id] AS pathNodes,
       [r IN relationships(p) | { id: r.id, type: type(r), fromId: startNode(r).id, toId: endNode(r).id }] AS pathEdges
LIMIT 5`;

    const { rows } = await runPassthrough(ctx.driver, stmt, {
      fromId: args.fromId,
      toId: args.toId,
    });

    const paths: string[][] = [];
    const edges: EdgeRef[][] = [];
    for (const r of rows) {
      const rawNodes = Array.isArray(r.pathNodes) ? r.pathNodes : [];
      const rawEdges = Array.isArray(r.pathEdges) ? r.pathEdges : [];
      const ids: string[] = [];
      for (const n of rawNodes) {
        if (typeof n === "string") ids.push(n);
      }
      const eRefs: EdgeRef[] = [];
      for (const e of rawEdges) {
        if (!e || typeof e !== "object") continue;
        const o = e as Record<string, unknown>;
        if (typeof o.id !== "string") continue;
        eRefs.push({
          id: o.id,
          type: typeof o.type === "string" ? o.type : "",
          fromId: typeof o.fromId === "string" ? o.fromId : "",
          toId: typeof o.toId === "string" ? o.toId : "",
        });
      }
      paths.push(ids);
      edges.push(eRefs);
    }
    return { paths, edges };
  },
};
