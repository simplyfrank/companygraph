import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../src/neo4j/driver";
import { newCleanup, runCleanup } from "./helpers/model-fixtures";
import {
  buildScoringModel,
  getScores,
  rowFor,
  type ActivitySpec,
} from "./helpers/key-activity-fixtures";

// key-activity-optimizer T-11 / AC-03 (FR-03, NFR-05) — critical-path
// scoring through the live route: on-path activities score 1, off-path
// graded; a cyclic PRECEDES fixture → meta.hasCycle=true + longest
// acyclic sub-chain, no crash; a 30-deep linear fixture →
// meta.truncated=true, truncationReason:"depth_cap", scored against
// the depth-20 partial. (Bounded-DFS unit cases live in
// key-activity-score.test.ts.)

const cleanup = newCleanup();

describe("integration: key-activity-optimizer AC-03 critical path", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("critical-path activities score 1; off-path graded", async () => {
    // Chain a->b->c->d (critical, 4 nodes) + spur e->c (3-node chain).
    const fx = await buildScoringModel(
      cleanup,
      "ka-cp",
      [{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }, { key: "e" }],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
        ["e", "c"],
      ],
    );
    const scores = await getScores(fx.modelId);
    expect(scores.meta.hasCycle).toBe(false);
    for (const k of ["a", "b", "c", "d"]) {
      const row = rowFor(scores, fx.activityIds[k]!);
      expect(row.scores.criticalPath).toBe(1);
      expect(row.evidence.criticalPath.onCriticalPath).toBe(true);
      expect(row.evidence.criticalPath.criticalPathLength).toBe(4);
    }
    const e = rowFor(scores, fx.activityIds.e!);
    expect(e.evidence.criticalPath.onCriticalPath).toBe(false);
    expect(e.scores.criticalPath).toBeCloseTo(3 / 4);
  });

  test("Δ2 (T-18, FR-03): a model with a chain and one unconnected activity → that row scores criticalPath 0 with longestChainDepth 0 evidence", async () => {
    const fx = await buildScoringModel(
      cleanup,
      "ka-cp-isolated",
      [{ key: "a" }, { key: "b" }, { key: "c" }, { key: "isolated" }],
      [
        ["a", "b"],
        ["b", "c"],
      ],
    );
    const scores = await getScores(fx.modelId);
    const isolated = rowFor(scores, fx.activityIds.isolated!);
    expect(isolated.scores.criticalPath).toBe(0);
    expect(isolated.evidence.criticalPath.longestChainDepth).toBe(0);
    expect(isolated.evidence.criticalPath.onCriticalPath).toBe(false);
    // The model's chain is still reported and unaffected.
    expect(isolated.evidence.criticalPath.criticalPathLength).toBe(3);
    expect(rowFor(scores, fx.activityIds.a!).scores.criticalPath).toBe(1);
  });

  test("cyclic PRECEDES fixture → hasCycle:true + longest acyclic sub-chain, no crash", async () => {
    const fx = await buildScoringModel(
      cleanup,
      "ka-cp-cycle",
      [{ key: "a" }, { key: "b" }, { key: "c" }],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "a"],
      ],
    );
    const scores = await getScores(fx.modelId);
    expect(scores.meta.hasCycle).toBe(true);
    expect(scores.meta.activityCount).toBe(3);
    // Longest acyclic sub-chain still reported (3 nodes).
    expect(scores.rows[0]!.evidence.criticalPath.criticalPathLength).toBe(3);
  });

  test("30-deep linear fixture → truncated:true / depth_cap, scored against the depth-20 partial (NFR-05)", async () => {
    const keys = Array.from({ length: 30 }, (_, i) => `n${String(i).padStart(2, "0")}`);
    const activities: ActivitySpec[] = keys.map((key) => ({ key }));
    const chain: Array<[string, string]> = keys.slice(0, -1).map((k, i) => [k, keys[i + 1]!]);
    const fx = await buildScoringModel(cleanup, "ka-cp-deep", activities, chain);
    const scores = await getScores(fx.modelId);
    expect(scores.meta.truncated).toBe(true);
    expect(scores.meta.truncationReason).toBe("depth_cap");
    const head = rowFor(scores, fx.activityIds.n00!);
    expect(head.evidence.criticalPath.criticalPathLength).toBe(20);
    expect(head.scores.criticalPath).toBe(1);
  });
});
