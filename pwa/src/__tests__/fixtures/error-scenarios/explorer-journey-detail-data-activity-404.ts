// Data error mock for explorer-journey-detail-data-activity-404
export function mockActivity404(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      return new Response(
        JSON.stringify({ error: { code: "activity_404", message: "Activity 404 when accessing invalid activity ID" } }),
        { status: 404 }
      );
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}