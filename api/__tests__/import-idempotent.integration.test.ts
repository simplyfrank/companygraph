import { describe, test, expect, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// AC-08 / NFR-04 — /api/v1/import is idempotent on `id`. Posting the
// same fixture twice MUST leave the node + edge counts unchanged on
// the second pass. The storage layer uses MERGE-on-id so a re-run is
// a no-op on cardinality (it does touch `updatedAt` / attributes_json
// but that's outside the scope of this test).

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

async function postSeed(body: string): Promise<{
  imported: { nodes: number; edges: number };
  errors?: unknown[];
}> {
  const res = await fetch(`${API}/api/v1/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  expect(res.status).toBe(200);
  return (await res.json()) as {
    imported: { nodes: number; edges: number };
    errors?: unknown[];
  };
}

async function clearGraph(): Promise<void> {
  const url = process.env.NEO4J_TEST_RESET_URL;
  if (url) {
    await fetch(url, { method: "POST" });
  }
}

describe("AC-08 — /api/v1/import is idempotent on id", () => {
  let seedBody: string;
  let firstStats: Stats;
  let secondStats: Stats;
  let secondImport: { imported: { nodes: number; edges: number }; errors?: unknown[] };

  beforeAll(async () => {
    seedBody = readFileSync(SEED_PATH, "utf8");
    await clearGraph();

    // First import — populates the graph.
    const first = await postSeed(seedBody);
    expect(first.errors).toBeUndefined();
    firstStats = await fetchStats();

    // Second import — must not change cardinality.
    secondImport = await postSeed(seedBody);
    secondStats = await fetchStats();
  });

  test("second import returns no row-level errors", () => {
    expect(secondImport.errors).toBeUndefined();
  });

  test("second import reports the same per-row counters (every row upserted)", () => {
    // upsertNode + upsertEdge succeed on the second pass too — the
    // counters are "rows that didn't fail", not "rows that newly
    // inserted".
    expect(secondImport.imported.nodes).toBeGreaterThan(0);
    expect(secondImport.imported.edges).toBeGreaterThan(0);
  });

  test("node counts unchanged after the second import", () => {
    expect(secondStats.nodes).toEqual(firstStats.nodes);
  });

  test("edge counts unchanged after the second import", () => {
    expect(secondStats.edges).toEqual(firstStats.edges);
  });
});
