// T-16 integration test — executeMigration discriminated-union dispatcher.
//
// All 5 variants exercised against live Neo4j: rename_attribute,
// remap_value, remove_attribute, merge_labels, split_label. Verifies
// (a) rows_affected matches expected; (b) audit + version + event +
// migration rows persist; (c) NO operator Cypher reaches executeWrite
// (the discriminated-union contract — design pass-1 C-09).

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { applyMetaSchema } from "../src/ontology/meta-bootstrap";
import { seedRegistryFromConstTuples, isRegistryEmpty } from "../src/ontology/seed";
import { executeMigration } from "../src/ontology/storage/migrations";
import { generateId } from "../src/ids";

const toN = (v: unknown): number =>
  typeof v === "number"
    ? v
    : v && typeof (v as { toNumber?: () => number }).toNumber === "function"
      ? (v as { toNumber: () => number }).toNumber()
      : Number(v);

// Throwaway label used across all 5 sub-tests so we never touch real data.
const TEST_LABEL = "T16Test";

async function clearTestState(): Promise<void> {
  const driver = getDriver();
  const s = driver.session();
  try {
    await s.run(`MATCH (n:${TEST_LABEL}) DETACH DELETE n`);
    await s.run(`MATCH (n:T16Split_A) DETACH DELETE n`);
    await s.run(`MATCH (n:T16Split_B) DETACH DELETE n`);
    await s.run(`MATCH (n:T16Merge_Src1) DETACH DELETE n`);
    await s.run(`MATCH (n:T16Merge_Src2) DETACH DELETE n`);
    await s.run(`MATCH (n:T16Merge_Dest) DETACH DELETE n`);
  } finally {
    await s.close();
  }
}

async function countNodesWithLabel(label: string): Promise<number> {
  const s = getDriver().session();
  try {
    const res = await s.run(`MATCH (n:\`${label}\`) RETURN count(n) AS c`);
    return toN(res.records[0]!.get("c"));
  } finally {
    await s.close();
  }
}

async function readAttributes(id: string): Promise<Record<string, unknown>> {
  const s = getDriver().session();
  try {
    const res = await s.run(
      `MATCH (n {id: $id}) RETURN n.attributes_json AS aj`,
      { id },
    );
    const aj = res.records[0]?.get("aj") as string | null;
    return aj ? JSON.parse(aj) : {};
  } finally {
    await s.close();
  }
}

