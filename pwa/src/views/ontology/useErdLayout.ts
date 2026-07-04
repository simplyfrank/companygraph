import { useMemo } from "react";
import type { OntologyLabelRow } from "../../api";
import type { ErdEdge } from "./useOntologyGraph";

export interface ErdLayout {
  positions: Record<string, { x: number; y: number }>;
  sizes: Record<string, { width: number; height: number }>;
  contextSizes?: Record<string, { width: number; height: number }>;
  collapsedContexts?: string[];
  contextExpandedSizes?: Record<string, { width: number; height: number }>;
}

export interface BoundedContext {
  name: string;
  domain: string;
  subdomain: string;
  type: string;
  entities: string[];
}

const STORAGE_KEY = "companygraph.erd.layout.v1";
const DEFAULT_SIZE = { width: 160, height: 100 };

// Cluster layout constants
const CLUSTER_GAP = 400;  // spacing between bounded context clusters
const ENTITY_GAP = 180;   // spacing between entities within a cluster
const ORIGIN_X = 40;
const ORIGIN_Y = 40;
const CLUSTER_COLS = 3;   // number of clusters per row in grid layout

// Load saved layout from localStorage
function loadSavedLayout(): Partial<ErdLayout> | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const v = JSON.parse(saved);
    if (!v || typeof v !== "object") return null;
    const positions = v.positions && typeof v.positions === "object" ? v.positions : undefined;
    const sizes = v.sizes && typeof v.sizes === "object" ? v.sizes : undefined;
    const contextSizes = v.contextSizes && typeof v.contextSizes === "object" ? v.contextSizes : undefined;
    const collapsedContexts = Array.isArray(v.collapsedContexts) ? v.collapsedContexts : undefined;
    const contextExpandedSizes = v.contextExpandedSizes && typeof v.contextExpandedSizes === "object" ? v.contextExpandedSizes : undefined;
    return { positions, sizes, contextSizes, collapsedContexts, contextExpandedSizes };
  } catch { return null; }
}

/**
 * Cluster-based layout for bounded contexts.
 * Groups entities by bounded context, arranges clusters in a grid,
 * and positions entities within each cluster compactly.
 */
export function clusterLayout(
  labels: string[],
  boundedContexts: BoundedContext[],
): Record<string, { x: number; y: number }> {
  if (labels.length === 0) return {};

  // Build entity → bounded context mapping
  const entityToContext = new Map<string, BoundedContext>();
  for (const bc of boundedContexts) {
    for (const entity of bc.entities) {
      entityToContext.set(entity, bc);
    }
  }

  // Group entities by bounded context
  const contextToEntities = new Map<string, string[]>();
  for (const label of labels) {
    const bc = entityToContext.get(label);
    if (bc) {
      if (!contextToEntities.has(bc.name)) {
        contextToEntities.set(bc.name, []);
      }
      contextToEntities.get(bc.name)!.push(label);
    }
  }

  // Sort bounded contexts by subdomain for consistent layout
  const sortedContexts = Array.from(contextToEntities.keys()).sort();

  const positions: Record<string, { x: number; y: number }> = {};

  // Arrange clusters in a grid
  sortedContexts.forEach((contextName, clusterIndex) => {
    const entities = contextToEntities.get(contextName) ?? [];
    const clusterRow = Math.floor(clusterIndex / CLUSTER_COLS);
    const clusterCol = clusterIndex % CLUSTER_COLS;

    // Calculate cluster origin
    const clusterOriginX = ORIGIN_X + clusterCol * CLUSTER_GAP;
    const clusterOriginY = ORIGIN_Y + clusterRow * CLUSTER_GAP;

    // Arrange entities within cluster in a grid
    const entityCount = entities.length;
    const clusterCols = Math.ceil(Math.sqrt(entityCount));
    const clusterRows = Math.ceil(entityCount / clusterCols);

    entities.forEach((entity, entityIndex) => {
      const entityRow = Math.floor(entityIndex / clusterCols);
      const entityCol = entityIndex % clusterCols;

      positions[entity] = {
        x: clusterOriginX + entityCol * ENTITY_GAP,
        y: clusterOriginY + entityRow * ENTITY_GAP,
      };
    });
  });

  // Handle entities not in any bounded context (place at bottom)
  const unassigned = labels.filter((l) => !entityToContext.has(l));
  if (unassigned.length > 0) {
    const lastClusterRow = Math.floor(sortedContexts.length / CLUSTER_COLS);
    const unassignedOriginY = ORIGIN_Y + (lastClusterRow + 1) * CLUSTER_GAP;
    unassigned.forEach((entity, i) => {
      positions[entity] = {
        x: ORIGIN_X + i * ENTITY_GAP,
        y: unassignedOriginY,
      };
    });
  }

  return positions;
}

export function useErdLayout(
  labels: OntologyLabelRow[],
  edges: ErdEdge[],
  boundedContexts?: BoundedContext[],
): ErdLayout {
  return useMemo(() => {
    const savedLayout = loadSavedLayout();
    const savedPositions = savedLayout?.positions ?? {};
    const savedSizes = savedLayout?.sizes ?? {};
    const savedContextSizes = savedLayout?.contextSizes ?? {};
    const savedCollapsedContexts = savedLayout?.collapsedContexts ?? [];
    const savedContextExpandedSizes = savedLayout?.contextExpandedSizes ?? {};

    const labelNames = labels.map((l) => l.name);

    // Compute cluster positions if bounded contexts are provided, otherwise use fallback
    const clusterPositions = boundedContexts && boundedContexts.length > 0
      ? clusterLayout(labelNames, boundedContexts)
      : {};

    // Saved positions override cluster layout (user's drag persists); new labels get cluster slot
    const positions: Record<string, { x: number; y: number }> = {};
    for (const label of labelNames) {
      positions[label] = savedPositions[label] ?? clusterPositions[label] ?? { x: ORIGIN_X, y: ORIGIN_Y };
    }

    const sizes: Record<string, { width: number; height: number }> = {};
    for (const label of labelNames) {
      sizes[label] = savedSizes[label] ?? DEFAULT_SIZE;
    }

    return { positions, sizes, contextSizes: savedContextSizes, collapsedContexts: savedCollapsedContexts, contextExpandedSizes: savedContextExpandedSizes };
  }, [labels, edges, boundedContexts]);
}

// Save layout to localStorage
export function saveErdLayout(layout: ErdLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Ignore save errors (e.g., quota exceeded)
  }
}
