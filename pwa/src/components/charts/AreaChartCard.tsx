import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { Card } from "../Card";
import styles from "./ChartCard.module.css";

interface AreaChartCardProps {
  title: string;
  data: { label: string; value: number }[];
  xLabel?: string;
  yLabel?: string;
  areaColor?: string;
}

export function AreaChartCard({
  title,
  data,
  xLabel,
  yLabel,
  areaColor = "var(--accent)",
}: AreaChartCardProps) {
  return (
    <Card title={title}>
      <div className={styles.chartContainer}>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <defs>
              <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={areaColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={areaColor} stopOpacity={0} />
              </linearGradient>
            </defs>
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
            <Area
              type="monotone"
              dataKey="value"
              stroke={areaColor}
              strokeWidth={2}
              fill={`url(#grad-${title})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