describe("integration: executeMigration (T-16 / FR-16 / design §4.7)", () => {
  beforeAll(async () => {
    const driver = getDriver();
    await applyMetaSchema(driver);
    if (await isRegistryEmpty(driver)) {
      await seedRegistryFromConstTuples(driver);
    }
  });

  beforeEach(async () => {
    await clearTestState();
  });

  afterAll(async () => {
    await clearTestState();
    await closeDriver();
    _resetDriver();
  });

  test("rename_attribute moves attributes.from_key → attributes.to_key", async () => {
    const driver = getDriver();
    const s = driver.session();
    const ids = [generateId(), generateId()];
    try {
      for (const id of ids) {
        await s.run(
          `CREATE (n:${TEST_LABEL} {id: $id, name: "test", attributes_json: $a, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z"})`,
          { id, a: JSON.stringify({ old_key: "value1" }) },
        );
      }
    } finally {
      await s.close();
    }

    const result = await executeMigration(
      driver,
      {
        type: "rename_attribute",
        target: TEST_LABEL,
        transform: { from_key: "old_key", to_key: "new_key" },
      },
      "operator",
    );
    expect(result.rows_affected).toBe(2);

    for (const id of ids) {
      const attrs = await readAttributes(id);
      expect(attrs.new_key).toBe("value1");
      expect(attrs.old_key).toBeUndefined();
    }
  });

  test("remap_value rewrites attributes[key] from from_value to to_value", async () => {
    const driver = getDriver();
    const s = driver.session();
    const ids = [generateId(), generateId(), generateId()];
    try {
      await s.run(
        `CREATE (:${TEST_LABEL} {id: $id, name: "x", attributes_json: $a, createdAt: "t", updatedAt: "t"})`,
        { id: ids[0], a: JSON.stringify({ status: "old" }) },
      );
      await s.run(
        `CREATE (:${TEST_LABEL} {id: $id, name: "x", attributes_json: $a, createdAt: "t", updatedAt: "t"})`,
        { id: ids[1], a: JSON.stringify({ status: "old" }) },
      );
      await s.run(
        `CREATE (:${TEST_LABEL} {id: $id, name: "x", attributes_json: $a, createdAt: "t", updatedAt: "t"})`,
        { id: ids[2], a: JSON.stringify({ status: "different" }) },
      );
    } finally {
      await s.close();
    }

    const result = await executeMigration(
      driver,
      {
        type: "remap_value",
        target: TEST_LABEL,
        transform: { key: "status", from_value: "old", to_value: "new" },
      },
      "operator",
    );
    expect(result.rows_affected).toBe(2);
    expect((await readAttributes(ids[0]!)).status).toBe("new");
    expect((await readAttributes(ids[1]!)).status).toBe("new");
    expect((await readAttributes(ids[2]!)).status).toBe("different");
  });

  test("remove_attribute deletes attributes[key] from every matching row", async () => {
    const driver = getDriver();
    const s = driver.session();
    const id = generateId();
    try {
      await s.run(
        `CREATE (:${TEST_LABEL} {id: $id, name: "x", attributes_json: $a, createdAt: "t", updatedAt: "t"})`,
        { id, a: JSON.stringify({ deprecated_field: "to-remove", keep: "yes" }) },
      );
    } finally {
      await s.close();
    }

    const result = await executeMigration(
      driver,
      {
        type: "remove_attribute",
        target: TEST_LABEL,
        transform: { key: "deprecated_field" },
      },
      "operator",
    );
    expect(result.rows_affected).toBe(1);
    const attrs = await readAttributes(id);
    expect(attrs.deprecated_field).toBeUndefined();
    expect(attrs.keep).toBe("yes");
  });

  test("merge_labels moves nodes from source_labels onto target", async () => {
    const driver = getDriver();
    const s = driver.session();
    try {
      await s.run(`CREATE (:T16Merge_Src1 {id: $id, name: "a"})`, { id: generateId() });
      await s.run(`CREATE (:T16Merge_Src2 {id: $id, name: "b"})`, { id: generateId() });
      await s.run(`CREATE (:T16Merge_Src1 {id: $id, name: "c"})`, { id: generateId() });
    } finally {
      await s.close();
    }
    expect(await countNodesWithLabel("T16Merge_Src1")).toBe(2);
    expect(await countNodesWithLabel("T16Merge_Src2")).toBe(1);
    expect(await countNodesWithLabel("T16Merge_Dest")).toBe(0);

    const result = await executeMigration(
      driver,
      {
        type: "merge_labels",
        target: "T16Merge_Dest",
        transform: { source_labels: ["T16Merge_Src1", "T16Merge_Src2"] },
      },
      "operator",
    );
    expect(result.rows_affected).toBe(3);
    expect(await countNodesWithLabel("T16Merge_Src1")).toBe(0);
    expect(await countNodesWithLabel("T16Merge_Src2")).toBe(0);
    expect(await countNodesWithLabel("T16Merge_Dest")).toBe(3);
  });

  test("split_label partitions nodes by predicate_key value into mapping labels", async () => {
    const driver = getDriver();
    const s = driver.session();
    try {
      await s.run(
        `CREATE (:${TEST_LABEL} {id: $id, name: "x", attributes_json: $a, createdAt: "t", updatedAt: "t"})`,
        { id: generateId(), a: JSON.stringify({ kind: "sku" }) },
      );
      await s.run(
        `CREATE (:${TEST_LABEL} {id: $id, name: "y", attributes_json: $a, createdAt: "t", updatedAt: "t"})`,
        { id: generateId(), a: JSON.stringify({ kind: "sku" }) },
      );
      await s.run(
        `CREATE (:${TEST_LABEL} {id: $id, name: "z", attributes_json: $a, createdAt: "t", updatedAt: "t"})`,
        { id: generateId(), a: JSON.stringify({ kind: "service" }) },
      );
    } finally {
      await s.close();
    }
    expect(await countNodesWithLabel(TEST_LABEL)).toBe(3);

    const result = await executeMigration(
      driver,
      {
        type: "split_label",
        target: TEST_LABEL,
        transform: {
          predicate_key: "kind",
          mapping: { sku: "T16Split_A", service: "T16Split_B" },
        },
      },
      "operator",
    );
    expect(result.rows_affected).toBe(3);
    expect(await countNodesWithLabel("T16Split_A")).toBe(2);
    expect(await countNodesWithLabel("T16Split_B")).toBe(1);
    expect(await countNodesWithLabel(TEST_LABEL)).toBe(0);
  });

  test("_OntologyMigration row + audit + version + event persist together (NFR-01 single tx)", async () => {
    const driver = getDriver();
    const s = driver.session();
    try {
      await s.run(
        `CREATE (:${TEST_LABEL} {id: $id, name: "x", attributes_json: $a, createdAt: "t", updatedAt: "t"})`,
        { id: generateId(), a: JSON.stringify({ k: "v" }) },
      );
    } finally {
      await s.close();
    }

    const beforeMig = toN(
      (
        await (async () => {
          const s = driver.session();
          try {
            return (
              await s.run(`MATCH (m:_OntologyMigration) RETURN count(m) AS c`)
            ).records[0]!.get("c");
          } finally {
            await s.close();
          }
        })()
      ),
    );

    const result = await executeMigration(
      driver,
      {
        type: "rename_attribute",
        target: TEST_LABEL,
        transform: { from_key: "k", to_key: "k_new" },
      },
      "operator",
    );

    const s2 = driver.session();
    try {
      const m = await s2.run(
        `MATCH (m:_OntologyMigration {migration_id: $id}) RETURN m`,
        { id: result.migration_id },
      );
      expect(m.records).toHaveLength(1);
      const props = (m.records[0]!.get("m") as { properties: Record<string, unknown> }).properties;
      expect(props.type).toBe("rename_attribute");
      expect(props.target).toBe(TEST_LABEL);
      expect(props.actor).toBe("operator");
      expect(props.version_id).toBe(result.version_id);

      // Version row should exist with the matching id.
      const v = await s2.run(
        `MATCH (v:_OntologyVersion {version_id: $vid}) RETURN v`,
        { vid: result.version_id },
      );
      expect(v.records).toHaveLength(1);

      // Audit row tagged execute_migration.
      const a = await s2.run(
        `MATCH (a:_OntologyAudit {version_id: $vid}) RETURN a.action AS action`,
        { vid: result.version_id },
      );
      expect(a.records[0]?.get("action")).toBe("execute_migration");

      // Event row.
      const e = await s2.run(
        `MATCH (e:_OntologyEvent {version_id: $vid}) RETURN e.diff_jsonpatch AS d`,
        { vid: result.version_id },
      );
      const diff = JSON.parse(e.records[0]!.get("d") as string);
      expect(diff[0].op).toBe("test");
      expect(diff[0].path).toBe(`/migrations/${result.migration_id}`);
    } finally {
      await s2.close();
    }

    const afterMig = toN(
      (
        await (async () => {
          const s = driver.session();
          try {
            return (
              await s.run(`MATCH (m:_OntologyMigration) RETURN count(m) AS c`)
            ).records[0]!.get("c");
          } finally {
            await s.close();
          }
        })()
      ),
    );
    expect(afterMig).toBe(beforeMig + 1);
  });
});
