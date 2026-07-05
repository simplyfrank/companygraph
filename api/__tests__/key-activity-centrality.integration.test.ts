import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../src/neo4j/driver";
import { newCleanup, runCleanup } from "./helpers/model-fixtures";
import { buildScoringModel, getScores, rowFor } from "./helpers/key-activity-fixtures";

// key-activity-optimizer T-11 / AC-02 (FR-02, DD-03) — betweenness
// centrality over the model-scoped PRECEDES subgraph, through the live
// route: a known hub ranks highest, a leaf ≈0, a ≤1-activity model →
// all-0 with no crash. (Pure-math cases live Neo4j-free in
// key-activity-score.test.ts per DD-01.)

const cleanup = newCleanup();

describe("integration: key-activity-optimizer AC-02 centrality", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("known-hub fixture ranks highest on centrality; leaf ≈ 0", async () => {
    // a -> hub, b -> hub, hub -> c, hub -> d.
    const fx = await buildScoringModel(
      cleanup,
      "ka-central",
      [{ key: "a" }, { key: "b" }, { key: "hub" }, { key: "c" }, { key: "d" }],
      [
        ["a", "hub"],
        ["b", "hub"],
        ["hub", "c"],
        ["hub", "d"],
      ],
    );
    const scores = await getScores(fx.modelId);
    const hub = rowFor(scores, fx.activityIds.hub!);
    expect(hub.scores.centrality).toBe(1);
    expect(hub.evidence.centrality.betweenness).toBeGreaterThan(0);
    expect(hub.evidence.centrality.inDegree).toBe(2);
    expect(hub.evidence.centrality.outDegree).toBe(2);
    for (const leaf of ["a", "b", "c", "d"]) {
      expect(rowFor(scores, fx.activityIds[leaf]!).scores.centrality).toBe(0);
    }
    // Highest centrality of the model belongs to the hub.
    const max = Math.max(...scores.rows.map((r) => r.scores.centrality));
    expect(rowFor(scores, fx.activityIds.hub!).scores.centrality).toBe(max);
  });

  test("≤1-activity model → all-0 sub-scores, no crash", async () => {
    const fx = await buildScoringModel(cleanup, "ka-central-one", [{ key: "solo" }], []);
    const scores = await getScores(fx.modelId);
    expect(scores.meta.activityCount).toBe(1);
    const solo = rowFor(scores, fx.activityIds.solo!);
    expect(solo.scores).toEqual({ centrality: 0, criticalPath: 0, handoff: 0 });
    expect(solo.composite).toBe(0);
    expect(solo.rank).toBe(1);
  });
});
