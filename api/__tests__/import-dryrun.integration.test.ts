import { describe, test, expect, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// AC-27 / FR-20 — POST /api/v1/import?dryRun=true validates the
// payload but writes nothing. /api/v1/stats MUST report the same
// counts before and after a dry-run. A subsequent non-dry-run POST
// MUST then load the data normally (proving the dry-run path didn't
// poison anything).

const API = "http://127.0.0.1:8787";
const SEED_PATH = join(import.meta.dir, "..", "..", "shared", "seed", "retail-mini.json");

interface Stats {
  nodes: Record<string, number>;
  edges: Record<string, number>;
}

interface ImportResponse {
  imported: { nodes: number; edges: number };
  errors?: unknown[];
}

async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${API}/api/v1/stats`);
  expect(res.status).toBe(200);
  return (await res.json()) as Stats;
}

async function clearGraph(): Promise<void> {
  const url = process.env.NEO4J_TEST_RESET_URL;
  if (url) {
    await fetch(url, { method: "POST" });
  }
}

function sumCounts(s: Stats): { nodes: number; edges: number } {
  return {
    nodes: Object.values(s.nodes).reduce((a, b) => a + b, 0),
    edges: Object.values(s.edges).reduce((a, b) => a + b, 0),
  };
}

describe("AC-27 — /api/v1/import?dryRun=true writes nothing", () => {
  let seedBody: string;
  let beforeStats: Stats;
  let dryRunBody: ImportResponse;
  let afterDryRunStats: Stats;
  let realImportBody: ImportResponse;
  let afterRealStats: Stats;

  beforeAll(async () => {
    seedBody = readFileSync(SEED_PATH, "utf8");
    await clearGraph();

    beforeStats = await fetchStats();

    const dryRes = await fetch(`${API}/api/v1/import?dryRun=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: seedBody,
    });
    expect(dryRes.status).toBe(200);
    dryRunBody = (await dryRes.json()) as ImportResponse;

    afterDryRunStats = await fetchStats();

    // Now run the real import to confirm dry-run didn't poison state.
    const realRes = await fetch(`${API}/api/v1/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: seedBody,
    });
    expect(realRes.status).toBe(200);
    realImportBody = (await realRes.json()) as ImportResponse;

    afterRealStats = await fetchStats();
  });

  test("dry-run response shape matches the non-dry-run shape", () => {
    // Same envelope: { imported: { nodes, edges }, errors? }
    expect(dryRunBody).toHaveProperty("imported");
    expect(dryRunBody.imported).toHaveProperty("nodes");
    expect(dryRunBody.imported).toHaveProperty("edges");
    expect(typeof dryRunBody.imported.nodes).toBe("number");
    expect(typeof dryRunBody.imported.edges).toBe("number");
    // The fixture is clean → no row errors reported.
    expect(dryRunBody.errors).toBeUndefined();
    // Validation counters non-zero (every row passed schema).
    expect(dryRunBody.imported.nodes).toBeGreaterThan(0);
    expect(dryRunBody.imported.edges).toBeGreaterThan(0);
  });

  test("/api/v1/stats unchanged after a dry-run POST (zero nodes/edges added)", () => {
    expect(afterDryRunStats.nodes).toEqual(beforeStats.nodes);
    expect(afterDryRunStats.edges).toEqual(beforeStats.edges);
    expect(sumCounts(afterDryRunStats)).toEqual(sumCounts(beforeStats));
  });

  test("a follow-up non-dry-run POST loads the data normally", () => {
    expect(realImportBody.errors).toBeUndefined();
    expect(realImportBody.imported.nodes).toBeGreaterThan(0);
    expect(realImportBody.imported.edges).toBeGreaterThan(0);

    // Stats now reflect the fixture.
    expect(afterRealStats.nodes).toEqual({
      Domain: 4,
      UserJourney: 8,
      Activity: 32,
      Role: 6,
      System: 6,
      Location: 4,
    });
    const totals = sumCounts(afterRealStats);
    expect(totals.nodes).toBeGreaterThan(sumCounts(beforeStats).nodes);
    expect(totals.edges).toBeGreaterThan(sumCounts(beforeStats).edges);
  });
});
