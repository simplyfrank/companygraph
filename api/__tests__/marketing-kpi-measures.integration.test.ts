// marketing-process-model T-04 (AC-06) — CAC→metric-cac, MQL→SQL→
// metric-pipeline-conversion each exactly one MEASURES; no INSTANTIATES; the
// four MEASURES-less KPIs have zero MEASURES + no local MetricDefinition.
// Requires the loopback stack up.

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

function num(v: unknown): number {
  if (v && typeof v === "object" && "low" in (v as Record<string, unknown>)) {
    return Number((v as { low: number }).low);
  }
  return Number(v ?? 0);
}

// Metric roster nodes carry a UUIDv7 id + attributes.seedKey (e.g. "metric-cac")
// — the seedKey is the stable handle, matched via attributes_json.
const GROUNDED = [
  { kpi: "CAC (marketing-attributed)", metricSeedKey: "metric-cac" },
  { kpi: "MQL→SQL Conversion Rate", metricSeedKey: "metric-pipeline-conversion" },
];
const MEASURES_LESS = ["CPL (cost per lead)", "Cost per MQL", "Marketing-Sourced Pipeline", "Lead Volume"];

describe("integration: marketing KPI MEASURES (AC-06)", () => {
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedMarketing(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-06: each metric-grounded KPI has exactly one MEASURES to the named MetricDefinition", async () => {
    for (const g of GROUNDED) {
      const res = await cypher(
        `MATCH (k:KPI {name:$kpi})-[m:MEASURES]->(md:MetricDefinition)
         WHERE md.attributes_json CONTAINS $needle RETURN count(m) AS n`,
        { kpi: g.kpi, needle: `"seedKey":"${g.metricSeedKey}"` },
      );
      expect(num(res.rows[0]!.n)).toBe(1);
      // and exactly one MEASURES from this KPI at all
      const total = await cypher(`MATCH (k:KPI {name:$kpi})-[m:MEASURES]->() RETURN count(m) AS n`, { kpi: g.kpi });
      expect(num(total.rows[0]!.n)).toBe(1);
    }
  });

  test("AC-06: no Marketing KPI→metric link is typed INSTANTIATES", async () => {
    const res = await cypher(
      `MATCH (k:KPI)-[r:INSTANTIATES]->(:MetricDefinition) WHERE k.name IN $names RETURN count(r) AS n`,
      { names: [...GROUNDED.map((g) => g.kpi), ...MEASURES_LESS] },
    );
    expect(num(res.rows[0]!.n)).toBe(0);
  });

  test("AC-06: the four MEASURES-less KPIs have zero MEASURES edges", async () => {
    for (const name of MEASURES_LESS) {
      const res = await cypher(`MATCH (k:KPI {name:$name})-[m:MEASURES]->() RETURN count(m) AS n`, { name });
      expect(num(res.rows[0]!.n)).toBe(0);
    }
  });
});
