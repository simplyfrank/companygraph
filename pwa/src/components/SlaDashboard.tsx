import { useState } from "react";
import { api } from "../api";
import { useFetch } from "../useFetch";
import { Card } from "./Card";
import { Button } from "./Button";
import { SlaBreachChart } from "./SlaBreachChart";
import { Loading, ErrorState } from "../views/_shared";
import styles from "./SlaDashboard.module.css";

interface SlaDashboardProps {
  domainId?: string;
  journeyId?: string;
}

export function SlaDashboard({ domainId, journeyId }: SlaDashboardProps) {
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("30d");
  const [selectedSla, setSelectedSla] = useState<string | null>(null);

  // Fetch all SLAs aligned to the target
  const slas = useFetch(
    () => {
      const targetType = domainId ? "domain" : "journey";
      const targetId = domainId || journeyId;
      return api.sla.getAlignments(targetType, targetId!);
    },
    [domainId, journeyId],
  );

  // Fetch SLA breaches for selected SLA
  const breaches = useFetch(
    () => selectedSla ? api.sla.getBreaches(selectedSla, "100") : Promise.resolve({ rows: [] }),
    [selectedSla],
  );

  if (slas.status === "loading") return <Loading what="SLA dashboard" />;
  if (slas.status === "error") return <ErrorState message={slas.error} />;

  const slaList = slas.data?.rows || [];

  const getTimeRangeDays = () => {
    switch (timeRange) {
      case "7d": return 7;
      case "30d": return 30;
      case "90d": return 90;
    }
  };

  const filteredBreaches = breaches.status === "ok" && breaches.data?.rows
    ? breaches.data.rows.filter((b: any) => {
        if (!b.occurred_at) return false;
        const daysAgo = (Date.now() - new Date(b.occurred_at).getTime()) / (1000 * 60 * 60 * 24);
        return daysAgo <= getTimeRangeDays();
      })
    : [];

  const calculateComplianceRate = (breachCount: number, totalMeasurements: number) => {
    if (totalMeasurements === 0) return 100;
    return ((totalMeasurements - breachCount) / totalMeasurements) * 100;
  };

  const getComplianceColor = (rate: number) => {
    if (rate >= 95) return "var(--success)";
    if (rate >= 80) return "var(--warn)";
    return "var(--danger)";
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "var(--danger)";
      case "high": return "var(--warn)";
      case "medium": return "var(--accent)";
      case "low": return "var(--muted)";
      default: return "var(--muted)";
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>SLA Compliance Dashboard</h2>
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
        {/* SLA Summary Cards */}
        {slaList.map((sla: any) => {
          const slaBreaches = breaches.status === "ok" && breaches.data?.rows
            ? breaches.data.rows.filter((b: any) => b.sla_id === sla.sla_id)
            : [];
          const recentBreaches = slaBreaches.filter((b: any) => {
            if (!b.occurred_at) return false;
            const daysAgo = (Date.now() - new Date(b.occurred_at).getTime()) / (1000 * 60 * 60 * 24);
            return daysAgo <= getTimeRangeDays();
          });
          
          // Estimate total measurements (this would ideally come from actual measurement data)
          const estimatedMeasurements = 100; // Placeholder
          const complianceRate = calculateComplianceRate(recentBreaches.length, estimatedMeasurements);
          const isCompliant = complianceRate >= sla.compliance_threshold;

          return (
            <div
              key={sla.sla_id}
              className={`${styles.slaCard} ${selectedSla === sla.sla_id ? styles.selected : ""}`}
              onClick={() => setSelectedSla(sla.sla_id)}
            >
              <Card title={sla.sla_name}>
                <div className={styles.slaSummary}>
                  <div className={styles.metricRow}>
                    <span className={styles.metricLabel}>Target</span>
                    <span className={styles.metricValue}>{sla.target_value} {sla.target_unit}</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span className={styles.metricLabel}>Threshold</span>
                    <span className={styles.metricValue}>{sla.compliance_threshold}%</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span className={styles.metricLabel}>Compliance</span>
                    <span className={styles.metricValue} style={{ color: getComplianceColor(complianceRate) }}>
                      {complianceRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className={styles.metricRow}>
                    <span className={styles.metricLabel}>Status</span>
                    <span
                      className={styles.statusBadge}
                      style={{
                        background: isCompliant ? "var(--success-soft)" : "var(--danger-soft)",
                        color: isCompliant ? "var(--success)" : "var(--danger)",
                      }}
                    >
                      {isCompliant ? "Compliant" : "Non-Compliant"}
                    </span>
                  </div>
                  <div className={styles.metricRow}>
                    <span className={styles.metricLabel}>Breaches</span>
                    <span className={styles.metricValue} style={{ color: recentBreaches.length > 0 ? "var(--danger)" : "var(--success)" }}>
                      {recentBreaches.length}
                    </span>
                  </div>
                  <div className={styles.metricRow}>
                    <span className={styles.metricLabel}>Critical</span>
                    <span className={styles.metricValue}>{sla.is_critical ? "Yes" : "No"}</span>
                  </div>
                </div>
              </Card>
            </div>
          );
        })}
      </div>

      {/* Detailed SLA View */}
      {selectedSla && (
        <Card title="SLA Breach Details">
          <div className={styles.detailHeader}>
            <Button tone="ghost" onClick={() => setSelectedSla(null)}>Close</Button>
          </div>
          <div style={{ marginBottom: "24px" }}>
            <SlaBreachChart 
              data={filteredBreaches.map((b: any) => ({
                date: b.occurred_at,
                breaches: 1,
                resolved: b.resolved_at ? 1 : 0,
              }))}
              slaName={slaList.find((s: any) => s.sla_id === selectedSla)?.sla_name || "SLA"}
            />
          </div>
          {filteredBreaches.length === 0 ? (
            <p className={styles.empty}>No breaches in selected time range.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Severity</th>
                  <th>Description</th>
                  <th>Actual</th>
                  <th>Target</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredBreaches.map((b: any) => (
                  <tr key={b.id}>
                    <td>{new Date(b.occurred_at).toLocaleDateString()}</td>
                    <td>
                      <span
                        className={styles.severityBadge}
                        style={{ color: getSeverityColor(b.severity) }}
                      >
                        {b.severity}
                      </span>
                    </td>
                    <td>{b.description || "—"}</td>
                    <td>{b.actual_value}</td>
                    <td>{b.target_value}</td>
                    <td>
                      <span
                        className={styles.statusBadge}
                        style={{
                          background: b.resolved_at ? "var(--success-soft)" : "var(--danger-soft)",
                          color: b.resolved_at ? "var(--success)" : "var(--danger)",
                        }}
                      >
                        {b.resolved_at ? "Resolved" : "Open"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
