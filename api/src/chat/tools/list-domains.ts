import { z } from "zod";
import { runPassthrough } from "../../neo4j/read-only-session";
import type { ToolDef, ToolContext } from "./types";

// FR-T01 — list_domains. Returns every Domain node in name order.
// Per DD-04 the Cypher is the canonical `MATCH (d:Domain) RETURN d ORDER BY d.name`,
// but we project explicit fields here so the tool result shape is stable across
// schema evolution (the seeded `d` map carries internals like `attributes_json`).
//
// Per CLAUDE.md storage rule: `attributes_json` is a STRING in Neo4j and is
// parsed back to an object at the REST/tool boundary.

const argsSchema = z.object({}).strict();
type Args = z.infer<typeof argsSchema>;

interface DomainRow {
  id: string;
  name: string;
  description?: string;
  attributes?: Record<string, unknown>;
}

type Data = DomainRow[];

const CYPHER = `MATCH (d:Domain)
RETURN d.id AS id,
       d.name AS name,
       d.description AS description,
       d.attributes_json AS attributes
ORDER BY d.name`;

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
  name: "list_domains",
  description:
    "List every business Domain (top-level grouping of UserJourneys), ordered by name.",
  schema: argsSchema,
  run: async (_args: Args, ctx: ToolContext): Promise<Data> => {
    const { rows } = await runPassthrough(ctx.driver, CYPHER, {});
    return rows.map((r) => {
      const out: DomainRow = {
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
