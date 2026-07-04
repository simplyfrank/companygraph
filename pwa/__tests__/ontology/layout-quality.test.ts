/**
 * Layout Quality Test Suite
 * 
 * Measures and quantifies the goodness of fit of cluster organizations
 * by calculating total edge length and comparing different layout strategies.
 */

import { describe, it, expect } from "bun:test";
import type { ErdEdge } from "../../src/views/ontology/useOntologyGraph";
import { clusterLayout } from "../../src/views/ontology/useErdLayout";
import type { BoundedContext } from "../../src/views/ontology/useErdLayout";

// Mock data for testing
const MOCK_LABELS = [
  "Item", "Barcode", "Pack_Item", "Differentiator", "Product_Attributes",
  "Supplier", "Supplier_Site", "Purchase_Order", "PO_Detail", "Contract",
  "Regular_Retail_Price", "Price_Zone", "Price_Change", "Clearance_Markdown",
  "Promotion", "Simple_Discount_Offer", "Multi_Buy_Offer", "Coupon",
  "Assortment_Plan", "Item_Location_Ranging", "Listing_Delisting", "Planogram",
  "Allocation", "Allocation_Detail", "Replenishment_Parameters",
];

const MOCK_EDGES: ErdEdge[] = [
  { id: "1", type: "RELATES_TO", fromLabel: "Item", toLabel: "Barcode", source: {} as any },
  { id: "2", type: "RELATES_TO", fromLabel: "Item", toLabel: "Pack_Item", source: {} as any },
  { id: "3", type: "RELATES_TO", fromLabel: "Item", toLabel: "Regular_Retail_Price", source: {} as any },
  { id: "4", type: "RELATES_TO", fromLabel: "Supplier", toLabel: "Purchase_Order", source: {} as any },
  { id: "5", type: "RELATES_TO", fromLabel: "Purchase_Order", toLabel: "PO_Detail", source: {} as any },
  { id: "6", type: "RELATES_TO", fromLabel: "Regular_Retail_Price", toLabel: "Promotion", source: {} as any },
  { id: "7", type: "RELATES_TO", fromLabel: "Assortment_Plan", toLabel: "Item_Location_Ranging", source: {} as any },
  { id: "8", type: "RELATES_TO", fromLabel: "Allocation", toLabel: "Allocation_Detail", source: {} as any },
];

const MOCK_BOUNDED_CONTEXTS: BoundedContext[] = [
  {
    name: "BC1 Product Catalogue",
    domain: "Commercial",
    subdomain: "3.A",
    type: "Core",
    entities: ["Item", "Barcode", "Pack_Item", "Differentiator", "Product_Attributes"],
  },
  {
    name: "BC3 Supplier & Procurement",
    domain: "Commercial",
    subdomain: "3.C",
    type: "Core",
    entities: ["Supplier", "Supplier_Site", "Purchase_Order", "PO_Detail", "Contract"],
  },
  {
    name: "BC4 Pricing & Markdown",
    domain: "Commercial",
    subdomain: "3.E",
    type: "Core",
    entities: ["Regular_Retail_Price", "Price_Zone", "Price_Change", "Clearance_Markdown"],
  },
  {
    name: "BC5 Promotion Management",
    domain: "Commercial",
    subdomain: "3.F",
    type: "Core",
    entities: ["Promotion", "Simple_Discount_Offer", "Multi_Buy_Offer", "Coupon"],
  },
  {
    name: "BC6 Assortment & Range",
    domain: "Commercial",
    subdomain: "3.G",
    type: "Core",
    entities: ["Assortment_Plan", "Item_Location_Ranging", "Listing_Delisting", "Planogram"],
  },
  {
    name: "BC7 Allocation & Replenishment",
    domain: "Commercial",
    subdomain: "3.H",
    type: "Supporting",
    entities: ["Allocation", "Allocation_Detail", "Replenishment_Parameters"],
  },
];

/**
 * Calculate Euclidean distance between two points
 */
function distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate total edge length for a given layout
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
 * Calculate intra-cluster edge length (edges within same bounded context)
 */
