// AC-22 — LLM-output sanitisation, 5 injection vectors.
//
// Pure data-shape assertions on what `renderSafeText` and
// `escapeText` return. We deliberately do not render React here —
// the safety guarantee is that the sanitiser only ever yields plain
// text segments or citation references (label + safe id), so even
// if React's text-node escaping were bypassed, the data flowing in
// would never contain element-shaped markup.

import { describe, test, expect } from "bun:test";

import {
  escapeText,
  renderSafeText,
  type Segment,
} from "../../src/views/chat/sanitise";

function joinText(segs: Segment[]): string {
  return segs.map((s) => (s.kind === "text" ? s.value : "")).join("");
}

function hasCite(segs: Segment[]): boolean {
  return segs.some((s) => s.kind === "cite");
}

describe("sanitise — AC-22 five XSS vectors", () => {
  test("(a) <script> tag is escaped, not parsed as element", () => {
    const vec = "<script>alert(1)</script>";
    const esc = escapeText(vec);
    expect(esc).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(esc).not.toContain("<script");
    const segs = renderSafeText(vec);
    // No citation match — entire payload is one text segment.
    expect(segs.length).toBe(1);
    expect(segs[0].kind).toBe("text");
    expect(hasCite(segs)).toBe(false);
  });

  test("(b) Markdown [link](javascript:alert(1)) yields no citation", () => {
    const vec = "see [link](javascript:alert(1))";
    const segs = renderSafeText(vec);
    // The `javascript:` href fails the SAFE_ID_RE check; the
    // citation is rejected and left as literal text — no `cite`
    // segment is emitted.
    expect(hasCite(segs)).toBe(false);
    // The literal text is preserved (so the user sees it as inert
    // plaintext) including the `javascript:` substring.
    expect(joinText(segs)).toContain("javascript:alert(1)");
    // Defence in depth — escapeText neutralises any HTML chars.
    expect(escapeText(vec)).not.toContain("<");
  });

  test("(c) <img src=x onerror=alert(1)> is escaped", () => {
    const vec = "<img src=x onerror=alert(1)>";
    const esc = escapeText(vec);
    expect(esc).toBe("&lt;img src=x onerror=alert(1)&gt;");
    expect(esc).not.toContain("<img");
    const segs = renderSafeText(vec);
    expect(hasCite(segs)).toBe(false);
    expect(segs.every((s) => s.kind === "text")).toBe(true);
  });

  test("(d) <iframe srcdoc=\"<script>alert(1)</script>\"> is escaped", () => {
    const vec = "<iframe srcdoc=\"<script>alert(1)</script>\">";
    const esc = escapeText(vec);
    expect(esc).not.toContain("<iframe");
    expect(esc).not.toContain("<script");
    expect(esc).toContain("&lt;iframe");
    expect(esc).toContain("&lt;script");
    const segs = renderSafeText(vec);
    expect(hasCite(segs)).toBe(false);
  });

  test("(e) <svg><foreignObject><script>...</script></foreignObject></svg> is escaped", () => {
    const vec =
      "<svg><foreignObject><script>alert(1)</script></foreignObject></svg>";
    const esc = escapeText(vec);
    expect(esc).not.toContain("<svg");
    expect(esc).not.toContain("<foreignObject");
    expect(esc).not.toContain("<script");
    expect(esc).toContain("&lt;svg");
    expect(esc).toContain("&lt;foreignObject");
    expect(esc).toContain("&lt;script");
    const segs = renderSafeText(vec);
    expect(hasCite(segs)).toBe(false);
  });

  test("renderSafeText accepts legitimate citations with safe ids", () => {
    const segs = renderSafeText(
      "Order fulfillment uses [POS](sys-pos-1) and [Cashier](role_cashier).",
    );
    const cites = segs.filter((s) => s.kind === "cite");
    expect(cites.length).toBe(2);
    expect(cites[0]).toEqual({
      kind: "cite",
      label: "POS",
      id: "sys-pos-1",
    });
    expect(cites[1]).toEqual({
      kind: "cite",
      label: "Cashier",
      id: "role_cashier",
    });
  });

  test("renderSafeText rejects ids containing slashes or colons", () => {
    const cases = [
      "[x](javascript:alert)",
      "[x](http://evil.com)",
      "[x](/path/to/thing)",
      "[x](data:text/html,<script>)",
    ];
    for (const c of cases) {
      const segs = renderSafeText(c);
      expect(hasCite(segs)).toBe(false);
    }
  });

  test("escapeText escapes the five entity-significant chars", () => {
    expect(escapeText("&")).toBe("&amp;");
    expect(escapeText("<")).toBe("&lt;");
    expect(escapeText(">")).toBe("&gt;");
    expect(escapeText('"')).toBe("&quot;");
    expect(escapeText("'")).toBe("&#39;");
  });
});
