// kpi-impact-mapping AC-01 — activity→KPI directional link create.
// Integration test: requires a live Neo4j + API stack (NOT run here).
//
// AC-01: POST /models/:modelId/kpi-impact/activity-links creates an
// ALIGNED_TO edge (KPI→Activity) carrying `direction` + `weight` from a
// model-scoped Activity to a non-archived KPI → 201 with a linkId.
// Re-POSTing the same (activity, kpi) pair updates the edge in place
// (MERGE-on-pair — same linkId, no second edge). A non-scoped activityId
// → 404 activity_not_found; an archived/unknown kpiId → 404
// kpi_not_found; weight>1 or a bad direction → 400 invalid_payload.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../src/neo4j/driver";
import { generateId } from "../src/ids";
import { api, newCleanup, runCleanup } from "./helpers/model-fixtures";
import { buildScoringModel, type ScoringFixture } from "./helpers/key-activity-fixtures";

interface LinkRow {
  linkId: string;
  sourceId: string;
  sourceName: string | null;
  kpiId: string;
  kpiName: string | null;
  direction: string | null;
  weight: number | null;
  notes: string | null;
  createdAt: string | null;
}
interface ErrEnv {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

const stamp = Date.now();
const cleanup = newCleanup();
const createdKpiIds: string[] = [];

let modelA: ScoringFixture;
let modelB: ScoringFixture;
let actId = "";
let otherModelActId = "";
let kpiId = "";
let archivedKpiId = "";

async function createKpi(name: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const { status, body } = await api<{ id: string }>("POST", "/kpis", {
    name,
    category: "quality",
    unit: "%",
    target_value: 90,
    target_direction: "higher_is_better",
    measurement_frequency: "weekly",
    ...overrides,
  });
  if (status !== 200) throw new Error(`createKpi ${name}: ${status} ${JSON.stringify(body)}`);
  createdKpiIds.push(body.id);
  return body.id;
}

describe("integration: kpi-impact-mapping AC-01 activity-links create", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
    modelA = await buildScoringModel(cleanup, `kim-al-a-${stamp}`, [{ key: "act" }], []);
    modelB = await buildScoringModel(cleanup, `kim-al-b-${stamp}`, [{ key: "bact" }], []);
    actId = modelA.activityIds.act!;
    otherModelActId = modelB.activityIds.bact!;
    kpiId = await createKpi(`kim-al-kpi-${stamp}`);
    archivedKpiId = await createKpi(`kim-al-arch-kpi-${stamp}`);
    const arch = await fetch(
      `http://127.0.0.1:8787/api/v1/kpis/${archivedKpiId}/archive`,
      { method: "POST" },
    );
    if (arch.status !== 200) throw new Error(`archive kpi: ${arch.status}`);
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    const session = getDriver().session({ defaultAccessMode: "WRITE" });
    try {
      if (createdKpiIds.length > 0) {
        await session.run("MATCH (k:KPI) WHERE k.id IN $ids DETACH DELETE k", { ids: createdKpiIds });
      }
    } finally {
      await session.close();
    }
    await closeDriver();
    _resetDriver();
  });

  test("POST activity-links → 201 with linkId, direction, weight (AC-01)", async () => {
    const { status, body } = await api<LinkRow>(
      "POST",
      `/models/${modelA.modelId}/kpi-impact/activity-links`,
      { activityId: actId, kpiId, direction: "increases", weight: 0.7 },
    );
    expect(status).toBe(201);
    expect(body.linkId).toBeTruthy();
    expect(body.sourceId).toBe(actId);
    expect(body.kpiId).toBe(kpiId);
    expect(body.direction).toBe("increases");
    expect(body.weight).toBe(0.7);
  });

  test("re-POST same (activity,kpi) updates in place — same linkId, one edge (MERGE-on-pair)", async () => {
    const first = await api<LinkRow>(
      "POST",
      `/models/${modelA.modelId}/kpi-impact/activity-links`,
      { activityId: actId, kpiId, direction: "increases", weight: 0.7 },
    );
    expect(first.status).toBe(201);

    const second = await api<LinkRow>(
      "POST",
      `/models/${modelA.modelId}/kpi-impact/activity-links`,
      { activityId: actId, kpiId, direction: "decreases", weight: 0.3 },
    );
    expect(second.status).toBe(201);
    // MERGE-on-pair: identical elementId, updated direction/weight.
    expect(second.body.linkId).toBe(first.body.linkId);
    expect(second.body.direction).toBe("decreases");
    expect(second.body.weight).toBe(0.3);

    // Exactly one edge for the pair.
    const list = await api<{ rows: LinkRow[] }>(
      "GET",
      `/models/${modelA.modelId}/kpi-impact/activity-links?activityId=${actId}&kpiId=${kpiId}`,
    );
    expect(list.status).toBe(200);
    expect(list.body.rows.length).toBe(1);
  });

  test("non-scoped activityId → 404 activity_not_found", async () => {
    const { status, body } = await api<ErrEnv>(
      "POST",
      `/models/${modelA.modelId}/kpi-impact/activity-links`,
      { activityId: otherModelActId, kpiId, direction: "increases", weight: 0.5 },
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("activity_not_found");
  });

  test("archived kpiId → 404 kpi_not_found", async () => {
    const { status, body } = await api<ErrEnv>(
      "POST",
      `/models/${modelA.modelId}/kpi-impact/activity-links`,
      { activityId: actId, kpiId: archivedKpiId, direction: "increases", weight: 0.5 },
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("kpi_not_found");
  });

  test("unknown kpiId → 404 kpi_not_found", async () => {
    const { status, body } = await api<ErrEnv>(
      "POST",
      `/models/${modelA.modelId}/kpi-impact/activity-links`,
      { activityId: actId, kpiId: generateId(), direction: "increases", weight: 0.5 },
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("kpi_not_found");
  });

  test("weight > 1 → 400 invalid_payload", async () => {
    const { status, body } = await api<ErrEnv>(
      "POST",
      `/models/${modelA.modelId}/kpi-impact/activity-links`,
      { activityId: actId, kpiId, direction: "increases", weight: 1.5 },
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_payload");
  });

  test("bad direction → 400 invalid_payload", async () => {
    const { status, body } = await api<ErrEnv>(
      "POST",
      `/models/${modelA.modelId}/kpi-impact/activity-links`,
      { activityId: actId, kpiId, direction: "sideways", weight: 0.5 },
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_payload");
  });
});
