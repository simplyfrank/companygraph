import { describe, expect, test } from "bun:test";
import {
  scoreActivities,
  type ScoreActivity,
  type ScoreSubgraph,
} from "../src/derive/key-activity-score";

// key-activity-optimizer T-03 (DD-01) — Neo4j-free unit tests of the
// pure scorer: AC-02 (centrality), AC-03 (critical path + budgets),
// AC-04 (handoff incl. the cold-pass N-01 mutual-pair pin), AC-05
// (composite + deterministic tiebreak), design C-05 (self-loop /
// duplicate-edge guard), final-review C-02 (duplicate activity-id
// guard). No Neo4j session is ever opened.

const W = { centrality: 1.0, criticalPath: 1.0, handoff: 1.0 };

function act(
  id: string,
  over: Partial<ScoreActivity> = {},
): ScoreActivity {
  return {
    id,
    name: `activity-${id}`,
    createdAt: `2026-07-04T00:00:0${id.charCodeAt(0) % 10}.000Z`,
    journeyId: null,
    journeyName: null,
    roleIds: [],
    systemIds: [],
    ...over,
  };
}

function sg(activities: ScoreActivity[], precedes: Array<[string, string]>): ScoreSubgraph {
  return {
    activities,
    precedes: precedes.map(([fromId, toId]) => ({ fromId, toId })),
    weights: { ...W },
  };
}

const row = (r: ReturnType<typeof scoreActivities>, id: string) => {
  const found = r.rows.find((x) => x.id === id);
  if (!found) throw new Error(`row ${id} missing`);
  return found;
};

describe("key-activity-score centrality (AC-02, FR-02, DD-03)", () => {
  test("a known hub ranks highest on centrality; a leaf is ~0", () => {
    // a -> hub, b -> hub, hub -> c, hub -> d : hub sits on every shortest path.
    const r = scoreActivities(
      sg(
        [act("a"), act("b"), act("hub"), act("c"), act("d")],
        [
          ["a", "hub"],
          ["b", "hub"],
          ["hub", "c"],
          ["hub", "d"],
        ],
      ),
    );
    const hub = row(r, "hub");
    expect(hub.scores.centrality).toBe(1);
    expect(hub.evidence.centrality.betweenness).toBeGreaterThan(0);
    expect(hub.evidence.centrality.inDegree).toBe(2);
    expect(hub.evidence.centrality.outDegree).toBe(2);
    expect(row(r, "a").scores.centrality).toBe(0);
    expect(row(r, "d").scores.centrality).toBe(0);
  });

  test("≤1-activity subgraph → all sub-scores 0, no crash", () => {
    const one = scoreActivities(sg([act("a")], []));
    expect(one.rows).toHaveLength(1);
    expect(one.rows[0]!.scores).toEqual({ centrality: 0, criticalPath: 0, handoff: 0 });
    expect(one.rows[0]!.composite).toBe(0);
    const zero = scoreActivities(sg([], []));
    expect(zero.rows).toHaveLength(0);
    expect(zero.meta.activityCount).toBe(0);
  });

  test("no-edge subgraph → all-zero centrality (no divide-by-zero)", () => {
    const r = scoreActivities(sg([act("a"), act("b")], []));
    for (const x of r.rows) expect(x.scores.centrality).toBe(0);
  });
});

describe("key-activity-score critical path (AC-03, FR-03, NFR-05)", () => {
  test("critical-path activities score 1; off-path graded", () => {
    // Chain a->b->c->d (critical, length 4) plus spur e->c.
    const r = scoreActivities(
      sg(
        [act("a"), act("b"), act("c"), act("d"), act("e")],
        [
          ["a", "b"],
          ["b", "c"],
          ["c", "d"],
          ["e", "c"],
        ],
      ),
    );
    expect(r.meta.hasCycle).toBe(false);
    for (const id of ["a", "b", "c", "d"]) {
      expect(row(r, id).scores.criticalPath).toBe(1);
      expect(row(r, id).evidence.criticalPath.onCriticalPath).toBe(true);
      expect(row(r, id).evidence.criticalPath.criticalPathLength).toBe(4);
    }
    const e = row(r, "e");
    expect(e.evidence.criticalPath.onCriticalPath).toBe(false);
    expect(e.scores.criticalPath).toBeCloseTo(3 / 4); // e->c->d chain
  });

  test("Δ2 (T-18): an isolated activity in a model WITH a critical path scores criticalPath 0 with longestChainDepth 0 (FR-03 ≥2-node chain rule)", () => {
    // Chain a->b->c (critical, 3 nodes) plus one activity with no
    // intra-scope PRECEDES edges at all.
    const r = scoreActivities(
      sg(
        [act("a"), act("b"), act("c"), act("isolated")],
        [
          ["a", "b"],
          ["b", "c"],
        ],
      ),
    );
    const isolated = row(r, "isolated");
    expect(isolated.evidence.criticalPath.longestChainDepth).toBe(0);
    expect(isolated.evidence.criticalPath.criticalPathLength).toBe(3); // the model's chain
    expect(isolated.evidence.criticalPath.onCriticalPath).toBe(false);
    expect(isolated.scores.criticalPath).toBe(0);
    // The chain itself is unaffected.
    expect(row(r, "a").scores.criticalPath).toBe(1);
  });

  test("cyclic subgraph → hasCycle:true + longest acyclic sub-chain, no crash", () => {
    const r = scoreActivities(
      sg(
        [act("a"), act("b"), act("c")],
        [
          ["a", "b"],
          ["b", "c"],
          ["c", "a"],
        ],
      ),
    );
    expect(r.meta.hasCycle).toBe(true);
    // Longest acyclic sub-chain is 3 nodes (e.g. a->b->c).
    expect(r.rows[0]!.evidence.criticalPath.criticalPathLength).toBe(3);
  });

  test("30-deep linear fixture → truncated:true, truncationReason depth_cap, scored against the depth-20 partial", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `n${String(i).padStart(2, "0")}`);
    const chain: Array<[string, string]> = ids.slice(0, -1).map((id, i) => [id, ids[i + 1]!]);
    const r = scoreActivities(sg(ids.map((id) => act(id)), chain));
    expect(r.meta.truncated).toBe(true);
    expect(r.meta.truncationReason).toBe("depth_cap");
    // Scored against the longest partial found (20 nodes).
    expect(row(r, "n00").evidence.criticalPath.criticalPathLength).toBe(20);
    expect(row(r, "n00").scores.criticalPath).toBe(1);
  });
});

