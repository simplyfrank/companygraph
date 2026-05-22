// T-13 integration test — AC-21 lower half. The `runPassthrough` driver
// AccessMode gate is the structural read-only enforcer. When a chat tool
// dispatches a write statement, the driver rejects, `runPassthrough`
// converts to `ValidationError("write_statement_rejected")`, and the
// dispatch layer converts that to `{ ok: false, error }`. This test
// proves that wiring end-to-end.
//
// FR-G03 (turning this into the user-facing refusal string) is the
// orchestrator's job in T-16 — not in scope here. We just assert the
// `error.code` makes it out of dispatch.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../../src/neo4j/driver";
import { runTool } from "../../src/chat/tools/dispatch";
import type { ToolContext } from "../../src/chat/tools/types";

function makeCtx(): ToolContext {
  return {
    driver: getDriver(),
    role: {
      // `cypher` is gated to `graph_analyst` in the role registry; we mirror
      // that here so the dispatch layer's `allowed_tools.includes('cypher')`
      // check passes and we reach the actual `runPassthrough` call.
      id: "graph_analyst",
      allowed_tools: [
        "list_domains", "get_domain", "get_journey", "get_activity",
        "list_nodes_by_label", "neighbors", "find_path", "aggregate",
        "sla_hotspots", "handoff_matrix", "sod_register", "ai_candidates",
        "initiative_impact", "cypher", "describe_schema",
      ],
    },
    conversationId: "test-conv-write",
    perTurnCache: new Map(),
    schemaSnapshot: { labels: [], edge_types: [], examples: [] },
    bound_context: { node_ids: [], edge_ids: [] },
  };
}

describe("integration: T-13 write-attempt refusal", () => {
  beforeAll(() => {
    // Force the driver singleton to spin up against the running Neo4j.
    getDriver();
  });

  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("cypher tool with CREATE returns { ok: false, error.code: write_statement_rejected }", async () => {
    const result = await runTool(
      "cypher",
      { statement: "CREATE (n:X {id: 'x'}) RETURN n" },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable — narrowed above");
    expect(result.error.code).toBe("write_statement_rejected");
  });

  test("cypher tool with SET returns write_statement_rejected", async () => {
    const result = await runTool(
      "cypher",
      { statement: "MATCH (n:Domain) SET n.foo = 'bar' RETURN n" },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("write_statement_rejected");
  });

  test("cypher tool with MERGE returns write_statement_rejected", async () => {
    const result = await runTool(
      "cypher",
      { statement: "MERGE (n:X {id: 'y'}) RETURN n" },
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("write_statement_rejected");
  });
});
