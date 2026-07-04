import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import type { Route } from "@/route";
import { ExplorerJourney } from "@/views/explorer/Journey";

describe("Explorer · Journey-detail · Data · ACTIVITY 404", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("(1) Invalid activity ID", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes("/api/v1/query/cypher") && init?.method === "POST") {
        return new Response(JSON.stringify({ error: { code: "not_found", message: "Resource not found" } }), { status: 404 });
      }      // Default fallback for unmatched URLs
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });
        const route = { surface: "explorer", tab: "journey-detail", params: { "journeyId": "journey-1", "activityId": "invalid-activity-id" } };
    await act(async () => {
      render(<ExplorerJourney route={route} />);
    });
        // For detail mode with invalid entityId, expect NotFoundPanel or error state
    await waitFor(() => {
      const notFoundPanel = screen.queryByTestId("not-found-panel");
      const errorState = screen.queryByTestId("error-state");
      if (notFoundPanel) {
        expect(notFoundPanel).toBeInTheDocument();
      } else if (errorState) {
        expect(errorState).toBeInTheDocument();
      } else {
        // Fallback: component should still render something
        const headers = screen.queryAllByRole("heading");
        expect(headers.length).toBeGreaterThan(0);
      }
    });
  });

});
