// finance-accounting-process-model T-05 verification (AC-05, AC-06, AC-15
// blocked-on-OQ-1). The six grounded finance KPIs each carry domain_id=finance
// and exactly one MEASURES edge; a second MEASURES on the same KPI is rejected
// kpi_metric_already_linked; the seventh FinOps KPI exists ungrounded (zero
// MEASURES) — the knowingly-temporary XD-06 exception (C-04). AC-15 is
// blocked-on-OQ-1 (the grounded assertion lands once metric-cloud-cost-per-tenant
// ships).
//
// Requires the loopback API + Neo4j + Postgres up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { ensureMetricDefinitionLabel } from "../src/seed/ensure-metric-label";
import { ensureMeasuresEdgeType } from "../src/seed/ensure-measures-edge";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedFinanceGraph } from "../scripts/seed-finance-graph";
import { linkKpiToMetric, KpiMetricAlreadyLinkedError } from "../src/seed/link-kpi-metric";
import { FINANCE_KPIS } from "../scripts/finance-ids";

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

async function importSlice() {
  const path = resolve(import.meta.dir, "../../shared/seed/saas-operator/finance-accounting.json");
  await fetch(`${BASE}/api/v1/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: readFileSync(path, "utf8"),
  });
}

const GROUNDED = FINANCE_KPIS.filter((k) => k.groundedNow);
const UNGROUNDED = FINANCE_KPIS.filter((k) => !k.groundedNow);

describe("integration: finance KPIs", () => {
  let financeDomainId = "";
  beforeAll(async () => {
    await ensureMetricDefinitionLabel(BASE);
    await ensureMeasuresEdgeType(BASE);
    await seedSaasMetricLibrary(BASE); // metrics for grounding
    await importSlice();
    const result = await seedFinanceGraph(BASE);
    financeDomainId = result.financeDomainId;
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-05: the six grounded finance KPIs each carry exactly one MEASURES edge", async () => {
    // Group by KPI id (scoped to this run's finance domain) so the per-KPI
    // cardinality is asserted precisely; every grounded KPI created by the
    // guarded linkKpiToMetric path has exactly one MEASURES edge.
    const res = await cypher(
      `MATCH (k:KPI {category:'finance'})-[m:MEASURES]->(:MetricDefinition)
       WHERE k.domain_id = $domainId
       RETURN k.id AS id, k.name AS name, count(m) AS n`,
      { domainId: financeDomainId },
    );
    const groundedNames = new Set<string>();
    for (const r of res.rows) {
      expect(num(r.n)).toBe(1); // exactly one MEASURES per grounded KPI id
      groundedNames.add(String(r.name));
    }
    // All six grounded KPI names are present and grounded.
    for (const kpi of GROUNDED) {
      expect(groundedNames.has(kpi.name)).toBe(true);
    }
    // The ungrounded FinOps KPI name is NOT among the grounded set.
    for (const kpi of UNGROUNDED) {
      expect(groundedNames.has(kpi.name)).toBe(false);
    }
  });

  test("AC-05: each grounded KPI carries domain_id = finance domain", async () => {
    for (const kpi of GROUNDED) {
      const res = await cypher(`MATCH (k:KPI {name:$name}) RETURN k.domain_id AS d`, { name: kpi.name });
      expect(res.rows.some((r) => r.d === financeDomainId)).toBe(true);
    }
  });

  test("AC-06: a second MEASURES on an already-grounded KPI is rejected kpi_metric_already_linked", async () => {
    // Resolve a finance MRR KPI that already MEASURES its metric (grounded by
    // seedFinanceGraph in beforeAll), then attempt a second link via the sole
    // sanctioned write path (linkKpiToMetric). Enforcement is write-path-scoped
    // (the raw edge route has no native single-edge cardinality — link-kpi-metric.ts).
    const kpiRow = await cypher(
      `MATCH (k:KPI {name:'MRR', category:'finance'})-[:MEASURES]->(:MetricDefinition)
       WHERE k.domain_id = $domainId RETURN k.id AS id LIMIT 1`,
      { domainId: financeDomainId },
    );
    const metRow = await cypher(
      `MATCH (m:MetricDefinition) WHERE m.attributes_json CONTAINS 'metric-mrr' RETURN m.id AS id LIMIT 1`,
    );
    const kpiId = String(kpiRow.rows[0]!.id);
    const metricId = String(metRow.rows[0]!.id);

    let thrown: unknown;
    try {
      await linkKpiToMetric(BASE, kpiId, metricId);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(KpiMetricAlreadyLinkedError);
    expect((thrown as KpiMetricAlreadyLinkedError).code).toBe("kpi_metric_already_linked");
  });

  test("AC-15 (blocked-on-OQ-1): the FinOps KPI exists ungrounded (zero MEASURES) — observable XD-06 exception", async () => {
    for (const kpi of UNGROUNDED) {
      const exists = await cypher(`MATCH (k:KPI {name:$name}) RETURN count(k) AS n`, { name: kpi.name });
      expect(num(exists.rows[0]!.n)).toBeGreaterThanOrEqual(1);
      const measures = await cypher(
        `MATCH (k:KPI {name:$name}) OPTIONAL MATCH (k)-[r:MEASURES]->() RETURN count(r) AS n`,
        { name: kpi.name },
      );
      expect(num(measures.rows[0]!.n)).toBe(0);
    }
  });
});
