// T-04 integration test — applyMetaSchema is idempotent + creates the
// 7 unique constraints + 2 range indexes for the `_Ontology*` namespace
// (AC-14).
//
// Requires Neo4j running (bun run dev OR the CI services: neo4j sidecar).
// Describe block prefixed `integration:` so `bun test:integration` picks
// it up + `bun test` excludes it (the project's --test-name-pattern split
// per design §11).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import {
  applyMetaSchema,
  META_CONSTRAINTS,
  META_INDEXES,
} from "../src/ontology/meta-bootstrap";

const EXPECTED_CONSTRAINT_NAMES = [
  "_onto_node_label_name_unique",
  "_onto_edge_type_name_unique",
  "_onto_attr_schema_label_unique",
  "_onto_edge_endpoint_unique",
  "_onto_version_id_unique",
  "_onto_event_id_unique",
  "_onto_alignment_unique",
] as const;

const EXPECTED_INDEX_NAMES = [
  "_onto_audit_ts",
  "_onto_event_ts",
] as const;

describe("integration: applyMetaSchema (T-04 / AC-14)", () => {
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("statement inventory matches the documented counts (design §3.2)", () => {
    // Cheap pre-flight: catches an over- or under-stuffed exports table.
    expect(META_CONSTRAINTS.length).toBe(7);
    expect(META_INDEXES.length).toBe(2);
  });

  test("first run creates all 7 constraints + 2 indexes", async () => {
    const driver = getDriver();
    await applyMetaSchema(driver);

    const session = driver.session();
    try {
      const constraintNames = await session
        .run(`SHOW CONSTRAINTS YIELD name RETURN name`)
        .then((r) => r.records.map((rec) => rec.get("name") as string));
      const indexNames = await session
        .run(`SHOW INDEXES YIELD name RETURN name`)
        .then((r) => r.records.map((rec) => rec.get("name") as string));

      for (const expected of EXPECTED_CONSTRAINT_NAMES) {
        expect(constraintNames).toContain(expected);
      }
      for (const expected of EXPECTED_INDEX_NAMES) {
        expect(indexNames).toContain(expected);
      }
    } finally {
      await session.close();
    }
  });

  test("second run is a no-op (AC-14 idempotency)", async () => {
    const driver = getDriver();

    // Neo4j driver may return `count(...)` as either a Neo4j Integer (with
    // `.toNumber()`) or a plain JS number depending on session config. Coerce
    // safely either way.
    const toN = (v: unknown): number =>
      typeof v === "number"
        ? v
        : v && typeof (v as { toNumber?: () => number }).toNumber === "function"
          ? (v as { toNumber: () => number }).toNumber()
          : Number(v);

    // Snapshot count BEFORE the second invocation.
    const session = driver.session();
    let beforeConstraints: number;
    let beforeIndexes: number;
    try {
      beforeConstraints = toN(
        (await session.run(`SHOW CONSTRAINTS YIELD name RETURN count(name) AS c`)).records[0]!.get("c"),
      );
      beforeIndexes = toN(
        (await session.run(`SHOW INDEXES YIELD name RETURN count(name) AS c`)).records[0]!.get("c"),
      );
    } finally {
      await session.close();
    }

    await applyMetaSchema(driver);

    // Count AFTER the second invocation must equal BEFORE.
    const session2 = driver.session();
    try {
      const afterConstraints = toN(
        (await session2.run(`SHOW CONSTRAINTS YIELD name RETURN count(name) AS c`)).records[0]!.get("c"),
      );
      const afterIndexes = toN(
        (await session2.run(`SHOW INDEXES YIELD name RETURN count(name) AS c`)).records[0]!.get("c"),
      );

      expect(afterConstraints).toBe(beforeConstraints);
      expect(afterIndexes).toBe(beforeIndexes);
    } finally {
      await session2.close();
    }
  });

  test("composite uniqueness enforced on _OntologyEdgeEndpoint", async () => {
    // Probe-test: insert two rows with the same (edge_type_name, from_label,
    // to_label) triple — the second should throw a constraint violation.
    const driver = getDriver();
    const session = driver.session();
    const trip = {
      t: "__TEST_TYPE__",
      f: "__TEST_FROM__",
      to: "__TEST_TO__",
    };
    try {
      // First insert — succeeds.
      await session.run(
        `CREATE (e:_OntologyEdgeEndpoint {edge_type_name: $t, from_label: $f, to_label: $to})`,
        trip,
      );
      // Second insert with the same triple — must throw.
      let captured: unknown = null;
      try {
        await session.run(
          `CREATE (e:_OntologyEdgeEndpoint {edge_type_name: $t, from_label: $f, to_label: $to})`,
          trip,
        );
      } catch (e) {
        captured = e;
      }
      expect(captured).not.toBeNull();
      // Neo4j error code for unique-constraint violation:
      expect((captured as { code?: string }).code).toBe(
        "Neo.ClientError.Schema.ConstraintValidationFailed",
      );
    } finally {
      // Clean up the probe rows.
      await session.run(
        `MATCH (e:_OntologyEdgeEndpoint {edge_type_name: $t}) DETACH DELETE e`,
        trip,
      );
      await session.close();
    }
  });
});
