// customer-success-process-model T-04 (AC-01) — after the three seeds, the CS
// domain (IN_MODEL the operator root) contains exactly the five named journeys,
// each PART_OF it; a re-run adds zero (MERGE-on-id). Requires the loopback API +
// Neo4j + Postgres up + the two upstream seeds.

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

const EXPECTED_JOURNEYS = [
  "Onboarding",
  "Health Scoring",
  "Renewals",
  "Churn-Save",
  "Support Ticketing",
].sort();

describe("integration: customer-success journeys (AC-01)", () => {
  beforeAll(async () => {
    await seedCustomerSuccessPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-01: exactly one Customer Success domain, IN_MODEL the operator root", async () => {
    const res = await cypher(
      `MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel {name:"SaaS Operator"})
       WHERE d.attributes_json CONTAINS 'customer_success'
       RETURN count(d) AS n`,
    );
    expect(num(res.rows[0]!.n)).toBe(1);
  });

  test("AC-01: the five named journeys are each PART_OF the CS domain", async () => {
    const res = await cypher(
      `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)-[:IN_MODEL]->(m:BusinessModel {name:"SaaS Operator"})
       WHERE d.attributes_json CONTAINS 'customer_success'
       RETURN j.name AS name ORDER BY j.name`,
    );
    const names = res.rows.map((r) => String(r.name)).sort();
    expect(names).toEqual(EXPECTED_JOURNEYS);
  });

  test("AC-01: a re-run adds zero journeys (MERGE-on-id idempotency, NFR-02)", async () => {
    const before = await cypher(
      `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
       WHERE d.attributes_json CONTAINS 'customer_success' RETURN count(j) AS n`,
    );
    await seedCustomerSuccess(BASE);
    const after = await cypher(
      `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
       WHERE d.attributes_json CONTAINS 'customer_success' RETURN count(j) AS n`,
    );
    expect(num(after.rows[0]!.n)).toBe(num(before.rows[0]!.n));
    expect(num(after.rows[0]!.n)).toBe(5);
  });
});
