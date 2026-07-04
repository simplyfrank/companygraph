/**
 * Complexity-scoring engine (FR-04, cto-analytics design §7.2, T-10).
 *
 * Computes the **canonical weighted complexity score** per `UserJourney`
 * (RD-2 — replaces the interim DD-04 proxy `activities + fanOut + fanIn`):
 *
 *   score = (depth · depth_weight)
 *         × (distinctSystems · system_weight)
 *         × (distinctRoles · role_weight)
 *
 * where, for a journey's member activities (`Activity-[:PART_OF]->UserJourney`):
 *   • depth           = length of the longest acyclic `PRECEDES` chain among
 *                       those activities (measured in activities),
 *   • distinctSystems = count of distinct `System` nodes the activities touch
 *                       via `USES_SYSTEM`,
 *   • distinctRoles   = count of distinct `Role` nodes that `EXECUTES` those
 *                       activities.
 *
 * Weights are the **code-default constants** served by T-14's scaffold
 * (`ANALYTICS_COMPLEXITY_WEIGHTS`, all `1.0`) — the runtime-tunable
 * `analytics_settings` subsystem is deferred with FR-11 to
 * `cto-analytics-reporting` (design §10.2, RD-6). So this module depends on no
 * deferred task.
 *
 * The three sub-scores are returned alongside the total so the PWA (T-10's
 * `Complexity.tsx`) can reveal the formula + component values on hover /
 * long-press (AC-04).
 *
 * RD-1 (design §4 DD-02): reads the live graph through the shared read-only
 * module `api/src/neo4j/read-only-graph.ts` — no direct `getDriver()` /
 * `driver.session()` here (AC-11; guard test T-19). No write imports (AC-12).
 */

import { fetchGraph, type GraphNode, type GraphEdge } from "../neo4j/read-only-graph";
import { ANALYTICS_COMPLEXITY_WEIGHTS } from "./routes";

const ACTIVITY_LABEL = "Activity";
const SYSTEM_LABEL = "System";
const ROLE_LABEL = "Role";
const JOURNEY_LABEL = "UserJourney";
const PART_OF = "PART_OF";
const PRECEDES = "PRECEDES";
const USES_SYSTEM = "USES_SYSTEM";
const EXECUTES = "EXECUTES";

/**
 * Depth cap for the longest-acyclic-`PRECEDES`-chain walk — mirrors the FR-06
 * critical-path cap so a pathological cyclic/deep journey cannot blow the
 * stack. Well above any realistic journey length.
 */
export const COMPLEXITY_DEPTH_CAP = 20;

/** Weights applied to each sub-score before multiplication (RD-2, code-default). */
export interface ComplexityWeights {
  depth_weight: number;
  system_weight: number;
  role_weight: number;
}

/** The default weights (all `1.0`) — the code-default constant per RD-6 §10.2. */
export const DEFAULT_COMPLEXITY_WEIGHTS: ComplexityWeights = {
  depth_weight: ANALYTICS_COMPLEXITY_WEIGHTS.depth_weight,
  system_weight: ANALYTICS_COMPLEXITY_WEIGHTS.system_weight,
  role_weight: ANALYTICS_COMPLEXITY_WEIGHTS.role_weight,
};

export interface ComplexitySubScores {
  /** Longest acyclic PRECEDES chain length among the journey's activities. */
  depth: number;
  /** Distinct System nodes the journey's activities use (USES_SYSTEM). */
  distinctSystems: number;
  /** Distinct Role nodes that EXECUTES the journey's activities. */
  distinctRoles: number;
}

export interface ComplexityJourney {
  journeyId: string;
  journeyName: string;
  /** Number of member activities (context, not a scoring factor). */
  activities: number;
  /** The three FR-04 sub-scores, surfaced for the hover/long-press popover. */
  subScores: ComplexitySubScores;
  /** The canonical weighted score: `depth·dw × systems·sw × roles·rw`. */
  score: number;
}

export interface ComplexityReport {
  report: "complexity";
  /** The weights the scores were computed with (for the hover formula + reproducibility). */
  weights: ComplexityWeights;
  journeys: ComplexityJourney[];
}

// ── Longest acyclic PRECEDES chain (intra-journey), depth-capped ────────────
//
// Cycle-safe DFS: an edge back onto the current path is skipped (not followed),
// so a cyclic journey still yields a finite longest acyclic chain. Bounded by
// COMPLEXITY_DEPTH_CAP so a deep/branchy journey cannot run away.

function longestChainLength(
  activityIds: Set<string>,
  successors: Map<string, string[]>,
  depthCap: number,
): number {
  let best = 0;
  const onPath = new Set<string>();

  const dfs = (node: string, depth: number): void => {
    if (depth > best) best = depth;
    if (depth >= depthCap) return;
    const succs = successors.get(node) ?? [];
    for (const next of succs) {
      if (onPath.has(next)) continue; // cycle edge — skip, keep chain acyclic
      onPath.add(next);
      dfs(next, depth + 1);
      onPath.delete(next);
    }
  };

  for (const id of activityIds) {
    onPath.clear();
    onPath.add(id);
    dfs(id, 1);
  }
  return best;
}

