// marketing-process-model T-05 (AC-07) — each KPI ALIGNED_TO real Marketing
// structure via POST /api/v1/kpi-alignments (D-1, no new edge type); the one
// PARAM_BINDS resolves to the Capture-Lead activity. Requires the stack up.

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

const KPI_NAMES = [
  "CAC (marketing-attributed)",
  "MQL→SQL Conversion Rate",
  "CPL (cost per lead)",
  "Cost per MQL",
  "Marketing-Sourced Pipeline",
  "Lead Volume",
];

describe("integration: marketing KPI alignment (AC-07)", () => {
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedMarketing(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-07: every Marketing KPI is ALIGNED_TO real Marketing structure", async () => {
    for (const name of KPI_NAMES) {
      const res = await cypher(
        `MATCH (k:KPI {name:$name})-[:ALIGNED_TO]->(t)
         WHERE (t:UserJourney OR t:Activity OR t:Domain)
         RETURN count(t) AS n`,
        { name },
      );
      expect(num(res.rows[0]!.n)).toBeGreaterThanOrEqual(1);
    }
  });

  test("AC-07: the one PARAM_BINDS resolves the Lead-Volume KPI to the Capture-Lead activity", async () => {
    const res = await cypher(`
      MATCH (k:KPI {name:"Lead Volume"})-[:PARAM_BINDS]->(a:Activity)
      WHERE a.attributes_json CONTAINS '"seedKey":"capture-lead"'
      RETURN count(a) AS n`);
    expect(num(res.rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });
});
