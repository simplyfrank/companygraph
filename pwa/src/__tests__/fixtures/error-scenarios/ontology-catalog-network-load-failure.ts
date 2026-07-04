// Network error mock for ontology-catalog-network-load-failure
export function mockLabelListFailure(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      throw new Error("Label list loading failure");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}