import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { KeyValueList } from "../../components/KeyValueList";
import { Pill } from "../../components/Pill";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import styles from "./Export.module.css";

export function DataExport() {
  const data = useFetch(() => api.exportJson(), []);

  const download = (): void => {
    if (data.status !== "ok") return;
    const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `companygraph-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <ViewHeader
        title="Bulk export"
        lede="GET /api/v1/export — round-trippable through POST /api/v1/import. Deterministically ordered by id."
      />
      <div className={styles.layout}>
        <Card
          title="Snapshot"
          actions={data.status === "ok" ? (
            <>
              <Pill tone="accent">application/json</Pill>
              <Button tone="primary" onClick={download}>Download</Button>
              <Button href="/api/v1/export.ndjson" tone="ghost">NDJSON</Button>
            </>
          ) : null}
        >
          {data.status === "loading" && <Loading what="export" />}
          {data.status === "error" && <ErrorState message={data.error} />}
          {data.status === "ok" && (
            <KeyValueList rows={[
              { label: "nodes", value: data.data.nodes.length },
              { label: "edges", value: data.data.edges.length },
              { label: "size",  value: `${Math.round(JSON.stringify(data.data).length / 1024)} KB` },
              { label: "ordering", value: "by id ASC, nodes-first then edges-first" },
            ]} />
          )}
        </Card>

        <Card title="Preview (first 20 nodes)">
          {data.status === "ok" && (
            <pre className={styles.preview}>{JSON.stringify(data.data.nodes.slice(0, 20), null, 2)}</pre>
          )}
        </Card>
      </div>
    </>
  );
}
