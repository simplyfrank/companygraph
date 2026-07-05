import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { generateId } from "../src/ids";
import { query, runMigrations } from "../src/storage/postgres/client";
import { getDriver } from "../src/neo4j/driver";

// kpi-measurement-alignment AC-01, AC-02, AC-03 — dual-write verification.
// POST creates both a Postgres row AND a Neo4j :KPIMeasurement node.
// DELETE removes both. GET still reads Postgres only.

const API_BASE = "http://127.0.0.1:8787/api/v1";

interface ErrorEnvelope {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

const createdIds: string[] = [];

async function postMeasurement(body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API_BASE}/kpi-measurements`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await res.json();
  if (res.status === 201 && parsed && typeof parsed.id === "string") createdIds.push(parsed.id);
  return { status: res.status, body: parsed };
}

describe("integration: kpi-measurement dual-write (AC-01, AC-02, AC-03)", () => {
  const kpiId = generateId();

  beforeAll(async () => {
    await runMigrations();
  });

  afterAll(async () => {
    // Clean up Postgres
    if (createdIds.length > 0) {
      await query("DELETE FROM kpi_measurements WHERE id = ANY($1)", [createdIds]);
    }
    // Clean up Neo4j
    const driver = getDriver();
    const session = driver.session();
    try {
      for (const id of createdIds) {
        await session.run("MATCH (m:KPIMeasurement {id: $id}) DETACH DELETE m", { id });
      }
    } finally {
      await session.close();
    }
  });

  test("AC-01: POST creates both Postgres row and Neo4j :KPIMeasurement node", async () => {
    const measuredAt = new Date().toISOString();
    const { status, body } = await postMeasurement({
      kpi_id: kpiId,
      measured_at: measuredAt,
      value: 55.5,
      context: { region: "apac" },
      source: "dual-write-test",
    });

    expect(status).toBe(201);
    expect(typeof body.id).toBe("string");

    // Verify Postgres row
    const pgRows = await query("SELECT * FROM kpi_measurements WHERE id = $1", [body.id]);
    expect(pgRows).toHaveLength(1);
    expect(pgRows[0].kpi_id).toBe(kpiId);
    expect(parseFloat(pgRows[0].value)).toBe(55.5);

    // Verify Neo4j :KPIMeasurement node (AC-01)
    const driver = getDriver();
    const session = driver.session();
    try {
      const result = await session.run(
        "MATCH (m:KPIMeasurement {id: $id}) RETURN m",
        { id: body.id },
      );
      expect(result.records).toHaveLength(1);
      const node = result.records[0]?.get("m").properties;
      expect(node.kpi_id).toBe(kpiId);
      expect(node.value).toBe(55.5);
      expect(node.source).toBe("dual-write-test");
    } finally {
      await session.close();
    }
  });

  test("AC-03: GET list still reads from Postgres", async () => {
    const measuredAt = new Date().toISOString();
    const { body } = await postMeasurement({
      kpi_id: kpiId,
      measured_at: measuredAt,
      value: 10,
    });

    const res = await fetch(`${API_BASE}/kpi-measurements?kpi_id=${kpiId}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rows).toBeDefined();
    expect(Array.isArray(data.rows)).toBe(true);
    const found = data.rows.find((r: any) => r.id === body.id);
    expect(found).toBeDefined();
    expect(found.value).toBe(10); // parsed to number by GET handler
  });

  test("AC-02: DELETE removes both Postgres row and Neo4j node", async () => {
    const { body } = await postMeasurement({
      kpi_id: kpiId,
      measured_at: new Date().toISOString(),
      value: 99,
    });
    const measurementId = body.id;

    // Delete via REST
    const delRes = await fetch(`${API_BASE}/kpi-measurements/${measurementId}`, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(200);
    const delBody = await delRes.json();
    expect(delBody.deleted).toBe(true);

    // Verify Postgres row removed
    const pgRows = await query("SELECT * FROM kpi_measurements WHERE id = $1", [measurementId]);
    expect(pgRows).toHaveLength(0);

    // Verify Neo4j node removed (AC-02)
    const driver = getDriver();
    const session = driver.session();
    try {
      const result = await session.run(
        "MATCH (m:KPIMeasurement {id: $id}) RETURN m",
        { id: measurementId },
      );
      expect(result.records).toHaveLength(0);
    } finally {
      await session.close();
    }

    // Remove from cleanup list since it's already deleted
    const idx = createdIds.indexOf(measurementId);
    if (idx >= 0) createdIds.splice(idx, 1);
  });
});
