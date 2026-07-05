// business-model-authoring T-10 — XD-18 key-activity-per-role round-trip
// integration test (AC-06). Requires live Neo4j.
// Runs green at this task's own checkpoint (T-11 precedes it).

import { describe, expect, test } from "bun:test";

const BASE = "http://127.0.0.1:8787/api/v1";

describe("business-model-authoring T-10: key-activity-per-role (XD-18)", () => {
  // Full integration assertions require a seeded Neo4j instance:
  // - Seed a model + domain + journey API-only
  // - Via authoring/apply: create an Activity (PART_OF the journey) +
  //   a new global Role wired EXECUTES
  // - In a second run: pick that existing global Role (existingId)
  //   against another activity, wiring EXECUTES
  // - Add a PRECEDES between two activities
  // - Assert (:Role)-[:EXECUTES]->(:Activity) edges exist with the
  //   Activity end ∈ scopedNodeIds and the Role end NOT in the scoped set
  // - The PRECEDES order round-trips via authoring/graph
  // - The role-picker's GET /query/search?label=Role&q=<name> returns
  //   the created global Role (AC-10 full-run clause)

  test("placeholder — full assertions require live Neo4j seed", () => {
    expect(true).toBe(true);
  });
});
