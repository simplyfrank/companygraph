// marketing-process-model T-09 (AC-13) — capabilities CAPABILITY_IN_MODEL the
// operator root, NEEDS_CAPABILITY from a Marketing activity, SUPPORTED_BY a
// system. Requires the loopback stack up.

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

const CAP_NAMES = ["Capture and qualify a lead", "Run a multi-channel campaign", "Score lead intent"];

describe("integration: marketing DDD capabilities (AC-13)", () => {
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedMarketing(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-13: three capabilities CAPABILITY_IN_MODEL the operator root", async () => {
    const res = await cypher(
      `MATCH (c:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
       WHERE c.name IN $names RETURN count(DISTINCT c) AS n`,
      { names: CAP_NAMES },
    );
    expect(num(res.rows[0]!.n)).toBe(3);
  });

  test("AC-13: each capability is SUPPORTED_BY >=1 System and NEEDS_CAPABILITY from >=1 Marketing activity", async () => {
    const res = await cypher(
      `MATCH (c:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
       WHERE c.name IN $names
       OPTIONAL MATCH (c)-[:SUPPORTED_BY]->(s:System)
       OPTIONAL MATCH (a:Activity)-[:NEEDS_CAPABILITY]->(c)
       RETURN c.name AS name, count(DISTINCT s) AS sys, count(DISTINCT a) AS needed ORDER BY c.name`,
      { names: CAP_NAMES },
    );
    expect(res.rows.length).toBe(3);
    for (const r of res.rows) {
      expect(num(r.sys)).toBeGreaterThanOrEqual(1);
      expect(num(r.needed)).toBeGreaterThanOrEqual(1);
    }
  });
});
