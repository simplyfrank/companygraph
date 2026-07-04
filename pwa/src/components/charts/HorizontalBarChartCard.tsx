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

interface HorizontalBarChartCardProps {
  title: string;
  data: { label: string; value: number; color?: string }[];
  xLabel?: string;
  barColor?: string;
  height?: number;
}

export function HorizontalBarChartCard({
  title,
  data,
  xLabel,
  barColor = "var(--accent)",
  height = 260,
}: HorizontalBarChartCardProps) {
  const id = useId();
  // Sort descending for better readability
  const sorted = [...data].sort((a, b) => b.value - a.value);

  return (
    <Card title={title}>
      <div className={styles.chartContainer}>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={sorted}
            layout="vertical"
            margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={{ stroke: "var(--border)" }}
              {...(xLabel ? { label: { value: xLabel, position: "insideBottom" as const, offset: -10, fill: "var(--muted)", fontSize: 11 } } : {})}
            />
            <YAxis
              dataKey="label"
              type="category"
              tick={{ fill: "var(--fg)", fontSize: 11 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={{ stroke: "var(--border)" }}
              width={120}
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
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {sorted.map((entry, index) => (
                <Cell key={`${id}-${index}`} fill={entry.color ?? barColor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
