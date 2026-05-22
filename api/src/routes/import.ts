import { z } from "zod";
import {
  nodeCreateSchema,
} from "@companygraph/shared/schema/nodes";
import { edgeCreateSchema } from "@companygraph/shared/schema/edges";
import { getDriver } from "../neo4j/driver";
import { upsertNode } from "../storage/nodes";
import { upsertEdge } from "../storage/edges";
import { error, ok, readJson } from "./_helpers";
import { ValidationError } from "../errors";

// Envelope-level zod (loose on rows — each row is validated individually
// inside the loop so per-row failures can be collected rather than
// failing the whole envelope).
const importPayloadSchema = z.object({
  nodes: z.array(z.record(z.unknown())),
  edges: z.array(z.record(z.unknown())),
});

// label is z.string() — the ontology registry is runtime-extensible.
// Registry-existence is enforced downstream by assertAttributesMatchSchema
// (not_found → 400 attribute_violation) and by the upsertNode Cypher
// (unknown label → empty MERGE result or Neo4j error). The frozen
// NODE_LABELS enum was the bug identified in the data-loading analysis.
const nodeWithLabelSchema = nodeCreateSchema.and(
  z.object({ label: z.string().min(1) }),
);

interface RowError {
  section: "nodes" | "edges";
  index: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// POST /api/v1/import — two-phase collect-and-continue.
// ?dryRun=true runs schema-only validation (no DB writes). This is the
// correct dryRun contract: the storage helpers each open their own
// sessions so a wrapping transaction cannot roll them back. A tx-scoped
// dryRun would require every storage helper to accept an injected
// ManagedTransaction. For the import use-case pure schema validation is
// the right semantic: callers learn exactly which rows would fail before
// committing, without touching the graph.
//
// Per pinned decision C-09: response is **200** even when 100 % of phase
// 1 fails — row-level failures are reported via `errors[]`, the HTTP
// layer succeeded. 400 is reserved for envelope-level parse failures.
export async function handleImport(req: Request): Promise<Response> {
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "true";
  const body = await readJson(req);
  const envelope = importPayloadSchema.safeParse(body);
  if (!envelope.success) {
    throw new ValidationError("invalid_payload", {
      fieldErrors: envelope.error.flatten().fieldErrors,
    });
  }

  if (dryRun) {
    // Schema-only validation — zero DB writes. See comment above.
    return ok(dryRunPasses(envelope.data));
  }

  const result = await realImport(getDriver(), envelope.data);
  return ok(result);
}

function dryRunPasses(
  data: z.infer<typeof importPayloadSchema>,
): { imported: { nodes: number; edges: number }; errors?: RowError[] } {
  const errors: RowError[] = [];
  let nodeOk = 0, edgeOk = 0;

  for (let i = 0; i < data.nodes.length; i++) {
    const r = nodeWithLabelSchema.safeParse(data.nodes[i]);
    if (!r.success) {
      errors.push({
        section: "nodes", index: i, code: "invalid_payload",
        message: "node row failed validation",
        details: { fieldErrors: r.error.flatten().fieldErrors },
      });
    } else {
      nodeOk++;
    }
  }
  for (let i = 0; i < data.edges.length; i++) {
    const r = edgeCreateSchema.safeParse(data.edges[i]);
    if (!r.success) {
      errors.push({
        section: "edges", index: i, code: "invalid_payload",
        message: "edge row failed validation",
        details: { fieldErrors: r.error.flatten().fieldErrors },
      });
    } else {
      edgeOk++;
    }
  }

  return errors.length > 0
    ? { imported: { nodes: nodeOk, edges: edgeOk }, errors }
    : { imported: { nodes: nodeOk, edges: edgeOk } };
}

async function realImport(
  driver: ReturnType<typeof getDriver>,
  data: z.infer<typeof importPayloadSchema>,
): Promise<{ imported: { nodes: number; edges: number }; errors?: RowError[] }> {
  const errors: RowError[] = [];
  let nodeOk = 0, edgeOk = 0;

  // Track ids of nodes that failed phase 1 — used in phase 2 to tag
  // `edge_endpoint_missing` errors with `details.phase: 1` when the
  // missing endpoint was a payload row that failed phase 1 (per design
  // §4.3 pass-1 C-03; closes the open-accepted gap surfaced by the new
  // `import-phase-errors.integration.test.ts` test pack).
  const phase1FailedIds = new Set<string>();
  const recordPhase1Failure = (raw: unknown) => {
    if (raw && typeof raw === "object" && "id" in raw) {
      const id = (raw as { id: unknown }).id;
      if (typeof id === "string") phase1FailedIds.add(id);
    }
  };

  // Phase 1: nodes.
  for (let i = 0; i < data.nodes.length; i++) {
    const parsed = nodeWithLabelSchema.safeParse(data.nodes[i]);
    if (!parsed.success) {
      errors.push({
        section: "nodes", index: i, code: "invalid_payload",
        message: "node row failed validation",
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
      recordPhase1Failure(data.nodes[i]);
      continue;
    }
    const { label, ...nodeData } = parsed.data;
    try {
      await upsertNode(driver, label, nodeData);
      nodeOk++;
    } catch (e) {
      if (e instanceof ValidationError) {
        errors.push({
          section: "nodes", index: i, code: e.code,
          message: e.code, details: e.details,
        });
        recordPhase1Failure(data.nodes[i]);
      } else {
        throw e;
      }
    }
  }

  // Phase 2: edges. Pick the phase tag per-edge: phase=1 when EITHER
  // endpoint id appears in `phase1FailedIds` (a payload row failed
  // before the edge could land); phase=2 when both endpoints exist in
  // the DB (the edge_endpoint_missing means the endpoint never existed,
  // not "was in payload but failed").
  for (let i = 0; i < data.edges.length; i++) {
    const parsed = edgeCreateSchema.safeParse(data.edges[i]);
    if (!parsed.success) {
      errors.push({
        section: "edges", index: i, code: "invalid_payload",
        message: "edge row failed validation",
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
      continue;
    }
    const blamePhase: 1 | 2 =
      phase1FailedIds.has(parsed.data.fromId) ||
      phase1FailedIds.has(parsed.data.toId)
        ? 1
        : 2;
    try {
      await upsertEdge(driver, parsed.data, blamePhase);
      edgeOk++;
    } catch (e) {
      if (e instanceof ValidationError) {
        errors.push({
          section: "edges", index: i, code: e.code,
          message: e.code, details: e.details,
        });
      } else {
        throw e;
      }
    }
  }

  return errors.length > 0
    ? { imported: { nodes: nodeOk, edges: edgeOk }, errors }
    : { imported: { nodes: nodeOk, edges: edgeOk } };
}

// Silence unused-import lint — these are kept for re-export from
// schema/edges in the future.
void error;
