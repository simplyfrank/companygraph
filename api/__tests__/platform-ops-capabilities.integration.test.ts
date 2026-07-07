// platform-ops-process-model T-09 (AC-13) — ≥3 Capability via
// POST /api/v1/models/:modelId/capabilities (each CAPABILITY_IN_MODEL the
// operator root), each SUPPORTED_BY ≥1 seeded System, each with ≥1
// NEEDS_CAPABILITY source; where a BoundedContext fits, an ASSIGNED_TO_CONTEXT
// edge (no context created). Requires the loopback stack up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedPlatformOpsPreconditions } from "./helpers/platform-ops-fixtures";

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

const CAP_NAMES = ["Roll out a release safely", "Detect & resolve an incident", "Restore from backup"];

describe("integration: platform-ops DDD capabilities (AC-13)", () => {
  let bcBefore = 0;
  beforeAll(async () => {
    // Best-effort scaffold + metric roster before snapshotting bounded
    // contexts, then this spec content seed (see helpers/platform-ops-fixtures).
    const bc = await cypher(`MATCH (b:BoundedContext) RETURN count(b) AS n`);
    bcBefore = num(bc.rows[0]!.n);
    await seedPlatformOpsPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-13: ≥3 capabilities CAPABILITY_IN_MODEL the operator root", async () => {
    const res = await cypher(
      `MATCH (c:Capability)-[:CAPABILITY_IN_MODEL]->(m:BusinessModel {name:"SaaS Operator"})
       WHERE c.name IN $names RETURN count(c) AS n`,
      { names: CAP_NAMES } as Record<string, unknown>,
    );
    expect(num(res.rows[0]!.n)).toBe(3);
  });

  test("AC-13: each capability is SUPPORTED_BY ≥1 System and has ≥1 NEEDS_CAPABILITY source", async () => {
    const res = await cypher(
      `MATCH (c:Capability)-[:CAPABILITY_IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
       WHERE c.name IN $names
       OPTIONAL MATCH (c)-[:SUPPORTED_BY]->(s:System)
       OPTIONAL MATCH (src)-[:NEEDS_CAPABILITY]->(c)
       RETURN c.name AS name, count(DISTINCT s) AS sys, count(DISTINCT src) AS needed ORDER BY c.name`,
      { names: CAP_NAMES } as Record<string, unknown>,
    );
    expect(res.rows.length).toBe(3);
    for (const row of res.rows) {
      expect(num(row.sys)).toBeGreaterThanOrEqual(1);
      expect(num(row.needed)).toBeGreaterThanOrEqual(1);
    }
  });

  test("AC-13: no BoundedContext is created by this seed (read-only, NFR-04)", async () => {
    const res = await cypher(`MATCH (b:BoundedContext) RETURN count(b) AS n`);
    expect(num(res.rows[0]!.n)).toBe(bcBefore);
  });
});
