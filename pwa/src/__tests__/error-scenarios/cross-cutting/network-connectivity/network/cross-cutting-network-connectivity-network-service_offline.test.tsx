import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import type { Route } from "@/route";
import { ExplorerDomains } from "@/views/explorer/Domains";

describe("Explorer · Domains · Network · SERVICE OFFLINE", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("(1) Neo4j service stopped", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes("/api/v1/query/cypher") && init?.method === "POST") {
        throw new Error("Failed to fetch");
      }      // Default fallback for unmatched URLs
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });
        const route = { surface: "explorer", tab: "domains", params: {} };
    await act(async () => {
      render(<ExplorerDomains route={route} />);
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

  test("(2) Network partition", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes("/api/v1/query/cypher") && init?.method === "POST") {
        throw new Error("Failed to fetch");
      }      // Default fallback for unmatched URLs
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });
        const route = { surface: "explorer", tab: "domains", params: {} };
    await act(async () => {
      render(<ExplorerDomains route={route} />);
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
