// AC-26 — LatencyFooter renders `{total_ms}ms · {llm_calls} LLM calls
// · {sum per_tool_ms}ms tool exec`.

import { describe, test, expect } from "bun:test";

import {
  formatLatency,
  sumPerToolMs,
} from "../../src/views/chat/LatencyFooter";
import type { LatencyBreakdown } from "@companygraph/shared/types";

describe("LatencyFooter — AC-26", () => {
  test("sums per-tool durations", () => {
    const b: LatencyBreakdown = {
      total_ms: 1200,
      llm_calls: 3,
      per_tool_ms: { list_domains: 5, get_journey: 30, sla_hotspots: 88 },
    };
    expect(sumPerToolMs(b)).toBe(123);
  });

  test("formatLatency composes one-line summary", () => {
    const b: LatencyBreakdown = {
      total_ms: 1234,
      llm_calls: 4,
      per_tool_ms: { get_activity: 12, neighbors: 28 },
    };
    expect(formatLatency(b)).toBe("1234ms · 4 LLM calls · 40ms tool exec");
  });

  test("rounds fractional total + tool ms to integers", () => {
    const b: LatencyBreakdown = {
      total_ms: 1199.6,
      llm_calls: 2,
      per_tool_ms: { aggregate: 7.4, find_path: 8.7 },
    };
    expect(formatLatency(b)).toBe("1200ms · 2 LLM calls · 16ms tool exec");
  });

  test("handles empty per_tool_ms map", () => {
    const b: LatencyBreakdown = {
      total_ms: 80,
      llm_calls: 1,
      per_tool_ms: {},
    };
    expect(sumPerToolMs(b)).toBe(0);
    expect(formatLatency(b)).toBe("80ms · 1 LLM calls · 0ms tool exec");
  });

  test("ignores NaN/Infinity in per_tool_ms (defensive)", () => {
    const b: LatencyBreakdown = {
      total_ms: 100,
      llm_calls: 1,
      per_tool_ms: { ok: 10, broken: NaN, big: Infinity },
    };
    expect(sumPerToolMs(b)).toBe(10);
  });
});
