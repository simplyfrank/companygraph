// product-delivery-process-model T-10 (design §5, §5.7, §9 — OQ-3) — the
// `bun run seed:product-delivery` CLI entrypoint. Sibling to
// api/scripts/seed-saas-operator.ts and api/scripts/seed-saas-metric-library.ts
// (neither edited — the foundation loader discovers product-delivery.json by
// directory scan; XD-05/NFR-03).
//
// Fixed order (design §5.7), each step fail-fast; every write is
// lookup-before-create so a re-run is net-zero (NFR-02):
//   resolveContext (fail loud if a dependency is unseeded) → assertFixtureLoaded
//   → roles+EXECUTES (resolve-or-create) → cross-ref edges → KPIs → MEASURES →
//   ALIGNED_TO → stories/ACs → DDD → risks.

import { closeDriver } from "../src/neo4j/driver";
import { loadEnv } from "../src/env";
import {
  resolveContext,
  assertFixtureLoaded,
  assertAlignTargetsResolvable,
} from "../src/seed/product-delivery/context";
import {
  writeRolesAndExecutes,
  writeCrossRefEdges,
  createKpis,
  linkKpiMetrics,
  alignKpis,
  writeStories,
  writeDddMapping,
  writeRisks,
} from "../src/seed/product-delivery/steps";

export interface ProductDeliverySeedResult {
  rootId: string;
  domainId: string;
  kpiIds: Record<string, string>;
  storyIds: string[];
  capabilityIds: string[];
  riskIds: string[];
}

export async function seedProductDeliveryContent(
  baseUrl: string,
): Promise<ProductDeliverySeedResult> {
  const context = await resolveContext(baseUrl); // fail loud on missing preconditions (FR-01)
  assertFixtureLoaded(context); // §5.7 step 2 — run seed:saas-operator first
  assertAlignTargetsResolvable(context);

  const roleIdByName = await writeRolesAndExecutes(baseUrl, context); // resolve-or-create SWE + its EXECUTES
  await writeCrossRefEdges(baseUrl, context); // journey→domain PART_OF, activity→shared-system USES_SYSTEM

  const kpiIds = await createKpis(baseUrl, context); // all four KPIs (XD-10 depth)
  await linkKpiMetrics(baseUrl, context, kpiIds); // MEASURES (today: Release Frequency only)
  await alignKpis(baseUrl, context, kpiIds); // ALIGNED_TO

  const storyIds = await writeStories(baseUrl, context, roleIdByName); // stories + ACs
  const capabilityIds = await writeDddMapping(baseUrl, context); // bounded context + capabilities + arms
  const riskIds = await writeRisks(baseUrl, context); // risks

  return {
    rootId: context.rootId,
    domainId: context.domainId,
    kpiIds,
    storyIds,
    capabilityIds,
    riskIds,
  };
}

export async function seedProductDelivery(base?: string): Promise<void> {
  const env = loadEnv();
  const apiBase = base ?? `http://${env.host}:${env.apiPort}`;
  const result = await seedProductDeliveryContent(apiBase);
  console.log(
    `[seed:product-delivery] domain: ${result.domainId}; ` +
      `KPIs ${Object.keys(result.kpiIds).length}, stories ${result.storyIds.length}, ` +
      `capabilities ${result.capabilityIds.length}, risks ${result.riskIds.length}`,
  );
}

if (import.meta.main) {
  seedProductDelivery()
    .then(() => closeDriver())
    .then(() => process.exit(0))
    .catch(async (e) => {
      console.error("[seed:product-delivery] failed:", e);
      await closeDriver().catch(() => {});
      process.exit(1);
    });
}
