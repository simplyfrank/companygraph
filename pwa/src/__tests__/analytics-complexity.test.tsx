import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent, act } from "@testing-library/react";
import { AnalyticsComplexity } from "../views/analytics/Complexity";

// cto-analytics T-10 (FR-04, AC-04) — canonical weighted complexity score.
//
// AC-04 recipe: the per-journey score is `depth × distinct-systems ×
// distinct-roles` with default weights (1.0 each, RD-2 / RD-6 §10.2), and
// hovering (mouse) or long-pressing (touch — the FR-04 Native Conflicts
// suppression this task owns) a score reveals the formula + the three
// component sub-scores.
//
// The view rides `POST /api/v1/query/cypher` (DD-01): the mocked passthrough
// echoes rows the view maps straight onto {journey, depth, systems, roles}.

interface Row {
  journey: { id: string; name: string };
  depth: number;
  systems: number;
  roles: number;
}

// Checkout: 4 × 3 × 2 = 24 (highest). Returns: 2 × 2 × 1 = 4. Greet: 1×1×0 = 0.
const ROWS: Row[] = [
  { journey: { id: "j-checkout", name: "Checkout" }, depth: 4, systems: 3, roles: 2 },
  { journey: { id: "j-returns", name: "Returns" }, depth: 2, systems: 2, roles: 1 },
  { journey: { id: "j-greet", name: "Greet" }, depth: 1, systems: 1, roles: 0 },
];

function mockCypher(rows: Row[]): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
    if (url.includes("/api/v1/query/cypher")) {
      return new Response(JSON.stringify({ rows }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 200 });
  });
}

describe("cto-analytics T-10 — weighted complexity score (AC-04)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mockCypher(ROWS);
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  async function renderReady() {
    render(<AnalyticsComplexity />);
    await vi.waitFor(() => {
      expect(screen.getAllByTestId("complexity-score").length).toBe(ROWS.length);
    });
  }

  test("score equals depth × distinct-systems × distinct-roles with default weights", async () => {
    await renderReady();
    const scores = screen.getAllByTestId("complexity-score");
    const byId = new Map(scores.map((s) => [s.getAttribute("data-journey-id"), s]));

    // depth × systems × roles, weights all 1.0.
    expect(byId.get("j-checkout")!.textContent).toContain("24");
    expect(byId.get("j-returns")!.textContent).toContain("4");
    // A zero-role journey scores 0 (0 factor collapses the product).
    expect(byId.get("j-greet")!.textContent).toContain("0");
  });

  test("rows are sorted by score DESC (Checkout first, Greet last)", async () => {
    await renderReady();
    const ids = screen.getAllByTestId("complexity-score").map((s) => s.getAttribute("data-journey-id"));
    expect(ids).toEqual(["j-checkout", "j-returns", "j-greet"]);
  });

  test("hover reveals the formula and the three component sub-scores", async () => {
    await renderReady();
    const checkout = screen
      .getAllByTestId("complexity-score")
      .find((s) => s.getAttribute("data-journey-id") === "j-checkout")!;

    // No popover until hover.
    expect(screen.queryByTestId("complexity-popover")).toBeNull();

    act(() => {
      fireEvent.mouseEnter(checkout);
    });
    const pop = screen.getByTestId("complexity-popover");
    expect(within(pop).getByTestId("popover-depth").textContent).toContain("4");
    expect(within(pop).getByTestId("popover-systems").textContent).toContain("3");
    expect(within(pop).getByTestId("popover-roles").textContent).toContain("2");
    expect(within(pop).getByTestId("popover-total").textContent).toContain("24");

    act(() => {
      fireEvent.mouseLeave(checkout);
    });
    expect(screen.queryByTestId("complexity-popover")).toBeNull();
  });

  test("long-press (touch, 500 ms) is a hover proxy that opens the sub-score popover", async () => {
    await renderReady();
    const returns = screen
      .getAllByTestId("complexity-score")
      .find((s) => s.getAttribute("data-journey-id") === "j-returns")!;

    fireEvent.touchStart(returns);
    // Before the 500 ms threshold: still closed.
    expect(screen.queryByTestId("complexity-popover")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    const pop = screen.getByTestId("complexity-popover");
    expect(within(pop).getByTestId("popover-depth").textContent).toContain("2");
    expect(within(pop).getByTestId("popover-systems").textContent).toContain("2");
    expect(within(pop).getByTestId("popover-roles").textContent).toContain("1");
    expect(within(pop).getByTestId("popover-total").textContent).toContain("4");
  });

  test("a quick touch (released before 500 ms) does NOT open the popover", async () => {
    await renderReady();
    const returns = screen
      .getAllByTestId("complexity-score")
      .find((s) => s.getAttribute("data-journey-id") === "j-returns")!;

    fireEvent.touchStart(returns);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.touchEnd(returns);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByTestId("complexity-popover")).toBeNull();
  });
});

describe("cto-analytics T-10 — read-only weights pane (FR-04/FR-11, RD-6)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockCypher(ROWS);
  });
  afterEach(() => cleanup());

  test("the settings pane shows the three code-default weights (all 1.0), read-only", async () => {
    render(<AnalyticsComplexity />);
    const pane = await screen.findByTestId("analytics-settings");
    expect(within(pane).getByTestId("weight-depth_weight").textContent).toContain("1.0");
    expect(within(pane).getByTestId("weight-system_weight").textContent).toContain("1.0");
    expect(within(pane).getByTestId("weight-role_weight").textContent).toContain("1.0");
    // The deferral notice is present (tunability lives in cto-analytics-reporting).
    expect(within(pane).getByTestId("weights-readonly-notice").textContent).toContain(
      "cto-analytics-reporting",
    );
  });
});
