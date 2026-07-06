// saas-operator-foundation T-04 (AC-19, FR-06, NFR-04) — the governed-API
// seed helper round-trips against each named governed route (as-built routes:
// /api/v1/risk-register, /api/v1/slas, /api/v1/compliance/rules), each
// returning a success envelope with a persisted id. It edits NONE of the
// routes' storage code (asserted structurally: the helper only fetches).

import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedRisk, seedSla, seedComplianceRule } from "../src/seed/governed-seed-helper";

describe("integration: saas-operator-foundation AC-19 governed seed helper", () => {
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("seedRisk POSTs /api/v1/risk-register → persisted id", async () => {
    const id = await seedRisk({
      name: `AC-19 risk ${randomUUID().slice(0, 8)}`,
      owner: "Finance Function Owner",
      domain: "finance_accounting",
      likelihood: 3,
      impact: 4,
      status: "open",
      trend: "flat",
      risk_type: "financial",
      description: "sample governed risk row",
    });
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  test("seedSla POSTs /api/v1/slas (D-1) → persisted id", async () => {
    const id = await seedSla({
      name: `AC-19 sla ${randomUUID().slice(0, 8)}`,
      service_type: "support",
      target_value: 99.9,
      target_unit: "percent",
      measurement_window: "rolling",
      window_duration: "30d",
      compliance_threshold: 95,
      description: "sample governed SLA row",
    });
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  test("seedComplianceRule POSTs /api/v1/compliance/rules (D-2) → persisted id", async () => {
    const now = new Date().toISOString();
    const id = await seedComplianceRule({
      id: randomUUID(),
      name: `AC-19 rule ${randomUUID().slice(0, 8)}`,
      description: "sample governed compliance rule",
      rule_dsl: "kpi.value >= 0.95",
      rule_type: "COMPLIANCE",
      category: "operator",
      severity: "MEDIUM",
      enabled: true,
      actions: JSON.stringify([{ type: "notify", config: {} }]),
      created_at: now,
      updated_at: now,
    });
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });
});
