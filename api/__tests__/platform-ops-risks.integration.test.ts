// platform-ops-process-model T-10 (AC-11) — ≥1 operational, ≥1 security, ≥1
// technical risk via POST /api/v1/risk-register conforming to createRiskSchema,
// each with a persisted id; a second seed run adds no duplicate (client-side
// name guard). Requires the loopback stack (Postgres) up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedPlatformOpsPreconditions, seedPlatformOps } from "./helpers/platform-ops-fixtures";
import { RISK_ROWS, riskRow } from "../src/seed/platform-ops-content";

const BASE = "http://127.0.0.1:8787";

interface RiskRecord {
  id: string;
  name: string;
  risk_type: string | null;
  domain: string;
  likelihood: number;
  impact: number;
}

async function listRisks(): Promise<RiskRecord[]> {
  const res = await fetch(
    `${BASE}/api/v1/risk-register?domain=${encodeURIComponent("Platform Ops")}`,
  );
  const body = (await res.json()) as { data?: RiskRecord[] };
  return body.data ?? [];
}

describe("integration: platform-ops risks (AC-11)", () => {
  beforeAll(async () => {
    await seedPlatformOpsPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("T-02: the ≥3 risk rows parse the internal riskRow shape", () => {
    expect(RISK_ROWS.length).toBeGreaterThanOrEqual(3);
    for (const row of RISK_ROWS) {
      expect(riskRow.safeParse(row).success).toBe(true);
    }
  });

  test("AC-11: ≥1 operational, ≥1 security, ≥1 technical risk each with a persisted id", async () => {
    const risks = await listRisks();
    const byName = new Map(risks.map((r) => [r.name, r]));
    for (const row of RISK_ROWS) {
      const persisted = byName.get(row.name);
      expect(persisted).toBeTruthy();
      expect(typeof persisted!.id).toBe("string");
      expect(persisted!.risk_type).toBe(row.risk_type);
      expect(persisted!.likelihood).toBeGreaterThanOrEqual(1);
      expect(persisted!.impact).toBeLessThanOrEqual(5);
    }
    const types = new Set(RISK_ROWS.map((r) => r.risk_type));
    expect(types.has("operational")).toBe(true);
    expect(types.has("security")).toBe(true);
    expect(types.has("technical")).toBe(true);
  });

  test("AC-11: a second seed run adds no duplicate (client-side name guard)", async () => {
    const before = await listRisks();
    const beforeMine = before.filter((r) => RISK_ROWS.some((x) => x.name === r.name));
    await seedPlatformOps(BASE);
    const after = await listRisks();
    const afterMine = after.filter((r) => RISK_ROWS.some((x) => x.name === r.name));
    expect(afterMine.length).toBe(beforeMine.length);
    expect(afterMine.length).toBe(RISK_ROWS.length);
  });
});
