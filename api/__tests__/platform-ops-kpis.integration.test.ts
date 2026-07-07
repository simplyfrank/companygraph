// platform-ops-process-model T-10 (AC-07) — the 5 KPIs exist as KPI nodes via
// POST /api/v1/kpis; also asserts each row parses the internal kpiRow shape.
// Requires the loopback stack up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedPlatformOpsPreconditions } from "./helpers/platform-ops-fixtures";
import { KPI_ROWS, kpiRow } from "../src/seed/platform-ops-content";

const BASE = "http://127.0.0.1:8787";

async function cypher(statement: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${BASE}/api/v1/query/cypher`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ statement, params }),
  });
  return (await res.json()) as { rows: Array<Record<string, unknown>> };
}

function num(v: unknown): number {
  if (v && typeof v === "object" && "low" in (v as Record<string, unknown>)) {
    return Number((v as { low: number }).low);
  }
  return Number(v ?? 0);
}

const KPI_NAMES = [
  "Fleet uptime",
  "MTTR",
  "Deploy frequency",
  "Error budget burn",
  "Backup success rate",
];

describe("integration: platform-ops KPIs (AC-07)", () => {
  beforeAll(async () => {
    await seedPlatformOpsPreconditions(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("T-02: all 5 KPI rows parse the internal kpiRow shape", () => {
    expect(KPI_ROWS).toHaveLength(5);
    for (const row of KPI_ROWS) {
      expect(kpiRow.safeParse(row).success).toBe(true);
    }
  });

  test("AC-07: the 5 KPIs exist as KPI nodes scoped to the platform_ops domain", async () => {
    const res = await cypher(
      `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
       WHERE d.attributes_json CONTAINS 'platform_ops'
       MATCH (k:KPI) WHERE k.domain_id = d.id AND k.name IN $names
       RETURN k.name AS name ORDER BY k.name`,
      { names: KPI_NAMES } as Record<string, unknown>,
    );
    const names = res.rows.map((r) => String(r.name)).sort();
    expect(names).toEqual([...KPI_NAMES].sort());
  });

  test("AC-07: no duplicate KPI per name in the platform_ops domain", async () => {
    for (const name of KPI_NAMES) {
      const res = await cypher(
        `MATCH (d:Domain)-[:IN_MODEL]->(:BusinessModel {name:"SaaS Operator"})
         WHERE d.attributes_json CONTAINS 'platform_ops'
         MATCH (k:KPI {name:$name}) WHERE k.domain_id = d.id AND k.archived_at IS NULL
         RETURN count(k) AS n`,
        { name },
      );
      expect(num(res.rows[0]!.n)).toBe(1);
    }
  });
});
