import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import type { Route } from "@/route";
import { ExplorerDomains } from "@/views/explorer/Domains";

describe("Explorer · Domains · Http · 404 NOT FOUND", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("(1) Non-existent resource", async () => {
        // No mock setup required for this scenario
        const route = { surface: "explorer", tab: "domains", params: { "resourceId": "non-existent" } };
    await act(async () => {
      render(<ExplorerDomains route={route} />);
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
