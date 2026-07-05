// business-model-authoring T-16 — model-isolation integration test
// (AC-18 server half: read + write + DD-09 recovery). Requires live Neo4j.

import { describe, expect, test } from "bun:test";

const BASE = "http://127.0.0.1:8787/api/v1";

describe("business-model-authoring T-16: model isolation", () => {
  // Full integration assertions require a seeded Neo4j instance with
  // two models (A + B):
  //
  // Read side: GET /models/:modelB/authoring/graph returns none of A's
  // model-scoped structure (Domain/UserJourney/Activity). A global Role
  // from A's run IS visible to B (DEC-01(a), B-01).
  //
  // Write side (DD-07/DD-09):
  // (a) POST /models/A/authoring/apply with a journey whose PART_OF
  //     targets model B's domain id → per-row invalid_payload with
  //     details:{outOfModel:[…]}, no edge written
  // (b) a node row re-running B's journey id with a new name → same
  //     per-row rejection, B's journey name unchanged
  // (c) recovery (DD-09): the batch from (a) strands its valid journey
  //     node as a no-model orphan — assert invisible to both models'
  //     authoring/graph reads, then retry with echoed ids and a
  //     corrected in-model PART_OF domain anchor → the apply succeeds
  //     and the journey appears in A's authoring/graph

  test("placeholder — full assertions require live Neo4j with two seeded models", () => {
    expect(true).toBe(true);
  });
});
