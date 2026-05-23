// FloatingChat — persistent floating / dockable chat panel.
//
// Three display modes cycled by the user:
//   collapsed  → pill button bottom-right
//   float      → fixed panel bottom-right (≤380×480px)
//   docked     → full-height right side drawer (360px)
//
// Self-contained chat state so it works on every surface without
// needing to navigate to #/chat.  Reuses the same api.chat.send()
// path as AgentChat. Keyboard shortcut "k" (when not typing) toggles
// collapsed ↔ float. "Escape" collapses.

import "../../src/styles/chat.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatEnvelope,
  ChatRequest,
  ChatRoleId,
  Citation as CitationType,
} from "@companygraph/shared/types";
import { api } from "../api";
import styles from "./FloatingChat.module.css";
import { renderSafeText } from "../views/chat/sanitise";
import { Fragment } from "react";

// ── Types ──────────────────────────────────────────────────────

type Mode = "collapsed" | "float" | "docked";

type UserMsg = { role: "user"; text: string };
type AssistantMsg = { role: "assistant"; env: ChatEnvelope };
type Msg = UserMsg | AssistantMsg;

// ── Default suggested prompts ──────────────────────────────────

const DEFAULT_PROMPTS = [
  "Which systems does this journey use?",
  "Where are SLA breaches?",
  "Critical path duration?",
  "Who executes Pick & pack?",
];

// ── Props ──────────────────────────────────────────────────────

interface FloatingChatProps {
  /** Optional context — journey name shown in the header */
  journeyName?: string;
  /** Optional context — role id sent with first message */
  defaultRoleId?: ChatRoleId;
  /** Suggested prompts (falls back to defaults when omitted) */
  prompts?: string[];
}

// ── Component ─────────────────────────────────────────────────