function calculateIntraClusterEdgeLength(
  positions: Record<string, { x: number; y: number }>,
  edges: ErdEdge[],
  boundedContexts: BoundedContext[],
): { total: number; count: number; avg: number } {
  // Build entity → bounded context mapping
  const entityToContext = new Map<string, string>();
  for (const bc of boundedContexts) {
    for (const entity of bc.entities) {
      entityToContext.set(entity, bc.name);
    }
  }

  let totalLength = 0;
  let count = 0;

  for (const edge of edges) {
    const fromContext = entityToContext.get(edge.fromLabel);
    const toContext = entityToContext.get(edge.toLabel);

    if (fromContext && toContext && fromContext === toContext) {
      const fromPos = positions[edge.fromLabel];
      const toPos = positions[edge.toLabel];

      if (fromPos && toPos) {
        totalLength += distance(fromPos, toPos);
        count++;
      }
    }
  }

  return {
    total: totalLength,
    count,
    avg: count > 0 ? totalLength / count : 0,
  };
}

/**
 * Calculate inter-cluster edge length (edges between different bounded contexts)
 */
function calculateInterClusterEdgeLength(
  positions: Record<string, { x: number; y: number }>,
  edges: ErdEdge[],
  boundedContexts: BoundedContext[],
): { total: number; count: number; avg: number } {
  // Build entity → bounded context mapping
  const entityToContext = new Map<string, string>();
  for (const bc of boundedContexts) {
    for (const entity of bc.entities) {
      entityToContext.set(entity, bc.name);
    }
  }

  let totalLength = 0;
  let count = 0;

  for (const edge of edges) {
    const fromContext = entityToContext.get(edge.fromLabel);
    const toContext = entityToContext.get(edge.toLabel);

    if (fromContext && toContext && fromContext !== toContext) {
      const fromPos = positions[edge.fromLabel];
      const toPos = positions[edge.toLabel];

      if (fromPos && toPos) {
        totalLength += distance(fromPos, toPos);
        count++;
      }
    }
  }

  return {
    total: totalLength,
    count,
    avg: count > 0 ? totalLength / count : 0,
  };
}

/**
 * Calculate layout quality score
 * Higher score = better layout (shorter edges, better clustering)
 */
function calculateLayoutQuality(
  positions: Record<string, { x: number; y: number }>,
  edges: ErdEdge[],
  boundedContexts: BoundedContext[],
): {
  totalEdgeLength: number;
  intraClusterAvg: number;
  interClusterAvg: number;
  qualityScore: number;
  clusterSeparationRatio: number;
} {
  const totalEdgeLength = calculateTotalEdgeLength(positions, edges);
  const intraCluster = calculateIntraClusterEdgeLength(positions, edges, boundedContexts);
  const interCluster = calculateInterClusterEdgeLength(positions, edges, boundedContexts);

  // Quality score: lower total edge length is better
  // Normalize by dividing by a reference value (e.g., 1000px)
  const qualityScore = 1000 / (totalEdgeLength + 1);

  // Cluster separation ratio: higher is better (clusters well-separated)
  const clusterSeparationRatio = intraCluster.avg > 0 ? interCluster.avg / intraCluster.avg : 0;

  return {
    totalEdgeLength,
    intraClusterAvg: intraCluster.avg,
    interClusterAvg: interCluster.avg,
    qualityScore,
    clusterSeparationRatio,
  };
}

