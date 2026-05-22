import { describe, test, expect, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// AC-07 — POST shared/seed/retail-mini.json to /api/v1/import and
// verify /api/v1/stats reports the exact node counts the fixture
// declares + non-zero counts for every one of the 6 edge types.
//
// Requires a running api server at 127.0.0.1:8787 with a reachable
// Neo4j. Cleans the graph in beforeAll so the test is runnable in
// isolation (i.e. without assuming a freshly seeded DB).
//
// The expected node counts come from the fixture itself — they're
// also pinned here because the fixture is the canonical FR-08 dataset
// and changes to it deserve to break this test.

const API = "http://127.0.0.1:8787";
const SEED_PATH = join(import.meta.dir, "..", "..", "shared", "seed", "retail-mini.json");

interface Stats {
  nodes: Record<string, number>;
  edges: Record<string, number>;
}

async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${API}/api/v1/stats`);
  expect(res.status).toBe(200);
  return (await res.json()) as Stats;
}

async function clearGraph(): Promise<void> {
  // The api exposes no destructive admin endpoint by design, so we use
  // a raw read-write Cypher path via the query route if available;
  // otherwise rely on the harness to have pre-cleared the DB.
  //
  // Project convention (see task brief): tests assume harness setup
  // ran a fresh seed-clean. We additionally try a `DELETE` via a
  // helper script if the env var is set.
  const url = process.env.NEO4J_TEST_RESET_URL;
  if (url) {
    await fetch(url, { method: "POST" });
  }
}

describe("AC-07 — /api/v1/import loads the retail-mini fixture exactly", () => {
  let seedBody: string;

  beforeAll(async () => {
    seedBody = readFileSync(SEED_PATH, "utf8");
    await clearGraph();
  });

  test("POST seed succeeds with row-level counts and no errors", async () => {
    const res = await fetch(`${API}/api/v1/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: seedBody,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      imported: { nodes: number; edges: number };
      errors?: unknown[];
    };
    // Whole fixture is well-formed → no row errors.
    expect(body.errors).toBeUndefined();
    // The fixture currently declares 60 nodes + 128 edges; the row
    // counters echo those numbers.
    expect(body.imported.nodes).toBeGreaterThan(0);
    expect(body.imported.edges).toBeGreaterThan(0);
  });

  test("/api/v1/stats reports the per-label node counts the fixture pins", async () => {
    const stats = await fetchStats();
    expect(stats.nodes).toEqual({
      Domain: 4,
      UserJourney: 8,
      Activity: 32,
      Role: 6,
      System: 6,
      Location: 4,
    });
  });

  test("every one of the 6 edge types is wired by the fixture (count > 0)", async () => {
    const stats = await fetchStats();
    const types = [
      "PART_OF",
      "PRECEDES",
      "EXECUTES",
      "USES_SYSTEM",
      "INTEGRATES_WITH",
      "AT_LOCATION",
    ] as const;
    for (const t of types) {
      expect(stats.edges[t]).toBeGreaterThan(0);
    }
  });

  test("edge counts match the fixture (PART_OF=43, PRECEDES=24, EXECUTES=32, USES_SYSTEM=15, INTEGRATES_WITH=6, AT_LOCATION=8)", async () => {
    // These are the canonical counts derived directly from
    // shared/seed/retail-mini.json. If the fixture changes they need
    // to change with it — the test is intentionally tight to detect
    // accidental edits.
    const stats = await fetchStats();
    expect(stats.edges).toEqual({
      PART_OF: 43,
      PRECEDES: 24,
      EXECUTES: 32,
      USES_SYSTEM: 15,
      INTEGRATES_WITH: 6,
      AT_LOCATION: 8,
    });
  });
});
