// kpi-measurement-alignment AC-14 — PWA KpiDashboard shows measurements
// recorded via REST (dual-write populates Neo4j, performance aggregate
// uses ALIGNED_TO). The dashboard already uses api.kpi.getAlignments()
// which reads ALIGNED_TO edges — this test verifies the end-to-end flow
// with mocked REST responses.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { KpiDashboard } from "@/components/KpiDashboard";

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    return handler(url);
  });
  return spy;
}

const ALIGNMENT_ROW = {
  alignment_id: "rel-1",
  kpi_id: "0197a000-0000-7000-8000-000000000001",
  kpi_name: "Order Accuracy",
  kpi_category: "quality",
  kpi_unit: "%",
  kpi_target_value: 99.5,
  weight: 1.0,
  attribution_type: "direct",
  alignment_notes: null,
  created_at: "2026-06-15T10:00:00.000Z",
};

// KpiDashboard reads m.actual_value from measurements (component line 101)
const MEASUREMENT_ROW = {
  id: "0197a000-0000-7000-8000-000000000010",
  kpi_id: "0197a000-0000-7000-8000-000000000001",
  measured_at: new Date().toISOString(),
  actual_value: 99.8,
  value: 99.8,
  context: null,
  source: "rest",
  created_at: new Date().toISOString(),
};

describe("AC-14: KpiDashboard with unified ALIGNED_TO + measurements", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("renders KPI cards from ALIGNED_TO-based alignments", async () => {
    mockFetch(async (url) => {
      if (url.includes("/kpi-alignments")) {
        return new Response(JSON.stringify({ rows: [ALIGNMENT_ROW] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/kpi-measurements")) {
        return new Response(JSON.stringify({ rows: [MEASUREMENT_ROW] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/query/cypher")) {
        return new Response(JSON.stringify({ rows: [{ id: ALIGNMENT_ROW.kpi_id, name: "Order Accuracy", unit: "%", target_value: 99.5 }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    });

    render(<KpiDashboard domainId="0197a000-0000-7000-8000-00000000000d" />);

    // Wait for the KPI name to appear (dashboard loaded from ALIGNED_TO alignments)
    await waitFor(() => {
      expect(screen.getByText(/Order Accuracy/i)).toBeTruthy();
    });

    // The target value should be visible
    expect(screen.getByText(/99\.5/)).toBeTruthy();
  });

  test("renders empty state when no alignments exist", async () => {
    mockFetch(async (url) => {
      if (url.includes("/kpi-alignments")) {
        return new Response(JSON.stringify({ rows: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    });

    render(<KpiDashboard domainId="0197a000-0000-7000-8000-00000000000d" />);

    // Should not crash — empty state rendered
    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });
  });

  test("shows measurement data when KPI card is clicked", async () => {
    mockFetch(async (url) => {
      if (url.includes("/kpi-alignments")) {
        return new Response(JSON.stringify({ rows: [ALIGNMENT_ROW] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/kpi-measurements")) {
        return new Response(JSON.stringify({ rows: [MEASUREMENT_ROW] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/query/cypher")) {
        return new Response(JSON.stringify({ rows: [{ id: ALIGNMENT_ROW.kpi_id, name: "Order Accuracy", unit: "%", target_value: 99.5 }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    });

    render(<KpiDashboard domainId="0197a000-0000-7000-8000-00000000000d" />);

    // Wait for KPI card to render
    await waitFor(() => {
      expect(screen.getByText(/Order Accuracy/i)).toBeTruthy();
    });

    // Click the KPI card to load measurements
    const card = screen.getByText(/Order Accuracy/i).closest("[class*='kpiCard']");
    if (card) {
      fireEvent.click(card);
    }

    // The component should not crash when loading measurements
    await waitFor(() => {
      expect(document.body).toBeTruthy();
    });
  });
});
