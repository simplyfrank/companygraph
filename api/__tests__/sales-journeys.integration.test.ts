// sales-process-model T-03/T-12 (AC-01) — the five Sales pipeline-stage journeys
// are PART_OF the seedKey="sales" domain (resolver edge). Requires the stack up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { BASE, cypher, num, salesSeedReady, skipMsg } from "./sales-test-harness";

const JOURNEY_NAMES = ["Prospect & Qualify", "Demo", "Quote & Propose", "Negotiate & Close", "Tenant Provisioning / Handoff"];

describe("integration: sales journeys (AC-01)", () => {
  let ready = false;
  beforeAll(async () => {
    ready = await salesSeedReady();
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-01: five journeys are PART_OF the seedKey=sales domain", async () => {
    if (!ready) return skipMsg("AC-01");
    const res = await cypher(
      `MATCH (j:UserJourney)-[:PART_OF]->(d:Domain)
       WHERE d.attributes_json CONTAINS '"seedKey":"sales"'
       RETURN j.name AS name ORDER BY j.name`,
    );
    const names = res.rows.map((r) => String(r.name)).sort();
    expect(names).toEqual([...JOURNEY_NAMES].sort());
  });

  test("AC-01: exactly one Sales domain (no duplicate)", async () => {
    if (!ready) return skipMsg("AC-01");
    const res = await cypher(`MATCH (d:Domain) WHERE d.attributes_json CONTAINS '"seedKey":"sales"' RETURN count(d) AS n`);
    expect(num(res.rows[0]!.n)).toBe(1);
  });
});
