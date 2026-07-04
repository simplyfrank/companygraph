// Network error mock for chat-thread-network-send-failure
export function mockMessageSendFailure(endpoint?: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (!endpoint || u.includes(endpoint)) {
      throw new Error("Chat message send failure");
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200 });
  });
}