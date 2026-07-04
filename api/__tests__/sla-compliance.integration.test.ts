import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { generateId } from "../src/ids";

// kpi-okr-governance T-08 — pins the AS-BUILT sla-compliance contract
// (FR-07, AC-09) plus the sanctioned fixes: zod window_days query schema
// (FR-11a) and the DD-04 UUID-any path guard.
//
// Split-brain store pinned per V-02/DD-05: sla-compliance reads
// :SLABreach NODES from Neo4j — NOT the Postgres sla_breaches table the
// sla-breaches routes write. Fixtures seed nodes via getDriver().
//
// The exact compliance/risk scoring formulas are implementation detail
// (kept free to refactor) — tests assert only the counting fields and
// that rates/scores land in [0,100].

const API_BASE = "http://127.0.0.1:8787/api/v1";

const cleanupIds: string[] = [];
const domainId = generateId();
let slaId = "";

async function seedBreachNodes(
  slaIdArg: string,
  breaches: Array<{ severity: string; resolution_status: string; daysAgo: number }>,
): Promise<void> {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    for (const b of breaches) {
      const id = generateId();
      cleanupIds.push(id);
      await session.run(
        `CREATE (:SLABreach {
           id: $id, sla_id: $slaId, breach_at: $breachAt,
           severity: $severity, resolution_status: $status,
           actual_value: 90.0, target_value: 99.9
         })`,
        {
          id,
          slaId: slaIdArg,
          breachAt: new Date(Date.now() - b.daysAgo * 24 * 60 * 60 * 1000).toISOString(),
          severity: b.severity,
          status: b.resolution_status,
        },
      );
    }
  } finally {
    await session.close();
  }
}

beforeAll(async () => {
  const sla = await fetch(`${API_BASE}/slas`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: `compliance-sla-${generateId()}`,
      service_type: "availability",
      target_value: 99.9,
      target_unit: "%",
      measurement_window: "p95",
      window_duration: "30d",
      compliance_threshold: 99,
      domain_id: domainId,
    }),
  });
  expect(sla.status).toBe(200);
  slaId = ((await sla.json()) as { id: string }).id;
  cleanupIds.push(slaId);

  // Deterministic breach set inside the default 90-day window:
  // 1 critical open, 1 major resolved, 2 minor open.
  await seedBreachNodes(slaId, [
    { severity: "critical", resolution_status: "open", daysAgo: 5 },
    { severity: "major", resolution_status: "resolved", daysAgo: 15 },
    { severity: "minor", resolution_status: "open", daysAgo: 30 },
    { severity: "minor", resolution_status: "open", daysAgo: 45 },
  ]);
});

afterAll(async () => {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    await session.run(`MATCH (n) WHERE n.id IN $ids DETACH DELETE n`, { ids: cleanupIds });
  } finally {
    await session.close();
    await closeDriver();
    _resetDriver();
  }
});

describe("integration: sla-compliance (AC-09)", () => {
  test("GET /sla-compliance/:slaId returns counting fields matching the seed", async () => {
    const res = await fetch(`${API_BASE}/sla-compliance/${slaId}`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.sla_id).toBe(slaId);
    expect(body.window_days).toBe(90);
    expect(body.breaches.total).toBe(4);
    expect(body.breaches.open).toBe(3);
    expect(body.breaches.resolved).toBe(1);
    expect(body.breaches.by_severity).toEqual({ critical: 1, major: 1, minor: 2 });

    expect(body.compliance_rate).toBeGreaterThanOrEqual(0);
    expect(body.compliance_rate).toBeLessThanOrEqual(100);
    expect(body.risk_score).toBeGreaterThanOrEqual(0);
    expect(body.risk_score).toBeLessThanOrEqual(100);
    expect(body.breach_patterns).toBeDefined();
  });

  test("GET /sla-compliance/domain/:domainId aggregates the domain's SLAs", async () => {
    const res = await fetch(`${API_BASE}/sla-compliance/domain/${domainId}`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.domain_id).toBe(domainId);
    expect(body.total_slas).toBe(1);
    const row = body.slas.find((s: any) => s.id === slaId);
    expect(row).toBeDefined();
    expect(row.breaches.total).toBe(4);
    expect(row.breaches.open).toBe(3);
    expect(body.overall_compliance_rate).toBeGreaterThanOrEqual(0);
    expect(body.overall_compliance_rate).toBeLessThanOrEqual(100);
    expect(body.overall_risk_score).toBeGreaterThanOrEqual(0);
    expect(body.overall_risk_score).toBeLessThanOrEqual(100);
  });

  test("GET /sla-compliance/all includes the seeded SLA with its counts", async () => {
    const res = await fetch(`${API_BASE}/sla-compliance/all`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.total_slas).toBeGreaterThanOrEqual(1);
    const row = body.slas.find((s: any) => s.id === slaId);
    expect(row).toBeDefined();
    expect(row.breaches.total).toBe(4);
    expect(row.compliance_rate).toBeGreaterThanOrEqual(0);
    expect(row.compliance_rate).toBeLessThanOrEqual(100);
  });

  test("window_days narrows the breach window", async () => {
    // Only the 5-day-old critical breach falls inside a 10-day window.
    const res = await fetch(`${API_BASE}/sla-compliance/${slaId}?window_days=10`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.window_days).toBe(10);
    expect(body.breaches.total).toBe(1);
    expect(body.breaches.by_severity.critical).toBe(1);
  });

  test("garbage window_days → 400 issues[]; non-UUID path ids → 400; unknown SLA → 404", async () => {
    const garbage = await fetch(`${API_BASE}/sla-compliance/${slaId}?window_days=soon`);
    expect(garbage.status).toBe(400);
    const env = (await garbage.json()) as { error: { code: string; details?: { issues?: Array<{ path: string }> } } };
    expect(env.error.code).toBe("invalid_payload");
    expect(env.error.details?.issues?.map((i) => i.path)).toContain("window_days");

    const badSla = await fetch(`${API_BASE}/sla-compliance/not-a-uuid`);
    expect(badSla.status).toBe(400);

    const badDomain = await fetch(`${API_BASE}/sla-compliance/domain/not-a-uuid`);
    expect(badDomain.status).toBe(400);

    const unknown = await fetch(`${API_BASE}/sla-compliance/${generateId()}`);
    expect(unknown.status).toBe(404);
  });
});
