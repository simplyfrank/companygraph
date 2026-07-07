import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import type { Driver } from "neo4j-driver";
import { getDriver, closeDriver } from "../src/neo4j/driver";
import {
  handleOperatorKpis,
  handleOperatorRisks,
  handleOperatorFunnels,
  handleOperatorSlas,
  handleOperatorOverview,
} from "../src/routes/analytics-operator";
import {
  seedOperatorRoot,
  resolveRootViaSeedTruth,
  createKpiForDomain,
  createMeasurement,
  createFunnel,
  createFunnelChain,
  createSla,
  createRisk,
  cleanupNeo4j,
  cleanupRisks,
} from "./helpers/operator-fixtures";

// cross-function-exec-rollup T-08 — closes AC-04 (KPI batched ≤2-RT leg) +
// AC-04a (per-entity query-count invariant for every aggregate + overview).
//
// In-process count legs (Resolves: the cross-process-vacuity trap): the
// handlers are invoked IN this process, where the module-singleton
// getDriver() is genuinely shared. We wrap the singleton driver's `session`
// factory and sum the returned sessions' `run` counts — never a naked
// per-session spy. The invariant asserted is against ENTITY count (1 vs 20
// rows per function), NOT function count (the risk signal is honestly ≤6
// Neo4j-independent Response round-trips, one per function).

const BASE = "http://127.0.0.1:8787";
const nodeIds: string[] = [];
const riskIds: string[] = [];

let runCount = 0;
let origSession: Driver["session"] | null = null;

function installWrap(): void {
  const driver = getDriver();
  origSession = driver.session.bind(driver);
  (driver as { session: Driver["session"] }).session = ((...args: Parameters<Driver["session"]>) => {
    const s = origSession!(...args);
    const origRun = s.run.bind(s);
    (s as { run: typeof s.run }).run = ((...rargs: Parameters<typeof s.run>) => {
      runCount += 1;
      return origRun(...rargs);
    }) as typeof s.run;
    return s;
  }) as Driver["session"];
}

function restoreWrap(): void {
  if (origSession) {
    (getDriver() as { session: Driver["session"] }).session = origSession;
    origSession = null;
  }
}

beforeAll(async () => {
  await seedOperatorRoot(BASE);
});
afterEach(async () => {
  restoreWrap();
  await cleanupNeo4j(nodeIds.splice(0));
  await cleanupRisks(riskIds.splice(0));
});
afterAll(async () => {
  await closeDriver();
});

async function countRuns(fn: () => Promise<Response>): Promise<number> {
  runCount = 0;
  installWrap();
  try {
    const res = await fn();
    expect(res.status).toBe(200);
  } finally {
    restoreWrap();
  }
  return runCount;
}

