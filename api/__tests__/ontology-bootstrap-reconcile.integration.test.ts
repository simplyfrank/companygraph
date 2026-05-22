// T-09a integration test — `applySchema` is seed-aware + registry-iterating
// per design §7.1.
//
// Three scenarios:
//   1. Fresh bootstrap — meta-schema + 6 seed labels + 6 seed edge types +
//      per-label data constraints + per-label name indexes + per-edge-type
//      id-unique constraints are all created.
//   2. Re-bootstrap is a no-op — seed step is gated by `isRegistryEmpty`,
//      so no new `_OntologyNodeLabel` rows and no new `_OntologyVersion`
//      rows are written.
//   3. Adding a label row to the registry (without going through the not-
//      yet-implemented T-10 storage helper) and re-running bootstrap
//      creates the corresponding `node_id_unique_*` constraint + the
//      `node_name_*` index. This is the runtime-registry-iteration contract
//      from FR-15 — proves the bootstrap iterates `_OntologyNodeLabel`
//      rows rather than the compile-time const tuple.
//
// Requires Neo4j running (bun run dev OR CI's neo4j sidecar). Describe
// block prefixed `integration:` per the project's bun test:integration
// filter.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { applySchema } from "../src/neo4j/bootstrap";
import { NODE_LABELS } from "@companygraph/shared/schema/nodes";
import { EDGE_TYPES } from "@companygraph/shared/schema/edges";

// Neo4j driver may return `count(...)` as either a plain JS number (when
// `disableLosslessIntegers: true`, which the production singleton sets) or
// as a Neo4j Integer object. Coerce safely either way — mirrors the same
// helper used by `seed.ts` + `ontology-seed.integration.test.ts`.
const toN = (v: unknown): number =>
  typeof v === "number"
    ? v
    : v && typeof (v as { toNumber?: () => number }).toNumber === "function"
      ? (v as { toNumber: () => number }).toNumber()
      : Number(v);

// Probe label used in scenario 3 — a name that does NOT appear in the
// graph-core seed tuple. If this ever clashes with a real seed label,
// the `beforeAll` cleanup would still drop its `_OntologyNodeLabel` row,
// but the post-test cleanup would also strip a "real" label — so keep
// it obviously synthetic.
const PROBE_LABEL = "Product";

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

async function dropPerLabelConstraintsAndIndexes(): Promise<void> {
  // Best-effort drop of the per-label data constraints + indexes that
  // `applySchema` creates. They may or may not exist from a prior run.
  // `DROP ... IF EXISTS` makes each statement safe to run unconditionally.
  const driver = getDriver();
  const session = driver.session();
  try {
    // Drop for the 6 seed labels.
    for (const label of NODE_LABELS) {
      await session.run(
        `DROP CONSTRAINT node_id_unique_${label} IF EXISTS`,
      );
      await session.run(`DROP INDEX node_name_${label} IF EXISTS`);
    }
    // Drop for the 6 seed edge types.
    for (const type of EDGE_TYPES) {
      await session.run(
        `DROP CONSTRAINT edge_id_unique_${type} IF EXISTS`,
      );
    }
    // Drop the probe-label artifacts in case a prior failed run left them.
    await session.run(
      `DROP CONSTRAINT node_id_unique_${PROBE_LABEL} IF EXISTS`,
    );
    await session.run(`DROP INDEX node_name_${PROBE_LABEL} IF EXISTS`);
  } finally {
    await session.close();
  }
}

async function listConstraintNames(prefix: string): Promise<string[]> {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `SHOW CONSTRAINTS YIELD name
       WHERE name STARTS WITH $prefix
       RETURN name ORDER BY name`,
      { prefix },
    );
    return r.records.map((rec) => rec.get("name") as string);
  } finally {
    await session.close();
  }
}

