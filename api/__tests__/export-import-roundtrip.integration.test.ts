import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../src/neo4j/driver";

// AC-25 — GET /api/v1/export → POST /api/v1/import against a freshly
// reset DB → GET /api/v1/export yields byte-identical content.
//
// Strategy:
//   1. Wipe the graph (driver-direct MATCH (n) DETACH DELETE n — same
//      escape hatch query-caps.integration.test.ts uses; the REST
//      surface intentionally has no destructive admin endpoint).
//   2. Seed retail-mini through the running server's /import (FR-06
//      path — same path the user-facing seed script uses).
//   3. exportA = await GET /export (capture as raw text — byte-equality
//      is what FR-17 requires).
//   4. Reset the graph again with MATCH (n) DETACH DELETE n through
//      the driver.
//   5. POST exportA back to /import.
//   6. exportB = await GET /export (raw text).
//   7. Assert exportA === exportB (string equality). If string equality
//      fails on whitespace drift only (it shouldn't — the export
//      handler controls JSON.stringify exactly), surface the parsed
//      diff as a fallback for clearer reporting.
//
// We compare raw response text because the export handler is
// deterministic (NODE_LABELS + EDGE_TYPES iteration order, id ASC) and
// JSON.stringify in the handler emits keys in insertion order. A
// passing string-equality test is the strongest possible signal of
// round-trip safety.
//
// Assumes the API server is running on 127.0.0.1:8787 (override via
// API_BASE_URL); the driver-direct setup uses the same singleton the
// server does. closeDriver()+_resetDriver() in afterAll match the
// sibling integration tests so the SDK doesn't hold the bun process
// open at teardown.
const BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";
const SEED_PATH = resolve(
  import.meta.dir,
  "..",
  "..",
  "shared",
  "seed",
  "retail-mini.json",
);

describe("integration: AC-25 export → import → export round-trip", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
    await ensureRegistrySeeded();
    await wipeGraph();
    await seedRetailMini();
  });

  afterAll(async () => {
    // Restore the seed so subsequent test files always find a populated DB,
    // regardless of whether the roundtrip assertion passed or failed.
    // wipeGraph() preserves _Ontology* nodes so the server schema cache
    // remains valid — no cache bust needed.
    await wipeGraph();
    await seedRetailMini();
    await closeDriver();
    _resetDriver();
  });

  test("first export captures the seeded graph", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/export`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { nodes: unknown[]; edges: unknown[] };
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
    expect(body.nodes.length).toBeGreaterThan(0);
    expect(body.edges.length).toBeGreaterThan(0);
  });

  test("export → wipe → import → export is byte-identical", async () => {
    // Step 1: capture exportA.
    const resA = await fetch(`${BASE_URL}/api/v1/export`);
    expect(resA.status).toBe(200);
    const textA = await resA.text();

    // Step 2: parse it (needed to convert the export shape — { nodes,
    // edges } — into the /import envelope, which embeds `label` on
    // each node row but is otherwise the same shape).
    const parsedA = JSON.parse(textA) as {
      nodes: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
    };

    // Step 3: reset the graph.
    await wipeGraph();

    // Sanity check — after the wipe, export should be empty.
    const resEmpty = await fetch(`${BASE_URL}/api/v1/export`);
    const emptyBody = (await resEmpty.json()) as {
      nodes: unknown[]; edges: unknown[];
    };
    expect(emptyBody.nodes).toEqual([]);
    expect(emptyBody.edges).toEqual([]);

    // Step 4: POST exportA's contents back through /import. The export
    // shape already carries `label` on each node row, and edges carry
    // `type` — both match the import envelope (shared/src/types.ts).
    const importRes = await fetch(`${BASE_URL}/api/v1/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nodes: parsedA.nodes,
        edges: parsedA.edges,
      }),
    });
    expect(importRes.status).toBe(200);
    const importBody = (await importRes.json()) as {
      imported: { nodes: number; edges: number };
      errors?: unknown[];
    };
    expect(importBody.imported.nodes).toBe(parsedA.nodes.length);
    expect(importBody.imported.edges).toBe(parsedA.edges.length);
    expect(importBody.errors ?? []).toEqual([]);

    // Step 5: capture exportB.
    const resB = await fetch(`${BASE_URL}/api/v1/export`);
    expect(resB.status).toBe(200);
    const textB = await resB.text();

    // Step 6: assert byte-identical. If this ever fails on whitespace
    // drift (it shouldn't — the export handler controls JSON.stringify
    // output exactly), fall back to deep-equal on the parsed shapes
    // for a clearer diff.
    if (textA !== textB) {
      const parsedB = JSON.parse(textB);
      expect(parsedB).toEqual(parsedA);
      // If parsed shapes match but raw text doesn't, the failure is
      // whitespace drift inside the JSON serializer — still a failure
      // for AC-25's "byte-identical content" wording.
    }
    expect(textB).toBe(textA);
  });
});

// ---- helpers ----

async function wipeGraph(): Promise<void> {
  // Delete only the application-data labels (the six seed labels plus
  // any runtime-registered label). Crucially, this preserves the
  // `_Ontology*` registry rows that the live server's edge-endpoints
  // cache depends on — wiping those would leave subsequent /import
  // POSTs rejecting every edge with `edge_endpoint_label_mismatch`
  // because the registry-driven endpoint matrix would be empty.
  const driver = getDriver();
  const session = driver.session();
  try {
    await session.run(
      `MATCH (n) WHERE NONE(l IN labels(n) WHERE l STARTS WITH '_Ontology')
       DETACH DELETE n`,
    );
  } finally {
    await session.close();
  }
}

// Ensure the registry has its seed rows before the test runs. If a
// prior test wiped them, re-seed via the privileged path so the live
// server's `getEdgeEndpoints` cache can answer correctly for the
// retail-mini edges.
async function ensureRegistrySeeded(): Promise<void> {
  const { applyMetaSchema } = await import("../src/ontology/meta-bootstrap");
  const { isRegistryEmpty, seedRegistryFromConstTuples } = await import(
    "../src/ontology/seed"
  );
  const driver = getDriver();
  await applyMetaSchema(driver);
  if (await isRegistryEmpty(driver)) {
    await seedRegistryFromConstTuples(driver);
    // Warm the server cache via a throwaway label create+delete so the
    // live server's getSchema() reloads from the freshly-seeded registry.
    await fetch(`${BASE_URL}/api/v1/ontology/node-labels`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "RoundtripCacheBust",
        description: "warm",
        usage_example: "warm",
        json_schema_doc: { type: "object" },
      }),
    });
    await fetch(`${BASE_URL}/api/v1/ontology/node-labels/RoundtripCacheBust`, {
      method: "DELETE",
    });
    // Prime the reloaded cache.
    await fetch(`${BASE_URL}/api/v1/schema`);
  }
}

async function seedRetailMini(): Promise<void> {
  // Use the same retail-mini seed fixture the production seed script
  // loads (shared/seed/retail-mini.json) and POST it through /import.
  const body = readFileSync(SEED_PATH, "utf8");
  const res = await fetch(`${BASE_URL}/api/v1/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  if (res.status !== 200) {
    const txt = await res.text();
    throw new Error(`seed import failed: ${res.status} ${txt}`);
  }
  const result = (await res.json()) as {
    imported: { nodes: number; edges: number };
    errors?: unknown[];
  };
  if (result.errors && result.errors.length > 0) {
    throw new Error(`seed import had row errors: ${JSON.stringify(result.errors)}`);
  }
}
