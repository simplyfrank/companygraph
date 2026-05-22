// T-11 integration test — edge-type storage CRUD against live Neo4j.
//
// Coverage matrix (design §4.2 + pass-1 design-review C-04 + FR-04a):
//   1. CRUD roundtrip — create → get → list → delete; null after delete.
//   2. Duplicate name → 409 name_conflict.
//   3. Unknown endpoint label → 400 type_pair_violation.
//   4. patchEdgeType replaces endpoints (two pairs → one pair).
//   5. Symmetric `schema_breaking` guard (FR-04a) — dropping a pair with
//      live edges throws, no mutation.
//   6. deleteEdgeType cascade — endpoints + alignments removed +
//      per-type constraint dropped.
//   7. deleteEdgeType writes _OntologyEvent with `op:"remove"`.
//   8. assertDeletePreconditions case (i) — live edges block delete.
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
  getEdgeType,
  listEdgeTypes,
  patchEdgeType,
  deleteEdgeType,
} from "../src/ontology/storage/edge-types";
import { ValidationError } from "../src/errors";

// Neo4j may return counts as either plain number or Neo4j Integer.
const toN = (v: unknown): number =>
  typeof v === "number"
    ? v
    : v && typeof (v as { toNumber?: () => number }).toNumber === "function"
      ? (v as { toNumber: () => number }).toNumber()
      : Number(v);

// =============================================================================
// Fixture helpers
// =============================================================================

// Distinct test edge-type names so parallel runs don't collide. The
// regex `[A-Z][A-Z0-9_]*` is enforced by the schema; we live within it.
const TEST_TYPES = [
  "TEST_OWNS",
  "TEST_HANDLES",
  "TEST_RELATES",
  "TEST_MANAGES",
  "TEST_ACCESSES",
  "TEST_DRIVES",
  "TEST_GATES",
  "TEST_VERIFIES",
] as const;

async function ensureSeed(): Promise<void> {
  // The seed creates `Domain` + `UserJourney` (+ 4 other) `_OntologyNodeLabel`
  // rows. CRUD tests reference Domain / UserJourney endpoint pairs.
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `MATCH (l:_OntologyNodeLabel) WHERE l.name IN ['Domain', 'UserJourney']
       RETURN count(l) AS c`,
    );
    if (toN(r.records[0]?.get("c")) >= 2) return;
  } finally {
    await session.close();
  }
  await seedRegistryFromConstTuples(driver);
}

async function dropTestType(name: string): Promise<void> {
  const driver = getDriver();
  const session = driver.session();
  try {
    // Delete any data-graph edges of this type before dropping the
    // registry row (so subsequent runs of the test suite don't see
    // dangling data).
    await session.run(`MATCH ()-[r:\`${name}\`]-() DELETE r`);
    // Delete the registry shape (type + endpoints + alignments).
    await session.run(
      `MATCH (e:_OntologyEdgeType {name: $name})
       OPTIONAL MATCH (e)<-[:OF_TYPE]-(ep:_OntologyEdgeEndpoint)
       OPTIONAL MATCH (e)<-[:ALIGNS]-(a:_OntologyAlignment)
       DETACH DELETE e, ep, a`,
      { name },
    );
    // Drop per-type constraint defensively.
    await session.run(`DROP CONSTRAINT edge_id_unique_${name} IF EXISTS`);
  } finally {
    await session.close();
  }
}

async function dropAllTestTypes(): Promise<void> {
  for (const t of TEST_TYPES) {
    await dropTestType(t);
  }
}

async function countByLabel(label: string): Promise<number> {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `MATCH (n:\`${label}\`) RETURN count(n) AS c`,
    );
    return toN(r.records[0]?.get("c"));
  } finally {
    await session.close();
  }
}

async function constraintExists(name: string): Promise<boolean> {
  const driver = getDriver();
  const session = driver.session();
  try {
    const r = await session.run(`SHOW CONSTRAINTS YIELD name RETURN name`);
    return r.records.some((rec) => (rec.get("name") as string) === name);
  } finally {
    await session.close();
  }
}

