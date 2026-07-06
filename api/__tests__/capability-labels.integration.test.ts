// ddd-system-modeling T-02 / AC-01 — the BoundedContext registry row +
// Capability label register through the runtime ontology registry
// (never the compile-time NODE_LABELS const), idempotently, against a
// FRESH registry (design-review C-02 / DD-14 binding recipe).
//
// Fresh-registry recipe (the registry SUBSET of the applySchema chain,
// NOT a verbatim replay — rev-2 tasks-review N-01): wipe `_Ontology*`
// rows (sanctioned direct-driver op #2) → seedRegistryFromConstTuples →
// registerModelSchema → registerStorySchema → registerCapabilitySchema.
// The real applySchema also runs seedBoundedContexts +
// runSystemKindMigration — deliberately omitted here, so mid-test the
// System label's json_schema_doc is temporarily PERMISSIVE (the wipe
// undoes the migration's required:["systemKind"] tightening). That
// window is not the steady state — no fixture here assumes it.
// Teardown re-runs the FULL applySchema so later integration tests
// against the same Neo4j instance are not poisoned.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { NODE_LABELS } from "@companygraph/shared/schema/nodes";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { applyMetaSchema } from "../src/ontology/meta-bootstrap";
import { seedRegistryFromConstTuples } from "../src/ontology/seed";
import { applySchema } from "../src/neo4j/bootstrap";
import { registerModelSchema } from "../src/scripts/register-model-labels";
import { registerStorySchema } from "../src/scripts/register-story-labels";
import {
  registerCapabilitySchema,
  CAPABILITY_EDGE_TYPES,
} from "../src/scripts/register-capability-labels";
import { createNodeLabel } from "../src/ontology/storage/node-labels";
import { ValidationError } from "../src/errors";

const API_BASE = "http://127.0.0.1:8787/api/v1";
const NEW_LABELS = ["BoundedContext", "Capability"];

async function wipeMetaNamespace(): Promise<void> {
  // Sanctioned direct-driver test write #2 (design §9 / DD-14): the
  // `_Ontology*` wipe that constructs the fresh registry. Data labels
  // don't carry the prefix, so real data survives.
  const session = getDriver().session();
  try {
    await session.run(
      `MATCH (n) WHERE any(l IN labels(n) WHERE l STARTS WITH '_Ontology')
       DETACH DELETE n`,
    );
  } finally {
    await session.close();
  }
}

// The wipe + re-registration ran in THIS process via the direct driver;
// the SERVER process's schema/edge-endpoint caches never saw an
// ontology.changed event. A no-op PATCH through the API emits it in the
// server process and clears them (pattern: helpers/story-fixtures.ts).
async function refreshServerCaches(): Promise<void> {
  const edge = CAPABILITY_EDGE_TYPES[1]!; // SUPPORTED_BY
  const res = await fetch(
    `${API_BASE}/ontology/edge-types/${edge.name}?actor=ddd-system-test-heal`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: edge.description }),
    },
  );
  await res.text();
  if (!res.ok) throw new Error(`cache-refresh PATCH → ${res.status}`);
}

describe("integration: ddd-system-modeling AC-01 label registration (fresh registry)", () => {
  beforeAll(async () => {
    const driver = getDriver();
    await applyMetaSchema(driver);
    await wipeMetaNamespace();
    // Binding fresh-registry order (design-review C-02): const seed →
    // model → story → capability. registerCapabilitySchema's own first
    // step is the BoundedContext row (DD-14).
    await seedRegistryFromConstTuples(driver);
    // Register BoundedContext BEFORE registerModelSchema — the model
    // edges BELONGS_TO_SHARED_DOMAIN + IN_NAMESPACE reference it as an
    // endpoint, and createEdgeType's assertEndpointLabelsExist will
    // throw type_pair_violation if the label isn't in the registry yet.
    // In the real applySchema this is step 3a (bootstrap.ts).
    try {
      await createNodeLabel(
        driver,
        {
          name: "BoundedContext",
          description: "A DDD bounded context.",
          usage_example: "(bc:BoundedContext)",
          json_schema_doc: {},
        },
        "test:ddd-system",
      );
    } catch (e) {
      if (!(e instanceof ValidationError && (e.code as string) === "name_conflict")) throw e;
    }
    await registerModelSchema(driver);
    await registerStorySchema(driver);
    await registerCapabilitySchema(driver);
    await refreshServerCaches();
  });

  afterAll(async () => {
    // Re-run the FULL applySchema (incl. seedBoundedContexts +
    // runSystemKindMigration) so the registry + the tightened System
    // doc are restored for later test files.
    await applySchema(getDriver());
    await refreshServerCaches();
    await closeDriver();
    _resetDriver();
  });

  test("BoundedContext AND Capability _OntologyNodeLabel rows exist after registration", async () => {
    const session = getDriver().session({ defaultAccessMode: "READ" });
    try {
      const r = await session.run(
        `MATCH (l:_OntologyNodeLabel) WHERE l.name IN $names
         RETURN l.name AS name, count(l) AS c ORDER BY name`,
        { names: NEW_LABELS },
      );
      expect(r.records.map((rec) => rec.get("name"))).toEqual(NEW_LABELS);
      for (const rec of r.records) expect(Number(rec.get("c"))).toBe(1);
    } finally {
      await session.close();
    }
  });

  test("idempotent re-run adds no duplicate rows (409 name_conflict swallowed)", async () => {
    const driver = getDriver();
    await registerCapabilitySchema(driver); // second run must be a no-op
    const session = driver.session({ defaultAccessMode: "READ" });
    try {
      const r = await session.run(
        `MATCH (l:_OntologyNodeLabel) WHERE l.name IN $names
         RETURN l.name AS name, count(l) AS c`,
        { names: NEW_LABELS },
      );
      expect(r.records.length).toBe(2);
      for (const rec of r.records) expect(Number(rec.get("c"))).toBe(1);

      const e = await session.run(
        `MATCH (t:_OntologyEdgeType)
         WHERE t.name IN ["NEEDS_CAPABILITY","SUPPORTED_BY","ASSIGNED_TO_CONTEXT","CAPABILITY_IN_MODEL"]
         RETURN t.name AS name, count(t) AS c`,
      );
      expect(e.records.length).toBe(4);
      for (const rec of e.records) expect(Number(rec.get("c"))).toBe(1);
    } finally {
      await session.close();
    }
  });

  test("both labels appear in GET /api/v1/schema", async () => {
    const res = await fetch(`${API_BASE}/schema`);
    expect(res.status).toBe(200);
    const schema = (await res.json()) as { nodeLabels: Array<{ name: string }> };
    const names = schema.nodeLabels.map((l) => l.name);
    for (const name of NEW_LABELS) expect(names).toContain(name);
  });

  test("compile-time NODE_LABELS is unchanged (NFR-01 / AC-21)", () => {
    for (const name of NEW_LABELS) {
      expect(NODE_LABELS as readonly string[]).not.toContain(name);
    }
  });
});
