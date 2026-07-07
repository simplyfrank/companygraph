// cross-function-exec-rollup T-13 — OperatorCockpit view states
// (AC-13 loading, AC-14 empty, AC-15 error + per-panel error). The view is
// mounted directly (route registration is BLOCKED on saas-operator-foundation
// / the navigation-IA restructure — see operator-cockpit.test.tsx header).

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { ActiveModelProvider } from "@/context/ActiveModelContext";
import { OperatorCockpit } from "@/views/exec/OperatorCockpit";
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

const ALL_ZERO_FUNCTIONS = [
  {
    function: "marketing",
    name: "Marketing",
    kpiHealth: { on_target: 0, warning: 0, breach: 0, no_data: 0 },
    riskHeatmap: { low: 0, medium: 0, high: 0, critical: 0 },
    funnelCount: 0,
    slaHealth: { within_target: 0, at_risk: 0, breached: 0 },
  },
];

const ONE_ERRORED_SIGNAL = [
  {
    function: "marketing",
    name: "Marketing",
    kpiHealth: { error: true }, // per-signal failure
    riskHeatmap: { low: 1, medium: 0, high: 0, critical: 0 },
    funnelCount: 1,
    slaHealth: { within_target: 1, at_risk: 0, breached: 0 },
  },
];

describe("OperatorCockpit states (AC-13/14/15)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  afterEach(() => cleanup());

  test("AC-13: loading skeleton while the overview fetch is in flight", async () => {
    let resolveOverview: (r: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/analytics/operator/overview")) {
        return new Promise<Response>((res) => {
          resolveOverview = res;
        });
      }
      if (url.includes("/api/v1/models")) return modelsResponse();
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });

    render(
      <ActiveModelProvider>
        <OperatorCockpit route={DEFAULT_ROUTE} />
      </ActiveModelProvider>,
    );
    await waitFor(() => expect(screen.getByText(/Loading operator cockpit/i)).toBeTruthy());
    resolveOverview(
      new Response(JSON.stringify({ saasOperatorRoot: "x", functions: [] }), { status: 200 }),
    );
  });

  test("AC-14: empty state (root resolves, all functions empty) prompts the seed command", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/analytics/operator/overview")) {
        return new Response(
          JSON.stringify({ saasOperatorRoot: OPERATOR_MODEL.id, functions: ALL_ZERO_FUNCTIONS }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/api/v1/models")) return modelsResponse();
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });

    render(
      <ActiveModelProvider>
        <OperatorCockpit route={DEFAULT_ROUTE} />
      </ActiveModelProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("cockpit-empty")).toBeTruthy());
    expect(screen.getByText(/seed:saas-operator/i)).toBeTruthy();
  });

  test("AC-15: error state + retry that refetches", async () => {
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/analytics/operator/overview")) {
        calls++;
        if (calls === 1) {
          return new Response(
            JSON.stringify({ error: { code: "internal_error", message: "boom" } }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ saasOperatorRoot: OPERATOR_MODEL.id, functions: ALL_ZERO_FUNCTIONS }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/api/v1/models")) return modelsResponse();
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });

    render(
      <ActiveModelProvider>
        <OperatorCockpit route={DEFAULT_ROUTE} />
      </ActiveModelProvider>,
    );
    const retry = await screen.findByTestId("error-retry");
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByTestId("cockpit-empty")).toBeTruthy());
    expect(calls).toBe(2);
  });

  test("AC-15: per-panel error — one { error:true } signal degrades only that panel", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/analytics/operator/overview")) {
        return new Response(
          JSON.stringify({ saasOperatorRoot: OPERATOR_MODEL.id, functions: ONE_ERRORED_SIGNAL }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/api/v1/models")) return modelsResponse();
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });

    render(
      <ActiveModelProvider>
        <OperatorCockpit route={DEFAULT_ROUTE} />
      </ActiveModelProvider>,
    );
    // the KPI panel shows an inline error…
    await waitFor(() => expect(screen.getByTestId("panel-error-kpis")).toBeTruthy());
    // …while the other three panels still render (not the whole cockpit erroring)
    expect(screen.getByTestId("panel-risks")).toBeTruthy();
    expect(screen.getByTestId("panel-funnels")).toBeTruthy();
    expect(screen.getByTestId("panel-slas")).toBeTruthy();
  });
});
