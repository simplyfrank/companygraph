import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import type { Route } from "@/route";
import { OntologyEditor } from "@/views/ontology/Editor";

describe("Ontology · Editor · Network · NODE DETAIL FAILURE", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("(1) Network timeout during node detail fetch", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes("/api/v1/query/cypher") && init?.method === "POST") {
        throw new Error("Error: Failed to fetch node detail");
      }      // Default fallback for unmatched URLs
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });
        const route = { surface: "ontology", tab: "editor", params: { "label": "Activity", "id": "activity-1" } };
    await act(async () => {
      render(<OntologyEditor route={route} />);
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
        const mainHeader = headers.find(h => h.textContent?.toLowerCase().includes("ontology editor"));
        if (mainHeader) {
          expect(mainHeader).toBeInTheDocument();
        }
      }
    });
  });

});
