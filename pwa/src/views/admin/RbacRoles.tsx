import { useState, useCallback } from "react";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { DataTable } from "../../components/DataTable";
import { Pill } from "../../components/Pill";
import { useFetch } from "../../useFetch";
import { rbacRoles as rbacApi, type RbacRoleRow, type RbacRoleCreate } from "../../api/rbac";

export function AdminRbacRoles() {
  const [showCreate, setShowCreate] = useState(false);
  const [editRole, setEditRole] = useState<RbacRoleRow | null>(null);
  const listState = useFetch(async (signal) => rbacApi.list(signal), []);

  if (listState.status === "loading") return <Loading what="RBAC roles" />;
  if (listState.status === "error") return <ErrorState message={listState.error} />;

  const rows = listState.data;

  return (
    <div>
      <ViewHeader title="RBAC Roles" lede="Manage application-level permission sets" />
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
        <Card
          title="Role List"
          actions={<Button tone="primary" onClick={() => setShowCreate(true)}>New Role</Button>}
        >
          <DataTable
            columns={[
              { id: "name", label: "Name" },
              { id: "description", label: "Description" },
              { id: "permissions", label: "Permissions" },
              { id: "actions", label: "" },
            ]}
            rows={rows.map((r) => ({
              name: <strong>{r.name}</strong>,
              description: r.description,
              permissions: <Pill tone="accent">{r.permissions.length} permission(s)</Pill>,
              actions: (
                <Button tone="ghost" onClick={() => setEditRole(r)}>
                  Edit
                </Button>
              ),
            }))}
          />
        </Card>

        {showCreate && (
          <RbacRoleForm
            onCancel={() => setShowCreate(false)}
            onSaved={() => { setShowCreate(false); window.location.reload(); }}
          />
        )}

        {editRole && (
          <RbacRoleForm
            existing={editRole}
            onCancel={() => setEditRole(null)}
            onSaved={() => { setEditRole(null); window.location.reload(); }}
          />
        )}
      </div>
    </div>
  );
}

const AVAILABLE_PERMISSIONS = [
  "domain:read", "domain:write",
  "journey:read", "journey:write",
  "persona:read", "persona:write",
  "ontology:read", "ontology:write",
  "compliance:read", "compliance:write",
  "risk:read", "risk:write",
  "kpi:read", "kpi:write",
  "sla:read", "sla:write",
  "okr:read", "okr:write",
  "change_request:read", "change_request:write", "change_request:review",
  "analytics:read",
  "query:read",
  "chat:read", "chat:write",
  "export:read",
  "rbac:read", "rbac:write",
  "user:read", "user:write",
];

function RbacRoleForm({
  existing,
  onCancel,
  onSaved,
}: {
  existing?: RbacRoleRow;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [permissions, setPermissions] = useState<Set<string>>(new Set(existing?.permissions ?? []));
  const [customPerm, setCustomPerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const togglePermission = useCallback((perm: string) => {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  }, []);

  const addCustomPerm = useCallback(() => {
    const trimmed = customPerm.trim();
    if (trimmed && !permissions.has(trimmed)) {
      setPermissions((prev) => new Set(prev).add(trimmed));
      setCustomPerm("");
    }
  }, [customPerm, permissions]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const permArray = Array.from(permissions).sort();
      if (existing) {
        await rbacApi.update(existing.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          permissions: permArray,
        });
      } else {
        const data: RbacRoleCreate = {
          name: name.trim(),
          description: description.trim() || undefined,
          permissions: permArray,
        };
        await rbacApi.create(data);
      }
      onSaved();
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    } finally {
      setSaving(false);
    }
  }, [name, description, permissions, existing, onSaved]);

  return (
    <Card
      title={existing ? `Edit: ${existing.name}` : "Create RBAC Role"}
      actions={<Button tone="ghost" onClick={onCancel}>Cancel</Button>}
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <label>
          <div style={{ marginBottom: "0.25rem" }}>Name</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. domain_editor"
            style={{ width: "100%", padding: "0.5rem" }}
            autoFocus
          />
        </label>
        <label>
          <div style={{ marginBottom: "0.25rem" }}>Description</div>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Role description…"
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </label>

        <div>
          <div style={{ marginBottom: "0.25rem" }}>Permissions</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", maxWidth: "400px" }}>
            {AVAILABLE_PERMISSIONS.map((perm) => (
              <Pill
                key={perm}
                tone={permissions.has(perm) ? "good" : "neutral"}
              >
                <label style={{ cursor: "pointer", display: "inline-flex", gap: "0.25rem" }}>
                  <input
                    type="checkbox"
                    checked={permissions.has(perm)}
                    onChange={() => togglePermission(perm)}
                    style={{ margin: 0 }}
                  />
                  {perm}
                </label>
              </Pill>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
          <label style={{ flex: 1 }}>
            <div style={{ marginBottom: "0.25rem" }}>Custom Permission</div>
            <input
              value={customPerm}
              onChange={(e) => setCustomPerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomPerm(); } }}
              placeholder="e.g. custom:action"
              style={{ width: "100%", padding: "0.5rem" }}
            />
          </label>
          <Button tone="ghost" onClick={addCustomPerm}>Add</Button>
        </div>

        {permissions.size > 0 && (
          <div>
            <strong>Selected ({permissions.size}):</strong>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginTop: "0.25rem" }}>
              {Array.from(permissions).sort().map((p) => (
                <Pill key={p} tone="good">
                  {p}{" "}
                  <button
                    type="button"
                    onClick={() => togglePermission(p)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 0 0.25rem" }}
                  >
                    ×
                  </button>
                </Pill>
              ))}
            </div>
          </div>
        )}

        {error && <div style={{ color: "var(--danger)" }}>{error}</div>}
        <Button tone="primary" disabled={saving}>
          {saving ? "Saving…" : existing ? "Update Role" : "Create Role"}
        </Button>
      </form>
    </Card>
  );
}
