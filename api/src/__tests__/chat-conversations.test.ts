// T-21 — Chat conversation API tests.
//
// Covers the two read-only conversation endpoints exposed by the
// central router gate:
//
//   GET /api/v1/chat/conversations            — list newest-first (FR-06)
//   GET /api/v1/chat/conversations/:id/messages — message history (FR-07)
//
// Transport (task-review B-01 pin — binding): every request is
// dispatched IN-PROCESS through the exported `route(req)` — the exact
// function Bun.serve wraps in server.ts — so the identical gate path
// runs (dispatch → cookie parse → getSession → getRoutePermission →
// hasPermissionByRbac). ONELOGIN_ISSUER is set BEFORE the router module
// is imported so the gate is real (no dev-fallback); sessions are minted
// via the real in-memory `createSession` (oauth.ts). The chat SQLite
// layer is pointed at an in-memory DB (`:memory:`) so no file artefacts
// are produced and tests are hermetic.

process.env.ONELOGIN_ISSUER = "https://test.invalid";
process.env.CHAT_DB_PATH = ":memory:";
process.env.NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? "test";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createSession } from "../auth/oauth";
import {
  appendMessage,
  closeChatDb,
  createConversation,
  getDb,
  initChatDb,
  resetChatDbForTest,
} from "../chat/persistence";

// Dynamic import AFTER the env assignment above so the router module
// body observes ONELOGIN_ISSUER set (the gate reads it at call time,
// but importing here keeps the ordering explicit and matches the
// sibling integration-test pattern).
const { route } = await import("../router");
const { getOpenApiDoc } = await import("../routes/openapi");

const BASE = "http://127.0.0.1:8787/api/v1";

let cookie: string;

async function call(
  c: string | undefined,
  method: string,
  path: string,
): Promise<{ status: number; body: any }> {
  const res = await route(
    new Request(`${BASE}${path}`, {
      method,
      headers: c ? { cookie: `session=${c}` } : {},
    }),
  );
  const text = await res.text();
  return { status: res.status, body: text.length > 0 ? JSON.parse(text) : null };
}

describe("T-21 chat conversation API", () => {
  beforeAll(async () => {
    // Fresh in-memory chat DB for this suite.
    resetChatDbForTest();
    initChatDb();

    // Real session through the real gate — chat:read is required for
    // both conversation routes (rbac-permissions.ts). ["*"] satisfies
    // hasPermissionByRbac.
    cookie = await createSession(
      { sub: "t21-user", name: "T21 User", email: "t21@test.invalid" },
      ["admin"],
      ["*"],
      [],
      ["admin"],
      ["*"],
    );
  });

  afterAll(() => {
    closeChatDb();
    delete process.env.ONELOGIN_ISSUER;
  });

  test("GET /chat/conversations without session → 401", async () => {
    const res = await call(undefined, "GET", "/chat/conversations");
    expect(res.status).toBe(401);
  });

  test("GET /chat/conversations with session → 200 + { rows: [...] } newest-first", async () => {
    // Seed two conversations with distinct, deterministic
    // last_message_at values so the newest-first ordering is stable
    // regardless of millisecond-level clock granularity.
    const older = createConversation({ title: "older" });
    const newer = createConversation({ title: "newer" });
    const db = getDb();
    db.prepare(`UPDATE chat_conversations SET last_message_at = ? WHERE id = ?`).run(
      "2024-01-01T00:00:00.000Z",
      older.id,
    );
    db.prepare(`UPDATE chat_conversations SET last_message_at = ? WHERE id = ?`).run(
      "2024-06-01T00:00:00.000Z",
      newer.id,
    );

    const res = await call(cookie, "GET", "/chat/conversations");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows.length).toBeGreaterThanOrEqual(2);

    // listConversations orders by last_message_at DESC — the
    // conversation with the later last_message_at must be first.
    const ids = res.body.rows.map((r: any) => r.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
    expect(res.body.rows[0].id).toBe(newer.id);

    // Row shape matches ConversationRow.
    for (const row of res.body.rows) {
      expect(row).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          created_at: expect.any(String),
          last_message_at: expect.any(String),
        }),
      );
      expect(["string", "object"]).toContain(typeof row.title);
      expect(["string", "object"]).toContain(typeof row.role_id_pin);
    }
  });

  test("GET /chat/conversations/:id/messages with unknown id → 404", async () => {
    const unknownId = "00000000-0000-0000-0000-000000000000";
    const res = await call(cookie, "GET", `/chat/conversations/${unknownId}/messages`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  test("GET /chat/conversations/:id/messages with known id → 200 + ordered messages", async () => {
    const conv = createConversation({ title: "history-conv" });
    appendMessage({
      conversation_id: conv.id,
      turn_index: 0,
      role: "user",
      content_text: "first",
    });
    appendMessage({
      conversation_id: conv.id,
      turn_index: 1,
      role: "assistant",
      content_text: "second",
    });
    appendMessage({
      conversation_id: conv.id,
      turn_index: 2,
      role: "user",
      content_text: "third",
    });

    const res = await call(cookie, "GET", `/chat/conversations/${conv.id}/messages`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows).toHaveLength(3);

    // listMessages orders by turn_index ASC.
    const indices = res.body.rows.map((r: any) => r.turn_index);
    expect(indices).toEqual([0, 1, 2]);
    expect(res.body.rows[0].content_text).toBe("first");
    expect(res.body.rows[2].content_text).toBe("third");

    for (const row of res.body.rows) {
      expect(row).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          conversation_id: conv.id,
          turn_index: expect.any(Number),
          content_text: expect.any(String),
          created_at: expect.any(String),
        }),
      );
      expect(["user", "assistant"]).toContain(row.role);
    }
  });

  test("both routes appear in the OpenAPI schema", () => {
    const doc = getOpenApiDoc() as { paths: Record<string, Record<string, unknown>> };
    const paths = doc.paths;
    expect(paths["/api/v1/chat/conversations"]).toBeDefined();
    expect(paths["/api/v1/chat/conversations"]!.get).toBeDefined();
    expect(paths["/api/v1/chat/conversations/{id}/messages"]).toBeDefined();
    expect(paths["/api/v1/chat/conversations/{id}/messages"]!.get).toBeDefined();
  });
});
