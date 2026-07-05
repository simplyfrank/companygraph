// business-model-authoring T-08 (design §4.3, §6) — DomainsStep component.
// Create via mwc POST …/domains only; inline edit via authoring.patchDomain.

import { useState } from "react";
import { Card } from "../../../components/Card";
import { Button } from "../../../components/Button";
import type { WizardState, WizardAction } from "./wizardModel";
import { canAdvance } from "./wizardModel";

interface DomainRow {
  id: string;
  name: string;
  description: string;
}

interface DomainsStepProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  domains: DomainRow[];
  modelId: string;
  onCreateDomain: (name: string, description?: string) => Promise<DomainRow>;
  onPatchDomain: (domainId: string, body: { name?: string; description?: string }) => Promise<void>;
}

export function DomainsStep({ state, dispatch, domains, onCreateDomain, onPatchDomain }: DomainsStepProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) return;
    const domain = await onCreateDomain(name.trim(), description.trim() || undefined);
    dispatch({ type: "commitDomain", domainId: domain.id });
    setName("");
    setDescription("");
  };

  const handleSaveEdit = async () => {
    if (editingId && editName.trim()) {
      await onPatchDomain(editingId, { name: editName.trim() });
      setEditingId(null);
      setEditName("");
    }
  };

  return (
    <Card title="Domains">
      <div data-testid="domain-list">
        {domains.map((d) => (
          <div key={d.id} data-testid={`domain-row-${d.id}`}>
            {editingId === d.id ? (
              <>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  aria-label="Edit domain name"
                />
                <Button onClick={handleSaveEdit}>Save</Button>
                <Button onClick={() => setEditingId(null)}>Cancel</Button>
              </>
            ) : (
              <>
                <span>{d.name}</span>
                <Button onClick={() => { setEditingId(d.id); setEditName(d.name); }}>Edit</Button>
              </>
            )}
          </div>
        ))}
      </div>
      <div data-testid="domain-create">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Domain name"
          aria-label="New domain name"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          aria-label="New domain description"
        />
        <Button onClick={handleCreate}>Add domain</Button>
      </div>
      <Button onClick={() => dispatch({ type: "next" })}>Next</Button>
      {!canAdvance(state) && (
        <p role="alert" data-testid="domain-gate-message">
          Add at least one domain to continue.
        </p>
      )}
    </Card>
  );
}
