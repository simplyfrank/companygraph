// Data error mock for explorer-journey-detail-data-404
export function mockJourney404(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      return new Response(
        JSON.stringify({ error: { code: "journey_404", message: "Journey 404 when accessing invalid journey ID" } }),
        { status: 404 }
      );
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}