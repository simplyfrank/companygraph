// product-delivery-process-model T-08 (AC-10) — ≥2 Product/delivery risks POST
// to /api/v1/risk-register with domain="Product & Delivery", valid
// likelihood/impact/status/trend, each with a persisted id + its OQ-4 linked
// entity; a re-run adds no duplicate. Requires the loopback API + Neo4j +
// Postgres up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedSaasOperator } from "../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedProductDelivery } from "../scripts/seed-product-delivery";
import { RISK_ROWS } from "../src/seed/product-delivery/rosters";

const BASE = "http://127.0.0.1:8787";

interface RiskRecord {
  id?: string;
  name?: string;
  domain?: string;
  likelihood?: number;
  impact?: number;
  status?: string;
  trend?: string;
  linked_entity_type?: string | null;
  linked_entity_id?: string | null;
}

async function listRisks(): Promise<RiskRecord[]> {
  const res = await fetch(
    `${BASE}/api/v1/risk-register?domain=${encodeURIComponent("Product & Delivery")}`,
  );
  const body = (await res.json()) as { data?: RiskRecord[] };
  return body.data ?? [];
}

describe("integration: product-delivery risks (AC-10)", () => {
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedProductDelivery(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-10: ≥2 Product risks persist with valid fields + a linked entity", async () => {
    const rows = await listRisks();
    const byName = new Map(rows.map((r) => [r.name, r]));
    let found = 0;
    for (const spec of RISK_ROWS) {
      const r = byName.get(spec.name);
      if (!r) continue;
      found += 1;
      expect(typeof r.id).toBe("string");
      expect(r.domain).toBe("Product & Delivery");
      expect(Number(r.likelihood)).toBe(spec.likelihood);
      expect(Number(r.impact)).toBe(spec.impact);
      expect(r.status).toBe(spec.status);
      expect(r.trend).toBe(spec.trend);
      // OQ-4 — each risk carries a linked entity.
      expect(r.linked_entity_type).toBe(spec.linked_entity_type);
      expect(typeof r.linked_entity_id).toBe("string");
      expect(String(r.linked_entity_id).length).toBeGreaterThan(0);
    }
    expect(found).toBeGreaterThanOrEqual(2);
  });

  test("AC-10: a re-run adds no duplicate risk row", async () => {
    const before = await listRisks();
    await seedProductDelivery(BASE);
    const after = await listRisks();
    // count per roster name is unchanged (idempotent)
    for (const spec of RISK_ROWS) {
      const b = before.filter((r) => r.name === spec.name).length;
      const a = after.filter((r) => r.name === spec.name).length;
      expect(a).toBe(b);
      expect(a).toBeLessThanOrEqual(1);
    }
  });
});
