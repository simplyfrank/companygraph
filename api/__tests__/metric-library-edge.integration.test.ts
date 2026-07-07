// saas-metric-library T-03 + T-13 (design §3.2, §3.3 — OQ-1 a; FR-02, FR-03,
// NFR-01, NFR-06; AC-03 registration half, AC-04 write path). Requires Neo4j +
// the loopback API up.
//
// AC-03: after ensureMeasuresEdgeType, GET /api/v1/ontology/edge-types/MEASURES
// shows the KPI→MetricDefinition endpoint pair; manual boundary check:
// `git diff shared/src/schema/edges.ts` shows no additions.
// AC-04: a KPI→MetricDefinition MEASURES write via POST /api/v1/edges SUCCEEDS
// (MEASURES ∉ LIFECYCLE_EDGES — not 409 model_lifecycle_route_required); a wrong
// endpoint pair is 400 edge_endpoint_label_mismatch; the module-pin INSTANTIATES
// edge + its guard are unaffected (a lifecycle-edge write is still 409).

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { closeDriver, _resetDriver } from "../src/neo4j/driver";
import { ensureMetricDefinitionLabel } from "../src/seed/ensure-metric-label";
import { ensureMeasuresEdgeType } from "../src/seed/ensure-measures-edge";

const BASE = "http://127.0.0.1:8787";
const API = `${BASE}/api/v1`;

async function api<T>(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return {
    status: res.status,
    body: (text.length > 0 ? JSON.parse(text) : null) as T,
  };
}

const cleanup: Array<{ label: string; id: string }> = [];

async function createNode(label: string, name: string, attributes: Record<string, unknown> = {}) {
  const { status, body } = await api<{ id: string }>("POST", `/nodes/${label}`, { name, attributes });
  if (status !== 201) throw new Error(`createNode ${label}: ${status} ${JSON.stringify(body)}`);
  cleanup.push({ label, id: body.id });
  return body.id;
}

describe("integration: saas-metric-library T-03/T-13 MEASURES edge (AC-03, AC-04)", () => {
  let kpiId: string;
  let metricId: string;

  beforeAll(async () => {
    await ensureMetricDefinitionLabel(BASE);
    await ensureMeasuresEdgeType(BASE);
    kpiId = await createNode("KPI", `mlib-kpi-${Date.now()}`);
    metricId = await createNode("MetricDefinition", `mlib-metric-${Date.now()}`, {
      formula: "x / y",
      unit: "percent",
      category: "retention",
      benchmark: "> 100%",
    });
  });

  afterAll(async () => {
    for (const { label, id } of cleanup.reverse()) {
      await fetch(`${API}/nodes/${label}/${id}?cascade=true`, { method: "DELETE" });
    }
    await closeDriver();
    _resetDriver();
  });

  test("AC-03: GET /api/v1/ontology/edge-types/MEASURES shows the KPI→MetricDefinition pair", async () => {
    const { status, body } = await api<{ name: string; endpoints: Array<{ fromLabel: string; toLabel: string }> }>(
      "GET",
      "/ontology/edge-types/MEASURES",
    );
    expect(status).toBe(200);
    expect(body.name).toBe("MEASURES");
    expect(body.endpoints).toEqual(
      expect.arrayContaining([{ fromLabel: "KPI", toLabel: "MetricDefinition" }]),
    );
  });

  test("AC-03: ensureMeasuresEdgeType is idempotent (409 name_conflict → no-op)", async () => {
    await expect(ensureMeasuresEdgeType(BASE)).resolves.toBeUndefined();
  });

  test("AC-04: a KPI→MetricDefinition MEASURES write succeeds (not 409 lifecycle)", async () => {
    const { status, body } = await api<{ id: string }>("POST", "/edges", {
      type: "MEASURES",
      fromId: kpiId,
      toId: metricId,
    });
    expect(status).toBe(201);
    expect(body.id).toBeDefined();
    // cleanup the edge
    await fetch(`${API}/edges/${body.id}`, { method: "DELETE" }).catch(() => {});
  });

  test("AC-04: a wrong endpoint pair → 400 edge_endpoint_label_mismatch", async () => {
    const domainId = await createNode("Domain", `mlib-dom-${Date.now()}`);
    const { status, body } = await api<{ error: { code: string } }>("POST", "/edges", {
      type: "MEASURES",
      fromId: domainId,
      toId: metricId,
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe("edge_endpoint_label_mismatch");
  });

  test("AC-04: the module-pin INSTANTIATES lifecycle edge is unaffected (still 409)", async () => {
    for (const type of ["INSTANTIATES", "IN_MODEL"]) {
      const { status, body } = await api<{ error: { code: string } }>("POST", "/edges", {
        type,
        fromId: "00000000-0000-7000-8000-0000000000aa",
        toId: "00000000-0000-7000-8000-0000000000bb",
      });
      expect(status).toBe(409);
      expect(body.error.code).toBe("model_lifecycle_route_required");
    }
  });
});
