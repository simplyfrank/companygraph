// product-delivery-process-model T-12 (AC-05) — every system-using activity has
// a USES_SYSTEM edge; shared systems (moms/data_warehouse) resolve to the
// foundation catalog (no duplicate System), slice-local systems carry a valid
// systemKind + resolve by seedKey; a re-run adds no duplicate. Requires the
// loopback API + Neo4j + Postgres up.

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { seedSaasOperator } from "../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedProductDelivery } from "../scripts/seed-product-delivery";
import { SYSTEM_ROWS } from "../src/seed/product-delivery/rosters";
import { systemKindSchema } from "@companygraph/shared/schema/system-kind";

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

describe("integration: product-delivery systems (AC-05)", () => {
  beforeAll(async () => {
    await seedSaasOperator(BASE);
    await seedSaasMetricLibrary(BASE);
    await seedProductDelivery(BASE);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-05: every system-using activity has a USES_SYSTEM edge", async () => {
    const usedByActivity = new Set(SYSTEM_ROWS.flatMap((s) => s.usedBy));
    for (const actKey of usedByActivity) {
      const res = await cypher(
        `MATCH (a:Activity)-[:USES_SYSTEM]->(s:System)
         WHERE a.attributes_json CONTAINS $seedKey
         RETURN count(s) AS n`,
        { seedKey: actKey },
      );
      expect(num(res.rows[0]?.n)).toBeGreaterThanOrEqual(1);
    }
  });

  test("AC-05: shared systems resolve to the foundation catalog (no duplicate)", async () => {
    for (const sys of SYSTEM_ROWS.filter((s) => s.origin === "shared")) {
      // The foundation catalog node carries operatorSeedKey; assert exactly one.
      const res = await cypher(
        `MATCH (s:System) WHERE s.operatorSeedKey=$key RETURN count(s) AS n`,
        { key: sys.seedKey },
      );
      expect(num(res.rows[0]?.n)).toBe(1);
    }
  });

  test("AC-05: slice-local systems carry a valid systemKind + resolve by seedKey", async () => {
    for (const sys of SYSTEM_ROWS.filter((s) => s.origin === "slice-local")) {
      const res = await cypher(
        `MATCH (s:System) WHERE s.attributes_json CONTAINS $seedKey
         RETURN s.attributes_json AS a, count(s) AS n`,
        { seedKey: sys.seedKey },
      );
      expect(num(res.rows[0]?.n)).toBe(1);
      const attrs = JSON.parse(String(res.rows[0]?.a ?? "{}")) as {
        systemKind?: string;
      };
      expect(systemKindSchema.safeParse(attrs.systemKind).success).toBe(true);
    }
  });

  test("AC-05: re-run adds no duplicate slice-local system", async () => {
    await seedProductDelivery(BASE);
    for (const sys of SYSTEM_ROWS.filter((s) => s.origin === "slice-local")) {
      const res = await cypher(
        `MATCH (s:System) WHERE s.attributes_json CONTAINS $seedKey RETURN count(s) AS n`,
        { seedKey: sys.seedKey },
      );
      expect(num(res.rows[0]?.n)).toBe(1);
    }
  });
});
