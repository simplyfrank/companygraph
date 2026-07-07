// function-benchmark-scoring T-08 (AC-07) — read-only invariant: a full
// report run creates/updates/deletes NO graph node/edge/attribute; in
// particular no keyActivity mark is written. Verified via a pre/post
// node+relationship count diff and an activity-attributes snapshot.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { computeBenchmarkReport } from "../src/storage/function-benchmark";
import {
  seedBenchmarkGraph,
  cleanupBenchmarkGraph,
  type SeedFunction,
} from "./helpers/function-benchmark-fixtures";

const FUNCTIONS: SeedFunction[] = [
  {
    seedKey: "marketing",
    name: "Marketing",
    activities: [{ key: "m1", roles: 1, systemKinds: ["agentic"], alignedKpiKeys: ["k"] }],
    kpis: [{ key: "k", measures: true, latestValue: 10, target_value: 5, target_direction: "higher_is_better" }],
  },
  {
    seedKey: "platform_ops",
    name: "Platform Ops",
    activities: [{ key: "p1", roles: 1, systemKinds: ["functional"] }],
    kpis: [],
  },
];

// Count only THIS fixture's own subgraph (fbs-* ids) so a concurrent test
// seeding/cleaning its own nodes cannot perturb the diff (AC-07 is about
// what a report RUN writes, not the global graph size).
async function counts(): Promise<{ nodes: number; rels: number; attrs: string[] }> {
  const session = getDriver().session({ defaultAccessMode: "READ" });
  try {
    const nres = await session.run(`MATCH (n) WHERE n.id STARTS WITH 'fbs-' RETURN count(n) AS n`);
    const rres = await session.run(
      `MATCH (a)-[r]->(b) WHERE a.id STARTS WITH 'fbs-' AND b.id STARTS WITH 'fbs-'
       RETURN count(r) AS r`,
    );
    // Snapshot every seeded activity's attributes_json (keyActivity guard).
    const ares = await session.run(
      `MATCH (a:Activity) WHERE a.id STARTS WITH 'fbs-'
       RETURN a.id AS id, a.attributes_json AS attrs ORDER BY a.id`,
    );
    const num = (v: unknown) => Number((v as { low?: number })?.low ?? v);
    return {
      nodes: num(nres.records[0]!.get("n")),
      rels: num(rres.records[0]!.get("r")),
      attrs: ares.records.map((r) => `${r.get("id")}=${r.get("attrs")}`),
    };
  } finally {
    await session.close();
  }
}

describe("integration: function-benchmark read-only invariant (AC-07)", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
    await seedBenchmarkGraph(getDriver(), FUNCTIONS);
  });
  afterAll(async () => {
    await cleanupBenchmarkGraph(getDriver());
    await closeDriver();
    _resetDriver();
  });

  test("a full report run writes nothing (zero node/rel/attribute diff)", async () => {
    const before = await counts();
    await computeBenchmarkReport(getDriver());
    await computeBenchmarkReport(getDriver()); // twice, to be sure
    const after = await counts();
    expect(after.nodes).toBe(before.nodes);
    expect(after.rels).toBe(before.rels);
    // no keyActivity mark written — activity attributes byte-identical.
    expect(after.attrs).toEqual(before.attrs);
    for (const a of after.attrs) {
      expect(a.includes("keyActivity")).toBe(false);
    }
  });
});
