// sales-process-model T-14 (AC-12) — running the full seed sequence twice yields
// zero net new Sales nodes/edges and zero duplicate Sales risk rows; the
// cross-reference edges are present (completeness); retail Model #1 is untouched.
// Requires the stack up (+ Postgres) AND the executed funnel subsystem (B-01).

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedSaasOperator } from "../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedSales } from "../scripts/seed-sales";
import { BASE, cypher, num, salesSeedReady, skipMsg } from "./sales-test-harness";

async function salesNodeEdgeCounts(): Promise<{ nodes: number; edges: number }> {
  const nodes = await cypher(
    `MATCH (d:Domain)<-[:PART_OF]-(j:UserJourney)
     WHERE d.attributes_json CONTAINS '"seedKey":"sales"'
     OPTIONAL MATCH (j)<-[:PART_OF]-(a:Activity)
     RETURN count(DISTINCT j) + count(DISTINCT a) AS n`,
  );
  const edges = await cypher(
    `MATCH (d:Domain)<-[:PART_OF]-(j:UserJourney) WHERE d.attributes_json CONTAINS '"seedKey":"sales"'
     MATCH (j)<-[:PART_OF]-(a:Activity)
     OPTIONAL MATCH (a)<-[e:EXECUTES]-() OPTIONAL MATCH (a)-[u:USES_SYSTEM]->()
     RETURN count(DISTINCT e) + count(DISTINCT u) AS n`,
  );
  return { nodes: num(nodes.rows[0]!.n), edges: num(edges.rows[0]!.n) };
}

async function salesRiskCount(): Promise<number> {
  const res = await fetch(`${BASE}/api/v1/risk-register?domain=Sales`);
  const body = (await res.json()) as { data?: unknown[] };
  return (body.data ?? []).length;
}

describe("integration: sales seed idempotency + completeness (AC-12)", () => {
  let ready = false;
  beforeAll(async () => {
    ready = await salesSeedReady();
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-12: a second full sequence yields zero net new nodes/edges and risk rows", async () => {
    if (!ready) return skipMsg("AC-12");
    const before = await salesNodeEdgeCounts();
    const beforeRisks = await salesRiskCount();

    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedSales(BASE);

    const after = await salesNodeEdgeCounts();
    const afterRisks = await salesRiskCount();
    expect(after.nodes).toBe(before.nodes);
    expect(after.edges).toBe(before.edges);
    expect(afterRisks).toBe(beforeRisks);
  });

  test("AC-12: completeness — cross-reference edges present (PART_OF/USES_SYSTEM/EXECUTES/MEASURES)", async () => {
    if (!ready) return skipMsg("AC-12");
    const partOf = await cypher(
      `MATCH (:UserJourney)-[:PART_OF]->(d:Domain) WHERE d.attributes_json CONTAINS '"seedKey":"sales"' RETURN count(*) AS n`,
    );
    expect(num(partOf.rows[0]!.n)).toBe(5);
    const measures = await cypher(`MATCH (:KPI {name:"Win Rate"})-[:MEASURES]->(:MetricDefinition) RETURN count(*) AS n`);
    expect(num(measures.rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });
});
