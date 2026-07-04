/**
 * Layout Comparison Utility
 * 
 * Measures how well a layout matches the target/reference layout.
 * Provides quantitative metrics for goodness of fit.
 */

import type { ErdEdge } from "./useOntologyGraph";
import { TARGET_LAYOUT } from "./targetLayout";

export interface LayoutComparisonResult {
  targetLayout: typeof TARGET_LAYOUT;
  candidatePositions: Record<string, { x: number; y: number }>;
  metrics: {
    positionError: number; // Average distance from target positions
    boundedContextAlignment: number; // % of entities in correct BC
    edgeLengthImprovement: number; // Reduction in total edge length vs target
    clusterSeparationScore: number; // How well clusters are separated
    overallScore: number; // Composite score (0-100)
  };
  details: {
    misalignedEntities: Array<{ entity: string; targetBC: string; actualBC: string | null }>;
    positionErrors: Record<string, number>;
    edgeLengthComparison: { target: number; candidate: number; improvement: number };
  };
}

/**
 * Calculate Euclidean distance between two points
 */
function distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate total edge length for a layout
 */
function calculateTotalEdgeLength(
  positions: Record<string, { x: number; y: number }>,
  edges: ErdEdge[],
): number {
  let totalLength = 0;
  let edgeCount = 0;

  for (const edge of edges) {
    const fromPos = positions[edge.fromLabel];
    const toPos = positions[edge.toLabel];

    if (fromPos && toPos) {
      totalLength += distance(fromPos, toPos);
      edgeCount++;
    }
  }

  return edgeCount > 0 ? totalLength / edgeCount : 0;
}

/**
 * Find which bounded context an entity belongs to in the target layout
 */
function findTargetBoundedContext(entity: string): string | null {
  for (const bc of TARGET_LAYOUT.boundedContexts) {
    if (bc.entities.includes(entity)) {
      return bc.name;
    }
  }
  return null;
}

/**
 * Find which bounded context an entity belongs to in candidate layout
 */
function findCandidateBoundedContext(
  entity: string,
  candidatePositions: Record<string, { x: number; y: number }>,
): string | null {
  const entityPos = candidatePositions[entity];
  if (!entityPos) return null;

  let closestBC: string | null = null;
  let minDistance = Infinity;

  for (const bc of TARGET_LAYOUT.boundedContexts) {
    const bcCenter = bc.position;
    const dist = distance(entityPos, bcCenter);
    if (dist < minDistance) {
      minDistance = dist;
      closestBC = bc.name;
    }
  }

  // Only assign if within reasonable distance (500px)
  return minDistance < 500 ? closestBC : null;
}

/**
 * Calculate cluster separation score
 */
function calculateClusterSeparation(
  positions: Record<string, { x: number; y: number }>,
): number {
  const bcCenters = new Map<string, { x: number; y: number }>();
  
  for (const bc of TARGET_LAYOUT.boundedContexts) {
    const bcEntities = bc.entities.filter((e) => positions[e]);
    if (bcEntities.length === 0) continue;

    const avgX = bcEntities.reduce((sum, e) => sum + (positions[e]?.x ?? 0), 0) / bcEntities.length;
    const avgY = bcEntities.reduce((sum, e) => sum + (positions[e]?.y ?? 0), 0) / bcEntities.length;
    bcCenters.set(bc.name, { x: avgX, y: avgY });
  }

  // Calculate average distance between cluster centers
  const centers = Array.from(bcCenters.values());
  let totalDist = 0;
  let count = 0;

  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) {
      const c1 = centers[i];
      const c2 = centers[j];
      if (c1 && c2) {
        totalDist += distance(c1, c2);
        count++;
      }
    }
  }

  const avgInterClusterDist = count > 0 ? totalDist / count : 0;

  // Calculate average distance within clusters
  let totalIntraDist = 0;
  let intraCount = 0;

  for (const bc of TARGET_LAYOUT.boundedContexts) {
    const bcEntities = bc.entities.filter((e) => positions[e] !== undefined);
    for (let i = 0; i < bcEntities.length; i++) {
      for (let j = i + 1; j < bcEntities.length; j++) {
        const e1 = bcEntities[i];
        const e2 = bcEntities[j];
        const pos1 = positions[e1!];
        const pos2 = positions[e2!];
        if (pos1 && pos2) {
          totalIntraDist += distance(pos1, pos2);
          intraCount++;
        }
      }
    }
  }

  const avgIntraClusterDist = intraCount > 0 ? totalIntraDist / intraCount : 0;

  // Separation score: higher is better (inter-cluster >> intra-cluster)
  return avgIntraClusterDist > 0 ? avgInterClusterDist / avgIntraClusterDist : 0;
}

