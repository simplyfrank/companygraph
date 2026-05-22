import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver } from "../../src/neo4j/driver";

// T-22 / DD-21 — sanity check: after `bun run seed && bun run
// seed:enriched`, the schema-assumed attributes referenced by chat-
// interface tools (sla_p99_ms / observed_p99_ms on PRECEDES edges,
// leverage_score + team on Activity nodes, team on Role nodes) all
// exist on at least one row in the live graph.
//
// This test assumes the API server is already running on
// 127.0.0.1:8787 (the standard integration-test contract — see
// `cypher-passthrough.integration.test.ts`). It seeds the basic
// retail-mini.json + then re-applies retail-mini-enriched.json via the
// same channels production uses: PATCH per node, POST /import for
// edges.

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

interface QueryResponse {
  rows: Record<string, unknown>[];
}

async function postCypher(
  statement: string,
  params: Record<string, unknown> = {},
): Promise<QueryResponse> {
  const res = await fetch(`${BASE_URL}/api/v1/query/cypher`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ statement, params }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as QueryResponse;
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
  const out = (await res.json()) as {
    imported: { nodes: number; edges: number };
    errors?: unknown[];
  };
  expect(out.errors).toBeUndefined();
}

describe("integration: T-22 seed-attrs presence", () => {
  beforeAll(async () => {
    // 1. Ensure the basic seed is loaded (idempotent — MERGE-on-id).
    await importSeedFile(SEED_PATH);

    // 2. Apply the enriched attributes via the same channels
    //    `scripts/seed-enriched.ts` uses (PATCH per node + /import for
    //    edges). Doing it inline rather than shelling out keeps the
    //    test self-contained.
    const enriched = JSON.parse(
      readFileSync(ENRICHED_SEED_PATH, "utf8"),
    ) as EnrichedSeed;
    for (const node of enriched.nodes) {
      await patchNode(node);
    }
    await importEdges(enriched.edges);
  });

  afterAll(async () => {
    await closeDriver();
    _resetDriver();
  });

  test("at least one PRECEDES edge carries sla_p99_ms", async () => {
    const { rows } = await postCypher(
      `MATCH ()-[r:PRECEDES]->()
       WITH r, apoc.convert.fromJsonMap(r.attributes_json) AS attrs
       WHERE attrs.sla_p99_ms IS NOT NULL
       RETURN count(r) AS c`,
    );
    // apoc may not be installed — try a JSON STRING contains as a
    // fallback. The attributes_json string is a JSON map; if the key
    // sla_p99_ms is set, the string contains the literal key.
    if (rows.length === 0 || rows[0]?.c === undefined) {
      const { rows: r2 } = await postCypher(
        `MATCH ()-[r:PRECEDES]->()
         WHERE r.attributes_json CONTAINS '"sla_p99_ms"'
         RETURN count(r) AS c`,
      );
      expect(Number(r2[0]?.c)).toBeGreaterThanOrEqual(1);
      return;
    }
    expect(Number(rows[0]?.c)).toBeGreaterThanOrEqual(1);
  });

  test("at least one PRECEDES edge is a breach (observed_p99_ms > sla_p99_ms)", async () => {
    // attributes_json is a STRING in Neo4j (per CLAUDE.md). Use the
    // string-contains heuristic at the Cypher boundary: extract via a
    // regex-style match, or filter in-app. We filter in-app: pull
    // every PRECEDES row's attributes_json string and parse it here.
    const { rows } = await postCypher(
      `MATCH ()-[r:PRECEDES]->()
       WHERE r.attributes_json IS NOT NULL
       RETURN r.id AS id, r.attributes_json AS attrs`,
    );
    let breachCount = 0;
    for (const row of rows) {
      const attrs = JSON.parse(String(row.attrs ?? "{}")) as {
        sla_p99_ms?: number;
        observed_p99_ms?: number;
      };
      if (
        typeof attrs.sla_p99_ms === "number" &&
        typeof attrs.observed_p99_ms === "number" &&
        attrs.observed_p99_ms > attrs.sla_p99_ms
      ) {
        breachCount += 1;
      }
    }
    expect(breachCount).toBeGreaterThanOrEqual(1);
  });

  test("at least one Activity has leverage_score >= 0.78", async () => {
    const { rows } = await postCypher(
      `MATCH (a:Activity)
       WHERE a.attributes_json IS NOT NULL
       RETURN a.id AS id, a.attributes_json AS attrs`,
    );
    let highLeverage = 0;
    for (const row of rows) {
      const attrs = JSON.parse(String(row.attrs ?? "{}")) as {
        leverage_score?: number;
      };
      if (typeof attrs.leverage_score === "number" && attrs.leverage_score >= 0.78) {
        highLeverage += 1;
      }
    }
    expect(highLeverage).toBeGreaterThanOrEqual(1);
  });

  test("at least one Activity carries a team attribute", async () => {
    const { rows } = await postCypher(
      `MATCH (a:Activity)
       WHERE a.attributes_json IS NOT NULL
       RETURN a.attributes_json AS attrs`,
    );
    let withTeam = 0;
    for (const row of rows) {
      const attrs = JSON.parse(String(row.attrs ?? "{}")) as {
        team?: string;
      };
      if (typeof attrs.team === "string" && attrs.team.length > 0) {
        withTeam += 1;
      }
    }
    expect(withTeam).toBeGreaterThanOrEqual(1);
  });

  test("at least one Role carries a team attribute", async () => {
    const { rows } = await postCypher(
      `MATCH (r:Role)
       WHERE r.attributes_json IS NOT NULL
       RETURN r.attributes_json AS attrs`,
    );
    let withTeam = 0;
    for (const row of rows) {
      const attrs = JSON.parse(String(row.attrs ?? "{}")) as {
        team?: string;
      };
      if (typeof attrs.team === "string" && attrs.team.length > 0) {
        withTeam += 1;
      }
    }
    expect(withTeam).toBeGreaterThanOrEqual(1);
  });
});
