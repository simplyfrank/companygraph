import { Fragment, useState } from "react";
import type { ChatEnvelope, ToolCall } from "@companygraph/shared/types";
import { renderSafeText } from "./sanitise";
import { Citation } from "./Citation";

// FR-C01..C03 — message rendering. Renders user + assistant
// messages in the chat scroll area; assistant messages carry the
// full ChatEnvelope so we can also render citations, tool-call
// reasoning, and the latency footer.

export type UserMessage = { role: "user"; text: string };
export type AssistantMessage = { role: "assistant"; env: ChatEnvelope };
export type ChatMessage = UserMessage | AssistantMessage;

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps): JSX.Element {
  return (
    <div className="chat-msglist">
      {messages.map((m, i) =>
        m.role === "user" ? (
          <UserBubble key={i} text={m.text} />
        ) : (
          <AssistantBubble key={i} env={m.env} />
        ),
      )}
    </div>
  );
}

function UserBubble({ text }: { text: string }): JSX.Element {
  return (
    <div className="chat-msg chat-msg-user">
      <div className="chat-bubble">{text}</div>
    </div>
  );
}

function AssistantBubble({ env }: { env: ChatEnvelope }): JSX.Element {
  const segments = renderSafeText(env.answer);
  return (
    <div className="chat-msg chat-msg-assistant">
      <div className="chat-bubble">
        <div className="chat-answer">
          {segments.map((seg, i) =>
            seg.kind === "text" ? (
              <Fragment key={i}>{seg.value}</Fragment>
            ) : (
              <Citation
                key={i}
                // Default citation kind to "node" when the inline
                // `[label](id)` pattern doesn't tell us. The
                // envelope's citations[] is the authoritative kind
                // lookup; do that here.
                kind={lookupKind(env, seg.id)}
                id={seg.id}
                label={seg.label}
              />
            ),
          )}
        </div>

        {env.citations.length > 0 && (
          <div className="chat-cite-row">
            {env.citations.map((c) => (
              <Citation
                key={`${c.kind}:${c.id}`}
                kind={c.kind}
                id={c.id}
                label={c.label}
              />
            ))}
          </div>
        )}

        <ReasoningDisclosure toolCalls={env.tool_calls} />

        <div className="latency">
          {env.latency_ms_breakdown.total_ms.toFixed(0)} ms ·{" "}
          {env.latency_ms_breakdown.llm_calls} LLM call
          {env.latency_ms_breakdown.llm_calls === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
}

function lookupKind(env: ChatEnvelope, id: string): "node" | "edge" {
  const hit = env.citations.find((c) => c.id === id);
  return hit?.kind ?? "node";
}

// Local inline reasoning disclosure — collapsed by default, opens
// to a numbered list of tool calls. (The dedicated
// ReasoningDisclosure.tsx component is owned by a parallel agent;
// this is a lightweight inline stub that keeps the message-list
// self-contained.)
function ReasoningDisclosure({
  toolCalls,
}: {
  toolCalls: ToolCall[];
}): JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (toolCalls.length === 0) return null;
  return (
    <details
      className="chat-reasoning"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>
        {open ? "Hide" : "Show"} reasoning ({toolCalls.length} step
        {toolCalls.length === 1 ? "" : "s"})
      </summary>
      <ol className="chat-reasoning-list">
        {toolCalls.map((tc, i) => (
          <li key={i}>
            <code>{tc.tool_name}</code>
            {tc.row_count !== null && (
              <span className="chat-reasoning-meta">
                {" "}
                · {tc.row_count} rows · {tc.duration_ms.toFixed(0)} ms
              </span>
            )}
            {tc.error_code && (
              <span className="chat-reasoning-err">
                {" "}
                · {tc.error_code}
              </span>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
