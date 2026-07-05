import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { EDGE_ENDPOINTS, EDGE_TYPES } from "@companygraph/shared/schema/edges";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { registerStorySchema } from "../src/scripts/register-story-labels";
import { api, createNode, newCleanup, runCleanup } from "./helpers/model-fixtures";
import { ensureStorySchema } from "./helpers/story-fixtures";

// story-spec-core T-02 / AC-02 — the three story edge types register
// via createEdgeType with their _OntologyEdgeEndpoint pairs; the
// registry-backed edge validator enforces them (400
// edge_endpoint_label_mismatch on a wrong pair); the compile-time
// EDGE_ENDPOINTS const is unchanged.

const cleanup = newCleanup();
let storyNodeId: string;
let activityId: string;
let roleId: string;

interface ErrRes {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

describe("integration: story-spec-core AC-02 edge-type registration", () => {
  beforeAll(async () => {
    await ensureStorySchema();
    await registerStorySchema(getDriver());
    // Plain unattached nodes are enough to exercise the endpoint
    // whitelist — no model scoping involved at the edge-validator level.
    storyNodeId = await createNode(cleanup, "UserStory", "edge-test-story");
    activityId = await createNode(cleanup, "Activity", "edge-test-activity");
    roleId = await createNode(cleanup, "Role", "edge-test-role");
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("a correct DESCRIBES_ACTIVITY pair (UserStory→Activity) is accepted", async () => {
    const { status, body } = await api<{ id: string }>("POST", "/edges", {
      type: "DESCRIBES_ACTIVITY",
      fromId: storyNodeId,
      toId: activityId,
    });
    expect(status).toBe(201);
    await api("DELETE", `/edges/${body.id}`);
  });

  test("a wrong pair (DESCRIBES_ACTIVITY UserStory→Role) → 400 edge_endpoint_label_mismatch", async () => {
    const { status, body } = await api<ErrRes>("POST", "/edges", {
      type: "DESCRIBES_ACTIVITY",
      fromId: storyNodeId,
      toId: roleId,
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe("edge_endpoint_label_mismatch");
  });

  test("STORY_FOR_ROLE and ACCEPTANCE_OF endpoint pairs are registered", async () => {
    const session = getDriver().session({ defaultAccessMode: "READ" });
    try {
      const r = await session.run(
        `MATCH (t:_OntologyEdgeType)<-[:OF_TYPE]-(ep:_OntologyEdgeEndpoint)
         WHERE t.name IN ["DESCRIBES_ACTIVITY", "STORY_FOR_ROLE", "ACCEPTANCE_OF"]
         RETURN t.name AS type, ep.from_label AS fromLabel, ep.to_label AS toLabel
         ORDER BY type`,
      );
      const pairs = r.records.map((rec) => [
        rec.get("type"),
        rec.get("fromLabel"),
        rec.get("toLabel"),
      ]);
      expect(pairs).toContainEqual(["ACCEPTANCE_OF", "AcceptanceCriterion", "UserStory"]);
      expect(pairs).toContainEqual(["DESCRIBES_ACTIVITY", "UserStory", "Activity"]);
      expect(pairs).toContainEqual(["STORY_FOR_ROLE", "UserStory", "Role"]);
    } finally {
      await session.close();
    }
  });

  test("compile-time EDGE_ENDPOINTS / EDGE_TYPES are unchanged (NFR-01 / AC-18)", () => {
    for (const t of ["DESCRIBES_ACTIVITY", "STORY_FOR_ROLE", "ACCEPTANCE_OF"]) {
      expect(EDGE_TYPES as readonly string[]).not.toContain(t);
      expect(Object.keys(EDGE_ENDPOINTS)).not.toContain(t);
    }
  });
});
