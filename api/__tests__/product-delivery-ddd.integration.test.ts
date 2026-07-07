// product-delivery-process-model T-06 (AC-11) — each capability
// NEEDS_CAPABILITY←Activity, SUPPORTED_BY→System, CAPABILITY_IN_MODEL→operator
// root, ASSIGNED_TO_CONTEXT→the Product Delivery Context (UUIDv7
// 018f0200-0005-…001); the bounded-context read returns the context; a re-run is
// net-zero. Requires the loopback API + Neo4j + Postgres up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedSaasOperator } from "../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedProductDelivery } from "../scripts/seed-product-delivery";
import {
  CAPABILITY_ROWS,
  SEED_KEYS,
} from "../src/seed/product-delivery/rosters";

const BASE = "http://127.0.0.1:8787";
const BC_ID = SEED_KEYS["pd-bc-product-delivery"];

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

describe("integration: product-delivery DDD mapping (AC-11)", () => {
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedProductDelivery(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-11: the Product Delivery Context exists with its UUIDv7 id", async () => {
    const res = await cypher(
      `MATCH (bc:BoundedContext {id:$id}) RETURN bc.name AS name`,
      { id: BC_ID },
    );
    expect(res.rows.length).toBe(1);
    expect(String(res.rows[0]?.name)).toBe("Product Delivery Context");
  });

  test("AC-11: each capability has the full mapping", async () => {
    for (const cap of CAPABILITY_ROWS) {
      // NEEDS_CAPABILITY ← Activity
      const needed = await cypher(
        `MATCH (a:Activity)-[:NEEDS_CAPABILITY]->(c:Capability {name:$name})
         WHERE a.attributes_json CONTAINS $actKey RETURN count(*) AS n`,
        { name: cap.name, actKey: cap.neededByActivitySeedKey },
      );
      expect(num(needed.rows[0]?.n)).toBeGreaterThanOrEqual(1);

      // SUPPORTED_BY → System
      const supported = await cypher(
        `MATCH (c:Capability {name:$name})-[:SUPPORTED_BY]->(s:System)
         WHERE s.attributes_json CONTAINS $sysKey RETURN count(*) AS n`,
        { name: cap.name, sysKey: cap.supportedBySystemSeedKey },
      );
      expect(num(supported.rows[0]?.n)).toBeGreaterThanOrEqual(1);

      // CAPABILITY_IN_MODEL → operator root
      const inModel = await cypher(
        `MATCH (c:Capability {name:$name})-[:CAPABILITY_IN_MODEL]->(m:BusinessModel {name:"SaaS Operator"})
         RETURN count(*) AS n`,
        { name: cap.name },
      );
      expect(num(inModel.rows[0]?.n)).toBeGreaterThanOrEqual(1);

      // ASSIGNED_TO_CONTEXT → Product Delivery Context
      const ctx = await cypher(
        `MATCH (c:Capability {name:$name})-[:ASSIGNED_TO_CONTEXT]->(bc:BoundedContext {id:$id})
         RETURN count(*) AS n`,
        { name: cap.name, id: BC_ID },
      );
      expect(num(ctx.rows[0]?.n)).toBe(1);
    }
  });

  test("AC-11: a re-run is net-zero (each Product capability exists exactly once)", async () => {
    // Scope to THIS spec's capability names — other specs may concurrently
    // assign their own capabilities (the wave-2 fan-out shares the graph).
    const names = CAPABILITY_ROWS.map((c) => c.name);
    await seedProductDelivery(BASE); // idempotent re-run
    for (const name of names) {
      const res = await cypher(
        `MATCH (c:Capability {name:$name})-[:ASSIGNED_TO_CONTEXT]->(bc:BoundedContext {id:$id})
         MATCH (c)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
         RETURN count(c) AS n`,
        { name, id: BC_ID },
      );
      expect(num(res.rows[0]?.n)).toBe(1);
    }
  });
});
