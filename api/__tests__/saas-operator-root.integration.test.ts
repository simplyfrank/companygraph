// saas-operator-foundation T-05 (AC-01, NFR-02) — idempotent operator-root
// ensure. First run creates exactly one "SaaS Operator" BusinessModel
// (isReference:false, ordinal=max+1, saasOperatorRoot:true, distinct from
// retail Model #1); a second run creates no second root; retail Model #1
// (isReference:true, ordinal 1) + its IN_MODEL domain count are unchanged.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { ensureOperatorRoot } from "../src/seed/ensure-operator-root";

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

describe("integration: saas-operator-foundation AC-01 operator root", () => {
  beforeAll(async () => {
    // Ensure the retail reference model exists (a prior test may have wiped it).
    const { migrateRetailToModel } = await import("../src/scripts/migrate-retail-to-model");
    await migrateRetailToModel(getDriver(), "apply").catch(() => {});
  });

  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("first run creates exactly one operator root; second run is a no-op", async () => {
    // Snapshot retail reference (ordinal 1, isReference:true) before.
    const [refBefore] = await cypher<{ id: string; ordinal: number; domains: number }>(
      `MATCH (m:BusinessModel {isReference:true})
       OPTIONAL MATCH (d:Domain)-[:IN_MODEL]->(m)
       RETURN m.id AS id, m.ordinal AS ordinal, count(d) AS domains`,
    );
    expect(refBefore).toBeTruthy();

    const first = await ensureOperatorRoot(getDriver());
    expect(first.name).toBe("SaaS Operator");
    expect(first.isReference).toBe(false);
    expect(first.attributes.saasOperatorRoot).toBe(true);
    expect(first.id).not.toBe(refBefore!.id);
    expect(first.ordinal).toBeGreaterThan(1);

    const second = await ensureOperatorRoot(getDriver());
    expect(second.id).toBe(first.id); // idempotent — same root

    // Exactly one operator root exists.
    const [count] = await cypher<{ n: number }>(
      `MATCH (m:BusinessModel {name:"SaaS Operator"})
       WHERE m.attributes_json CONTAINS 'saasOperatorRoot'
       RETURN count(m) AS n`,
    );
    expect(Number((count!.n as unknown as { low?: number }).low ?? count!.n)).toBe(1);

    // Retail reference unchanged (ordinal + domain count).
    const [refAfter] = await cypher<{ id: string; ordinal: number; domains: number }>(
      `MATCH (m:BusinessModel {isReference:true})
       OPTIONAL MATCH (d:Domain)-[:IN_MODEL]->(m)
       RETURN m.id AS id, m.ordinal AS ordinal, count(d) AS domains`,
    );
    expect(refAfter!.id).toBe(refBefore!.id);
    const num = (v: unknown) => Number((v as { low?: number })?.low ?? v);
    expect(num(refAfter!.ordinal)).toBe(num(refBefore!.ordinal));
    expect(num(refAfter!.domains)).toBe(num(refBefore!.domains));
  });
});
