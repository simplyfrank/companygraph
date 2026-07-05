// key-activity-optimizer T-03 (design §4.1, §4.3, §4.4, DD-01, DD-03) —
// the PURE, Neo4j-free scoring module. `scoreActivities(subgraph)` takes
// a plain model-scoped read-shape (no Driver, no session — DD-01,
// mirroring story-spec's story-derive.ts) and computes the three
// sub-scores (betweenness centrality, critical-path position, handoff
// density), the composite, and the 1-based rank. All math is
// deterministic (NFR-04) and unit-testable against fixtures with no
// Neo4j (AC-02..AC-05).
//
// Descriptive-only (XD-11, NFR-04): the output carries NO
// recommendation/suggestion field. Do not add one.

import betweennessCentrality from "graphology-metrics/centrality/betweenness";
import { buildGraphologyGraph, type GraphNode, type GraphEdge } from "../analytics/graph";
import type { ActivityScoreRow, KeyActivityScores } from "@companygraph/shared/schema/key-activity";

// ---------------------------------------------------------------------------
// Input shapes (design §4.1) — plain, Neo4j-free
// ---------------------------------------------------------------------------

export interface ScoreActivity {
  id: string;
  name: string;
  // Plain comparable string; a node missing createdAt arrives as the
  // "~" sentinel from the read layer (sorts last — pass-2 C-02).
  createdAt: string;
  journeyId: string | null;
  journeyName: string | null;
  roleIds: string[]; // via EXECUTES (Role→Activity) — shared nodes, unfiltered (DD-02)
  systemIds: string[]; // via USES_SYSTEM (Activity→System) — shared nodes, unfiltered (DD-02)
}

// PRECEDES, both endpoints in the scoped Activity set (DD-02)
export interface ScoreEdge {
  fromId: string;
  toId: string;
}

export interface ScoreSubgraph {
  activities: ScoreActivity[];
  precedes: ScoreEdge[];
  weights: { centrality: number; criticalPath: number; handoff: number };
}

export type ScoreMeta = KeyActivityScores["meta"];
export type TruncationReason = NonNullable<ScoreMeta["truncationReason"]>;

// FR-03 budgets — the cto-analytics FR-06 contract (design §4.3, OQ-1
// recorded default): depth 20 nodes / 1000 candidate paths / 4 s wall.
const DEPTH_CAP = 20;
const PATH_BUDGET = 1000;
const WALL_CLOCK_MS = 4000;

// DD-09 — composite weights are code-default constants (OQ-2 default).
export const DEFAULT_WEIGHTS = { centrality: 1.0, criticalPath: 1.0, handoff: 1.0 } as const;

// ---------------------------------------------------------------------------
// Critical path — depth-bounded, budgeted DFS (FR-03)
// ---------------------------------------------------------------------------

interface CriticalPathResult {
  criticalPathLength: number; // node count of the longest acyclic chain (0 when no chain)
  onCriticalPath: Set<string>;
  longestThrough: Map<string, number>; // node -> longest acyclic chain (node count) through it
  hasCycle: boolean;
  truncated: boolean;
  truncationReason: TruncationReason | undefined;
}

