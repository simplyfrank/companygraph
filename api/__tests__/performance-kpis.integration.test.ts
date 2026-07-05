import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { generateId } from "../src/ids";
import { handlePerformanceKpis } from "../src/routes/performance";

// kpi-okr-performance-dashboards T-07 — closes AC-01 (status end-to-end),
// AC-02 (domain/journey slice narrowing) and AC-14 (query-count
// invariant).
//
// Fixture rules (DEC-03 / requirements Risk 7): measurements are seeded
// as :KPIMeasurement NODES via the production getDriver() singleton
// (kpi-okr-governance design §3.4 — the label has no REST write path).
// NEVER through POST /api/v1/kpi-measurements — that writes Postgres,
// which this endpoint does not read.
//
// AC-14 mechanics (Resolves: B-01 (rev-3)): the behavior legs go over
// HTTP against 127.0.0.1:8787 (house pattern); the query-count leg does
// NOT — the server is a separate process and a spy installed here can
// never observe its sessions (it would pass vacuously, 0 ≤ 2). The count
// leg imports handlePerformanceKpis and invokes it IN the test process,
// where the module-singleton getDriver() is genuinely shared, wrapping
// the singleton driver's `session` factory and summing the captured
// sessions' `run` calls. The in-process call bypasses the router auth
// gate — acceptable: this leg asserts query shape, not authz (T-06 pins
// RBAC). The zero-Postgres proof is the static import assertion in
// performance-no-postgres-import.test.ts, not a `pg` spy.

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

interface KpiFixture {
  target_value?: number;
  target_direction?: string;
  warning_threshold?: number | null;
  critical_threshold?: number | null;
  domain_id?: string | null;
}

// KPIs are created via the governed REST write path (POST /kpis).
async function createKpi(fixture: KpiFixture = {}): Promise<string> {
  const res = await fetch(`${API_BASE}/kpis`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: `perf-fixture-${generateId()}`,
      category: "efficiency",
      unit: "%",
      target_value: fixture.target_value ?? 100,
      target_direction: fixture.target_direction ?? "higher_is_better",
      ...(fixture.warning_threshold != null ? { warning_threshold: fixture.warning_threshold } : {}),
      ...(fixture.critical_threshold != null ? { critical_threshold: fixture.critical_threshold } : {}),
      ...(fixture.domain_id ? { domain_id: fixture.domain_id } : {}),
      measurement_frequency: "daily",
    }),
  });
  expect(res.status).toBe(200); // pinned as-built: 200, not 201
  const body = (await res.json()) as { id: string };
  cleanupNodeIds.push(body.id);
  return body.id;
}

// Direct-driver :KPIMeasurement seeding (kpi-okr-governance §3.4 pattern).
async function seedMeasurement(kpiId: string, value: number, daysAgo = 1): Promise<void> {
  const id = generateId();
  cleanupNodeIds.push(id);
  await runWrite(
    `CREATE (:KPIMeasurement {id: $id, kpi_id: $kpiId, measured_at: $measuredAt, value: $value})`,
    { id, kpiId, measuredAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(), value },
  );
}

async function createNode(label: string, name: string): Promise<string> {
  const id = generateId();
  cleanupNodeIds.push(id);
  await runWrite(
    `CREATE (:\`${label}\` {id: $id, name: $name, description: "perf fixture", attributes_json: "{}", createdAt: $now, updatedAt: $now})`,
    { id, name, now: new Date().toISOString() },
  );
  return id;
}

async function createEdge(fromId: string, type: string, toId: string): Promise<void> {
  await runWrite(
    `MATCH (a {id: $fromId}), (b {id: $toId}) CREATE (a)-[:\`${type}\` {id: $edgeId}]->(b)`,
    { fromId, toId, edgeId: generateId() },
  );
}

interface KpiRow {
  kpi_id: string;
  name: string;
  unit: string | null;
  target_value: number | null;
  target_direction: string | null;
  latest_value: number | null;
  latest_measured_at: string | null;
  status: string;
}

