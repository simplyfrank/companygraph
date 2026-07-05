// ddd-system-modeling T-07 / AC-05 — DELETE /models/:modelId/
// capabilities/:capabilityId cascades all four edge types in ONE
// transaction (single DETACH DELETE — no dangling edges), and every
// far-end node (Activity / UserStory / System / BoundedContext /
// BusinessModel) survives. API-only fixture.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import {
  api,
  createNode,
  createEdge,
  newCleanup,
  runCleanup,
  type Cleanup,
} from "./helpers/model-fixtures";
import {
  ensureCapabilitySchema,
  createCapabilityFixture,
  createStoryFixture,
} from "./helpers/capability-fixtures";

const cleanup: Cleanup = newCleanup();
let modelId: string;
let activityId: string;
let storyId: string;
let systemId: string;
let contextId: string;
let capId: string;

describe("integration: ddd-system-modeling AC-05 cascade delete", () => {
  beforeAll(async () => {
    await ensureCapabilitySchema();
    const model = await api<{ id: string }>("POST", "/models", { name: "cascade-model" });
    modelId = model.body.id;
    cleanup.modelIds.push(modelId);
    const domain = await api<{ id: string }>("POST", `/models/${modelId}/domains`, {
      name: "cascade-domain",
    });
    const journey = await createNode(cleanup, "UserJourney", "cascade-journey");
    await createEdge("PART_OF", journey, domain.body.id);
    activityId = await createNode(cleanup, "Activity", "cascade-activity");
    await createEdge("PART_OF", activityId, journey);
    systemId = await createNode(cleanup, "System", "cascade-system", {
      systemKind: "functional",
    });
    contextId = await createNode(cleanup, "BoundedContext", "cascade-context");
    const story = await createStoryFixture(modelId, activityId, "cascade persona");
    storyId = story.id;

    // Wire ALL FOUR edge types: NEEDS_CAPABILITY in from an activity
    // AND a story, SUPPORTED_BY out, ASSIGNED_TO_CONTEXT out, plus the
    // create-tx CAPABILITY_IN_MODEL.
    capId = (await createCapabilityFixture(modelId, "cascade-capability")).id;
    for (const [path, body] of [
      [`needed-by`, { activityId }],
      [`needed-by`, { storyId }],
      [`supported-by`, { systemId }],
      [`context`, { boundedContextId: contextId }],
    ] as const) {
      const r = await api("PUT", `/models/${modelId}/capabilities/${capId}/${path}`, body);
      expect(r.status).toBe(200);
    }
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("DELETE → 204; all four edge types gone; far-end nodes survive", async () => {
    const del = await api("DELETE", `/models/${modelId}/capabilities/${capId}`);
    expect(del.status).toBe(204);

    const session = getDriver().session({ defaultAccessMode: "READ" });
    try {
      // No residual relationship of ANY of the four types touches the
      // deleted id (query from the far nodes — no dangling edges).
      const residual = await session.run(
        `MATCH (far)-[r:NEEDS_CAPABILITY|SUPPORTED_BY|ASSIGNED_TO_CONTEXT|CAPABILITY_IN_MODEL]-(x)
         WHERE x.id = $capId OR far.id = $capId
         RETURN count(r) AS c`,
        { capId },
      );
      expect(Number(residual.records[0]!.get("c"))).toBe(0);

      // The capability node itself is gone.
      const node = await session.run(`MATCH (c:Capability {id: $capId}) RETURN count(c) AS c`, {
        capId,
      });
      expect(Number(node.records[0]!.get("c"))).toBe(0);

      // Every far-end node still exists.
      const far = await session.run(
        `OPTIONAL MATCH (a:Activity {id: $activityId})
         OPTIONAL MATCH (s:UserStory {id: $storyId})
         OPTIONAL MATCH (sys:System {id: $systemId})
         OPTIONAL MATCH (bc:BoundedContext {id: $contextId})
         OPTIONAL MATCH (m:BusinessModel {id: $modelId})
         RETURN a.id AS a, s.id AS s, sys.id AS sys, bc.id AS bc, m.id AS m`,
        { activityId, storyId, systemId, contextId, modelId },
      );
      const rec = far.records[0]!;
      expect(rec.get("a")).toBe(activityId);
      expect(rec.get("s")).toBe(storyId);
      expect(rec.get("sys")).toBe(systemId);
      expect(rec.get("bc")).toBe(contextId);
      expect(rec.get("m")).toBe(modelId);
    } finally {
      await session.close();
    }
  });
});
