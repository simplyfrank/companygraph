import { useState } from "react";
import { api, type KPICreate } from "../api";
import { useFetch } from "../useFetch";
import { Button } from "./Button";
import { KpiMeasurements } from "./KpiMeasurements";
import styles from "./KpiCrud.module.css";

interface KpiCrudProps {
  targetId: string;
  targetType: "journey" | "activity" | "domain";
  onClose?: () => void;
}

export function KpiCrud({ targetId, targetType, onClose }: KpiCrudProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingKpi, setEditingKpi] = useState<string | null>(null);
  const [viewingMeasurements, setViewingMeasurements] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const kpis = useFetch(() => api.kpi.getAlignments(targetType, targetId), [targetId, targetType, refreshKey]);

  if (kpis.status === "loading") return <div className={styles.loading}>Loading KPIs...</div>;
  if (kpis.status === "error") return <div className={styles.error}>Error: {kpis.error}</div>;

  const kpiList = kpis.data?.rows || [];

  const handleSuccess = () => {
    setShowCreateForm(false);
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>KPI Management</h3>
        {targetType === "domain" ? (
          <Button onClick={() => setShowCreateForm(true)}>+ Create KPI</Button>
        ) : (
          <Button onClick={() => setShowCreateForm(true)}>+ Align KPI</Button>
        )}
      </div>

      {showCreateForm && targetType === "domain" && (
        <KpiCreateForm
          domainId={targetId}
          onCancel={() => setShowCreateForm(false)}
          onSuccess={handleSuccess}
        />
      )}

      {showCreateForm && targetType !== "domain" && (
        <KpiAlignmentForm
          targetId={targetId}
          targetType={targetType}
          onCancel={() => setShowCreateForm(false)}
          onSuccess={handleSuccess}
        />
      )}

      {viewingMeasurements && (
        <div style={{ marginTop: "16px", borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>KPI Measurements</h4>
            <Button tone="ghost" onClick={() => setViewingMeasurements(null)}>Close</Button>
          </div>
          <KpiMeasurements kpiId={viewingMeasurements} />
        </div>
      )}

      {kpiList.length === 0 ? (
        <p className={styles.empty}>No KPIs {targetType === "domain" ? "defined for" : "aligned to"} this {targetType}</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>KPI</th>
              <th>Category</th>
              <th>Target</th>
              {targetType !== "domain" && <th>Weight</th>}
              {targetType !== "domain" && <th>Attribution</th>}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {kpiList.map((kpi: any) => (
              <tr key={kpi.kpi_id}>
                <td>
                  <strong>{kpi.kpi_name}</strong>
                  <code className={styles.id}>{kpi.kpi_id.slice(0, 8)}…</code>
                </td>
                <td>
                  <span className={styles.badge}>{kpi.kpi_category}</span>
                </td>
                <td>{kpi.kpi_target_value} {kpi.kpi_unit}</td>
                {targetType !== "domain" && (
                  <td>{kpi.weight != null ? `${(kpi.weight * 100).toFixed(0)}%` : "—"}</td>
                )}
                {targetType !== "domain" && (
                  <td>{kpi.attribution_type ?? "—"}</td>
                )}
                <td>
                  <button
                    className={styles.actionButton}
                    onClick={() => setViewingMeasurements(kpi.kpi_id)}
                  >
                    Measurements
                  </button>
                  <button
                    className={styles.actionButton}
                    onClick={async () => {
                      if (targetType === "domain") {
                        if (confirm("Archive this KPI?")) {
                          await api.kpi.archive(kpi.kpi_id);
                          setRefreshKey(prev => prev + 1);
                        }
                      } else if (kpi.alignment_id) {
                        if (confirm("Remove this KPI alignment?")) {
                          await api.kpi.deleteAlignment(kpi.alignment_id);
                          setRefreshKey(prev => prev + 1);
                        }
                      }
                    }}
                  >
                    {targetType === "domain" ? "Archive" : "Remove"}
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

function KpiAlignmentForm({ targetId, targetType, onCancel, onSuccess }: { targetId: string; targetType: "journey" | "activity" | "domain"; onCancel: () => void; onSuccess: () => void }) {
  const [kpiId, setKpiId] = useState("");
  const [weight, setWeight] = useState(0.5);
  const [attributionType, setAttributionType] = useState<"direct" | "indirect" | "leading" | "lagging">("direct");
  const [alignmentNotes, setAlignmentNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const allKpis = useFetch(() => api.cypher("MATCH (k:KPI) WHERE k.archived_at IS NULL RETURN k.id AS id, k.name AS name, k.category AS category, k.unit AS unit, k.target_value AS target_value ORDER BY k.name"), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!kpiId) {
      setError("Please select a KPI");
      setLoading(false);
      return;
    }

    try {
      const payload: any = {
        kpi_id: kpiId,
        target_type: targetType,
        target_id: targetId,
        weight,
        attribution_type: attributionType,
      };
      if (alignmentNotes) {
        payload.alignment_notes = alignmentNotes;
      }
      await api.kpi.createAlignment(payload);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to create alignment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h4 className={styles.formTitle}>Align KPI</h4>
      
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.formField}>
        <label className={styles.label}>KPI</label>
        <select
          className={styles.select}
          value={kpiId}
          onChange={(e) => setKpiId(e.target.value)}
          required
        >
          <option value="">Select KPI</option>
          {allKpis.status === "ok" && allKpis.data?.rows.map((kpi: any) => (
            <option key={kpi.id} value={kpi.id}>
              {kpi.name} ({kpi.category}) - Target: {kpi.target_value} {kpi.unit}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Weight (0-1)</label>
        <input
          type="number"
          step="0.1"
          min="0"
          max="1"
          className={styles.input}
          value={weight}
          onChange={(e) => setWeight(parseFloat(e.target.value))}
          required
        />
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Attribution Type</label>
        <select
          className={styles.select}
          value={attributionType}
          onChange={(e) => setAttributionType(e.target.value as any)}
          required
        >
          <option value="direct">Direct</option>
          <option value="indirect">Indirect</option>
          <option value="leading">Leading</option>
          <option value="lagging">Lagging</option>
        </select>
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

function KpiCreateForm({ domainId, onCancel, onSuccess }: { domainId: string; onCancel: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<KPICreate["category"]>("efficiency");
  const [unit, setUnit] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [targetDirection, setTargetDirection] = useState<KPICreate["target_direction"]>("higher_is_better");
  const [warningThreshold, setWarningThreshold] = useState("");
  const [criticalThreshold, setCriticalThreshold] = useState("");
  const [measurementFrequency, setMeasurementFrequency] = useState<KPICreate["measurement_frequency"]>("monthly");
  const [ownerRole, setOwnerRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canProceed = () => {
    if (step === 1) return name.trim().length > 0 && category.length > 0;
    if (step === 2) return unit.trim().length > 0 && targetValue.trim().length > 0 && !isNaN(parseFloat(targetValue));
    return true;
  };

  const handleNext = () => {
    if (canProceed()) {
      setError("");
      setStep((s) => s + 1);
    } else {
      setError("Please fill in all required fields.");
    }
  };

  const handleBack = () => {
    setError("");
    setStep((s) => s - 1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const payload: KPICreate = {
        name: name.trim(),
        category,
        unit: unit.trim(),
        target_value: parseFloat(targetValue),
        target_direction: targetDirection,
        measurement_frequency: measurementFrequency,
        domain_id: domainId,
      };
      const desc = description.trim();
      if (desc) (payload as any).description = desc;
      const wt = warningThreshold.trim();
      const ct = criticalThreshold.trim();
      if (wt && !isNaN(parseFloat(wt))) (payload as any).warning_threshold = parseFloat(wt);
      if (ct && !isNaN(parseFloat(ct))) (payload as any).critical_threshold = parseFloat(ct);
      if (ownerRole.trim()) (payload as any).owner_role = ownerRole.trim();

      await api.kpi.create(payload);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to create KPI");
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { num: 1, label: "Basics" },
    { num: 2, label: "Target" },
    { num: 3, label: "Review" },
  ];

  return (
    <div className={styles.wizard}>
      <div className={styles.wizardSteps}>
        {steps.map((s) => (
          <div key={s.num} className={`${styles.wizardStep} ${step === s.num ? styles.wizardStepActive : ""}`}>
            <span className={styles.wizardStepNumber}>{s.num}</span>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      {error && <div className={styles.error} style={{ marginBottom: 16 }}>{error}</div>}

      {step === 1 && (
        <div className={styles.wizardGrid}>
          <div className={styles.formField}>
            <label className={styles.label}>KPI Name *</label>
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Average Time to Market" required />
          </div>
          <div className={styles.formField}>
            <label className={styles.label}>Category *</label>
            <select className={styles.select} value={category} onChange={(e) => setCategory(e.target.value as KPICreate["category"])}>
              <option value="efficiency">Efficiency</option>
              <option value="quality">Quality</option>
              <option value="customer_satisfaction">Customer Satisfaction</option>
              <option value="cost">Cost</option>
              <option value="time">Time</option>
              <option value="compliance">Compliance</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className={styles.formField}>
            <label className={styles.label}>Description</label>
            <textarea className={styles.textarea} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What does this KPI measure and why does it matter?" />
          </div>
          <div className={styles.formField}>
            <label className={styles.label}>Owner Role</label>
            <input className={styles.input} value={ownerRole} onChange={(e) => setOwnerRole(e.target.value)} placeholder="e.g. Pricing Analyst" />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className={styles.wizardGrid}>
          <div className={styles.formField}>
            <label className={styles.label}>Target Value *</label>
            <input type="number" className={styles.input} value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder="e.g. 90" required />
          </div>
          <div className={styles.formField}>
            <label className={styles.label}>Unit *</label>
            <input className={styles.input} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. days, %, USD" required />
          </div>
          <div className={styles.formField}>
            <label className={styles.label}>Target Direction *</label>
            <select className={styles.select} value={targetDirection} onChange={(e) => setTargetDirection(e.target.value as KPICreate["target_direction"])}>
              <option value="higher_is_better">Higher is Better</option>
              <option value="lower_is_better">Lower is Better</option>
              <option value="target_is_exact">Target is Exact</option>
            </select>
          </div>
          <div className={styles.formField}>
            <label className={styles.label}>Frequency *</label>
            <select className={styles.select} value={measurementFrequency} onChange={(e) => setMeasurementFrequency(e.target.value as KPICreate["measurement_frequency"])}>
              <option value="realtime">Realtime</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>
          <div className={styles.formField}>
            <label className={styles.label}>Warning Threshold</label>
            <input type="number" className={styles.input} value={warningThreshold} onChange={(e) => setWarningThreshold(e.target.value)} placeholder="Optional" />
          </div>
          <div className={styles.formField}>
            <label className={styles.label}>Critical Threshold</label>
            <input type="number" className={styles.input} value={criticalThreshold} onChange={(e) => setCriticalThreshold(e.target.value)} placeholder="Optional" />
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <div className={styles.wizardSummary}>
            <div className={styles.wizardSummaryRow}>
              <span className={styles.wizardSummaryLabel}>Name</span>
              <span className={styles.wizardSummaryValue}>{name}</span>
            </div>
            {description && (
              <div className={styles.wizardSummaryRow}>
                <span className={styles.wizardSummaryLabel}>Description</span>
                <span className={styles.wizardSummaryValue}>{description}</span>
              </div>
            )}
            <div className={styles.wizardSummaryRow}>
              <span className={styles.wizardSummaryLabel}>Category</span>
              <span className={styles.wizardSummaryValue}>{category}</span>
            </div>
            <div className={styles.wizardSummaryRow}>
              <span className={styles.wizardSummaryLabel}>Target</span>
              <span className={styles.wizardSummaryValue}>{targetValue} {unit} ({targetDirection.replace(/_/g, " ")})</span>
            </div>
            <div className={styles.wizardSummaryRow}>
              <span className={styles.wizardSummaryLabel}>Frequency</span>
              <span className={styles.wizardSummaryValue}>{measurementFrequency}</span>
            </div>
            {ownerRole && (
              <div className={styles.wizardSummaryRow}>
                <span className={styles.wizardSummaryLabel}>Owner</span>
                <span className={styles.wizardSummaryValue}>{ownerRole}</span>
              </div>
            )}
            {(warningThreshold || criticalThreshold) && (
              <div className={styles.wizardSummaryRow}>
                <span className={styles.wizardSummaryLabel}>Thresholds</span>
                <span className={styles.wizardSummaryValue}>
                  {warningThreshold ? `Warn: ${warningThreshold}` : ""}
                  {warningThreshold && criticalThreshold ? " / " : ""}
                  {criticalThreshold ? `Critical: ${criticalThreshold}` : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={styles.formActions} style={{ marginTop: 20 }}>
        {step > 1 ? (
          <Button type="button" tone="ghost" onClick={handleBack} disabled={loading}>
            Back
          </Button>
        ) : (
          <Button type="button" tone="ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
        {step < 3 ? (
          <Button type="button" onClick={handleNext}>
            Next
          </Button>
        ) : (
          <Button type="button" onClick={handleSubmit} disabled={loading}>
            {loading ? "Creating..." : "Create KPI"}
          </Button>
        )}
      </div>
    </div>
  );
}
