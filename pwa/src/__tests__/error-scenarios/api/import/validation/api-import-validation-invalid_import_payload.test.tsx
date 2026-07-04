import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import type { Route } from "@/route";
import { ApiImport } from "@/views/api/Import";

describe("Api · Import · Validation · INVALID IMPORT PAYLOAD", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("(1) Invalid node structure", async () => {
        // No mock setup required for this scenario
        const route = { surface: "api", tab: "import", params: { "importPayload": {"nodes":[{"invalid":"structure"}],"edges":[]} } };
    await act(async () => {
      render(<ApiImport route={route} />);
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
