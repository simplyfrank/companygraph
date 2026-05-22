import { useState } from "react";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Pill } from "../../components/Pill";
import { KeyValueList } from "../../components/KeyValueList";
import { ViewHeader, SecLabel } from "../_shared";
import { api } from "../../api";
import { useFetch } from "../../useFetch";
import styles from "./Add.module.css";

const LABELS = ["Domain", "UserJourney", "Activity", "Role", "System", "Location"] as const;
type Label = typeof LABELS[number];

const LABEL_TONE: Record<Label, "accent" | "good" | "warn" | "danger" | "neutral"> = {
  Domain: "accent",
  UserJourney: "good",
  Activity: "neutral",
  Role: "warn",
  System: "danger",
  Location: "neutral",
};

interface CreatedNode {
  id: string;
  label: string;
  name: string;
  description: string;
  createdAt: string;
}

export function SmeAdd() {
  const [label, setLabel] = useState<Label>("Activity");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [attributes, setAttributes] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { kind: "idle" }
    | { kind: "ok"; node: CreatedNode }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const stats = useFetch(() => api.stats(), [result]);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setResult({ kind: "idle" });
    let attrs: unknown = {};
    if (attributes.trim()) {
      try {
        attrs = JSON.parse(attributes);
      } catch (e) {
        setResult({ kind: "error", message: `attributes JSON is invalid: ${(e as Error).message}` });
        setBusy(false);
        return;
      }
    }
    try {
      const res = await fetch(`/api/v1/nodes/${encodeURIComponent(label)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description, attributes: attrs }),
      });
      const body = await res.json();
      if (!res.ok) {
        setResult({ kind: "error", message: `${res.status} ${JSON.stringify(body)}` });
      } else {
        setResult({ kind: "ok", node: body as CreatedNode });
        // Reset name + description, keep label so the user can add another.
        setName("");
        setDescription("");
        setAttributes("{}");
      }
    } catch (e) {
      setResult({ kind: "error", message: String((e as Error).message) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ViewHeader
        title="Add entity"
        lede="Direct CRUD into the graph via POST /api/v1/nodes/:label. The graph-core API is the source of truth; ontology-manager will add review + approval workflow on top of this."
      />
      <div className={styles.layout}>
        <Card title="New node">
          <SecLabel>Label</SecLabel>
          <div className={styles.labelPicker}>
            {LABELS.map((l) => (
              <button
                key={l}
                type="button"
                className={`${styles.labelBtn} ${l === label ? styles.labelActive : ""}`}
                onClick={() => setLabel(l)}
              >
                <Pill tone={LABEL_TONE[l]}>{l}</Pill>
              </button>
            ))}
          </div>

          <SecLabel>Name *</SecLabel>
          <input
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="e.g. Verify Receipt"
          />

          <SecLabel>Description</SecLabel>
          <textarea
            className={styles.textarea}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            placeholder="Short, neutral description of what this entity represents."
          />

          <SecLabel>Attributes (JSON)</SecLabel>
          <textarea
            className={styles.code}
            rows={3}
            value={attributes}
            onChange={(e) => setAttributes(e.currentTarget.value)}
            spellCheck={false}
            placeholder='{"owner":"buyer","tier":"core"}'
          />

          <div className={styles.actions}>
            <Button tone="primary" onClick={() => void submit()} disabled={busy || !name}>
              {busy ? "POST-ing…" : `POST /nodes/${label}`}
            </Button>
            {result.kind === "ok" && <Pill tone="good">201 created</Pill>}
            {result.kind === "error" && <Pill tone="danger">error</Pill>}
          </div>
          {result.kind === "error" && (
            <pre className={styles.err}>{result.message}</pre>
          )}
        </Card>

        <aside className={styles.panel}>
          {result.kind === "ok" && (
            <Card title="Last created">
              <KeyValueList rows={[
                { label: "label", value: <Pill tone={LABEL_TONE[result.node.label as Label] ?? "neutral"}>{result.node.label}</Pill> },
                { label: "name",  value: result.node.name },
                { label: "id",    value: <code className={styles.id}>{result.node.id}</code> },
                { label: "createdAt", value: <code className={styles.id}>{result.node.createdAt}</code> },
              ]} />
            </Card>
          )}
          <Card title="Live counts">
            {stats.status === "ok" && (
              <KeyValueList rows={LABELS.map((l) => ({ label: l, value: stats.data.nodes[l] }))} />
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
