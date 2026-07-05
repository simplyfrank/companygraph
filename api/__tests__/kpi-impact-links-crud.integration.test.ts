// kpi-impact-mapping AC-03 — list + delete for both link types, with
// cross-type mis-route safety.
// Integration test: requires a live Neo4j + API stack (NOT run here).
//
// AC-03: GET activity-links / story-links return rows with
// direction/weight/names, filterable by ?activityId= / ?storyId= /
// ?kpiId=. DELETE .../activity-links/:linkId → 204; a second delete →
// 404 impact_link_not_found; same for story links. A MIS-ROUTED id (an
// ACTIVITY link's linkId passed to DELETE story-links, or a STORY link's
// linkId passed to DELETE activity-links) → 404 impact_link_not_found and
// NEVER a cross-type delete (the correctly-typed link survives).
//
// ensureStorySchema() re-registers story schema through the API so
// registry-validated story writes succeed.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../src/neo4j/driver";
import { api, newCleanup, runCleanup } from "./helpers/model-fixtures";
import { buildScoringModel, type ScoringFixture } from "./helpers/key-activity-fixtures";
import { ensureStorySchema } from "./helpers/story-fixtures";

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

let model: ScoringFixture;
let actId = "";
let storyId = "";
let kpiId = "";

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

async function newActivityLink(): Promise<string> {
  const { status, body } = await api<LinkRow>(
    "POST",
    `/models/${model.modelId}/kpi-impact/activity-links`,
    { activityId: actId, kpiId, direction: "increases", weight: 0.5 },
  );
  if (status !== 201) throw new Error(`newActivityLink: ${status} ${JSON.stringify(body)}`);
  return body.linkId;
}

async function newStoryLink(): Promise<string> {
  const { status, body } = await api<LinkRow>(
    "POST",
    `/models/${model.modelId}/kpi-impact/story-links`,
    { storyId, kpiId, direction: "decreases", weight: 0.4 },
  );
  if (status !== 201) throw new Error(`newStoryLink: ${status} ${JSON.stringify(body)}`);
  return body.linkId;
}

describe("integration: kpi-impact-mapping AC-03 link list + delete CRUD", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
    await ensureStorySchema();
    model = await buildScoringModel(cleanup, `kim-crud-${stamp}`, [{ key: "act" }], []);
    actId = model.activityIds.act!;
    kpiId = await createKpi(`kim-crud-kpi-${stamp}`);
    const story = await api<{ id: string }>(
      "POST",
      `/models/${model.modelId}/stories`,
      { persona: "Analyst", action: "review kpi", benefit: "value", activityId: actId },
    );
    if (story.status !== 201) throw new Error(`createStory: ${story.status}`);
    storyId = story.body.id;
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

  test("GET activity-links returns rows with direction/weight/names, filterable", async () => {
    await newActivityLink();
    const all = await api<{ rows: LinkRow[] }>(
      "GET",
      `/models/${model.modelId}/kpi-impact/activity-links`,
    );
    expect(all.status).toBe(200);
    const row = all.body.rows.find((r) => r.sourceId === actId && r.kpiId === kpiId);
    expect(row).toBeDefined();
    expect(row!.direction).toBe("increases");
    expect(row!.weight).toBe(0.5);
    expect(row!.sourceName).toBeTruthy();
    expect(row!.kpiName).toBeTruthy();

    const byActivity = await api<{ rows: LinkRow[] }>(
      "GET",
      `/models/${model.modelId}/kpi-impact/activity-links?activityId=${actId}`,
    );
    expect(byActivity.body.rows.every((r) => r.sourceId === actId)).toBe(true);

    const byKpi = await api<{ rows: LinkRow[] }>(
      "GET",
      `/models/${model.modelId}/kpi-impact/activity-links?kpiId=${kpiId}`,
    );
    expect(byKpi.body.rows.every((r) => r.kpiId === kpiId)).toBe(true);
  });

  test("GET story-links returns rows, filterable by ?storyId / ?kpiId", async () => {
    await newStoryLink();
    const all = await api<{ rows: LinkRow[] }>(
      "GET",
      `/models/${model.modelId}/kpi-impact/story-links`,
    );
    expect(all.status).toBe(200);
    const row = all.body.rows.find((r) => r.sourceId === storyId && r.kpiId === kpiId);
    expect(row).toBeDefined();
    expect(row!.direction).toBe("decreases");

    const byStory = await api<{ rows: LinkRow[] }>(
      "GET",
      `/models/${model.modelId}/kpi-impact/story-links?storyId=${storyId}`,
    );
    expect(byStory.body.rows.every((r) => r.sourceId === storyId)).toBe(true);

    const byKpi = await api<{ rows: LinkRow[] }>(
      "GET",
      `/models/${model.modelId}/kpi-impact/story-links?kpiId=${kpiId}`,
    );
    expect(byKpi.body.rows.every((r) => r.kpiId === kpiId)).toBe(true);
  });

  test("DELETE activity-links/:linkId → 204; second delete → 404 impact_link_not_found", async () => {
    const linkId = await newActivityLink();
    const first = await api<null>(
      "DELETE",
      `/models/${model.modelId}/kpi-impact/activity-links/${encodeURIComponent(linkId)}`,
    );
    expect(first.status).toBe(204);
    const second = await api<ErrEnv>(
      "DELETE",
      `/models/${model.modelId}/kpi-impact/activity-links/${encodeURIComponent(linkId)}`,
    );
    expect(second.status).toBe(404);
    expect(second.body.error.code).toBe("impact_link_not_found");
  });

  test("DELETE story-links/:linkId → 204; second delete → 404 impact_link_not_found", async () => {
    const linkId = await newStoryLink();
    const first = await api<null>(
      "DELETE",
      `/models/${model.modelId}/kpi-impact/story-links/${encodeURIComponent(linkId)}`,
    );
    expect(first.status).toBe(204);
    const second = await api<ErrEnv>(
      "DELETE",
      `/models/${model.modelId}/kpi-impact/story-links/${encodeURIComponent(linkId)}`,
    );
    expect(second.status).toBe(404);
    expect(second.body.error.code).toBe("impact_link_not_found");
  });

  test("mis-routed: story linkId to DELETE activity-links → 404, story link survives", async () => {
    const storyLinkId = await newStoryLink();
    const misrouted = await api<ErrEnv>(
      "DELETE",
      `/models/${model.modelId}/kpi-impact/activity-links/${encodeURIComponent(storyLinkId)}`,
    );
    expect(misrouted.status).toBe(404);
    expect(misrouted.body.error.code).toBe("impact_link_not_found");
    // Never a cross-type delete: the story link still exists.
    const list = await api<{ rows: LinkRow[] }>(
      "GET",
      `/models/${model.modelId}/kpi-impact/story-links?storyId=${storyId}`,
    );
    expect(list.body.rows.some((r) => r.linkId === storyLinkId)).toBe(true);
  });

  test("mis-routed: activity linkId to DELETE story-links → 404, activity link survives", async () => {
    const activityLinkId = await newActivityLink();
    const misrouted = await api<ErrEnv>(
      "DELETE",
      `/models/${model.modelId}/kpi-impact/story-links/${encodeURIComponent(activityLinkId)}`,
    );
    expect(misrouted.status).toBe(404);
    expect(misrouted.body.error.code).toBe("impact_link_not_found");
    const list = await api<{ rows: LinkRow[] }>(
      "GET",
      `/models/${model.modelId}/kpi-impact/activity-links?activityId=${actId}`,
    );
    expect(list.body.rows.some((r) => r.linkId === activityLinkId)).toBe(true);
  });
});
