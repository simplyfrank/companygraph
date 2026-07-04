import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { generateId } from "../src/ids";

// kpi-okr-governance T-07 — pins the AS-BUILT kpi/sla-alignment contract
// (FR-04, AC-06, AC-12) plus sanctioned change (ii): the weight [0,1]
// bound from kpiAlignmentCreateRequestSchema (the ONE tightening DD-01
// allows) lands in the same task as this pin.
//
// Pinned as-built semantics:
//   - alignment_id = elementId(r): an opaque Neo4j string, NOT a UUID —
//     DELETE takes it verbatim, no UUID guard.
//   - KPI alignments accept target_type "domain" (extension beyond the
//     shared kpiAlignmentSchema); the domain GET branch lists KPIs by
//     the k.domain_id PROPERTY, not by ALIGNED_TO edges.
//   - SLA alignments are journey|activity only.

const API_BASE = "http://127.0.0.1:8787/api/v1";

interface ErrorEnvelope {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

const fixtureNodeIds: string[] = [];
const domainId = generateId();
const journeyId = generateId();
const activityId = generateId();
let kpiId = "";
let slaId = "";

async function post(path: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  // Fixture targets seeded through the production driver (independent of
  // the graph-core node routes; cleaned up by id in afterAll).
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    await session.run(
      `CREATE (:Domain {id: $domainId, name: $dn}),
              (:UserJourney {id: $journeyId, name: $jn}),
              (:Activity {id: $activityId, name: $an})`,
      {
        domainId, journeyId, activityId,
        dn: `align-domain-${domainId}`,
        jn: `align-journey-${journeyId}`,
        an: `align-activity-${activityId}`,
      },
    );
    fixtureNodeIds.push(domainId, journeyId, activityId);
  } finally {
    await session.close();
  }

  const kpi = await post("/kpis", {
    name: `align-kpi-${generateId()}`,
    category: "quality",
    unit: "count",
    target_value: 10,
    target_direction: "lower_is_better",
    measurement_frequency: "weekly",
    domain_id: domainId,
  });
  expect(kpi.status).toBe(200);
  kpiId = kpi.body.id;
  fixtureNodeIds.push(kpiId);

  const sla = await post("/slas", {
    name: `align-sla-${generateId()}`,
    service_type: "availability",
    target_value: 99.9,
    target_unit: "%",
    measurement_window: "p95",
    window_duration: "30d",
    compliance_threshold: 99,
  });
  expect(sla.status).toBe(200);
  slaId = sla.body.id;
  fixtureNodeIds.push(slaId);
});

afterAll(async () => {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    await session.run(`MATCH (n) WHERE n.id IN $ids DETACH DELETE n`, { ids: fixtureNodeIds });
  } finally {
    await session.close();
    await closeDriver();
    _resetDriver();
  }
});

