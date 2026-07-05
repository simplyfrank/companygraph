import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../src/neo4j/driver";
import { api, newCleanup, runCleanup } from "./helpers/model-fixtures";
import {
  buildScoringModel,
  getScores,
  rowFor,
  type ScoringFixture,
} from "./helpers/key-activity-fixtures";

// key-activity-optimizer T-05 / AC-06 + AC-07 (FR-07, FR-08, FR-09,
// NFR-02, NFR-03) — mark/unmark through the route surface:
//  - POST …/mark writes keyActivity evidence INSIDE attributes,
//    preserving a pre-set unrelated sibling attribute (AC-06);
//  - 404 sequencing: unknown model → model_not_found BEFORE any
//    activity check, then non-scoped activity → activity_not_found
//    (cold-pass B-01);
//  - DELETE …/mark restores attributes byte-equal to pre-mark (no
//    residue, siblings intact — NFR-03, AC-07);
//  - unmark of unmarked → 204 true no-op with updatedAt UNCHANGED
//    (final-review N-02);
//  - re-mark writes a fresh snapshot at then-current scores (AC-07).

const UNKNOWN_MODEL = "01900000-dead-7000-8000-000000000000";
const UNKNOWN_ACTIVITY = "01900000-beef-7000-8000-000000000000";
const cleanup = newCleanup();
let fx: ScoringFixture;

interface NodeRes {
  id: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
}

async function getActivityNode(id: string): Promise<NodeRes> {
  const { status, body } = await api<NodeRes>("GET", `/nodes/Activity/${id}`);
  expect(status).toBe(200);
  return body;
}

describe("integration: key-activity-optimizer AC-06/AC-07 mark + unmark", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
    fx = await buildScoringModel(
      cleanup,
      "ka-mark",
      [
        { key: "a", roles: ["r1"], systems: ["s1"], attributes: { team: "ops", tier: 2 } },
        { key: "b", roles: ["r2"], systems: ["s2"] },
        { key: "c", roles: ["r3"], systems: ["s3"] },
      ],
      [
        ["a", "b"],
        ["b", "c"],
      ],
    );
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("mark writes keyActivity evidence inside attributes, preserving unrelated siblings (AC-06)", async () => {
    const aId = fx.activityIds.a!;
    const before = await getActivityNode(aId);
    expect(before.attributes).toEqual({ team: "ops", tier: 2 });

    const live = rowFor(await getScores(fx.modelId), aId);
    const { status, body } = await api<{
      id: string;
      rank: number;
      key: {
        marked: boolean;
        markedAt: string;
        scoreSnapshot: { centrality: number; criticalPath: number; handoff: number; composite: number };
        rank: number;
      };
    }>("POST", `/models/${fx.modelId}/key-activities/${aId}/mark`);
    expect(status).toBe(200);
    expect(body.id).toBe(aId);
    expect(body.key.marked).toBe(true);
    // Server-computed snapshot matches the live scores at mark time.
    expect(body.key.scoreSnapshot.composite).toBeCloseTo(live.composite);
    expect(body.key.rank).toBe(live.rank);

    const after = await getActivityNode(aId);
    expect(after.attributes.team).toBe("ops");
    expect(after.attributes.tier).toBe(2);
    const stored = after.attributes.keyActivity as { marked: boolean; rank: number };
    expect(stored.marked).toBe(true);
    expect(stored.rank).toBe(live.rank);
  });

  test("404 sequencing: model_not_found before any activity check, then activity_not_found (cold-pass B-01)", async () => {
    const aId = fx.activityIds.a!;
    // Unknown model + REAL activity → the model gate fires first.
    const m = await api<{ error: { code: string } }>(
      "POST",
      `/models/${UNKNOWN_MODEL}/key-activities/${aId}/mark`,
    );
    expect(m.status).toBe(404);
    expect(m.body.error.code).toBe("model_not_found");
    // Known model + non-scoped activity id → activity_not_found.
    const a = await api<{ error: { code: string } }>(
      "POST",
      `/models/${fx.modelId}/key-activities/${UNKNOWN_ACTIVITY}/mark`,
    );
    expect(a.status).toBe(404);
    expect(a.body.error.code).toBe("activity_not_found");
    // Same sequencing on unmark.
    const dm = await api<{ error: { code: string } }>(
      "DELETE",
      `/models/${UNKNOWN_MODEL}/key-activities/${aId}/mark`,
    );
    expect(dm.status).toBe(404);
    expect(dm.body.error.code).toBe("model_not_found");
    const da = await api<{ error: { code: string } }>(
      "DELETE",
      `/models/${fx.modelId}/key-activities/${UNKNOWN_ACTIVITY}/mark`,
    );
    expect(da.status).toBe(404);
    expect(da.body.error.code).toBe("activity_not_found");
  });

  test("unmark restores attributes byte-equal to pre-mark; double-unmark is a true no-op (AC-07, NFR-03, final-review N-02)", async () => {
    const aId = fx.activityIds.a!;
    // (marked by the first test)
    const del = await api("DELETE", `/models/${fx.modelId}/key-activities/${aId}/mark`);
    expect(del.status).toBe(204);

    const restored = await getActivityNode(aId);
    // Byte-equal restore: no keyActivity residue, siblings intact.
    expect(restored.attributes).toEqual({ team: "ops", tier: 2 });
    expect("keyActivity" in restored.attributes).toBe(false);

    // Unmark of unmarked → 204 no-op with updatedAt unchanged.
    const before = await getActivityNode(aId);
    const again = await api("DELETE", `/models/${fx.modelId}/key-activities/${aId}/mark`);
    expect(again.status).toBe(204);
    const after = await getActivityNode(aId);
    expect(after.attributes).toEqual(before.attributes);
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  test("re-mark writes a FRESH snapshot at then-current scores (AC-07, XD-03)", async () => {
    const aId = fx.activityIds.a!;
    const first = await api<{ key: { markedAt: string } }>(
      "POST",
      `/models/${fx.modelId}/key-activities/${aId}/mark`,
    );
    expect(first.status).toBe(200);
    const firstMarkedAt = first.body.key.markedAt;

    const del = await api("DELETE", `/models/${fx.modelId}/key-activities/${aId}/mark`);
    expect(del.status).toBe(204);

    await new Promise((r) => setTimeout(r, 5));
    const second = await api<{
      key: { markedAt: string; scoreSnapshot: { composite: number } };
    }>("POST", `/models/${fx.modelId}/key-activities/${aId}/mark`);
    expect(second.status).toBe(200);
    expect(second.body.key.markedAt).not.toBe(firstMarkedAt);
    const live = rowFor(await getScores(fx.modelId), aId);
    expect(second.body.key.scoreSnapshot.composite).toBeCloseTo(live.composite);

    // Tidy: leave unmarked.
    await api("DELETE", `/models/${fx.modelId}/key-activities/${aId}/mark`);
  });
});
