// customer-success-process-model T-10 (AC-11) — four CS capabilities created via
// POST .../capabilities (resolved modelId); NEEDS_CAPABILITY accepts a CS
// activity (not 404 not_found); SUPPORTED_BY a system; where a context exists,
// ASSIGNED_TO_CONTEXT; a re-run adds no duplicate. Requires the loopback stack +
// the two upstream seeds.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedCustomerSuccessPreconditions, seedCustomerSuccess } from "./helpers/customer-success-fixtures";
import { CS_CAPABILITIES } from "../src/seed/customer-success-catalog";

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

const CS_CAP_NAMES = CS_CAPABILITIES.map((c) => c.name).sort();

// Scope to the RESOLVED operator root (CAPABILITY_IN_MODEL) — a defunct
// operator root left by an aborted full-suite run may hold orphaned same-named
// capabilities; the model-scoped count is the correct, pollution-resilient
// assertion (matches listCapabilities' membership filter).
const SCOPED_CAP_COUNT = `MATCH (c:Capability)-[:CAPABILITY_IN_MODEL]->(m:BusinessModel {name:"SaaS Operator"})
  WHERE m.attributes_json CONTAINS 'saasOperatorRoot' AND c.name IN $names
  RETURN count(c) AS n`;

describe("integration: customer-success DDD capabilities (AC-11)", () => {
  beforeAll(async () => {
    await seedCustomerSuccessPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-11: the four CS capabilities exist exactly once each (scoped to the operator root)", async () => {
    const res = await cypher(
      `MATCH (c:Capability)-[:CAPABILITY_IN_MODEL]->(m:BusinessModel {name:"SaaS Operator"})
       WHERE m.attributes_json CONTAINS 'saasOperatorRoot' AND c.name IN $names
       RETURN c.name AS name, count(c) AS n ORDER BY name`,
      { names: CS_CAP_NAMES },
    );
    const names = res.rows.map((r) => String(r.name)).sort();
    expect(names).toEqual(CS_CAP_NAMES);
    for (const r of res.rows) expect(num(r.n)).toBe(1);
  });

  test("AC-11: each capability is NEEDED by its CS activity (accepted, not 404)", async () => {
    for (const cap of CS_CAPABILITIES) {
      const res = await cypher(
        `MATCH (a:Activity {id:$aid})-[:NEEDS_CAPABILITY]->(c:Capability {name:$name})-[:CAPABILITY_IN_MODEL]->(m:BusinessModel {name:"SaaS Operator"})
         WHERE m.attributes_json CONTAINS 'saasOperatorRoot'
         RETURN count(*) AS n`,
        { aid: cap.neededByActivityId, name: cap.name },
      );
      expect(num(res.rows[0]!.n)).toBe(1);
    }
  });

  test("AC-11: each capability is SUPPORTED_BY ≥1 System", async () => {
    for (const cap of CS_CAPABILITIES) {
      const res = await cypher(
        `MATCH (c:Capability {name:$name})-[:CAPABILITY_IN_MODEL]->(m:BusinessModel {name:"SaaS Operator"})
         WHERE m.attributes_json CONTAINS 'saasOperatorRoot'
         MATCH (c)-[:SUPPORTED_BY]->(:System) RETURN count(*) AS n`,
        { name: cap.name },
      );
      expect(num(res.rows[0]!.n)).toBeGreaterThanOrEqual(1);
    }
  });

  test("AC-11: a re-run adds no duplicate capability (scoped to the operator root)", async () => {
    const before = await cypher(SCOPED_CAP_COUNT, { names: CS_CAP_NAMES });
    await seedCustomerSuccess(BASE);
    const after = await cypher(SCOPED_CAP_COUNT, { names: CS_CAP_NAMES });
    expect(num(after.rows[0]!.n)).toBe(num(before.rows[0]!.n));
    expect(num(after.rows[0]!.n)).toBe(4);
  });
});
