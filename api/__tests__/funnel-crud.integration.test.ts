import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { closeDriver } from "../src/neo4j/driver";
import {
  api,
  createNode,
  newCleanup,
  runCleanup,
  type Cleanup,
} from "./helpers/model-fixtures";
import { ensureFunnelOntology } from "../src/seed/ensure-funnel-ontology";

// funnel-pipeline-modeling T-14 (design §4.2, §4.3, §9 — AC-07, AC-08; FR-06,
// FR-07, NFR-02). Funnel/Stage node CRUD + HAS_STAGE generic-edge round-trip ride
// the EXISTING generic graph-core routes with zero new/edited node/edge-route code.

const API = "http://127.0.0.1:8787";
const cleanup: Cleanup = newCleanup();

const COMPOSITION_QUERY = `MATCH (f:Funnel {id:$funnelId})
OPTIONAL MATCH (f)-[:HAS_STAGE]->(s:Stage)
RETURN s.id AS stageId
ORDER BY s.stageOrder`;

beforeAll(async () => {
  await ensureFunnelOntology(API);
});

afterAll(async () => {
  await runCleanup(cleanup);
  await closeDriver();
});

describe("AC-07: Funnel/Stage node CRUD round-trip through the generic path", () => {
  test("POST/GET/PATCH/DELETE lifecycle on both labels", async () => {
    // POST Funnel with a modelId marker
    const funnel = await api<{ id: string }>("POST", "/nodes/Funnel", {
      name: "crud-funnel",
      attributes: { modelId: "operator-root-x" },
    });
    expect(funnel.status).toBe(201);
    const funnelId = funnel.body.id;
    cleanup.nodeIds.push({ label: "Funnel", id: funnelId });

    // POST Stage with a valid integer stageOrder
    const stage = await api<{ id: string }>("POST", "/nodes/Stage", {
      name: "crud-stage",
      attributes: { stageOrder: 0 },
    });
    expect(stage.status).toBe(201);
    const stageId = stage.body.id;
    cleanup.nodeIds.push({ label: "Stage", id: stageId });

    // GET → attributes parsed at the REST boundary
    const getFunnel = await api<{ attributes: Record<string, unknown> }>(
      "GET",
      `/nodes/Funnel/${funnelId}`,
    );
    expect(getFunnel.status).toBe(200);
    expect(getFunnel.body.attributes.modelId).toBe("operator-root-x");

    // PATCH Stage stageOrder → 200, partial SET leaves other fields intact
    const patch = await api<{ attributes: Record<string, unknown> }>(
      "PATCH",
      `/nodes/Stage/${stageId}`,
      { attributes: { stageOrder: 3 } },
    );
    expect(patch.status).toBe(200);
    const reget = await api<{ attributes: Record<string, unknown> }>(
      "GET",
      `/nodes/Stage/${stageId}`,
    );
    expect(reget.body.attributes.stageOrder).toBe(3);

    // DELETE → 204, then GET → 404
    const del = await api("DELETE", `/nodes/Stage/${stageId}`);
    expect(del.status).toBe(204);
    const gone = await api("GET", `/nodes/Stage/${stageId}`);
    expect(gone.status).toBe(404);
    // Remove the deleted stage from cleanup so runCleanup doesn't double-delete.
    cleanup.nodeIds = cleanup.nodeIds.filter((n) => n.id !== stageId);
  });
});

describe("AC-08: HAS_STAGE Funnel→Stage via the generic edge route + composition read", () => {
  test("HAS_STAGE links funnel→stage and the composition read returns it", async () => {
    const funnelId = await createNode(cleanup, "Funnel", "link-funnel", { modelId: "m" });
    const stageId = await createNode(cleanup, "Stage", "link-stage", { stageOrder: 0 });

    const link = await api("POST", "/edges", {
      type: "HAS_STAGE",
      fromId: funnelId,
      toId: stageId,
    });
    expect(link.status).toBe(201);

    const read = await api<{ rows: { stageId: string }[] }>("POST", "/query/cypher", {
      statement: COMPOSITION_QUERY,
      params: { funnelId },
    });
    expect(read.status).toBe(200);
    const stageIds = read.body.rows.map((r) => String(r.stageId));
    expect(stageIds).toContain(stageId);
  });
});
