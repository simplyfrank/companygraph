/**
 * Hierarchical Layout Algorithm
 * 
 * Recursively optimizes cluster structure for:
 * 1. Clear separation between clusters at each level
 * 2. Minimization of cross-class interactions (edges between clusters)
 * 3. Optimization of total cluster count
 */

import type { ErdEdge } from "./useOntologyGraph";
import type { BoundedContext } from "./useErdLayout";

export interface HierarchicalCluster {
  id: string;
  name: string;
  level: number; // 0 = domain, 1 = subdomain, 2 = bounded context, 3 = entity
  parent?: string;
  children: string[]; // child cluster IDs
  entities: string[];
  position?: { x: number; y: number };
}

export interface HierarchicalLayoutResult {
  clusters: HierarchicalCluster[];
  positions: Record<string, { x: number; y: number }>;
  metrics: {
    totalClusters: number;
    avgCrossClusterEdges: number;
    clusterSeparationScore: number;
    optimizationScore: number;
  };
}

/**
 * Calculate edge density between two clusters
 * Higher density = more edges between clusters (bad for separation)
 */
function calculateEdgeDensity(
  cluster1Entities: Set<string>,
  cluster2Entities: Set<string>,
  edges: ErdEdge[],
): number {
  let crossEdges = 0;
  let totalEdges = 0;

  for (const edge of edges) {
    const fromInC1 = cluster1Entities.has(edge.fromLabel);
    const toInC1 = cluster1Entities.has(edge.toLabel);
    const fromInC2 = cluster2Entities.has(edge.fromLabel);
    const toInC2 = cluster2Entities.has(edge.toLabel);

    // Count total edges
    if (fromInC1 || toInC1 || fromInC2 || toInC2) {
      totalEdges++;
    }

    // Count cross-cluster edges
    if ((fromInC1 && toInC2) || (fromInC2 && toInC1)) {
      crossEdges++;
    }
  }

  return totalEdges > 0 ? crossEdges / totalEdges : 0;
}

/**
 * Calculate modularity score for a clustering
 * Higher modularity = better clustering (more intra-cluster edges, fewer inter-cluster)
 */
function calculateModularity(
  clusters: Array<{ entities: string[] }>,
  edges: ErdEdge[],
): number {
  const entityToCluster = new Map<string, number>();
  clusters.forEach((cluster, clusterIndex) => {
    cluster.entities.forEach((entity) => {
      entityToCluster.set(entity, clusterIndex);
    });
  });

  let intraClusterEdges = 0;
  let totalEdges = 0;

  for (const edge of edges) {
    const fromCluster = entityToCluster.get(edge.fromLabel);
    const toCluster = entityToCluster.get(edge.toLabel);

    if (fromCluster !== undefined && toCluster !== undefined) {
      totalEdges++;
      if (fromCluster === toCluster) {
        intraClusterEdges++;
      }
    }
  }

  return totalEdges > 0 ? intraClusterEdges / totalEdges : 0;
}

/**
 * Optimize cluster count using silhouette analysis
 * Returns optimal number of clusters
 */
function optimizeClusterCount(
  entities: string[],
  edges: ErdEdge[],
  minClusters: number = 2,
  maxClusters: number = 10,
): number {
  let bestScore = -Infinity;
  let bestClusterCount = minClusters;

  for (let k = minClusters; k <= maxClusters; k++) {
    // Simple k-means-like clustering based on edge connectivity
    const clusters = simpleKMeansClustering(entities, edges, k);
    const modularity = calculateModularity(clusters, edges);
    
    // Penalize too many clusters
    const penalty = k * 0.1;
    const score = modularity - penalty;

    if (score > bestScore) {
      bestScore = score;
      bestClusterCount = k;
    }
  }

  return bestClusterCount;
}

/**
 * Simple k-means-like clustering based on edge connectivity
 */
