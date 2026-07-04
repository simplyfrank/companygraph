import { useState } from "react";
import { api } from "../api";
import { useFetch } from "../useFetch";
import { Button } from "./Button";
import styles from "./KpiMeasurements.module.css";

interface KpiMeasurementsProps {
  kpiId: string;
  onClose?: () => void;
}

export function KpiMeasurements({ kpiId, onClose }: KpiMeasurementsProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const measurements = useFetch(() => api.kpi.getMeasurements(kpiId), [kpiId, refreshKey]);
  const kpi = useFetch(() => api.cypher("MATCH (k:KPI {id: $id}) RETURN k.name AS name, k.unit AS unit, k.target_value AS target_value", { id: kpiId }), [kpiId]);

  if (measurements.status === "loading" || kpi.status === "loading") return <div className={styles.loading}>Loading measurements...</div>;
  if (measurements.status === "error") return <div className={styles.error}>Error: {measurements.error}</div>;
  if (kpi.status === "error") return <div className={styles.error}>Error: {kpi.error}</div>;

  const measurementList = measurements.data?.rows || [];
  const kpiData = kpi.data?.rows[0] as any;

  const handleSuccess = () => {
    setShowCreateForm(false);
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>
          Measurements: {kpiData?.name || "KPI"}
        </h3>
        <Button onClick={() => setShowCreateForm(true)}>+ Record Measurement</Button>
      </div>

      {showCreateForm && (
        <MeasurementForm
          kpiId={kpiId}
          kpiUnit={kpiData?.unit}
          onCancel={() => setShowCreateForm(false)}
          onSuccess={handleSuccess}
        />
      )}

      {measurementList.length === 0 ? (
        <p className={styles.empty}>No measurements recorded for this KPI</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Value</th>
              <th>Target</th>
              <th>Variance</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {measurementList.map((m: any) => (
              <tr key={m.id}>
                <td>{new Date(m.measured_at).toLocaleDateString()}</td>
                <td>{m.measured_value} {kpiData?.unit}</td>
                <td>{kpiData?.target_value} {kpiData?.unit}</td>
                <td style={{ color: getVarianceColor(m.measured_value, kpiData?.target_value) }}>
                  {kpiData?.target_value ? ((m.measured_value - kpiData.target_value) / kpiData.target_value * 100).toFixed(1) + "%" : "—"}
                </td>
                <td>{m.notes || "—"}</td>
                <td>
                  <button
                    className={styles.actionButton}
                    onClick={async () => {
                      if (confirm("Delete this measurement?")) {
                        await api.kpi.deleteMeasurement(m.id);
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

function getVarianceColor(measured: number, target: number): string {
  const variance = (measured - target) / target;
  if (variance >= 0) return "var(--success)";
  if (variance >= -0.1) return "var(--warn)";
  return "var(--danger)";
}

function MeasurementForm({ kpiId, kpiUnit, onCancel, onSuccess }: { kpiId: string; kpiUnit?: string; onCancel: () => void; onSuccess: () => void }) {
  const [measuredValue, setMeasuredValue] = useState("");
  const [measuredAt, setMeasuredAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!measuredValue) {
      setError("Please enter a measured value");
      setLoading(false);
      return;
    }

    try {
      const payload: any = {
        kpi_id: kpiId,
        measured_value: parseFloat(measuredValue),
        measured_at: new Date(measuredAt).toISOString(),
      };
      if (notes) {
        payload.notes = notes;
      }
      await api.kpi.createMeasurement(payload);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to record measurement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h4 className={styles.formTitle}>Record Measurement</h4>
      
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.formField}>
        <label className={styles.label}>Measured Value ({kpiUnit})</label>
        <input
          type="number"
          step="0.01"
          className={styles.input}
          value={measuredValue}
          onChange={(e) => setMeasuredValue(e.target.value)}
          required
        />
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Date</label>
        <input
          type="date"
          className={styles.input}
          value={measuredAt}
          onChange={(e) => setMeasuredAt(e.target.value)}
          required
        />
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Notes (optional)</label>
        <textarea
          className={styles.textarea}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      <div className={styles.formActions}>
        <Button type="button" tone="ghost" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Recording..." : "Record Measurement"}
        </Button>
      </div>
    </form>
  );
}
