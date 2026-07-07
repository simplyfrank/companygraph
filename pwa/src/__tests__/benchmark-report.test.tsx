// function-benchmark-scoring T-09 (AC-10) — BenchmarkReport ready state:
// renders the six functions with composite + sub-scores + evidence, and NO
// recommendation UI (descriptive-only, XD-11).

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { ActiveModelProvider } from "@/context/ActiveModelContext";
import { BenchmarkReport } from "@/views/business/BenchmarkReport";
import { DEFAULT_ROUTE } from "@/route";
import type { BenchmarkReport as BenchmarkReportData } from "@companygraph/shared/schema/function-benchmark";

const OPERATOR_MODEL = {
  id: "0197a000-0000-7000-8000-0000000000aa",
  name: "SaaS Operator",
  description: "operator",
  ordinal: 2,
  status: "active",
  isReference: false,
  moduleInstanceCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  attributes: { saasOperatorRoot: true },
};

const SEED_KEYS = [
  "marketing",
  "sales",
  "finance_accounting",
  "customer_success",
  "product_delivery",
  "platform_ops",
];

function mkFn(seedKey: string, composite: number): BenchmarkReportData["functions"][number] {
  return {
    seedKey,
    name: seedKey,
    domainId: `d-${seedKey}`,
    composite,
    metricBenchmark: {
      score: 0.5,
      metricGrounded: true,
      onTargetCount: 1,
      scoredCount: 2,
      noDataCount: 0,
      kpis: [
        {
          kpi_id: `k-${seedKey}`,
          name: `KPI ${seedKey}`,
          metricId: "m-1",
          metricName: "Metric",
          benchmarkProse: "best-in-class > 120%",
          latestValue: 10,
          target_value: 5,
          target_direction: "higher_is_better",
          verdict: "on_target",
        },
      ],
    },
    coverage: {
      score: 0.8,
      unmodeled: false,
      keyMarked: false,
      activityCount: 3,
      roleRatio: 1,
      systemRatio: 0.66,
      kpiRatio: 0.66,
      markedKeyCoveredRatio: null,
    },
    automation: {
      score: 0.55,
      systemCoverage: 0.66,
      augmentationTerm: 0.44,
      byKind: { functional: 1, agentic: 1, ai_predictive: 0 },
      weights: { functional: 0.34, agentic: 0.67, ai_predictive: 1.0 },
    },
  };
}

const REPORT: BenchmarkReportData = {
  functions: SEED_KEYS.map((k, i) => mkFn(k, 1 - i * 0.1)),
  meta: {
    functionCount: 6,
    modelId: OPERATOR_MODEL.id,
    weights: { metricBenchmark: 1, coverage: 1, automation: 1 },
  },
};

function mockFetch() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/analytics/benchmarks/report")) {
      return new Response(JSON.stringify(REPORT), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/api/v1/models")) {
      return new Response(JSON.stringify([OPERATOR_MODEL]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

describe("AC-10: BenchmarkReport ready state", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockFetch();
  });
  afterEach(() => cleanup());

  test("renders six function cards with composite + sub-scores", async () => {
    render(
      <ActiveModelProvider>
        <BenchmarkReport route={DEFAULT_ROUTE} />
      </ActiveModelProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("benchmark-grid")).toBeTruthy();
    });
    expect(screen.getAllByTestId("benchmark-card").length).toBe(6);
    expect(screen.getAllByTestId("benchmark-composite").length).toBe(6);
  });

  test("drill-down reveals evidence and no recommendation UI", async () => {
    render(
      <ActiveModelProvider>
        <BenchmarkReport route={DEFAULT_ROUTE} />
      </ActiveModelProvider>,
    );
    const expanders = await screen.findAllByTestId("benchmark-expander");
    expect(expanders[0]!.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(expanders[0]!);
    expect(expanders[0]!.getAttribute("aria-expanded")).toBe("true");
    await waitFor(() => {
      expect(screen.getByTestId("benchmark-evidence")).toBeTruthy();
    });
    // descriptive-only: no recommendation/suggestion text anywhere.
    expect(document.body.textContent?.toLowerCase()).not.toContain("recommend");
    expect(document.body.textContent?.toLowerCase()).not.toContain("suggestion");
  });
});
