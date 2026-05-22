import { describe, expect, test } from "bun:test";
import { TOOL_DEF as DESCRIBE_SCHEMA } from "../../src/chat/tools/describe-schema";
import type { ToolContext, SchemaSnapshot } from "../../src/chat/tools/types";

// integration: T-12 describe_schema — no Neo4j round-trip.
// The orchestrator pre-loads `ctx.schemaSnapshot`; the tool just returns it.
// This test stubs the snapshot and asserts verbatim passthrough.

function makeCtx(snapshot: SchemaSnapshot): ToolContext {
  return {
    // The tool never touches the driver — cast a stub to satisfy the type.
    driver: {} as unknown as ToolContext["driver"],
    role: { id: "graph_analyst", allowed_tools: [] },
    conversationId: "test-conv",
    perTurnCache: new Map(),
    schemaSnapshot: snapshot,
    bound_context: { node_ids: [], edge_ids: [] },
  };
}

describe("integration: T-12 describe_schema tool", () => {
  test("returns ctx.schemaSnapshot verbatim", async () => {
    const snapshot: SchemaSnapshot = {
      labels: [
        { id: "Domain", name: "Domain", attributes: [{ key: "code", type: "string" }] },
        { id: "Activity", name: "Activity", attributes: [] },
      ],
      edge_types: [
        { id: "PART_OF", name: "PART_OF" },
        { id: "PRECEDES", name: "PRECEDES" },
      ],
      examples: [
        { question: "What domains exist?", tool: "list_domains", args: {} },
      ],
    };
    const got = await DESCRIBE_SCHEMA.run({}, makeCtx(snapshot));
    // Identity (same reference) — the tool is a strict passthrough.
    expect(got).toBe(snapshot);
    // And structurally — guards against any future refactor that re-shapes.
    expect(got).toEqual(snapshot);
  });

  test("returns an empty-shape snapshot when one is supplied", async () => {
    const snapshot: SchemaSnapshot = { labels: [], edge_types: [], examples: [] };
    const got = await DESCRIBE_SCHEMA.run({}, makeCtx(snapshot));
    expect(got).toEqual(snapshot);
  });

  test("rejects extra args via the strict schema", () => {
    const result = DESCRIBE_SCHEMA.schema.safeParse({ unexpected: 1 });
    expect(result.success).toBe(false);
  });
});
