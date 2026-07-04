// Health score calculation utility for domain management (US-DM-01)

export interface HealthMetrics {
  sla_breach_rate: number;
  handoff_complexity: number;
  sod_conflicts: number;
  initiative_completion: number;
}

export type HealthTier = "healthy" | "needs-attention" | "critical";

/**
 * Calculate domain health score (0-100) based on weighted metrics.
 * Weights: SLA breach rate (40%), handoff complexity (20%), SoD conflicts (20%), initiative completion (20%)
 */
export function calculateHealthScore(metrics: HealthMetrics): number {
  // SLA breach rate: lower is better (0 breaches = 100% score)
  const slaScore = Math.max(0, 100 - metrics.sla_breach_rate * 100);

  // Handoff complexity: normalize to 0-100 (assuming max reasonable complexity is 20)
  const handoffScore = Math.max(0, 100 - (metrics.handoff_complexity / 20) * 100);

  // SoD conflicts: lower is better (0 conflicts = 100% score)
  const sodScore = Math.max(0, 100 - metrics.sod_conflicts * 20);

  // Initiative completion: higher is better (100% completion = 100% score)
  const initiativeScore = metrics.initiative_completion * 100;

  // Weighted average
  const weightedScore =
    slaScore * 0.4 +
    handoffScore * 0.2 +
    sodScore * 0.2 +
    initiativeScore * 0.2;

  return Math.round(weightedScore);
}

/**
 * Get health tier based on score.
 * 80-100: healthy
 * 50-79: needs-attention
 * 0-49: critical
 */
export function getHealthTier(score: number): HealthTier {
  if (score >= 80) return "healthy";
  if (score >= 50) return "needs-attention";
  return "critical";
}

/**
 * Get CSS color variable for health tier.
 */
export function getHealthColor(tier: HealthTier): string {
  switch (tier) {
    case "healthy":
      return "var(--good)";
    case "needs-attention":
      return "var(--warn)";
    case "critical":
      return "var(--danger)";
  }
}

/**
 * Get verification status based on date.
 * < 90 days: verified
 * 90-180 days: stale
 * > 180 days: expired
 */
export function getVerificationStatus(verifiedDate: string | null): "verified" | "stale" | "expired" | "none" {
  if (!verifiedDate) return "none";

  const now = new Date();
  const verified = new Date(verifiedDate);
  const daysSinceVerification = (now.getTime() - verified.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceVerification < 90) return "verified";
  if (daysSinceVerification < 180) return "stale";
  return "expired";
}

/**
 * Get CSS color variable for verification status.
 */
export function getVerificationColor(status: ReturnType<typeof getVerificationStatus>): string {
  switch (status) {
    case "verified":
      return "var(--good)";
    case "stale":
      return "var(--warn)";
    case "expired":
      return "var(--danger)";
    case "none":
      return "var(--muted-2)";
  }
}
