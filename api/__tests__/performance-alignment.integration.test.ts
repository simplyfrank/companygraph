import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { generateId } from "../src/ids";
import { getDriver } from "../src/neo4j/driver";

// kpi-measurement-alignment AC-04, AC-05 — performance aggregate uses
// ALIGNED_TO (not CONTRIBUTES_TO) and shows real status (not no_data)
// when a measurement is recorded via REST (dual-write populates Neo4j).

const API_BASE = "http://127.0.0.1:8787/api/v1";

const kpiIds: string[] = [];
const domainIds: string[] = [];

async function createKpi(name: string, targetValue: number, direction: string): Promise<string> {
  const res = await fetch(`${API_BASE}/kpis`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      category: "efficiency",
      unit: "%",
      target_value: targetValue,
      target_direction: direction,
      measurement_frequency: "daily",
    }),
  });
  const body = await res.json();
  kpiIds.push(body.id);
  return body.id;
}

async function createDomain(name: string): Promise<string> {
  const res = await fetch(`${API_BASE}/nodes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label: "Domain", name, description: "test domain" }),
  });
  const body = await res.json();
  domainIds.push(body.id);
  return body.id;
}

async function createAlignment(kpiId: string, targetType: string, targetId: string): Promise<void> {
  await fetch(`${API_BASE}/kpi-alignments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kpi_id: kpiId,
      target_type: targetType,
      target_id: targetId,
      weight: 1.0,
      attribution_type: "direct",
    }),
  });
}

async function postMeasurement(kpiId: string, value: number): Promise<void> {
  await fetch(`${API_BASE}/kpi-measurements`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kpi_id: kpiId,
      measured_at: new Date().toISOString(),
      value,
    }),
  });
}

describe("integration: performance alignment via ALIGNED_TO (AC-04, AC-05)", () => {
  beforeAll(async () => {
    // Nothing special needed — Neo4j should be running
  });

  afterAll(async () => {
    const driver = getDriver();
    const session = driver.session();
    try {
      // Clean up KPIs
      for (const id of kpiIds) {
        await session.run("MATCH (k:KPI {id: $id}) DETACH DELETE k", { id });
      }
      // Clean up domains
      for (const id of domainIds) {
        await session.run("MATCH (d:Domain {id: $id}) DETACH DELETE d", { id });
      }
      // Clean up measurements
      for (const id of kpiIds) {
        await session.run("MATCH (m:KPIMeasurement {kpi_id: $id}) DETACH DELETE m", { id });
      }
    } finally {
      await session.close();
    }
  });

  test("AC-04: performance shows real status (not no_data) for KPI with REST measurement", async () => {
    const domainId = await createDomain("perf-test-domain-1");
    const kpiId = await createKpi("perf-test-kpi-1", 90, "higher_is_better");
    await createAlignment(kpiId, "domain", domainId);
    await postMeasurement(kpiId, 95); // above target → on_target

    const res = await fetch(`${API_BASE}/analytics/performance/kpis?domain=${domainId}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rows).toBeDefined();
    const kpi = data.rows.find((r: any) => r.kpi_id === kpiId);
    expect(kpi).toBeDefined();
    expect(kpi.status).not.toBe("no_data"); // AC-04 — dual-write makes it visible
    expect(kpi.latest_value).toBe(95);
    expect(kpi.status).toBe("on_target"); // 95 >= 90
  });

  test("AC-05: domain filter traverses ALIGNED_TO (KPI with ALIGNED_TO but no domain_id)", async () => {
    const domainId = await createDomain("perf-test-domain-2");
    const kpiId = await createKpi("perf-test-kpi-2", 100, "lower_is_better");
    // Create ALIGNED_TO edge (not domain_id property)
    await createAlignment(kpiId, "domain", domainId);
    await postMeasurement(kpiId, 80); // below target → on_target for lower_is_better

    const res = await fetch(`${API_BASE}/analytics/performance/kpis?domain=${domainId}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    const kpi = data.rows.find((r: any) => r.kpi_id === kpiId);
    expect(kpi).toBeDefined(); // AC-05 — found via ALIGNED_TO traversal
    expect(kpi.status).toBe("on_target"); // 80 <= 100
  });
});
