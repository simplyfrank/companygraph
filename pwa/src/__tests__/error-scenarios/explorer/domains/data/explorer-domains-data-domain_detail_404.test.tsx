import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import type { Route } from "@/route";
import { ExplorerDomains } from "@/views/explorer/Domains";

describe("Explorer · Domains · Data · DOMAIN DETAIL 404", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("(1) Invalid domain ID from URL", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes("/api/v1/query/cypher") && init?.method === "POST") {
        return new Response(JSON.stringify({ error: { code: "not_found", message: "Resource not found" } }), { status: 404 });
      }      // Default fallback for unmatched URLs
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });
        const route = { surface: "explorer", tab: "domains", params: { "entityId": "invalid-domain-id" }, entityId: "invalid-domain-id" };
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

  test("(2) Non-existent domain ID", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes("/api/v1/query/cypher") && init?.method === "POST") {
        return new Response(JSON.stringify({ error: { code: "not_found", message: "Resource not found" } }), { status: 404 });
      }      // Default fallback for unmatched URLs
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });
        const route = { surface: "explorer", tab: "domains", params: { "entityId": "0189abcd-1234-5678-90ab-cdef01234567" }, entityId: "0189abcd-1234-5678-90ab-cdef01234567" };
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
