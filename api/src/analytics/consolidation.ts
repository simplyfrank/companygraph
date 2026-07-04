/**
 * Consolidation-candidates report (FR-03, cto-analytics design §7.2, T-09).
 *
 * Surfaces activities that touch **two or more distinct `System` nodes** via
 * `USES_SYSTEM` — the classic "one step, many systems" consolidation smell.
 * Each candidate carries:
 *   • the activity (id + name),
 *   • the distinct systems it uses (id + name), and
 *   • its parent `UserJourney` (id + name), for the deep-link into the
 *     explorer's activity detail.
 *
 * Candidates are sorted by distinct-system count DESC (AC-03), ties broken by
 * activity name for a deterministic order.
 *
 * RD-1 (design §4 DD-02): reads the live graph through the shared read-only
 * module `api/src/neo4j/read-only-graph.ts` — no direct `getDriver()` /
 * `driver.session()` here (AC-11; guard test T-19). No write imports (AC-12).
 */

import { fetchGraph, type GraphNode, type GraphEdge } from "../neo4j/read-only-graph";

const ACTIVITY_LABEL = "Activity";
const SYSTEM_LABEL = "System";
const USES_SYSTEM = "USES_SYSTEM";
const PART_OF = "PART_OF";
const JOURNEY_LABEL = "UserJourney";

/** Minimum distinct systems for an activity to be a consolidation candidate (FR-03). */
export const CONSOLIDATION_MIN_SYSTEMS = 2;

export interface ConsolidationSystemRef {
  id: string;
  name: string;
}

export interface ConsolidationJourneyRef {
  id: string;
  name: string;
}

export interface ConsolidationCandidate {
  activityId: string;
  activityName: string;
  /** Distinct systems the activity uses, sorted by name. */
  systems: ConsolidationSystemRef[];
  /** Number of distinct systems — the FR-03 sort key. */
  systemCount: number;
  /** Parent journey (via `Activity-[:PART_OF]->UserJourney`), or null if unattached. */
  journey: ConsolidationJourneyRef | null;
}

export interface ConsolidationReport {
  report: "consolidation";
  candidates: ConsolidationCandidate[];
}

/**
 * Pure computation over an already-loaded graph — exported so the FR-03 logic
 * is unit-testable without a live Neo4j. Groups `USES_SYSTEM` edges per
 * activity, keeps only activities with ≥ `CONSOLIDATION_MIN_SYSTEMS` distinct
 * systems, attaches the parent journey, and sorts by distinct-system count DESC.
 */
export function computeConsolidation(
  nodes: GraphNode[],
  edges: GraphEdge[],
): ConsolidationReport {
  const nameById = new Map<string, string>();
  const activityIds = new Set<string>();
  const systemIds = new Set<string>();
  const journeyIds = new Set<string>();
  for (const n of nodes) {
    nameById.set(n.id, n.name);
    if (n.label === ACTIVITY_LABEL) activityIds.add(n.id);
    else if (n.label === SYSTEM_LABEL) systemIds.add(n.id);
    else if (n.label === JOURNEY_LABEL) journeyIds.add(n.id);
  }

  // activity id → set of distinct system ids it uses.
  const systemsByActivity = new Map<string, Set<string>>();
  // activity id → parent journey id (first PART_OF→UserJourney edge wins).
  const journeyByActivity = new Map<string, string>();

  for (const e of edges) {
    if (e.type === USES_SYSTEM) {
      if (!activityIds.has(e.source) || !systemIds.has(e.target)) continue;
      let set = systemsByActivity.get(e.source);
      if (!set) {
        set = new Set<string>();
        systemsByActivity.set(e.source, set);
      }
      set.add(e.target);
    } else if (e.type === PART_OF) {
      // Activity -[:PART_OF]-> UserJourney (schema hierarchy).
      if (!activityIds.has(e.source) || !journeyIds.has(e.target)) continue;
      if (!journeyByActivity.has(e.source)) journeyByActivity.set(e.source, e.target);
    }
  }

  const candidates: ConsolidationCandidate[] = [];
  for (const [activityId, sysSet] of systemsByActivity) {
    if (sysSet.size < CONSOLIDATION_MIN_SYSTEMS) continue;

    const systems: ConsolidationSystemRef[] = [...sysSet]
      .map((id) => ({ id, name: nameById.get(id) ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const journeyId = journeyByActivity.get(activityId);
    const journey: ConsolidationJourneyRef | null =
      journeyId !== undefined
        ? { id: journeyId, name: nameById.get(journeyId) ?? journeyId }
        : null;

    candidates.push({
      activityId,
      activityName: nameById.get(activityId) ?? activityId,
      systems,
      systemCount: systems.length,
      journey,
    });
  }

  // AC-03: sort by distinct-system count DESC; deterministic name tiebreak.
  candidates.sort(
    (a, b) => b.systemCount - a.systemCount || a.activityName.localeCompare(b.activityName),
  );

  return { report: "consolidation", candidates };
}

/** Reads the live graph via the shared read-only module and computes the report. */
export async function runConsolidation(): Promise<ConsolidationReport> {
  const { nodes, edges } = await fetchGraph();
  return computeConsolidation(nodes, edges);
}
