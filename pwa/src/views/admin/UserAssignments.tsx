import { useState, useCallback } from "react";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { DataTable } from "../../components/DataTable";
import { Pill } from "../../components/Pill";
import { useFetch } from "../../useFetch";
import { userPersonas as userPersonaApi, personas as personaApi, type UserPersonaAssignment } from "../../api/rbac";

export function AdminUserAssignments() {
  const [userId, setUserId] = useState("");
  const [searchedUserId, setSearchedUserId] = useState<string | null>(null);

  const personaListState = useFetch(async (signal) => personaApi.list(signal), []);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (userId.trim()) setSearchedUserId(userId.trim());
  }, [userId]);

  return (
    <div>
      <ViewHeader title="User Assignments" lede="Assign personas and domain access to users" />

      <Card title="Find User">
        <form onSubmit={handleSearch} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
          <label style={{ flex: 1 }}>
            <div style={{ marginBottom: "0.25rem" }}>User ID or Email</div>
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g. user@example.com"
              style={{ width: "100%", padding: "0.5rem" }}
              autoFocus
            />
          </label>
          <Button tone="primary">Search</Button>
        </form>
      </Card>

      {searchedUserId && (
        <UserAssignmentDetail
          userId={searchedUserId}
          personas={personaListState.status === "ok" ? personaListState.data : []}
        />
      )}
    </div>
  );
}

function UserAssignmentDetail({
  userId,
  personas,
}: {
  userId: string;
  personas: Array<{ id: string; name: string; description: string }>;
}) {
  const [showAssign, setShowAssign] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const assignmentState = useFetch(
    async (signal) => userPersonaApi.list(userId, signal),
    [userId, refreshKey],
  );

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  if (assignmentState.status === "loading") return <Loading what="user assignments" />;
  if (assignmentState.status === "error") return <ErrorState message={assignmentState.error} />;

  const assignments = assignmentState.data.assignments;

  return (
    <Card
      title={`Assignments for ${userId}`}
      actions={<Button tone="primary" onClick={() => setShowAssign(true)}>Assign Persona</Button>}
    >
      {assignments.length === 0 ? (
        <div style={{ padding: "1rem 0" }}>No persona assignments yet.</div>
      ) : (
        <DataTable
          columns={[
            { id: "persona", label: "Persona" },
            { id: "domains", label: "Domain Access" },
            { id: "assignedAt", label: "Assigned" },
            { id: "actions", label: "" },
          ]}
          rows={assignments.map((a: UserPersonaAssignment) => ({
            persona: <strong>{a.personaName}</strong>,
            domains: a.domainIds.length > 0
              ? a.domainIds.map((d) => <Pill key={d} tone="accent">{d}</Pill>)
              : <Pill tone="neutral">All domains</Pill>,
            assignedAt: new Date(a.assignedAt).toLocaleDateString(),
            actions: (
              <Button
                tone="danger"
                onClick={async () => {
                  if (confirm(`Remove ${a.personaName} from ${userId}?`)) {
                    await userPersonaApi.remove(userId, a.personaId);
                    refresh();
                  }
                }}
              >
                Remove
              </Button>
            ),
          }))}
        />
      )}

      {showAssign && (
        <AssignPersonaForm
          userId={userId}
          personas={personas}
          existingAssignments={assignments}
          onCancel={() => setShowAssign(false)}
          onAssigned={() => { setShowAssign(false); refresh(); }}
        />
      )}
    </Card>
  );
}

function AssignPersonaForm({
  userId,
  personas,
  existingAssignments,
  onCancel,
  onAssigned,
}: {
  userId: string;
  personas: Array<{ id: string; name: string; description: string }>;
  existingAssignments: UserPersonaAssignment[];
  onCancel: () => void;
  onAssigned: () => void;
}) {
  const availablePersonas = personas.filter(
    (p) => !existingAssignments.some((a) => a.personaId === p.id),
  );
  const [personaId, setPersonaId] = useState(availablePersonas[0]?.id ?? "");
  const [domainIds, setDomainIds] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personaId) { setError("Select a persona"); return; }
    setSaving(true);
    setError(null);
    try {
      const domains = domainIds
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
      await userPersonaApi.assign(userId, {
        personaId,
        domainIds: domains.length > 0 ? domains : undefined,
      });
      onAssigned();
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    } finally {
      setSaving(false);
    }
  }, [userId, personaId, domainIds, onAssigned]);

  if (availablePersonas.length === 0) {
    return (
      <div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid var(--border, #ddd)", borderRadius: "0.5rem" }}>
        <p>All personas are already assigned to this user.</p>
        <Button tone="ghost" onClick={onCancel}>Close</Button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "1rem", padding: "1rem", border: "1px solid var(--border, #ddd)", borderRadius: "0.5rem" }}>
      <h4>Assign Persona</h4>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <label>
          <div style={{ marginBottom: "0.25rem" }}>Persona</div>
          <select
            value={personaId}
            onChange={(e) => setPersonaId(e.target.value)}
            style={{ width: "100%", padding: "0.5rem" }}
          >
            {availablePersonas.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label>
          <div style={{ marginBottom: "0.25rem" }}>Domain IDs (comma-separated, empty = all domains)</div>
          <input
            value={domainIds}
            onChange={(e) => setDomainIds(e.target.value)}
            placeholder="e.g. domain-1, domain-2"
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </label>
        {error && <div style={{ color: "var(--danger, #c0392b)" }}>{error}</div>}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button tone="primary" disabled={saving}>
            {saving ? "Assigning…" : "Assign"}
          </Button>
          <Button tone="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
