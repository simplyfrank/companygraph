import { describe, test, expect, mock } from "bun:test";

// Pure-unit coverage of the URL parameter guards from
// `api/src/routes/_helpers.ts`. These guards (parseRegistryLabel + parseId)
// close design-review C-05: without them, `req.params.label as NodeLabel`
// would otherwise admit arbitrary strings — including Cypher-injection
// payloads — into the storage layer's template-interpolated label position.
//
// History: the original synchronous `parseLabel` validated against the
// compile-time 6-label NODE_LABELS tuple. It was replaced by the async,
// registry-backed `parseRegistryLabel` when the ontology became
// runtime-mutable (see the note at the top of _helpers.ts). The security
// contract is unchanged — only names present in the schema registry pass,
// so injection payloads never survive the guard — and this file re-proves
// it against the registry-backed implementation.
//
// This file is intentionally NOT `.integration.test.ts`: the schema cache
// is mocked below, so the guards are exercised with no Neo4j dependency.
// The route handlers hard-fail with `400 unknown_label` /
// `400 invalid_payload` before any Cypher is composed when these guards
// return `null`, so proving the guards reject malicious input proves the
// route layer is safe.

const REGISTRY_LABELS = [
  "Domain",
  "UserJourney",
  "Activity",
  "Role",
  "System",
  "Location",
];

mock.module("../src/ontology/cache/schema", () => ({
  getSchema: async () => ({
    nodeLabels: REGISTRY_LABELS.map((name) => ({ name })),
    edgeTypes: [{ name: "PART_OF" }, { name: "PRECEDES" }],
  }),
}));

const { parseId, parseRegistryLabel, parseEdgeTypeName } = await import(
  "../src/routes/_helpers"
);
const { UUIDV7_REGEX } = await import("../src/ids");

describe("AC-05 — parseRegistryLabel URL-param guard", () => {
  describe("accepts exactly the labels present in the registry", () => {
    for (const label of REGISTRY_LABELS) {
      test(`'${label}' → returned unchanged`, async () => {
        expect(await parseRegistryLabel(label)).toBe(label);
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
      test(`${name} → parseRegistryLabel returns null`, async () => {
        expect(await parseRegistryLabel(input)).toBeNull();
      });
    }
  });

  test("the allowlist is exactly the registry's labels — no extras", async () => {
    const accepted: string[] = [];
    for (const candidate of [...REGISTRY_LABELS, "Other", "Node", "User", "Tenant"]) {
      if ((await parseRegistryLabel(candidate)) !== null) accepted.push(candidate);
    }
    expect(accepted.sort()).toEqual([...REGISTRY_LABELS].sort());
  });
});

describe("AC-05 — parseEdgeTypeName URL-param guard", () => {
  test("accepts a registry edge type, rejects injection", async () => {
    expect(await parseEdgeTypeName("PART_OF")).toBe("PART_OF");
    expect(await parseEdgeTypeName("PART_OF) DETACH DELETE n //")).toBeNull();
    expect(await parseEdgeTypeName("")).toBeNull();
    expect(await parseEdgeTypeName(42)).toBeNull();
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

describe("AC-05 — route handlers refuse before Cypher is composed", () => {
  // The route handlers branch on `parseRegistryLabel(...) === null` and
  // `parseId(...) === null` before calling into the storage layer. Any
  // input the guard rejects MUST also be a value that, if passed through,
  // would template-interpolate hazardous Cypher.
  test("parseRegistryLabel rejects every input containing whitespace", async () => {
    const hostile = [
      "Domain ",
      "Domain\n",
      "Domain\t",
      "Activity OR 1=1",
      "System) RETURN n //",
    ];
    for (const h of hostile) {
      expect(await parseRegistryLabel(h)).toBeNull();
    }
  });

  test("parseRegistryLabel rejects every input containing a Cypher metacharacter", async () => {
    const metacharacters = ["`", ";", ")", "(", "{", "}", "/", "\\", "'", '"'];
    for (const m of metacharacters) {
      expect(await parseRegistryLabel(`Domain${m}`)).toBeNull();
      expect(await parseRegistryLabel(`${m}Domain`)).toBeNull();
    }
  });
});
