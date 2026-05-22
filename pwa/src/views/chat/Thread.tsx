import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { Card } from "../../components/Card";
import { DataTable } from "../../components/DataTable";
import { Button } from "../../components/Button";
import { Pill } from "../../components/Pill";
import { ViewHeader } from "../_shared";
import styles from "./Thread.module.css";

const SAMPLES: Array<{ name: string; cypher: string }> = [
  {
    name: "List domains",
    cypher: "MATCH (d:Domain) RETURN d.name AS name, d.description AS description ORDER BY name",
  },
  {
    name: "Activities by journey",
    cypher: "MATCH (j:UserJourney)<-[:PART_OF]-(a:Activity)\nRETURN j.name AS journey, count(a) AS activities\nORDER BY activities DESC",
  },
  {
    name: "Systems by use",
    cypher: "MATCH (s:System)<-[u:USES_SYSTEM]-(a:Activity)\nRETURN s.name AS system, count(u) AS uses\nORDER BY uses DESC",
  },
  {
    name: "Roles + activities",
    cypher: "MATCH (r:Role)-[:EXECUTES]->(a:Activity)\nRETURN r.name AS role, count(a) AS activities\nORDER BY activities DESC",
  },
];

interface HistoryEntry {
  ts: string;
  cypher: string;
  durationMs?: number;
  rowCount?: number;
  error?: string;
}

const HISTORY_KEY = "companygraph.cypher.history";

export function ChatThread() {
  const [cypher, setCypher] = useState<string>(SAMPLES[0].cypher);
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? "[]") as HistoryEntry[]; } catch { return []; }
  });
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ok"; rows: Record<string, unknown>[]; durationMs: number }
    | { status: "error"; error: string }
  >({ status: "idle" });
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
  }, [history]);

  const run = async (): Promise<void> => {
    const trimmed = cypher.trim();
    if (!trimmed) return;
    setState({ status: "loading" });
    const t0 = performance.now();
    try {
      const r = await api.cypher(trimmed);
      const durationMs = Math.round(performance.now() - t0);
      setState({ status: "ok", rows: r.rows, durationMs });
      setHistory((h) => [{ ts: new Date().toISOString(), cypher: trimmed, durationMs, rowCount: r.rows.length }, ...h.filter((x) => x.cypher !== trimmed)].slice(0, 10));
    } catch (e) {
      const err = String((e as Error).message);
      setState({ status: "error", error: err });
      setHistory((h) => [{ ts: new Date().toISOString(), cypher: trimmed, error: err }, ...h.filter((x) => x.cypher !== trimmed)].slice(0, 10));
    }
  };

  // Cmd/Ctrl + Enter to run.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cypher]);

  const columns = state.status === "ok" && state.rows[0]
    ? Object.keys(state.rows[0]).map((k) => ({
        id: k, label: k,
        kind: (typeof state.rows[0]![k] === "number" ? "num" : k === "id" || k.endsWith("Id") ? "id" : "text") as "num" | "id" | "text",
        align: typeof state.rows[0]![k] === "number" ? "right" : "left" as "right" | "left",
      }))
    : [];

  return (
    <>
      <ViewHeader
        title="Cypher console"
        lede="Read-only Cypher passthrough → /api/v1/query/cypher. The chat-interface follow-up spec layers NL-to-Cypher generation on top of this; for now it's a developer-grade query surface."
      />
      <div className={styles.shell}>
        <div className={styles.main}>
          <Card
            title="Query"
            actions={
              <>
                <Pill>cmd-↵</Pill>
                <Button tone="primary" onClick={() => void run()}>Run</Button>
              </>
            }
          >
            <textarea
              ref={taRef}
              className={styles.editor}
              value={cypher}
              onChange={(e) => setCypher(e.currentTarget.value)}
              spellCheck={false}
              rows={6}
              placeholder="MATCH (n) RETURN n LIMIT 10"
            />
            <div className={styles.samples}>
              {SAMPLES.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  className={styles.sample}
                  onClick={() => setCypher(s.cypher)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </Card>

          <Card title="Result">
            {state.status === "idle" && <p style={{ color: "var(--muted)", margin: 0 }}>Run a query to see rows.</p>}
            {state.status === "loading" && <p style={{ color: "var(--muted)", margin: 0 }}>Running…</p>}
            {state.status === "error" && <pre className={styles.err}>{state.error}</pre>}
            {state.status === "ok" && (
              <>
                <div className={styles.resultMeta}>
                  <Pill tone="good">{state.rows.length} row{state.rows.length === 1 ? "" : "s"}</Pill>
                  <Pill>{state.durationMs} ms</Pill>
                </div>
                {state.rows.length > 0 ? (
                  <DataTable
                    columns={columns}
                    rows={state.rows.map((r) => {
                      const out: Record<string, React.ReactNode> = {};
                      for (const k of Object.keys(r)) {
                        const v = r[k];
                        out[k] = typeof v === "object" && v !== null
                          ? <code className={styles.json}>{JSON.stringify(v)}</code>
                          : String(v);
                      }
                      return out;
                    })}
                  />
                ) : (
                  <p style={{ color: "var(--muted)", margin: 0 }}>Empty result set.</p>
                )}
              </>
            )}
          </Card>
        </div>

        <aside className={styles.panel}>
          <Card title="History" actions={history.length > 0 ? <Button tone="ghost" onClick={() => setHistory([])}>clear</Button> : null}>
            {history.length === 0 && <p style={{ color: "var(--muted)", margin: 0, fontSize: 12.5 }}>Last 10 queries appear here.</p>}
            <ul className={styles.history}>
              {history.map((h, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className={styles.histEntry}
                    onClick={() => setCypher(h.cypher)}
                    title={h.cypher}
                  >
                    <code className={styles.histCypher}>{h.cypher.split("\n")[0].slice(0, 60)}{h.cypher.length > 60 ? "…" : ""}</code>
                    <span className={styles.histMeta}>
                      {h.error ? <Pill tone="danger">err</Pill> : <Pill tone="good">{h.rowCount}</Pill>}
                      {h.durationMs !== undefined && <span>{h.durationMs} ms</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}