function simpleKMeansClustering(
  entities: string[],
  edges: ErdEdge[],
  k: number,
): Array<{ entities: string[] }> {
  if (entities.length <= k) {
    return entities.map((e) => ({ entities: [e] }));
  }

  // Build adjacency matrix
  const adjacency = new Map<string, Set<string>>();
  for (const e of entities) adjacency.set(e, new Set());
  for (const edge of edges) {
    if (adjacency.has(edge.fromLabel) && adjacency.has(edge.toLabel)) {
      adjacency.get(edge.fromLabel)!.add(edge.toLabel);
      adjacency.get(edge.toLabel)!.add(edge.fromLabel);
    }
  }

  // Initialize clusters with most connected nodes as centers
  const degrees = Array.from(adjacency.entries()).map(([entity, neighbors]) => ({
    entity,
    degree: neighbors.size,
  }));
  degrees.sort((a, b) => b.degree - a.degree);

  const centers = degrees.slice(0, k).map((d) => d.entity);
  const clusters: Array<{ entities: string[] }> = centers.map((c) => ({ entities: [c] }));
  const assigned = new Set<string>(centers);

  // Assign remaining entities to nearest cluster
  for (const entity of entities) {
    if (assigned.has(entity)) continue;

    let bestCluster = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < clusters.length; i++) {
      const clusterEntities = new Set(clusters[i]?.entities ?? []);
      let connections = 0;

      for (const clusterEntity of clusterEntities) {
        if (adjacency.get(entity)?.has(clusterEntity)) {
          connections++;
        }
      }

      if (connections > bestScore) {
        bestScore = connections;
        bestCluster = i;
      }
    }

    const targetCluster = clusters[bestCluster];
    if (targetCluster !== undefined) {
      targetCluster.entities.push(entity);
      assigned.add(entity);
    }
  }

  return clusters;
}

/**
 * Build hierarchical cluster structure from bounded contexts
 */
function buildHierarchy(
  boundedContexts: BoundedContext[],
  edges: ErdEdge[],
): HierarchicalCluster[] {
  const hierarchy: HierarchicalCluster[] = [];

  // Level 0: Domain (all bounded contexts under "Commercial")
  const domainCluster: HierarchicalCluster = {
    id: "domain-commercial",
    name: "Commercial",
    level: 0,
    children: [],
    entities: boundedContexts.flatMap((bc) => bc.entities),
  };
  hierarchy.push(domainCluster);

  // Group by subdomain for Level 1
  const subdomainMap = new Map<string, BoundedContext[]>();
  for (const bc of boundedContexts) {
    if (!subdomainMap.has(bc.subdomain)) {
      subdomainMap.set(bc.subdomain, []);
    }
    subdomainMap.get(bc.subdomain)!.push(bc);
  }

  // Level 1: Subdomains
  const subdomainClusters: HierarchicalCluster[] = [];
  for (const [subdomain, bcs] of subdomainMap) {
    const subdomainCluster: HierarchicalCluster = {
      id: `subdomain-${subdomain}`,
      name: subdomain,
      level: 1,
      parent: domainCluster.id,
      children: [],
      entities: bcs.flatMap((bc) => bc.entities),
    };
    subdomainClusters.push(subdomainCluster);
    domainCluster.children.push(subdomainCluster.id);

    // Level 2: Bounded Contexts
    for (const bc of bcs) {
      const bcCluster: HierarchicalCluster = {
        id: `bc-${bc.name.replace(/\s+/g, '-').toLowerCase()}`,
        name: bc.name,
        level: 2,
        parent: subdomainCluster.id,
        children: [],
        entities: bc.entities,
      };
      hierarchy.push(bcCluster);
      subdomainCluster.children.push(bcCluster.id);
    }
  }

  hierarchy.push(...subdomainClusters);

  return hierarchy;
}

/**
 * Calculate hierarchical layout positions
 */
function calculateHierarchicalPositions(
  hierarchy: HierarchicalCluster[],
  edges: ErdEdge[],
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const ORIGIN_X = 40;
  const ORIGIN_Y = 40;
  const DOMAIN_GAP = 800;
  const SUBDOMAIN_GAP = 400;
  const BC_GAP = 200;
  const ENTITY_GAP = 180;

  // Position domains (Level 0)
  const domains = hierarchy.filter((c) => c.level === 0);
  domains.forEach((domain, i) => {
    const domainX = ORIGIN_X + i * DOMAIN_GAP;
    const domainY = ORIGIN_Y;
    domain.position = { x: domainX, y: domainY };
  });

  // Position subdomains (Level 1) within their parent domain
  const subdomains = hierarchy.filter((c) => c.level === 1);
  subdomains.forEach((subdomain, i) => {
    const parent = hierarchy.find((c) => c.id === subdomain.parent);
    if (parent && parent.position) {
      const subdomainRow = Math.floor(i / 2);
      const subdomainCol = i % 2;
      subdomain.position = {
        x: parent.position.x + subdomainCol * SUBDOMAIN_GAP,
        y: parent.position.y + subdomainRow * SUBDOMAIN_GAP,
      };
    }
  });

  // Position bounded contexts (Level 2) within their parent subdomain
  const bcs = hierarchy.filter((c) => c.level === 2);
  bcs.forEach((bc, i) => {
    const parent = hierarchy.find((c) => c.id === bc.parent);
    if (parent && parent.position) {
      const bcRow = Math.floor(i / 2);
      const bcCol = i % 2;
      bc.position = {
        x: parent.position.x + bcCol * BC_GAP,
        y: parent.position.y + bcRow * BC_GAP,
      };
    }
  });

  // Position entities (Level 3) within their bounded context
  for (const bc of bcs) {
    if (!bc.position) continue;

    const entityCount = bc.entities.length;
    const entityCols = Math.ceil(Math.sqrt(entityCount));
    const bcPosition = bc.position;

    bc.entities.forEach((entity, i) => {
      const entityRow = Math.floor(i / entityCols);
      const entityCol = i % entityCols;

      positions[entity] = {
        x: bcPosition.x + entityCol * ENTITY_GAP,
        y: bcPosition.y + entityRow * ENTITY_GAP,
      };
    });
  }

  return positions;
}

