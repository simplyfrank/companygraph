import { z } from "zod";
import { runPassthrough } from "../../neo4j/read-only-session";
import type { ToolDef, ToolContext } from "./types";

// FR-T09 — sla_hotspots. Walks PRECEDES edges, computes per-edge
// delta_pct = (observed_p99_ms - sla_p99_ms) / sla_p99_ms, classifies
// as breach (delta > 0) / warn (-0.1 < delta ≤ 0) / ok (delta ≤ -0.1).
//
// DD-04 / DD-21 NULL-safety: every Cypher template filters out edges
// missing either of the two attrs. On the basic seed (no SLA attrs)
// the tool returns zero rows — no crash, FR-G01 zero-row refusal lands
// upstream in the agent loop.
//
// Storage note (CLAUDE.md): edge attributes live in `r.attributes_json`
// as a STRING. We project the STRING out of Cypher and parse in TS to
// stay vanilla (no apoc dependency).

const STATUS_VALUES = ["breach", "warn", "ok", "all"] as const;

const argsSchema = z.object({
  journey: z.string().min(1).optional(),
  status: z.enum(STATUS_VALUES).default("all"),
  system: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(50),
}).strict();
type Args = z.infer<typeof argsSchema>;

interface HotspotRow {
  edge_id: string;
  journey_id?: string;
  from_activity: string;
  to_activity: string;
  target_p99_ms: number;
  observed_p99_ms: number;
  delta_pct: number;
  status: "breach" | "warn" | "ok";
}

type Data = HotspotRow[];

function parseAttrs(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function classify(delta: number): "breach" | "warn" | "ok" {
  if (delta > 0) return "breach";
  if (delta > -0.1) return "warn";
  return "ok";
}

export const TOOL_DEF: ToolDef<Args, Data> = {
  name: "sla_hotspots",
  description:
    "List PRECEDES edges with SLA breach/warn classification " +
    "(delta_pct = (observed_p99_ms - sla_p99_ms) / sla_p99_ms). " +
    "Optionally filter by journey id, status, and/or system id (joined via USES_SYSTEM).",
  schema: argsSchema,
  run: async (args: Args, ctx: ToolContext): Promise<Data> => {
    // Build the MATCH dynamically: include a system join only when requested
    // (USES_SYSTEM may attach to either endpoint of the PRECEDES edge).
    const wheres: string[] = [
      "r.attributes_json IS NOT NULL",
    ];
    const params: Record<string, unknown> = { limit: args.limit };

    if (args.journey !== undefined) {
      wheres.push("EXISTS { MATCH (a1)-[:PART_OF]->(:UserJourney {id: $journey}) }");
      params.journey = args.journey;
    }

    let systemClause = "";
    if (args.system !== undefined) {
      // Either endpoint may USES_SYSTEM the requested System.
      systemClause = `MATCH (sys:System {id: $system})
WHERE (a1)-[:USES_SYSTEM]->(sys) OR (a2)-[:USES_SYSTEM]->(sys)`;
      params.system = args.system;
    }

    const stmt = `MATCH (a1:Activity)-[r:PRECEDES]->(a2:Activity)
${systemClause}
WHERE ${wheres.join(" AND ")}
OPTIONAL MATCH (a1)-[:PART_OF]->(j:UserJourney)
RETURN r.id AS edge_id,
       a1.id AS from_activity,
       a2.id AS to_activity,
       r.attributes_json AS attrs_json,
       collect(DISTINCT j.id) AS journey_ids
LIMIT $limit`;

    const { rows } = await runPassthrough(ctx.driver, stmt, params);

    const out: HotspotRow[] = [];
    for (const r of rows) {
      const attrs = parseAttrs(r.attrs_json);
      if (!attrs) continue;
      const target = attrs.sla_p99_ms;
      const observed = attrs.observed_p99_ms;
      if (typeof target !== "number" || typeof observed !== "number" || target === 0) {
        continue;
      }
      const delta = (observed - target) / target;
      const status = classify(delta);
      if (args.status !== "all" && args.status !== status) continue;

      const row: HotspotRow = {
        edge_id: String(r.edge_id),
        from_activity: String(r.from_activity),
        to_activity: String(r.to_activity),
        target_p99_ms: target,
        observed_p99_ms: observed,
        delta_pct: delta,
        status,
      };
      const journeyIds = Array.isArray(r.journey_ids) ? r.journey_ids : [];
      const firstJourney = journeyIds.find(
        (j): j is string => typeof j === "string" && j.length > 0,
      );
      if (firstJourney) row.journey_id = firstJourney;
      out.push(row);
    }
    out.sort((a, b) => b.delta_pct - a.delta_pct);
    return out.slice(0, args.limit);
  },
};
