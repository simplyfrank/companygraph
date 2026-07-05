// kpi-impact-mapping AC-04 + AC-16 — activity×KPI matrix read.
// Integration test: requires a live Neo4j + API stack (NOT run here).
//
// AC-04: GET /models/:modelId/kpi-impact/matrix returns rows (scoped
// activities: id/name/journeyName/isKeyActivity — the latter from the
// PRESENCE of an `attributes.keyActivity` key), columns (distinct
// impacted KPIs), a rows×columns cell grid ({direction,weight}|null with
// cells[i] aligned to rows[i] and cells[i][j] to columns[j]), gaps, and
// meta counts. NFR-01 isolation: a KPI impacted only by a SECOND model's
// activity is absent from model A's columns.
//
// AC-16: an activity backed by TWO distinct stories each with one
// IMPACTS_KPI link (both reusing the same KPI) reports storyLinkCount===2
// (distinct (story,kpi) edges, not distinct KPIs); an activity with no
// story links reports 0; storyLinkCount never alters gaps / gapCount.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../src/neo4j/driver";
import { api, newCleanup, runCleanup } from "./helpers/model-fixtures";
import { buildScoringModel, type ScoringFixture } from "./helpers/key-activity-fixtures";
import { ensureStorySchema } from "./helpers/story-fixtures";

interface MatrixRow {
  id: string;
  name: string;
  journeyName: string | null;
  isKeyActivity: boolean;
  storyLinkCount: number;
}
interface MatrixColumn {
  id: string;
  name: string;
  unit: string | null;
  targetDirection: string | null;
}
interface Cell {
  direction: string | null;
  weight: number | null;
}
interface Gap {
  activityId: string;
  activityName: string;
  journeyName: string | null;
  reason: string;
}
interface Matrix {
  rows: MatrixRow[];
  columns: MatrixColumn[];
  cells: Array<Array<Cell | null>>;
  gaps: Gap[];
  meta: {
    activityCount: number;
    kpiCount: number;
    linkedCellCount: number;
    keyActivityCount: number;
    gapCount: number;
  };
}

const stamp = Date.now();
const cleanup = newCleanup();
const createdKpiIds: string[] = [];

let modelA: ScoringFixture;
let modelB: ScoringFixture;
let kpiMain = "";
let kpiOther = "";
let keyActId = "";
let storyActId = "";
let plainActId = "";

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

async function createStoryOn(modelId: string, activityId: string, action: string): Promise<string> {
  const { status, body } = await api<{ id: string }>(
    "POST",
    `/models/${modelId}/stories`,
    { persona: "Analyst", action, benefit: "value", activityId },
  );
  if (status !== 201) throw new Error(`createStory: ${status} ${JSON.stringify(body)}`);
  return body.id;
}

