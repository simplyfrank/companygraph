import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ExplorerPath } from "../views/explorer/Path";

// FR-10 / AC-07 — PathFinder covers 5+ response states. Each test mocks
// the relevant fetch shape and asserts the corresponding panel renders.

function fillForm(): void {
  fireEvent.change(screen.getByTestId("path-from"), { target: { value: "node-a" } });
  fireEvent.change(screen.getByTestId("path-to"),   { target: { value: "node-b" } });
}

function mockFindPath(handler: (url: string) => Response | Promise<Response>): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => handler(String(url)));
}

describe("ExplorerPath (FR-10 / AC-07)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.location.hash = "";
  });

  test("idle state renders the prompt before any search", () => {
    render(<ExplorerPath />);
    expect(screen.getByTestId("path-idle")).toBeInTheDocument();
  });

  test("(a) success — one row + 2 hydrations → hops render with edge labels", async () => {
    mockFindPath((url) => {
      if (url.includes("/api/v1/query/findPath")) {
        return new Response(
          JSON.stringify({
            rows: [
              { length: 2, nodes: ["node-a", "act-1", "node-b"], edges: ["e-1", "e-2"] },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/api/v1/query/cypher")) {
        // Both hydrations come back unordered to exercise the orderedById reorder.
        if (url.endsWith("cypher")) {
          // We cannot tell which hydration this is from URL alone; inspect the
          // body to distinguish. Bun's fetch mock receives init second; we
          // dispatch in the impl below.
        }
      }
      return new Response("{}", { status: 200 });
    });

    // Override with body-aware impl.
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.includes("/api/v1/query/findPath")) {
        return new Response(
          JSON.stringify({
            rows: [
              { length: 2, nodes: ["node-a", "act-1", "node-b"], edges: ["e-1", "e-2"] },
            ],
          }),
          { status: 200 },
        );
      }
      if (u.includes("/api/v1/query/cypher") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { statement: string };
        if (body.statement.includes("labels(n)")) {
          return new Response(
            JSON.stringify({
              rows: [
                // Out of order to verify ordering preserves graph-core order.
                { id: "node-b", label: "System", name: "POS" },
                { id: "node-a", label: "Role", name: "Cashier" },
                { id: "act-1",  label: "Activity", name: "Scan" },
              ],
            }),
            { status: 200 },
          );
        }
        if (body.statement.includes("type(r)")) {
          return new Response(
            JSON.stringify({
              rows: [
                { id: "e-2", type: "USES_SYSTEM" },
                { id: "e-1", type: "EXECUTES" },
              ],
            }),
            { status: 200 },
          );
        }
      }
      return new Response("{}", { status: 200 });
    });

    render(<ExplorerPath />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /find path/i }));

    const hops = await screen.findByTestId("path-hops");
    expect(hops).toBeInTheDocument();

    const nodes = screen.getAllByTestId("path-hop-node");
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toHaveTextContent("Cashier");
    expect(nodes[1]).toHaveTextContent("Scan");
    expect(nodes[2]).toHaveTextContent("POS");

    const edges = screen.getAllByTestId("path-hop-edge");
    expect(edges).toHaveLength(2);
    expect(edges[0]).toHaveTextContent("EXECUTES");
    expect(edges[1]).toHaveTextContent("USES_SYSTEM");
  });

  test("(b) zero rows → 'No path within depth N' message", async () => {
    mockFindPath((url) => {
      if (url.includes("/api/v1/query/findPath")) {
        return new Response(JSON.stringify({ rows: [] }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });

    render(<ExplorerPath />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /find path/i }));
    const panel = await screen.findByTestId("path-no-path");
    expect(panel.textContent?.toLowerCase()).toContain("no path within depth");
  });

  test("(c) depth=9 via URL → clamp to 8 + 'Max depth is 8' hint, no API call", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ rows: [] }), { status: 200 }),
    );
    window.location.hash = "#/explorer/path-finder?depth=9";
    render(<ExplorerPath />);
    expect(await screen.findByTestId("path-depth-exceeded")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("(d) query_timeout → friendly banner", async () => {
    mockFindPath(() =>
      new Response(
        JSON.stringify({ error: { code: "query_timeout", message: "5s" } }),
        { status: 400, statusText: "Bad Request" },
      ),
    );
    render(<ExplorerPath />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /find path/i }));
    await screen.findByTestId("path-timeout");
  });

  test("(e) result_truncated → narrow-the-search banner", async () => {
    mockFindPath(() =>
      new Response(
        JSON.stringify({ error: { code: "result_truncated", message: ">1000" } }),
        { status: 400, statusText: "Bad Request" },
      ),
    );
    render(<ExplorerPath />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /find path/i }));
    await screen.findByTestId("path-truncated");
  });

  test("(f) network/Neo4j unreachable → service-offline banner", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Failed to fetch"));
    render(<ExplorerPath />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /find path/i }));
    await screen.findByTestId("path-unreachable");
  });

  test("depth_exceeded server response → matching banner (defence in depth)", async () => {
    mockFindPath(() =>
      new Response(
        JSON.stringify({ error: { code: "depth_exceeded", message: "max 8" } }),
        { status: 400, statusText: "Bad Request" },
      ),
    );
    render(<ExplorerPath />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /find path/i }));
    await screen.findByTestId("path-depth-exceeded");
  });

  test("findPath URL carries the depth slider value", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ rows: [] }), { status: 200 }),
    );
    render(<ExplorerPath />);
    fillForm();
    // Drop slider to 2.
    fireEvent.change(screen.getByTestId("path-depth"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /find path/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("/api/v1/query/findPath");
    expect(url).toContain("maxDepth=2");
  });
});
