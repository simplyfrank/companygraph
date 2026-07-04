/**
 * Layout Measurement Script
 * Run this in browser console to measure cluster layout effectiveness
 */

// Run this in browser console after the ERD loads
async function measureLayout() {
  // Get all entity positions from the DOM
  const entityElements = document.querySelectorAll('[data-label]');
  const positions: Record<string, { x: number; y: number }> = {};
  
  entityElements.forEach((el) => {
    const label = el.getAttribute('data-label');
    if (label) {
      const transform = el.getAttribute('transform');
      if (transform) {
        const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (match && match[1] && match[2]) {
          positions[label] = {
            x: parseFloat(match[1]),
            y: parseFloat(match[2])
          };
        }
      }
    }
  });

  // Fetch bounded contexts from API
  let boundedContexts: Array<{ name: string; entities: string[] }> = [];
  try {
    const response = await fetch('/api/v1/ontology/bounded-contexts');
    const data = await response.json();
    boundedContexts = data.map((bc: any) => ({
      name: bc.name,
      entities: bc.entities || []
    }));
  } catch (error) {
    console.error('Failed to fetch bounded contexts from API:', error);
    console.log('Using fallback: no bounded contexts available');
  }

  // Calculate intra-cluster distances (within same bounded context)
  const intraClusterDistances: number[] = [];
  const intraClusterStats: Record<string, { total: number; count: number; avg: number }> = {};

  boundedContexts.forEach((bc) => {
    const bcPositions = bc.entities
      .map((e) => positions[e])
      .filter((p): p is NonNullable<typeof p> => p !== undefined);

    let total = 0;
    let count = 0;

    for (let i = 0; i < bcPositions.length; i++) {
      for (let j = i + 1; j < bcPositions.length; j++) {
        const p1 = bcPositions[i]!;
        const p2 = bcPositions[j]!;
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        total += dist;
        count++;
        intraClusterDistances.push(dist);
      }
    }

    intraClusterStats[bc.name] = {
      total,
      count,
      avg: count > 0 ? total / count : 0
    };
  });

  // Calculate inter-cluster distances (between different bounded contexts)
  const interClusterDistances: number[] = [];
  const interClusterStats: Record<string, { total: number; count: number; avg: number }> = {};

  for (let i = 0; i < boundedContexts.length; i++) {
    for (let j = i + 1; j < boundedContexts.length; j++) {
      const bc1 = boundedContexts[i]!;
      const bc2 = boundedContexts[j]!;

      const bc1Positions = bc1.entities
        .map((e) => positions[e])
        .filter((p): p is NonNullable<typeof p> => p !== undefined);
      const bc2Positions = bc2.entities
        .map((e) => positions[e])
        .filter((p): p is NonNullable<typeof p> => p !== undefined);

      let total = 0;
      let count = 0;

      for (const p1 of bc1Positions) {
        for (const p2 of bc2Positions) {
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          total += dist;
          count++;
          interClusterDistances.push(dist);
        }
      }

      const key = `${bc1.name} ↔ ${bc2.name}`;
      interClusterStats[key] = {
        total,
        count,
        avg: count > 0 ? total / count : 0
      };
    }
  }

  // Calculate statistics
  const avgIntra = intraClusterDistances.length > 0
    ? intraClusterDistances.reduce((a, b) => a + b, 0) / intraClusterDistances.length
    : 0;
  const avgInter = interClusterDistances.length > 0
    ? interClusterDistances.reduce((a, b) => a + b, 0) / interClusterDistances.length
    : 0;

  const minIntra = Math.min(...intraClusterDistances);
  const maxIntra = Math.max(...intraClusterDistances);
  const minInter = Math.min(...interClusterDistances);
  const maxInter = Math.max(...interClusterDistances);

  // Layout quality score: ratio of inter-cluster to intra-cluster distance
  const qualityScore = avgIntra > 0 ? avgInter / avgIntra : 0;

  console.log('=== LAYOUT MEASUREMENT RESULTS ===');
  console.log('\nIntra-Cluster Distances (within same BC):');
  console.log(`  Average: ${avgIntra.toFixed(2)}px`);
  console.log(`  Min: ${minIntra.toFixed(2)}px`);
  console.log(`  Max: ${maxIntra.toFixed(2)}px`);
  console.log(`  Total pairs: ${intraClusterDistances.length}`);

  console.log('\nInter-Cluster Distances (between different BCs):');
  console.log(`  Average: ${avgInter.toFixed(2)}px`);
  console.log(`  Min: ${minInter.toFixed(2)}px`);
  console.log(`  Max: ${maxInter.toFixed(2)}px`);
  console.log(`  Total pairs: ${interClusterDistances.length}`);

  console.log('\nLayout Quality Score:');
  console.log(`  Inter/Intra Ratio: ${qualityScore.toFixed(2)}`);
  console.log(`  Higher is better (clusters well-separated)`);

  console.log('\nPer-Bounded Context Intra-Cluster Stats:');
  Object.entries(intraClusterStats).forEach(([bc, stats]) => {
    console.log(`  ${bc}: ${stats.avg.toFixed(2)}px avg (${stats.count} pairs)`);
  });

  console.log('\nWorst Inter-Cluster Separations (lowest avg distance):');
  const sortedInter = Object.entries(interClusterStats).sort((a, b) => a[1].avg - b[1].avg);
  sortedInter.slice(0, 5).forEach(([key, stats]) => {
    console.log(`  ${key}: ${stats.avg.toFixed(2)}px avg`);
  });

  return {
    intraCluster: { avg: avgIntra, min: minIntra, max: maxIntra, count: intraClusterDistances.length },
    interCluster: { avg: avgInter, min: minInter, max: maxInter, count: interClusterDistances.length },
    qualityScore,
    intraClusterStats,
    interClusterStats
  };
}

// Export for use in console
(window as any).measureLayout = measureLayout;
console.log('Layout measurement function loaded. Run measureLayout() in console to analyze.');
