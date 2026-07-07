// customer-success-process-model T-04 (AC-04) — USES_SYSTEM links exist; shared
// systems (moms/crm/data_warehouse/pagerduty) are referenced (not re-created);
// CS-specific systems carry attributes.systemKind; a re-run adds no duplicate.
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

describe("integration: customer-success systems (AC-04)", () => {
  beforeAll(async () => {
    await seedCustomerSuccessPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-04: CS activities link Activity USES_SYSTEM System", async () => {
    const res = await cypher(
      `MATCH (a:Activity)-[:USES_SYSTEM]->(s:System)
       MATCH (a)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
       WHERE d.attributes_json CONTAINS 'customer_success'
       RETURN count(*) AS n`,
    );
    expect(num(res.rows[0]!.n)).toBeGreaterThan(0);
  });

  test("AC-04: shared systems exist exactly once (referenced, not re-created)", async () => {
    const res = await cypher(
      `MATCH (s:System) WHERE s.operatorSeedKey IN ['moms','crm','data_warehouse','pagerduty']
       RETURN s.operatorSeedKey AS k, count(s) AS n ORDER BY k`,
    );
    for (const row of res.rows) expect(num(row.n)).toBe(1);
    expect(res.rows.length).toBe(4);
  });

  test("AC-04: the two CS-specific systems carry attributes.systemKind", async () => {
    const res = await cypher(
      `MATCH (s:System) WHERE s.attributes_json CONTAINS 'customer-success-system-'
       RETURN s.name AS name, s.attributes_json AS a ORDER BY name`,
    );
    const names = res.rows.map((r) => String(r.name)).sort();
    expect(names).toEqual(["CS Platform", "Support/Ticketing System"]);
    for (const row of res.rows) {
      const attrs = JSON.parse(String(row.a));
      expect(attrs.systemKind).toBe("functional");
    }
  });

  test("AC-04: a re-run adds no duplicate system", async () => {
    const q = `MATCH (s:System)
       WHERE s.operatorSeedKey IN ['moms','crm','data_warehouse','pagerduty']
          OR s.attributes_json CONTAINS 'customer-success-system-'
       RETURN count(s) AS n`;
    const before = await cypher(q);
    await seedCustomerSuccess(BASE);
    const after = await cypher(q);
    expect(num(after.rows[0]!.n)).toBe(num(before.rows[0]!.n));
  });
});
