// cross-function-exec-rollup T-01 (design §3) — request/response contracts
// for the read-only /api/v1/analytics/operator/* aggregates (FR-02..FR-09).
// Runtime validation and OpenAPI generation share these definitions
// (graph-core FR-16 pattern, DD-01). snake_case governed field names are
// kept as-built (NFR-04); new composite fields the cockpit computes are
// camelCase (overallConversion, stageCount, breachCount, latestBreachAt) —
// matching funnel-pipeline-modeling.

import { z } from "zod";

// ── 3.1 Slice + shared enums ────────────────────────────────────────────
// DD-03 — the foundation's six seedKeys (saas-operator-foundation §3.2);
// a closed enum, never re-invented. A malformed value throws
// ValidationError → the standard 400 envelope (AC-02); absent → all six.
export const operatorFunctionEnum = z.enum([
  "marketing",
  "sales",
  "finance_accounting",
  "customer_success",
  "product_delivery",
  "platform_ops",
]);
export type OperatorFunction = z.infer<typeof operatorFunctionEnum>;

export const operatorSliceQuerySchema = z.object({
  function: operatorFunctionEnum.optional(), // absent → all six (FR-01)
});
export type OperatorSliceQuery = z.infer<typeof operatorSliceQuerySchema>;

// ── 3.2 Per-signal rows (drill-in, FR-03..FR-07) ────────────────────────

// KPI health (FR-03) — reuses the performance KpiStatus enum literals.
export const operatorKpiStatusEnum = z.enum(["on_target", "warning", "breach", "no_data"]);
export type OperatorKpiStatus = z.infer<typeof operatorKpiStatusEnum>;
export const operatorKpiRowSchema = z.object({
  kpi_id: z.string(),
  name: z.string(),
  unit: z.string().nullable(),
  target_value: z.number().nullable(),
  target_direction: z.string().nullable(),
  latest_value: z.number().nullable(),
  latest_measured_at: z.string().nullable(),
  status: operatorKpiStatusEnum,
});
export type OperatorKpiRow = z.infer<typeof operatorKpiRowSchema>;
export const operatorKpiTallySchema = z.object({
  on_target: z.number().int(),
  warning: z.number().int(),
  breach: z.number().int(),
  no_data: z.number().int(),
});
export type OperatorKpiTally = z.infer<typeof operatorKpiTallySchema>;

// Risk heatmap (FR-05) — 5×5 (likelihood,impact) grid + severity bands.
export const operatorRiskCellSchema = z.object({
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  count: z.number().int(),
});
export type OperatorRiskCell = z.infer<typeof operatorRiskCellSchema>;
export const operatorRiskRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  status: z.enum(["open", "mitigating", "accepted", "resolved"]),
  trend: z.enum(["up", "flat", "down"]),
  risk_type: z.string().nullable(), // createRiskSchema enum, kept as string
});
export type OperatorRiskRow = z.infer<typeof operatorRiskRowSchema>;
export const operatorRiskBandsSchema = z.object({
  // likelihood×impact buckets: 1–4 low · 5–9 med · 10–14 high · 15–25 critical
  low: z.number().int(),
  medium: z.number().int(),
  high: z.number().int(),
  critical: z.number().int(),
});
export type OperatorRiskBands = z.infer<typeof operatorRiskBandsSchema>;
export const operatorRiskHeatmapSchema = z.object({
  cells: z.array(operatorRiskCellSchema), // sparse — only non-zero cells
  bySeverityBand: operatorRiskBandsSchema,
  rows: z.array(operatorRiskRowSchema), // drill-in
});
export type OperatorRiskHeatmap = z.infer<typeof operatorRiskHeatmapSchema>;

// Funnel status (FR-06) — overallConversion number | "n/a" literal.
export const operatorFunnelRowSchema = z.object({
  funnel_id: z.string(),
  name: z.string(),
  stageCount: z.number().int(),
  overallConversion: z.union([z.number(), z.literal("n/a")]),
});
export type OperatorFunnelRow = z.infer<typeof operatorFunnelRowSchema>;

