import { useState, useEffect } from "react";
import * as api from "../api";

interface OKRPerformance {
  directive: string;
  keyResult: string;
  keyResultAttrs: {
    baseline_value: number;
    target_value: number;
    current_value: number;
    unit: string;
    direction: "higher_is_better" | "lower_is_better";
    progress: number;
    status: "not_started" | "in_progress" | "achieved" | "at_risk" | "missed";
  };
  kpi: string;
  kpiAttrs: Record<string, unknown>;
}

interface OkrPerformanceBoardProps {
  domainId: string;
  domainName: string;
}

export function OkrPerformanceBoard({ domainId, domainName }: OkrPerformanceBoardProps) {
  const [performance, setPerformance] = useState<OKRPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPerformance();
  }, [domainId]);

  const loadPerformance = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.okr.getPerformance(domainId);
      setPerformance([data]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load performance data");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "achieved": return "bg-green-500";
      case "in_progress": return "bg-blue-500";
      case "at_risk": return "bg-yellow-500";
      case "missed": return "bg-red-500";
      case "not_started": return "bg-gray-400";
      default: return "bg-gray-400";
    }
  };

  const getStatusLabel = (status: string) => {
    return status.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const calculateProgress = (kr: OKRPerformance["keyResultAttrs"]) => {
    const { baseline_value, target_value, current_value, direction } = kr;
    if (direction === "higher_is_better") {
      return Math.min(100, Math.max(0, ((current_value - baseline_value) / (target_value - baseline_value)) * 100));
    } else {
      return Math.min(100, Math.max(0, ((baseline_value - current_value) / (baseline_value - target_value)) * 100));
    }
  };

  const groupByDirective = (performance || []).reduce((acc, item) => {
    if (!acc[item.directive]) {
      acc[item.directive] = [];
    }
    acc[item.directive]!.push(item);
    return acc;
  }, {} as Record<string, OKRPerformance[]>);

  const overallProgress = performance.length > 0
    ? performance.reduce((sum, p) => sum + calculateProgress(p.keyResultAttrs), 0) / performance.length
    : 0;

  const achievedCount = performance.filter(p => p.keyResultAttrs.status === "achieved").length;
  const atRiskCount = performance.filter(p => p.keyResultAttrs.status === "at_risk").length;
  const missedCount = performance.filter(p => p.keyResultAttrs.status === "missed").length;

  if (loading) return <div className="p-4">Loading performance data...</div>;
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">{domainName} Performance Board</h2>
        <p className="text-gray-600">Current OKR progress and direction</p>
      </div>

      {performance.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded">
          <p className="text-gray-500">No OKR performance data available</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border rounded-lg p-4 shadow-sm">
              <div className="text-sm text-gray-500 mb-1">Overall Progress</div>
              <div className="text-3xl font-bold text-blue-600">{overallProgress.toFixed(1)}%</div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>
            <div className="bg-white border rounded-lg p-4 shadow-sm">
              <div className="text-sm text-gray-500 mb-1">Achieved</div>
              <div className="text-3xl font-bold text-green-600">{achievedCount}</div>
              <div className="text-xs text-gray-500">of {performance.length} key results</div>
            </div>
            <div className="bg-white border rounded-lg p-4 shadow-sm">
              <div className="text-sm text-gray-500 mb-1">At Risk</div>
              <div className="text-3xl font-bold text-yellow-600">{atRiskCount}</div>
              <div className="text-xs text-gray-500">needs attention</div>
            </div>
            <div className="bg-white border rounded-lg p-4 shadow-sm">
              <div className="text-sm text-gray-500 mb-1">Missed</div>
              <div className="text-3xl font-bold text-red-600">{missedCount}</div>
              <div className="text-xs text-gray-500">not achieved</div>
            </div>
          </div>

          {/* Performance by OKR Cycle */}
          <div className="space-y-6">
            {Object.entries(groupByDirective).map(([directive, items]) => {
              const directiveProgress = items.reduce((sum, p) => sum + calculateProgress(p.keyResultAttrs), 0) / items.length;
              return (
                <div key={directive} className="bg-white border rounded-lg p-6 shadow-sm">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">{directive}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">{directiveProgress.toFixed(1)}%</span>
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${directiveProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {items.map((item, idx) => {
                      const progress = calculateProgress(item.keyResultAttrs);
                      return (
                        <div key={idx} className="border-l-4 pl-4" style={{ borderLeftColor: getStatusColor(item.keyResultAttrs.status).replace("bg-", "#") }}>
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <h4 className="font-medium">{item.keyResult}</h4>
                              <p className="text-sm text-gray-500">KPI: {item.kpi}</p>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs text-white ${getStatusColor(item.keyResultAttrs.status)}`}>
                              {getStatusLabel(item.keyResultAttrs.status)}
                            </span>
                          </div>

                          <div className="mt-3">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-gray-500">Baseline: {item.keyResultAttrs.baseline_value} {item.keyResultAttrs.unit}</span>
                              <span className="font-medium">{item.keyResultAttrs.current_value} {item.keyResultAttrs.unit}</span>
                              <span className="text-gray-500">Target: {item.keyResultAttrs.target_value} {item.keyResultAttrs.unit}</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-3">
                              <div
                                className={`h-3 rounded-full transition-all ${getStatusColor(item.keyResultAttrs.status)}`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <div className="text-right text-xs text-gray-500 mt-1">{progress.toFixed(1)}% complete</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
