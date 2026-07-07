// saas-metric-library T-05 (design §5.4, §7 — OQ-4 ii; FR-05, FR-06, NFR-02;
// AC-06, AC-07, AC-08 real-fixture half). The `bun run seed:saas-metric-library`
// CLI entrypoint — a SELF-OWNED register-then-import step, sibling to
// api/scripts/seed-saas-operator.ts (which is NOT edited, NFR-06).
//
// Step (a) — ensure registry (always): ensureMetricDefinitionLabel →
// ensureMeasuresEdgeType. Both idempotent, so a re-run is a clean no-op (AC-07).
// Step (b) — import the metric fixture via POST /api/v1/import (realImport).
//
// Ordering (Rule B, N-02'): step (a) MUST precede step (b) — realImport runs a
// per-row registry attribute check, so the MetricDefinition label must be
// registered before its node rows are imported. The fixture lives at the
// FEATURE-OWNED path shared/seed/saas-metric-library/metrics.json, deliberately
// NOT in shared/seed/saas-operator/ (the foundation loader must not pick it up
// before this step's registration runs).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeDriver } from "../src/neo4j/driver";
import { loadEnv } from "../src/env";
import { ensureMetricDefinitionLabel } from "../src/seed/ensure-metric-label";
import { ensureMeasuresEdgeType } from "../src/seed/ensure-measures-edge";

export interface MetricSeedResult {
  importedNodes: number;
  importedEdges: number;
}

export async function seedSaasMetricLibrary(base?: string): Promise<MetricSeedResult> {
  const env = loadEnv();
  const apiBase = base ?? `http://${env.host}:${env.apiPort}`;

  // Step (a) — ensure the runtime registry (label first, then edge type).
  await ensureMetricDefinitionLabel(apiBase);
  await ensureMeasuresEdgeType(apiBase);

  // Step (b) — import the metric-node fixture (register-before-import).
  const fixture = readFileSync(
    resolve(import.meta.dir, "../../shared/seed/saas-metric-library/metrics.json"),
    "utf8",
  );
  const res = await fetch(`${apiBase}/api/v1/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: fixture,
  });
  const json = (await res.json()) as {
    imported?: { nodes: number; edges: number };
    errors?: unknown[];
    error?: { code?: string };
  };
  // A 409 model_lifecycle_route_required means a malformed fixture carrying a
  // lifecycle row (AC-08). Any non-2xx is surfaced as a script failure.
  if (!res.ok) {
    throw new Error(
      `seed:saas-metric-library: POST /api/v1/import → ${res.status} ${JSON.stringify(json)}`,
    );
  }
  // realImport returns 200 even with per-row errors[]; a row failure is a
  // malformed fixture → fail loudly.
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    throw new Error(
      `seed:saas-metric-library: import reported row errors: ${JSON.stringify(json.errors)}`,
    );
  }

  return {
    importedNodes: json.imported?.nodes ?? 0,
    importedEdges: json.imported?.edges ?? 0,
  };
}

if (import.meta.main) {
  seedSaasMetricLibrary()
    .then((r) => {
      console.log(
        `[seed:saas-metric-library] imported ${r.importedNodes} MetricDefinition nodes, ${r.importedEdges} edges`,
      );
      return closeDriver();
    })
    .then(() => process.exit(0))
    .catch(async (e) => {
      console.error("[seed:saas-metric-library] failed:", e);
      await closeDriver().catch(() => {});
      process.exit(1);
    });
}
