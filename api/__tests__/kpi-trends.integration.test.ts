import { afterAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { generateId } from "../src/ids";

// kpi-okr-governance T-06 — pins the AS-BUILT kpi-trends contract (FR-03,
// AC-05) plus the sanctioned fixes: zod query schema (garbage params now
// 400 instead of NaN, FR-11a) and the DD-04 UUID-any path guard.
//
// Split-brain store pinned per V-02/DD-05: kpi-trends reads
// :KPIMeasurement NODES from Neo4j, NOT the Postgres kpi_measurements
// table. Fixtures are seeded through the production getDriver()
// singleton (the neo4j-bootstrap.integration.test.ts pattern) because
// the cypher passthrough is read-only and the label is unregistered.

const API_BASE = "http://127.0.0.1:8787/api/v1";

const seededMeasurementIds: string[] = [];
const createdKpiIds: string[] = [];

async function createKpi(): Promise<string> {
  const res = await fetch(`${API_BASE}/kpis`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: `trend-fixture-${generateId()}`,
      category: "efficiency",
      unit: "%",
      target_value: 95,
      target_direction: "higher_is_better",
      measurement_frequency: "daily",
    }),
  });
  expect(res.status).toBe(200); // pinned: POST /kpis returns 200, not 201
  const body = (await res.json()) as { id: string };
  createdKpiIds.push(body.id);
  return body.id;
}

async function seedMeasurements(kpiId: string, values: number[]): Promise<void> {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });
  try {
    const now = Date.now();
    for (let i = 0; i < values.length; i++) {
      const id = generateId();
      seededMeasurementIds.push(id);
      // One measurement per day, oldest first, all inside a 30-day window.
      const measuredAt = new Date(now - (values.length - i) * 24 * 60 * 60 * 1000).toISOString();
      await session.run(
        `CREATE (:KPIMeasurement {id: $id, kpi_id: $kpiId, measured_at: $measuredAt, value: $value})`,
        { id, kpiId, measuredAt, value: values[i] },
      );
    }
  } finally {
    await session.close();
  }
}

afterAll(async () => {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "WRITE" });
  try {
    if (seededMeasurementIds.length > 0) {
      await session.run(
        `MATCH (m:KPIMeasurement) WHERE m.id IN $ids DETACH DELETE m`,
        { ids: seededMeasurementIds },
      );
    }
    if (createdKpiIds.length > 0) {
      await session.run(`MATCH (k:KPI) WHERE k.id IN $ids DETACH DELETE k`, { ids: createdKpiIds });
    }
  } finally {
    await session.close();
    await closeDriver();
    _resetDriver();
  }
});

describe("integration: kpi-trends (AC-05)", () => {
  test("zero measurements → empty payload (trend:null, moving_average:[], anomalies:[])", async () => {
    const kpiId = await createKpi();
    const res = await fetch(`${API_BASE}/kpi-trends/${kpiId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kpi_id).toBe(kpiId);
    expect(body.window_days).toBe(30);
    expect(body.measurements).toEqual([]);
    expect(body.trend).toBeNull();
    expect(body.moving_average).toEqual([]);
    expect(body.anomalies).toEqual([]);
  });

  test("seeded measurements → trend (slope per week), moving-average series, anomalies fields", async () => {
    const kpiId = await createKpi();
    // Steadily increasing series with one wild outlier at the end.
    await seedMeasurements(kpiId, [10, 12, 14, 16, 18, 20, 22, 24, 26, 100]);

    const res = await fetch(`${API_BASE}/kpi-trends/${kpiId}?ma_period=3&anomaly_threshold=2`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ma_period).toBe(3);
    expect(body.anomaly_threshold).toBe(2);
    expect(body.measurements).toHaveLength(10);

    // Linear-regression trend present; slope is per WEEK (per-day * 7 — pinned).
    expect(body.trend).not.toBeNull();
    expect(typeof body.trend.slope).toBe("number");
    expect(typeof body.trend.intercept).toBe("number");
    expect(typeof body.trend.r_squared).toBe("number");
    expect(body.trend.direction).toBe("increasing");

    // Moving-average series aligned to measurements; first (period-1) are null.
    expect(body.moving_average).toHaveLength(10);
    expect(body.moving_average[0].ma).toBeNull();
    expect(body.moving_average[1].ma).toBeNull();
    expect(typeof body.moving_average[2].ma).toBe("number");

    // The outlier is flagged with z-score fields.
    expect(Array.isArray(body.anomalies)).toBe(true);
    expect(body.anomalies.length).toBeGreaterThanOrEqual(1);
    const anomaly = body.anomalies[body.anomalies.length - 1];
    expect(anomaly.value).toBe(100);
    expect(typeof anomaly.expected).toBe("number");
    expect(typeof anomaly.deviation).toBe("number");
    expect(["minor", "moderate", "severe"]).toContain(anomaly.severity);
  });

  test("unknown KPI → 404; archived KPI → 404", async () => {
    const unknown = await fetch(`${API_BASE}/kpi-trends/${generateId()}`);
    expect(unknown.status).toBe(404);

    const kpiId = await createKpi();
    // Archive directly through the driver so this file stays independent
    // of the T-11 router reshape (the REST archive path is pinned in
    // kpi-crud.integration.test.ts).
    const session = getDriver().session({ defaultAccessMode: "WRITE" });
    try {
      await session.run(`MATCH (k:KPI {id: $id}) SET k.archived_at = $now`, {
        id: kpiId,
        now: new Date().toISOString(),
      });
    } finally {
      await session.close();
    }
    const archived = await fetch(`${API_BASE}/kpi-trends/${kpiId}`);
    expect(archived.status).toBe(404);
  });

  test("non-UUID path id → 400 (DD-04 guard accepts any UUID version, rejects garbage)", async () => {
    const res = await fetch(`${API_BASE}/kpi-trends/not-a-uuid`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_payload");
  });

  test("garbage query params → 400 issues[] (was NaN passthrough as-built)", async () => {
    const kpiId = await createKpi();
    const res = await fetch(`${API_BASE}/kpi-trends/${kpiId}?window_days=banana`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; details?: { issues?: Array<{ path: string }> } } };
    expect(body.error.code).toBe("invalid_payload");
    expect(body.error.details?.issues?.map((i) => i.path)).toContain("window_days");
  });
});
