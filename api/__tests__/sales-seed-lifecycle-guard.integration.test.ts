// sales-process-model T-01/T-13 (AC-13) — sales.json is a valid {nodes,edges}
// payload of ONLY self-contained non-lifecycle process rows; loads via
// POST /api/v1/import; a lifecycle row → 409 model_lifecycle_route_required,
// nothing written. Requires the stack up.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { BASE, cypher, num } from "./sales-test-harness";

const FIXTURE_PATH = resolve(import.meta.dir, "../../shared/seed/saas-operator/sales.json");

interface Fixture {
  nodes: Array<{ label: string; id: string }>;
  edges: Array<{ type: string; id: string }>;
}

function loadFixture(): Fixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
}

const FORBIDDEN_LABELS = ["BusinessModel", "BusinessModule", "BusinessModuleVersion", "ModuleInstance", "Funnel", "Stage", "UserStory", "AcceptanceCriterion", "Capability"];
const FORBIDDEN_EDGES = ["IN_MODEL", "HAS_VERSION", "INSTANTIATES", "INSTANCE_IN", "FORKED_FROM", "MEASURES", "CONVERTS_TO", "HAS_STAGE", "ALIGNED_TO"];

describe("integration: sales fixture lifecycle-guard clean (AC-13)", () => {
  beforeAll(async () => {
    // Load the real fixture (foundation loader also does this; the direct import
    // here proves the fixture is a valid non-lifecycle payload).
    const res = await fetch(`${BASE}/api/v1/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: readFileSync(FIXTURE_PATH, "utf8"),
    });
    expect(res.status).toBe(200);
  });
  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("AC-13: fixture contains only self-contained non-lifecycle rows", () => {
    const fx = loadFixture();
    for (const n of fx.nodes) expect(FORBIDDEN_LABELS).not.toContain(n.label);
    for (const e of fx.edges) expect(FORBIDDEN_EDGES).not.toContain(e.type);
    expect(fx.nodes.length).toBeGreaterThan(0);
    expect(fx.edges.length).toBeGreaterThan(0);
  });

  test("AC-13: loading the fixture writes the Sales process content", async () => {
    const res = await cypher(`MATCH (j:UserJourney) WHERE j.attributes_json CONTAINS '"seedKey":"prospect-qualify"' RETURN count(j) AS n`);
    expect(num(res.rows[0]!.n)).toBe(1);
  });

  test("AC-13 negative: a lifecycle row → 409 model_lifecycle_route_required, nothing written", async () => {
    const bogusId = "018f0220-0000-7000-8000-0000000009fd";
    const res = await fetch(`${BASE}/api/v1/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nodes: [{ label: "BusinessModel", id: bogusId, name: "Illegal lifecycle node", description: "x", attributes: {} }],
        edges: [],
      }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string }; code?: string };
    const code = body.error?.code ?? body.code;
    expect(code).toBe("model_lifecycle_route_required");
    const written = await cypher(`MATCH (m {id:$id}) RETURN count(m) AS n`, { id: bogusId });
    expect(num(written.rows[0]!.n)).toBe(0);
  });
});