describe("key-activity-score handoff density (AC-04, FR-04, DD-02)", () => {
  test("disjoint-role + disjoint-system boundary activity scores higher than an all-shared one", () => {
    // boundary sits between neighbours with disjoint roles AND systems;
    // shared's neighbours share both.
    const r = scoreActivities(
      sg(
        [
          act("boundary", { roleIds: ["r1"], systemIds: ["s1"] }),
          act("left", { roleIds: ["r2"], systemIds: ["s2"] }),
          act("right", { roleIds: ["r3"], systemIds: ["s3"] }),
          act("shared", { roleIds: ["r9"], systemIds: ["s9"] }),
          act("sharedNext", { roleIds: ["r9"], systemIds: ["s9"] }),
        ],
        [
          ["left", "boundary"],
          ["boundary", "right"],
          ["shared", "sharedNext"],
        ],
      ),
    );
    const b = row(r, "boundary");
    const s = row(r, "shared");
    expect(b.scores.handoff).toBeGreaterThan(s.scores.handoff);
    expect(b.evidence.handoff).toEqual({ handoffCount: 4, roleHandoffs: 2, systemHandoffs: 2 });
    expect(s.evidence.handoff).toEqual({ handoffCount: 0, roleHandoffs: 0, systemHandoffs: 0 });
  });

  test("activity with no PRECEDES neighbours → handoff 0", () => {
    const r = scoreActivities(
      sg(
        [act("island", { roleIds: ["r1"] }), act("a", { roleIds: ["r2"] }), act("b", { roleIds: ["r3"] })],
        [["a", "b"]],
      ),
    );
    expect(row(r, "island").scores.handoff).toBe(0);
    expect(row(r, "island").evidence.handoff.handoffCount).toBe(0);
  });

  test("Δ1 (T-17): a roleless activity between role-bearing neighbours counts NO role handoffs (FR-04 empty-set rule)", () => {
    // roleless has roleIds: [] — vacuously disjoint from everything, but
    // the FR-04 non-empty guard means it must count 0 role handoffs.
    // Systems are non-empty and disjoint on both edges → system handoffs
    // still count (regression guard on the genuine-disjoint boundary).
    const r = scoreActivities(
      sg(
        [
          act("left", { roleIds: ["r1"], systemIds: ["s1"] }),
          act("roleless", { roleIds: [], systemIds: ["s2"] }),
          act("right", { roleIds: ["r2"], systemIds: ["s3"] }),
        ],
        [
          ["left", "roleless"],
          ["roleless", "right"],
        ],
      ),
    );
    const roleless = row(r, "roleless");
    expect(roleless.evidence.handoff.roleHandoffs).toBe(0);
    expect(roleless.evidence.handoff.systemHandoffs).toBe(2);
    // The role-bearing neighbours also count no role handoff AGAINST the
    // roleless activity (the guard is symmetric — both sides non-empty).
    expect(row(r, "left").evidence.handoff.roleHandoffs).toBe(0);
    // Both sides non-empty and disjoint still counts.
    expect(row(r, "left").evidence.handoff.systemHandoffs).toBe(1);
  });

  test("Δ1 (T-17): a systemless activity between system-bearing neighbours counts NO system handoffs (FR-04 empty-set rule)", () => {
    const r = scoreActivities(
      sg(
        [
          act("left", { roleIds: ["r1"], systemIds: ["s1"] }),
          act("systemless", { roleIds: ["r2"], systemIds: [] }),
          act("right", { roleIds: ["r3"], systemIds: ["s2"] }),
        ],
        [
          ["left", "systemless"],
          ["systemless", "right"],
        ],
      ),
    );
    const systemless = row(r, "systemless");
    expect(systemless.evidence.handoff.systemHandoffs).toBe(0);
    expect(systemless.evidence.handoff.roleHandoffs).toBe(2);
    expect(row(r, "right").evidence.handoff.systemHandoffs).toBe(0);
    expect(row(r, "right").evidence.handoff.roleHandoffs).toBe(1);
  });

  test("mutual a↔b pair with disjoint roles → roleHandoffs = 1 each side, not 2 (cold-pass N-01)", () => {
    const r = scoreActivities(
      sg(
        [
          act("a", { roleIds: ["r1"], systemIds: ["s1"] }),
          act("b", { roleIds: ["r2"], systemIds: ["s1"] }),
        ],
        [
          ["a", "b"],
          ["b", "a"],
        ],
      ),
    );
    expect(row(r, "a").evidence.handoff.roleHandoffs).toBe(1);
    expect(row(r, "b").evidence.handoff.roleHandoffs).toBe(1);
    // Shared system → no system handoff.
    expect(row(r, "a").evidence.handoff.systemHandoffs).toBe(0);
  });
});

