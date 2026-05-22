// AC-31 — when ANTHROPIC_API_KEY is unset the factory returns a
// MockLLMClient and the orchestrator stamps `degraded: 'mock_llm'`
// on the envelope. Here we cover only the factory portion; the
// envelope stamping is exercised by the orchestrator's integration
// tests.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { MockLLMClient } from "../../src/chat/llm/mock";
import {
  getLLMClient,
  resetLLMClientForTest,
} from "../../src/chat/llm/factory";

const ORIGINAL_ANTHROPIC = process.env.ANTHROPIC_API_KEY;
const ORIGINAL_NEO4J = process.env.NEO4J_PASSWORD;

describe("AC-31 — factory degraded mode", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "";
    process.env.NEO4J_PASSWORD = "test";
    resetLLMClientForTest();
  });

  afterEach(() => {
    if (ORIGINAL_ANTHROPIC === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_ANTHROPIC;
    if (ORIGINAL_NEO4J === undefined) delete process.env.NEO4J_PASSWORD;
    else process.env.NEO4J_PASSWORD = ORIGINAL_NEO4J;
    resetLLMClientForTest();
  });

  test("unset key → MockLLMClient with degraded === true", () => {
    const c = getLLMClient();
    expect(c).toBeInstanceOf(MockLLMClient);
    expect(c.degraded).toBe(true);
  });

  test("warning is logged when falling back to mock", () => {
    const calls: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      calls.push(args);
    };
    try {
      getLLMClient();
    } finally {
      console.warn = original;
    }
    const joined = calls.map((c) => c.join(" ")).join("\n");
    expect(joined).toContain("ANTHROPIC_API_KEY");
    expect(joined.toLowerCase()).toContain("mockllmclient");
  });

  test("memoised — repeated calls return the same instance", () => {
    const c1 = getLLMClient();
    const c2 = getLLMClient();
    expect(c1).toBe(c2);
  });

  test("resetLLMClientForTest() clears the memo", () => {
    const c1 = getLLMClient();
    resetLLMClientForTest();
    const c2 = getLLMClient();
    expect(c1).not.toBe(c2);
  });
});