describe("integration: kpi-impact-mapping AC-04 + AC-16 matrix read", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
    await ensureStorySchema();

    const KEY = { keyActivity: { marked: true } };
    modelA = await buildScoringModel(
      cleanup,
      `kim-mx-a-${stamp}`,
      [
        { key: "keyAct", attributes: KEY },
        { key: "storyAct", attributes: KEY },
        { key: "plainAct" },
      ],
      [],
    );
    keyActId = modelA.activityIds.keyAct!;
    storyActId = modelA.activityIds.storyAct!;
    plainActId = modelA.activityIds.plainAct!;

    kpiMain = await createKpi(`kim-mx-main-${stamp}`);

    // keyAct → kpiMain directional ALIGNED_TO (clears its gap, makes the column).
    const link = await api<{ linkId: string }>(
      "POST",
      `/models/${modelA.modelId}/kpi-impact/activity-links`,
      { activityId: keyActId, kpiId: kpiMain, direction: "increases", weight: 0.8 },
    );
    if (link.status !== 201) throw new Error(`activity-link: ${link.status}`);

    // storyAct: two distinct stories, both IMPACTS_KPI the SAME kpiMain.
    const s1 = await createStoryOn(modelA.modelId, storyActId, "story one");
    const s2 = await createStoryOn(modelA.modelId, storyActId, "story two");
    for (const sid of [s1, s2]) {
      const sl = await api<{ linkId: string }>(
        "POST",
        `/models/${modelA.modelId}/kpi-impact/story-links`,
        { storyId: sid, kpiId: kpiMain, direction: "increases", weight: 0.5 },
      );
      if (sl.status !== 201) throw new Error(`story-link: ${sl.status}`);
    }

    // Model B — a DIFFERENT KPI linked to a B activity (NFR-01 isolation).
    modelB = await buildScoringModel(cleanup, `kim-mx-b-${stamp}`, [{ key: "bAct" }], []);
    kpiOther = await createKpi(`kim-mx-other-${stamp}`);
    const bLink = await api<{ linkId: string }>(
      "POST",
      `/models/${modelB.modelId}/kpi-impact/activity-links`,
      { activityId: modelB.activityIds.bAct!, kpiId: kpiOther, direction: "increases", weight: 0.7 },
    );
    if (bLink.status !== 201) throw new Error(`b activity-link: ${bLink.status}`);
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

  test("matrix rows/columns/cells/meta shape (AC-04)", async () => {
    const { status, body } = await api<Matrix>("GET", `/models/${modelA.modelId}/kpi-impact/matrix`);
    expect(status).toBe(200);

    const rowIds = body.rows.map((r) => r.id).sort();
    expect(rowIds).toEqual([keyActId, storyActId, plainActId].sort());
    expect(body.meta.activityCount).toBe(3);
    expect(body.meta.keyActivityCount).toBe(2);

    // Columns = distinct impacted KPIs (only kpiMain via ALIGNED_TO).
    const colIds = body.columns.map((c) => c.id);
    expect(colIds).toContain(kpiMain);
    expect(body.meta.kpiCount).toBe(body.columns.length);

    // isKeyActivity from attributes.keyActivity PRESENCE.
    expect(body.rows.find((r) => r.id === keyActId)!.isKeyActivity).toBe(true);
    expect(body.rows.find((r) => r.id === plainActId)!.isKeyActivity).toBe(false);
    // journeyName populated from the PART_OF journey.
    expect(body.rows.find((r) => r.id === keyActId)!.journeyName).toBeTruthy();
  });

  test("cells align rows×columns; linked cell carries {direction,weight}, else null", async () => {
    const { body } = await api<Matrix>("GET", `/models/${modelA.modelId}/kpi-impact/matrix`);
    expect(body.cells.length).toBe(body.rows.length);
    for (const row of body.cells) expect(row.length).toBe(body.columns.length);

    const keyRowIdx = body.rows.findIndex((r) => r.id === keyActId);
    const plainRowIdx = body.rows.findIndex((r) => r.id === plainActId);
    const mainColIdx = body.columns.findIndex((c) => c.id === kpiMain);

    const keyCell = body.cells[keyRowIdx]![mainColIdx]!;
    expect(keyCell).not.toBeNull();
    expect(keyCell.direction).toBe("increases");
    expect(keyCell.weight).toBe(0.8);

    // plainAct has no ALIGNED_TO → null cell.
    expect(body.cells[plainRowIdx]![mainColIdx]).toBeNull();

    expect(body.meta.linkedCellCount).toBe(1);
  });

  test("NFR-01 isolation: model B's KPI is absent from model A's columns", async () => {
    const { body } = await api<Matrix>("GET", `/models/${modelA.modelId}/kpi-impact/matrix`);
    expect(body.columns.map((c) => c.id)).not.toContain(kpiOther);
    expect(body.rows.map((r) => r.id)).not.toContain(modelB.activityIds.bAct!);
  });

  test("AC-16: storyLinkCount counts distinct (story,kpi) edges; gaps unaffected", async () => {
    const { body } = await api<Matrix>("GET", `/models/${modelA.modelId}/kpi-impact/matrix`);

    // Two distinct stories → same KPI → 2 distinct edges → storyLinkCount 2.
    expect(body.rows.find((r) => r.id === storyActId)!.storyLinkCount).toBe(2);
    // No story links → 0.
    expect(body.rows.find((r) => r.id === keyActId)!.storyLinkCount).toBe(0);
    expect(body.rows.find((r) => r.id === plainActId)!.storyLinkCount).toBe(0);

    // storyAct is KEY with no DIRECTIONAL activity-link → still a gap even
    // though its storyLinkCount is 2 (DD-09: story links never clear gaps).
    expect(body.gaps.some((g) => g.activityId === storyActId && g.reason === "key_activity_no_kpi")).toBe(true);
    // keyAct has a directional link → not a gap.
    expect(body.gaps.some((g) => g.activityId === keyActId)).toBe(false);
    expect(body.meta.gapCount).toBe(body.gaps.length);
  });
});
