import { useState } from "react";
import { api } from "../api";
import { useFetch } from "../useFetch";
import { Button } from "./Button";
import { SlaBreaches } from "./SlaBreaches";
import styles from "./SlaCrud.module.css";

interface SlaCrudProps {
  targetId: string;
  targetType: "journey" | "activity" | "domain";
  onClose?: () => void;
}

export function SlaCrud({ targetId, targetType, onClose }: SlaCrudProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [viewingBreaches, setViewingBreaches] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const slas = useFetch(() => api.sla.getAlignments(targetType, targetId), [targetId, targetType, refreshKey]);

  if (slas.status === "loading") return <div className={styles.loading}>Loading SLAs...</div>;
  if (slas.status === "error") return <div className={styles.error}>Error: {slas.error}</div>;

  const slaList = slas.data?.rows || [];

  const handleSuccess = () => {
    setShowCreateForm(false);
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>SLA Management</h3>
        <Button onClick={() => setShowCreateForm(true)}>+ Align SLA</Button>
      </div>

      {showCreateForm && (
        <SlaAlignmentForm
          targetId={targetId}
          targetType={targetType}
          onCancel={() => setShowCreateForm(false)}
          onSuccess={handleSuccess}
        />
      )}

      {viewingBreaches && (
        <div style={{ marginTop: "16px", borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>SLA Breaches</h4>
            <Button tone="ghost" onClick={() => setViewingBreaches(null)}>Close</Button>
          </div>
          <SlaBreaches slaId={viewingBreaches} />
        </div>
      )}

      {slaList.length === 0 ? (
        <p className={styles.empty}>No SLAs aligned to this {targetType}</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>SLA</th>
              <th>Type</th>
              <th>Target</th>
              <th>Compliance</th>
              <th>Critical</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {slaList.map((sla: any) => (
              <tr key={sla.sla_id}>
                <td>
                  <strong>{sla.sla_name}</strong>
                  <code className={styles.id}>{sla.sla_id.slice(0, 8)}…</code>
                </td>
                <td>
                  <span className={styles.badge}>{sla.service_type}</span>
                </td>
                <td>{sla.target_value} {sla.target_unit}</td>
                <td>{sla.compliance_threshold}%</td>
                <td>{sla.is_critical ? "✓" : "—"}</td>
                <td>
                  <button
                    className={styles.actionButton}
                    onClick={() => setViewingBreaches(sla.sla_id)}
                  >
                    Breaches
                  </button>
                  <button
                    className={styles.actionButton}
                    onClick={async () => {
                      if (confirm("Remove this SLA alignment?")) {
                        await api.sla.deleteAlignment(sla.sla_id);
                        setRefreshKey(prev => prev + 1);
                      }
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {onClose && <Button onClick={onClose} tone="ghost">Close</Button>}
    </div>
  );
}

function SlaAlignmentForm({ targetId, targetType, onCancel, onSuccess }: { targetId: string; targetType: "journey" | "activity" | "domain"; onCancel: () => void; onSuccess: () => void }) {
  const [slaId, setSlaId] = useState("");
  const [isCritical, setIsCritical] = useState(false);
  const [alignmentNotes, setAlignmentNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const allSlas = useFetch(() => api.cypher("MATCH (s:SLA) WHERE s.archived_at IS NULL RETURN s.id AS id, s.name AS name, s.service_type AS service_type, s.target_value AS target_value, s.target_unit AS target_unit, s.compliance_threshold AS compliance_threshold ORDER BY s.name"), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!slaId) {
      setError("Please select an SLA");
      setLoading(false);
      return;
    }

    try {
      const payload: any = {
        sla_id: slaId,
        target_type: targetType,
        target_id: targetId,
        is_critical: isCritical,
      };
      if (alignmentNotes) {
        payload.alignment_notes = alignmentNotes;
      }
      await api.sla.createAlignment(payload);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to create alignment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h4 className={styles.formTitle}>Align SLA</h4>
      
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.formField}>
        <label className={styles.label}>SLA</label>
        <select
          className={styles.select}
          value={slaId}
          onChange={(e) => setSlaId(e.target.value)}
          required
        >
          <option value="">Select SLA</option>
          {allSlas.status === "ok" && allSlas.data?.rows.map((sla: any) => (
            <option key={sla.id} value={sla.id}>
              {sla.name} ({sla.service_type}) - Target: {sla.target_value} {sla.target_unit} - Compliance: {sla.compliance_threshold}%
            </option>
          ))}
        </select>
      </div>

      <div className={styles.formField}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={isCritical}
            onChange={(e) => setIsCritical(e.target.checked)}
          />
          Mark as Critical
        </label>
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Notes (optional)</label>
        <textarea
          className={styles.textarea}
          value={alignmentNotes}
          onChange={(e) => setAlignmentNotes(e.target.value)}
          rows={3}
        />
      </div>

      <div className={styles.formActions}>
        <Button type="button" tone="ghost" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Alignment"}
        </Button>
      </div>
    </form>
  );
}
