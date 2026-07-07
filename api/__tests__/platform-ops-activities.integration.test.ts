// platform-ops-process-model T-09 (AC-02) — each journey has 4–7 Activity
// PART_OF it; an ordered PRECEDES chain exists first→last per journey; the
// Deploy/release journey includes a Rollback branch. Requires the loopback
// stack up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedPlatformOpsPreconditions } from "./helpers/platform-ops-fixtures";

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

describe("integration: platform-ops activities (AC-02)", () => {
  beforeAll(async () => {
    await seedPlatformOpsPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-02: each journey has 4–7 activities PART_OF it", async () => {
    const res = await cypher(
      `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)
       WHERE d.attributes_json CONTAINS 'platform_ops'
       OPTIONAL MATCH (a:Activity)-[:PART_OF]->(j)
       RETURN j.name AS name, count(a) AS n ORDER BY j.name`,
    );
    expect(res.rows.length).toBe(5);
    for (const row of res.rows) {
      const n = num(row.n);
      expect(n).toBeGreaterThanOrEqual(4);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  test("AC-02: an ordered PRECEDES path exists first→last per journey", async () => {
    // Each journey has a first activity (no in-journey predecessor) reaching a
    // last activity (no in-journey successor) over PRECEDES.
    const res = await cypher(
      `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)
       WHERE d.attributes_json CONTAINS 'platform_ops'
       MATCH (first:Activity)-[:PART_OF]->(j)
       WHERE NOT ( (:Activity)-[:PRECEDES]->(first) AND (first)-[:PART_OF]->(j) )
       MATCH (last:Activity)-[:PART_OF]->(j)
       WHERE NOT ( (last)-[:PRECEDES]->(:Activity) )
       MATCH path = (first)-[:PRECEDES*]->(last)
       RETURN DISTINCT j.name AS name`,
    );
    const named = new Set(res.rows.map((r) => String(r.name)));
    // At least the five journeys have a first→last PRECEDES path.
    expect(named.size).toBeGreaterThanOrEqual(5);
  });

  test("AC-02: Deploy/release has a Rollback branch reachable via PRECEDES", async () => {
    const res = await cypher(
      `MATCH (rb:Activity {name:"Rollback"})-[:PART_OF]->(j:UserJourney {name:"Deploy / release"})
       MATCH (a:Activity)-[:PRECEDES]->(rb)
       RETURN count(DISTINCT a) AS n`,
    );
    expect(num(res.rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });
});
