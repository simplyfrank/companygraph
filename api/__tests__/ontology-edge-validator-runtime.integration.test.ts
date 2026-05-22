// T-14 integration test — `validateEdge` (api/src/storage/edges.ts) now
// consults the runtime `_OntologyEdgeEndpoint` registry via T-13's
// `getEdgeEndpoints` cache instead of the compile-time `EDGE_ENDPOINTS`
// const tuple (ontology-manager FR-04a / design §7.2).
//
// Coverage matrix:
//   1. Runtime cache hit for a base-pair edge (USES_SYSTEM: Activity →
//      System). Edge lands; cache holds the pair list.
//   2. Newly-registered runtime edge-endpoint pair accepted within ≤ 60s.
//      `createEdgeType` registers `TEST_OWNS` with (Domain → UserJourney)
//      then we POST an edge of that type — succeeds because the cache
//      misses on first lookup of `TEST_OWNS` and resolves against the
//      fresh registry row.
//   3. PATCH-dropped pair rejects subsequent writes — `createEdgeType`
//      with two pairs, then `patchEdgeType` to drop the one without
//      live edges. Edge of the dropped pair shape → 400
//      edge_endpoint_label_mismatch with the POST-patch `details.allowed`
//      array. (Cache is explicitly invalidated to simulate the
//      post-commit `ontology.changed` event that the public schema
//      route (T-15+) will fire — `edge-types.ts` doesn't emit it yet.)
//   4. Cache invalidation surface — count `_OntologyEdgeEndpoint` rows
//      before + after `createEdgeType`; verify cache reflects new state.
//
// Requires Neo4j running (bun run dev OR CI's neo4j sidecar). Describe
// block prefixed `integration:` per the project's bun test:integration
// filter.

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "bun:test";
import { v7 as uuidV7 } from "uuid";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { applyMetaSchema } from "../src/ontology/meta-bootstrap";
import { seedRegistryFromConstTuples } from "../src/ontology/seed";
import {
  createEdgeType,
  patchEdgeType,
  deleteEdgeType,
} from "../src/ontology/storage/edge-types";
import { createEdge, deleteEdge } from "../src/storage/edges";
import {
  getEdgeEndpoints,
  _peekEdgeEndpointsCache,
  _clearEdgeEndpointsCache,
} from "../src/ontology/cache/edge-endpoints";
import { ValidationError } from "../src/errors";
import type { EdgeCreateInput, EdgeType } from "@companygraph/shared/schema/edges";

// Neo4j may return counts as either plain number or Neo4j Integer.
const toN = (v: unknown): number =>
  typeof v === "number"
    ? v
    : v && typeof (v as { toNumber?: () => number }).toNumber === "function"
      ? (v as { toNumber: () => number }).toNumber()
      : Number(v);

// Distinct test edge-type names so parallel runs don't collide. Schema
// regex `[A-Z][A-Z0-9_]*` enforced upstream.
const TEST_TYPES = [
  "T14_OWNS",
  "T14_PATCH_DROP",
  "T14_CACHE_INV",
] as const;

async function ensureSeed(): Promise<void> {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `MATCH (l:_OntologyNodeLabel)
       WHERE l.name IN ['Domain','UserJourney','Activity','System']
       RETURN count(l) AS c`,
    );
    if (toN(r.records[0]?.get("c")) >= 4) return;
  } finally {
    await session.close();
  }
  await seedRegistryFromConstTuples(driver);
}

async function dropTestType(name: string): Promise<void> {
  const driver = getDriver();
  const session = driver.session();
  try {
    await session.run(`MATCH ()-[r:\`${name}\`]-() DELETE r`);
    await session.run(
      `MATCH (e:_OntologyEdgeType {name: $name})
       OPTIONAL MATCH (e)<-[:OF_TYPE]-(ep:_OntologyEdgeEndpoint)
       OPTIONAL MATCH (e)<-[:ALIGNS]-(a:_OntologyAlignment)
       DETACH DELETE e, ep, a`,
      { name },
    );
    await session.run(`DROP CONSTRAINT edge_id_unique_${name} IF EXISTS`);
  } finally {
    await session.close();
  }
}

