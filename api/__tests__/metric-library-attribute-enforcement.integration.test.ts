// saas-metric-library T-08 (design §3.1, §5.6 + review-design.md N-02 — FR-08;
// AC-09). The registered json_schema_doc enforces the four core attributes +
// the two closed enums at the REST boundary via the as-built attribute-zod path
// (attribute_violation 400). N-02: a valid write WITH an unrelated extra key
// SUCCEEDS (additionalProperties:true keeps extras open) so a reader can't
// mistake the open extras for disabled enforcement. Requires Neo4j + the
// loopback API up.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { ensureMetricDefinitionLabel } from "../src/seed/ensure-metric-label";

const BASE = "http://127.0.0.1:8787";
const API = `${BASE}/api/v1`;

async function post(path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text.length > 0 ? JSON.parse(text) : null) as { id?: string; error?: { code?: string } } };
}

const created: string[] = [];

describe("integration: saas-metric-library T-08 attribute enforcement (AC-09, N-02)", () => {
  beforeAll(async () => {
    await ensureMetricDefinitionLabel(BASE);
  });

  afterAll(async () => {
    for (const id of created) {
      await fetch(`${API}/nodes/MetricDefinition/${id}`, { method: "DELETE" }).catch(() => {});
    }
    await closeDriver();
    _resetDriver();
  });

  test("AC-09: a write missing the required `unit` is rejected (attribute_violation)", async () => {
    const res = await post("/nodes/MetricDefinition", {
      name: `enf-missing-unit-${Date.now()}`,
      attributes: { formula: "x/y", category: "retention", benchmark: "> 90%" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("attribute_violation");
  });

  test("AC-09: a write with an out-of-enum `category` is rejected", async () => {
    const res = await post("/nodes/MetricDefinition", {
      name: `enf-bad-category-${Date.now()}`,
      attributes: { formula: "x/y", unit: "percent", category: "vanity", benchmark: "> 90%" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("attribute_violation");
  });

  test("AC-09: a write with an out-of-enum `unit` is rejected", async () => {
    const res = await post("/nodes/MetricDefinition", {
      name: `enf-bad-unit-${Date.now()}`,
      attributes: { formula: "x/y", unit: "furlongs", category: "retention", benchmark: "> 90%" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("attribute_violation");
  });

  test("N-02: a valid write WITH an unrelated extra key succeeds (additionalProperties:true)", async () => {
    const res = await post("/nodes/MetricDefinition", {
      name: `enf-extra-key-${Date.now()}`,
      attributes: {
        formula: "x/y",
        unit: "percent",
        category: "retention",
        benchmark: "> 90%",
        // unrelated extra descriptive key — must be accepted.
        owner: "customer-success",
      },
    });
    expect(res.status).toBe(201);
    if (res.body.id) created.push(res.body.id);
  });
});
