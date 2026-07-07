// customer-success-process-model T-07 (AC-16, FR-10 `should`) — each CS SLA is
// aligned to the Support Ticketing journey via POST /api/v1/sla-alignments
// (SLA -[:ALIGNED_TO]-> journey). A re-run adds no duplicate alignment. Requires
// the loopback stack + the two upstream seeds.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedCustomerSuccessPreconditions, seedCustomerSuccess } from "./helpers/customer-success-fixtures";
import { JOURNEY_IDS } from "../src/seed/customer-success-catalog";

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

const CS_SLA_NAMES = ["CS Ticket First-Response SLA", "CS Ticket Resolution SLA"];

describe("integration: customer-success SLA alignments (AC-16)", () => {
  beforeAll(async () => {
    await seedCustomerSuccessPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-16: each CS SLA is ALIGNED_TO the Support Ticketing journey", async () => {
    for (const name of CS_SLA_NAMES) {
      const res = await cypher(
        `MATCH (s:SLA {name:$name})-[r:ALIGNED_TO]->(j:UserJourney {id:$jid})
         RETURN count(r) AS n`,
        { name, jid: JOURNEY_IDS.supportTicketing },
      );
      expect(num(res.rows[0]!.n)).toBe(1);
    }
  });

  test("AC-16: a re-run adds no duplicate alignment", async () => {
    const q = `MATCH (s:SLA)-[r:ALIGNED_TO]->(j:UserJourney {id:$jid})
       WHERE s.name IN $names RETURN count(r) AS n`;
    const before = await cypher(q, { jid: JOURNEY_IDS.supportTicketing, names: CS_SLA_NAMES });
    await seedCustomerSuccess(BASE);
    const after = await cypher(q, { jid: JOURNEY_IDS.supportTicketing, names: CS_SLA_NAMES });
    expect(num(after.rows[0]!.n)).toBe(num(before.rows[0]!.n));
  });
});
