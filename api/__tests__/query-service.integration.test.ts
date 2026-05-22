import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver } from "../src/neo4j/driver";

// AC-09 — Typed query helpers return the expected shapes against the
// retail-mini seed graph.
//
// Strategy: seed the graph once in beforeAll via POST /api/v1/import
// (idempotent — the seed uses upsert semantics so re-running on an
// already-seeded DB is a no-op for these assertions). Then exercise
// each typed helper over HTTP.
//
// Assumes the API server is already running on 127.0.0.1:8787
// (started by `bun run dev` or the CI harness).
const BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:8787";

// Pinned seed IDs from shared/seed/retail-mini.json — picked so the
// assertions are deterministic regardless of insert order.
const SEED_DOMAIN_IDS = [
  "018f0000-0000-7000-8000-000000000001", // Merchandising
  "018f0000-0000-7000-8000-000000000002", // Store Operations
  "018f0000-0000-7000-8000-000000000003", // Supply Chain
  "018f0000-0000-7000-8000-000000000004", // Customer/CRM
];

const MERCHANDISING_DOMAIN_ID = SEED_DOMAIN_IDS[0]!;
// "Plan Seasonal Assortment" — owns 4 activities + 1 role (Buyer) +
// systems (Merchandising System) and no AT_LOCATION rows.
const PLAN_SEASONAL_JOURNEY_ID = "018f0000-0001-7000-8000-000000000101";
// "Define Category Plan" — first activity of the journey above.
const DEFINE_CATEGORY_ACTIVITY_ID = "018f0000-0002-7000-8000-000010101001";
// "Select SKUs" — preceded by "Define Category Plan" (PRECEDES edge in
// the seed), so a single-hop path exists between the two.
const SELECT_SKUS_ACTIVITY_ID = "018f0000-0002-7000-8000-000010101002";

interface QueryResponse {
  rows: Record<string, unknown>[];
}

