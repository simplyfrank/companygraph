import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { closeDriver } from "../src/neo4j/driver";
import { handleOperatorFunnels } from "../src/routes/analytics-operator";
import {
  seedOperatorRoot,
  resolveRootViaSeedTruth,
  createFunnel,
  createFunnelChain,
  cleanupNeo4j,
} from "./helpers/operator-fixtures";

// cross-function-exec-rollup T-05 (base) + T-14 (slice-fallback sub-case) —
// AC-07: /funnels returns operator-root funnels with stageCount +
// overallConversion = product of per-transition conversionRates, "n/a" for a
// zero/one-stage funnel or a branch; a retail Model #1 funnel is never
// returned (operator-root scope). T-14 sub-case: slice-fallback to modelId
// scope when zero funnels carry functionSeedKey.

const BASE = "http://127.0.0.1:8787";
const nodeIds: string[] = [];

beforeAll(async () => {
  await seedOperatorRoot(BASE);
});
afterEach(async () => {
  await cleanupNeo4j(nodeIds.splice(0));
});
afterAll(async () => {
  await closeDriver();
});

async function allFunnelNodeIds(prefix: string, chainLen: number): Promise<string[]> {
  const ids = [prefix];
  for (let i = 0; i <= chainLen; i++) ids.push(`${prefix}-c-s${i}`);
  return ids;
}

describe("integration: operator funnels", () => {
  test("AC-07 base: overallConversion = product of conversionRates; branch/one-stage → n/a; operator-root scope", async () => {
    const { rootId } = await resolveRootViaSeedTruth();
    expect(rootId).not.toBeNull();

    // A marked marketing funnel: 3 stages, rates 0.5 and 0.4 → 0.2 overall.
    nodeIds.push(...(await allFunnelNodeIds("op-fn-mkt", 2)));
    await createFunnel("op-fn-mkt", "Op Marketing Funnel", rootId!, "marketing");
    await createFunnelChain("op-fn-mkt", "op-fn-mkt-c", [0.5, 0.4]);

    // A one-stage funnel → "n/a".
    nodeIds.push("op-fn-single", "op-fn-single-c-s0");
    await createFunnel("op-fn-single", "Op Single Stage", rootId!, "marketing");
    await createFunnelChain("op-fn-single", "op-fn-single-c", []); // one stage, no transitions

    // A retail funnel with a DIFFERENT modelId → must NOT be returned.
    nodeIds.push("op-fn-retail");
    await createFunnel("op-fn-retail", "Retail Funnel", "some-other-model-id", "marketing");

    const res = await handleOperatorFunnels(
      new Request(`${BASE}/api/v1/analytics/operator/funnels?function=marketing`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      functions: Array<{ function: string; funnels: Array<{ funnel_id: string; stageCount: number; overallConversion: number | "n/a" }> }>;
    };
    const mkt = body.functions.find((f) => f.function === "marketing")!;
    const byId = new Map(mkt.funnels.map((f) => [f.funnel_id, f]));

    const multi = byId.get("op-fn-mkt");
    expect(multi).toBeDefined();
    expect(multi!.stageCount).toBe(3);
    expect(typeof multi!.overallConversion).toBe("number");
    expect(multi!.overallConversion as number).toBeCloseTo(0.2, 5);

    const single = byId.get("op-fn-single");
    expect(single).toBeDefined();
    expect(single!.overallConversion).toBe("n/a");

    // retail funnel excluded (operator-root scope)
    expect(byId.has("op-fn-retail")).toBe(false);
  });

  test("AC-07 slice-fallback (T-14/C-02): zero markers + ?function= → all operator funnels, unattributed []", async () => {
    const { rootId } = await resolveRootViaSeedTruth();
    // UNMARKED funnel under the operator root (no functionSeedKey).
    nodeIds.push(...(await allFunnelNodeIds("op-fn-unm", 1)));
    await createFunnel("op-fn-unm", "Op Unmarked Funnel", rootId!); // no seedKey
    await createFunnelChain("op-fn-unm", "op-fn-unm-c", [0.9]);

    const res = await handleOperatorFunnels(
      new Request(`${BASE}/api/v1/analytics/operator/funnels?function=sales`),
    );
    const body = (await res.json()) as {
      functions: Array<{ function: string; funnels: Array<{ funnel_id: string }> }>;
      unattributed: unknown[];
    };
    const sales = body.functions.find((f) => f.function === "sales")!;
    // degrade-to-modelId: the unmarked funnel surfaces under the slice
    expect(sales.funnels.map((f) => f.funnel_id)).toContain("op-fn-unm");
    // under a slice, unattributed is []
    expect(body.unattributed).toEqual([]);
  });

  test("AC-07: unmarked funnel surfaces under `unattributed` in the all-functions view", async () => {
    const { rootId } = await resolveRootViaSeedTruth();
    nodeIds.push(...(await allFunnelNodeIds("op-fn-unm2", 1)));
    await createFunnel("op-fn-unm2", "Op Unmarked 2", rootId!);
    await createFunnelChain("op-fn-unm2", "op-fn-unm2-c", [0.8]);

    const res = await handleOperatorFunnels(
      new Request(`${BASE}/api/v1/analytics/operator/funnels`),
    );
    const body = (await res.json()) as { unattributed: Array<{ funnel_id: string }> };
    // With no marked funnels present, unmarked funnels land in unattributed.
    expect(body.unattributed.map((f) => f.funnel_id)).toContain("op-fn-unm2");
  });
});
