// Network error mock for exec-kpi-network-failure
export function mockKpiDataFailure(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      throw new Error("KPI data loading failure");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}