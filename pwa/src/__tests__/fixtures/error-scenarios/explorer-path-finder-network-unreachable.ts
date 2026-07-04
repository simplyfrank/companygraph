// Network error mock for explorer-path-finder-network-unreachable
export function mockNeo4jUnreachable(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      throw new Error("Neo4j unreachable during path finding");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}