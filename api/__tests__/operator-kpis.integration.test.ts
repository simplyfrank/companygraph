import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { closeDriver } from "../src/neo4j/driver";
import { handleOperatorKpis } from "../src/routes/analytics-operator";
import {
  seedOperatorRoot,
  resolveRootViaSeedTruth,
  createKpiForDomain,
  createMeasurement,
  cleanupNeo4j,
} from "./helpers/operator-fixtures";

// cross-function-exec-rollup T-05 — AC-03: /kpis?function=finance_accounting
// returns each finance KPI with status ∈ {on_target,warning,breach,no_data}
// computed from thresholds + latest :KPIMeasurement, plus the per-function
// tally; a KPI with no measurement → no_data. Measurements seeded as
// :KPIMeasurement NODES via the driver (no Postgres measurement fixtures).

const BASE = "http://127.0.0.1:8787";
const nodeIds: string[] = [];

beforeAll(async () => {
  await seedOperatorRoot(BASE);
});
afterEach(async () => {
  await cleanupNeo4j(nodeIds.splice(0));
});
afterAll(async () => {
  await closeDriver();
});

describe("integration: operator kpis", () => {
  test("AC-03: per-function KPI status + tally + no_data", async () => {
    const { functions } = await resolveRootViaSeedTruth();
    const fin = functions.find((f) => f.seedKey === "finance_accounting")!;
    expect(fin).toBeDefined();

    // on_target: higher_is_better, target 100, latest 120
    nodeIds.push("op-kpi-ot", "op-kpi-ot-m");
    await createKpiForDomain("op-kpi-ot", fin.domainId, {
      name: "Op KPI on-target", target_value: 100, target_direction: "higher_is_better",
      warning_threshold: 90, critical_threshold: 80,
    });
    await createMeasurement("op-kpi-ot", "op-kpi-ot-m", 120, "2026-07-01T00:00:00.000Z");

    // breach: higher_is_better, latest 50 < critical 80
    nodeIds.push("op-kpi-br", "op-kpi-br-m");
    await createKpiForDomain("op-kpi-br", fin.domainId, {
      name: "Op KPI breach", target_value: 100, target_direction: "higher_is_better",
      warning_threshold: 90, critical_threshold: 80,
    });
    await createMeasurement("op-kpi-br", "op-kpi-br-m", 50, "2026-07-01T00:00:00.000Z");

    // no_data: no measurement at all
    nodeIds.push("op-kpi-nd");
    await createKpiForDomain("op-kpi-nd", fin.domainId, {
      name: "Op KPI no-data", target_value: 100, target_direction: "higher_is_better",
    });

    const res = await handleOperatorKpis(
      new Request(`${BASE}/api/v1/analytics/operator/kpis?function=finance_accounting`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      functions: Array<{
        function: string;
        kpis: Array<{ kpi_id: string; status: string }>;
        tally: Record<string, number>;
      }>;
    };
    expect(body.functions.length).toBe(1);
    const fn = body.functions[0]!;
    expect(fn.function).toBe("finance_accounting");
    const byId = new Map(fn.kpis.map((k) => [k.kpi_id, k.status]));
    expect(byId.get("op-kpi-ot")).toBe("on_target");
    expect(byId.get("op-kpi-br")).toBe("breach");
    expect(byId.get("op-kpi-nd")).toBe("no_data");
    // tally reflects the four buckets and counts our contributions
    expect(fn.tally.on_target).toBeGreaterThanOrEqual(1);
    expect(fn.tally.breach).toBeGreaterThanOrEqual(1);
    expect(fn.tally.no_data).toBeGreaterThanOrEqual(1);
    // tally sums to the KPI count
    const total = fn.tally.on_target + fn.tally.warning + fn.tally.breach + fn.tally.no_data;
    expect(total).toBe(fn.kpis.length);
  });
});
