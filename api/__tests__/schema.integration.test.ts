import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { NODE_LABELS } from "@companygraph/shared/schema/nodes";
import { EDGE_TYPES } from "@companygraph/shared/schema/edges";
import { _resetDriver, closeDriver, getDriver } from "../src/neo4j/driver";
import { applySchema } from "../src/neo4j/bootstrap";

// AC-04 — Schema bootstrap creates expected constraints + indexes
// idempotently.
//
// Strategy:
//   1. applySchema() once (may be a no-op if a previous run already
//      applied — the production code uses IF NOT EXISTS).
//   2. Snapshot SHOW CONSTRAINTS + SHOW INDEXES counts.
//   3. applySchema() a second time.
//   4. Re-snapshot — counts must be unchanged (idempotence).
//   5. Assert every NODE_LABEL has `node_id_unique_<label>` + `node_name_<label>`.
//   6. Assert every EDGE_TYPE has `edge_id_unique_<type>`.
//
// Test names are prefixed `integration:` so `bun test:integration`
// (`--test-name-pattern '^integration:'`) picks them up.
describe("integration: AC-04 schema bootstrap", () => {
  beforeAll(async () => {
    // Make sure the driver is alive before any of the per-test work runs.
    await getDriver().verifyConnectivity();
  });

  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  async function countConstraints(): Promise<number> {
    const session = getDriver().session({ defaultAccessMode: "READ" });
    try {
      const r = await session.run("SHOW CONSTRAINTS YIELD name RETURN count(*) AS c");
      const c = r.records[0]?.get("c") as
        | { toNumber: () => number }
        | number
        | undefined;
      return typeof c === "number" ? c : (c?.toNumber() ?? 0);
    } finally {
      await session.close();
    }
  }

  async function countIndexes(): Promise<number> {
    const session = getDriver().session({ defaultAccessMode: "READ" });
    try {
      const r = await session.run("SHOW INDEXES YIELD name RETURN count(*) AS c");
      const c = r.records[0]?.get("c") as
        | { toNumber: () => number }
        | number
        | undefined;
      return typeof c === "number" ? c : (c?.toNumber() ?? 0);
    } finally {
      await session.close();
    }
  }

  async function constraintNames(): Promise<Set<string>> {
    const session = getDriver().session({ defaultAccessMode: "READ" });
    try {
      const r = await session.run("SHOW CONSTRAINTS YIELD name RETURN name");
      return new Set(r.records.map((rec) => rec.get("name") as string));
    } finally {
      await session.close();
    }
  }

  async function indexNames(): Promise<Set<string>> {
    const session = getDriver().session({ defaultAccessMode: "READ" });
    try {
      const r = await session.run("SHOW INDEXES YIELD name RETURN name");
      return new Set(r.records.map((rec) => rec.get("name") as string));
    } finally {
      await session.close();
    }
  }

  test("applySchema is idempotent — second run does not change counts", async () => {
    await applySchema(getDriver());
    const constraintsBefore = await countConstraints();
    const indexesBefore = await countIndexes();

    await applySchema(getDriver());
    const constraintsAfter = await countConstraints();
    const indexesAfter = await countIndexes();

    expect(constraintsAfter).toBe(constraintsBefore);
    expect(indexesAfter).toBe(indexesBefore);
  });

  test("every NODE_LABEL has a `node_id_unique_<label>` UNIQUENESS constraint", async () => {
    await applySchema(getDriver());
    const names = await constraintNames();
    for (const label of NODE_LABELS) {
      expect(names.has(`node_id_unique_${label}`)).toBe(true);
    }
  });

  test("every NODE_LABEL has a `node_name_<label>` range index", async () => {
    await applySchema(getDriver());
    const names = await indexNames();
    for (const label of NODE_LABELS) {
      expect(names.has(`node_name_${label}`)).toBe(true);
    }
  });

  test("every EDGE_TYPE has an `edge_id_unique_<type>` constraint", async () => {
    await applySchema(getDriver());
    const names = await constraintNames();
    for (const type of EDGE_TYPES) {
      expect(names.has(`edge_id_unique_${type}`)).toBe(true);
    }
  });
});
