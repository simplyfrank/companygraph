import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { generateId } from "../src/ids";

// kpi-okr-performance-dashboards T-10 — closes AC-05 (design §4.4,
// DD-07): GET /analytics/performance/journeys lists UserJourney nodes
// PART_OF the given domain, ordered by name; unknown domain → {rows:[]};
// ABSENT domain → {rows:[]} (never every journey, never 404).

const API_BASE = "http://127.0.0.1:8787/api/v1";

const cleanupNodeIds: string[] = [];

async function runWrite(cypher: string, params: Record<string, unknown>): Promise<void> {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    await session.run(cypher, params);
  } finally {
    await session.close();
  }
}

async function createNode(label: string, name: string): Promise<string> {
  const id = generateId();
  cleanupNodeIds.push(id);
  await runWrite(
    `CREATE (:\`${label}\` {id: $id, name: $name, description: "journey-axis fixture", attributes_json: "{}", createdAt: $now, updatedAt: $now})`,
    { id, name, now: new Date().toISOString() },
  );
  return id;
}

let domainId: string;
let journeyAlpha: string;
let journeyZulu: string;

beforeAll(async () => {
  const stamp = generateId().slice(0, 8);
  domainId = await createNode("Domain", `perf-jaxis-domain-${stamp}`);
  // Created in reverse-alphabetical order to prove ORDER BY j.name.
  journeyZulu = await createNode("UserJourney", `perf-jaxis-zulu-${stamp}`);
  journeyAlpha = await createNode("UserJourney", `perf-jaxis-alpha-${stamp}`);
  for (const j of [journeyZulu, journeyAlpha]) {
    await runWrite(
      `MATCH (j {id: $j}), (d {id: $d}) CREATE (j)-[:PART_OF {id: $edgeId}]->(d)`,
      { j, d: domainId, edgeId: generateId() },
    );
  }
});

afterAll(async () => {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    await session.run(`MATCH (n) WHERE n.id IN $ids DETACH DELETE n`, { ids: cleanupNodeIds });
  } finally {
    await session.close();
    await closeDriver();
    _resetDriver();
  }
});

describe("integration: performance journeys (AC-05)", () => {
  test("?domain=<id> returns the domain's journeys ordered by name", async () => {
    const res = await fetch(`${API_BASE}/analytics/performance/journeys?domain=${domainId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: Array<{ id: string; name: string }> };
    expect(body.rows.map((r) => r.id)).toEqual([journeyAlpha, journeyZulu]); // name-ordered
  });

  test("unknown well-formed domain → {rows:[]} (200, not 404)", async () => {
    const res = await fetch(`${API_BASE}/analytics/performance/journeys?domain=${generateId()}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { rows: unknown[] }).rows).toEqual([]);
  });

  test("absent domain → {rows:[]} — never every journey", async () => {
    const res = await fetch(`${API_BASE}/analytics/performance/journeys`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { rows: unknown[] }).rows).toEqual([]);
  });

  test("malformed domain → standard 400 envelope", async () => {
    const res = await fetch(`${API_BASE}/analytics/performance/journeys?domain=nope`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(typeof body.error?.code).toBe("string");
  });
});
