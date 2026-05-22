// Unit tests for MockLLMClient fixture playback. Each test loads a
// scenario fixture via `process.env.MOCK_LLM_FIXTURE`, calls
// `callTurn` repeatedly, and asserts the expected turn sequence.
//
// Also asserts the `degraded` invariant: MockLLMClient.degraded ===
// true; AnthropicLLMClient.degraded === false (FR-B06).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { MockLLMClient } from "../../src/chat/llm/mock";
import { AnthropicLLMClient } from "../../src/chat/llm/anthropic";
import type { LLMCallOpts } from "../../src/chat/llm/client";

const NOOP_OPTS: LLMCallOpts = {
  messages: [],
  tools: [],
  system: "",
};

function freshClient(fixture: string): MockLLMClient {
  process.env.MOCK_LLM_FIXTURE = fixture;
  return new MockLLMClient({ defaultFixture: "default" });
}

const ORIGINAL_ENV = process.env.MOCK_LLM_FIXTURE;

beforeEach(() => {
  delete process.env.MOCK_LLM_FIXTURE;
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.MOCK_LLM_FIXTURE;
  else process.env.MOCK_LLM_FIXTURE = ORIGINAL_ENV;
});

describe("MockLLMClient — degraded flag", () => {
  test("degraded === true", () => {
    const c = new MockLLMClient({ defaultFixture: "default" });
    expect(c.degraded).toBe(true);
  });
});

describe("AnthropicLLMClient — degraded flag", () => {
  test("degraded === false", () => {
    const c = new AnthropicLLMClient({
      apiKey: "sk-ant-fake",
      model: "claude-sonnet-4-6",
    });
    expect(c.degraded).toBe(false);
  });
});

describe("MockLLMClient — fixture: default", () => {
  test("single end_turn with classifier prefix", async () => {
    const c = freshClient("default");
    const r = await c.callTurn(NOOP_OPTS);
    expect(r.stop_reason).toBe("end_turn");
    expect(r.tool_calls).toEqual([]);
    expect(r.text).toContain('"intent": "in_scope"');
    expect(r.text).toContain('"role_id": "graph_analyst"');
  });

  test("exhausted fixture returns empty end_turn", async () => {
    const c = freshClient("default");
    await c.callTurn(NOOP_OPTS);
    const r2 = await c.callTurn(NOOP_OPTS);
    expect(r2.stop_reason).toBe("end_turn");
    expect(r2.tool_calls).toEqual([]);
    expect(r2.text).toBe("");
  });
});

describe("MockLLMClient — fixture: grounded-answer", () => {
  test("turn 1 emits classifier + get_journey tool_use", async () => {
    const c = freshClient("grounded-answer");
    const r = await c.callTurn(NOOP_OPTS);
    expect(r.stop_reason).toBe("tool_use");
    expect(r.tool_calls).toHaveLength(1);
    expect(r.tool_calls[0]!.name).toBe("get_journey");
    expect(r.tool_calls[0]!.input).toEqual({ id: "uj_order_fulfillment" });
    expect(r.text).toContain('"intent": "in_scope"');
    expect(r.text).toContain('uj_order_fulfillment');
  });

  test("turn 2 emits end_turn with cited answer", async () => {
    const c = freshClient("grounded-answer");
    await c.callTurn(NOOP_OPTS);
    const r2 = await c.callTurn(NOOP_OPTS);
    expect(r2.stop_reason).toBe("end_turn");
    expect(r2.text).toContain("Order Fulfillment");
    expect(r2.text).toContain("sys_pos");
  });
});

describe("MockLLMClient — fixture: react-loop", () => {
  test("3-turn loop: sla_hotspots, neighbors, narrate", async () => {
    const c = freshClient("react-loop");
    const r1 = await c.callTurn(NOOP_OPTS);
    expect(r1.stop_reason).toBe("tool_use");
    expect(r1.tool_calls[0]!.name).toBe("sla_hotspots");

    const r2 = await c.callTurn(NOOP_OPTS);
    expect(r2.stop_reason).toBe("tool_use");
    expect(r2.tool_calls[0]!.name).toBe("neighbors");

    const r3 = await c.callTurn(NOOP_OPTS);
    expect(r3.stop_reason).toBe("end_turn");
    expect(r3.text).toBeDefined();
  });
});

