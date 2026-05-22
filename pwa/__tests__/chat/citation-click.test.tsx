// AC-10 — clicking a citation fires the chat:setHighlight CustomEvent
// with a payload that matches DD-11's HighlightPayload shape.
//
// We do not render the Citation component through React here —
// instead we exercise the onClick handler logic directly against a
// minimal window stub. This keeps the test independent of jsdom /
// React Testing Library while still proving the contract: kind
// "node" lights up `nodes:[id]`, kind "edge" lights up `edges:[id]`,
// `selected` carries the id, and the href hash never contains
// `javascript:`.

import { describe, test, expect, beforeEach } from "bun:test";
import type { HighlightPayload } from "@companygraph/shared/types";

// Minimal `window` stub. We install it on globalThis before the
// Citation module reads `typeof window`. Bun's runtime exposes a
// `window` global in newer versions, but we override it for
// determinism.
type EventDetail = HighlightPayload;
interface CapturedEvent {
  type: string;
  detail: EventDetail;
}

const captured: CapturedEvent[] = [];
let hashAssignments: string[] = [];

beforeEach(() => {
  captured.length = 0;
  hashAssignments = [];
  const stubLocation = {
    _hash: "",
    get hash(): string {
      return this._hash;
    },
    set hash(v: string) {
      this._hash = v;
      hashAssignments.push(v);
    },
  };
  const stubWindow = {
    dispatchEvent(ev: { type: string; detail: EventDetail }): boolean {
      captured.push({ type: ev.type, detail: ev.detail });
      return true;
    },
    location: stubLocation,
  };
  (globalThis as unknown as { window: unknown }).window = stubWindow;
  // CustomEvent polyfill that just packages {type, detail}.
  (globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class {
    type: string;
    detail: EventDetail;
    constructor(type: string, init: { detail: EventDetail }) {
      this.type = type;
      this.detail = init.detail;
    }
  };
});

// Import lazily so the stub is in place first.
async function loadCitation() {
  return import("../../src/views/chat/Citation");
}

describe("Citation onClick — AC-10", () => {
  test("kind=node dispatches chat:setHighlight with nodes:[id]", async () => {
    const { Citation } = await loadCitation();
    // Pull the onClick out by rendering the props via the component
    // function — we call it directly (functional component) to get
    // the JSX element, then read its props.onClick.
    const el = Citation({ kind: "node", id: "node-abc", label: "POS" });
    expect(el.props.href).toBe("#/explorer/nodes/node-abc");
    expect(el.props.href.startsWith("javascript:")).toBe(false);
    const onClick = el.props.onClick as (e: {
      preventDefault: () => void;
    }) => void;
    let prevented = false;
    onClick({ preventDefault: () => (prevented = true) });
    expect(prevented).toBe(true);
    expect(captured.length).toBe(1);
    expect(captured[0].type).toBe("chat:setHighlight");
    expect(captured[0].detail.nodes).toEqual(["node-abc"]);
    expect(captured[0].detail.edges).toEqual([]);
    expect(captured[0].detail.paths).toEqual([]);
    expect(captured[0].detail.style?.selected).toEqual(["node-abc"]);
  });

  test("kind=edge dispatches with edges:[id], nodes:[]", async () => {
    const { Citation } = await loadCitation();
    const el = Citation({ kind: "edge", id: "edge-xyz", label: "PRECEDES" });
    expect(el.props.href).toBe("#/explorer/edges/edge-xyz");
    const onClick = el.props.onClick as (e: {
      preventDefault: () => void;
    }) => void;
    onClick({ preventDefault: () => undefined });
    expect(captured.length).toBe(1);
    expect(captured[0].detail.edges).toEqual(["edge-xyz"]);
    expect(captured[0].detail.nodes).toEqual([]);
    expect(captured[0].detail.style?.selected).toEqual(["edge-xyz"]);
  });

  test("hashFor() never emits a javascript: scheme even with hostile ids", async () => {
    const { Citation } = await loadCitation();
    // Even if a hostile id were threaded in (it shouldn't, since
    // renderSafeText filters), the href is built via the
    // `#/explorer/...` template — never a scheme.
    const el = Citation({
      kind: "node",
      id: "javascript:alert(1)",
      label: "x",
    });
    expect(el.props.href.startsWith("#/explorer/nodes/")).toBe(true);
    expect(el.props.href.toLowerCase()).not.toContain("javascript:alert");
  });

  test("data-id attribute carries the id for canvas subscriber lookup", async () => {
    const { Citation } = await loadCitation();
    const el = Citation({ kind: "node", id: "n-1", label: "X" });
    expect(el.props["data-id"]).toBe("n-1");
    expect(el.props["data-cite-kind"]).toBe("node");
  });
});
