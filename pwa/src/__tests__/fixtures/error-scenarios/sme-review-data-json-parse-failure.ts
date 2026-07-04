// Data error mock for sme-review-data-json-parse-failure
export function mockJsonParseFailure(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      return new Response(
        JSON.stringify({ error: { code: "json_parse_failure", message: "JSON parsing failures in bulk paste" } }),
        { status: 400 }
      );
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}