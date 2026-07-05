// kpi-okr-performance-dashboards T-01 (design §3.2) — request/response
// contracts for the read-only /api/v1/analytics/performance/* aggregates
// (FR-05..FR-09). Runtime validation and OpenAPI generation share these
// definitions (graph-core FR-16 pattern, DD-04). snake_case field
// convention kept (NFR-04); systemKind imported, never re-declared
// (NFR-05, XD-15).

import { z } from "zod";
// XD-15 single vocabulary (NFR-05) — imported for reference only; the
// literals are never re-declared here. `kind` below is deliberately a
// plain string: any value outside SYSTEM_KINDS coerces to the "all"
// slice in the handler (FR-06/AC-03/AC-06 N-03), never a 400.
import { SYSTEM_KINDS as _SYSTEM_KINDS } from "./system-kind";
void _SYSTEM_KINDS; // reference only — the vocabulary lives in system-kind.ts

// ── shared slice query (FR-04) ──────────────────────────────────────────
// domain/journey are hard-validated UUIDs; an unknown-but-well-formed id
// returns empty rows, not 404 (AC-02). `kind` is NOT hard-validated: any
// value outside SYSTEM_KINDS coerces to "all" (FR-06/AC-03/AC-06 N-03).
export const performanceSliceQuerySchema = z.object({
  domain: z.string().uuid().optional(),
  journey: z.string().uuid().optional(),
  kind: z.string().optional(), // coerced to a SystemKind | "all" in the handler
});
export type PerformanceSliceQuery = z.infer<typeof performanceSliceQuerySchema>;

// ── FR-05: KPI portfolio status row ─────────────────────────────────────
export const kpiStatusEnum = z.enum(["on_target", "warning", "breach", "no_data"]);
export type KpiStatus = z.infer<typeof kpiStatusEnum>;

export const kpiStatusRowSchema = z.object({
  kpi_id: z.string(),
  name: z.string(),
  unit: z.string().nullable(),
  target_value: z.number().nullable(),
  target_direction: z.string().nullable(), // higher_is_better | lower_is_better | target_is_exact
  latest_value: z.number().nullable(),
  latest_measured_at: z.string().nullable(),
  status: kpiStatusEnum,
});
export type KpiStatusRow = z.infer<typeof kpiStatusRowSchema>;
export const kpiStatusResponseSchema = z.object({ rows: z.array(kpiStatusRowSchema) });
export type KpiStatusResponse = z.infer<typeof kpiStatusResponseSchema>;

// ── FR-07: OKR roll-down performance row (as-built status literals) ──────
// FR-03: the four as-built literals, never a re-invented
// `assigned`/`adjustment_requested` status.
export const rollDownAssignmentStatusEnum = z.enum([
  "pending",
  "committed",
  "approved",
  "rejected",
]);
export type RollDownAssignmentStatus = z.infer<typeof rollDownAssignmentStatusEnum>;

export const okrDomainAssignmentSchema = z.object({
  domain_id: z.string(),
  domain_name: z.string().nullable(),
  status: rollDownAssignmentStatusEnum,
  // B-02: sourced from :RollDownAssignment.weight (roll-down.ts), NOT a
  // "contribution" prop — there is no a.contribution.
  weight: z.number().nullable(),
  // Derived from pending :RollDownAdjustment nodes, NOT from status (FR-03).
  adjustment_requested: z.boolean(),
});
export type OkrDomainAssignment = z.infer<typeof okrDomainAssignmentSchema>;

export const okrPerformanceRowSchema = z.object({
  directive_id: z.string(),
  directive_name: z.string(),
  // C-01: progress is a real 0..100 key INSIDE KeyResult.attributes_json
  // (keyResultCreateSchema.attributes.progress, okr-crud.ts), read via
  // apoc.convert.fromJsonMap — not a top-level KeyResult property.
  key_results: z.array(
    z.object({ id: z.string(), name: z.string(), progress: z.number().nullable() }),
  ),
  domains: z.array(okrDomainAssignmentSchema),
});
export type OkrPerformanceRow = z.infer<typeof okrPerformanceRowSchema>;
export const okrPerformanceResponseSchema = z.object({ rows: z.array(okrPerformanceRowSchema) });
export type OkrPerformanceResponse = z.infer<typeof okrPerformanceResponseSchema>;

// ── FR-08: journey axis row ─────────────────────────────────────────────
export const journeyAxisResponseSchema = z.object({
  rows: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type JourneyAxisResponse = z.infer<typeof journeyAxisResponseSchema>;
