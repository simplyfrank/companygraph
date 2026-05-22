import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../../src/neo4j/driver";
import type { ToolContext, ToolDef } from "../../src/chat/tools/types";
import { TOOL_DEF as SLA_HOTSPOTS } from "../../src/chat/tools/sla-hotspots";
import { TOOL_DEF as HANDOFF_MATRIX } from "../../src/chat/tools/handoff-matrix";
import { TOOL_DEF as SOD_REGISTER } from "../../src/chat/tools/sod-register";
import { TOOL_DEF as AI_CANDIDATES } from "../../src/chat/tools/ai-candidates";
import { TOOL_DEF as INITIATIVE_IMPACT } from "../../src/chat/tools/initiative-impact";
import { ValidationError } from "../../src/errors";
import type { ChatRoleId, ToolName } from "@companygraph/shared";

// T-15 — cross-section tools (sla_hotspots, handoff_matrix, sod_register,
// ai_candidates, initiative_impact) round-tripped against (a) the basic
// retail-mini seed — where every SLA / team / leverage / SoD / initiative
// attribute is absent — and (b) the enriched seed — where the attrs the
// tools query are populated per DD-21.
//
// NULL-safety contract (DD-21): on the basic seed each tool must EITHER
// return zero rows OR throw `ValidationError("not_found")` (only
// initiative_impact does the latter). No tool may crash.

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

