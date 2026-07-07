// marketing-process-model T-16 (AC-17) — for every Mapping-Table row
// M-01…M-17, assert the named label(s)/edge(s) is instantiated by >=1 seeded
// node/edge/row after the full seed. M-12/M-13 (funnel) are gated on the
// funnel-pipeline-modeling construct being shipped. Requires the stack up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedSaasOperator } from "../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedFunnelPipeline } from "../scripts/seed-funnel-pipeline";
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

const MK = `'"seedKey":"marketing"'`; // Marketing domain seedKey marker

async function countGraph(label: string, where = ""): Promise<number> {
  const r = await cypher(`MATCH (n:${label}) ${where} RETURN count(n) AS n`);
  return num(r.rows[0]!.n);
}

describe("integration: marketing mapping-table coverage (AC-17)", () => {
  let funnelReady = false;
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    // Register the funnel construct before seedMarketing (§7 order) so the
    // funnel step seeds assertively now that funnel-pipeline-modeling shipped.
    await seedFunnelPipeline(BASE);
    await seedMarketing(BASE);
    const res = await fetch(`${BASE}/api/v1/funnels/transitions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    funnelReady = res.status !== 404;
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("M-01: Marketing Domain scoped IN_MODEL to the operator root", async () => {
    const r = await cypher(
      `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"}) WHERE d.attributes_json CONTAINS '"seedKey":"marketing"' RETURN count(d) AS n`,
    );
    expect(num(r.rows[0]!.n)).toBe(1);
  });

  test("M-02: UserJourney PART_OF Domain", async () => {
    const r = await cypher(
      `MATCH (:UserJourney)-[:PART_OF]->(d:Domain) WHERE d.attributes_json CONTAINS '"seedKey":"marketing"' RETURN count(*) AS n`,
    );
    expect(num(r.rows[0]!.n)).toBe(5);
  });

  test("M-03/M-04: Activity PART_OF UserJourney + PRECEDES chains", async () => {
    const partOf = await cypher(
      `MATCH (:Activity)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d:Domain) WHERE d.attributes_json CONTAINS '"seedKey":"marketing"' RETURN count(*) AS n`,
    );
    expect(num(partOf.rows[0]!.n)).toBeGreaterThanOrEqual(20);
    const precedes = await cypher(
      `MATCH (a:Activity)-[:PRECEDES]->(:Activity), (a)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d:Domain) WHERE d.attributes_json CONTAINS '"seedKey":"marketing"' RETURN count(*) AS n`,
    );
    expect(num(precedes.rows[0]!.n)).toBeGreaterThan(0);
  });

  test("M-05: Role EXECUTES Activity", async () => {
    const r = await cypher(
      `MATCH (:Role)-[:EXECUTES]->(:Activity)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d:Domain) WHERE d.attributes_json CONTAINS '"seedKey":"marketing"' RETURN count(*) AS n`,
    );
    expect(num(r.rows[0]!.n)).toBeGreaterThan(0);
  });

  test("M-06: Persona PERFORMS_AS Role + PARTICIPATES_IN UserJourney (N-03)", async () => {
    const performs = await cypher(
      `MATCH (p:Persona)-[:PERFORMS_AS]->(:Role) WHERE p.attributes_json CONTAINS '"seedKey":"marketing-function-owner"' RETURN count(*) AS n`,
    );
    expect(num(performs.rows[0]!.n)).toBeGreaterThanOrEqual(1);
    const participates = await cypher(
      `MATCH (p:Persona)-[:PARTICIPATES_IN]->(:UserJourney) WHERE p.attributes_json CONTAINS '"seedKey":"marketing-function-owner"' RETURN count(*) AS n`,
    );
    expect(num(participates.rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });

  test("M-07/M-08: System USES_SYSTEM + INTEGRATES_WITH", async () => {
    const uses = await cypher(
      `MATCH (:Activity)-[:USES_SYSTEM]->(:System), (:Activity)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d:Domain) WHERE d.attributes_json CONTAINS '"seedKey":"marketing"' RETURN count(*) AS n`,
    );
    expect(num(uses.rows[0]!.n)).toBeGreaterThan(0);
    const integrates = await cypher(
      `MATCH (a:System)-[:INTEGRATES_WITH]->(:System) WHERE a.attributes_json CONTAINS '"seedKey":"map"' RETURN count(*) AS n`,
    );
    expect(num(integrates.rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });

  test("M-09: KPI nodes exist", async () => {
    const r = await cypher(
      `MATCH (k:KPI) WHERE k.name IN ["CAC (marketing-attributed)","MQL→SQL Conversion Rate","CPL (cost per lead)","Cost per MQL","Marketing-Sourced Pipeline","Lead Volume"] RETURN count(k) AS n`,
    );
    expect(num(r.rows[0]!.n)).toBe(6);
  });

  test("M-10: KPI MEASURES MetricDefinition (the two grounded KPIs)", async () => {
    const r = await cypher(`MATCH (:KPI)-[:MEASURES]->(:MetricDefinition) RETURN count(*) AS n`);
    expect(num(r.rows[0]!.n)).toBeGreaterThanOrEqual(2);
  });

  test("M-11: KPI ALIGNED_TO structure + a PARAM_BINDS", async () => {
    const aligned = await cypher(`MATCH (:KPI)-[:ALIGNED_TO]->() RETURN count(*) AS n`);
    expect(num(aligned.rows[0]!.n)).toBeGreaterThanOrEqual(6);
    const bound = await cypher(`MATCH (:KPI {name:"Lead Volume"})-[:PARAM_BINDS]->(:Activity) RETURN count(*) AS n`);
    expect(num(bound.rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });

  test("M-12/M-13: Funnel/Stage HAS_STAGE + CONVERTS_TO (gated on funnel construct)", async () => {
    if (!funnelReady) {
      console.warn("[marketing-mapping-coverage] SKIP M-12/M-13 — funnel-pipeline-modeling construct not shipped");
      return;
    }
    const hasStage = await cypher(`MATCH (:Funnel {name:"Marketing Demand Funnel"})-[:HAS_STAGE]->(:Stage) RETURN count(*) AS n`);
    expect(num(hasStage.rows[0]!.n)).toBe(4);
    // Scope CONVERTS_TO to the Marketing Demand Funnel's own stages so a
    // co-resident funnel (e.g. sales) does not affect the count.
    const converts = await cypher(
      `MATCH (:Funnel {name:"Marketing Demand Funnel"})-[:HAS_STAGE]->(:Stage)-[:CONVERTS_TO]->(:Stage) RETURN count(*) AS n`,
    );
    expect(num(converts.rows[0]!.n)).toBeGreaterThanOrEqual(3);
  });

  test("M-14/M-15: UserStory DESCRIBES_ACTIVITY + AcceptanceCriterion ACCEPTANCE_OF", async () => {
    const stories = await cypher(
      `MATCH (:UserStory)-[:DESCRIBES_ACTIVITY]->(:Activity)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d:Domain) WHERE d.attributes_json CONTAINS '"seedKey":"marketing"' RETURN count(DISTINCT (d)) AS n`,
    );
    expect(num(stories.rows[0]!.n)).toBeGreaterThanOrEqual(1);
    const acs = await cypher(
      `MATCH (:AcceptanceCriterion)-[:ACCEPTANCE_OF]->(st:UserStory)-[:DESCRIBES_ACTIVITY]->(:Activity)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d:Domain) WHERE d.attributes_json CONTAINS '"seedKey":"marketing"' RETURN count(*) AS n`,
    );
    expect(num(acs.rows[0]!.n)).toBeGreaterThanOrEqual(5);
  });

  test("M-16: Marketing risk rows in risk_register (Postgres)", async () => {
    const res = await fetch(`${BASE}/api/v1/risk-register?domain=Marketing`);
    const body = (await res.json()) as { data?: unknown[] };
    expect((body.data ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test("M-17: Capability CAPABILITY_IN_MODEL + NEEDS_CAPABILITY + SUPPORTED_BY", async () => {
    const inModel = await cypher(
      `MATCH (:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {name:"SaaS Operator"}) RETURN count(*) AS n`,
    );
    expect(num(inModel.rows[0]!.n)).toBeGreaterThanOrEqual(3);
    const needs = await cypher(`MATCH (:Activity)-[:NEEDS_CAPABILITY]->(:Capability) RETURN count(*) AS n`);
    expect(num(needs.rows[0]!.n)).toBeGreaterThanOrEqual(1);
    const supported = await cypher(`MATCH (:Capability)-[:SUPPORTED_BY]->(:System) RETURN count(*) AS n`);
    expect(num(supported.rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });
});
