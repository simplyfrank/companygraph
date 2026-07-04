import { useState, useEffect } from "react";
import { api, type PersonaCreate, type PersonaUpdate } from "../api";
import { useFetch } from "../useFetch";
import { Button } from "./Button";
import styles from "./PersonaCrud.module.css";

interface PersonaCrudProps {
  domainId?: string;
  onClose?: () => void;
}

export function PersonaCrud({ domainId, onClose }: PersonaCrudProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingPersona, setEditingPersona] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const personas = useFetch(() => api.persona.list(domainId), [domainId, refreshKey]);

  if (personas.status === "loading") return <div className={styles.loading}>Loading Personas...</div>;
  if (personas.status === "error") return <div className={styles.error}>Error: {personas.error}</div>;

  const personaList = personas.data?.personas || [];

  const handleSuccess = () => {
    setShowCreateForm(false);
    setEditingPersona(null);
    setRefreshKey(prev => prev + 1);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this persona?")) {
      try {
        await api.persona.delete(id);
        setRefreshKey(prev => prev + 1);
      } catch (err: any) {
        alert(`Failed to delete persona: ${err.message}`);
      }
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Persona Management</h3>
        <Button onClick={() => setShowCreateForm(true)}>+ Create Persona</Button>
      </div>

      {showCreateForm && (
        <PersonaCreateForm
          onCancel={() => setShowCreateForm(false)}
          onSuccess={handleSuccess}
        />
      )}

      {editingPersona && (
        <PersonaEditForm
          personaId={editingPersona}
          onCancel={() => setEditingPersona(null)}
          onSuccess={handleSuccess}
        />
      )}

      {personaList.length === 0 ? (
        <p className={styles.empty}>No personas defined</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role Type</th>
              <th>Authority</th>
              <th>Skills</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {personaList.map((persona) => (
              <tr key={persona.id}>
                <td>
                  <strong>{persona.name}</strong>
                  {persona.description && (
                    <div className={styles.description}>{persona.description}</div>
                  )}
                </td>
                <td>
                  <span className={styles.badge}>{persona.attributes.roleType || "—"}</span>
                </td>
                <td>
                  <span className={styles.badge}>{persona.attributes.authorityLevel || "—"}</span>
                </td>
                <td>{persona.attributes.skills?.length || 0}</td>
                <td>
                  <button
                    className={styles.actionButton}
                    onClick={() => setEditingPersona(persona.id)}
                  >
                    Edit
                  </button>
                  <button
                    className={styles.actionButton}
                    onClick={() => handleDelete(persona.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PersonaCreateForm({ onCancel, onSuccess }: { onCancel: () => void; onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [roleType, setRoleType] = useState<"strategic" | "operational" | "tactical" | "support">("operational");
  const [authorityLevel, setAuthorityLevel] = useState<"full" | "partial" | "advisory" | "none">("none");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const payload: PersonaCreate = {
        name,
        description,
        attributes: {
          roleType,
          authorityLevel,
          contactEmail: contactEmail || null,
          contactPhone: contactPhone || null,
        },
      };

      await api.persona.create(payload);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to create persona");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h4 className={styles.formTitle}>Create Persona</h4>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.formField}>
        <label className={styles.label}>Name</label>
        <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Description</label>
        <textarea className={styles.textarea} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Role Type</label>
        <select className={styles.select} value={roleType} onChange={(e) => setRoleType(e.target.value as any)}>
          <option value="strategic">Strategic</option>
          <option value="operational">Operational</option>
          <option value="tactical">Tactical</option>
          <option value="support">Support</option>
        </select>
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Authority Level</label>
        <select className={styles.select} value={authorityLevel} onChange={(e) => setAuthorityLevel(e.target.value as any)}>
          <option value="full">Full</option>
          <option value="partial">Partial</option>
          <option value="advisory">Advisory</option>
          <option value="none">None</option>
        </select>
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Contact Email</label>
        <input type="email" className={styles.input} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Contact Phone</label>
        <input className={styles.input} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
      </div>

      <div className={styles.formActions}>
        <Button type="button" tone="ghost" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Persona"}
        </Button>
      </div>
    </form>
  );
}

function PersonaEditForm({ personaId, onCancel, onSuccess }: { personaId: string; onCancel: () => void; onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [roleType, setRoleType] = useState<"strategic" | "operational" | "tactical" | "support">("operational");
  const [authorityLevel, setAuthorityLevel] = useState<"full" | "partial" | "advisory" | "none">("none");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadingPersona, setLoadingPersona] = useState(true);

  // Load persona data
  useEffect(() => {
    api.persona.get(personaId).then((data) => {
      const persona = data.persona;
      setName(persona.name);
      setDescription(persona.description);
      setRoleType(persona.attributes.roleType || "operational");
      setAuthorityLevel(persona.attributes.authorityLevel || "none");
      setContactEmail(persona.attributes.contactEmail || "");
      setContactPhone(persona.attributes.contactPhone || "");
      setLoadingPersona(false);
    }).catch((err) => {
      setError(err.message);
      setLoadingPersona(false);
    });
  }, [personaId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const payload: PersonaUpdate = {
        name,
        description,
        attributes: {
          roleType,
          authorityLevel,
          contactEmail: contactEmail || null,
          contactPhone: contactPhone || null,
        },
      };

      await api.persona.update(personaId, payload);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to update persona");
    } finally {
      setLoading(false);
    }
  };

  if (loadingPersona) return <div className={styles.loading}>Loading persona...</div>;

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h4 className={styles.formTitle}>Edit Persona</h4>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.formField}>
        <label className={styles.label}>Name</label>
        <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Description</label>
        <textarea className={styles.textarea} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Role Type</label>
        <select className={styles.select} value={roleType} onChange={(e) => setRoleType(e.target.value as any)}>
          <option value="strategic">Strategic</option>
          <option value="operational">Operational</option>
          <option value="tactical">Tactical</option>
          <option value="support">Support</option>
        </select>
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Authority Level</label>
        <select className={styles.select} value={authorityLevel} onChange={(e) => setAuthorityLevel(e.target.value as any)}>
          <option value="full">Full</option>
          <option value="partial">Partial</option>
          <option value="advisory">Advisory</option>
          <option value="none">None</option>
        </select>
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Contact Email</label>
        <input type="email" className={styles.input} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
      </div>

      <div className={styles.formField}>
        <label className={styles.label}>Contact Phone</label>
        <input className={styles.input} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
      </div>

      <div className={styles.formActions}>
        <Button type="button" tone="ghost" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Updating..." : "Update Persona"}
        </Button>
      </div>
    </form>
  );
}
