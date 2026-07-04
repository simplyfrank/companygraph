// Network error mock for explorer-journey-graph-network-unreachable
export function mockMultiJourneyLoadFailure(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      throw new Error("Multi-journey data loading failure");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}