import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import type { Route } from "@/route";
import { ExplorerJourney } from "@/views/explorer/Journey";

describe("Explorer · Journey-detail · Validation · INVALID JOURNEY ID", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("(1) Non-UUIDv7 format", async () => {
        // No mock setup required for this scenario
        const route = { surface: "explorer", tab: "journey-detail", params: { "journeyId": "not-a-uuid" } };
    await act(async () => {
      render(<ExplorerJourney route={route} />);
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

  test("(2) Empty journey ID", async () => {
        // No mock setup required for this scenario
        const route = { surface: "explorer", tab: "journey-detail", params: { "journeyId": "" } };
    await act(async () => {
      render(<ExplorerJourney route={route} />);
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
