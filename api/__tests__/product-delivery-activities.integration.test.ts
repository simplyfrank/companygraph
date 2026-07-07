// product-delivery-process-model T-12 (AC-03) — each journey's frozen Activity
// set exists PART_OF it, ordered by the §4.2 PRECEDES chain. Requires the
// loopback API + Neo4j + Postgres up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedSaasOperator } from "../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedProductDelivery } from "../scripts/seed-product-delivery";
import { ACTIVITY_ROWS, JOURNEY_ROWS } from "../src/seed/product-delivery/rosters";

const BASE = "http://127.0.0.1:8787";

async function cypher(statement: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${BASE}/api/v1/query/cypher`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ statement, params }),
  });
  return (await res.json()) as { rows: Array<Record<string, unknown>> };
}

// activity seedKey → name
function activityName(seedKey: string): string {
  return ACTIVITY_ROWS.find((a) => a.seedKey === seedKey)!.name;
}

describe("integration: product-delivery activities (AC-03)", () => {
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedProductDelivery(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-03: each journey has exactly its frozen activity set PART_OF it", async () => {
    for (const j of JOURNEY_ROWS) {
      const expected = ACTIVITY_ROWS.filter((a) => a.journeySeedKey === j.seedKey)
        .map((a) => a.name)
        .sort();
      const res = await cypher(
        `MATCH (a:Activity)-[:PART_OF]->(j:UserJourney)
         WHERE j.attributes_json CONTAINS $seedKey
         RETURN DISTINCT a.name AS name ORDER BY a.name`,
        { seedKey: j.seedKey },
      );
      expect(res.rows.map((r) => String(r.name)).sort()).toEqual(expected);
    }
  });

  test("AC-03: the PRECEDES chain matches the roster exactly", async () => {
    for (const a of ACTIVITY_ROWS) {
      if (!a.precedesSeedKey) continue;
      const res = await cypher(
        `MATCH (x:Activity)-[:PRECEDES]->(y:Activity)
         WHERE x.attributes_json CONTAINS $from AND y.attributes_json CONTAINS $to
         RETURN count(*) AS n`,
        { from: a.seedKey, to: a.precedesSeedKey },
      );
      const n = res.rows[0]?.n;
      const count =
        n && typeof n === "object" && "low" in (n as Record<string, unknown>)
          ? Number((n as { low: number }).low)
          : Number(n ?? 0);
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  test("AC-03: the distinct PRECEDES (from,to) pairs equal the roster chain exactly", async () => {
    // Count DISTINCT ordered pairs (parallel duplicate edges from prior imports
    // collapse) — the chain STRUCTURE, not raw edge count.
    const res = await cypher(
      `MATCH (x:Activity)-[:PRECEDES]->(y:Activity)
       WHERE x.attributes_json CONTAINS 'pd-act-' AND y.attributes_json CONTAINS 'pd-act-'
       RETURN count(DISTINCT [x.id, y.id]) AS n`,
    );
    const n = res.rows[0]?.n;
    const count =
      n && typeof n === "object" && "low" in (n as Record<string, unknown>)
        ? Number((n as { low: number }).low)
        : Number(n ?? 0);
    const declared = ACTIVITY_ROWS.filter((a) => a.precedesSeedKey).length;
    expect(count).toBe(declared);
    // sanity: names resolve
    expect(activityName("pd-act-intake")).toBe("Intake opportunity");
  });
});
