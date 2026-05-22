// T-13 — Edge-type endpoint cache (design §6.2 + FR-04a).
//
// LRU, TTL 60 s, capacity 256. Cache key is the edge-type name; cache
// value is the `(fromLabel, toLabel)` pair list for that type.
//
// Backs the refactored `graph-core/storage/edges.ts` validator (T-14):
//
//   const allowed = await getEdgeEndpoints(input.type);
//   if (!allowed.some(([f, t]) => f === fromLabel && t === toLabel)) { … }
//
// FR-04a latency budget: cache-hit ≤ 1 ms p99; cache-miss ≤ 50 ms p99
// (one indexed Cypher query against `_OntologyEdgeEndpoint` keyed by
// `edge_type_name`).
//
// Uniform global invalidation per pass-1 C-01.

import { LRUCache } from "lru-cache";
import type { Driver } from "neo4j-driver";
import { getDriver } from "../../neo4j/driver";
import { ontologyEvents } from "../events";

const cache = new LRUCache<string, ReadonlyArray<readonly [string, string]>>({
  max: 256,
  ttl: 60_000,
});

ontologyEvents.on("ontology.changed", () => cache.clear());

async function loadFromRegistry(
  driver: Driver,
  type: string,
): Promise<ReadonlyArray<readonly [string, string]>> {
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `MATCH (ep:_OntologyEdgeEndpoint {edge_type_name: $type})
       RETURN ep.from_label AS f, ep.to_label AS t
       ORDER BY f, t`,
      { type },
    );
    return r.records.map(
      (rec) =>
        [rec.get("f") as string, rec.get("t") as string] as readonly [
          string,
          string,
        ],
    );
  } finally {
    await session.close();
  }
}

export async function getEdgeEndpoints(
  type: string,
  driverOverride?: Driver,
): Promise<ReadonlyArray<readonly [string, string]>> {
  const hit = cache.get(type);
  if (hit) return hit;
  const driver = driverOverride ?? getDriver();
  const fresh = await loadFromRegistry(driver, type);
  cache.set(type, fresh);
  return fresh;
}

// Test-only.
export function _peekEdgeEndpointsCache(
  type: string,
): ReadonlyArray<readonly [string, string]> | undefined {
  return cache.get(type);
}

export function _clearEdgeEndpointsCache(): void {
  cache.clear();
}
