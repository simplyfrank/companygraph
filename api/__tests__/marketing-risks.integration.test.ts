// marketing-process-model T-08 (AC-12) — three Marketing risks in
// risk_register (domain:"Marketing", likelihood/impact 1–5) with
// linked_entity_id where applicable. Requires the loopback stack up + Postgres.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedSaasOperator } from "../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedMarketing } from "../scripts/seed-marketing";

const BASE = "http://127.0.0.1:8787";

interface RiskRow {
  name: string;
  domain: string;
  likelihood: number;
  impact: number;
  risk_type: string | null;
  linked_entity_id: string | null;
  linked_entity_type: string | null;
}

async function marketingRisks(): Promise<RiskRow[]> {
  const res = await fetch(`${BASE}/api/v1/risk-register?domain=Marketing`);
  const body = (await res.json()) as { data?: RiskRow[] };
  return body.data ?? [];
}

const EXPECTED = [
  "Content brand & compliance risk",
  "Attribution & lead-data quality risk",
  "Email deliverability & channel-dependency risk",
];

describe("integration: marketing risks (AC-12)", () => {
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedMarketing(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-12: the three Marketing risks exist with domain Marketing and 1–5 likelihood/impact", async () => {
    const risks = await marketingRisks();
    const byName = new Map(risks.map((r) => [r.name, r]));
    for (const name of EXPECTED) {
      const r = byName.get(name);
      expect(r).toBeDefined();
      expect(r!.domain).toBe("Marketing");
      expect(r!.likelihood).toBeGreaterThanOrEqual(1);
      expect(r!.likelihood).toBeLessThanOrEqual(5);
      expect(r!.impact).toBeGreaterThanOrEqual(1);
      expect(r!.impact).toBeLessThanOrEqual(5);
    }
  });

  test("AC-12: risks that reference a Marketing entity carry linked_entity_id", async () => {
    const risks = await marketingRisks();
    const linked = risks.filter((r) => EXPECTED.includes(r.name) && r.linked_entity_id);
    expect(linked.length).toBeGreaterThanOrEqual(2);
    for (const r of linked) {
      expect(String(r.linked_entity_id).length).toBeGreaterThan(0);
      expect(["activity", "journey"]).toContain(String(r.linked_entity_type));
    }
  });
});
