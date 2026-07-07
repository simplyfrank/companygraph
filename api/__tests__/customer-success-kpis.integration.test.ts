// customer-success-process-model T-05 (AC-05) — the four retention KPIs exist
// via POST /api/v1/kpis with domain_id = the CS domain id; a re-run adds zero
// (the (name, domain_id) guard, B-03). Requires the loopback stack + the two
// upstream seeds.

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

const RETENTION_KPIS = [
  "Net Revenue Retention",
  "Gross Revenue Retention",
  "Logo Churn",
  "Revenue Churn",
].sort();

describe("integration: customer-success KPIs (AC-05)", () => {
  beforeAll(async () => {
    await seedCustomerSuccessPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-05: the four retention KPIs exist with domain_id = the CS domain id", async () => {
    const res = await cypher(
      `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
       WHERE d.attributes_json CONTAINS 'customer_success'
       MATCH (k:KPI) WHERE k.domain_id = d.id AND k.archived_at IS NULL
         AND k.name IN ['Net Revenue Retention','Gross Revenue Retention','Logo Churn','Revenue Churn']
       RETURN k.name AS name ORDER BY k.name`,
    );
    const names = res.rows.map((r) => String(r.name)).sort();
    expect(names).toEqual(RETENTION_KPIS);
  });

  test("AC-05: each retention KPI exists exactly once (no duplicate)", async () => {
    for (const name of RETENTION_KPIS) {
      const res = await cypher(
        `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
         WHERE d.attributes_json CONTAINS 'customer_success'
         MATCH (k:KPI {name:$name}) WHERE k.domain_id = d.id AND k.archived_at IS NULL
         RETURN count(k) AS n`,
        { name },
      );
      expect(num(res.rows[0]!.n)).toBe(1);
    }
  });

  test("AC-05: a re-run adds zero KPIs (the (name, domain_id) guard)", async () => {
    const q = `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
       WHERE d.attributes_json CONTAINS 'customer_success'
       MATCH (k:KPI) WHERE k.domain_id = d.id AND k.archived_at IS NULL
       RETURN count(k) AS n`;
    const before = await cypher(q);
    await seedCustomerSuccess(BASE);
    const after = await cypher(q);
    expect(num(after.rows[0]!.n)).toBe(num(before.rows[0]!.n));
  });
});
