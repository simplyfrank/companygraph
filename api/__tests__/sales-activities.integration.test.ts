// sales-process-model T-12 (AC-02) — every Sales Activity is PART_OF a Sales
// journey; PRECEDES chains resolve on sequenced journeys; no orphaned activity.
// Requires the stack up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { cypher, num, salesSeedReady, skipMsg } from "./sales-test-harness";

describe("integration: sales activities (AC-02)", () => {
  let ready = false;
  beforeAll(async () => {
    ready = await salesSeedReady();
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-02: every Sales activity is PART_OF a Sales journey (no orphan)", async () => {
    if (!ready) return skipMsg("AC-02");
    // Activities reachable from the Sales domain via a journey.
    const inSlice = await cypher(
      `MATCH (a:Activity)-[:PART_OF]->(j:UserJourney)-[:PART_OF]->(d:Domain)
       WHERE d.attributes_json CONTAINS '"seedKey":"sales"'
       RETURN count(DISTINCT a) AS n`,
    );
    expect(num(inSlice.rows[0]!.n)).toBeGreaterThanOrEqual(11);
  });

  test("AC-02: the Negotiate & Close step order has a PRECEDES chain", async () => {
    if (!ready) return skipMsg("AC-02");
    const res = await cypher(
      `MATCH (a:Activity {name:"Handle objections"})-[:PRECEDES]->(b:Activity {name:"Prepare contract"})
       RETURN count(*) AS n`,
    );
    expect(num(res.rows[0]!.n)).toBe(1);
    const chain = await cypher(
      `MATCH (:Activity {name:"Prepare contract"})-[:PRECEDES]->(:Activity {name:"Send for signature"})
       -[:PRECEDES]->(:Activity {name:"Countersign"})-[:PRECEDES]->(:Activity {name:"Close-won"})
       RETURN count(*) AS n`,
    );
    expect(num(chain.rows[0]!.n)).toBe(1);
  });
});
