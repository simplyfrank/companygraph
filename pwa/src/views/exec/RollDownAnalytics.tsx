import { useState, useEffect } from "react";
import { api } from "../../api";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";

interface RollDownSummary {
  total_roll_downs: number;
  pending: number;
  approved: number;
  rejected: number;
  by_level: {
    executive: number;
    domain: number;
    program: number;
  };
}

interface KPIPerformance {
  kpi_id: string;
  kpi_name: string;
  category: string;
  current_value: number;
  target_value: number;
  progress: number;
  status: string;
}

interface OKRProgress {
  directive_id: string;
  directive_name: string;
  cycle_name: string;
  total_key_results: number;
  achieved: number;
  in_progress: number;
  at_risk: number;
  missed: number;
  overall_progress: number;
}

export function RollDownAnalytics() {
  const [activeTab, setActiveTab] = useState<"overview" | "kpi" | "okr" | "roll-down" | "sla">("overview");
  const [summary, setSummary] = useState<RollDownSummary | null>(null);
  const [kpiPerformance, setKpiPerformance] = useState<KPIPerformance[]>([]);
  const [okrProgress, setOkrProgress] = useState<OKRProgress[]>([]);
  const [slaCompliance, setSlaCompliance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, kpiData, okrData, slaData] = await Promise.all([
        api.cypher(
          `MATCH (r:RollDown)
           WITH r.type as level, r.status as status, count(r) as count
           RETURN level, status, count`,
          {},
        ),
        api.cypher(
          `MATCH (k:KPI)-[:HAS_MEASUREMENT]->(m:KPIMeasurement)
           WITH k, m ORDER BY m.measured_at DESC
           WITH k, head(collect(m)) as latest
           MATCH (k)
           RETURN k.id as kpi_id, k.name as kpi_name, k.category, k.target_value,
                  latest.value as current_value,
                  CASE 
                    WHEN k.target_direction = 'higher_is_better' 
                    THEN (latest.value / k.target_value) * 100
                    ELSE (k.target_value / latest.value) * 100
                  END as progress
           LIMIT 20`,
          {},
        ),
        api.cypher(
          `MATCH (d:OKRDirective)-[:HAS_KEY_RESULT]->(kr:KeyResult)
           WITH d, count(kr) as total_kr,
                sum(CASE WHEN kr.attributes.status = 'achieved' THEN 1 ELSE 0 END) as achieved,
                sum(CASE WHEN kr.attributes.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
                sum(CASE WHEN kr.attributes.status = 'at_risk' THEN 1 ELSE 0 END) as at_risk,
                sum(CASE WHEN kr.attributes.status = 'missed' THEN 1 ELSE 0 END) as missed,
                avg(kr.attributes.progress) as overall_progress
           RETURN d.id as directive_id, d.name as directive_name, d.attributes.cycle_name,
                  total_kr, achieved, in_progress, at_risk, missed, overall_progress
           LIMIT 20`,
          {},
        ),
        fetch("/api/v1/sla-compliance/all").then((r) => r.json()).catch(() => ({ slas: [] })),
      ]);

      // Process summary data
      const summaryMap: RollDownSummary = {
        total_roll_downs: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        by_level: { executive: 0, domain: 0, program: 0 },
      };

      for (const row of summaryData.rows as any[]) {
        summaryMap.total_roll_downs += row.count;
        if (row.status === "pending") summaryMap.pending += row.count;
        if (row.status === "approved") summaryMap.approved += row.count;
        if (row.status === "rejected") summaryMap.rejected += row.count;
        if (row.level === "kpi") summaryMap.by_level.executive += row.count;
        if (row.level === "kpi_domain" || row.level === "okr_domain") summaryMap.by_level.domain += row.count;
        if (row.level === "kpi_program" || row.level === "okr_program") summaryMap.by_level.program += row.count;
      }

      setSummary(summaryMap);
      setKpiPerformance(kpiData.rows.map((r: any) => ({
        kpi_id: r.kpi_id,
        kpi_name: r.kpi_name,
        category: r.category,
        current_value: r.current_value,
        target_value: r.target_value,
        progress: Math.min(100, Math.max(0, r.progress)),
        status: r.progress >= 100 ? "on_track" : r.progress >= 70 ? "at_risk" : "off_track",
      })));
      setOkrProgress(okrData.rows.map((r: any) => ({
        directive_id: r.directive_id,
        directive_name: r.directive_name,
        cycle_name: r.cycle_name,
        total_key_results: r.total_kr,
        achieved: r.achieved,
        in_progress: r.in_progress,
        at_risk: r.at_risk,
        missed: r.missed,
        overall_progress: r.overall_progress || 0,
      })));
      setSlaCompliance(slaData.slas || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading what="analytics" />;
  if (error) return <ErrorState message={error} />;

  return (
    <>
      <ViewHeader
        title="Roll-Down Analytics"
        lede="Track KPI performance, OKR progress, and roll-down status across the organization"
      />

      <div className="flex gap-4 mb-6">
        <button
          className={`px-4 py-2 rounded ${activeTab === "overview" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </button>
        <button
          className={`px-4 py-2 rounded ${activeTab === "kpi" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("kpi")}
        >
          KPI Performance
        </button>
        <button
          className={`px-4 py-2 rounded ${activeTab === "okr" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("okr")}
        >
          OKR Progress
        </button>
        <button
          className={`px-4 py-2 rounded ${activeTab === "roll-down" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("roll-down")}
        >
          Roll-Down Status
        </button>
        <button
          className={`px-4 py-2 rounded ${activeTab === "sla" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("sla")}
        >
          SLA Compliance
        </button>
      </div>

      {activeTab === "overview" && summary && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card>
            <h3 className="text-lg font-semibold mb-4">Roll-Down Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Total Roll-Downs</span>
                <span className="font-medium">{summary.total_roll_downs}</span>
              </div>
              <div className="flex justify-between">
                <span>Pending</span>
                <span className="font-medium text-yellow-600">{summary.pending}</span>
              </div>
              <div className="flex justify-between">
                <span>Approved</span>
                <span className="font-medium text-green-600">{summary.approved}</span>
              </div>
              <div className="flex justify-between">
                <span>Rejected</span>
                <span className="font-medium text-red-600">{summary.rejected}</span>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold mb-4">By Organizational Level</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Executive</span>
                <span className="font-medium">{summary.by_level.executive}</span>
              </div>
              <div className="flex justify-between">
                <span>Domain</span>
                <span className="font-medium">{summary.by_level.domain}</span>
              </div>
              <div className="flex justify-between">
                <span>Program</span>
                <span className="font-medium">{summary.by_level.program}</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === "kpi" && (
        <Card>
          <h2 className="text-xl font-semibold mb-4">KPI Performance</h2>
          {kpiPerformance.length === 0 ? (
            <p className="text-gray-600">No KPI performance data available</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">KPI</th>
                  <th className="text-left py-2">Category</th>
                  <th className="text-left py-2">Current</th>
                  <th className="text-left py-2">Target</th>
                  <th className="text-left py-2">Progress</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {kpiPerformance.map((kpi) => (
                  <tr key={kpi.kpi_id} className="border-b">
                    <td className="py-2">{kpi.kpi_name}</td>
                    <td className="py-2">{kpi.category}</td>
                    <td className="py-2">{kpi.current_value}</td>
                    <td className="py-2">{kpi.target_value}</td>
                    <td className="py-2">{kpi.progress.toFixed(1)}%</td>
                    <td className="py-2">
                      <Pill tone={kpi.status === "on_track" ? "good" : "neutral"}>
                        {kpi.status}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {activeTab === "okr" && (
        <Card>
          <h2 className="text-xl font-semibold mb-4">OKR Progress</h2>
          {okrProgress.length === 0 ? (
            <p className="text-gray-600">No OKR progress data available</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Directive</th>
                  <th className="text-left py-2">Cycle</th>
                  <th className="text-left py-2">Total KRs</th>
                  <th className="text-left py-2">Achieved</th>
                  <th className="text-left py-2">In Progress</th>
                  <th className="text-left py-2">At Risk</th>
                  <th className="text-left py-2">Missed</th>
                  <th className="text-left py-2">Progress</th>
                </tr>
              </thead>
              <tbody>
                {okrProgress.map((okr) => (
                  <tr key={okr.directive_id} className="border-b">
                    <td className="py-2">{okr.directive_name}</td>
                    <td className="py-2">{okr.cycle_name}</td>
                    <td className="py-2">{okr.total_key_results}</td>
                    <td className="py-2 text-green-600">{okr.achieved}</td>
                    <td className="py-2 text-blue-600">{okr.in_progress}</td>
                    <td className="py-2 text-yellow-600">{okr.at_risk}</td>
                    <td className="py-2 text-red-600">{okr.missed}</td>
                    <td className="py-2">{okr.overall_progress.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {activeTab === "roll-down" && summary && (
        <Card>
          <h2 className="text-xl font-semibold mb-4">Roll-Down Status Distribution</h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1">
                <span>Pending</span>
                <span>{summary.pending} ({((summary.pending / summary.total_roll_downs) * 100).toFixed(1)}%)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div className="bg-yellow-500 h-4 rounded-full" style={{ width: `${(summary.pending / summary.total_roll_downs) * 100}%` }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span>Approved</span>
                <span>{summary.approved} ({((summary.approved / summary.total_roll_downs) * 100).toFixed(1)}%)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div className="bg-green-500 h-4 rounded-full" style={{ width: `${(summary.approved / summary.total_roll_downs) * 100}%` }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span>Rejected</span>
                <span>{summary.rejected} ({((summary.rejected / summary.total_roll_downs) * 100).toFixed(1)}%)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div className="bg-red-500 h-4 rounded-full" style={{ width: `${(summary.rejected / summary.total_roll_downs) * 100}%` }}></div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {activeTab === "sla" && (
        <Card>
          <h2 className="text-xl font-semibold mb-4">SLA Compliance Overview</h2>
          {slaCompliance.length === 0 ? (
            <p className="text-gray-600">No SLA compliance data available</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">SLA</th>
                  <th className="text-left py-2">Target</th>
                  <th className="text-left py-2">Compliance Rate</th>
                  <th className="text-left py-2">Risk Score</th>
                  <th className="text-left py-2">Breaches</th>
                  <th className="text-left py-2">Open</th>
                </tr>
              </thead>
              <tbody>
                {slaCompliance.map((sla: any) => (
                  <tr key={sla.id} className="border-b">
                    <td className="py-2">{sla.name}</td>
                    <td className="py-2">{sla.target_value} {sla.target_unit}</td>
                    <td className="py-2">
                      <Pill tone={sla.compliance_rate >= 95 ? "good" : "neutral"}>
                        {sla.compliance_rate}%
                      </Pill>
                    </td>
                    <td className="py-2">
                      <Pill tone={sla.risk_score < 20 ? "good" : "neutral"}>
                        {sla.risk_score}
                      </Pill>
                    </td>
                    <td className="py-2">{sla.breaches?.total || 0}</td>
                    <td className="py-2">{sla.breaches?.open || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </>
  );
}
