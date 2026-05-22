import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ExplorerActivities } from "../views/explorer/Activities";
import type { Route } from "../route";

// AC-03 — Activity detail renders four bound lists (roles, systems,
// locations, adjacent activities) when the route carries entityId.

function makeRoute(entityId: string): Route {
  return { surface: "explorer", tab: "activities", entityId, params: {} };
}

describe("ExplorerActivities detail mode (FR-04 / AC-03)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("renders four bound lists from neighbors", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/query/getActivity/")) {
        return new Response(
          JSON.stringify({ rows: [{ id: "act-1", name: "Receive", description: "Receive inventory" }] }),
          { status: 200 },
        );
      }
      if (u.includes("/query/neighbors/")) {
        return new Response(
          JSON.stringify({
            rows: [
              { node: { id: "r-1", name: "Cashier" }, label: "Role" },
              { node: { id: "s-1", name: "POS" },     label: "System" },
              { node: { id: "l-1", name: "Store-001" }, label: "Location" },
              { node: { id: "a-2", name: "Pick" },     label: "Activity" },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    });

    render(<ExplorerActivities route={makeRoute("act-1")} />);
    expect(await screen.findByText("Receive")).toBeInTheDocument();
    expect(await screen.findByTestId("activity-roles")).toHaveTextContent("Cashier");
    expect(screen.getByTestId("activity-systems")).toHaveTextContent("POS");
    expect(screen.getByTestId("activity-locations")).toHaveTextContent("Store-001");
    expect(screen.getByTestId("activity-adjacent")).toHaveTextContent("Pick");
  });

  test("404 from getActivity renders NotFoundPanel with entityId echoed", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/query/getActivity/")) {
        return new Response(
          JSON.stringify({ error: { code: "not_found", message: "activity not found" } }),
          { status: 404, statusText: "Not Found" },
        );
      }
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });

    render(<ExplorerActivities route={makeRoute("missing-id")} />);
    expect(await screen.findByTestId("not-found-panel")).toBeInTheDocument();
    expect(screen.getByTestId("not-found-id")).toHaveTextContent("missing-id");
  });
});
