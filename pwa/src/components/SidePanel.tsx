// T-17: Side panel (FR-24 / FR-26)
//
// Responsive entity detail panel driven by selectionStore:
// - Desktop (≥1024): right-side 400px column
// - Tablet (≥768): bottom sheet at 60% height
// - Phone (<768): full-screen modal
//
// Uses CSS container-queries (no JS resize listener).

import { useSelectionStore } from "../store/selectionStore";
import { useFetch } from "../useFetch";
import { api } from "../api";
import { Button } from "./Button";
import styles from "./SidePanel.module.css";

export function SidePanel() {
  const { selectedEntityId, selectedEntityLabel, panelOpen, clear } = useSelectionStore();

  if (!panelOpen || !selectedEntityId || !selectedEntityLabel) return null;

  return (
    <aside className={styles.panel} data-testid="side-panel">
      <div className={styles.header}>
        <span className={styles.label}>{selectedEntityLabel}</span>
        <Button tone="ghost" onClick={clear} aria-label="Close panel">
          &times;
        </Button>
      </div>
      <div className={styles.body}>
        <EntityDetail id={selectedEntityId} label={selectedEntityLabel} />
      </div>
    </aside>
  );
}

function EntityDetail({ id, label }: { id: string; label: string }) {
  // Must call useFetch before any early return to maintain hook order
  const data = useFetch(
    () => {
      if (label === "UserJourney") return api.getJourney(id);
      if (label === "Domain") return api.getDomain(id);
      // Generic fallback — fetch the node directly
      return fetch(`/api/v1/nodes/${encodeURIComponent(label)}/${encodeURIComponent(id)}`)
        .then((r) => r.json());
    },
    [id, label],
  );

  if (data.status === "loading") return <p className={styles.loading}>Loading…</p>;
  if (data.status === "error") return <p className={styles.error}>{data.error}</p>;

  const row = data.data.rows?.[0] as { id: string; name: string; description?: string } | undefined;
  if (!row) return <p className={styles.error}>Entity not found</p>;

  return (
    <div className={styles.detail}>
      <h3 className={styles.name}>{row.name}</h3>
      {row.description && <p className={styles.desc}>{row.description}</p>}
      <dl className={styles.meta}>
        <dt>ID</dt>
        <dd><code>{row.id}</code></dd>
        <dt>Label</dt>
        <dd>{label}</dd>
      </dl>
    </div>
  );
}
