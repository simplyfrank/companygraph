// sales-process-model T-04 (AC-05, AC-05a, AC-06) — MEASURES via linkKpiToMetric,
// no ungrounded KPI, ≥1 ALIGNED_TO per KPI. Requires the stack up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { BASE, cypher, num, salesSeedReady, skipMsg } from "./sales-test-harness";

async function salesKpiIds(): Promise<string[]> {
  // Sales KPIs = those ALIGNED_TO a sales-domain journey/activity/domain.
  const res = await cypher(
    `MATCH (k:KPI)-[:ALIGNED_TO]->(t)
     OPTIONAL MATCH (t)-[:PART_OF*0..2]->(d:Domain)
     WITH k, t, d
     WHERE (t:Domain AND t.attributes_json CONTAINS '"seedKey":"sales"')
        OR (d IS NOT NULL AND d.attributes_json CONTAINS '"seedKey":"sales"')
     RETURN DISTINCT k.id AS id`,
  );
  return res.rows.map((r) => String(r.id));
}

describe("integration: sales KPI ↦ metric (AC-05, AC-05a, AC-06)", () => {
  let ready = false;
  beforeAll(async () => {
    ready = await salesSeedReady();
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-05: Win Rate MEASURES metric-win-rate; Pipeline Conversion MEASURES metric-pipeline-conversion", async () => {
    if (!ready) return skipMsg("AC-05");
    const winRate = await cypher(
      `MATCH (k:KPI {name:"Win Rate"})-[:MEASURES]->(m:MetricDefinition)
       WHERE m.id="metric-win-rate" OR m.attributes_json CONTAINS '"seedKey":"metric-win-rate"' RETURN count(*) AS n`,
    );
    expect(num(winRate.rows[0]!.n)).toBe(1);
    const pipeConv = await cypher(
      `MATCH (k:KPI {name:"Pipeline Conversion"})-[:MEASURES]->(m:MetricDefinition)
       WHERE m.id="metric-pipeline-conversion" OR m.attributes_json CONTAINS '"seedKey":"metric-pipeline-conversion"' RETURN count(*) AS n`,
    );
    expect(num(pipeConv.rows[0]!.n)).toBe(1);
  });

  test("AC-05: a second MEASURES on the same KPI is rejected by the helper guard", async () => {
    if (!ready) return skipMsg("AC-05");
    const { linkKpiToMetric, KpiMetricAlreadyLinkedError } = await import("../src/seed/link-kpi-metric");
    const winRate = await cypher(`MATCH (k:KPI {name:"Win Rate"}) RETURN k.id AS id LIMIT 1`);
    const metric = await cypher(`MATCH (m:MetricDefinition) WHERE m.id="metric-win-rate" OR m.attributes_json CONTAINS '"seedKey":"metric-win-rate"' RETURN m.id AS id LIMIT 1`);
    let threw = false;
    try {
      await linkKpiToMetric(BASE, String(winRate.rows[0]!.id), String(metric.rows[0]!.id));
    } catch (e) {
      threw = e instanceof KpiMetricAlreadyLinkedError;
    }
    expect(threw).toBe(true);
  });

  test("AC-05a: every Sales KPI has ≥1 MEASURES edge (no ungrounded KPI)", async () => {
    if (!ready) return skipMsg("AC-05a");
    const ids = await salesKpiIds();
    expect(ids.length).toBeGreaterThanOrEqual(2); // the two FR-05a KPIs at minimum
    for (const id of ids) {
      const res = await cypher(`MATCH (:KPI {id:$id})-[m:MEASURES]->(:MetricDefinition) RETURN count(m) AS n`, { id });
      expect(num(res.rows[0]!.n)).toBeGreaterThanOrEqual(1);
    }
  });

  test("AC-06: each Sales KPI has ≥1 ALIGNED_TO edge", async () => {
    if (!ready) return skipMsg("AC-06");
    const ids = await salesKpiIds();
    for (const id of ids) {
      const res = await cypher(`MATCH (:KPI {id:$id})-[r:ALIGNED_TO]->() RETURN count(r) AS n`, { id });
      expect(num(res.rows[0]!.n)).toBeGreaterThanOrEqual(1);
    }
  });
});
