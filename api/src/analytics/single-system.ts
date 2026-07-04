/**
 * Single-system journey report (FR-05, cto-analytics design §7.2, T-11).
 *
 * Enumerates `UserJourney` nodes whose activities collectively touch exactly
 * **one** distinct `System` — `count(DISTINCT system across all activities) = 1`
 * (AC-05). These are journeys wholly contained in a single system: the
 * inverse smell to the consolidation report (FR-03).
 *
 * Each candidate carries:
 *   • the journey (id + name),
 *   • the single bound system (id + name) — for the FR-05 deep-link
 *     `#/explorer/journey-detail/:journeyId?system=:systemId`, and
 *   • the count of activities in the journey that use that system.
 *
 * The membership walk is `Activity-[:PART_OF]->UserJourney` for journey
 * membership and `Activity-[:USES_SYSTEM]->System` for system use, matching
 * the schema hierarchy (`shared/src/schema/edges.ts`). A journey whose
 * activities use **no** system, or **more than one** distinct system, is not a
 * candidate.
 *
 * Candidates are sorted by activity-use count DESC (busiest single-system
 * journeys first), ties broken by journey name for a deterministic order.
 *
 * RD-1 (design §4 DD-02): reads the live graph through the shared read-only
 * module `api/src/neo4j/read-only-graph.ts` — no direct `getDriver()` /
 * `driver.session()` here (AC-11; guard test T-19). No write imports (AC-12).
 */

import { fetchGraph, type GraphNode, type GraphEdge } from "../neo4j/read-only-graph";

const ACTIVITY_LABEL = "Activity";
const SYSTEM_LABEL = "System";
const JOURNEY_LABEL = "UserJourney";
const USES_SYSTEM = "USES_SYSTEM";
const PART_OF = "PART_OF";

/** Exactly this many distinct systems for a journey to be single-system (FR-05). */
export const SINGLE_SYSTEM_DISTINCT_COUNT = 1;

export interface SingleSystemRef {
  id: string;
  name: string;
}

export interface SingleSystemJourney {
  journeyId: string;
  journeyName: string;
  /** The single distinct system the journey's activities all use. */
  system: SingleSystemRef;
  /** Number of the journey's activities that use that system — the sort key. */
  activityCount: number;
}

export interface SingleSystemReport {
  report: "single-system-journeys";
  journeys: SingleSystemJourney[];
}

/**
 * Pure computation over an already-loaded graph — exported so the FR-05 logic
 * is unit-testable without a live Neo4j. For each journey, walks its member
 * activities (`Activity-[:PART_OF]->UserJourney`), collects the distinct
 * systems those activities use (`Activity-[:USES_SYSTEM]->System`), keeps only
 * journeys with exactly one distinct system, and sorts by activity-use count
 * DESC.
 */
export function computeSingleSystem(
  nodes: GraphNode[],
  edges: GraphEdge[],
): SingleSystemReport {
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

  // activity id → parent journey id (first PART_OF→UserJourney edge wins).
  const journeyByActivity = new Map<string, string>();
  // activity id → set of distinct system ids it uses.
  const systemsByActivity = new Map<string, Set<string>>();

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

  // journey id → set of distinct system ids used across its activities.
  const systemsByJourney = new Map<string, Set<string>>();
  // journey id → number of its activities that use at least one system.
  const activityUseByJourney = new Map<string, number>();

  for (const [activityId, journeyId] of journeyByActivity) {
    const sysSet = systemsByActivity.get(activityId);
    if (!sysSet || sysSet.size === 0) continue;

    let jSet = systemsByJourney.get(journeyId);
    if (!jSet) {
      jSet = new Set<string>();
      systemsByJourney.set(journeyId, jSet);
    }
    for (const sid of sysSet) jSet.add(sid);
    activityUseByJourney.set(journeyId, (activityUseByJourney.get(journeyId) ?? 0) + 1);
  }

  const journeys: SingleSystemJourney[] = [];
  for (const [journeyId, sysSet] of systemsByJourney) {
    if (sysSet.size !== SINGLE_SYSTEM_DISTINCT_COUNT) continue;

    const systemId = [...sysSet][0]!;
    journeys.push({
      journeyId,
      journeyName: nameById.get(journeyId) ?? journeyId,
      system: { id: systemId, name: nameById.get(systemId) ?? systemId },
      activityCount: activityUseByJourney.get(journeyId) ?? 0,
    });
  }

  // AC-05: busiest single-system journeys first; deterministic name tiebreak.
  journeys.sort(
    (a, b) => b.activityCount - a.activityCount || a.journeyName.localeCompare(b.journeyName),
  );

  return { report: "single-system-journeys", journeys };
}

/** Reads the live graph via the shared read-only module and computes the report. */
export async function runSingleSystem(): Promise<SingleSystemReport> {
  const { nodes, edges } = await fetchGraph();
  return computeSingleSystem(nodes, edges);
}
