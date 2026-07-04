// system-augmentation-model T-15 — Systems view: badges, URL-first filter,
// deep-link render path, view states (AC-10 automated leg, AC-11, AC-12).
//
// The chart is mocked to a prop-echoing stub: recharts' ResponsiveContainer
// measures 0×0 in jsdom, so the honest way to assert "the filter narrows
// the chart data" is to capture what the view feeds it.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { useEffect, useState } from "react";
import { render, screen, waitFor, cleanup, within, fireEvent } from "@testing-library/react";
import { ExplorerSystems } from "../views/explorer/Systems";
import { parseHash } from "../route";

vi.mock("../components/charts", () => ({
  HorizontalBarChartCard: ({ data }: { data: { label: string }[] }) => (
    <div data-testid="chart-stub">
      {data.map((d) => (
        <span key={d.label} data-testid="chart-label">{d.label}</span>
      ))}
    </div>
  ),
}));

const ROWS = [
  {
    system: { id: "s-1", name: "POS", description: "Point of sale", attributes_json: '{"systemKind":"functional"}' },
    uses: 5, domains: [], integrations: 2,
  },
  {
    system: { id: "s-2", name: "AgentX", description: "Autonomous ordering agent", attributes_json: '{"systemKind":"agentic"}' },
    uses: 3, domains: [], integrations: 0,
  },
  {
    system: { id: "s-3", name: "Forecaster", description: "Demand forecasting", attributes_json: '{"systemKind":"ai_predictive"}' },
    uses: 2, domains: [], integrations: 1,
  },
  {
    system: { id: "s-4", name: "LegacyBox", description: "Unmigrated", attributes_json: '{"other":"x"}' },
    uses: 1, domains: [], integrations: 0,
  },
];

function mockRows(rows: unknown[]) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify({ rows }), { status: 200 }),
  );
}

// Minimal App-shaped harness: the view is URL-first — clicking a filter
// rewrites location.hash and the view re-renders from the (re)parsed route.
function Harness() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return <ExplorerSystems route={route} />;
}

function tableEl(): HTMLElement {
  const t = document.querySelector("table");
  expect(t).toBeTruthy();
  return t as HTMLElement;
}

// The chart stub echoes row names too, so name queries are scoped to the
// table. This waits for the ready state (table mounted) first.
async function findInTable(text: string): Promise<HTMLElement> {
  await waitFor(() => expect(document.querySelector("table")).toBeTruthy());
  return within(tableEl()).getByText(text);
}

describe("ExplorerSystems — systemKind badges + filter (AC-10/AC-11/AC-12)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.location.hash = "#/explorer/systems";
  });

  test("AC-10: every row carries a badge with the human label; missing/bogus → unclassified", async () => {
    mockRows(ROWS);
    render(<ExplorerSystems route={parseHash("#/explorer/systems")} />);
    await findInTable("POS");
    const table = within(tableEl());
    expect(table.getByText("Functional")).toBeInTheDocument();
    expect(table.getByText("Agentic")).toBeInTheDocument();
    expect(table.getByText("AI predictive")).toBeInTheDocument();
    expect(table.getByText("unclassified")).toBeInTheDocument();
  });

  test("AC-10: clicking Agentic narrows table + chart and rewrites the hash", async () => {
    mockRows(ROWS);
    render(<Harness />);
    await findInTable("POS");

    fireEvent.click(screen.getByRole("button", { name: "Agentic" }));

    expect(window.location.hash).toBe("#/explorer/systems?kind=agentic");
    await waitFor(() => {
      const table = within(tableEl());
      expect(table.getByText("AgentX")).toBeInTheDocument();
      expect(table.queryByText("POS")).not.toBeInTheDocument();
    });
    // Chart narrows with the table (same filtered rows).
    const chartLabels = screen.getAllByTestId("chart-label").map((el) => el.textContent);
    expect(chartLabels).toEqual(["AgentX"]);
  });

  test("AC-10: deep-link render path — route.params.kind pre-filters", async () => {
    mockRows(ROWS);
    render(<ExplorerSystems route={parseHash("#/explorer/systems?kind=agentic")} />);
    await findInTable("AgentX");
    expect(screen.queryByText("POS")).not.toBeInTheDocument();
    // Active control is the pressed one.
    expect(screen.getByRole("button", { name: "Agentic" })).toHaveAttribute("aria-pressed", "true");
  });

  test("AC-10: unknown ?kind= values behave as All", async () => {
    mockRows(ROWS);
    render(<ExplorerSystems route={parseHash("#/explorer/systems?kind=bogus")} />);
    await findInTable("POS");
    const table = within(tableEl());
    expect(table.getByText("AgentX")).toBeInTheDocument();
    expect(table.getByText("Forecaster")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  });

  test("AC-11: pending fetch → Loading state", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    render(<ExplorerSystems route={parseHash("#/explorer/systems")} />);
    expect(screen.getByText(/loading systems/i)).toBeInTheDocument();
  });

  test("AC-11: failed fetch → ErrorState", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "internal" } }), {
        status: 500,
        statusText: "Internal",
      }),
    );
    render(<ExplorerSystems route={parseHash("#/explorer/systems")} />);
    expect(await screen.findByTestId("error-state")).toBeInTheDocument();
  });

  test("AC-12: zero systems → 'No systems yet' empty state", async () => {
    mockRows([]);
    render(<ExplorerSystems route={parseHash("#/explorer/systems")} />);
    expect(
      await screen.findByText(/no systems yet — create systems via the api or sme surfaces/i),
    ).toBeInTheDocument();
  });

  test("AC-12: active filter with zero matches → clear-filter affordance", async () => {
    // Only functional systems, agentic filter active.
    mockRows([ROWS[0]]);
    render(<ExplorerSystems route={parseHash("#/explorer/systems?kind=agentic")} />);
    expect(
      await screen.findByText(/no agentic systems — clear the filter to see all systems/i),
    ).toBeInTheDocument();
    const clear = screen.getByRole("link", { name: /clear filter/i });
    expect(clear).toHaveAttribute("href", "#/explorer/systems");
  });
});
