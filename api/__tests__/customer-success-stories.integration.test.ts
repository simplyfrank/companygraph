// customer-success-process-model T-08 (AC-08) — CS stories created via
// POST /api/v1/models/:modelId/stories where :modelId is the RESOLVED operator
// root id (not hard-coded); each targets a CS activity (accepted, not
// 404 story_activity_not_in_model); each carries ≥1 Given/When/Then; a re-run
// adds no duplicate; the fixture carries no UserStory/AC rows. Requires the
// loopback stack + the two upstream seeds.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedCustomerSuccessPreconditions, seedCustomerSuccess } from "./helpers/customer-success-fixtures";
import { CS_STORIES } from "../src/seed/customer-success-catalog";
import { readCustomerSuccessFixture } from "../scripts/seed-customer-success";

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

async function operatorRootId(): Promise<string> {
  const res = await cypher(
    `MATCH (m:BusinessModel {name:"SaaS Operator"}) RETURN m.id AS id, m.attributes_json AS a`,
  );
  const row = res.rows.find((r) => {
    try {
      return JSON.parse(String(r.a)).saasOperatorRoot === true;
    } catch {
      return false;
    }
  });
  return String(row!.id);
}

describe("integration: customer-success stories (AC-08)", () => {
  beforeAll(async () => {
    await seedCustomerSuccessPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-08: each CS story DESCRIBES_ACTIVITY a CS activity (accepted, not 404)", async () => {
    for (const row of CS_STORIES) {
      const res = await cypher(
        `MATCH (s:UserStory)-[:DESCRIBES_ACTIVITY]->(a:Activity {id:$aid})
         WHERE s.persona=$persona AND s.action=$action AND s.benefit=$benefit
         RETURN count(s) AS n`,
        { aid: row.activityId, persona: row.persona, action: row.action, benefit: row.benefit },
      );
      expect(num(res.rows[0]!.n)).toBeGreaterThanOrEqual(1);
    }
  });

  test("AC-08: each CS story carries ≥1 Given/When/Then AcceptanceCriterion", async () => {
    for (const row of CS_STORIES) {
      const res = await cypher(
        `MATCH (ac:AcceptanceCriterion)-[:ACCEPTANCE_OF]->(s:UserStory)-[:DESCRIBES_ACTIVITY]->(:Activity {id:$aid})
         WHERE s.persona=$persona AND s.action=$action
         RETURN count(ac) AS n`,
        { aid: row.activityId, persona: row.persona, action: row.action },
      );
      expect(num(res.rows[0]!.n)).toBeGreaterThanOrEqual(1);
    }
  });

  test("AC-08: stories were created against the RESOLVED operator root (list route reachable)", async () => {
    const modelId = await operatorRootId();
    const listRes = await fetch(`${BASE}/api/v1/models/${modelId}/stories`);
    expect(listRes.ok).toBe(true);
    const stories = (await listRes.json()) as Array<{ persona: string | null }>;
    const csPersonas = new Set(CS_STORIES.map((s) => s.persona));
    const found = stories.filter((s) => s.persona && csPersonas.has(s.persona));
    expect(found.length).toBeGreaterThanOrEqual(CS_STORIES.length);
  });

  test("AC-08: a re-run adds no duplicate story", async () => {
    const q = `MATCH (s:UserStory)-[:DESCRIBES_ACTIVITY]->(a:Activity)
       WHERE a.attributes_json CONTAINS 'customer-success-act-'
       RETURN count(s) AS n`;
    const before = await cypher(q);
    await seedCustomerSuccess(BASE);
    const after = await cypher(q);
    expect(num(after.rows[0]!.n)).toBe(num(before.rows[0]!.n));
  });

  test("AC-08: the fixture carries no UserStory/AcceptanceCriterion rows", () => {
    const fixture = readCustomerSuccessFixture();
    const labels = new Set(
      fixture.nodes.map((n) => (n as { label?: string }).label).filter(Boolean),
    );
    expect(labels.has("UserStory")).toBe(false);
    expect(labels.has("AcceptanceCriterion")).toBe(false);
  });
});
