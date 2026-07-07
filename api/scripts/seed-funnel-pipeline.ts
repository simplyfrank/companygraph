// funnel-pipeline-modeling T-12 (design §4.1, §7 — FR-01..FR-04, FR-06a, NFR-03;
// register-before-use, Risk #5). The `bun run seed:funnel-pipeline` CLI
// entrypoint — a SELF-OWNED register step, sibling to
// api/scripts/seed-saas-operator.ts (which is NOT edited).
//
// Calls ensureFunnelOntology(baseUrl) (T-01) so the four constructs — the Funnel
// + Stage runtime labels and the HAS_STAGE + CONVERTS_TO runtime edge types — are
// registered idempotently (get-then-create guard, B-03) BEFORE any content-wave-2
// marketing/sales seed loads. It seeds NO funnel instances (those are
// content-spec-owned).

import { closeDriver } from "../src/neo4j/driver";
import { loadEnv } from "../src/env";
import { ensureFunnelOntology } from "../src/seed/ensure-funnel-ontology";

export async function seedFunnelPipeline(base?: string): Promise<void> {
  const env = loadEnv();
  const apiBase = base ?? `http://${env.host}:${env.apiPort}`;
  await ensureFunnelOntology(apiBase);
}

if (import.meta.main) {
  seedFunnelPipeline()
    .then(() => {
      console.log(
        "[seed:funnel-pipeline] registered Funnel + Stage labels and HAS_STAGE + CONVERTS_TO edge types (idempotent)",
      );
      return closeDriver();
    })
    .then(() => process.exit(0))
    .catch(async (e) => {
      console.error("[seed:funnel-pipeline] failed:", e);
      await closeDriver().catch(() => {});
      process.exit(1);
    });
}
