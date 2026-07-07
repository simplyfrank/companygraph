// customer-success-process-model T-04 (AC-03) — every CS activity has ≥1 Role
// EXECUTES it; CS-specific roles MERGE-once on re-run; shared roles
// (customer_success_lead/owner) are referenced by resolved id, not duplicated.
// Requires the loopback stack + the two upstream seeds.

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

describe("integration: customer-success roles (AC-03)", () => {
  beforeAll(async () => {
    await seedCustomerSuccessPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-03: every CS activity has ≥1 Role EXECUTES it", async () => {
    const res = await cypher(
      `MATCH (a:Activity)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
       WHERE d.attributes_json CONTAINS 'customer_success'
       WITH a WHERE NOT ( (:Role)-[:EXECUTES]->(a) )
       RETURN count(a) AS unexecuted`,
    );
    expect(num(res.rows[0]!.unexecuted)).toBe(0);
  });

  test("AC-03: the shared CS role exists exactly once (referenced, not duplicated)", async () => {
    // The foundation catalog carries ONE customer-success :Role,
    // `customer_success_lead` ("Customer Success Owner" is a :Persona).
    const res = await cypher(
      `MATCH (r:Role) WHERE r.operatorSeedKey = 'customer_success_lead'
       RETURN count(r) AS n`,
    );
    expect(num(res.rows[0]!.n)).toBe(1);
  });

  test("AC-03: the four CS-specific roles exist exactly once each", async () => {
    const res = await cypher(
      `MATCH (r:Role) WHERE r.attributes_json CONTAINS 'customer-success-role-'
       RETURN r.name AS name, count(r) AS n ORDER BY name`,
    );
    const names = res.rows.map((r) => String(r.name)).sort();
    expect(names).toEqual([
      "Customer Success Manager",
      "Onboarding Specialist",
      "Renewals Manager",
      "Support Agent",
    ]);
    for (const row of res.rows) expect(num(row.n)).toBe(1);
  });

  test("AC-03: a re-run does not duplicate shared or CS-specific roles", async () => {
    const q = `MATCH (r:Role)
       WHERE r.operatorSeedKey = 'customer_success_lead'
          OR r.attributes_json CONTAINS 'customer-success-role-'
       RETURN count(r) AS n`;
    const before = await cypher(q);
    await seedCustomerSuccess(BASE);
    const after = await cypher(q);
    expect(num(after.rows[0]!.n)).toBe(num(before.rows[0]!.n));
  });
});
