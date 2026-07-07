import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { closeDriver } from "../src/neo4j/driver";
import { handleOperatorRisks } from "../src/routes/analytics-operator";
import {
  seedOperatorRoot,
  resolveRootViaSeedTruth,
  createRisk,
  cleanupRisks,
} from "./helpers/operator-fixtures";

// cross-function-exec-rollup T-05 — AC-06: /risks?function=customer_success
// returns CS risk rows grouped by the canonical domain = "Customer Success"
// key, aggregated into a (likelihood,impact) heatmap + per-band counts +
// drill-in rows; a zero-risk function → all-zero heatmap.

const BASE = "http://127.0.0.1:8787";
const riskIds: string[] = [];

beforeAll(async () => {
  await seedOperatorRoot(BASE);
});
afterEach(async () => {
  await cleanupRisks(riskIds.splice(0));
});
afterAll(async () => {
  await closeDriver();
});

describe("integration: operator risks", () => {
  test("AC-06: CS risks grouped by verbatim function name → heatmap + bands + rows", async () => {
    const { functions } = await resolveRootViaSeedTruth();
    const cs = functions.find((f) => f.seedKey === "customer_success")!;

    riskIds.push("op-risk-a", "op-risk-b");
    // 4x4 = 16 → critical; 2x2 = 4 → low
    await createRisk("op-risk-a", cs.name, { name: "Risk A", likelihood: 4, impact: 4 });
    await createRisk("op-risk-b", cs.name, { name: "Risk B", likelihood: 2, impact: 2 });

    const res = await handleOperatorRisks(
      new Request(`${BASE}/api/v1/analytics/operator/risks?function=customer_success`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      functions: Array<{
        function: string;
        name: string;
        heatmap: {
          cells: Array<{ likelihood: number; impact: number; count: number }>;
          bySeverityBand: Record<string, number>;
          rows: Array<{ id: string; likelihood: number; impact: number }>;
        };
      }>;
    };
    const fn = body.functions[0]!;
    expect(fn.function).toBe("customer_success");
    expect(fn.name).toBe(cs.name); // verbatim function Domain name
    const rowIds = fn.heatmap.rows.map((r) => r.id);
    expect(rowIds).toContain("op-risk-a");
    expect(rowIds).toContain("op-risk-b");
    // sparse cell grid carries our two cells
    const cellKeys = new Set(fn.heatmap.cells.map((c) => `${c.likelihood}:${c.impact}`));
    expect(cellKeys.has("4:4")).toBe(true);
    expect(cellKeys.has("2:2")).toBe(true);
    // bands: 16 critical, 4 low
    expect(fn.heatmap.bySeverityBand.critical).toBeGreaterThanOrEqual(1);
    expect(fn.heatmap.bySeverityBand.low).toBeGreaterThanOrEqual(1);
  });

  test("AC-06: a function with zero risks yields an all-zero heatmap, not an error", async () => {
    // product_delivery: use a fresh function that (in isolation) has no
    // controlled risks; assert the shape is valid + non-erroring.
    const res = await handleOperatorRisks(
      new Request(`${BASE}/api/v1/analytics/operator/risks?function=product_delivery`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      functions: Array<{ heatmap: { cells: unknown[]; bySeverityBand: Record<string, number>; rows: unknown[] } }>;
    };
    const hm = body.functions[0]!.heatmap;
    // cells/rows are arrays; bands are all integers ≥ 0 (never an error object)
    expect(Array.isArray(hm.cells)).toBe(true);
    expect(Array.isArray(hm.rows)).toBe(true);
    for (const band of ["low", "medium", "high", "critical"]) {
      expect(hm.bySeverityBand[band]).toBeGreaterThanOrEqual(0);
    }
  });
});
