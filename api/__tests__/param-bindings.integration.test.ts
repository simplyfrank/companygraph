import { afterAll, describe, expect, test } from "bun:test";
import { generateId } from "../src/ids";
import { getDriver } from "../src/neo4j/driver";

// kpi-measurement-alignment AC-07, AC-08 — param-binding CRUD + reconcile.

const API_BASE = "http://127.0.0.1:8787/api/v1";

const kpiIds: string[] = [];
const activityIds: string[] = [];

async function createKpi(name: string, targetValue: number): Promise<string> {
  const res = await fetch(`${API_BASE}/kpis`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      category: "efficiency",
      unit: "%",
      target_value: targetValue,
      target_direction: "higher_is_better",
      measurement_frequency: "daily",
    }),
  });
  const body = await res.json();
  kpiIds.push(body.id);
  return body.id;
}

async function createActivity(name: string, attrs: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${API_BASE}/nodes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label: "Activity", name, description: "test", attributes: attrs }),
  });
  const body = await res.json();
  activityIds.push(body.id);
  return body.id;
}

describe("integration: param-bindings CRUD + reconcile (AC-07, AC-08)", () => {
  const driver = getDriver();

  afterAll(async () => {
    const session = driver.session();
    try {
      for (const id of kpiIds) {
        await session.run("MATCH (k:KPI {id: $id}) DETACH DELETE k", { id });
      }
      for (const id of activityIds) {
        await session.run("MATCH (a:Activity {id: $id}) DETACH DELETE a", { id });
      }
    } finally {
      await session.close();
    }
  });

  test("AC-07: POST/GET/DELETE param-bindings", async () => {
    const kpiId = await createKpi("binding-test-kpi", 50);
    const activityId = await createActivity("binding-test-activity", { throughputTarget: 75 });

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
    const kpiId = await createKpi("reconcile-test-kpi", 50);
    const activityId = await createActivity("reconcile-test-activity", { throughputTarget: 80 });

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
    const session = driver.session();
    try {
      const result = await session.run("MATCH (k:KPI {id: $id}) RETURN k.target_value AS tv", { id: kpiId });
      expect(result.records[0]?.get("tv")).toBe(80);
    } finally {
      await session.close();
    }
  });
});
