import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import {
  api,
  createNode,
  createEdge,
  newCleanup,
  runCleanup,
  buildModelWithJourney,
  type JourneyFixture,
} from "./helpers/model-fixtures";
import { ensureStorySchema } from "./helpers/story-fixtures";

// story-spec-core T-06 / AC-04 — AC CRUD: NFR-03 clause gate (exact
// code acceptance_criterion_clause_required), ordinal = max+1
// allocation, ASC list, PATCH clause + derived clear, DELETE, parent
// gates (story_not_found / acceptance_criterion_not_found), and the
// DD-11/N-05 detached-parent repair window (AC create + patch on a
// detached parent succeed).

const cleanup = newCleanup();
const RANDOM_ID = "01900000-beef-7000-8000-000000000000";
let f: JourneyFixture;
let storyId: string;
let otherStoryId: string;
const storyIds: string[] = [];

interface ErrRes {
  error: { code: string; message: string; details?: Record<string, unknown> };
}
interface AcRes {
  id: string;
  name: string;
  given: string;
  when: string;
  then: string;
  ordinal: number;
  derived: boolean;
}

describe("integration: story-spec-core AC-04 acceptance-criteria CRUD", () => {
  beforeAll(async () => {
    await ensureStorySchema();
    f = await buildModelWithJourney(cleanup, "accrud");
    const s1 = await api<{ id: string }>("POST", `/models/${f.modelId}/stories`, {
      persona: "Cashier",
      action: "scan items",
      benefit: "the checkout completes",
      activityId: f.activityIds[0],
    });
    expect(s1.status).toBe(201);
    storyId = s1.body.id;
    storyIds.push(storyId);
    const s2 = await api<{ id: string }>("POST", `/models/${f.modelId}/stories`, {
      persona: "Clerk",
      action: "bag items",
      benefit: "the checkout completes",
      activityId: f.activityIds[1],
    });
    expect(s2.status).toBe(201);
    otherStoryId = s2.body.id;
    storyIds.push(otherStoryId);
  });

  afterAll(async () => {
    for (const id of storyIds) {
      await api("DELETE", `/models/${f.modelId}/stories/${id}`);
    }
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("create requires all three clauses — missing/empty → 400 acceptance_criterion_clause_required (NFR-03)", async () => {
    const missing = await api<ErrRes>(
      "POST",
      `/models/${f.modelId}/stories/${storyId}/acceptance-criteria`,
      { given: "g", when: "w" }, // no `then`
    );
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("acceptance_criterion_clause_required");

    const empty = await api<ErrRes>(
      "POST",
      `/models/${f.modelId}/stories/${storyId}/acceptance-criteria`,
      { given: "g", when: "", then: "t" },
    );
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe("acceptance_criterion_clause_required");
  });

  test("ordinal = max+1 when omitted; list is ordinal ASC", async () => {
    const first = await api<AcRes>(
      "POST",
      `/models/${f.modelId}/stories/${storyId}/acceptance-criteria`,
      { given: "a cart with items", when: "the cashier scans", then: "totals update" },
    );
    expect(first.status).toBe(201);
    expect(first.body.ordinal).toBe(1);
    expect(first.body.derived).toBe(false);

    const second = await api<AcRes>(
      "POST",
      `/models/${f.modelId}/stories/${storyId}/acceptance-criteria`,
      { given: "totals shown", when: "the cashier tenders", then: "a receipt prints" },
    );
    expect(second.status).toBe(201);
    expect(second.body.ordinal).toBe(2);

    const list = await api<AcRes[]>(
      "GET",
      `/models/${f.modelId}/stories/${storyId}/acceptance-criteria`,
    );
    expect(list.status).toBe(200);
    expect(list.body.map((ac) => ac.ordinal)).toEqual([1, 2]);
  });

  test("PATCH edits a clause (and reorders via {ordinal}); empty clause rejected; DELETE → 204", async () => {
    const list = await api<AcRes[]>(
      "GET",
      `/models/${f.modelId}/stories/${storyId}/acceptance-criteria`,
    );
    const target = list.body[0]!;

    const patched = await api<AcRes>(
      "PATCH",
      `/models/${f.modelId}/stories/${storyId}/acceptance-criteria/${target.id}`,
      { then: "totals update within 1s" },
    );
    expect(patched.status).toBe(200);
    expect(patched.body.then).toBe("totals update within 1s");
    expect(patched.body.given).toBe(target.given); // omitted → preserved
    expect(patched.body.derived).toBe(false); // DD-05 (hand edit)

    const emptyClause = await api<ErrRes>(
      "PATCH",
      `/models/${f.modelId}/stories/${storyId}/acceptance-criteria/${target.id}`,
      { given: "" },
    );
    expect(emptyClause.status).toBe(400);
    expect(emptyClause.body.error.code).toBe("acceptance_criterion_clause_required");

    // Reorder = PATCH {ordinal} (FR-13, no dedicated route).
    const reordered = await api<AcRes>(
      "PATCH",
      `/models/${f.modelId}/stories/${storyId}/acceptance-criteria/${target.id}`,
      { ordinal: 5 },
    );
    expect(reordered.status).toBe(200);
    expect(reordered.body.ordinal).toBe(5);

    const del = await api(
      "DELETE",
      `/models/${f.modelId}/stories/${storyId}/acceptance-criteria/${target.id}`,
    );
    expect(del.status).toBe(204);
  });

  test("a bad parent story → 404 story_not_found", async () => {
    const { status, body } = await api<ErrRes>(
      "POST",
      `/models/${f.modelId}/stories/${RANDOM_ID}/acceptance-criteria`,
      { given: "g", when: "w", then: "t" },
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("story_not_found");
  });

  test("an AC id not under the named story → 404 acceptance_criterion_not_found", async () => {
    const foreign = await api<AcRes>(
      "POST",
      `/models/${f.modelId}/stories/${otherStoryId}/acceptance-criteria`,
      { given: "g", when: "w", then: "t" },
    );
    expect(foreign.status).toBe(201);

    const { status, body } = await api<ErrRes>(
      "PATCH",
      `/models/${f.modelId}/stories/${storyId}/acceptance-criteria/${foreign.body.id}`,
      { then: "hijacked" },
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("acceptance_criterion_not_found");
  });

  test("detached parent: AC create + patch succeed during repair (DD-11 / N-05)", async () => {
    const disposable = await createNode(cleanup, "Activity", "accrud-detach");
    await createEdge("PART_OF", disposable, f.journeyId);
    const detachedStory = await api<{ id: string }>("POST", `/models/${f.modelId}/stories`, {
      persona: "Ops",
      action: "detach test",
      benefit: "the repair window is real",
      activityId: disposable,
    });
    expect(detachedStory.status).toBe(201);
    storyIds.push(detachedStory.body.id);

    const del = await fetch(
      `http://127.0.0.1:8787/api/v1/nodes/Activity/${disposable}?cascade=true`,
      { method: "DELETE" },
    );
    expect(del.status).toBe(204);

    // Create on the detached parent → 201.
    const created = await api<AcRes>(
      "POST",
      `/models/${f.modelId}/stories/${detachedStory.body.id}/acceptance-criteria`,
      { given: "the story is detached", when: "an AC is added", then: "it succeeds" },
    );
    expect(created.status).toBe(201);

    // Patch on the detached parent → 200.
    const patched = await api<AcRes>(
      "PATCH",
      `/models/${f.modelId}/stories/${detachedStory.body.id}/acceptance-criteria/${created.body.id}`,
      { then: "it still succeeds" },
    );
    expect(patched.status).toBe(200);
  });
});
