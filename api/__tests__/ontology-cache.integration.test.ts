// T-13 integration test — three caches subscribed to `ontologyEvents`.
//
// Each cache (schema / edge-endpoints / attribute-zod) is exercised end
// to end against a live Neo4j with the bare ontology meta-schema + a
// hand-seeded registry row. Assertions per the task validation rubric:
//
//   • first-hit miss + populate (peek returns undefined → call once →
//     peek returns the populated entry).
//   • second-hit hit (call twice → same identity).
//   • `ontologyEvents.emit("ontology.changed", …)` → cache cleared
//     (peek returns undefined again, even without TTL expiry).
//
// Plus the `parseRegistryLabel` / `parseEdgeTypeName` helpers in
// `routes/_helpers.ts` are exercised — these are the registry-backed
// URL-param guards downstream routes (T-18a/b) call.

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { applyMetaSchema } from "../src/ontology/meta-bootstrap";
import { ontologyEvents } from "../src/ontology/events";
import { createNodeLabel, deleteNodeLabel } from "../src/ontology/storage/node-labels";
import { createEdgeType, deleteEdgeType } from "../src/ontology/storage/edge-types";
import {
  parseRegistryLabel,
  parseEdgeTypeName,
} from "../src/routes/_helpers";
import {
  getSchema,
  _peekSchemaCache,
  _clearSchemaCache,
} from "../src/ontology/cache/schema";
import {
  getEdgeEndpoints,
  _peekEdgeEndpointsCache,
  _clearEdgeEndpointsCache,
} from "../src/ontology/cache/edge-endpoints";
import {
  getAttributeValidator,
  _peekAttributeZodCache,
  _clearAttributeZodCache,
} from "../src/ontology/cache/attribute-zod";
// parseRegistryLabel + parseEdgeTypeName are in the ontology cache
// module (co-located with the cache they read from). Import via
// _helpers which re-exports the same functions, to avoid a Bun
// module-loading bug in large test suites.
import {
  parseRegistryLabel,
  parseEdgeTypeName,
} from "../src/routes/_helpers";

const PROBE_LABEL = "CacheProduct";
const PROBE_LABEL_OTHER = "CachePromoCode";
const PROBE_EDGE = "CACHE_RELATES";

async function clearMetaNamespace(): Promise<void> {
  const driver = getDriver();
  const session = driver.session();
  try {
    await session.run(
      `MATCH (n) WHERE any(l IN labels(n) WHERE l STARTS WITH '_Ontology')
       DETACH DELETE n`,
    );
  } finally {
    await session.close();
  }
}

async function dropProbeConstraintsAndIndexes(): Promise<void> {
  const driver = getDriver();
  const session = driver.session();
  try {
    for (const label of [PROBE_LABEL, PROBE_LABEL_OTHER]) {
      await session.run(`DROP CONSTRAINT node_id_unique_${label} IF EXISTS`);
      await session.run(`DROP INDEX node_name_${label} IF EXISTS`);
      await session.run(`MATCH (n:\`${label}\`) DETACH DELETE n`);
    }
    await session.run(`DROP CONSTRAINT edge_id_unique_${PROBE_EDGE} IF EXISTS`);
  } finally {
    await session.close();
  }
}

function clearAllCaches(): void {
  _clearSchemaCache();
  _clearEdgeEndpointsCache();
  _clearAttributeZodCache();
}

function emitInvalidation(): void {
  ontologyEvents.emit("ontology.changed", {
    event_id: "00000000-0000-7000-8000-000000000000",
    version_id: "00000000-0000-7000-8000-000000000000",
    ts: new Date().toISOString(),
    diff: [],
  });
}

