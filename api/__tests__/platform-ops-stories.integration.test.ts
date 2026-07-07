// platform-ops-process-model T-09 (AC-10) — ≥1 UserStory per journey (5) via
// POST /api/v1/models/:modelId/stories, each DESCRIBES_ACTIVITY one of this
// slice's activities (passing the scope check), each with ≥2 AcceptanceCriterion
// carrying non-empty given/when/then. Requires the loopback stack up.

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

describe("integration: platform-ops stories + ACs (AC-10)", () => {
  beforeAll(async () => {
    await seedPlatformOpsPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-10: ≥1 UserStory per journey (5), each DESCRIBES_ACTIVITY a slice activity", async () => {
    const res = await cypher(
      `MATCH (s:UserStory)-[:DESCRIBES_ACTIVITY]->(a:Activity)-[:PART_OF]->(j:UserJourney)-[:PART_OF]->(d:Domain)
       WHERE d.attributes_json CONTAINS 'platform_ops'
       RETURN j.name AS journey, count(DISTINCT s) AS stories ORDER BY j.name`,
    );
    expect(res.rows.length).toBe(5);
    for (const row of res.rows) {
      expect(num(row.stories)).toBeGreaterThanOrEqual(1);
    }
  });

  test("AC-10: each slice story has ≥2 ACs with non-empty given/when/then", async () => {
    const res = await cypher(
      `MATCH (s:UserStory)-[:DESCRIBES_ACTIVITY]->(a:Activity)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d:Domain)
       WHERE d.attributes_json CONTAINS 'platform_ops'
       MATCH (ac:AcceptanceCriterion)-[:ACCEPTANCE_OF]->(s)
       WHERE ac.given <> '' AND ac.\`when\` <> '' AND ac.\`then\` <> ''
       RETURN s.id AS id, count(ac) AS acs`,
    );
    expect(res.rows.length).toBeGreaterThanOrEqual(5);
    for (const row of res.rows) {
      expect(num(row.acs)).toBeGreaterThanOrEqual(2);
    }
  });
});
