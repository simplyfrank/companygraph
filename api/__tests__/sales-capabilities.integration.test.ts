// sales-process-model T-08 (AC-10) — 4 Capabilities each NEEDS_CAPABILITY from
// ≥1 Activity/Story, SUPPORTED_BY where applicable, exactly one CAPABILITY_IN_MODEL
// → the operator root and no other BusinessModel. Requires the stack up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { cypher, num, salesSeedReady, skipMsg } from "./sales-test-harness";

const CAPS = ["Qualify a lead", "Price and quote a deal", "Close a contract", "Provision a tenant"];

describe("integration: sales capabilities (AC-10)", () => {
  let ready = false;
  beforeAll(async () => {
    ready = await salesSeedReady();
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-10: the four Sales capabilities exist, each with exactly one CAPABILITY_IN_MODEL → operator root", async () => {
    if (!ready) return skipMsg("AC-10");
    for (const name of CAPS) {
      const cap = await cypher(`MATCH (c:Capability {name:$name}) RETURN c.id AS id`, { name });
      expect(cap.rows.length).toBeGreaterThanOrEqual(1);
      const capId = String(cap.rows[0]!.id);
      const inModel = await cypher(
        `MATCH (c:Capability {id:$id})-[r:CAPABILITY_IN_MODEL]->(:BusinessModel) RETURN count(r) AS n`,
        { id: capId },
      );
      expect(num(inModel.rows[0]!.n)).toBe(1);
      const toRoot = await cypher(
        `MATCH (c:Capability {id:$id})-[:CAPABILITY_IN_MODEL]->(m:BusinessModel)
         WHERE m.attributes_json CONTAINS '"saasOperatorRoot":true' RETURN count(*) AS n`,
        { id: capId },
      );
      expect(num(toRoot.rows[0]!.n)).toBe(1);
    }
  });

  test("AC-10: each capability NEEDS_CAPABILITY from ≥1 Activity/Story", async () => {
    if (!ready) return skipMsg("AC-10");
    for (const name of CAPS) {
      const res = await cypher(
        `MATCH (c:Capability {name:$name}) WHERE (:Activity)-[:NEEDS_CAPABILITY]->(c) OR (:UserStory)-[:NEEDS_CAPABILITY]->(c)
         RETURN count(c) AS n`,
        { name },
      );
      expect(num(res.rows[0]!.n)).toBeGreaterThanOrEqual(1);
    }
  });

  test("AC-10: SUPPORTED_BY — Price and quote → CPQ; Provision a tenant → MOMS", async () => {
    if (!ready) return skipMsg("AC-10");
    const cpq = await cypher(
      `MATCH (c:Capability {name:"Price and quote a deal"})-[:SUPPORTED_BY]->(s:System {name:"CPQ / Quoting Tool"}) RETURN count(*) AS n`,
    );
    expect(num(cpq.rows[0]!.n)).toBe(1);
    const moms = await cypher(
      `MATCH (c:Capability {name:"Provision a tenant"})-[:SUPPORTED_BY]->(s:System {operatorSeedKey:"moms"}) RETURN count(*) AS n`,
    );
    expect(num(moms.rows[0]!.n)).toBe(1);
  });
});
