// function-benchmark-scoring T-08 (AC-04, C-02) — coverage: three core
// ratios, keyMarked applicability, unmodeled, and the DISCRIMINATING
// fixture (an ALIGNED_TO KPI with NO MEASURES reads coveredByKpi:true yet
// contributes nothing to metricBenchmark).

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { computeBenchmarkReport } from "../src/storage/function-benchmark";
import {
  seedBenchmarkGraph,
  cleanupBenchmarkGraph,
  type SeedFunction,
} from "./helpers/function-benchmark-fixtures";

const FUNCTIONS: SeedFunction[] = [
  {
    // High coverage: every activity has role + system + KPI coverage.
    seedKey: "marketing",
    name: "Marketing",
    activities: [
      { key: "m1", roles: 1, systemKinds: ["functional"], alignedKpiKeys: ["cov"] },
      { key: "m2", roles: 1, systemKinds: ["functional"], alignedKpiKeys: ["cov"] },
    ],
    // C-02 discriminating KPI: ALIGNED_TO an activity but NO MEASURES edge.
    kpis: [{ key: "cov", measures: false, alignedToDomain: true }],
  },
  {
    // Low coverage: activities lack roles/systems/KPIs.
    seedKey: "sales",
    name: "Sales",
    activities: [{ key: "s1", roles: 0, systemKinds: [] }],
    kpis: [],
  },
  {
    // Unmodeled: zero activities.
    seedKey: "finance_accounting",
    name: "Finance",
    activities: [],
    kpis: [],
  },
];

const byKey = (report: Awaited<ReturnType<typeof computeBenchmarkReport>>, k: string) =>
  report.functions.find((f) => f.seedKey === k)!;

describe("integration: function-benchmark coverage (AC-04, C-02)", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
    await seedBenchmarkGraph(getDriver(), FUNCTIONS);
  });
  afterAll(async () => {
    await cleanupBenchmarkGraph(getDriver());
    await closeDriver();
    _resetDriver();
  });

  test("high-coverage function scores higher than low-coverage", async () => {
    const report = await computeBenchmarkReport(getDriver());
    const hi = byKey(report, "marketing").coverage;
    const lo = byKey(report, "sales").coverage;
    expect(hi.score).toBeGreaterThan(lo.score);
    expect(hi.roleRatio).toBe(1);
    expect(hi.systemRatio).toBe(1);
    expect(hi.kpiRatio).toBe(1);
  });

  test("keyMarked:false drops the marked-key term (not scored 0)", async () => {
    const report = await computeBenchmarkReport(getDriver());
    const hi = byKey(report, "marketing").coverage;
    expect(hi.keyMarked).toBe(false);
    expect(hi.markedKeyCoveredRatio).toBeNull();
    // mean of 3 core ratios (all 1) = 1, NOT diluted by a 0 fourth term.
    expect(hi.score).toBe(1);
  });

  test("C-02: ALIGNED_TO-without-MEASURES → coveredByKpi (coverage) but nothing to metricBenchmark", async () => {
    const report = await computeBenchmarkReport(getDriver());
    const mkt = byKey(report, "marketing");
    // Coverage sees the KPI (kpiRatio 1)…
    expect(mkt.coverage.kpiRatio).toBe(1);
    // …but metricBenchmark sees NO grounded KPI (no MEASURES edge).
    expect(mkt.metricBenchmark.metricGrounded).toBe(false);
    expect(mkt.metricBenchmark.kpis.length).toBe(0);
  });

  test("zero activities → unmodeled:true, coverage 0", async () => {
    const report = await computeBenchmarkReport(getDriver());
    const fin = byKey(report, "finance_accounting").coverage;
    expect(fin.unmodeled).toBe(true);
    expect(fin.score).toBe(0);
    expect(fin.activityCount).toBe(0);
  });
});
