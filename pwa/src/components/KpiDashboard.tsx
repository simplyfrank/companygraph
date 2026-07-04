import { useState } from "react";
import { api } from "../api";
import { useFetch } from "../useFetch";
import { Card } from "./Card";
import { Button } from "./Button";
import { KpiTrendChart } from "./KpiTrendChart";
import { Loading, ErrorState } from "../views/_shared";
import styles from "./KpiDashboard.module.css";

interface KpiDashboardProps {
  domainId?: string;
  journeyId?: string;
}

export function KpiDashboard({ domainId, journeyId }: KpiDashboardProps) {
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("30d");
  const [selectedKpi, setSelectedKpi] = useState<string | null>(null);

  // Fetch all KPIs aligned to the target
  const kpis = useFetch(
    () => {
      const targetType = domainId ? "domain" : "journey";
      const targetId = domainId || journeyId;
      return api.kpi.getAlignments(targetType, targetId!);
    },
    [domainId, journeyId],
  );

  // Fetch KPI measurements for selected KPI
  const measurements = useFetch(
    () => selectedKpi ? api.kpi.getMeasurements(selectedKpi, 100) : Promise.resolve({ rows: [] }),
    [selectedKpi],
  );

  if (kpis.status === "loading") return <Loading what="KPI dashboard" />;
  if (kpis.status === "error") return <ErrorState message={kpis.error} />;

  const kpiList = kpis.data?.rows || [];

  const getTimeRangeDays = () => {
    switch (timeRange) {
      case "7d": return 7;
      case "30d": return 30;
      case "90d": return 90;
    }
  };

  const filteredMeasurements = measurements.status === "ok" && measurements.data?.rows 
    ? measurements.data.rows.filter((m: any) => {
        if (!m.measured_at) return false;
        const daysAgo = (Date.now() - new Date(m.measured_at).getTime()) / (1000 * 60 * 60 * 24);
        return daysAgo <= getTimeRangeDays();
      })
    : [];

  const calculateTrend = (values: number[]) => {
    if (values.length < 2) return { direction: "neutral", change: 0 };
    const latest = values[values.length - 1];
    const previous = values[values.length - 2];
    if (latest === undefined || previous === undefined || previous === 0) {
      return { direction: "neutral", change: 0 };
    }
    const change = ((latest - previous) / previous) * 100;
    return {
      direction: change > 0 ? "up" : change < 0 ? "down" : "neutral",
      change: Math.abs(change),
    };
  };

  const getTrendColor = (direction: string) => {
    switch (direction) {
      case "up": return "var(--success)";
      case "down": return "var(--danger)";
      default: return "var(--muted)";
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>KPI Performance Dashboard</h2>
        <div className={styles.timeRangeSelector}>
          {(["7d", "30d", "90d"] as const).map((range) => (
            <button
              key={range}
              className={`${styles.timeRangeButton} ${timeRange === range ? styles.active : ""}`}
              onClick={() => setTimeRange(range)}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.grid}>
        {/* KPI Summary Cards */}
        {kpiList.map((kpi: any) => {
          const kpiMeasurements = measurements.status === "ok" && measurements.data?.rows
            ? measurements.data.rows.filter((m: any) => m.kpi_id === kpi.kpi_id)
            : [];
          const values = kpiMeasurements.map((m: any) => m.actual_value).reverse();
          const trend = calculateTrend(values);
          const latest = values[values.length - 1];
          const target = kpi.kpi_target_value;

          const isOnTrack = latest !== undefined && target !== undefined
            ? latest >= target
            : null;

          return (
            <div
              key={kpi.kpi_id}
              className={`${styles.kpiCard} ${selectedKpi === kpi.kpi_id ? styles.selected : ""}`}
              onClick={() => setSelectedKpi(kpi.kpi_id)}
            >
              <Card title={kpi.kpi_name}>
                <div className={styles.kpiSummary}>
                  <div className={styles.metricRow}>
                    <span className={styles.metricLabel}>Latest</span>
                    <span className={styles.metricValue}>
                      {latest !== undefined ? `${latest} ${kpi.kpi_unit}` : "—"}
                    </span>
                  </div>
                  <div className={styles.metricRow}>
                    <span className={styles.metricLabel}>Target</span>
                    <span className={styles.metricValue}>{target} {kpi.kpi_unit}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span className={styles.metricLabel}>Status</span>
                    <span
                      className={styles.statusBadge}
                      style={{
                        background: isOnTrack === true ? "var(--success-soft)" : isOnTrack === false ? "var(--danger-soft)" : "var(--muted-soft)",
                        color: isOnTrack === true ? "var(--success)" : isOnTrack === false ? "var(--danger)" : "var(--muted)",
                      }}
                    >
                      {isOnTrack === true ? "On Track" : isOnTrack === false ? "Below Target" : "No Data"}
                    </span>
                  </div>
                  <div className={styles.metricRow}>
                    <span className={styles.metricLabel}>Trend</span>
                    <span className={styles.trend} style={{ color: getTrendColor(trend.direction) }}>
                      {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"} {trend.change.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </Card>
            </div>
          );
        })}
      </div>

      {/* Detailed KPI View */}
      {selectedKpi && (
        <Card title="KPI Performance Details">
          <div className={styles.detailHeader}>
            <Button tone="ghost" onClick={() => setSelectedKpi(null)}>Close</Button>
          </div>
          <div style={{ marginBottom: "24px" }}>
            <KpiTrendChart 
              data={filteredMeasurements.map((m: any) => ({
                date: m.measured_at,
                actual: m.actual_value,
                target: kpiList.find((k: any) => k.kpi_id === selectedKpi)?.kpi_target_value || 0,
              }))}
              kpiName={kpiList.find((k: any) => k.kpi_id === selectedKpi)?.kpi_name || "KPI"}
              unit={kpiList.find((k: any) => k.kpi_id === selectedKpi)?.kpi_unit || ""}
            />
          </div>
          {filteredMeasurements.length === 0 ? (
            <p className={styles.empty}>No measurements in selected time range.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Actual</th>
                  <th>Target</th>
                  <th>Variance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredMeasurements.map((m: any) => {
                  const kpi = kpiList.find((k: any) => k.kpi_id === selectedKpi);
                  if (!kpi) return null;
                  const target = kpi.kpi_target_value;
                  const variance = target !== undefined ? m.actual_value - target : 0;
                  const isOnTrack = variance >= 0;
                  return (
                    <tr key={m.id}>
                      <td>{new Date(m.measured_at).toLocaleDateString()}</td>
                      <td>{m.actual_value}</td>
                      <td>{target}</td>
                      <td style={{ color: isOnTrack ? "var(--success)" : "var(--danger)" }}>
                        {variance > 0 ? "+" : ""}{variance.toFixed(2)}
                      </td>
                      <td>
                        <span
                          className={styles.statusBadge}
                          style={{
                            background: isOnTrack ? "var(--success-soft)" : "var(--danger-soft)",
                            color: isOnTrack ? "var(--success)" : "var(--danger)",
                          }}
                        >
                          {isOnTrack ? "On Track" : "Below Target"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
