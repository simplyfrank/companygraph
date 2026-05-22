// FR-T03 — `get_journey`: single multi-clause Cypher fetching a UserJourney,
// its Activities (via PART_OF), the PRECEDES edges restricted to that journey,
// and the role bindings (EXECUTES) that bind to those activities. Per
// DD-04. Returns `not_found` (ValidationError) when the journey id is unknown.
//
// Storage rule (CLAUDE.md): `attributes_json` is a STRING in Neo4j; parse
// at the REST/tool boundary so callers see a plain object.

import { z } from "zod";
import { runPassthrough } from "../../neo4j/read-only-session";
import { ValidationError } from "../../errors";
import type { ToolDef } from "./types";

const argsSchema = z.object({
  id: z.string().min(1),
});
type GetJourneyArgs = z.infer<typeof argsSchema>;

interface JourneyActivity {
  id: string;
  name: string;
  attributes?: Record<string, unknown>;
}
interface JourneyEdge {
  id: string;
  fromId: string;
  toId: string;
  attributes?: Record<string, unknown>;
}
interface RoleBinding {
  activity_id: string;
  role_id: string;
  role_name: string;
}
interface GetJourneyData {
  id: string;
  name: string;
  description?: string;
  attributes?: Record<string, unknown>;
  activities: JourneyActivity[];
  edges: JourneyEdge[];
  role_bindings: RoleBinding[];
}

// Per DD-04. Filters PRECEDES to edges whose both endpoints are PART_OF the
// queried journey, so we don't bleed in cross-journey precedence (the seed
// doesn't currently model any, but the filter is correctness, not optimisation).
const CYPHER = `
MATCH (j:UserJourney { id: $id })
OPTIONAL MATCH (a:Activity)-[:PART_OF]->(j)
WITH j, collect(DISTINCT a) AS activities
OPTIONAL MATCH (a1:Activity)-[p:PRECEDES]->(a2:Activity)
WHERE (a1)-[:PART_OF]->(j) AND (a2)-[:PART_OF]->(j)
WITH j, activities,
     collect(DISTINCT { id: p.id, fromId: a1.id, toId: a2.id, attributes: p.attributes_json }) AS edges
OPTIONAL MATCH (act:Activity)-[:PART_OF]->(j)
OPTIONAL MATCH (r:Role)-[:EXECUTES]->(act)
WITH j, activities, edges,
     collect(DISTINCT { activity_id: act.id, role_id: r.id, role_name: r.name }) AS role_bindings
RETURN j.id AS id, j.name AS name, j.description AS description,
       j.attributes_json AS attributes,
       [a IN activities | { id: a.id, name: a.name, attributes: a.attributes_json }] AS activities,
       edges, role_bindings
`.trim();

function parseAttrs(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export const TOOL_DEF: ToolDef<GetJourneyArgs, GetJourneyData> = {
  name: "get_journey",
  description:
    "Fetch a UserJourney by id together with its Activities (PART_OF), " +
    "intra-journey PRECEDES edges, and role bindings (EXECUTES). " +
    "Returns not_found when the id is unknown.",
  schema: argsSchema,
  async run({ id }, ctx) {
    const { rows } = await runPassthrough(ctx.driver, CYPHER, { id });
    if (rows.length === 0) throw new ValidationError("not_found", { id });
    const row = rows[0] as {
      id: string;
      name: string;
      description: string | null;
      attributes: string | null;
      activities: Array<{ id: string; name: string; attributes: string | null }>;
      edges: Array<{
        id: string | null;
        fromId: string | null;
        toId: string | null;
        attributes: string | null;
      }>;
      role_bindings: Array<{
        activity_id: string | null;
        role_id: string | null;
        role_name: string | null;
      }>;
    };

    // The OPTIONAL MATCH clauses synthesise a single all-null row when no
    // match exists; if the journey id resolved but had zero activities, the
    // top-level row is still real (j matched), but `activities[0]` may carry
    // a null id. Defensive filter.
    const activities: JourneyActivity[] = (row.activities ?? [])
      .filter(a => a && a.id != null)
      .map(a => {
        const attrs = parseAttrs(a.attributes);
        const out: JourneyActivity = { id: a.id, name: a.name };
        if (attrs) out.attributes = attrs;
        return out;
      });

    const edges: JourneyEdge[] = (row.edges ?? [])
      .filter(e => e && e.id != null && e.fromId != null && e.toId != null)
      .map(e => {
        const attrs = parseAttrs(e.attributes);
        const out: JourneyEdge = {
          id: e.id as string,
          fromId: e.fromId as string,
          toId: e.toId as string,
        };
        if (attrs) out.attributes = attrs;
        return out;
      });

    // Filter out the synthetic null rows from the OPTIONAL MATCH (when an
    // activity has no executing role).
    const role_bindings: RoleBinding[] = (row.role_bindings ?? [])
      .filter(rb => rb && rb.activity_id != null && rb.role_id != null)
      .map(rb => ({
        activity_id: rb.activity_id as string,
        role_id: rb.role_id as string,
        role_name: (rb.role_name ?? "") as string,
      }));

    const data: GetJourneyData = {
      id: row.id,
      name: row.name,
      activities,
      edges,
      role_bindings,
    };
    if (row.description != null) data.description = row.description;
    const attrs = parseAttrs(row.attributes);
    if (attrs) data.attributes = attrs;
    return data;
  },
};
