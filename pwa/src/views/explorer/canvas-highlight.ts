// Canvas highlight subscriber (DD-11).
//
// Mirrors the wireframe contract in `companygraph-views.html:4449-4613` —
// selection toggles `.selected` on `.gnode[data-id]` and `.highlight` on
// `.gedge[data-id]`; non-matching elements get `.dim`.
//
// Pure DOM API (no React). The canvas may be rendered by an SVG-string
// path that doesn't round-trip through React; querying the DOM by
// `[data-id]` matches the wireframe's selector exactly so the same CSS
// (`pwa/src/styles/chat.css`, see wireframe lines 373-452) applies.
//
// Graceful no-op when nothing is mounted: querySelectorAll returns an
// empty NodeList and the loop never executes.

import { onHighlight } from "../chat/highlight-bus";
import type { HighlightPayload } from "@companygraph/shared/types";

const CLS_NODE_SELECTED = "selected";
const CLS_EDGE_HIGHLIGHT = "highlight";
const CLS_DIM = "dim";

export function applyHighlight(payload: HighlightPayload): void {
  if (typeof document === "undefined") return;

  const nodeSet = new Set(payload.nodes ?? []);
  const edgeSet = new Set(payload.edges ?? []);

  // Always reset prior state — caller passes the full intended set each turn.
  const allNodes = document.querySelectorAll<HTMLElement>(".gnode[data-id]");
  const allEdges = document.querySelectorAll<HTMLElement>(".gedge[data-id]");

  // If nothing in the payload, clear all highlight/dim state and exit.
  if (nodeSet.size === 0 && edgeSet.size === 0) {
    allNodes.forEach((n) => {
      n.classList.remove(CLS_NODE_SELECTED, CLS_DIM);
    });
    allEdges.forEach((e) => {
      e.classList.remove(CLS_EDGE_HIGHLIGHT, CLS_DIM);
    });
    return;
  }

  allNodes.forEach((n) => {
    const id = n.dataset["id"];
    if (id && nodeSet.has(id)) {
      n.classList.add(CLS_NODE_SELECTED);
      n.classList.remove(CLS_DIM);
    } else {
      n.classList.remove(CLS_NODE_SELECTED);
      n.classList.add(CLS_DIM);
    }
  });

  allEdges.forEach((e) => {
    const id = e.dataset["id"];
    if (id && edgeSet.has(id)) {
      e.classList.add(CLS_EDGE_HIGHLIGHT);
      e.classList.remove(CLS_DIM);
    } else {
      e.classList.remove(CLS_EDGE_HIGHLIGHT);
      e.classList.add(CLS_DIM);
    }
  });
}

export function mountCanvasHighlight(): () => void {
  return onHighlight((payload) => applyHighlight(payload));
}
