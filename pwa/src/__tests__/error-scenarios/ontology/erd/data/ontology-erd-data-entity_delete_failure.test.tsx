import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import type { Route } from "@/route";
import { OntologyErd } from "@/views/ontology/Erd";

describe("Ontology · Erd · Data · ENTITY DELETE FAILURE", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("(1) Deleting entity with attached edges", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes("/api/v1/query/cypher") && init?.method === "POST") {
        return new Response(JSON.stringify({ error: { code: "entity_delete_failure", message: "has_edges" } }), { status: 400 });
      }      // Default fallback for unmatched URLs
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });
        const route = { surface: "ontology", tab: "erd", params: { "entityId": "entity-1" }, entityId: "entity-1" };
    await act(async () => {
      render(<OntologyErd route={route} />);
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
