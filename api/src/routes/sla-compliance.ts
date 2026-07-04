// SLA compliance reporting handlers (KPI-SLA-08)
// GET /api/v1/sla-compliance/:sla_id - calculate SLA compliance rates, breach patterns, and risk scores
// GET /api/v1/sla-compliance/domain/:domain_id - calculate domain-level SLA compliance across all SLAs
// GET /api/v1/sla-compliance/all - aggregate SLA compliance across all domains

import type { Driver } from "neo4j-driver";
import { z } from "zod";
import { slaComplianceQuerySchema } from "@companygraph/shared/schema/kpi-sla";
import { getDriver } from "../neo4j/driver";
import { ok, error, parseWith } from "./_helpers";

// DD-04 — path guard accepts ANY UUID version (v4 SLA/Domain ids stay
// addressable); v7-only parseId deliberately not used on this surface.
const uuidAny = z.string().uuid();

// FR-11a — zod query schema replaces raw parseInt (garbage now 400s).
function parseWindowDays(url: URL): number {
  return parseWith(slaComplianceQuerySchema, {
    window_days: url.searchParams.get("window_days") ?? undefined,
  }).window_days;
}

// GET /api/v1/sla-compliance/:sla_id - calculate SLA compliance rates, breach patterns, and risk scores
export async function handleSlaComplianceGet(req: Request, slaId: string): Promise<Response> {
  const url = new URL(req.url);
  const windowDays = parseWindowDays(url);

  if (!uuidAny.safeParse(slaId).success) {
    return error(400, "invalid_payload", "malformed sla_id", { sla_id: slaId });
  }
  const id = slaId;

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    // Verify SLA exists and get compliance threshold
    const slaCheck = await session.run(
      "MATCH (s:SLA {id: $id}) WHERE s.archived_at IS NULL RETURN s.compliance_threshold, s.target_value, s.target_unit",
      { id }
    );
    if (slaCheck.records.length === 0) {
      return error(404, "not_found", "SLA not found or archived", { sla_id: id });
    }

    const sla = slaCheck.records[0]!;
    const complianceThreshold = sla.get("s.compliance_threshold");
    const targetValue = sla.get("s.target_value");
    const targetUnit = sla.get("s.target_unit");

    // Calculate time window
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - windowDays);
    const windowStartIso = windowStart.toISOString();

    // Fetch breaches within the time window
    const breachesResult = await session.run(
      `MATCH (b:SLABreach {sla_id: $id})
       WHERE b.breach_at >= $windowStart
       RETURN b.id AS id, b.breach_at AS breach_at, b.severity AS severity,
              b.resolution_status AS resolution_status, b.actual_value AS actual_value,
              b.target_value AS target_value
       ORDER BY b.breach_at DESC`,
      { id, windowStart: windowStartIso }
    );

    const breaches = breachesResult.records.map((r) => ({
      id: r.get("id"),
      breach_at: r.get("breach_at"),
      severity: r.get("severity"),
      resolution_status: r.get("resolution_status"),
      actual_value: r.get("actual_value"),
      target_value: r.get("target_value"),
    })) as Array<{
      id: string;
      breach_at: string;
      severity: string;
      resolution_status: string;
      actual_value: number;
      target_value: number;
    }>;

    // Calculate compliance metrics
    const totalBreaches = breaches.length;
    const openBreaches = breaches.filter((b) => b.resolution_status === "open").length;
    const resolvedBreaches = breaches.filter((b) => b.resolution_status === "resolved").length;
    const criticalBreaches = breaches.filter((b) => b.severity === "critical").length;
    const majorBreaches = breaches.filter((b) => b.severity === "major").length;
    const minorBreaches = breaches.filter((b) => b.severity === "minor").length;

    // Calculate breach patterns (by day of week, by severity trend)
    const breachPatterns = calculateBreachPatterns(breaches);

    // Calculate risk score (0-100, higher = riskier)
    const riskScore = calculateRiskScore(breaches, windowDays, complianceThreshold);

    // Calculate compliance rate (inverse of breach rate adjusted by severity)
    const complianceRate = calculateComplianceRate(breaches, windowDays, complianceThreshold);

    return ok({
      sla_id: id,
      window_days: windowDays,
      target_value: targetValue,
      target_unit: targetUnit,
      compliance_threshold: complianceThreshold,
      compliance_rate: complianceRate,
      risk_score: riskScore,
      breaches: {
        total: totalBreaches,
        open: openBreaches,
        resolved: resolvedBreaches,
        by_severity: {
          critical: criticalBreaches,
          major: majorBreaches,
          minor: minorBreaches,
        },
      },
      breach_patterns: breachPatterns,
    });
  } finally {
    await session.close();
  }
}

