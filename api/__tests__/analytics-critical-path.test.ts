import { describe, expect, test } from "bun:test";
import {
  computeCriticalPaths,
  CRITICAL_PATH_DEPTH_CAP,
  CRITICAL_PATH_BUDGET,
  type ComputeCriticalPathsOptions,
} from "../src/analytics/critical-path";
import type { GraphNode, GraphEdge } from "../src/neo4j/read-only-graph";

// AC-06 (cto-analytics FR-06, T-12) — the critical-path report finds the
// longest acyclic PRECEDES chain per journey with three hard budgets
// (depth cap 20, path budget 1000, wall-clock 4 s) and flags cyclic journeys
// without crashing.
//
// All assertions run against the pure `computeCriticalPaths` — no Neo4j. The
// wall-clock budget is exercised with an injected clock, per the T-12 DoD.

// ── Helpers to build fixtures ───────────────────────────────────────────────

function journeyNode(id: string, name = id): GraphNode {
  return { id, label: "UserJourney", name };
}
function activityNode(id: string, name = id): GraphNode {
  return { id, label: "Activity", name };
}
function partOf(activityId: string, journeyId: string): GraphEdge {
  return {
    id: `${activityId}->${journeyId}:PART_OF`,
    source: activityId,
    target: journeyId,
    type: "PART_OF",
  };
}
function precedes(a: string, b: string): GraphEdge {
  return { id: `${a}->${b}:PRECEDES`, source: a, target: b, type: "PRECEDES" };
}

/** A linear PRECEDES chain a0→a1→…→a(n-1) inside one journey. */
function linearJourney(journeyId: string, n: number): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [journeyNode(journeyId)];
  const edges: GraphEdge[] = [];
  for (let i = 0; i < n; i++) {
    const a = `${journeyId}_a${i}`;
    nodes.push(activityNode(a));
    edges.push(partOf(a, journeyId));
    if (i > 0) edges.push(precedes(`${journeyId}_a${i - 1}`, a));
  }
  return { nodes, edges };
}

// ── Happy path: longest acyclic chain, start/end, length ────────────────────

describe("AC-06 computeCriticalPaths — longest acyclic chain", () => {
  test("reports the longest chain, its length, start and end", () => {
    // j1: a0→a1→a2→a3 (length 4). A shorter side branch a0→b1 must lose.
    const { nodes, edges } = linearJourney("j1", 4);
    edges.push(precedes("j1_a0", "j1_b1"));
    nodes.push(activityNode("j1_b1"));
    edges.push(partOf("j1_b1", "j1"));

    const { journeys } = computeCriticalPaths(nodes, edges);
    expect(journeys).toHaveLength(1);
    const j = journeys[0]!;
    expect(j.length).toBe(4);
    expect(j.chain.map((c) => c.id)).toEqual(["j1_a0", "j1_a1", "j1_a2", "j1_a3"]);
    expect(j.start!.id).toBe("j1_a0");
    expect(j.end!.id).toBe("j1_a3");
    expect(j.has_cycle).toBe(false);
    expect(j.truncated).toBe(false);
    expect(j.truncation_reason).toBeUndefined();
  });

  test("PRECEDES edges that leave the journey are ignored", () => {
    // a0→a1 inside j1; a1→x1 where x1 belongs to j2. The chain stays intra-j1.
    const nodes: GraphNode[] = [
      journeyNode("j1"),
      journeyNode("j2"),
      activityNode("a0"),
      activityNode("a1"),
      activityNode("x1"),
    ];
    const edges: GraphEdge[] = [
      partOf("a0", "j1"),
      partOf("a1", "j1"),
      partOf("x1", "j2"),
      precedes("a0", "a1"),
      precedes("a1", "x1"), // cross-journey — must not extend j1's chain
    ];
    const j1 = computeCriticalPaths(nodes, edges).journeys.find((j) => j.journeyId === "j1")!;
    expect(j1.length).toBe(2);
    expect(j1.chain.map((c) => c.id)).toEqual(["a0", "a1"]);
  });

  test("sorts journeys by chain length DESC", () => {
    const a = linearJourney("short", 2);
    const b = linearJourney("long", 5);
    const { journeys } = computeCriticalPaths(
      [...a.nodes, ...b.nodes],
      [...a.edges, ...b.edges],
    );
    expect(journeys.map((j) => j.journeyId)).toEqual(["long", "short"]);
  });
});

// ── (a) Cyclic journey → flagged, not crashed ───────────────────────────────

describe("AC-06(a) cyclic journey", () => {
  test("flags has_cycle and still reports the longest acyclic sub-chain", () => {
    // a0→a1→a2→a0 (a 3-cycle) plus a2→a3 tail. Longest acyclic chain: a0,a1,a2,a3.
    const nodes: GraphNode[] = [
      journeyNode("jc"),
      activityNode("a0"),
      activityNode("a1"),
      activityNode("a2"),
      activityNode("a3"),
    ];
    const edges: GraphEdge[] = [
      partOf("a0", "jc"),
      partOf("a1", "jc"),
      partOf("a2", "jc"),
      partOf("a3", "jc"),
      precedes("a0", "a1"),
      precedes("a1", "a2"),
      precedes("a2", "a0"), // back-edge → cycle
      precedes("a2", "a3"),
    ];
    const j = computeCriticalPaths(nodes, edges).journeys[0]!;
    expect(j.has_cycle).toBe(true);
    // Not crashed — a real acyclic chain of length 4 is reported.
    expect(j.length).toBe(4);
    expect(j.chain.map((c) => c.id)).toEqual(["a0", "a1", "a2", "a3"]);
    // A cycle alone is not a budget truncation.
    expect(j.truncated).toBe(false);
    expect(j.truncation_reason).toBeUndefined();
  });
});

