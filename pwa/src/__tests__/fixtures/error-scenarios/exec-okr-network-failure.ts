// Network error mock for exec-okr-network-failure
export function mockOkrDataFailure(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      throw new Error("OKR data loading failure");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}