// Calculate breach patterns (temporal distribution, severity trends)
function calculateBreachPatterns(breaches: Array<{ breach_at: string; severity: string }>) {
  if (breaches.length === 0) {
    return {
      by_day_of_week: {},
      severity_trend: "stable",
      avg_time_between_breaches: null,
    };
  }

  // Distribution by day of week
  const byDayOfWeek: Record<string, number> = {
    Sunday: 0,
    Monday: 0,
    Tuesday: 0,
    Wednesday: 0,
    Thursday: 0,
    Friday: 0,
    Saturday: 0,
  };

  breaches.forEach((b) => {
    const day = new Date(b.breach_at).toLocaleDateString("en-US", { weekday: "long" });
    byDayOfWeek[day] = (byDayOfWeek[day] || 0) + 1;
  });

  // Severity trend (compare recent vs older breaches)
  const midPoint = Math.floor(breaches.length / 2);
  const recentBreaches = breaches.slice(0, midPoint);
  const olderBreaches = breaches.slice(midPoint);

  const recentCritical = recentBreaches.filter((b) => b.severity === "critical").length;
  const olderCritical = olderBreaches.filter((b) => b.severity === "critical").length;

  let severityTrend = "stable";
  if (recentCritical > olderCritical * 1.5) severityTrend = "worsening";
  else if (recentCritical < olderCritical * 0.5) severityTrend = "improving";

  // Average time between breaches
  const sortedDates = breaches.map((b) => new Date(b.breach_at).getTime()).sort((a, b) => b - a);
  let avgTimeBetween: number | null = null;
  if (sortedDates.length > 1) {
    const intervals: number[] = [];
    for (let i = 0; i < sortedDates.length - 1; i++) {
      intervals.push(sortedDates[i]! - sortedDates[i + 1]!);
    }
    avgTimeBetween = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  }

  return {
    by_day_of_week: byDayOfWeek,
    severity_trend: severityTrend,
    avg_time_between_breaches: avgTimeBetween ? Math.round(avgTimeBetween / (1000 * 60 * 60 * 24)) : null,
  };
}

// Calculate risk score (0-100, higher = riskier)
function calculateRiskScore(breaches: Array<{ severity: string; resolution_status: string }>, windowDays: number, complianceThreshold: number): number {
  if (breaches.length === 0) return 0;

  // Base score from breach frequency
  const breachRate = breaches.length / windowDays;
  let score = Math.min(breachRate * 10, 50); // Max 50 from frequency

  // Add severity weighting
  const criticalWeight = breaches.filter((b) => b.severity === "critical").length * 15;
  const majorWeight = breaches.filter((b) => b.severity === "major").length * 8;
  const minorWeight = breaches.filter((b) => b.severity === "minor").length * 3;
  score = Math.min(score + criticalWeight + majorWeight + minorWeight, 90);

  // Reduce score for resolved breaches
  const resolvedRatio = breaches.filter((b) => b.resolution_status === "resolved").length / breaches.length;
  score = score * (1 - resolvedRatio * 0.3);

  // Increase score if below compliance threshold
  if (complianceThreshold < 95) {
    score = Math.min(score + (100 - complianceThreshold) * 0.2, 100);
  }

  return Math.round(score);
}

