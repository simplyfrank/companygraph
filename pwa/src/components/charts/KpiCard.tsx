import { Card } from "../Card";
import styles from "./KpiCard.module.css";

interface KpiCardProps {
  label: string;
  value: string | number;
  caption?: string | undefined;
  tone?: "good" | "warn" | "danger" | "neutral";
  delta?: {
    direction: "up" | "down" | "flat";
    value: string;
  };
}

export function KpiCard({ label, value, caption, tone, delta }: KpiCardProps) {
  return (
    <Card>
      <div className={styles.body}>
        <div className={styles.label}>{label}</div>
        <div className={`${styles.value} ${tone ? styles[`tone-${tone}`] : ""}`}>
          {value}
        </div>
        {delta && (
          <div className={`${styles.delta} ${styles[`delta-${delta.direction}`]}`}>
            {delta.direction === "up" ? "↑" : delta.direction === "down" ? "↓" : "→"} {delta.value}
          </div>
        )}
        {caption && <div className={styles.caption}>{caption}</div>}
      </div>
    </Card>
  );
}
