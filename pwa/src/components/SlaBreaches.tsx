import { useState } from "react";
import { api } from "../api";
import { useFetch } from "../useFetch";
import { Button } from "./Button";
import styles from "./SlaBreaches.module.css";

interface SlaBreachesProps {
  slaId: string;
  onClose?: () => void;
}

export function SlaBreaches({ slaId, onClose }: SlaBreachesProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const breaches = useFetch(() => api.sla.getBreaches(slaId), [slaId, refreshKey]);
  const sla = useFetch(() => api.cypher("MATCH (s:SLA {id: $id}) RETURN s.name AS name, s.target_value AS target_value, s.target_unit AS target_unit", { id: slaId }), [slaId]);

  if (breaches.status === "loading" || sla.status === "loading") return <div className={styles.loading}>Loading breaches...</div>;
  if (breaches.status === "error") return <div className={styles.error}>Error: {breaches.error}</div>;
  if (sla.status === "error") return <div className={styles.error}>Error: {sla.error}</div>;

  const breachList = breaches.data?.rows || [];
  const slaData = sla.data?.rows[0] as any;

  const handleSuccess = () => {
    setShowCreateForm(false);
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>
          SLA Breaches: {slaData?.name || "SLA"}
        </h3>
        <Button onClick={() => setShowCreateForm(true)}>+ Record Breach</Button>
      </div>

      {showCreateForm && (
        <BreachForm
          slaId={slaId}
          onCancel={() => setShowCreateForm(false)}
          onSuccess={handleSuccess}
        />
      )}

      {breachList.length === 0 ? (
        <p className={styles.empty}>No breaches recorded for this SLA</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Severity</th>
              <th>Actual</th>
              <th>Target</th>
              <th>Impact</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {breachList.map((b: any) => (
              <tr key={b.id}>
                <td>{new Date(b.breach_date).toLocaleDateString()}</td>
                <td>
                  <span className={`${styles.badge} ${styles[b.severity]}`}>{b.severity}</span>
                </td>
                <td>{b.actual_value} {slaData?.target_unit}</td>
                <td>{slaData?.target_value} {slaData?.target_unit}</td>
                <td>{b.impact_description || "—"}</td>
                <td>
                  <span className={`${styles.badge} ${b.resolved_at ? styles.resolved : styles.open}`}>
                    {b.resolved_at ? "Resolved" : "Open"}
                  </span>
                </td>
                <td>
                  {!b.resolved_at && (
                    <button
                      className={styles.actionButton}
                      onClick={async () => {
                        if (confirm("Mark this breach as resolved?")) {
                          await api.sla.updateBreach(b.id, { resolved_at: new Date().toISOString() });
                          setRefreshKey(prev => prev + 1);
                        }
                      }}
                    >
                      Resolve
                    </button>
                  )}
                  <button
                    className={styles.actionButton}
                    onClick={async () => {
                      if (confirm("Delete this breach?")) {
                        await api.sla.deleteBreach(b.id);
                        setRefreshKey(prev => prev + 1);
                      }
                    }}
                  >
                    Delete
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

function BreachForm({ slaId, onCancel, onSuccess }: { slaId: string; onCancel: () => void; onSuccess: () => void }) {
  const [actualValue, setActualValue] = useState("");
  const [severity, setSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [breachDate, setBreachDate] = useState(new Date().toISOString().slice(0, 10));
  const [impactDescription, setImpactDescription] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!actualValue) {
      setError("Please enter the actual value");
      setLoading(false);
      return;
    }

    try {
      const payload: any = {
        sla_id: slaId,
        actual_value: parseFloat(actualValue),
        severity,
        breach_date: new Date(breachDate).toISOString(),
      };
      if (impactDescription) {
        payload.impact_description = impactDescription;
      }
      if (rootCause) {
        payload.root_cause = rootCause;
      }
      await api.sla.createBreach(payload);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to record breach");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h4 className={styles.formTitle}>Record SLA Breach</h4>
      
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.formField}>
        <label className={styles.label}>Actual Value</label>
        <input
          type="number"
          step="0.01"
          className={styles.input}
          value={actualValue}
          onChange={(e) => setActualValue(e.target.value)}
          required
        />
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Severity</label>
        <select
          className={styles.select}
          value={severity}
          onChange={(e) => setSeverity(e.target.value as any)}
          required
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Breach Date</label>
        <input
          type="date"
          className={styles.input}
          value={breachDate}
          onChange={(e) => setBreachDate(e.target.value)}
          required
        />
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Impact Description</label>
        <textarea
          className={styles.textarea}
          value={impactDescription}
          onChange={(e) => setImpactDescription(e.target.value)}
          rows={3}
        />
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Root Cause (optional)</label>
        <textarea
          className={styles.textarea}
          value={rootCause}
          onChange={(e) => setRootCause(e.target.value)}
          rows={2}
        />
      </div>

      <div className={styles.formActions}>
        <Button type="button" tone="ghost" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Recording..." : "Record Breach"}
        </Button>
      </div>
    </form>
  );
}
