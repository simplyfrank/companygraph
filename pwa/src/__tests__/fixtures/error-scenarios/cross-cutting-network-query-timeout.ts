// Network error mock for cross-cutting-network-query-timeout
export function mockQueryTimeout(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      throw new Error("Query timeout (5s)");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}