import { useState } from "react";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { KeyValueList } from "../../components/KeyValueList";
import { Pill } from "../../components/Pill";
import { ViewHeader } from "../_shared";
import styles from "./Import.module.css";

interface ImportResponse {
  imported: { nodes: number; edges: number };
  errors?: Array<{ section: string; index: number; code: string; message: string }>;
}

export function ApiImport() {
  const [body, setBody] = useState<string>('{\n  "nodes": [],\n  "edges": []\n}');
  const [dryRun, setDryRun] = useState(true);
  const [state, setState] = useState<{ status: "idle" } | { status: "loading" } | { status: "ok"; r: ImportResponse } | { status: "error"; error: string }>({ status: "idle" });

  const onSubmit = async (): Promise<void> => {
    setState({ status: "loading" });
    try {
      const path = `/api/v1/import${dryRun ? "?dryRun=true" : ""}`;
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(j)}`);
      setState({ status: "ok", r: j as ImportResponse });
    } catch (e) {
      setState({ status: "error", error: String((e as Error).message) });
    }
  };

  return (
    <>
      <ViewHeader
        title="Bulk import"
        lede="POST /api/v1/import. Two-phase, collect-and-continue. ?dryRun=true validates without writing — recommended first."
      />
      <div className={styles.layout}>
        <Card title="Payload">
          <textarea
            className={styles.editor}
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
            spellCheck={false}
          />
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.currentTarget.checked)}
              />
              dry run
            </label>
            <Button tone="primary" onClick={onSubmit}>POST /import</Button>
          </div>
        </Card>

        <Card title="Result">
          {state.status === "idle" && <p style={{ color: "var(--muted)", margin: 0 }}>Paste a payload and submit.</p>}
          {state.status === "loading" && <p style={{ color: "var(--muted)", margin: 0 }}>Sending…</p>}
          {state.status === "error" && <p style={{ color: "var(--danger)", margin: 0, wordBreak: "break-word" }}>{state.error}</p>}
          {state.status === "ok" && (
            <>
              <KeyValueList rows={[
                { label: "nodes", value: state.r.imported.nodes },
                { label: "edges", value: state.r.imported.edges },
                { label: "errors", value: state.r.errors?.length ?? 0 },
              ]} />
              {state.r.errors && state.r.errors.length > 0 && (
                <ul style={{ marginTop: 12, padding: 0, listStyle: "none" }}>
                  {state.r.errors.slice(0, 10).map((er, i) => (
                    <li key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, padding: "4px 0" }}>
                      <Pill tone="danger">{er.code}</Pill>
                      <code style={{ fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
                        {er.section}[{er.index}]
                      </code>
                      <span>{er.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