function computeCriticalPath(ids: string[], edges: ScoreEdge[]): CriticalPathResult {
  const out = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const id of ids) {
    out.set(id, []);
    inDegree.set(id, 0);
  }
  for (const e of edges) {
    out.get(e.fromId)!.push(e.toId);
    inDegree.set(e.toId, (inDegree.get(e.toId) ?? 0) + 1);
  }
  // Deterministic traversal order (NFR-04).
  for (const succ of out.values()) succ.sort();

  let sources = ids.filter((id) => (inDegree.get(id) ?? 0) === 0);
  if (sources.length === 0) sources = [...ids].sort();

  const longestThrough = new Map<string, number>();
  let best: string[] = [];
  let hasCycle = false;
  let truncated = false;
  let truncationReason: TruncationReason | undefined;
  let pathCount = 0;
  let stopped = false;
  const startedAt = Date.now();

  const recordPath = (path: string[]): void => {
    // pathCount is the DFS budget, not a chain count — incremented
    // unconditionally (Δ2, T-18).
    pathCount += 1;
    // Δ2 (T-18, FR-03, req-review N-03): a chain requires ≥ 2 nodes, so
    // only paths of ≥ 2 nodes contribute to best/longestThrough. An
    // isolated activity (no intra-scope PRECEDES edges) keeps
    // longestChainDepth 0 → criticalPath 0, even in a model that does
    // have a critical path — consistent with the best.length >= 2 rule
    // on criticalPathLength below.
    if (path.length < 2) return;
    if (path.length > best.length) best = [...path];
    for (const n of path) {
      if ((longestThrough.get(n) ?? 0) < path.length) longestThrough.set(n, path.length);
    }
  };

  const truncate = (reason: TruncationReason): void => {
    truncated = true;
    if (truncationReason === undefined) truncationReason = reason;
  };

  const dfs = (node: string, path: string[], onPath: Set<string>): void => {
    if (stopped) return;
    if (Date.now() - startedAt > WALL_CLOCK_MS) {
      truncate("wall_clock");
      stopped = true;
      recordPath(path);
      return;
    }
    if (path.length >= DEPTH_CAP) {
      truncate("depth_cap");
      recordPath(path);
      return;
    }
    let extended = false;
    for (const succ of out.get(node) ?? []) {
      if (onPath.has(succ)) {
        // Visited-set per path skips cycles — no crash (AC-03).
        hasCycle = true;
        continue;
      }
      extended = true;
      path.push(succ);
      onPath.add(succ);
      dfs(succ, path, onPath);
      path.pop();
      onPath.delete(succ);
      if (stopped) return;
      if (pathCount >= PATH_BUDGET) {
        truncate("path_budget");
        stopped = true;
        return;
      }
    }
    if (!extended) recordPath(path);
  };

  for (const src of sources) {
    if (stopped) break;
    dfs(src, [src], new Set([src]));
  }
  // Cover nodes no source-rooted path reached (e.g. a cycle-only
  // component alongside real sources) so every node gets a depth and a
  // cycle is never silently missed.
  for (const id of [...ids].sort()) {
    if (stopped) break;
    if (!longestThrough.has(id)) dfs(id, [id], new Set([id]));
  }

  // A "chain" needs at least one edge: best.length < 2 → no chain at
  // all → criticalPathLength 0 and every criticalPath sub-score 0.
  const criticalPathLength = best.length >= 2 ? best.length : 0;
  return {
    criticalPathLength,
    onCriticalPath: new Set(criticalPathLength > 0 ? best : []),
    longestThrough,
    hasCycle,
    truncated,
    truncationReason,
  };
}

// ---------------------------------------------------------------------------
// scoreActivities — the pure entry point (DD-01)
// ---------------------------------------------------------------------------

function disjoint(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(a);
  return !b.some((x) => set.has(x));
}

