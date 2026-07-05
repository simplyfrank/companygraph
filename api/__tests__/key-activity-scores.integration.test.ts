import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../src/neo4j/driver";
import { api, createEdge, createNode, newCleanup, runCleanup } from "./helpers/model-fixtures";
import {
  buildScoringModel,
  getScores,
  rowFor,
  type ScoringFixture,
} from "./helpers/key-activity-fixtures";

// key-activity-optimizer T-11 / AC-01 (+ AC-05 integration half) —
// GET /api/v1/models/:modelId/key-activities returns the ranked,
// evidence-carrying score rows; unknown model → 404 model_not_found;
// an existing 0-domain model → 200 rows:[] (never 404 — cold-pass
// B-01); a multi-PART_OF activity appears exactly once with the
// deterministic lowest-id journey (final-review C-02); a marked
// activity carries its key snapshot and a hand-planted marked:false
// renders as key:null (design C-04).

const UNKNOWN_MODEL = "01900000-dead-7000-8000-000000000000";
const cleanup = newCleanup();
let fx: ScoringFixture;

describe("integration: key-activity-optimizer AC-01 scores endpoint", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
    // a -> hub -> c, b -> hub: hub is the chokepoint.
    fx = await buildScoringModel(
      cleanup,
      "ka-scores",
      [
        { key: "a", roles: ["r1"], systems: ["s1"] },
        { key: "b", roles: ["r1"], systems: ["s1"] },
        { key: "hub", roles: ["r2"], systems: ["s2"] },
        { key: "c", roles: ["r3"], systems: ["s3"] },
      ],
      [
        ["a", "hub"],
        ["b", "hub"],
        ["hub", "c"],
      ],
    );
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("ranked rows carry id/name/journeyName/composite/scores∈[0,1] + evidence + meta (AC-01)", async () => {
    const scores = await getScores(fx.modelId);
    expect(scores.meta.activityCount).toBe(4);
    expect(scores.meta.hasCycle).toBe(false);
    expect(scores.meta.weights).toEqual({ centrality: 1, criticalPath: 1, handoff: 1 });
    expect(scores.rows).toHaveLength(4);
    for (const row of scores.rows) {
      expect(typeof row.id).toBe("string");
      expect(typeof row.name).toBe("string");
      expect(row.journeyId).toBe(fx.journeyId);
      expect(row.journeyName).toBe("ka-scores-journey");
      expect(typeof row.composite).toBe("number");
      for (const sub of ["centrality", "criticalPath", "handoff"] as const) {
        expect(row.scores[sub]).toBeGreaterThanOrEqual(0);
        expect(row.scores[sub]).toBeLessThanOrEqual(1);
      }
      // Every score carries its evidence block.
      expect(row.evidence.centrality).toHaveProperty("betweenness");
      expect(row.evidence.centrality).toHaveProperty("inDegree");
      expect(row.evidence.centrality).toHaveProperty("outDegree");
      expect(row.evidence.criticalPath).toHaveProperty("onCriticalPath");
      expect(row.evidence.criticalPath).toHaveProperty("longestChainDepth");
      expect(row.evidence.criticalPath).toHaveProperty("criticalPathLength");
      expect(row.evidence.handoff).toHaveProperty("handoffCount");
      expect(row.evidence.handoff).toHaveProperty("roleHandoffs");
      expect(row.evidence.handoff).toHaveProperty("systemHandoffs");
    }
  });

  test("composite desc + 1-based rank; NO recommendation field (AC-05, NFR-04)", async () => {
    const scores = await getScores(fx.modelId);
    for (let i = 0; i < scores.rows.length; i++) {
      expect(scores.rows[i]!.rank).toBe(i + 1);
      if (i > 0) {
        expect(scores.rows[i - 1]!.composite).toBeGreaterThanOrEqual(scores.rows[i]!.composite);
      }
    }
    const raw = JSON.stringify(scores);
    expect(raw).not.toContain("recommend");
    expect(raw).not.toContain("suggest");
  });

  test("unknown :modelId → 404 model_not_found (cold-pass B-01 gate)", async () => {
    const { status, body } = await api<{ error: { code: string } }>(
      "GET",
      `/models/${UNKNOWN_MODEL}/key-activities`,
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("model_not_found");
  });

  test("freshly created model with no domains → 200 rows:[] / activityCount:0 — never 404 (AC-01/AC-12)", async () => {
    const model = await api<{ id: string }>("POST", "/models", { name: "ka-scores-empty" });
    expect(model.status).toBe(201);
    cleanup.modelIds.push(model.body.id);
    const { status, body } = await api<{ rows: unknown[]; meta: { activityCount: number } }>(
      "GET",
      `/models/${model.body.id}/key-activities`,
    );
    expect(status).toBe(200);
    expect(body.rows).toEqual([]);
    expect(body.meta.activityCount).toBe(0);
  });

  test("an activity with two PART_OF journey parents appears exactly once with the lowest-id journey (final-review C-02)", async () => {
    const j2 = await createNode(cleanup, "UserJourney", "ka-scores-journey-2");
    await createEdge("PART_OF", j2, fx.domainId);
    await createEdge("PART_OF", fx.activityIds.hub!, j2);
    const scores = await getScores(fx.modelId);
    const hubRows = scores.rows.filter((r) => r.id === fx.activityIds.hub);
    expect(hubRows).toHaveLength(1);
    const expected = [fx.journeyId, j2].sort()[0]!;
    expect(hubRows[0]!.journeyId).toBe(expected);
  });

  test("a marked activity shows live scores + key snapshot; hand-planted marked:false → key:null (design C-04)", async () => {
    const hubId = fx.activityIds.hub!;
    const mark = await api<{ key: { marked: boolean } }>(
      "POST",
      `/models/${fx.modelId}/key-activities/${hubId}/mark`,
    );
    expect(mark.status).toBe(200);
    expect(mark.body.key.marked).toBe(true);

    const scores = await getScores(fx.modelId);
    const hub = rowFor(scores, hubId);
    expect(hub.key).not.toBeNull();
    expect(hub.key!.marked).toBe(true);
    expect(hub.key!.scoreSnapshot.composite).toBeCloseTo(hub.composite);

    // Hand-plant a foreign marked:false value on a sibling activity —
    // the read path treats it as unmarked, never crashes the ranking.
    const cId = fx.activityIds.c!;
    const patch = await api("PATCH", `/nodes/Activity/${cId}`, {
      attributes: { keyActivity: { marked: false } },
    });
    expect(patch.status).toBe(200);
    const scores2 = await getScores(fx.modelId);
    expect(rowFor(scores2, cId).key).toBeNull();

    // Leave the fixture unmarked for other files.
    const unmark = await api("DELETE", `/models/${fx.modelId}/key-activities/${hubId}/mark`);
    expect(unmark.status).toBe(204);
  });
});
