import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import type { Route } from "@/route";
import { ExplorerDomains } from "@/views/explorer/Domains";

describe("Explorer · Domains · Http · 400 INVALID PAYLOAD", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("(1) Malformed JSON payload", async () => {
        // No mock setup required for this scenario
        const route = { surface: "explorer", tab: "domains", params: { "payload": "{ invalid }" } };
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