/**
 * Compare a candidate layout against the target layout
 */
export function compareLayoutAgainstTarget(
  candidatePositions: Record<string, { x: number; y: number }>,
  edges: ErdEdge[],
): LayoutComparisonResult {
  const positionErrors: Record<string, number> = {};
  let totalPositionError = 0;
  let errorCount = 0;

  const misalignedEntities: Array<{ entity: string; targetBC: string; actualBC: string | null }> = [];
  let alignedCount = 0;
  let totalEntities = 0;

  // Calculate position errors and bounded context alignment
  for (const [entity, targetPos] of Object.entries(TARGET_LAYOUT.positions)) {
    const candidatePos = candidatePositions[entity];
    if (!candidatePos) continue;

    const error = distance(targetPos, candidatePos);
    positionErrors[entity] = error;
    totalPositionError += error;
    errorCount++;

    const targetBC = findTargetBoundedContext(entity);
    const actualBC = findCandidateBoundedContext(entity, candidatePositions);
    totalEntities++;

    if (targetBC === actualBC) {
      alignedCount++;
    } else {
      misalignedEntities.push({
        entity,
        targetBC: targetBC || "None",
        actualBC: actualBC || "None",
      });
    }
  }

  const avgPositionError = errorCount > 0 ? totalPositionError / errorCount : 0;
  const boundedContextAlignment = totalEntities > 0 ? (alignedCount / totalEntities) * 100 : 0;

  // Calculate edge length comparison
  const targetEdgeLength = calculateTotalEdgeLength(TARGET_LAYOUT.positions, edges);
  const candidateEdgeLength = calculateTotalEdgeLength(candidatePositions, edges);
  const edgeLengthImprovement = targetEdgeLength > 0
    ? ((targetEdgeLength - candidateEdgeLength) / targetEdgeLength) * 100
    : 0;

  // Calculate cluster separation
  const clusterSeparationScore = calculateClusterSeparation(candidatePositions);

  // Calculate overall composite score (0-100)
  // Weighted: position error (40%), BC alignment (30%), edge improvement (20%), separation (10%)
  const positionScore = Math.max(0, 100 - (avgPositionError / 10)); // Normalize: 0px error = 100, 1000px error = 0
  const overallScore = (
    positionScore * 0.4 +
    boundedContextAlignment * 0.3 +
    Math.max(0, edgeLengthImprovement) * 0.2 +
    Math.min(100, clusterSeparationScore) * 0.1
  );

  return {
    targetLayout: TARGET_LAYOUT,
    candidatePositions,
    metrics: {
      positionError: avgPositionError,
      boundedContextAlignment,
      edgeLengthImprovement,
      clusterSeparationScore,
      overallScore,
    },
    details: {
      misalignedEntities,
      positionErrors,
      edgeLengthComparison: {
        target: targetEdgeLength,
        candidate: candidateEdgeLength,
        improvement: edgeLengthImprovement,
      },
    },
  };
}

/**
 * Format comparison result for display
 */
export function formatComparisonResult(result: LayoutComparisonResult): string {
  return `
Layout Comparison vs Target
============================

Overall Score: ${result.metrics.overallScore.toFixed(1)}/100

Metrics:
--------
Position Error: ${result.metrics.positionError.toFixed(0)}px (lower is better)
BC Alignment: ${result.metrics.boundedContextAlignment.toFixed(1)}% (higher is better)
Edge Length Improvement: ${result.metrics.edgeLengthImprovement.toFixed(1)}% (positive = better than target)
Cluster Separation: ${result.metrics.clusterSeparationScore.toFixed(2)}x (higher = better)

Edge Length Comparison:
----------------------
Target: ${result.details.edgeLengthComparison.target.toFixed(0)}px
Candidate: ${result.details.edgeLengthComparison.candidate.toFixed(0)}px
Improvement: ${result.details.edgeLengthComparison.improvement.toFixed(1)}%

Misaligned Entities (${result.details.misalignedEntities.length}):
----------------------
${result.details.misalignedEntities.slice(0, 10).map(m => `- ${m.entity}: ${m.targetBC} → ${m.actualBC}`).join('\n')}
${result.details.misalignedEntities.length > 10 ? `... and ${result.details.misalignedEntities.length - 10} more` : ''}
`;
}