describe("key-activity-score composite + rank (AC-05, FR-05, DD-09, NFR-04)", () => {
  test("composite = Σ weighted sub-scores, ranked desc; meta.weights echoes {1,1,1}; no recommendation field", () => {
    const r = scoreActivities(
      sg(
        [
          act("a", { roleIds: ["r1"] }),
          act("hub", { roleIds: ["r2"] }),
          act("c", { roleIds: ["r3"] }),
        ],
        [
          ["a", "hub"],
          ["hub", "c"],
        ],
      ),
    );
    for (const x of r.rows) {
      expect(x.composite).toBeCloseTo(
        x.scores.centrality + x.scores.criticalPath + x.scores.handoff,
      );
    }
    for (let i = 1; i < r.rows.length; i++) {
      expect(r.rows[i - 1]!.composite).toBeGreaterThanOrEqual(r.rows[i]!.composite);
      expect(r.rows[i]!.rank).toBe(i + 1);
    }
    expect(r.rows[0]!.id).toBe("hub");
    expect(r.meta.weights).toEqual({ centrality: 1, criticalPath: 1, handoff: 1 });
    // Descriptive-only (XD-11/NFR-04): no recommendation/suggestion key
    // anywhere in the payload.
    const json = JSON.stringify(r);
    expect(json).not.toContain("recommend");
    expect(json).not.toContain("suggest");
  });

  test("ties break createdAt asc, then id asc — including equal/absent createdAt (pass-2 C-02)", () => {
    // Two isolated nodes: identical (all-zero) composites.
    const older = act("z-older", { createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = act("a-newer", { createdAt: "2026-06-01T00:00:00.000Z" });
    const r1 = scoreActivities(sg([newer, older], []));
    expect(r1.rows.map((x) => x.id)).toEqual(["z-older", "a-newer"]);

    // Equal createdAt (the "~" sentinel — absent on both) → id asc.
    const s1 = act("b", { createdAt: "~" });
    const s2 = act("a", { createdAt: "~" });
    const r2 = scoreActivities(sg([s1, s2], []));
    expect(r2.rows.map((x) => x.id)).toEqual(["a", "b"]);

    // Absent createdAt ("~" sorts last) loses to a dated node.
    const dated = act("zz", { createdAt: "2026-01-01T00:00:00.000Z" });
    const undated = act("aa", { createdAt: "~" });
    const r3 = scoreActivities(sg([undated, dated], []));
    expect(r3.rows.map((x) => x.id)).toEqual(["zz", "aa"]);
  });

  test("self-loop and duplicate PRECEDES inputs are filtered (design C-05)", () => {
    const r = scoreActivities(
      sg(
        [act("a"), act("b")],
        [
          ["a", "a"], // self-loop — dropped, no graphology throw
          ["a", "b"],
          ["a", "b"], // duplicate — collapsed
        ],
      ),
    );
    expect(r.rows).toHaveLength(2);
    expect(row(r, "a").evidence.centrality.outDegree).toBe(1);
    expect(row(r, "a").evidence.handoff.handoffCount).toBeGreaterThanOrEqual(0);
  });

  test("duplicate activity-id input collapses to one ranked row (final-review C-02)", () => {
    const first = act("dup", { name: "first-wins" });
    const second = act("dup", { name: "second-loses" });
    const r = scoreActivities(sg([first, second, act("other")], []));
    expect(r.rows.filter((x) => x.id === "dup")).toHaveLength(1);
    expect(row(r, "dup").name).toBe("first-wins");
    expect(r.meta.activityCount).toBe(2);
  });
});
