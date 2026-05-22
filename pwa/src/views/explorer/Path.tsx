import { useState } from "react";
import { api } from "../../api";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { KeyValueList } from "../../components/KeyValueList";
import { GreyBlock } from "../../components/GreyBlock";
import { ViewHeader } from "../_shared";
import styles from "./Path.module.css";

interface PathResult {
  length: number;
  nodes: string[];
  edges: string[];
}

export function ExplorerPath() {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [maxDepth, setMaxDepth] = useState(4);
  const [result, setResult] = useState<{ status: "idle" } | { status: "loading" } | { status: "ok"; rows: PathResult[] } | { status: "error"; error: string }>(
    { status: "idle" },
  );

  const onFind = async (): Promise<void> => {
    if (!fromId || !toId) return;
    setResult({ status: "loading" });
    try {
      const r = await api.findPath(fromId, toId, maxDepth);
      setResult({ status: "ok", rows: r.rows as PathResult[] });
    } catch (e) {
      setResult({ status: "error", error: String((e as Error).message) });
    }
  };

  return (
    <>
      <ViewHeader
        title="Path-finding"
        lede="Single shortest path between two nodes via Neo4j shortestPath(). Capped at maxDepth ≤ 8 by NFR-09. 5 s per-tx timeout."
      />
      <Card title="Inputs">
        <div className={styles.form}>
          <label className={styles.field}>
            <span>From id</span>
            <input value={fromId} onChange={(e) => setFromId(e.currentTarget.value)} placeholder="UUIDv7" />
          </label>
          <label className={styles.field}>
            <span>To id</span>
            <input value={toId} onChange={(e) => setToId(e.currentTarget.value)} placeholder="UUIDv7" />
          </label>
          <label className={styles.field}>
            <span>maxDepth</span>
            <input
              type="number" min={1} max={8}
              value={maxDepth}
              onChange={(e) => setMaxDepth(Number(e.currentTarget.value))}
            />
          </label>
          <Button tone="primary" onClick={onFind}>Find path</Button>
        </div>
      </Card>

      <div style={{ height: 24 }} />

      <Card title="Result">
        {result.status === "idle" && (
          <GreyBlock label="enter two ids and a depth — try the journey activity ids from Explorer → Journey" height={140} />
        )}
        {result.status === "loading" && <p style={{ color: "var(--muted)" }}>Searching…</p>}
        {result.status === "error" && <p style={{ color: "var(--danger)" }}>{result.error}</p>}
        {result.status === "ok" && result.rows.length === 0 && (
          <p style={{ color: "var(--muted)" }}>No path within depth {maxDepth}.</p>
        )}
        {result.status === "ok" && result.rows[0] && (
          <KeyValueList rows={[
            { label: "length", value: result.rows[0].length },
            { label: "node hops", value: result.rows[0].nodes.length },
            { label: "edge hops", value: result.rows[0].edges.length },
            { label: "nodes", value: <code className={styles.id}>{result.rows[0].nodes.join(" → ")}</code> },
          ]} />
        )}
      </Card>
    </>
  );
}
