// Highlight event bus (DD-11): the chat surface publishes a HighlightPayload
// whenever a new envelope arrives; the explorer canvas (or any other view)
// subscribes via onHighlight. We dispatch on `window` so the producer and
// consumer don't have to share a module instance — they only have to agree
// on the event name.
//
// Per DD-11 the payload is a superset (every node/edge the agent looked at),
// not just the cited subset; the canvas subscriber renders selection/dim
// state from this payload alone.

import type { HighlightPayload } from "@companygraph/shared/types";

const EVENT_NAME = "chat:setHighlight";

export function setHighlight(payload: HighlightPayload): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<HighlightPayload>(EVENT_NAME, { detail: payload }),
  );
}

export function onHighlight(
  handler: (payload: HighlightPayload) => void,
): () => void {
  if (typeof window === "undefined") return () => { /* noop */ };
  const wrap = (e: Event): void => {
    const ce = e as CustomEvent<HighlightPayload>;
    handler(ce.detail);
  };
  window.addEventListener(EVENT_NAME, wrap as EventListener);
  return () => window.removeEventListener(EVENT_NAME, wrap as EventListener);
}
