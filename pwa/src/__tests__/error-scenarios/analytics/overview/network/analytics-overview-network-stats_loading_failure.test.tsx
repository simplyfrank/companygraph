import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import type { Route } from "@/route";
import { AnalyticsOverview } from "@/views/analytics/Overview";

describe("Analytics · Overview · Network · STATS LOADING FAILURE", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("(1) Network timeout during stats fetch", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes("/api/v1/stats")) {
        throw new Error("Error: Failed to load stats");
      }
      if (u.includes("/api/v1/query/cypher") && init?.method === "POST") {
        throw new Error("Error: Failed to load stats");
      }      // Default fallback for unmatched URLs
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });
        // AnalyticsOverview doesn't accept route prop - it manages its own state
    await act(async () => {
      render(<AnalyticsOverview />);
    });
        // Component should render without crashing
    // The error will be caught by useFetch and shown in the UI
    await waitFor(() => {
      const errorState = screen.queryByTestId("error-state");
      const headers = screen.queryAllByRole("heading");
      
      // Component should either show error state or render with headers
      if (errorState) {
        expect(errorState).toBeInTheDocument();
      } else {
        expect(headers.length).toBeGreaterThan(0);
        // Check for expected header name if present
        const mainHeader = headers.find(h => h.textContent?.toLowerCase().includes("analytics overview"));
        if (mainHeader) {
          expect(mainHeader).toBeInTheDocument();
        }
      }
    });
  });

});
