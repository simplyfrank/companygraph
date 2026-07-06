// T-13 — `GET /api/v1/schema` cache (design §6.1).
//
// LRU, TTL 60 s, capacity 32 (one entry per filter combination — currently
// just `?alignment=<source>` + the unfiltered `ALL` key, so 32 is generous
// for the foreseeable filter surface).
//
// Uniform global invalidation (pass-1 C-01): every successful registry
// mutation fires `ontologyEvents.emit("ontology.changed", …)`, which
// drops the entire cache. Selective invalidation by `target_kind` was
// considered + rejected in pass-1 because the resulting micro-saving on
// cache misses (~50 ms p99) didn't justify the discriminator's complexity
// — the cache hit rate stays near 100 % outside the few-times-a-week
// mutation cadence anyway.
//
// The cache backs both the `/api/v1/schema` REST handler (T-17) AND the
// `parseRegistryLabel` / `parseEdgeTypeName` URL-param guards in
// `routes/_helpers.ts` (§5.5).

import { LRUCache } from "lru-cache";
import type { Driver } from "neo4j-driver";
import type { SchemaResponse } from "@companygraph/shared";
import { getDriver } from "../../neo4j/driver";
import { listNodeLabels } from "../storage/node-labels";
import { listEdgeTypes } from "../storage/edge-types";
import { ontologyEvents } from "../events";

const cache = new LRUCache<string, SchemaResponse>({
  max: 32,
  ttl: 60_000,
});

ontologyEvents.on("ontology.changed", () => cache.clear());

export interface SchemaFilter {
  alignment?: string;
}

function cacheKey(filter?: SchemaFilter): string {
  return filter?.alignment ? `align:${filter.alignment}` : "ALL";
}

// Allow tests + the route handler to inject the driver. Default is the
// process-wide singleton.
async function loadFromRegistry(
  driver: Driver,
  filter?: SchemaFilter,
): Promise<SchemaResponse> {
  const [nodeLabels, edgeTypes] = await Promise.all([
    listNodeLabels(driver),
    listEdgeTypes(driver),
  ]);

  if (filter?.alignment) {
    const src = filter.alignment;
    return {
      nodeLabels: nodeLabels
        .filter((l) =>
          l.external_alignment.some((a) => a.source === src),
        )
        // The shared types are stricter (`ReadonlyArray`) than the
        // storage row type — `[...]` makes the array mutable so the
        // type assignment succeeds.
        .map((l) => ({
          ...l,
          external_alignment: [...l.external_alignment],
        })) as SchemaResponse["nodeLabels"],
      edgeTypes: edgeTypes
        .filter((t) =>
          t.external_alignment.some((a) => a.source === src),
        )
        .map((t) => ({
          ...t,
          endpoints: [...t.endpoints],
          external_alignment: [...t.external_alignment],
        })) as SchemaResponse["edgeTypes"],
    };
  }

  return {
    nodeLabels: nodeLabels.map((l) => ({
      ...l,
      external_alignment: [...l.external_alignment],
    })) as SchemaResponse["nodeLabels"],
    edgeTypes: edgeTypes.map((t) => ({
      ...t,
      endpoints: [...t.endpoints],
      external_alignment: [...t.external_alignment],
    })) as SchemaResponse["edgeTypes"],
  };
}

// Bun 1.3.x transpiler bug workaround — see attribute-zod.ts for details.
async function _getSchemaImpl(
  filter?: SchemaFilter,
  driverOverride?: Driver,
): Promise<SchemaResponse> {
  const key = cacheKey(filter);
  const hit = cache.get(key);
  if (hit) return hit;
  const driver = driverOverride ?? getDriver();
  const fresh = await loadFromRegistry(driver, filter);
  cache.set(key, fresh);
  return fresh;
}
(globalThis as Record<string, unknown>)["__cg_getSchema"] = _getSchemaImpl;
export const getSchema: (filter?: SchemaFilter, driverOverride?: Driver) => Promise<SchemaResponse> = (filter, driverOverride) => {
  return ((globalThis as Record<string, unknown>)["__cg_getSchema"] as typeof _getSchemaImpl)(filter, driverOverride);
};

// Test-only: peek + manually clear so cache invariants are observable
// without firing the ontology event. Stored on globalThis to work
// around Bun's export stripping bug in large test suites.
(globalThis as Record<string, unknown>)["__cg_peekSchemaCache"] = (filter?: SchemaFilter): SchemaResponse | undefined => cache.get(cacheKey(filter));
(globalThis as Record<string, unknown>)["__cg_clearSchemaCache"] = (): void => { cache.clear(); };
export function _peekSchemaCache(filter?: SchemaFilter): SchemaResponse | undefined {
  return ((globalThis as Record<string, unknown>)["__cg_peekSchemaCache"] as (filter?: SchemaFilter) => SchemaResponse | undefined)(filter);
}
export function _clearSchemaCache(): void {
  ((globalThis as Record<string, unknown>)["__cg_clearSchemaCache"] as () => void)();
}

// T-13 / design §5.5 — registry-backed URL `:name` param guards for
// ontology-manager routes (and any caller that needs to validate a
// runtime-registered type name). Unlike `graph-core`'s `parseLabel` in
// `routes/_helpers.ts` (which iterates the compile-time `NODE_LABELS`
// const), these consult the registry via the §6.1 schema cache so
// labels/edge-types added at runtime via
// `POST /api/v1/ontology/{node-labels,edge-types}` are admitted into
// URL paths.
//
// Returns the validated name on hit, `null` on miss. Caller maps `null`
// → `404 not_found`. Co-located with the schema cache because the
// guards' implementation IS a cache lookup — placing them here keeps
// the dependency direction clean (route helpers → ontology cache,
// never the other way).

// Bun 1.3.x transpiler bug workaround — see attribute-zod.ts for details.
async function _parseRegistryLabelImpl(s: unknown): Promise<string | null> {
  if (typeof s !== "string") return null;
  const schema = await getSchema();
  return schema.nodeLabels.some((l) => l.name === s) ? s : null;
}
(globalThis as Record<string, unknown>)["__cg_parseRegistryLabel"] = _parseRegistryLabelImpl;
export const parseRegistryLabel: (s: unknown) => Promise<string | null> = (s) => {
  return ((globalThis as Record<string, unknown>)["__cg_parseRegistryLabel"] as typeof _parseRegistryLabelImpl)(s);
};

async function _parseEdgeTypeNameImpl(s: unknown): Promise<string | null> {
  if (typeof s !== "string") return null;
  const schema = await getSchema();
  return schema.edgeTypes.some((e) => e.name === s) ? s : null;
}
(globalThis as Record<string, unknown>)["__cg_parseEdgeTypeName"] = _parseEdgeTypeNameImpl;
export const parseEdgeTypeName: (s: unknown) => Promise<string | null> = (s) => {
  return ((globalThis as Record<string, unknown>)["__cg_parseEdgeTypeName"] as typeof _parseEdgeTypeNameImpl)(s);
};
