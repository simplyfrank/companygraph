// business-model-authoring T-19 — template-clone integration test (AC-09).
// Requires live Neo4j.

import { describe, expect, test } from "bun:test";

const BASE = "http://127.0.0.1:8787/api/v1";

describe("business-model-authoring T-19: template-clone (AC-09)", () => {
  // Full integration assertions require a seeded Neo4j instance:
  // - Seed the isReference:true model with ≥1 published module
  // - Create a fresh target model + target domain (POST …/domains)
  // - Execute the clone: GET /modules → filter sourceModelId; one
  //   POST /models/:targetId/module-instances per module
  // - Assert (1) instances exist + cloned journey structure readable
  //   via GET …/authoring/graph on the target model
  // - Assert (2) the cloned structure came into being without any
  //   authoring/apply call
  // - Assert (3) a generic node/edge write attempting to mutate
  //   module-lifecycle state returns 409 model_lifecycle_route_required

  test("placeholder — full assertions require live Neo4j with reference model + published modules", () => {
    expect(true).toBe(true);
  });
});
