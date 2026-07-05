// KPI/SLA Data Model for Business Process Management
// This schema defines the data model for tracking KPIs and SLAs across journeys and activities

import { z } from "zod";

// KPI Node - Business Key Performance Indicators
export const kpiSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  category: z.enum(["efficiency", "quality", "customer_satisfaction", "cost", "time", "compliance", "other"]),
  unit: z.string().max(50), // e.g., "%", "hours", "count", "USD"
  target_value: z.number(),
  target_direction: z.enum(["higher_is_better", "lower_is_better", "target_is_exact"]),
  warning_threshold: z.number().optional(),
  critical_threshold: z.number().optional(),
  measurement_frequency: z.enum(["realtime", "hourly", "daily", "weekly", "monthly", "quarterly"]),
  owner_role: z.string().max(255).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  archived_at: z.string().datetime().nullable(),
});

export type KPI = z.infer<typeof kpiSchema>;

// SLA Node - Service Level Agreements
export const slaSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  service_type: z.enum(["response_time", "availability", "throughput", "accuracy", "resolution_time", "other"]),
  target_value: z.number(),
  target_unit: z.string().max(50), // e.g., "ms", "%", "requests/sec"
  measurement_window: z.enum(["p50", "p90", "p95", "p99", "average", "min", "max"]),
  window_duration: z.string().max(50), // e.g., "1h", "24h", "7d", "30d"
  penalty_type: z.enum(["credit", "service_credit", "monetary", "escalation", "none"]).optional(),
  penalty_amount: z.number().optional(),
  compliance_threshold: z.number(), // e.g., 99.9 for 99.9% compliance
  domain_id: z.string().uuid().optional(), // Domain-level SLA
  product_type: z.enum(["application", "data"]).optional(), // Product type for roll-down
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  archived_at: z.string().datetime().nullable(),
});

export type SLA = z.infer<typeof slaSchema>;

// KPIMeasurement Node - Time-series KPI values
export const kpiMeasurementSchema = z.object({
  id: z.string().uuid(),
  kpi_id: z.string().uuid(),
  measured_at: z.string().datetime(),
  value: z.number(),
  context: z.record(z.string(), z.any()).optional(), // Additional context metadata
  source: z.string().max(255).optional(), // Data source
  created_at: z.string().datetime(),
});

export type KPIMeasurement = z.infer<typeof kpiMeasurementSchema>;

// SLABreach Node - SLA breach records
export const slaBreachSchema = z.object({
  id: z.string().uuid(),
  sla_id: z.string().uuid(),
  breach_at: z.string().datetime(),
  actual_value: z.number(),
  target_value: z.number(),
  severity: z.enum(["minor", "major", "critical"]),
  impact_description: z.string().max(1000).optional(),
  root_cause: z.string().max(1000).optional(),
  resolution_status: z.enum(["open", "investigating", "resolved", "mitigated"]),
  resolved_at: z.string().datetime().nullable(),
  resolution_notes: z.string().max(1000).optional(),
  created_at: z.string().datetime(),
});

export type SLABreach = z.infer<typeof slaBreachSchema>;

// KPIAlignment Relationship - Links KPIs to journeys/activities
export const kpiAlignmentSchema = z.object({
  kpi_id: z.string().uuid(),
  target_type: z.enum(["journey", "activity"]),
  target_id: z.string().uuid(),
  weight: z.number().min(0).max(1), // Weight for aggregation (0-1)
  attribution_type: z.enum(["direct", "indirect", "leading", "lagging"]),
  alignment_notes: z.string().max(500).optional(),
  created_at: z.string().datetime(),
});

export type KPIAlignment = z.infer<typeof kpiAlignmentSchema>;

// SLAAlignment Relationship - Links SLAs to journeys/activities
export const slaAlignmentSchema = z.object({
  sla_id: z.string().uuid(),
  target_type: z.enum(["journey", "activity"]),
  target_id: z.string().uuid(),
  is_critical: z.boolean().default(false),
  alignment_notes: z.string().max(500).optional(),
  created_at: z.string().datetime(),
});

export type SLAAlignment = z.infer<typeof slaAlignmentSchema>;

// UserStoryKPI Relationship - Links KPIs to user stories
export const userStoryKPISchema = z.object({
  user_story_id: z.string().uuid(),
  kpi_id: z.string().uuid(),
  impact_description: z.string().max(500).optional(),
  created_at: z.string().datetime(),
});

export type UserStoryKPI = z.infer<typeof userStoryKPISchema>;

// KPIAggregate - Computed KPI aggregates for journeys
export const kpiAggregateSchema = z.object({
  journey_id: z.string().uuid(),
  kpi_id: z.string().uuid(),
  kpi_name: z.string(),
  current_value: z.number(),
  target_value: z.number(),
  status: z.enum(["on_track", "warning", "critical"]),
  trend: z.enum(["improving", "stable", "declining"]),
  period_start: z.string().datetime(),
  period_end: z.string().datetime(),
});

export type KPIAggregate = z.infer<typeof kpiAggregateSchema>;

// SLACompliance - Computed SLA compliance for journeys
export const slaComplianceSchema = z.object({
  journey_id: z.string().uuid(),
  sla_id: z.string().uuid(),
  sla_name: z.string(),
  compliance_rate: z.number(), // 0-100
  breach_count: z.number(),
  period_start: z.string().datetime(),
  period_end: z.string().datetime(),
});

export type SLACompliance = z.infer<typeof slaComplianceSchema>;

