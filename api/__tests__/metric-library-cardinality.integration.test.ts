// saas-metric-library T-03 (design §5.3 — OQ-2 a + review-design.md C-02;
// FR-03; AC-05). The linkKpiToMetric helper is the SINGLE sanctioned write
// path: it links a KPI→metric once (returns an edge id), rejects a second link
// from the same KPI with a helper-local kpi_metric_already_linked (mapped 409),
// and a read returns exactly one metric per KPI.
//
// C-02 pin: enforcement is WRITE-PATH-SCOPED (advisory). A raw POST
// /api/v1/edges could still create a second MEASURES edge; a hard Neo4j
// single-edge cardinality constraint is out of this feature's ownership
// (design §12). This test proves the helper path, not a graph-level guarantee.
// Requires Neo4j + the loopback API up.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { ensureMetricDefinitionLabel } from "../src/seed/ensure-metric-label";
import { ensureMeasuresEdgeType } from "../src/seed/ensure-measures-edge";
import { linkKpiToMetric, KpiMetricAlreadyLinkedError } from "../src/seed/link-kpi-metric";

const BASE = "http://127.0.0.1:8787";
const API = `${BASE}/api/v1`;

const cleanup: Array<{ label: string; id: string }> = [];

async function createNode(label: string, name: string, attributes: Record<string, unknown> = {}) {
  const res = await fetch(`${API}/nodes/${label}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, attributes }),
  });
  const body = (await res.json()) as { id: string };
  if (res.status !== 201) throw new Error(`createNode ${label}: ${res.status} ${JSON.stringify(body)}`);
  cleanup.push({ label, id: body.id });
  return body.id;
}

describe("integration: saas-metric-library T-03 KPI→metric cardinality (AC-05)", () => {
  let kpiId: string;
  let metricA: string;
  let metricB: string;

  beforeAll(async () => {
    await ensureMetricDefinitionLabel(BASE);
    await ensureMeasuresEdgeType(BASE);
    kpiId = await createNode("KPI", `mlib-card-kpi-${Date.now()}`);
    metricA = await createNode("MetricDefinition", `mlib-card-metricA-${Date.now()}`, {
      formula: "a", unit: "percent", category: "retention", benchmark: "> 100%",
    });
    metricB = await createNode("MetricDefinition", `mlib-card-metricB-${Date.now()}`, {
      formula: "b", unit: "percent", category: "retention", benchmark: "> 90%",
    });
  });

  afterAll(async () => {
    // detach-delete the KPI (removes its MEASURES edge) + metrics.
    for (const { label, id } of cleanup.reverse()) {
      await fetch(`${API}/nodes/${label}/${id}?cascade=true`, { method: "DELETE" });
    }
    await closeDriver();
    _resetDriver();
  });

  test("links once, rejects the second link, read returns exactly one metric", async () => {
    // First link succeeds → returns an edge id.
    const edgeId = await linkKpiToMetric(BASE, kpiId, metricA);
    expect(edgeId).toBeDefined();

    // Second link from the same KPI (even to a different metric) is rejected.
    let rejected: unknown = null;
    try {
      await linkKpiToMetric(BASE, kpiId, metricB);
    } catch (e) {
      rejected = e;
    }
    expect(rejected).toBeInstanceOf(KpiMetricAlreadyLinkedError);
    expect((rejected as KpiMetricAlreadyLinkedError).httpStatus).toBe(409);
    expect((rejected as KpiMetricAlreadyLinkedError).code).toBe("kpi_metric_already_linked");

    // A read returns exactly one metric for the KPI.
    const readRes = await fetch(`${API}/query/cypher`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        statement: "MATCH (k:KPI {id:$kpiId})-[:MEASURES]->(m:MetricDefinition) RETURN m.id AS id",
        params: { kpiId },
      }),
    });
    const read = (await readRes.json()) as { rows: Array<{ id: string }> };
    expect(read.rows).toHaveLength(1);
    expect(read.rows[0]!.id).toBe(metricA);
  });
});
