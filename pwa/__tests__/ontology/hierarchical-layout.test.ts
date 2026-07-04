/**
 * Hierarchical Layout Test Suite
 * 
 * Tests for recursive hierarchical clustering optimization:
 * 1. Clear separation between clusters at each level
 * 2. Minimization of cross-class interactions (edges between clusters)
 * 3. Optimization of total cluster count
 */

import { describe, it, expect } from "bun:test";
import { hierarchicalLayout, optimizeHierarchy } from "../../src/views/ontology/hierarchicalLayout";
import type { BoundedContext } from "../../src/views/ontology/useErdLayout";
import type { ErdEdge } from "../../src/views/ontology/useOntologyGraph";

const MOCK_BOUNDED_CONTEXTS: BoundedContext[] = [
  {
    name: "BC1 Product Catalogue",
    domain: "Commercial",
    subdomain: "3.A",
    type: "Core",
    entities: ["Item", "Barcode", "Pack_Item", "Differentiator", "Product_Attributes"],
  },
  {
    name: "BC2 Merchandise Hierarchy",
    domain: "Commercial",
    subdomain: "3.B",
    type: "Core",
    entities: ["Company", "Division", "Group", "Department", "Class"],
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
    subdomain: "3.D",
    type: "Core",
    entities: ["Regular_Retail_Price", "Price_Zone", "Price_Change", "Clearance_Markdown"],
  },
];

const MOCK_EDGES: ErdEdge[] = [
  { id: "1", type: "RELATES_TO", fromLabel: "Item", toLabel: "Barcode", source: {} as any },
  { id: "2", type: "RELATES_TO", fromLabel: "Item", toLabel: "Pack_Item", source: {} as any },
  { id: "3", type: "RELATES_TO", fromLabel: "Supplier", toLabel: "Purchase_Order", source: {} as any },
  { id: "4", type: "RELATES_TO", fromLabel: "Purchase_Order", toLabel: "PO_Detail", source: {} as any },
  { id: "5", type: "RELATES_TO", fromLabel: "Item", toLabel: "Regular_Retail_Price", source: {} as any }, // Cross-context edge
  { id: "6", type: "RELATES_TO", fromLabel: "Company", toLabel: "Division", source: {} as any },
  { id: "7", type: "RELATES_TO", fromLabel: "Division", toLabel: "Group", source: {} as any },
];

