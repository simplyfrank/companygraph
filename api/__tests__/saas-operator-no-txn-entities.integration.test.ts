// saas-operator-foundation T-15 (AC-02, FR-02, NFR-01) — the seed creates no
// operational/transactional labels or nodes. After a full seed:saas-operator,
// zero Lead/Opportunity/Subscription/Invoice/Tenant nodes exist, and the
// operator subgraph is process-layer only (+ the shared catalog).

import { afterAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedSaasOperator } from "../scripts/seed-saas-operator";

const API_BASE = "http://127.0.0.1:8787";

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

const TXN_LABELS = ["Lead", "Opportunity", "Subscription", "Invoice", "Tenant"];

describe("integration: saas-operator-foundation AC-02 no transactional entities", () => {
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("no operational/transactional labels or nodes after a full seed", async () => {
    await seedSaasOperator(API_BASE);

    for (const label of TXN_LABELS) {
      const [count] = await cypher<{ n: number }>(
        `MATCH (n:${label}) RETURN count(n) AS n`,
      );
      expect(num(count!.n)).toBe(0);
    }

    // The operator subgraph (root + IN_MODEL domains + descendants) uses only
    // process-layer labels + the reference catalog labels.
    const allowed = new Set([
      "BusinessModel",
      "Domain",
      "UserJourney",
      "Activity",
      "Role",
      "System",
      "Persona",
      "Location",
    ]);
    const rows = await cypher<{ label: string }>(
      `MATCH (m:BusinessModel {name:"SaaS Operator"})
       WHERE m.attributes_json CONTAINS 'saasOperatorRoot'
       MATCH (d:Domain)-[:IN_MODEL]->(m)
       OPTIONAL MATCH (d)<-[:PART_OF*0..]-(n)
       UNWIND labels(n) AS label
       RETURN DISTINCT label`,
    );
    for (const r of rows) {
      if (r.label == null) continue;
      expect(allowed.has(r.label)).toBe(true);
    }
  });
});
