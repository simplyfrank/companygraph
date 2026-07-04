// Data error mock for analytics-overview-data-calculation-failure
export function mockMetricsCalculationFailure(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      return new Response(
        JSON.stringify({ error: { code: "metrics_calculation_failure", message: "Metrics calculation failures" } }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}