describe("integration: schema cache (T-13 §6.1)", () => {
  beforeAll(async () => {
    const driver = getDriver();
    await applyMetaSchema(driver);
    await clearMetaNamespace();
    await dropProbeConstraintsAndIndexes();
    // Seed one node label + one edge type so the schema cache has
    // something to return.
    await createNodeLabel(
      driver,
      {
        name: PROBE_LABEL,
        description: "—",
        usage_example: "—",
        json_schema_doc: { type: "object", properties: { sku: { type: "string" } } },
        external_alignment: [{ source: "ARTS", id: "Product" }],
      },
      "test:t-13",
    );
    await createEdgeType(
      driver,
      {
        name: PROBE_EDGE,
        description: "—",
        usage_example: "—",
        endpoints: [{ fromLabel: PROBE_LABEL, toLabel: PROBE_LABEL }],
        external_alignment: [{ source: "ARTS", id: "Relates" }],
      },
      "test:t-13",
    );
  });

  beforeEach(() => {
    clearAllCaches();
  });

  afterAll(async () => {
    await clearMetaNamespace();
    await dropProbeConstraintsAndIndexes();
    // Restore the registry so subsequent test files don't see an empty
    // meta namespace.
    const { applySchema } = await import("../src/neo4j/bootstrap");
    await applySchema(getDriver());
    await closeDriver();
    _resetDriver();
  });

  test("first call → populate; second call → cache hit (identity)", async () => {
    expect(_peekSchemaCache()).toBeUndefined();

    const first = await getSchema();
    expect(first.nodeLabels.some((l) => l.name === PROBE_LABEL)).toBe(true);
    expect(first.edgeTypes.some((e) => e.name === PROBE_EDGE)).toBe(true);

    // Cache is now populated.
    const peeked = _peekSchemaCache();
    expect(peeked).toBeDefined();

    const second = await getSchema();
    // Identity check — same object reference means second call hit cache.
    expect(second).toBe(first);
  });

  test("ontology.changed event clears the cache", async () => {
    await getSchema();
    expect(_peekSchemaCache()).toBeDefined();

    emitInvalidation();

    expect(_peekSchemaCache()).toBeUndefined();
  });

  test("?alignment=ARTS filter is cached under a different key", async () => {
    const all = await getSchema();
    const arts = await getSchema({ alignment: "ARTS" });

    expect(arts.nodeLabels.length).toBeLessThanOrEqual(all.nodeLabels.length);
    expect(arts.nodeLabels.every((l) =>
      l.external_alignment.some((a) => a.source === "ARTS"),
    )).toBe(true);
    expect(arts.edgeTypes.every((t) =>
      t.external_alignment.some((a) => a.source === "ARTS"),
    )).toBe(true);

    // Two distinct cache entries.
    expect(_peekSchemaCache()).toBeDefined();
    expect(_peekSchemaCache({ alignment: "ARTS" })).toBeDefined();

    // A second call to the filtered variant is an identity hit.
    const arts2 = await getSchema({ alignment: "ARTS" });
    expect(arts2).toBe(arts);
  });
});

describe("integration: edge-endpoints cache (T-13 §6.2 / FR-04a)", () => {
  beforeAll(async () => {
    const driver = getDriver();
    await applyMetaSchema(driver);
    await clearMetaNamespace();
    await dropProbeConstraintsAndIndexes();
    await createNodeLabel(
      driver,
      {
        name: PROBE_LABEL,
        description: "—",
        usage_example: "—",
        json_schema_doc: { type: "object" },
      },
      "test:t-13",
    );
    await createEdgeType(
      driver,
      {
        name: PROBE_EDGE,
        description: "—",
        usage_example: "—",
        endpoints: [{ fromLabel: PROBE_LABEL, toLabel: PROBE_LABEL }],
      },
      "test:t-13",
    );
  });

  beforeEach(() => {
    clearAllCaches();
  });

  afterAll(async () => {
    await clearMetaNamespace();
    await dropProbeConstraintsAndIndexes();
    // Restore the registry so subsequent test files don't see an empty
    // meta namespace.
    const { applySchema } = await import("../src/neo4j/bootstrap");
    await applySchema(getDriver());
  });

  test("first call populates; second call is identity cache hit", async () => {
    expect(_peekEdgeEndpointsCache(PROBE_EDGE)).toBeUndefined();

    const first = await getEdgeEndpoints(PROBE_EDGE);
    expect(first).toEqual([[PROBE_LABEL, PROBE_LABEL]]);

    const second = await getEdgeEndpoints(PROBE_EDGE);
    expect(second).toBe(first);

    expect(_peekEdgeEndpointsCache(PROBE_EDGE)).toBeDefined();
  });

  test("unknown type returns empty array (cached)", async () => {
    const result = await getEdgeEndpoints("NO_SUCH_TYPE");
    expect(result).toEqual([]);
    // Cached entry is the empty array.
    expect(_peekEdgeEndpointsCache("NO_SUCH_TYPE")).toEqual([]);
  });

  test("ontology.changed clears the cache", async () => {
    await getEdgeEndpoints(PROBE_EDGE);
    expect(_peekEdgeEndpointsCache(PROBE_EDGE)).toBeDefined();

    emitInvalidation();

    expect(_peekEdgeEndpointsCache(PROBE_EDGE)).toBeUndefined();
  });
});

