// Bookmark menu (FR-M03).
//
// POST /api/v1/chat/bookmarks — creates a bookmark for the current
// conversation + question. The chat_bookmarks table and persistence
// layer already existed (DD-08); the REST route was added alongside
// the existing chat message routes.

import { useState } from "react";
import { api } from "../../api";

export interface BookmarkMenuProps {
  conversation_id?: string;
  question?: string;
}

export function BookmarkMenu(props: BookmarkMenuProps) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const handleClick = async (): Promise<void> => {
    if (!props.conversation_id || !props.question) return;
    setState("saving");
    try {
      await api.chat.createBookmark({
        conversation_id: props.conversation_id,
        question: props.question,
        name: props.question.slice(0, 80),
      });
      setState("saved");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  };

  const label =
    state === "saving" ? "Saving…" :
    state === "saved" ? "Bookmarked!" :
    state === "error" ? "Failed" :
    "Bookmark";

  return (
    <button
      type="button"
      className="bookmark-menu btn ghost"
      onClick={handleClick}
      disabled={state === "saving" || !props.conversation_id || !props.question}
      title="Bookmark this question"
    >
      {label}
    </button>
  );
}
