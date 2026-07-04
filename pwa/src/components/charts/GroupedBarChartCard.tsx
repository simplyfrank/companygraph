import { useId } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card } from "../Card";
import styles from "./ChartCard.module.css";

interface GroupedBarChartCardProps {
  title: string;
  data: Record<string, string | number>[];
  bars: { dataKey: string; color: string; label?: string }[];
  xLabel?: string;
  yLabel?: string;
  height?: number;
}

export function GroupedBarChartCard({
  title,
  data,
  bars,
  xLabel,
  yLabel,
  height = 280,
}: GroupedBarChartCardProps) {
  const id = useId();
  return (
    <Card title={title}>
      <div className={styles.chartContainer}>
        <ResponsiveContainer width="100%" height={height}>
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
            <Legend
              wrapperStyle={{ fontSize: 11, color: "var(--muted)" }}
            />
            {bars.map((b) => (
              <Bar
                key={`${id}-${b.dataKey}`}
                dataKey={b.dataKey}
                name={b.label ?? b.dataKey}
                fill={b.color}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
