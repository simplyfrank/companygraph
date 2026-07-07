// cross-function-exec-rollup T-13 — OperatorCockpit render + slice behaviour
// (AC-12 render legs). The view is mounted directly (with ActiveModelProvider
// + mocked fetch) because the canonical #/insights/operator ROUTE→VIEWS wiring
// is owned by the nav orchestrator (nav-IA restructure 2026-07-07; the former
// #/exec/operator is a redirect alias only). route.ts/SURFACES/views/index.tsx
// are sole-owned by the concurrent nav session, so the one-line VIEWS wiring
// is deferred there and the #/insights/operator → OperatorCockpit resolution
// leg is not exercised here. The slicer emits the canonical #/insights/operator
// hash (asserted below). These tests cover everything that does not depend on
// that VIEWS registration.

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { ActiveModelProvider } from "@/context/ActiveModelContext";
import { OperatorCockpit, functionFromRoute } from "@/views/exec/OperatorCockpit";
import { DEFAULT_ROUTE, type Route } from "@/route";

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

function overview(functions: unknown[]) {
  return {
    saasOperatorRoot: OPERATOR_MODEL.id,
    functions,
  };
}

const SIX_FUNCTIONS = [
  {
    function: "marketing",
    name: "Marketing",
    kpiHealth: { on_target: 2, warning: 1, breach: 0, no_data: 0 },
    riskHeatmap: { low: 1, medium: 0, high: 0, critical: 0 },
    funnelCount: 1,
    slaHealth: { within_target: 0, at_risk: 0, breached: 0 },
  },
  {
    function: "sales",
    name: "Sales",
    kpiHealth: { on_target: 1, warning: 0, breach: 1, no_data: 0 },
    riskHeatmap: { low: 0, medium: 1, high: 0, critical: 0 },
    funnelCount: 1,
    slaHealth: { within_target: 0, at_risk: 0, breached: 0 },
  },
  {
    function: "finance_accounting",
    name: "Finance & Accounting",
    kpiHealth: { on_target: 0, warning: 0, breach: 0, no_data: 3 },
    riskHeatmap: { low: 0, medium: 0, high: 0, critical: 1 },
    funnelCount: 0,
    slaHealth: { within_target: 0, at_risk: 0, breached: 0 },
  },
  {
    function: "customer_success",
    name: "Customer Success",
    kpiHealth: { on_target: 1, warning: 1, breach: 0, no_data: 0 },
    riskHeatmap: { low: 0, medium: 0, high: 1, critical: 0 },
    funnelCount: 0,
    slaHealth: { within_target: 1, at_risk: 0, breached: 1 },
  },
  {
    function: "product_delivery",
    name: "Product & Delivery",
    kpiHealth: { on_target: 2, warning: 0, breach: 0, no_data: 0 },
    riskHeatmap: { low: 3, medium: 0, high: 0, critical: 0 },
    funnelCount: 0,
    slaHealth: { within_target: 0, at_risk: 0, breached: 0 },
  },
  {
    function: "platform_ops",
    name: "Platform Ops",
    kpiHealth: { on_target: 1, warning: 0, breach: 0, no_data: 0 },
    riskHeatmap: { low: 0, medium: 1, high: 1, critical: 1 },
    funnelCount: 0,
    slaHealth: { within_target: 2, at_risk: 1, breached: 0 },
  },
];

function mockFetchOverview(functions: unknown[]) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/analytics/operator/overview")) {
      return new Response(JSON.stringify(overview(functions)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/api/v1/models")) return modelsResponse();
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}

describe("OperatorCockpit render (AC-12)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  afterEach(() => cleanup());

  test("renders the four cross-function panels from the overview", async () => {
    mockFetchOverview(SIX_FUNCTIONS);
    render(
      <ActiveModelProvider>
        <OperatorCockpit route={DEFAULT_ROUTE} />
      </ActiveModelProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("panel-kpis")).toBeTruthy());
    expect(screen.getByTestId("panel-risks")).toBeTruthy();
    expect(screen.getByTestId("panel-funnels")).toBeTruthy();
    expect(screen.getByTestId("panel-slas")).toBeTruthy();
    // it renders the header (consumes useActiveModel for context)
    expect(screen.getByText(/Operator cockpit/i)).toBeTruthy();
  });

  test("consumes useActiveModel: the SaaS-Operator model name appears in the header lede", async () => {
    mockFetchOverview(SIX_FUNCTIONS);
    render(
      <ActiveModelProvider>
        <OperatorCockpit route={DEFAULT_ROUTE} />
      </ActiveModelProvider>,
    );
    // ActiveModelProvider defaults to the only model returned (SaaS Operator).
    await waitFor(() => expect(screen.getByTestId("panel-kpis")).toBeTruthy());
    expect(screen.getByText(/SaaS Operator/)).toBeTruthy();
  });

  test("the function slicer renders All + the six functions", async () => {
    mockFetchOverview(SIX_FUNCTIONS);
    render(
      <ActiveModelProvider>
        <OperatorCockpit route={DEFAULT_ROUTE} />
      </ActiveModelProvider>,
    );
    await waitFor(() => expect(screen.getByText("All functions")).toBeTruthy());
    for (const label of [
      "Marketing",
      "Sales",
      "Finance & Accounting",
      "Customer Success",
      "Product & Delivery",
      "Platform Ops",
    ]) {
      // labels appear both in the slicer and the panel cells; getAllByText
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  test("selecting a function rewrites the hash to ?function=<seedKey> (URL-first slice)", async () => {
    mockFetchOverview(SIX_FUNCTIONS);
    render(
      <ActiveModelProvider>
        <OperatorCockpit route={DEFAULT_ROUTE} />
      </ActiveModelProvider>,
    );
    const salesBtn = await screen.findByRole("button", { name: "Sales" });
    fireEvent.click(salesBtn);
    expect(location.hash).toBe("#/insights/operator?function=sales");
  });

  test("functionFromRoute validates against the six seedKeys; unknown → undefined", () => {
    const mk = (fn: string): Route => ({ ...DEFAULT_ROUTE, params: { function: fn } });
    expect(functionFromRoute(mk("sales"))).toBe("sales");
    expect(functionFromRoute(mk("bogus"))).toBeUndefined();
    expect(functionFromRoute(DEFAULT_ROUTE)).toBeUndefined();
  });
});
