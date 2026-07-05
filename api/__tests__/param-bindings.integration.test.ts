import { afterAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { generateId } from "../src/ids";

// kpi-measurement-alignment AC-07, AC-08 — param-binding CRUD + reconcile.
// Uses direct Neo4j driver for fixture setup (same pattern as
// performance-kpis.integration.test.ts), REST only for the routes being tested.

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

async function createKpi(targetValue: number): Promise<string> {
  const id = generateId();
  cleanupIds.push(id);
  await runWrite(
    `CREATE (k:KPI {id: $id, name: $name, category: "efficiency", unit: "%",
      target_value: $targetValue, target_direction: "higher_is_better",
      measurement_frequency: "daily", created_at: $now, updated_at: $now,
      archived_at: null})`,
    { id, name: `binding-${id}`, targetValue, now: new Date().toISOString() },
  );
  return id;
}

async function createActivity(attrs: Record<string, unknown>): Promise<string> {
  const id = generateId();
  cleanupIds.push(id);
  await runWrite(
    `CREATE (a:Activity {id: $id, name: $name, description: "test",
      attributes_json: $attrsJson, createdAt: $now, updatedAt: $now})`,
    { id, name: `activity-${id}`, attrsJson: JSON.stringify(attrs), now: new Date().toISOString() },
  );
  return id;
}

describe("integration: param-bindings CRUD + reconcile (AC-07, AC-08)", () => {
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

  test("AC-07: POST/GET/DELETE param-bindings", async () => {
    const kpiId = await createKpi(50);
    const activityId = await createActivity({ throughputTarget: 75 });

    // POST — create binding
    const postRes = await fetch(`${API_BASE}/kpis/${kpiId}/param-bindings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target_type: "activity",
        target_id: activityId,
        parameter: "target_value",
        attribute_path: "throughputTarget",
      }),
    });
    expect(postRes.status).toBe(201);
    const binding = await postRes.json();
    expect(binding.binding_id).toBeDefined();
    expect(binding.kpi_id).toBe(kpiId);
    expect(binding.parameter).toBe("target_value");
    expect(binding.attribute_path).toBe("throughputTarget");

    // GET — list bindings
    const getRes = await fetch(`${API_BASE}/kpis/${kpiId}/param-bindings`);
    expect(getRes.status).toBe(200);
    const listBody = await getRes.json();
    expect(listBody.rows).toHaveLength(1);
    expect(listBody.rows[0].parameter).toBe("target_value");

    // DELETE — remove binding
    const delRes = await fetch(`${API_BASE}/param-bindings/${binding.binding_id}`, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(200);
    const delBody = await delRes.json();
    expect(delBody.deleted).toBe(true);

    // Verify deleted
    const getRes2 = await fetch(`${API_BASE}/kpis/${kpiId}/param-bindings`);
    const listBody2 = await getRes2.json();
    expect(listBody2.rows).toHaveLength(0);
  });

  test("AC-08: POST reconcile updates KPI param from entity attribute", async () => {
    const kpiId = await createKpi(50);
    const activityId = await createActivity({ throughputTarget: 80 });

    // Create binding: target_value ← activity.attributes.throughputTarget
    const postRes = await fetch(`${API_BASE}/kpis/${kpiId}/param-bindings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target_type: "activity",
        target_id: activityId,
        parameter: "target_value",
        attribute_path: "throughputTarget",
      }),
    });
    expect(postRes.status).toBe(201);

    // Reconcile
    const recRes = await fetch(`${API_BASE}/kpis/${kpiId}/reconcile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(recRes.status).toBe(200);
    const recBody = await recRes.json();
    expect(recBody.reconciled).toBeDefined();
    expect(recBody.reconciled.length).toBeGreaterThanOrEqual(1);
    const reconciled = recBody.reconciled.find((r: any) => r.parameter === "target_value");
    expect(reconciled).toBeDefined();
    expect(reconciled.old_value).toBe(50);
    expect(reconciled.new_value).toBe(80);

    // Verify KPI target_value was updated in Neo4j
    const session = getDriver().session();
    try {
      const result = await session.run("MATCH (k:KPI {id: $id}) RETURN k.target_value AS tv", { id: kpiId });
      const tv = result.records[0]?.get("tv");
      expect(tv).toBe(80);
    } finally {
      await session.close();
    }
  });
});