describe("Layout Quality Measurements", () => {
  describe("Cluster Layout Algorithm", () => {
    it("should generate positions for all labels", () => {
      const positions = clusterLayout(MOCK_LABELS, MOCK_BOUNDED_CONTEXTS);

      expect(Object.keys(positions).length).toBeGreaterThan(0);
      
      // All labels should have positions
      for (const label of MOCK_LABELS) {
        if (MOCK_BOUNDED_CONTEXTS.some(bc => bc.entities.includes(label))) {
          expect(positions[label]).toBeDefined();
          expect(typeof positions[label].x).toBe("number");
          expect(typeof positions[label].y).toBe("number");
        }
      }
    });

    it("should group entities by bounded context", () => {
      const positions = clusterLayout(MOCK_LABELS, MOCK_BOUNDED_CONTEXTS);

      // Calculate distances between entities in same bounded context
      const bc1Entities = MOCK_BOUNDED_CONTEXTS[0].entities;
      const bc1Positions = bc1Entities
        .map(e => positions[e])
        .filter((p): p is { x: number; y: number } => p !== undefined);

      // Calculate average distance within BC1
      let totalDist = 0;
      let count = 0;
      for (let i = 0; i < bc1Positions.length; i++) {
        for (let j = i + 1; j < bc1Positions.length; j++) {
          totalDist += distance(bc1Positions[i], bc1Positions[j]);
          count++;
        }
      }
      const avgIntraClusterDist = count > 0 ? totalDist / count : 0;

      // Calculate distances between entities in different bounded contexts
      const bc2Entities = MOCK_BOUNDED_CONTEXTS[1].entities;
      const bc2Positions = bc2Entities
        .map(e => positions[e])
        .filter((p): p is { x: number; y: number } => p !== undefined);

      let totalInterDist = 0;
      let interCount = 0;
      for (const p1 of bc1Positions) {
        for (const p2 of bc2Positions) {
          totalInterDist += distance(p1, p2);
          interCount++;
        }
      }
      const avgInterClusterDist = interCount > 0 ? totalInterDist / interCount : 0;

      // Inter-cluster distance should be significantly larger than intra-cluster
      expect(avgInterClusterDist).toBeGreaterThan(avgIntraClusterDist);
    });

    it("should arrange clusters in a grid pattern", () => {
      const positions = clusterLayout(MOCK_LABELS, MOCK_BOUNDED_CONTEXTS);

      // Get cluster centers
      const clusterCenters = MOCK_BOUNDED_CONTEXTS.map(bc => {
        const bcPositions = bc.entities
          .map(e => positions[e])
          .filter((p): p is { x: number; y: number } => p !== undefined);

        if (bcPositions.length === 0) return null;

        const avgX = bcPositions.reduce((sum, p) => sum + p.x, 0) / bcPositions.length;
        const avgY = bcPositions.reduce((sum, p) => sum + p.y, 0) / bcPositions.length;

        return { x: avgX, y: avgY };
      }).filter((c): c is { x: number; y: number } => c !== null);

      // Check that clusters are separated
      const minClusterDistance = Math.min(
        ...clusterCenters.flatMap((c1, i) =>
          clusterCenters.slice(i + 1).map(c2 => distance(c1, c2))
        )
      );

      // Clusters should be at least 300px apart
      expect(minClusterDistance).toBeGreaterThan(300);
    });
  });

  describe("Edge Length Calculations", () => {
    it("should calculate total edge length correctly", () => {
      const positions = clusterLayout(MOCK_LABELS, MOCK_BOUNDED_CONTEXTS);
      const totalLength = calculateTotalEdgeLength(positions, MOCK_EDGES);

      expect(totalLength).toBeGreaterThan(0);
      expect(totalLength).toBeFinite();
    });

    it("should distinguish intra-cluster from inter-cluster edges", () => {
      const positions = clusterLayout(MOCK_LABELS, MOCK_BOUNDED_CONTEXTS);
      const intraCluster = calculateIntraClusterEdgeLength(positions, MOCK_EDGES, MOCK_BOUNDED_CONTEXTS);
      const interCluster = calculateInterClusterEdgeLength(positions, MOCK_EDGES, MOCK_BOUNDED_CONTEXTS);

      // Both should have valid values
      expect(intraCluster.avg).toBeGreaterThanOrEqual(0);
      expect(interCluster.avg).toBeGreaterThanOrEqual(0);

      // Inter-cluster edges should be longer on average
      expect(interCluster.avg).toBeGreaterThan(intraCluster.avg);
    });
  });

  describe("Layout Quality Scoring", () => {
    it("should calculate quality score for cluster layout", () => {
      const positions = clusterLayout(MOCK_LABELS, MOCK_BOUNDED_CONTEXTS);
      const quality = calculateLayoutQuality(positions, MOCK_EDGES, MOCK_BOUNDED_CONTEXTS);

      expect(quality.totalEdgeLength).toBeGreaterThan(0);
      expect(quality.intraClusterAvg).toBeGreaterThan(0);
      expect(quality.interClusterAvg).toBeGreaterThan(0);
      expect(quality.qualityScore).toBeGreaterThan(0);
      expect(quality.clusterSeparationRatio).toBeGreaterThan(1);
    });

    it("should reward layouts with shorter edges", () => {
      // Create a compact layout (good)
      const compactPositions: Record<string, { x: number; y: number }> = {};
      MOCK_LABELS.forEach((label, i) => {
        compactPositions[label] = { x: (i % 5) * 50, y: Math.floor(i / 5) * 50 };
      });

      // Create a spread layout (bad)
      const spreadPositions: Record<string, { x: number; y: number }> = {};
      MOCK_LABELS.forEach((label, i) => {
        spreadPositions[label] = { x: (i % 5) * 500, y: Math.floor(i / 5) * 500 };
      });

      const compactQuality = calculateLayoutQuality(compactPositions, MOCK_EDGES, MOCK_BOUNDED_CONTEXTS);
      const spreadQuality = calculateLayoutQuality(spreadPositions, MOCK_EDGES, MOCK_BOUNDED_CONTEXTS);

      // Compact layout should have higher quality score
      expect(compactQuality.qualityScore).toBeGreaterThan(spreadQuality.qualityScore);
    });

    it("should reward layouts with good cluster separation", () => {
      const positions = clusterLayout(MOCK_LABELS, MOCK_BOUNDED_CONTEXTS);
      const quality = calculateLayoutQuality(positions, MOCK_EDGES, MOCK_BOUNDED_CONTEXTS);

      // Cluster separation ratio should be > 1 (inter-cluster > intra-cluster)
      expect(quality.clusterSeparationRatio).toBeGreaterThan(1);
    });
  });

  describe("Layout Comparison Tests", () => {
    it("should compare cluster layout against random layout", () => {
      const clusterPositions = clusterLayout(MOCK_LABELS, MOCK_BOUNDED_CONTEXTS);

      // Generate random positions
      const randomPositions: Record<string, { x: number; y: number }> = {};
      MOCK_LABELS.forEach((label) => {
        randomPositions[label] = {
          x: Math.random() * 2000,
          y: Math.random() * 2000,
        };
      });

      const clusterQuality = calculateLayoutQuality(clusterPositions, MOCK_EDGES, MOCK_BOUNDED_CONTEXTS);
      const randomQuality = calculateLayoutQuality(randomPositions, MOCK_EDGES, MOCK_BOUNDED_CONTEXTS);

      // Cluster layout should have better quality score
      expect(clusterQuality.qualityScore).toBeGreaterThan(randomQuality.qualityScore);

      // Cluster layout should have better cluster separation
      expect(clusterQuality.clusterSeparationRatio).toBeGreaterThan(randomQuality.clusterSeparationRatio);
    });

    it("should measure improvement from baseline", () => {
      const clusterPositions = clusterLayout(MOCK_LABELS, MOCK_BOUNDED_CONTEXTS);
      const clusterQuality = calculateLayoutQuality(clusterPositions, MOCK_EDGES, MOCK_BOUNDED_CONTEXTS);

      // Baseline: random spread layout (unorganized)
      const baselinePositions: Record<string, { x: number; y: number }> = {};
      MOCK_LABELS.forEach((label) => {
        baselinePositions[label] = {
          x: Math.random() * 2000,
          y: Math.random() * 2000,
        };
      });

      const baselineQuality = calculateLayoutQuality(baselinePositions, MOCK_EDGES, MOCK_BOUNDED_CONTEXTS);

      // Cluster layout should have lower total edge length than random baseline
      expect(clusterQuality.totalEdgeLength).toBeLessThan(baselineQuality.totalEdgeLength);

      // Cluster layout should have better cluster separation
      expect(clusterQuality.clusterSeparationRatio).toBeGreaterThan(baselineQuality.clusterSeparationRatio);

      console.log(`Cluster layout total edge length: ${clusterQuality.totalEdgeLength.toFixed(2)}px`);
      console.log(`Baseline total edge length: ${baselineQuality.totalEdgeLength.toFixed(2)}px`);
      console.log(`Cluster separation ratio: ${clusterQuality.clusterSeparationRatio.toFixed(2)}`);
    });
  });

  describe("Regression Tests", () => {
    it("should maintain consistent layout quality over time", () => {
      const positions1 = clusterLayout(MOCK_LABELS, MOCK_BOUNDED_CONTEXTS);
      const positions2 = clusterLayout(MOCK_LABELS, MOCK_BOUNDED_CONTEXTS);

      const quality1 = calculateLayoutQuality(positions1, MOCK_EDGES, MOCK_BOUNDED_CONTEXTS);
      const quality2 = calculateLayoutQuality(positions2, MOCK_EDGES, MOCK_BOUNDED_CONTEXTS);

      // Layout should be deterministic
      expect(quality1.totalEdgeLength).toBe(quality2.totalEdgeLength);
      expect(quality1.qualityScore).toBe(quality2.qualityScore);
    });

    it("should handle empty bounded contexts gracefully", () => {
      const emptyBCs: BoundedContext[] = [
        { name: "Empty BC", domain: "Test", subdomain: "1", type: "Core", entities: [] },
      ];

      const positions = clusterLayout(MOCK_LABELS, emptyBCs);
      const quality = calculateLayoutQuality(positions, MOCK_EDGES, emptyBCs);

      // Should still generate positions
      expect(Object.keys(positions).length).toBeGreaterThanOrEqual(0);
      expect(quality.totalEdgeLength).toBeGreaterThanOrEqual(0);
    });
  });
});
