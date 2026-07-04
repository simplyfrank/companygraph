import { calculateHealthScore } from "../../lib/domainHealth";
import styles from "./DomainComparisonInline.module.css";

interface DomainComparisonInlineProps {
  domainIds: string[];
  domainsData: any[];
  onClose: () => void;
}

export function DomainComparisonInline({ domainIds, domainsData, onClose }: DomainComparisonInlineProps) {
  // Calculate health scores for each domain
  const domainsWithHealth = domainsData.map((d) => ({
    ...d,
    health_score: calculateHealthScore({
      sla_breach_rate: d.sla_breach_rate || 0,
      handoff_complexity: 0,
      sod_conflicts: 0,
      initiative_completion: 0,
    }),
  }));

  const metrics = [
    { key: "health_score", label: "Health Score", format: (v: number) => v.toFixed(0) },
    { key: "journeys", label: "Journeys", format: (v: number) => v },
    { key: "activities", label: "Activities", format: (v: number) => v },
    { key: "sla_breaches", label: "SLA Breaches", format: (v: number) => v },
    { key: "sla_breach_rate", label: "SLA Breach Rate", format: (v: number) => `${(v * 100).toFixed(1)}%` },
  ];

  return (
    <div className={styles.comparisonInline}>
      <div className={styles.header}>
        <h3 className={styles.title}>Domain Comparison</h3>
        <button className={styles.closeButton} onClick={onClose}>×</button>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Metric</th>
            {domainsWithHealth.map((d) => (
              <th key={d.id}>{d.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => (
            <tr key={metric.key}>
              <td className={styles.metricLabel}>{metric.label}</td>
              {domainsWithHealth.map((d) => (
                <td key={`${d.id}-${metric.key}`}>
                  {metric.format(d[metric.key] || 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