describe("integration: kpi-alignments (AC-06, AC-12)", () => {
  test("create → list → delete against a journey target", async () => {
    const created = await post("/kpi-alignments", {
      kpi_id: kpiId,
      target_type: "journey",
      target_id: journeyId,
      weight: 0.6,
      attribution_type: "direct",
      alignment_notes: "fixture",
    });
    expect(created.status).toBe(200);
    // Pinned: alignment_id is an opaque elementId string, not a UUID.
    expect(typeof created.body.alignment_id).toBe("string");
    expect(created.body.kpi_id).toBe(kpiId);
    expect(created.body.weight).toBe(0.6);

    const list = await fetch(`${API_BASE}/kpi-alignments?target_type=journey&target_id=${journeyId}`);
    expect(list.status).toBe(200);
    const rows = ((await list.json()) as { rows: any[] }).rows;
    const mine = rows.find((r) => r.alignment_id === created.body.alignment_id);
    expect(mine).toBeDefined();
    expect(mine.kpi_id).toBe(kpiId);
    expect(mine.attribution_type).toBe("direct");

    // Pinned as-built quirk: the router does NOT decodeURIComponent the
    // alignment id, so the elementId must be sent RAW (':' is path-legal;
    // a percent-encoded id fails to match and 404s).
    const del = await fetch(`${API_BASE}/kpi-alignments/${created.body.alignment_id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ deleted: true });
  });

  test("domain target_type lists KPIs by domain_id property (pinned as-built)", async () => {
    const created = await post("/kpi-alignments", {
      kpi_id: kpiId,
      target_type: "domain",
      target_id: domainId,
      weight: 1,
      attribution_type: "indirect",
    });
    expect(created.status).toBe(200);

    const list = await fetch(`${API_BASE}/kpi-alignments?target_type=domain&target_id=${domainId}`);
    expect(list.status).toBe(200);
    const rows = ((await list.json()) as { rows: any[] }).rows;
    // The domain branch matches on k.domain_id — our KPI carries it.
    expect(rows.some((r) => r.kpi_id === kpiId)).toBe(true);

    await fetch(`${API_BASE}/kpi-alignments/${created.body.alignment_id}`, {
      method: "DELETE",
    });
  });

  test("weight -0.1 and 1.1 → 400 issues[] (sanctioned FR-04 bound)", async () => {
    for (const weight of [-0.1, 1.1]) {
      const res = await post("/kpi-alignments", {
        kpi_id: kpiId,
        target_type: "journey",
        target_id: journeyId,
        weight,
        attribution_type: "direct",
      });
      expect(res.status).toBe(400);
      const env = res.body as ErrorEnvelope;
      expect(env.error.code).toBe("invalid_payload");
      const issues = env.error.details?.issues as Array<{ path: string }>;
      expect(issues.map((i) => i.path)).toContain("weight");
    }
  });

  test("bad target_type → 400; unknown KPI / target → 404", async () => {
    const badType = await post("/kpi-alignments", {
      kpi_id: kpiId,
      target_type: "system",
      target_id: journeyId,
      weight: 0.5,
      attribution_type: "direct",
    });
    expect(badType.status).toBe(400);

    const unknownKpi = await post("/kpi-alignments", {
      kpi_id: generateId(),
      target_type: "journey",
      target_id: journeyId,
      weight: 0.5,
      attribution_type: "direct",
    });
    expect(unknownKpi.status).toBe(404);

    const unknownTarget = await post("/kpi-alignments", {
      kpi_id: kpiId,
      target_type: "journey",
      target_id: generateId(),
      weight: 0.5,
      attribution_type: "direct",
    });
    expect(unknownTarget.status).toBe(404);
  });

  test("GET without target params → 400; DELETE unknown elementId → 404", async () => {
    const list = await fetch(`${API_BASE}/kpi-alignments`);
    expect(list.status).toBe(400);

    const del = await fetch(`${API_BASE}/kpi-alignments/definitely-not-an-element-id`, {
      method: "DELETE",
    });
    expect(del.status).toBe(404);
  });
});

describe("integration: sla-alignments (AC-06, AC-12)", () => {
  test("create → list → delete (journey|activity only)", async () => {
    const created = await post("/sla-alignments", {
      sla_id: slaId,
      target_type: "activity",
      target_id: activityId,
      is_critical: true,
      alignment_notes: "fixture",
    });
    expect(created.status).toBe(200);
    expect(created.body.sla_id).toBe(slaId);
    expect(created.body.is_critical).toBe(true);

    const list = await fetch(`${API_BASE}/sla-alignments?target_type=activity&target_id=${activityId}`);
    expect(list.status).toBe(200);
    const rows = ((await list.json()) as { rows: any[] }).rows;
    const mine = rows.find((r) => r.sla_id === slaId);
    expect(mine).toBeDefined();
    expect(mine.is_critical).toBe(true);

    // The SLA create response carries no alignment_id (pinned as-built) —
    // delete through the driver-visible elementId from a fresh lookup.
    const session = getDriver().session({ defaultAccessMode: "READ" });
    let elementId = "";
    try {
      const r = await session.run(
        `MATCH (s:SLA {id: $slaId})-[rel:ALIGNED_TO]->(:Activity {id: $activityId}) RETURN elementId(rel) AS eid`,
        { slaId, activityId },
      );
      elementId = r.records[0]?.get("eid");
    } finally {
      await session.close();
    }
    // Raw elementId — same no-decode router quirk as kpi-alignments.
    const del = await fetch(`${API_BASE}/sla-alignments/${elementId}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ deleted: true });
  });

  test("domain target_type rejected for SLA alignments (journey|activity enum)", async () => {
    const res = await post("/sla-alignments", {
      sla_id: slaId,
      target_type: "domain",
      target_id: domainId,
    });
    expect(res.status).toBe(400);
    const env = res.body as ErrorEnvelope;
    expect(env.error.code).toBe("invalid_payload");
  });

  test("missing required fields → 400 issues[] (was hand-rolled ladder)", async () => {
    const res = await post("/sla-alignments", { sla_id: slaId });
    expect(res.status).toBe(400);
    const env = res.body as ErrorEnvelope;
    const issues = env.error.details?.issues as Array<{ path: string }>;
    expect(issues.map((i) => i.path)).toEqual(expect.arrayContaining(["target_type", "target_id"]));
  });
});
