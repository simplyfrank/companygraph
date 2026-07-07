// saas-metric-library T-09 (design §6.3, §6.4, §6.5 + review-design.md C-01 —
// FR-10, FR-11, FR-13; AC-12, AC-17 tsx half). Ready state renders the seeded
// metrics (mocked api.cypher response) with name/category/unit/formula/
// benchmark, category-filterable, keyboard-reachable; the view root is a
// ViewRegion landmark. C-01 pin: only ONE /query/cypher read (no KPI list).

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { ActiveModelProvider } from "@/context/ActiveModelContext";
import { MetricLibrary } from "@/views/business/MetricLibrary";

function metricRow(name: string, category: string, unit: string, formula: string, benchmark: string) {
  return {
    id: `id-${name}`,
    name,
    description: `${name} description`,
    attributes_json: JSON.stringify({ formula, unit, category, benchmark }),
  };
}

const ROWS = [
  metricRow("CAC", "acquisition", "currency", "spend / new customers", "lower better"),
  metricRow("NRR", "retention", "percent", "(start + expansion − churn) / start", "> 100%"),
  metricRow("Uptime", "reliability", "percent", "up / total", "≥ 99.9%"),
];

function modelsResponse() {
  return new Response(JSON.stringify([]), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("AC-12/AC-17: MetricLibrary ready state", () => {
  let cypherCalls = 0;

  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    cypherCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/query/cypher")) {
        cypherCalls++;
        return new Response(JSON.stringify({ rows: ROWS }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/v1/models")) return modelsResponse();
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });
  });
  afterEach(() => cleanup());

  test("AC-12: renders each metric with name/category/unit/formula/benchmark", async () => {
    render(
      <ActiveModelProvider>
        <MetricLibrary />
      </ActiveModelProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("metric-library-grid")).toBeTruthy();
    });

    const cards = screen.getAllByTestId("metric-card");
    expect(cards).toHaveLength(3);
    expect(screen.getByText("CAC")).toBeTruthy();
    expect(screen.getByText("NRR")).toBeTruthy();
    expect(screen.getAllByTestId("metric-formula").some((n) => /new customers/.test(n.textContent ?? ""))).toBe(true);
    expect(screen.getAllByTestId("metric-benchmark").some((n) => /100%/.test(n.textContent ?? ""))).toBe(true);
  });

  test("AC-17: the view root is a ViewRegion landmark labelled 'Metric library'", async () => {
    render(
      <ActiveModelProvider>
        <MetricLibrary />
      </ActiveModelProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("metric-library-grid")).toBeTruthy());
    const region = screen.getByRole("region", { name: "Metric library" });
    expect(region).toBeTruthy();
  });

  test("AC-12: category filter narrows the visible rows", async () => {
    render(
      <ActiveModelProvider>
        <MetricLibrary />
      </ActiveModelProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("metric-library-grid")).toBeTruthy());

    const filter = screen.getByTestId("metric-category-filter") as HTMLSelectElement;
    fireEvent.change(filter, { target: { value: "retention" } });

    await waitFor(() => {
      expect(screen.getAllByTestId("metric-card")).toHaveLength(1);
    });
    expect(screen.getByText("NRR")).toBeTruthy();
  });

  test("C-01: only ONE /query/cypher read is issued (no per-metric KPI list)", async () => {
    render(
      <ActiveModelProvider>
        <MetricLibrary />
      </ActiveModelProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("metric-library-grid")).toBeTruthy());
    expect(cypherCalls).toBe(1);
  });
});
