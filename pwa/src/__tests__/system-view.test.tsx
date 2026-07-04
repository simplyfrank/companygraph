import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ExplorerSystems } from "../views/explorer/Systems";
import { parseHash } from "../route";

// AC-04 — System-centric list view renders systems with uses + integrations counts.
// system-augmentation-model T-15: mock rows gain `attributes_json` (the
// view's Cypher projection now carries it) and the view takes a route
// prop — existing assertions stay green (AC-15 regression).

describe("ExplorerSystems (FR-05 / AC-04 — list mode)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.location.hash = "#/explorer/systems";
  });

  test("renders one row per system with counts", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          rows: [
            { system: { id: "s-1", name: "POS", description: "Point of sale", attributes_json: '{"systemKind":"functional"}' }, uses: 5, integrations: 2 },
            { system: { id: "s-2", name: "Stripe", description: "Payment processor", attributes_json: '{"systemKind":"functional"}' }, uses: 3, integrations: 0 },
          ],
        }),
        { status: 200 },
      ),
    );
    render(<ExplorerSystems route={parseHash("#/explorer/systems")} />);
    expect(await screen.findByText("POS")).toBeInTheDocument();
    expect(screen.getByText("Stripe")).toBeInTheDocument();
  });

  test("renders error state on fetch failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "internal" } }), {
        status: 500,
        statusText: "Internal",
      }),
    );
    render(<ExplorerSystems route={parseHash("#/explorer/systems")} />);
    expect(await screen.findByText(/error/i)).toBeInTheDocument();
  });
});
