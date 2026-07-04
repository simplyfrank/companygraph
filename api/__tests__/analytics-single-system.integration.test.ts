import { afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import {
  computeSingleSystem,
  runSingleSystem,
  SINGLE_SYSTEM_DISTINCT_COUNT,
  type SingleSystemReport,
} from "../src/analytics/single-system";
import type { GraphNode, GraphEdge } from "../src/neo4j/read-only-graph";

// AC-05 (cto-analytics FR-05, T-11) — the single-system journey report
// enumerates journeys whose member activities touch exactly one distinct
// System (`count(DISTINCT system across all activities) = 1`), each carrying
// its bound system and a deep-link target (the journey id).
//
// Two layers:
//   1. Pure `computeSingleSystem` over a fixture — no Neo4j needed. This is
//      the load-bearing AC-05 assertion (the "= 1 distinct system" filter, the
//      journey→system walk, and the DESC-by-activity-count sort). Runs in
//      every environment.
//   2. `runSingleSystem()` against a live, seeded Neo4j (RD-1: reads via the
//      shared read-only module). Env-dependent — needs `bun run dev` + a seed;
//      asserts the invariants hold on real data.

// ── Fixture: pure-function coverage (always runs) ──────────────────────────
//
// j1 (Returns): a1 uses s1; a2 uses s1  → 1 distinct system (s1) → candidate
//                                          (2 activities on s1).
// j2 (Checkout): a3 uses s1; a4 uses s2 → 2 distinct systems → NOT a candidate.
// j3 (Restock): a5 uses s3               → 1 distinct system (s3) → candidate
//                                          (1 activity on s3).
// j4 (Onboarding): a6 uses no system     → 0 distinct systems → NOT a candidate.
const NODES: GraphNode[] = [
  { id: "j1", label: "UserJourney", name: "Returns" },
  { id: "j2", label: "UserJourney", name: "Checkout" },
  { id: "j3", label: "UserJourney", name: "Restock" },
  { id: "j4", label: "UserJourney", name: "Onboarding" },
  { id: "a1", label: "Activity", name: "Scan return" },
  { id: "a2", label: "Activity", name: "Refund" },
  { id: "a3", label: "Activity", name: "Capture payment" },
  { id: "a4", label: "Activity", name: "Reserve stock" },
  { id: "a5", label: "Activity", name: "Reorder" },
  { id: "a6", label: "Activity", name: "Greet" },
  { id: "s1", label: "System", name: "POS" },
  { id: "s2", label: "System", name: "OMS" },
  { id: "s3", label: "System", name: "WMS" },
];
const EDGES: GraphEdge[] = [
  { id: "a1->j1:PART_OF", source: "a1", target: "j1", type: "PART_OF" },
  { id: "a2->j1:PART_OF", source: "a2", target: "j1", type: "PART_OF" },
  { id: "a3->j2:PART_OF", source: "a3", target: "j2", type: "PART_OF" },
  { id: "a4->j2:PART_OF", source: "a4", target: "j2", type: "PART_OF" },
  { id: "a5->j3:PART_OF", source: "a5", target: "j3", type: "PART_OF" },
  { id: "a6->j4:PART_OF", source: "a6", target: "j4", type: "PART_OF" },
  { id: "a1->s1:USES_SYSTEM", source: "a1", target: "s1", type: "USES_SYSTEM" },
  { id: "a2->s1:USES_SYSTEM", source: "a2", target: "s1", type: "USES_SYSTEM" },
  { id: "a3->s1:USES_SYSTEM", source: "a3", target: "s1", type: "USES_SYSTEM" },
  { id: "a4->s2:USES_SYSTEM", source: "a4", target: "s2", type: "USES_SYSTEM" },
  { id: "a5->s3:USES_SYSTEM", source: "a5", target: "s3", type: "USES_SYSTEM" },
];

describe("AC-05 computeSingleSystem — pure FR-05 report", () => {
  test("keeps only journeys with exactly one distinct system", () => {
    const { journeys } = computeSingleSystem(NODES, EDGES);
    // j1 (s1) + j3 (s3) qualify; j2 (2 systems) + j4 (0 systems) excluded.
    expect(journeys.map((c) => c.journeyId).sort()).toEqual(["j1", "j3"]);
    expect(journeys.every((c) => c.system !== null)).toBe(true);
  });

  test("binds the single system to each journey", () => {
    const { journeys } = computeSingleSystem(NODES, EDGES);
    const j1 = journeys.find((c) => c.journeyId === "j1")!;
    expect(j1.system).toEqual({ id: "s1", name: "POS" });
    const j3 = journeys.find((c) => c.journeyId === "j3")!;
    expect(j3.system).toEqual({ id: "s3", name: "WMS" });
  });

  test("sorts by activity-use count DESC (busiest first)", () => {
    const { journeys } = computeSingleSystem(NODES, EDGES);
    const counts = journeys.map((c) => c.activityCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    // j1 has 2 activities on s1; j3 has 1 → j1 first.
    expect(journeys[0]!.journeyId).toBe("j1");
    expect(journeys[0]!.activityCount).toBe(2);
  });

  test("a journey using two distinct systems is excluded", () => {
    const { journeys } = computeSingleSystem(NODES, EDGES);
    expect(journeys.find((c) => c.journeyId === "j2")).toBeUndefined();
  });

  test("a journey whose activities use no system is excluded", () => {
    const { journeys } = computeSingleSystem(NODES, EDGES);
    expect(journeys.find((c) => c.journeyId === "j4")).toBeUndefined();
  });

  test("empty graph yields no journeys", () => {
    expect(computeSingleSystem([], [])).toEqual({
      report: "single-system-journeys",
      journeys: [],
    });
  });
});

// ── Live Neo4j coverage (env-dependent) ────────────────────────────────────
//
// Runs against whatever is currently seeded. Skips gracefully when Neo4j is
// unreachable so the unit suite stays green without a live stack; the manual
// repro below covers the wired endpoint.

const LIVE = process.env.RUN_NEO4J_INTEGRATION === "1";
const maybe = LIVE ? describe : describe.skip;

maybe("AC-05 runSingleSystem — live graph (RD-1 read-only module)", () => {
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("report holds the FR-05 invariants against seeded data", async () => {
    const report: SingleSystemReport = await runSingleSystem();
    expect(report.report).toBe("single-system-journeys");
    // Every listed journey resolves to exactly one bound system, and its
    // activity-use count is positive (at least one activity uses that system).
    for (const j of report.journeys) {
      expect(j.system.id).toBeTruthy();
      expect(j.activityCount).toBeGreaterThanOrEqual(1);
    }
    // Sorted DESC by activity-use count.
    const counts = report.journeys.map((c) => c.activityCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    // Sanity on the distinct-count constant used by the filter.
    expect(SINGLE_SYSTEM_DISTINCT_COUNT).toBe(1);
  });
});