describe("MockLLMClient — fixture: budget-exhaust", () => {
  test("emits 6 consecutive tool_use turns", async () => {
    const c = freshClient("budget-exhaust");
    for (let i = 0; i < 6; i++) {
      const r = await c.callTurn(NOOP_OPTS);
      expect(r.stop_reason).toBe("tool_use");
      expect(r.tool_calls).toHaveLength(1);
    }
  });
});

describe("MockLLMClient — fixture: oos", () => {
  test("single end_turn carries oos classifier prefix", async () => {
    const c = freshClient("oos");
    const r = await c.callTurn(NOOP_OPTS);
    expect(r.stop_reason).toBe("end_turn");
    expect(r.tool_calls).toEqual([]);
    expect(r.text).toContain('"intent": "oos"');
    expect(r.text).toContain('"oos_reason"');
  });
});

describe("MockLLMClient — fixture: zero-rows", () => {
  test("turn 1 = list_nodes_by_label with no-match filter; turn 2 = end_turn", async () => {
    const c = freshClient("zero-rows");
    const r1 = await c.callTurn(NOOP_OPTS);
    expect(r1.stop_reason).toBe("tool_use");
    expect(r1.tool_calls[0]!.name).toBe("list_nodes_by_label");
    const args = r1.tool_calls[0]!.input as { label: string; filter: { name_contains: string } };
    expect(args.label).toBe("Domain");
    expect(args.filter.name_contains).toBe("nonexistent");

    const r2 = await c.callTurn(NOOP_OPTS);
    expect(r2.stop_reason).toBe("end_turn");
  });
});

describe("MockLLMClient — fixture: write-attempt", () => {
  test("turn 1 emits a cypher CREATE call", async () => {
    const c = freshClient("write-attempt");
    const r = await c.callTurn(NOOP_OPTS);
    expect(r.stop_reason).toBe("tool_use");
    expect(r.tool_calls[0]!.name).toBe("cypher");
    const args = r.tool_calls[0]!.input as { statement: string };
    expect(args.statement).toMatch(/^CREATE/i);
  });
});

describe("MockLLMClient — fixture: truncated", () => {
  test("emits list_nodes_by_label for Activity (will trigger row cap)", async () => {
    const c = freshClient("truncated");
    const r = await c.callTurn(NOOP_OPTS);
    expect(r.stop_reason).toBe("tool_use");
    expect(r.tool_calls[0]!.name).toBe("list_nodes_by_label");
    const args = r.tool_calls[0]!.input as { label: string };
    expect(args.label).toBe("Activity");
  });
});

describe("MockLLMClient — fixture: role-mismatch", () => {
  test("classifier picks sod_register; downstream banner expected", async () => {
    const c = freshClient("role-mismatch");
    const r = await c.callTurn(NOOP_OPTS);
    expect(r.stop_reason).toBe("tool_use");
    expect(r.text).toContain('"role_id": "sod_register"');
  });
});

describe("MockLLMClient — fixture: degraded-default", () => {
  test("returns the degraded-mode default response", async () => {
    const c = freshClient("degraded-default");
    const r = await c.callTurn(NOOP_OPTS);
    expect(r.stop_reason).toBe("end_turn");
    expect(r.text).toContain("degraded");
  });
});

describe("MockLLMClient — env override beats defaultFixture", () => {
  test("MOCK_LLM_FIXTURE wins over constructor arg", async () => {
    process.env.MOCK_LLM_FIXTURE = "oos";
    const c = new MockLLMClient({ defaultFixture: "default" });
    const r = await c.callTurn(NOOP_OPTS);
    expect(r.text).toContain('"intent": "oos"');
  });

  test("falls back to defaultFixture when env unset", async () => {
    delete process.env.MOCK_LLM_FIXTURE;
    const c = new MockLLMClient({ defaultFixture: "default" });
    const r = await c.callTurn(NOOP_OPTS);
    expect(r.text).toContain('"intent": "in_scope"');
  });
});
