// ddd-system-modeling T-05 (rev-2 tasks-review B-01) — unit test of the
// exported kind-bucketing helper. Runs under `bun test`, no Neo4j.
//
// Why a UNIT test: a System WITHOUT attributes.systemKind is NOT
// API-constructible on a booted stack (runSystemKindMigration tightens
// the System json_schema_doc so `required` includes systemKind; the
// generic node write validates registry-generically → 400
// attribute_violation). The `unknown` bucket is therefore proven here,
// against the EXACT function computeGaps calls — never via an
// integration fixture (the sanctioned direct-driver budget stays at
// exactly two).

import { describe, expect, test } from "bun:test";
import { bucketSystemKinds } from "../src/storage/system-model";

describe("bucketSystemKinds (augmentation-mix defensive bucket)", () => {
  test("missing, invalid, and null systemKind all land in unknown — nothing dropped", () => {
    const counts = bucketSystemKinds([
      JSON.stringify({ name: "no kind key" }), // missing systemKind
      JSON.stringify({ systemKind: "quantum" }), // invalid value
      null, // null attributes_json
      JSON.stringify({ systemKind: "functional" }),
      JSON.stringify({ systemKind: "agentic" }),
      JSON.stringify({ systemKind: "ai_predictive" }),
    ]);
    expect(counts).toEqual({
      functional: 1,
      agentic: 1,
      ai_predictive: 1,
      unknown: 3,
    });
    // Nothing silently dropped: totals match the input length.
    expect(
      counts.functional + counts.agentic + counts.ai_predictive + counts.unknown,
    ).toBe(6);
  });

  test("valid kinds bucket correctly", () => {
    const counts = bucketSystemKinds([
      JSON.stringify({ systemKind: "functional" }),
      JSON.stringify({ systemKind: "functional" }),
      JSON.stringify({ systemKind: "agentic" }),
    ]);
    expect(counts).toEqual({ functional: 2, agentic: 1, ai_predictive: 0, unknown: 0 });
  });

  test("empty input → all-zero counts", () => {
    expect(bucketSystemKinds([])).toEqual({
      functional: 0,
      agentic: 0,
      ai_predictive: 0,
      unknown: 0,
    });
  });

  test("malformed JSON lands in unknown, not a throw", () => {
    expect(bucketSystemKinds(["not-json{{"])).toEqual({
      functional: 0,
      agentic: 0,
      ai_predictive: 0,
      unknown: 1,
    });
  });

  test("non-string systemKind (wrong type) lands in unknown", () => {
    expect(bucketSystemKinds([JSON.stringify({ systemKind: 7 })])).toEqual({
      functional: 0,
      agentic: 0,
      ai_predictive: 0,
      unknown: 1,
    });
  });
});
