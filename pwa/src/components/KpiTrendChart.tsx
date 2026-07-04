import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Area, AreaChart } from "recharts";

interface KpiTrendChartProps {
  data: Array<{
    date: string;
    actual: number;
    target: number;
  }>;
  kpiName: string;
  unit: string;
}

export function KpiTrendChart({ data, kpiName, unit }: KpiTrendChartProps) {
  if (data.length === 0) {
    return (
      <div style={{ padding: "32px", textAlign: "center", color: "var(--muted)" }}>
        No measurement data available
      </div>
    );
  }

  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString(),
    actual: d.actual,
    target: d.target,
  }));

  const avgActual = data.reduce((sum, d) => sum + d.actual, 0) / data.length;
  const maxActual = Math.max(...data.map(d => d.actual));
  const minActual = Math.min(...data.map(d => d.actual));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
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
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>{label}</div>
          {payload.map((entry: any, index: number) => (
            <div key={index} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <div style={{ 
                width: "8px", 
                height: "8px", 
                borderRadius: "50%", 
                background: entry.color 
              }} />
              <span style={{ color: "var(--muted)" }}>{entry.name}:</span>
              <span style={{ fontWeight: 600 }}>{entry.value} {unit}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ width: "100%" }}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center", 
        marginBottom: "16px" 
      }}>
        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>{kpiName}</h4>
        <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "var(--muted)" }}>
          <span>Avg: {avgActual.toFixed(1)} {unit}</span>
          <span>Max: {maxActual.toFixed(1)} {unit}</span>
          <span>Min: {minActual.toFixed(1)} {unit}</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={350}>
        <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis 
            dataKey="date" 
            stroke="var(--muted)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            dy={10}
          />
          <YAxis 
            stroke="var(--muted)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            dx={-10}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            verticalAlign="top" 
            height={36}
            iconType="circle"
            wrapperStyle={{ fontSize: "12px" }}
          />
          <ReferenceLine y={avgActual} stroke="var(--muted)" strokeDasharray="3 3" label="Avg" />
          <Area 
            type="monotone" 
            dataKey="actual" 
            stroke="var(--accent)" 
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#actualGradient)"
            name={`Actual (${unit})`}
          />
          <Line 
            type="monotone" 
            dataKey="target" 
            stroke="var(--success)" 
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            name={`Target (${unit})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
