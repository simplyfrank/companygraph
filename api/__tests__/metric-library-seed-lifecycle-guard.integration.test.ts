// saas-metric-library T-05 + T-07 (design §5.4 — FR-06; AC-08). Requires
// Neo4j + the loopback API up.
//
// AC-08 real-fixture half (T-05): the real nodes-only fixture imports and writes
// all 20 MetricDefinition nodes (proven via the seed step + a count read).
// AC-08 negative half (T-07): a hand-built fixture carrying a lifecycle edge row
// (INSTANTIATES / IN_MODEL, both ∈ LIFECYCLE_EDGES) → 409
// model_lifecycle_route_required with NOTHING written (payload-atomic pre-scan).
// This proves the real fixture is clean *because* the guard would reject a dirty
// one; the module-pin edge + guard are unaffected by this feature.

import { afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";

const BASE = "http://127.0.0.1:8787";
const API = `${BASE}/api/v1`;

async function cypher(statement: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${API}/query/cypher`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ statement, params }),
  });
  return (await res.json()) as { rows: Array<Record<string, unknown>> };
}

function toCount(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "low" in (v as Record<string, unknown>)) {
    return Number((v as { low: number }).low);
  }
  return Number(v ?? 0);
}

describe("integration: saas-metric-library T-05/T-07 lifecycle-guard (AC-08)", () => {
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-08 real fixture: the nodes-only fixture imports and writes all 20 metric nodes", async () => {
    await seedSaasMetricLibrary(BASE);
    const n = toCount((await cypher("MATCH (m:MetricDefinition) RETURN count(m) AS n")).rows[0]!.n);
    expect(n).toBe(20);
  });

  test("AC-08 negative: a fixture with a lifecycle edge row → 409, nothing written", async () => {
    // Snapshot the total node/edge count so we can assert write-nothing.
    const beforeNodes = toCount((await cypher("MATCH (n) RETURN count(n) AS n")).rows[0]!.n);
    const beforeEdges = toCount((await cypher("MATCH ()-[r]->() RETURN count(r) AS n")).rows[0]!.n);

    for (const type of ["INSTANTIATES", "IN_MODEL"]) {
      const res = await fetch(`${API}/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nodes: [
            {
              label: "MetricDefinition",
              name: `lifecycle-smuggle-${type}`,
              attributes: { formula: "x", unit: "count", category: "efficiency", benchmark: "n/a" },
            },
          ],
          edges: [
            { type, fromId: "00000000-0000-7000-8000-0000000000aa", toId: "00000000-0000-7000-8000-0000000000bb" },
          ],
        }),
      });
      const body = (await res.json()) as { error?: { code?: string } };
      expect(res.status).toBe(409);
      expect(body.error?.code).toBe("model_lifecycle_route_required");
    }

    const afterNodes = toCount((await cypher("MATCH (n) RETURN count(n) AS n")).rows[0]!.n);
    const afterEdges = toCount((await cypher("MATCH ()-[r]->() RETURN count(r) AS n")).rows[0]!.n);
    expect(afterNodes).toBe(beforeNodes);
    expect(afterEdges).toBe(beforeEdges);
  });
});
