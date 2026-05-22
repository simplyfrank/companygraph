import { z } from "zod";
import { runPassthrough } from "../../neo4j/read-only-session";
import type { ToolDef, ToolContext } from "./types";

// FR-T11 — sod_register. The v1 schema doesn't model SoD entries as a
// dedicated node label; instead we synthesise SoD rows from PRECEDES
// pairs whose Activity attributes carry an `sod_severity` flag (plus
// the related `sod_control_id` / `sod_rationale` / `sod_regulation`
// fields).
//
// DD-21 NULL-safety: on the basic seed (and the current enriched seed)
// no Activity carries SoD attrs, so the tool returns an empty array.
// That is the correct, honest answer — we refuse to confabulate.

const SEVERITY_VALUES = ["high", "med", "low", "all"] as const;

const argsSchema = z.object({
  journey: z.string().min(1).optional(),
  severity: z.enum(SEVERITY_VALUES).default("all"),
  regulation: z.string().min(1).optional(),
}).strict();
type Args = z.infer<typeof argsSchema>;

interface SoDEntry {
  activity_pair_ids: [string, string];
  journey_id?: string;
  severity: "high" | "med" | "low";
  control_id: string;
  rationale: string;
  regulation: string;
}

type Data = SoDEntry[];

function parseAttrs(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function asSeverity(v: unknown): "high" | "med" | "low" | undefined {
  return v === "high" || v === "med" || v === "low" ? v : undefined;
}

export const TOOL_DEF: ToolDef<Args, Data> = {
  name: "sod_register",
  description:
    "Synthesised Segregation-of-Duties register: PRECEDES pairs whose " +
    "Activity attributes carry an `sod_severity` flag. " +
    "Returns empty when the graph has no SoD attributes (v1 honest fallback).",
  schema: argsSchema,
  run: async (args: Args, ctx: ToolContext): Promise<Data> => {
    const wheres: string[] = [
      // Pre-filter: at least one endpoint mentions an sod_* attr in its JSON.
      "(a1.attributes_json CONTAINS '\"sod_severity\"' OR a2.attributes_json CONTAINS '\"sod_severity\"')",
    ];
    const params: Record<string, unknown> = {};
    if (args.journey !== undefined) {
      wheres.push("EXISTS { MATCH (a1)-[:PART_OF]->(:UserJourney {id: $journey}) }");
      params.journey = args.journey;
    }

    const stmt = `MATCH (a1:Activity)-[:PRECEDES]->(a2:Activity)
WHERE ${wheres.join(" AND ")}
OPTIONAL MATCH (a1)-[:PART_OF]->(j:UserJourney)
RETURN a1.id AS from_id,
       a2.id AS to_id,
       a1.attributes_json AS a1_attrs,
       a2.attributes_json AS a2_attrs,
       collect(DISTINCT j.id) AS journey_ids`;

    const { rows } = await runPassthrough(ctx.driver, stmt, params);

    const out: SoDEntry[] = [];
    for (const r of rows) {
      // Either endpoint may carry the SoD metadata. Merge with a1 taking
      // precedence; fall back to a2 attribute by attribute.
      const a1 = parseAttrs(r.a1_attrs) ?? {};
      const a2 = parseAttrs(r.a2_attrs) ?? {};
      const severity = asSeverity(a1.sod_severity) ?? asSeverity(a2.sod_severity);
      if (!severity) continue;
      if (args.severity !== "all" && args.severity !== severity) continue;

      const regulation = asString(a1.sod_regulation) ?? asString(a2.sod_regulation);
      if (args.regulation !== undefined && regulation !== args.regulation) continue;

      const control_id =
        asString(a1.sod_control_id) ?? asString(a2.sod_control_id);
      const rationale =
        asString(a1.sod_rationale) ?? asString(a2.sod_rationale);
      if (!control_id || !rationale || !regulation) continue;

      const entry: SoDEntry = {
        activity_pair_ids: [String(r.from_id), String(r.to_id)],
        severity,
        control_id,
        rationale,
        regulation,
      };
      const journeyIds = Array.isArray(r.journey_ids) ? r.journey_ids : [];
      const firstJourney = journeyIds.find(
        (j): j is string => typeof j === "string" && j.length > 0,
      );
      if (firstJourney) entry.journey_id = firstJourney;
      out.push(entry);
    }
    return out;
  },
};
