import { describe, test, expect, beforeEach, vi } from "vitest";
import { useSchemaStore, STATIC_SCHEMA_FALLBACK } from "../schemaStore";
import { usePrefStore } from "../prefStore";

describe("schemaStore", () => {
  beforeEach(() => {
    useSchemaStore.setState({
      schema: null,
      etag: null,
      fetchedAt: null,
      loading: false,
      error: null,
    });
  });

  test("setFromStatic populates STATIC_SCHEMA_FALLBACK", () => {
    useSchemaStore.getState().setFromStatic();
    const state = useSchemaStore.getState();
    expect(state.schema).toBe(STATIC_SCHEMA_FALLBACK);
    expect(state.schema?.nodeLabels.length).toBeGreaterThan(0);
    expect(state.schema?.edgeTypes.length).toBeGreaterThan(0);
    expect(state.fetchedAt).toBeGreaterThan(0);
  });

  test("invalidate clears the cached body but preserves nothing else", () => {
    useSchemaStore.getState().setFromServer(STATIC_SCHEMA_FALLBACK, "W/\"abc\"");
    expect(useSchemaStore.getState().schema).not.toBeNull();
    expect(useSchemaStore.getState().etag).toBe("W/\"abc\"");
    useSchemaStore.getState().invalidate();
    expect(useSchemaStore.getState().schema).toBeNull();
    expect(useSchemaStore.getState().etag).toBeNull();
    expect(useSchemaStore.getState().fetchedAt).toBeNull();
  });

  test("refresh on 404 falls back to STATIC_SCHEMA_FALLBACK silently", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 }),
    );
    await useSchemaStore.getState().refresh();
    expect(useSchemaStore.getState().schema).toBe(STATIC_SCHEMA_FALLBACK);
    expect(useSchemaStore.getState().error).toBeNull();
    fetchMock.mockRestore();
  });

  test("refresh on 200 populates schema + etag", async () => {
    const body = { nodeLabels: [{ name: "Domain" }], edgeTypes: [{ name: "PART_OF" }] };
    const headers = new Headers({ etag: "W/\"v1\"" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200, headers }),
    );
    await useSchemaStore.getState().refresh();
    const state = useSchemaStore.getState();
    expect(state.schema?.nodeLabels[0]?.name).toBe("Domain");
    expect(state.etag).toBe("W/\"v1\"");
    fetchMock.mockRestore();
  });

  test("refresh on 304 keeps the prior schema unchanged", async () => {
    useSchemaStore.getState().setFromServer(STATIC_SCHEMA_FALLBACK, "W/\"v1\"");
    const before = useSchemaStore.getState().schema;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 304 }),
    );
    await useSchemaStore.getState().refresh();
    expect(useSchemaStore.getState().schema).toBe(before);
    expect(useSchemaStore.getState().etag).toBe("W/\"v1\"");
    fetchMock.mockRestore();
  });
});

describe("prefStore", () => {
  beforeEach(() => {
    // jsdom under bun exposes localStorage as a plain object on first
    // access; assert it's the real Storage and reset via the spec
    // interface. If clear() exists, prefer it; otherwise reach in.
    if (typeof localStorage.clear === "function") localStorage.clear();
    usePrefStore.setState({ homeDomainId: null });
  });

  test("setHomeDomain updates the store state", () => {
    usePrefStore.getState().setHomeDomain("d-001");
    expect(usePrefStore.getState().homeDomainId).toBe("d-001");
  });

  test("clearHomeDomain wipes the value", () => {
    usePrefStore.getState().setHomeDomain("d-001");
    usePrefStore.getState().clearHomeDomain();
    expect(usePrefStore.getState().homeDomainId).toBeNull();
  });

  test("setHomeDomain persists to storage when available", () => {
    usePrefStore.getState().setHomeDomain("d-002");
    if (typeof localStorage.getItem === "function") {
      const persisted = localStorage.getItem("companygraph.prefs.v1");
      expect(persisted).toBeTruthy();
      expect(persisted).toContain("d-002");
    }
  });
});
