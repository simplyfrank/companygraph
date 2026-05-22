// AC-08 — Canvas highlight integration.
//
// `mountCanvasHighlight()` subscribes to the `chat:setHighlight`
// CustomEvent and toggles `.selected` on `.gnode[data-id]` and
// `.highlight` on `.gedge[data-id]`. Non-matching elements get `.dim`.
//
// Bun's test runner has no built-in DOM. Rather than pull in jsdom
// or happy-dom (NFR — "no new deps"), we install a tiny in-test DOM
// stub that's just enough to back `document.querySelectorAll`,
// `classList.add/remove/contains`, and `dispatchEvent`.

import { describe, test, expect, beforeEach } from "bun:test";

import {
  applyHighlight,
  mountCanvasHighlight,
} from "../../src/views/explorer/canvas-highlight";
import { setHighlight } from "../../src/views/chat/highlight-bus";

// ────────────────────────────────────────────────────────────────────
// Minimal DOM stub
// ────────────────────────────────────────────────────────────────────

interface ElementStub {
  tagName: string;
  classes: Set<string>;
  dataset: Record<string, string>;
  classList: {
    add: (...c: string[]) => void;
    remove: (...c: string[]) => void;
    contains: (c: string) => boolean;
  };
  matches: (selector: string) => boolean;
}

function mkEl(tagName: string, className: string, dataId: string): ElementStub {
  const classes = new Set(className.split(/\s+/).filter(Boolean));
  const el: ElementStub = {
    tagName,
    classes,
    dataset: { id: dataId },
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      contains: (c) => classes.has(c),
    },
    matches: (selector: string) => {
      // We only handle the two selectors the subscriber uses.
      if (selector === ".gnode[data-id]") {
        return classes.has("gnode") && dataId !== "";
      }
      if (selector === ".gedge[data-id]") {
        return classes.has("gedge") && dataId !== "";
      }
      return false;
    },
  };
  return el;
}

const elements: ElementStub[] = [];
const listeners = new Map<string, Array<(ev: unknown) => void>>();

function installDom(): void {
  (globalThis as unknown as { document: object }).document = {
    querySelectorAll: (selector: string) => {
      const matches = elements.filter((e) => e.matches(selector));
      // Provide a NodeList-like with forEach.
      return {
        length: matches.length,
        forEach: (fn: (el: ElementStub) => void) => matches.forEach(fn),
        [Symbol.iterator]: () => matches[Symbol.iterator](),
      };
    },
  };
  (globalThis as unknown as { window: object }).window = {
    addEventListener: (type: string, handler: (ev: unknown) => void) => {
      const arr = listeners.get(type) ?? [];
      arr.push(handler);
      listeners.set(type, arr);
    },
    removeEventListener: (type: string, handler: (ev: unknown) => void) => {
      const arr = listeners.get(type);
      if (!arr) return;
      const i = arr.indexOf(handler);
      if (i >= 0) arr.splice(i, 1);
    },
    dispatchEvent: (ev: { type: string }) => {
      const arr = listeners.get(ev.type) ?? [];
      arr.forEach((h) => h(ev));
      return true;
    },
  };
  // highlight-bus calls `new CustomEvent(...)` on the window's globalThis.
  (globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  // `window.dispatchEvent` is called by highlight-bus.
  (globalThis as unknown as { window: { dispatchEvent: (e: unknown) => boolean } }).window
    .dispatchEvent = ((ev: { type: string }) => {
      const arr = listeners.get(ev.type) ?? [];
      arr.forEach((h) => h(ev));
      return true;
    });
}

beforeEach(() => {
  elements.length = 0;
  listeners.clear();
  installDom();
});

// ────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────

describe("canvas-highlight — AC-08", () => {
  test("applies .selected to matching .gnode and .highlight to matching .gedge", () => {
    const n1 = mkEl("g", "gnode", "a1");
    const n2 = mkEl("g", "gnode", "a2");
    const e1 = mkEl("line", "gedge", "e1");
    const e2 = mkEl("line", "gedge", "e2");
    elements.push(n1, n2, e1, e2);

    applyHighlight({ nodes: ["a1"], edges: ["e1"], paths: [], style: {} });

    expect(n1.classes.has("selected")).toBe(true);
    expect(n1.classes.has("dim")).toBe(false);
    expect(n2.classes.has("selected")).toBe(false);
    expect(n2.classes.has("dim")).toBe(true);

    expect(e1.classes.has("highlight")).toBe(true);
    expect(e1.classes.has("dim")).toBe(false);
    expect(e2.classes.has("highlight")).toBe(false);
    expect(e2.classes.has("dim")).toBe(true);
  });

  test("empty payload clears all highlight/dim state", () => {
    const n1 = mkEl("g", "gnode selected", "a1");
    const e1 = mkEl("line", "gedge highlight", "e1");
    elements.push(n1, e1);

    applyHighlight({ nodes: [], edges: [], paths: [] });

    expect(n1.classes.has("selected")).toBe(false);
    expect(n1.classes.has("dim")).toBe(false);
    expect(e1.classes.has("highlight")).toBe(false);
    expect(e1.classes.has("dim")).toBe(false);
  });

  test("no-op when no [data-id] elements exist", () => {
    // No elements pushed. Should not throw.
    expect(() => applyHighlight({ nodes: ["x"], edges: ["y"], paths: [] })).not.toThrow();
  });

  test("mountCanvasHighlight + setHighlight round-trip via event bus", () => {
    const n1 = mkEl("g", "gnode", "a1");
    const e1 = mkEl("line", "gedge", "e1");
    elements.push(n1, e1);

    const unsubscribe = mountCanvasHighlight();
    setHighlight({ nodes: ["a1"], edges: ["e1"], paths: [], style: {} });

    expect(n1.classes.has("selected")).toBe(true);
    expect(e1.classes.has("highlight")).toBe(true);

    // Unsubscribing prevents further updates.
    unsubscribe();
    setHighlight({ nodes: [], edges: [], paths: [] });
    // No change after unsubscribe — the previous state persists.
    expect(n1.classes.has("selected")).toBe(true);
    expect(e1.classes.has("highlight")).toBe(true);
  });
});
