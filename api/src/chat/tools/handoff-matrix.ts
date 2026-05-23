import { z } from "zod";
import { runPassthrough } from "../../neo4j/read-only-session";
import type { ToolDef, ToolContext } from "./types";

// FR-T10 — handoff_matrix. Walks consecutive PRECEDES pairs, joins to
// the Role(s) that EXECUTE each endpoint Activity, and counts the
// distinct (from_team, to_team) pairs where teams differ.
//
// DD-21 NULL-safety: Role.team / Activity.team are stored inside
// `attributes_json` STRING. On the basic seed those attrs are absent,
// so every row's team is undefined and the tool returns zero cells —
// no crash.
//
// The Cypher pulls the raw role/activity attribute strings; team
// extraction + grouping happens in TS. Vanilla Cypher only.

const argsSchema = z.object({
  journey: z.string().min(1).optional(),
  from_team: z.string().min(1).optional(),
  to_team: z.string().min(1).optional(),
}).strict();
type Args = z.infer<typeof argsSchema>;

interface HandoffCell {
  from_team: string;
  to_team: string;
  count: number;
  journey_ids: string[];
}

interface Data {
  cells: HandoffCell[];
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

function team(raw: unknown): string | undefined {
  const a = parseAttrs(raw);
  if (!a) return undefined;
  return typeof a.team === "string" && a.team.length > 0 ? a.team : undefined;
}

export const TOOL_DEF: ToolDef<Args, Data> = {
  name: "handoff_matrix",
  description:
    "Cross-team hand-off counts derived from consecutive PRECEDES pairs " +
    "where the executing Role of the from-Activity differs from the to-Activity. " +
    "Optionally filter by journey id and/or team pair.",
  schema: argsSchema,
  run: async (args: Args, ctx: ToolContext): Promise<Data> => {
    const wheres: string[] = [];
    const params: Record<string, unknown> = {};

    if (args.journey !== undefined) {
      // Both endpoints must belong to the same journey to count as a
      // within-journey hand-off.
      wheres.push("EXISTS { MATCH (a1)-[:PART_OF]->(:UserJourney {id: $journey}) }");
      wheres.push("EXISTS { MATCH (a2)-[:PART_OF]->(:UserJourney {id: $journey}) }");
      params.journey = args.journey;
    }

    const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(" AND ")}` : "";

    const stmt = `MATCH (a1:Activity)-[:PRECEDES]->(a2:Activity)
${whereClause}
OPTIONAL MATCH (r1:Role)-[:EXECUTES]->(a1)
OPTIONAL MATCH (r2:Role)-[:EXECUTES]->(a2)
OPTIONAL MATCH (a1)-[:PART_OF]->(j:UserJourney)
RETURN a1.id AS from_id,
       a2.id AS to_id,
       a1.attributes_json AS a1_attrs,
       a2.attributes_json AS a2_attrs,
       collect(DISTINCT r1.attributes_json) AS r1_attrs_list,
       collect(DISTINCT r2.attributes_json) AS r2_attrs_list,
       collect(DISTINCT j.id) AS journey_ids`;

    const { rows } = await runPassthrough(ctx.driver, stmt, params);

    // Group key: `${from}\x1f${to}`; value: { count, journey_ids: Set }.
    const cells = new Map<string, { from_team: string; to_team: string; count: number; journeys: Set<string> }>();

    for (const r of rows) {
      // Resolve team per endpoint: prefer Role.team when a role is present;
      // fall back to Activity.team. When both roles resolve to the same team
      // but the activity-level teams differ (e.g. one domain-wide role covers
      // activities in two functional teams), use the activity-level signal so
      // cross-team hand-offs are not masked by shared role assignment.
      const r1List = Array.isArray(r.r1_attrs_list) ? r.r1_attrs_list : [];
      const r2List = Array.isArray(r.r2_attrs_list) ? r.r2_attrs_list : [];
      const roleFrom = r1List.map(team).find((t): t is string => !!t);
      const roleTo = r2List.map(team).find((t): t is string => !!t);
      const actFrom = team(r.a1_attrs);
      const actTo = team(r.a2_attrs);
      // Use role-level when roles are present AND they differ; otherwise fall
      // back to activity-level (which captures functional-team hand-offs even
      // when a single cross-functional role executes both endpoints).
      const from = (roleFrom && roleTo && roleFrom !== roleTo) ? roleFrom : (actFrom ?? roleFrom);
      const to   = (roleFrom && roleTo && roleFrom !== roleTo) ? roleTo   : (actTo   ?? roleTo);
      if (!from || !to) continue;
      if (from === to) continue;
      if (args.from_team !== undefined && from !== args.from_team) continue;
      if (args.to_team !== undefined && to !== args.to_team) continue;

      const key = `${from}\x1f${to}`;
      let cell = cells.get(key);
      if (!cell) {
        cell = { from_team: from, to_team: to, count: 0, journeys: new Set() };
        cells.set(key, cell);
      }
      cell.count += 1;
      const journeyIds = Array.isArray(r.journey_ids) ? r.journey_ids : [];
      for (const j of journeyIds) {
        if (typeof j === "string" && j.length > 0) cell.journeys.add(j);
      }
    }

    const out: HandoffCell[] = [];
    for (const v of cells.values()) {
      out.push({
        from_team: v.from_team,
        to_team: v.to_team,
        count: v.count,
        journey_ids: [...v.journeys].sort(),
      });
    }
    out.sort((a, b) =>
      b.count - a.count ||
      a.from_team.localeCompare(b.from_team) ||
      a.to_team.localeCompare(b.to_team),
    );
    return { cells: out };
  },
};
