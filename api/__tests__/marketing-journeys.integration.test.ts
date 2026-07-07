// marketing-process-model T-03/T-12 (AC-01) — the five Marketing journeys
// are PART_OF the seedKey="marketing" domain. Requires the loopback stack up.

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

const JOURNEY_NAMES = [
  "Content Operations",
  "Campaign → Lead Capture",
  "MQL Scoring & Handoff",
  "Webinars & Events",
  "Account-Based Marketing (ABM)",
];

describe("integration: marketing journeys (AC-01)", () => {
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedMarketing(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-01: five journeys are PART_OF the seedKey=marketing domain", async () => {
    const res = await cypher(
      `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)
       WHERE d.attributes_json CONTAINS '"seedKey":"marketing"'
       RETURN j.name AS name ORDER BY j.name`,
    );
    const names = res.rows.map((r) => String(r.name)).sort();
    expect(names).toEqual([...JOURNEY_NAMES].sort());
  });

  test("AC-01: each journey carries the standard node envelope", async () => {
    const res = await cypher(
      `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)
       WHERE d.attributes_json CONTAINS '"seedKey":"marketing"'
       RETURN j.id AS id, j.name AS name, j.description AS description`,
    );
    expect(res.rows.length).toBe(5);
    for (const r of res.rows) {
      expect(String(r.id).length).toBeGreaterThan(0);
      expect(String(r.name).length).toBeGreaterThan(0);
      expect(String(r.description).length).toBeGreaterThan(0);
    }
  });

  test("AC-01: exactly one Marketing domain (no duplicate)", async () => {
    const res = await cypher(
      `MATCH (d:Domain) WHERE d.attributes_json CONTAINS '"seedKey":"marketing"' RETURN count(d) AS n`,
    );
    expect(num(res.rows[0]!.n)).toBe(1);
  });
});
