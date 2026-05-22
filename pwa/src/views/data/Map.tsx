// Moved from explorer/Graph.tsx — the full-graph force-directed canvas
// lives under the Data surface now. The Explorer · Journey graph tab is
// the new 3-lane per-journey visualization.

import { useState } from "react";
import { api } from "../../api";
import { useFetch } from "../../useFetch";
import { GraphCanvas } from "../../components/GraphCanvas";
import { Card } from "../../components/Card";
import { KeyValueList } from "../../components/KeyValueList";
import { Pill } from "../../components/Pill";
import { Button } from "../../components/Button";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import styles from "./Map.module.css";

const ALL_LABELS = ["Domain", "UserJourney", "Activity", "Role", "System", "Location"] as const;
const LABEL_TONE: Record<string, "accent" | "good" | "warn" | "danger" | "neutral"> = {
  Domain: "accent",
  UserJourney: "good",
  Activity: "neutral",
  Role: "warn",
  System: "danger",
  Location: "neutral",
};

export function DataMap() {
  const exportData = useFetch(() => api.exportJson(), []);
  const [active, setActive] = useState<ReadonlySet<string>>(new Set(ALL_LABELS));
  const [selected, setSelected] = useState<{ id: string; label: string; name: string; description: string } | null>(null);

  const toggle = (label: string): void => {
    setActive((cur) => {
      const next = new Set(cur);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return (
    <>
      <ViewHeader
        title="Graph map"
        lede="Whole-graph force-directed view. Useful for inspecting connectivity outside of a single journey context."
      />
      <div className={styles.layout}>
        <div className={styles.canvas}>
          {exportData.status === "loading" && <Loading what="graph" />}
          {exportData.status === "error" && <ErrorState message={exportData.error} />}
          {exportData.status === "ok" && (
            <GraphCanvas
              nodes={exportData.data.nodes}
              edges={exportData.data.edges}
              width={900}
              height={560}
              highlightLabels={active}
              onNodeClick={(n) => setSelected(n)}
            />
          )}
        </div>
        <aside className={styles.rail}>
          <Card title="Labels">
            <div className={styles.toggles}>
              {ALL_LABELS.map((l) => {
                const isActive = active.has(l);
                return (
                  <button
                    key={l}
                    type="button"
                    className={`${styles.toggle} ${isActive ? styles.toggleActive : ""}`}
                    onClick={() => toggle(l)}
                  >
                    <Pill tone={LABEL_TONE[l] ?? "neutral"}>{l}</Pill>
                  </button>
                );
              })}
            </div>
          </Card>
          {selected && (
            <Card
              title={selected.name}
              actions={<Button tone="ghost" onClick={() => setSelected(null)}>×</Button>}
            >
              <KeyValueList rows={[
                { label: "label", value: <Pill tone={LABEL_TONE[selected.label] ?? "neutral"}>{selected.label}</Pill> },
                { label: "id",    value: <code className={styles.id}>{selected.id}</code> },
                { label: "desc",  value: selected.description || "—" },
              ]} />
              {selected.label === "UserJourney" && (
                <div style={{ marginTop: 12 }}>
                  <Button href={`#/explorer/journey-graph?journey=${encodeURIComponent(selected.id)}`}>
                    Open journey graph
                  </Button>
                </div>
              )}
            </Card>
          )}
          {exportData.status === "ok" && (
            <Card title="Counts">
              <KeyValueList rows={[
                { label: "nodes", value: exportData.data.nodes.length },
                { label: "edges", value: exportData.data.edges.length },
              ]} />
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
