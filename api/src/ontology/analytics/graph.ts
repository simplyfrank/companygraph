/**
 * Graph analytics engine powered by graphology.
 *
 * Reads the full ontology graph from Neo4j, builds a graphology
 * Graph, and runs centrality / community / cycle-detection algorithms.
 * All results are plain JSON — safe to serialize to the PWA.
 */

import Graph from "graphology";
import betweennessCentrality from "graphology-metrics/centrality/betweenness";
import degreeCentrality from "graphology-metrics/centrality/degree";
import pagerank from "graphology-metrics/centrality/pagerank";
import louvain from "graphology-communities-louvain";
import { stronglyConnectedComponents } from "graphology-components";
import { getDriver } from "../../neo4j/driver";

// ── Types ───────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  label: string;      // Neo4j node label (e.g. "Activity")
  name: string;
  [key: string]: unknown;
}

export interface GraphEdge {
  id: string;          // `${from}→${to}:${type}`
  source: string;      // node id
  target: string;      // node id
  type: string;        // Neo4j relationship type (e.g. "FLOWS_TO")
}

export interface AnalyticsResult {
  nodeCount: number;
  edgeCount: number;
  density: number;
  cycles: string[][];          // node-id sequences
  sccs: string[][];            // strongly-connected components
  communities: { id: string; members: string[] }[];
  betweenness: { node: string; score: number }[];
  pagerank: { node: string; score: number }[];
  degree: { node: string; in: number; out: number }[];
  orphans: string[];           // nodes with zero degree
  bottlenecks: { node: string; score: number }[]; // top betweenness
}

// ── Neo4j fetch ───────────────────────────────────────────────────

const GRAPH_QUERY = `
  MATCH (n)
  WITH n, labels(n)[0] AS primaryLabel
  RETURN {
    id: n.id,
    label: primaryLabel,
    name: n.name,
    properties: properties(n)
  } AS node

  UNION ALL

  MATCH (a)-[r]->(b)
  RETURN {
    id: a.id + '->' + b.id + ':' + type(r),
    source: a.id,
    target: b.id,
    type: type(r)
  } AS edge
`;

export interface RawGraphRow {
  node?: GraphNode;
  edge?: GraphEdge;
}

export async function fetchGraphFromNeo4j(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const driver = getDriver();
  const session = driver.session();
  try {
    const result = await session.run(GRAPH_QUERY);
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const seenNodes = new Set<string>();

    for (const record of result.records) {
      const row = record.toObject() as RawGraphRow;
      if (row.node && !seenNodes.has(row.node.id)) {
        seenNodes.add(row.node.id);
        nodes.push(row.node);
      } else if (row.edge) {
        edges.push(row.edge);
      }
    }

    return { nodes, edges };
  } finally {
    await session.close();
  }
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

// ── Main analytics pipeline ───────────────────────────────────────

export async function runGraphAnalytics(): Promise<AnalyticsResult> {
  const { nodes, edges } = await fetchGraphFromNeo4j();
  const graph = buildGraphologyGraph(nodes, edges);

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
  const sccs = sccResult
    .filter((comp: string[]) => comp.length > 1);

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
    communities: Array.from(communityMap.entries()).map(([id, members]) => ({ id, members })),
    betweenness,
    pagerank: pagerankResult,
    degree: degreeResult,
    orphans,
    bottlenecks: betweenness.slice(0, 10),
  };
}
