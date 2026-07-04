import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { Card } from "../Card";
import styles from "./ChartCard.module.css";

interface LineChartCardProps {
  title: string;
  data: { label: string; value: number }[];
  xLabel?: string;
  yLabel?: string;
  lineColor?: string;
  areaFill?: boolean;
}

export function LineChartCard({
  title,
  data,
  xLabel,
  yLabel,
  lineColor = "var(--accent)",
  areaFill = false,
}: LineChartCardProps) {
  return (
    <Card title={title}>
      <div className={styles.chartContainer}>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={{ stroke: "var(--border)" }}
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
            <Line
              type="monotone"
              dataKey="value"
              stroke={lineColor}
              strokeWidth={2}
              dot={{ fill: lineColor, strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
              fillOpacity={areaFill ? 0.15 : 0}
              fill={areaFill ? lineColor : undefined}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