/**
 * Pure computation over an already-loaded graph — exported so the FR-04 logic
 * is unit-testable without a live Neo4j. Builds, per journey:
 *   • the longest acyclic PRECEDES chain length (depth),
 *   • the distinct USES_SYSTEM systems, and
 *   • the distinct EXECUTES roles,
 * then multiplies the three weighted sub-scores into the canonical score.
 *
 * A journey with zero of any factor scores `0` for that factor, so its product
 * is `0` — it still appears in the report (with its sub-scores) rather than
 * being dropped, so the operator sees "trivial" journeys too.
 */
export function computeComplexity(
  nodes: GraphNode[],
  edges: GraphEdge[],
  weights: ComplexityWeights = DEFAULT_COMPLEXITY_WEIGHTS,
): ComplexityReport {
  const nameById = new Map<string, string>();
  const activityIds = new Set<string>();
  const systemIds = new Set<string>();
  const roleIds = new Set<string>();
  const journeyIds = new Set<string>();
  for (const n of nodes) {
    nameById.set(n.id, n.name);
    if (n.label === ACTIVITY_LABEL) activityIds.add(n.id);
    else if (n.label === SYSTEM_LABEL) systemIds.add(n.id);
    else if (n.label === ROLE_LABEL) roleIds.add(n.id);
    else if (n.label === JOURNEY_LABEL) journeyIds.add(n.id);
  }

  // activity id → parent journey id (first PART_OF→UserJourney edge wins).
  const journeyByActivity = new Map<string, string>();
  // activity id → set of distinct system ids it uses.
  const systemsByActivity = new Map<string, Set<string>>();
  // activity id → set of distinct role ids that execute it.
  const rolesByActivity = new Map<string, Set<string>>();
  // activity id → successor activity ids within the same journey (PRECEDES).
  const precedesRaw: Array<[string, string]> = [];

  for (const e of edges) {
    if (e.type === PART_OF) {
      if (!activityIds.has(e.source) || !journeyIds.has(e.target)) continue;
      if (!journeyByActivity.has(e.source)) journeyByActivity.set(e.source, e.target);
    } else if (e.type === USES_SYSTEM) {
      if (!activityIds.has(e.source) || !systemIds.has(e.target)) continue;
      let set = systemsByActivity.get(e.source);
      if (!set) {
        set = new Set<string>();
        systemsByActivity.set(e.source, set);
      }
      set.add(e.target);
    } else if (e.type === EXECUTES) {
      // Role -[:EXECUTES]-> Activity (schema direction).
      if (!roleIds.has(e.source) || !activityIds.has(e.target)) continue;
      let set = rolesByActivity.get(e.target);
      if (!set) {
        set = new Set<string>();
        rolesByActivity.set(e.target, set);
      }
      set.add(e.source);
    } else if (e.type === PRECEDES) {
      if (!activityIds.has(e.source) || !activityIds.has(e.target)) continue;
      precedesRaw.push([e.source, e.target]);
    }
  }

  // Group activities by journey.
  const activitiesByJourney = new Map<string, Set<string>>();
  for (const [activityId, journeyId] of journeyByActivity) {
    let set = activitiesByJourney.get(journeyId);
    if (!set) {
      set = new Set<string>();
      activitiesByJourney.set(journeyId, set);
    }
    set.add(activityId);
  }

  const journeys: ComplexityJourney[] = [];
  for (const journeyId of journeyIds) {
    const memberActivities = activitiesByJourney.get(journeyId) ?? new Set<string>();

    // Intra-journey PRECEDES successors (both endpoints in this journey).
    const successors = new Map<string, string[]>();
    for (const [from, to] of precedesRaw) {
      if (!memberActivities.has(from) || !memberActivities.has(to)) continue;
      const list = successors.get(from) ?? [];
      list.push(to);
      successors.set(from, list);
    }

    const depth = longestChainLength(memberActivities, successors, COMPLEXITY_DEPTH_CAP);

    const systems = new Set<string>();
    const roles = new Set<string>();
    for (const activityId of memberActivities) {
      const sys = systemsByActivity.get(activityId);
      if (sys) for (const s of sys) systems.add(s);
      const rol = rolesByActivity.get(activityId);
      if (rol) for (const r of rol) roles.add(r);
    }

    const subScores: ComplexitySubScores = {
      depth,
      distinctSystems: systems.size,
      distinctRoles: roles.size,
    };
    const score =
      depth * weights.depth_weight *
      systems.size * weights.system_weight *
      roles.size * weights.role_weight;

    journeys.push({
      journeyId,
      journeyName: nameById.get(journeyId) ?? journeyId,
      activities: memberActivities.size,
      subScores,
      score,
    });
  }

  // Highest complexity first; deterministic name tiebreak.
  journeys.sort(
    (a, b) => b.score - a.score || a.journeyName.localeCompare(b.journeyName),
  );

  return { report: "complexity", weights, journeys };
}

/** Reads the live graph via the shared read-only module and computes the report. */
export async function runComplexity(
  weights: ComplexityWeights = DEFAULT_COMPLEXITY_WEIGHTS,
): Promise<ComplexityReport> {
  const { nodes, edges } = await fetchGraph();
  return computeComplexity(nodes, edges, weights);
}
