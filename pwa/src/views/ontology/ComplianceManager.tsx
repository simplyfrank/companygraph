import React, { useState, useEffect } from "react";
import type { ComplianceRuleRead } from "@companygraph/shared/schema/ontology";

export function ComplianceManager() {
  const [rules, setRules] = useState<ComplianceRuleRead[]>([]);
  const [selectedRule, setSelectedRule] = useState<ComplianceRuleRead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filterType, setFilterType] = useState<string>("");
  const [filterEnabled, setFilterEnabled] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    loadRules();
  }, [filterType, filterEnabled]);

  const loadRules = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (filterType) params.append("rule_type", filterType);
      if (filterEnabled !== undefined) params.append("enabled", filterEnabled.toString());
      
      const response = await fetch(`/api/v1/compliance/rules?${params.toString()}`);
      const data = await response.json();
      setRules(data);
    } catch (error) {
      console.error("Failed to load rules:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (rule: Partial<ComplianceRuleRead>) => {
    try {
      const response = await fetch("/api/v1/compliance/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
      });
      const data = await response.json();
      await loadRules();
      setShowCreate(false);
      setSelectedRule(data);
    } catch (error) {
      console.error("Failed to create rule:", error);
    }
  };

  const handleEvaluate = async (ruleId: string) => {
    try {
      const response = await fetch(`/api/v1/compliance/rules/evaluate?id=${ruleId}`, {
        method: "POST",
      });
      const result = await response.json();
      alert(`Evaluation result: ${result.passed ? "PASSED" : "FAILED"} (Score: ${result.score})`);
      await loadRules();
    } catch (error) {
      console.error("Failed to evaluate rule:", error);
    }
  };

  const handleToggleEnabled = async (ruleId: string, enabled: boolean) => {
    try {
      await fetch(`/api/v1/compliance/rules?id=${ruleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      await loadRules();
    } catch (error) {
      console.error("Failed to toggle rule:", error);
    }
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) return;
    
    try {
      await fetch(`/api/v1/compliance/rules?id=${ruleId}`, {
        method: "DELETE",
      });
      await loadRules();
      setSelectedRule(null);
    } catch (error) {
      console.error("Failed to delete rule:", error);
    }
  };

  if (isLoading) {
    return <div className="p-4">Loading compliance rules...</div>;
  }

  return (
    <div className="flex h-full">
      {/* Rules sidebar */}
      <div className="w-80 border-r bg-gray-50 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Compliance Rules</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            + Create
          </button>
        </div>
        
        {/* Filters */}
        <div className="space-y-2 mb-4">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm"
          >
            <option value="">All Types</option>
            <option value="PERFORMANCE">Performance</option>
            <option value="COMPLIANCE">Compliance</option>
            <option value="QUALITY">Quality</option>
          </select>
          <select
            value={filterEnabled === undefined ? "" : filterEnabled.toString()}
            onChange={(e) => setFilterEnabled(e.target.value === "" ? undefined : e.target.value === "true")}
            className="w-full px-2 py-1 border rounded text-sm"
          >
            <option value="">All Status</option>
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </div>

        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              onClick={() => setSelectedRule(rule)}
              className={`p-3 rounded cursor-pointer ${
                selectedRule?.id === rule.id
                  ? "bg-blue-100 border-blue-300"
                  : "bg-white hover:bg-gray-100"
              }`}
            >
              <div className="font-medium">{rule.name}</div>
              <div className="text-sm text-gray-500">{rule.rule_type}</div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    rule.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {rule.enabled ? "Enabled" : "Disabled"}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    rule.severity === "CRITICAL"
                      ? "bg-red-100 text-red-800"
                      : rule.severity === "HIGH"
                      ? "bg-orange-100 text-orange-800"
                      : rule.severity === "MEDIUM"
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {rule.severity}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rule details panel */}
      <div className="flex-1 p-6">
        {selectedRule ? (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold">{selectedRule.name}</h1>
                <p className="text-gray-600">{selectedRule.description}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEvaluate(selectedRule.id)}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Evaluate
                </button>
                <button
                  onClick={() => handleToggleEnabled(selectedRule.id, !selectedRule.enabled)}
                  className={`px-4 py-2 rounded ${
                    selectedRule.enabled
                      ? "bg-yellow-600 text-white hover:bg-yellow-700"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {selectedRule.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => handleDelete(selectedRule.id)}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Rule DSL</h3>
                <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto max-h-64">
                  {selectedRule.rule_dsl}
                </pre>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Type:</span> {selectedRule.rule_type}
                  </div>
                  <div>
                    <span className="text-gray-500">Category:</span> {selectedRule.category}
                  </div>
                  <div>
                    <span className="text-gray-500">Severity:</span> {selectedRule.severity}
                  </div>
                  <div>
                    <span className="text-gray-500">Schedule:</span> {selectedRule.schedule || "Manual"}
                  </div>
                </div>
              </div>

              {selectedRule.last_evaluated_at && (
                <div>
                  <h3 className="font-semibold mb-2">Last Evaluation</h3>
                  <div className="text-sm">
                    <div>
                      <span className="text-gray-500">Time:</span>{" "}
                      {new Date(selectedRule.last_evaluated_at).toLocaleString()}
                    </div>
                    {selectedRule.last_evaluation_result && (
                      <div>
                        <span className="text-gray-500">Result:</span>{" "}
                        {selectedRule.last_evaluation_result}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-semibold mb-2">Actions</h3>
                <div className="space-y-2">
                  {JSON.parse(selectedRule.actions).map((action: any, idx: number) => (
                    <div key={idx} className="text-sm bg-gray-100 p-2 rounded">
                      <span className="font-medium">{action.type}:</span>{" "}
                      {JSON.stringify(action.config)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>Select a rule to view details</p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <CreateRuleModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}

function CreateRuleModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (rule: Partial<ComplianceRuleRead>) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ruleDsl, setRuleDsl] = useState("");
  const [ruleType, setRuleType] = useState("PERFORMANCE");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");
  const [enabled, setEnabled] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      name,
      description,
      rule_dsl: ruleDsl,
      rule_type: ruleType as "PERFORMANCE" | "COMPLIANCE" | "QUALITY",
      category,
      severity: severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      enabled,
      actions: JSON.stringify([]),
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
        <h2 className="text-xl font-bold mb-4">Create Compliance Rule</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              rows={2}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Rule DSL</label>
            <textarea
              value={ruleDsl}
              onChange={(e) => setRuleDsl(e.target.value)}
              className="w-full px-3 py-2 border rounded font-mono text-sm"
              rows={6}
              placeholder="WHEN entity.property &lt; threshold THEN TAG 'violation'"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={ruleType}
                onChange={(e) => setRuleType(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="PERFORMANCE">Performance</option>
                <option value="COMPLIANCE">Compliance</option>
                <option value="QUALITY">Quality</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Enabled</label>
              <select
                value={enabled.toString()}
                onChange={(e) => setEnabled(e.target.value === "true")}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
