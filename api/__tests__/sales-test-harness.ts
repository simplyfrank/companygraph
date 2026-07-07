// sales-process-model — shared integration-test harness (NOT a *.test.ts, so it
// is not collected as a suite). Runs the full seed chain and reports whether the
// funnel subsystem (funnel-pipeline-modeling) is executed. Because seed:sales
// fails loud on an absent funnel subsystem (design B-01 / AC-16), the sales
// content tests can only assert their seeded subgraph once that dependency is
// unblocked; until then `salesSeedReady()` returns false and each suite logs a
// loud skip. Requires the loopback stack up.
//
// funnel-pipeline-modeling has now shipped, so the harness registers the funnel
// ontology (Funnel/Stage labels + HAS_STAGE/CONVERTS_TO edge types) via the
// funnel-owned seed step BEFORE seed:sales — the §7 seed order. This flips
// seed:sales's funnel step (T-06) and the funnel-gated ACs from a loud skip to
// asserting, mirroring the marketing sibling harness. seed:funnel-pipeline is
// imported read-only (Rule E — never edited) and seeds no funnel instances.

import { seedSaasOperator } from "../scripts/seed-saas-operator";
import { seedSaasMetricLibrary } from "../scripts/seed-saas-metric-library";
import { seedFunnelPipeline } from "../scripts/seed-funnel-pipeline";
import { seedSales } from "../scripts/seed-sales";

export const BASE = "http://127.0.0.1:8787";

export async function cypher(statement: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${BASE}/api/v1/query/cypher`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ statement, params }),
  });
  return (await res.json()) as { rows: Array<Record<string, unknown>> };
}

export function num(v: unknown): number {
  if (v && typeof v === "object" && "low" in (v as Record<string, unknown>)) {
    return Number((v as { low: number }).low);
  }
  return Number(v ?? 0);
}

async function funnelReady(): Promise<boolean> {
  const res = await fetch(`${BASE}/api/v1/funnels/transitions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  return res.status !== 404;
}

// Runs the full seed chain in order and returns true iff seed:sales completed
// (which, per B-01, requires the funnel subsystem to be executed). Registers the
// funnel ontology (idempotent) before seed:sales — the §7 seed order — so
// resolve()'s Funnel-label assertion passes and the funnel-gated ACs assert.
export async function salesSeedReady(): Promise<boolean> {
  await seedSaasOperator(BASE);
  await seedSaasMetricLibrary(BASE);
  // funnels/transitions route must be present (server built with the funnel
  // subsystem); if absent, the dependency is not deployed → loud skip.
  if (!(await funnelReady())) return false;
  await seedFunnelPipeline(BASE);
  await seedSales(BASE);
  return true;
}

export function skipMsg(ac: string): void {
  console.warn(
    `[sales] SKIP ${ac} — funnel-pipeline-modeling not executed (B-01 execution gate); ` +
      `seed:sales fails loud by design until it is unblocked`,
  );
}
