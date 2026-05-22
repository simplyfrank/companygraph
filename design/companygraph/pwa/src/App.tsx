import { useEffect, useState, useRef } from "react";
import { getHealthz, getStats } from "./api";
import type { Health, Stats } from "@companygraph/shared/types";

type Status = "connecting" | "ok" | "down";

const POLL_INTERVAL_MS = 30_000;

export function App() {
  const [status, setStatus] = useState<Status>("connecting");
  const [health, setHealth] = useState<Health | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let stopped = false;

    async function pollOnce(): Promise<void> {
      try {
        const h = await getHealthz();
        if (stopped) return;
        if (h.ok) {
          setStatus("ok");
          setHealth(h);
          try {
            const s = await getStats();
            if (!stopped) setStats(s);
          } catch { /* swallow stats — health is the primary signal */ }
        } else {
          setStatus("down");
          setHealth(h);
        }
      } catch {
        if (!stopped) {
          setStatus("down");
          setHealth(null);
        }
      }
    }

    function startPolling(): void {
      if (intervalRef.current !== null) return;
      pollOnce();
      intervalRef.current = setInterval(pollOnce, POLL_INTERVAL_MS);
    }

    function stopPolling(): void {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    function onVisibility(): void {
      if (document.visibilityState === "visible") startPolling();
      else stopPolling();
    }

    document.addEventListener("visibilitychange", onVisibility);
    if (document.visibilityState === "visible") startPolling();

    return () => {
      stopped = true;
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>companygraph</h1>
      <p style={{ color: "#555" }}>Foundation shell — interactive graph exploration lands in <code>process-explorer-ui</code>.</p>

      <Banner status={status} health={health} />

      {status === "ok" && stats && <StatsBlock stats={stats} />}
    </div>
  );
}

function Banner({ status, health }: { status: Status; health: Health | null }) {
  const color =
    status === "ok" ? "#1a7f37" :
    status === "down" ? "#cf222e" :
    "#9a6700";
  const dot =
    status === "ok" ? "●" :
    status === "down" ? "●" :
    "○";
  const text =
    status === "ok" ? `Connected${health?.neo4j.version ? ` · Neo4j ${health.neo4j.version}` : ""}` :
    status === "down" ? "Disconnected" :
    "Connecting…";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex", gap: 8, alignItems: "center",
        padding: "0.75rem 1rem",
        background: status === "ok" ? "#dafbe1" : status === "down" ? "#ffebe9" : "#fff8c5",
        borderRadius: 8,
        border: `1px solid ${color}33`,
      }}
    >
      <span style={{ color, fontSize: 18 }}>{dot}</span>
      <strong style={{ color }}>{text}</strong>
    </div>
  );
}

function StatsBlock({ stats }: { stats: Stats }) {
  return (
    <section style={{ marginTop: "1.5rem" }}>
      <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem 0" }}>Graph contents</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div>
          <h3 style={{ fontSize: "0.85rem", color: "#555", margin: "0 0 0.25rem 0" }}>Nodes</h3>
          <dl style={{ margin: 0 }}>
            {Object.entries(stats.nodes).map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <dt>{k}</dt>
                <dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3 style={{ fontSize: "0.85rem", color: "#555", margin: "0 0 0.25rem 0" }}>Edges</h3>
          <dl style={{ margin: 0 }}>
            {Object.entries(stats.edges).map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <dt>{k}</dt>
                <dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
