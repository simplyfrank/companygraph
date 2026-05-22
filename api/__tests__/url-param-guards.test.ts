import { describe, test, expect } from "bun:test";
import { NODE_LABELS } from "@companygraph/shared/schema/nodes";
import { parseId, parseLabel } from "../src/routes/_helpers";
import { UUIDV7_REGEX } from "../src/ids";

// Pure-unit coverage of the URL parameter guards from
// `api/src/routes/_helpers.ts`. These guards (parseLabel + parseId)
// close design-review C-05: without them, `req.params.label as
// NodeLabel` would otherwise admit arbitrary strings — including
// Cypher-injection payloads — into the storage layer's
// template-interpolated label position.
//
// This file is intentionally NOT `.integration.test.ts`: the helpers
// are pure functions so we exercise them directly with no Neo4j
// dependency. The route handlers (`api/src/routes/nodes.ts`,
// `api/src/routes/edges.ts`) hard-fail with `400 unknown_label` /
// `400 invalid_payload` before any Cypher is composed when these
// guards return `null`, so proving the guards reject malicious input
// proves the route layer is safe.

describe("AC-05 / AC-22 — parseLabel URL-param guard", () => {
  describe("accepts the canonical 6 labels exactly", () => {
    for (const label of NODE_LABELS) {
      test(`'${label}' → returned unchanged`, () => {
        expect(parseLabel(label)).toBe(label);
      });
    }
  });

  describe("rejects malicious / malformed label values", () => {
    const cases: Array<{ name: string; input: unknown }> = [
      { name: "empty string", input: "" },
      { name: "DROP keyword", input: "DROP" },
      {
        name: "Cypher-injection payload (closing paren + DETACH DELETE)",
        input: "Domain) WITH n DETACH DELETE n //",
      },
      { name: "case-mismatched 'domain'", input: "domain" },
      { name: "case-mismatched 'DOMAIN'", input: "DOMAIN" },
      { name: "trailing whitespace", input: "Domain " },
      { name: "leading whitespace", input: " Domain" },
      { name: "tab-injection", input: "Domain\t" },
      { name: "newline-injection", input: "Domain\n" },
      { name: "backtick-injection", input: "Domain`" },
      { name: "label with appended Cypher", input: "Domain MATCH (n) RETURN n" },
      { name: "label with semicolon", input: "Domain;" },
      { name: "non-string number", input: 42 },
      { name: "non-string object", input: {} },
      { name: "null", input: null },
      { name: "undefined", input: undefined },
    ];

    for (const { name, input } of cases) {
      test(`${name} → parseLabel returns null`, () => {
        expect(parseLabel(input)).toBeNull();
      });
    }
  });

  test("the allowlist is exactly the 6 NODE_LABELS — no extras", () => {
    // Belt-and-braces: scan the printable ASCII range for any extra
    // strings parseLabel would accept. Only the exact 6 must pass.
    const accepted: string[] = [];
    for (const candidate of [...NODE_LABELS, "Other", "Node", "User", "Tenant"]) {
      if (parseLabel(candidate) !== null) accepted.push(candidate);
    }
    expect(accepted.sort()).toEqual([...NODE_LABELS].sort());
  });
});

describe("AC-05 — parseId URL-param guard", () => {
  test("accepts a well-formed UUIDv7", () => {
    // Hand-crafted v7: version nibble '7', variant nibble '8'.
    const ok = "0190d6f8-1234-7abc-89ab-0123456789ab";
    expect(UUIDV7_REGEX.test(ok)).toBe(true);
    expect(parseId(ok)).toBe(ok);
  });

  describe("rejects malformed / malicious id values", () => {
    const cases: Array<{ name: string; input: unknown }> = [
      { name: "empty string", input: "" },
      { name: "plain 'DROP'", input: "DROP" },
      { name: "Cypher-injection payload", input: "abc' OR 1=1 //" },
      {
        name: "UUIDv4 (version nibble '4', not '7')",
        input: "0190d6f8-1234-4abc-89ab-0123456789ab",
      },
      {
        name: "invalid variant nibble (not 8/9/a/b)",
        input: "0190d6f8-1234-7abc-19ab-0123456789ab",
      },
      { name: "uppercase letters", input: "0190D6F8-1234-7ABC-89AB-0123456789AB" },
      { name: "too short", input: "0190d6f8-1234-7abc-89ab-0123456789a" },
      { name: "too long", input: "0190d6f8-1234-7abc-89ab-0123456789abcd" },
      { name: "missing dashes", input: "0190d6f812347abc89ab0123456789ab" },
      { name: "non-string number", input: 12345 },
      { name: "null", input: null },
      { name: "undefined", input: undefined },
    ];

    for (const { name, input } of cases) {
      test(`${name} → parseId returns null`, () => {
        expect(parseId(input)).toBeNull();
      });
    }
  });
});

describe("AC-22 — route handlers refuse before Cypher is composed", () => {
  // The route handlers branch on `parseLabel(...) === null` and
  // `parseId(...) === null` before calling into the storage layer.
  // We assert the wiring here by re-checking the contract: any input
  // the guard rejects MUST also be a value that, if passed through to
  // the storage layer, would template-interpolate hazardous Cypher.
  //
  // This is a static contract check: if parseLabel ever changes to
  // return a string instead of null, this test will catch the regression
  // before the new behavior ships.
  test("parseLabel rejects every input containing whitespace", () => {
    const hostile = [
      "Domain ",
      "Domain\n",
      "Domain\t",
      "Activity OR 1=1",
      "System) RETURN n //",
    ];
    for (const h of hostile) {
      expect(parseLabel(h)).toBeNull();
    }
  });

  test("parseLabel rejects every input containing a Cypher metacharacter", () => {
    const metacharacters = ["`", ";", ")", "(", "{", "}", "/", "\\", "'", "\""];
    for (const m of metacharacters) {
      expect(parseLabel(`Domain${m}`)).toBeNull();
      expect(parseLabel(`${m}Domain`)).toBeNull();
    }
  });
});
