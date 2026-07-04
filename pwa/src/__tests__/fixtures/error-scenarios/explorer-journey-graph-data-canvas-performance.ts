// Data error mock for explorer-journey-graph-data-canvas-performance
export function mockCanvasPerformanceIssue(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      return new Response(
        JSON.stringify({ error: { code: "canvas_performance_issue", message: "Canvas rendering performance issues with large datasets" } }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}