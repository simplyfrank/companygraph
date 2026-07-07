// marketing-process-model T-12 (AC-03) — every Marketing activity has >=1
// EXECUTES role; shared-catalog roles resolve to a single node; function-
// specific roles present; persona PERFORMS_AS/PARTICIPATES_IN resolve (N-03).
// Requires the loopback stack up.

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

const FUNCTION_ROLES = [
  "content-marketer",
  "demand-gen-manager",
  "marketing-ops",
  "field-events-marketer",
  "abm-strategist",
  "marketing-analyst",
];

describe("integration: marketing roles + persona edges (AC-03)", () => {
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedMarketing(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-03: every Marketing activity has >=1 EXECUTES role", async () => {
    const res = await cypher(`
      MATCH (a:Activity)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d:Domain)
      WHERE d.attributes_json CONTAINS '"seedKey":"marketing"'
      OPTIONAL MATCH (r:Role)-[:EXECUTES]->(a)
      RETURN a.id AS id, count(r) AS roles`);
    expect(res.rows.length).toBeGreaterThan(0);
    for (const row of res.rows) {
      expect(num(row.roles)).toBeGreaterThanOrEqual(1);
    }
  });

  test("AC-03: function-specific roles are present as single Role nodes", async () => {
    for (const key of FUNCTION_ROLES) {
      const res = await cypher(
        `MATCH (r:Role) WHERE r.attributes_json CONTAINS $needle RETURN count(r) AS n`,
        { needle: `"seedKey":"${key}"` },
      );
      expect(num(res.rows[0]!.n)).toBe(1);
    }
  });

  test("AC-03: persona PERFORMS_AS a role and PARTICIPATES_IN a journey (N-03)", async () => {
    const performsAs = await cypher(`
      MATCH (p:Persona)-[:PERFORMS_AS]->(r:Role)
      WHERE p.attributes_json CONTAINS '"seedKey":"marketing-function-owner"'
      RETURN count(r) AS n`);
    expect(num(performsAs.rows[0]!.n)).toBeGreaterThanOrEqual(1);

    const participatesIn = await cypher(`
      MATCH (p:Persona)-[:PARTICIPATES_IN]->(j:UserJourney)
      WHERE p.attributes_json CONTAINS '"seedKey":"marketing-function-owner"'
      RETURN count(j) AS n`);
    expect(num(participatesIn.rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });
});
