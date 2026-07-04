/**
 * Layout Performance Test
 * 
 * Runs cluster and hierarchical layouts with real API data
 * and compares them against the target layout.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { clusterLayout } from "../../src/views/ontology/useErdLayout";
import { hierarchicalLayout } from "../../src/views/ontology/hierarchicalLayout";
import { compareLayoutAgainstTarget, formatComparisonResult } from "../../src/views/ontology/layoutComparison";
import type { BoundedContext } from "../../src/views/ontology/useErdLayout";
import type { ErdEdge } from "../../src/views/ontology/useOntologyGraph";

// Fetch real data from API
let realBoundedContexts: BoundedContext[] = [];
let realEdges: ErdEdge[] = [];
let realLabels: string[] = [];

beforeAll(async () => {
  try {
    // Fetch bounded contexts
    const bcResponse = await fetch('http://127.0.0.1:8787/api/v1/ontology/bounded-contexts');
    const bcData = await bcResponse.json();
    
    realBoundedContexts = bcData.map((bc: any) => ({
      name: bc.name,
      domain: bc.domain,
      subdomain: bc.subdomain,
      type: bc.type,
      entities: bc.entities || [],
    }));

    // Fetch node labels
    const labelsResponse = await fetch('http://127.0.0.1:8787/api/v1/ontology/node-labels');
    const labelsData = await labelsResponse.json();
    realLabels = labelsData.map((l: any) => l.name);

    // Fetch edge types
    const edgesResponse = await fetch('http://127.0.0.1:8787/api/v1/ontology/edge-types');
    const edgesData = await edgesResponse.json();
    realEdges = edgesData.map((e: any, i: number) => ({
      id: e.id || `edge-${i}`,
      type: e.name,
      fromLabel: e.fromLabel,
      toLabel: e.toLabel,
      source: e,
    }));

    console.log(`Loaded ${realBoundedContexts.length} bounded contexts, ${realLabels.length} labels, ${realEdges.length} edges`);
  } catch (error) {
    console.error('Failed to fetch real data:', error);
    throw error;
  }
});

describe("Layout Performance with Real Data", () => {
  it("should run cluster layout and compare against target", () => {
    if (realBoundedContexts.length === 0) {
      console.log("Skipping: No bounded contexts available");
      return;
    }

    const clusterPositions = clusterLayout(realLabels, realBoundedContexts);
    const clusterComparison = compareLayoutAgainstTarget(clusterPositions, realEdges);

    console.log("\n=== CLUSTER LAYOUT VS TARGET ===");
    console.log(formatComparisonResult(clusterComparison));

    expect(clusterComparison.metrics.overallScore).toBeGreaterThan(0);
  });

  it("should run hierarchical layout and compare against target", () => {
    if (realBoundedContexts.length === 0) {
      console.log("Skipping: No bounded contexts available");
      return;
    }

    const hierarchicalResult = hierarchicalLayout(realBoundedContexts, realEdges);
    const hierarchicalComparison = compareLayoutAgainstTarget(hierarchicalResult.positions, realEdges);

    console.log("\n=== HIERARCHICAL LAYOUT VS TARGET ===");
    console.log(formatComparisonResult(hierarchicalComparison));

    expect(hierarchicalComparison.metrics.overallScore).toBeGreaterThan(0);
  });

  it("should compare cluster vs hierarchical performance", () => {
    if (realBoundedContexts.length === 0) {
      console.log("Skipping: No bounded contexts available");
      return;
    }

    const clusterPositions = clusterLayout(realLabels, realBoundedContexts);
    const clusterComparison = compareLayoutAgainstTarget(clusterPositions, realEdges);

    const hierarchicalResult = hierarchicalLayout(realBoundedContexts, realEdges);
    const hierarchicalComparison = compareLayoutAgainstTarget(hierarchicalResult.positions, realEdges);

    console.log("\n=== ALGORITHM COMPARISON ===");
    console.log(`Cluster Overall Score: ${clusterComparison.metrics.overallScore.toFixed(1)}/100`);
    console.log(`Hierarchical Overall Score: ${hierarchicalComparison.metrics.overallScore.toFixed(1)}/100`);
    console.log(`Score Difference: ${(hierarchicalComparison.metrics.overallScore - clusterComparison.metrics.overallScore).toFixed(1)}`);
    
    console.log(`\nCluster Position Error: ${clusterComparison.metrics.positionError.toFixed(0)}px`);
    console.log(`Hierarchical Position Error: ${hierarchicalComparison.metrics.positionError.toFixed(0)}px`);
    
    console.log(`\nCluster BC Alignment: ${clusterComparison.metrics.boundedContextAlignment.toFixed(1)}%`);
    console.log(`Hierarchical BC Alignment: ${hierarchicalComparison.metrics.boundedContextAlignment.toFixed(1)}%`);
    
    console.log(`\nCluster Edge Length: ${clusterComparison.details.edgeLengthComparison.candidate.toFixed(0)}px`);
    console.log(`Hierarchical Edge Length: ${hierarchicalComparison.details.edgeLengthComparison.candidate.toFixed(0)}px`);
    
    console.log(`\nCluster Separation: ${clusterComparison.metrics.clusterSeparationScore.toFixed(2)}x`);
    console.log(`Hierarchical Separation: ${hierarchicalComparison.metrics.clusterSeparationScore.toFixed(2)}x`);

    // Determine which is better
    const winner = hierarchicalComparison.metrics.overallScore > clusterComparison.metrics.overallScore
      ? "Hierarchical"
      : "Cluster";
    
    console.log(`\n=== WINNER: ${winner} ===`);
    console.log(`Winner score: ${Math.max(hierarchicalComparison.metrics.overallScore, clusterComparison.metrics.overallScore).toFixed(1)}/100`);

    expect(clusterComparison.metrics.overallScore).toBeGreaterThan(0);
    expect(hierarchicalComparison.metrics.overallScore).toBeGreaterThan(0);
  });
});
