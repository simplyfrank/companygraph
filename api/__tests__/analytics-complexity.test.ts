import { afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import {
  computeComplexity,
  runComplexity,
  DEFAULT_COMPLEXITY_WEIGHTS,
  COMPLEXITY_DEPTH_CAP,
  type ComplexityReport,
} from "../src/analytics/complexity";
import type { GraphNode, GraphEdge } from "../src/neo4j/read-only-graph";

// AC-04 (cto-analytics FR-04, T-10) — the canonical weighted complexity score
// `depth × distinct-systems × distinct-roles` (RD-2), with code-default
// weights (all 1.0, RD-6 §10.2). This is the load-bearing server-side
// assertion for the formula, the intra-journey longest-acyclic-PRECEDES-chain
// depth walk, and the distinct-systems / distinct-roles counts. The PWA
// hover/long-press popover is covered by
// `pwa/src/__tests__/analytics-complexity.test.tsx`.

// ── Fixture: pure-function coverage (always runs) ──────────────────────────
//
// j1 (Checkout): a1→a2→a3 PRECEDES chain (depth 3). a1 uses s1; a2 uses s2;
//   a3 uses s1 → 2 distinct systems. r1 executes a1; r2 executes a2 → 2 roles.
//   score = 3 × 2 × 2 = 12.
// j2 (Returns): a4 alone (depth 1). a4 uses s1 → 1 system. r1 executes a4 →
//   1 role. score = 1 × 1 × 1 = 1.
// j3 (Greet): a5 alone (depth 1). a5 uses no system (0). no role (0).
//   score = 1 × 0 × 0 = 0.
const NODES: GraphNode[] = [
  { id: "j1", label: "UserJourney", name: "Checkout" },
  { id: "j2", label: "UserJourney", name: "Returns" },
  { id: "j3", label: "UserJourney", name: "Greet" },
  { id: "a1", label: "Activity", name: "Scan" },
  { id: "a2", label: "Activity", name: "Pay" },
  { id: "a3", label: "Activity", name: "Receipt" },
  { id: "a4", label: "Activity", name: "Refund" },
  { id: "a5", label: "Activity", name: "Welcome" },
  { id: "s1", label: "System", name: "POS" },
  { id: "s2", label: "System", name: "OMS" },
  { id: "r1", label: "Role", name: "Cashier" },
  { id: "r2", label: "Role", name: "Clerk" },
];
const EDGES: GraphEdge[] = [
  { id: "a1->j1:PART_OF", source: "a1", target: "j1", type: "PART_OF" },
  { id: "a2->j1:PART_OF", source: "a2", target: "j1", type: "PART_OF" },
  { id: "a3->j1:PART_OF", source: "a3", target: "j1", type: "PART_OF" },
  { id: "a4->j2:PART_OF", source: "a4", target: "j2", type: "PART_OF" },
  { id: "a5->j3:PART_OF", source: "a5", target: "j3", type: "PART_OF" },
  { id: "a1->a2:PRECEDES", source: "a1", target: "a2", type: "PRECEDES" },
  { id: "a2->a3:PRECEDES", source: "a2", target: "a3", type: "PRECEDES" },
  { id: "a1->s1:USES_SYSTEM", source: "a1", target: "s1", type: "USES_SYSTEM" },
  { id: "a2->s2:USES_SYSTEM", source: "a2", target: "s2", type: "USES_SYSTEM" },
  { id: "a3->s1:USES_SYSTEM", source: "a3", target: "s1", type: "USES_SYSTEM" },
  { id: "a4->s1:USES_SYSTEM", source: "a4", target: "s1", type: "USES_SYSTEM" },
  { id: "r1->a1:EXECUTES", source: "r1", target: "a1", type: "EXECUTES" },
  { id: "r2->a2:EXECUTES", source: "r2", target: "a2", type: "EXECUTES" },
  { id: "r1->a4:EXECUTES", source: "r1", target: "a4", type: "EXECUTES" },
];

describe("AC-04 computeComplexity — canonical weighted score", () => {
  test("score = depth × distinct-systems × distinct-roles with default weights", () => {
    const { journeys } = computeComplexity(NODES, EDGES);
    const j1 = journeys.find((j) => j.journeyId === "j1")!;
    expect(j1.subScores).toEqual({ depth: 3, distinctSystems: 2, distinctRoles: 2 });
    expect(j1.score).toBe(12);

    const j2 = journeys.find((j) => j.journeyId === "j2")!;
    expect(j2.subScores).toEqual({ depth: 1, distinctSystems: 1, distinctRoles: 1 });
    expect(j2.score).toBe(1);
  });

  test("a journey missing a factor scores 0 but still appears with its sub-scores", () => {
    const { journeys } = computeComplexity(NODES, EDGES);
    const j3 = journeys.find((j) => j.journeyId === "j3")!;
    expect(j3.subScores).toEqual({ depth: 1, distinctSystems: 0, distinctRoles: 0 });
    expect(j3.score).toBe(0);
  });

  test("depth is the longest acyclic PRECEDES chain among the journey's activities", () => {
    const { journeys } = computeComplexity(NODES, EDGES);
    // a1→a2→a3 is a 3-activity chain.
    expect(journeys.find((j) => j.journeyId === "j1")!.subScores.depth).toBe(3);
  });

  test("distinct systems and roles de-duplicate repeated edges", () => {
    // j1's a1 + a3 both use s1 → s1 counted once (2 distinct: s1, s2).
    const { journeys } = computeComplexity(NODES, EDGES);
    expect(journeys.find((j) => j.journeyId === "j1")!.subScores.distinctSystems).toBe(2);
  });

  test("results sort by score DESC with a deterministic name tiebreak", () => {
    const { journeys } = computeComplexity(NODES, EDGES);
    const scores = journeys.map((j) => j.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(journeys[0]!.journeyId).toBe("j1"); // 12 is the highest
  });

  test("the report carries the weights it was computed with", () => {
    const { weights } = computeComplexity(NODES, EDGES);
    expect(weights).toEqual(DEFAULT_COMPLEXITY_WEIGHTS);
    expect(weights).toEqual({ depth_weight: 1.0, system_weight: 1.0, role_weight: 1.0 });
  });

  test("custom weights re-scale each factor", () => {
    const { journeys } = computeComplexity(NODES, EDGES, {
      depth_weight: 2.0,
      system_weight: 1.0,
      role_weight: 1.0,
    });
    // j1: (3·2) × (2·1) × (2·1) = 6 × 2 × 2 = 24.
    expect(journeys.find((j) => j.journeyId === "j1")!.score).toBe(24);
  });

  test("PRECEDES edges that cross journey boundaries do not inflate depth", () => {
    // Add a cross-journey PRECEDES a3(j1)→a4(j2): must NOT extend j1's chain.
    const crossEdges: GraphEdge[] = [
      ...EDGES,
      { id: "a3->a4:PRECEDES", source: "a3", target: "a4", type: "PRECEDES" },
    ];
    const { journeys } = computeComplexity(NODES, crossEdges);
    expect(journeys.find((j) => j.journeyId === "j1")!.subScores.depth).toBe(3);
    expect(journeys.find((j) => j.journeyId === "j2")!.subScores.depth).toBe(1);
  });

  test("a PRECEDES cycle is handled (finite depth, no infinite loop)", () => {
    // a1→a2→a3→a1 forms a cycle within j1. The acyclic-chain depth is 3.
    const cyclicEdges: GraphEdge[] = [
      ...EDGES,
      { id: "a3->a1:PRECEDES", source: "a3", target: "a1", type: "PRECEDES" },
    ];
    const { journeys } = computeComplexity(NODES, cyclicEdges);
    const j1 = journeys.find((j) => j.journeyId === "j1")!;
    expect(j1.subScores.depth).toBe(3);
    expect(Number.isFinite(j1.score)).toBe(true);
  });

  test("empty graph yields no journeys but a well-formed report", () => {
    expect(computeComplexity([], [])).toEqual({
      report: "complexity",
      weights: DEFAULT_COMPLEXITY_WEIGHTS,
      journeys: [],
    });
  });

  test("depth cap bounds a pathological deep chain", () => {
    // A single journey with a chain longer than the cap: depth is capped.
    const nodes: GraphNode[] = [{ id: "jx", label: "UserJourney", name: "Deep" }];
    const edges: GraphEdge[] = [];
    const n = COMPLEXITY_DEPTH_CAP + 10;
    for (let i = 0; i < n; i++) {
      nodes.push({ id: `x${i}`, label: "Activity", name: `x${i}` });
      edges.push({ id: `x${i}->jx:PART_OF`, source: `x${i}`, target: "jx", type: "PART_OF" });
      if (i > 0) {
        edges.push({ id: `x${i - 1}->x${i}:PRECEDES`, source: `x${i - 1}`, target: `x${i}`, type: "PRECEDES" });
      }
    }
    const { journeys } = computeComplexity(nodes, edges);
    expect(journeys[0]!.subScores.depth).toBe(COMPLEXITY_DEPTH_CAP);
  });
});

// ── Live Neo4j coverage (env-dependent) ────────────────────────────────────
//
// Runs against whatever is currently seeded. Skips gracefully when Neo4j is
// unreachable so the unit suite stays green without a live stack.

const LIVE = process.env.RUN_NEO4J_INTEGRATION === "1";
const maybe = LIVE ? describe : describe.skip;

maybe("AC-04 runComplexity — live graph (RD-1 read-only module)", () => {
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("report holds the FR-04 invariants against seeded data", async () => {
    const report: ComplexityReport = await runComplexity();
    expect(report.report).toBe("complexity");
    expect(report.weights).toEqual(DEFAULT_COMPLEXITY_WEIGHTS);
    for (const j of report.journeys) {
      // score is the product of the three (weighted, all 1.0) sub-scores.
      const { depth, distinctSystems, distinctRoles } = j.subScores;
      expect(j.score).toBe(depth * distinctSystems * distinctRoles);
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    // Sorted DESC by score.
    const scores = report.journeys.map((j) => j.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});
