import { describe, test, expect, beforeEach } from "bun:test";
import {
  initProgress,
  setProgress,
  appendToolCallToProgress,
  getProgress,
  resetProgressForTest,
} from "../../src/chat/progress";
import type { ToolCall } from "@companygraph/shared";

beforeEach(() => {
  resetProgressForTest();
});

describe("T-08 progress snapshot store", () => {
  test("initProgress creates a fresh snapshot in 'classifying' state", () => {
    initProgress("m1", "c1");
    const snap = getProgress("m1");
    expect(snap).not.toBeNull();
    expect(snap?.message_id).toBe("m1");
    expect(snap?.conversation_id).toBe("c1");
    expect(snap?.state).toBe("classifying");
    expect(snap?.tool_calls_so_far).toEqual([]);
  });

  test("setProgress updates state + updated_at", async () => {
    initProgress("m1", "c1");
    const t0 = getProgress("m1")?.updated_at;
    await new Promise(r => setTimeout(r, 5));
    setProgress("m1", "llm_call");
    const t1 = getProgress("m1")?.updated_at;
    expect(getProgress("m1")?.state).toBe("llm_call");
    expect(t1).not.toBe(t0);
  });

  test("setProgress with tool:<name> state is preserved verbatim", () => {
    initProgress("m1", "c1");
    setProgress("m1", "tool:get_journey");
    expect(getProgress("m1")?.state).toBe("tool:get_journey");
  });

  test("appendToolCallToProgress appends to tool_calls_so_far", () => {
    initProgress("m1", "c1");
    const tc: ToolCall = {
      tool_name: "list_domains",
      args: {},
      duration_ms: 25,
      row_count: 4,
      result_preview: "[]",
    };
    appendToolCallToProgress("m1", tc);
    expect(getProgress("m1")?.tool_calls_so_far).toHaveLength(1);
    expect(getProgress("m1")?.tool_calls_so_far[0]?.tool_name).toBe("list_domains");
  });

  test("setProgress on unknown message_id is a no-op", () => {
    setProgress("unknown", "llm_call");
    expect(getProgress("unknown")).toBeNull();
  });

  test("getProgress returns null for unknown message_id", () => {
    expect(getProgress("never")).toBeNull();
  });

  test("setProgress 'done' with result is observable", () => {
    initProgress("m1", "c1");
    const fakeEnv = {
      message_id: "m1",
      conversation_id: "c1",
      role_id: "graph_analyst" as const,
      answer: "ok",
      citations: [],
      highlight: { nodes: [], edges: [], paths: [] },
      explorer_deep_link: null,
      tool_calls: [],
      latency_ms_breakdown: { total_ms: 100, llm_calls: 1, per_tool_ms: {} },
    };
    setProgress("m1", "done", { result: fakeEnv });
    expect(getProgress("m1")?.state).toBe("done");
    expect(getProgress("m1")?.result?.answer).toBe("ok");
  });
});
