// platform-ops-process-model T-09 (AC-01) — after the three seeds, the
// `platform_ops` domain (IN_MODEL the operator root) exists exactly once (no
// duplicate) with the five named journeys each PART_OF it. Requires the
// loopback API + Neo4j + Postgres up.

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

const EXPECTED_JOURNEYS = [
  "Fleet observability",
  "Deploy / release",
  "Incident / on-call",
  "SLA / status",
  "Backups / DR",
].sort();

describe("integration: platform-ops journeys (AC-01)", () => {
  beforeAll(async () => {
    await seedPlatformOpsPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-01: exactly one Platform Ops domain, IN_MODEL the operator root", async () => {
    const res = await cypher(
      `MATCH (d:Domain)-[:IN_MODEL]->(m:BusinessModel {name:"SaaS Operator"})
       WHERE d.attributes_json CONTAINS 'platform_ops'
       RETURN count(d) AS n`,
    );
    expect(num(res.rows[0]!.n)).toBe(1);
  });

  test("AC-01: the five named journeys are each PART_OF the platform_ops domain", async () => {
    const res = await cypher(
      `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)-[:IN_MODEL]->(m:BusinessModel {name:"SaaS Operator"})
       WHERE d.attributes_json CONTAINS 'platform_ops'
       RETURN j.name AS name ORDER BY j.name`,
    );
    const names = res.rows.map((r) => String(r.name)).sort();
    expect(names).toEqual(EXPECTED_JOURNEYS);
  });
});
