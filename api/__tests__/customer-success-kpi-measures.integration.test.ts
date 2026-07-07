// customer-success-process-model T-05 (AC-06) — with the MEASURES type
// registered, each retention KPI MEASURES exactly one metric by fixed id
// (written via linkKpiToMetric, not a raw POST, C-05); a second link →
// 409 kpi_metric_already_linked; the module-pin INSTANTIATES edge is unaffected
// (still 409 via /edges). Requires the loopback stack + the two upstream seeds.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedCustomerSuccessPreconditions } from "./helpers/customer-success-fixtures";

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

// Retention KPI name → the metric name it MEASURES (fixed 018f0100-…-006..9).
const LINKED: Record<string, string> = {
  "Net Revenue Retention": "NRR",
  "Gross Revenue Retention": "GRR",
  "Logo Churn": "Logo Churn",
  "Revenue Churn": "Revenue Churn",
};

describe("integration: customer-success KPI MEASURES (AC-06)", () => {
  beforeAll(async () => {
    await seedCustomerSuccessPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-06: each retention KPI MEASURES exactly one expected metric by fixed id", async () => {
    for (const [name, metric] of Object.entries(LINKED)) {
      const res = await cypher(
        `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
         WHERE d.attributes_json CONTAINS 'customer_success'
         MATCH (k:KPI {name:$name})-[m:MEASURES]->(md:MetricDefinition)
         WHERE k.domain_id = d.id
         RETURN count(m) AS n, collect(md.name)[0] AS metric`,
        { name },
      );
      expect(num(res.rows[0]!.n)).toBe(1);
      expect(String(res.rows[0]!.metric)).toBe(metric);
    }
  });

  test("AC-06: a second MEASURES from the same KPI is rejected 409 kpi_metric_already_linked", async () => {
    const { linkKpiToMetric, KpiMetricAlreadyLinkedError } = await import(
      "../src/seed/link-kpi-metric"
    );
    const idRes = await cypher(
      `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
       WHERE d.attributes_json CONTAINS 'customer_success'
       MATCH (k:KPI {name:"Net Revenue Retention"}) WHERE k.domain_id = d.id
       RETURN k.id AS kid`,
    );
    const kpiId = String(idRes.rows[0]!.kid);
    const metricRes = await cypher(`MATCH (m:MetricDefinition {name:"GRR"}) RETURN m.id AS id`);
    const metricId = String(metricRes.rows[0]!.id);

    let threw = false;
    try {
      await linkKpiToMetric(BASE, kpiId, metricId);
    } catch (e) {
      threw = e instanceof KpiMetricAlreadyLinkedError;
    }
    expect(threw).toBe(true);
  });

  test("AC-06: a fresh MEASURES write is 201; a module-pin INSTANTIATES via /edges is still 409", async () => {
    const md = await cypher(`MATCH (m:MetricDefinition {name:"NRR"}) RETURN m.id AS id`);
    const metricId = String(md.rows[0]!.id);
    const kpiRes = await fetch(`${BASE}/api/v1/kpis`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: `CS AC06 probe KPI ${Date.now()}`,
        category: "retention",
        unit: "percent",
        target_value: 1,
        target_direction: "up",
        measurement_frequency: "monthly",
      }),
    });
    const probeKpi = (await kpiRes.json()) as { id: string };

    const measures = await fetch(`${BASE}/api/v1/edges`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "MEASURES", fromId: probeKpi.id, toId: metricId }),
    });
    expect(measures.status).toBe(201);

    const inst = await fetch(`${BASE}/api/v1/edges`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "INSTANTIATES", fromId: probeKpi.id, toId: metricId }),
    });
    expect(inst.status).toBe(409);
  });
});
