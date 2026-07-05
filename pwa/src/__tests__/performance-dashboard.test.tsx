// kpi-okr-performance-dashboards T-15 — closes AC-07 (URL-first deep
// link + hash rewrite), AC-08 (loading/error/ready), AC-09 (empty
// variants + clear-slice affordance), AC-12 (slice click path narrows
// both panels; selected-KPI sparkline from a mocked kpi-trends).
//
// Charts are mocked to prop-echoing stubs (recharts' ResponsiveContainer
// measures 0×0 in jsdom — the sibling system-kind-filter pattern), so
// "the sparkline renders from the mocked kpi-trends response" is
// asserted on the data the view feeds the stub.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { useEffect, useState } from "react";
import { render, screen, waitFor, cleanup, fireEvent, within } from "@testing-library/react";
import { PerformanceDashboard } from "../views/exec/PerformanceDashboard";
import { parseHash } from "../route";

vi.mock("../components/charts", () => ({
  KpiCard: ({ label, value, tone }: { label: string; value: string | number; tone?: string }) => (
    <div data-testid="kpi-card" data-tone={tone}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
  LineChartCard: ({ title, data }: { title: string; data: { label: string; value: number }[] }) => (
    <div data-testid="line-chart" data-title={title}>
      {data.map((d) => (
        <span key={d.label} data-testid="trend-point">{`${d.label}:${d.value}`}</span>
      ))}
    </div>
  ),
}));

const D1 = "018f0000-0000-7000-8000-00000000000d";
const J1 = "018f0000-0000-7000-8000-00000000000e";

const KPI_ALL = [
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
];
const KPI_AGENTIC = [KPI_ALL[1]!];

const OKR_ALL = [
  {
    directive_id: "dir-1",
    directive_name: "Grow digital revenue",
    key_results: [{ id: "kr-1", name: "Online share 40%", progress: 55 }],
    domains: [
      {
        domain_id: D1,
        domain_name: "Commerce",
        status: "pending",
        weight: 0.5,
        adjustment_requested: true,
      },
    ],
  },
  {
    directive_id: "dir-2",
    directive_name: "Cut operational cost",
    key_results: [],
    domains: [],
  },
];
const OKR_D1 = [OKR_ALL[0]!];

const TREND = {
  measurements: [
    { id: "m-1", measured_at: "2026-06-28T00:00:00.000Z", value: 2.9 },
    { id: "m-2", measured_at: "2026-06-29T00:00:00.000Z", value: 3.4 },
  ],
};

interface MockConfig {
  kpis?: (params: URLSearchParams) => unknown[];
  failKpis?: boolean;
}

const requests: string[] = [];

function mockApi(config: MockConfig = {}) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    requests.push(url);
    const [path, qs] = url.split("?") as [string, string | undefined];
    const params = new URLSearchParams(qs ?? "");
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status });

    if (path === "/api/v1/domains") return json({ rows: [{ id: D1, name: "Commerce", description: "" }] });
    if (path === "/api/v1/analytics/performance/journeys")
      return json({ rows: params.get("domain") === D1 ? [{ id: J1, name: "Checkout" }] : [] });
    if (path === "/api/v1/analytics/performance/kpis") {
      if (config.failKpis) return json({ error: { code: "neo4j_unreachable", message: "boom" } }, 500);
      if (config.kpis) return json({ rows: config.kpis(params) });
      // Default slice behavior: kind=agentic narrows; journey narrows.
      if (params.get("kind") === "agentic" || params.get("journey") === J1)
        return json({ rows: KPI_AGENTIC });
      return json({ rows: KPI_ALL });
    }
    if (path === "/api/v1/analytics/performance/okr")
      return json({ rows: params.get("domain") === D1 ? OKR_D1 : OKR_ALL });
    if (path.startsWith("/api/v1/kpi-trends/")) return json(TREND);
    return json({ error: { code: "not_found", message: url } }, 404);
  });
}

// Minimal App-shaped harness: URL-first — slice clicks rewrite
// location.hash and the view re-renders from the (re)parsed route.
function Harness() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return <PerformanceDashboard route={route} />;
}

async function waitReady(): Promise<void> {
  await waitFor(() =>
    expect(screen.queryByText(/Loading performance/)).not.toBeInTheDocument(),
  );
}

function selects(): HTMLSelectElement[] {
  return screen.getAllByRole("combobox") as HTMLSelectElement[];
}

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
  requests.length = 0;
  window.location.hash = "#/exec/performance";
});

describe("PerformanceDashboard — AC-07 deep link + URL-first slice", () => {
  test("mounting with domain/journey/kind params renders pre-sliced on all three axes", async () => {
    mockApi();
    window.location.hash = `#/exec/performance?domain=${D1}&journey=${J1}&kind=agentic`;
    render(<Harness />);
    await waitReady();

    // All three slicers show active.
    const [domainSelect, journeySelect] = selects();
    expect(domainSelect!.value).toBe(D1);
    expect(journeySelect!.value).toBe(J1);
    expect(screen.getByRole("button", { name: "Agentic" })).toHaveAttribute("aria-pressed", "true");

    // The KPI fetch carried the full slice (server-side narrowing).
    const kpiReq = requests.find((r) => r.includes("/analytics/performance/kpis"));
    expect(kpiReq).toContain(`domain=${D1}`);
    expect(kpiReq).toContain(`journey=${J1}`);
    expect(kpiReq).toContain("kind=agentic");

    // Rows are the sliced set.
    expect(screen.getByText("Fulfilment lead time")).toBeInTheDocument();
    expect(screen.queryByText("Conversion rate")).not.toBeInTheDocument();
  });

  test("a slice change rewrites the hash (URL-first) without full navigation", async () => {
    mockApi();
    render(<Harness />);
    await waitReady();

    fireEvent.click(screen.getByRole("button", { name: "Agentic" }));
    expect(window.location.hash).toBe("#/exec/performance?kind=agentic");

    await waitFor(() =>
      expect(screen.queryByText("Conversion rate")).not.toBeInTheDocument(),
    );
    // Clearing the axis rewrites again.
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(window.location.hash).toBe("#/exec/performance");
  });
});

