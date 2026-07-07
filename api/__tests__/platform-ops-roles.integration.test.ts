// platform-ops-process-model T-09 (AC-03) — every platform-ops activity has
// ≥1 Role EXECUTES it; the four function roles exist; a role duplicating the
// shared catalog by name is referenced (count of that name = 1), not
// re-created. Requires the loopback stack up.

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

const FUNCTION_ROLES = ["SRE", "On-call Engineer", "Release Manager", "Platform Ops Lead"];

describe("integration: platform-ops roles (AC-03)", () => {
  beforeAll(async () => {
    await seedPlatformOpsPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-03: every platform-ops activity has ≥1 executing role", async () => {
    const res = await cypher(
      `MATCH (a:Activity)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d:Domain)
       WHERE d.attributes_json CONTAINS 'platform_ops'
       OPTIONAL MATCH (r:Role)-[:EXECUTES]->(a)
       WITH a, count(r) AS roles
       RETURN count(CASE WHEN roles = 0 THEN 1 END) AS withoutRole, count(a) AS total`,
    );
    expect(num(res.rows[0]!.withoutRole)).toBe(0);
    expect(num(res.rows[0]!.total)).toBeGreaterThanOrEqual(24);
  });

  test("AC-03: the four function roles exist", async () => {
    const res = await cypher(
      `MATCH (r:Role) WHERE r.name IN $names RETURN r.name AS name ORDER BY r.name`,
      { names: FUNCTION_ROLES } as Record<string, unknown>,
    );
    const names = res.rows.map((r) => String(r.name)).sort();
    expect(names).toEqual([...FUNCTION_ROLES].sort());
  });

  test("AC-03: a shared-catalog role is referenced, not re-created (count of name = 1)", async () => {
    // The shared catalog seeds `Site Reliability Engineer`; this slice does
    // NOT re-declare it — so its name count stays 1. The four in-slice function
    // roles the catalog lacks also each appear exactly once.
    for (const name of [...FUNCTION_ROLES, "Site Reliability Engineer"]) {
      const res = await cypher(`MATCH (r:Role {name:$name}) RETURN count(r) AS n`, { name });
      expect(num(res.rows[0]!.n)).toBe(1);
    }
  });
});
