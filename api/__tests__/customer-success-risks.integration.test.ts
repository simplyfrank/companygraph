// customer-success-process-model T-09 (AC-10) — three CS risks created via
// POST /api/v1/risk-register with domain:"Customer Success" and present in
// GET /api/v1/risk-register?domain=Customer%20Success; each linked_entity_id
// points at a real CS journey; a re-run adds no duplicate (name+domain guard).
// Requires the loopback stack + Postgres up + the two upstream seeds.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedCustomerSuccessPreconditions, seedCustomerSuccess } from "./helpers/customer-success-fixtures";
import { JOURNEY_IDS } from "../src/seed/customer-success-catalog";

const BASE = "http://127.0.0.1:8787";

const CS_RISK_NAMES = [
  "Net Churn / Retention Risk",
  "Support SLA Breach Risk",
  "Onboarding Failure Risk",
].sort();

interface RiskRow {
  id?: string;
  name?: string;
  domain?: string;
  linked_entity_id?: string | null;
}

async function listCsRisks(): Promise<RiskRow[]> {
  const res = await fetch(
    `${BASE}/api/v1/risk-register?domain=${encodeURIComponent("Customer Success")}`,
  );
  const body = (await res.json()) as { data?: RiskRow[] };
  return body.data ?? [];
}

const JOURNEY_ID_SET = new Set(Object.values(JOURNEY_IDS));

describe("integration: customer-success risks (AC-10)", () => {
  beforeAll(async () => {
    await seedCustomerSuccessPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-10: the three CS risks exist with domain:'Customer Success'", async () => {
    const rows = await listCsRisks();
    const names = rows
      .filter((r) => CS_RISK_NAMES.includes(r.name ?? ""))
      .map((r) => String(r.name))
      .sort();
    expect(names).toEqual(CS_RISK_NAMES);
    for (const r of rows.filter((x) => CS_RISK_NAMES.includes(x.name ?? ""))) {
      expect(r.domain).toBe("Customer Success");
    }
  });

  test("AC-10: each CS risk's linked_entity_id points at a real CS journey", async () => {
    const rows = (await listCsRisks()).filter((r) => CS_RISK_NAMES.includes(r.name ?? ""));
    for (const r of rows) {
      expect(r.linked_entity_id).toBeTruthy();
      expect(JOURNEY_ID_SET.has(String(r.linked_entity_id))).toBe(true);
    }
  });

  test("AC-10: a re-run adds no duplicate risk", async () => {
    const before = (await listCsRisks()).filter((r) => CS_RISK_NAMES.includes(r.name ?? "")).length;
    await seedCustomerSuccess(BASE);
    const after = (await listCsRisks()).filter((r) => CS_RISK_NAMES.includes(r.name ?? "")).length;
    expect(after).toBe(before);
    expect(after).toBe(3);
  });
});
