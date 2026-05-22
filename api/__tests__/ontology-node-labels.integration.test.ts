// T-10 integration test — node-label storage CRUD against a live Neo4j.
//
// Sub-cases:
//   1. CRUD round-trip — create → get → list → delete → get-null.
//   2. Duplicate name → 409 name_conflict.
//   3. FR-05 no-retro-write — patching `json_schema_doc` MUST NOT touch
//      any `(:Label)` data row's `updatedAt` (pass-1 C-05).
//   4. FR-12 invalidating-change → 409 would_invalidate when newly-required
//      keys would invalidate ≥1 live data row.
//   5. FR-12 + forceBackfill — same setup as #4 but with the override flag
//      + a `backfillValue`; the existing data rows now carry the
//      backfilled key.
//   6. pass-1 N-09 — `deleteNodeLabel` writes an `_OntologyEvent` row with
//      a `[{op:"remove", path:"/nodeLabels/<name>"}]` diff.
//   7. `assertDeletePreconditions` — populated label refuses delete with
//      `precondition_failed: "node_instance_count"`; cleared label then
//      deletes without error.
//
// Each test provisions + tears down its own label so cases stay isolated
// even when run in parallel.
//
// Requires Neo4j running (`bun run dev` or the CI `neo4j` sidecar).
// Describe block prefixed `integration:` so `bun test:integration` picks
// it up.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { applyMetaSchema } from "../src/ontology/meta-bootstrap";
import {
  createNodeLabel,
  getNodeLabel,
  listNodeLabels,
  patchNodeLabel,
  deleteNodeLabel,
} from "../src/ontology/storage/node-labels";

// Neo4j may return counts as plain number OR Neo4j Integer depending on
// the driver's `disableLosslessIntegers` flag. Coerce safely.
const toN = (v: unknown): number =>
  typeof v === "number"
    ? v
    : v != null && typeof (v as { toNumber?: () => number }).toNumber === "function"
      ? (v as { toNumber: () => number }).toNumber()
      : Number(v);

// Unique-per-test label generator so parallel test runs don't collide.
function uniqueLabelName(prefix: string): string {
  const stamp = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
  return `${prefix}${stamp}`;
}

