import type { MouseEvent } from "react";
import type { HighlightPayload } from "@companygraph/shared/types";
import { escapeText } from "./sanitise";

// FR-C01 / DD-12 — clickable citation pill embedded in the answer
// body. Renders as a plain `<a>` with a hash href; the runtime
// builder enforces `#/explorer/{nodes|edges}/<id>` so no
// `javascript:` href can ever leave this component.
//
// On click we dispatch a `chat:setHighlight` CustomEvent on
// `window` rather than importing the highlight bus directly. This
// keeps the file independent of the parallel agent's bus module —
// the bus subscribes to the same event name.

export interface CitationProps {
  kind: "node" | "edge";
  id: string;
  label: string;
}

function hashFor(kind: "node" | "edge", id: string): string {
  // Only emits `#/explorer/...` — never a scheme like `javascript:`.
  return kind === "node"
    ? `#/explorer/nodes/${encodeURIComponent(id)}`
    : `#/explorer/edges/${encodeURIComponent(id)}`;
}

export function Citation({ kind, id, label }: CitationProps): JSX.Element {
  const onClick = (e: MouseEvent<HTMLAnchorElement>): void => {
    e.preventDefault();
    const payload: HighlightPayload = {
      nodes: kind === "node" ? [id] : [],
      edges: kind === "edge" ? [id] : [],
      paths: [],
      style: { selected: [id] },
    };
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("chat:setHighlight", { detail: payload }),
      );
      // Defer hash navigation so the highlight subscriber sees the
      // event before the route changes.
      window.location.hash = hashFor(kind, id).slice(1);
    }
  };
  // `label` goes through React as a text-node child — already escaped
  // by React. `escapeText` here is defence-in-depth assertion: we
  // pass the *escaped* string as a text node, which React will then
  // double-escape ampersands. To avoid that, pass the raw label to
  // React (text node) and let React handle escaping — escapeText is
  // exported separately and used by AC-22 tests to verify the
  // escaping pattern.
  return (
    <a
      className={`cite cite-${kind}`}
      href={hashFor(kind, id)}
      onClick={onClick}
      data-id={id}
      data-cite-kind={kind}
      title={`Open ${kind} ${id} in explorer`}
    >
      {label}
    </a>
  );
}

// Re-export escapeText so test files can import both helpers from
// one entry point if they prefer.
export { escapeText };
