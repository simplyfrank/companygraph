// sales-process-model T-07 (AC-09) — notable activities each have ≥1 UserStory
// (derived:false, server-assembled narrative) with exactly one DESCRIBES_ACTIVITY
// and at most one STORY_FOR_ROLE; each story ≥1 AC; out-of-scope activity → 404;
// missing clause → 400. Requires the stack up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { BASE, cypher, num, salesSeedReady, skipMsg } from "./sales-test-harness";

async function operatorRootId(): Promise<string> {
  const rows = await cypher(`MATCH (m:BusinessModel {name:"SaaS Operator"}) RETURN m.id AS id, m.attributes_json AS a`);
  const r = rows.rows.find((x) => {
    try {
      return (JSON.parse(String(x.a ?? "{}")) as { saasOperatorRoot?: boolean }).saasOperatorRoot === true;
    } catch {
      return false;
    }
  });
  return String(r!.id);
}

describe("integration: sales stories + ACs (AC-09)", () => {
  let ready = false;
  beforeAll(async () => {
    ready = await salesSeedReady();
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-09: the Build quote activity has ≥1 story (derived:false, one DESCRIBES_ACTIVITY)", async () => {
    if (!ready) return skipMsg("AC-09");
    const res = await cypher(
      `MATCH (st:UserStory)-[:DESCRIBES_ACTIVITY]->(a:Activity {name:"Build quote"})
       RETURN st.id AS id, st.derived AS derived, st.narrative AS narrative`,
    );
    expect(res.rows.length).toBeGreaterThanOrEqual(1);
    for (const r of res.rows) {
      expect(r.derived === false || r.derived === "false" || r.derived === 0).toBe(true);
      expect(String(r.narrative ?? "").length).toBeGreaterThan(0);
    }
  });

  test("AC-09: each Sales story has exactly one DESCRIBES_ACTIVITY and at most one STORY_FOR_ROLE", async () => {
    if (!ready) return skipMsg("AC-09");
    const stories = await cypher(
      `MATCH (st:UserStory)-[:DESCRIBES_ACTIVITY]->(a:Activity)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d:Domain)
       WHERE d.attributes_json CONTAINS '"seedKey":"sales"' RETURN DISTINCT st.id AS id`,
    );
    expect(stories.rows.length).toBeGreaterThanOrEqual(1);
    for (const s of stories.rows) {
      const desc = await cypher(`MATCH (st:UserStory {id:$id})-[r:DESCRIBES_ACTIVITY]->() RETURN count(r) AS n`, { id: s.id });
      expect(num(desc.rows[0]!.n)).toBe(1);
      const role = await cypher(`MATCH (st:UserStory {id:$id})-[r:STORY_FOR_ROLE]->() RETURN count(r) AS n`, { id: s.id });
      expect(num(role.rows[0]!.n)).toBeLessThanOrEqual(1);
      const ac = await cypher(`MATCH (st:UserStory {id:$id})<-[:ACCEPTANCE_OF]-(c:AcceptanceCriterion) RETURN count(c) AS n`, { id: s.id });
      expect(num(ac.rows[0]!.n)).toBeGreaterThanOrEqual(1);
    }
  });

  test("AC-09: a story create with an out-of-scope activityId → 404 story_activity_not_in_model", async () => {
    if (!ready) return skipMsg("AC-09");
    const rootId = await operatorRootId();
    const res = await fetch(`${BASE}/api/v1/models/${rootId}/stories`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        persona: "AE",
        action: "do something out of scope",
        benefit: "it should be rejected",
        activityId: "018f0220-0000-7000-8000-0000000009fe",
      }),
    });
    expect(res.status).toBe(404);
  });
});
