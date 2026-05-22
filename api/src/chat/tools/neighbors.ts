import { z } from "zod";
import { EDGE_TYPES } from "@companygraph/shared/schema/edges";
import { runPassthrough } from "../../neo4j/read-only-session";
import type { ToolDef, ToolContext } from "./types";

// FR-T06 — neighbors. Variable-length traversal from a seed node, returning
// the touched nodes + edges. Capped at 100 nodes (LIMIT clause).
//
// `edgeTypes` and `depth` are interpolated into the Cypher template (Cypher
// does not support parameterised relationship-types or variable-length bounds)
// — both have already passed `z.enum(EDGE_TYPES)` / `z.union([1,2])` so the
// resulting fragment is safe.

const argsSchema = z.object({
  nodeId: z.string().min(1),
  edgeTypes: z.array(z.enum(EDGE_TYPES)).min(1).optional(),
  depth: z.union([z.literal(1), z.literal(2)]).default(1),
  direction: z.enum(["in", "out", "both"]).default("both"),
}).strict();
type Args = z.infer<typeof argsSchema>;

interface NodeRef {
  id: string;
  name: string;
  label: string;
}

interface EdgeRef {
  id: string;
  type: string;
  fromId: string;
  toId: string;
}

interface Data {
  nodes: NodeRef[];
  edges: EdgeRef[];
}

export const TOOL_DEF: ToolDef<Args, Data> = {
  name: "neighbors",
  description:
    "List neighbouring nodes + edges of a seed node, up to depth 2. " +
    "Filter by relationship type and direction. Capped at 100 nodes.",
  schema: argsSchema,
  run: async (args: Args, ctx: ToolContext): Promise<Data> => {
    // Defence-in-depth: re-validate every interpolated value against the closed
    // tuple — zod already guarantees this but the check keeps the template
    // injection-proof under future refactors.
    if (args.edgeTypes) {
      for (const t of args.edgeTypes) {
        if (!(EDGE_TYPES as readonly string[]).includes(t)) {
          throw new Error(`edge_type_not_whitelisted:${t}`);
        }
      }
    }
    if (args.depth !== 1 && args.depth !== 2) {
      throw new Error(`depth_not_whitelisted:${args.depth}`);
    }

    const typeFilter = args.edgeTypes && args.edgeTypes.length > 0
      ? `:${args.edgeTypes.join("|")}`
      : "";
    const arrows = args.direction === "in"
      ? { left: "<-", right: "-" }
      : args.direction === "out"
        ? { left: "-", right: "->" }
        : { left: "-", right: "-" };

    const stmt = `MATCH (seed { id: $nodeId })
MATCH p = (seed)${arrows.left}[r${typeFilter}*1..${args.depth}]${arrows.right}(n)
WHERE n <> seed
WITH nodes(p) AS pnodes, relationships(p) AS pedges
UNWIND pnodes AS pn
WITH collect(DISTINCT pn) AS allNodes, collect(pedges) AS edgeLists
UNWIND edgeLists AS el
UNWIND el AS pe
WITH allNodes, collect(DISTINCT pe) AS allEdges
RETURN [n IN allNodes | { id: n.id, name: n.name, label: labels(n)[0] }] AS nodes,
       [r IN allEdges | { id: r.id, type: type(r), fromId: startNode(r).id, toId: endNode(r).id }] AS edges
LIMIT 100`;

    const { rows } = await runPassthrough(ctx.driver, stmt, { nodeId: args.nodeId });
    if (rows.length === 0) {
      return { nodes: [], edges: [] };
    }
    const r = rows[0]!;
    const rawNodes = Array.isArray(r.nodes) ? r.nodes : [];
    const rawEdges = Array.isArray(r.edges) ? r.edges : [];

    const nodes: NodeRef[] = [];
    for (const n of rawNodes) {
      if (!n || typeof n !== "object") continue;
      const o = n as Record<string, unknown>;
      if (typeof o.id !== "string") continue;
      nodes.push({
        id: o.id,
        name: typeof o.name === "string" ? o.name : "",
        label: typeof o.label === "string" ? o.label : "",
      });
      if (nodes.length >= 100) break;
    }

    const edges: EdgeRef[] = [];
    for (const e of rawEdges) {
      if (!e || typeof e !== "object") continue;
      const o = e as Record<string, unknown>;
      if (typeof o.id !== "string") continue;
      edges.push({
        id: o.id,
        type: typeof o.type === "string" ? o.type : "",
        fromId: typeof o.fromId === "string" ? o.fromId : "",
        toId: typeof o.toId === "string" ? o.toId : "",
      });
    }

    return { nodes, edges };
  },
};
