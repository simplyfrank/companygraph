// saas-metric-library T-01/T-04/T-05/T-06 (design §4, §5.4, §5.5, §7 — FR-04,
// FR-05, FR-06, NFR-02; AC-06, AC-07). Requires Neo4j + the loopback API up.
//
// AC-06: after seed:saas-metric-library, the seeded MetricDefinition name set
// EQUALS the §4 roster exactly (count = 20, no missing/no extra), each node
// carrying a non-empty formula, an enum unit, an enum category, a non-empty
// benchmark (read via METRIC_CATALOG_LIST_QUERY, §5.5).
// AC-07: a re-seed yields zero net new nodes (MERGE-on-id via realImport);
// metrics are not IN_MODEL-scoped.
// Also asserts the frozen roster parses metricRowSchema with unique ids/names.

import { afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import {
  METRIC_CATALOG,
  METRIC_CATALOG_LIST_QUERY,
  metricRowSchema,
  METRIC_UNITS,
  METRIC_CATEGORIES,
} from "../src/seed/metric-catalog";
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

const EXPECTED_NAMES = METRIC_CATALOG.map((m) => m.name).sort();

describe("integration: saas-metric-library T-05/T-06 seed roster (AC-06, AC-07)", () => {
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("T-01: the frozen roster is 20 rows, all parse metricRowSchema, ids+names unique", () => {
    expect(METRIC_CATALOG).toHaveLength(20);
    for (const row of METRIC_CATALOG) {
      expect(metricRowSchema.safeParse(row).success).toBe(true);
    }
    const ids = new Set(METRIC_CATALOG.map((m) => m.id));
    const names = new Set(METRIC_CATALOG.map((m) => m.name));
    expect(ids.size).toBe(20);
    expect(names.size).toBe(20);
  });

  test("AC-06: the seeded MetricDefinition name set equals the §4 roster exactly", async () => {
    await seedSaasMetricLibrary(BASE);

    const res = await cypher(METRIC_CATALOG_LIST_QUERY);
    const seededNames = res.rows.map((r) => String(r.name)).sort();
    expect(seededNames).toEqual(EXPECTED_NAMES);

    // Each node carries the four enforced attributes with valid enum values.
    for (const r of res.rows) {
      const attrs = JSON.parse(String(r.attributes_json)) as Record<string, string>;
      expect(attrs.formula.length).toBeGreaterThan(0);
      expect(attrs.benchmark.length).toBeGreaterThan(0);
      expect(METRIC_UNITS).toContain(attrs.unit as (typeof METRIC_UNITS)[number]);
      expect(METRIC_CATEGORIES).toContain(attrs.category as (typeof METRIC_CATEGORIES)[number]);
    }
  });

  test("AC-07: a re-seed yields zero net new MetricDefinition nodes (MERGE-on-id)", async () => {
    const before = toCount((await cypher("MATCH (m:MetricDefinition) RETURN count(m) AS n")).rows[0]!.n);
    await seedSaasMetricLibrary(BASE);
    const after = toCount((await cypher("MATCH (m:MetricDefinition) RETURN count(m) AS n")).rows[0]!.n);
    expect(after).toBe(before);
    expect(after).toBe(20);
  });

  test("AC-07: metric definitions are not IN_MODEL-scoped", async () => {
    const res = await cypher(
      "MATCH (m:MetricDefinition)-[:IN_MODEL]->() RETURN count(m) AS n",
    );
    expect(toCount(res.rows[0]!.n)).toBe(0);
  });
});
