// FR-T14 — `cypher` tool: trivial pass-through to `runPassthrough`.
//
// Role-gating is handled one layer up by `dispatch.runTool`, which consults
// `ctx.role.allowed_tools.includes('cypher')` before invoking us. By
// convention the role registry only puts `cypher` in the `graph_analyst`
// role's allowed set, so we don't need to re-check here.
//
// Read-only enforcement is structural: `runPassthrough` opens a `READ`
// session and the driver rejects any write statement with
// `Neo.ClientError.Statement.AccessMode`, which `read-only-session.ts`
// translates into `ValidationError("write_statement_rejected")`. The
// dispatch layer then catches `ValidationError` and returns
// `{ ok: false, error }`, so the orchestrator (T-16) can apply the
// FR-G03 refusal string. We do NOT catch here — the throw IS the gate.

import { z } from "zod";
import { runPassthrough } from "../../neo4j/read-only-session";
import type { ToolDef } from "./types";

const argsSchema = z.object({
  statement: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});

type CypherArgs = z.infer<typeof argsSchema>;

interface CypherData {
  rows: Record<string, unknown>[];
  columns: string[];
}

export const TOOL_DEF: ToolDef<CypherArgs, CypherData> = {
  name: "cypher",
  description:
    "Run an arbitrary read-only Cypher statement (graph_analyst role only). " +
    "Returns rows + columns. Write statements are rejected by the driver's " +
    "READ AccessMode and surface as the `write_statement_rejected` error.",
  schema: argsSchema,
  async run({ statement, params }, ctx) {
    const { rows } = await runPassthrough(ctx.driver, statement, params ?? {});
    const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
    return { rows, columns };
  },
};
