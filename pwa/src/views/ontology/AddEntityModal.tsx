import { useState } from "react";
import { api } from "../../api";
import { Card } from "../../components/Card";
import { SecLabel } from "../_shared";
import styles from "./AddEntityModal.module.css";

interface AddEntityModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function AddEntityModal({ onClose, onSuccess }: AddEntityModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [usageExample, setUsageExample] = useState("");
  const [attributes, setAttributes] = useState<Array<{ name: string; type: string; required: boolean }>>([
    { name: "id", type: "string", required: true },
  ]);
  const [externalAlignment, setExternalAlignment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddAttribute = () => {
    const newAttr: { name: string; type: string; required: boolean } = { name: "", type: "string", required: false };
    setAttributes([...attributes, newAttr]);
  };

  const handleRemoveAttribute = (index: number) => {
    setAttributes(attributes.filter((_, i) => i !== index));
  };

  const handleAttributeChange = (index: number, field: keyof typeof attributes[0], value: string | boolean) => {
    const updated = [...attributes];
    updated[index] = { ...updated[index], [field]: value } as { name: string; type: string; required: boolean };
    setAttributes(updated);
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

    const invalidAttr = attributes.find((a) => !a.name.trim());
    if (invalidAttr) {
      setError("All attributes must have a name");
      return;
    }

    // Build JSON schema
    const jsonSchemaDoc: Record<string, unknown> = {
      type: "object",
      properties: {} as Record<string, unknown>,
      required: [] as string[],
    };

    for (const attr of attributes) {
      if (attr.name) {
        (jsonSchemaDoc.properties as Record<string, unknown>)[attr.name] = { type: attr.type };
        if (attr.required) {
          (jsonSchemaDoc.required as string[]).push(attr.name);
        }
      }
    }

    const externalAlignments = externalAlignment.trim()
      ? [{ source: "custom", id: externalAlignment.trim() }]
      : [];

    try {
      setLoading(true);
      await api.ontology.createLabel({
        name: name.trim(),
        description: description.trim(),
        usage_example: usageExample.trim(),
        json_schema_doc: jsonSchemaDoc,
        external_alignment: externalAlignments,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create entity");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <Card title="Add Entity">
          <form onSubmit={handleSubmit}>
            <SecLabel>NAME</SecLabel>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Product"
              className={styles.input}
              required
            />

            <SecLabel>DESCRIPTION</SecLabel>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this entity type..."
              className={styles.textarea}
              rows={3}
              required
            />

            <SecLabel>USAGE EXAMPLE</SecLabel>
            <input
              type="text"
              value={usageExample}
              onChange={(e) => setUsageExample(e.target.value)}
              placeholder="e.g., A product in the catalog"
              className={styles.input}
              required
            />

            <SecLabel>ATTRIBUTES</SecLabel>
            <div className={styles.attrList}>
              {attributes.map((attr, index) => (
                <div key={index} className={styles.attrRow}>
                  <input
                    type="text"
                    value={attr.name}
                    onChange={(e) => handleAttributeChange(index, "name", e.target.value)}
                    placeholder="name"
                    className={styles.attrInput}
                    required
                  />
                  <select
                    value={attr.type}
                    onChange={(e) => handleAttributeChange(index, "type", e.target.value)}
                    className={styles.attrSelect}
                  >
                    <option value="string">string</option>
                    <option value="integer">integer</option>
                    <option value="boolean">boolean</option>
                    <option value="number">number</option>
                  </select>
                  <label className={styles.attrCheckbox}>
                    <input
                      type="checkbox"
                      checked={attr.required}
                      onChange={(e) => handleAttributeChange(index, "required", e.target.checked)}
                    />
                    required
                  </label>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttribute(index)}
                    className={styles.removeBtn}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddAttribute}
                className={styles.addAttrBtn}
              >
                + Add attribute
              </button>
            </div>

            <SecLabel>EXTERNAL ALIGNMENT (OPTIONAL)</SecLabel>
            <input
              type="text"
              value={externalAlignment}
              onChange={(e) => setExternalAlignment(e.target.value)}
              placeholder="e.g., ARTS:Product"
              className={styles.input}
            />

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.actions}>
              <button type="button" onClick={onClose} className={styles.cancelBtn}>
                Cancel
              </button>
              <button type="submit" disabled={loading} className={styles.submitBtn}>
                {loading ? "Creating..." : "Create Entity"}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
