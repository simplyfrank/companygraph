// kpi-impact-mapping AC-05 — key-activity gap detection.
// Integration test: requires a live Neo4j + API stack (NOT run here).
//
// AC-05: a KEY activity (an `attributes.keyActivity` key is present) with
// NO directional activity→KPI link surfaces a gap
// {activityId, reason:"key_activity_no_kpi"}. After a directional POST
// activity-link it drops out of gaps. A key activity whose ONLY link is a
// base-route ALIGNED_TO with direction:null (created via
// POST /api/v1/kpi-alignments — no direction) STAYS in gaps (DD-07: an
// undirected link never clears a gap). A NON-key activity with no links
// is never a gap. meta.gapCount always equals gaps.length.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../src/neo4j/driver";
import { api, newCleanup, runCleanup } from "./helpers/model-fixtures";
import { buildScoringModel, type ScoringFixture } from "./helpers/key-activity-fixtures";

interface Gap {
  activityId: string;
  activityName: string;
  journeyName: string | null;
  reason: string;
}
interface Matrix {
  gaps: Gap[];
  meta: { gapCount: number };
}

const stamp = Date.now();
const cleanup = newCleanup();
const createdKpiIds: string[] = [];

let model: ScoringFixture;
let kpiId = "";
let keyNoLinkId = "";
let keyUndirectedId = "";
let nonKeyId = "";

async function createKpi(name: string): Promise<string> {
  const { status, body } = await api<{ id: string }>("POST", "/kpis", {
    name,
    category: "quality",
    unit: "%",
    target_value: 90,
    target_direction: "higher_is_better",
    measurement_frequency: "weekly",
  });
  if (status !== 200) throw new Error(`createKpi ${name}: ${status} ${JSON.stringify(body)}`);
  createdKpiIds.push(body.id);
  return body.id;
}

async function getMatrix(): Promise<Matrix> {
  const { status, body } = await api<Matrix>("GET", `/models/${model.modelId}/kpi-impact/matrix`);
  expect(status).toBe(200);
  return body;
}

describe("integration: kpi-impact-mapping AC-05 gap detection", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
    const KEY = { keyActivity: { marked: true } };
    model = await buildScoringModel(
      cleanup,
      `kim-gap-${stamp}`,
      [
        { key: "keyNoLink", attributes: KEY },
        { key: "keyUndirected", attributes: KEY },
        { key: "nonKey" },
      ],
      [],
    );
    keyNoLinkId = model.activityIds.keyNoLink!;
    keyUndirectedId = model.activityIds.keyUndirected!;
    nonKeyId = model.activityIds.nonKey!;

    kpiId = await createKpi(`kim-gap-kpi-${stamp}`);

    // keyUndirected: its ONLY link is a base-route ALIGNED_TO with NO
    // direction (POST /api/v1/kpi-alignments — no `direction` set).
    const undirected = await api<{ kpi_id: string }>("POST", "/kpi-alignments", {
      kpi_id: kpiId,
      target_type: "activity",
      target_id: keyUndirectedId,
      weight: 0.5,
      attribution_type: "direct",
    });
    if (undirected.status !== 200) throw new Error(`base kpi-alignment: ${undirected.status}`);
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

  test("key activity with no link, and key activity with only an undirected link, are both gaps; non-key never is", async () => {
    const m = await getMatrix();
    const gapIds = m.gaps.map((g) => g.activityId);
    expect(gapIds).toContain(keyNoLinkId);
    expect(gapIds).toContain(keyUndirectedId);
    expect(gapIds).not.toContain(nonKeyId);
    expect(m.gaps.find((g) => g.activityId === keyNoLinkId)!.reason).toBe("key_activity_no_kpi");
    expect(m.meta.gapCount).toBe(m.gaps.length);
  });

  test("after a directional POST activity-link, the key activity drops out of gaps; undirected key stays", async () => {
    const link = await api<{ linkId: string }>(
      "POST",
      `/models/${model.modelId}/kpi-impact/activity-links`,
      { activityId: keyNoLinkId, kpiId, direction: "increases", weight: 0.6 },
    );
    expect(link.status).toBe(201);

    const m = await getMatrix();
    const gapIds = m.gaps.map((g) => g.activityId);
    expect(gapIds).not.toContain(keyNoLinkId);
    // The undirected-only key activity is unchanged — still a gap (DD-07).
    expect(gapIds).toContain(keyUndirectedId);
    expect(m.meta.gapCount).toBe(m.gaps.length);
  });
});
