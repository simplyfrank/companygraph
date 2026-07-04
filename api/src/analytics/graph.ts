/**
 * Graph analytics engine powered by graphology.
 *
 * RD-1 migration (cto-analytics design §4 DD-02, T-20): this is the
 * governed home of the graphology engine, migrated from
 * `api/src/ontology/analytics/graph.ts`. The one substantive change is the
 * Neo4j read: instead of calling `getDriver().session()` directly, it reads
 * the full graph through the shared read-only module
 * `api/src/neo4j/read-only-graph.ts` (`fetchGraph()`), so no module under
 * `api/src/analytics/` touches the driver directly (AC-11; guard test T-19).
 *
 * Reads the full ontology graph from Neo4j, builds a graphology Graph, and
 * runs centrality / community / cycle-detection algorithms. All results are
 * plain JSON — safe to serialize to the PWA.
 */

import Graph from "graphology";
import betweennessCentrality from "graphology-metrics/centrality/betweenness";
import pagerank from "graphology-metrics/centrality/pagerank";
import louvain from "graphology-communities-louvain";
import { stronglyConnectedComponents } from "graphology-components";
import { fetchGraph, type GraphNode, type GraphEdge } from "../neo4j/read-only-graph";

export type { GraphNode, GraphEdge };

export interface AnalyticsResult {
  nodeCount: number;
  edgeCount: number;
  density: number;
  cycles: string[][]; // node-id sequences
  sccs: string[][]; // strongly-connected components
  communities: { id: string; members: string[] }[];
  betweenness: { node: string; score: number }[];
  pagerank: { node: string; score: number }[];
  degree: { node: string; in: number; out: number }[];
  orphans: string[]; // nodes with zero degree
  bottlenecks: { node: string; score: number }[]; // top betweenness
}

// ── Graph build ─────────────────────────────────────────────────────

export function buildGraphologyGraph(nodes: GraphNode[], edges: GraphEdge[]): Graph {
  const graph = new Graph({ type: "directed", multi: false });

  for (const n of nodes) {
    if (!graph.hasNode(n.id)) {
      graph.addNode(n.id, {
        label: n.label,
        name: n.name,
      });
    }
  }

  for (const e of edges) {
    if (graph.hasNode(e.source) && graph.hasNode(e.target) && !graph.hasEdge(e.id)) {
      graph.addEdgeWithKey(e.id, e.source, e.target, {
        type: e.type,
      });
    }
  }

  return graph;
}

// ── Cycle detection (DFS) ─────────────────────────────────────────

function findCycles(graph: Graph, maxLength = 10): string[][] {
  const cycles: string[][] = [];

  function dfs(node: string, path: string[], pathSet: Set<string>): void {
    if (path.length > maxLength) return;

    graph.forEachOutboundNeighbor(node, (neighbor: string) => {
      if (pathSet.has(neighbor)) {
        // Found cycle — extract loop from path
        const idx = path.indexOf(neighbor);
        if (idx >= 0) {
          const cycle = path.slice(idx).concat(neighbor);
          if (cycle.length >= 3) {
            cycles.push(cycle);
          }
        }
        return;
      }

      path.push(neighbor);
      pathSet.add(neighbor);
      dfs(neighbor, path, pathSet);
      path.pop();
      pathSet.delete(neighbor);
    });
  }

  for (const node of graph.nodes()) {
    dfs(node, [node], new Set([node]));
  }

  // Deduplicate (same cycle, different rotation)
  const seen = new Set<string>();
  const unique: string[][] = [];
  for (const c of cycles) {
    const key = [...c].sort().join(",");
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(c);
    }
  }
  return unique;
}

// ── Orphan detection ──────────────────────────────────────────────

function findOrphans(graph: Graph): string[] {
  const orphans: string[] = [];
  for (const node of graph.nodes()) {
    if (graph.degree(node) === 0) {
      orphans.push(node);
    }
  }
  return orphans;
}

// ── Analytics pipeline (pure — operates on a built graph) ─────────

export function analyzeGraph(graph: Graph): AnalyticsResult {
  const nodeCount = graph.order;
  const edgeCount = graph.size;
  const density = nodeCount > 1 ? edgeCount / (nodeCount * (nodeCount - 1)) : 0;

  // Centrality algorithms
  const bc = betweennessCentrality(graph, { getEdgeWeight: null });
  const pr = pagerank(graph);

  // Communities (Louvain)
  const louvainResult = louvain(graph, { getEdgeWeight: null });
  const communityMap = new Map<string, string[]>();
  for (const [node, comm] of Object.entries(louvainResult)) {
    const list = communityMap.get(String(comm)) ?? [];
    list.push(node);
    communityMap.set(String(comm), list);
  }

  // Strongly connected components
  const sccResult = stronglyConnectedComponents(graph);
  const sccs = sccResult.filter((comp: string[]) => comp.length > 1);

  // Cycles
  const cycles = findCycles(graph);

  // Orphans
  const orphans = findOrphans(graph);

  // Format results
  const betweenness = Object.entries(bc)
    .map(([node, score]) => ({ node, score }))
    .sort((a, b) => b.score - a.score);

  const pagerankResult = Object.entries(pr)
    .map(([node, score]) => ({ node, score }))
    .sort((a, b) => b.score - a.score);

  const degreeResult = Array.from(graph.nodes()).map((node) => ({
    node,
    in: graph.inDegree(node),
    out: graph.outDegree(node),
  }));

  return {
    nodeCount,
    edgeCount,
    density,
    cycles,
    sccs,
    communities: Array.from(communityMap.entries()).map(([id, members]) => ({
      id,
      members,
    })),
    betweenness,
    pagerank: pagerankResult,
    degree: degreeResult,
    orphans,
    bottlenecks: betweenness.slice(0, 10),
  };
}

// ── Main analytics pipeline ───────────────────────────────────────

export async function runGraphAnalytics(): Promise<AnalyticsResult> {
  const { nodes, edges } = await fetchGraph();
  const graph = buildGraphologyGraph(nodes, edges);
  return analyzeGraph(graph);
}
