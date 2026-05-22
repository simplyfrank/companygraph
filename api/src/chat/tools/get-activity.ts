// FR-T04 — `get_activity`: fetch an Activity by id along with its executing
// Roles (EXECUTES), used Systems (USES_SYSTEM), Locations (AT_LOCATION), and
// the PRECEDES edges in both directions (outgoing → `precedes`, incoming →
// `preceded_by`). One round-trip via sequenced OPTIONAL MATCHes.
//
// `attributes_json` is parsed at the boundary per CLAUDE.md.

import { z } from "zod";
import { runPassthrough } from "../../neo4j/read-only-session";
import { ValidationError } from "../../errors";
import type { ToolDef } from "./types";

const argsSchema = z.object({
  id: z.string().min(1),
});
type GetActivityArgs = z.infer<typeof argsSchema>;

interface NamedRef {
  id: string;
  name: string;
}
interface EdgeRef {
  id: string;
  type: "PRECEDES";
  fromId: string;
  toId: string;
  attributes?: Record<string, unknown>;
}
interface GetActivityData {
  id: string;
  name: string;
  description?: string;
  attributes?: Record<string, unknown>;
  roles: NamedRef[];
  systems: NamedRef[];
  locations: NamedRef[];
  precedes: EdgeRef[];
  preceded_by: EdgeRef[];
}

const CYPHER = `
MATCH (a:Activity { id: $id })
OPTIONAL MATCH (r:Role)-[:EXECUTES]->(a)
WITH a, collect(DISTINCT { id: r.id, name: r.name }) AS roles
OPTIONAL MATCH (a)-[:USES_SYSTEM]->(s:System)
WITH a, roles, collect(DISTINCT { id: s.id, name: s.name }) AS systems
OPTIONAL MATCH (a)-[:AT_LOCATION]->(l:Location)
WITH a, roles, systems, collect(DISTINCT { id: l.id, name: l.name }) AS locations
OPTIONAL MATCH (a)-[po:PRECEDES]->(nxt:Activity)
WITH a, roles, systems, locations,
     collect(DISTINCT { id: po.id, fromId: a.id, toId: nxt.id, attributes: po.attributes_json }) AS precedes
OPTIONAL MATCH (prv:Activity)-[pi:PRECEDES]->(a)
WITH a, roles, systems, locations, precedes,
     collect(DISTINCT { id: pi.id, fromId: prv.id, toId: a.id, attributes: pi.attributes_json }) AS preceded_by
RETURN a.id AS id, a.name AS name, a.description AS description,
       a.attributes_json AS attributes,
       roles, systems, locations, precedes, preceded_by
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

function mapNamed(
  list: Array<{ id: string | null; name: string | null }> | undefined,
): NamedRef[] {
  return (list ?? [])
    .filter(x => x && x.id != null)
    .map(x => ({ id: x.id as string, name: (x.name ?? "") as string }));
}

function mapEdges(
  list:
    | Array<{
        id: string | null;
        fromId: string | null;
        toId: string | null;
        attributes: string | null;
      }>
    | undefined,
): EdgeRef[] {
  return (list ?? [])
    .filter(e => e && e.id != null && e.fromId != null && e.toId != null)
    .map(e => {
      const attrs = parseAttrs(e.attributes);
      const out: EdgeRef = {
        id: e.id as string,
        type: "PRECEDES",
        fromId: e.fromId as string,
        toId: e.toId as string,
      };
      if (attrs) out.attributes = attrs;
      return out;
    });
}

export const TOOL_DEF: ToolDef<GetActivityArgs, GetActivityData> = {
  name: "get_activity",
  description:
    "Fetch an Activity by id together with its executing Roles, used Systems, " +
    "Locations, and adjacent PRECEDES edges (outgoing `precedes` and incoming " +
    "`preceded_by`). Returns not_found when the id is unknown.",
  schema: argsSchema,
  async run({ id }, ctx) {
    const { rows } = await runPassthrough(ctx.driver, CYPHER, { id });
    if (rows.length === 0) throw new ValidationError("not_found", { id });
    const row = rows[0] as {
      id: string;
      name: string;
      description: string | null;
      attributes: string | null;
      roles: Array<{ id: string | null; name: string | null }>;
      systems: Array<{ id: string | null; name: string | null }>;
      locations: Array<{ id: string | null; name: string | null }>;
      precedes: Array<{
        id: string | null;
        fromId: string | null;
        toId: string | null;
        attributes: string | null;
      }>;
      preceded_by: Array<{
        id: string | null;
        fromId: string | null;
        toId: string | null;
        attributes: string | null;
      }>;
    };

    const data: GetActivityData = {
      id: row.id,
      name: row.name,
      roles: mapNamed(row.roles),
      systems: mapNamed(row.systems),
      locations: mapNamed(row.locations),
      precedes: mapEdges(row.precedes),
      preceded_by: mapEdges(row.preceded_by),
    };
    if (row.description != null) data.description = row.description;
    const attrs = parseAttrs(row.attributes);
    if (attrs) data.attributes = attrs;
    return data;
  },
};
