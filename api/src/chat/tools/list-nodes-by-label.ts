import { z } from "zod";
import { NODE_LABELS } from "@companygraph/shared/schema/nodes";
import { runPassthrough } from "../../neo4j/read-only-session";
import type { ToolDef, ToolContext } from "./types";

// FR-T05 — list_nodes_by_label. Returns up to `limit` nodes of the given label
// with optional name/attribute filters.
//
// Security note: the `label` parameter is the ONLY value interpolated into the
// Cypher template — and only after it has cleared `z.enum(NODE_LABELS)`. Every
// other value (filter strings, limit) rides through as a parameter. This keeps
// the tool free of Cypher injection while letting us pick the label dynamically
// (parameterised labels are not supported in vanilla Cypher).

const filterSchema = z.object({
  name_contains: z.string().min(1).optional(),
  attr: z.object({
    key: z.string().min(1),
    value: z.string().min(1),
  }).optional(),
}).strict().optional();

const argsSchema = z.object({
  label: z.enum(NODE_LABELS),
  filter: filterSchema,
  limit: z.number().int().min(1).max(100).default(50),
}).strict();
type Args = z.infer<typeof argsSchema>;

interface NodeRow {
  id: string;
  name: string;
  description?: string;
  attributes?: Record<string, unknown>;
}

type Data = NodeRow[];

function parseAttrs(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export const TOOL_DEF: ToolDef<Args, Data> = {
  name: "list_nodes_by_label",
  description:
    "List nodes of a given label (Domain / UserJourney / Activity / Role / System / Location) " +
    "with optional substring + attribute filters. Capped at 100 rows.",
  schema: argsSchema,
  run: async (args: Args, ctx: ToolContext): Promise<Data> => {
    // Defence-in-depth: re-validate label against the closed tuple before we
    // splice it into the Cypher template. zod has already enforced this; the
    // assertion guards against any future refactor that loosens the schema.
    if (!(NODE_LABELS as readonly string[]).includes(args.label)) {
      // Unreachable under the current schema; throw a structured error rather
      // than letting an unsafe label hit Cypher.
      throw new Error(`label_not_whitelisted:${args.label}`);
    }

    const wheres: string[] = [];
    const params: Record<string, unknown> = { limit: args.limit };

    if (args.filter?.name_contains) {
      wheres.push("toLower(n.name) CONTAINS toLower($name_contains)");
      params.name_contains = args.filter.name_contains;
    }
    if (args.filter?.attr) {
      // attributes are stored as a JSON string; use CONTAINS to keep the match
      // schema-agnostic. The key + value are passed as bound params; the
      // serialised needle is built server-side so the JSON shape is honoured.
      wheres.push("n.attributes_json CONTAINS $attr_needle");
      params.attr_needle = JSON.stringify({ [args.filter.attr.key]: args.filter.attr.value }).slice(1, -1);
    }

    const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(" AND ")}` : "";
    const stmt = `MATCH (n:${args.label})
${whereClause}
RETURN n.id AS id,
       n.name AS name,
       n.description AS description,
       n.attributes_json AS attributes
ORDER BY n.name
LIMIT $limit`;

    const { rows } = await runPassthrough(ctx.driver, stmt, params);
    return rows.map((r) => {
      const out: NodeRow = {
        id: String(r.id),
        name: String(r.name),
      };
      if (typeof r.description === "string" && r.description.length > 0) {
        out.description = r.description;
      }
      const attrs = parseAttrs(r.attributes);
      if (attrs) out.attributes = attrs;
      return out;
    });
  },
};
