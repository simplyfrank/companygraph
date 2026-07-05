// business-model-authoring T-09 (design §4.5, XD-18) — ActivitiesRolesStep.
// Per journey: add/edit Activities (PART_OF journey) + pick-or-create-global
// Roles wired via EXECUTES. Role picker uses Typeahead label="Role" backed
// by api.search.

import { useState } from "react";
import { Card } from "../../../components/Card";
import { Button } from "../../../components/Button";
import type { WizardState, WizardAction } from "./wizardModel";
import type { AuthoringApplyResult, AuthoringGraph } from "@companygraph/shared/schema/authoring";

interface ActivitiesRolesStepProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  graph: AuthoringGraph | null;
  onApply: (body: {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  }) => Promise<AuthoringApplyResult>;
  onSearchRoles: (q: string) => Promise<Array<{ id: string; name: string }>>;
}

export function ActivitiesRolesStep({ state, dispatch, graph, onApply, onSearchRoles }: ActivitiesRolesStepProps) {
  const [activityName, setActivityName] = useState("");
  const [selectedJourney, setSelectedJourney] = useState(graph?.journeys[0]?.id ?? "");
  const [roleQuery, setRoleQuery] = useState("");
  const [roleResults, setRoleResults] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState("");

  const handleSearch = async (q: string) => {
    setRoleQuery(q);
    if (q.trim()) {
      const results = await onSearchRoles(q);
      setRoleResults(results);
    } else {
      setRoleResults([]);
    }
  };

  const handleAddActivity = async () => {
    if (!activityName.trim() || !selectedJourney) return;
    const actKey = `a${Object.keys(state.committed.nodeIds).length}`;
    const nodes: Array<Record<string, unknown>> = [
      { clientKey: actKey, label: "Activity", name: activityName.trim() },
    ];
    const edges: Array<Record<string, unknown>> = [
      { type: "PART_OF", from: actKey, to: selectedJourney },
    ];

    // If a role is selected (existing) or a new role name is entered
    if (selectedRoleId) {
      nodes.push({ clientKey: `role-${selectedRoleId}`, label: "Role", name: roleQuery, existingId: selectedRoleId });
      edges.push({ type: "EXECUTES", from: `role-${selectedRoleId}`, to: actKey });
    } else if (newRoleName.trim()) {
      const roleKey = `role-${Date.now()}`;
      nodes.push({ clientKey: roleKey, label: "Role", name: newRoleName.trim() });
      edges.push({ type: "EXECUTES", from: roleKey, to: actKey });
    }

    const result = await onApply({ nodes, edges });
    dispatch({ type: "commitApply", result });
    setActivityName("");
    setSelectedRoleId(null);
    setRoleQuery("");
    setNewRoleName("");
    setRoleResults([]);
  };

  return (
    <Card title="Activities & Roles">
      <div data-testid="journey-selector">
        <select
          value={selectedJourney}
          onChange={(e) => setSelectedJourney(e.target.value)}
          aria-label="Select journey"
        >
          {graph?.journeys.map((j) => (
            <option key={j.id} value={j.id}>{j.name}</option>
          ))}
        </select>
      </div>
      <div data-testid="activity-create">
        <input
          value={activityName}
          onChange={(e) => setActivityName(e.target.value)}
          placeholder="Activity name"
          aria-label="New activity name"
        />
      </div>
      <div data-testid="role-picker">
        <input
          value={roleQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search existing role..."
          aria-label="Search roles"
        />
        <div data-testid="role-results">
          {roleResults.map((r) => (
            <button
              key={r.id}
              data-testid={`role-result-${r.id}`}
              onClick={() => { setSelectedRoleId(r.id); setNewRoleName(""); }}
            >
              {r.name}
            </button>
          ))}
        </div>
        {selectedRoleId && (
          <p data-testid="selected-role">Selected: {roleQuery}</p>
        )}
        <input
          value={newRoleName}
          onChange={(e) => { setNewRoleName(e.target.value); setSelectedRoleId(null); }}
          placeholder="...or type a new role name"
          aria-label="New role name"
        />
      </div>
      <Button onClick={handleAddActivity}>Add activity + role</Button>
      <Button onClick={() => dispatch({ type: "next" })}>Next</Button>
    </Card>
  );
}
