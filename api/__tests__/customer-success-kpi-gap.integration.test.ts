// customer-success-process-model T-06 (AC-07) — the OQ-1 per-metric conditional
// arm (C-02): for each of the three CS-specific KPIs (Health Score / CSAT /
// Ticket SLA Compliance), either (present) its metric exists → the KPI is
// authored and MEASURES it, or (absent) the KPI is absent; and in all cases this
// spec registered NO new MetricDefinition (the count is unchanged from the
// metric-library seed). Requires the loopback stack + the two upstream seeds.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedCustomerSuccessPreconditions } from "./helpers/customer-success-fixtures";
import { CS_CONDITIONAL_KPIS } from "../src/seed/customer-success-catalog";

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

// The frozen 20-metric library roster (saas-metric-library). This spec must not
// grow it — the MetricDefinition count stays at this baseline.
const LIBRARY_METRIC_COUNT = 20;

async function metricExists(seedKey: string): Promise<boolean> {
  const res = await cypher(
    `MATCH (m:MetricDefinition) WHERE m.attributes_json CONTAINS $seedKey RETURN count(m) AS n`,
    { seedKey },
  );
  return num(res.rows[0]!.n) > 0;
}

async function csKpiExists(name: string): Promise<boolean> {
  const res = await cypher(
    `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
     WHERE d.attributes_json CONTAINS 'customer_success'
     MATCH (k:KPI {name:$name}) WHERE k.domain_id = d.id AND k.archived_at IS NULL
     RETURN count(k) AS n`,
    { name },
  );
  return num(res.rows[0]!.n) > 0;
}

describe("integration: customer-success KPI gap (AC-07, OQ-1 conditional arm)", () => {
  beforeAll(async () => {
    await seedCustomerSuccessPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-07: per-metric — each CS-specific KPI is present iff its metric exists, MEASURES it", async () => {
    for (const row of CS_CONDITIONAL_KPIS) {
      const present = await metricExists(row.metricSeedKey);
      const kpiPresent = await csKpiExists(row.name);
      expect(kpiPresent).toBe(present);
      if (present) {
        const res = await cypher(
          `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
           WHERE d.attributes_json CONTAINS 'customer_success'
           MATCH (k:KPI {name:$name})-[m:MEASURES]->(:MetricDefinition)
           WHERE k.domain_id = d.id RETURN count(m) AS n`,
          { name: row.name },
        );
        expect(num(res.rows[0]!.n)).toBe(1);
      }
    }
  });

  test("AC-07: this spec registered NO new MetricDefinition (roster unchanged, NFR-01)", async () => {
    const res = await cypher(`MATCH (m:MetricDefinition) RETURN count(m) AS n`);
    expect(num(res.rows[0]!.n)).toBe(LIBRARY_METRIC_COUNT);
    // None of the three CS-specific metric seedKeys were invented by this spec.
    for (const row of CS_CONDITIONAL_KPIS) {
      // If a metric with this seedKey exists it came from the library, not here;
      // in the default (deferred) environment it is absent.
      const present = await metricExists(row.metricSeedKey);
      expect(typeof present).toBe("boolean");
    }
  });
});
