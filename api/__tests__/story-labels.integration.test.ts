import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { NODE_LABELS } from "@companygraph/shared/schema/nodes";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { registerStorySchema } from "../src/scripts/register-story-labels";
import { ensureStorySchema } from "./helpers/story-fixtures";

// story-spec-core T-02 / AC-01 — UserStory + AcceptanceCriterion are
// registered through the runtime ontology registry (never the
// compile-time NODE_LABELS const), idempotently.

const API_BASE = "http://127.0.0.1:8787/api/v1";
const STORY_LABELS = ["AcceptanceCriterion", "UserStory"]; // alphabetical for ORDER BY
const STORY_EDGE_TYPES = ["ACCEPTANCE_OF", "DESCRIBES_ACTIVITY", "STORY_FOR_ROLE"];

describe("integration: story-spec-core AC-01 label registration", () => {
  beforeAll(async () => {
    await ensureStorySchema();
  });

  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("registerStorySchema is idempotent — re-run adds no duplicate registry rows", async () => {
    const driver = getDriver();
    await registerStorySchema(driver);
    await registerStorySchema(driver); // second run must be a no-op

    const session = driver.session({ defaultAccessMode: "READ" });
    try {
      const r = await session.run(
        `MATCH (l:_OntologyNodeLabel) WHERE l.name IN $names
         RETURN l.name AS name, count(l) AS c ORDER BY name`,
        { names: STORY_LABELS },
      );
      expect(r.records.map((rec) => rec.get("name"))).toEqual(STORY_LABELS);
      for (const rec of r.records) expect(rec.get("c")).toBe(1);

      const e = await session.run(
        `MATCH (t:_OntologyEdgeType) WHERE t.name IN $names
         RETURN t.name AS name, count(t) AS c ORDER BY name`,
        { names: STORY_EDGE_TYPES },
      );
      expect(e.records.map((rec) => rec.get("name"))).toEqual(STORY_EDGE_TYPES);
      for (const rec of e.records) expect(rec.get("c")).toBe(1);
    } finally {
      await session.close();
    }
  });

  test("both labels appear in GET /api/v1/schema", async () => {
    const res = await fetch(`${API_BASE}/schema`);
    expect(res.status).toBe(200);
    const schema = (await res.json()) as {
      nodeLabels: Array<{ name: string }>;
      edgeTypes: Array<{ name: string }>;
    };
    const labelNames = schema.nodeLabels.map((l) => l.name);
    for (const name of STORY_LABELS) expect(labelNames).toContain(name);
    const typeNames = schema.edgeTypes.map((t) => t.name);
    for (const name of STORY_EDGE_TYPES) expect(typeNames).toContain(name);
  });

  test("compile-time NODE_LABELS is unchanged (NFR-01 / AC-18)", () => {
    for (const name of STORY_LABELS) {
      expect(NODE_LABELS as readonly string[]).not.toContain(name);
    }
  });
});