// Clean up a test label + its data rows + its per-label constraint/index.
// Called from every test's `try/finally` so isolation holds even on assert
// failure mid-test.
async function cleanupLabel(name: string): Promise<void> {
  const driver = getDriver();
  const session = driver.session();
  try {
    // Drop data nodes carrying the label.
    await session.run(`MATCH (n:\`${name}\`) DETACH DELETE n`);
    // Drop the registry rows.
    await session.run(
      `MATCH (l:_OntologyNodeLabel {name: $name})
       OPTIONAL MATCH (l)<-[:DESCRIBES]-(s:_OntologyAttributeSchema)
       OPTIONAL MATCH (l)<-[:ALIGNS]-(a:_OntologyAlignment)
       DETACH DELETE l, s, a`,
      { name },
    );
    // Drop per-label constraint + index (no-op if they were never created).
    await session.run(`DROP CONSTRAINT node_id_unique_${name} IF EXISTS`);
    await session.run(`DROP INDEX node_name_${name} IF EXISTS`);
  } finally {
    await session.close();
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

describe("integration: node-label storage CRUD (T-10)", () => {
  beforeAll(async () => {
    await applyMetaSchema(getDriver());
  });

  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("CRUD roundtrip: create → get → list → delete → null", async () => {
    const name = uniqueLabelName("Product");
    try {
      const created = await createNodeLabel(
        getDriver(),
        {
          name,
          description: "An e-commerce product",
          usage_example: `POST /api/v1/nodes/${name}`,
          json_schema_doc: {
            type: "object",
            properties: { sku: { type: "string" } },
            additionalProperties: true,
          },
        },
        "test-actor",
      );
      expect(created.name).toBe(name);
      expect(created.description).toBe("An e-commerce product");
      expect(created.json_schema_doc).toEqual({
        type: "object",
        properties: { sku: { type: "string" } },
        additionalProperties: true,
      });
      expect(created.external_alignment).toEqual([]);
      expect(typeof created.created_at).toBe("string");
      expect(typeof created.updated_at).toBe("string");

      const got = await getNodeLabel(getDriver(), name);
      expect(got).not.toBeNull();
      expect(got!.name).toBe(name);
      expect(got!.usage_example).toBe(`POST /api/v1/nodes/${name}`);

      const list = await listNodeLabels(getDriver());
      const found = list.find((r) => r.name === name);
      expect(found).toBeDefined();

      await deleteNodeLabel(getDriver(), name, "test-actor");

      const afterDelete = await getNodeLabel(getDriver(), name);
      expect(afterDelete).toBeNull();
    } finally {
      await cleanupLabel(name);
    }
  });

  test("duplicate name → 409 name_conflict", async () => {
    const name = uniqueLabelName("Dup");
    try {
      await createNodeLabel(
        getDriver(),
        {
          name,
          description: "first",
          usage_example: "first",
          json_schema_doc: { type: "object" },
        },
        "test-actor",
      );

      let captured: unknown = null;
      try {
        await createNodeLabel(
          getDriver(),
          {
            name,
            description: "second",
            usage_example: "second",
            json_schema_doc: { type: "object" },
          },
          "test-actor",
        );
      } catch (e) {
        captured = e;
      }
      expect(captured).not.toBeNull();
      expect((captured as { code?: string }).code).toBe("name_conflict");
      expect((captured as { httpStatus?: number }).httpStatus).toBe(409);
      expect(
        (captured as { details?: { name?: string } }).details?.name,
      ).toBe(name);
    } finally {
      await cleanupLabel(name);
    }
  });

  test("FR-05 (no retro-write): PATCH json_schema_doc never touches data rows", async () => {
    const name = uniqueLabelName("Retro");
    try {
      // Step 1: create the label with a permissive schema.
      await createNodeLabel(
        getDriver(),
        {
          name,
          description: "FR-05 retro-write guard",
          usage_example: "test",
          json_schema_doc: { type: "object", additionalProperties: true },
        },
        "test-actor",
      );

      // Step 2: provision the per-label constraint + index (otherwise the
      // bootstrap-managed `node_id_unique_*` constraint doesn't exist;
      // not load-bearing for the assertion but matches production shape).
      const driver = getDriver();
      const provisionSession = driver.session();
      try {
        await provisionSession.run(
          `CREATE CONSTRAINT node_id_unique_${name} IF NOT EXISTS
           FOR (n:\`${name}\`) REQUIRE n.id IS UNIQUE`,
        );
        await provisionSession.run(
          `CREATE INDEX node_name_${name} IF NOT EXISTS
           FOR (n:\`${name}\`) ON (n.name)`,
        );
      } finally {
        await provisionSession.close();
      }

      // Step 3: seed three data rows with a known `updatedAt` we can pin.
      const sentinelTs = "2020-01-01T00:00:00.000Z";
      const seedSession = driver.session();
      try {
        for (const id of ["r1", "r2", "r3"]) {
          await seedSession.run(
            `CREATE (n:\`${name}\` {
               id: $id, name: $id, description: "",
               createdAt: $ts, updatedAt: $ts,
               attributes_json: "{}"
             })`,
            { id, ts: sentinelTs },
          );
        }
      } finally {
        await seedSession.close();
      }

      // Step 4: PATCH the json_schema_doc with a NON-required new attribute
      // (so the FR-12 guard does not trip).
      await patchNodeLabel(
        getDriver(),
        name,
        {
          json_schema_doc: {
            type: "object",
            properties: { color: { type: "string" } },
            additionalProperties: true,
          },
        },
        "test-actor",
      );

      // Step 5: verify NONE of the three data rows had their `updatedAt`
      // changed (FR-05 / pass-1 C-05).
      const verifySession = driver.session({ defaultAccessMode: "READ" });
      try {
        const r = await verifySession.run(
          `MATCH (n:\`${name}\`) RETURN n.id AS id, n.updatedAt AS ts ORDER BY n.id`,
        );
        expect(r.records).toHaveLength(3);
        for (const rec of r.records) {
          expect(rec.get("ts")).toBe(sentinelTs);
        }
      } finally {
        await verifySession.close();
      }
    } finally {
      await cleanupLabel(name);
    }
  });

  test("FR-12 invalidating-change blocked (would_invalidate)", async () => {
    const name = uniqueLabelName("Inv");
    try {
      await createNodeLabel(
        getDriver(),
        {
          name,
          description: "invalidating-change",
          usage_example: "test",
          json_schema_doc: { type: "object", additionalProperties: true },
        },
        "test-actor",
      );

      // Provision constraint + seed 2 data rows.
      const driver = getDriver();
      const setupSession = driver.session();
      try {
        await setupSession.run(
          `CREATE CONSTRAINT node_id_unique_${name} IF NOT EXISTS
           FOR (n:\`${name}\`) REQUIRE n.id IS UNIQUE`,
        );
        for (const id of ["row-a", "row-b"]) {
          await setupSession.run(
            `CREATE (n:\`${name}\` {
               id: $id, name: $id, description: "",
               createdAt: $ts, updatedAt: $ts,
               attributes_json: "{}"
             })`,
            { id, ts: new Date().toISOString() },
          );
        }
      } finally {
        await setupSession.close();
      }

      // Attempt PATCH that newly-requires "sku".
      let captured: unknown = null;
      try {
        await patchNodeLabel(
          getDriver(),
          name,
          {
            json_schema_doc: {
              type: "object",
              required: ["sku"],
              properties: { sku: { type: "string" } },
              additionalProperties: true,
            },
          },
          "test-actor",
        );
      } catch (e) {
        captured = e;
      }
      expect(captured).not.toBeNull();
      const err = captured as {
        code?: string;
        httpStatus?: number;
        details?: {
          affected_count?: number;
          newly_required?: ReadonlyArray<string>;
          sample_node_ids?: ReadonlyArray<string>;
        };
      };
      expect(err.code).toBe("would_invalidate");
      expect(err.httpStatus).toBe(409);
      expect(err.details?.affected_count).toBe(2);
      expect(err.details?.newly_required).toEqual(["sku"]);
    } finally {
      await cleanupLabel(name);
    }
  });

  test("FR-12 forceBackfill writes the backfill value into existing rows", async () => {
    const name = uniqueLabelName("Bf");
    try {
      await createNodeLabel(
        getDriver(),
        {
          name,
          description: "force backfill",
          usage_example: "test",
          json_schema_doc: { type: "object", additionalProperties: true },
        },
        "test-actor",
      );

      const driver = getDriver();
      const setupSession = driver.session();
      try {
        await setupSession.run(
          `CREATE CONSTRAINT node_id_unique_${name} IF NOT EXISTS
           FOR (n:\`${name}\`) REQUIRE n.id IS UNIQUE`,
        );
        for (const id of ["bf-a", "bf-b"]) {
          await setupSession.run(
            `CREATE (n:\`${name}\` {
               id: $id, name: $id, description: "",
               createdAt: $ts, updatedAt: $ts,
               attributes_json: "{}"
             })`,
            { id, ts: new Date().toISOString() },
          );
        }
      } finally {
        await setupSession.close();
      }

      // PATCH with forceBackfill + backfillValue → no throw.
      await patchNodeLabel(
        getDriver(),
        name,
        {
          json_schema_doc: {
            type: "object",
            required: ["sku"],
            properties: { sku: { type: "string" } },
            additionalProperties: true,
          },
        },
        "test-actor",
        { forceBackfill: true, backfillValue: "BACKFILL-SKU" },
      );

      // Verify both rows now carry `attributes.sku === "BACKFILL-SKU"`.
      const verifySession = driver.session({ defaultAccessMode: "READ" });
      try {
        const r = await verifySession.run(
          `MATCH (n:\`${name}\`)
           RETURN n.id AS id, n.attributes_json AS j
           ORDER BY n.id`,
        );
        expect(r.records).toHaveLength(2);
        for (const rec of r.records) {
          const attrs = JSON.parse(rec.get("j") as string) as Record<
            string,
            unknown
          >;
          expect(attrs.sku).toBe("BACKFILL-SKU");
        }
      } finally {
        await verifySession.close();
      }
    } finally {
      await cleanupLabel(name);
    }
  });

  test("pass-1 N-09: deleteNodeLabel writes an _OntologyEvent remove row", async () => {
    const name = uniqueLabelName("DelEvt");
    try {
      await createNodeLabel(
        getDriver(),
        {
          name,
          description: "N-09 fix",
          usage_example: "test",
          json_schema_doc: { type: "object" },
        },
        "test-actor",
      );

      const before = await countByLabel("_OntologyEvent");

      await deleteNodeLabel(getDriver(), name, "test-actor");

      const after = await countByLabel("_OntologyEvent");
      expect(after).toBe(before + 1);

      // Inspect the latest event row by `ts DESC` and check its diff.
      const driver = getDriver();
      const session = driver.session({ defaultAccessMode: "READ" });
      try {
        const r = await session.run(
          `MATCH (e:_OntologyEvent)
           RETURN e.diff_jsonpatch AS diff
           ORDER BY e.ts DESC LIMIT 1`,
        );
        const diffStr = r.records[0]?.get("diff") as string | undefined;
        expect(typeof diffStr).toBe("string");
        const diff = JSON.parse(diffStr!) as ReadonlyArray<{
          op: string;
          path: string;
        }>;
        expect(diff).toEqual([
          { op: "remove", path: `/nodeLabels/${name}` },
        ]);
      } finally {
        await session.close();
      }
    } finally {
      await cleanupLabel(name);
    }
  });

  test("assertDeletePreconditions: populated label → 409 deprecation_required; clear → ok", async () => {
    const name = uniqueLabelName("PrecP");
    try {
      await createNodeLabel(
        getDriver(),
        {
          name,
          description: "preconditions",
          usage_example: "test",
          json_schema_doc: { type: "object", additionalProperties: true },
        },
        "test-actor",
      );

      // Populate a single data row.
      const driver = getDriver();
      const setupSession = driver.session();
      try {
        await setupSession.run(
          `CREATE CONSTRAINT node_id_unique_${name} IF NOT EXISTS
           FOR (n:\`${name}\`) REQUIRE n.id IS UNIQUE`,
        );
        await setupSession.run(
          `CREATE (n:\`${name}\` {
             id: "live-1", name: "live-1", description: "",
             createdAt: $ts, updatedAt: $ts, attributes_json: "{}"
           })`,
          { ts: new Date().toISOString() },
        );
      } finally {
        await setupSession.close();
      }

      // Attempt #1 — populated → throws.
      let captured: unknown = null;
      try {
        await deleteNodeLabel(getDriver(), name, "test-actor");
      } catch (e) {
        captured = e;
      }
      expect(captured).not.toBeNull();
      const err = captured as {
        code?: string;
        httpStatus?: number;
        details?: { precondition_failed?: string };
      };
      expect(err.code).toBe("deprecation_required");
      expect(err.httpStatus).toBe(409);
      expect(err.details?.precondition_failed).toBe("node_instance_count");

      // Clear the data row + retry — succeeds (no throw).
      const cleanupSession = driver.session();
      try {
        await cleanupSession.run(`MATCH (n:\`${name}\`) DETACH DELETE n`);
      } finally {
        await cleanupSession.close();
      }

      await deleteNodeLabel(getDriver(), name, "test-actor");

      const afterDelete = await getNodeLabel(getDriver(), name);
      expect(afterDelete).toBeNull();
    } finally {
      await cleanupLabel(name);
    }
  });
});
