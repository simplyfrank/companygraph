import { describe, test, expect, beforeEach, vi } from "vitest";
import { useHealthStore, _testOnly } from "../health";

describe("health polling", () => {
  beforeEach(() => {
    useHealthStore.setState({
      connected: false,
      neo4jVersion: null,
      stats: null,
      lastPolledAt: null,
    });
    vi.restoreAllMocks();
  });

  test("poll → 200 healthz + 200 stats updates store", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/healthz")) {
        return new Response(
          JSON.stringify({ ok: true, neo4j: { connected: true, version: "5.26.0" } }),
          { status: 200 },
        );
      }
      if (u.includes("/stats")) {
        return new Response(
          JSON.stringify({
            nodes: { Domain: 4, UserJourney: 8 },
            edges: { PART_OF: 12 },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    });
    await _testOnly.poll();
    const state = useHealthStore.getState();
    expect(state.connected).toBe(true);
    expect(state.neo4jVersion).toBe("5.26.0");
    expect(state.stats).toEqual({ nodes: 12, edges: 12 });
    expect(state.lastPolledAt).not.toBeNull();
  });

  test("poll → healthz failure marks disconnected; stats stay last-known", async () => {
    useHealthStore.setState({ stats: { nodes: 5, edges: 7 }, lastPolledAt: 100 });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/healthz")) throw new Error("fetch failed");
      // /stats also fails — left untouched
      throw new Error("fetch failed");
    });
    await _testOnly.poll();
    const state = useHealthStore.getState();
    expect(state.connected).toBe(false);
    expect(state.stats).toEqual({ nodes: 5, edges: 7 });
  });
});
