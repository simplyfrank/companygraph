import "../../styles/chat.css";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatEnvelope,
  ChatRequest,
  ChatRoleId,
} from "@companygraph/shared/types";
import { CHAT_ROLE_IDS } from "@companygraph/shared/types";
import { api } from "../../api";
import { Button } from "../../components/Button";
import { Pill } from "../../components/Pill";
import { ViewHeader } from "../_shared";
import { MessageList, type ChatMessage } from "./MessageList";

// Replaces the rev-2-era Cypher console with the agentic chat pane
// (FR-C01..C04 / FR-M01..M05). Other chat surfaces — RolePicker,
// SidePanel, ReasoningDisclosure, LatencyFooter, BookmarkMenu — are
// owned by a parallel agent. This file restricts itself to the
// core pane: header, scroll area, composer.

const ROLE_ID_SET = new Set<string>(CHAT_ROLE_IDS as readonly string[]);

function parseRolePrefix(input: string): {
  role?: ChatRoleId;
  message: string;
} {
  const m = /^\/role\s+([\w_-]+)\s*(.*)$/s.exec(input);
  if (!m) return { message: input };
  const candidate = m[1];
  if (ROLE_ID_SET.has(candidate)) {
    return { role: candidate as ChatRoleId, message: m[2] };
  }
  return { message: input };
}

export function AgentChat(): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [roleId, setRoleId] = useState<ChatRoleId | undefined>(undefined);
  const [conversationId, setConversationId] = useState<string | undefined>(
    undefined,
  );
  const [degraded, setDegraded] = useState<boolean>(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const submit = useCallback(async (): Promise<void> => {
    const raw = input.trim();
    if (!raw || loading) return;
    setError(null);
    const parsed = parseRolePrefix(raw);
    const effectiveRole = parsed.role ?? roleId;
    const trimmedMessage = parsed.message.trim();
    if (!trimmedMessage) {
      // Pure `/role <id>` toggle — pin the role and clear the input.
      if (parsed.role) {
        setRoleId(parsed.role);
        setInput("");
      }
      return;
    }
    // Pin the role if the user used a slash prefix.
    if (parsed.role) setRoleId(parsed.role);

    const userMsg: ChatMessage = { role: "user", text: trimmedMessage };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const req: ChatRequest = {
      message: trimmedMessage,
      ...(effectiveRole ? { role_id: effectiveRole } : {}),
      ...(conversationId ? { conversation_id: conversationId } : {}),
    };
    try {
      const env: ChatEnvelope = await api.chat.send(req);
      setMessages((prev) => [...prev, { role: "assistant", env }]);
      if (!conversationId) setConversationId(env.conversation_id);
      if (env.degraded === "mock_llm") setDegraded(true);
      // Dispatch the highlight to any canvas subscribers (DD-11).
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("chat:setHighlight", { detail: env.highlight }),
        );
      }
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setLoading(false);
      // Refocus the composer after the round-trip.
      taRef.current?.focus();
    }
  }, [input, loading, roleId, conversationId]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const lastAssistant = [...messages]
    .reverse()
    .find((m): m is Extract<ChatMessage, { role: "assistant" }> =>
      m.role === "assistant",
    );
  const banner = lastAssistant?.env.banner;

  return (
    <>
      <ViewHeader
        title="Chat"
        lede="Ask a question about the graph. The agent picks tools, gathers evidence, and answers with cited deep-links to nodes and edges. Pin a role with /role <id> or let the auto-router pick."
      />
      <div className="chat-shell">
        <div className="chat-banners">
          {degraded && (
            <Pill tone="warn">
              Mock LLM (set ANTHROPIC_API_KEY for real responses)
            </Pill>
          )}
          {roleId && (
            <span className="chat-role-chip">role: {roleId}</span>
          )}
          {banner?.kind === "role_mismatch" && banner.auto_role_label && (
            <Pill tone="accent">
              Auto-routed to {banner.auto_role_label}
              {banner.auto_role_id ? ` (${banner.auto_role_id})` : ""}
            </Pill>
          )}
          {banner?.kind === "truncated" && (
            <Pill tone="warn">Result truncated</Pill>
          )}
          {error && <Pill tone="danger">{error}</Pill>}
        </div>

        <div className="chat-scroll" ref={scrollRef}>
          {messages.length === 0 && !loading && (
            <p style={{ color: "var(--muted)", margin: 0, fontSize: 13 }}>
              Ask anything — e.g. "What domains exist?" or "Show SLA
              breaches on order fulfillment."
            </p>
          )}
          <MessageList messages={messages} />
          {loading && (
            <div className="chat-msg chat-msg-assistant">
              <div className="chat-bubble" style={{ color: "var(--muted)" }}>
                Thinking…
              </div>
            </div>
          )}
        </div>

        <div className="chat-composer">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            onKeyDown={onKeyDown}
            placeholder='Ask the graph… (Enter to send · "/role <id>" to pin a role)'
            spellCheck={true}
            rows={2}
            disabled={loading}
          />
          <Button
            tone="primary"
            onClick={() => void submit()}
            disabled={loading || input.trim().length === 0}
          >
            Send
          </Button>
        </div>
      </div>
    </>
  );
}

// Preserve the existing import path from views/index.tsx
// (`import { ChatThread } from "./chat/Thread"`). The Thread.tsx
// re-export keeps this name reachable.
export { AgentChat as ChatThread };
