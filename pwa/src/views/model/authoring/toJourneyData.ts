// business-model-authoring T-15 (design §4.8, DD-05) — maps the id-based
// authoring/graph response into the column-index-based JourneyData shape
// that JourneyCanvas expects. One JourneyCanvas per journey with
// layoutMode="chain" (DR-C-01).

import type { AuthoringGraph } from "@companygraph/shared/schema/authoring";
import type {
  JourneyData,
  ActivityNode,
  RoleNode,
  SystemNode,
  LocationNode,
  PrecedesEdge,
} from "../../../components/JourneyCanvas";

export function toJourneyData(graph: AuthoringGraph, journeyId: string): JourneyData {
  const journey = graph.journeys.find((j) => j.id === journeyId);
  if (!journey) {
    return { activities: [], roles: [], systems: [], locations: [], precedes: [] };
  }

  // (1) Activities sorted by server order → dense column 0..n-1
  const sortedActivities = [...journey.activities].sort((a, b) => a.order - b.order);
  const colMap = new Map<string, number>();
  const activities: ActivityNode[] = sortedActivities.map((a, i) => {
    colMap.set(a.id, i);
    return { id: a.id, name: a.name, column: i };
  });

  const activityIds = new Set(journey.activities.map((a) => a.id));

  // (2) Roles/systems/locations whose activity ids intersect this journey
  const roles: RoleNode[] = graph.roles
    .filter((r) => r.executesActivityIds.some((id) => activityIds.has(id)))
    .map((r) => ({
      id: r.id,
      name: r.name,
      columns: r.executesActivityIds
        .filter((id) => colMap.has(id))
        .map((id) => colMap.get(id)!)
        .sort((a, b) => a - b),
      durations: {},
    }));

  const systems: SystemNode[] = graph.systems
    .filter((s) => s.usedByActivityIds.some((id) => activityIds.has(id)))
    .map((s) => ({
      id: s.id,
      name: s.name,
      usages: s.usedByActivityIds
        .filter((id) => colMap.has(id))
        .map((id) => ({ column: colMap.get(id)! })),
    }));

  const locations: LocationNode[] = graph.locations
    .filter((l) => l.activityIds.some((id) => activityIds.has(id)))
    .map((l) => ({
      id: l.id,
      name: l.name,
      columns: l.activityIds
        .filter((id) => colMap.has(id))
        .map((id) => colMap.get(id)!)
        .sort((a, b) => a - b),
    }));

  // (3) Precedes pairs with BOTH ends in this journey → {from_col, to_col}
  // Cross-journey pairs are dropped (FR-10-tier, deferred).
  const precedes: PrecedesEdge[] = graph.precedes
    .filter((p) => colMap.has(p.fromActivityId) && colMap.has(p.toActivityId))
    .map((p) => ({
      from_col: colMap.get(p.fromActivityId)!,
      to_col: colMap.get(p.toActivityId)!,
    }));

  return { activities, roles, systems, locations, precedes };
}
