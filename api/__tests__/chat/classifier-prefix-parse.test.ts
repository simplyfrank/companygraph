// DD-18 — classifier-prefix parser. The parser MUST handle every
// shape the LLM might emit (bare JSON, fenced JSON, no prefix,
// malformed JSON, empty) without throwing, returning a graceful
// `in_scope` + fallback role on parse failure.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { extractClassifierPrefix } from "../../src/chat/roles/auto-route";

const FALLBACK = "graph_analyst" as const;

describe("extractClassifierPrefix — DD-18", () => {
  // Silence the `console.warn` emitted on parse failure so the test
  // output stays clean. (We still verify warnings are issued via
  // the dedicated AC-31 test.)
  const originalWarn = console.warn;
  beforeEach(() => {
    console.warn = () => {};
  });
  afterEach(() => {
    console.warn = originalWarn;
  });

  test("(a) bare JSON prefix — in_scope with explicit role", () => {
    const r = extractClassifierPrefix(
      '{"intent": "in_scope", "role_id": "uj_order_fulfillment"} Hello world',
      FALLBACK,
    );
    expect(r.intent).toBe("in_scope");
    expect(r.role_id).toBe("uj_order_fulfillment");
    expect(r.oos_reason).toBeNull();
    expect(r.remaining_text).toBe("Hello world");
  });

  test("(b) fenced ```json``` JSON", () => {
    const text = '```json\n{"intent": "in_scope", "role_id": "graph_analyst"}\n```\nNarration here.';
    const r = extractClassifierPrefix(text, FALLBACK);
    expect(r.intent).toBe("in_scope");
    expect(r.role_id).toBe("graph_analyst");
    expect(r.remaining_text).toContain("Narration here");
  });

  test("(b2) fenced ``` ``` (no json language tag)", () => {
    const text = '```\n{"intent": "in_scope", "role_id": "uj_returns_intake"}\n```\n\nBody.';
    const r = extractClassifierPrefix(text, FALLBACK);
    expect(r.intent).toBe("in_scope");
    expect(r.role_id).toBe("uj_returns_intake");
    expect(r.remaining_text).toContain("Body");
  });

  test("(c) no JSON — defaults to in_scope + fallback", () => {
    const r = extractClassifierPrefix("Just plain text, no prefix.", FALLBACK);
    expect(r.intent).toBe("in_scope");
    expect(r.role_id).toBe(FALLBACK);
    expect(r.oos_reason).toBeNull();
    expect(r.remaining_text).toBe("Just plain text, no prefix.");
  });

  test("(d) malformed JSON — defaults to in_scope + fallback", () => {
    const r = extractClassifierPrefix(
      '{"intent": "in_scope", role_id: not-quoted} rest',
      FALLBACK,
    );
    expect(r.intent).toBe("in_scope");
    expect(r.role_id).toBe(FALLBACK);
    expect(r.remaining_text).toContain("rest");
  });

  test("(d2) valid JSON but unknown intent — defaults to in_scope + fallback", () => {
    const r = extractClassifierPrefix(
      '{"intent": "maybe", "role_id": "x"} body',
      FALLBACK,
    );
    expect(r.intent).toBe("in_scope");
    expect(r.role_id).toBe(FALLBACK);
  });

  test("(e) empty text — defaults", () => {
    const r = extractClassifierPrefix("", FALLBACK);
    expect(r.intent).toBe("in_scope");
    expect(r.role_id).toBe(FALLBACK);
    expect(r.remaining_text).toBe("");
  });

  test("(f) intent: 'oos' returns oos + null role + reason", () => {
    const r = extractClassifierPrefix(
      '{"intent": "oos", "role_id": null, "oos_reason": "weather question"}',
      FALLBACK,
    );
    expect(r.intent).toBe("oos");
    expect(r.role_id).toBeNull();
    expect(r.oos_reason).toBe("weather question");
  });

  test("does not throw on any input", () => {
    const inputs = [
      "",
      "{",
      "{}",
      '{"intent":}',
      "not json at all",
      "```",
      "```json```",
      '{"intent":"in_scope"}', // missing role_id is fine — falls back
    ];
    for (const i of inputs) {
      expect(() => extractClassifierPrefix(i, FALLBACK)).not.toThrow();
    }
  });

  test("in_scope with role_id null falls back to fallbackRoleId", () => {
    const r = extractClassifierPrefix(
      '{"intent":"in_scope","role_id":null}',
      FALLBACK,
    );
    expect(r.intent).toBe("in_scope");
    expect(r.role_id).toBe(FALLBACK);
  });
});
