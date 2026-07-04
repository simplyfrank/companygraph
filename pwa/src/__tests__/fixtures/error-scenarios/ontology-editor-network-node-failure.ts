// Network error mock for ontology-editor-network-node-failure
export function mockNodeDetailFailure(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      throw new Error("Node detail loading failure");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}