// saas-operator-foundation T-06 (AC-03, NFR-02) — the six function Domain
// roots exist scoped IN_MODEL to the operator root, each carrying its
// attributes.seedKey; each has zero journeys initially; a re-run adds zero
// domains/edges (no duplicate Marketing).

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { ensureOperatorRoot } from "../src/seed/ensure-operator-root";
import { ensureFunctionDomains, FUNCTION_DOMAINS } from "../src/seed/ensure-function-domains";

async function cypher<T = Record<string, unknown>>(
  statement: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const session = getDriver().session({ defaultAccessMode: "READ" });
  try {
    const res = await session.run(statement, params);
    return res.records.map((r) => r.toObject() as T);
  } finally {
    await session.close();
  }
}
const num = (v: unknown) => Number((v as { low?: number })?.low ?? v);

describe("integration: saas-operator-foundation AC-03 function domains", () => {
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("six domains scoped IN_MODEL with seedKey; idempotent re-run", async () => {
    const root = await ensureOperatorRoot(getDriver());
    const map = await ensureFunctionDomains(getDriver(), root.id);

    expect(map.size).toBe(6);
    for (const fn of FUNCTION_DOMAINS) {
      expect(map.has(fn.seedKey)).toBe(true);
    }

    // Each domain is scoped IN_MODEL, carries its seedKey, has zero journeys.
    const rows = await cypher<{ seedKey: string; journeys: number }>(
      `MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel {id:$id})
       WHERE d.attributes_json CONTAINS 'seedKey'
       OPTIONAL MATCH (j:UserJourney)-[:PART_OF]->(d)
       RETURN apoc.convert.fromJsonMap(d.attributes_json).seedKey AS seedKey,
              count(j) AS journeys`,
      { id: root.id },
    );
    const bySeed = new Map(rows.map((r) => [r.seedKey, num(r.journeys)]));
    for (const fn of FUNCTION_DOMAINS) {
      expect(bySeed.has(fn.seedKey)).toBe(true);
      expect(bySeed.get(fn.seedKey)).toBe(0);
    }

    // Re-run adds zero domains/edges — no duplicate Marketing.
    const [before] = await cypher<{ n: number }>(
      `MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel {id:$id}) RETURN count(d) AS n`,
      { id: root.id },
    );
    const map2 = await ensureFunctionDomains(getDriver(), root.id);
    expect(map2.size).toBe(6);
    const [after] = await cypher<{ n: number }>(
      `MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel {id:$id}) RETURN count(d) AS n`,
      { id: root.id },
    );
    expect(num(after!.n)).toBe(num(before!.n));

    const [markets] = await cypher<{ n: number }>(
      `MATCH (d:Domain {name:"Marketing"})-[:IN_MODEL]->(m:BusinessModel {id:$id}) RETURN count(d) AS n`,
      { id: root.id },
    );
    expect(num(markets!.n)).toBe(1);
  });
});