// ── (b) 30-deep linear journey → depth_cap truncation at 20 ──────────────────

describe("AC-06(b) depth cap", () => {
  test("a 30-deep chain truncates with truncation_reason depth_cap at 20", () => {
    const { nodes, edges } = linearJourney("deep", 30);
    const j = computeCriticalPaths(nodes, edges).journeys[0]!;
    expect(j.truncated).toBe(true);
    expect(j.truncation_reason).toBe("depth_cap");
    expect(j.longest_partial).toBeDefined();
    expect(j.longest_partial!.length).toBe(CRITICAL_PATH_DEPTH_CAP);
    expect(j.length).toBe(CRITICAL_PATH_DEPTH_CAP);
  });

  test("a chain at the cap length is not truncated", () => {
    const { nodes, edges } = linearJourney("atcap", CRITICAL_PATH_DEPTH_CAP);
    const j = computeCriticalPaths(nodes, edges).journeys[0]!;
    expect(j.truncated).toBe(false);
    expect(j.length).toBe(CRITICAL_PATH_DEPTH_CAP);
  });
});

// ── (c) high fan-out branching → path_budget truncation ──────────────────────

describe("AC-06(c) path budget", () => {
  test("a wide branching journey truncates with truncation_reason path_budget", () => {
    // A layered DAG: each of L layers has W nodes fully connected to the next
    // layer. The number of candidate paths explored explodes far past 1000
    // while staying shallow (depth < 20), so path_budget fires before depth_cap.
    const L = 8;
    const W = 6;
    const nodes: GraphNode[] = [journeyNode("fan")];
    const edges: GraphEdge[] = [];
    const layer = (l: number, w: number) => `fan_l${l}_w${w}`;
    for (let l = 0; l < L; l++) {
      for (let w = 0; w < W; w++) {
        const id = layer(l, w);
        nodes.push(activityNode(id));
        edges.push(partOf(id, "fan"));
        if (l > 0) {
          for (let pw = 0; pw < W; pw++) edges.push(precedes(layer(l - 1, pw), id));
        }
      }
    }
    const j = computeCriticalPaths(nodes, edges).journeys[0]!;
    expect(j.truncated).toBe(true);
    expect(j.truncation_reason).toBe("path_budget");
    expect(j.longest_partial).toBeDefined();
    // Best-so-far chain is preserved and stays within the depth cap.
    expect(j.longest_partial!.length).toBeGreaterThan(0);
    expect(j.longest_partial!.length).toBeLessThanOrEqual(CRITICAL_PATH_DEPTH_CAP);
  });

  test("a modest journey stays under the path budget", () => {
    const { nodes, edges } = linearJourney("modest", 5);
    const j = computeCriticalPaths(nodes, edges).journeys[0]!;
    expect(j.truncated).toBe(false);
    expect(CRITICAL_PATH_BUDGET).toBe(1000);
  });
});

// ── (d) injected-clock wall-clock truncation ─────────────────────────────────

describe("AC-06(d) wall-clock budget (injected clock)", () => {
  test("a slow clock truncates with truncation_reason wall_clock", () => {
    // Injected clock: first call is the start time; every subsequent call jumps
    // 1000 ms, so by the second DFS step the 4 s budget (here overridden to
    // 100 ms) is exceeded — no real slow query needed.
    let t = 0;
    const now = () => {
      const v = t;
      t += 1000;
      return v;
    };
    const opts: ComputeCriticalPathsOptions = { wallClockMs: 100, now };
    const { nodes, edges } = linearJourney("slow", 10);
    const j = computeCriticalPaths(nodes, edges, opts).journeys[0]!;
    expect(j.truncated).toBe(true);
    expect(j.truncation_reason).toBe("wall_clock");
    expect(j.longest_partial).toBeDefined();
  });

  test("a fast clock (budget not exceeded) does not truncate", () => {
    // Clock never advances → wall-clock budget never trips.
    const now = () => 0;
    const opts: ComputeCriticalPathsOptions = { wallClockMs: 100, now };
    const { nodes, edges } = linearJourney("fast", 5);
    const j = computeCriticalPaths(nodes, edges, opts).journeys[0]!;
    expect(j.truncated).toBe(false);
    expect(j.truncation_reason).toBeUndefined();
    expect(j.length).toBe(5);
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe("computeCriticalPaths — edge cases", () => {
  test("empty graph yields no journeys", () => {
    expect(computeCriticalPaths([], [])).toEqual({ report: "critical-paths", journeys: [] });
  });

  test("a journey with a single activity has a length-1 chain", () => {
    const nodes = [journeyNode("solo"), activityNode("only")];
    const edges = [partOf("only", "solo")];
    const j = computeCriticalPaths(nodes, edges).journeys[0]!;
    expect(j.length).toBe(1);
    expect(j.start!.id).toBe("only");
    expect(j.end!.id).toBe("only");
    expect(j.has_cycle).toBe(false);
  });

  test("a journey with no activities reports an empty chain", () => {
    const nodes = [journeyNode("empty")];
    const j = computeCriticalPaths(nodes, []).journeys[0]!;
    expect(j.length).toBe(0);
    expect(j.start).toBeNull();
    expect(j.end).toBeNull();
  });
});
