// product-delivery-process-model T-03/T-10 (AC-01) — the seed resolves the
// Product & Delivery domain by attributes.seedKey and attaches journeys under it
// via PART_OF; the fail-fast guards throw (and write nothing) when a dependency
// is unseeded. Requires the loopback API + Neo4j + Postgres up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedSaasOperator } from "../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedProductDelivery } from "../scripts/seed-product-delivery";
import {
  resolveContext,
  assertFixtureLoaded,
  type Context,
} from "../src/seed/product-delivery/context";

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

describe("integration: product-delivery scope + fail-fast (AC-01)", () => {
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedProductDelivery(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-01: resolveContext resolves the product_delivery domain by seedKey", async () => {
    const context = await resolveContext(BASE);
    expect(typeof context.domainId).toBe("string");
    expect(context.domainId.length).toBeGreaterThan(0);
    // the domain resolves by its seedKey
    const res = await cypher(
      `MATCH (d:Domain {id:$id}) RETURN d.attributes_json AS a`,
      { id: context.domainId },
    );
    expect(String(res.rows[0]?.a)).toContain("product_delivery");
    // all three fixture journeys resolved by seedKey
    for (const key of [
      "pd-journey-roadmap",
      "pd-journey-delivery",
      "pd-journey-analytics",
    ]) {
      expect(typeof context.fixtureNodeIds[key]).toBe("string");
    }
  });

  test("AC-01: journeys are PART_OF the resolved domain", async () => {
    const context = await resolveContext(BASE);
    const res = await cypher(
      `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain {id:$id}) RETURN count(j) AS n`,
      { id: context.domainId },
    );
    expect(num(res.rows[0]?.n)).toBe(3);
  });

  test("AC-01: assertFixtureLoaded throws when the fixture is not resolved (writes nothing)", () => {
    const empty: Context = {
      rootId: "x",
      domainId: "y",
      systemIds: {},
      roleIds: {},
      metricNodeIds: {},
      fixtureNodeIds: {},
    };
    expect(() => assertFixtureLoaded(empty)).toThrow(/product_fixture_not_loaded/);
  });
});
