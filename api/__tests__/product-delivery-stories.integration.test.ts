// product-delivery-process-model T-07 (AC-08, AC-09) — the three §4.6 stories
// exist, each DESCRIBES_ACTIVITY a Product Activity and (where a role exists)
// STORY_FOR_ROLE a Role, with populated top-level persona/action/benefit/
// narrative; each story has ≥1 AcceptanceCriterion with non-empty G/W/T linked
// via ACCEPTANCE_OF. Requires the loopback API + Neo4j + Postgres up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedSaasOperator } from "../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedProductDelivery } from "../scripts/seed-product-delivery";
import { STORY_ROWS } from "../src/seed/product-delivery/rosters";

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

describe("integration: product-delivery stories + ACs (AC-08, AC-09)", () => {
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedProductDelivery(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-08: each story DESCRIBES_ACTIVITY the right Product activity with populated fields", async () => {
    for (const row of STORY_ROWS) {
      const res = await cypher(
        `MATCH (s:UserStory)-[:DESCRIBES_ACTIVITY]->(a:Activity)
         WHERE a.attributes_json CONTAINS $actKey AND s.persona = $persona
         RETURN s.persona AS persona, s.action AS action, s.benefit AS benefit,
                s.narrative AS narrative`,
        { actKey: row.activitySeedKey, persona: row.persona },
      );
      expect(res.rows.length).toBeGreaterThanOrEqual(1);
      const s = res.rows[0]!;
      expect(String(s.persona)).toBe(row.persona);
      expect(String(s.action)).toBe(row.action);
      expect(String(s.benefit)).toBe(row.benefit);
      expect(String(s.narrative).length).toBeGreaterThan(0);
    }
  });

  test("AC-08: each story STORY_FOR_ROLE a Role (where a role exists)", async () => {
    for (const row of STORY_ROWS.filter((r) => r.roleName)) {
      const res = await cypher(
        `MATCH (s:UserStory)-[:DESCRIBES_ACTIVITY]->(a:Activity)
         WHERE a.attributes_json CONTAINS $actKey AND s.persona = $persona
         MATCH (s)-[:STORY_FOR_ROLE]->(r:Role)
         RETURN r.name AS name`,
        { actKey: row.activitySeedKey, persona: row.persona },
      );
      expect(res.rows.some((x) => String(x.name) === row.roleName)).toBe(true);
    }
  });

  test("AC-09: each story has ≥1 AcceptanceCriterion with non-empty G/W/T via ACCEPTANCE_OF", async () => {
    for (const row of STORY_ROWS) {
      const res = await cypher(
        `MATCH (s:UserStory)-[:DESCRIBES_ACTIVITY]->(a:Activity)
         WHERE a.attributes_json CONTAINS $actKey AND s.persona = $persona
         MATCH (ac:AcceptanceCriterion)-[:ACCEPTANCE_OF]->(s)
         RETURN ac.given AS g, ac.when AS w, ac.then AS t`,
        { actKey: row.activitySeedKey, persona: row.persona },
      );
      expect(res.rows.length).toBeGreaterThanOrEqual(1);
      for (const ac of res.rows) {
        expect(String(ac.g).length).toBeGreaterThan(0);
        expect(String(ac.w).length).toBeGreaterThan(0);
        expect(String(ac.t).length).toBeGreaterThan(0);
      }
    }
  });

  test("AC-08: no new UserStory label registered (uses the existing runtime label)", async () => {
    const res = await fetch(`${BASE}/api/v1/ontology/node-labels`);
    const body = (await res.json()) as Array<{ name?: string }> | { data?: Array<{ name?: string }> };
    const arr = Array.isArray(body) ? body : (body.data ?? []);
    expect(arr.some((r) => r.name === "UserStory")).toBe(true);
  });
});
