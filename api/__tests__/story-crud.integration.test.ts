import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import {
  api,
  createNode,
  createEdge,
  newCleanup,
  runCleanup,
  buildModelWithJourney,
  UUIDV7,
  type JourneyFixture,
} from "./helpers/model-fixtures";

// story-spec-core T-05 / AC-03 — story CRUD round-trip through the
// route surface: server-assembled narrative, DD-07/DD-08 validation
// codes, C-06 model gate, model-scoped list, PATCH semantics
// (omitted-preserved, narrative re-assembly, derived clear,
// re-point + sourceActivityId tracking), and the DD-11 detached
// lifecycle (the AC-11 integration seam).

const cleanup = newCleanup();
const UNKNOWN_MODEL = "01900000-dead-7000-8000-000000000000";
let a: JourneyFixture;
let b: JourneyFixture;

interface ErrRes {
  error: { code: string; message: string; details?: Record<string, unknown> };
}
interface StoryRes {
  id: string;
  name: string;
  persona: string | null;
  action: string | null;
  benefit: string | null;
  narrative: string | null;
  derived: boolean;
  sourceActivityId: string | null;
  activityId: string | null;
  activityName: string | null;
  roleId?: string | null;
  roleName?: string | null;
  acCount: number;
  detached: boolean;
  acceptanceCriteria?: Array<{ id: string; ordinal: number }>;
}

const storyIds: Array<{ modelId: string; id: string }> = [];

async function createStory(
  modelId: string,
  body: Record<string, unknown>,
): Promise<StoryRes> {
  const { status, body: res } = await api<StoryRes>("POST", `/models/${modelId}/stories`, body);
  expect(status).toBe(201);
  storyIds.push({ modelId, id: res.id });
  return res;
}

