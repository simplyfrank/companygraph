// customer-success-process-model T-07 (AC-09) — the first-response + resolution
// SLAs created via POST /api/v1/slas with domain_id, present in GET /api/v1/slas;
// a re-run adds no duplicate (client-side name guard, N-01). Requires the
// loopback stack + the two upstream seeds.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedCustomerSuccessPreconditions, seedCustomerSuccess } from "./helpers/customer-success-fixtures";

const BASE = "http://127.0.0.1:8787";

const CS_SLA_NAMES = ["CS Ticket First-Response SLA", "CS Ticket Resolution SLA"];

async function listSlas(): Promise<Array<{ id?: string; name?: string; domain_id?: string | null }>> {
  const res = await fetch(`${BASE}/api/v1/slas`);
  const body = (await res.json()) as { rows?: Array<{ id?: string; name?: string; domain_id?: string | null }> };
  return body.rows ?? [];
}

describe("integration: customer-success SLAs (AC-09)", () => {
  beforeAll(async () => {
    await seedCustomerSuccessPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-09: both CS SLAs appear in GET /api/v1/slas with a domain_id", async () => {
    const rows = await listSlas();
    for (const name of CS_SLA_NAMES) {
      const matches = rows.filter((r) => r.name === name);
      expect(matches.length).toBe(1);
      expect(matches[0]!.domain_id).toBeTruthy();
    }
  });

  test("AC-09: a re-run adds no duplicate SLA (name guard)", async () => {
    const before = (await listSlas()).filter((r) => CS_SLA_NAMES.includes(r.name ?? "")).length;
    await seedCustomerSuccess(BASE);
    const after = (await listSlas()).filter((r) => CS_SLA_NAMES.includes(r.name ?? "")).length;
    expect(after).toBe(before);
    expect(after).toBe(CS_SLA_NAMES.length);
  });
});
