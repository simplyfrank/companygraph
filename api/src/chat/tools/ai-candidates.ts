import { z } from "zod";
import { runPassthrough } from "../../neo4j/read-only-session";
import type { ToolDef, ToolContext } from "./types";

// FR-T12 — ai_candidates. Activities ranked by leverage_score, with
// repetition / data_richness / runs_per_week shown so the user can
// reason about automation candidates.
//
// DD-21 NULL-safety: the four scoring attrs live inside
// `attributes_json` STRING. On the basic seed they're absent → the
// tool returns zero rows (FR-G01-able). On the enriched seed each
// Activity carries the values.
//
// We pull every Activity's attributes_json + (optional) journey id in
// one Cypher pass, then filter + sort in TS.

const argsSchema = z.object({
  journey: z.string().min(1).optional(),
  min_leverage: z.number().min(0).max(1).default(0.5),
}).strict();
type Args = z.infer<typeof argsSchema>;

interface AICandidate {
  activity_id: string;
  journey_id?: string;
  repetition?: string;
  data_richness?: string;
  runs_per_week?: number;
  leverage_score: number;
}

type Data = AICandidate[];

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
  name: "ai_candidates",
  description:
    "Rank Activities by leverage_score (highest first) for automation triage. " +
    "Returns repetition, data_richness, runs_per_week alongside the score. " +
    "Optionally filter by journey id and minimum leverage threshold (default 0.5).",
  schema: argsSchema,
  run: async (args: Args, ctx: ToolContext): Promise<Data> => {
    const wheres: string[] = ["a.attributes_json IS NOT NULL"];
    const params: Record<string, unknown> = {};
    if (args.journey !== undefined) {
      wheres.push("EXISTS { MATCH (a)-[:PART_OF]->(:UserJourney {id: $journey}) }");
      params.journey = args.journey;
    }

    const stmt = `MATCH (a:Activity)
WHERE ${wheres.join(" AND ")}
OPTIONAL MATCH (a)-[:PART_OF]->(j:UserJourney)
RETURN a.id AS activity_id,
       a.attributes_json AS attrs_json,
       collect(DISTINCT j.id) AS journey_ids`;

    const { rows } = await runPassthrough(ctx.driver, stmt, params);

    const out: AICandidate[] = [];
    for (const r of rows) {
      const attrs = parseAttrs(r.attrs_json);
      if (!attrs) continue;
      const leverage = attrs.leverage_score;
      if (typeof leverage !== "number") continue;
      if (leverage < args.min_leverage) continue;

      const cand: AICandidate = {
        activity_id: String(r.activity_id),
        leverage_score: leverage,
      };
      if (typeof attrs.repetition === "string") cand.repetition = attrs.repetition;
      if (typeof attrs.data_richness === "string") cand.data_richness = attrs.data_richness;
      if (typeof attrs.runs_per_week === "number") cand.runs_per_week = attrs.runs_per_week;

      const journeyIds = Array.isArray(r.journey_ids) ? r.journey_ids : [];
      const firstJourney = journeyIds.find(
        (j): j is string => typeof j === "string" && j.length > 0,
      );
      if (firstJourney) cand.journey_id = firstJourney;
      out.push(cand);
    }
    out.sort((a, b) => b.leverage_score - a.leverage_score);
    return out;
  },
};