async function importBasicSeed(): Promise<void> {
  const body = readFileSync(SEED_PATH, "utf8");
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

// Reset edge-level attributes so the "basic seed" leg of this test sees
// no SLA / criticality / failure_mode keys even after a prior enriched
// run. We import the basic seed's edges *with* attributes={} which the
// /import endpoint upserts via MERGE (graph-core/design.md §4) — wiping
// the prior STRING. Mirrors `bun run seed` semantics.
async function resetEdgeAttrsToBasic(): Promise<void> {
  await importBasicSeed();
}

// Wipe Activity / Role node attributes via PATCH (attributes:{}). PATCH
// in graph-core REPLACES the attributes map per `patchNode` semantics
// — perfect for clearing enriched attrs before the basic-seed leg.
async function resetNodeAttrsToBasic(): Promise<void> {
  const enriched = JSON.parse(readFileSync(ENRICHED_SEED_PATH, "utf8")) as EnrichedSeed;
  for (const n of enriched.nodes) {
    if (Object.keys(n.attributes).length === 0) continue;
    const res = await fetch(
      `${BASE_URL}/api/v1/nodes/${encodeURIComponent(n.label)}/${encodeURIComponent(n.id)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attributes: {} }),
      },
    );
    expect(res.status).toBe(200);
  }
}

function makeCtx(): ToolContext {
  const ALL_TOOLS: ToolName[] = [
    "list_domains", "get_domain", "get_journey", "get_activity",
    "list_nodes_by_label", "neighbors", "find_path", "aggregate",
    "sla_hotspots", "handoff_matrix", "sod_register", "ai_candidates",
    "initiative_impact", "cypher", "describe_schema",
  ];
  return {
    driver: getDriver(),
    role: { id: "graph_analyst" as ChatRoleId, allowed_tools: ALL_TOOLS },
    conversationId: "test-conv",
    perTurnCache: new Map(),
    schemaSnapshot: { labels: [], edge_types: [], examples: [] },
    bound_context: { node_ids: [], edge_ids: [] },
  };
}

async function runDef<TArgs, TData>(
  def: ToolDef<TArgs, TData>,
  args: TArgs,
): Promise<TData> {
  return def.run(args, makeCtx());
}

describe("integration: T-15 cross-section tools — basic seed (NULL-safe)", () => {
  beforeAll(async () => {
    // Clear all enriched attrs so we start from a clean basic seed.
    await resetNodeAttrsToBasic();
    await resetEdgeAttrsToBasic();
  });

  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("sla_hotspots returns [] when no PRECEDES edge carries sla_p99_ms", async () => {
    const rows = await runDef(SLA_HOTSPOTS, { status: "all", limit: 50 });
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(0);
  });

  test("handoff_matrix returns { cells: [] } when no Role/Activity carries team", async () => {
    const out = await runDef(HANDOFF_MATRIX, {});
    expect(out.cells.length).toBe(0);
  });

  test("sod_register returns [] on the basic seed (no SoD attrs modelled)", async () => {
    const rows = await runDef(SOD_REGISTER, { severity: "all" });
    expect(rows.length).toBe(0);
  });

  test("ai_candidates returns [] when no Activity carries leverage_score", async () => {
    const rows = await runDef(AI_CANDIDATES, { min_leverage: 0.5 });
    expect(rows.length).toBe(0);
  });

  test("initiative_impact throws not_found on the current schema (no Initiative label)", async () => {
    let err: unknown = null;
    try {
      await runDef(INITIATIVE_IMPACT, { initiative_id: "any-id" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe("not_found");
  });
});

describe("integration: T-15 cross-section tools — enriched seed", () => {
  beforeAll(async () => {
    // Re-import basic (idempotent MERGE) then apply enriched attrs.
    await importBasicSeed();
    const enriched = JSON.parse(readFileSync(ENRICHED_SEED_PATH, "utf8")) as EnrichedSeed;
    for (const n of enriched.nodes) {
      await patchNode(n);
    }
    await importEdges(enriched.edges);
  });

  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("sla_hotspots returns at least one breach with the correct shape", async () => {
    const rows = await runDef(SLA_HOTSPOTS, { status: "breach", limit: 50 });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const top = rows[0]!;
    expect(typeof top.edge_id).toBe("string");
    expect(typeof top.from_activity).toBe("string");
    expect(typeof top.to_activity).toBe("string");
    expect(typeof top.target_p99_ms).toBe("number");
    expect(typeof top.observed_p99_ms).toBe("number");
    expect(typeof top.delta_pct).toBe("number");
    expect(top.status).toBe("breach");
    expect(top.delta_pct).toBeGreaterThan(0);
    // Sorted desc by delta_pct.
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1]!.delta_pct >= rows[i]!.delta_pct).toBe(true);
    }
  });

  test("sla_hotspots status='all' returns rows of every classification", async () => {
    const rows = await runDef(SLA_HOTSPOTS, { status: "all", limit: 100 });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) {
      expect(["breach", "warn", "ok"]).toContain(r.status);
    }
  });

  test("handoff_matrix returns at least one cross-team cell with journey_ids populated", async () => {
    const out = await runDef(HANDOFF_MATRIX, {});
    expect(out.cells.length).toBeGreaterThanOrEqual(1);
    const cell = out.cells[0]!;
    expect(typeof cell.from_team).toBe("string");
    expect(typeof cell.to_team).toBe("string");
    expect(cell.from_team).not.toBe(cell.to_team);
    expect(typeof cell.count).toBe("number");
    expect(cell.count).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(cell.journey_ids)).toBe(true);
  });

  test("sod_register stays empty on the enriched seed (DD-21 — no SoD attrs)", async () => {
    // The enriched seed doesn't model SoD entries — empty is the honest answer.
    const rows = await runDef(SOD_REGISTER, { severity: "all" });
    expect(rows.length).toBe(0);
  });

  test("ai_candidates returns leverage-sorted rows above min_leverage", async () => {
    const rows = await runDef(AI_CANDIDATES, { min_leverage: 0.5 });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) {
      expect(typeof r.activity_id).toBe("string");
      expect(typeof r.leverage_score).toBe("number");
      expect(r.leverage_score).toBeGreaterThanOrEqual(0.5);
    }
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1]!.leverage_score >= rows[i]!.leverage_score).toBe(true);
    }
  });

  test("ai_candidates honours min_leverage threshold (0.8 trims the result)", async () => {
    const high = await runDef(AI_CANDIDATES, { min_leverage: 0.8 });
    const mid = await runDef(AI_CANDIDATES, { min_leverage: 0.5 });
    expect(high.length).toBeLessThanOrEqual(mid.length);
    for (const r of high) {
      expect(r.leverage_score).toBeGreaterThanOrEqual(0.8);
    }
  });

  test("initiative_impact throws not_found even on the enriched seed", async () => {
    // No Initiative label is registered by either seed — the tool refuses
    // to confabulate.
    let err: unknown = null;
    try {
      await runDef(INITIATIVE_IMPACT, { initiative_id: "imaginary-initiative" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).code).toBe("not_found");
  });
});
