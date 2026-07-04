// T-02 — graph-state hash determinism (AC-09, NFR-05 8 rules, DD-04/C-05).
//
// Verifies (per tasks.md T-02 Verification — the five AC-09 sub-cases plus a
// rule-(g) value-CRLF case):
//   (a) 10× render on identical input → same 64-hex lowercase hash.
//   (b) node/edge array-order permutation (rule b) → hash unchanged.
//   (c) attribute-map key-order permutation (rule d) → hash unchanged.
//   (d) a weight change → hash changes; reverting the weight → hash reverts.
//   (e) a node name in NFD vs NFC ("Café", rule f) → same hash.
//   (f) a string VALUE containing "\r\n" vs the same value with "\n"
//       (rule g value-CRLF, C-05) → same hash.
//
// Pure-crypto suite (no Neo4j, no SQLite) → runs under `bun test` (unit).

import { describe, expect, test } from "bun:test";
import {
  graphStateHash,
  type HashEdge,
  type HashInput,
  type HashNode,
  type HashWeights,
} from "../src/analytics/reporting/hash";

const WEIGHTS: HashWeights = { depth_weight: 1, system_weight: 1, role_weight: 1 };

function node(id: string, attributes: Record<string, unknown> = {}, name = "n"): HashNode {
  return { id, label: "Activity", attributes: { name, ...attributes }, updatedAt: "2026-07-04T00:00:00.000Z" };
}
function edge(id: string, fromId: string, toId: string, attributes: Record<string, unknown> = {}): HashEdge {
  return { id, type: "PRECEDES", fromId, toId, attributes, createdAt: "2026-07-04T00:00:00.000Z" };
}

function baseInput(): HashInput {
  return {
    snapshot_id: "2026-07-04T02:00:00.000Z",
    nodes: [
      node("a1", { cost: 3, region: "eu" }),
      node("a2", { cost: 1 }),
      node("a3"),
    ],
    edges: [edge("e1", "a1", "a2"), edge("e2", "a2", "a3")],
    weights: { ...WEIGHTS },
  };
}

const HEX64 = /^[0-9a-f]{64}$/;

describe("AC-09 graphStateHash — deterministic graph-state hash (NFR-05 8 rules)", () => {
  test("(shape) returns a 64-char lowercase hex SHA-256", () => {
    const h = graphStateHash(baseInput());
    expect(h).toMatch(HEX64);
  });

  test("(a) 10× on identical input → same hash", () => {
    const first = graphStateHash(baseInput());
    for (let i = 0; i < 10; i++) {
      expect(graphStateHash(baseInput())).toBe(first);
    }
  });

  test("(b) node/edge array-order permutation → hash unchanged (rule b)", () => {
    const input = baseInput();
    const permuted: HashInput = {
      ...input,
      nodes: [input.nodes[2], input.nodes[0], input.nodes[1]],
      edges: [input.edges[1], input.edges[0]],
    };
    expect(graphStateHash(permuted)).toBe(graphStateHash(input));
  });

  test("(c) attribute-map key-order permutation → hash unchanged (rule d)", () => {
    const a = baseInput();
    const b = baseInput();
    // Re-insert a1's attribute keys in a different order.
    b.nodes[0] = node("a1", {}, "n");
    b.nodes[0].attributes = { region: "eu", cost: 3, name: "n" };
    a.nodes[0].attributes = { name: "n", cost: 3, region: "eu" };
    expect(graphStateHash(b)).toBe(graphStateHash(a));
  });

  test("(d) weight change → hash changes; revert → hash reverts", () => {
    const original = graphStateHash(baseInput());
    const changed = baseInput();
    changed.weights = { ...WEIGHTS, depth_weight: 2 };
    const changedHash = graphStateHash(changed);
    expect(changedHash).not.toBe(original);
    const reverted = baseInput();
    reverted.weights = { ...WEIGHTS, depth_weight: 1 };
    expect(graphStateHash(reverted)).toBe(original);
  });

  test('(e) "Café" NFD vs NFC → same hash (rule f)', () => {
    const nfd = baseInput();
    const nfc = baseInput();
    // U+0043 U+0061 U+0066 U+00E9 (NFC) vs C a f e + U+0301 combining acute (NFD)
    nfc.nodes[0].attributes = { name: "Café".normalize("NFC") };
    nfd.nodes[0].attributes = { name: "Café".normalize("NFD") };
    // sanity: the two source strings really differ byte-for-byte pre-normalise
    expect("Café".normalize("NFC")).not.toBe("Café".normalize("NFD"));
    expect(graphStateHash(nfd)).toBe(graphStateHash(nfc));
  });

  test('(f) a value with "\\r\\n" vs "\\n" → same hash (rule g value-CRLF, C-05)', () => {
    const crlf = baseInput();
    const lf = baseInput();
    crlf.nodes[0].attributes = { note: "line1\r\nline2" };
    lf.nodes[0].attributes = { note: "line1\nline2" };
    expect(graphStateHash(crlf)).toBe(graphStateHash(lf));
  });
});
