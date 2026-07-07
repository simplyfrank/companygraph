// function-benchmark-scoring T-08 (AC-02) — metricBenchmark: on_target vs
// missed, prose-as-evidence (not compared), no_data exclusion,
// metricGrounded:false exclusion from composite.

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
    seedKey: "marketing",
    name: "Marketing",
    kpis: [
      {
        key: "onTarget",
        measures: true,
        benchmarkProse: "CAC payback < 12mo best-in-class",
        latestValue: 120,
        target_value: 100,
        target_direction: "higher_is_better",
      },
    ],
  },
  {
    seedKey: "sales",
    name: "Sales",
    kpis: [
      { key: "missed", measures: true, latestValue: 50, target_value: 100, target_direction: "higher_is_better" },
    ],
  },
  {
    seedKey: "finance_accounting",
    name: "Finance",
    kpis: [
      // MEASURES but no value → no_data, excluded from denominator.
      { key: "novalue", measures: true, latestValue: null, target_value: 100, target_direction: "higher_is_better" },
    ],
  },
  {
    seedKey: "customer_success",
    name: "Customer Success",
    // zero grounded KPIs → metricGrounded:false.
    activities: [{ key: "c1", roles: 1, systemKinds: ["functional"] }],
    kpis: [],
  },
];

const byKey = (report: Awaited<ReturnType<typeof computeBenchmarkReport>>, k: string) =>
  report.functions.find((f) => f.seedKey === k)!;

describe("integration: function-benchmark metricBenchmark (AC-02)", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
    await seedBenchmarkGraph(getDriver(), FUNCTIONS);
  });
  afterAll(async () => {
    await cleanupBenchmarkGraph(getDriver());
    await closeDriver();
    _resetDriver();
  });

  test("on_target scores higher than missed; prose is evidence-only", async () => {
    const report = await computeBenchmarkReport(getDriver());
    const good = byKey(report, "marketing");
    const bad = byKey(report, "sales");
    expect(good.metricBenchmark.score!).toBeGreaterThan(bad.metricBenchmark.score!);
    expect(good.metricBenchmark.score).toBe(1);
    expect(bad.metricBenchmark.score).toBe(0);
    // prose appears as evidence, never numerically compared.
    expect(good.metricBenchmark.kpis[0]!.benchmarkProse).toBe("CAC payback < 12mo best-in-class");
    expect(good.metricBenchmark.kpis[0]!.verdict).toBe("on_target");
  });

  test("MEASURES KPI with no value → no_data, excluded from denominator", async () => {
    const report = await computeBenchmarkReport(getDriver());
    const fin = byKey(report, "finance_accounting");
    expect(fin.metricBenchmark.metricGrounded).toBe(true);
    expect(fin.metricBenchmark.scoredCount).toBe(0);
    expect(fin.metricBenchmark.noDataCount).toBe(1);
    expect(fin.metricBenchmark.score).toBeNull();
    expect(fin.metricBenchmark.kpis[0]!.verdict).toBe("no_data");
  });

  test("zero grounded KPIs → metricGrounded:false, excluded from composite", async () => {
    const report = await computeBenchmarkReport(getDriver());
    const cs = byKey(report, "customer_success");
    expect(cs.metricBenchmark.metricGrounded).toBe(false);
    expect(cs.metricBenchmark.score).toBeNull();
    // composite = mean of coverage + automation only.
    const expected = (cs.coverage.score + cs.automation.score) / 2;
    expect(cs.composite).toBeCloseTo(expected, 10);
  });
});
