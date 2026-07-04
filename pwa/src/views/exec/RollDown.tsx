import { useState, useEffect } from "react";
import { api } from "../../api";
import { ViewHeader, Loading, ErrorState } from "../_shared";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";

interface KPIRollDown {
  id: string;
  kpi_id: string;
  kpi_name: string;
  createdAt: string;
  status: string;
  assignments: DomainAssignment[];
}

interface OKRRollDown {
  id: string;
  okr_directive_id: string;
  okr_name: string;
  createdAt: string;
  status: string;
  assignments: DomainAssignment[];
}

interface DomainAssignment {
  id: string;
  domain_id: string;
  domain_name: string;
  weight: number;
  target_value: number;
  status: string;
}

interface Contribution {
  domain_id: string;
  domain_name: string;
  kpi_id: string;
  kpi_name: string;
  target_value: number;
  actual_value: number;
  weight: number;
  contribution_score: number;
  status: string;
}

export function ExecRollDown() {
  const [activeTab, setActiveTab] = useState<"kpi" | "okr" | "monitoring">("kpi");
  const [kpiRollDowns, setKpiRollDowns] = useState<KPIRollDown[]>([]);
  const [okrRollDowns, setOkrRollDowns] = useState<OKRRollDown[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [kpiData, okrData, contribData] = await Promise.all([
        api.cypher(`MATCH (r:RollDown {type: 'kpi'}) RETURN r ORDER BY r.createdAt DESC`),
        api.cypher(`MATCH (r:RollDown {type: 'okr'}) RETURN r ORDER BY r.createdAt DESC`),
        fetch("/api/v1/roll-down/contributions").then((r) => r.json()).catch(() => ({ contributions: [] })),
      ]);
      setKpiRollDowns(kpiData.rows.map((r: any) => r.r));
      setOkrRollDowns(okrData.rows.map((r: any) => r.r));
      setContributions(contribData.contributions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load roll-down data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading what="roll-down management" />;
  if (error) return <ErrorState message={error} />;

  return (
    <>
      <ViewHeader
        title="Roll-Down Management"
        lede="Roll down organizational KPIs and OKRs to domains with targets and contribution weights"
      />

      <div className="flex gap-4 mb-6">
        <button
          className={`px-4 py-2 rounded ${activeTab === "kpi" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("kpi")}
        >
          KPI Roll-Down
        </button>
        <button
          className={`px-4 py-2 rounded ${activeTab === "okr" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("okr")}
        >
          OKR Roll-Down
        </button>
        <button
          className={`px-4 py-2 rounded ${activeTab === "monitoring" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          onClick={() => setActiveTab("monitoring")}
        >
          Monitoring
        </button>
      </div>

      {activeTab === "kpi" && (
        <Card>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">KPI Roll-Down Matrix</h2>
            <button className="px-4 py-2 bg-blue-600 text-white rounded">
              + Create KPI Roll-Down
            </button>
          </div>

          {kpiRollDowns.length === 0 ? (
            <p className="text-gray-600">No KPI roll-downs created yet</p>
          ) : (
            kpiRollDowns.map((rollDown) => (
              <div key={rollDown.id} className="mb-6 border-b pb-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-semibold">{rollDown.kpi_name}</h3>
                  <Pill tone={rollDown.status === "pending" ? "warn" : "good"}>
                    {rollDown.status}
                  </Pill>
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  Created: {new Date(rollDown.createdAt).toLocaleDateString()}
                </p>
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Domain</th>
                      <th className="text-left py-2">Weight (%)</th>
                      <th className="text-left py-2">Target</th>
                      <th className="text-left py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rollDown.assignments.map((assignment) => (
                      <tr key={assignment.id} className="border-b">
                        <td className="py-2">{assignment.domain_name}</td>
                        <td className="py-2">{assignment.weight}%</td>
                        <td className="py-2">{assignment.target_value}</td>
                        <td className="py-2">
                          <Pill
                            tone={
                              assignment.status === "committed"
                                ? "good"
                                : assignment.status === "rejected"
                                ? "warn"
                                : "neutral"
                            }
                          >
                            {assignment.status}
                          </Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </Card>
      )}

      {activeTab === "okr" && (
        <Card>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">OKR Roll-Down Matrix</h2>
            <button className="px-4 py-2 bg-blue-600 text-white rounded">
              + Create OKR Roll-Down
            </button>
          </div>

          {okrRollDowns.length === 0 ? (
            <p className="text-gray-600">No OKR roll-downs created yet</p>
          ) : (
            okrRollDowns.map((rollDown) => (
              <div key={rollDown.id} className="mb-6 border-b pb-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-semibold">{rollDown.okr_name}</h3>
                  <Pill tone={rollDown.status === "pending" ? "warn" : "good"}>
                    {rollDown.status}
                  </Pill>
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  Created: {new Date(rollDown.createdAt).toLocaleDateString()}
                </p>
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Domain</th>
                      <th className="text-left py-2">Status</th>
                      <th className="text-left py-2">Objectives</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rollDown.assignments.map((assignment) => (
                      <tr key={assignment.id} className="border-b">
                        <td className="py-2">{assignment.domain_name}</td>
                        <td className="py-2">
                          <Pill
                            tone={
                              assignment.status === "committed"
                                ? "good"
                                : assignment.status === "rejected"
                                ? "warn"
                                : "neutral"
                            }
                          >
                            {assignment.status}
                          </Pill>
                        </td>
                        <td className="py-2">View objectives</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </Card>
      )}

      {activeTab === "monitoring" && (
        <Card>
          <h2 className="text-xl font-semibold mb-4">Domain Contribution Monitoring</h2>
          {contributions.length === 0 ? (
            <p className="text-gray-600">No contribution data available. Create KPI roll-downs and record measurements to see domain contributions.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Domain</th>
                  <th className="text-left py-2">KPI</th>
                  <th className="text-left py-2">Target</th>
                  <th className="text-left py-2">Actual</th>
                  <th className="text-left py-2">Weight</th>
                  <th className="text-left py-2">Score</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {contributions.map((c, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-2 font-medium">{c.domain_name || c.domain_id}</td>
                    <td className="py-2">{c.kpi_name || c.kpi_id}</td>
                    <td className="py-2">{c.target_value ?? "-"}</td>
                    <td className="py-2">{c.actual_value ?? "-"}</td>
                    <td className="py-2">{c.weight != null ? `${(c.weight * 100).toFixed(0)}%` : "-"}</td>
                    <td className="py-2">{c.contribution_score != null ? c.contribution_score.toFixed(1) : "-"}</td>
                    <td className="py-2">
                      <Pill tone={c.status === "on_track" ? "good" : c.status === "at_risk" ? "warn" : "neutral"}>
                        {c.status ?? "unknown"}
                      </Pill>
                    </td>
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
