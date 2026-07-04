import { afterAll, describe, expect, test } from "bun:test";
import { NODE_LABELS } from "@companygraph/shared/schema/nodes";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { registerModelSchema } from "../src/scripts/register-model-labels";

// model-workspace-core T-03 / AC-01 — the four lifecycle labels are
// registered through the runtime ontology registry (never the
// compile-time NODE_LABELS const), idempotently.

const API_BASE = "http://127.0.0.1:8787/api/v1";
const MODEL_LABELS = [
  "BusinessModel",
  "BusinessModule",
  "BusinessModuleVersion",
  "ModuleInstance",
];

describe("integration: model-workspace-core AC-01 label registration", () => {
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("registerModelSchema is idempotent — re-run adds no duplicate registry rows", async () => {
    const driver = getDriver();
    await registerModelSchema(driver);
    await registerModelSchema(driver); // second run must be a no-op

    const session = driver.session({ defaultAccessMode: "READ" });
    try {
      const r = await session.run(
        `MATCH (l:_OntologyNodeLabel) WHERE l.name IN $names
         RETURN l.name AS name, count(l) AS c ORDER BY name`,
        { names: MODEL_LABELS },
      );
      expect(r.records.map((rec) => rec.get("name"))).toEqual(MODEL_LABELS);
      for (const rec of r.records) expect(rec.get("c")).toBe(1);

      const e = await session.run(
        `MATCH (t:_OntologyEdgeType)
         WHERE t.name IN ["IN_MODEL","HAS_VERSION","INSTANTIATES","INSTANCE_IN","FORKED_FROM"]
         RETURN t.name AS name, count(t) AS c ORDER BY name`,
      );
      expect(e.records.length).toBe(5);
      for (const rec of e.records) expect(rec.get("c")).toBe(1);
    } finally {
      await session.close();
    }
  });

  test("all four labels appear in GET /api/v1/schema", async () => {
    const res = await fetch(`${API_BASE}/schema`);
    expect(res.status).toBe(200);
    const schema = (await res.json()) as {
      nodeLabels: Array<{ name: string }>;
      edgeTypes: Array<{ name: string }>;
    };
    const labelNames = schema.nodeLabels.map((l) => l.name);
    for (const name of MODEL_LABELS) expect(labelNames).toContain(name);
    const typeNames = schema.edgeTypes.map((t) => t.name);
    for (const name of ["IN_MODEL", "HAS_VERSION", "INSTANTIATES", "INSTANCE_IN", "FORKED_FROM"]) {
      expect(typeNames).toContain(name);
    }
  });

  test("compile-time NODE_LABELS is unchanged (NFR-01 / AC-20)", () => {
    for (const name of MODEL_LABELS) {
      expect(NODE_LABELS as readonly string[]).not.toContain(name);
    }
  });
});
