// function-benchmark-scoring T-02/T-03 (design §4.1, §4.2, DD-01, DD-04,
// DD-05, DD-06, DD-07, DD-08) — the PURE, Neo4j-free scoring module.
//
// `computeKpiVerdict(kpi, latest)` RE-IMPLEMENTS the performance.ts:50–89
// `computeKpiStatus` band rule byte-for-byte (DD-05) and this module NEVER
// imports the performance route module — staying inside the ownership
// boundary (XD-08, AC-03 tripwire).
//
// `scoreFunctions(input)` computes the three descriptive sub-scores
// (metricBenchmark, coverage, automation), the composite over APPLICABLE
// sub-scores, and the deterministic rank. All math is Neo4j-free and
// deterministic (NFR-04); unit-testable against fixtures with no Neo4j.
//
// Descriptive-only (XD-11, NFR-04): the output carries NO
// recommendation/suggestion field. Do not add one.

import { SYSTEM_KINDS, type SystemKind } from "@companygraph/shared/schema/system-kind";
import type {
  KpiVerdict,
  FunctionActivity,
  FunctionKpiGrounded,
  FunctionRead,
  BenchmarkInput,
  FunctionScore,
  MetricBenchmarkScore,
  CoverageScore,
  AutomationScore,
  BenchmarkReportMeta,
} from "@companygraph/shared/schema/function-benchmark";

// ── DD-06: systemKind augmentation-weight table (code-default constants) ─
// Monotone over the closed SYSTEM_KINDS enum in its declared order (lowest
// augmentation first, highest last). Built positionally from SYSTEM_KINDS
// so the enum literals live ONLY in the shared vocabulary module
// (system-augmentation-model AC-01 grep-guard). The weight for the i-th
// kind is AUGMENTATION_WEIGHT_VALUES[i]; the pinned DD-06 values are
// 0.34 / 0.67 / 1.0 across the three kinds in enum order.
const AUGMENTATION_WEIGHT_VALUES = [0.34, 0.67, 1.0] as const;
export const AUGMENTATION_WEIGHT: Record<SystemKind, number> = SYSTEM_KINDS.reduce(
  (acc, kind, i) => {
    acc[kind] = AUGMENTATION_WEIGHT_VALUES[i] ?? 1.0;
    return acc;
  },
  {} as Record<SystemKind, number>,
);

// ── DD-07: composite weights are code-default constants ─────────────────
export const DEFAULT_WEIGHTS = {
  metricBenchmark: 1.0,
  coverage: 1.0,
  automation: 1.0,
} as const;

// ---------------------------------------------------------------------------
// T-02 — KPI-vs-target verdict (design §4.1, DD-05). Re-implements
// performance.ts computeKpiStatus verbatim; never imports it.
// ---------------------------------------------------------------------------

export interface KpiVerdictInput {
  target_value: number | null;
  target_direction: string | null;
  warning_threshold: number | null;
  critical_threshold: number | null;
}

export function computeKpiVerdict(kpi: KpiVerdictInput, latest: number | null): KpiVerdict {
  if (latest === null || latest === undefined) return "no_data";
  const target = kpi.target_value;
  if (target === null || target === undefined) return "no_data"; // N-07 defensive guard
  const v = latest;
  const warning = kpi.warning_threshold ?? null;
  const critical = kpi.critical_threshold ?? null;

  switch (kpi.target_direction) {
    case "higher_is_better": {
      if (v >= target) return "on_target";
      if (critical !== null && v < critical) return "breach";
      if (warning !== null && v < warning) return "warning";
      return warning === null ? "warning" : "on_target";
    }
    case "lower_is_better": {
      if (v <= target) return "on_target";
      if (critical !== null && v > critical) return "breach";
      if (warning !== null && v > warning) return "warning";
      return warning === null ? "warning" : "on_target";
    }
    case "target_is_exact": {
      if (v === target) return "on_target";
      const deviation = Math.abs(v - target);
      if (critical !== null && deviation > critical) return "breach";
      if (warning !== null && deviation > warning) return "warning";
      // Nonzero deviation inside the bands OR with no bands → warning,
      // NEVER on_target (the no-band default, C-03 of the requirements review).
      return "warning";
    }
    default:
      // Total over the declared domain: unknown/null direction → no_data,
      // never throws (performance.ts:84–87).
      return "no_data";
  }
}

// ---------------------------------------------------------------------------
// T-03 — pure sub-score math (design §4.2)
// ---------------------------------------------------------------------------

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// ── metricBenchmark (FR-02, DD-04) ──────────────────────────────────────
function scoreMetricBenchmark(
  groundedKpis: FunctionKpiGrounded[],
): MetricBenchmarkScore {
  const metricGrounded = groundedKpis.length > 0;
  let onTargetCount = 0;
  let scoredCount = 0;
  let noDataCount = 0;

  const kpis = groundedKpis.map((k) => {
    const verdict = computeKpiVerdict(k, k.latestValue);
    if (k.latestValue === null) {
      noDataCount += 1;
    } else {
      scoredCount += 1;
      if (verdict === "on_target") onTargetCount += 1;
    }
    return {
      kpi_id: k.kpi_id,
      name: k.name,
      metricId: k.metricId,
      metricName: k.metricName,
      benchmarkProse: k.benchmarkProse,
      latestValue: k.latestValue,
      target_value: k.target_value,
      target_direction: k.target_direction,
      verdict,
    };
  });

  const score = metricGrounded && scoredCount > 0 ? onTargetCount / scoredCount : null;

  return { score, metricGrounded, onTargetCount, scoredCount, noDataCount, kpis };
}

