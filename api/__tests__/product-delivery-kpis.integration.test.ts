// product-delivery-process-model T-04/T-05 (AC-06, AC-07) — the four Product
// KPIs exist via POST /api/v1/kpis with the pinned targets; the MEASURES link
// set equals PRODUCT_KPI_METRIC_MAP (today: one — Release Frequency →
// metric-deploy-frequency); a second linkKpiToMetric on a linked KPI throws
// (C-02); each KPI carries its ALIGNED_TO rows + domain_id. Requires the
// loopback API + Neo4j + Postgres up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedSaasOperator } from "../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedProductDelivery } from "../scripts/seed-product-delivery";
import { KPI_ROWS } from "../src/seed/product-delivery/rosters";
import { PRODUCT_KPI_METRIC_MAP } from "../src/seed/product-delivery/kpi-metric-map";
import {
  linkKpiToMetric,
  KpiMetricAlreadyLinkedError,
} from "../src/seed/link-kpi-metric";

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
async function kpiId(name: string): Promise<string> {
  const res = await cypher(
    `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
     WHERE d.attributes_json CONTAINS 'product_delivery'
     MATCH (k:KPI {name:$name}) WHERE k.domain_id = d.id RETURN k.id AS id LIMIT 1`,
    { name },
  );
  return String(res.rows[0]!.id);
}

describe("integration: product-delivery KPIs (AC-06, AC-07)", () => {
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedProductDelivery(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-06: the four Product KPIs exist with pinned targets", async () => {
    for (const row of KPI_ROWS) {
      const res = await cypher(
        `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
         WHERE d.attributes_json CONTAINS 'product_delivery'
         MATCH (k:KPI {name:$name}) WHERE k.domain_id = d.id
         RETURN k.target_value AS tv, k.target_direction AS td, count(k) AS n`,
        { name: row.name },
      );
      expect(num(res.rows[0]?.n)).toBe(1);
      expect(Number(res.rows[0]?.tv)).toBe(row.target_value);
      expect(String(res.rows[0]?.td)).toBe(row.target_direction);
    }
  });

  test("AC-06: the MEASURES link set equals PRODUCT_KPI_METRIC_MAP (today: exactly one)", async () => {
    const linkedNames = Object.keys(PRODUCT_KPI_METRIC_MAP);
    // total MEASURES edges from Product KPIs
    const total = await cypher(
      `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
       WHERE d.attributes_json CONTAINS 'product_delivery'
       MATCH (k:KPI)-[:MEASURES]->(:MetricDefinition) WHERE k.domain_id = d.id
       RETURN count(*) AS n`,
    );
    expect(num(total.rows[0]?.n)).toBe(linkedNames.length);

    // Release Frequency → the metric whose seedKey is metric-deploy-frequency
    for (const [name, metricSeedKey] of Object.entries(PRODUCT_KPI_METRIC_MAP)) {
      const res = await cypher(
        `MATCH (k:KPI {name:$name})-[:MEASURES]->(m:MetricDefinition)
         RETURN m.attributes_json AS a`,
        { name },
      );
      expect(res.rows.length).toBe(1);
      expect(String(res.rows[0]?.a)).toContain(metricSeedKey);
    }
  });

  test("AC-06 (C-02 negative): a second linkKpiToMetric on a linked KPI throws", async () => {
    const id = await kpiId("Release Frequency");
    const metric = await cypher(
      `MATCH (m:MetricDefinition) WHERE m.attributes_json CONTAINS 'metric-deploy-frequency'
       RETURN m.id AS id LIMIT 1`,
    );
    const metricId = String(metric.rows[0]!.id);
    await expect(linkKpiToMetric(BASE, id, metricId)).rejects.toBeInstanceOf(
      KpiMetricAlreadyLinkedError,
    );
  });

  test("AC-07: each KPI carries its ALIGNED_TO rows and domain_id", async () => {
    for (const row of KPI_ROWS) {
      const id = await kpiId(row.name);
      // domain_id set (distinct from the alignment edge, C-03)
      const dom = await cypher(
        `MATCH (k:KPI {id:$id}) RETURN k.domain_id AS d`,
        { id },
      );
      expect(typeof dom.rows[0]?.d).toBe("string");
      // one ALIGNED_TO per declared target
      const aligned = await cypher(
        `MATCH (k:KPI {id:$id})-[:ALIGNED_TO]->(x) RETURN count(x) AS n`,
        { id },
      );
      expect(num(aligned.rows[0]?.n)).toBe(row.alignTargets.length);
    }
  });
});
