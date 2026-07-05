import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { api, newCleanup, runCleanup, buildModelWithJourney, type JourneyFixture } from "./helpers/model-fixtures";

// model-workspace-core T-23 / AC-22 — import-route lifecycle guard.
// A mixed import payload (N valid ordinary rows + one lifecycle row)
// is rejected with 409 model_lifecycle_route_required and writes
// NOTHING (including the valid rows). A lifecycle-free payload still
// imports (round-trip unaffected for ordinary graph data).

interface ErrRes {
  error: { code: string };
}

interface StatsRes {
  nodes: number;
  edges: number;
}

const cleanup = newCleanup();
let fx: JourneyFixture;

async function getStats(): Promise<StatsRes> {
  const res = await api<StatsRes>("GET", "/stats");
  return res.body;
}

describe("integration: model-workspace-core T-23 import lifecycle guard (AC-22)", () => {
  beforeAll(async () => {
    fx = await buildModelWithJourney(cleanup, "import-guard");
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("mixed payload with a BusinessModel node row → 409 + stats unchanged (write-nothing)", async () => {
    const before = await getStats();

    // Mix: 2 valid Domain rows + 1 lifecycle BusinessModel row.
    const res = await api<ErrRes>("POST", "/import", {
      nodes: [
        { label: "Domain", name: "guard-dom-1", attributes: {} },
        { label: "Domain", name: "guard-dom-2", attributes: {} },
        { label: "BusinessModel", name: "smuggled-model", attributes: {} },
      ],
      edges: [],
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("model_lifecycle_route_required");

    const after = await getStats();
    expect(after.nodes).toBe(before.nodes);
    expect(after.edges).toBe(before.edges);
  });

  test("mixed payload with an IN_MODEL edge row → 409 + stats unchanged", async () => {
    const before = await getStats();

    // Mix: 1 valid Domain + 1 valid PART_OF edge + 1 lifecycle IN_MODEL edge.
    const res = await api<ErrRes>("POST", "/import", {
      nodes: [
        { label: "Domain", name: "guard-dom-edge", attributes: {} },
      ],
      edges: [
        { type: "PART_OF", fromId: "00000000-0000-7000-8000-000000000001", toId: "00000000-0000-7000-8000-000000000002" },
        { type: "IN_MODEL", fromId: "00000000-0000-7000-8000-000000000003", toId: "00000000-0000-7000-8000-000000000004" },
      ],
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("model_lifecycle_route_required");

    const after = await getStats();
    expect(after.nodes).toBe(before.nodes);
    expect(after.edges).toBe(before.edges);
  });

  test("lifecycle-free payload still imports (round-trip unaffected)", async () => {
    const before = await getStats();

    const res = await api<{ imported: { nodes: number; edges: number } }>("POST", "/import", {
      nodes: [
        { label: "Domain", name: "guard-ok-dom", attributes: {} },
      ],
      edges: [],
    });

    expect(res.status).toBe(200);
    expect(res.body.imported.nodes).toBe(1);

    const after = await getStats();
    expect(after.nodes).toBe(before.nodes + 1);
  });

  test("all lifecycle labels are rejected: BusinessModule, BusinessModuleVersion, ModuleInstance", async () => {
    for (const label of ["BusinessModule", "BusinessModuleVersion", "ModuleInstance"]) {
      const res = await api<ErrRes>("POST", "/import", {
        nodes: [{ label, name: `smuggled-${label}`, attributes: {} }],
        edges: [],
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("model_lifecycle_route_required");
    }
  });

  test("all lifecycle edge types are rejected: HAS_VERSION, INSTANTIATES, INSTANCE_IN, FORKED_FROM", async () => {
    for (const type of ["HAS_VERSION", "INSTANTIATES", "INSTANCE_IN", "FORKED_FROM"]) {
      const res = await api<ErrRes>("POST", "/import", {
        nodes: [],
        edges: [{ type, fromId: "00000000-0000-7000-8000-0000000000aa", toId: "00000000-0000-7000-8000-0000000000bb" }],
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("model_lifecycle_route_required");
    }
  });
});
