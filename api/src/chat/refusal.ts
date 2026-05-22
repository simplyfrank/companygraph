import type { ToolCall } from "@companygraph/shared";

export const FR_G01_STRING = "no nodes found in current graph";
export const FR_G02_STRING =
  "That looks like a question outside the graph's scope. companygraph covers retail-process modelling — see /explorer to browse the graph.";
export const FR_G03_STRING =
  "This question is not answerable read-only — please use the explorer to make changes.";
export const FR_G04_STRING =
  "More than 1000 rows matched — this question is too broad to summarise. Open in the explorer for the full result.";
export const FR_G05_STRING =
  "Reached the per-turn tool budget — answering with the data gathered so far. Refine the question to dig deeper.";

export function isAllZeroRows(toolCalls: ToolCall[]): boolean {
  if (toolCalls.length === 0) return false;
  return toolCalls.every(tc => (tc.row_count ?? 0) === 0 && !tc.error_code);
}

export function anyWriteRejection(toolCalls: ToolCall[]): boolean {
  return toolCalls.some(tc => tc.error_code === "write_statement_rejected");
}

export function anyResultTruncated(toolCalls: ToolCall[]): boolean {
  return toolCalls.some(tc => tc.error_code === "result_truncated");
}

// DD-13 precedence resolver. Returns the final answer body (after the loop).
// Rules 1 (quota) and 6 (oos) are handled by the orchestrator BEFORE the loop;
// this resolver handles rules 2–5 which fire AFTER the loop completes.
//
// Precedence (highest first):
//   2. write_statement_rejected → FR_G03 (sole body)
//   3. result_truncated         → FR_G04 (sole body)
//   4. all zero rows (+ no errs)→ FR_G01 (sole body)
//   5. budget exhausted         → narration + "\n\n" + FR_G05 (append)
export function resolveAnswerBody(
  narration: string,
  toolCalls: ToolCall[],
  budgetExhausted: boolean,
): string {
  if (anyWriteRejection(toolCalls)) return FR_G03_STRING;
  if (anyResultTruncated(toolCalls)) return FR_G04_STRING;
  if (isAllZeroRows(toolCalls)) return FR_G01_STRING;
  if (budgetExhausted) {
    const sep = narration.length > 0 ? "\n\n" : "";
    return narration + sep + FR_G05_STRING;
  }
  return narration;
}
