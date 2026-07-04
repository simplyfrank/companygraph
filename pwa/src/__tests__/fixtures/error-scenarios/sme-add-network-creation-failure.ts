// Network error mock for sme-add-network-creation-failure
export function mockJourneyCreationFailure(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      throw new Error("Journey creation failure");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}