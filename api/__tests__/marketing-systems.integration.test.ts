// marketing-process-model T-13 (AC-04) — USES_SYSTEM resolves; shared CRM/DW
// single node; every Marketing system has a valid systemKind; a systemKind-less
// fixture row is rejected 400 attribute_violation (payload-atomic); any
// INTEGRATES_WITH pair resolves. Requires the loopback stack up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { SYSTEM_KINDS } from "@companygraph/shared/schema/system-kind";
import { seedSaasOperator } from "../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedMarketing } from "../scripts/seed-marketing";

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

const MARKETING_SYSTEM_KEYS = ["map", "cms", "webinar-platform", "ad-platform", "analytics-attribution", "lead-scoring-ai"];

describe("integration: marketing systems + systemKind enforcement (AC-04)", () => {
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedMarketing(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-04: Marketing activities' USES_SYSTEM edges resolve to systems", async () => {
    const res = await cypher(`
      MATCH (a:Activity)-[:PART_OF]->(:UserJourney)-[:PART_OF]->(d:Domain)
      WHERE d.attributes_json CONTAINS '"seedKey":"marketing"'
      MATCH (a)-[:USES_SYSTEM]->(s:System)
      RETURN count(s) AS n`);
    expect(num(res.rows[0]!.n)).toBeGreaterThan(0);
  });

  test("AC-04: every Marketing-specific system carries a valid systemKind", async () => {
    for (const key of MARKETING_SYSTEM_KEYS) {
      const res = await cypher(
        `MATCH (s:System) WHERE s.attributes_json CONTAINS $needle RETURN s.attributes_json AS a`,
        { needle: `"seedKey":"${key}"` },
      );
      expect(res.rows.length).toBe(1);
      const attrs = JSON.parse(String(res.rows[0]!.a)) as { systemKind?: string };
      expect(SYSTEM_KINDS).toContain(attrs.systemKind as (typeof SYSTEM_KINDS)[number]);
    }
  });

  test("AC-04: shared CRM/Data Warehouse resolve to a single foundation-seeded System", async () => {
    for (const key of ["crm", "data_warehouse"]) {
      const res = await cypher(`MATCH (s:System {operatorSeedKey:$key}) RETURN count(s) AS n`, { key });
      expect(num(res.rows[0]!.n)).toBe(1);
    }
  });

  test("AC-04: a systemKind-less System fixture row is rejected 400 attribute_violation, nothing written", async () => {
    const res = await fetch(`${BASE}/api/v1/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nodes: [
          {
            label: "System",
            id: "018f0210-0000-7000-8000-0000000009ff",
            name: "Bad Marketing System",
            description: "missing systemKind",
            attributes: { seedKey: "bad-system", systemKind: 42 },
          },
        ],
        edges: [],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { imported: { nodes: number }; errors?: Array<{ code: string }> };
    expect(body.imported.nodes).toBe(0);
    expect(body.errors?.some((e) => e.code === "attribute_violation")).toBe(true);
    // Nothing written.
    const check = await cypher(`MATCH (s:System {id:"018f0210-0000-7000-8000-0000000009ff"}) RETURN count(s) AS n`);
    expect(num(check.rows[0]!.n)).toBe(0);
  });

  test("AC-04: an INTEGRATES_WITH pair (MAP↔CMS) resolves", async () => {
    const res = await cypher(`
      MATCH (a:System)-[:INTEGRATES_WITH]->(b:System)
      WHERE a.attributes_json CONTAINS '"seedKey":"map"'
      RETURN count(*) AS n`);
    expect(num(res.rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });
});
