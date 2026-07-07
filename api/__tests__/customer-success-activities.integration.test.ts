// customer-success-process-model T-04 (AC-02) — each CS journey has its §4.2
// activities (Activity PART_OF UserJourney), the seeded activity set equals the
// design-frozen roster exactly (no missing/extra), and PRECEDES ordering exists
// where §4.2 specifies it. Requires the loopback stack + the two upstream seeds.

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

// The design-frozen §4.2 activity roster (22 activities across five journeys).
const EXPECTED_ACTIVITIES = [
  "Kickoff call",
  "Environment provisioning verification",
  "Data migration validation",
  "Admin training",
  "Go-live sign-off",
  "Ingest usage/adoption signals",
  "Compute health score",
  "Flag at-risk accounts",
  "Trigger playbook",
  "Renewal forecast",
  "Renewal outreach",
  "Contract negotiation",
  "Renewal close/expansion",
  "Churn-risk detection",
  "Save-play execution",
  "Executive escalation",
  "Win-back offer",
  "Ticket intake/triage",
  "First-response",
  "Resolution",
  "Escalation to engineering",
  "CSAT survey",
].sort();

describe("integration: customer-success activities (AC-02)", () => {
  beforeAll(async () => {
    await seedCustomerSuccessPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-02: the seeded CS activity set equals the frozen roster exactly", async () => {
    const res = await cypher(
      `MATCH (a:Activity)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
       WHERE d.attributes_json CONTAINS 'customer_success'
       RETURN DISTINCT a.name AS name ORDER BY a.name`,
    );
    const names = res.rows.map((r) => String(r.name)).sort();
    expect(names).toEqual(EXPECTED_ACTIVITIES);
  });

  test("AC-02: every CS activity is PART_OF exactly one CS journey", async () => {
    const res = await cypher(
      `MATCH (a:Activity)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
       WHERE d.attributes_json CONTAINS 'customer_success'
       RETURN count(a) AS n`,
    );
    expect(num(res.rows[0]!.n)).toBe(22);
  });

  test("AC-02: PRECEDES ordering exists within journeys (17 ordered edges)", async () => {
    const res = await cypher(
      `MATCH (a:Activity)-[p:PRECEDES]->(b:Activity)
       MATCH (a)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
       WHERE d.attributes_json CONTAINS 'customer_success'
       RETURN count(p) AS n`,
    );
    expect(num(res.rows[0]!.n)).toBe(17);
  });
});
