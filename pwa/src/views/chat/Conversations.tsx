import { useEffect, useState } from "react";
import type { ConversationSummary } from "@companygraph/shared/types";
import { api } from "../../api";
import { ViewHeader, Loading, ErrorState } from "../_shared";

interface Props {
  clock?: typeof Date;
}

export function ChatConversations({ clock = Date }: Props = {}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { rows } = await api.chat.listConversations();
        if (cancelled) return;
        setConversations(rows);
      } catch (e) {
        if (!cancelled) setError(String((e as Error).message));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <Loading what="conversations" />;
  if (error) return <ErrorState message={error} />;

  return (
    <>
      <ViewHeader title="Conversations" lede="Browse and resume past chat conversations." />
      {conversations.length === 0 ? (
        <p style={{ color: "var(--muted)", padding: "16px 0" }}>
          No conversations yet. Start one from the Thread tab.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {conversations.map((conv) => {
            const href = `#/chat/thread?conversation=${encodeURIComponent(conv.id)}`;
            const age = relativeTime(conv.last_message_at, clock);
            return (
              <li key={conv.id} style={{ borderBottom: "1px solid var(--rule)" }}>
                <a
                  href={href}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 0",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <span>{conv.title || "Untitled"}</span>
                  <span style={{ color: "var(--muted)", fontSize: 13 }}>{age}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function relativeTime(iso: string, clock: typeof Date): string {
  const then = new Date(iso).getTime();
  const now = clock.now();
  const diff = now - then;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
