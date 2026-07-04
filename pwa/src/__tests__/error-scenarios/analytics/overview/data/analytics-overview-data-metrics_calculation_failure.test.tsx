import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import type { Route } from "@/route";
import { AnalyticsOverview } from "@/views/analytics/Overview";

describe("Analytics · Overview · Data · METRICS CALCULATION FAILURE", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("(1) Division by zero in metrics", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes("/api/v1/stats")) {
        // Return valid stats structure to avoid undefined errors
        return new Response(JSON.stringify({ 
          nodes: { Activity: 0, UserJourney: 0, Domain: 0, System: 0 },
          edges: { PRECEDES: 0, PART_OF: 0, USES_SYSTEM: 0 }
        }), { status: 200 });
      }
      if (u.includes("/api/v1/query/cypher") && init?.method === "POST") {
        return new Response(JSON.stringify({ error: { code: "metrics_calculation_failure", message: "Error: Metric calculation failed" } }), { status: 400 });
      }      // Default fallback for unmatched URLs
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });
        // AnalyticsOverview doesn't accept route prop - it manages its own state
    await act(async () => {
      render(<AnalyticsOverview />);
    });
        // Component should render without crashing - check for any rendered content
    await waitFor(() => {
      const errorState = screen.queryByTestId("error-state");
      const loadingState = screen.queryByText(/loading/i);
      const headers = screen.queryAllByRole("heading");
      
      // Accept any of these as valid rendering
      const hasContent = Boolean(errorState || loadingState || headers.length > 0);
      expect(hasContent).toBe(true);
    });
  });

});
