// Network error mock for cross-cutting-network-service-offline
export function mockServiceOffline(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      throw new Error("Service offline (Neo4j unreachable)");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}