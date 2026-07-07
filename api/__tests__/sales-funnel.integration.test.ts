// sales-process-model T-06 (AC-07, AC-08) — Sales Pipeline funnel with the
// ordered six-Stage chain via HAS_STAGE; CONVERTS_TO range-checked; funnel
// anchored by attributes.modelId = operator root (Rule D). Requires the stack up
// AND the executed funnel-pipeline-modeling subsystem (B-01).

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { BASE, cypher, num, salesSeedReady, skipMsg } from "./sales-test-harness";

const STAGE_ORDER = ["Lead", "Qualified", "Demo", "Proposal", "Negotiation", "Closed-Won"];

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

describe("integration: sales pipeline funnel (AC-07, AC-08)", () => {
  let ready = false;
  beforeAll(async () => {
    ready = await salesSeedReady();
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-07: Sales Pipeline funnel with the ordered six-Stage chain via HAS_STAGE", async () => {
    if (!ready) return skipMsg("AC-07");
    const rootId = await operatorRootId();
    const f = await cypher(
      `MATCH (f:Funnel {name:"Sales Pipeline"}) WHERE f.attributes_json CONTAINS $marker RETURN count(f) AS n`,
      { marker: `"modelId":"${rootId}"` },
    );
    expect(num(f.rows[0]!.n)).toBe(1);

    const stages = await cypher(`
      MATCH (f:Funnel {name:"Sales Pipeline"})-[:HAS_STAGE]->(s:Stage)
      WITH s, apoc.convert.fromJsonMap(coalesce(s.attributes_json,"{}")) AS a
      RETURN s.name AS name ORDER BY a.stageOrder`);
    expect(stages.rows.map((r) => String(r.name))).toEqual(STAGE_ORDER);
  });

  test("AC-08: each CONVERTS_TO has conversionRate/dropOffRate in [0,1]; overall conversion computes", async () => {
    if (!ready) return skipMsg("AC-08");
    // The funnel transition route stores conversionRate/dropOffRate inside the
    // edge's attributes_json (graph-core createEdge serializes attributes there),
    // not as top-level relationship properties — matching how the funnel-owned
    // tests read them (funnel-read.integration.test.ts). Parse it out here.
    const res = await cypher(`
      MATCH (:Stage)-[c:CONVERTS_TO]->(:Stage)
      WITH apoc.convert.fromJsonMap(coalesce(c.attributes_json,"{}")) AS a
      WHERE a.conversionRate IS NOT NULL
      RETURN a.conversionRate AS cr, a.dropOffRate AS dr`);
    expect(res.rows.length).toBeGreaterThanOrEqual(5);
    let product = 1;
    for (const r of res.rows) {
      const cr = Number(r.cr);
      const dr = Number(r.dr);
      expect(cr).toBeGreaterThanOrEqual(0);
      expect(cr).toBeLessThanOrEqual(1);
      expect(dr).toBeGreaterThanOrEqual(0);
      expect(dr).toBeLessThanOrEqual(1);
      product *= cr;
    }
    expect(Number.isFinite(product)).toBe(true);
  });

  test("AC-08: the funnel-owned route rejects an out-of-range conversionRate", async () => {
    if (!ready) return skipMsg("AC-08");
    const stages = await cypher(`MATCH (f:Funnel {name:"Sales Pipeline"})-[:HAS_STAGE]->(s:Stage) RETURN s.id AS id LIMIT 2`);
    const res = await fetch(`${BASE}/api/v1/funnels/transitions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromId: String(stages.rows[0]!.id), toId: String(stages.rows[1]!.id), conversionRate: 1.5, dropOffRate: 0.5 }),
    });
    expect(res.status).toBe(400);
  });
});