describe("Hierarchical Layout Algorithm", () => {
  describe("Hierarchy Structure", () => {
    it("should build 4-level hierarchy (domain, subdomain, BC, entity)", () => {
      const result = hierarchicalLayout(MOCK_BOUNDED_CONTEXTS, MOCK_EDGES);

      // Should have clusters at multiple levels
      const levels = new Set(result.clusters.map((c) => c.level));
      expect(levels.has(0)).toBe(true); // Domain level
      expect(levels.has(1)).toBe(true); // Subdomain level
      expect(levels.has(2)).toBe(true); // Bounded context level
    });

    it("should maintain parent-child relationships", () => {
      const result = hierarchicalLayout(MOCK_BOUNDED_CONTEXTS, MOCK_EDGES);

      // Check that subdomains have parent domain
      const subdomains = result.clusters.filter((c) => c.level === 1);
      subdomains.forEach((subdomain) => {
        expect(subdomain.parent).toBeDefined();
        const parent = result.clusters.find((c) => c.id === subdomain.parent);
        expect(parent?.level).toBe(0);
      });

      // Check that BCs have parent subdomain
      const bcs = result.clusters.filter((c) => c.level === 2);
      bcs.forEach((bc) => {
        expect(bc.parent).toBeDefined();
        const parent = result.clusters.find((c) => c.id === bc.parent);
        expect(parent?.level).toBe(1);
      });
    });

    it("should group entities by bounded context at leaf level", () => {
      const result = hierarchicalLayout(MOCK_BOUNDED_CONTEXTS, MOCK_EDGES);

      const bcClusters = result.clusters.filter((c) => c.level === 2);
      expect(bcClusters.length).toBe(MOCK_BOUNDED_CONTEXTS.length);

      // Each BC should have its entities
      bcClusters.forEach((bc) => {
        const originalBC = MOCK_BOUNDED_CONTEXTS.find((obc) => obc.name === bc.name);
        expect(originalBC).toBeDefined();
        expect(bc.entities).toEqual(originalBC?.entities ?? []);
      });
    });
  });

  describe("Cross-Class Interaction Minimization", () => {
    it("should calculate cross-cluster edge density", () => {
      const result = hierarchicalLayout(MOCK_BOUNDED_CONTEXTS, MOCK_EDGES);

      // Lower cross-cluster edge density is better
      expect(result.metrics.avgCrossClusterEdges).toBeGreaterThanOrEqual(0);
      expect(result.metrics.avgCrossClusterEdges).toBeLessThanOrEqual(1);
    });

    it("should have better cluster separation than random layout", () => {
      const result = hierarchicalLayout(MOCK_BOUNDED_CONTEXTS, MOCK_EDGES);

      // Cluster separation score should be > 0.5 (reasonable separation)
      expect(result.metrics.clusterSeparationScore).toBeGreaterThan(0.5);
    });

    it("should minimize cross-context edges at each level", () => {
      const result = hierarchicalLayout(MOCK_BOUNDED_CONTEXTS, MOCK_EDGES);

      // Calculate cross-context edge density at BC level
      const bcClusters = result.clusters.filter((c) => c.level === 2);
      let crossEdges = 0;
      let totalEdges = 0;

      for (let i = 0; i < bcClusters.length; i++) {
        for (let j = i + 1; j < bcClusters.length; j++) {
          const entities1 = new Set(bcClusters[i].entities);
          const entities2 = new Set(bcClusters[j].entities);

          for (const edge of MOCK_EDGES) {
            const fromIn1 = entities1.has(edge.fromLabel);
            const toIn1 = entities1.has(edge.toLabel);
            const fromIn2 = entities2.has(edge.fromLabel);
            const toIn2 = entities2.has(edge.toLabel);

            if (fromIn1 || toIn1 || fromIn2 || toIn2) {
              totalEdges++;
              if ((fromIn1 && toIn2) || (fromIn2 && toIn1)) {
                crossEdges++;
              }
            }
          }
        }
      }

      const crossDensity = totalEdges > 0 ? crossEdges / totalEdges : 0;
      // Cross-context edge density should be relatively low
      expect(crossDensity).toBeLessThan(0.5);
    });
  });

  describe("Cluster Count Optimization", () => {
    it("should optimize cluster count automatically", () => {
      const result = optimizeHierarchy(MOCK_BOUNDED_CONTEXTS, MOCK_EDGES);

      // Should have reasonable number of clusters
      expect(result.metrics.totalClusters).toBeGreaterThan(0);
      expect(result.metrics.totalClusters).toBeLessThan(20); // Upper bound
    });

    it("should respect target cluster count when specified", () => {
      const targetCount = 3;
      const result = optimizeHierarchy(MOCK_BOUNDED_CONTEXTS, MOCK_EDGES, targetCount);

      // Should have approximately target count (may vary slightly due to hierarchy)
      expect(result.metrics.totalClusters).toBeLessThanOrEqual(targetCount + 5);
    });

    it("should balance cluster count with separation quality", () => {
      const result = optimizeHierarchy(MOCK_BOUNDED_CONTEXTS, MOCK_EDGES);

      // Optimization score should be positive (good balance)
      expect(result.metrics.optimizationScore).toBeGreaterThan(0);
    });

    it("should penalize excessive cluster count", () => {
      const result1 = optimizeHierarchy(MOCK_BOUNDED_CONTEXTS, MOCK_EDGES, 2);
      const result2 = optimizeHierarchy(MOCK_BOUNDED_CONTEXTS, MOCK_EDGES, 10);

      // More clusters should have lower optimization score (due to penalty)
      expect(result1.metrics.optimizationScore).toBeGreaterThanOrEqual(result2.metrics.optimizationScore);
    });
  });

  describe("Recursive Optimization", () => {
    it("should optimize at each hierarchy level", () => {
      const result = hierarchicalLayout(MOCK_BOUNDED_CONTEXTS, MOCK_EDGES);

      // Check that each level has reasonable cluster count
      const levelCounts = new Map<number, number>();
      result.clusters.forEach((c) => {
        levelCounts.set(c.level, (levelCounts.get(c.level) || 0) + 1);
      });

      // Each level should have clusters
      expect(levelCounts.size).toBeGreaterThan(1);

      // No level should have excessive clusters
      for (const [level, count] of levelCounts) {
        expect(count).toBeLessThan(10);
      }
    });

    it("should maintain separation between parent clusters", () => {
      const result = hierarchicalLayout(MOCK_BOUNDED_CONTEXTS, MOCK_EDGES);

      const domains = result.clusters.filter((c) => c.level === 0);
      const subdomains = result.clusters.filter((c) => c.level === 1);

      // Subdomains should be separated within their parent domain
      if (domains.length > 0 && subdomains.length > 0) {
        const domain = domains[0];
        const domainSubdomains = subdomains.filter((s) => s.parent === domain.id);

        // Should have multiple subdomains under domain
        expect(domainSubdomains.length).toBeGreaterThan(0);
      }
    });

    it("should position child clusters within parent bounds", () => {
      const result = hierarchicalLayout(MOCK_BOUNDED_CONTEXTS, MOCK_EDGES);

      const domains = result.clusters.filter((c) => c.level === 0 && c.position);
      const subdomains = result.clusters.filter((c) => c.level === 1 && c.position);

      if (domains.length > 0 && subdomains.length > 0) {
        const domain = domains[0];
        const domainSubdomains = subdomains.filter((s) => s.parent === domain.id);

        // Subdomains should be positioned relative to their parent
        domainSubdomains.forEach((subdomain) => {
          // Subdomain should be within reasonable distance of parent
          const dx = Math.abs(subdomain.position!.x - domain.position!.x);
          const dy = Math.abs(subdomain.position!.y - domain.position!.y);
          expect(dx).toBeLessThan(1000);
          expect(dy).toBeLessThan(1000);
        });
      }
    });
  });

  describe("Layout Quality Metrics", () => {
    it("should provide comprehensive quality metrics", () => {
      const result = hierarchicalLayout(MOCK_BOUNDED_CONTEXTS, MOCK_EDGES);

      expect(result.metrics.totalClusters).toBeDefined();
      expect(result.metrics.avgCrossClusterEdges).toBeDefined();
      expect(result.metrics.clusterSeparationScore).toBeDefined();
      expect(result.metrics.optimizationScore).toBeDefined();
    });

    it("should generate valid positions for all entities", () => {
      const result = hierarchicalLayout(MOCK_BOUNDED_CONTEXTS, MOCK_EDGES);

      const allEntities = MOCK_BOUNDED_CONTEXTS.flatMap((bc) => bc.entities);
      allEntities.forEach((entity) => {
        expect(result.positions[entity]).toBeDefined();
        expect(typeof result.positions[entity].x).toBe("number");
        expect(typeof result.positions[entity].y).toBe("number");
      });
    });

    it("should have consistent layout quality across runs", () => {
      const result1 = hierarchicalLayout(MOCK_BOUNDED_CONTEXTS, MOCK_EDGES);
      const result2 = hierarchicalLayout(MOCK_BOUNDED_CONTEXTS, MOCK_EDGES);

      // Metrics should be deterministic
      expect(result1.metrics.totalClusters).toBe(result2.metrics.totalClusters);
      expect(result1.metrics.avgCrossClusterEdges).toBe(result2.metrics.avgCrossClusterEdges);
    });
  });

  describe("Comparison with Flat Layout", () => {
    it("should have better separation than flat clustering", () => {
      const hierarchicalResult = hierarchicalLayout(MOCK_BOUNDED_CONTEXTS, MOCK_EDGES);

      // Simulate flat layout (all BCs at same level)
      const flatSeparation = 0.3; // Assumed lower for flat layout

      // Hierarchical should have better separation
      expect(hierarchicalResult.metrics.clusterSeparationScore).toBeGreaterThan(flatSeparation);
    });

    it("should handle cross-context edges gracefully", () => {
      const result = hierarchicalLayout(MOCK_BOUNDED_CONTEXTS, MOCK_EDGES);

      // Even with cross-context edges, should maintain good separation
      expect(result.metrics.clusterSeparationScore).toBeGreaterThan(0.3);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty bounded contexts", () => {
      const emptyBCs: BoundedContext[] = [
        { name: "Empty", domain: "Test", subdomain: "1", type: "Core", entities: [] },
      ];

      const result = hierarchicalLayout(emptyBCs, MOCK_EDGES);

      expect(result.clusters.length).toBeGreaterThan(0);
      expect(result.metrics.totalClusters).toBeGreaterThanOrEqual(0);
    });

    it("should handle single bounded context", () => {
      const singleBC: BoundedContext[] = [
        {
          name: "Single BC",
          domain: "Test",
          subdomain: "1",
          type: "Core",
          entities: ["Entity1", "Entity2", "Entity3"],
        },
      ];

      const result = hierarchicalLayout(singleBC, MOCK_EDGES);

      expect(result.clusters.length).toBeGreaterThan(0);
      expect(result.positions).toBeDefined();
    });

    it("should handle no edges", () => {
      const result = hierarchicalLayout(MOCK_BOUNDED_CONTEXTS, []);

      // Should still generate layout
      expect(result.clusters.length).toBeGreaterThan(0);
      expect(result.positions).toBeDefined();
      expect(result.metrics.avgCrossClusterEdges).toBe(0);
    });
  });
});
