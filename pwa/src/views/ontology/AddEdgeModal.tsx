import { useState } from "react";
import { api } from "../../api";
import { Card } from "../../components/Card";
import { SecLabel } from "../_shared";
import styles from "./AddEdgeModal.module.css";

interface AddEdgeModalProps {
  onClose: () => void;
  onSuccess: () => void;
  availableLabels: string[];
}

export function AddEdgeModal({ onClose, onSuccess, availableLabels }: AddEdgeModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [usageExample, setUsageExample] = useState("");
  const [endpoints, setEndpoints] = useState<Array<{ fromLabel: string; toLabel: string }>>([
    { fromLabel: "", toLabel: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddPair = () => {
    const newPair: { fromLabel: string; toLabel: string } = { fromLabel: "", toLabel: "" };
    setEndpoints([...endpoints, newPair]);
  };

  const handleRemovePair = (index: number) => {
    setEndpoints(endpoints.filter((_, i) => i !== index));
  };

  const handlePairChange = (index: number, field: "fromLabel" | "toLabel", value: string) => {
    const updated = [...endpoints];
    updated[index] = { ...updated[index], [field]: value } as { fromLabel: string; toLabel: string };
    setEndpoints(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!description.trim()) {
      setError("Description is required");
      return;
    }
    if (!usageExample.trim()) {
      setError("Usage example is required");
      return;
    }

    const invalidPair = endpoints.find((p) => !p.fromLabel.trim() || !p.toLabel.trim());
    if (invalidPair) {
      setError("All endpoint pairs must have both from and to labels");
      return;
    }

    try {
      setLoading(true);
      await api.ontology.createEdgeType({
        name: name.trim(),
        description: description.trim(),
        usage_example: usageExample.trim(),
        endpoints: endpoints.map((p) => ({
          fromLabel: p.fromLabel.trim(),
          toLabel: p.toLabel.trim(),
        })),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create edge type");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <Card title="Add Edge Type">
          <form onSubmit={handleSubmit}>
            <SecLabel>NAME</SecLabel>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., FOLLOWS"
              className={styles.input}
              required
            />

            <SecLabel>DESCRIPTION</SecLabel>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this relationship type..."
              className={styles.textarea}
              rows={3}
              required
            />

            <SecLabel>USAGE EXAMPLE</SecLabel>
            <input
              type="text"
              value={usageExample}
              onChange={(e) => setUsageExample(e.target.value)}
              placeholder="e.g., A user journey follows another journey"
              className={styles.input}
              required
            />

            <SecLabel>ENDPOINT PAIRS</SecLabel>
            <div className={styles.pairList}>
              {endpoints.map((pair, index) => (
                <div key={index} className={styles.pairRow}>
                  <select
                    value={pair.fromLabel}
                    onChange={(e) => handlePairChange(index, "fromLabel", e.target.value)}
                    className={styles.pairSelect}
                    required
                  >
                    <option value="">From label...</option>
                    {availableLabels.map((label) => (
                      <option key={label} value={label}>{label}</option>
                    ))}
                  </select>
                  <span className={styles.arrow}>→</span>
                  <select
                    value={pair.toLabel}
                    onChange={(e) => handlePairChange(index, "toLabel", e.target.value)}
                    className={styles.pairSelect}
                    required
                  >
                    <option value="">To label...</option>
                    {availableLabels.map((label) => (
                      <option key={label} value={label}>{label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleRemovePair(index)}
                    className={styles.removeBtn}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddPair}
                className={styles.addPairBtn}
              >
                + Add pair
              </button>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.actions}>
              <button type="button" onClick={onClose} className={styles.cancelBtn}>
                Cancel
              </button>
              <button type="submit" disabled={loading} className={styles.submitBtn}>
                {loading ? "Creating..." : "Create Edge Type"}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
