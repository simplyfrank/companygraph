// "Show reasoning" disclosure (FR-C03, AC-12).
//
// Same data as SidePanel but rendered as a numbered <ol> to emphasise the
// sequential ReAct trace.

import type { ToolCall } from "@companygraph/shared/types";
import { formatToolArgs } from "./SidePanel";

export interface ReasoningDisclosureProps {
  toolCalls: ToolCall[];
}

export function ReasoningDisclosure(props: ReasoningDisclosureProps) {
  const calls = props.toolCalls ?? [];
  return (
    <details className="reasoning-disclosure">
      <summary>Show reasoning</summary>
      {calls.length === 0 ? (
        <div className="empty">no reasoning steps</div>
      ) : (
        <ol className="reasoning-list">
          {calls.map((tc, i) => (
            <li className="reasoning-step" key={`${i}-${tc.tool_name}`}>
              <code>{tc.tool_name}({formatToolArgs(tc.args)})</code>
              {" · "}
              {tc.row_count ?? 0} rows · {Math.round(tc.duration_ms)}ms
              {tc.error_code ? <> · <span className="error">{tc.error_code}</span></> : null}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
