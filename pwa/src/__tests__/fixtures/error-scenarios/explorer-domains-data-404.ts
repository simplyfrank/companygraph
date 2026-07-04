// Data error mock for explorer-domains-data-404
export function mockDomainDetail404(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      return new Response(
        JSON.stringify({ error: { code: "domain_detail_404", message: "Domain detail 404 when accessing invalid domain ID" } }),
        { status: 404 }
      );
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}