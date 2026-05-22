import { z } from "zod";
import type { ToolDef, ToolContext, SchemaSnapshot } from "./types";

// FR-T15 — describe_schema. The orchestrator pre-loads a `SchemaSnapshot` into
// `ctx.schemaSnapshot` at turn-start (DD-15: live `/api/v1/schema` fetch with
// a compile-time fallback). This tool is a trivial passthrough — no Cypher,
// no driver calls — so we satisfy AC-30 with zero round-trips.

const argsSchema = z.object({}).strict();
type Args = z.infer<typeof argsSchema>;

type Data = SchemaSnapshot;

export const TOOL_DEF: ToolDef<Args, Data> = {
  name: "describe_schema",
  description:
    "Return the current graph schema: node labels, edge types, registered attributes per label, " +
    "and a handful of canonical example questions with the tool call that answers them.",
  schema: argsSchema,
  run: async (_args: Args, ctx: ToolContext): Promise<Data> => {
    return ctx.schemaSnapshot;
  },
};