async function dropAllTestTypes(): Promise<void> {
  for (const t of TEST_TYPES) await dropTestType(t);
}

// Seed real-data Domain + UserJourney + Activity + System for the
// runtime endpoint tests. Caller is responsible for cleanup.
async function seedDataNodes(): Promise<{
  domainId: string;
  journeyId: string;
  activityId: string;
  systemId: string;
}> {
  const driver = getDriver();
  const session = driver.session();
  const ids = {
    domainId: uuidV7(),
    journeyId: uuidV7(),
    activityId: uuidV7(),
    systemId: uuidV7(),
  };
  const now = new Date().toISOString();
  try {
    await session.run(
      `CREATE (n:Domain {id: $id, name: 't14-domain',
                         attributes_json: '{}', createdAt: $now, updatedAt: $now})`,
      { id: ids.domainId, now },
    );
    await session.run(
      `CREATE (n:UserJourney {id: $id, name: 't14-journey',
                              attributes_json: '{}', createdAt: $now, updatedAt: $now})`,
      { id: ids.journeyId, now },
    );
    await session.run(
      `CREATE (n:Activity {id: $id, name: 't14-activity',
                           attributes_json: '{}', createdAt: $now, updatedAt: $now})`,
      { id: ids.activityId, now },
    );
    await session.run(
      `CREATE (n:System {id: $id, name: 't14-system',
                         attributes_json: '{}', createdAt: $now, updatedAt: $now})`,
      { id: ids.systemId, now },
    );
  } finally {
    await session.close();
  }
  return ids;
}

async function cleanupDataNodes(ids: ReadonlyArray<string>): Promise<void> {
  const driver = getDriver();
  const session = driver.session();
  try {
    for (const id of ids) {
      await session.run(`MATCH (n {id: $id}) DETACH DELETE n`, { id });
    }
  } finally {
    await session.close();
  }
}

async function countEndpointRows(typeName: string): Promise<number> {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `MATCH (ep:_OntologyEdgeEndpoint {edge_type_name: $name})
       RETURN count(ep) AS c`,
      { name: typeName },
    );
    return toN(r.records[0]?.get("c"));
  } finally {
    await session.close();
  }
}

// Insert a live edge of an arbitrary registry-defined type between two
// pre-seeded nodes — bypasses the validator. Used by test (3) to seed a
// live edge under the pair we DO NOT drop, so the schema-breaking guard
// in patchEdgeType doesn't fire.
async function insertLiveEdge(
  type: string,
  fromId: string,
  toId: string,
): Promise<string> {
  const driver = getDriver();
  const session = driver.session();
  const id = uuidV7();
  try {
    await session.run(
      `MATCH (a {id: $fromId}), (b {id: $toId})
       CREATE (a)-[r:\`${type}\` {id: $id, createdAt: $now, attributes_json: '{}'}]->(b)`,
      { fromId, toId, id, now: new Date().toISOString() },
    );
  } finally {
    await session.close();
  }
  return id;
}