async function listIndexNames(prefix: string): Promise<string[]> {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const r = await session.run(
      `SHOW INDEXES YIELD name
       WHERE name STARTS WITH $prefix
       RETURN name ORDER BY name`,
      { prefix },
    );
    return r.records.map((rec) => rec.get("name") as string);
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

describe("integration: applySchema bootstrap reconcile (T-09a / FR-15 / AC-14)", () => {
  beforeAll(async () => {
    // Fresh-state cleanup: drop the meta-namespace registry rows AND the
    // per-label data constraints/indexes so the first test starts from a
    // verifiably clean slate. The data nodes themselves (Domain rows etc.)
    // are NOT touched — the `_Ontology` label-prefix filter means real
    // data survives.
    await clearMetaNamespace();
    await dropPerLabelConstraintsAndIndexes();
  });

  afterAll(async () => {
    // Leave the per-label constraints in place (production server.ts
    // expects them) but clear the probe-label artifacts so the next run
    // is reproducible.
    const driver = getDriver();
    const session = driver.session();
    try {
      await session.run(
        `DROP CONSTRAINT node_id_unique_${PROBE_LABEL} IF EXISTS`,
      );
      await session.run(`DROP INDEX node_name_${PROBE_LABEL} IF EXISTS`);
      // Also remove the probe `_OntologyNodeLabel` row so the registry
      // stays clean for downstream tests.
      await session.run(
        `MATCH (l:_OntologyNodeLabel {name: $name}) DETACH DELETE l`,
        { name: PROBE_LABEL },
      );
    } finally {
      await session.close();
    }
    await closeDriver();
    _resetDriver();
  });

  test("fresh bootstrap creates registry + per-label constraints", async () => {
    const driver = getDriver();
    await applySchema(driver);

    // Seed step populated the registry with NODE_LABELS.length entries.
    expect(await countByLabel("_OntologyNodeLabel")).toBe(NODE_LABELS.length);
    expect(await countByLabel("_OntologyEdgeType")).toBe(EDGE_TYPES.length);

    // Step 3 created the per-label data constraints + name indexes for
    // every registry row.
    const nodeIdConstraints = await listConstraintNames("node_id_unique_");
    const edgeIdConstraints = await listConstraintNames("edge_id_unique_");
    const nodeNameIndexes = await listIndexNames("node_name_");

    expect(nodeIdConstraints).toHaveLength(NODE_LABELS.length);
    expect(edgeIdConstraints).toHaveLength(EDGE_TYPES.length);
    expect(nodeNameIndexes).toHaveLength(NODE_LABELS.length);

    // Spot-check the naming convention.
    for (const label of NODE_LABELS) {
      expect(nodeIdConstraints).toContain(`node_id_unique_${label}`);
      expect(nodeNameIndexes).toContain(`node_name_${label}`);
    }
    for (const type of EDGE_TYPES) {
      expect(edgeIdConstraints).toContain(`edge_id_unique_${type}`);
    }
  });

  test("re-bootstrap is a no-op — seed is gated by isRegistryEmpty", async () => {
    const driver = getDriver();

    const beforeLabels = await countByLabel("_OntologyNodeLabel");
    const beforeTypes = await countByLabel("_OntologyEdgeType");
    const beforeVersions = await countByLabel("_OntologyVersion");
    const beforeEvents = await countByLabel("_OntologyEvent");
    const beforeAudits = await countByLabel("_OntologyAudit");

    await applySchema(driver);

    // Step 2's `isRegistryEmpty` check short-circuits the seed → no new
    // label/type rows AND no new audit/version/event row (pass-1 C-03).
    expect(await countByLabel("_OntologyNodeLabel")).toBe(beforeLabels);
    expect(await countByLabel("_OntologyEdgeType")).toBe(beforeTypes);
    expect(await countByLabel("_OntologyVersion")).toBe(beforeVersions);
    expect(await countByLabel("_OntologyEvent")).toBe(beforeEvents);
    expect(await countByLabel("_OntologyAudit")).toBe(beforeAudits);

    // Constraint/index counts also unchanged.
    expect(await listConstraintNames("node_id_unique_")).toHaveLength(
      NODE_LABELS.length,
    );
    expect(await listConstraintNames("edge_id_unique_")).toHaveLength(
      EDGE_TYPES.length,
    );
    expect(await listIndexNames("node_name_")).toHaveLength(NODE_LABELS.length);
  });

  test("adding a label row to the registry + re-bootstrap creates its constraint", async () => {
    // Adds a probe label directly to the meta-registry (bypassing the
    // not-yet-shipped createNodeLabel storage helper from T-10 — we are
    // simulating the post-T-10 path).
    const driver = getDriver();
    const now = new Date().toISOString();
    const session = driver.session();
    try {
      await session.run(
        `MERGE (l:_OntologyNodeLabel {name: $name})
         ON CREATE SET
           l.description = $description,
           l.usage_example = $usage_example,
           l.created_at = $now,
           l.updated_at = $now`,
        {
          name: PROBE_LABEL,
          description: `Probe label for T-09a registry-iteration test.`,
          usage_example: `e.g. POST /api/v1/nodes/${PROBE_LABEL}`,
          now,
        },
      );
    } finally {
      await session.close();
    }

    // Sanity: the probe constraint/index do NOT yet exist (we haven't
    // re-run bootstrap).
    expect(await listConstraintNames(`node_id_unique_${PROBE_LABEL}`))
      .toEqual([]);
    expect(await listIndexNames(`node_name_${PROBE_LABEL}`)).toEqual([]);

    // Re-run bootstrap — should pick the probe label out of the registry
    // and create the data constraint + name index.
    await applySchema(driver);

    expect(await listConstraintNames(`node_id_unique_${PROBE_LABEL}`)).toEqual([
      `node_id_unique_${PROBE_LABEL}`,
    ]);
    expect(await listIndexNames(`node_name_${PROBE_LABEL}`)).toEqual([
      `node_name_${PROBE_LABEL}`,
    ]);

    // Seed-step gating still in effect — the probe addition did not
    // empty the registry, so no new audit/version/event rows were written
    // by the seed (which never ran). This guards the §7.1 ordering rule:
    // step 2 is gated by `isRegistryEmpty`, not by per-label diff.
    expect(await countByLabel("_OntologyNodeLabel")).toBe(NODE_LABELS.length + 1);
  });
});
