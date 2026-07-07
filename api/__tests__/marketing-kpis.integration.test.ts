// marketing-process-model T-03 (AC-05) — the six Marketing KPIs exist via
// POST /api/v1/kpis (two metric-grounded + four MEASURES-less). Requires the
// loopback stack up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedSaasOperator } from "../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedMarketing } from "../scripts/seed-marketing";

const BASE = "http://127.0.0.1:8787";

async function cypher(statement: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${BASE}/api/v1/query/cypher`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ statement, params }),
  });
  return (await res.json()) as { rows: Array<Record<string, unknown>> };
}

const KPI_NAMES = [
  "CAC (marketing-attributed)",
  "MQL→SQL Conversion Rate",
  "CPL (cost per lead)",
  "Cost per MQL",
  "Marketing-Sourced Pipeline",
  "Lead Volume",
];

const VALID_CATEGORIES = ["efficiency", "quality", "customer_satisfaction", "cost", "time", "compliance", "other"];
const VALID_DIRECTIONS = ["higher_is_better", "lower_is_better", "target_is_exact"];

describe("integration: marketing KPIs (AC-05)", () => {
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedMarketing(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-05: all six Marketing KPIs exist with valid kpiCreateRequestSchema fields", async () => {
    const res = await cypher(
      `MATCH (k:KPI) WHERE k.name IN $names
       RETURN k.name AS name, k.category AS category, k.unit AS unit, k.target_direction AS dir`,
      { names: KPI_NAMES },
    );
    const found = new Set(res.rows.map((r) => String(r.name)));
    for (const n of KPI_NAMES) expect(found.has(n)).toBe(true);
    for (const r of res.rows) {
      expect(VALID_CATEGORIES).toContain(String(r.category));
      expect(VALID_DIRECTIONS).toContain(String(r.dir));
      expect(String(r.unit).length).toBeGreaterThan(0);
    }
  });

  test("AC-05: each Marketing KPI is unique (idempotent create, no duplicate)", async () => {
    const res = await cypher(
      `MATCH (k:KPI) WHERE k.name IN $names RETURN k.name AS name, count(k) AS n`,
      { names: KPI_NAMES },
    );
    for (const r of res.rows) {
      const n = r.n && typeof r.n === "object" && "low" in (r.n as Record<string, unknown>)
        ? Number((r.n as { low: number }).low)
        : Number(r.n);
      expect(n).toBe(1);
    }
  });
});
