import { z } from "zod";
import { ValidationError } from "../../errors";
import { runPassthrough } from "../../neo4j/read-only-session";
import type { ToolDef, ToolContext } from "./types";

// FR-T02 — get_domain. Returns one Domain with its child UserJourneys.
// Per DD-04: single multi-clause query with OPTIONAL MATCH so a Domain with
// zero journeys still returns one row (with an empty journeys list).
//
// If no Domain matches the supplied id we throw `ValidationError("not_found")`
// — the dispatch layer converts that to a `{ ok: false, error }` tool envelope.

const argsSchema = z.object({
  id: z.string().min(1),
}).strict();
type Args = z.infer<typeof argsSchema>;

interface JourneyRef {
  id: string;
  name: string;
  description?: string;
}

interface Data {
  id: string;
  name: string;
  description?: string;
  journeys: JourneyRef[];
}

const CYPHER = `MATCH (d:Domain {id: $id})
OPTIONAL MATCH (j:UserJourney)-[:PART_OF]->(d)
RETURN d.id AS id,
       d.name AS name,
       d.description AS description,
       collect(DISTINCT { id: j.id, name: j.name, description: j.description }) AS journeys`;

export const TOOL_DEF: ToolDef<Args, Data> = {
  name: "get_domain",
  description:
    "Fetch a single Domain by id with its child UserJourneys. " +
    "Returns `not_found` if the id does not exist.",
  schema: argsSchema,
  run: async (args: Args, ctx: ToolContext): Promise<Data> => {
    const { rows } = await runPassthrough(ctx.driver, CYPHER, { id: args.id });
    if (rows.length === 0) {
      throw new ValidationError("not_found", { id: args.id });
    }
    const r = rows[0]!;
    // d.id is null when the MATCH found no Domain at all (OPTIONAL MATCH then
    // collects a single { id: null, ... } row). Guard against that to keep the
    // `not_found` contract precise.
    if (r.id === null || r.id === undefined) {
      throw new ValidationError("not_found", { id: args.id });
    }
    const rawJourneys = Array.isArray(r.journeys) ? r.journeys : [];
    const journeys: JourneyRef[] = rawJourneys
      .map((j): JourneyRef | null => {
        if (!j || typeof j !== "object") return null;
        const jo = j as Record<string, unknown>;
        if (typeof jo.id !== "string" || jo.id.length === 0) return null;
        const ref: JourneyRef = {
          id: jo.id,
          name: typeof jo.name === "string" ? jo.name : "",
        };
        if (typeof jo.description === "string" && jo.description.length > 0) {
          ref.description = jo.description;
        }
        return ref;
      })
      .filter((j): j is JourneyRef => j !== null);

    const out: Data = {
      id: String(r.id),
      name: String(r.name),
      journeys,
    };
    if (typeof r.description === "string" && r.description.length > 0) {
      out.description = r.description;
    }
    return out;
  },
};
