// T-02 — graph-state hash protocol (FR-08 basis, NFR-05 8 rules, DD-04).
//
// `graphStateHash(input)` produces the 64-char lowercase hex SHA-256 that
// the deterministic exec-summary PDF (T-05) stamps into `/Subject` + its
// page-1 footer, and that the `/snapshot/:last_run_at` endpoint (T-06)
// re-derives so an external verifier can reproduce it.
//
// The 8 NFR-05 rules (a..h), per DD-04:
//   (a) recursive key-sort            ┐ reuse graph-core's canonicalStringify
//   (c) ECMAScript number formatting  │ (api/src/storage/modules.ts) — already
//   (e) UTF-8 verbatim strings        │ implements a/c/e/g for the JSON form.
//   (g) NO insignificant whitespace   ┘
//   (b) sort `nodes`/`edges` by `id` ASC before serialising  ─┐ layered here
//   (d) parse `attributes_json` → object before canonicalise  │ (analytics-
//       (the caller passes already-parsed `attributes` maps)  │  specific
//   (f) NFC-normalise every string, recursively               │  deltas)
//   ── plus rule (g) value-CRLF→LF (C-05): a string VALUE     │
//      containing `\r\n` hashes identically to the same value │
//      with `\n` (JSON.stringify escapes `\r`→`\\r` distinctly│
//      from `\n`→`\\n`, so we normalise CRLF→LF first)        ┘
//   (h) createHash("sha256")…digest("hex")

import { createHash } from "node:crypto";
import { canonicalStringify } from "../../storage/modules"; // graph-core, rules a/c/e/g

// C-04: the canonical key is `attributes` — matching NFR-05 rule (d)'s stated
// key name — so an external verifier re-derives the same serialised form.
export interface HashNode {
  id: string;
  label: string;
  attributes: Record<string, unknown>;
  updatedAt: string;
}
export interface HashEdge {
  id: string;
  type: string;
  fromId: string;
  toId: string;
  attributes: Record<string, unknown>;
  createdAt: string;
}
export interface HashWeights {
  depth_weight: number;
  system_weight: number;
  role_weight: number;
}
export interface HashInput {
  snapshot_id: string;
  nodes: HashNode[];
  edges: HashEdge[];
  weights: HashWeights;
}

// rule (g) value-CRLF→LF then rule (f) NFC: normalise a single string.
function normalizeString(s: string): string {
  return s.replace(/\r\n/g, "\n").normalize("NFC"); // rule (g) then rule (f)
}

// Recursively NFC-/LF-normalise every string (keys and values) in the value.
function nfc(value: unknown): unknown {
  if (typeof value === "string") return normalizeString(value);
  if (Array.isArray(value)) return value.map(nfc);
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src)) out[normalizeString(k)] = nfc(src[k]);
    return out;
  }
  return value;
}

export function graphStateHash(input: HashInput): string {
  // rule (b): sort nodes/edges by id ASC before serialisation.
  const canonical = {
    snapshot_id: input.snapshot_id,
    nodes: [...input.nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    edges: [...input.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    weights: input.weights,
  };
  // rules (a,c,d,e) via canonicalStringify (recursive key-sort, ECMAScript
  //   numbers, `attributes` already PARSED objects so rule (d) holds); rules
  //   (f) NFC + (g) value-CRLF→LF applied first via nfc()/normalizeString().
  const serialised = canonicalStringify(nfc(canonical));
  return createHash("sha256").update(serialised, "utf8").digest("hex"); // rule (h)
}
