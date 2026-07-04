// T-20 (cto-analytics, FR-01 + RD-1) — unit coverage for the migrated
// graphology engine + system-map metrics + the shared read-only reader's
// pure partition. No live Neo4j: exercises the pure functions the async
// readers delegate to. The endpoint envelope + no-direct-driver guard land
// in T-19; a live curl of `/api/v1/analytics/systems` is the T-20 manual repro.

import { describe, test, expect } from "bun:test";
import {
  partitionGraphRows,
  type RawGraphRow,
  type GraphNode,
  type GraphEdge,
} from "../src/neo4j/read-only-graph";
import { buildGraphologyGraph, analyzeGraph } from "../src/analytics/graph";
import { computeSystemMap } from "../src/analytics/system-map";

// A tiny fixture: 3 systems (s1↔s2, s2→s3 integrations), 1 activity using s1.
const NODES: GraphNode[] = [
  { id: "s1", label: "System", name: "POS" },
  { id: "s2", label: "System", name: "OMS" },
  { id: "s3", label: "System", name: "WMS" },
  { id: "a1", label: "Activity", name: "Checkout" },
];
const EDGES: GraphEdge[] = [
  { id: "s1->s2:INTEGRATES_WITH", source: "s1", target: "s2", type: "INTEGRATES_WITH" },
  { id: "s2->s3:INTEGRATES_WITH", source: "s2", target: "s3", type: "INTEGRATES_WITH" },
  { id: "a1->s1:USES_SYSTEM", source: "a1", target: "s1", type: "USES_SYSTEM" },
];

describe("read-only-graph — partitionGraphRows (RD-1)", () => {
  test("splits node/edge rows and deduplicates nodes by id", () => {
    const rows: RawGraphRow[] = [
      { node: NODES[0] },
      { node: NODES[0] }, // duplicate id — dropped
      { node: NODES[1] },
      { edge: EDGES[0] },
    ];
    const { nodes, edges } = partitionGraphRows(rows);
    expect(nodes.map((n) => n.id)).toEqual(["s1", "s2"]);
    expect(edges).toHaveLength(1);
  });

  test("empty input yields empty partitions", () => {
    expect(partitionGraphRows([])).toEqual({ nodes: [], edges: [] });
  });
});

describe("analytics/graph — migrated engine builds + analyzes without a driver", () => {
  test("buildGraphologyGraph preserves node + edge counts", () => {
    const g = buildGraphologyGraph(NODES, EDGES);
    expect(g.order).toBe(4);
    expect(g.size).toBe(3);
  });

  test("analyzeGraph reports counts, density, degree and orphans", () => {
    const g = buildGraphologyGraph(NODES, EDGES);
    const result = analyzeGraph(g);
    expect(result.nodeCount).toBe(4);
    expect(result.edgeCount).toBe(3);
    expect(result.density).toBeGreaterThan(0);
    // no zero-degree node in this fixture
    expect(result.orphans).toEqual([]);
    // s2 sits on both integrations → highest incident degree among systems
    const s2 = result.degree.find((d) => d.node === "s2");
    expect(s2).toBeDefined();
    expect((s2!.in ?? 0) + (s2!.out ?? 0)).toBe(2);
  });
});

describe("analytics/system-map — computeSystemMap (FR-01)", () => {
  test("emits one entry per System with integration count + degree", () => {
    const { systems, integrations } = computeSystemMap(NODES, EDGES);
    expect(systems.map((s) => s.id).sort()).toEqual(["s1", "s2", "s3"]);
    // s2 is on two integrations → most-integrated, sorted first
    expect(systems[0].id).toBe("s2");
    expect(systems[0].integrationCount).toBe(2);
    // s1: 1 integration + 1 USES_SYSTEM edge → degree 2, integrationCount 1
    const s1 = systems.find((s) => s.id === "s1")!;
    expect(s1.integrationCount).toBe(1);
    expect(s1.degree).toBe(2);
    // only System→System INTEGRATES_WITH edges surface on the map
    expect(integrations).toHaveLength(2);
    expect(integrations.every((e) => e.type === "INTEGRATES_WITH")).toBe(true);
  });

  test("non-System nodes never appear as map systems", () => {
    const { systems } = computeSystemMap(NODES, EDGES);
    expect(systems.some((s) => s.id === "a1")).toBe(false);
  });

  test("a graph with no systems yields an empty map", () => {
    const { systems, integrations } = computeSystemMap(
      [{ id: "a1", label: "Activity", name: "Checkout" }],
      [],
    );
    expect(systems).toEqual([]);
    expect(integrations).toEqual([]);
  });
});
