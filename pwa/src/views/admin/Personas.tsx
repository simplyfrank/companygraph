import { useState, useCallback } from "react";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { DataTable } from "../../components/DataTable";
import { Pill } from "../../components/Pill";
import { useFetch } from "../../useFetch";
import { personas as personaApi, type PersonaRow, type PersonaCreate } from "../../api/rbac";

export function AdminPersonas() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listState = useFetch(async (signal) => personaApi.list(signal), []);

  if (listState.status === "loading") return <Loading what="personas" />;
  if (listState.status === "error") return <ErrorState message={listState.error} />;

  const rows = listState.data;

  return (
    <div>
      <ViewHeader title="Personas" lede="Manage business role hierarchy and RBAC role assignments" />
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
        <Card
          title="Persona List"
          actions={<Button tone="primary" onClick={() => setShowCreate(true)}>New Persona</Button>}
        >
          <DataTable
            columns={[
              { id: "name", label: "Name" },
              { id: "description", label: "Description" },
              { id: "parent", label: "Parent" },
              { id: "roles", label: "RBAC Roles" },
              { id: "actions", label: "" },
            ]}
            rows={rows.map((p) => ({
              name: <strong>{p.name}</strong>,
              description: p.description,
              parent: p.parentPersonaId
                ? rows.find((x) => x.id === p.parentPersonaId)?.name || "—"
                : "—",
              roles: <Pill tone="accent">{p.rbacRoleIds.length} role(s)</Pill>,
              actions: (
                <Button tone="ghost" onClick={() => setSelectedId(p.id)}>
                  View
                </Button>
              ),
            }))}
          />
        </Card>

        {showCreate && (
          <PersonaCreateForm
            existing={rows}
            onCancel={() => setShowCreate(false)}
            onCreated={() => { setShowCreate(false); window.location.reload(); }}
          />
        )}

        {selectedId && (
          <PersonaDetail
            personaId={selectedId}
            allPersonas={rows}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}

function PersonaCreateForm({
  existing,
  onCancel,
  onCreated,
}: {
  existing: PersonaRow[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentPersonaId, setParentPersonaId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const data: PersonaCreate = {
        name: name.trim(),
        description: description.trim() || undefined,
        parentPersonaId: parentPersonaId || undefined,
      };
      await personaApi.create(data);
      onCreated();
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    } finally {
      setSaving(false);
    }
  }, [name, description, parentPersonaId, onCreated]);

  return (
    <Card title="Create Persona" actions={<Button tone="ghost" onClick={onCancel}>Cancel</Button>}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <label>
          <div style={{ marginBottom: "0.25rem" }}>Name</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Domain Lead"
            style={{ width: "100%", padding: "0.5rem" }}
            autoFocus
          />
        </label>
        <label>
          <div style={{ marginBottom: "0.25rem" }}>Description</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Role description…"
            rows={2}
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </label>
        <label>
          <div style={{ marginBottom: "0.25rem" }}>Parent Persona</div>
          <select
            value={parentPersonaId}
            onChange={(e) => setParentPersonaId(e.target.value)}
            style={{ width: "100%", padding: "0.5rem" }}
          >
            <option value="">— None (top level) —</option>
            {existing.filter((p) => !p.archivedAt).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        {error && <div style={{ color: "var(--danger)" }}>{error}</div>}
        <Button tone="primary" disabled={saving}>
          {saving ? "Creating…" : "Create Persona"}
        </Button>
      </form>
    </Card>
  );
}

function PersonaDetail({
  personaId,
  allPersonas,
  onClose,
}: {
  personaId: string;
  allPersonas: PersonaRow[];
  onClose: () => void;
}) {
  const persona = allPersonas.find((p) => p.id === personaId);
  const permState = useFetch(async (signal) => personaApi.getPermissions(personaId, signal), [personaId]);

  if (!persona) return null;

  return (
    <Card
      title={persona.name}
      actions={<Button tone="ghost" onClick={onClose}>Close</Button>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <strong>Description:</strong> {persona.description || "—"}
        </div>
        <div>
          <strong>Parent:</strong>{" "}
          {persona.parentPersonaId
            ? allPersonas.find((p) => p.id === persona.parentPersonaId)?.name || "—"
            : "None (top level)"}
        </div>

        {permState.status === "loading" && <Loading what="permissions" />}
        {permState.status === "error" && <ErrorState message={permState.error} />}
        {permState.status === "ok" && (
          <>
            <div>
              <strong>RBAC Roles:</strong>
              <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
                {permState.data.rbacRoles.map((r) => (
                  <Pill key={r.id} tone="accent">{r.name}</Pill>
                ))}
                {permState.data.rbacRoles.length === 0 && <span>None assigned</span>}
              </div>
            </div>
            {permState.data.inheritedFrom.length > 0 && (
              <div>
                <strong>Inherited from:</strong>
                <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
                  {permState.data.inheritedFrom.map((p) => (
                    <Pill key={p.personaId} tone="neutral">{p.personaName}</Pill>
                  ))}
                </div>
              </div>
            )}
            <div>
              <strong>Effective Permissions:</strong>
              <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
                {permState.data.permissions.map((perm) => (
                  <Pill key={perm} tone="good">{perm}</Pill>
                ))}
                {permState.data.permissions.length === 0 && <span>No permissions</span>}
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
