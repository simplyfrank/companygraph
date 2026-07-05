// kpi-impact-mapping AC-06 — KPI roll-up (status + aggregate weight).
// Integration test: requires a live Neo4j + API stack (NOT run here).
//
// The roll-up's latestValue/status reflect Neo4j `:KPIMeasurement`
// nodes — the SAME source the governed kpi-trends route reads (server-
// side, in-process; no network round-trip, NFR-02). This measurement
// store is DISJOINT from Postgres: OQ-2 (which store is authoritative for
// KPI measurements) was escalated, and this feature/test reads ONLY
// Neo4j. Nothing here touches Postgres.
//
// AC-06: rollup.latestValue = the value of the measurement with the MAX
// measured_at (the LAST element of the ASC-ordered trend series, NOT the
// oldest); status is derived vs target_value / thresholds /
// target_direction (on_track / warning / critical); impactLinkCount and a
// capped aggregateImpactWeight (Σ weights, ceiling 1.0); a KPI with NO
// :KPIMeasurement → status "no_data".

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../src/neo4j/driver";
import { generateId } from "../src/ids";
import { api, newCleanup, runCleanup } from "./helpers/model-fixtures";
import { buildScoringModel, type ScoringFixture } from "./helpers/key-activity-fixtures";

interface RollupRow {
  kpiId: string;
  kpiName: string | null;
  unit: string | null;
  targetValue: number | null;
  targetDirection: string | null;
  latestValue: number | null;
  status: string;
  impactLinkCount: number;
  aggregateImpactWeight: number;
}
interface Rollup {
  rows: RollupRow[];
  meta: { kpiCount: number; measurementsAvailable: boolean };
}

const DAY_MS = 86_400_000;
const stamp = Date.now();
const cleanup = newCleanup();
const createdKpiIds: string[] = [];
const measurementIds: string[] = [];

let model: ScoringFixture;
let kpiOnTrack = "";
let kpiWarning = "";
let kpiCritical = "";
let kpiNoData = "";

async function createKpi(name: string): Promise<string> {
  const { status, body } = await api<{ id: string }>("POST", "/kpis", {
    name,
    category: "quality",
    unit: "%",
    target_value: 90,
    target_direction: "higher_is_better",
    measurement_frequency: "weekly",
    warning_threshold: 80,
    critical_threshold: 60,
  });
  if (status !== 200) throw new Error(`createKpi ${name}: ${status} ${JSON.stringify(body)}`);
  createdKpiIds.push(body.id);
  return body.id;
}

async function linkActivity(activityId: string, kpiId: string, weight: number): Promise<void> {
  const { status, body } = await api<{ linkId: string }>(
    "POST",
    `/models/${model.modelId}/kpi-impact/activity-links`,
    { activityId, kpiId, direction: "increases", weight },
  );
  if (status !== 201) throw new Error(`linkActivity: ${status} ${JSON.stringify(body)}`);
}

// Seed :KPIMeasurement nodes directly (kpi-trends' source). `points` is
// [msAgo, value]; the smallest msAgo is the newest measurement and its
// value must become latestValue.
async function seedMeasurements(kpiId: string, points: Array<[number, number]>): Promise<void> {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    for (const [msAgo, value] of points) {
      const id = generateId();
      measurementIds.push(id);
      await session.run(
        "CREATE (:KPIMeasurement {id: $id, kpi_id: $kpiId, measured_at: $measuredAt, value: $value})",
        { id, kpiId, measuredAt: new Date(stamp - msAgo).toISOString(), value },
      );
    }
  } finally {
    await session.close();
  }
}

describe("integration: kpi-impact-mapping AC-06 roll-up", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
    model = await buildScoringModel(
      cleanup,
      `kim-ru-${stamp}`,
      [{ key: "a1" }, { key: "a2" }, { key: "a3" }, { key: "a4" }, { key: "a5" }],
      [],
    );

    kpiOnTrack = await createKpi(`kim-ru-ontrack-${stamp}`);
    kpiWarning = await createKpi(`kim-ru-warning-${stamp}`);
    kpiCritical = await createKpi(`kim-ru-critical-${stamp}`);
    kpiNoData = await createKpi(`kim-ru-nodata-${stamp}`);

    // kpiOnTrack: TWO scoped links (weights 0.6 + 0.7 → Σ 1.3, capped 1.0).
    await linkActivity(model.activityIds.a1!, kpiOnTrack, 0.6);
    await linkActivity(model.activityIds.a2!, kpiOnTrack, 0.7);
    await linkActivity(model.activityIds.a3!, kpiWarning, 0.5);
    await linkActivity(model.activityIds.a4!, kpiCritical, 0.5);
    await linkActivity(model.activityIds.a5!, kpiNoData, 0.5);

    // Newest (smallest msAgo) value drives latestValue/status. The older,
    // conflicting value proves the roll-up reads MAX measured_at, not the
    // oldest.
    await seedMeasurements(kpiOnTrack, [[10 * DAY_MS, 70], [60_000, 95]]); // latest 95 → on_track
    await seedMeasurements(kpiWarning, [[10 * DAY_MS, 95], [60_000, 70]]); // latest 70 → warning
    await seedMeasurements(kpiCritical, [[10 * DAY_MS, 90], [60_000, 50]]); // latest 50 → critical
    // kpiNoData: no measurements seeded.
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    const session = getDriver().session({ defaultAccessMode: "WRITE" });
    try {
      if (measurementIds.length > 0) {
        await session.run("MATCH (m:KPIMeasurement) WHERE m.id IN $ids DETACH DELETE m", { ids: measurementIds });
      }
      if (createdKpiIds.length > 0) {
        await session.run("MATCH (k:KPI) WHERE k.id IN $ids DETACH DELETE k", { ids: createdKpiIds });
      }
    } finally {
      await session.close();
    }
    await closeDriver();
    _resetDriver();
  });

  function rowFor(rollup: Rollup, kpiId: string): RollupRow {
    const row = rollup.rows.find((r) => r.kpiId === kpiId);
    if (!row) throw new Error(`no rollup row for ${kpiId}`);
    return row;
  }

  test("latestValue = MAX-measured_at value; status derived; capped aggregate weight (AC-06)", async () => {
    const { status, body } = await api<Rollup>("GET", `/models/${model.modelId}/kpi-impact/rollup`);
    expect(status).toBe(200);
    expect(body.meta.measurementsAvailable).toBe(true);

    const onTrack = rowFor(body, kpiOnTrack);
    expect(onTrack.latestValue).toBe(95); // newest, not the older 70
    expect(onTrack.status).toBe("on_track");
    expect(onTrack.impactLinkCount).toBe(2);
    expect(onTrack.aggregateImpactWeight).toBe(1.0); // 0.6 + 0.7 → capped

    const warning = rowFor(body, kpiWarning);
    expect(warning.latestValue).toBe(70);
    expect(warning.status).toBe("warning");
    expect(warning.impactLinkCount).toBe(1);

    const critical = rowFor(body, kpiCritical);
    expect(critical.latestValue).toBe(50);
    expect(critical.status).toBe("critical");
  });

  test("a KPI with no :KPIMeasurement → status no_data, latestValue null", async () => {
    const { body } = await api<Rollup>("GET", `/models/${model.modelId}/kpi-impact/rollup`);
    const noData = rowFor(body, kpiNoData);
    expect(noData.latestValue).toBeNull();
    expect(noData.status).toBe("no_data");
    expect(noData.impactLinkCount).toBe(1);
  });
});
