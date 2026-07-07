// marketing-process-model T-07 (AC-10, AC-11) — >=1 story per journey
// DESCRIBES_ACTIVITY a scoped activity; out-of-scope activity → 404
// story_activity_not_in_model; every story >=1 AC with non-empty
// given/when/then; a missing clause → 400 acceptance_criterion_clause_required.
// Requires the loopback stack up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedSaasOperator } from "../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedMarketing, resolveIds } from "../scripts/seed-marketing";

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

describe("integration: marketing stories + ACs (AC-10, AC-11)", () => {
  let rootId = "";
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedMarketing(BASE);
    rootId = (await resolveIds(BASE)).rootId;
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-10: >=1 UserStory per journey DESCRIBES_ACTIVITY a scoped Marketing activity", async () => {
    // Count journeys with >=1 story describing an activity of that journey.
    const res = await cypher(`
      MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)
      WHERE d.attributes_json CONTAINS '"seedKey":"marketing"'
      OPTIONAL MATCH (st:UserStory)-[:DESCRIBES_ACTIVITY]->(a:Activity)-[:PART_OF]->(j)
      RETURN j.id AS id, count(DISTINCT st) AS stories`);
    expect(res.rows.length).toBe(5);
    for (const r of res.rows) {
      expect(num(r.stories)).toBeGreaterThanOrEqual(1);
    }
  });

  test("AC-10: a story against an out-of-scope activity id → 404 story_activity_not_in_model", async () => {
    const res = await fetch(`${BASE}/api/v1/models/${rootId}/stories`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        persona: "Tester",
        action: "do something out of scope",
        benefit: "the guard fires",
        activityId: "ffffffff-0000-7000-8000-000000000000",
      }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("story_activity_not_in_model");
  });

  test("AC-11: every Marketing story has >=1 AC with non-empty given/when/then", async () => {
    const res = await cypher(`
      MATCH (st:UserStory)-[:DESCRIBES_ACTIVITY]->(a:Activity)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d:Domain)
      WHERE d.attributes_json CONTAINS '"seedKey":"marketing"'
      MATCH (ac:AcceptanceCriterion)-[:ACCEPTANCE_OF]->(st)
      RETURN st.id AS id, count(ac) AS acs, collect(ac.given)[0] AS g, collect(ac.when)[0] AS w, collect(ac.then)[0] AS t`);
    expect(res.rows.length).toBeGreaterThanOrEqual(5);
    for (const r of res.rows) {
      expect(num(r.acs)).toBeGreaterThanOrEqual(1);
      expect(String(r.g).length).toBeGreaterThan(0);
      expect(String(r.w).length).toBeGreaterThan(0);
      expect(String(r.t).length).toBeGreaterThan(0);
    }
  });

  test("AC-11: a missing clause → 400 acceptance_criterion_clause_required", async () => {
    // Create a throwaway story then a clause-missing AC.
    const ids = await resolveIds(BASE);
    const activityId = ids.activities.get("draft-content")!;
    const storyRes = await fetch(`${BASE}/api/v1/models/${rootId}/stories`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        persona: "Content Marketer",
        action: "draft a throwaway asset for the clause-guard test",
        benefit: "the AC clause guard is exercised",
        activityId,
      }),
    });
    expect([200, 201]).toContain(storyRes.status);
    const storyId = String(((await storyRes.json()) as { id: string }).id);
    const acRes = await fetch(`${BASE}/api/v1/models/${rootId}/stories/${storyId}/acceptance-criteria`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ given: "only a given clause", when: "", then: "" }),
    });
    expect(acRes.status).toBe(400);
    const body = (await acRes.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("acceptance_criterion_clause_required");
  });
});
