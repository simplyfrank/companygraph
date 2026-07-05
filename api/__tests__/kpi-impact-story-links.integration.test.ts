// kpi-impact-mapping AC-02 — story→KPI impact link create.
// Integration test: requires a live Neo4j + API stack (NOT run here).
//
// AC-02: POST /models/:modelId/kpi-impact/story-links creates an
// IMPACTS_KPI edge (UserStory→KPI) → 201 with a populated `sourceName`
// (= the story's `name`). MERGE-on-pair is idempotent (same linkId, no
// second edge). A story whose DESCRIBES_ACTIVITY activity is NOT scoped
// to the model → 404 story_not_found; an unknown kpi → 404 kpi_not_found;
// a bad direction / out-of-range weight → 400 invalid_payload. The edge
// is queryable as (:UserStory)-[:IMPACTS_KPI]->(:KPI) via the list route.
//
// ensureStorySchema() re-registers UserStory / DESCRIBES_ACTIVITY /
// IMPACTS_KPI-adjacent schema through the API so registry-validated
// story writes succeed against the shared integration DB.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../src/neo4j/driver";
import { generateId } from "../src/ids";
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

let modelA: ScoringFixture;
let modelB: ScoringFixture;
let storyId = "";
let storyName = "";
let foreignStoryId = "";
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

async function createStory(modelId: string, activityId: string, action: string): Promise<{ id: string; name: string }> {
  const { status, body } = await api<{ id: string; name: string }>(
    "POST",
    `/models/${modelId}/stories`,
    { persona: "Analyst", action, benefit: "impact value", activityId },
  );
  if (status !== 201) throw new Error(`createStory: ${status} ${JSON.stringify(body)}`);
  return body;
}

describe("integration: kpi-impact-mapping AC-02 story-links create", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
    await ensureStorySchema();
    modelA = await buildScoringModel(cleanup, `kim-st-a-${stamp}`, [{ key: "act" }], []);
    modelB = await buildScoringModel(cleanup, `kim-st-b-${stamp}`, [{ key: "bact" }], []);
    kpiId = await createKpi(`kim-st-kpi-${stamp}`);

    const story = await createStory(modelA.modelId, modelA.activityIds.act!, "measure conversion");
    storyId = story.id;
    storyName = story.name;

    // A story scoped to a DIFFERENT model (its activity is not scoped to A).
    const foreign = await createStory(modelB.modelId, modelB.activityIds.bact!, "foreign story");
    foreignStoryId = foreign.id;
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

  test("POST story-links → 201 with sourceName = story name (AC-02)", async () => {
    const { status, body } = await api<LinkRow>(
      "POST",
      `/models/${modelA.modelId}/kpi-impact/story-links`,
      { storyId, kpiId, direction: "increases", weight: 0.6 },
    );
    expect(status).toBe(201);
    expect(body.linkId).toBeTruthy();
    expect(body.sourceId).toBe(storyId);
    expect(body.sourceName).toBe(storyName);
    expect(body.kpiId).toBe(kpiId);
    expect(body.direction).toBe("increases");
    expect(body.weight).toBe(0.6);
  });

  test("re-POST same (story,kpi) is MERGE-on-pair idempotent — same linkId, one edge", async () => {
    const first = await api<LinkRow>(
      "POST",
      `/models/${modelA.modelId}/kpi-impact/story-links`,
      { storyId, kpiId, direction: "increases", weight: 0.6 },
    );
    const second = await api<LinkRow>(
      "POST",
      `/models/${modelA.modelId}/kpi-impact/story-links`,
      { storyId, kpiId, direction: "decreases", weight: 0.2 },
    );
    expect(second.status).toBe(201);
    expect(second.body.linkId).toBe(first.body.linkId);
    expect(second.body.direction).toBe("decreases");

    const list = await api<{ rows: LinkRow[] }>(
      "GET",
      `/models/${modelA.modelId}/kpi-impact/story-links?storyId=${storyId}&kpiId=${kpiId}`,
    );
    expect(list.body.rows.length).toBe(1);
  });

  test("edge is queryable as (:UserStory)-[:IMPACTS_KPI]->(:KPI) via list rows", async () => {
    const { status, body } = await api<{ rows: LinkRow[] }>(
      "GET",
      `/models/${modelA.modelId}/kpi-impact/story-links?storyId=${storyId}`,
    );
    expect(status).toBe(200);
    const row = body.rows.find((r) => r.sourceId === storyId && r.kpiId === kpiId);
    expect(row).toBeDefined();
    expect(row!.sourceName).toBe(storyName);
  });

  test("story not scoped to the model → 404 story_not_found", async () => {
    const { status, body } = await api<ErrEnv>(
      "POST",
      `/models/${modelA.modelId}/kpi-impact/story-links`,
      { storyId: foreignStoryId, kpiId, direction: "increases", weight: 0.5 },
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("story_not_found");
  });

  test("unknown kpiId → 404 kpi_not_found", async () => {
    const { status, body } = await api<ErrEnv>(
      "POST",
      `/models/${modelA.modelId}/kpi-impact/story-links`,
      { storyId, kpiId: generateId(), direction: "increases", weight: 0.5 },
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("kpi_not_found");
  });

  test("bad direction → 400 invalid_payload", async () => {
    const { status, body } = await api<ErrEnv>(
      "POST",
      `/models/${modelA.modelId}/kpi-impact/story-links`,
      { storyId, kpiId, direction: "sideways", weight: 0.5 },
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_payload");
  });

  test("weight > 1 → 400 invalid_payload", async () => {
    const { status, body } = await api<ErrEnv>(
      "POST",
      `/models/${modelA.modelId}/kpi-impact/story-links`,
      { storyId, kpiId, direction: "increases", weight: 2 },
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_payload");
  });
});
