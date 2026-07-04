// system-augmentation-model T-12 — seed fixture loads against the
// tightened schema (AC-09 as amended by DD-13; FR-08).
//
// **AC-09 verification amendment (DD-13, carried verbatim as the design
// mandates):** AC-09 is verified via direct POST of
// `shared/seed/retail-mini.json` to `POST /api/v1/import` (the wire path
// the graph-core seed contract defined) in
// `system-kind-seed.integration.test.ts`; the root seed script's drift is
// owned by `_baseline` and is out of this spec's scope.
//
// Counts are asserted FIXTURE-SCOPED (nodes/edges whose ids come from the
// fixture) so the suite holds on a DB that also carries other datasets.
// The per-label node counts are additionally pinned to graph-core AC-07's
// exact numbers (Domain 4, UserJourney 8, Activity 32, Role 6, System 6,
// Location 4). Edge counts are derived from the fixture itself (the
// fixture's edge growth past graph-core's original 128 is
// `_baseline`-owned drift, not this spec's).
//
// Requires Neo4j + API server running. Names prefixed `integration:`.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { applySchema } from "../src/neo4j/bootstrap";

const BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";
const SEED_PATH = join(import.meta.dir, "..", "..", "shared", "seed", "retail-mini.json");

interface Fixture {
  nodes: Array<{ label: string; id: string; attributes?: Record<string, unknown> }>;
  edges: Array<{ type: string; id: string }>;
}

interface ImportResult {
  imported: { nodes: number; edges: number };
  errors?: unknown[];
}

const fixture = JSON.parse(readFileSync(SEED_PATH, "utf8")) as Fixture;
const fixtureNodeIds = fixture.nodes.map((n) => n.id);
const fixtureEdgeIds = fixture.edges.map((e) => e.id);
const fixtureSystemIds = fixture.nodes.filter((n) => n.label === "System").map((n) => n.id);

async function postSeed(): Promise<ImportResult> {
  const r = await fetch(`${BASE}/api/v1/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: readFileSync(SEED_PATH, "utf8"),
  });
  expect(r.status).toBe(200);
  return (await r.json()) as ImportResult;
}

async function fixtureCounts(): Promise<{
  nodesByLabel: Record<string, number>;
  edgeCount: number;
}> {
  const session = getDriver().session({ defaultAccessMode: "READ" });
  try {
    const nodeRes = await session.run(
      `MATCH (n) WHERE n.id IN $ids
       WITH labels(n)[0] AS label, count(n) AS c
       RETURN label, c ORDER BY label`,
      { ids: fixtureNodeIds },
    );
    const nodesByLabel: Record<string, number> = {};
    for (const rec of nodeRes.records) {
      nodesByLabel[rec.get("label") as string] = rec.get("c") as number;
    }
    const edgeRes = await session.run(
      `MATCH ()-[r]->() WHERE r.id IN $ids RETURN count(r) AS c`,
      { ids: fixtureEdgeIds },
    );
    return { nodesByLabel, edgeCount: edgeRes.records[0]!.get("c") as number };
  } finally {
    await session.close();
  }
}

describe("integration: retail-mini seed vs tightened System schema (AC-09/DD-13)", () => {
  beforeAll(async () => {
    await applySchema(getDriver()); // tightened doc guaranteed
  });

  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("integration: POST retail-mini.json → zero row errors against the tightened schema", async () => {
    const result = await postSeed();
    expect(result.errors).toBeUndefined();
    expect(result.imported.nodes).toBe(fixture.nodes.length);
    expect(result.imported.edges).toBe(fixture.edges.length);
  });

  test("integration: all 6 Systems read back systemKind functional; counts match graph-core AC-07", async () => {
    const session = getDriver().session({ defaultAccessMode: "READ" });
    try {
      const r = await session.run(
        `MATCH (n:System) WHERE n.id IN $ids RETURN n.attributes_json AS aj`,
        { ids: fixtureSystemIds },
      );
      expect(r.records).toHaveLength(6);
      for (const rec of r.records) {
        const attrs = JSON.parse(rec.get("aj") as string) as { systemKind: string };
        expect(attrs.systemKind).toBe("functional");
      }
    } finally {
      await session.close();
    }

    const { nodesByLabel, edgeCount } = await fixtureCounts();
    // graph-core AC-07's exact per-label node counts.
    expect(nodesByLabel).toEqual({
      Domain: 4,
      UserJourney: 8,
      Activity: 32,
      Role: 6,
      System: 6,
      Location: 4,
    });
    expect(edgeCount).toBe(fixture.edges.length);
  });

  test("integration: second POST is idempotent — adds nothing", async () => {
    const before = await fixtureCounts();
    const result = await postSeed();
    expect(result.errors).toBeUndefined();
    const after = await fixtureCounts();
    expect(after).toEqual(before);
  });
});
