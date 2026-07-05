import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import {
  api,
  newCleanup,
  runCleanup,
  buildModelWithJourney,
  type JourneyFixture,
} from "./helpers/model-fixtures";
import { ensureStorySchema } from "./helpers/story-fixtures";

// story-spec-core T-05 / AC-05 — DELETE story removes its ACs + all
// three edge types in ONE DETACH DELETE tx (no orphan ACs, no dangling
// edges); the story's Activity/Role are NOT deleted.

const cleanup = newCleanup();
let f: JourneyFixture;

describe("integration: story-spec-core AC-05 cascade delete", () => {
  beforeAll(async () => {
    await ensureStorySchema();
    f = await buildModelWithJourney(cleanup, "storycascade");
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("DELETE story cascades ACs + DESCRIBES_ACTIVITY/STORY_FOR_ROLE/ACCEPTANCE_OF; Activity/Role survive", async () => {
    const story = await api<{ id: string }>("POST", `/models/${f.modelId}/stories`, {
      persona: "Cashier",
      action: "close till",
      benefit: "the day-end workflow completes",
      activityId: f.activityIds[0],
      roleId: f.roleId,
    });
    expect(story.status).toBe(201);

    const acIds: string[] = [];
    for (const n of [1, 2]) {
      const ac = await api<{ id: string }>(
        "POST",
        `/models/${f.modelId}/stories/${story.body.id}/acceptance-criteria`,
        { given: `g${n}`, when: `w${n}`, then: `t${n}` },
      );
      expect(ac.status).toBe(201);
      acIds.push(ac.body.id);
    }

    const del = await api("DELETE", `/models/${f.modelId}/stories/${story.body.id}`);
    expect(del.status).toBe(204);

    const session = getDriver().session({ defaultAccessMode: "READ" });
    try {
      // No orphan ACs.
      const acs = await session.run(
        `MATCH (ac:AcceptanceCriterion) WHERE ac.id IN $acIds RETURN count(ac) AS c`,
        { acIds },
      );
      expect(acs.records[0]!.get("c")).toBe(0);

      // No dangling edges of any of the three types touching the story id.
      const edges = await session.run(
        `OPTIONAL MATCH ()-[r]-() WHERE type(r) IN ["DESCRIBES_ACTIVITY","STORY_FOR_ROLE","ACCEPTANCE_OF"]
           AND (startNode(r).id = $storyId OR endNode(r).id = $storyId)
         RETURN count(r) AS c`,
        { storyId: story.body.id },
      );
      expect(edges.records[0]!.get("c")).toBe(0);

      // The story node itself is gone; its Activity/Role survive.
      const survivors = await session.run(
        `OPTIONAL MATCH (s:UserStory {id: $storyId})
         OPTIONAL MATCH (a:Activity {id: $activityId})
         OPTIONAL MATCH (r:Role {id: $roleId})
         RETURN count(s) AS story, count(a) AS activity, count(r) AS role`,
        { storyId: story.body.id, activityId: f.activityIds[0], roleId: f.roleId },
      );
      expect(survivors.records[0]!.get("story")).toBe(0);
      expect(survivors.records[0]!.get("activity")).toBe(1);
      expect(survivors.records[0]!.get("role")).toBe(1);
    } finally {
      await session.close();
    }
  });
});
