// customer-success-process-model T-11 (AC-13) — running seed:customer-success
// twice yields zero net new nodes/edges/rows; the retail Business Model #1
// subgraph is unchanged; the cross-boundary edges (journey→domain PART_OF,
// activity→shared-system USES_SYSTEM, shared-role→activity EXECUTES) + KPI
// MEASURES + SLA/risk/story/capability counts are net-zero on the second run.
// Requires the loopback stack (Neo4j + Postgres) + the two upstream seeds.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedCustomerSuccessPreconditions, seedCustomerSuccess } from "./helpers/customer-success-fixtures";

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

async function count(statement: string, params: Record<string, unknown> = {}): Promise<number> {
  return num((await cypher(statement, params)).rows[0]!.n);
}

const NODES = `MATCH (n) RETURN count(n) AS n`;
const EDGES = `MATCH ()-[r]->() RETURN count(r) AS n`;
const RETAIL = `MATCH (m:BusinessModel {isReference:true})
                OPTIONAL MATCH (d:Domain)-[:IN_MODEL]->(m)
                OPTIONAL MATCH (d)<-[:PART_OF*0..]-(x)
                RETURN count(DISTINCT x) AS n`;
const JD_PART_OF = `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)
                    WHERE d.attributes_json CONTAINS 'customer_success' RETURN count(*) AS n`;
const USES_SHARED = `MATCH (a:Activity)-[:USES_SYSTEM]->(s:System)
                     WHERE a.id STARTS WITH '018f0400' AND s.operatorSeedKey IS NOT NULL
                     RETURN count(*) AS n`;
const SHARED_EXEC = `MATCH (r:Role)-[:EXECUTES]->(a:Activity)
                     WHERE r.operatorSeedKey IS NOT NULL AND a.id STARTS WITH '018f0400'
                     RETURN count(*) AS n`;
const MEASURES = `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
                  WHERE d.attributes_json CONTAINS 'customer_success'
                  MATCH (k:KPI)-[m:MEASURES]->() WHERE k.domain_id = d.id RETURN count(m) AS n`;
const CS_CAPS = `MATCH (c:Capability)-[:CAPABILITY_IN_MODEL]->(m:BusinessModel {name:"SaaS Operator"})
  WHERE m.attributes_json CONTAINS 'saasOperatorRoot' AND c.name IN
  ['Health-signal ingestion','Health-score computation','Ticket routing','Renewal forecasting']
  RETURN count(c) AS n`;

async function csRiskCount(): Promise<number> {
  const res = await fetch(
    `${BASE}/api/v1/risk-register?domain=${encodeURIComponent("Customer Success")}`,
  );
  const body = (await res.json()) as { data?: Array<{ name?: string }> };
  const names = new Set([
    "Net Churn / Retention Risk",
    "Support SLA Breach Risk",
    "Onboarding Failure Risk",
  ]);
  return (body.data ?? []).filter((r) => r.name && names.has(r.name)).length;
}

describe("integration: customer-success seed idempotency + retail isolation (AC-13)", () => {
  beforeAll(async () => {
    await seedCustomerSuccessPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-13: a second full run is net-zero (global nodes/edges + retail unchanged)", async () => {
    const before = {
      nodes: await count(NODES),
      edges: await count(EDGES),
      retail: await count(RETAIL),
    };
    await seedCustomerSuccess(BASE); // the second run
    expect(await count(NODES)).toBe(before.nodes);
    expect(await count(EDGES)).toBe(before.edges);
    expect(await count(RETAIL)).toBe(before.retail); // retail isolation (NFR-02)
  });

  test("AC-13: cross-boundary + governed counts are net-zero on the second run", async () => {
    const before = {
      jd: await count(JD_PART_OF),
      uses: await count(USES_SHARED),
      exec: await count(SHARED_EXEC),
      measures: await count(MEASURES),
      caps: await count(CS_CAPS),
      risks: await csRiskCount(),
    };
    await seedCustomerSuccess(BASE);
    expect(await count(JD_PART_OF)).toBe(before.jd);
    expect(await count(USES_SHARED)).toBe(before.uses);
    expect(await count(SHARED_EXEC)).toBe(before.exec);
    expect(await count(MEASURES)).toBe(before.measures);
    expect(await count(CS_CAPS)).toBe(before.caps);
    expect(await csRiskCount()).toBe(before.risks);

    // Sanity anchors.
    expect(before.jd).toBe(5); // five journey→domain PART_OF
    expect(before.exec).toBe(3); // three shared-role→activity EXECUTES
    expect(before.measures).toBe(4); // four retention KPI MEASURES
    expect(before.caps).toBe(4); // four CS capabilities
    expect(before.risks).toBe(3); // three CS risks
  });
});