// Seed two real-data Domain + UserJourney nodes for the live-edge tests.
// Returns ids; pair with `cleanupDataNodes` to remove them.
async function seedDataNodes(): Promise<{
  domainId: string;
  journeyId: string;
}> {
  const driver = getDriver();
  const session = driver.session();
  const domainId = uuidV7();
  const journeyId = uuidV7();
  try {
    // graph-core's per-label `node_id_unique_<Label>` constraint may not
    // exist in this test environment. We still write `id` + `attributes_json`
    // matching the graph-core shape; whether the constraint exists or not
    // is irrelevant to the schema-breaking guard which only counts edges.
    await session.run(
      `CREATE (n:Domain {id: $id, name: 'test-domain',
                         attributes_json: '{}',
                         createdAt: $now, updatedAt: $now})`,
      { id: domainId, now: new Date().toISOString() },
    );
    await session.run(
      `CREATE (n:UserJourney {id: $id, name: 'test-journey',
                              attributes_json: '{}',
                              createdAt: $now, updatedAt: $now})`,
      { id: journeyId, now: new Date().toISOString() },
    );
  } finally {
    await session.close();
  }
  return { domainId, journeyId };
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

// Insert a live edge of the given type between two pre-seeded nodes.
// Bypasses the validator (which would otherwise consult `_OntologyEdgeEndpoint`
// for the pair check) — this is an intentional shortcut so the test
// exercises the registry-side `schema_breaking` guard end-to-end.
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

// =============================================================================
// describe block
// =============================================================================

describe("integration: edge-type storage CRUD (T-11 / FR-04a / pass-1 C-04)", () => {
  beforeAll(async () => {
    const driver = getDriver();
    await applyMetaSchema(driver);
    await ensureSeed();
    await dropAllTestTypes();
  });

  afterEach(async () => {
    await dropAllTestTypes();
  });

  afterAll(async () => {
    await dropAllTestTypes();
    await closeDriver();
    _resetDriver();
  });

  // ---------------------------------------------------------------------------
  // (1) CRUD roundtrip
  // ---------------------------------------------------------------------------
  test("create → get → list → delete roundtrip", async () => {
    const driver = getDriver();
    const name = "TEST_OWNS";

    const created = await createEdgeType(
      driver,
      {
        name,
        description: "Owns relationship from a domain to a journey.",
        usage_example: "Domain → UserJourney",
        endpoints: [{ fromLabel: "Domain", toLabel: "UserJourney" }],
      },
      "test-actor",
    );
    expect(created.name).toBe(name);
    expect(created.description).toContain("Owns");
    expect(created.endpoints).toHaveLength(1);
    expect(created.endpoints[0]).toEqual({
      fromLabel: "Domain",
      toLabel: "UserJourney",
    });
    expect(created.external_alignment).toEqual([]);
    expect(typeof created.created_at).toBe("string");
    expect(typeof created.updated_at).toBe("string");
    expect(created.deprecated_at).toBeNull();

    const got = await getEdgeType(driver, name);
    expect(got).not.toBeNull();
    expect(got!.name).toBe(name);
    expect(got!.endpoints).toEqual([
      { fromLabel: "Domain", toLabel: "UserJourney" },
    ]);

    const list = await listEdgeTypes(driver);
    expect(list.some((r) => r.name === name)).toBe(true);

    await deleteEdgeType(driver, name, "test-actor");

    const gone = await getEdgeType(driver, name);
    expect(gone).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // (2) Duplicate name → 409 name_conflict
  // ---------------------------------------------------------------------------
  test("duplicate name → 409 name_conflict", async () => {
    const driver = getDriver();
    const name = "TEST_HANDLES";
    await createEdgeType(
      driver,
      {
        name,
        description: "first",
        usage_example: "ex",
        endpoints: [{ fromLabel: "Domain", toLabel: "UserJourney" }],
      },
      "test-actor",
    );

    let captured: unknown = null;
    try {
      await createEdgeType(
        driver,
        {
          name,
          description: "second",
          usage_example: "ex",
          endpoints: [{ fromLabel: "Domain", toLabel: "UserJourney" }],
        },
        "test-actor",
      );
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeInstanceOf(ValidationError);
    const err = captured as ValidationError;
    expect(err.code).toBe("name_conflict");
    expect(err.httpStatus).toBe(409);
    expect(err.details.name).toBe(name);
  });

  // ---------------------------------------------------------------------------
  // (3) Endpoint references unknown label → 400 type_pair_violation
  // ---------------------------------------------------------------------------
  test("endpoint with unknown label → 400 type_pair_violation", async () => {
    const driver = getDriver();
    let captured: unknown = null;
    try {
      await createEdgeType(
        driver,
        {
          name: "TEST_RELATES",
          description: "x",
          usage_example: "x",
          endpoints: [{ fromLabel: "Domain", toLabel: "DoesNotExist" }],
        },
        "test-actor",
      );
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeInstanceOf(ValidationError);
    const err = captured as ValidationError;
    expect(err.code).toBe("type_pair_violation");
    expect(err.httpStatus).toBe(400);
    expect(err.details.unknown_label).toBe("DoesNotExist");
    expect(err.details.pair).toEqual({
      fromLabel: "Domain",
      toLabel: "DoesNotExist",
    });

    // Make sure nothing partial committed.
    const got = await getEdgeType(driver, "TEST_RELATES");
    expect(got).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // (4) patchEdgeType replaces endpoints (no live edges → safe drop)
  // ---------------------------------------------------------------------------
  test("patchEdgeType replaces endpoints — dropped pair's row is gone", async () => {
    const driver = getDriver();
    const name = "TEST_MANAGES";
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
      "test-actor",
    );

    // Both pairs present pre-patch.
    const before = await getEdgeType(driver, name);
    expect(before!.endpoints).toHaveLength(2);

    // Patch to one pair — drops the (Domain→Domain) row.
    const patched = await patchEdgeType(
      driver,
      name,
      {
        endpoints: [{ fromLabel: "Domain", toLabel: "UserJourney" }],
      },
      "test-actor",
    );
    expect(patched.endpoints).toEqual([
      { fromLabel: "Domain", toLabel: "UserJourney" },
    ]);

    // Cypher-level cross-check: the dropped endpoint row is physically gone.
    const session = driver.session({ defaultAccessMode: "READ" });
    try {
      const r = await session.run(
        `MATCH (ep:_OntologyEdgeEndpoint
                {edge_type_name: $name, from_label: 'Domain', to_label: 'Domain'})
         RETURN count(ep) AS c`,
        { name },
      );
      expect(toN(r.records[0]?.get("c"))).toBe(0);
    } finally {
      await session.close();
    }
  });

  // ---------------------------------------------------------------------------
  // (5) Symmetric `schema_breaking` guard (FR-04a)
  // ---------------------------------------------------------------------------
  test("symmetric schema_breaking guard — drop pair with live edges → 400, no mutation", async () => {
    const driver = getDriver();
    const name = "TEST_ACCESSES";

    // Create type with two pairs.
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
      "test-actor",
    );

    // Seed two Domain nodes + a Domain→Domain real edge.
    const dataNodes: string[] = [];
    const domainAId = uuidV7();
    const domainBId = uuidV7();
    dataNodes.push(domainAId, domainBId);

    const driverHandle = driver;
    const sessionDataA = driverHandle.session();
    try {
      const now = new Date().toISOString();
      await sessionDataA.run(
        `CREATE (n:Domain {id: $id, name: 'A', attributes_json: '{}',
                           createdAt: $now, updatedAt: $now})`,
        { id: domainAId, now },
      );
      await sessionDataA.run(
        `CREATE (n:Domain {id: $id, name: 'B', attributes_json: '{}',
                           createdAt: $now, updatedAt: $now})`,
        { id: domainBId, now },
      );
    } finally {
      await sessionDataA.close();
    }
    const edgeId = await insertLiveEdge(name, domainAId, domainBId);

    let captured: unknown = null;
    try {
      // Attempt to drop the Domain→Domain pair — the only one with a live edge.
      await patchEdgeType(
        driver,
        name,
        {
          endpoints: [{ fromLabel: "Domain", toLabel: "UserJourney" }],
        },
        "test-actor",
      );
    } catch (e) {
      captured = e;
    }

    expect(captured).toBeInstanceOf(ValidationError);
    const err = captured as ValidationError;
    expect(err.code).toBe("schema_breaking");
    expect(err.httpStatus).toBe(400);
    expect(err.details.affected_edge_count).toBe(1);
    expect(err.details.sample_edge_ids).toEqual([edgeId]);
    expect(err.details.dropped_pair).toEqual({
      fromLabel: "Domain",
      toLabel: "Domain",
    });

    // No mutation — both pairs still present + edge intact.
    const after = await getEdgeType(driver, name);
    expect(after!.endpoints).toHaveLength(2);
    const session = driver.session({ defaultAccessMode: "READ" });
    try {
      // Directional MATCH so we get one row per stored relationship.
      // (An undirected `()-[r]-()` walk returns two rows for a single
      // self-pair edge — Neo4j traverses both directions.)
      const r = await session.run(
        `MATCH ()-[r:\`${name}\` {id: $id}]->() RETURN count(r) AS c`,
        { id: edgeId },
      );
      expect(toN(r.records[0]?.get("c"))).toBe(1);
    } finally {
      await session.close();
    }

    // Cleanup the live edge before afterEach drops the type.
    await cleanupDataNodes(dataNodes);
  });

  // ---------------------------------------------------------------------------
  // (6) deleteEdgeType cascade — endpoints + alignments removed + constraint dropped
  // ---------------------------------------------------------------------------
  test("deleteEdgeType cascade — endpoints + alignments + per-type constraint", async () => {
    const driver = getDriver();
    const name = "TEST_DRIVES";

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
        external_alignment: [{ source: "ARTS", id: "Drives" }],
      },
      "test-actor",
    );

    // Manually create the per-type constraint that graph-core's bootstrap
    // would create — so we can assert deleteEdgeType drops it.
    const setupSession = driver.session();
    try {
      await setupSession.run(
        `CREATE CONSTRAINT edge_id_unique_${name} IF NOT EXISTS
         FOR ()-[r:\`${name}\`]-() REQUIRE r.id IS UNIQUE`,
      );
    } finally {
      await setupSession.close();
    }
    expect(await constraintExists(`edge_id_unique_${name}`)).toBe(true);

    // Sanity-check baseline rows exist.
    const session = driver.session({ defaultAccessMode: "READ" });
    let preEndpointCount = 0;
    let preAlignmentCount = 0;
    try {
      const epRes = await session.run(
        `MATCH (ep:_OntologyEdgeEndpoint {edge_type_name: $name})
         RETURN count(ep) AS c`,
        { name },
      );
      preEndpointCount = toN(epRes.records[0]?.get("c"));
      const alRes = await session.run(
        `MATCH (al:_OntologyAlignment {target_kind: 'edge_type', target_name: $name})
         RETURN count(al) AS c`,
        { name },
      );
      preAlignmentCount = toN(alRes.records[0]?.get("c"));
    } finally {
      await session.close();
    }
    expect(preEndpointCount).toBe(2);
    expect(preAlignmentCount).toBe(1);

    await deleteEdgeType(driver, name, "test-actor");

    // Post-delete: every dependent row gone + constraint dropped.
    const session2 = driver.session({ defaultAccessMode: "READ" });
    try {
      const epRes = await session2.run(
        `MATCH (ep:_OntologyEdgeEndpoint {edge_type_name: $name})
         RETURN count(ep) AS c`,
        { name },
      );
      expect(toN(epRes.records[0]?.get("c"))).toBe(0);

      const alRes = await session2.run(
        `MATCH (al:_OntologyAlignment {target_kind: 'edge_type', target_name: $name})
         RETURN count(al) AS c`,
        { name },
      );
      expect(toN(alRes.records[0]?.get("c"))).toBe(0);

      const tRes = await session2.run(
        `MATCH (e:_OntologyEdgeType {name: $name}) RETURN count(e) AS c`,
        { name },
      );
      expect(toN(tRes.records[0]?.get("c"))).toBe(0);
    } finally {
      await session2.close();
    }
    expect(await constraintExists(`edge_id_unique_${name}`)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // (7) deleteEdgeType writes _OntologyEvent with op:"remove"
  // ---------------------------------------------------------------------------
  test("deleteEdgeType writes _OntologyEvent with op:remove path:/edgeTypes/<name>", async () => {
    const driver = getDriver();
    const name = "TEST_GATES";

    await createEdgeType(
      driver,
      {
        name,
        description: "x",
        usage_example: "x",
        endpoints: [{ fromLabel: "Domain", toLabel: "UserJourney" }],
      },
      "test-actor",
    );

    const beforeCount = await countByLabel("_OntologyEvent");
    await deleteEdgeType(driver, name, "test-actor");
    const afterCount = await countByLabel("_OntologyEvent");
    expect(afterCount).toBe(beforeCount + 1);

    // Read the latest event row and confirm the diff shape.
    const session = driver.session({ defaultAccessMode: "READ" });
    try {
      const r = await session.run(
        `MATCH (e:_OntologyEvent)
         RETURN e.diff_jsonpatch AS diff_json, e.ts AS ts
         ORDER BY e.ts DESC LIMIT 1`,
      );
      const diff = JSON.parse(r.records[0]!.get("diff_json") as string);
      expect(diff).toEqual([
        { op: "remove", path: `/edgeTypes/${name}` },
      ]);
    } finally {
      await session.close();
    }
  });

  // ---------------------------------------------------------------------------
  // (8) assertDeletePreconditions case (i) for edge_type — live edges block delete
  // ---------------------------------------------------------------------------
  test("delete with live edges → 409 deprecation_required (precondition_failed: edge_instance_count)", async () => {
    const driver = getDriver();
    const name = "TEST_VERIFIES";

    await createEdgeType(
      driver,
      {
        name,
        description: "x",
        usage_example: "x",
        endpoints: [{ fromLabel: "Domain", toLabel: "UserJourney" }],
      },
      "test-actor",
    );

    // Seed real-data nodes + insert one live edge of this type.
    const { domainId, journeyId } = await seedDataNodes();
    await insertLiveEdge(name, domainId, journeyId);

    let captured: unknown = null;
    try {
      await deleteEdgeType(driver, name, "test-actor");
    } catch (e) {
      captured = e;
    }

    expect(captured).toBeInstanceOf(ValidationError);
    const err = captured as ValidationError;
    expect(err.code).toBe("deprecation_required");
    expect(err.httpStatus).toBe(409);
    expect(err.details.precondition_failed).toBe("edge_instance_count");
    expect(err.details.edge_instance_count).toBe(1);

    // The edge-type row is still present — no mutation on precondition failure.
    const stillThere = await getEdgeType(driver, name);
    expect(stillThere).not.toBeNull();

    // Cleanup so afterEach can drop the type.
    await cleanupDataNodes([domainId, journeyId]);
  });
});
