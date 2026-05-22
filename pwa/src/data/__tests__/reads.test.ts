import { describe, test, expect, beforeEach, vi } from "vitest";
import { read, cypherDedup, clearCache } from "../reads";

describe("reads.read", () => {
  beforeEach(() => {
    clearCache();
    vi.restoreAllMocks();
  });

  test("two concurrent reads share one in-flight promise", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const [a, b] = await Promise.all([read("/x"), read("/x")]);
    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("cached read within TTL skips fetch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ v: 1 }), { status: 200 }),
    );
    await read("/y");
    await read("/y");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("read past TTL re-fetches", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ v: 1 }), { status: 200 }),
    );
    await read("/z", { ttlMs: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await read("/z", { ttlMs: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("non-2xx throws an Error containing the status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "not_found" } }), {
        status: 404,
        statusText: "Not Found",
      }),
    );
    await expect(read("/missing")).rejects.toThrow(/404/);
  });

  test("aborting via AbortSignal cancels the in-flight fetch", async () => {
    const controller = new AbortController();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const signal = (init as RequestInit | undefined)?.signal;
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(
          () => resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
          50,
        );
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });
    const promise = read("/slow", { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toThrow(/abort/i);
  });
});

describe("reads.cypherDedup", () => {
  beforeEach(() => {
    clearCache();
    vi.restoreAllMocks();
  });

  test("same statement + params share one in-flight POST", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });
    await Promise.all([
      cypherDedup("MATCH (n) RETURN n", { foo: 1 }),
      cypherDedup("MATCH (n) RETURN n", { foo: 1 }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("different params bust the dedup cache", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ rows: [] }), { status: 200 }),
    );
    await cypherDedup("MATCH (n) RETURN n", { foo: 1 });
    await cypherDedup("MATCH (n) RETURN n", { foo: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