async function getRows(query = ""): Promise<KpiRow[]> {
  const res = await fetch(`${API_BASE}/analytics/performance/kpis${query}`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { rows: KpiRow[] };
  expect(Array.isArray(body.rows)).toBe(true);
  return body.rows;
}

function statusOf(rows: KpiRow[], kpiId: string): string | undefined {
  return rows.find((r) => r.kpi_id === kpiId)?.status;
}

afterAll(async () => {
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    if (cleanupNodeIds.length > 0) {
      await session.run(`MATCH (n) WHERE n.id IN $ids DETACH DELETE n`, { ids: cleanupNodeIds });
    }
  } finally {
    await session.close();
    await closeDriver();
    _resetDriver();
  }
});

describe("integration: performance kpis (AC-01 status end-to-end)", () => {
  test("higher_is_better boundaries: on_target / warning / breach / no_data", async () => {
    const onTarget = await createKpi({ warning_threshold: 90, critical_threshold: 80 });
    const warning = await createKpi({ warning_threshold: 90, critical_threshold: 80 });
    const breach = await createKpi({ warning_threshold: 90, critical_threshold: 80 });
    const noData = await createKpi({ warning_threshold: 90, critical_threshold: 80 });
    await seedMeasurement(onTarget, 100);
    await seedMeasurement(warning, 85);
    await seedMeasurement(breach, 79);
    // noData: deliberately no :KPIMeasurement node.

    const rows = await getRows();
    expect(statusOf(rows, onTarget)).toBe("on_target");
    expect(statusOf(rows, warning)).toBe("warning");
    expect(statusOf(rows, breach)).toBe("breach");
    expect(statusOf(rows, noData)).toBe("no_data");
  });

  test("lower_is_better mirror boundaries", async () => {
    const mk = () =>
      createKpi({
        target_direction: "lower_is_better",
        warning_threshold: 110,
        critical_threshold: 120,
      });
    const onTarget = await mk();
    const warning = await mk();
    const breach = await mk();
    await seedMeasurement(onTarget, 100);
    await seedMeasurement(warning, 115);
    await seedMeasurement(breach, 121);

    const rows = await getRows();
    expect(statusOf(rows, onTarget)).toBe("on_target");
    expect(statusOf(rows, warning)).toBe("warning");
    expect(statusOf(rows, breach)).toBe("breach");
  });

  test("target_is_exact: exact equality + absolute deviation bands (N-02)", async () => {
    const mk = () =>
      createKpi({
        target_direction: "target_is_exact",
        warning_threshold: 5,
        critical_threshold: 10,
      });
    const onTarget = await mk();
    const warning = await mk();
    const breach = await mk();
    await seedMeasurement(onTarget, 100);
    await seedMeasurement(warning, 106);
    await seedMeasurement(breach, 111);

    const rows = await getRows();
    expect(statusOf(rows, onTarget)).toBe("on_target");
    expect(statusOf(rows, warning)).toBe("warning");
    expect(statusOf(rows, breach)).toBe("breach");
  });

  test("latest measurement wins (ISO-8601 string ordering) and is surfaced as latest_value/latest_measured_at", async () => {
    const kpi = await createKpi({ warning_threshold: 90, critical_threshold: 80 });
    await seedMeasurement(kpi, 50, 10); // older breach value
    await seedMeasurement(kpi, 100, 1); // newest on-target value

    const rows = await getRows();
    const row = rows.find((r) => r.kpi_id === kpi);
    expect(row?.status).toBe("on_target");
    expect(row?.latest_value).toBe(100);
    expect(typeof row?.latest_measured_at).toBe("string");
  });
});

