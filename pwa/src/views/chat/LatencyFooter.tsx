// Latency footer (NFR-02, AC-26).
//
// One-line summary: `{total_ms}ms · {llm_calls} LLM calls · {sum per_tool_ms}ms tool exec`.

import type { LatencyBreakdown } from "@companygraph/shared/types";

export function sumPerToolMs(breakdown: LatencyBreakdown): number {
  let total = 0;
  for (const v of Object.values(breakdown.per_tool_ms ?? {})) {
    if (typeof v === "number" && Number.isFinite(v)) total += v;
  }
  return total;
}

export function formatLatency(breakdown: LatencyBreakdown): string {
  const total = Math.round(breakdown.total_ms);
  const llm = breakdown.llm_calls;
  const tools = Math.round(sumPerToolMs(breakdown));
  return `${total}ms · ${llm} LLM calls · ${tools}ms tool exec`;
}

export interface LatencyFooterProps {
  latency: LatencyBreakdown;
}

export function LatencyFooter(props: LatencyFooterProps) {
  return (
    <div className="latency-footer" aria-label="Latency breakdown">
      {formatLatency(props.latency)}
    </div>
  );
}
