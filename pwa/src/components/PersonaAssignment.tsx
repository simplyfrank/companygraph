import { useState } from "react";
import { api, type PersonaAssignmentCreate } from "../api";
import { useFetch } from "../useFetch";
import { Button } from "./Button";
import styles from "./PersonaAssignment.module.css";

interface PersonaAssignmentProps {
  domainId: string;
}

export function PersonaAssignment({ domainId }: PersonaAssignmentProps) {
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const assignments = useFetch(() => api.persona.getAssignments(domainId), [domainId, refreshKey]);
  const allPersonas = useFetch(() => api.persona.list(), [refreshKey]);

  if (assignments.status === "loading" || allPersonas.status === "loading") {
    return <div className={styles.loading}>Loading assignments...</div>;
  }
  if (assignments.status === "error") return <div className={styles.error}>Error: {assignments.error}</div>;
  if (allPersonas.status === "error") return <div className={styles.error}>Error: {allPersonas.error}</div>;

  const assignmentList = assignments.data?.assignments || [];
  const personaList = allPersonas.data?.personas || [];

  // Get assigned persona IDs
  const assignedPersonaIds = new Set(assignmentList.map((a) => a.persona.id));
  const availablePersonas = personaList.filter((p) => !assignedPersonaIds.has(p.id));

  const handleSuccess = () => {
    setShowAssignForm(false);
    setRefreshKey(prev => prev + 1);
  };

  const handleRemove = async (assignmentId: string) => {
    if (confirm("Are you sure you want to remove this persona assignment?")) {
      try {
        await api.persona.deleteAssignment(assignmentId);
        setRefreshKey(prev => prev + 1);
      } catch (err: any) {
        alert(`Failed to remove assignment: ${err.message}`);
      }
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Assigned Personas</h3>
        <Button onClick={() => setShowAssignForm(true)}>+ Assign Persona</Button>
      </div>

      {showAssignForm && (
        <PersonaAssignForm
          domainId={domainId}
          availablePersonas={availablePersonas}
          onCancel={() => setShowAssignForm(false)}
          onSuccess={handleSuccess}
        />
      )}

      {assignmentList.length === 0 ? (
        <p className={styles.empty}>No personas assigned to this domain</p>
      ) : (
        <div className={styles.grid}>
          {assignmentList.map(({ persona, assignment }) => (
            <div key={assignment.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <strong>{persona.name}</strong>
                  {persona.description && (
                    <div className={styles.description}>{persona.description}</div>
                  )}
                </div>
                <button
                  className={styles.removeButton}
                  onClick={() => handleRemove(assignment.id)}
                >
                  ×
                </button>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.infoRow}>
                  <span className={styles.label}>Role Type:</span>
                  <span className={styles.badge}>{persona.attributes.roleType || "—"}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.label}>Authority:</span>
                  <span className={styles.badge}>{persona.attributes.authorityLevel || "—"}</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.label}>Allocation:</span>
                  <span>{assignment.allocationPercentage}%</span>
                </div>
                {assignment.isPrimary && (
                  <div className={styles.primaryBadge}>Primary</div>
                )}
                {persona.attributes.contactEmail && (
                  <div className={styles.infoRow}>
                    <span className={styles.label}>Email:</span>
                    <a href={`mailto:${persona.attributes.contactEmail}`} className={styles.link}>
                      {persona.attributes.contactEmail}
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonaAssignForm({
  domainId,
  availablePersonas,
  onCancel,
  onSuccess,
}: {
  domainId: string;
  availablePersonas: any[];
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [allocationPercentage, setAllocationPercentage] = useState(100);
  const [effectiveStartDate, setEffectiveStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!selectedPersonaId) {
      setError("Please select a persona");
      setLoading(false);
      return;
    }

    try {
      const payload: PersonaAssignmentCreate = {
        personaId: selectedPersonaId,
        domainId,
        isPrimary,
        allocationPercentage,
        effectiveStartDate: new Date(effectiveStartDate).toISOString(),
        notes: notes || null,
      };

      await api.persona.createAssignment(payload);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to assign persona");
    } finally {
      setLoading(false);
    }
  };

  if (availablePersonas.length === 0) {
    return (
      <div className={styles.form}>
        <p className={styles.empty}>No available personas to assign. Create a persona first.</p>
        <Button tone="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h4 className={styles.formTitle}>Assign Persona to Domain</h4>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.formField}>
        <label className={styles.label}>Persona</label>
        <select
          className={styles.select}
          value={selectedPersonaId}
          onChange={(e) => setSelectedPersonaId(e.target.value)}
          required
        >
          <option value="">Select a persona...</option>
          {availablePersonas.map((persona) => (
            <option key={persona.id} value={persona.id}>
              {persona.name} ({persona.attributes?.roleType || "No role type"})
            </option>
          ))}
        </select>
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
            style={{ marginRight: "8px" }}
          />
          Primary Persona
        </label>
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Allocation Percentage</label>
        <input
          type="number"
          className={styles.input}
          value={allocationPercentage}
          onChange={(e) => setAllocationPercentage(Number(e.target.value))}
          min="0"
          max="100"
          required
        />
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Effective Start Date</label>
        <input
          type="date"
          className={styles.input}
          value={effectiveStartDate}
          onChange={(e) => setEffectiveStartDate(e.target.value)}
          required
        />
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Notes</label>
        <textarea
          className={styles.textarea}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </div>

      <div className={styles.formActions}>
        <Button type="button" tone="ghost" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Assigning..." : "Assign Persona"}
        </Button>
      </div>
    </form>
  );
}
