// kpi-impact-mapping T-11/T-12 (design §4.12, FR-01–FR-09, AC-01–AC-07,
// AC-13–AC-15) — integration tests. Requires a running Neo4j + API server.
// Tests: activity link CRUD, story link CRUD, matrix read, rollup read,
// authz (RBAC), error codes (kpi_not_found, impact_link_not_found).

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { generateId } from "../src/ids";

const API_BASE = "http://127.0.0.1:8787/api/v1";

interface ErrorEnvelope {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

const fixtureIds: string[] = [];
const modelId = generateId();
const domainId = generateId();
const journeyId = generateId();
const activityId = generateId();
const storyId = generateId();
let kpiId = "";

async function post(path: string, body: unknown, headers?: Record<string, string>): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function get(path: string, headers?: Record<string, string>): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API_BASE}${path}`, { headers });
  return { status: res.status, body: await res.json() };
}

async function del(path: string, headers?: Record<string, string>): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE", headers });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

beforeAll(async () => {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    // Create BusinessModel + Domain + Journey + Activity + KPI + UserStory
    kpiId = generateId();
    await session.run(
      `CREATE (m:BusinessModel {id: $modelId, name: $mn}),
              (d:Domain {id: $domainId, name: $dn}),
              (j:UserJourney {id: $journeyId, name: $jn}),
              (a:Activity {id: $activityId, name: $an, attributes_json: $attrs}),
              (k:KPI {id: $kpiId, name: $kn, unit: '$', target_direction: 'higher_is_better',
                      target_value: 100, warning_threshold: 80, critical_threshold: 60}),
              (s:UserStory {id: $storyId, name: $sn})
       CREATE (m)-[:HAS_DOMAIN]->(d),
              (d)-[:HAS_JOURNEY]->(j),
              (j)-[:HAS_ACTIVITY]->(a),
              (s)-[:DESCRIBES_ACTIVITY]->(a)`,
      {
        modelId, domainId, journeyId, activityId, kpiId, storyId,
        mn: `impact-model-${modelId}`,
        dn: `impact-domain-${domainId}`,
        jn: `impact-journey-${journeyId}`,
        an: `impact-activity-${activityId}`,
        kn: `impact-kpi-${kpiId}`,
        sn: `impact-story-${storyId}`,
        attrs: JSON.stringify({ keyActivity: true }),
      },
    );
    fixtureIds.push(modelId, domainId, journeyId, activityId, kpiId, storyId);
  } finally {
    await session.close();
  }
});

afterAll(async () => {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    for (const id of fixtureIds) {
      await session.run("MATCH (n) WHERE n.id = $id DETACH DELETE n", { id });
    }
  } finally {
    await session.close();
  }
  _resetDriver();
  await closeDriver();
});

describe("kpi-impact-mapping T-11 activity link CRUD (AC-01, AC-03)", () => {
  test("POST activity-link → 201 with row (AC-01)", async () => {
    const { status, body } = await post(
      `/models/${modelId}/kpi-impact/activity-links`,
      { activityId, kpiId, direction: "increases", weight: 0.7 },
    );
    expect(status).toBe(201);
    expect(body.kpiId).toBe(kpiId);
    expect(body.sourceId).toBe(activityId);
    expect(body.direction).toBe("increases");
    expect(body.weight).toBe(0.7);
  });

  test("POST activity-link with unknown kpiId → 404 kpi_not_found (AC-03)", async () => {
    const { status, body } = await post(
      `/models/${modelId}/kpi-impact/activity-links`,
      { activityId, kpiId: "nonexistent-kpi", direction: "increases", weight: 0.5 },
    );
    expect(status).toBe(404);
    expect((body as ErrorEnvelope).error.code).toBe("kpi_not_found");
  });

  test("GET activity-links → list with the created link", async () => {
    const { status, body } = await get(`/models/${modelId}/kpi-impact/activity-links`);
    expect(status).toBe(200);
    expect(body.rows.length).toBeGreaterThanOrEqual(1);
    const link = body.rows.find((r: any) => r.kpiId === kpiId && r.sourceId === activityId);
    expect(link).toBeDefined();
  });

  test("GET activity-links with ?kpiId filter → filtered list", async () => {
    const { status, body } = await get(`/models/${modelId}/kpi-impact/activity-links?kpiId=${kpiId}`);
    expect(status).toBe(200);
    expect(body.rows.every((r: any) => r.kpiId === kpiId)).toBe(true);
  });
});

describe("kpi-impact-mapping T-11 story link CRUD (AC-02, AC-03)", () => {
  test("POST story-link → 201 with row (AC-02)", async () => {
    const { status, body } = await post(
      `/models/${modelId}/kpi-impact/story-links`,
      { storyId, kpiId, direction: "decreases", weight: 0.3 },
    );
    expect(status).toBe(201);
    expect(body.kpiId).toBe(kpiId);
    expect(body.sourceId).toBe(storyId);
    expect(body.direction).toBe("decreases");
    expect(body.weight).toBe(0.3);
  });

  test("GET story-links → list with the created link", async () => {
    const { status, body } = await get(`/models/${modelId}/kpi-impact/story-links`);
    expect(status).toBe(200);
    expect(body.rows.length).toBeGreaterThanOrEqual(1);
    const link = body.rows.find((r: any) => r.kpiId === kpiId && r.sourceId === storyId);
    expect(link).toBeDefined();
  });
});

describe("kpi-impact-mapping T-12 matrix read (AC-04, AC-05, AC-08)", () => {
  test("GET matrix → 200 with rows, columns, cells, gaps, meta (AC-04)", async () => {
    const { status, body } = await get(`/models/${modelId}/kpi-impact/matrix`);
    expect(status).toBe(200);
    expect(body.meta.activityCount).toBeGreaterThan(0);
    expect(body.meta.kpiCount).toBeGreaterThan(0);
    expect(body.meta.linkedCellCount).toBeGreaterThan(0);
    expect(body.cells).toBeDefined();
    expect(body.columns).toBeDefined();
    expect(body.rows).toBeDefined();
  });

  test("GET matrix for unknown model → 404 model_not_found (N-01)", async () => {
    const { status, body } = await get(`/models/nonexistent-model/kpi-impact/matrix`);
    expect(status).toBe(404);
    expect((body as ErrorEnvelope).error.code).toBe("model_not_found");
  });
});

describe("kpi-impact-mapping T-12 rollup read (AC-07, FR-09)", () => {
  test("GET rollup → 200 with rows and meta (AC-07)", async () => {
    const { status, body } = await get(`/models/${modelId}/kpi-impact/rollup`);
    expect(status).toBe(200);
    expect(body.meta).toBeDefined();
    expect(body.rows).toBeDefined();
  });

  test("GET rollup for unknown model → 200 with empty rows (FR-09 degrade)", async () => {
    const { status, body } = await get(`/models/nonexistent-model/kpi-impact/rollup`);
    expect(status).toBe(200);
    // FR-09: degrade to no_data, never 500
    expect(body.rows).toEqual([]);
  });
});

describe("kpi-impact-mapping T-12 authz (AC-13, AC-14)", () => {
  test("POST activity-link without auth → 401/403", async () => {
    // No x-user-id header → auth gate rejects
    const { status } = await post(
      `/models/${modelId}/kpi-impact/activity-links`,
      { activityId, kpiId, direction: "increases", weight: 0.5 },
    );
    // The central auth gate returns 401 when no user is identified
    expect([401, 403]).toContain(status);
  });
});

describe("kpi-impact-mapping T-12 delete + error codes (AC-03, AC-06)", () => {
  test("DELETE activity-link with unknown linkId → 404 impact_link_not_found (AC-03)", async () => {
    const { status, body } = await del(`/models/${modelId}/kpi-impact/activity-links/nonexistent-link`);
    expect(status).toBe(404);
    expect((body as ErrorEnvelope).error.code).toBe("impact_link_not_found");
  });

  test("DELETE story-link with unknown linkId → 404 impact_link_not_found", async () => {
    const { status, body } = await del(`/models/${modelId}/kpi-impact/story-links/nonexistent-link`);
    expect(status).toBe(404);
    expect((body as ErrorEnvelope).error.code).toBe("impact_link_not_found");
  });
});
