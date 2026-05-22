import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { useHealthStore, _testOnly, startHealthPolling } from "../health";

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

describe("startHealthPolling visibilitychange handling (AC-29)", () => {
  let stop: (() => void) | null = null;

  beforeEach(() => {
    useHealthStore.setState({
      connected: false,
      neo4jVersion: null,
      stats: null,
      lastPolledAt: null,
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (stop) {
      stop();
      stop = null;
    }
  });

  test("flipping document.visibilityState to visible fires immediate poll()", async () => {
    let healthzCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/healthz")) {
        healthzCalls += 1;
        return new Response(
          JSON.stringify({ ok: true, neo4j: { connected: true, version: "5.26.0" } }),
          { status: 200 },
        );
      }
      if (u.includes("/stats")) {
        return new Response(
          JSON.stringify({ nodes: { Domain: 1 }, edges: { PART_OF: 0 } }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    });

    // Pretend tab started hidden so the on-mount poll is skipped.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });

    stop = startHealthPolling();
    expect(healthzCalls).toBe(0);

    // Flip to visible and fire the event — assert poll fires immediately
    // (the visibilitychange handler must not wait for the next interval).
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // poll() is async; let microtasks flush.
    await new Promise((r) => setTimeout(r, 0));
    expect(healthzCalls).toBeGreaterThanOrEqual(1);
  });
});
