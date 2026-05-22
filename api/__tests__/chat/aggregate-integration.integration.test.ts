import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../../src/neo4j/driver";
import { TOOL_DEF as AGGREGATE_TOOL } from "../../src/chat/tools/aggregate";
import type { ToolContext } from "../../src/chat/tools/types";
import { TOOL_NAMES } from "@companygraph/shared";

// T-14 / FR-T08 / DD-16 — round-trip each of the 6 closed-enum patterns
// against the seeded Neo4j. The basic retail-mini seed gives us node /
// edge counts; the enriched seed (DD-21) layers in `sla_p99_ms`,
// `observed_p99_ms`, `leverage_score`, `team` on the right nodes and
// edges so the attribute-driven patterns return non-zero rows.
//
// NULL-safety is part of FR-T08: even if the enriched seed isn't
// loaded, every pattern must complete without throwing — zero rows is
// the expected behaviour. So we assert "rows shape is correct" and
// "value is a finite number", NOT "rows.length > 0".

const BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";

const SEED_PATH = resolve(
  import.meta.dir,
  "..",
  "..",
  "..",
  "shared",
  "seed",
  "retail-mini.json",
);

const ENRICHED_SEED_PATH = resolve(
  import.meta.dir,
  "..",
  "..",
  "..",
  "shared",
  "seed",
  "retail-mini-enriched.json",
);

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

async function importSeedFile(absPath: string): Promise<void> {
  const body = readFileSync(absPath, "utf8");
  const res = await fetch(`${BASE_URL}/api/v1/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  expect(res.status).toBe(200);
}

async function patchNode(node: EnrichedNode): Promise<void> {
  if (Object.keys(node.attributes).length === 0) return;
  const res = await fetch(
    `${BASE_URL}/api/v1/nodes/${encodeURIComponent(node.label)}/${encodeURIComponent(node.id)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attributes: node.attributes }),
    },
  );
  expect(res.status).toBe(200);
}

async function importEdges(edges: EnrichedEdge[]): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/v1/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nodes: [], edges }),
  });
  expect(res.status).toBe(200);
}

function makeCtx(): ToolContext {
  return {
    driver: getDriver(),
    role: { id: "graph_analyst", allowed_tools: TOOL_NAMES },
    conversationId: "integration-aggregate",
    perTurnCache: new Map(),
    schemaSnapshot: { labels: [], edge_types: [], examples: [] },
    bound_context: { node_ids: [], edge_ids: [] },
  };
}

function assertAggRowShape(row: unknown): void {
  expect(row).toBeDefined();
  expect(typeof row).toBe("object");
  const r = row as Record<string, unknown>;
  expect(typeof r.value).toBe("number");
  expect(Number.isFinite(r.value as number)).toBe(true);
  if ("group_key" in r && r.group_key !== undefined) {
    expect(typeof r.group_key).toBe("string");
  }
}

describe("integration: T-14 aggregate patterns", () => {
  beforeAll(async () => {
    // Load the basic seed (idempotent — MERGE-on-id).
    await importSeedFile(SEED_PATH);

    // Layer the enriched attributes on top so attribute-driven
    // patterns can return non-zero rows.
    try {
      const enriched = JSON.parse(
        readFileSync(ENRICHED_SEED_PATH, "utf8"),
      ) as EnrichedSeed;
      for (const node of enriched.nodes) {
        await patchNode(node);
      }
      await importEdges(enriched.edges);
    } catch {
      // Enriched seed missing or partial — that's fine; the patterns
      // will return zero rows and the shape assertions below still
      // pass (NULL-safety).
    }
  });

  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("node_count_by_label returns single row with finite count", async () => {
    const ctx = makeCtx();
    const data = await AGGREGATE_TOOL.run(
      { pattern: "node_count_by_label", params: { label: "Activity" } },
      ctx,
    );
    expect(data.pattern).toBe("node_count_by_label");
    expect(data.rows.length).toBe(1);
    assertAggRowShape(data.rows[0]);
    // The retail-mini seed has 40+ Activity nodes; assert > 0.
    expect((data.rows[0]!.value as number) > 0).toBe(true);
  });

  test("edge_count_by_type returns single row with finite count", async () => {
    const ctx = makeCtx();
    const data = await AGGREGATE_TOOL.run(
      { pattern: "edge_count_by_type", params: { type: "PRECEDES" } },
      ctx,
    );
    expect(data.pattern).toBe("edge_count_by_type");
    expect(data.rows.length).toBe(1);
    assertAggRowShape(data.rows[0]);
    expect((data.rows[0]!.value as number) > 0).toBe(true);
  });

  test("path_latency_pNN returns either zero rows or one row with finite p95", async () => {
    const ctx = makeCtx();
    const data = await AGGREGATE_TOOL.run(
      {
        pattern: "path_latency_pNN",
        params: { journey_id: "018f0000-0001-7000-8000-000000000301", percentile: 95 },
      },
      ctx,
    );
    expect(data.pattern).toBe("path_latency_pNN");
    expect(Array.isArray(data.rows)).toBe(true);
    // Zero rows when journey has no PRECEDES with observed_p99_ms — fine.
    for (const row of data.rows) assertAggRowShape(row);
  });

  test("breach_count_by_journey returns finite-number rows", async () => {
    const ctx = makeCtx();
    const data = await AGGREGATE_TOOL.run(
      { pattern: "breach_count_by_journey", params: { status: "breach" } },
      ctx,
    );
    expect(data.pattern).toBe("breach_count_by_journey");
    expect(Array.isArray(data.rows)).toBe(true);
    for (const row of data.rows) assertAggRowShape(row);
  });

  test("handoff_count_by_team_pair returns finite-number rows", async () => {
    const ctx = makeCtx();
    const data = await AGGREGATE_TOOL.run(
      { pattern: "handoff_count_by_team_pair", params: {} },
      ctx,
    );
    expect(data.pattern).toBe("handoff_count_by_team_pair");
    expect(Array.isArray(data.rows)).toBe(true);
    for (const row of data.rows) assertAggRowShape(row);
  });

  test("leverage_score_top_k returns at most k rows, each with finite score", async () => {
    const ctx = makeCtx();
    const data = await AGGREGATE_TOOL.run(
      { pattern: "leverage_score_top_k", params: { k: 5 } },
      ctx,
    );
    expect(data.pattern).toBe("leverage_score_top_k");
    expect(Array.isArray(data.rows)).toBe(true);
    expect(data.rows.length).toBeLessThanOrEqual(5);
    for (const row of data.rows) assertAggRowShape(row);
    // If we have ≥ 2 rows, assert descending order.
    for (let i = 1; i < data.rows.length; i += 1) {
      const prev = data.rows[i - 1]!.value as number;
      const cur = data.rows[i]!.value as number;
      expect(prev >= cur).toBe(true);
    }
  });
});
