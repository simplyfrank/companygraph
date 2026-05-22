// FR-03 / AC-02 — order journey activities by PRECEDES, with
// `createdAt` ASC as the tiebreaker for activities that are not
// directly comparable (multiple zero-in-degree roots, or unrelated
// branches). Detects cycles and reports them so the view can render
// the warning ribbon while still showing every activity.
//
// Pure module — no React, no fetch. Easy to unit-test.

export interface OrderableActivity {
  id: string;
  createdAt: string; // ISO 8601; missing → empty string sorts first
}

export interface PrecedesEdge {
  fromId: string;
  toId: string;
}

export interface JourneyOrderResult {
  orderedIds: string[];
  cycle: boolean;
}

export function orderJourneyActivities(
  activities: OrderableActivity[],
  edges: PrecedesEdge[],
): JourneyOrderResult {
  const ids = new Set(activities.map((a) => a.id));
  const validEdges = edges.filter((e) => ids.has(e.fromId) && ids.has(e.toId));

  // Adjacency + in-degree, scoped to this journey's activities.
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const a of activities) {
    adj.set(a.id, []);
    inDeg.set(a.id, 0);
  }
  for (const e of validEdges) {
    adj.get(e.fromId)!.push(e.toId);
    inDeg.set(e.toId, (inDeg.get(e.toId) ?? 0) + 1);
  }

  const byId = new Map(activities.map((a) => [a.id, a]));
  const cmp = (a: string, b: string): number => {
    const ta = byId.get(a)?.createdAt ?? "";
    const tb = byId.get(b)?.createdAt ?? "";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  };

  // Kahn's algorithm with createdAt-ASC tiebreaker on the ready set.
  const ready: string[] = [];
  for (const [id, d] of inDeg) if (d === 0) ready.push(id);
  ready.sort(cmp);

  const ordered: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    ordered.push(id);
    for (const target of adj.get(id) ?? []) {
      const d = (inDeg.get(target) ?? 0) - 1;
      inDeg.set(target, d);
      if (d === 0) {
        ready.push(target);
      }
    }
    ready.sort(cmp);
  }

  if (ordered.length < activities.length) {
    // Cycle present. Topological sort left some activities unconsumed.
    // Append the remainder in createdAt ASC order so the user still
    // sees every activity (FR-03: "never enter an infinite loop").
    const orderedSet = new Set(ordered);
    const remaining = activities
      .filter((a) => !orderedSet.has(a.id))
      .map((a) => a.id)
      .sort(cmp);
    return { orderedIds: [...ordered, ...remaining], cycle: true };
  }

  return { orderedIds: ordered, cycle: false };
}
