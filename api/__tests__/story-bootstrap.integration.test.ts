import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import {
  api,
  newCleanup,
  runCleanup,
  buildModelWithJourney,
  type JourneyFixture,
} from "./helpers/model-fixtures";
import { ensureStorySchema } from "./helpers/story-fixtures";

// story-spec-core T-07 / AC-07 — bootstrap derives + persists one
// EDITABLE derived:true story + starter Given/When/Then AC per scoped
// activity without a story; re-run is idempotent ({created,skipped},
// no doubles); {activityIds} narrows (out-of-scope → 404
// story_activity_not_in_model field activityIds, DD-08); a persisted
// derived story PATCHes normally and its derived flag clears (DD-05).

const cleanup = newCleanup();
let f: JourneyFixture; // act-first has EXECUTES role; act-second has location only
let other: JourneyFixture; // model B — out-of-scope source

interface ErrRes {
  error: { code: string; message: string; details?: Record<string, unknown> };
}
interface StoryRes {
  id: string;
  persona: string | null;
  narrative: string | null;
  derived: boolean;
  activityId: string | null;
  roleId?: string | null;
  acCount: number;
  acceptanceCriteria?: Array<{
    id: string;
    given: string;
    when: string;
    then: string;
    ordinal: number;
    derived: boolean;
  }>;
}
interface BootstrapRes {
  created: number;
  skipped: number;
}

const listStories = async (modelId: string) =>
  (await api<StoryRes[]>("GET", `/models/${modelId}/stories`)).body;

describe("integration: story-spec-core AC-07 bootstrap", () => {
  beforeAll(async () => {
    await ensureStorySchema();
    f = await buildModelWithJourney(cleanup, "storyboot");
    other = await buildModelWithJourney(cleanup, "storybootB");
  });

  afterAll(async () => {
    for (const modelId of [f.modelId, other.modelId]) {
      for (const s of await listStories(modelId)) {
        await api("DELETE", `/models/${modelId}/stories/${s.id}`);
      }
    }
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("bootstrap → one derived:true story + starter AC per activity-without-story; re-run idempotent", async () => {
    const first = await api<BootstrapRes>("POST", `/models/${f.modelId}/stories/bootstrap`);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ created: 2, skipped: 0 });

    const stories = await listStories(f.modelId);
    const mine = stories.filter(
      (s) => s.activityId === f.activityIds[0] || s.activityId === f.activityIds[1],
    );
    expect(mine.length).toBe(2);
    for (const s of mine) expect(s.derived).toBe(true);

    // act-first has an executing Role → persona + STORY_FOR_ROLE.
    const withRole = mine.find((s) => s.activityId === f.activityIds[0])!;
    expect(withRole.roleId).toBe(f.roleId);
    expect(withRole.narrative).toContain("As a storyboot-role, I want to storyboot-act-first");
    // act-second has no role → "user" fallback.
    const noRole = mine.find((s) => s.activityId === f.activityIds[1])!;
    expect(noRole.persona).toBe("user");

    // Each story carries ONE derived starter GWT AC, ordinal 1 (DD-02).
    for (const s of mine) {
      const detail = await api<StoryRes>("GET", `/models/${f.modelId}/stories/${s.id}`);
      expect(detail.status).toBe(200);
      const acs = detail.body.acceptanceCriteria!;
      expect(acs.length).toBe(1);
      expect(acs[0]!.ordinal).toBe(1);
      expect(acs[0]!.derived).toBe(true);
      expect(acs[0]!.given.length).toBeGreaterThan(0);
      expect(acs[0]!.when.length).toBeGreaterThan(0);
      expect(acs[0]!.then.length).toBeGreaterThan(0);
    }
    expect(noRole.acCount).toBe(1);

    // The no-role starter `when` clause uses the "the user performs …"
    // fallback (DD-02 / design-review N-02).
    const noRoleDetail = await api<StoryRes>("GET", `/models/${f.modelId}/stories/${noRole.id}`);
    expect(noRoleDetail.body.acceptanceCriteria![0]!.when).toBe(
      "the user performs storyboot-act-second",
    );

    // Re-run: skip rule (DD-04) — nothing double-derived.
    const second = await api<BootstrapRes>("POST", `/models/${f.modelId}/stories/bootstrap`);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ created: 0, skipped: 2 });
    const after = (await listStories(f.modelId)).filter(
      (s) => s.activityId === f.activityIds[0] || s.activityId === f.activityIds[1],
    );
    expect(after.length).toBe(2);
  });

  test("{activityIds} narrows; an out-of-scope id → 404 story_activity_not_in_model field activityIds (DD-08)", async () => {
    const bad = await api<ErrRes>("POST", `/models/${f.modelId}/stories/bootstrap`, {
      activityIds: [other.activityIds[0]],
    });
    expect(bad.status).toBe(404);
    expect(bad.body.error.code).toBe("story_activity_not_in_model");
    expect(bad.body.error.details?.field).toBe("activityIds");

    // Narrowed run against model B's own activity: only that one derives.
    const scoped = await api<BootstrapRes>("POST", `/models/${other.modelId}/stories/bootstrap`, {
      activityIds: [other.activityIds[0]],
    });
    expect(scoped.status).toBe(200);
    expect(scoped.body).toEqual({ created: 1, skipped: 0 });
    const bStories = (await listStories(other.modelId)).filter((s) => s.activityId !== null);
    expect(bStories.length).toBe(1);
    expect(bStories[0]!.activityId).toBe(other.activityIds[0]);
  });

  test("unknown model → 404 model_not_found, never a silent {0,0} (C-06 gate)", async () => {
    const { status, body } = await api<ErrRes>(
      "POST",
      "/models/01900000-dead-7000-8000-000000000000/stories/bootstrap",
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("model_not_found");
  });

  test("a persisted derived story PATCHes normally and its derived flag clears (AC-07 / DD-05)", async () => {
    const stories = await listStories(f.modelId);
    const derived = stories.find((s) => s.derived && s.activityId === f.activityIds[0])!;
    const patched = await api<StoryRes>("PATCH", `/models/${f.modelId}/stories/${derived.id}`, {
      benefit: "the hand-edited workflow completes",
    });
    expect(patched.status).toBe(200);
    expect(patched.body.derived).toBe(false);
    expect(patched.body.narrative).toContain("so that the hand-edited workflow completes.");
  });
});
