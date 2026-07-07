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

// funnel-pipeline-modeling T-03 + T-05 (design §3.3, §4.1, §4.3, §4.4 — AC-03,
// AC-04, AC-05, AC-06; FR-03, FR-04, FR-05, FR-07, NFR-01, NFR-02).
// HAS_STAGE/CONVERTS_TO endpoint whitelist + the funnel-owned transition route
// range check.

const API = "http://127.0.0.1:8787";
const cleanup: Cleanup = newCleanup();

let funnelId: string;
let stageA: string;
let stageB: string;

beforeAll(async () => {
  await ensureFunnelOntology(API);
  funnelId = await createNode(cleanup, "Funnel", "edge-test-funnel", { modelId: "m" });
  stageA = await createNode(cleanup, "Stage", "edge-stage-a", { stageOrder: 0 });
  stageB = await createNode(cleanup, "Stage", "edge-stage-b", { stageOrder: 1 });
});

afterAll(async () => {
  await runCleanup(cleanup);
  await closeDriver();
});

describe("AC-03: HAS_STAGE endpoint whitelist (Funnel→Stage only)", () => {
  test("Funnel→Stage HAS_STAGE succeeds", async () => {
    const { status } = await api("POST", "/edges", {
      type: "HAS_STAGE",
      fromId: funnelId,
      toId: stageA,
    });
    expect(status).toBe(201);
  });

  test("Stage→Funnel HAS_STAGE → 400 edge_endpoint_label_mismatch", async () => {
    const { status, body } = await api<{ error?: { code?: string } }>("POST", "/edges", {
      type: "HAS_STAGE",
      fromId: stageA,
      toId: funnelId,
    });
    expect(status).toBe(400);
    expect(body.error?.code).toBe("edge_endpoint_label_mismatch");
  });
});

describe("AC-04: CONVERTS_TO endpoint whitelist (Stage→Stage only)", () => {
  test("Funnel→Stage CONVERTS_TO (via generic route) → 400 edge_endpoint_label_mismatch", async () => {
    const { status, body } = await api<{ error?: { code?: string } }>(
      "POST",
      "/funnels/transitions",
      { fromId: funnelId, toId: stageA, conversionRate: 0.5, dropOffRate: 0.5 },
    );
    expect(status).toBe(400);
    expect(body.error?.code).toBe("edge_endpoint_label_mismatch");
  });
});

describe("AC-05/AC-06: funnel-owned transition route range check + round-trip", () => {
  test("valid rates (both in [0,1]) → 201 and persist intact", async () => {
    const { status, body } = await api<{ id: string; attributes: Record<string, unknown> }>(
      "POST",
      "/funnels/transitions",
      { fromId: stageA, toId: stageB, conversionRate: 0.62, dropOffRate: 0.38 },
    );
    expect(status).toBe(201);
    expect(body.attributes.conversionRate).toBeCloseTo(0.62, 10);
    expect(body.attributes.dropOffRate).toBeCloseTo(0.38, 10);
  });

  test("conversionRate > 1 → 400 attribute_violation", async () => {
    const { status, body } = await api<{ error?: { code?: string } }>(
      "POST",
      "/funnels/transitions",
      { fromId: stageA, toId: stageB, conversionRate: 1.2, dropOffRate: 0.3 },
    );
    expect(status).toBe(400);
    expect(body.error?.code).toBe("attribute_violation");
  });

  test("dropOffRate < 0 → 400 attribute_violation", async () => {
    const { status, body } = await api<{ error?: { code?: string } }>(
      "POST",
      "/funnels/transitions",
      { fromId: stageA, toId: stageB, conversionRate: 0.5, dropOffRate: -0.1 },
    );
    expect(status).toBe(400);
    expect(body.error?.code).toBe("attribute_violation");
  });
});
