// Network error mock for explorer-domains-network-timeout
export function mockConnectionTimeout(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      throw new Error("Connection timeout when loading domain list");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}