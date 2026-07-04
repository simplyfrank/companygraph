import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { BarChartCard, KpiCard, ENTITY_COLORS } from "../../components/charts";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import styles from "./Ops.module.css";

export function ExecOps() {
  const health = useFetch(() => api.healthz(), []);
  const stats = useFetch(() => api.stats(), []);

  const totalNodes = stats.status === "ok"
    ? Object.values(stats.data.nodes).reduce((a, b) => a + b, 0)
    : 0;
  const totalEdges = stats.status === "ok"
    ? Object.values(stats.data.edges).reduce((a, b) => a + b, 0)
    : 0;

  const nodeData = stats.status === "ok"
    ? Object.entries(stats.data.nodes)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ label: k, value: v, color: ENTITY_COLORS[k] ?? "var(--accent)" }))
    : [];

  const edgeData = stats.status === "ok"
    ? Object.entries(stats.data.edges)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ label: k, value: v, color: ENTITY_COLORS[k] ?? "var(--accent)" }))
    : [];

  return (
    <>
      <ViewHeader
        title="Operations"
        lede="Operational health of the companygraph platform. Owned by cto-analytics — this is the live graph-core view."
      />
      <div className={styles.tiles}>
        <KpiCard
          label="API status"
          value={health.status === "ok" ? (health.data.ok ? "ok" : "fail") : "—"}
          tone={health.status === "ok" && health.data.ok ? "good" : health.status === "ok" ? "danger" : "neutral"}
        />
        <KpiCard
          label="Neo4j"
          value={health.status === "ok" ? (health.data.neo4j.connected ? "connected" : "down") : "—"}
          tone={health.status === "ok" && health.data.neo4j.connected ? "good" : "danger"}
        />
        <KpiCard label="Total nodes" value={totalNodes} />
        <KpiCard label="Total edges" value={totalEdges} />
      </div>

      <div style={{ height: 24 }} />

      <div className={styles.dashboardGrid}>
        <BarChartCard
          title="Nodes by type"
          data={nodeData}
          yLabel="count"
        />
        <BarChartCard
          title="Edges by type"
          data={edgeData}
          yLabel="count"
        />
      </div>
    </>
  );
}
