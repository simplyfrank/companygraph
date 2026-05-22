// T-13 integration tests — exercise the `get_journey` + `get_activity`
// chat tools against the retail-mini seed loaded into Neo4j. Each test
// builds a minimal `ToolContext` and runs the tool directly (no LLM, no
// dispatch wrapper) so the assertions sit on the tool's own contract.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../../src/neo4j/driver";
import { ValidationError } from "../../src/errors";
import { TOOL_DEF as GET_JOURNEY } from "../../src/chat/tools/get-journey";
import { TOOL_DEF as GET_ACTIVITY } from "../../src/chat/tools/get-activity";
import type { ToolContext } from "../../src/chat/tools/types";

const BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";

// Retail-mini ids — fixed by the seed file; verified by the grep above.
const JOURNEY_ID = "018f0000-0001-7000-8000-000000000101"; // Plan Seasonal Assortment
const ACTIVITY_ID = "018f0000-0002-7000-8000-000010101002"; // Select SKUs

function makeCtx(): ToolContext {
  return {
    driver: getDriver(),
    role: {
      id: "graph_analyst",
      allowed_tools: [
        "list_domains", "get_domain", "get_journey", "get_activity",
        "list_nodes_by_label", "neighbors", "find_path", "aggregate",
        "sla_hotspots", "handoff_matrix", "sod_register", "ai_candidates",
        "initiative_impact", "cypher", "describe_schema",
      ],
    },
    conversationId: "test-conv",
    perTurnCache: new Map(),
    schemaSnapshot: { labels: [], edge_types: [], examples: [] },
    bound_context: { node_ids: [], edge_ids: [] },
  };
}

describe("integration: T-13 journey/activity tools", () => {
  beforeAll(async () => {
    // Make sure the seed is loaded so we have stable ids to query.
    const seedPath = resolve(
      import.meta.dir, "..", "..", "..", "shared", "seed", "retail-mini.json",
    );
    const body = readFileSync(seedPath, "utf8");
    const res = await fetch(`${BASE_URL}/api/v1/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(res.status).toBe(200);
  });

  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  describe("get_journey", () => {
    test("happy path: returns journey + activities + PRECEDES + role bindings", async () => {
      const data = await GET_JOURNEY.run({ id: JOURNEY_ID }, makeCtx());
      expect(data.id).toBe(JOURNEY_ID);
      expect(data.name).toBe("Plan Seasonal Assortment");
      // 4 activities for this journey (seed lines 86-89).
      expect(data.activities.length).toBe(4);
      const actIds = data.activities.map(a => a.id).sort();
      expect(actIds).toContain("018f0000-0002-7000-8000-000010101001");
      expect(actIds).toContain("018f0000-0002-7000-8000-000010101004");
      // 3 PRECEDES edges fully internal to journey 101 (seed lines 181-183).
      expect(data.edges.length).toBe(3);
      for (const e of data.edges) {
        expect(typeof e.id).toBe("string");
        expect(typeof e.fromId).toBe("string");
        expect(typeof e.toId).toBe("string");
      }
      // Role bindings — at least one EXECUTES per activity in the seed.
      expect(data.role_bindings.length).toBeGreaterThan(0);
      // Each binding must carry both ids (the null-rb filter wins).
      for (const rb of data.role_bindings) {
        expect(typeof rb.activity_id).toBe("string");
        expect(typeof rb.role_id).toBe("string");
        expect(rb.role_id.length).toBeGreaterThan(0);
      }
    });

    test("unknown id → throws ValidationError(not_found)", async () => {
      let caught: unknown;
      try {
        await GET_JOURNEY.run(
          { id: "018f0000-0001-7000-8000-deadbeefdead" },
          makeCtx(),
        );
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ValidationError);
      expect((caught as ValidationError).code).toBe("not_found");
    });
  });

  describe("get_activity", () => {
    test("happy path: returns activity + roles + systems + locations + adjacent edges", async () => {
      const data = await GET_ACTIVITY.run({ id: ACTIVITY_ID }, makeCtx());
      expect(data.id).toBe(ACTIVITY_ID);
      expect(typeof data.name).toBe("string");
      // Middle activity of the chain — one outgoing + one incoming PRECEDES.
      expect(data.preceded_by.length).toBeGreaterThanOrEqual(1);
      expect(data.precedes.length).toBeGreaterThanOrEqual(1);
      for (const e of [...data.precedes, ...data.preceded_by]) {
        expect(e.type).toBe("PRECEDES");
        expect(typeof e.id).toBe("string");
      }
      // The seed binds at least one Role to every Activity via EXECUTES.
      expect(data.roles.length).toBeGreaterThan(0);
      // `systems`/`locations` may be 0 for a given activity; just assert shape.
      expect(Array.isArray(data.systems)).toBe(true);
      expect(Array.isArray(data.locations)).toBe(true);
    });

    test("unknown id → throws ValidationError(not_found)", async () => {
      let caught: unknown;
      try {
        await GET_ACTIVITY.run(
          { id: "018f0000-0002-7000-8000-deadbeefdead" },
          makeCtx(),
        );
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ValidationError);
      expect((caught as ValidationError).code).toBe("not_found");
    });
  });
});
