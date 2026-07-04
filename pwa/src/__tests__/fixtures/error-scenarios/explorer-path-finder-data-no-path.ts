// Data error mock for explorer-path-finder-data-no-path
export function mockNoPathFound(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      return new Response(
        JSON.stringify({ error: { code: "no_path_found", message: "No path found within depth" } }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}