export function scoreActivities(sg: ScoreSubgraph): {
  rows: ActivityScoreRow[];
  meta: ScoreMeta;
} {
  // Defensive input guards:
  // (a) de-dupe activities by id — FIRST occurrence wins — before any
  //     math (final-review C-02), so a duplicate-id input collapses to
  //     one ranked row regardless of what the read layer fed in.
  const activities: ScoreActivity[] = [];
  const seenIds = new Set<string>();
  for (const a of sg.activities) {
    if (seenIds.has(a.id)) continue;
    seenIds.add(a.id);
    activities.push(a);
  }
  // (b) filter self-loops and de-dupe (fromId, toId) pairs, and drop
  //     edges whose endpoints are not in the activity set (design C-05)
  //     — the SAME edge set feeds centrality, critical path and handoff
  //     so the neighbour sets cannot diverge.
  const edges: ScoreEdge[] = [];
  const seenEdges = new Set<string>();
  for (const e of sg.precedes) {
    if (e.fromId === e.toId) continue;
    if (!seenIds.has(e.fromId) || !seenIds.has(e.toId)) continue;
    const k = `${e.fromId}->${e.toId}`;
    if (seenEdges.has(k)) continue;
    seenEdges.add(k);
    edges.push(e);
  }

  // ── Centrality (FR-02, DD-03): betweenness over the PRECEDES graph ──
  // Reuses the governed graphology engine's builder (analytics/graph.ts,
  // {type:"directed", multi:false}) — createdAt deliberately NOT carried
  // into the graph (it is only a rank-tiebreak input).
  const graphNodes: GraphNode[] = activities.map((a) => ({
    id: a.id,
    label: "Activity",
    name: a.name,
  }));
  const graphEdges: GraphEdge[] = edges.map((e) => ({
    id: `${e.fromId}->${e.toId}:PRECEDES`,
    source: e.fromId,
    target: e.toId,
    type: "PRECEDES",
  }));
  const graph = buildGraphologyGraph(graphNodes, graphEdges);
  const bc: Record<string, number> =
    graph.order > 0 ? betweennessCentrality(graph, { getEdgeWeight: null }) : {};
  const maxBetweenness = Math.max(0, ...Object.values(bc));

  // ── Critical path (FR-03): depth-bounded, budgeted DFS ──
  const cp = computeCriticalPath(
    activities.map((a) => a.id),
    edges,
  );

  // ── Handoff density (FR-04, DD-02): distinct PRECEDES neighbours ──
  // Mutual-pair pin (cold-pass N-01): a↔b gives b ONE slot in a's
  // neighbour set (a Set of ids), so it counts once per disjoint
  // dimension, never twice.
  const neighbors = new Map<string, Set<string>>();
  for (const a of activities) neighbors.set(a.id, new Set());
  for (const e of edges) {
    neighbors.get(e.fromId)!.add(e.toId);
    neighbors.get(e.toId)!.add(e.fromId);
  }
  const byId = new Map(activities.map((a) => [a.id, a]));
  const handoffRaw = new Map<string, { handoffCount: number; roleHandoffs: number; systemHandoffs: number }>();
  for (const a of activities) {
    let roleHandoffs = 0;
    let systemHandoffs = 0;
    for (const nId of neighbors.get(a.id)!) {
      const n = byId.get(nId);
      if (!n) continue;
      // Δ1 (T-17, FR-04, requirements C-03): a handoff counts iff BOTH
      // sides' sets are non-empty AND disjoint — guarded at the counting
      // site, not inside disjoint() (whose vacuous-truth semantics stay
      // correct for genuinely non-empty inputs). Empty sets are vacuously
      // disjoint from everything; counting them would rank an
      // under-modeled activity spuriously high — the opposite of
      // trustworthy evidence (XD-11).
      if (a.roleIds.length > 0 && n.roleIds.length > 0 && disjoint(a.roleIds, n.roleIds))
        roleHandoffs += 1;
      if (a.systemIds.length > 0 && n.systemIds.length > 0 && disjoint(a.systemIds, n.systemIds))
        systemHandoffs += 1;
    }
    handoffRaw.set(a.id, {
      handoffCount: roleHandoffs + systemHandoffs,
      roleHandoffs,
      systemHandoffs,
    });
  }
  const maxHandoff = Math.max(0, ...[...handoffRaw.values()].map((h) => h.handoffCount));

  // ── Composite + rank (FR-05, DD-09) ──
  const weights = sg.weights;
  const unranked = activities.map((a) => {
    const rawB = bc[a.id] ?? 0;
    // all-zero → all 0 (guards ≤1-activity / no-edge subgraphs, FR-02).
    const centrality = maxBetweenness > 0 ? rawB / maxBetweenness : 0;

    const depth = cp.longestThrough.get(a.id) ?? 0;
    const criticalPath =
      cp.criticalPathLength === 0
        ? 0
        : cp.onCriticalPath.has(a.id)
          ? 1
          : Math.min(1, depth / cp.criticalPathLength);

    const h = handoffRaw.get(a.id)!;
    const handoff = maxHandoff > 0 ? h.handoffCount / maxHandoff : 0;

    const composite =
      weights.centrality * centrality + weights.criticalPath * criticalPath + weights.handoff * handoff;

    return {
      activity: a,
      composite,
      scores: { centrality, criticalPath, handoff },
      evidence: {
        centrality: {
          betweenness: rawB,
          inDegree: graph.hasNode(a.id) ? graph.inDegree(a.id) : 0,
          outDegree: graph.hasNode(a.id) ? graph.outDegree(a.id) : 0,
        },
        criticalPath: {
          onCriticalPath: cp.onCriticalPath.has(a.id),
          longestChainDepth: depth,
          criticalPathLength: cp.criticalPathLength,
        },
        handoff: h,
      },
    };
  });

  // Rank: composite DESC; tie → createdAt asc (plain string compare —
  // the "~" sentinel sorts last), then id asc — the TOTAL fallback
  // (pass-2 C-02, NFR-04).
  unranked.sort((x, y) => {
    if (y.composite !== x.composite) return y.composite - x.composite;
    if (x.activity.createdAt !== y.activity.createdAt)
      return x.activity.createdAt < y.activity.createdAt ? -1 : 1;
    return x.activity.id < y.activity.id ? -1 : 1;
  });

  const rows: ActivityScoreRow[] = unranked.map((u, i) => ({
    id: u.activity.id,
    name: u.activity.name,
    journeyId: u.activity.journeyId,
    journeyName: u.activity.journeyName,
    rank: i + 1,
    composite: u.composite,
    scores: u.scores,
    evidence: u.evidence,
    key: null,
  }));

  const meta: ScoreMeta = {
    activityCount: rows.length,
    hasCycle: cp.hasCycle,
    ...(cp.truncated ? { truncated: true, truncationReason: cp.truncationReason } : {}),
    weights: { ...weights },
  };

  return { rows, meta };
}
