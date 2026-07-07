// sales-process-model T-09 (AC-11) — the four Sales risks via the governed
// risk-register API, each with valid likelihood/impact/status/risk_type and a
// linked_entity where applicable. Requires the stack up (+ Postgres).

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { BASE, salesSeedReady, skipMsg } from "./sales-test-harness";

const RISK_NAMES = [
  "Pipeline-coverage shortfall",
  "Discount / margin leakage in Deal Desk",
  "CRM data-quality / forecast accuracy",
  "Key-person dependency on a top AE",
];

interface RiskRow {
  name: string;
  likelihood: number;
  impact: number;
  status: string;
  risk_type: string;
  linked_entity_id?: string | null;
}

async function salesRisks(): Promise<RiskRow[]> {
  const res = await fetch(`${BASE}/api/v1/risk-register?domain=Sales`);
  const body = (await res.json()) as { data?: RiskRow[] };
  return body.data ?? [];
}

describe("integration: sales risks (AC-11)", () => {
  let ready = false;
  beforeAll(async () => {
    ready = await salesSeedReady();
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-11: the four Sales risks exist with valid attributes", async () => {
    if (!ready) return skipMsg("AC-11");
    const rows = await salesRisks();
    for (const name of RISK_NAMES) {
      const r = rows.find((x) => x.name === name);
      expect(r).toBeDefined();
      expect(r!.likelihood).toBeGreaterThanOrEqual(1);
      expect(r!.likelihood).toBeLessThanOrEqual(5);
      expect(r!.impact).toBeGreaterThanOrEqual(1);
      expect(r!.impact).toBeLessThanOrEqual(5);
      expect(["open", "mitigating", "accepted", "resolved"]).toContain(r!.status);
      expect(["strategic", "operational", "financial", "compliance", "security", "technical"]).toContain(r!.risk_type);
    }
  });
});
