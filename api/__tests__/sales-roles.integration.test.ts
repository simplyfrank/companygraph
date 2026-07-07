// sales-process-model T-03/T-12 (AC-03) — every Sales activity has ≥1 EXECUTES;
// shared sales_lead referenced (single, not duplicated); AE/SDR/SE/Deal Desk
// exist. Requires the stack up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { cypher, num, salesSeedReady, skipMsg } from "./sales-test-harness";

const FUNCTION_ROLES = ["Account Executive", "Sales Development Rep", "Sales Engineer", "Deal Desk"];

describe("integration: sales roles (AC-03)", () => {
  let ready = false;
  beforeAll(async () => {
    ready = await salesSeedReady();
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-03: every Sales activity has ≥1 EXECUTES role", async () => {
    if (!ready) return skipMsg("AC-03");
    const res = await cypher(
      `MATCH (a:Activity)-[:PART_OF]->(j:UserJourney)-[:PART_OF]->(d:Domain)
       WHERE d.attributes_json CONTAINS '"seedKey":"sales"'
       AND NOT (a)<-[:EXECUTES]-(:Role)
       RETURN count(a) AS n`,
    );
    expect(num(res.rows[0]!.n)).toBe(0);
  });

  test("AC-03: function-specific roles exist", async () => {
    if (!ready) return skipMsg("AC-03");
    for (const name of FUNCTION_ROLES) {
      const res = await cypher(`MATCH (r:Role {name:$name}) RETURN count(r) AS n`, { name });
      expect(num(res.rows[0]!.n)).toBeGreaterThanOrEqual(1);
    }
  });

  test("AC-03: shared sales_lead role is referenced, single (not duplicated)", async () => {
    if (!ready) return skipMsg("AC-03");
    const single = await cypher(`MATCH (r:Role {operatorSeedKey:"sales_lead"}) RETURN count(r) AS n`);
    expect(num(single.rows[0]!.n)).toBe(1);
    const used = await cypher(`MATCH (r:Role {operatorSeedKey:"sales_lead"})-[:EXECUTES]->(:Activity) RETURN count(*) AS n`);
    expect(num(used.rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });
});
