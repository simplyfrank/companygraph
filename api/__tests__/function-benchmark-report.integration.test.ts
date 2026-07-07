// function-benchmark-scoring T-08 (AC-01, AC-06) — six-function report,
// meta, rank, discovered modelId. Exercises computeBenchmarkReport (the
// same call the route handler makes) over a seeded SaaS-Operator root.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { computeBenchmarkReport } from "../src/storage/function-benchmark";
import {
  seedBenchmarkGraph,
  cleanupBenchmarkGraph,
  type SeedFunction,
} from "./helpers/function-benchmark-fixtures";

const SIX: SeedFunction[] = [
  {
    seedKey: "marketing",
    name: "Marketing",
    activities: [{ key: "m1", roles: 1, systemKinds: ["ai_predictive"], alignedKpiKeys: ["mk"] }],
    kpis: [{ key: "mk", measures: true, latestValue: 120, target_value: 100, target_direction: "higher_is_better" }],
  },
  {
    seedKey: "sales",
    name: "Sales",
    activities: [{ key: "s1", roles: 1, systemKinds: ["agentic"] }],
    kpis: [{ key: "sk", measures: true, latestValue: 50, target_value: 100, target_direction: "higher_is_better" }],
  },
  {
    seedKey: "finance_accounting",
    name: "Finance & Accounting",
    activities: [{ key: "f1", roles: 1, systemKinds: ["functional"] }],
    kpis: [{ key: "fk", measures: true, latestValue: 100, target_value: 100, target_direction: "higher_is_better" }],
  },
  {
    seedKey: "customer_success",
    name: "Customer Success",
    activities: [{ key: "c1", systemKinds: [] }],
    kpis: [],
  },
  {
    seedKey: "product_delivery",
    name: "Product & Delivery",
    activities: [{ key: "p1", roles: 1, systemKinds: ["functional"] }],
    kpis: [],
  },
  {
    seedKey: "platform_ops",
    name: "Platform Ops",
    activities: [{ key: "pl1", roles: 1, systemKinds: ["agentic"], keyMarked: true, alignedKpiKeys: ["plk"] }],
    kpis: [{ key: "plk", measures: true, latestValue: 99, target_value: 99, target_direction: "higher_is_better" }],
  },
];

let rootId = "";

describe("integration: function-benchmark report (AC-01, AC-06)", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
    const seeded = await seedBenchmarkGraph(getDriver(), SIX);
    rootId = seeded.rootId;
  });
  afterAll(async () => {
    await cleanupBenchmarkGraph(getDriver());
    await closeDriver();
    _resetDriver();
  });

  test("AC-01: ranked list of six functions with sub-scores + evidence + meta", async () => {
    const report = await computeBenchmarkReport(getDriver());
    expect(report.functions.length).toBe(6);
    for (const f of report.functions) {
      expect(typeof f.seedKey).toBe("string");
      expect(typeof f.name).toBe("string");
      expect(typeof f.composite).toBe("number");
      expect(f.metricBenchmark).toBeDefined();
      expect(f.coverage).toBeDefined();
      expect(f.automation).toBeDefined();
      expect(typeof f.metricBenchmark.metricGrounded).toBe("boolean");
      expect(typeof f.coverage.unmodeled).toBe("boolean");
      expect(f.automation.weights).toBeDefined();
    }
    // meta: functionCount + DISCOVERED modelId (not hard-coded) + weights.
    expect(report.meta.functionCount).toBe(6);
    expect(report.meta.modelId).toBe(rootId);
    expect(report.meta.weights).toEqual({ metricBenchmark: 1, coverage: 1, automation: 1 });
  });

  test("AC-06: rank composite DESC, ties seedKey ASC; no recommendation key", async () => {
    const report = await computeBenchmarkReport(getDriver());
    for (let i = 1; i < report.functions.length; i++) {
      const prev = report.functions[i - 1]!;
      const cur = report.functions[i]!;
      expect(prev.composite >= cur.composite).toBe(true);
      if (prev.composite === cur.composite) {
        expect(prev.seedKey <= cur.seedKey).toBe(true);
      }
    }
    expect(JSON.stringify(report).includes("recommendation")).toBe(false);
    expect(JSON.stringify(report).includes("suggestion")).toBe(false);
  });
});