describe("integration: story-spec-core AC-03 story CRUD", () => {
  beforeAll(async () => {
    a = await buildModelWithJourney(cleanup, "storycrudA");
    b = await buildModelWithJourney(cleanup, "storycrudB");
  });

  afterAll(async () => {
    // Stories first (cascades their ACs + edges), then models/nodes —
    // a leftover detached story would pollute EVERY model's list (DD-11).
    for (const { modelId, id } of storyIds) {
      await api("DELETE", `/models/${modelId}/stories/${id}`);
    }
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("create → 201 + UUIDv7 + server-assembled narrative + edges (AC-03)", async () => {
    const story = await createStory(a.modelId, {
      persona: "Cashier",
      action: "scan items",
      benefit: "the checkout completes",
      activityId: a.activityIds[0],
      roleId: a.roleId,
    });
    expect(story.id).toMatch(UUIDV7);
    expect(story.narrative).toBe("As a Cashier, I want to scan items, so that the checkout completes.");
    expect(story.name).toBe(story.narrative!);
    expect(story.derived).toBe(false);
    expect(story.detached).toBe(false);
    expect(story.acCount).toBe(0);
    expect(story.activityId).toBe(a.activityIds[0]);
    expect(story.sourceActivityId).toBe(a.activityIds[0]);
    expect(story.roleId).toBe(a.roleId);

    // Edge wiring — DESCRIBES_ACTIVITY + STORY_FOR_ROLE exist.
    const session = getDriver().session({ defaultAccessMode: "READ" });
    try {
      const r = await session.run(
        `MATCH (s:UserStory {id: $id})
         OPTIONAL MATCH (s)-[da:DESCRIBES_ACTIVITY]->(act:Activity)
         OPTIONAL MATCH (s)-[sr:STORY_FOR_ROLE]->(role:Role)
         RETURN count(da) AS da, count(sr) AS sr`,
        { id: story.id },
      );
      expect(r.records[0]!.get("da")).toBe(1);
      expect(r.records[0]!.get("sr")).toBe(1);
    } finally {
      await session.close();
    }
  });

  test("a client-supplied narrative is rejected at the boundary (server-assembled only)", async () => {
    const { status } = await api<ErrRes>("POST", `/models/${a.modelId}/stories`, {
      persona: "P",
      action: "A",
      benefit: "B",
      activityId: a.activityIds[0],
      narrative: "As a hacker…",
    });
    expect(status).toBe(400);
  });

  test("out-of-scope / model-B activityId → 404 story_activity_not_in_model field activityId (DD-08)", async () => {
    const { status, body } = await api<ErrRes>("POST", `/models/${a.modelId}/stories`, {
      persona: "P",
      action: "A",
      benefit: "B",
      activityId: b.activityIds[0],
    });
    expect(status).toBe(404);
    expect(body.error.code).toBe("story_activity_not_in_model");
    expect(body.error.details?.field).toBe("activityId");
  });

  test("bad roleId → 404 not_found field roleId (DD-07)", async () => {
    const { status, body } = await api<ErrRes>("POST", `/models/${a.modelId}/stories`, {
      persona: "P",
      action: "A",
      benefit: "B",
      activityId: a.activityIds[0],
      roleId: UNKNOWN_MODEL,
    });
    expect(status).toBe(404);
    expect(body.error.code).toBe("not_found");
    expect(body.error.details?.field).toBe("roleId");
  });

  test("missing activityId → 400 story_activity_required (route mapping)", async () => {
    const { status, body } = await api<ErrRes>("POST", `/models/${a.modelId}/stories`, {
      persona: "P",
      action: "A",
      benefit: "B",
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe("story_activity_required");
    expect(body.error.details?.field).toBe("activityId");
  });

  test("unknown :modelId on list/create/detail → 404 model_not_found (C-06 gate)", async () => {
    const list = await api<ErrRes>("GET", `/models/${UNKNOWN_MODEL}/stories`);
    expect(list.status).toBe(404);
    expect(list.body.error.code).toBe("model_not_found");

    const create = await api<ErrRes>("POST", `/models/${UNKNOWN_MODEL}/stories`, {
      persona: "P",
      action: "A",
      benefit: "B",
      activityId: a.activityIds[0],
    });
    expect(create.status).toBe(404);
    expect(create.body.error.code).toBe("model_not_found");

    const detail = await api<ErrRes>(
      "GET",
      `/models/${UNKNOWN_MODEL}/stories/${storyIds[0]?.id ?? UNKNOWN_MODEL}`,
    );
    expect(detail.status).toBe(404);
    expect(detail.body.error.code).toBe("model_not_found");
  });

  test("list is model-scoped: A's list carries A's attached stories, never B's (AC-08 read seam)", async () => {
    const bStory = await createStory(b.modelId, {
      persona: "Picker",
      action: "pick order",
      benefit: "the fulfillment completes",
      activityId: b.activityIds[0],
    });
    const { status, body } = await api<StoryRes[]>("GET", `/models/${a.modelId}/stories`);
    expect(status).toBe(200);
    const ids = body.map((s) => s.id);
    expect(ids).toContain(storyIds[0]!.id);
    expect(ids).not.toContain(bStory.id);
  });

  test("detail embeds ACs ordered by ordinal ASC", async () => {
    const story = await createStory(a.modelId, {
      persona: "Clerk",
      action: "restock shelves",
      benefit: "the replenishment completes",
      activityId: a.activityIds[1],
    });
    // Create out of order: ordinal 2 first, then 1.
    for (const ordinal of [2, 1]) {
      const { status } = await api(
        "POST",
        `/models/${a.modelId}/stories/${story.id}/acceptance-criteria`,
        { given: `g${ordinal}`, when: `w${ordinal}`, then: `t${ordinal}`, ordinal },
      );
      expect(status).toBe(201);
    }
    const { status, body } = await api<StoryRes>(
      "GET",
      `/models/${a.modelId}/stories/${story.id}`,
    );
    expect(status).toBe(200);
    expect(body.acceptanceCriteria!.map((ac) => ac.ordinal)).toEqual([1, 2]);
    expect(body.acCount).toBe(2);
  });

  test("PATCH preserves omitted fields, re-assembles narrative, keeps derived false", async () => {
    const story = await createStory(a.modelId, {
      persona: "Manager",
      action: "approve returns",
      benefit: "the returns workflow completes",
      activityId: a.activityIds[0],
    });
    const { status, body } = await api<StoryRes>(
      "PATCH",
      `/models/${a.modelId}/stories/${story.id}`,
      { benefit: "customers leave happy" },
    );
    expect(status).toBe(200);
    expect(body.persona).toBe("Manager"); // omitted → preserved
    expect(body.action).toBe("approve returns");
    expect(body.narrative).toBe(
      "As a Manager, I want to approve returns, so that customers leave happy.",
    );
    expect(body.derived).toBe(false);
  });

  test("PATCH re-point updates the edge AND sourceActivityId (D-3(f)); out-of-scope re-point → 404", async () => {
    const story = await createStory(a.modelId, {
      persona: "Auditor",
      action: "audit stock",
      benefit: "the audit completes",
      activityId: a.activityIds[0],
    });
    const { status, body } = await api<StoryRes>(
      "PATCH",
      `/models/${a.modelId}/stories/${story.id}`,
      { activityId: a.activityIds[1] },
    );
    expect(status).toBe(200);
    expect(body.activityId).toBe(a.activityIds[1]);
    expect(body.sourceActivityId).toBe(a.activityIds[1]);

    const bad = await api<ErrRes>("PATCH", `/models/${a.modelId}/stories/${story.id}`, {
      activityId: b.activityIds[0],
    });
    expect(bad.status).toBe(404);
    expect(bad.body.error.code).toBe("story_activity_not_in_model");
  });

  test("detached lifecycle (DD-11): activity delete → detached row+detail; re-point repairs; detached delete → 204", async () => {
    // Disposable activities so the shared fixture stays intact.
    const disposable1 = await createNode(cleanup, "Activity", "storycrud-detach-1");
    await createEdge("PART_OF", disposable1, a.journeyId);
    const disposable2 = await createNode(cleanup, "Activity", "storycrud-detach-2");
    await createEdge("PART_OF", disposable2, a.journeyId);

    const repairable = await createStory(a.modelId, {
      persona: "Ops",
      action: "close registers",
      benefit: "the closing workflow completes",
      activityId: disposable1,
    });
    const doomed = await createStory(a.modelId, {
      persona: "Ops",
      action: "open registers",
      benefit: "the opening workflow completes",
      activityId: disposable2,
    });

    // Delete both activities via the core node route → stories detach.
    for (const id of [disposable1, disposable2]) {
      const del = await fetch(
        `http://127.0.0.1:8787/api/v1/nodes/Activity/${id}?cascade=true`,
        { method: "DELETE" },
      );
      expect(del.status).toBe(204);
    }

    // List row AND detail both return detached:true with null activity fields.
    const list = await api<StoryRes[]>("GET", `/models/${a.modelId}/stories`);
    const row = list.body.find((s) => s.id === repairable.id)!;
    expect(row.detached).toBe(true);
    expect(row.activityId).toBeNull();
    expect(row.activityName).toBeNull();

    const detail = await api<StoryRes>("GET", `/models/${a.modelId}/stories/${repairable.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.detached).toBe(true);
    expect(detail.body.activityId).toBeNull();

    // PATCH re-point to a scoped activity repairs.
    const repaired = await api<StoryRes>(
      "PATCH",
      `/models/${a.modelId}/stories/${repairable.id}`,
      { activityId: a.activityIds[0] },
    );
    expect(repaired.status).toBe(200);
    expect(repaired.body.detached).toBe(false);
    expect(repaired.body.activityId).toBe(a.activityIds[0]);
    expect(repaired.body.sourceActivityId).toBe(a.activityIds[0]);

    // DELETE of a (still) detached story → 204.
    const del = await api("DELETE", `/models/${a.modelId}/stories/${doomed.id}`);
    expect(del.status).toBe(204);
  });

  test("cross-model detail/PATCH/DELETE → 404 story_not_found (two-shape gate, shape (a))", async () => {
    const aStoryId = storyIds[0]!.id;
    const detail = await api<ErrRes>("GET", `/models/${b.modelId}/stories/${aStoryId}`);
    expect(detail.status).toBe(404);
    expect(detail.body.error.code).toBe("story_not_found");

    const patch = await api<ErrRes>("PATCH", `/models/${b.modelId}/stories/${aStoryId}`, {
      persona: "X",
    });
    expect(patch.status).toBe(404);
    expect(patch.body.error.code).toBe("story_not_found");

    const del = await api<ErrRes>("DELETE", `/models/${b.modelId}/stories/${aStoryId}`);
    expect(del.status).toBe(404);
    expect(del.body.error.code).toBe("story_not_found");
  });
});
