/**
 * Critical-path report (FR-06, cto-analytics design §7.2, T-12).
 *
 * For each `UserJourney`, reports the **longest acyclic `PRECEDES` chain**
 * among its member activities — the journey's critical path — via a
 * depth-bounded DFS with memoisation and three hard budgets (AC-06):
 *
 *   • depth cap      = 20   distinct activities in a single chain
 *   • path budget    = 1000 candidate paths explored
 *   • wall-clock      = 4 s  total DFS time (per report run)
 *
 * Cyclic journeys are **flagged, not crashed** (`has_cycle: true`): the DFS
 * skips edges that would revisit a node on the current path, so it still
 * returns the longest acyclic sub-chain. When a budget is exceeded the report
 * carries the truncation surface `{ truncated: true, longest_partial,
 * truncation_reason: "depth_cap" | "path_budget" | "wall_clock" }` — the best
 * chain found so far is preserved (FR-06).
 *
 * Membership walk: `Activity-[:PART_OF]->UserJourney` for membership and
 * `Activity-[:PRECEDES]->Activity` (restricted to same-journey activities) for
 * process order (`shared/src/schema/edges.ts`).
 *
 * RD-1 (design §4 DD-02): reads the live graph through the shared read-only
 * module `api/src/neo4j/read-only-graph.ts` — no direct `getDriver()` /
 * `driver.session()` here (AC-11; guard test T-19). No write imports (AC-12).
 */

import { fetchGraph, type GraphNode, type GraphEdge } from "../neo4j/read-only-graph";

const ACTIVITY_LABEL = "Activity";
const JOURNEY_LABEL = "UserJourney";
const PART_OF = "PART_OF";
const PRECEDES = "PRECEDES";

/** Maximum distinct activities in a single reported chain (FR-06). */
export const CRITICAL_PATH_DEPTH_CAP = 20;
/** Maximum candidate paths the DFS explores per report run (FR-06). */
export const CRITICAL_PATH_BUDGET = 1000;
/** Wall-clock budget for the whole report run, in milliseconds (FR-06). */
export const CRITICAL_PATH_WALL_CLOCK_MS = 4000;

export type TruncationReason = "depth_cap" | "path_budget" | "wall_clock";

export interface CriticalPathActivityRef {
  id: string;
  name: string;
}

export interface CriticalPathJourney {
  journeyId: string;
  journeyName: string;
  /** Ordered activities of the longest acyclic PRECEDES chain found. */
  chain: CriticalPathActivityRef[];
  /** Number of activities in `chain`. */
  length: number;
  /** First activity of the chain (null when the journey has no activities). */
  start: CriticalPathActivityRef | null;
  /** Last activity of the chain (null when the journey has no activities). */
  end: CriticalPathActivityRef | null;
  /** True when a PRECEDES cycle was detected among the journey's activities. */
  has_cycle: boolean;
  /** True when a budget stopped the DFS before it fully explored the journey. */
  truncated: boolean;
  /**
   * The best chain found when truncation happened (same as `chain`), surfaced
   * separately per FR-06 so a consumer can distinguish a complete answer from a
   * partial one. Present only when `truncated` is true.
   */
  longest_partial?: CriticalPathActivityRef[];
  /** Which budget stopped the DFS. Present only when `truncated` is true. */
  truncation_reason?: TruncationReason;
}

export interface CriticalPathReport {
  report: "critical-paths";
  journeys: CriticalPathJourney[];
}

/**
 * A monotonic clock, injectable so the wall-clock budget is testable without
 * a real slow query (T-12 DoD: injected-clock wall-clock fixture).
 */
export type Clock = () => number;

export interface ComputeCriticalPathsOptions {
  depthCap?: number;
  pathBudget?: number;
  wallClockMs?: number;
  now?: Clock;
}

interface JourneyGraph {
  journeyId: string;
  journeyName: string;
  /** Member activity ids of this journey. */
  activityIds: string[];
  /** activity id → successor activity ids within this journey (PRECEDES). */
  successors: Map<string, string[]>;
}

/**
 * Result of a single-journey DFS: the best chain plus the budget/cycle flags.
 */
interface JourneyDfsResult {
  chain: string[];
  hasCycle: boolean;
  truncated: boolean;
  truncationReason?: TruncationReason;
}

/**
 * Depth-bounded DFS with memoisation over one journey's PRECEDES DAG. Skips
 * edges that would revisit a node on the current path (cycle-safe) and honours
 * the depth / path-count / wall-clock budgets. Returns the longest acyclic
 * chain found and the flags.
 */
