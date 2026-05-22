import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ExplorerDomains } from "../views/explorer/Domains";
import type { Route } from "../route";

// AC-01 — Domain index renders the list of domains with counts.

const ROUTE: Route = { surface: "explorer", tab: "domains", params: {} };

describe("ExplorerDomains (FR-01 / AC-01)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("renders domain cards with name + journey/activity counts", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          rows: [
            { id: "d-1", name: "Store Ops", description: "front of house", journeys: 4, activities: 17 },
            { id: "d-2", name: "Supply Chain", description: "back of house", journeys: 2, activities: 9 },
          ],
        }),
        { status: 200 },
      ),
    );
    render(<ExplorerDomains route={ROUTE} />);
    expect(await screen.findByText("Store Ops")).toBeInTheDocument();
    expect(screen.getByText("Supply Chain")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
  });

  test("renders error state on fetch failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "internal", message: "boom" } }), {
        status: 500,
        statusText: "Internal",
      }),
    );
    render(<ExplorerDomains route={ROUTE} />);
    expect(await screen.findByText(/error/i)).toBeInTheDocument();
  });
});
