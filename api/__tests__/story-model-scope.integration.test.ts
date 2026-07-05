import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { scopedNodeIds } from "../src/storage/model-scope";
import {
  api,
  newCleanup,
  runCleanup,
  buildModelWithJourney,
  type JourneyFixture,
} from "./helpers/model-fixtures";
import { ensureStorySchema } from "./helpers/story-fixtures";

// story-spec-core T-10 / AC-08 (NFR-02) — two-model isolation proof.
// Read-side: model A's list returns A's attached stories and excludes
// every ATTACHED story whose activity belongs only to model B (the D-4
// carve-out: only detached rows are globally visible); a story id is
// NOT itself a member of scopedNodeIds (isolation resolves through the
// activity join, design §3.4); bootstrap on A derives only from A's
// scoped activities. Write-side (requirements rev 3 C-06): a create
// with a model-B-only activityId and a PATCH re-point to it are both
// rejected 404 story_activity_not_in_model and create/move nothing.

const cleanup = newCleanup();
let a: JourneyFixture;
let b: JourneyFixture;
let aStoryId: string;
let bStoryId: string;

interface ErrRes {
  error: { code: string; message: string; details?: Record<string, unknown> };
}
interface StoryRes {
  id: string;
  activityId: string | null;
  detached: boolean;
  derived: boolean;
}

const listStories = async (modelId: string) =>
  (await api<StoryRes[]>("GET", `/models/${modelId}/stories`)).body;

describe("integration: story-spec-core AC-08 model isolation", () => {
  beforeAll(async () => {
    await ensureStorySchema();
    a = await buildModelWithJourney(cleanup, "storyscopeA");
    b = await buildModelWithJourney(cleanup, "storyscopeB");
    const sa = await api<{ id: string }>("POST", `/models/${a.modelId}/stories`, {
      persona: "A-persona",
      action: "a-action",
      benefit: "the a workflow completes",
      activityId: a.activityIds[0],
    });
    expect(sa.status).toBe(201);
    aStoryId = sa.body.id;
    const sb = await api<{ id: string }>("POST", `/models/${b.modelId}/stories`, {
      persona: "B-persona",
      action: "b-action",
      benefit: "the b workflow completes",
      activityId: b.activityIds[0],
    });
    expect(sb.status).toBe(201);
    bStoryId = sb.body.id;
  });

  afterAll(async () => {
    for (const modelId of [a.modelId, b.modelId]) {
      for (const s of await listStories(modelId)) {
        if (!s.detached) await api("DELETE", `/models/${modelId}/stories/${s.id}`);
      }
    }
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("read-side: A's list carries A's attached stories and excludes B's attached stories", async () => {
    const listA = await listStories(a.modelId);
    const attachedA = listA.filter((s) => !s.detached).map((s) => s.id);
    expect(attachedA).toContain(aStoryId);
    expect(attachedA).not.toContain(bStoryId);

    const listB = await listStories(b.modelId);
    const attachedB = listB.filter((s) => !s.detached).map((s) => s.id);
    expect(attachedB).toContain(bStoryId);
    expect(attachedB).not.toContain(aStoryId);
  });

  test("a story id is NOT a member of scopedNodeIds — isolation resolves through the activity join (§3.4)", async () => {
    const scope = await scopedNodeIds(getDriver(), a.modelId);
    expect(scope.has(aStoryId)).toBe(false);
    expect(scope.has(a.activityIds[0])).toBe(true); // the join anchor IS scoped
  });

  test("bootstrap on model A derives only from model-A scoped activities", async () => {
    const boot = await api<{ created: number; skipped: number }>(
      "POST",
      `/models/${a.modelId}/stories/bootstrap`,
    );
    expect(boot.status).toBe(200);
    // a1 already has a story (skipped); a2 derives — nothing from B.
    expect(boot.body).toEqual({ created: 1, skipped: 1 });
    const derivedRows = (await listStories(a.modelId)).filter((s) => s.derived && !s.detached);
    for (const row of derivedRows) {
      expect([a.activityIds[0], a.activityIds[1]]).toContain(row.activityId!);
    }
    // B's list gained nothing.
    const listB = (await listStories(b.modelId)).filter((s) => !s.detached);
    expect(listB.map((s) => s.id)).toEqual([bStoryId]);
  });

  test("write-side: create with a model-B-only activityId and a re-point to it are both rejected; B's list unchanged", async () => {
    const before = (await listStories(b.modelId)).filter((s) => !s.detached).map((s) => s.id);

    const create = await api<ErrRes>("POST", `/models/${a.modelId}/stories`, {
      persona: "X",
      action: "smuggle",
      benefit: "the isolation hole opens",
      activityId: b.activityIds[1],
    });
    expect(create.status).toBe(404);
    expect(create.body.error.code).toBe("story_activity_not_in_model");

    const repoint = await api<ErrRes>("PATCH", `/models/${a.modelId}/stories/${aStoryId}`, {
      activityId: b.activityIds[1],
    });
    expect(repoint.status).toBe(404);
    expect(repoint.body.error.code).toBe("story_activity_not_in_model");

    const after = (await listStories(b.modelId)).filter((s) => !s.detached).map((s) => s.id);
    expect(after).toEqual(before); // nothing created, nothing moved

    // The A story still points at its A activity.
    const detail = await api<StoryRes>("GET", `/models/${a.modelId}/stories/${aStoryId}`);
    expect(detail.body.activityId).toBe(a.activityIds[0]);
  });
});
