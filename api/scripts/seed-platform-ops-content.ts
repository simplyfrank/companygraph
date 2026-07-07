// platform-ops-process-model T-08 (design §4.0, §6, §7) — the
// `bun run seed:platform-ops` CLI entrypoint. Sibling to
// api/scripts/seed-saas-operator.ts and api/scripts/seed-saas-metric-library.ts
// (neither of which is edited — the foundation loader discovers
// platform-ops.json by directory scan; XD-04/NFR-03).
//
// Sequence (all lookup-before-create, so a re-run is net-zero, AC-06):
//   resolveHandles (fail loud if seed:saas-operator / seed:saas-metric-library
//   has not run — C-04) → loadPlatformOpsFixture → cross-boundary edges → KPIs
//   /MEASURES/ALIGNED_TO → risks/SLAs → stories/ACs → capabilities.

import { closeDriver } from "../src/neo4j/driver";
import { loadEnv } from "../src/env";
import { seedPlatformOpsContent } from "../src/seed/platform-ops-content";

export async function seedPlatformOps(base?: string): Promise<void> {
  const env = loadEnv();
  const apiBase = base ?? `http://${env.host}:${env.apiPort}`;
  const result = await seedPlatformOpsContent(apiBase);
  console.log(
    `[seed:platform-ops] domain: ${result.domainId}; KPIs ${Object.keys(result.kpiIds).length}, ` +
      `risks ${result.riskIds.length}, SLAs ${result.slaIds.length}, ` +
      `stories ${result.storyIds.length}, capabilities ${result.capabilityIds.length}`,
  );
}

if (import.meta.main) {
  seedPlatformOps()
    .then(() => closeDriver())
    .then(() => process.exit(0))
    .catch(async (e) => {
      console.error("[seed:platform-ops] failed:", e);
      await closeDriver().catch(() => {});
      process.exit(1);
    });
}
