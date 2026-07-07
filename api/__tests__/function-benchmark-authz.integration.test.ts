// function-benchmark-scoring T-08 / T-06 (AC-08) — authz mapping,
// determinism, isolation, empty-200 no-root.
//
// The dev stack runs a full-permission dev session (no real 401/403 unless
// ONELOGIN_ISSUER is set), so authz is asserted through the permission
// MAPPING (getRoutePermission / isPublicRoute, deterministic) — the same
// discipline kpi-impact-authz uses — plus a live 200 through the API.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver, _resetDriver } from "../src/neo4j/driver";
import { getRoutePermission, isPublicRoute } from "../src/auth/rbac-permissions";
import { computeBenchmarkReport } from "../src/storage/function-benchmark";
import { handleBenchmarkReport } from "../src/routes/analytics-benchmarks";
import {
  seedBenchmarkGraph,
  cleanupBenchmarkGraph,
  type SeedFunction,
} from "./helpers/function-benchmark-fixtures";

const ROUTE = "/api/v1/analytics/benchmarks/report";

const FUNCTIONS: SeedFunction[] = [
  {
    seedKey: "marketing",
    name: "Marketing",
    activities: [{ key: "m1", roles: 1, systemKinds: ["agentic"] }],
    kpis: [{ key: "k", measures: true, latestValue: 10, target_value: 5, target_direction: "higher_is_better" }],
  },
];

async function seedForeignModel(): Promise<void> {
  // A NON-operator model with a Domain carrying seedKey — must never be read.
  const session = getDriver().session({ defaultAccessMode: "WRITE" });
  try {
    await session.run(
      `CREATE (m:BusinessModel {id:'fbs-foreign-root', name:'Retail', attributes_json:'{}',
        createdAt:'2026-01-01', updatedAt:'2026-01-01'})
       CREATE (d:Domain {id:'fbs-foreign-dom', name:'Marketing',
        attributes_json:'{"seedKey":"marketing"}', createdAt:'2026-01-01', updatedAt:'2026-01-01'})
       CREATE (d)-[:IN_MODEL]->(m)`,
    );
  } finally {
    await session.close();
  }
}

describe("integration: function-benchmark authz + isolation + empty-200 (AC-08)", () => {
  beforeAll(async () => {
    await getDriver().verifyConnectivity();
    await seedBenchmarkGraph(getDriver(), FUNCTIONS);
    await seedForeignModel();
  });
  afterAll(async () => {
    await cleanupBenchmarkGraph(getDriver());
    const session = getDriver().session({ defaultAccessMode: "WRITE" });
    try {
      await session.run(`MATCH (n) WHERE n.id STARTS WITH 'fbs-foreign' DETACH DELETE n`);
    } finally {
      await session.close();
    }
    await closeDriver();
    _resetDriver();
  });

  test("route maps to analytics:read, never null; not public (403/200 gate)", () => {
    expect(getRoutePermission("GET", ROUTE)).toBe("analytics:read");
    expect(isPublicRoute("GET", ROUTE)).toBe(false);
  });

  test("route handler returns 200 with a zod-valid body (the gate admits analytics:read)", async () => {
    const res = await handleBenchmarkReport(new Request("http://x/api/v1/analytics/benchmarks/report"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { functions: unknown[]; meta: { functionCount: number } };
    expect(Array.isArray(body.functions)).toBe(true);
    expect(typeof body.meta.functionCount).toBe("number");
  });

  test("determinism: byte-identical repeat calls", async () => {
    const a = await computeBenchmarkReport(getDriver());
    const b = await computeBenchmarkReport(getDriver());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("isolation: only SaaS-Operator functions scored, no foreign model read", async () => {
    const report = await computeBenchmarkReport(getDriver());
    // Only the one operator function seeded — the foreign 'Retail' domain is excluded.
    expect(report.functions.map((f) => f.seedKey)).toEqual(["marketing"]);
    expect(report.functions.length).toBe(1);
  });

  test("empty-200: no operator root → 200 {functionCount:0, modelId:null}", async () => {
    // Remove the operator root; the foreign model remains (must not be picked up).
    await cleanupBenchmarkGraph(getDriver());
    const report = await computeBenchmarkReport(getDriver());
    expect(report.functions).toEqual([]);
    expect(report.meta.functionCount).toBe(0);
    expect(report.meta.modelId).toBeNull();
    // Re-seed so afterAll cleanup + other assertions stay consistent.
    await seedBenchmarkGraph(getDriver(), FUNCTIONS);
  });
});
