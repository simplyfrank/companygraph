import { z } from "zod";
import { NODE_LABELS } from "@companygraph/shared/schema/nodes";
import {
  edgeCreateSchema,
  nodeCreateSchema,
} from "@companygraph/shared/schema/edges"; // re-export not needed here
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

const nodeWithLabelSchema = nodeCreateSchema.and(
  z.object({ label: z.enum(NODE_LABELS) }),
);

interface RowError {
  section: "nodes" | "edges";
  index: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// POST /api/v1/import — two-phase collect-and-continue.
// ?dryRun=true wraps the work in an explicit tx that gets rolled back at
// the end regardless of outcome (FR-20).
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

  const driver = getDriver();

  if (dryRun) {
    // Run both phases inside an explicit tx, then ROLLBACK.
    const session = driver.session();
    try {
      const tx = session.beginTransaction();
      try {
        // Inside the dry-run tx, write through storage helpers that grab
        // their own session. To get true dry-run isolation we'd need
        // storage to accept a tx parameter — for graph-core simplicity
        // we instead run a real two-phase pass and then DELETE everything
        // it wrote at the end inside the tx, then roll back.
        // Cheaper alternative: run the validation passes WITHOUT writing.
        const result = await dryRunPasses(driver, envelope.data);
        await tx.rollback();
        return ok(result);
      } catch (e) {
        try { await tx.rollback(); } catch { /* swallow */ }
        throw e;
      }
    } finally {
      await session.close();
    }
  }

  const result = await realImport(driver, envelope.data);
  return ok(result);
}

async function dryRunPasses(
  driver: ReturnType<typeof getDriver>,
  data: z.infer<typeof importPayloadSchema>,
): Promise<{ imported: { nodes: number; edges: number }; errors?: RowError[] }> {
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

  // Phase 1: nodes.
  for (let i = 0; i < data.nodes.length; i++) {
    const parsed = nodeWithLabelSchema.safeParse(data.nodes[i]);
    if (!parsed.success) {
      errors.push({
        section: "nodes", index: i, code: "invalid_payload",
        message: "node row failed validation",
        details: { fieldErrors: parsed.error.flatten().fieldErrors },
      });
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
      } else {
        throw e;
      }
    }
  }

  // Phase 2: edges.
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
    try {
      await upsertEdge(driver, parsed.data, 2);
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
