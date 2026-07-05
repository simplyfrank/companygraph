// business-model-authoring T-05 — integration test for the authoring/graph
// read route (FR-09, AC-12). Requires live Neo4j.
// First runs green at the T-11 checkpoint (routes dispatched).

import { describe, expect, test } from "bun:test";

const BASE = "http://127.0.0.1:8787/api/v1";

async function json(path: string) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, body: await res.json() };
}

describe("business-model-authoring T-05: authoring/graph", () => {
  test("absent model → 404 model_not_found", async () => {
    const { status, body } = await json(
      `/models/00000000-0000-0000-0000-000000000000/authoring/graph`,
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("model_not_found");
  });

  // Full integration assertions require a seeded Neo4j instance with
  // a model + domain + journey + activity structure:
  // - after an apply run, the graph returns the model's journeys +
  //   activities (with order) and each role/system/location by id
  // - a sibling :modelId returns none of the first model's
  //   journeys/activities (isolation smoke; full assertion in T-16)
  // - a global Role used by two models appears in both graphs (shared)
  // - 404 on an absent model
});
