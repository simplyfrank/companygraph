import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { PieChartCard, KpiCard, ENTITY_COLORS } from "../../components/charts";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import styles from "./Overview.module.css";

export function AnalyticsOverview() {
  const stats = useFetch(() => api.stats(), []);

  if (stats.status === "loading") return <Loading what="overview" />;
  if (stats.status === "error") return <ErrorState message={stats.error} />;

  const totalNodes = Object.values(stats.data.nodes).reduce((a, b) => a + b, 0);
  const totalEdges = Object.values(stats.data.edges).reduce((a, b) => a + b, 0);
  const density = totalNodes > 0 ? (totalEdges / totalNodes).toFixed(2) : "0";
  const activities = stats.data.nodes.Activity ?? 0;
  const journeys = stats.data.nodes.UserJourney ?? 0;
  const avgActivities = journeys > 0 ? (activities / journeys).toFixed(1) : "0";

  const nodeDistribution = Object.entries(stats.data.nodes)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ label: k, value: v, color: ENTITY_COLORS[k] ?? "var(--accent)" }));

  const edgeDistribution = Object.entries(stats.data.edges)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ label: k, value: v, color: ENTITY_COLORS[k] ?? "var(--accent)" }));

  return (
    <>
      <ViewHeader
        title="Analytics overview"
        lede="Whole-graph KPIs. Deeper metrics (centrality, modularity, redundancy) live in the Complexity tab — those are owned by cto-analytics."
      />
      <div className={styles.tiles}>
        <KpiCard label="Total nodes" value={totalNodes} />
        <KpiCard label="Total edges" value={totalEdges} />
        <KpiCard label="Density (E/N)" value={density} />
        <KpiCard label="Avg activities / journey" value={avgActivities} />
        <KpiCard label="Domains" value={stats.data.nodes.Domain ?? 0} />
        <KpiCard label="Systems" value={stats.data.nodes.System ?? 0} />
      </div>

      <div style={{ height: 24 }} />

      <div className={styles.dashboardGrid}>
        <PieChartCard
          title="Node distribution"
          data={nodeDistribution}
          donut
        />
        <PieChartCard
          title="Edge type distribution"
          data={edgeDistribution}
          donut
        />
      </div>
    </>
  );
}
