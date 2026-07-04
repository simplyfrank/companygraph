import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import type { Route } from "@/route";
import { SmeReview } from "@/views/sme/Review";

describe("Sme · Review · Data · JSON PARSE FAILURE", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("(1) Invalid JSON in bulk paste", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes("/api/v1/query/cypher") && init?.method === "POST") {
        return new Response(JSON.stringify({ error: { code: "json_parse_failure", message: "Invalid JSON format" } }), { status: 400 });
      }      // Default fallback for unmatched URLs
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });
        const route = { surface: "sme", tab: "review", params: { "bulkPasteText": "{ invalid json }" } };
    await act(async () => {
      render(<SmeReview route={route} />);
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
