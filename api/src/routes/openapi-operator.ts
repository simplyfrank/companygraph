// cross-function-exec-rollup T-10 / design §6 (FR-09) — OpenAPI coverage for
// the five read-only operator aggregate routes. Wired into getOpenApiDoc()
// via a single two-line hook in openapi.ts (DD-15/3), mirroring
// openapi-performance.ts. Generated from the SAME zod definitions the
// handlers respond with (shared/src/schema/operator.ts) — no hand-maintained
// copy. No ERROR_CODES addition; all paths under /api/v1/.

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  operatorSliceQuerySchema,
  operatorKpiRowSchema,
  operatorKpiTallySchema,
  operatorRiskCellSchema,
  operatorRiskRowSchema,
  operatorRiskHeatmapSchema,
  operatorFunnelRowSchema,
  operatorSlaRowSchema,
  operatorOverviewRowSchema,
  operatorKpisResponseSchema,
  operatorRisksResponseSchema,
  operatorFunnelsResponseSchema,
  operatorSlasResponseSchema,
  operatorOverviewResponseSchema,
} from "@companygraph/shared/schema/operator";
import { errorEnvelopeSchema } from "./openapi";

export function registerOperatorPaths(registry: OpenAPIRegistry): void {
  // ── Schemas (§3) ───────────────────────────────────────────────────
  registry.register("OperatorSliceQuery", operatorSliceQuerySchema);
  registry.register("OperatorKpiRow", operatorKpiRowSchema);
  registry.register("OperatorKpiTally", operatorKpiTallySchema);
  registry.register("OperatorRiskCell", operatorRiskCellSchema);
  registry.register("OperatorRiskRow", operatorRiskRowSchema);
  registry.register("OperatorRiskHeatmap", operatorRiskHeatmapSchema);
  registry.register("OperatorFunnelRow", operatorFunnelRowSchema);
  registry.register("OperatorSlaRow", operatorSlaRowSchema);
  registry.register("OperatorOverviewRow", operatorOverviewRowSchema);
  registry.register("OperatorKpisResponse", operatorKpisResponseSchema);
  registry.register("OperatorRisksResponse", operatorRisksResponseSchema);
  registry.register("OperatorFunnelsResponse", operatorFunnelsResponseSchema);
  registry.register("OperatorSlasResponse", operatorSlasResponseSchema);
  registry.register("OperatorOverviewResponse", operatorOverviewResponseSchema);

  const err400 = {
    description:
      "validation error — malformed/unknown `function` value (must be one of the six seedKeys). Standard {error:{code,message,details}} envelope (AC-02).",
    content: { "application/json": { schema: errorEnvelopeSchema } },
  };
  const jsonOk = (schema: Parameters<OpenAPIRegistry["register"]>[1], description = "ok") => ({
    description,
    content: { "application/json": { schema } },
  });

  // ── GET /analytics/operator/overview (FR-02) ──────────────────────
  registry.registerPath({
    method: "get",
    path: "/api/v1/analytics/operator/overview",
    description:
      "Cross-function overview rollup (read-only, DD-12). Per SaaS-Operator function: kpiHealth tally, risk severity-band counts, funnelCount, slaHealth tally. Best-effort per signal — a failing signal is marked {error:true} in that row, the overview still returns 200. ?function=<seedKey> narrows to one function.",
    request: { query: operatorSliceQuerySchema },
    responses: { 200: jsonOk(operatorOverviewResponseSchema), 400: err400 },
  });

  // ── GET /analytics/operator/kpis (FR-03/FR-04) ────────────────────
  registry.registerPath({
    method: "get",
    path: "/api/v1/analytics/operator/kpis",
    description:
      "Per-function KPI health (read-only). Each function-scoped KPI with status (on_target|warning|breach|no_data) computed server-side from the latest Neo4j :KPIMeasurement (≤ 2 Neo4j round trips, 0 Postgres), plus a per-function status tally. ?function=<seedKey> optional.",
    request: { query: operatorSliceQuerySchema },
    responses: { 200: jsonOk(operatorKpisResponseSchema), 400: err400 },
  });

  // ── GET /analytics/operator/risks (FR-05) ─────────────────────────
  registry.registerPath({
    method: "get",
    path: "/api/v1/analytics/operator/risks",
    description:
      "Per-function risk heatmap (read-only). Risk rows read via the governed risk-register route (grouped by the canonical domain = function-name key), aggregated in-memory into a sparse (likelihood,impact) cell grid + per-severity-band counts + drill-in rows. Zero-risk function → all-zero heatmap.",
    request: { query: operatorSliceQuerySchema },
    responses: { 200: jsonOk(operatorRisksResponseSchema), 400: err400 },
  });

  // ── GET /analytics/operator/funnels (FR-06) ───────────────────────
  registry.registerPath({
    method: "get",
    path: "/api/v1/analytics/operator/funnels",
    description:
      "Per-function funnel status (read-only). Operator-root Funnel nodes with stageCount + overallConversion (product of per-transition conversionRates; \"n/a\" for a zero/one-stage funnel or a branch). Funnels without a functionSeedKey marker surface under `unattributed` in the all-functions view; a slice degrades to operator-root scope when no marker exists.",
    request: { query: operatorSliceQuerySchema },
    responses: { 200: jsonOk(operatorFunnelsResponseSchema), 400: err400 },
  });

  // ── GET /analytics/operator/slas (FR-07) ──────────────────────────
  registry.registerPath({
    method: "get",
    path: "/api/v1/analytics/operator/slas",
    description:
      "Per-function SLA rollup (read-only). SLA definitions with breachCount, latestBreachAt (all-time), and health (within_target|at_risk|breached) derived from the governed sla-compliance/all read. Attribution: domain_id primary, ALIGNED_TO fallback, else `unattributed`. NOTE breachCount/health are window-scoped while latestBreachAt is all-time (C-05).",
    request: { query: operatorSliceQuerySchema },
    responses: { 200: jsonOk(operatorSlasResponseSchema), 400: err400 },
  });
}
