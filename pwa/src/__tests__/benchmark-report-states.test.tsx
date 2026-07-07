// function-benchmark-scoring T-09 (AC-11, AC-12, AC-13) — BenchmarkReport
// loading / empty / error states. Error covers a fetch failure; retry
// refetches.

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { ActiveModelProvider } from "@/context/ActiveModelContext";
import { BenchmarkReport } from "@/views/business/BenchmarkReport";
import { DEFAULT_ROUTE } from "@/route";

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

function modelsResponse() {
  return new Response(JSON.stringify([OPERATOR_MODEL]), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const EMPTY_REPORT = {
  functions: [],
  meta: { functionCount: 0, modelId: null, weights: { metricBenchmark: 1, coverage: 1, automation: 1 } },
};

describe("AC-11/12/13: BenchmarkReport states", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  afterEach(() => cleanup());

  test("AC-11: loading skeleton while the report fetch is in flight", async () => {
    let resolveReport: (r: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/analytics/benchmarks/report")) {
        return new Promise<Response>((res) => {
          resolveReport = res;
        });
      }
      if (url.includes("/api/v1/models")) return modelsResponse();
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });

    render(
      <ActiveModelProvider>
        <BenchmarkReport route={DEFAULT_ROUTE} />
      </ActiveModelProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Loading benchmark report/i)).toBeTruthy();
    });
    resolveReport(new Response(JSON.stringify(EMPTY_REPORT), { status: 200 }));
  });

  test("AC-12: empty state (functionCount:0) points to the seed command", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/analytics/benchmarks/report")) {
        return new Response(JSON.stringify(EMPTY_REPORT), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/v1/models")) return modelsResponse();
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });

    render(
      <ActiveModelProvider>
        <BenchmarkReport route={DEFAULT_ROUTE} />
      </ActiveModelProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("benchmark-empty")).toBeTruthy();
    });
    expect(screen.getByText(/seed:saas-operator/i)).toBeTruthy();
  });

  test("AC-13: error state + retry that refetches", async () => {
    let reportCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/analytics/benchmarks/report")) {
        reportCalls++;
        if (reportCalls === 1) {
          return new Response(
            JSON.stringify({ error: { code: "internal_error", message: "boom" } }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(JSON.stringify(EMPTY_REPORT), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/v1/models")) return modelsResponse();
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });

    render(
      <ActiveModelProvider>
        <BenchmarkReport route={DEFAULT_ROUTE} />
      </ActiveModelProvider>,
    );

    const retry = await screen.findByTestId("error-retry");
    expect(retry).toBeTruthy();
    fireEvent.click(retry);

    await waitFor(() => {
      expect(screen.getByTestId("benchmark-empty")).toBeTruthy();
    });
    expect(reportCalls).toBe(2);
  });
});
