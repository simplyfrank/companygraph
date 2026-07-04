import { useState, useEffect } from "react";
import * as api from "../api";

interface OKRDirective {
  id: string;
  name: string;
  description: string;
  attributes: {
    cycle_name: string;
    cycle_start: string;
    cycle_end: string;
    domain_id: string;
    status: "draft" | "active" | "review" | "closed";
    review_cadence: "weekly" | "monthly" | "quarterly";
  };
  createdAt: string;
  updatedAt: string;
}

interface KeyResult {
  id: string;
  name: string;
  description: string;
  attributes: {
    baseline_value: number;
    target_value: number;
    current_value: number;
    unit: string;
    direction: "higher_is_better" | "lower_is_better";
    progress: number;
    status: "not_started" | "in_progress" | "achieved" | "at_risk" | "missed";
  };
  createdAt: string;
  updatedAt: string;
}

interface OKRPerformance {
  directive: string;
  keyResult: string;
  keyResultAttrs: KeyResult["attributes"];
  kpi: string;
  kpiAttrs: Record<string, unknown>;
}

interface OkrCrudProps {
  domainId: string;
  domainName: string;
}

export function OkrCrud({ domainId, domainName }: OkrCrudProps) {
  const [directives, setDirectives] = useState<OKRDirective[]>([]);
  const [keyResults, setKeyResults] = useState<KeyResult[]>([]);
  const [performance, setPerformance] = useState<OKRPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDirective, setSelectedDirective] = useState<OKRDirective | null>(null);

  useEffect(() => {
    loadOKRs();
  }, [domainId]);

  const loadOKRs = async () => {
    setLoading(true);
    setError(null);
    try {
      const [directivesData, performanceData] = await Promise.all([
        api.okr.getDirectives(domainId),
        api.okr.getPerformance(domainId),
      ]);
      setDirectives(directivesData);
      setPerformance([performanceData]);
      
      if (directivesData && directivesData.length > 0) {
        const krData = await api.okr.getKeyResults(directivesData[0]!.id);
        setKeyResults(krData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load OKRs");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDirective = async (data: Partial<OKRDirective>) => {
    try {
      await api.okr.createDirective({
        name: data.name!,
        description: data.description!,
        attributes: data.attributes!,
      });
      setShowCreateModal(false);
      loadOKRs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create OKR directive");
    }
  };

  const handleUpdateKeyResult = async (id: string, data: Partial<KeyResult>) => {
    try {
      await api.okr.patchKeyResult(id, data);
      loadOKRs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update key result");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "achieved": return "bg-green-100 text-green-800";
      case "in_progress": return "bg-blue-100 text-blue-800";
      case "at_risk": return "bg-yellow-100 text-yellow-800";
      case "missed": return "bg-red-100 text-red-800";
      case "not_started": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const calculateProgress = (kr: KeyResult) => {
    const { baseline_value, target_value, current_value, direction } = kr.attributes;
    if (direction === "higher_is_better") {
      return Math.min(100, Math.max(0, ((current_value - baseline_value) / (target_value - baseline_value)) * 100));
    } else {
      return Math.min(100, Math.max(0, ((baseline_value - current_value) / (baseline_value - target_value)) * 100));
    }
  };

  if (loading) return <div className="p-4">Loading OKRs...</div>;
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">{domainName} OKRs</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Create OKR Cycle
        </button>
      </div>

      {directives.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded">
          <p className="text-gray-500 mb-4">No OKR cycles found for this domain</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Create First OKR Cycle
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {directives.map((directive) => (
            <div key={directive.id} className="bg-white border rounded-lg p-6 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-semibold">{directive.attributes.cycle_name}</h3>
                  <p className="text-sm text-gray-500">
                    {new Date(directive.attributes.cycle_start).toLocaleDateString()} - {new Date(directive.attributes.cycle_end).toLocaleDateString()}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(directive.attributes.status)}`}>
                  {directive.attributes.status}
                </span>
              </div>

              <div className="mb-4">
                <h4 className="font-medium mb-2">Key Results</h4>
                {keyResults.length === 0 ? (
                  <p className="text-gray-500 text-sm">No key results yet</p>
                ) : (
                  <div className="space-y-3">
                    {keyResults.map((kr) => {
                      const progress = calculateProgress(kr);
                      return (
                        <div key={kr.id} className="border rounded p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <h5 className="font-medium">{kr.name}</h5>
                              <p className="text-sm text-gray-500">{kr.description}</p>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs ${getStatusColor(kr.attributes.status)}`}>
                              {kr.attributes.status.replace("_", " ")}
                            </span>
                          </div>
                          
                          <div className="mt-3">
                            <div className="flex justify-between text-sm mb-1">
                              <span>{kr.attributes.baseline_value} {kr.attributes.unit}</span>
                              <span className="font-medium">{kr.attributes.current_value} {kr.attributes.unit}</span>
                              <span>{kr.attributes.target_value} {kr.attributes.unit}</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <div className="text-right text-xs text-gray-500 mt-1">{progress.toFixed(1)}%</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-medium mb-2">Performance Summary</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {performance
                    .filter((p) => p.directive === directive.name)
                    .map((p, idx) => (
                      <div key={idx} className="bg-gray-50 rounded p-3 text-sm">
                        <div className="font-medium">{p.keyResult}</div>
                        <div className="text-gray-500">KPI: {p.kpi}</div>
                        <div className="mt-1">
                          <span className="text-gray-600">Progress: </span>
                          <span className="font-medium">{p.keyResultAttrs.progress.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateOKRModal
          domainId={domainId}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateDirective}
        />
      )}
    </div>
  );
}

function CreateOKRModal({
  domainId,
  onClose,
  onCreate,
}: {
  domainId: string;
  onClose: () => void;
  onCreate: (data: Partial<OKRDirective>) => void;
}) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    cycle_name: "",
    cycle_start: "",
    cycle_end: "",
    status: "draft" as const,
    review_cadence: "monthly" as const,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      name: formData.name,
      description: formData.description,
      attributes: {
        ...formData,
        domain_id: domainId,
      },
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg">
        <h3 className="text-xl font-bold mb-4">Create OKR Cycle</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Cycle Name</label>
            <input
              type="text"
              value={formData.cycle_name}
              onChange={(e) => setFormData({ ...formData, cycle_name: e.target.value })}
              className="w-full border rounded px-3 py-2"
              placeholder="e.g., Q2 2026"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border rounded px-3 py-2"
              rows={3}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <input
                type="date"
                value={formData.cycle_start}
                onChange={(e) => setFormData({ ...formData, cycle_start: e.target.value })}
                className="w-full border rounded px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date</label>
              <input
                type="date"
                value={formData.cycle_end}
                onChange={(e) => setFormData({ ...formData, cycle_end: e.target.value })}
                className="w-full border rounded px-3 py-2"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full border rounded px-3 py-2"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="review">Review</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Review Cadence</label>
              <select
                value={formData.review_cadence}
                onChange={(e) => setFormData({ ...formData, review_cadence: e.target.value as any })}
                className="w-full border rounded px-3 py-2"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-50"
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
