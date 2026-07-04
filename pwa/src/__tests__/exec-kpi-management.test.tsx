// kpi-okr-governance T-17 — jsdom pin for KpiManagement (AC-14, AC-15):
// loading → ready from mocked REST (GET /kpis + GET /domains), dates
// derived from snake_case created_at, ZERO /query/cypher traffic
// (FR-15), distinct empty state on {rows:[]}, ErrorState on 500.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import { ExecKpiManagement } from "@/views/exec/KpiManagement";

const KPI_ROW = {
  id: "0197a000-0000-7000-8000-000000000001",
  name: "Order Accuracy",
  description: "fixture",
  category: "quality",
  unit: "%",
  target_value: 99.5,
  target_direction: "higher_is_better",
  warning_threshold: null,
  critical_threshold: null,
  measurement_frequency: "daily",
  owner_role: "Ops Lead",
  created_at: "2026-06-15T10:00:00.000Z",
  updated_at: "2026-06-15T10:00:00.000Z",
  archived_at: null,
};

const DOMAIN_ROW = {
  id: "0197a000-0000-7000-8000-00000000000d",
  name: "Merchandising",
  description: "fixture domain",
};

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    return handler(url);
  });
  return spy;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("Exec · KpiManagement · REST pin (AC-14/AC-15)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("loading renders first, then ready rows with created_at-derived dates; zero cypher traffic", async () => {
    const spy = mockFetch((url) => {
      if (url.includes("/api/v1/kpis")) return json({ rows: [KPI_ROW] });
      if (url.includes("/api/v1/domains")) return json({ rows: [DOMAIN_ROW] });
      return json({ rows: [] });
    });

    render(<ExecKpiManagement />);
    // Loading state is synchronous-first.
    expect(screen.getByText(/loading kpi management/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Order Accuracy")).toBeInTheDocument();
    });

    // Date column derives from snake_case created_at (AC-14).
    const expectedDate = new Date(KPI_ROW.created_at).toLocaleDateString();
    expect(screen.getByText(expectedDate)).toBeInTheDocument();

    // FR-15 — no api.cypher call remains: the fetch spy never saw
    // /query/cypher (safe: KpiManagement does not mount KpiCrud).
    const calledUrls = spy.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.includes("/query/cypher"))).toBe(false);
    expect(calledUrls.some((u) => u.includes("/api/v1/kpis"))).toBe(true);
    expect(calledUrls.some((u) => u.includes("/api/v1/domains"))).toBe(true);
  });

  test("{rows:[]} renders the distinct empty state (AC-15)", async () => {
    mockFetch((url) => {
      if (url.includes("/api/v1/kpis")) return json({ rows: [] });
      if (url.includes("/api/v1/domains")) return json({ rows: [DOMAIN_ROW] });
      return json({ rows: [] });
    });

    await act(async () => {
      render(<ExecKpiManagement />);
    });

    await waitFor(() => {
      const empty = screen.getByTestId("empty-state");
      expect(empty).toBeInTheDocument();
      expect(empty.textContent).toMatch(/no kpis defined yet/i);
    });
    // Distinct from error state and from the table.
    expect(screen.queryByTestId("error-state")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("500 from the list fetch renders ErrorState (AC-15)", async () => {
    mockFetch((url) => {
      if (url.includes("/api/v1/kpis")) return json({ error: { code: "neo4j_unreachable", message: "boom" } }, 500);
      if (url.includes("/api/v1/domains")) return json({ rows: [] });
      return json({ rows: [] });
    });

    await act(async () => {
      render(<ExecKpiManagement />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("error-state")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();
  });
});