describe("integration: attribute-zod cache (T-13 §6.3)", () => {
  beforeAll(async () => {
    const driver = getDriver();
    await applyMetaSchema(driver);
    await clearMetaNamespace();
    await dropProbeConstraintsAndIndexes();
    // Label with a json_schema_doc that has both required + optional keys
    // so the compiled validator's behaviour is observable.
    await createNodeLabel(
      driver,
      {
        name: PROBE_LABEL,
        description: "—",
        usage_example: "—",
        json_schema_doc: {
          type: "object",
          required: ["sku"],
          properties: {
            sku: { type: "string" },
            color: { type: "string" },
          },
        },
      },
      "test:t-13",
    );
  });

  beforeEach(() => {
    clearAllCaches();
  });

  afterAll(async () => {
    await clearMetaNamespace();
    await dropProbeConstraintsAndIndexes();
    // Restore the registry so subsequent test files don't see an empty
    // meta namespace.
    const { applySchema } = await import("../src/neo4j/bootstrap");
    await applySchema(getDriver());
  });

  test("first call compiles + caches; second call is identity hit", async () => {
    expect(_peekAttributeZodCache(PROBE_LABEL)).toBeUndefined();

    const first = await getAttributeValidator(PROBE_LABEL);
    expect(first).toBeDefined();

    // Compiled validator accepts the required-key path.
    const ok = first.safeParse({ sku: "SKU-001" });
    expect(ok.success).toBe(true);

    // And rejects missing required key.
    const bad = first.safeParse({ color: "red" });
    expect(bad.success).toBe(false);

    const second = await getAttributeValidator(PROBE_LABEL);
    expect(second).toBe(first);
  });

  test("unknown label → 404 not_found (no cache pollution)", async () => {
    let caught: unknown = null;
    try {
      await getAttributeValidator("NoSuchLabel");
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect((caught as { code?: string }).code).toBe("not_found");
    // No row in the cache for the missing label.
    expect(_peekAttributeZodCache("NoSuchLabel")).toBeUndefined();
  });

  test("ontology.changed clears the cache", async () => {
    await getAttributeValidator(PROBE_LABEL);
    expect(_peekAttributeZodCache(PROBE_LABEL)).toBeDefined();

    emitInvalidation();

    expect(_peekAttributeZodCache(PROBE_LABEL)).toBeUndefined();
  });
});

describe("integration: parseRegistryLabel / parseEdgeTypeName (T-13 §5.5)", () => {
  beforeAll(async () => {
    const driver = getDriver();
    await applyMetaSchema(driver);
    await clearMetaNamespace();
    await dropProbeConstraintsAndIndexes();
    await createNodeLabel(
      driver,
      {
        name: PROBE_LABEL,
        description: "—",
        usage_example: "—",
        json_schema_doc: { type: "object" },
      },
      "test:t-13",
    );
    await createEdgeType(
      driver,
      {
        name: PROBE_EDGE,
        description: "—",
        usage_example: "—",
        endpoints: [{ fromLabel: PROBE_LABEL, toLabel: PROBE_LABEL }],
      },
      "test:t-13",
    );
  });

  beforeEach(() => {
    clearAllCaches();
  });

  afterAll(async () => {
    await clearMetaNamespace();
    await dropProbeConstraintsAndIndexes();
    // Restore the full registry (base labels + model/story/capability/
    // kpi-impact) so downstream test files see a valid schema.
    try {
      const { applySchema } = await import("../src/neo4j/bootstrap");
      await applySchema(getDriver());
    } catch {
      // APOC missing or similar — best-effort.
    }
  });

  test("parseRegistryLabel admits a runtime-added label", async () => {
    const got = await parseRegistryLabel(PROBE_LABEL);
    expect(got).toBe(PROBE_LABEL);
  });

  test("parseRegistryLabel rejects an unknown name", async () => {
    const got = await parseRegistryLabel("NoSuchLabel");
    expect(got).toBeNull();
  });

  test("parseRegistryLabel rejects non-string input", async () => {
    expect(await parseRegistryLabel(123)).toBeNull();
    expect(await parseRegistryLabel(null)).toBeNull();
    expect(await parseRegistryLabel(undefined)).toBeNull();
  });

  test("parseEdgeTypeName admits a runtime-added type", async () => {
    const got = await parseEdgeTypeName(PROBE_EDGE);
    expect(got).toBe(PROBE_EDGE);
  });

  test("parseEdgeTypeName rejects an unknown name", async () => {
    const got = await parseEdgeTypeName("NO_SUCH_TYPE");
    expect(got).toBeNull();
  });

  test("runtime-added label is visible after deletion → cache cleared by ontology.changed", async () => {
    const driver = getDriver();
    // Add a second label.
    await createNodeLabel(
      driver,
      {
        name: PROBE_LABEL_OTHER,
        description: "—",
        usage_example: "—",
        json_schema_doc: { type: "object" },
      },
      "test:t-13",
    );
    // Verify parseRegistryLabel admits it (the cache pulled fresh state
    // after the create's ontology.changed emit).
    // We need to actually emit since the storage helpers don't (the
    // route layer does — but for now we just emit manually).
    emitInvalidation();
    expect(await parseRegistryLabel(PROBE_LABEL_OTHER)).toBe(PROBE_LABEL_OTHER);

    // Delete it + invalidate.
    await deleteNodeLabel(driver, PROBE_LABEL_OTHER, "test:t-13");
    emitInvalidation();

    expect(await parseRegistryLabel(PROBE_LABEL_OTHER)).toBeNull();
  });
});
