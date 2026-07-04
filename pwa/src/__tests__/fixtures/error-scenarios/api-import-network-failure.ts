// Network error mock for api-import-network-failure
export function mockImportOperationFailure(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      throw new Error("Import operation failure");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}