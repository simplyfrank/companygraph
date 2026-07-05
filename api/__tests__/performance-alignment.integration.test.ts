import { afterAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { generateId } from "../src/ids";

// kpi-measurement-alignment AC-04, AC-05 — performance aggregate uses
// ALIGNED_TO (not CONTRIBUTES_TO) and shows real status (not no_data)
// when a measurement exists as a Neo4j :KPIMeasurement node.
//
// Fixture pattern mirrors performance-kpis.integration.test.ts:
// nodes/edges/measurements seeded via direct driver, not REST.

const API_BASE = "http://127.0.0.1:8787/api/v1";

const cleanupIds: string[] = [];

async function runWrite(cypher: string, params: Record<string, unknown>): Promise<void> {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    await session.run(cypher, params);
  } finally {
    await session.close();
  }
}

async function createNode(label: string, name: string): Promise<string> {
  const id = generateId();
  cleanupIds.push(id);
  await runWrite(
    `CREATE (:\`${label}\` {id: $id, name: $name, description: "perf fixture", attributes_json: "{}", createdAt: $now, updatedAt: $now})`,
    { id, name, now: new Date().toISOString() },
  );
  return id;
}

async function createEdge(fromId: string, type: string, toId: string): Promise<void> {
  await runWrite(
    `MATCH (a {id: $fromId}), (b {id: $toId}) CREATE (a)-[:\`${type}\` {id: $edgeId}]->(b)`,
    { fromId, toId, edgeId: generateId() },
  );
}

async function createKpi(targetValue: number, direction: string): Promise<string> {
  const id = generateId();
  cleanupIds.push(id);
  await runWrite(
    `CREATE (k:KPI {id: $id, name: $name, category: "efficiency", unit: "%",
      target_value: $targetValue, target_direction: $direction,
      measurement_frequency: "daily", created_at: $now, updated_at: $now,
      archived_at: null})`,
    { id, name: `perf-align-${id}`, targetValue, direction, now: new Date().toISOString() },
  );
  return id;
}

async function seedMeasurement(kpiId: string, value: number): Promise<void> {
  const id = generateId();
  cleanupIds.push(id);
  await runWrite(
    `CREATE (:KPIMeasurement {id: $id, kpi_id: $kpiId, measured_at: $measuredAt, value: $value})`,
    { id, kpiId, measuredAt: new Date().toISOString(), value },
  );
}

interface KpiRow {
  kpi_id: string;
  status: string;
  latest_value: number | null;
}

async function getRows(query: string): Promise<KpiRow[]> {
  const res = await fetch(`${API_BASE}/analytics/performance/kpis${query}`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { rows: KpiRow[] };
  return body.rows;
}

function statusOf(rows: KpiRow[], kpiId: string): KpiRow | undefined {
  return rows.find((r) => r.kpi_id === kpiId);
}

describe("integration: performance alignment via ALIGNED_TO (AC-04, AC-05)", () => {
  afterAll(async () => {
    const session = getDriver().session();
    try {
      for (const id of cleanupIds) {
        await session.run("MATCH (n) WHERE n.id = $id DETACH DELETE n", { id });
      }
    } finally {
      await session.close();
    }
    _resetDriver();
    await closeDriver();
  });

  test("AC-04: performance shows real status (not no_data) for KPI with ALIGNED_TO + measurement", async () => {
    const domainId = await createNode("Domain", "perf-align-domain-1");
    const kpiId = await createKpi(90, "higher_is_better");
    await createEdge(kpiId, "ALIGNED_TO", domainId);
    await seedMeasurement(kpiId, 95); // above target → on_target

    const rows = await getRows(`?domain=${domainId}`);
    const kpi = statusOf(rows, kpiId);
    expect(kpi).toBeDefined();
    expect(kpi!.status).not.toBe("no_data"); // AC-04
    expect(kpi!.latest_value).toBe(95);
    expect(kpi!.status).toBe("on_target"); // 95 >= 90
  });

  test("AC-05: domain filter traverses ALIGNED_TO (KPI with ALIGNED_TO, no domain_id property)", async () => {
    const domainId = await createNode("Domain", "perf-align-domain-2");
    const kpiId = await createKpi(100, "lower_is_better");
    await createEdge(kpiId, "ALIGNED_TO", domainId);
    await seedMeasurement(kpiId, 80); // below target → on_target for lower_is_better

    const rows = await getRows(`?domain=${domainId}`);
    const kpi = statusOf(rows, kpiId);
    expect(kpi).toBeDefined(); // AC-05 — found via ALIGNED_TO traversal
    expect(kpi!.status).toBe("on_target"); // 80 <= 100
  });
});
