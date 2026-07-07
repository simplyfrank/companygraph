import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { getDriver, closeDriver } from "../src/neo4j/driver";
import {
  handleOperatorOverview,
  resolveOperatorFunctions,
} from "../src/routes/analytics-operator";
import {
  seedOperatorRoot,
  resolveRootViaSeedTruth,
  createRisk,
  cleanupRisks,
} from "./helpers/operator-fixtures";

// cross-function-exec-rollup T-05 — closes AC-01 (overview per-function rows,
// no-hardcoded-id, all-zero empty row) + the T-02 resolver DoD gate (N-03:
// resolveOperatorFunctions returns non-null rootId + six rows against the
// as-built foundation seed property names). Every describe is prefixed
// "integration: " (test-integration.sh selects by ^integration:).

const BASE = "http://127.0.0.1:8787";
const createdRiskIds: string[] = [];

beforeAll(async () => {
  await seedOperatorRoot(BASE);
});

afterEach(async () => {
  await cleanupRisks(createdRiskIds.splice(0));
});

afterAll(async () => {
  await closeDriver();
});

describe("integration: operator overview + resolver DoD", () => {
  test("resolver DoD (N-03): resolveOperatorFunctions returns non-null rootId + six function rows", async () => {
    const session = getDriver().session({ defaultAccessMode: "READ" });
    try {
      const resolved = await resolveOperatorFunctions(session);
      expect(resolved.rootId).not.toBeNull();
      const seedKeys = resolved.functions.map((f) => f.seedKey).sort();
      expect(seedKeys).toEqual(
        [
          "customer_success",
          "finance_accounting",
          "marketing",
          "platform_ops",
          "product_delivery",
          "sales",
        ].sort(),
      );
      // every function row carries a name + a domainId
      for (const fn of resolved.functions) {
        expect(fn.name.length).toBeGreaterThan(0);
        expect(fn.domainId.length).toBeGreaterThan(0);
      }
    } finally {
      await session.close();
    }
  });

  test("AC-01: /overview (no slice) returns a row per resolved function, root resolved by lookup", async () => {
    const res = await handleOperatorOverview(
      new Request(`${BASE}/api/v1/analytics/operator/overview`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      saasOperatorRoot: string;
      functions: Array<Record<string, unknown>>;
    };
    // root resolved (no hard-coded id — matches the resolver output)
    expect(body.saasOperatorRoot.length).toBeGreaterThan(0);
    expect(body.functions.length).toBe(6);
    for (const row of body.functions) {
      // each row carries the four signal summaries (or an { error } shape)
      expect(row).toHaveProperty("kpiHealth");
      expect(row).toHaveProperty("riskHeatmap");
      expect(row).toHaveProperty("funnelCount");
      expect(row).toHaveProperty("slaHealth");
    }
  });

  test("AC-01: a function's risk band count reflects controlled seeded risks (best-effort per signal)", async () => {
    const { functions } = await resolveRootViaSeedTruth();
    const cs = functions.find((f) => f.seedKey === "customer_success");
    expect(cs).toBeDefined();
    // one critical risk (5x5=25), one medium (2x3=6)
    createdRiskIds.push("op-ov-risk-crit", "op-ov-risk-med");
    await createRisk("op-ov-risk-crit", cs!.name, {
      name: "Overview critical", likelihood: 5, impact: 5,
    });
    await createRisk("op-ov-risk-med", cs!.name, {
      name: "Overview medium", likelihood: 2, impact: 3,
    });

    const res = await handleOperatorOverview(
      new Request(`${BASE}/api/v1/analytics/operator/overview?function=customer_success`),
    );
    const body = (await res.json()) as {
      functions: Array<{ function: string; riskHeatmap: Record<string, number> | { error: true } }>;
    };
    const row = body.functions.find((f) => f.function === "customer_success")!;
    expect(row.riskHeatmap).not.toHaveProperty("error");
    const bands = row.riskHeatmap as Record<string, number>;
    // controlled additions must appear (there may be other pre-seeded CS risks,
    // so assert >= our contribution)
    expect(bands.critical).toBeGreaterThanOrEqual(1);
    expect(bands.medium).toBeGreaterThanOrEqual(1);
  });
});
