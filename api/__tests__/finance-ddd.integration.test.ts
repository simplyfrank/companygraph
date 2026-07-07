// finance-accounting-process-model T-09 verification (AC-10). The DDD mapping
// rides the system.attributes.boundedContext TAG (DD-05, OQ-4 b) with ZERO
// DDD-route/schema dependency: the three slice-added finance systems each carry
// a non-empty boundedContext per §4.4. The OQ-1 flag (C-04) is asserted
// informationally: the FinOps KPI carries zero MEASURES edges (observable
// knowingly-temporary XD-06 exception).
//
// Requires the loopback API + Neo4j + Postgres up.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { ensureMetricDefinitionLabel } from "../src/seed/ensure-metric-label";
import { ensureMeasuresEdgeType } from "../src/seed/ensure-measures-edge";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedFinanceGraph } from "../scripts/seed-finance-graph";
import { FINANCE_SYSTEMS } from "../scripts/finance-ids";

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

async function importSlice() {
  const path = resolve(import.meta.dir, "../../shared/seed/saas-operator/finance-accounting.json");
  await fetch(`${BASE}/api/v1/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: readFileSync(path, "utf8"),
  });
}

describe("integration: finance DDD boundedContext tags + OQ-1 flag", () => {
  beforeAll(async () => {
    await ensureMetricDefinitionLabel(BASE);
    await ensureMeasuresEdgeType(BASE);
    await seedSaasMetricLibrary(BASE);
    await importSlice();
    await seedFinanceGraph(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-10: the three finance systems carry the boundedContext tag (no DDD route)", async () => {
    for (const sys of FINANCE_SYSTEMS) {
      const res = await cypher(
        `MATCH (s:System) WHERE s.attributes_json CONTAINS $seedKey RETURN s.attributes_json AS a`,
        { seedKey: sys.seedKey },
      );
      expect(res.rows.length).toBe(1);
      const attrs = JSON.parse(String(res.rows[0]!.a)) as Record<string, unknown>;
      expect(typeof attrs.boundedContext).toBe("string");
      expect((attrs.boundedContext as string).length).toBeGreaterThan(0);
      expect(attrs.boundedContext).toBe(sys.boundedContext);
    }
  });

  test("OQ-1 flag (C-04): the FinOps Cloud Cost per Tenant KPI carries zero MEASURES edges", async () => {
    const res = await cypher(
      `MATCH (k:KPI {name:'Cloud Cost per Tenant'}) OPTIONAL MATCH (k)-[r:MEASURES]->() RETURN count(r) AS n`,
    );
    expect(num(res.rows[0]!.n)).toBe(0);
  });
});