// Calculate compliance rate (0-100, higher = better compliance)
function calculateComplianceRate(breaches: Array<{ severity: string }>, windowDays: number, complianceThreshold: number): number {
  if (breaches.length === 0) return 100;

  // Base compliance from breach count
  const breachPenalty = breaches.length / windowDays * 10;
  let compliance = Math.max(100 - breachPenalty, 0);

  // Apply severity weighting
  const criticalCount = breaches.filter((b) => b.severity === "critical").length;
  const majorCount = breaches.filter((b) => b.severity === "major").length;
  const minorCount = breaches.filter((b) => b.severity === "minor").length;

  const severityPenalty = criticalCount * 5 + majorCount * 2 + minorCount * 0.5;
  compliance = Math.max(compliance - severityPenalty, 0);

  // Adjust against compliance threshold
  if (compliance < complianceThreshold) {
    // Below threshold, reduce further
    compliance = compliance * (compliance / complianceThreshold);
  }

  return Math.round(compliance);
}

// GET /api/v1/sla-compliance/domain/:domain_id - calculate domain-level SLA compliance across all SLAs
export async function handleSlaComplianceByDomainGet(req: Request, domainId: string): Promise<Response> {
  const url = new URL(req.url);
  const windowDays = parseWindowDays(url);

  if (!uuidAny.safeParse(domainId).success) {
    return error(400, "invalid_payload", "malformed domain_id", { domain_id: domainId });
  }
  const id = domainId;

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    // Fetch all SLAs for the domain
    const slasResult = await session.run(
      `MATCH (s:SLA {domain_id: $id}) WHERE s.archived_at IS NULL
       RETURN s.id AS id, s.name AS name, s.compliance_threshold AS compliance_threshold,
              s.target_value AS target_value, s.target_unit AS target_unit`,
      { id }
    );

    if (slasResult.records.length === 0) {
      return ok({
        domain_id: id,
        window_days: windowDays,
        total_slas: 0,
        slas: [],
        overall_compliance_rate: 100,
        overall_risk_score: 0,
      });
    }

    const slas = slasResult.records.map((r) => ({
      id: r.get("id"),
      name: r.get("name"),
      compliance_threshold: r.get("compliance_threshold"),
      target_value: r.get("target_value"),
      target_unit: r.get("target_unit"),
    }));

    // Calculate time window
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - windowDays);
    const windowStartIso = windowStart.toISOString();

    // Fetch breaches for all SLAs in the domain
    const slaIds = slas.map((s) => s.id);
    const breachesResult = await session.run(
      `MATCH (b:SLABreach)
       WHERE b.sla_id IN $slaIds AND b.breach_at >= $windowStart
       RETURN b.sla_id AS sla_id, b.breach_at AS breach_at, b.severity AS severity,
              b.resolution_status AS resolution_status, b.actual_value AS actual_value,
              b.target_value AS target_value
       ORDER BY b.breach_at DESC`,
      { slaIds, windowStart: windowStartIso }
    );

    const breachesBySla: Record<string, Array<{
      breach_at: string;
      severity: string;
      resolution_status: string;
      actual_value: number;
      target_value: number;
    }>> = {};

    breachesResult.records.forEach((r) => {
      const slaId = r.get("sla_id");
      if (!breachesBySla[slaId]) breachesBySla[slaId] = [];
      breachesBySla[slaId].push({
        breach_at: r.get("breach_at"),
        severity: r.get("severity"),
        resolution_status: r.get("resolution_status"),
        actual_value: r.get("actual_value"),
        target_value: r.get("target_value"),
      });
    });

    // Calculate compliance for each SLA
    const slaCompliance = slas.map((sla) => {
      const slaBreaches = breachesBySla[sla.id] || [];
      const complianceRate = calculateComplianceRate(slaBreaches, windowDays, sla.compliance_threshold);
      const riskScore = calculateRiskScore(slaBreaches, windowDays, sla.compliance_threshold);
      const totalBreaches = slaBreaches.length;
      const openBreaches = slaBreaches.filter((b) => b.resolution_status === "open").length;

      return {
        ...sla,
        compliance_rate: complianceRate,
        risk_score: riskScore,
        breaches: {
          total: totalBreaches,
          open: openBreaches,
        },
      };
    });

    // Calculate overall domain metrics
    const overallComplianceRate = slaCompliance.reduce((sum, s) => sum + s.compliance_rate, 0) / slaCompliance.length;
    const overallRiskScore = slaCompliance.reduce((sum, s) => sum + s.risk_score, 0) / slaCompliance.length;
    const totalBreaches = slaCompliance.reduce((sum, s) => sum + s.breaches.total, 0);
    const totalOpenBreaches = slaCompliance.reduce((sum, s) => sum + s.breaches.open, 0);

    return ok({
      domain_id: id,
      window_days: windowDays,
      total_slas: slas.length,
      slas: slaCompliance,
      overall_compliance_rate: Math.round(overallComplianceRate),
      overall_risk_score: Math.round(overallRiskScore),
      total_breaches: totalBreaches,
      total_open_breaches: totalOpenBreaches,
    });
  } finally {
    await session.close();
  }
}