describe("integration: performance kpis (AC-02 slice narrowing)", () => {
  test("?domain narrows via ALIGNED_TO path; ?journey via ALIGNED_TO; filters intersect", async () => {
    const domainId = await createNode("Domain", `perf-domain-${generateId()}`);
    const journeyId = await createNode("UserJourney", `perf-journey-${generateId()}`);
    await createEdge(journeyId, "PART_OF", domainId);

    // kpi-measurement-alignment FR-04: domain filter uses ALIGNED_TO only
    // (flat domain_id property is no longer read).
    const alignedKpi = await createKpi({}); // null domain_id + ALIGNED_TO path
    await createEdge(alignedKpi, "ALIGNED_TO", journeyId);
    const outsider = await createKpi({});

    const byDomain = await getRows(`?domain=${domainId}`);
    expect(statusOf(byDomain, alignedKpi)).toBeDefined(); // via ALIGNED_TO→journey→PART_OF→domain
    expect(statusOf(byDomain, outsider)).toBeUndefined();

    const byJourney = await getRows(`?journey=${journeyId}`);
    expect(statusOf(byJourney, alignedKpi)).toBeDefined();
    expect(statusOf(byJourney, outsider)).toBeUndefined();

    const combined = await getRows(`?domain=${domainId}&journey=${journeyId}`);
    expect(statusOf(combined, alignedKpi)).toBeDefined(); // intersection
  });

  test("unknown well-formed domain id → {rows:[]} (200, not 404)", async () => {
    const rows = await getRows(`?domain=${generateId()}`);
    expect(rows).toEqual([]);
  });

  test("malformed domain → standard 400 envelope (AC-06)", async () => {
    const res = await fetch(`${API_BASE}/analytics/performance/kpis?domain=not-a-uuid`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    expect(typeof body.error?.code).toBe("string");
    expect(typeof body.error?.message).toBe("string");
  });
});

// ── AC-14 query-count leg — IN-PROCESS (Resolves: B-01 (rev-3)) ─────────

type SessionFactory = (...args: unknown[]) => { run: (...a: unknown[]) => unknown };

function installSessionSpy(): { runCount: () => number; restore: () => void } {
  const driver = getDriver();
  const proto = driver as unknown as Record<string, unknown>;
  const original = driver.session.bind(driver) as SessionFactory;
  let count = 0;
  // Own-property shadow over the prototype method; `delete` restores it.
  proto.session = (...args: unknown[]) => {
    const session = original(...args);
    const originalRun = session.run.bind(session);
    (session as Record<string, unknown>).run = (...runArgs: unknown[]) => {
      count += 1;
      return originalRun(...runArgs);
    };
    return session;
  };
  return {
    runCount: () => count,
    restore: () => {
      delete proto.session;
    },
  };
}

describe("integration: performance kpis (AC-14 round-trip budget, in-process)", () => {
  let spy: ReturnType<typeof installSessionSpy> | null = null;

  afterEach(() => {
    spy?.restore();
    spy = null;
  });

  async function invokeAndCount(query: string): Promise<number> {
    // Snapshot-delta form: the wrap is installed after fixture seeding,
    // and each invocation is measured against the pre-call count.
    if (!spy) spy = installSessionSpy();
    const before = spy.runCount();
    const res = await handlePerformanceKpis(
      new Request(`http://127.0.0.1:8787/api/v1/analytics/performance/kpis${query}`),
    );
    expect(res.status).toBe(200);
    return spy.runCount() - before;
  }

  test("≤ 2 Neo4j round trips per invocation; 50-KPI and 5-KPI slices cost the same", async () => {
    // Batch fixtures directly through the driver (fast; archived_at
    // absent ⇒ `k.archived_at IS NULL` matches).
    const bigDomain = generateId();
    const smallDomain = generateId();
    const now = new Date().toISOString();
    const mkKpis = (n: number, domainId: string) =>
      Array.from({ length: n }, (_, i) => {
        const id = generateId();
        cleanupNodeIds.push(id);
        return {
          id,
          name: `perf-count-${domainId.slice(0, 8)}-${i}`,
          domain_id: domainId,
        };
      });
    await runWrite(
      `UNWIND $rows AS row
       CREATE (:KPI {id: row.id, name: row.name, domain_id: row.domain_id,
                     unit: "%", target_value: 100, target_direction: "higher_is_better",
                     created_at: $now, updated_at: $now})`,
      { rows: [...mkKpis(50, bigDomain), ...mkKpis(5, smallDomain)], now },
    );

    const bigCount = await invokeAndCount(`?domain=${bigDomain}`);
    const smallCount = await invokeAndCount(`?domain=${smallDomain}`);

    expect(bigCount).toBeLessThanOrEqual(2);
    expect(smallCount).toBeLessThanOrEqual(2);
    expect(bigCount).toBeGreaterThan(0); // spy is live, not vacuous
    expect(bigCount).toBe(smallCount); // no per-KPI growth
  });

  test("empty slice short-circuits Read 2 (≤ 2 still holds; no wasted trip)", async () => {
    const count = await invokeAndCount(`?domain=${generateId()}`);
    expect(count).toBe(1); // empty id set from Read 1 → no Read 2 issued
  });
});
