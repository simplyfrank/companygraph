// Bulk paste algorithm per design §4.12 (FR-16 / AC-13).
//
// diffPaste() parses a list of activity names, compares against existing
// activities in the journey, and returns a minimal diff:
//   - NEW nodes for activities that don't exist
//   - REUSED nodes for activities that already exist (idempotent)
//   - NEW PRECEDES edges to preserve order
//   - PART_OF edges to bind activities to the journey
//
// Duplicate detection: if the same name appears twice in the paste,
// raises an error with code `duplicate_activity_name`.
//
// Snapshot/rollback (C-05 fix): the function returns a snapshot of the
// journey's current state before any mutations. If the import fails,
// the caller can use this to restore the pre-delete state.

import { uuidv7 } from "./uuidv7";

export interface ActivityNode {
  id: string;
  name: string;
  description: string;
  attributes: Record<string, unknown>;
}

export interface Edge {
  id: string;
  type: string;
  from: string;
  to: string;
}

export interface Snapshot {
  activityIds: string[];
  precedesEdgeIds: string[];
}

export interface DiffResult {
  nodes: ActivityNode[];
  edges: Edge[];
  deletedEdgeIds: string[]; // For rollback
  snapshot: Snapshot;
  warnings: string[];
}

export interface DiffPasteOptions {
  journeyId: string;
  existingActivities: ActivityNode[];
  existingPrecedesEdges: Edge[];
  existingPartOfEdges: Edge[];
  pasteLines: string[];
}

export interface DiffPasteError extends Error {
  code: string;
  details?: unknown;
}

/**
 * Parse bulk paste and compute minimal diff.
 *
 * @throws DiffPasteError with code `duplicate_activity_name` if the same
 *         name appears multiple times in the paste.
 */
export function diffPaste(opts: DiffPasteOptions): DiffResult {
  const { journeyId, existingActivities, existingPrecedesEdges, existingPartOfEdges, pasteLines } = opts;

  // Take snapshot of current state for rollback
  const snapshot: Snapshot = {
    activityIds: existingActivities.map((a) => a.id),
    precedesEdgeIds: existingPrecedesEdges.map((e) => e.id),
  };

  const warnings: string[] = [];
  const nodes: ActivityNode[] = [];
  const edges: Edge[] = [];
  const deletedEdgeIds: string[] = [];

  // Parse paste lines and check for duplicates
  const names = pasteLines.map((line) => line.trim()).filter(Boolean);
  const nameSet = new Set<string>();
  for (const name of names) {
    if (nameSet.has(name)) {
      const error = new Error(`Duplicate activity name in paste: "${name}"`) as DiffPasteError;
      error.code = "duplicate_activity_name";
      error.details = { name };
      throw error;
    }
    nameSet.add(name);
  }

  // Build lookup of existing activities by name
  const existingByName = new Map<string, ActivityNode>();
  for (const activity of existingActivities) {
    existingByName.set(activity.name, activity);
  }

  // Process each name: reuse existing or create new
  const activityIdsInOrder: string[] = [];
  for (const name of names) {
    const existing = existingByName.get(name);
    if (existing) {
      activityIdsInOrder.push(existing.id);
      warnings.push(`Reused existing activity: "${name}"`);
    } else {
      const newId = uuidv7();
      const newActivity: ActivityNode = {
        id: newId,
        label: "Activity",
        name,
        description: "",
        attributes: {},
      } as ActivityNode;
      nodes.push(newActivity);
      activityIdsInOrder.push(newId);
    }
  }

  // Create PART_OF edges for all activities (new and reused)
  for (const activityId of activityIdsInOrder) {
    // Check if PART_OF edge already exists
    const existingPartOf = existingPartOfEdges.find(
      (e) => e.type === "PART_OF" && e.from === activityId && e.to === journeyId,
    );
    if (!existingPartOf) {
      edges.push({
        id: uuidv7(),
        type: "PART_OF",
        from: activityId,
        to: journeyId,
      });
    }
  }

  // Handle PRECEDES edges: delete existing ones between our activities, create new ones
  // First, find all existing PRECEDES edges that involve our activities
  const activityIdSet = new Set(activityIdsInOrder);
  const precedesToDelete = existingPrecedesEdges.filter(
    (e) => activityIdSet.has(e.from) && activityIdSet.has(e.to),
  );

  // Mark them for deletion
  for (const edge of precedesToDelete) {
    deletedEdgeIds.push(edge.id);
  }

  // Create new PRECEDES edges to preserve order
  for (let i = 0; i < activityIdsInOrder.length - 1; i++) {
    const from = activityIdsInOrder[i];
    const to = activityIdsInOrder[i + 1];

    edges.push({
      id: uuidv7(),
      type: "PRECEDES",
      from,
      to,
    });
  }

  return {
    nodes,
    edges,
    deletedEdgeIds,
    snapshot,
    warnings,
  };
}

/**
 * Generate a rollback import payload from a snapshot.
 * This can be used to restore the journey state if the import fails.
 */
export function generateRollbackPayload(
  snapshot: Snapshot,
  deletedEdgeIds: string[] = [],
): { nodes: Array<{ id: string }>; edges: Array<{ id: string }> } {
  return {
    nodes: snapshot.activityIds.map((id) => ({ id })),
    edges: [...snapshot.precedesEdgeIds, ...deletedEdgeIds].map((id) => ({ id })),
  };
}