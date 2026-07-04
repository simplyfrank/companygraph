// Network error mock for analytics-overview-network-stats-failure
export function mockStatsLoadingFailure(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      throw new Error("Stats loading failure");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}