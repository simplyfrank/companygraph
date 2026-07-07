// function-benchmark-scoring T-08 (AC-05, Risk 8) — automation:
// augmentation weights, no-system=0, per-systemKind counts, all-functional
// degeneracy via byKind.

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
    activities: [{ key: "m1", systemKinds: ["ai_predictive"] }],
    kpis: [],
  },
  {
    seedKey: "sales",
    name: "Sales",
    activities: [{ key: "s1", systemKinds: ["functional"] }, { key: "s2", systemKinds: ["functional"] }],
    kpis: [],
  },
  {
    seedKey: "finance_accounting",
    name: "Finance",
    activities: [{ key: "f1", systemKinds: [] }],
    kpis: [],
  },
];

const byKey = (report: Awaited<ReturnType<typeof computeBenchmarkReport>>, k: string) =>
  report.functions.find((f) => f.seedKey === k)!;

describe("integration: function-benchmark automation (AC-05, Risk 8)", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
    await seedBenchmarkGraph(getDriver(), FUNCTIONS);
  });
  afterAll(async () => {
    await cleanupBenchmarkGraph(getDriver());
    await closeDriver();
    _resetDriver();
  });

  test("ai_predictive scores higher than functional-only, which beats no-system", async () => {
    const report = await computeBenchmarkReport(getDriver());
    const hi = byKey(report, "marketing").automation;
    const lo = byKey(report, "sales").automation;
    const none = byKey(report, "finance_accounting").automation;
    expect(hi.score).toBeGreaterThan(lo.score);
    expect(lo.score).toBeGreaterThan(none.score);
    expect(none.augmentationTerm).toBe(0);
    expect(none.systemCoverage).toBe(0);
  });

  test("per-systemKind counts + weights in evidence", async () => {
    const report = await computeBenchmarkReport(getDriver());
    const hi = byKey(report, "marketing").automation;
    expect(hi.byKind.ai_predictive).toBe(1);
    expect(hi.weights).toEqual({ functional: 0.34, agentic: 0.67, ai_predictive: 1.0 });
  });

  test("all-functional degeneracy surfaces via byKind", async () => {
    const report = await computeBenchmarkReport(getDriver());
    const sales = byKey(report, "sales").automation;
    expect(sales.byKind.functional).toBe(2);
    expect(sales.byKind.agentic).toBe(0);
    expect(sales.byKind.ai_predictive).toBe(0);
    expect(sales.augmentationTerm).toBeCloseTo(0.34, 10);
  });
});
