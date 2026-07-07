// platform-ops-process-model T-10 (AC-12) — ≥1 uptime, ≥1 incident-response,
// ≥1 backup/restore SLA via POST /api/v1/slas conforming to
// slaCreateRequestSchema, each returning a persisted id on a 200 (D-2 — assert
// 200, never 201); a second run adds no duplicate. Requires the loopback stack.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { slaCreateRequestSchema } from "@companygraph/shared/schema/kpi-sla";
import { seedPlatformOpsPreconditions, seedPlatformOps } from "./helpers/platform-ops-fixtures";
import { SLA_ROWS } from "../src/seed/platform-ops-content";

const BASE = "http://127.0.0.1:8787";

interface SlaRecord {
  id: string;
  name: string;
}

async function listSlas(): Promise<SlaRecord[]> {
  const res = await fetch(`${BASE}/api/v1/slas`);
  const body = (await res.json()) as { rows?: SlaRecord[] };
  return body.rows ?? [];
}

describe("integration: platform-ops SLAs (AC-12)", () => {
  beforeAll(async () => {
    await seedPlatformOpsPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("T-02: the ≥3 SLA rows conform to slaCreateRequestSchema", () => {
    expect(SLA_ROWS.length).toBeGreaterThanOrEqual(3);
    for (const row of SLA_ROWS) {
      expect(slaCreateRequestSchema.safeParse(row).success).toBe(true);
    }
  });

  test("AC-12: the three SLA definitions exist with a persisted id", async () => {
    const slas = await listSlas();
    const byName = new Map(slas.map((s) => [s.name, s]));
    for (const row of SLA_ROWS) {
      const persisted = byName.get(row.name);
      expect(persisted).toBeTruthy();
      expect(typeof persisted!.id).toBe("string");
    }
  });

  test("AC-12 (D-2): a fresh POST /api/v1/slas returns 200 with a persisted id (not 201)", async () => {
    const res = await fetch(`${BASE}/api/v1/slas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: `AC12 probe SLA ${Date.now()}`,
        service_type: "availability",
        target_value: 99,
        target_unit: "percent",
        measurement_window: "average",
        window_duration: "30d",
        compliance_threshold: 99,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id?: string };
    expect(typeof body.id).toBe("string");
  });

  test("AC-12: a second seed run adds no duplicate SLA", async () => {
    const before = (await listSlas()).filter((s) => SLA_ROWS.some((x) => x.name === s.name));
    await seedPlatformOps(BASE);
    const after = (await listSlas()).filter((s) => SLA_ROWS.some((x) => x.name === s.name));
    expect(after.length).toBe(before.length);
    expect(after.length).toBe(SLA_ROWS.length);
  });
});
