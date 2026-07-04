// Network error mock for explorer-domains-network-unreachable
export function mockApiUnreachable(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      throw new Error("API unreachable when loading domain list");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}