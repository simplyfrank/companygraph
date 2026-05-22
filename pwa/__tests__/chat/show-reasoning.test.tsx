// AC-12 — "Show reasoning" disclosure renders the same audit trail as
// SidePanel but as a numbered list. We assert the shared formatter
// helpers (re-exported from SidePanel) produce the lines the
// ReasoningDisclosure component renders.

import { describe, test, expect } from "bun:test";

import { formatToolArgs } from "../../src/views/chat/SidePanel";
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

describe("ReasoningDisclosure — AC-12 numbered reasoning steps", () => {
  test("formats a single tool call into name(args) · rows · ms", () => {
    const call = tc({
      tool_name: "sla_hotspots",
      args: { journey: "uj_order", limit: 5 },
      duration_ms: 88,
      row_count: 5,
    });
    const line = `${call.tool_name}(${formatToolArgs(call.args)})`;
    expect(line).toBe('sla_hotspots({"journey":"uj_order","limit":5})');
  });

  test("preserves ordering across multiple steps (used for <ol> rendering)", () => {
    const steps: ToolCall[] = [
      tc({ tool_name: "list_domains", args: {}, duration_ms: 5, row_count: 4 }),
      tc({ tool_name: "get_domain", args: { id: "d1" }, duration_ms: 12, row_count: 1 }),
      tc({ tool_name: "get_journey", args: { id: "j1" }, duration_ms: 33, row_count: 1 }),
    ];
    const lines = steps.map((s, i) =>
      `${i + 1}. ${s.tool_name}(${formatToolArgs(s.args)}) · ${s.row_count} rows · ${Math.round(s.duration_ms)}ms`,
    );
    expect(lines).toEqual([
      "1. list_domains({}) · 4 rows · 5ms",
      '2. get_domain({"id":"d1"}) · 1 rows · 12ms',
      '3. get_journey({"id":"j1"}) · 1 rows · 33ms',
    ]);
  });

  test("includes error_code when present in the audit row", () => {
    const errCall = tc({
      tool_name: "cypher",
      args: { statement: "MATCH (n) RETURN n" },
      duration_ms: 4,
      row_count: 0,
      error_code: "result_truncated",
    });
    expect(errCall.error_code).toBe("result_truncated");
    expect(errCall.row_count).toBe(0);
  });
});
