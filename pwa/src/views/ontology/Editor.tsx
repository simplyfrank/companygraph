import { useEffect, useState } from "react";
import { api, complianceRules } from "../../api";
import { useFetch } from "../../useFetch";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { KeyValueList } from "../../components/KeyValueList";
import { QueryBuilder } from "../../components/QueryBuilder";
import { ViewHeader, Loading, ErrorState, SecLabel } from "../_shared";
import styles from "./Editor.module.css";

const LABELS = ["Domain", "UserJourney", "Activity", "Role", "System", "Location"] as const;
type Label = typeof LABELS[number];

const TONE: Record<Label, "accent" | "good" | "warn" | "danger" | "neutral"> = {
  Domain: "accent",
  UserJourney: "good",
  Activity: "neutral",
  Role: "warn",
  System: "danger",
  Location: "neutral",
};

interface ListedNode { id: string; name: string }
interface FullNode {
  id: string;
  label: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
}

export function OntologyEditor() {
  const [label, setLabel] = useState<Label>("Activity");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"inspector" | "query">("inspector");

  // List nodes of the selected label (live Cypher).
  const list = useFetch(
    () =>
      api.cypher(
        `MATCH (n:\`${label}\`) RETURN n.id AS id, n.name AS name ORDER BY n.name LIMIT 1001`,
      ),
    [label],
  );

  // When the label changes, clear selection.
  useEffect(() => { setSelectedId(null); }, [label]);

  return (
    <>
      <ViewHeader
        title="Node inspector"
        lede="Pick a label, then a node, to see every attribute. graph-core only persists name + description + an open attributes map — ontology-manager will layer typed schemas on top."
      />
      <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => setActiveTab("inspector")}
          style={{
            padding: "8px 16px",
            background: activeTab === "inspector" ? "var(--accent)" : "var(--bg-subtle)",
            color: activeTab === "inspector" ? "var(--text)" : "var(--muted)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Node Inspector
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("query")}
          style={{
            padding: "8px 16px",
            background: activeTab === "query" ? "var(--accent)" : "var(--bg-subtle)",
            color: activeTab === "query" ? "var(--text)" : "var(--muted)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Query Builder
        </button>
      </div>

      {activeTab === "inspector" ? (
        <div className={styles.layout}>
          <Card title="Label">
            <div className={styles.labelPicker}>
              {LABELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`${styles.labelBtn} ${l === label ? styles.labelActive : ""}`}
                  onClick={() => setLabel(l)}
                >
                  <Pill tone={TONE[l]}>{l}</Pill>
                </button>
              ))}
            </div>
            <SecLabel>Nodes</SecLabel>
            {list.status === "loading" && <Loading what="nodes" />}
            {list.status === "error" && <ErrorState message={list.error} />}
            {list.status === "ok" && (
              <ul className={styles.nodeList}>
                {(list.data.rows as unknown as ListedNode[]).map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={`${styles.nodeBtn} ${n.id === selectedId ? styles.nodeActive : ""}`}
                      onClick={() => setSelectedId(n.id)}
                    >
                      <span>{n.name}</span>
                      <code className={styles.id}>{n.id.slice(0, 8)}…</code>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className={styles.detail}>
            {selectedId ? (
              <NodeDetail label={label} id={selectedId} />
            ) : (
              <Card>
                <p style={{ color: "var(--muted)", margin: 0 }}>Select a node on the left.</p>
              </Card>
            )}
          </div>
        </div>
      ) : (
        <QueryBuilder />
      )}
    </>
  );
}

function NodeDetail({ label, id }: { label: Label; id: string }) {
  // Use the typed CRUD endpoint for full props (createdAt, updatedAt, attributes).
  const node = useFetch(
    async () => {
      const res = await fetch(`/api/v1/nodes/${encodeURIComponent(label)}/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json() as Promise<FullNode>;
    },
    [label, id],
  );

  const applicableRules = useFetch(() => complianceRules.list(true), []);

  if (node.status === "loading") return <Loading what="node" />;
  if (node.status === "error") return <ErrorState message={node.error} />;
  const n = node.data;
  const attrKeys = Object.keys(n.attributes);

  // Check if any compliance rules might apply to this label
  const matchingRules = applicableRules.status === "ok" && applicableRules.data 
    ? applicableRules.data.filter((rule: any) => 
        rule.rule_dsl?.toLowerCase().includes(label.toLowerCase()) || 
        rule.description?.toLowerCase().includes(label.toLowerCase())
      )
    : [];

  return (
    <>
      <Card title={n.name} actions={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Pill tone={TONE[label]}>{label}</Pill>
          {matchingRules.length > 0 && (
            <Pill tone="warn">
              {matchingRules.length} Rule{matchingRules.length > 1 ? 's' : ''}
            </Pill>
          )}
        </div>
      }>
        <KeyValueList rows={[
          { label: "id",          value: <code className={styles.id}>{n.id}</code> },
          { label: "description", value: n.description || "—" },
          { label: "createdAt",   value: <code className={styles.id}>{n.createdAt}</code> },
          { label: "updatedAt",   value: <code className={styles.id}>{n.updatedAt}</code> },
        ]} />
      </Card>
      <Card title={`Attributes (${attrKeys.length})`}>
        {attrKeys.length === 0 ? (
          <p style={{ color: "var(--muted)", margin: 0, fontSize: 12.5 }}>
            No custom attributes. graph-core's `attributes` field is an open JSON map; populate it via POST /nodes or PATCH /nodes.
          </p>
        ) : (
          <KeyValueList rows={attrKeys.map((k) => ({
            label: k,
            value: <code className={styles.attr}>{typeof n.attributes[k] === "string" ? String(n.attributes[k]) : JSON.stringify(n.attributes[k])}</code>,
          }))} />
        )}
      </Card>
    </>
  );
}
