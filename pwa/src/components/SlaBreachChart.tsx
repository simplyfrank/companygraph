import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

interface SlaBreachChartProps {
  data: Array<{
    date: string;
    breaches: number;
    resolved: number;
  }>;
  slaName: string;
}

export function SlaBreachChart({ data, slaName }: SlaBreachChartProps) {
  if (data.length === 0) {
    return (
      <div style={{ padding: "32px", textAlign: "center", color: "var(--muted)" }}>
        No breach data available
      </div>
    );
  }

  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString(),
    breaches: d.breaches,
    resolved: d.resolved,
    unresolved: d.breaches - d.resolved,
  }));

  const totalBreaches = data.reduce((sum, d) => sum + d.breaches, 0);
  const totalResolved = data.reduce((sum, d) => sum + d.resolved, 0);
  const resolutionRate = totalBreaches > 0 ? ((totalResolved / totalBreaches) * 100).toFixed(1) : "0";

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "12px",
          boxShadow: "0 4px 12px color-mix(in oklch, var(--fg) 10%, transparent)",
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
              <span style={{ fontWeight: 600 }}>{entry.value}</span>
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
        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>{slaName}</h4>
        <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "var(--muted)" }}>
          <span>Total: {totalBreaches}</span>
          <span>Resolved: {totalResolved}</span>
          <span style={{ color: "var(--success)" }}>Rate: {resolutionRate}%</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
          <Bar 
            dataKey="breaches" 
            name="Total Breaches"
            radius={[4, 4, 0, 0]}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill="var(--danger)" />
            ))}
          </Bar>
          <Bar 
            dataKey="resolved" 
            name="Resolved"
            radius={[4, 4, 0, 0]}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill="var(--success)" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