// SLA rollup (FR-07) — health from the governed compliance read.
export const operatorSlaHealthEnum = z.enum(["within_target", "at_risk", "breached"]);
export type OperatorSlaHealth = z.infer<typeof operatorSlaHealthEnum>;
export const operatorSlaRowSchema = z.object({
  sla_id: z.string(),
  name: z.string(),
  compliance_threshold: z.number().nullable(),
  target_value: z.number().nullable(),
  target_unit: z.string().nullable(),
  breachCount: z.number().int(),
  /**
   * C-05 (design pass-2 pin): **all-time** most-recent breach timestamp
   * (the Read-2 `max(b.breach_at)` has no window). `breachCount`/`health`
   * are window-scoped (`sla-compliance` `window_days`), so a non-null
   * `latestBreachAt` may legitimately sit beside `breachCount: 0` /
   * `health: within_target` — the juxtaposition is intentional and
   * documented, not reconciled.
   */
  latestBreachAt: z.string().nullable(),
  health: operatorSlaHealthEnum,
});
export type OperatorSlaRow = z.infer<typeof operatorSlaRowSchema>;

// ── 3.3 Per-signal responses (FR-03..FR-07) + overview envelope (FR-02) ──
export const operatorKpisResponseSchema = z.object({
  saasOperatorRoot: z.string(),
  functions: z.array(
    z.object({
      function: operatorFunctionEnum,
      name: z.string(),
      kpis: z.array(operatorKpiRowSchema),
      tally: operatorKpiTallySchema,
    }),
  ),
});
export type OperatorKpisResponse = z.infer<typeof operatorKpisResponseSchema>;

export const operatorRisksResponseSchema = z.object({
  saasOperatorRoot: z.string(),
  functions: z.array(
    z.object({
      function: operatorFunctionEnum,
      name: z.string(),
      heatmap: operatorRiskHeatmapSchema,
    }),
  ),
});
export type OperatorRisksResponse = z.infer<typeof operatorRisksResponseSchema>;

export const operatorFunnelsResponseSchema = z.object({
  saasOperatorRoot: z.string(),
  functions: z.array(
    z.object({
      function: operatorFunctionEnum,
      name: z.string(),
      funnels: z.array(operatorFunnelRowSchema),
    }),
  ),
  unattributed: z.array(operatorFunnelRowSchema), // DD-09
});
export type OperatorFunnelsResponse = z.infer<typeof operatorFunnelsResponseSchema>;

export const operatorSlasResponseSchema = z.object({
  saasOperatorRoot: z.string(),
  functions: z.array(
    z.object({
      function: operatorFunctionEnum,
      name: z.string(),
      slas: z.array(operatorSlaRowSchema),
    }),
  ),
  unattributed: z.array(operatorSlaRowSchema), // DD-10
});
export type OperatorSlasResponse = z.infer<typeof operatorSlasResponseSchema>;

// Overview (FR-02) — per-function summary; each signal field carries an
// { error:true } shape on per-signal failure (best-effort compose, DD-12).
export const operatorSignalErrSchema = z.object({ error: z.literal(true) });
export type OperatorSignalErr = z.infer<typeof operatorSignalErrSchema>;
export const operatorSlaHealthTallySchema = z.object({
  within_target: z.number().int(),
  at_risk: z.number().int(),
  breached: z.number().int(),
});
export type OperatorSlaHealthTally = z.infer<typeof operatorSlaHealthTallySchema>;
export const operatorOverviewRowSchema = z.object({
  function: operatorFunctionEnum,
  name: z.string(),
  kpiHealth: z.union([operatorKpiTallySchema, operatorSignalErrSchema]),
  riskHeatmap: z.union([operatorRiskBandsSchema, operatorSignalErrSchema]),
  funnelCount: z.union([z.number().int(), operatorSignalErrSchema]),
  slaHealth: z.union([operatorSlaHealthTallySchema, operatorSignalErrSchema]),
});
export type OperatorOverviewRow = z.infer<typeof operatorOverviewRowSchema>;
export const operatorOverviewResponseSchema = z.object({
  saasOperatorRoot: z.string(),
  functions: z.array(operatorOverviewRowSchema),
});
export type OperatorOverviewResponse = z.infer<typeof operatorOverviewResponseSchema>;
