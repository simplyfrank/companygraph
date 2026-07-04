import { calculateHealthScore, getHealthTier, getHealthColor } from "../../lib/journeyHealth";
import styles from "./JourneyComparisonInline.module.css";

interface JourneyComparisonInlineProps {
  journeyIds: string[];
  journeysData: Array<{
    id: string;
    name: string;
    healthScore: number;
    healthTier: string;
    accountable_role: string | null;
    verificationStatus: string;
    compliance_tags: string[];
  }>;
  onClose: () => void;
}

export function JourneyComparisonInline({ journeyIds, journeysData, onClose }: JourneyComparisonInlineProps) {
  const metrics = [
    { key: "healthScore" as const, label: "Health Score", format: (v: number) => v.toFixed(0) },
    { key: "healthTier" as const, label: "Health Tier", format: (v: string) => v },
    { key: "accountable_role" as const, label: "Accountable Role", format: (v: string | null) => v || "—" },
    { key: "verificationStatus" as const, label: "Verification", format: (v: string) => v },
    { key: "compliance_tags" as const, label: "Compliance Tags", format: (v: string[]) => v.length > 0 ? v.join(", ") : "—" },
  ];

  const getMetricValue = (j: JourneyComparisonInlineProps["journeysData"][0], key: string) => {
    switch (key) {
      case "healthScore": return j.healthScore;
      case "healthTier": return j.healthTier;
      case "accountable_role": return j.accountable_role;
      case "verificationStatus": return j.verificationStatus;
      case "compliance_tags": return j.compliance_tags;
      default: return 0;
    }
  };

  return (
    <div className={styles.comparisonInline}>
      <div className={styles.header}>
        <h3 className={styles.title}>Journey Comparison</h3>
        <button className={styles.closeButton} onClick={onClose}>×</button>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Metric</th>
            {journeysData.map((j) => (
              <th key={j.id}>{j.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => (
            <tr key={metric.key}>
              <td className={styles.metricLabel}>{metric.label}</td>
              {journeysData.map((j) => (
                <td key={`${j.id}-${metric.key}`}>
                  {metric.format(getMetricValue(j, metric.key) as never)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
