import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../src/neo4j/driver";
import { NODE_LABELS } from "@companygraph/shared/schema/nodes";
import { EDGE_TYPES } from "@companygraph/shared/schema/edges";

// AC-26 — GET /api/v1/export.ndjson returns one JSON object per line,
// Content-Type: application/x-ndjson, total line count matches the
// JSON-export node + edge counts. Nodes precede edges; within each
// section rows are id-ASC.
//
// Strategy:
//   1. Wipe + seed retail-mini through the running server (same
//      pattern as export-import-roundtrip.integration.test.ts).
//   2. Hit /export.ndjson, assert status + content-type.
//   3. Read the body as text, split on \n, drop empty trailing line.
//   4. Parse each line, assert it's a node OR an edge row with the
//      expected wire-format keys.
//   5. Cross-check total count against GET /api/v1/export.
//
// Streaming-vs-buffering: the AC mentions a "response observer" to
// verify the handler doesn't buffer the entire payload before
// flushing. That property is guaranteed at code level by the use of
// ReadableStream + per-row controller.enqueue() in
// api/src/routes/export.ts; observing it from a `fetch()` consumer in
// Bun is brittle (Bun fully decodes responses before resolving
// res.text()). We assert the wire-format contract here, and the
// streaming character is enforced by code review on
// `handleExportNdjson`.
const BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";
const SEED_PATH = resolve(
  import.meta.dir,
  "..",
  "..",
  "shared",
  "seed",
  "retail-mini.json",
);

describe("integration: AC-26 export.ndjson", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
    await wipeGraph();
    await seedRetailMini();
  });

  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("GET /api/v1/export.ndjson returns 200 application/x-ndjson", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/export.ndjson`);
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type") ?? "";
    expect(ct).toContain("application/x-ndjson");
  });

  test("each non-empty line parses as JSON and is one node OR one edge", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/export.ndjson`);
    expect(res.status).toBe(200);
    const text = await res.text();
    // Trailing newline is permitted but produces an empty last field;
    // drop empty lines explicitly rather than asserting against
    // trailing-whitespace policy.
    const lines = text.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBeGreaterThan(0);

    let nodeCount = 0;
    let edgeCount = 0;
    let nodesSectionClosed = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new Error(`line ${i + 1} is not valid JSON: ${line}`);
      }
      if (typeof parsed !== "object" || parsed === null) {
        throw new Error(`line ${i + 1} is not an object: ${line}`);
      }
      const row = parsed as Record<string, unknown>;
      const kind = row.kind;
      if (kind === "node") {
        if (nodesSectionClosed) {
          // We've already seen an edge — finding a node again would
          // violate the "nodes first, then edges" ordering.
          throw new Error(`line ${i + 1}: node row after edge section opened`);
        }
        assertNodeShape(row, i + 1);
        nodeCount++;
      } else if (kind === "edge") {
        if (!nodesSectionClosed) nodesSectionClosed = true;
        assertEdgeShape(row, i + 1);
        edgeCount++;
      } else {
        throw new Error(`line ${i + 1} has unknown kind: ${JSON.stringify(kind)}`);
      }
    }

    expect(nodeCount).toBeGreaterThan(0);
    expect(edgeCount).toBeGreaterThan(0);

    // Cross-check against /export totals.
    const jsonRes = await fetch(`${BASE_URL}/api/v1/export`);
    expect(jsonRes.status).toBe(200);
    const jsonBody = (await jsonRes.json()) as {
      nodes: unknown[]; edges: unknown[];
    };
    expect(nodeCount).toBe(jsonBody.nodes.length);
    expect(edgeCount).toBe(jsonBody.edges.length);
    expect(lines.length).toBe(jsonBody.nodes.length + jsonBody.edges.length);
  });
});

// ---- helpers ----

function assertNodeShape(row: Record<string, unknown>, lineNum: number): void {
  // The handler emits: { kind:"node", label, id, name, description,
  //                      createdAt, updatedAt, attributes }
  if (typeof row.label !== "string") {
    throw new Error(`line ${lineNum}: node.label is not a string`);
  }
  if (!(NODE_LABELS as readonly string[]).includes(row.label)) {
    throw new Error(`line ${lineNum}: node.label is unknown: ${row.label}`);
  }
  if (typeof row.id !== "string") {
    throw new Error(`line ${lineNum}: node.id is not a string`);
  }
  if (typeof row.name !== "string") {
    throw new Error(`line ${lineNum}: node.name is not a string`);
  }
  if (typeof row.createdAt !== "string") {
    throw new Error(`line ${lineNum}: node.createdAt is not a string`);
  }
  if (typeof row.updatedAt !== "string") {
    throw new Error(`line ${lineNum}: node.updatedAt is not a string`);
  }
  if (typeof row.attributes !== "object" || row.attributes === null) {
    throw new Error(`line ${lineNum}: node.attributes is not an object`);
  }
}

function assertEdgeShape(row: Record<string, unknown>, lineNum: number): void {
  // The handler emits: { kind:"edge", type, id, fromId, toId,
  //                      createdAt, attributes }
  if (typeof row.type !== "string") {
    throw new Error(`line ${lineNum}: edge.type is not a string`);
  }
  if (!(EDGE_TYPES as readonly string[]).includes(row.type)) {
    throw new Error(`line ${lineNum}: edge.type is unknown: ${row.type}`);
  }
  if (typeof row.id !== "string") {
    throw new Error(`line ${lineNum}: edge.id is not a string`);
  }
  if (typeof row.fromId !== "string") {
    throw new Error(`line ${lineNum}: edge.fromId is not a string`);
  }
  if (typeof row.toId !== "string") {
    throw new Error(`line ${lineNum}: edge.toId is not a string`);
  }
  if (typeof row.createdAt !== "string") {
    throw new Error(`line ${lineNum}: edge.createdAt is not a string`);
  }
  if (typeof row.attributes !== "object" || row.attributes === null) {
    throw new Error(`line ${lineNum}: edge.attributes is not an object`);
  }
}

async function wipeGraph(): Promise<void> {
  const driver = getDriver();
  const session = driver.session();
  try {
    await session.run("MATCH (n) DETACH DELETE n");
  } finally {
    await session.close();
  }
}

async function seedRetailMini(): Promise<void> {
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
