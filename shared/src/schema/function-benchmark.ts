// function-benchmark-scoring T-01 (design §3.2, §3.3) — the zod wire
// shape + the pure-scorer read-shape interfaces for the per-function
// descriptive maturity report.
//
// zod is the only validation library (house rule, NFR-06); identifiers
// are en-US. Descriptive-only (XD-11, NFR-04): there is NO
// recommendation/suggestion field anywhere in this shape. Do not add one.

import { z } from "zod";
import { systemKindSchema, type SystemKind } from "./system-kind";

// ── Per-KPI verdict enum (DD-05) ────────────────────────────────────────
export const kpiVerdictEnum = z.enum(["on_target", "warning", "breach", "no_data"]);
export type KpiVerdict = z.infer<typeof kpiVerdictEnum>;

// ── Per-KPI evidence row behind the metricBenchmark sub-score (DD-04) ────
// benchmarkProse = MetricDefinition.attributes.benchmark — DISPLAYED as
// evidence, NEVER numerically compared (DD-04).
export const kpiVerdictRowSchema = z
  .object({
    kpi_id: z.string(),
    name: z.string(),
    metricId: z.string(), // the MEASURES-linked MetricDefinition id
    metricName: z.string(),
    benchmarkProse: z.string(),
    latestValue: z.number().nullable(),
    target_value: z.number().nullable(),
    target_direction: z.string().nullable(),
    verdict: kpiVerdictEnum,
  })
  .strict();
export type KpiVerdictRow = z.infer<typeof kpiVerdictRowSchema>;

// ── metricBenchmark sub-score (FR-02) — null when metricGrounded:false ──
export const metricBenchmarkScoreSchema = z
  .object({
    score: z.number().nullable(), // share of metric-grounded KPIs on_target ∈ [0,1] | null
    metricGrounded: z.boolean(), // false ⇒ zero MEASURES-linked KPIs ⇒ excluded from composite
    onTargetCount: z.number().int(),
    scoredCount: z.number().int(), // denominator: MEASURES-linked KPIs WITH a measured value
    noDataCount: z.number().int(), // MEASURES-linked KPIs with no measurement (excluded)
    kpis: z.array(kpiVerdictRowSchema),
  })
  .strict();
export type MetricBenchmarkScore = z.infer<typeof metricBenchmarkScoreSchema>;

// ── coverage sub-score (FR-04) — three core ratios + optional marked-key ─
export const coverageScoreSchema = z
  .object({
    score: z.number(), // ∈ [0,1]
    unmodeled: z.boolean(), // true ⇒ zero activities ⇒ score 0
    keyMarked: z.boolean(), // true ⇒ ≥1 marked-key activity ⇒ bonus term contributes
    activityCount: z.number().int(),
    roleRatio: z.number(), // share with ≥1 EXECUTES Role
    systemRatio: z.number(), // share with ≥1 USES_SYSTEM
    kpiRatio: z.number(), // share covered by ≥1 function KPI (attribution edge-set, DD-13)
    markedKeyCoveredRatio: z.number().nullable(), // share of marked-key activities with a KPI (null when keyMarked:false)
  })
  .strict();
export type CoverageScore = z.infer<typeof coverageScoreSchema>;

// ── automation (system-augmentation) sub-score (FR-05) ──────────────────
export const automationScoreSchema = z
  .object({
    score: z.number(), // ∈ [0,1]
    systemCoverage: z.number(), // share of activities with ≥1 USES_SYSTEM
    augmentationTerm: z.number(), // weighted-by-systemKind term ∈ [0,1]
    byKind: z.record(systemKindSchema, z.number().int()), // per-kind activity counts (evidence)
    weights: z.record(systemKindSchema, z.number()), // DD-06 augmentation weights (echoed)
  })
  .strict();
export type AutomationScore = z.infer<typeof automationScoreSchema>;

// ── per-function composite row ──────────────────────────────────────────
export const functionScoreSchema = z
  .object({
    seedKey: z.string(),
    name: z.string(), // function Domain name
    domainId: z.string(),
    composite: z.number(), // weighted mean over APPLICABLE sub-scores (DD-08)
    metricBenchmark: metricBenchmarkScoreSchema,
    coverage: coverageScoreSchema,
    automation: automationScoreSchema,
  })
  .strict();
export type FunctionScore = z.infer<typeof functionScoreSchema>;

export const benchmarkReportMetaSchema = z
  .object({
    functionCount: z.number().int(),
    modelId: z.string().nullable(), // null on the empty-200 no-root case (DD-10)
    weights: z
      .object({
        metricBenchmark: z.number(),
        coverage: z.number(),
        automation: z.number(),
      })
      .strict(),
  })
  .strict();
export type BenchmarkReportMeta = z.infer<typeof benchmarkReportMetaSchema>;

export const benchmarkReportSchema = z
  .object({
    functions: z.array(functionScoreSchema), // ranked composite DESC, ties by seedKey ASC
    meta: benchmarkReportMetaSchema,
  })
  .strict();
export type BenchmarkReport = z.infer<typeof benchmarkReportSchema>;

// ── Read-shape (pure-scorer input, design §3.3) ─────────────────────────
// The storage read (api/src/storage/function-benchmark.ts) produces this
// plain shape; the pure scorer (api/src/derive/function-benchmark-score.ts)
// consumes only it (no Driver, no session), mirroring ScoreSubgraph in
// key-activity-score.ts. Shared here so the read + scorer agree on one
// source of truth (T-01).

export interface FunctionActivity {
  id: string;
  roleIds: string[]; // EXECUTES (Role→Activity)
  systemKinds: SystemKind[]; // one per USES_SYSTEM System (default functional)
  keyMarked: boolean; // attributes.keyActivity present + valid
  coveredByKpi: boolean; // ≥1 function KPI attributed to this function is ALIGNED_TO this activity (or its parent journey), DD-13/§4.3
}

export interface FunctionKpiGrounded {
  kpi_id: string;
  name: string;
  metricId: string;
  metricName: string;
  benchmarkProse: string;
  latestValue: number | null;
  target_value: number | null;
  target_direction: string | null;
  warning_threshold: number | null;
  critical_threshold: number | null;
}

export interface FunctionRead {
  seedKey: string;
  name: string;
  domainId: string;
  activities: FunctionActivity[];
  groundedKpis: FunctionKpiGrounded[]; // ONLY KPIs carrying a MEASURES edge
}

export interface BenchmarkInput {
  functions: FunctionRead[];
  augmentationWeights: Record<SystemKind, number>; // DD-06
  compositeWeights: { metricBenchmark: number; coverage: number; automation: number }; // DD-07
}