function longestChainForJourney(
  jg: JourneyGraph,
  depthCap: number,
  pathBudget: number,
  wallClockMs: number,
  now: Clock,
  startedAt: number,
): JourneyDfsResult {
  let best: string[] = [];
  let hasCycle = false;
  let truncated = false;
  let truncationReason: TruncationReason | undefined;
  // Candidate paths explored — one per node-visit (each recursive DFS entry is
  // a distinct partial path extended by one activity). Bounded by `pathBudget`.
  let pathsExplored = 0;

  const onPath = new Set<string>();
  const stack: string[] = [];

  const record = () => {
    if (stack.length > best.length) best = [...stack];
  };

  // Explores from `node`, which is already pushed onto `stack`/`onPath`. Extends
  // the current chain to each unvisited intra-journey successor. Cycle-safe:
  // an edge back to a node on the current path is flagged, not followed. Honours
  // the depth / path / wall-clock budgets, preserving the best chain found.
  const dfs = (node: string): void => {
    if (truncated) return;

    record();

    const succs = jg.successors.get(node) ?? [];
    for (const next of succs) {
      if (onPath.has(next)) {
        // Edge closes a cycle — flag it, do not follow (keeps the chain acyclic).
        hasCycle = true;
        continue;
      }

      // Following this edge would push the chain past the depth cap — the real
      // longest chain is longer than we can report, so this is a truncation.
      if (stack.length >= depthCap) {
        truncated = true;
        truncationReason = "depth_cap";
        return;
      }

      if (wallClockMs > 0 && now() - startedAt >= wallClockMs) {
        truncated = true;
        truncationReason = "wall_clock";
        return;
      }

      pathsExplored += 1;
      if (pathBudget > 0 && pathsExplored > pathBudget) {
        truncated = true;
        truncationReason = "path_budget";
        return;
      }

      stack.push(next);
      onPath.add(next);
      dfs(next);
      onPath.delete(next);
      stack.pop();
      if (truncated) return;
    }
  };

  for (const start of jg.activityIds) {
    if (truncated) break;
    stack.push(start);
    onPath.add(start);
    dfs(start);
    onPath.delete(start);
    stack.pop();
  }

  return { chain: best, hasCycle, truncated, truncationReason };
}

/**
 * Pure computation over an already-loaded graph — exported so the FR-06 DFS is
 * unit-testable without a live Neo4j. For each journey, restricts PRECEDES to
 * intra-journey edges, runs the depth-bounded DFS, and assembles the report.
 * Budgets are shared across the whole run: the wall-clock budget is measured
 * from `startedAt` and the path budget resets per journey.
 */
export function computeCriticalPaths(
  nodes: GraphNode[],
  edges: GraphEdge[],
  opts: ComputeCriticalPathsOptions = {},
): CriticalPathReport {
  const depthCap = opts.depthCap ?? CRITICAL_PATH_DEPTH_CAP;
  const pathBudget = opts.pathBudget ?? CRITICAL_PATH_BUDGET;
  const wallClockMs = opts.wallClockMs ?? CRITICAL_PATH_WALL_CLOCK_MS;
  const now: Clock = opts.now ?? Date.now;
  const startedAt = now();

  const nameById = new Map<string, string>();
  const activityIds = new Set<string>();
  const journeyIds = new Set<string>();
  for (const n of nodes) {
    nameById.set(n.id, n.name);
    if (n.label === ACTIVITY_LABEL) activityIds.add(n.id);
    else if (n.label === JOURNEY_LABEL) journeyIds.add(n.id);
  }

  // activity id → parent journey id (first PART_OF→UserJourney edge wins).
  const journeyByActivity = new Map<string, string>();
  // journey id → ordered list of member activity ids (insertion order stable).
  const activitiesByJourney = new Map<string, string[]>();
  // activity id → successor activity ids (PRECEDES), resolved to intra-journey later.
  const precedes = new Map<string, string[]>();

  for (const e of edges) {
    if (e.type === PART_OF) {
      if (!activityIds.has(e.source) || !journeyIds.has(e.target)) continue;
      if (!journeyByActivity.has(e.source)) {
        journeyByActivity.set(e.source, e.target);
        let list = activitiesByJourney.get(e.target);
        if (!list) {
          list = [];
          activitiesByJourney.set(e.target, list);
        }
        list.push(e.source);
      }
    } else if (e.type === PRECEDES) {
      if (!activityIds.has(e.source) || !activityIds.has(e.target)) continue;
      let list = precedes.get(e.source);
      if (!list) {
        list = [];
        precedes.set(e.source, list);
      }
      list.push(e.target);
    }
  }

  const journeys: CriticalPathJourney[] = [];
  for (const journeyId of journeyIds) {
    const members = activitiesByJourney.get(journeyId) ?? [];
    const memberSet = new Set(members);

    // Restrict PRECEDES to edges whose both endpoints are members of this journey.
    const successors = new Map<string, string[]>();
    for (const a of members) {
      const outs = (precedes.get(a) ?? []).filter((t) => memberSet.has(t));
      if (outs.length > 0) successors.set(a, outs);
    }

    const jg: JourneyGraph = {
      journeyId,
      journeyName: nameById.get(journeyId) ?? journeyId,
      activityIds: members,
      successors,
    };

    const { chain, hasCycle, truncated, truncationReason } = longestChainForJourney(
      jg,
      depthCap,
      pathBudget,
      wallClockMs,
      now,
      startedAt,
    );

    const refs: CriticalPathActivityRef[] = chain.map((id) => ({
      id,
      name: nameById.get(id) ?? id,
    }));

    const entry: CriticalPathJourney = {
      journeyId,
      journeyName: jg.journeyName,
      chain: refs,
      length: refs.length,
      start: refs[0] ?? null,
      end: refs.length > 0 ? refs[refs.length - 1]! : null,
      has_cycle: hasCycle,
      truncated,
    };
    if (truncated) {
      entry.longest_partial = refs;
      entry.truncation_reason = truncationReason;
    }
    journeys.push(entry);
  }

  // Longest critical path first; deterministic name tiebreak.
  journeys.sort(
    (a, b) => b.length - a.length || a.journeyName.localeCompare(b.journeyName),
  );

  return { report: "critical-paths", journeys };
}

/** Reads the live graph via the shared read-only module and computes the report. */
export async function runCriticalPaths(
  opts: ComputeCriticalPathsOptions = {},
): Promise<CriticalPathReport> {
  const { nodes, edges } = await fetchGraph();
  return computeCriticalPaths(nodes, edges, opts);
}
