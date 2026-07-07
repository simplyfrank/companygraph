// product-delivery-process-model T-12 (AC-02) — exactly the three frozen
// UserJourney nodes exist under the Product & Delivery domain, each PART_OF it,
// each with a UUIDv7 id; the roster (T-01) is internally consistent (unique
// seedKeys + strict UUIDv7 ids). Requires the loopback API + Neo4j + Postgres
// up (the seed chain runs in beforeAll).

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedSaasOperator } from "../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedProductDelivery } from "../scripts/seed-product-delivery";
import {
  SEED_KEYS,
  JOURNEY_ROWS,
  ACTIVITY_ROWS,
  ROLE_ROWS,
  SYSTEM_ROWS,
  KPI_ROWS,
  STORY_ROWS,
  CAPABILITY_ROWS,
  RISK_ROWS,
} from "../src/seed/product-delivery/rosters";

const BASE = "http://127.0.0.1:8787";
const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function cypher(statement: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${BASE}/api/v1/query/cypher`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ statement, params }),
  });
  return (await res.json()) as { rows: Array<Record<string, unknown>> };
}

const EXPECTED_JOURNEYS = JOURNEY_ROWS.map((j) => j.name).sort();

describe("integration: product-delivery journeys (AC-02)", () => {
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedProductDelivery(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("T-01 roster: seedKeys + UUIDv7 ids are unique and well-formed", () => {
    const keys = Object.keys(SEED_KEYS);
    const ids = Object.values(SEED_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(UUIDV7.test(id)).toBe(true);
    // Rosters are the frozen §4 sets.
    expect(JOURNEY_ROWS.length).toBe(3);
    expect(ACTIVITY_ROWS.length).toBe(11);
    expect(ROLE_ROWS.length).toBe(4);
    expect(SYSTEM_ROWS.length).toBe(6);
    expect(KPI_ROWS.length).toBe(4);
    expect(STORY_ROWS.length).toBe(3);
    expect(CAPABILITY_ROWS.length).toBe(3);
    expect(RISK_ROWS.length).toBe(3);
  });

  test("AC-02: exactly the three journeys are PART_OF the product_delivery domain", async () => {
    const res = await cypher(
      `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)-[:IN_MODEL]->(m:BusinessModel {name:"SaaS Operator"})
       WHERE d.attributes_json CONTAINS 'product_delivery'
       RETURN j.name AS name, j.id AS id ORDER BY j.name`,
    );
    const rows = res.rows;
    expect(rows.map((r) => String(r.name)).sort()).toEqual(EXPECTED_JOURNEYS);
    for (const r of rows) expect(UUIDV7.test(String(r.id))).toBe(true);
  });

  test("AC-02: each journey resolves by attributes.seedKey", async () => {
    for (const j of JOURNEY_ROWS) {
      const res = await cypher(
        `MATCH (j:UserJourney) WHERE j.attributes_json CONTAINS $seedKey RETURN j.name AS name`,
        { seedKey: j.seedKey },
      );
      expect(res.rows.some((r) => String(r.name) === j.name)).toBe(true);
    }
  });
});
