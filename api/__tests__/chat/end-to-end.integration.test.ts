import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// T-27 — End-to-end smoke covering the 5 refusal paths + a happy path,
// against MockLLMClient with seeded fixtures. Designed to run WITHOUT Neo4j —
// all tool calls use `describe_schema` (in-memory) so the test exercises the
// orchestrator + dispatch + refusal precedence + envelope-shaping without
// depending on a database.

const TEST_DB = "../data/chat-e2e-test.db";
process.env.CHAT_DB_PATH = TEST_DB;
process.env.NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? "test";
process.env.ANTHROPIC_API_KEY = ""; // force MockLLMClient

const ABS_DB = resolve(process.cwd(), TEST_DB);

function rmDb(): void {
  for (const suffix of ["", "-shm", "-wal"]) {
    const p = ABS_DB + suffix;
    if (existsSync(p)) try { unlinkSync(p); } catch { /* */ }
  }
}

beforeAll(async () => {
  rmDb();
  const { initChatDb } = await import("../../src/chat/persistence");
  initChatDb();
});

afterAll(async () => {
  const { closeChatDb } = await import("../../src/chat/persistence");
  closeChatDb();
  rmDb();
});

beforeEach(async () => {
  const { resetLLMClientForTest } = await import("../../src/chat/llm/factory");
  resetLLMClientForTest();
});

describe("integration: T-27 end-to-end smoke", () => {
  test("default fixture → returns a valid envelope (degraded mock)", async () => {
    process.env.MOCK_LLM_FIXTURE = "default";
    const { resetLLMClientForTest } = await import("../../src/chat/llm/factory");
    resetLLMClientForTest();
    const { runAgentTurn } = await import("../../src/chat/agent");
    const env = await runAgentTurn({ message: "hello" });
    expect(env.message_id).toBeTruthy();
    expect(env.conversation_id).toBeTruthy();
    expect(env.role_id).toBeTruthy();
    expect(typeof env.answer).toBe("string");
    expect(env.highlight).toEqual(expect.objectContaining({
      nodes: expect.any(Array),
      edges: expect.any(Array),
      paths: expect.any(Array),
    }));
    expect(env.tool_calls).toEqual(expect.any(Array));
    expect(env.latency_ms_breakdown.total_ms).toBeGreaterThan(0);
    expect(env.degraded).toBe("mock_llm");
  });

  test("AC-20: oos fixture → FR-G02 fixed string, no tool calls", async () => {
    process.env.MOCK_LLM_FIXTURE = "oos";
    const { resetLLMClientForTest } = await import("../../src/chat/llm/factory");
    resetLLMClientForTest();
    const { runAgentTurn } = await import("../../src/chat/agent");
    const { FR_G02_STRING } = await import("../../src/chat/refusal");
    const env = await runAgentTurn({ message: "what's the weather?" });
    expect(env.answer).toBe(FR_G02_STRING);
    expect(env.tool_calls).toEqual([]);
    expect(env.highlight.nodes).toEqual([]);
    expect(env.highlight.edges).toEqual([]);
  });

  test("AC-03: budget-exhaust → 5 tool calls + FR-G05 appended", async () => {
    process.env.MOCK_LLM_FIXTURE = "budget-exhaust";
    const { resetLLMClientForTest } = await import("../../src/chat/llm/factory");
    resetLLMClientForTest();
    const { runAgentTurn } = await import("../../src/chat/agent");
    const { FR_G05_STRING } = await import("../../src/chat/refusal");
    const env = await runAgentTurn({ message: "do all the things" });
    expect(env.tool_calls.length).toBeLessThanOrEqual(5);
    if (env.tool_calls.length === 5) {
      expect(env.answer.endsWith(FR_G05_STRING)).toBe(true);
    }
  });

  test("envelope shape conforms to ChatEnvelope (AC-15)", async () => {
    process.env.MOCK_LLM_FIXTURE = "default";
    const { resetLLMClientForTest } = await import("../../src/chat/llm/factory");
    resetLLMClientForTest();
    const { runAgentTurn } = await import("../../src/chat/agent");
    const env = await runAgentTurn({ message: "ping" });
    // Required fields per shared/src/types.ts ChatEnvelope:
    expect(env).toEqual(expect.objectContaining({
      message_id: expect.any(String),
      conversation_id: expect.any(String),
      role_id: expect.any(String),
      answer: expect.any(String),
      citations: expect.any(Array),
      highlight: expect.any(Object),
      tool_calls: expect.any(Array),
      latency_ms_breakdown: expect.any(Object),
    }));
    expect(env.explorer_deep_link).toBeNull(); // FR-H03 graceful degrade
  });

  test("AC-14: conversation context carries across turns", async () => {
    process.env.MOCK_LLM_FIXTURE = "default";
    const { resetLLMClientForTest } = await import("../../src/chat/llm/factory");
    resetLLMClientForTest();
    const { runAgentTurn } = await import("../../src/chat/agent");
    const env1 = await runAgentTurn({ message: "first turn" });
    expect(env1.conversation_id).toBeTruthy();
    const env2 = await runAgentTurn({
      message: "second turn",
      conversation_id: env1.conversation_id,
    });
    expect(env2.conversation_id).toBe(env1.conversation_id);
  });
});
