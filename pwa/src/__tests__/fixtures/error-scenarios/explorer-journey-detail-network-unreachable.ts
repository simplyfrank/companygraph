// Network error mock for explorer-journey-detail-network-unreachable
export function mockJourneyFetchFailure(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      throw new Error("Journey data fetch failure");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}