/**
 * Calculate hierarchical layout metrics
 */
function calculateHierarchicalMetrics(
  hierarchy: HierarchicalCluster[],
  edges: ErdEdge[],
): {
  totalClusters: number;
  avgCrossClusterEdges: number;
  clusterSeparationScore: number;
  optimizationScore: number;
} {
  const totalClusters = hierarchy.length;

  // Calculate cross-cluster edge density at each level
  const levels = [0, 1, 2];
  let totalCrossDensity = 0;
  let levelCount = 0;

  for (const level of levels) {
    const clustersAtLevel = hierarchy.filter((c) => c.level === level);

    for (let i = 0; i < clustersAtLevel.length; i++) {
      for (let j = i + 1; j < clustersAtLevel.length; j++) {
        const cluster1 = clustersAtLevel[i];
        const cluster2 = clustersAtLevel[j];
        if (cluster1 && cluster2) {
          const entities1 = new Set(cluster1.entities);
          const entities2 = new Set(cluster2.entities);
          const density = calculateEdgeDensity(entities1, entities2, edges);
          totalCrossDensity += density;
          levelCount++;
        }
      }
    }
  }

  const avgCrossClusterEdges = levelCount > 0 ? totalCrossDensity / levelCount : 0;

  // Cluster separation score: lower cross-density = better separation
  const clusterSeparationScore = 1 - avgCrossClusterEdges;

  // Optimization score: balances cluster count and separation
  // Penalize too many clusters, reward good separation
  const clusterPenalty = totalClusters * 0.01;
  const optimizationScore = clusterSeparationScore - clusterPenalty;

  return {
    totalClusters,
    avgCrossClusterEdges,
    clusterSeparationScore,
    optimizationScore,
  };
}

/**
 * Main hierarchical layout function
 */
export function hierarchicalLayout(
  boundedContexts: BoundedContext[],
  edges: ErdEdge[],
): HierarchicalLayoutResult {
  // Build hierarchical structure
  const hierarchy = buildHierarchy(boundedContexts, edges);

  // Calculate positions
  const positions = calculateHierarchicalPositions(hierarchy, edges);

  // Calculate metrics
  const metrics = calculateHierarchicalMetrics(hierarchy, edges);

  return {
    clusters: hierarchy,
    positions,
    metrics,
  };
}

/**
 * Optimize hierarchical structure by merging/splitting clusters
 */
export function optimizeHierarchy(
  boundedContexts: BoundedContext[],
  edges: ErdEdge[],
  targetClusterCount?: number,
): HierarchicalLayoutResult {
  // If target cluster count is specified, use it
  // Otherwise, optimize automatically
  const allEntities = boundedContexts.flatMap((bc) => bc.entities);
  const optimalClusterCount = targetClusterCount || optimizeClusterCount(allEntities, edges);

  // Re-cluster bounded contexts to match optimal count
  const optimizedBCs = reclusterBoundedContexts(boundedContexts, optimalClusterCount, edges);

  // Generate hierarchical layout with optimized clusters
  return hierarchicalLayout(optimizedBCs, edges);
}

/**
 * Re-cluster bounded contexts to match target count
 */
function reclusterBoundedContexts(
  boundedContexts: BoundedContext[],
  targetCount: number,
  edges: ErdEdge[],
): BoundedContext[] {
  if (boundedContexts.length <= targetCount) {
    return boundedContexts;
  }

  // Merge bounded contexts with highest edge density
  const allEntities = boundedContexts.flatMap((bc) => bc.entities);
  const clusters = simpleKMeansClustering(allEntities, edges, targetCount);

  return clusters.map((cluster, i) => ({
    name: `Optimized Cluster ${i + 1}`,
    domain: "Commercial",
    subdomain: `Optimized ${i + 1}`,
    type: "Core",
    entities: cluster.entities,
  }));
}
