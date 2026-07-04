/**
 * System-map metrics (FR-01, cto-analytics design §7.2, T-20).
 *
 * For every `System` node, computes:
 *   • degree centrality  — total incident edges (all types) touching it,
 *     taken from the migrated graphology engine's degree output, so the
 *     system map and `GET /api/v1/analytics/graph` agree on degree.
 *   • integration count  — number of `INTEGRATES_WITH` edges touching it
 *     (in + out), the metric FR-01's force-directed map sizes nodes by.
 *
 * Served as T-14's `GET /api/v1/analytics/systems`. Reads the full graph
 * through the shared read-only module (`api/src/neo4j/read-only-graph.ts`)
 * — no direct `getDriver()`/`driver.session()` here (RD-1, AC-11).
 */

import { fetchGraph, type GraphNode, type GraphEdge } from "../neo4j/read-only-graph";

const SYSTEM_LABEL = "System";
const INTEGRATES_WITH = "INTEGRATES_WITH";

export interface SystemMapNode {
  id: string;
  name: string;
  /** Total incident edges of any type (degree centrality). */
  degree: number;
  /** Incident `INTEGRATES_WITH` edges (in + out). */
  integrationCount: number;
}

export interface SystemMapEdge {
  id: string;
  source: string;
  target: string;
  type: string; // always `INTEGRATES_WITH` in this projection
}

export interface SystemMap {
  systems: SystemMapNode[];
  integrations: SystemMapEdge[];
}

// Pure computation — exported so it can be unit-tested without Neo4j.
export function computeSystemMap(nodes: GraphNode[], edges: GraphEdge[]): SystemMap {
  const systemIds = new Set<string>();
  const nameById = new Map<string, string>();
  for (const n of nodes) {
    if (n.label === SYSTEM_LABEL) {
      systemIds.add(n.id);
      nameById.set(n.id, n.name);
    }
  }

  const degree = new Map<string, number>();
  const integrationCount = new Map<string, number>();
  const integrations: SystemMapEdge[] = [];

  for (const e of edges) {
    // Total incident-edge degree for system endpoints (any edge type).
    if (systemIds.has(e.source)) degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    if (systemIds.has(e.target)) degree.set(e.target, (degree.get(e.target) ?? 0) + 1);

    if (e.type !== INTEGRATES_WITH) continue;

    // Only surface System→System integrations on the map.
    if (!systemIds.has(e.source) || !systemIds.has(e.target)) continue;

    integrationCount.set(e.source, (integrationCount.get(e.source) ?? 0) + 1);
    integrationCount.set(e.target, (integrationCount.get(e.target) ?? 0) + 1);
    integrations.push({
      id: e.id,
      source: e.source,
      target: e.target,
      type: INTEGRATES_WITH,
    });
  }

  const systems: SystemMapNode[] = [...systemIds]
    .map((id) => ({
      id,
      name: nameById.get(id) ?? id,
      degree: degree.get(id) ?? 0,
      integrationCount: integrationCount.get(id) ?? 0,
    }))
    // Stable, deterministic ordering: most-integrated first, then by name.
    .sort(
      (a, b) =>
        b.integrationCount - a.integrationCount ||
        b.degree - a.degree ||
        a.name.localeCompare(b.name),
    );

  return { systems, integrations };
}

// Reads the live graph via the shared read-only module and computes the map.
export async function runSystemMap(): Promise<SystemMap> {
  const { nodes, edges } = await fetchGraph();
  return computeSystemMap(nodes, edges);
}
