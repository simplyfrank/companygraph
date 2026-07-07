// marketing-process-model T-12 (AC-02) — every Marketing Activity is PART_OF
// its journey; PRECEDES chains resolve with no dangle; envelope present.
// Requires the loopback stack up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedSaasOperator } from "../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedMarketing } from "../scripts/seed-marketing";

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

// Marketing activities are scoped as those PART_OF a journey PART_OF the
// Marketing domain.
const MARKETING_ACTIVITY_SCOPE = `
  MATCH (a:Activity)-[:PART_OF]->(j:UserJourney)-[:PART_OF]->(d:Domain)
  WHERE d.attributes_json CONTAINS '"seedKey":"marketing"'`;

describe("integration: marketing activities (AC-02)", () => {
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedMarketing(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-02: every Marketing activity is PART_OF a journey (>= 20 activities)", async () => {
    const res = await cypher(`${MARKETING_ACTIVITY_SCOPE} RETURN count(DISTINCT a) AS n`);
    expect(num(res.rows[0]!.n)).toBeGreaterThanOrEqual(20);
  });

  test("AC-02: each activity carries the standard node envelope", async () => {
    const res = await cypher(`${MARKETING_ACTIVITY_SCOPE} RETURN a.id AS id, a.name AS name, a.description AS description`);
    for (const r of res.rows) {
      expect(String(r.id).length).toBeGreaterThan(0);
      expect(String(r.name).length).toBeGreaterThan(0);
      expect(String(r.description).length).toBeGreaterThan(0);
    }
  });

  test("AC-02: intra-journey PRECEDES chains resolve with no dangling endpoint", async () => {
    // Every PRECEDES whose from-activity is a Marketing activity must have a
    // to-activity that is also a Marketing activity (no dangle out of scope).
    const res = await cypher(`
      MATCH (a:Activity)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d:Domain)
      WHERE d.attributes_json CONTAINS '"seedKey":"marketing"'
      MATCH (a)-[:PRECEDES]->(b:Activity)
      OPTIONAL MATCH (b)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d2:Domain)
      WHERE d2.attributes_json CONTAINS '"seedKey":"marketing"'
      RETURN count(*) AS total, count(d2) AS resolved`);
    const total = num(res.rows[0]!.total);
    const resolved = num(res.rows[0]!.resolved);
    expect(total).toBeGreaterThan(0);
    expect(resolved).toBe(total);
  });
});
