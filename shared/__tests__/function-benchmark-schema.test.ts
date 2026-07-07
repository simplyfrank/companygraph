// function-benchmark-scoring T-01 verification — asserts the wire shape
// accepts a well-formed report, rejects an unexpected `recommendation`
// key (strict-shape guard, NFR-04/XD-11), and that meta.modelId accepts
// null (the empty-200 no-root case, DD-10).

import { describe, it, expect } from "bun:test";
import {
  benchmarkReportSchema,
  type BenchmarkReport,
} from "../src/schema/function-benchmark";

const wellFormed: BenchmarkReport = {
  functions: [
    {
      seedKey: "marketing",
      name: "Marketing",
      domainId: "d-1",
      composite: 0.72,
      metricBenchmark: {
        score: 0.5,
        metricGrounded: true,
        onTargetCount: 1,
        scoredCount: 2,
        noDataCount: 0,
        kpis: [
          {
            kpi_id: "k-1",
            name: "CAC",
            metricId: "m-1",
            metricName: "Customer Acquisition Cost",
            benchmarkProse: "CAC payback < 12 months healthy",
            latestValue: 900,
            target_value: 1000,
            target_direction: "lower_is_better",
            verdict: "on_target",
          },
        ],
      },
      coverage: {
        score: 0.8,
        unmodeled: false,
        keyMarked: false,
        activityCount: 5,
        roleRatio: 1,
        systemRatio: 0.8,
        kpiRatio: 0.6,
        markedKeyCoveredRatio: null,
      },
      automation: {
        score: 0.55,
        systemCoverage: 0.8,
        augmentationTerm: 0.3,
        byKind: { functional: 3, agentic: 1, ai_predictive: 0 },
        weights: { functional: 0.34, agentic: 0.67, ai_predictive: 1.0 },
      },
    },
  ],
  meta: {
    functionCount: 1,
    modelId: "root-1",
    weights: { metricBenchmark: 1.0, coverage: 1.0, automation: 1.0 },
  },
};

describe("function-benchmark wire shape (T-01)", () => {
  it("accepts a well-formed report", () => {
    const r = benchmarkReportSchema.safeParse(wellFormed);
    expect(r.success).toBe(true);
  });

  it("rejects a report carrying an unexpected recommendation key (strict-shape guard, NFR-04)", () => {
    const withRec = {
      ...wellFormed,
      functions: [
        { ...wellFormed.functions[0], recommendation: "automate the funnel" },
      ],
    };
    const r = benchmarkReportSchema.safeParse(withRec);
    expect(r.success).toBe(false);
  });

  it("accepts meta.modelId === null (empty-200 no-root case, DD-10)", () => {
    const emptyReport = {
      functions: [],
      meta: {
        functionCount: 0,
        modelId: null,
        weights: { metricBenchmark: 1.0, coverage: 1.0, automation: 1.0 },
      },
    };
    const r = benchmarkReportSchema.safeParse(emptyReport);
    expect(r.success).toBe(true);
  });
});
