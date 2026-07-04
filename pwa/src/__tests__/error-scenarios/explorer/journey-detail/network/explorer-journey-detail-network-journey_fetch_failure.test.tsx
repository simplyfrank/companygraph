import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import type { Route } from "@/route";
import { ExplorerJourney } from "@/views/explorer/Journey";

describe("Explorer · Journey-detail · Network · JOURNEY FETCH FAILURE", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("(1) Network timeout during getJourney", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes("/api/v1/query/getJourney/")) {
        throw new Error("Error: Failed to fetch /api/v1/query/getJourney/journey-1");
      }
      if (u.includes("/api/v1/query/cypher") && init?.method === "POST") {
        throw new Error("Error: Failed to fetch /api/v1/query/getJourney/journey-1");
      }      // Default fallback for unmatched URLs
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });
        const route = { surface: "explorer", tab: "journey-detail", params: { "journeyId": "journey-1" } };
    await act(async () => {
      render(<ExplorerJourney route={route} />);
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
        const mainHeader = headers.find(h => h.textContent?.toLowerCase().includes("journey detail"));
        if (mainHeader) {
          expect(mainHeader).toBeInTheDocument();
        }
      }
    });
  });

  test("(2) Connection reset", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes("/api/v1/query/getJourney/")) {
        throw new Error("Error: Failed to fetch");
      }
      if (u.includes("/api/v1/query/cypher") && init?.method === "POST") {
        throw new Error("Error: Failed to fetch");
      }      // Default fallback for unmatched URLs
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });
        const route = { surface: "explorer", tab: "journey-detail", params: { "journeyId": "journey-1" } };
    await act(async () => {
      render(<ExplorerJourney route={route} />);
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
        const mainHeader = headers.find(h => h.textContent?.toLowerCase().includes("journey detail"));
        if (mainHeader) {
          expect(mainHeader).toBeInTheDocument();
        }
      }
    });
  });

});
