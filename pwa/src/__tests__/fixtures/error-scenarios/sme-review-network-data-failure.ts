// Network error mock for sme-review-network-data-failure
export function mockReviewDataFailure(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      throw new Error("Review data loading failure");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}