// ── coverage (FR-04, DD-08, C-01/C-02) ──────────────────────────────────
function scoreCoverage(activities: FunctionActivity[]): CoverageScore {
  const n = activities.length;
  if (n === 0) {
    return {
      score: 0,
      unmodeled: true,
      keyMarked: false,
      activityCount: 0,
      roleRatio: 0,
      systemRatio: 0,
      kpiRatio: 0,
      markedKeyCoveredRatio: null,
    };
  }

  const roleRatio = activities.filter((a) => a.roleIds.length > 0).length / n;
  const systemRatio = activities.filter((a) => a.systemKinds.length > 0).length / n;
  const kpiRatio = activities.filter((a) => a.coveredByKpi).length / n; // ALL attributed KPIs (C-02)

  const markedKey = activities.filter((a) => a.keyMarked);
  if (markedKey.length === 0) {
    // Marked-key term DROPPED (not scored 0) — coverage = mean of 3 core ratios.
    return {
      score: mean([roleRatio, systemRatio, kpiRatio]),
      unmodeled: false,
      keyMarked: false,
      activityCount: n,
      roleRatio,
      systemRatio,
      kpiRatio,
      markedKeyCoveredRatio: null,
    };
  }

  const markedKeyCoveredRatio =
    markedKey.filter((a) => a.coveredByKpi).length / markedKey.length;
  return {
    score: mean([roleRatio, systemRatio, kpiRatio, markedKeyCoveredRatio]),
    unmodeled: false,
    keyMarked: true,
    activityCount: n,
    roleRatio,
    systemRatio,
    kpiRatio,
    markedKeyCoveredRatio,
  };
}

// ── automation (FR-05, DD-06, Risk 8) ───────────────────────────────────
function scoreAutomation(
  activities: FunctionActivity[],
  weights: Record<SystemKind, number>,
): AutomationScore {
  const n = activities.length;

  // byKind counts each activity ONCE under its best (highest-weight) kind
  // (N-03), so sum(byKind) === (# activities with ≥1 system). Built from
  // SYSTEM_KINDS so the enum literals stay in the shared vocab module.
  const byKind = SYSTEM_KINDS.reduce(
    (acc, kind) => {
      acc[kind] = 0;
      return acc;
    },
    {} as Record<SystemKind, number>,
  );

  const contributions: number[] = [];
  let withSystem = 0;
  for (const a of activities) {
    if (a.systemKinds.length === 0) {
      contributions.push(0);
      continue;
    }
    withSystem += 1;
    // best kind = the one whose weight is maximal; deterministic tiebreak
    // by SYSTEM_KINDS order.
    let bestKind: SystemKind = a.systemKinds[0]!;
    for (const k of a.systemKinds) {
      if (weights[k] > weights[bestKind]) bestKind = k;
    }
    byKind[bestKind] += 1;
    contributions.push(weights[bestKind]);
  }

  const systemCoverage = n === 0 ? 0 : withSystem / n;
  const augmentationTerm = n === 0 ? 0 : mean(contributions);
  const score = mean([systemCoverage, augmentationTerm]);

  // Echo the full weight table as evidence (copied over the closed enum).
  const echoedWeights = SYSTEM_KINDS.reduce(
    (acc, kind) => {
      acc[kind] = weights[kind];
      return acc;
    },
    {} as Record<SystemKind, number>,
  );

  return { score, systemCoverage, augmentationTerm, byKind, weights: echoedWeights };
}

function scoreOneFunction(
  fn: FunctionRead,
  augmentationWeights: Record<SystemKind, number>,
  compositeWeights: { metricBenchmark: number; coverage: number; automation: number },
): FunctionScore {
  const metricBenchmark = scoreMetricBenchmark(fn.groundedKpis);
  const coverage = scoreCoverage(fn.activities);
  const automation = scoreAutomation(fn.activities, augmentationWeights);

  // ── composite (DD-07, DD-08): weighted mean over APPLICABLE sub-scores ──
  // a null metricBenchmark.score drops that term from numerator AND
  // denominator; coverage + automation are always numeric.
  let num = 0;
  let den = 0;
  if (metricBenchmark.score !== null) {
    num += compositeWeights.metricBenchmark * metricBenchmark.score;
    den += compositeWeights.metricBenchmark;
  }
  num += compositeWeights.coverage * coverage.score;
  den += compositeWeights.coverage;
  num += compositeWeights.automation * automation.score;
  den += compositeWeights.automation;
  const composite = den > 0 ? num / den : 0;

  return {
    seedKey: fn.seedKey,
    name: fn.name,
    domainId: fn.domainId,
    composite,
    metricBenchmark,
    coverage,
    automation,
  };
}

export function scoreFunctions(input: BenchmarkInput): {
  functions: FunctionScore[];
  meta: Pick<BenchmarkReportMeta, "functionCount" | "weights">;
} {
  const functions = input.functions.map((fn) =>
    scoreOneFunction(fn, input.augmentationWeights, input.compositeWeights),
  );

  // rank: composite DESC, ties seedKey ASC (deterministic, NFR-04).
  functions.sort((a, b) => {
    if (b.composite !== a.composite) return b.composite - a.composite;
    return a.seedKey < b.seedKey ? -1 : a.seedKey > b.seedKey ? 1 : 0;
  });

  return {
    functions,
    meta: {
      functionCount: functions.length,
      weights: { ...input.compositeWeights },
    },
  };
}

// Re-export the closed enum for consumers that need it near the scorer.
export { SYSTEM_KINDS };
