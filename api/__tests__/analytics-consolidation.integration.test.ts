import { afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import {
  computeConsolidation,
  runConsolidation,
  CONSOLIDATION_MIN_SYSTEMS,
  type ConsolidationReport,
} from "../src/analytics/consolidation";
import type { GraphNode, GraphEdge } from "../src/neo4j/read-only-graph";

// AC-03 (cto-analytics FR-03, T-09) — consolidation candidates are activities
// that touch ≥ 2 distinct System nodes via USES_SYSTEM, sorted by distinct-
// system count DESC, each carrying its systems + parent journey + a deep-link
// target (the activity id).
//
// Two layers:
//   1. Pure `computeConsolidation` over a fixture — no Neo4j needed. This is
//      the load-bearing AC-03 assertion (the DESC sort + ≥2 filter + journey
//      attachment) and runs in every environment.
//   2. `runConsolidation()` against a live, seeded Neo4j (RD-1: reads via the
//      shared read-only module). Env-dependent — needs `bun run dev` + a seed
//      loaded; assert the invariants hold on real data.

// ── Fixture: pure-function coverage (always runs) ──────────────────────────

// a1 uses s1,s2,s3 (3 systems) in journey j1; a2 uses s1,s2 (2) in j1;
// a3 uses only s1 (1 → excluded); a4 uses s2,s3 (2) with no journey.
const NODES: GraphNode[] = [
  { id: "j1", label: "UserJourney", name: "Checkout" },
  { id: "a1", label: "Activity", name: "Capture payment" },
  { id: "a2", label: "Activity", name: "Reserve stock" },
  { id: "a3", label: "Activity", name: "Print receipt" },
  { id: "a4", label: "Activity", name: "Sync ledger" },
  { id: "s1", label: "System", name: "POS" },
  { id: "s2", label: "System", name: "OMS" },
  { id: "s3", label: "System", name: "WMS" },
];
const EDGES: GraphEdge[] = [
  { id: "a1->s1:USES_SYSTEM", source: "a1", target: "s1", type: "USES_SYSTEM" },
  { id: "a1->s2:USES_SYSTEM", source: "a1", target: "s2", type: "USES_SYSTEM" },
  { id: "a1->s3:USES_SYSTEM", source: "a1", target: "s3", type: "USES_SYSTEM" },
  { id: "a2->s1:USES_SYSTEM", source: "a2", target: "s1", type: "USES_SYSTEM" },
  { id: "a2->s2:USES_SYSTEM", source: "a2", target: "s2", type: "USES_SYSTEM" },
  { id: "a3->s1:USES_SYSTEM", source: "a3", target: "s1", type: "USES_SYSTEM" },
  { id: "a4->s2:USES_SYSTEM", source: "a4", target: "s2", type: "USES_SYSTEM" },
  { id: "a4->s3:USES_SYSTEM", source: "a4", target: "s3", type: "USES_SYSTEM" },
  { id: "a1->j1:PART_OF", source: "a1", target: "j1", type: "PART_OF" },
  { id: "a2->j1:PART_OF", source: "a2", target: "j1", type: "PART_OF" },
];

describe("AC-03 computeConsolidation — pure FR-03 report", () => {
  test("keeps only activities with ≥ 2 distinct systems", () => {
    const { candidates } = computeConsolidation(NODES, EDGES);
    // a3 (1 system) is excluded; a1/a2/a4 remain.
    expect(candidates.map((c) => c.activityId).sort()).toEqual(["a1", "a2", "a4"]);
    expect(candidates.every((c) => c.systemCount >= CONSOLIDATION_MIN_SYSTEMS)).toBe(true);
  });

  test("sorts by distinct-system count DESC (the AC-03 sort)", () => {
    const { candidates } = computeConsolidation(NODES, EDGES);
    const counts = candidates.map((c) => c.systemCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    // a1 (3 systems) is first.
    expect(candidates[0]!.activityId).toBe("a1");
    expect(candidates[0]!.systemCount).toBe(3);
  });

  test("attaches the parent journey and distinct systems", () => {
    const { candidates } = computeConsolidation(NODES, EDGES);
    const a1 = candidates.find((c) => c.activityId === "a1")!;
    expect(a1.journey).toEqual({ id: "j1", name: "Checkout" });
    expect(a1.systems.map((s) => s.name)).toEqual(["OMS", "POS", "WMS"]);
    // a4 has no PART_OF journey → null (still a candidate).
    const a4 = candidates.find((c) => c.activityId === "a4")!;
    expect(a4.journey).toBeNull();
  });

  test("de-duplicates repeated USES_SYSTEM edges to distinct systems", () => {
    const dupEdges: GraphEdge[] = [
      ...EDGES,
      { id: "a2->s1:USES_SYSTEM#2", source: "a2", target: "s1", type: "USES_SYSTEM" },
    ];
    const { candidates } = computeConsolidation(NODES, dupEdges);
    const a2 = candidates.find((c) => c.activityId === "a2")!;
    expect(a2.systemCount).toBe(2); // still 2 distinct, not 3
  });

  test("empty graph yields no candidates", () => {
    expect(computeConsolidation([], [])).toEqual({
      report: "consolidation",
      candidates: [],
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

maybe("AC-03 runConsolidation — live graph (RD-1 read-only module)", () => {
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("report holds the FR-03 invariants against seeded data", async () => {
    const report: ConsolidationReport = await runConsolidation();
    expect(report.report).toBe("consolidation");
    // Every candidate has ≥ 2 distinct systems.
    expect(report.candidates.every((c) => c.systemCount >= CONSOLIDATION_MIN_SYSTEMS)).toBe(true);
    // systems array length matches the reported count and is distinct.
    for (const c of report.candidates) {
      const ids = new Set(c.systems.map((s) => s.id));
      expect(ids.size).toBe(c.systemCount);
    }
    // Sorted DESC by system count.
    const counts = report.candidates.map((c) => c.systemCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });
});
