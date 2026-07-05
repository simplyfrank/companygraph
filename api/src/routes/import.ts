import { z } from "zod";
import {
  nodeCreateSchema,
} from "@companygraph/shared/schema/nodes";
import { edgeCreateSchema } from "@companygraph/shared/schema/edges";
import { DEFAULT_SYSTEM_KIND } from "@companygraph/shared/schema/system-kind";
import { getDriver } from "../neo4j/driver";
import { upsertNode, checkAttributesAgainstSchema } from "../storage/nodes";
import { upsertEdge } from "../storage/edges";
import { error, ok, readJson } from "./_helpers";
import { ValidationError } from "../errors";
import { assertNotLifecycleLabel, assertNotLifecycleEdge } from "../storage/model-lifecycle-guard";

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
// AC-25 round-trip preservation — the import shape allows the
// timestamps that `/api/v1/export` emits. upsertNode passes them
// through to the Cypher props so re-importing an export yields the
// exact same `createdAt` / `updatedAt` values.
const nodeWithLabelSchema = nodeCreateSchema.and(
  z.object({
    label: z.string().min(1),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
  }),
);

// Same logic for edges — `createdAt` is round-tripped from the export.
const edgeImportSchema = edgeCreateSchema.and(
  z.object({ createdAt: z.string().datetime().optional() }),
);

interface RowError {
  section: "nodes" | "edges";
  index: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// POST /api/v1/import — two-phase collect-and-continue.
// ?dryRun=true runs row validation with ZERO DB writes: zod row shape +
// (system-augmentation-model T-09 / DD-04) the same registry attribute
// check the real write path runs, for ALL labels — so dry-run per-row
// verdicts match real import. Two documented limitations remain:
//   • edge rows stay envelope-only — edge endpoint EXISTENCE needs DB
//    state and is out of dry-run's contract;
//   • dry-run is no longer pure: the attribute check is a registry READ
//    per node row, so it requires a reachable registry — a connection
//    error mid-loop 500s the request exactly as real import would on a
//    down DB (design-review N-03).
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
    // Row validation with zero DB writes (registry READS only) — see
    // the route header comment.
    return ok(await dryRunPasses(envelope.data));
  }

  const result = await realImport(getDriver(), envelope.data);
  return ok(result);
}

// system-augmentation-model T-09 (DD-03, OQ-1 closed): System rows lacking
// the `systemKind` key get `"functional"` injected — legacy exports and
// pre-migration payloads keep loading, and the graph-core export→import
// round-trip holds. Present-but-invalid values (`systemKind: 42`) are
// deliberately left untouched so validation fails them into `errors[]`
// (collect-and-continue). Applied per raw node row inside BOTH
// `dryRunPasses` and `realImport` — after `handleImport`'s envelope-level
// parse, before per-row `nodeWithLabelSchema` parsing (N-02 call-site pin;
// do not move this into `handleImport`).
function injectSystemKindDefault(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const row = raw as Record<string, unknown>;
  if (row.label !== "System") return raw;
  const attrs = row.attributes;
  if (attrs !== undefined && (typeof attrs !== "object" || attrs === null)) return raw; // let validation fail it
  const map = (attrs ?? {}) as Record<string, unknown>;
  if ("systemKind" in map) return raw; // present (even if invalid) → untouched
  return { ...row, attributes: { ...map, systemKind: DEFAULT_SYSTEM_KIND } };
}

async function dryRunPasses(
  data: z.infer<typeof importPayloadSchema>,
): Promise<{ imported: { nodes: number; edges: number }; errors?: RowError[] }> {
  const errors: RowError[] = [];
  let nodeOk = 0, edgeOk = 0;

  for (let i = 0; i < data.nodes.length; i++) {
    const r = nodeWithLabelSchema.safeParse(injectSystemKindDefault(data.nodes[i]));
    if (!r.success) {
      errors.push({
        section: "nodes", index: i, code: "invalid_payload",
        message: "node row failed validation",
        details: { fieldErrors: r.error.flatten().fieldErrors },
      });
      continue;
    }
    // DD-04 parity: the same non-throwing registry attribute check the
    // real write path runs (a registry READ — zero writes). Unregistered
    // labels stay permissive in both modes.
    const violation = await checkAttributesAgainstSchema(
      r.data.label,
      r.data.attributes,
    );
    if (violation !== null) {
      errors.push({
        section: "nodes", index: i, code: "attribute_violation",
        message: "attribute_violation",
        details: violation,
      });
    } else {
      nodeOk++;
    }
  }
  for (let i = 0; i < data.edges.length; i++) {
    const r = edgeImportSchema.safeParse(data.edges[i]);
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

// business-model-authoring T-02 (design §4.7, OQ-1 (a)) — exported so
// handleAuthoringApply can call the proven two-phase collect-and-continue
// writer in-process with an assembled {nodes, edges} payload. The sole
// edit is the `export` keyword — body, RowError shape, and
// handleImport's own use are unchanged.
export async function realImport(
  driver: ReturnType<typeof getDriver>,
  data: z.infer<typeof importPayloadSchema>,
): Promise<{ imported: { nodes: number; edges: number }; errors?: RowError[] }> {
  // T-23 — Import-route lifecycle guard (requirements pass-2 B-03, option 1).
  // Pre-scan ALL node + edge rows before any upsertNode/upsertEdge executes.
  // A single offending row rejects the WHOLE payload with 409
  // model_lifecycle_route_required and writes nothing. This
  // payload-atomic rejection is a deliberate divergence from the route's
  // established per-row error-report contract — correct for a security
  // guard; do not "fix" it back to row-level partial success.
  // Lifecycle-aware backup/restore is out of scope (owner: the
  // requirements rev-5 scope boundary designates).
  // Add-only: this block is self-contained and modifies neither the
  // injection nor the per-row upsert loop below.
  for (const raw of data.nodes) {
    const label = (raw as Record<string, unknown>)?.label;
    if (typeof label === "string") assertNotLifecycleLabel(label);
  }
  for (const raw of data.edges) {
    const type = (raw as Record<string, unknown>)?.type;
    if (typeof type === "string") assertNotLifecycleEdge(type);
  }

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

  // Phase 1: nodes. Injection (T-09) runs per raw row, before the zod
  // row parse — same call site as dryRunPasses (N-02 pin).
  for (let i = 0; i < data.nodes.length; i++) {
    const parsed = nodeWithLabelSchema.safeParse(injectSystemKindDefault(data.nodes[i]));
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
    const parsed = edgeImportSchema.safeParse(data.edges[i]);
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
