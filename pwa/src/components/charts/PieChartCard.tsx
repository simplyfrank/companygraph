import { useId } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card } from "../Card";
import styles from "./ChartCard.module.css";

interface PieChartCardProps {
  title: string;
  data: { label: string; value: number; color?: string }[];
  donut?: boolean;
  innerRadius?: number;
  onClick?: (label: string) => void;
}

export function PieChartCard({
  title,
  data,
  donut = false,
  innerRadius = 60,
  onClick,
}: PieChartCardProps) {
  const id = useId();

  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <Card title={title}>
        <div className={styles.empty}>No data</div>
      </Card>
    );
  }

  return (
    <Card title={title}>
      <div className={styles.chartContainer}>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={90}
              innerRadius={donut ? innerRadius : 0}
              stroke="var(--surface)"
              strokeWidth={2}
              onClick={(entry) => {
                const label = (entry as unknown as { label?: string }).label;
                if (label && onClick) onClick(label);
              }}
              style={{ cursor: onClick ? "pointer" : "default" }}
            >
              {data.map((entry, index) => (
                <Cell key={`${id}-${index}`} fill={entry.color ?? "var(--accent)"} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                fontSize: 12,
                color: "var(--fg)",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className={styles.legendInline}>
          {data.map((entry, index) => (
            <div key={`${id}-legend-${index}`} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: entry.color ?? "var(--accent)" }} />
              <span className={styles.legendLabel}>{entry.label}</span>
              <span className={styles.legendValue}>{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
