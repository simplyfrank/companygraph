// business-model-authoring T-08 (design §4.4, §6) — JourneysStep component.
// Add/edit UserJourneys each PART_OF a chosen active-model Domain.

import { useState } from "react";
import { Card } from "../../../components/Card";
import { Button } from "../../../components/Button";
import type { WizardState, WizardAction } from "./wizardModel";
import { canAdvance } from "./wizardModel";
import type { AuthoringApplyResult } from "@companygraph/shared/schema/authoring";

interface DomainRow {
  id: string;
  name: string;
}

interface JourneysStepProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  domains: DomainRow[];
  onApply: (body: {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  }) => Promise<AuthoringApplyResult>;
}

export function JourneysStep({ state, dispatch, domains, onApply }: JourneysStepProps) {
  const [name, setName] = useState("");
  const [domainId, setDomainId] = useState(domains[0]?.id ?? "");

  const handleAdd = async () => {
    if (!name.trim() || !domainId) return;
    const clientKey = `j${Object.keys(state.committed.nodeIds).length}`;
    const result = await onApply({
      nodes: [{
        clientKey,
        label: "UserJourney",
        name: name.trim(),
      }],
      edges: [{
        type: "PART_OF",
        from: clientKey,
        to: domainId,
      }],
    });
    dispatch({ type: "commitApply", result });
    setName("");
  };

  return (
    <Card title="Journeys">
      <div data-testid="journey-list">
        {Object.entries(state.committed.nodeIds).map(([key, id]) => (
          <div key={key} data-testid={`journey-row-${key}`}>
            {key}: {id}
          </div>
        ))}
      </div>
      <div data-testid="journey-create">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Journey name"
          aria-label="New journey name"
        />
        <select
          value={domainId}
          onChange={(e) => setDomainId(e.target.value)}
          aria-label="Parent domain"
        >
          {domains.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <Button onClick={handleAdd}>Add journey</Button>
      </div>
      <Button onClick={() => dispatch({ type: "next" })}>Next</Button>
      {!canAdvance(state) && (
        <p role="alert" data-testid="journey-gate-message">
          Add at least one journey to continue.
        </p>
      )}
    </Card>
  );
}
