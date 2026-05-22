// Bookmark menu (FR-M03) — stub.
//
// The server-side bookmark endpoint isn't routed in v1 yet (see
// design.md DD-08: chat_bookmarks table exists but the REST handler
// is deferred). The button is wired and logs to console so the
// affordance is visible during development; replace the click
// handler with `api.chat.bookmark(...)` when the endpoint lands.

export interface BookmarkMenuProps {
  conversation_id?: string;
  question?: string;
}

export function BookmarkMenu(props: BookmarkMenuProps) {
  const handleClick = (): void => {
    // eslint-disable-next-line no-console
    console.log("[chat] bookmark requested (not yet wired)", {
      conversation_id: props.conversation_id,
      question: props.question,
    });
  };

  return (
    <button
      type="button"
      className="bookmark-menu btn ghost"
      onClick={handleClick}
      title="Bookmark this question (not yet implemented)"
    >
      Bookmark
    </button>
  );
}
