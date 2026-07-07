// funnel-pipeline-modeling T-04 (design §3.4, §4.4, §5 — Rule C; FR-05, FR-07,
// NFR-02, NFR-04; AC-05/AC-06). The funnel-owned CONVERTS_TO transition write
// route — the ownership-safe home for the [0,1] range check.
//
// Rule C: the range validation of conversionRate/dropOffRate lives HERE, not in
// the generic edge path (api/src/routes/edges.ts / api/src/storage/edges.ts /
// shared/src/schema/edges.ts are graph-core-owned and NOT edited). This route
// range-validates with zod (→ 400 attribute_violation) then DELEGATES the
// accepted write to graph-core's createEdge — so the FR-04 Stage→Stage endpoint
// whitelist + cross-type edge-id uniqueness still apply, and the rates persist as
// attributes_json on the CONVERTS_TO relationship (round-trip intact — AC-05).

import { z } from "zod";
import { uuidv7 } from "@companygraph/shared/schema/nodes";
import { getDriver } from "../neo4j/driver";
import { createEdge } from "../storage/edges";
import { ValidationError } from "../errors";
import { ok, readJson } from "./_helpers";

// §3.4 — the only new zod at a boundary. conversionRate/dropOffRate are
// top-level for a clean range check; the route folds them into the edge
// attributes before delegating to createEdge.
const rate = z.number().min(0).max(1); // [0,1], inclusive
export const funnelTransitionSchema = z.object({
  fromId: uuidv7, // source Stage id
  toId: uuidv7, // target Stage id
  conversionRate: rate,
  dropOffRate: rate,
  attributes: z.record(z.unknown()).default({}), // free supplementary keys
});
export type FunnelTransitionInput = z.infer<typeof funnelTransitionSchema>;

// POST /api/v1/funnels/transitions — create a CONVERTS_TO edge with a
// range-validated conversionRate/dropOffRate.
export async function handleFunnelTransitionPost(req: Request): Promise<Response> {
  const body = await readJson(req);
  const parsed = funnelTransitionSchema.safeParse(body);
  if (!parsed.success) {
    // A rate outside [0,1] (or any other schema failure) → 400 attribute_violation
    // (an existing closed ERROR_CODES member; api/src/errors.ts is untouched).
    throw new ValidationError("attribute_violation", {
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
        code: i.code,
      })),
    });
  }

  const { fromId, toId, conversionRate, dropOffRate, attributes } = parsed.data;
  const edge = await createEdge(getDriver(), {
    type: "CONVERTS_TO",
    fromId,
    toId,
    attributes: { ...attributes, conversionRate, dropOffRate },
  });
  return ok(edge, 201);
}
