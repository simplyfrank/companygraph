// Network error mock for ontology-erd-network-graph-failure
export function mockGraphDataFailure(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      throw new Error("Graph data loading failure");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}