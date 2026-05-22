// LLM-output sanitisation for the chat answer body (NFR-06 / AC-22).
//
// The renderer never emits HTML — it only produces text nodes plus
// `<Citation>` components, which are themselves plain `<a>` elements
// with a hash href that's runtime-validated to start with `#/`.
//
// AC-22's 5 XSS vectors are defended at two layers:
//   1. `escapeText()` escapes HTML entities so any LLM-emitted
//      `<script>`, `<img onerror>`, `<iframe>`, `<svg>` becomes
//      literal text. (Defence in depth — React's text-node rendering
//      already escapes, but `escapeText` is the explicit assertion.)
//   2. `renderSafeText()` only matches the `[label](id)` citation
//      pattern when `id` is a safe explorer reference (UUIDv7-like
//      id, no scheme); `javascript:` hrefs are rejected and left as
//      literal text so they never reach a clickable element.

export type Segment =
  | { kind: "text"; value: string }
  | { kind: "cite"; label: string; id: string };

// `[label](id)` — non-greedy label, no nested brackets or parens.
const CITE_RE = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

// UUIDv7 / hex-ish id: alphanumerics, hyphens, underscores.
// Rejects schemes (`javascript:`), paths, and any whitespace.
const SAFE_ID_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Escape HTML entities so any LLM-emitted markup becomes literal text.
 * Defence in depth — React already escapes text-node children, but
 * this gives the caller (and the test suite) an explicit assertion.
 */
export function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Split `text` on the `[label](id)` citation pattern, returning a
 * flat array of segments. Each segment is either a plain text run
 * or a citation reference (label + id) — the caller (MessageList)
 * is responsible for mapping `cite` segments to `<Citation>` JSX.
 *
 * Citations with unsafe ids (e.g. `javascript:alert(1)`) are left
 * as `text` segments — the original `[label](id)` literal — so a
 * user-visible `[link](javascript:alert(1))` never becomes a
 * clickable element.
 */
export function renderSafeText(text: string): Segment[] {
  if (!text) return [];
  const out: Segment[] = [];
  let lastIndex = 0;
  CITE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CITE_RE.exec(text)) !== null) {
    const [whole, rawLabel, rawId] = m;
    const start = m.index;
    if (start > lastIndex) {
      out.push({ kind: "text", value: text.slice(lastIndex, start) });
    }
    if (SAFE_ID_RE.test(rawId)) {
      out.push({ kind: "cite", label: rawLabel, id: rawId });
    } else {
      // Unsafe id (scheme, slash, etc.) — keep the literal text so
      // it renders inert.
      out.push({ kind: "text", value: whole });
    }
    lastIndex = start + whole.length;
  }
  if (lastIndex < text.length) {
    out.push({ kind: "text", value: text.slice(lastIndex) });
  }
  return out;
}