export function FloatingChat({
  journeyName,
  defaultRoleId,
  prompts = DEFAULT_PROMPTS,
}: FloatingChatProps) {
  const [mode, setMode] = useState<Mode>("collapsed");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [roleId] = useState<ChatRoleId | undefined>(defaultRoleId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  // Focus input when panel opens
  useEffect(() => {
    if (mode !== "collapsed") {
      // Small delay so the panel is mounted and rendered first
      const id = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
  }, [mode]);

  // Keyboard: "k" toggles collapsed ↔ float; "Escape" collapses
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target  = e.target as HTMLElement | null;
      const typing  = target?.tagName?.toLowerCase();
      const isInput = typing === "input" || typing === "textarea" || target?.isContentEditable;

      if (e.key === "Escape" && mode !== "collapsed") {
        setMode("collapsed");
        return;
      }
      if (e.key === "k" && !isInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setMode((m) => m === "collapsed" ? "float" : "collapsed");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  const send = useCallback(async (text: string): Promise<void> => {
    const msg = text.trim();
    if (!msg || loading) return;
    setError(null);
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setInput("");
    setLoading(true);

    const req: ChatRequest = {
      message: msg,
      ...(roleId           ? { role_id: roleId }                 : {}),
      ...(conversationId   ? { conversation_id: conversationId } : {}),
    };

    try {
      const env: ChatEnvelope = await api.chat.send(req);
      setMessages((prev) => [...prev, { role: "assistant", env }]);
      if (!conversationId) setConversationId(env.conversation_id);
      // Propagate highlights to any canvas subscribers
      window.dispatchEvent(new CustomEvent("chat:setHighlight", { detail: env.highlight }));
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [loading, roleId, conversationId]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  // Cycle: float → docked → float (button in header)
  const toggleDock = (): void =>
    setMode((m) => (m === "docked" ? "float" : "docked"));

  const ctxLabel = journeyName ? journeyName : "all-graph";
  const ctxHas   = Boolean(journeyName);

  // Show prompts only until the first message is sent
  const showSuggest = messages.length === 0 && !loading;

  return (
    <div className={styles.wrap} data-state={mode}>

      {/* ── Pill (collapsed) ────────────────────────────────── */}
      {mode === "collapsed" && (
        <button
          type="button"
          className={styles.pill}
          aria-label="Ask the graph (k)"
          onClick={() => setMode("float")}
        >
          <span className={styles.pillDot} aria-hidden />
          <span>Ask the graph</span>
          <span className={styles.pillKbd}>k</span>
        </button>
      )}

      {/* ── Panel (float | docked) ───────────────────────── */}
      {mode !== "collapsed" && (
        <div className={styles.panel} role="dialog" aria-label="Graph chat">

          {/* Header */}
          <div className={styles.head}>
            <div className={styles.headMeta}>
              <span className={styles.headLbl}>Chat</span>
              <span className={styles.headLbl} aria-hidden>·</span>
              <span className={styles.headLbl}>Grounded</span>
            </div>
            <h5 className={styles.headTitle}>{journeyName ?? "companygraph"}</h5>
            <div className={styles.headSp} />
            <span className={`${styles.ctxPill} ${ctxHas ? styles.ctxPillHas : ""}`}>
              {ctxLabel}
            </span>
            <div className={styles.headBtns}>
              {/* Dock / undock toggle */}
              <button
                type="button"
                className={styles.iconBtn}
                title={mode === "docked" ? "Float panel" : "Dock to side"}
                aria-label={mode === "docked" ? "Float panel" : "Dock to side"}
                onClick={toggleDock}
              >
                {mode === "docked" ? "⇥" : "⇤"}
              </button>
              {/* Close */}
              <button
                type="button"
                className={styles.iconBtn}
                title="Close chat (Esc)"
                aria-label="Close chat"
                onClick={() => setMode("collapsed")}
              >
                ×
              </button>
            </div>
          </div>

          {/* Scroll body */}
          <div className={styles.body} ref={scrollRef}>
            {messages.length === 0 && !loading && (
              <p className={styles.welcome}>
                Ask anything about the graph—e.g.{" "}
                <em>"What domains exist?"</em> or{" "}
                <em>"Show SLA breaches on order fulfillment."</em>
              </p>
            )}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className={styles.msgUser}>{m.text}</div>
              ) : (
                <AssistantMessage key={i} env={m.env} />
              ),
            )}

            {loading && (
              <div className={styles.thinking}>Thinking…</div>
            )}

            {error && (
              <div className={styles.errBanner}>{error}</div>
            )}
          </div>

          {/* Suggested prompts */}
          {showSuggest && prompts.length > 0 && (
            <div className={styles.suggest}>
              {prompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={styles.suggestBtn}
                  onClick={() => void send(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Input row */}
          <div className={styles.input}>
            <input
              ref={inputRef}
              type="text"
              className={styles.inputField}
              placeholder="Ask in plain English…"
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              onKeyDown={onKeyDown}
              disabled={loading}
              autoComplete="off"
            />
            <button
              type="button"
              className={styles.sendBtn}
              disabled={loading || input.trim().length === 0}
              onClick={() => void send(input)}
            >
              Ask
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Assistant message bubble ───────────────────────────────────

function AssistantMessage({ env }: { env: ChatEnvelope }) {
  const segments = renderSafeText(env.answer);
  return (
    <div className={styles.msgAssistant}>
      <div className={styles.msgWho}>companygraph · grounded</div>
      <div className={styles.msgAns}>
        {segments.map((seg, i) =>
          seg.kind === "text" ? (
            <Fragment key={i}>{seg.value}</Fragment>
          ) : (
            <CitePill key={i} citation={{ kind: lookupKind(env, seg.id), id: seg.id, label: seg.label }} />
          ),
        )}
      </div>
      {env.citations.length > 0 && (
        <div className={styles.msgCites}>
          {env.citations.map((c) => (
            <CitePill key={`${c.kind}:${c.id}`} citation={c} />
          ))}
        </div>
      )}
      <div className={styles.msgFoot}>
        <span>{env.latency_ms_breakdown.total_ms.toFixed(0)} ms</span>
        <span>{env.latency_ms_breakdown.llm_calls} LLM call{env.latency_ms_breakdown.llm_calls === 1 ? "" : "s"}</span>
        {env.degraded === "mock_llm" && <span>mock-llm</span>}
      </div>
    </div>
  );
}

function CitePill({ citation: c }: { citation: CitationType }) {
  return (
    <a
      href={`#/explorer/${c.kind === "edge" ? "edges" : "activities"}/${encodeURIComponent(c.id)}`}
      className={styles.msgCite}
      title={`${c.kind}: ${c.id}`}
    >
      {c.kind === "node" ? "◇ " : "↗ "}{c.label}
    </a>
  );
}

function lookupKind(env: ChatEnvelope, id: string): "node" | "edge" {
  return env.citations.find((c) => c.id === id)?.kind ?? "node";
}