describe("integration: operator query count", () => {
  test("AC-04: /kpis batched — 1-KPI and 20-KPI fixtures yield the same (≤2) Neo4j round trips", async () => {
    const { functions } = await resolveRootViaSeedTruth();
    const fin = functions.find((f) => f.seedKey === "finance_accounting")!;

    // 1-KPI fixture
    nodeIds.push("qc-kpi-0", "qc-kpi-0-m");
    await createKpiForDomain("qc-kpi-0", fin.domainId, { name: "QC KPI 0", target_value: 100 });
    await createMeasurement("qc-kpi-0", "qc-kpi-0-m", 90, "2026-07-01T00:00:00.000Z");
    const c1 = await countRuns(() =>
      handleOperatorKpis(new Request(`${BASE}/api/v1/analytics/operator/kpis?function=finance_accounting`)),
    );
    expect(c1).toBeLessThanOrEqual(3); // resolver(1) + Read1(1) + Read2(1)

    // scale to 20 KPIs
    for (let i = 1; i < 20; i++) {
      nodeIds.push(`qc-kpi-${i}`, `qc-kpi-${i}-m`);
      await createKpiForDomain(`qc-kpi-${i}`, fin.domainId, { name: `QC KPI ${i}`, target_value: 100 });
      await createMeasurement(`qc-kpi-${i}`, `qc-kpi-${i}-m`, 90, "2026-07-01T00:00:00.000Z");
    }
    const c20 = await countRuns(() =>
      handleOperatorKpis(new Request(`${BASE}/api/v1/analytics/operator/kpis?function=finance_accounting`)),
    );
    // invariant against KPI count
    expect(c20).toBe(c1);
  });

  test("AC-04a: /funnels round-trip count is invariant against funnel count", async () => {
    const { rootId } = await resolveRootViaSeedTruth();
    nodeIds.push("qc-fn-0", "qc-fn-0-c-s0", "qc-fn-0-c-s1");
    await createFunnel("qc-fn-0", "QC Funnel 0", rootId!, "marketing");
    await createFunnelChain("qc-fn-0", "qc-fn-0-c", [0.5]);
    const c1 = await countRuns(() =>
      handleOperatorFunnels(new Request(`${BASE}/api/v1/analytics/operator/funnels?function=marketing`)),
    );

    for (let i = 1; i < 20; i++) {
      nodeIds.push(`qc-fn-${i}`, `qc-fn-${i}-c-s0`, `qc-fn-${i}-c-s1`);
      await createFunnel(`qc-fn-${i}`, `QC Funnel ${i}`, rootId!, "marketing");
      await createFunnelChain(`qc-fn-${i}`, `qc-fn-${i}-c`, [0.5]);
    }
    const c20 = await countRuns(() =>
      handleOperatorFunnels(new Request(`${BASE}/api/v1/analytics/operator/funnels?function=marketing`)),
    );
    expect(c20).toBe(c1);
  });

  test("AC-04a: /slas round-trip count is invariant against SLA count", async () => {
    const { functions } = await resolveRootViaSeedTruth();
    const cs = functions.find((f) => f.seedKey === "customer_success")!;
    nodeIds.push("qc-sla-0");
    await createSla("qc-sla-0", "QC SLA 0", cs.domainId);
    const c1 = await countRuns(() =>
      handleOperatorSlas(new Request(`${BASE}/api/v1/analytics/operator/slas?function=customer_success`)),
    );

    for (let i = 1; i < 20; i++) {
      nodeIds.push(`qc-sla-${i}`);
      await createSla(`qc-sla-${i}`, `QC SLA ${i}`, cs.domainId);
    }
    const c20 = await countRuns(() =>
      handleOperatorSlas(new Request(`${BASE}/api/v1/analytics/operator/slas?function=customer_success`)),
    );
    expect(c20).toBe(c1);
  });

  test("AC-04a: /overview round-trip count is invariant against entity count", async () => {
    const { functions } = await resolveRootViaSeedTruth();
    const cs = functions.find((f) => f.seedKey === "customer_success")!;
    // baseline
    nodeIds.push("qc-ov-sla-0");
    await createSla("qc-ov-sla-0", "QC OV SLA 0", cs.domainId);
    riskIds.push("qc-ov-risk-0");
    await createRisk("qc-ov-risk-0", cs.name, { name: "QC OV Risk 0", likelihood: 3, impact: 3 });
    const c1 = await countRuns(() =>
      handleOperatorOverview(new Request(`${BASE}/api/v1/analytics/operator/overview`)),
    );

    // scale SLAs + risks per function up
    for (let i = 1; i < 20; i++) {
      nodeIds.push(`qc-ov-sla-${i}`);
      await createSla(`qc-ov-sla-${i}`, `QC OV SLA ${i}`, cs.domainId);
      riskIds.push(`qc-ov-risk-${i}`);
      await createRisk(`qc-ov-risk-${i}`, cs.name, { name: `QC OV Risk ${i}`, likelihood: 3, impact: 3 });
    }
    const c20 = await countRuns(() =>
      handleOperatorOverview(new Request(`${BASE}/api/v1/analytics/operator/overview`)),
    );
    // Neo4j round trips invariant against per-entity count (risk uses the
    // governed pg handler, ≤6 Response round-trips by function count — not
    // counted here as Neo4j sessions).
    expect(c20).toBe(c1);
  });
});
