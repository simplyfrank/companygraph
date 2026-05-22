import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../../src/neo4j/driver";
import type { ToolContext, SchemaSnapshot } from "../../src/chat/tools/types";
import { TOOL_DEF as LIST_DOMAINS } from "../../src/chat/tools/list-domains";
import { TOOL_DEF as GET_DOMAIN } from "../../src/chat/tools/get-domain";
import { TOOL_DEF as LIST_NODES_BY_LABEL } from "../../src/chat/tools/list-nodes-by-label";
import { TOOL_DEF as NEIGHBORS } from "../../src/chat/tools/neighbors";
import { TOOL_DEF as FIND_PATH } from "../../src/chat/tools/find-path";
import { ValidationError } from "../../src/errors";
import { NODE_LABELS } from "@companygraph/shared/schema/nodes";
import { EDGE_TYPES } from "@companygraph/shared/schema/edges";

// integration: T-12 simple tools — per-tool happy-path against a seeded Neo4j.
// Uses the same pattern as cypher-passthrough.integration.test.ts:
//   - seed via POST /api/v1/import
//   - drive each tool's `run()` directly with a hand-built ToolContext
//   - assert response shape against the design's "Returns" column.

const BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";

function makeCtx(): ToolContext {
  const snapshot: SchemaSnapshot = {
    labels: NODE_LABELS.map((l) => ({ id: l, name: l, attributes: [] })),
    edge_types: EDGE_TYPES.map((t) => ({ id: t, name: t })),
    examples: [],
  };
  return {
    driver: getDriver(),
    role: { id: "graph_analyst", allowed_tools: [] },
    conversationId: "test-conv",
    perTurnCache: new Map(),
    schemaSnapshot: snapshot,
    bound_context: { node_ids: [], edge_ids: [] },
  };
}

describe("integration: T-12 simple tools", () => {
  beforeAll(async () => {
    const seedPath = resolve(
      import.meta.dir,
      "..",
      "..",
      "..",
      "shared",
      "seed",
      "retail-mini.json",
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

  describe("list_domains", () => {
    test("returns every Domain ordered by name", async () => {
      const data = await LIST_DOMAINS.run({}, makeCtx());
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(4);
      for (const d of data) {
        expect(typeof d.id).toBe("string");
        expect(typeof d.name).toBe("string");
      }
      const names = data.map((d) => d.name);
      const sorted = [...names].sort();
      expect(names).toEqual(sorted);
    });
  });

  describe("get_domain", () => {
    test("returns one Domain with its journeys", async () => {
      const ctx = makeCtx();
      const domains = await LIST_DOMAINS.run({}, ctx);
      expect(domains.length).toBeGreaterThan(0);
      const target = domains[0]!;
      const got = await GET_DOMAIN.run({ id: target.id }, makeCtx());
      expect(got.id).toBe(target.id);
      expect(got.name).toBe(target.name);
      expect(Array.isArray(got.journeys)).toBe(true);
    });

    test("throws ValidationError(not_found) for an unknown id", async () => {
      let caught: unknown;
      try {
        await GET_DOMAIN.run({ id: "does-not-exist-uuid" }, makeCtx());
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ValidationError);
      expect((caught as ValidationError).code).toBe("not_found");
    });
  });

  describe("list_nodes_by_label", () => {
    test("returns up to `limit` nodes of the given label", async () => {
      const data = await LIST_NODES_BY_LABEL.run(
        { label: "Activity", limit: 5 },
        makeCtx(),
      );
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeLessThanOrEqual(5);
      for (const n of data) {
        expect(typeof n.id).toBe("string");
        expect(typeof n.name).toBe("string");
      }
    });

    test("applies name_contains filter (case-insensitive)", async () => {
      const all = await LIST_NODES_BY_LABEL.run(
        { label: "Activity", limit: 100 },
        makeCtx(),
      );
      if (all.length === 0) return; // nothing to test against
      const probe = all[0]!.name.slice(0, 3).toLowerCase();
      const filtered = await LIST_NODES_BY_LABEL.run(
        { label: "Activity", filter: { name_contains: probe }, limit: 100 },
        makeCtx(),
      );
      for (const n of filtered) {
        expect(n.name.toLowerCase()).toContain(probe);
      }
    });
  });

  describe("neighbors", () => {
    test("returns nodes + edges within depth, capped at 100", async () => {
      const ctx = makeCtx();
      const journeys = await LIST_NODES_BY_LABEL.run(
        { label: "UserJourney", limit: 1 },
        ctx,
      );
      if (journeys.length === 0) return;
      const seedId = journeys[0]!.id;
      const data = await NEIGHBORS.run(
        { nodeId: seedId, depth: 1, direction: "both" },
        makeCtx(),
      );
      expect(Array.isArray(data.nodes)).toBe(true);
      expect(Array.isArray(data.edges)).toBe(true);
      expect(data.nodes.length).toBeLessThanOrEqual(100);
      for (const n of data.nodes) {
        expect(typeof n.id).toBe("string");
        expect(typeof n.label).toBe("string");
      }
      for (const e of data.edges) {
        expect(typeof e.type).toBe("string");
        expect(typeof e.fromId).toBe("string");
        expect(typeof e.toId).toBe("string");
      }
    });
  });

  describe("find_path", () => {
    test("returns parallel arrays of node-id paths and edge sequences", async () => {
      const ctx = makeCtx();
      const activities = await LIST_NODES_BY_LABEL.run(
        { label: "Activity", limit: 2 },
        ctx,
      );
      if (activities.length < 2) return;
      const data = await FIND_PATH.run(
        { fromId: activities[0]!.id, toId: activities[1]!.id, maxDepth: 6 },
        makeCtx(),
      );
      expect(Array.isArray(data.paths)).toBe(true);
      expect(Array.isArray(data.edges)).toBe(true);
      // Parallel arrays — paths[i] corresponds to edges[i].
      expect(data.paths.length).toBe(data.edges.length);
      for (let i = 0; i < data.paths.length; i++) {
        const p = data.paths[i]!;
        const e = data.edges[i]!;
        // A path of N nodes has N-1 edges.
        if (p.length > 0) {
          expect(e.length).toBe(p.length - 1);
        }
        for (const id of p) {
          expect(typeof id).toBe("string");
        }
      }
    });
  });
});
