// kpi-impact-mapping AC-07 — RBAC route-permission mapping + model
// isolation.
// Integration test: requires a live Neo4j + API stack (NOT run here).
//
// AC-07 (authz + isolation half):
//  (a) getRoutePermission resolves each new kpi-impact route to the right
//      permission — kpi_impact:read for the matrix / rollup / list GETs,
//      kpi_impact:write for the POST/DELETE writes — and NEVER null (an
//      unmapped route makes the router SKIP the RBAC check, a silent open
//      write).
//  (b) isPublicRoute returns false for each new route.
//  (c) Model isolation via the API: GET matrix for model A excludes model
//      B's activities and B-only KPI columns.
//
// NOTE: the dev stack runs a full-permission dev session (no real 401/403
// unless ONELOGIN_ISSUER is set), so this asserts the permission MAPPING
// through getRoutePermission / isPublicRoute (deterministic, no DB) — not
// live 403s — plus the model-isolation behaviour through the API.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { _resetDriver, closeDriver, getDriver } from "../src/neo4j/driver";
import { getRoutePermission, isPublicRoute } from "../src/auth/rbac-permissions";
import { api, newCleanup, runCleanup } from "./helpers/model-fixtures";
import { buildScoringModel, type ScoringFixture } from "./helpers/key-activity-fixtures";

interface Matrix {
  rows: Array<{ id: string }>;
  columns: Array<{ id: string }>;
}

const V = "/api/v1";
const stamp = Date.now();
const cleanup = newCleanup();
const createdKpiIds: string[] = [];

let modelA: ScoringFixture;
let modelB: ScoringFixture;
let kpiA = "";
let kpiB = "";

const READ_ROUTES: Array<[string, string]> = [
  ["GET", `${V}/models/:modelId/kpi-impact/matrix`],
  ["GET", `${V}/models/:modelId/kpi-impact/rollup`],
  ["GET", `${V}/models/:modelId/kpi-impact/activity-links`],
  ["GET", `${V}/models/:modelId/kpi-impact/story-links`],
];
const WRITE_ROUTES: Array<[string, string]> = [
  ["POST", `${V}/models/:modelId/kpi-impact/activity-links`],
  ["DELETE", `${V}/models/:modelId/kpi-impact/activity-links/:linkId`],
  ["POST", `${V}/models/:modelId/kpi-impact/story-links`],
  ["DELETE", `${V}/models/:modelId/kpi-impact/story-links/:linkId`],
];

async function createKpi(name: string): Promise<string> {
  const { status, body } = await api<{ id: string }>("POST", "/kpis", {
    name,
    category: "quality",
    unit: "%",
    target_value: 90,
    target_direction: "higher_is_better",
    measurement_frequency: "weekly",
  });
  if (status !== 200) throw new Error(`createKpi ${name}: ${status} ${JSON.stringify(body)}`);
  createdKpiIds.push(body.id);
  return body.id;
}

describe("integration: kpi-impact-mapping AC-07 authz mapping + isolation", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
    modelA = await buildScoringModel(cleanup, `kim-az-a-${stamp}`, [{ key: "act" }], []);
    modelB = await buildScoringModel(cleanup, `kim-az-b-${stamp}`, [{ key: "bAct" }], []);
    kpiA = await createKpi(`kim-az-kpiA-${stamp}`);
    kpiB = await createKpi(`kim-az-kpiB-${stamp}`);

    const la = await api<{ linkId: string }>(
      "POST",
      `/models/${modelA.modelId}/kpi-impact/activity-links`,
      { activityId: modelA.activityIds.act!, kpiId: kpiA, direction: "increases", weight: 0.5 },
    );
    if (la.status !== 201) throw new Error(`link A: ${la.status}`);
    const lb = await api<{ linkId: string }>(
      "POST",
      `/models/${modelB.modelId}/kpi-impact/activity-links`,
      { activityId: modelB.activityIds.bAct!, kpiId: kpiB, direction: "increases", weight: 0.5 },
    );
    if (lb.status !== 201) throw new Error(`link B: ${lb.status}`);
  });

  afterAll(async () => {
    await runCleanup(cleanup);
    const session = getDriver().session({ defaultAccessMode: "WRITE" });
    try {
      if (createdKpiIds.length > 0) {
        await session.run("MATCH (k:KPI) WHERE k.id IN $ids DETACH DELETE k", { ids: createdKpiIds });
      }
    } finally {
      await session.close();
    }
    await closeDriver();
    _resetDriver();
  });

  test("every kpi-impact read route → kpi_impact:read, never null (AC-07a)", () => {
    for (const [method, path] of READ_ROUTES) {
      expect(getRoutePermission(method, path)).toBe("kpi_impact:read");
    }
  });

  test("every kpi-impact write route → kpi_impact:write, never null (AC-07a)", () => {
    for (const [method, path] of WRITE_ROUTES) {
      expect(getRoutePermission(method, path)).toBe("kpi_impact:write");
    }
  });

  test("no kpi-impact route is public (AC-07b)", () => {
    for (const [method, path] of [...READ_ROUTES, ...WRITE_ROUTES]) {
      expect(isPublicRoute(method, path)).toBe(false);
    }
  });

  test("model isolation: GET matrix for A excludes model-B activities + KPI columns (AC-07c)", async () => {
    const { status, body } = await api<Matrix>("GET", `/models/${modelA.modelId}/kpi-impact/matrix`);
    expect(status).toBe(200);
    const rowIds = body.rows.map((r) => r.id);
    const colIds = body.columns.map((c) => c.id);

    expect(rowIds).toContain(modelA.activityIds.act!);
    expect(colIds).toContain(kpiA);

    expect(rowIds).not.toContain(modelB.activityIds.bAct!);
    expect(colIds).not.toContain(kpiB);
  });
});
