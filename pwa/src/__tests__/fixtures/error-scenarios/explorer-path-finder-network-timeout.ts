// Network error mock for explorer-path-finder-network-timeout
export function mockPathQueryTimeout(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      throw new Error("Path query timeout (5s)");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}