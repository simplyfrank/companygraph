// platform-ops-process-model T-10 (AC-08) — each linked KPI has exactly one
// MEASURES edge to a MetricDefinition in the frozen roster
// (uptime/mttr/deploy-frequency/error-budget→uptime); the POST /api/v1/edges
// MEASURES write returns 201 (not 409); a lifecycle INSTANTIATES write via
// /edges is still 409 (module-pin unaffected); the Backup-success KPI is
// present with NO MEASURES edge (OQ-1). Requires the loopback stack up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedPlatformOpsPreconditions } from "./helpers/platform-ops-fixtures";

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

// KPI name → the metric name it MEASURES (per the frozen roster).
const LINKED: Record<string, string> = {
  "Fleet uptime": "Uptime",
  MTTR: "MTTR",
  "Deploy frequency": "Deploy Frequency",
  "Error budget burn": "Uptime", // OQ-1 — error budget = 1 − uptime
};

async function kpiId(name: string): Promise<string> {
  const res = await cypher(
    `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
     WHERE d.attributes_json CONTAINS 'platform_ops'
     MATCH (k:KPI {name:$name}) WHERE k.domain_id = d.id RETURN k.id AS id LIMIT 1`,
    { name },
  );
  return String(res.rows[0]!.id);
}

describe("integration: platform-ops KPI MEASURES (AC-08)", () => {
  beforeAll(async () => {
    await seedPlatformOpsPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-08: each linked KPI has exactly one MEASURES edge to the expected roster metric", async () => {
    for (const [name, metric] of Object.entries(LINKED)) {
      const res = await cypher(
        `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
         WHERE d.attributes_json CONTAINS 'platform_ops'
         MATCH (k:KPI {name:$name})-[m:MEASURES]->(md:MetricDefinition)
         WHERE k.domain_id = d.id
         RETURN count(m) AS n, collect(md.name)[0] AS metric`,
        { name },
      );
      expect(num(res.rows[0]!.n)).toBe(1);
      expect(String(res.rows[0]!.metric)).toBe(metric);
    }
  });

  test("AC-08: the Backup-success KPI is present with NO MEASURES edge (OQ-1)", async () => {
    const res = await cypher(
      `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
       WHERE d.attributes_json CONTAINS 'platform_ops'
       MATCH (k:KPI {name:"Backup success rate"}) WHERE k.domain_id = d.id
       OPTIONAL MATCH (k)-[m:MEASURES]->()
       RETURN count(DISTINCT k) AS kpis, count(m) AS measures`,
    );
    expect(num(res.rows[0]!.kpis)).toBe(1);
    expect(num(res.rows[0]!.measures)).toBe(0);
  });

  test("AC-08: a fresh MEASURES write via POST /api/v1/edges returns 201, INSTANTIATES still 409", async () => {
    // A fresh KPI + metric to prove the MEASURES write returns 201 (not 409).
    const md = await cypher(`MATCH (m:MetricDefinition {name:"MTTR"}) RETURN m.id AS id`);
    const metricId = String(md.rows[0]!.id);
    const kpiRes = await fetch(`${BASE}/api/v1/kpis`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: `AC08 probe KPI ${Date.now()}`,
        category: "reliability",
        unit: "percent",
        target_value: 1,
        target_direction: "up",
        measurement_frequency: "daily",
      }),
    });
    const probeKpi = (await kpiRes.json()) as { id: string };

    const measures = await fetch(`${BASE}/api/v1/edges`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "MEASURES", fromId: probeKpi.id, toId: metricId }),
    });
    expect(measures.status).toBe(201);

    // A lifecycle INSTANTIATES write via /edges is still rejected 409 — the
    // module-pin edge + its guard are unaffected.
    const inst = await fetch(`${BASE}/api/v1/edges`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "INSTANTIATES", fromId: probeKpi.id, toId: metricId }),
    });
    expect(inst.status).toBe(409);
  });

  test("AC-08: sanity — the linked KPIs resolve to real ids", async () => {
    for (const name of Object.keys(LINKED)) {
      expect(await kpiId(name)).toBeTruthy();
    }
  });
});