// GET /api/v1/sla-compliance/all - aggregate SLA compliance across all non-archived SLAs
export async function handleSlaComplianceAllGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const windowDays = parseWindowDays(url);

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    const slasResult = await session.run(
      `MATCH (s:SLA) WHERE s.archived_at IS NULL
       RETURN s.id AS id, s.name AS name, s.compliance_threshold AS compliance_threshold,
              s.target_value AS target_value, s.target_unit AS target_unit, s.domain_id AS domain_id`,
    );

    if (slasResult.records.length === 0) {
      return ok({ window_days: windowDays, total_slas: 0, slas: [], overall_compliance_rate: 100, overall_risk_score: 0 });
    }

    const slas = slasResult.records.map((r) => ({
      id: r.get("id") as string,
      name: r.get("name") as string,
      compliance_threshold: r.get("compliance_threshold") as number,
      target_value: r.get("target_value") as number,
      target_unit: r.get("target_unit") as string,
      domain_id: r.get("domain_id") as string,
    }));

    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - windowDays);
    const windowStartIso = windowStart.toISOString();

    const slaIds = slas.map((s) => s.id);
    const breachesResult = await session.run(
      `MATCH (b:SLABreach)
       WHERE b.sla_id IN $slaIds AND b.breach_at >= $windowStart
       RETURN b.sla_id AS sla_id, b.severity AS severity, b.resolution_status AS resolution_status,
              b.actual_value AS actual_value, b.target_value AS target_value`,
      { slaIds, windowStart: windowStartIso },
    );

    const breachesBySla: Record<string, Array<{ breach_at: string; severity: string; resolution_status: string; actual_value: number; target_value: number }>> = {};
    breachesResult.records.forEach((r) => {
      const slaId = r.get("sla_id") as string;
      if (!breachesBySla[slaId]) breachesBySla[slaId] = [];
      breachesBySla[slaId].push({
        breach_at: "",
        severity: r.get("severity"),
        resolution_status: r.get("resolution_status"),
        actual_value: r.get("actual_value"),
        target_value: r.get("target_value"),
      });
    });

    const slaCompliance = slas.map((sla) => {
      const slaBreaches = breachesBySla[sla.id] || [];
      return {
        ...sla,
        compliance_rate: calculateComplianceRate(slaBreaches, windowDays, sla.compliance_threshold),
        risk_score: calculateRiskScore(slaBreaches, windowDays, sla.compliance_threshold),
        breaches: {
          total: slaBreaches.length,
          open: slaBreaches.filter((b) => b.resolution_status === "open").length,
        },
      };
    });

    const overallComplianceRate = slaCompliance.reduce((s, x) => s + x.compliance_rate, 0) / slaCompliance.length;
    const overallRiskScore = slaCompliance.reduce((s, x) => s + x.risk_score, 0) / slaCompliance.length;

    return ok({
      window_days: windowDays,
      total_slas: slas.length,
      slas: slaCompliance,
      overall_compliance_rate: Math.round(overallComplianceRate),
      overall_risk_score: Math.round(overallRiskScore),
      total_breaches: slaCompliance.reduce((s, x) => s + x.breaches.total, 0),
      total_open_breaches: slaCompliance.reduce((s, x) => s + x.breaches.open, 0),
    });
  } finally {
    await session.close();
  }
}
