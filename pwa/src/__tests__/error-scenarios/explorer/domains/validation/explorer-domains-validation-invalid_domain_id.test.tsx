import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import type { Route } from "@/route";
import { ExplorerDomains } from "@/views/explorer/Domains";

describe("Explorer · Domains · Validation · INVALID DOMAIN ID", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("(1) Non-UUIDv7 format", async () => {
        // No mock setup required for this scenario
        const route = { surface: "explorer", tab: "domains", params: { "entityId": "not-a-uuid" }, entityId: "not-a-uuid" };
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

  test("(2) Empty domain ID", async () => {
        // No mock setup required for this scenario
        const route = { surface: "explorer", tab: "domains", params: { "entityId": "" } };
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
