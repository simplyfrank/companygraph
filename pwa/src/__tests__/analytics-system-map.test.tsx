import { describe, test, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import {
  AnalyticsSystems,
  assignClusters,
  CLUSTER_RAMP,
} from "../views/analytics/Systems";
import type { Route } from "../route";

// cto-analytics T-07 (FR-01, AC-01 — design §2 Pin-4 / Resolves: C-01).
//
// AC-01's binding recipe: every cluster fill on the system map resolves to
// one of the five `--accent-100/-300/-500/-700/-900` ramp stops declared in
// pwa/src/styles/companygraph/tokens.css (T-21) — NOT the nonexistent
// pwa/src/theme.ts. This suite asserts:
//   1. the five ramp stops exist in tokens.css (the token home AC-01 asserts against),
//   2. `assignClusters` only ever emits one of those five stops,
//   3. the rendered SVG paints every System node with a `var(--accent-NNN)`
//      fill drawn from the five-stop ramp,
//   4. the map fetches GET /api/v1/analytics/systems (T-20 endpoint) and
//      renders one node per system in the envelope.

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKENS_CSS = join(HERE, "../styles/companygraph/tokens.css");

const RAMP_STOPS = [
  "--accent-100",
  "--accent-300",
  "--accent-500",
  "--accent-700",
  "--accent-900",
] as const;

function makeRoute(): Route {
  return { surface: "analytics", tab: "systems", params: {} };
}

const SEED_MAP = {
  systems: [
    { id: "s-1", name: "POS",       degree: 8, integrationCount: 4 },
    { id: "s-2", name: "OMS",       degree: 6, integrationCount: 3 },
    { id: "s-3", name: "WMS",       degree: 5, integrationCount: 2 },
    { id: "s-4", name: "CRM",       degree: 4, integrationCount: 2 },
    { id: "s-5", name: "ERP",       degree: 3, integrationCount: 1 },
    { id: "s-6", name: "Analytics", degree: 2, integrationCount: 0 },
  ],
  integrations: [
    { id: "i-1", source: "s-1", target: "s-2", type: "INTEGRATES_WITH" },
    { id: "i-2", source: "s-2", target: "s-3", type: "INTEGRATES_WITH" },
    { id: "i-3", source: "s-1", target: "s-4", type: "INTEGRATES_WITH" },
    { id: "i-4", source: "s-3", target: "s-5", type: "INTEGRATES_WITH" },
  ],
};

describe("cto-analytics T-07 — system map ramp tokens (AC-01)", () => {
  const css = readFileSync(TOKENS_CSS, "utf8");

  test.each(RAMP_STOPS)("tokens.css declares %s (the AC-01 token home)", (stop) => {
    expect(css).toMatch(new RegExp(`${stop}\\s*:\\s*oklch\\([^)]+\\)`));
  });

  test("CLUSTER_RAMP is exactly the five tokens.css ramp stops", () => {
    expect([...CLUSTER_RAMP].sort()).toEqual([...RAMP_STOPS].sort());
  });

  test("assignClusters only ever emits one of the five ramp stops", () => {
    const clusters = assignClusters(SEED_MAP.systems);
    expect(clusters.size).toBe(SEED_MAP.systems.length);
    for (const stop of clusters.values()) {
      expect(RAMP_STOPS).toContain(stop);
    }
  });

  test("the most-integrated system lands in the darkest cluster band", () => {
    const clusters = assignClusters(SEED_MAP.systems);
    // s-1 (integrationCount 4) is the most integrated → --accent-900.
    expect(clusters.get("s-1")).toBe("--accent-900");
  });

  test("assignClusters is a no-op on an empty system list", () => {
    expect(assignClusters([]).size).toBe(0);
  });
});

describe("cto-analytics T-07 — rendered system map (AC-01, FR-01)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("/api/v1/analytics/systems")) {
        return new Response(JSON.stringify(SEED_MAP), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
  });

  test("fetches /api/v1/analytics/systems and renders one node per system", async () => {
    render(<AnalyticsSystems route={makeRoute()} />);
    await waitFor(() => {
      expect(screen.getAllByTestId("system-node")).toHaveLength(SEED_MAP.systems.length);
    });
  });

  test("every rendered node fill is a var(--accent-NNN) drawn from the five-stop ramp", async () => {
    render(<AnalyticsSystems route={makeRoute()} />);
    await waitFor(() => {
      expect(screen.getAllByTestId("system-node").length).toBeGreaterThan(0);
    });
    const rampVars = new Set(RAMP_STOPS.map((s) => `var(${s})`));
    for (const g of screen.getAllByTestId("system-node")) {
      const circle = g.querySelector("circle")!;
      const fill = circle.getAttribute("fill")!;
      // AC-01: no hardcoded color — the fill is a ramp custom property.
      expect(fill.startsWith("var(--accent-")).toBe(true);
      expect(rampVars.has(fill)).toBe(true);
      // The data-cluster marker echoes the token name for traceability.
      expect(RAMP_STOPS).toContain(g.getAttribute("data-cluster"));
    }
  });

  test("renders the System map header, not a fallback panel", async () => {
    render(<AnalyticsSystems route={makeRoute()} />);
    expect(await screen.findByTestId("view-header-title")).toHaveTextContent(/System map/i);
    expect(screen.queryByText(/Back to Domains/i)).toBeNull();
  });
});
