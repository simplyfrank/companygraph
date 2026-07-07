// kpi-okr-performance-dashboards T-16 — closes AC-11's automated leg
// (UX-05): every slicer control is keyboard-reachable in DOM order
// (focus order = DOM order — no positive tabindex anywhere), the active
// systemKind button exposes its selected state via aria-pressed, and
// every KPI status is present as TEXT, never color alone.
//
// Mount strategy pinned (tasks C-01 (rev-3), option (b)): this file
// mounts PerformanceDashboard DIRECTLY with mocked fetches — the sibling
// exec-view pattern — which renders no App shell and therefore no
// <main>. The <main>-landmark assertion is deliberately NOT here: it
// moved to T-17's AC-11 manual Safari leg (pwa/src/App.tsx provides the
// landmark at runtime).

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { PerformanceDashboard } from "../views/exec/PerformanceDashboard";
import { parseHash } from "../route";

vi.mock("../components/charts", () => ({
  KpiCard: ({ label, value }: { label: string; value: string | number }) => (
    <div data-testid="kpi-card">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
  LineChartCard: () => <div data-testid="line-chart" />,
}));

const D1 = "018f0000-0000-7000-8000-00000000000d";

const KPI_ROWS = [
  {
    kpi_id: "k-1",
    name: "Conversion rate",
    unit: "%",
    target_value: 3,
    target_direction: "higher_is_better",
    latest_value: 3.4,
    latest_measured_at: "2026-07-01T00:00:00.000Z",
    status: "on_target",
  },
  {
    kpi_id: "k-2",
    name: "Fulfilment lead time",
    unit: "h",
    target_value: 24,
    target_direction: "lower_is_better",
    latest_value: 40,
    latest_measured_at: "2026-07-01T00:00:00.000Z",
    status: "breach",
  },
  {
    kpi_id: "k-3",
    name: "Stock accuracy",
    unit: "%",
    target_value: 99,
    target_direction: "higher_is_better",
    latest_value: 97,
    latest_measured_at: "2026-07-01T00:00:00.000Z",
    status: "warning",
  },
  {
    kpi_id: "k-4",
    name: "Returns rate",
    unit: "%",
    target_value: 5,
    target_direction: "lower_is_better",
    latest_value: null,
    latest_measured_at: null,
    status: "no_data",
  },
];

function mockApi() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const [path] = url.split("?") as [string];
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (path === "/api/v1/domains")
      return json({ rows: [{ id: D1, name: "Commerce", description: "" }] });
    if (path === "/api/v1/analytics/performance/journeys")
      return json({ rows: [{ id: "j-1", name: "Checkout" }] });
    if (path === "/api/v1/analytics/performance/kpis") return json({ rows: KPI_ROWS });
    if (path === "/api/v1/analytics/performance/okr") return json({ rows: [] });
    return json({ rows: [] });
  });
}

async function renderReady(): Promise<void> {
  mockApi();
  // A domain param is set so the journey select is enabled (focusable)
  // and part of the keyboard path.
  render(
    <PerformanceDashboard
      route={parseHash(`#/insights/performance?domain=${D1}&kind=agentic`)}
    />,
  );
  await waitFor(() =>
    expect(screen.queryByText(/Loading performance/)).not.toBeInTheDocument(),
  );
}

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PerformanceDashboard a11y (AC-11 automated leg, UX-05)", () => {
  test("every slicer control is keyboard-reachable, in DOM order (focus order = DOM order)", async () => {
    await renderReady();

    const [domainSelect, journeySelect] = screen.getAllByRole("combobox");
    const kindGroup = screen.getByRole("group", { name: "Filter by system kind" });
    const kindButtons = Array.from(kindGroup.querySelectorAll("button"));
    expect(kindButtons.length).toBe(4); // All + the three kinds

    const controls = [domainSelect!, journeySelect!, ...kindButtons] as HTMLElement[];

    for (const el of controls) {
      // Reachable by Tab: not disabled, not removed from the tab order.
      expect((el as HTMLButtonElement).disabled ?? false).toBe(false);
      expect(el.tabIndex).toBeGreaterThanOrEqual(0); // never tabindex="-1"
      el.focus();
      expect(document.activeElement).toBe(el);
    }

    // DOM order: domain select → journey select → kind buttons — with no
    // positive tabindex, sequential focus navigation follows this order.
    for (let i = 1; i < controls.length; i++) {
      const rel = controls[i - 1]!.compareDocumentPosition(controls[i]!);
      expect(rel & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(document.querySelectorAll('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])').length).toBe(0);
  });

  test("the active systemKind button exposes selected state via aria-pressed", async () => {
    await renderReady();
    expect(screen.getByRole("button", { name: "Agentic" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    for (const label of ["All", "Functional", "AI predictive"]) {
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
  });

  test("each KPI status is present as text (never color alone)", async () => {
    await renderReady();
    expect(screen.getByText("On target")).toBeInTheDocument();
    expect(screen.getByText("Breach")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("No data")).toBeInTheDocument();
  });
});
