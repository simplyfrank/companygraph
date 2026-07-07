// saas-metric-library T-08 (design §3.1, §5.6 — FR-07, FR-09; AC-02, AC-10).
// Metric-definition CRUD rides the GENERIC graph-core node routes with NO new
// route family and NO new RBAC string. Requires Neo4j + the loopback API up.
//
// AC-02/AC-10: create → read → PATCH (benchmark) → DELETE on
// node:write/node:read. Manual boundary check: `git diff
// api/src/auth/rbac-permissions.ts` shows no permission additions (AC-10, FR-09).

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { ensureMetricDefinitionLabel } from "../src/seed/ensure-metric-label";

const BASE = "http://127.0.0.1:8787";
const API = `${BASE}/api/v1`;

async function api<T>(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, body: (text.length > 0 ? JSON.parse(text) : null) as T };
}

describe("integration: saas-metric-library T-08 metric CRUD (AC-02, AC-10)", () => {
  beforeAll(async () => {
    await ensureMetricDefinitionLabel(BASE);
  });

  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("create → read → PATCH → DELETE over the generic node routes", async () => {
    // Create (node:write) — parseRegistryLabel resolves MetricDefinition.
    const created = await api<{ id: string; attributes: Record<string, unknown> }>(
      "POST",
      "/nodes/MetricDefinition",
      {
        name: `crud-metric-${Date.now()}`,
        attributes: {
          formula: "(a − b) / a",
          unit: "percent",
          category: "financial",
          benchmark: "> 75%",
        },
      },
    );
    expect(created.status).toBe(201);
    const id = created.body.id;

    // Read one (node:read) — returns the four attributes.
    const read = await api<{ attributes: Record<string, unknown> }>("GET", `/nodes/MetricDefinition/${id}`);
    expect(read.status).toBe(200);
    expect(read.body.attributes.formula).toBe("(a − b) / a");
    expect(read.body.attributes.unit).toBe("percent");
    expect(read.body.attributes.category).toBe("financial");
    expect(read.body.attributes.benchmark).toBe("> 75%");

    // PATCH (node:write) — update benchmark; the other required attrs remain.
    const patched = await api<{ attributes: Record<string, unknown> }>(
      "PATCH",
      `/nodes/MetricDefinition/${id}`,
      { attributes: { formula: "(a − b) / a", unit: "percent", category: "financial", benchmark: "> 80% best-in-class" } },
    );
    expect(patched.status).toBe(200);
    expect(patched.body.attributes.benchmark).toBe("> 80% best-in-class");

    // DELETE (node:write).
    const deleted = await api<unknown>("DELETE", `/nodes/MetricDefinition/${id}`);
    expect([200, 204]).toContain(deleted.status);

    const gone = await api<unknown>("GET", `/nodes/MetricDefinition/${id}`);
    expect(gone.status).toBe(404);
  });
});
