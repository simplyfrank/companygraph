// Journey health calculation utilities for US-JM-01: Journey Health Dashboard

import { api } from "../api";
import { complianceRules } from "../api/compliance";

export type HealthTier = "excellent" | "good" | "fair" | "poor" | "critical";

export interface JourneyHealthInput {
  sla_breach_rate: number;
  handoff_complexity: number;
  sod_conflicts: number;
  initiative_completion: number;
  avg_cycle_time_p50?: number;
  avg_cycle_time_p99?: number;
  touchpoint_count?: number;
  system_count?: number;
  role_count?: number;
  compliance_score?: number;
  compliance_violations?: number;
}

export interface ComplianceStatus {
  score: number;
  violations: number;
  rules_evaluated: number;
  last_evaluated: string | null;
}

export function calculateHealthScore(input: JourneyHealthInput): number {
  const {
    sla_breach_rate,
    handoff_complexity,
    sod_conflicts,
    initiative_completion,
    avg_cycle_time_p50 = 0,
    avg_cycle_time_p99 = 0,
    compliance_score = 100,
  } = input;

  // SLA breach rate: lower is better (0% = 100 points, 20%+ = 0 points)
  const slaScore = Math.max(0, 100 - (sla_breach_rate * 500));

  // Handoff complexity: lower is better (0 = 100 points, 10+ = 0 points)
  const handoffScore = Math.max(0, 100 - (handoff_complexity * 10));

  // SoD conflicts: lower is better (0 = 100 points, 5+ = 0 points)
  const sodScore = Math.max(0, 100 - (sod_conflicts * 20));

  // Initiative completion: higher is better (100% = 100 points, 0% = 0 points)
  const initiativeScore = initiative_completion * 100;

  // Cycle time variance: lower p99/p50 ratio is better
  const cycleTimeRatio = avg_cycle_time_p50 > 0 ? avg_cycle_time_p99 / avg_cycle_time_p50 : 1;
  const cycleTimeScore = Math.max(0, 100 - ((cycleTimeRatio - 1) * 50));

  // Compliance score: higher is better (100% = 100 points, 0% = 0 points)
  const complianceScoreValue = compliance_score;

  // Weighted average (adjusted to include compliance)
  const healthScore = (
    slaScore * 0.25 +
    handoffScore * 0.15 +
    sodScore * 0.15 +
    initiativeScore * 0.15 +
    cycleTimeScore * 0.1 +
    complianceScoreValue * 0.2
  );

  return Math.round(healthScore);
}

export function getHealthTier(score: number): HealthTier {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "fair";
  if (score >= 40) return "poor";
  return "critical";
}

export function getHealthColor(tier: HealthTier): string {
  switch (tier) {
    case "excellent": return "var(--good)";
    case "good": return "#4caf50";
    case "fair": return "var(--warn)";
    case "poor": return "#ff9800";
    case "critical": return "var(--danger)";
    default: return "var(--muted)";
  }
}

export function getVerificationStatus(verifiedDate: string | null, verifiedBy: string | null): "verified" | "stale" | "expired" | "none" {
  if (!verifiedDate || !verifiedBy) return "none";

  const now = new Date();
  const verified = new Date(verifiedDate);
  const daysSinceVerification = (now.getTime() - verified.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceVerification > 90) return "expired";
  if (daysSinceVerification > 30) return "stale";
  return "verified";
}

export function getVerificationColor(status: "verified" | "stale" | "expired" | "none"): string {
  switch (status) {
    case "verified": return "var(--good)";
    case "stale": return "var(--warn)";
    case "expired": return "var(--danger)";
    case "none": return "var(--muted)";
    default: return "var(--muted)";
  }
}

export async function fetchComplianceStatus(journeyId: string, domainId?: string): Promise<ComplianceStatus> {
  try {
    // Fetch compliance rules for the journey's domain
    const rules = await complianceRules.list(true);

    if (!rules || rules.length === 0) {
      return {
        score: 100,
        violations: 0,
        rules_evaluated: 0,
        last_evaluated: null,
      };
    }

    let totalScore = 0;
    let totalViolations = 0;
    let rulesEvaluated = 0;

    // Evaluate each applicable rule
    for (const rule of rules) {
      try {
        const result = await complianceRules.evaluate(rule.id);
        if (result) {
          totalScore += result.score || 0;
          totalViolations += result.violations ? result.violations.length : 0;
          rulesEvaluated++;
        }
      } catch (e) {
        // Skip rules that fail evaluation
        console.warn(`Failed to evaluate compliance rule ${rule.id}:`, e);
      }
    }

    const averageScore = rulesEvaluated > 0 ? totalScore / rulesEvaluated : 100;

    return {
      score: Math.round(averageScore),
      violations: totalViolations,
      rules_evaluated: rulesEvaluated,
      last_evaluated: new Date().toISOString(),
    };
  } catch (e) {
    console.error("Failed to fetch compliance status:", e);
    return {
      score: 100,
      violations: 0,
      rules_evaluated: 0,
      last_evaluated: null,
    };
  }
}
