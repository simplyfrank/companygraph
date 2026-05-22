// AC-11 — "Show evidence" disclosure renders tool-call audit rows.
//
// Pure data-shape assertions on the formatter helpers; we avoid
// rendering React to keep the test runner free of jsdom.

import { describe, test, expect } from "bun:test";

import {
  formatToolArgs,
  formatToolCallLine,
} from "../../src/views/chat/SidePanel";
import type { ToolCall } from "@companygraph/shared/types";

function tc(overrides: Partial<ToolCall> & Pick<ToolCall, "tool_name">): ToolCall {
  return {
    args: {},
    duration_ms: 0,
    row_count: 0,
    result_preview: "",
    ...overrides,
  } as ToolCall;
}

describe("SidePanel — AC-11 evidence formatting", () => {
  test("formatToolArgs JSON-encodes object args", () => {
    expect(formatToolArgs({ id: "abc", limit: 10 })).toBe('{"id":"abc","limit":10}');
  });

  test("formatToolArgs handles null/undefined", () => {
    expect(formatToolArgs(null)).toBe("");
    expect(formatToolArgs(undefined)).toBe("");
  });

  test("formatToolArgs truncates long args with an ellipsis", () => {
    const big = { x: "a".repeat(200) };
    const out = formatToolArgs(big);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out.endsWith("…")).toBe(true);
  });

  test("formatToolCallLine composes name(args) · rows · ms", () => {
    const line = formatToolCallLine(tc({
      tool_name: "get_journey",
      args: { id: "uj_order" },
      duration_ms: 42.6,
      row_count: 7,
    }));
    expect(line).toBe('get_journey({"id":"uj_order"}) · 7 rows · 43ms');
  });

  test("formatToolCallLine treats null row_count as 0", () => {
    const line = formatToolCallLine(tc({
      tool_name: "list_domains",
      args: {},
      duration_ms: 12,
      row_count: null,
    }));
    expect(line).toBe("list_domains({}) · 0 rows · 12ms");
  });
});
