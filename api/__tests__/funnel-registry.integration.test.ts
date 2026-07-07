import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { closeDriver } from "../src/neo4j/driver";
import { api, newCleanup, runCleanup, type Cleanup } from "./helpers/model-fixtures";
import { ensureFunnelOntology } from "../src/seed/ensure-funnel-ontology";

// funnel-pipeline-modeling T-02 (design §3.1, §3.2, §4.1, §4.2 — AC-01, AC-02;
// FR-01, FR-02, FR-06, FR-06a, NFR-01, NFR-03). Registration idempotency via the
// get-then-create guard (B-03) + Stage stageOrder attribute enforcement (C-05).

const API = "http://127.0.0.1:8787";
const cleanup: Cleanup = newCleanup();

beforeAll(async () => {
  await ensureFunnelOntology(API);
});

afterAll(async () => {
  await runCleanup(cleanup);
  await closeDriver();
});

describe("AC-01: ensureFunnelOntology idempotency (get-then-create guard, B-03)", () => {
  test("Funnel label is registered and readable", async () => {
    const { status, body } = await api<{ name: string; json_schema_doc: unknown }>(
      "GET",
      "/ontology/node-labels/Funnel",
    );
    expect(status).toBe(200);
    expect(body.name).toBe("Funnel");
  });

  test("second run is a verified no-op (skips create, errors nothing) — B-03", async () => {
    // A second run GETs each construct → 200 → skips the POST, so the strict-CREATE
    // route is never re-hit and no 409 surfaces. This must not throw.
    await ensureFunnelOntology(API);
    const { status } = await api("GET", "/ontology/node-labels/Funnel");
    expect(status).toBe(200);
  });
});

describe("AC-02: Stage stageOrder is a required integer (C-05)", () => {
  test("non-integer stageOrder → 400 attribute_violation", async () => {
    const { status, body } = await api<{ error?: { code?: string } }>(
      "POST",
      "/nodes/Stage",
      { name: "bad-stage", attributes: { stageOrder: 2.5 } },
    );
    expect(status).toBe(400);
    expect(body.error?.code).toBe("attribute_violation");
  });

  test("string stageOrder → 400 attribute_violation", async () => {
    const { status, body } = await api<{ error?: { code?: string } }>(
      "POST",
      "/nodes/Stage",
      { name: "bad-stage-2", attributes: { stageOrder: "2" } },
    );
    expect(status).toBe(400);
    expect(body.error?.code).toBe("attribute_violation");
  });

  test("missing stageOrder → 400 attribute_violation", async () => {
    const { status, body } = await api<{ error?: { code?: string } }>(
      "POST",
      "/nodes/Stage",
      { name: "bad-stage-3", attributes: {} },
    );
    expect(status).toBe(400);
    expect(body.error?.code).toBe("attribute_violation");
  });

  test("valid integer stageOrder → 201", async () => {
    const { status, body } = await api<{ id: string }>("POST", "/nodes/Stage", {
      name: "good-stage",
      attributes: { stageOrder: 2 },
    });
    expect(status).toBe(201);
    cleanup.nodeIds.push({ label: "Stage", id: body.id });
  });
});
