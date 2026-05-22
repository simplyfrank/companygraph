import { z } from "zod";
import { ValidationError } from "../../errors";
import { runPassthrough } from "../../neo4j/read-only-session";
import type { ToolDef, ToolContext } from "./types";

// FR-T13 — initiative_impact. The graph-core node-label set does NOT
// include "Initiative" (only Domain / UserJourney / Activity / Role /
// System / Location). Until ontology-manager lets users register
// runtime labels, this tool is forward-compatible: it issues a
// label-less MATCH against the (yet-to-exist) Initiative nodes via a
// generic label predicate, and throws `not_found` on the current seed.
//
// The "not_found" path is the correct, honest answer — we refuse to
// fabricate an Initiative.

const argsSchema = z.object({
  initiative_id: z.string().min(1),
}).strict();
type Args = z.infer<typeof argsSchema>;

interface Data {
  initiative_id: string;
  affected_activities: string[];
  delta_cycle_time_pct: number;
  delta_cost_pct: number;
  domains_touched: string[];
}

function parseAttrs(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

// Use a generic node MATCH gated by an "Initiative" label predicate so
// the query is parse-valid even when the label has zero nodes. Neo4j
// 5 accepts `n:Initiative` in WHERE even if no node ever wore the
// label — returns zero rows rather than a schema error.
const CYPHER = `MATCH (n)
WHERE n:Initiative AND n.id = $id
OPTIONAL MATCH (n)-[:AFFECTS]->(a:Activity)
OPTIONAL MATCH (a)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d:Domain)
RETURN n.id AS initiative_id,
       n.attributes_json AS attrs_json,
       collect(DISTINCT a.id) AS affected_activities,
       collect(DISTINCT d.id) AS domains_touched`;

export const TOOL_DEF: ToolDef<Args, Data> = {
  name: "initiative_impact",
  description:
    "Estimate the cycle-time / cost delta of an Initiative. " +
    "The Initiative label is not part of the v1 schema, so this tool " +
    "returns `not_found` until an Initiative is registered via the " +
    "ontology-manager surface.",
  schema: argsSchema,
  run: async (args: Args, ctx: ToolContext): Promise<Data> => {
    const { rows } = await runPassthrough(ctx.driver, CYPHER, { id: args.initiative_id });
    if (rows.length === 0 || rows[0]?.initiative_id == null) {
      throw new ValidationError("not_found", { id: args.initiative_id });
    }
    const r = rows[0]!;
    const attrs = parseAttrs(r.attrs_json) ?? {};
    const dctMaybe = attrs.delta_cycle_time_pct;
    const dcMaybe = attrs.delta_cost_pct;
    const affected = Array.isArray(r.affected_activities) ? r.affected_activities : [];
    const domains = Array.isArray(r.domains_touched) ? r.domains_touched : [];
    return {
      initiative_id: String(r.initiative_id),
      affected_activities: affected.filter(
        (a): a is string => typeof a === "string" && a.length > 0,
      ),
      delta_cycle_time_pct: typeof dctMaybe === "number" ? dctMaybe : 0,
      delta_cost_pct: typeof dcMaybe === "number" ? dcMaybe : 0,
      domains_touched: domains.filter(
        (d): d is string => typeof d === "string" && d.length > 0,
      ),
    };
  },
};