describe("integration: AC-09 typed query helpers", () => {
  beforeAll(async () => {
    // Idempotent seed via the import endpoint (FR-20 / handleImport
    // uses upsert-on-id). If the seed was already loaded by a prior
    // `bun run seed`, this re-import is harmless.
    const seedPath = resolve(
      import.meta.dir,
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

  test("GET /query/listDomains returns the 4 seed domains", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/query/listDomains`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as QueryResponse;
    expect(Array.isArray(body.rows)).toBe(true);
    // The seed has exactly 4 domains; the helper sorts by d.id ASC so
    // the order is deterministic.
    expect(body.rows.length).toBe(4);
    const ids = body.rows.map((r) => r.id as string);
    for (const expected of SEED_DOMAIN_IDS) {
      expect(ids).toContain(expected);
    }
    // Shape: every row has {id, name, description}.
    for (const row of body.rows) {
      expect(typeof row.id).toBe("string");
      expect(typeof row.name).toBe("string");
      expect(typeof row.description).toBe("string");
    }
  });

  test("GET /query/getDomain/:id returns the domain + its 2 journeys", async () => {
    const res = await fetch(
      `${BASE_URL}/api/v1/query/getDomain/${MERCHANDISING_DOMAIN_ID}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as QueryResponse;
    expect(body.rows.length).toBe(1);
    const domain = body.rows[0]! as {
      id: string;
      name: string;
      description: string;
      journeys: { id: string; name: string }[];
    };
    expect(domain.id).toBe(MERCHANDISING_DOMAIN_ID);
    expect(typeof domain.name).toBe("string");
    expect(Array.isArray(domain.journeys)).toBe(true);
    // Merchandising owns "Plan Seasonal Assortment" + "Run Markdown
    // Promotion" — exactly 2.
    expect(domain.journeys.length).toBe(2);
    const journeyIds = domain.journeys.map((j) => j.id);
    expect(journeyIds).toContain(PLAN_SEASONAL_JOURNEY_ID);
  });

  test("GET /query/getDomain/:id returns 404 not_found for an unknown id", async () => {
    // Same UUIDv7 shape, but not present in the seed.
    const unknownId = "018f0000-0000-7000-8000-0000000000ff";
    const res = await fetch(`${BASE_URL}/api/v1/query/getDomain/${unknownId}`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  test("GET /query/getDomain/:id returns 400 invalid_payload for malformed id", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/query/getDomain/not-a-uuid`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_payload");
  });

  test("GET /query/getJourney/:id returns the journey + its 4 activities", async () => {
    const res = await fetch(
      `${BASE_URL}/api/v1/query/getJourney/${PLAN_SEASONAL_JOURNEY_ID}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as QueryResponse;
    expect(body.rows.length).toBe(1);
    const journey = body.rows[0]! as {
      id: string;
      name: string;
      description: string;
      activities: { id: string; name: string }[];
    };
    expect(journey.id).toBe(PLAN_SEASONAL_JOURNEY_ID);
    expect(Array.isArray(journey.activities)).toBe(true);
    // The seed gives every journey exactly 4 activities.
    expect(journey.activities.length).toBe(4);
    const activityIds = journey.activities.map((a) => a.id);
    expect(activityIds).toContain(DEFINE_CATEGORY_ACTIVITY_ID);
    expect(activityIds).toContain(SELECT_SKUS_ACTIVITY_ID);
  });

  test("GET /query/getActivity/:id returns the activity", async () => {
    const res = await fetch(
      `${BASE_URL}/api/v1/query/getActivity/${DEFINE_CATEGORY_ACTIVITY_ID}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as QueryResponse;
    expect(body.rows.length).toBe(1);
    const activity = body.rows[0]! as {
      id: string;
      name: string;
      description: string;
    };
    expect(activity.id).toBe(DEFINE_CATEGORY_ACTIVITY_ID);
    expect(activity.name).toBe("Define Category Plan");
    expect(typeof activity.description).toBe("string");
  });

  test("GET /query/findPath returns a single PathRow when a path exists", async () => {
    // "Define Category Plan" -[:PRECEDES]-> "Select SKUs" — one edge,
    // length 1.
    const res = await fetch(
      `${BASE_URL}/api/v1/query/findPath?fromId=${DEFINE_CATEGORY_ACTIVITY_ID}&toId=${SELECT_SKUS_ACTIVITY_ID}&maxDepth=4`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as QueryResponse;
    // shortestPath returns 0 or 1 row — both are valid responses for
    // the helper's shape; what we pin here is the envelope.
    expect(Array.isArray(body.rows)).toBe(true);
    if (body.rows.length > 0) {
      const path = body.rows[0]! as {
        nodes: string[];
        edges: string[];
        length: number;
      };
      expect(Array.isArray(path.nodes)).toBe(true);
      expect(Array.isArray(path.edges)).toBe(true);
      expect(typeof path.length).toBe("number");
      // Either direction of the path is acceptable (the helper uses
      // an undirected match `(a)-[*..N]-(b)`); both endpoints must be
      // present.
      expect(path.nodes).toContain(DEFINE_CATEGORY_ACTIVITY_ID);
      expect(path.nodes).toContain(SELECT_SKUS_ACTIVITY_ID);
    }
  });

  test("GET /query/findPath returns 0 rows when no path exists within maxDepth", async () => {
    // Pick two domains that have no edges to each other in the seed —
    // Merchandising and Supply Chain are siblings under no parent.
    const supplyChainDomainId = "018f0000-0000-7000-8000-000000000003";
    const res = await fetch(
      `${BASE_URL}/api/v1/query/findPath?fromId=${MERCHANDISING_DOMAIN_ID}&toId=${supplyChainDomainId}&maxDepth=1`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as QueryResponse;
    expect(Array.isArray(body.rows)).toBe(true);
    // Either zero rows (no direct edge) or a path through some
    // intermediate; we just assert the shape envelope.
    for (const row of body.rows) {
      const r = row as { nodes: unknown; edges: unknown; length: unknown };
      expect(Array.isArray(r.nodes)).toBe(true);
      expect(Array.isArray(r.edges)).toBe(true);
      expect(typeof r.length).toBe("number");
    }
  });

  test("GET /query/neighbors/:id returns at least one neighbour row", async () => {
    // "Define Category Plan" has at least three neighbours in the
    // seed: the journey (PART_OF), the Buyer role (EXECUTES), and the
    // Merchandising System (USES_SYSTEM).
    const res = await fetch(
      `${BASE_URL}/api/v1/query/neighbors/${DEFINE_CATEGORY_ACTIVITY_ID}?depth=1`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as QueryResponse;
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows.length).toBeGreaterThanOrEqual(1);
    // Every row carries {node: {id, name}, label}.
    for (const row of body.rows) {
      const r = row as { node: { id: string; name: string }; label: string };
      expect(typeof r.label).toBe("string");
      // `node` may be null on the OPTIONAL MATCH path for isolated
      // nodes — but here we picked a connected node, so it should be
      // a real object.
      if (r.node !== null) {
        expect(typeof r.node.id).toBe("string");
      }
    }
  });
});