describe("PerformanceDashboard — AC-08 view states", () => {
  test("loading state while the aggregates fetch", async () => {
    mockApi();
    render(<Harness />);
    expect(screen.getByText(/Loading performance/)).toBeInTheDocument();
    await waitReady();
  });

  test("a failed aggregate fetch renders the error state", async () => {
    mockApi({ failKpis: true });
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("error-state")).toBeInTheDocument());
  });

  test("ready state renders KPI status panel + OKR roll-down panel", async () => {
    mockApi();
    render(<Harness />);
    await waitReady();

    expect(screen.getAllByTestId("kpi-card")).toHaveLength(2);
    // Status as TEXT pills, never color alone.
    expect(screen.getByText("On target")).toBeInTheDocument();
    expect(screen.getByText("Breach")).toBeInTheDocument();

    const okrPanel = screen.getByRole("region", { name: "OKR roll-down performance" });
    expect(within(okrPanel).getByText("Grow digital revenue")).toBeInTheDocument();
    expect(within(okrPanel).getByText("Awaiting")).toBeInTheDocument(); // display mapping of `pending`
    expect(within(okrPanel).getByText("Adjustment requested")).toBeInTheDocument();
    // Link-out only, no mutation controls.
    expect(within(okrPanel).getByRole("link", { name: "Open OKR Management" })).toHaveAttribute(
      "href",
      "#/exec/okr-management",
    );
  });
});

describe("PerformanceDashboard — AC-09 empty variants", () => {
  test("zero KPIs with no active slice → 'No KPIs yet'", async () => {
    mockApi({ kpis: () => [] });
    render(<Harness />);
    await waitReady();
    expect(screen.getByTestId("empty-no-kpis")).toHaveTextContent("No KPIs yet");
  });

  test("active slice matching zero KPIs → distinct message + working clear-slice affordance", async () => {
    mockApi({ kpis: (params) => (params.get("kind") === "agentic" ? [] : KPI_ALL) });
    window.location.hash = "#/exec/performance?kind=agentic";
    render(<Harness />);
    await waitReady();

    expect(screen.getByTestId("empty-slice")).toHaveTextContent("No KPIs match this slice");
    fireEvent.click(screen.getByRole("button", { name: "Clear kind filter" }));
    expect(window.location.hash).toBe("#/exec/performance"); // axis reset to All
    await waitFor(() => expect(screen.getByText("Conversion rate")).toBeInTheDocument());
  });
});

describe("PerformanceDashboard — AC-12 slice click path + sparkline", () => {
  test("domain → journey → kind narrows both panels consistently and updates the hash", async () => {
    mockApi();
    render(<Harness />);
    await waitReady();
    expect(screen.getAllByTestId("kpi-card")).toHaveLength(2);
    expect(screen.getByText("Cut operational cost")).toBeInTheDocument();

    // 1. Domain
    fireEvent.change(selects()[0]!, { target: { value: D1 } });
    expect(window.location.hash).toBe(`#/exec/performance?domain=${D1}`);
    // OKR panel narrows with the domain slice (server-side, mocked).
    await waitFor(() =>
      expect(screen.queryByText("Cut operational cost")).not.toBeInTheDocument(),
    );

    // 2. Journey (enabled now that a domain is chosen, options fetched)
    await waitFor(() => expect(selects()[1]!.disabled).toBe(false));
    await waitFor(() =>
      expect(within(selects()[1]!).getByText("Checkout")).toBeInTheDocument(),
    );
    fireEvent.change(selects()[1]!, { target: { value: J1 } });
    expect(window.location.hash).toBe(`#/exec/performance?domain=${D1}&journey=${J1}`);
    await waitFor(() =>
      expect(screen.queryByText("Conversion rate")).not.toBeInTheDocument(),
    );

    // 3. Kind
    fireEvent.click(screen.getByRole("button", { name: "Agentic" }));
    expect(window.location.hash).toBe(
      `#/exec/performance?domain=${D1}&journey=${J1}&kind=agentic`,
    );
    await waitFor(() => expect(screen.getAllByTestId("kpi-card")).toHaveLength(1));
    expect(screen.getByText("Fulfilment lead time")).toBeInTheDocument();
  });

  test("selecting a KPI lazily renders its sparkline from the mocked kpi-trends response", async () => {
    mockApi();
    render(<Harness />);
    await waitReady();

    // No trend fetch on first paint (DD-08 lazy).
    expect(requests.some((r) => r.includes("/kpi-trends/"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /Conversion rate/ }));
    await waitFor(() => expect(screen.getByTestId("line-chart")).toBeInTheDocument());
    expect(requests.some((r) => r.includes("/kpi-trends/k-1"))).toBe(true);
    expect(screen.getAllByTestId("trend-point").map((el) => el.textContent)).toEqual([
      "2026-06-28:2.9",
      "2026-06-29:3.4",
    ]);
  });
});
