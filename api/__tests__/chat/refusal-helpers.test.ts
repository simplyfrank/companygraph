import { describe, test, expect } from "bun:test";
import type { ToolCall } from "@companygraph/shared";
import {
  FR_G01_STRING,
  FR_G02_STRING,
  FR_G03_STRING,
  FR_G04_STRING,
  FR_G05_STRING,
  isAllZeroRows,
  anyWriteRejection,
  anyResultTruncated,
  resolveAnswerBody,
} from "../../src/chat/refusal";

function tc(extra: Partial<ToolCall> = {}): ToolCall {
  return {
    tool_name: "list_domains",
    args: {},
    duration_ms: 10,
    row_count: 0,
    result_preview: "",
    ...extra,
  };
}

describe("T-05 refusal helpers — fixed strings verbatim", () => {
  test("FR-G01 zero-rows string", () => {
    expect(FR_G01_STRING).toBe("no nodes found in current graph");
  });
  test("FR-G02 oos string", () => {
    expect(FR_G02_STRING).toContain("That looks like a question outside the graph's scope.");
    expect(FR_G02_STRING).toContain("companygraph covers retail-process modelling");
    expect(FR_G02_STRING).toContain("/explorer");
  });
  test("FR-G03 write-rejected string", () => {
    expect(FR_G03_STRING).toBe(
      "This question is not answerable read-only — please use the explorer to make changes.",
    );
  });
  test("FR-G04 truncated string", () => {
    expect(FR_G04_STRING).toContain("More than 1000 rows matched");
    expect(FR_G04_STRING).toContain("Open in the explorer");
  });
  test("FR-G05 budget-exhausted string", () => {
    expect(FR_G05_STRING).toBe(
      "Reached the per-turn tool budget — answering with the data gathered so far. Refine the question to dig deeper.",
    );
  });
});

describe("T-05 refusal helpers — predicates", () => {
  test("isAllZeroRows returns false for empty array", () => {
    expect(isAllZeroRows([])).toBe(false);
  });
  test("isAllZeroRows returns true when every tool returned 0 rows + no error", () => {
    expect(isAllZeroRows([tc({ row_count: 0 }), tc({ row_count: 0 })])).toBe(true);
  });
  test("isAllZeroRows returns false when any tool returned rows", () => {
    expect(isAllZeroRows([tc({ row_count: 0 }), tc({ row_count: 3 })])).toBe(false);
  });
  test("isAllZeroRows returns false when any tool errored", () => {
    expect(isAllZeroRows([tc({ row_count: 0, error_code: "query_timeout" })])).toBe(false);
  });
  test("anyWriteRejection true when error_code is write_statement_rejected", () => {
    expect(anyWriteRejection([tc({ error_code: "write_statement_rejected" })])).toBe(true);
    expect(anyWriteRejection([tc({ error_code: "not_found" })])).toBe(false);
  });
  test("anyResultTruncated true when any tool has result_truncated", () => {
    expect(anyResultTruncated([tc({ error_code: "result_truncated" })])).toBe(true);
    expect(anyResultTruncated([tc({})])).toBe(false);
  });
});

describe("T-05 DD-13 refusal precedence resolver", () => {
  test("rule 2 — write_statement_rejected wins over all", () => {
    const calls = [tc({ error_code: "write_statement_rejected" }), tc({ row_count: 5 })];
    expect(resolveAnswerBody("LLM narration", calls, true)).toBe(FR_G03_STRING);
  });
  test("rule 3 — result_truncated wins over zero-rows + budget", () => {
    const calls = [tc({ error_code: "result_truncated", row_count: 0 })];
    expect(resolveAnswerBody("LLM narration", calls, true)).toBe(FR_G04_STRING);
  });
  test("rule 4 — all zero-rows → FR-G01", () => {
    const calls = [tc({ row_count: 0 }), tc({ row_count: 0 })];
    expect(resolveAnswerBody("LLM narration", calls, false)).toBe(FR_G01_STRING);
  });
  test("rule 5 — budget exhausted appends with double newline", () => {
    const calls = [tc({ row_count: 3 })];
    const body = resolveAnswerBody("Order Fulfillment has 6 systems.", calls, true);
    expect(body).toBe("Order Fulfillment has 6 systems.\n\n" + FR_G05_STRING);
  });
  test("rule 5 — empty narration + budget → leading newline omitted", () => {
    const calls = [tc({ row_count: 3 })];
    expect(resolveAnswerBody("", calls, true)).toBe(FR_G05_STRING);
  });
  test("no refusal needed — returns narration verbatim", () => {
    const calls = [tc({ row_count: 3 })];
    expect(resolveAnswerBody("answer text", calls, false)).toBe("answer text");
  });
});
