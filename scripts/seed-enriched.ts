// scripts/seed-enriched.ts — Loads the enriched seed (DD-21 / T-22) on
// top of an already-seeded graph. PATCHes attributes onto each node;
// re-imports edges via POST /api/v1/import (MERGE-on-id semantics in
// upsertEdge, which overwrites attributes_json on MATCH — idempotent).
//
// Usage:
//   bun run scripts/seed-enriched.ts ./shared/seed/retail-mini-enriched.json
//
// Pre-req: `bun run seed` must have run first — the basic seed creates
// the nodes/edges this script enriches.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface EnrichedNode {
  label: string;
  id: string;
  attributes: Record<string, unknown>;
}

interface EnrichedEdge {
  type: string;
  id: string;
  fromId: string;
  toId: string;
  attributes: Record<string, unknown>;
}

interface EnrichedSeed {
  nodes: EnrichedNode[];
  edges: EnrichedEdge[];
}

interface RowError {
  section: "nodes" | "edges";
  index: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

const HOST = process.env.HOST ?? "127.0.0.1";
const API_PORT = Number(process.env.API_PORT ?? 8787);
const BASE = `http://${HOST}:${API_PORT}/api/v1`;

async function patchNode(node: EnrichedNode): Promise<void> {
  // Skip nodes with no extra attributes — saves a network round-trip.
  if (Object.keys(node.attributes).length === 0) return;
  const url = `${BASE}/nodes/${encodeURIComponent(node.label)}/${encodeURIComponent(node.id)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ attributes: node.attributes }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `PATCH ${url} → HTTP ${res.status}: ${text}`,
    );
  }
}

async function importEdges(edges: EnrichedEdge[]): Promise<void> {
  // POST /api/v1/import with nodes:[] and the enriched edges; the
  // server's upsertEdge MERGEs on id and rewrites attributes_json,
  // which is exactly what we want for idempotent enrichment.
  const url = `${BASE}/import`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nodes: [], edges }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${url} → HTTP ${res.status}: ${text}`);
  }
  const out = (await res.json()) as {
    imported: { nodes: number; edges: number };
    errors?: RowError[];
  };
  if (out.errors && out.errors.length > 0) {
    throw new Error(
      `POST ${url} returned row-level errors:\n${JSON.stringify(out.errors, null, 2)}`,
    );
  }
  console.log(
    `[seed-enriched] edges imported: ${out.imported.edges} (nodes: ${out.imported.nodes})`,
  );
}

async function main(): Promise<void> {
  const seedArg = process.argv[2];
  if (!seedArg) {
    console.error(
      "usage: bun run scripts/seed-enriched.ts <retail-mini-enriched.json>",
    );
    process.exit(2);
  }
  const absPath = resolve(process.cwd(), seedArg);
  const raw = readFileSync(absPath, "utf8");
  const seed = JSON.parse(raw) as EnrichedSeed;

  console.log(
    `[seed-enriched] loaded ${seed.nodes.length} nodes / ${seed.edges.length} edges from ${absPath}`,
  );

  // 1. PATCH every node's attributes (idempotent — patchNode is a
  //    partial SET so re-running just re-applies the same map).
  let patched = 0;
  for (let i = 0; i < seed.nodes.length; i++) {
    const node = seed.nodes[i]!;
    try {
      await patchNode(node);
      if (Object.keys(node.attributes).length > 0) patched += 1;
    } catch (e) {
      console.error(
        `[seed-enriched] node ${i} (${node.label} ${node.id}) failed: ${(e as Error).message}`,
      );
      process.exit(1);
    }
  }
  console.log(`[seed-enriched] nodes patched: ${patched}`);

  // 2. Re-import edges so attributes_json gets MERGE-on-id rewritten.
  await importEdges(seed.edges);

  console.log("[seed-enriched] done");
}

main().catch((e: unknown) => {
  console.error("[seed-enriched] fatal:", (e as Error).message ?? e);
  process.exit(1);
});
