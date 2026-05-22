import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { KeyValueList } from "../../components/KeyValueList";
import { GreyBlock } from "../../components/GreyBlock";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import styles from "./Ops.module.css";

export function ExecOps() {
  const health = useFetch(() => api.healthz(), []);
  const stats = useFetch(() => api.stats(), []);
  return (
    <>
      <ViewHeader
        title="Operations"
        lede="Operational health of the companygraph platform. Owned by cto-analytics — this is the live graph-core view."
      />
      <div className={styles.tiles}>
        <Card title="API health">
          {health.status === "loading" && <Loading what="health" />}
          {health.status === "error" && <ErrorState message={health.error} />}
          {health.status === "ok" && (
            <KeyValueList rows={[
              { label: "ok", value: health.data.ok ? "yes" : "no" },
              { label: "neo4j", value: health.data.neo4j.connected ? "connected" : "down" },
              { label: "version", value: health.data.neo4j.version ?? "—" },
            ]} />
          )}
        </Card>
        <Card title="Graph footprint">
          {stats.status === "ok" && (
            <KeyValueList rows={[
              { label: "domains",    value: stats.data.nodes.Domain ?? 0 },
              { label: "journeys",   value: stats.data.nodes.UserJourney ?? 0 },
              { label: "activities", value: stats.data.nodes.Activity ?? 0 },
              { label: "total edges", value: Object.values(stats.data.edges).reduce((a, b) => a + b, 0) },
            ]} />
          )}
        </Card>
      </div>
      <div style={{ marginTop: 24 }}>
        <GreyBlock label="Activity feed — owned by cto-analytics" height={200} />
      </div>
    </>
  );
}
