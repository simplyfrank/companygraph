import { useEffect, useState } from "react";
import { api } from "../../api";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { ViewHeader } from "../_shared";
import {
  hydrateNodesByIds,
  hydrateEdgesByIds,
} from "../../data/cypher-queries";
import styles from "./Path.module.css";

// FR-10 / AC-07 — PathFinder view.
//
// Response states (design §4.8):
//   idle              — pre-search
//   loading           — request in flight
//   success (1 row)   — render hops with edge labels + node labels
//   no-path           — "No path within depth N — try increasing depth, or…"
//   depth_exceeded    — "Max depth is 8 (graph-core/NFR-09)"
//   query_timeout     — "Search timed out after 5 s…"
//   result_truncated  — "More than 1000 paths matched…"
//   neo4j_unreachable — "Service offline — try again in a moment"
//
// Depth slider is clamped client-side to 1..8 so `?depth=9` direct-fiddle
// renders the clamp + hint without firing the API call.
//
// After api.findPath returns id-arrays, two parallel cypher queries
// hydrate node labels + names and edge types (C-08 fix). Cypher doesn't
// preserve $ids ordering, so the client re-orders via a Map.

const MAX_DEPTH = 8;
const MIN_DEPTH = 1;

interface PathRow {
  length: number;
  nodes: string[];
  edges: string[];
}

interface HydratedNode { id: string; label: string; name: string }
interface HydratedEdge { id: string; type: string }

interface HydratedPath {
  length: number;
  nodes: HydratedNode[];
  edges: HydratedEdge[];
}

type ResultState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; path: HydratedPath }
  | { kind: "no_path"; depth: number }
  | { kind: "depth_exceeded" }
  | { kind: "query_timeout" }
  | { kind: "result_truncated" }
  | { kind: "neo4j_unreachable" }
  | { kind: "error"; message: string };

function clampDepth(raw: number): number {
  if (Number.isNaN(raw)) return 4;
  return Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, Math.round(raw)));
}

function orderedById<T extends { id: string }>(orderedIds: string[], rows: T[]): T[] {
  const map = new Map<string, T>(rows.map((r) => [r.id, r]));
  const out: T[] = [];
  for (const id of orderedIds) {
    const row = map.get(id);
    if (row) out.push(row);
  }
  return out;
}

export function ExplorerPath() {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [rawDepth, setRawDepth] = useState(4);
  const [result, setResult] = useState<ResultState>({ kind: "idle" });

  // Read ?depth= on mount so direct URL-fiddle drives the clamped value.
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
    const d = params.get("depth");
    if (d !== null) {
      const parsed = Number(d);
      // If the user typed > MAX_DEPTH, clamp and flag — render "Max depth
      // is 8" hint without firing the request.
      if (!Number.isNaN(parsed) && parsed > MAX_DEPTH) {
        setRawDepth(MAX_DEPTH);
        setResult({ kind: "depth_exceeded" });
        return;
      }
      setRawDepth(clampDepth(parsed));
    }
  }, []);

  const depth = clampDepth(rawDepth);
  const depthOutOfRange = rawDepth !== depth;

  const onFind = async (): Promise<void> => {
    if (!fromId.trim() || !toId.trim()) return;
    if (depthOutOfRange) {
      setResult({ kind: "depth_exceeded" });
      return;
    }
    setResult({ kind: "loading" });
    try {
      const findRes = await api.findPath(fromId.trim(), toId.trim(), depth);
      const rows = findRes.rows as PathRow[];
      if (rows.length === 0) {
        setResult({ kind: "no_path", depth });
        return;
      }
      const row = rows[0]!;
      // Two parallel cypher hydrations (C-08 fix).
      const [nodeMeta, edgeMeta] = await Promise.all([
        api.cypher(hydrateNodesByIds, { ids: row.nodes }),
        api.cypher(hydrateEdgesByIds, { ids: row.edges }),
      ]);
      const hydrated: HydratedPath = {
        length: row.length,
        nodes: orderedById(row.nodes, nodeMeta.rows as unknown as HydratedNode[]),
        edges: orderedById(row.edges, edgeMeta.rows as unknown as HydratedEdge[]),
      };
      setResult({ kind: "success", path: hydrated });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Map graph-core's 400 error codes onto the AC-07 enumerated states.
      if (/depth_exceeded/.test(message)) {
        setResult({ kind: "depth_exceeded" });
      } else if (/query_timeout/.test(message)) {
        setResult({ kind: "query_timeout" });
      } else if (/result_truncated/.test(message)) {
        setResult({ kind: "result_truncated" });
      } else if (/Failed to fetch|NetworkError|ECONNREFUSED|fetch failed/i.test(message)) {
        setResult({ kind: "neo4j_unreachable" });
      } else {
        setResult({ kind: "error", message });
      }
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
            <input
              data-testid="path-from"
              value={fromId}
              onChange={(e) => setFromId(e.currentTarget.value)}
              placeholder="UUIDv7"
            />
          </label>
          <label className={styles.field}>
            <span>To id</span>
            <input
              data-testid="path-to"
              value={toId}
              onChange={(e) => setToId(e.currentTarget.value)}
              placeholder="UUIDv7"
            />
          </label>
          <label className={styles.field}>
            <span>maxDepth ({depth})</span>
            <input
              data-testid="path-depth"
              type="range"
              min={MIN_DEPTH}
              max={MAX_DEPTH}
              value={depth}
              onChange={(e) => setRawDepth(Number(e.currentTarget.value))}
            />
          </label>
          {depthOutOfRange && (
            <p data-testid="path-depth-hint" style={{ color: "var(--warn)", fontSize: 12.5 }}>
              Max depth is {MAX_DEPTH}.
            </p>
          )}
          <Button tone="primary" onClick={onFind}>
            Find path
          </Button>
        </div>
      </Card>

      <div style={{ height: 24 }} />

      <Card title="Result">
        <PathResult result={result} fromId={fromId} toId={toId} />
      </Card>
    </>
  );
}

