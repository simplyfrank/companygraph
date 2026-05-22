// Integration tests for the chat SQLite persistence layer (T-03).
//
// Uses an isolated test DB file (`../data/chat-test.db`) so the
// production DB is never touched. The test is prefixed
// `^integration:` to match `bun test:integration`.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import type { HighlightPayload, ToolCall } from "@companygraph/shared";
import {
  appendMessage,
  closeChatDb,
  createBookmark,
  createConversation,
  deleteBookmark,
  getChatDbPath,
  getConversation,
  getDb,
  initChatDb,
  listBookmarks,
  loadBoundContext,
  loadConversationHistory,
  resetChatDbForTest,
} from "../../src/chat/persistence";

const TEST_DB_REL = "../data/chat-test.db";
let TEST_DB_ABS = "";

function safeUnlink(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    /* ignore */
  }
}

describe("integration: T-03 chat persistence", () => {
  beforeAll(() => {
    process.env.CHAT_DB_PATH = TEST_DB_REL;
    // Required by loadEnv() — value is unused by SQLite path.
    if (!process.env.NEO4J_PASSWORD) {
      process.env.NEO4J_PASSWORD = "test";
    }
    // Clean up any leftover artefacts from a prior failed run.
    const abs = resolve(process.cwd(), TEST_DB_REL);
    TEST_DB_ABS = abs;
    safeUnlink(abs);
    safeUnlink(abs + "-wal");
    safeUnlink(abs + "-shm");
    initChatDb();
  });

  afterAll(() => {
    closeChatDb();
    const abs = TEST_DB_ABS || resolve(process.cwd(), TEST_DB_REL);
    safeUnlink(abs);
    safeUnlink(abs + "-wal");
    safeUnlink(abs + "-shm");
  });

  test("WAL mode is on after init", () => {
    const db = getDb();
    const row = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    expect(row.journal_mode.toLowerCase()).toBe("wal");
    expect(getChatDbPath()).toBe(TEST_DB_ABS);
  });

  test("createConversation + getConversation round-trip", () => {
    const conv = createConversation({ title: "first chat", role_id_pin: "graph_analyst" });
    expect(conv.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(conv.title).toBe("first chat");
    expect(conv.role_id_pin).toBe("graph_analyst");

    const fetched = getConversation(conv.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(conv.id);
    expect(fetched!.title).toBe("first chat");
    expect(fetched!.role_id_pin).toBe("graph_analyst");
    expect(fetched!.created_at).toBe(conv.created_at);

    expect(getConversation("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  test("appendMessage + loadBoundContext returns last assistant turn's highlight ids (capped at 50)", () => {
    const conv = createConversation({ title: "bound-context" });

    // User turn (no highlight).
    appendMessage({
      conversation_id: conv.id,
      turn_index: 0,
      role: "user",
      content_text: "hello",
    });

    // First assistant turn — its highlight should be SUPERSEDED by a later one.
    const earlyHighlight: HighlightPayload = {
      nodes: ["should-not-appear"],
      edges: ["should-not-appear-edge"],
      paths: [],
    };
    appendMessage({
      conversation_id: conv.id,
      turn_index: 1,
      role: "assistant",
      content_text: "first answer",
      highlight: earlyHighlight,
    });

    // Build a highlight with > 50 node ids and > 50 edge ids.
    const manyNodes = Array.from({ length: 60 }, (_, i) => `n_${i}`);
    const manyEdges = Array.from({ length: 60 }, (_, i) => `e_${i}`);
    const toolCalls: ToolCall[] = [
      {
        tool_name: "get_journey",
        args: { journey_id: "uj_x" },
        duration_ms: 12,
        row_count: 5,
        result_preview: "ok",
      },
    ];

    appendMessage({
      conversation_id: conv.id,
      turn_index: 2,
      role: "user",
      content_text: "follow-up",
    });
    appendMessage({
      conversation_id: conv.id,
      turn_index: 3,
      role: "assistant",
      content_text: "second answer",
      highlight: { nodes: manyNodes, edges: manyEdges, paths: [] },
      tool_calls: toolCalls,
      latency_ms_breakdown: {
        total_ms: 200,
        llm_calls: 2,
        per_tool_ms: { get_journey: 12 },
      },
    });

    const bound = loadBoundContext(conv.id);
    expect(bound.node_ids).toHaveLength(50);
    expect(bound.edge_ids).toHaveLength(50);
    expect(bound.node_ids[0]).toBe("n_0");
    expect(bound.node_ids[49]).toBe("n_49");
    expect(bound.edge_ids[0]).toBe("e_0");
    expect(bound.edge_ids[49]).toBe("e_49");
    // None of the earlier turn's ids leak through.
    expect(bound.node_ids).not.toContain("should-not-appear");
    expect(bound.edge_ids).not.toContain("should-not-appear-edge");

    // An empty conversation returns empty arrays.
    const empty = createConversation();
    const emptyBound = loadBoundContext(empty.id);
    expect(emptyBound.node_ids).toEqual([]);
    expect(emptyBound.edge_ids).toEqual([]);
  });

  test("loadConversationHistory returns ≤ maxMessages, ordered by turn_index asc", () => {
    const conv = createConversation({ title: "history" });
    for (let i = 0; i < 6; i += 1) {
      appendMessage({
        conversation_id: conv.id,
        turn_index: i,
        role: i % 2 === 0 ? "user" : "assistant",
        content_text: `msg ${i}`,
      });
    }

    const hist = loadConversationHistory(conv.id, {
      maxMessages: 4,
      maxTokensEstimate: 10_000,
    });
    expect(hist).toHaveLength(4);
    // Sorted ascending by turn_index; oldest dropped first.
    const indices = hist.map((m) => m.turn_index);
    expect(indices).toEqual([2, 3, 4, 5]);
    expect(hist[0]!.content_text).toBe("msg 2");
    expect(hist[3]!.content_text).toBe("msg 5");

    // Token cap drops oldest first.
    const tight = loadConversationHistory(conv.id, {
      maxMessages: 10,
      maxTokensEstimate: 4,
    });
    expect(tight.length).toBeLessThan(6);
  });

  test("bookmark create + list + delete", () => {
    const conv = createConversation({ title: "bookmarks" });
    const bm1 = createBookmark({
      conversation_id: conv.id,
      question: "show SLA breaches",
      role_id_pin: "uj_order_fulfillment",
      name: "Breaches",
    });
    const bm2 = createBookmark({
      conversation_id: conv.id,
      question: "list domains",
      name: "All domains",
    });

    const all = listBookmarks(conv.id);
    expect(all.map((b) => b.id).sort()).toEqual([bm1.id, bm2.id].sort());
    expect(all.find((b) => b.id === bm1.id)?.role_id_pin).toBe("uj_order_fulfillment");
    expect(all.find((b) => b.id === bm2.id)?.role_id_pin).toBeNull();

    // Cross-conversation listing (no filter).
    const globalCount = listBookmarks().length;
    expect(globalCount).toBeGreaterThanOrEqual(2);

    expect(deleteBookmark(bm1.id)).toBe(true);
    expect(deleteBookmark(bm1.id)).toBe(false); // already gone
    const afterDelete = listBookmarks(conv.id);
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0]!.id).toBe(bm2.id);
  });

  test("init is idempotent — running twice doesn't throw", () => {
    // Initial init happened in beforeAll. Calling again must return
    // the same handle and must not throw.
    expect(() => initChatDb()).not.toThrow();
    // Re-init after a manual close should rebuild fresh tables on
    // the same file path without erroring (CREATE TABLE IF NOT EXISTS).
    resetChatDbForTest();
    expect(() => initChatDb()).not.toThrow();
    const db = getDb();
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain("chat_conversations");
    expect(names).toContain("chat_messages");
    expect(names).toContain("chat_llm_quota");
    expect(names).toContain("chat_bookmarks");
  });
});
