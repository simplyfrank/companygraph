import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface HealthDistributionChartProps {
  data: {
    healthy: number;
    "needs-attention": number;
    critical: number;
  };
  title?: string;
}

const COLORS = {
  healthy: "var(--good)",
  "needs-attention": "var(--warn)",
  critical: "var(--danger)",
};

export function HealthDistributionChart({ data, title }: HealthDistributionChartProps) {
  const total = data.healthy + data["needs-attention"] + data.critical;
  
  if (total === 0) {
    return (
      <div style={{ padding: "32px", textAlign: "center", color: "var(--muted)" }}>
        No health data available
      </div>
    );
  }

  const chartData = [
    { name: "Healthy", value: data.healthy, color: COLORS.healthy },
    { name: "Needs Attention", value: data["needs-attention"], color: COLORS["needs-attention"] },
    { name: "Critical", value: data.critical, color: COLORS.critical },
  ];

  const healthyPercent = ((data.healthy / total) * 100).toFixed(0);
  const needsAttentionPercent = ((data["needs-attention"] / total) * 100).toFixed(0);
  const criticalPercent = ((data.critical / total) * 100).toFixed(0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const entry = payload[0];
      const percent = ((entry.value / total) * 100).toFixed(1);
      return (
        <div style={{
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "12px",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
          color: "var(--fg)",
          fontSize: "13px",
        }}>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>{entry.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ 
              width: "8px", 
              height: "8px", 
              borderRadius: "50%", 
              background: entry.color 
            }} />
            <span style={{ color: "var(--muted)" }}>Count:</span>
            <span style={{ fontWeight: 600 }}>{entry.value}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
            <span style={{ color: "var(--muted)" }}>Percentage:</span>
            <span style={{ fontWeight: 600 }}>{percent}%</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null; // Don't show label for small slices
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="var(--fg)" 
        textAnchor={x > cx ? "start" : "end"} 
        dominantBaseline="central"
        fontSize="11"
        fontWeight={600}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div style={{ width: "100%" }}>
      {title && <h4 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: 600 }}>{title}</h4>}
      <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
              label={renderCustomizedLabel}
              labelLine={false}
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.color}
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ minWidth: "140px" }}>
          <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "12px" }}>Distribution</div>
          {chartData.map((entry) => (
            <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <div style={{ 
                width: "12px", 
                height: "12px", 
                borderRadius: "50%", 
                background: entry.color,
                flexShrink: 0
              }} />
              <div style={{ fontSize: "12px" }}>
                <div style={{ fontWeight: 500 }}>{entry.name}</div>
                <div style={{ color: "var(--muted)", fontSize: "11px" }}>
                  {entry.value} ({((entry.value / total) * 100).toFixed(0)}%)
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
