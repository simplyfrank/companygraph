import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useSchemaStore, STATIC_SCHEMA_FALLBACK } from "../store/schemaStore";
import { SchemaBootstrap, _resetSchemaBootstrapWarning } from "../components/SchemaBootstrap";
import { startSchemaSubscription } from "../data/schemaSub";

function resetStore() {
  useSchemaStore.setState({
    schema: null,
    etag: null,
    fetchedAt: null,
    loading: false,
    error: null,
  });
}

describe("SchemaBootstrap (AC-21 + C-03 fix)", () => {
  beforeEach(() => {
    resetStore();
    _resetSchemaBootstrapWarning();
    vi.restoreAllMocks();
  });

  test("happy path: 200 → schema cached + children render", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({ nodeLabels: [{ name: "Domain" }], edgeTypes: [{ name: "PART_OF" }] }),
        { status: 200, headers: { etag: "W/\"v1\"" } },
      ),
    );
    render(
      <SchemaBootstrap>
        <div data-test-id="content">ready</div>
      </SchemaBootstrap>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("content")).toBeInTheDocument();
    });
    expect(useSchemaStore.getState().etag).toBe("W/\"v1\"");
  });

  test("404 path: silent fallback to STATIC_SCHEMA_FALLBACK + children render", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(null, { status: 404 }),
    );
    render(
      <SchemaBootstrap>
        <div data-test-id="content">ready</div>
      </SchemaBootstrap>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("content")).toBeInTheDocument();
    });
    expect(useSchemaStore.getState().schema).toBe(STATIC_SCHEMA_FALLBACK);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain("falling back");
  });

  test("5xx path: renders ErrorState with retry button", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ error: { code: "internal" } }), { status: 500 }),
    );
    render(
      <SchemaBootstrap>
        <div data-test-id="content">ready</div>
      </SchemaBootstrap>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("schema-bootstrap-error")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});

// Minimal EventSource stub for the SSE-fallback test.
class FakeEventSource {
  url: string;
  readyState = 0;
  static instances: FakeEventSource[] = [];
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  private listeners = new Map<string, Array<(e: Event) => void>>();
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: (e: Event) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(listener);
  }
  close() {
    this.readyState = 2;
  }
  fireError() {
    if (this.onerror) this.onerror(new Event("error"));
  }
  fireOpen() {
    this.readyState = 1;
    if (this.onopen) this.onopen(new Event("open"));
  }
  fireOntologyChanged() {
    const handlers = this.listeners.get("ontology.changed") ?? [];
    handlers.forEach((h) => h(new MessageEvent("ontology.changed")));
  }
}

describe("startSchemaSubscription state machine (C-02 fix)", () => {
  beforeEach(() => {
    resetStore();
    FakeEventSource.instances.length = 0;
    vi.useFakeTimers();
    vi.restoreAllMocks();
  });

  test("3-strike fallback within strikeWindow enters POLL-MODE", () => {
    const sub = startSchemaSubscription({
      EventSourceCtor: FakeEventSource as unknown as typeof EventSource,
      strikeWindowMs: 60_000,
      strikeThreshold: 3,
      pollIntervalMs: 60_000,
      sseRetryIntervalMs: 1_800_000,
    });
    const es = FakeEventSource.instances[0]!;
    es.fireOpen();
    expect(sub.state()).toBe("sse-connected");
    es.fireError();
    es.fireError();
    es.fireError();
    expect(sub.state()).toBe("poll-mode");
    sub.stop();
  });

  test("ontology.changed event invalidates the schema cache", () => {
    useSchemaStore.setState({
      schema: { nodeLabels: [], edgeTypes: [] },
      etag: "W/\"v1\"",
      fetchedAt: Date.now(),
      loading: false,
      error: null,
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ nodeLabels: [], edgeTypes: [] }), {
        status: 200,
        headers: { etag: "W/\"v2\"" },
      }),
    );
    const sub = startSchemaSubscription({
      EventSourceCtor: FakeEventSource as unknown as typeof EventSource,
    });
    const es = FakeEventSource.instances[0]!;
    es.fireOpen();
    es.fireOntologyChanged();
    // Refresh kicks off; we don't need to await — the cache was cleared.
    expect(useSchemaStore.getState().schema).toBeNull();
    expect(fetchMock).toHaveBeenCalled();
    sub.stop();
  });
});
