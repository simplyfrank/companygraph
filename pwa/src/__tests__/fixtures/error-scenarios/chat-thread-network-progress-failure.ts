// Network error mock for chat-thread-network-progress-failure
export function mockProgressPollingFailure(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      throw new Error("Progress polling failure during streaming");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}