// finance-accounting-process-model T-07/T-08 verification (AC-08, AC-09). After
// seed:finance-risks, five risk_register rows exist with domain "Finance &
// Accounting" and risk_type in {financial,compliance}, plus one compliance_rules
// row; running the seed a SECOND time adds zero rows (client-side dedup keyed on
// the `name` marker).
//
// Requires the loopback API + Neo4j + Postgres up.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedFinanceRisks } from "../scripts/seed-finance-risks";
import { FINANCE_RISKS, FINANCE_COMPLIANCE, FINANCE_RISK_DOMAIN } from "../scripts/finance-ids";

const BASE = "http://127.0.0.1:8787";

interface RiskRecord {
  id: string;
  name: string;
  domain: string;
  risk_type: string | null;
}

async function listFinanceRisks(): Promise<RiskRecord[]> {
  const res = await fetch(
    `${BASE}/api/v1/risk-register?domain=${encodeURIComponent(FINANCE_RISK_DOMAIN)}`,
  );
  expect(res.ok).toBe(true);
  const body = (await res.json()) as { data?: RiskRecord[] };
  return body.data ?? [];
}

async function listFinanceComplianceNames(): Promise<string[]> {
  const res = await fetch(`${BASE}/api/v1/compliance/rules`);
  expect(res.ok).toBe(true);
  const rows = (await res.json()) as Array<{ name?: string }>;
  return rows.map((r) => r.name ?? "").filter((n) => n.startsWith("Finance:"));
}

describe("integration: finance risks + compliance", () => {
  beforeAll(async () => {
    await seedFinanceRisks(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-08: five finance risk rows with valid domain + risk_type", async () => {
    const rows = await listFinanceRisks();
    const byName = new Map(rows.map((r) => [r.name, r]));
    for (const risk of FINANCE_RISKS) {
      const row = byName.get(risk.name);
      expect(row).toBeDefined();
      expect(row!.domain).toBe(FINANCE_RISK_DOMAIN);
      expect(["financial", "compliance"]).toContain(row!.risk_type);
      expect(typeof row!.id).toBe("string");
    }
  });

  test("AC-08: one finance compliance rule row", async () => {
    const names = await listFinanceComplianceNames();
    for (const rule of FINANCE_COMPLIANCE) {
      expect(names).toContain(rule.name);
    }
  });

  test("AC-09: a second seed run adds zero rows (dedup by name marker)", async () => {
    const risksBefore = (await listFinanceRisks()).length;
    const complianceBefore = (await listFinanceComplianceNames()).length;

    const result = await seedFinanceRisks(BASE);
    expect(result.riskIds).toHaveLength(0);
    expect(result.complianceIds).toHaveLength(0);

    const risksAfter = (await listFinanceRisks()).length;
    const complianceAfter = (await listFinanceComplianceNames()).length;
    expect(risksAfter).toBe(risksBefore);
    expect(complianceAfter).toBe(complianceBefore);
  });
});