function PathResult({
  result,
  fromId,
  toId,
}: {
  result: ResultState;
  fromId: string;
  toId: string;
}) {
  switch (result.kind) {
    case "idle":
      return (
        <p data-testid="path-idle" style={{ color: "var(--muted)" }}>
          Enter two ids and click <em>Find path</em>. Try journey activity ids
          from Explorer → Journey.
        </p>
      );
    case "loading":
      return <p data-testid="path-loading" style={{ color: "var(--muted)" }}>Searching…</p>;
    case "success":
      return <PathHops path={result.path} />;
    case "no_path":
      return (
        <p data-testid="path-no-path" style={{ color: "var(--muted)" }}>
          No path within depth {result.depth} — try increasing depth, or use
          the Cypher passthrough for all-paths search.
          {fromId && toId && (
            <>
              <br />
              <code className={styles.id}>{fromId}</code> →{" "}
              <code className={styles.id}>{toId}</code>
            </>
          )}
        </p>
      );
    case "depth_exceeded":
      return (
        <p data-testid="path-depth-exceeded" style={{ color: "var(--warn)" }}>
          Max depth is {MAX_DEPTH}. The slider has been clamped — increase
          your start/end specificity or use the Cypher passthrough.
        </p>
      );
    case "query_timeout":
      return (
        <p data-testid="path-timeout" style={{ color: "var(--warn)" }}>
          Search timed out after 5 s — the graph is denser than the algorithm
          can handle within budget; try a smaller depth or use the Cypher
          passthrough.
        </p>
      );
    case "result_truncated":
      return (
        <p data-testid="path-truncated" style={{ color: "var(--warn)" }}>
          More than 1000 paths matched — narrow the search by setting a
          smaller depth.
        </p>
      );
    case "neo4j_unreachable":
      return (
        <p data-testid="path-unreachable" style={{ color: "var(--danger)" }}>
          Service offline — try again in a moment.
        </p>
      );
    case "error":
      return (
        <p data-testid="path-error" style={{ color: "var(--danger)" }}>
          {result.message}
        </p>
      );
  }
}

function PathHops({ path }: { path: HydratedPath }) {
  return (
    <div data-testid="path-hops">
      <div style={{ marginBottom: 8 }}>
        <Pill tone="accent">length {path.length}</Pill>{" "}
        <span style={{ color: "var(--muted)", fontSize: 12.5 }}>
          {path.nodes.length} nodes • {path.edges.length} edges
        </span>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
        }}
      >
        {path.nodes.map((n, i) => (
          <span key={n.id} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span
              data-testid="path-hop-node"
              data-label={n.label}
              style={{
                display: "inline-flex",
                flexDirection: "column",
                padding: "6px 10px",
                border: "1px solid var(--rule)",
                borderRadius: 6,
                background: "var(--surface-2)",
                fontSize: 13,
              }}
            >
              <strong>{n.name}</strong>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{n.label}</span>
            </span>
            {i < path.edges.length && (
              <span data-testid="path-hop-edge">
                <Pill tone="neutral">{path.edges[i]!.type}</Pill>
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
