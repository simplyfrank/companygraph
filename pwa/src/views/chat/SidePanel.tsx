// "Show evidence" disclosure (FR-C02, AC-11).
//
// Renders the per-tool audit row as
//   `tool_name(args)` · row_count rows · duration_ms ms
// inside a <details> block. Args are stringified compactly and
// truncated to keep the panel readable.

import type { ToolCall } from "@companygraph/shared/types";

const MAX_ARG_PREVIEW = 80;

export function formatToolArgs(args: unknown): string {
  if (args === null || args === undefined) return "";
  let s: string;
  try {
    s = JSON.stringify(args);
  } catch {
    s = String(args);
  }
  if (s.length > MAX_ARG_PREVIEW) {
    return `${s.slice(0, MAX_ARG_PREVIEW - 1)}…`;
  }
  return s;
}

export function formatToolCallLine(tc: ToolCall): string {
  const args = formatToolArgs(tc.args);
  const rows = tc.row_count ?? 0;
  const dur = Math.round(tc.duration_ms);
  return `${tc.tool_name}(${args}) · ${rows} rows · ${dur}ms`;
}

export interface SidePanelProps {
  toolCalls: ToolCall[];
}

export function SidePanel(props: SidePanelProps) {
  const calls = props.toolCalls ?? [];
  return (
    <details className="side-panel">
      <summary>Show evidence</summary>
      {calls.length === 0 ? (
        <div className="empty">no tool calls</div>
      ) : (
        <dl className="evidence-list">
          {calls.map((tc, i) => (
            <div className="evidence-row" key={`${i}-${tc.tool_name}`}>
              <dt>{tc.tool_name}({formatToolArgs(tc.args)})</dt>
              <dd>
                {tc.row_count ?? 0} rows · {Math.round(tc.duration_ms)}ms
                {tc.error_code ? <> · <span className="error">{tc.error_code}</span></> : null}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </details>
  );
}