// ============================================================================
// Request / query schemas (kpi-okr-governance design §3.3, FR-11a / FR-12)
//
// These encode the DOCUMENTED AS-BUILT contract of the REST surface, not
// the aspirational read shapes above (DD-03): presence + primitive type of
// the required fields and nothing more. Enum membership is enforced only
// where the as-built handlers already enforced it. The one sanctioned
// tightening is the kpi-alignment weight [0,1] bound (FR-04 / AC-06).
// ============================================================================

// FR-01 — presence + primitive types of the six documented required
// fields; enums NOT enforced (as-built leniency, DD-03); domain_id
// accepted (as-built extra field missing from kpiSchema).
export const kpiCreateRequestSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  unit: z.string().min(1),
  target_value: z.number(),
  target_direction: z.string().min(1),
  measurement_frequency: z.string().min(1),
  description: z.string().optional(),
  warning_threshold: z.number().optional(),
  critical_threshold: z.number().optional(),
  owner_role: z.string().optional(),
  domain_id: z.string().optional(),
});
export const kpiPatchRequestSchema = kpiCreateRequestSchema
  .omit({ domain_id: true }).partial();          // PATCH allow-list, as-built

// FR-05 — mirrors the as-built seven required SLA fields.
export const slaCreateRequestSchema = z.object({
  name: z.string().min(1),
  service_type: z.string().min(1),
  target_value: z.number(),
  target_unit: z.string().min(1),
  measurement_window: z.string().min(1),
  window_duration: z.string().min(1),
  compliance_threshold: z.number(),
  description: z.string().optional(),
  penalty_type: z.string().optional(),
  penalty_amount: z.number().optional(),
  domain_id: z.string().optional(),
  product_type: z.string().optional(),
});
export const slaPatchRequestSchema = slaCreateRequestSchema
  .omit({ domain_id: true, product_type: true }).partial();

// FR-04 — enums stay enforced (as-built enforced them); weight gains
// the [0,1] bound the shared kpiAlignmentSchema documents (the ONE
// sanctioned tightening, required by AC-06). target_type includes
// "domain" — an as-built extension beyond kpiAlignmentSchema.
export const kpiAlignmentCreateRequestSchema = z.object({
  kpi_id: z.string().min(1),
  target_type: z.enum(["journey", "activity", "domain"]),
  target_id: z.string().min(1),
  weight: z.number().min(0).max(1),
  attribution_type: z.enum(["direct", "indirect", "leading", "lagging"]),
  alignment_notes: z.string().optional(),
});
export const slaAlignmentCreateRequestSchema = z.object({
  sla_id: z.string().min(1),
  target_type: z.enum(["journey", "activity"]),
  target_id: z.string().min(1),
  is_critical: z.boolean().optional(),
  alignment_notes: z.string().optional(),
});

// FR-03 / FR-07 — GET-only surfaces get query/path schemas ONLY
// (requirements N-01). Coercion mirrors the as-built parseInt/parseFloat.
export const kpiTrendsQuerySchema = z.object({
  window_days: z.coerce.number().int().positive().default(30),
  ma_period: z.coerce.number().int().positive().default(7),
  anomaly_threshold: z.coerce.number().positive().default(2.0),
});
export const slaComplianceQuerySchema = z.object({
  window_days: z.coerce.number().int().positive().default(90),
});

// FR-10a/b — list query params. DOCUMENTATION-ONLY schema: it exists
// so FR-12/OpenAPI can describe the param; the handlers parse via the
// existing parseQueryBool ("true"/"1" only, design §4.5) and never wire
// this schema in. The type mirrors parseQueryBool semantics exactly —
// z.coerce.boolean() is banned here because it coerces the string
// "false" to true. Resolves: design-review C-01.
export const listQuerySchema = z.object({
  include_archived: z.enum(["true", "1"]).optional(),
});

// ============================================================================
// Parameter binding schemas (kpi-measurement-alignment FR-08, FR-09)
//
// A PARAM_BINDS edge links a KPI parameter (target_value, warning_threshold,
// critical_threshold) to an entity attribute path. The reconciliation job
// reads the bound entity attribute and PATCHes the KPI parameter.
// ============================================================================

export const kpiParamBindingSchema = z.object({
  id: z.string(),
  kpi_id: z.string().uuid(),
  target_type: z.enum(["journey", "activity", "domain", "system"]),
  target_id: z.string().min(1),
  parameter: z.enum(["target_value", "warning_threshold", "critical_threshold"]),
  attribute_path: z.string().min(1).max(500),
  created_at: z.string().datetime(),
});
export type KpiParamBinding = z.infer<typeof kpiParamBindingSchema>;

export const paramBindingCreateRequestSchema = z.object({
  target_type: z.enum(["journey", "activity", "domain", "system"]),
  target_id: z.string().min(1),
  parameter: z.enum(["target_value", "warning_threshold", "critical_threshold"]),
  attribute_path: z.string().min(1).max(500),
});
export type ParamBindingCreateRequest = z.infer<typeof paramBindingCreateRequestSchema>;

export const reconcileResultSchema = z.object({
  kpi_id: z.string().uuid(),
  reconciled: z.array(z.object({
    parameter: z.string(),
    old_value: z.number(),
    new_value: z.number(),
    entity_id: z.string(),
  })),
  unchanged: z.array(z.string()),
});
export type ReconcileResult = z.infer<typeof reconcileResultSchema>;
