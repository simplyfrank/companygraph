// product-delivery-process-model T-12 (AC-04) — every Product Activity is
// executed by ≥1 Role; slice-local roles are created in the slice, the
// resolve-or-create role reuses an existing :Role (no duplicate); a re-run adds
// no duplicate. Requires the loopback API + Neo4j + Postgres up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedSaasOperator } from "../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedProductDelivery } from "../scripts/seed-product-delivery";
import { ACTIVITY_ROWS, ROLE_ROWS } from "../src/seed/product-delivery/rosters";

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

describe("integration: product-delivery roles (AC-04)", () => {
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedProductDelivery(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-04: every Product activity has ≥1 EXECUTES from a Role", async () => {
    for (const a of ACTIVITY_ROWS) {
      const res = await cypher(
        `MATCH (r:Role)-[:EXECUTES]->(x:Activity)
         WHERE x.attributes_json CONTAINS $seedKey
         RETURN count(r) AS n`,
        { seedKey: a.seedKey },
      );
      expect(num(res.rows[0]?.n)).toBeGreaterThanOrEqual(1);
    }
  });

  test("AC-04: re-run adds no duplicate Software Engineer role", async () => {
    await seedProductDelivery(BASE); // idempotent re-run
    const res = await cypher(
      `MATCH (r:Role {name:"Software Engineer"}) RETURN count(r) AS n`,
    );
    expect(num(res.rows[0]?.n)).toBe(1);
  });

  test("AC-04: each slice-local role exists exactly once, resolved by seedKey", async () => {
    for (const role of ROLE_ROWS.filter((r) => r.origin === "slice-local")) {
      const res = await cypher(
        `MATCH (r:Role) WHERE r.attributes_json CONTAINS $seedKey RETURN count(r) AS n`,
        { seedKey: role.seedKey },
      );
      expect(num(res.rows[0]?.n)).toBe(1);
    }
  });
});
