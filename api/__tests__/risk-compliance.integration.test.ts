import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { generateId } from "../src/ids";

// risk-compliance-change T-09 — pins the three read-only risk-compliance
// reports (FR-07, AC-10) against a live Neo4j. The fixture is traced to
// the EXACT labels/relationships/properties each report's WHERE clause
// matches (N-03) so it provably lands in the POPULATED branch. Read-only:
// no route write path, so fixtures are seeded via getDriver() directly.
//
// Per-report empty envelopes (B-02): inventory has NO `count`; the other
// two expose `count`. Cleanup deletes tracked node ids (AC-15).

const API_BASE = "http://127.0.0.1:8787/api/v1";
const RUN = Date.now().toString(36);
const REG = `GDPR-${RUN}`;
const ROLE_NAME = `sod-role-${RUN}`;
const VENDOR = `vendor-${RUN}`;
const cleanupIds: string[] = [];

const ids = {
  domain: generateId(),
  journey: generateId(),
  regActivity: generateId(),
  a1: generateId(),
  a2: generateId(),
  role1: generateId(),
  role2: generateId(),
  system: generateId(),
  sysActivity: generateId(),
};

beforeAll(async () => {
  Object.values(ids).forEach((id) => cleanupIds.push(id));
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    // regulated-activity-inventory: Domain <-PART_OF- UserJourney <-PART_OF- Activity{regulatory_tags:[REG]}
    await session.run(
      `CREATE (d:Domain {id:$dId, name:$dName})
       CREATE (j:UserJourney {id:$jId, name:'j'})
       CREATE (a:Activity {id:$aId, name:'reg-act', regulatory_tags:[$reg]})
       CREATE (j)-[:PART_OF]->(d)
       CREATE (a)-[:PART_OF]->(j)`,
      { dId: ids.domain, dName: `dom-${RUN}`, jId: ids.journey, aId: ids.regActivity, reg: REG },
    );

    // sod-violations: (a1)-[:CONFLICTS_WITH]->(a2); each activity EXECUTES-linked
    // from a Role sharing the SAME name.
    await session.run(
      `CREATE (a1:Activity {id:$a1, name:'conf-a1'})
       CREATE (a2:Activity {id:$a2, name:'conf-a2'})
       CREATE (r1:Role {id:$r1, name:$role})
       CREATE (r2:Role {id:$r2, name:$role})
       CREATE (a1)-[:CONFLICTS_WITH]->(a2)
       CREATE (r1)-[:EXECUTES]->(a1)
       CREATE (r2)-[:EXECUTES]->(a2)`,
      { a1: ids.a1, a2: ids.a2, r1: ids.role1, r2: ids.role2, role: ROLE_NAME },
    );

    // third-party-register: System{is_third_party:true} + Activity -USES_SYSTEM-> System
    await session.run(
      `CREATE (s:System {id:$sId, name:$sName, is_third_party:true, vendor:$vendor,
                         contract_end:'2027-01-01', dpa_signed:true, data_classification:'confidential'})
       CREATE (a:Activity {id:$aId, name:'uses-sys'})
       CREATE (a)-[:USES_SYSTEM]->(s)`,
      { sId: ids.system, sName: `sys-${RUN}`, vendor: VENDOR, aId: ids.sysActivity },
    );
  } finally {
    await session.close();
  }
});

afterAll(async () => {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    await session.run(`MATCH (n) WHERE n.id IN $ids DETACH DELETE n`, { ids: cleanupIds });
  } finally {
    await session.close();
    await closeDriver();
    _resetDriver();
  }
});

describe("integration: risk-compliance reports populated (AC-10, FR-07)", () => {
  test("regulated-activity-inventory returns {domains,regulations,matrix}", async () => {
    const res = await fetch(`${API_BASE}/risk-compliance/regulated-activity-inventory`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.domains)).toBe(true);
    expect(Array.isArray(body.regulations)).toBe(true);
    expect(Array.isArray(body.matrix)).toBe(true);
    // no count field on the inventory (NFR-04 / B-02)
    expect(body.count).toBeUndefined();
    // seeded regulation + domain present, cell non-zero
    expect(body.regulations).toContain(REG);
    const row = body.matrix.find((r: any) => r.domain === `dom-${RUN}`);
    expect(row).toBeDefined();
    expect(row[REG]).toBeGreaterThan(0);
  });

  test("sod-violations returns {violations,count} with the seeded pair", async () => {
    const res = await fetch(`${API_BASE}/risk-compliance/sod-violations`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.violations)).toBe(true);
    expect(typeof body.count).toBe("number");
    const mine = body.violations.find((v: any) => v.conflicting_role === ROLE_NAME);
    expect(mine).toBeDefined();
    expect(mine.activity1_id).toBe(ids.a1);
    expect(mine.activity2_id).toBe(ids.a2);
  });

  test("third-party-register returns {register,count} with the seeded system", async () => {
    const res = await fetch(`${API_BASE}/risk-compliance/third-party-register`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.register)).toBe(true);
    expect(typeof body.count).toBe("number");
    const mine = body.register.find((r: any) => r.system_id === ids.system);
    expect(mine).toBeDefined();
    expect(mine.vendor).toBe(VENDOR);
    expect(mine.dpa_signed).toBe(true);
    expect(mine.critical_journey_count).toBeGreaterThanOrEqual(1);
  });
});

describe("integration: risk-compliance per-report envelopes (AC-10)", () => {
  test("all three reports return well-formed as-built envelopes", async () => {
    // The inventory exposes arrays only (no count); the other two expose
    // count as a number. This pins the per-report shape distinction (B-02)
    // without depending on an empty graph (the stack is shared/dirty).
    const inv = await (await fetch(`${API_BASE}/risk-compliance/regulated-activity-inventory`)).json();
    expect(Object.keys(inv).sort()).toEqual(["domains", "matrix", "regulations"]);

    const sod = await (await fetch(`${API_BASE}/risk-compliance/sod-violations`)).json();
    expect(Object.keys(sod).sort()).toEqual(["count", "violations"]);

    const tpr = await (await fetch(`${API_BASE}/risk-compliance/third-party-register`)).json();
    expect(Object.keys(tpr).sort()).toEqual(["count", "register"]);
  });
});
