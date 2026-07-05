import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../src/neo4j/driver";
import { newCleanup, runCleanup } from "./helpers/model-fixtures";
import { buildScoringModel, getScores, rowFor } from "./helpers/key-activity-fixtures";

// key-activity-optimizer T-11 / AC-04 (FR-04, DD-02) — handoff density
// through the live route: a disjoint-role + disjoint-system boundary
// activity scores higher than an all-shared one; raw handoffCount +
// role/system breakdown in evidence; a no-PRECEDES-neighbour activity
// → 0. Role/System are SHARED reference nodes read unfiltered (DD-02(c)
// — they are never in the scoped set). The mutual-pair pin (cold-pass
// N-01) is unit-covered in key-activity-score.test.ts.

const cleanup = newCleanup();

describe("integration: key-activity-optimizer AC-04 handoff density", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    await closeDriver();
    _resetDriver();
  });

  test("disjoint-role + disjoint-system boundary activity outranks an all-shared one on handoff", async () => {
    const fx = await buildScoringModel(
      cleanup,
      "ka-handoff",
      [
        // boundary: neighbours left/right use different roles AND systems.
        { key: "left", roles: ["r-left"], systems: ["s-left"] },
        { key: "boundary", roles: ["r-mid"], systems: ["s-mid"] },
        { key: "right", roles: ["r-right"], systems: ["s-right"] },
        // shared pair: same role + same system on both sides.
        { key: "shared1", roles: ["r-shared"], systems: ["s-shared"] },
        { key: "shared2", roles: ["r-shared"], systems: ["s-shared"] },
        // island: no PRECEDES neighbours at all.
        { key: "island", roles: ["r-island"], systems: ["s-island"] },
      ],
      [
        ["left", "boundary"],
        ["boundary", "right"],
        ["shared1", "shared2"],
      ],
    );
    const scores = await getScores(fx.modelId);

    const boundary = rowFor(scores, fx.activityIds.boundary!);
    const shared = rowFor(scores, fx.activityIds.shared1!);
    expect(boundary.scores.handoff).toBeGreaterThan(shared.scores.handoff);

    // Raw handoffCount + role/system breakdown in evidence: 2 disjoint-
    // role neighbours + 2 disjoint-system neighbours.
    expect(boundary.evidence.handoff).toEqual({
      handoffCount: 4,
      roleHandoffs: 2,
      systemHandoffs: 2,
    });
    // All-shared pair: no role/system boundary crossed.
    expect(shared.evidence.handoff).toEqual({
      handoffCount: 0,
      roleHandoffs: 0,
      systemHandoffs: 0,
    });

    // No-PRECEDES-neighbour activity → 0 (FR-04).
    const island = rowFor(scores, fx.activityIds.island!);
    expect(island.scores.handoff).toBe(0);
    expect(island.evidence.handoff.handoffCount).toBe(0);
  });

  test("Δ1 (T-17, FR-04): roleless / systemless activities count NO handoffs on their empty dimension", async () => {
    const fx = await buildScoringModel(
      cleanup,
      "ka-handoff-empty",
      [
        // roleless: no EXECUTES edge at all — empty role set. Its
        // neighbours carry roles; without the non-empty guard it would
        // spuriously count 2 role handoffs (vacuous disjointness).
        { key: "up", roles: ["r-up"], systems: ["s-up"] },
        { key: "roleless", systems: ["s-mid"] },
        { key: "down", roles: ["r-down"], systems: ["s-down"] },
        // systemless: no USES_SYSTEM edge — empty system set.
        { key: "sysless", roles: ["r-mid"] },
      ],
      [
        ["up", "roleless"],
        ["roleless", "down"],
        ["down", "sysless"],
      ],
    );
    const scores = await getScores(fx.modelId);

    const roleless = rowFor(scores, fx.activityIds.roleless!);
    expect(roleless.evidence.handoff.roleHandoffs).toBe(0);
    // Both-sides-non-empty disjoint systems still count (boundary
    // assertion unchanged by the guard).
    expect(roleless.evidence.handoff.systemHandoffs).toBe(2);

    const sysless = rowFor(scores, fx.activityIds.sysless!);
    expect(sysless.evidence.handoff.systemHandoffs).toBe(0);
    // Its single neighbour (down) carries a disjoint non-empty role set.
    expect(sysless.evidence.handoff.roleHandoffs).toBe(1);
  });
});
