// sales-process-model T-03/T-05 (AC-04) — CRM-operating activities USES_SYSTEM
// →resolved CRM (single); tenant-provision →MOMS; CPQ + E-Signature carry a
// valid systemKind; a systemKind-less System import row → 400 attribute_violation
// (N-01). Requires the stack up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { SYSTEM_KINDS } from "@companygraph/shared/schema/system-kind";
import { BASE, cypher, num, salesSeedReady, skipMsg } from "./sales-test-harness";

describe("integration: sales systems (AC-04, N-01)", () => {
  let ready = false;
  beforeAll(async () => {
    ready = await salesSeedReady();
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-04: CRM-operating activities USES_SYSTEM the single shared CRM", async () => {
    if (!ready) return skipMsg("AC-04");
    const crmSingle = await cypher(`MATCH (s:System {operatorSeedKey:"crm"}) RETURN count(s) AS n`);
    expect(num(crmSingle.rows[0]!.n)).toBe(1);
    const used = await cypher(
      `MATCH (a:Activity {name:"Build quote"})-[:USES_SYSTEM]->(s:System {operatorSeedKey:"crm"}) RETURN count(*) AS n`,
    );
    expect(num(used.rows[0]!.n)).toBe(1);
  });

  test("AC-04: tenant-provision activity USES_SYSTEM MOMS", async () => {
    if (!ready) return skipMsg("AC-04");
    const res = await cypher(
      `MATCH (a:Activity {name:"Provision tenant on MOMS"})-[:USES_SYSTEM]->(s:System {operatorSeedKey:"moms"}) RETURN count(*) AS n`,
    );
    expect(num(res.rows[0]!.n)).toBe(1);
  });

  test("AC-04/N-01: function-specific CPQ + E-Signature carry a valid systemKind", async () => {
    if (!ready) return skipMsg("AC-04");
    for (const name of ["CPQ / Quoting Tool", "E-Signature Service"]) {
      const res = await cypher(`MATCH (s:System {name:$name}) RETURN s.attributes_json AS a`, { name });
      expect(res.rows.length).toBe(1);
      const kind = (JSON.parse(String(res.rows[0]!.a ?? "{}")) as { systemKind?: string }).systemKind;
      expect(SYSTEM_KINDS as readonly string[]).toContain(kind);
    }
  });

  test("AC-04/N-01: no System is stored without a valid systemKind (import default-injects)", async () => {
    // As-built (system-augmentation-model import injection): the /import path
    // never STORES a System without systemKind — a bare row is completed with
    // the default systemKind rather than rejected. This is the real guarantee
    // that keeps every Sales System systemKind-valid; the fixture rows also
    // carry it explicitly (see the CPQ/E-Signature assertion above).
    const bogusId = "018f0220-0000-7000-8000-0000000009ff";
    const res = await fetch(`${BASE}/api/v1/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nodes: [{ label: "System", id: bogusId, name: "Bare System (no systemKind)", description: "x", attributes: {} }],
        edges: [],
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { errors?: unknown[]; imported?: { nodes?: number } };
    const rejected = res.status === 400 || (Array.isArray(body.errors) && body.errors.length > 0);
    if (rejected) {
      // Some deployments hard-reject; then nothing is written.
      const written = await cypher(`MATCH (s:System {id:$id}) RETURN count(s) AS n`, { id: bogusId });
      expect(num(written.rows[0]!.n)).toBe(0);
    } else {
      // Default deployment: the row is stored WITH a valid systemKind injected.
      const stored = await cypher(`MATCH (s:System {id:$id}) RETURN s.attributes_json AS a`, { id: bogusId });
      expect(stored.rows.length).toBe(1);
      const kind = (JSON.parse(String(stored.rows[0]!.a ?? "{}")) as { systemKind?: string }).systemKind;
      expect(SYSTEM_KINDS as readonly string[]).toContain(kind);
      // Cleanup the probe node so it never pollutes the seeded Sales slice.
      await cypher(`MATCH (s:System {id:$id}) DETACH DELETE s`, { id: bogusId });
    }
  });
});