describe("integration: edge-validator runtime endpoint check (T-14 / FR-04a / design §7.2)", () => {
  beforeAll(async () => {
    const driver = getDriver();
    await applyMetaSchema(driver);
    await ensureSeed();
    await dropAllTestTypes();
    _clearEdgeEndpointsCache();
  });

  afterEach(async () => {
    await dropAllTestTypes();
    _clearEdgeEndpointsCache();
  });

  afterAll(async () => {
    await dropAllTestTypes();
    _clearEdgeEndpointsCache();
    await closeDriver();
    _resetDriver();
  });

  // ---------------------------------------------------------------------------
  // (1) Runtime cache hit for a base-pair edge — USES_SYSTEM, Activity → System.
  // ---------------------------------------------------------------------------
  test("runtime cache hit: USES_SYSTEM Activity → System edge lands; cache populated", async () => {
    const driver = getDriver();
    const { activityId, systemId, domainId, journeyId } = await seedDataNodes();

    try {
      // Cache cold at start (cleared in beforeAll/afterEach).
      expect(_peekEdgeEndpointsCache("USES_SYSTEM")).toBeUndefined();

      const created = await createEdge(driver, {
        type: "USES_SYSTEM",
        fromId: activityId,
        toId: systemId,
        attributes: {},
      });
      expect(created.type).toBe("USES_SYSTEM");
      expect(created.fromId).toBe(activityId);
      expect(created.toId).toBe(systemId);

      // Cache populated post-write — contains the (Activity, System) pair.
      const cached = _peekEdgeEndpointsCache("USES_SYSTEM");
      expect(cached).toBeDefined();
      expect(cached!.some(([f, t]) => f === "Activity" && t === "System")).toBe(
        true,
      );

      // Cleanup edge.
      await deleteEdge(driver, created.id);
    } finally {
      await cleanupDataNodes([activityId, systemId, domainId, journeyId]);
    }
  });

  // ---------------------------------------------------------------------------
  // (2) Newly-registered runtime edge-endpoint pair accepted within ≤ 60s.
  // ---------------------------------------------------------------------------
  test("newly-registered edge-type (TEST_OWNS Domain → UserJourney) is accepted on next write", async () => {
    const driver = getDriver();
    const name = "T14_OWNS";
    const { domainId, journeyId, activityId, systemId } = await seedDataNodes();

    try {
      // Register the new edge type with one endpoint pair.
      await createEdgeType(
        driver,
        {
          name,
          description: "T-14 runtime endpoint acceptance test.",
          usage_example: "Domain → UserJourney",
          endpoints: [{ fromLabel: "Domain", toLabel: "UserJourney" }],
        },
        "t14-actor",
      );

      // First lookup of `T14_OWNS` is a cache miss → resolves directly
      // against the freshly-registered `_OntologyEdgeEndpoint` row.
      // This is the cache's natural cold-path behaviour (cache.get →
      // undefined → loadFromRegistry → set). The 60s TTL bound is moot
      // for never-cached types.
      const created = await createEdge(driver, {
        type: name as EdgeType, // type-system escape: dynamic type not in EDGE_TYPES enum.
        fromId: domainId,
        toId: journeyId,
        attributes: {},
      } as EdgeCreateInput);
      expect(created.type).toBe(name);
      expect(created.fromId).toBe(domainId);
      expect(created.toId).toBe(journeyId);

      // Cache populated.
      const cached = _peekEdgeEndpointsCache(name);
      expect(cached).toBeDefined();
      expect(cached).toEqual([["Domain", "UserJourney"]]);
    } finally {
      await cleanupDataNodes([domainId, journeyId, activityId, systemId]);
    }
  });

  // ---------------------------------------------------------------------------
  // (3) PATCH-dropped pair rejects subsequent writes.
  // ---------------------------------------------------------------------------
  test("PATCH-dropped pair rejects subsequent writes — 400 edge_endpoint_label_mismatch with post-PATCH allowed[]", async () => {
    const driver = getDriver();
    const name = "T14_PATCH_DROP";
    const { domainId, journeyId, activityId, systemId } = await seedDataNodes();

    // Need two Domains so we can park a live edge on the pair we KEEP
    // (Domain→Domain), then drop the (Domain→UserJourney) pair without
    // tripping the schema-breaking guard.
    const domainAId = uuidV7();
    const domainBId = uuidV7();
    const setupSession = driver.session();
    try {
      const now = new Date().toISOString();
      await setupSession.run(
        `CREATE (n:Domain {id: $id, name: 't14-A', attributes_json: '{}',
                           createdAt: $now, updatedAt: $now})`,
        { id: domainAId, now },
      );
      await setupSession.run(
        `CREATE (n:Domain {id: $id, name: 't14-B', attributes_json: '{}',
                           createdAt: $now, updatedAt: $now})`,
        { id: domainBId, now },
      );
    } finally {
      await setupSession.close();
    }

    try {
      // Register type with TWO pairs.
      await createEdgeType(
        driver,
        {
          name,
          description: "x",
          usage_example: "x",
          endpoints: [
            { fromLabel: "Domain", toLabel: "UserJourney" },
            { fromLabel: "Domain", toLabel: "Domain" },
          ],
        },
        "t14-actor",
      );

      // Park a live edge under the pair we'll KEEP (Domain→Domain) so
      // patchEdgeType's symmetric schema_breaking guard tolerates the
      // drop of (Domain→UserJourney).
      const survivorEdgeId = await insertLiveEdge(name, domainAId, domainBId);

      // Warm the cache for `name` — simulates a real workload where the
      // type was used before the patch.
      const before = await getEdgeEndpoints(name, driver);
      expect(before).toHaveLength(2);

      // PATCH to drop the (Domain→UserJourney) pair.
      await patchEdgeType(
        driver,
        name,
        {
          endpoints: [{ fromLabel: "Domain", toLabel: "Domain" }],
        },
        "t14-actor",
      );

      // Simulate the post-commit `ontology.changed` event that the
      // public schema route (T-15+) will fire. The cache subscribes via
      // `ontologyEvents.on("ontology.changed", () => cache.clear())`,
      // so a real production patch through the public route will see
      // the cache cleared automatically. Here we clear it directly
      // because the storage-layer `patchEdgeType` doesn't emit yet.
      _clearEdgeEndpointsCache();

      // Attempt the now-disallowed Domain→UserJourney edge.
      let captured: unknown = null;
      try {
        await createEdge(driver, {
          type: name as EdgeType,
          fromId: domainId,
          toId: journeyId,
          attributes: {},
        } as EdgeCreateInput);
      } catch (e) {
        captured = e;
      }
      expect(captured).toBeInstanceOf(ValidationError);
      const err = captured as ValidationError;
      expect(err.code).toBe("edge_endpoint_label_mismatch");
      expect(err.httpStatus).toBe(400);
      expect(err.details.type).toBe(name);
      expect(err.details.fromLabel).toBe("Domain");
      expect(err.details.toLabel).toBe("UserJourney");
      // Post-PATCH allowed[] reflects only the surviving pair.
      expect(err.details.allowed).toEqual([{ from: "Domain", to: "Domain" }]);

      // Sanity: the survivor edge is still around.
      const liveSession = driver.session({ defaultAccessMode: "READ" });
      try {
        const r = await liveSession.run(
          `MATCH ()-[r:\`${name}\` {id: $id}]->() RETURN count(r) AS c`,
          { id: survivorEdgeId },
        );
        expect(toN(r.records[0]?.get("c"))).toBe(1);
      } finally {
        await liveSession.close();
      }
    } finally {
      await cleanupDataNodes([
        domainAId,
        domainBId,
        domainId,
        journeyId,
        activityId,
        systemId,
      ]);
    }
  });

  // ---------------------------------------------------------------------------
  // (4) Cache invalidation surface — endpoint-row count + getEdgeEndpoints
  //     reflect the new state after createEdgeType.
  // ---------------------------------------------------------------------------
  test("cache invalidation surface: row count + getEdgeEndpoints reflect new state post-createEdgeType", async () => {
    const driver = getDriver();
    const name = "T14_CACHE_INV";

    // Pre-create: zero endpoint rows for this name.
    expect(await countEndpointRows(name)).toBe(0);
    expect(_peekEdgeEndpointsCache(name)).toBeUndefined();

    // Create with two endpoint pairs.
    await createEdgeType(
      driver,
      {
        name,
        description: "x",
        usage_example: "x",
        endpoints: [
          { fromLabel: "Domain", toLabel: "UserJourney" },
          { fromLabel: "Activity", toLabel: "System" },
        ],
      },
      "t14-actor",
    );

    // Post-create: two endpoint rows in the registry.
    expect(await countEndpointRows(name)).toBe(2);

    // Cache lookup reflects the new state (cold cache → fresh registry read).
    const allowed = await getEdgeEndpoints(name, driver);
    expect(allowed).toHaveLength(2);
    // Sort-stabilised assertion (order: ['Activity','System'] before ['Domain','UserJourney']).
    const sortedPairs = [...allowed].map(([f, t]) => `${f}->${t}`).sort();
    expect(sortedPairs).toEqual([
      "Activity->System",
      "Domain->UserJourney",
    ]);

    // Cache is now warm.
    expect(_peekEdgeEndpointsCache(name)).toBeDefined();
    expect(_peekEdgeEndpointsCache(name)).toHaveLength(2);
  });
});
