import { useId } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card } from "../Card";
import styles from "./ChartCard.module.css";

interface BarChartCardProps {
  title: string;
  data: { label: string; value: number; color?: string }[];
  xLabel?: string;
  yLabel?: string;
  barColor?: string;
  onClick?: (label: string) => void;
}

export function BarChartCard({
  title,
  data,
  xLabel,
  yLabel,
  barColor = "var(--accent)",
  onClick,
}: BarChartCardProps) {
  const id = useId();

  if (data.length === 0 || data.every((d) => d.value === 0)) {
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
          <BarChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={{ stroke: "var(--border)" }}
              angle={data.length > 6 ? -35 : 0}
              textAnchor={data.length > 6 ? "end" : "middle"}
              height={data.length > 6 ? 50 : 30}
              {...(xLabel ? { label: { value: xLabel, position: "insideBottom" as const, offset: -10, fill: "var(--muted)", fontSize: 11 } } : {})}
            />
            <YAxis
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={{ stroke: "var(--border)" }}
              {...(yLabel ? { label: { value: yLabel, angle: -90, position: "insideLeft" as const, fill: "var(--muted)", fontSize: 11 } } : {})}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                fontSize: 12,
                color: "var(--fg)",
              }}
            />
            <Bar
              dataKey="value"
              radius={[4, 4, 0, 0]}
              onClick={(_, index) => {
                const label = data[index]?.label;
                if (label && onClick) onClick(label);
              }}
              style={{ cursor: onClick ? "pointer" : "default" }}
            >
              {data.map((entry, index) => (
                <Cell key={`${id}-${index}`} fill={entry.color ?? barColor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
