// KPI trend analysis handlers (KPI-SLA-07)
// GET /api/v1/kpi-trends/:kpi_id - calculate KPI trends, moving averages, and anomaly detection

import type { Driver } from "neo4j-driver";
import { getDriver } from "../neo4j/driver";
import { ok, error, parseId } from "./_helpers";

// GET /api/v1/kpi-trends/:kpi_id - calculate KPI trends with moving averages and anomaly detection
export async function handleKpiTrendsGet(req: Request, kpiId: string): Promise<Response> {
  const url = new URL(req.url);
  const windowDays = parseInt(url.searchParams.get("window_days") || "30", 10);
  const movingAveragePeriod = parseInt(url.searchParams.get("ma_period") || "7", 10);
  const anomalyThreshold = parseFloat(url.searchParams.get("anomaly_threshold") || "2.0");

  const id = parseId(kpiId);
  if (!id) return error(400, "invalid_payload", "malformed kpi_id", { kpi_id: kpiId });

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    // Verify KPI exists
    const kpiCheck = await session.run("MATCH (k:KPI {id: $id}) WHERE k.archived_at IS NULL RETURN k", { id });
    if (kpiCheck.records.length === 0) {
      return error(404, "not_found", "KPI not found or archived", { kpi_id: id });
    }

    // Fetch measurements within the time window
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - windowDays);
    const windowStartIso = windowStart.toISOString();

    const measurementsResult = await session.run(
      `MATCH (m:KPIMeasurement {kpi_id: $id})
       WHERE m.measured_at >= $windowStart
       RETURN m.id AS id, m.measured_at AS measured_at, m.value AS value
       ORDER BY m.measured_at ASC`,
      { id, windowStart: windowStartIso }
    );

    const measurements = measurementsResult.records.map((r) => ({
      id: r.get("id"),
      measured_at: r.get("measured_at"),
      value: r.get("value"),
    })) as Array<{ id: string; measured_at: string; value: number }>;

    if (measurements.length === 0) {
      return ok({
        kpi_id: id,
        window_days: windowDays,
        measurements: [],
        trend: null,
        moving_average: [],
        anomalies: [],
      });
    }

    // Calculate trend (linear regression)
    const trend = calculateLinearRegression(measurements);

    // Calculate moving average
    const movingAverage = calculateMovingAverage(measurements, movingAveragePeriod);

    // Detect anomalies (values outside threshold standard deviations from moving average)
    const anomalies = detectAnomalies(measurements, movingAverage, anomalyThreshold);

    return ok({
      kpi_id: id,
      window_days: windowDays,
      ma_period: movingAveragePeriod,
      anomaly_threshold: anomalyThreshold,
      measurements,
      trend,
      moving_average: movingAverage,
      anomalies,
    });
  } finally {
    await session.close();
  }
}

// Linear regression calculation (slope, intercept, r_squared)
function calculateLinearRegression(measurements: Array<{ measured_at: string; value: number }>) {
  const n = measurements.length;
  if (n < 2) return null;

  // Convert timestamps to numeric values (days since first measurement)
  const firstTime = new Date(measurements[0].measured_at).getTime();
  const x = measurements.map((m) => (new Date(m.measured_at).getTime() - firstTime) / (1000 * 60 * 60 * 24));
  const y = measurements.map((m) => m.value);

  // Calculate sums
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, xi, i) => a + xi * y[i], 0);
  const sumX2 = x.reduce((a, xi) => a + xi * xi, 0);
  const sumY2 = y.reduce((a, yi) => a + yi * yi, 0);

  // Calculate slope and intercept
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R-squared
  const yMean = sumY / n;
  const ssTotal = y.reduce((a, yi) => a + Math.pow(yi - yMean, 2), 0);
  const ssResidual = y.reduce((a, yi, i) => a + Math.pow(yi - (slope * x[i] + intercept), 2), 0);
  const rSquared = ssTotal === 0 ? 1 : 1 - ssResidual / ssTotal;

  return {
    slope: slope / 7, // Convert from per-day to per-week
    intercept,
    r_squared: rSquared,
    direction: slope > 0.001 ? "increasing" : slope < -0.001 ? "decreasing" : "stable",
  };
}

// Simple moving average calculation
function calculateMovingAverage(measurements: Array<{ measured_at: string; value: number }>, period: number) {
  const result: Array<{ measured_at: string; value: number; ma: number | null }> = [];

  for (let i = 0; i < measurements.length; i++) {
    if (i < period - 1) {
      result.push({
        measured_at: measurements[i].measured_at,
        value: measurements[i].value,
        ma: null,
      });
    } else {
      const window = measurements.slice(i - period + 1, i + 1);
      const ma = window.reduce((a, m) => a + m.value, 0) / period;
      result.push({
        measured_at: measurements[i].measured_at,
        value: measurements[i].value,
        ma,
      });
    }
  }

  return result;
}

// Anomaly detection using standard deviation from moving average
function detectAnomalies(
  measurements: Array<{ measured_at: string; value: number }>,
  movingAverage: Array<{ measured_at: string; ma: number | null }>,
  threshold: number
) {
  const anomalies: Array<{
    id: string;
    measured_at: string;
    value: number;
    expected: number;
    deviation: number;
    severity: "minor" | "moderate" | "severe";
  }> = [];

  // Calculate standard deviation of residuals
  const residuals: number[] = [];
  for (let i = 0; i < movingAverage.length; i++) {
    if (movingAverage[i].ma !== null) {
      residuals.push(Math.abs(measurements[i].value - movingAverage[i].ma));
    }
  }

  if (residuals.length === 0) return anomalies;

  const meanResidual = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const stdDev = Math.sqrt(residuals.reduce((a, r) => a + Math.pow(r - meanResidual, 2), 0) / residuals.length);

  // Detect anomalies
  for (let i = 0; i < movingAverage.length; i++) {
    const ma = movingAverage[i].ma;
    if (ma !== null) {
      const deviation = Math.abs(measurements[i].value - ma);
      const zScore = stdDev === 0 ? 0 : deviation / stdDev;

      if (zScore > threshold) {
        let severity: "minor" | "moderate" | "severe" = "minor";
        if (zScore > threshold * 2) severity = "severe";
        else if (zScore > threshold * 1.5) severity = "moderate";

        anomalies.push({
          id: measurements[i].id,
          measured_at: measurements[i].measured_at,
          value: measurements[i].value,
          expected: ma,
          deviation,
          severity,
        });
      }
    }
  }

  return anomalies;
}
